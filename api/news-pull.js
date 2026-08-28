// api/news-pull.js — Stage 1 ingestion (REVIEW-FIRST).
//
// Fetches ENABLED, DIRECT, RSS sources; parses feeds; de-duplicates (canonical
// url_hash first, then windowed normalized-title hash); inserts news_items as
// status='ingested' / review_state='pending'. It stores METADATA ONLY (never the
// article body), records a per-source polling cursor, and returns a summary.
//
// It does NOT: run AI, classify, summarize, publish, or display anything. Nothing
// becomes public (that needs status='live' AND review_state='approved', which this
// endpoint never sets). No cron is wired — call it manually to test:
//
//   curl -X POST https://<host>/api/news-pull -H "x-news-secret: $NEWS_PULL_SECRET"
//
import { serviceConfigured, serviceRest } from "./_service.js";
import { checkNewsAuth, parseFeed, toRow, NEWS_UA } from "./_news.js";

export const config = { maxDuration: 300 };

const PER_SOURCE_LIMIT = 40;      // most recent N items per feed per run
const CONTENT_WINDOW_DAYS = 4;    // near-dup (same title) window, so generic titles don't over-dedup across time

// Resolve the URL to fetch + the User-Agent. A source may override the UA (some wire
// endpoints gate on it); a fetch_via='proxy' source (WAF-blocked wires) is routed
// through NEWS_PROXY_URL. If a proxy source has no proxy configured it is SKIPPED
// (status 0, clear reason) rather than counted as a hard error.
function resolveTarget(source) {
  const ua = source.user_agent || NEWS_UA;
  if (source.fetch_via === "proxy") {
    const proxy = process.env.NEWS_PROXY_URL;
    if (!proxy) return { ua, skip: "proxy_not_configured" };
    const url = proxy.includes("{url}")
      ? proxy.replace("{url}", encodeURIComponent(source.feed_url))
      : proxy + encodeURIComponent(source.feed_url);
    return { ua, url };
  }
  return { ua, url: source.feed_url };
}

// Fetch a feed with a conditional request (etag / last-modified) and a timeout.
async function fetchFeed(source) {
  const target = resolveTarget(source);
  if (target.skip) return { status: 0, items: [], error: target.skip };
  const headers = { "User-Agent": target.ua, Accept: "application/rss+xml, application/xml, text/xml, */*" };
  if (source.etag) headers["If-None-Match"] = source.etag;
  if (source.last_modified) headers["If-Modified-Since"] = source.last_modified;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(target.url, { headers, redirect: "follow", signal: ctrl.signal });
    const etag = res.headers.get("etag");
    const lastmod = res.headers.get("last-modified");
    if (res.status === 304) return { status: 304, items: [], etag, lastmod };
    if (!res.ok) return { status: res.status, items: [], etag, lastmod, error: `HTTP ${res.status}` };
    const xml = await res.text();
    return { status: 200, items: parseFeed(xml).slice(0, PER_SOURCE_LIMIT), etag, lastmod };
  } catch (e) {
    return { status: 0, items: [], error: String((e && e.message) || e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

// Which of these hashes already exist? `sinceIso` bounds the lookup for the
// windowed content-hash pass (hex hashes are injection-safe unquoted).
async function existingHashes(field, hashes, sinceIso) {
  if (!hashes.length) return new Set();
  let path = `news_items?${field}=in.(${hashes.join(",")})&select=${field}`;
  if (sinceIso) path += `&ingested_at=gte.${encodeURIComponent(sinceIso)}`;
  const r = await serviceRest(path);
  if (!r.ok) return new Set();
  const rows = await r.json().catch(() => []);
  return new Set((Array.isArray(rows) ? rows : []).map((x) => x[field]));
}

async function ingestSource(source) {
  const feed = await fetchFeed(source);
  const patch = {
    last_fetched_at: new Date().toISOString(),
    last_status: String(feed.status),
    last_error: feed.error || null,
  };
  if (feed.etag) patch.etag = feed.etag;
  if (feed.lastmod) patch.last_modified = feed.lastmod;

  let inserted = 0, deduped = 0;
  if (feed.status === 200 && feed.items.length) {
    const rows = feed.items.map((it) => toRow(source, it));
    const urlHashes = [...new Set(rows.map((r) => r.url_hash))];
    const contentHashes = [...new Set(rows.map((r) => r.content_hash))];
    const sinceIso = new Date(Date.now() - CONTENT_WINDOW_DAYS * 86400e3).toISOString();

    const seenUrl = await existingHashes("url_hash", urlHashes, null);              // primary: canonical URL, all-time
    const seenContent = await existingHashes("content_hash", contentHashes, sinceIso); // secondary: same title, recent window

    const fresh = [];
    const localUrl = new Set();
    const localContent = new Set();
    for (const r of rows) {
      if (seenUrl.has(r.url_hash) || localUrl.has(r.url_hash) || seenContent.has(r.content_hash) || localContent.has(r.content_hash)) {
        deduped++; continue;
      }
      localUrl.add(r.url_hash); localContent.add(r.content_hash);
      fresh.push(r);
    }
    if (fresh.length) {
      const ins = await serviceRest("news_items?on_conflict=source_id,url_hash", {
        method: "POST", body: fresh, prefer: "resolution=ignore-duplicates,return=minimal",
      });
      if (ins.ok) inserted = fresh.length;
      else patch.last_error = `insert HTTP ${ins.status}`;
    }
  }

  await serviceRest(`news_sources?id=eq.${source.id}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
  return { source: source.key, status: feed.status, found: feed.items.length, inserted, deduped, error: feed.error || null };
}

export default async function handler(req, res) {
  // GET is allowed so a Vercel Cron (which issues GET with a Bearer CRON_SECRET) can
  // trigger the daily run; manual/chained calls use POST + x-news-secret.
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!checkNewsAuth(req)) return res.status(401).json({ error: "unauthorized" });
  if (!serviceConfigured()) return res.status(500).json({ error: "Server not configured: Supabase service env missing." });

  const q = { ...(req.query || {}), ...(req.body || {}) };
  const truthy = (v) => v === true || String(v) === "1" || String(v).toLowerCase() === "true";

  // ENABLED, RSS sources with a feed URL. DIRECT sources fetch straight; PROXY sources
  // (WAF-blocked wires) are fetched via NEWS_PROXY_URL, or skipped if that isn't set.
  const r = await serviceRest("news_sources?enabled=eq.true&adapter=eq.rss&feed_url=not.is.null&select=*");
  if (!r.ok) return res.status(500).json({ error: `sources query HTTP ${r.status}` });
  const sources = await r.json().catch(() => []);

  const results = [];
  for (const s of Array.isArray(sources) ? sources : []) {
    try { results.push(await ingestSource(s)); }
    catch (e) { results.push({ source: s.key, error: String((e && e.message) || e).slice(0, 200) }); }
  }
  const inserted = results.reduce((n, x) => n + (x.inserted || 0), 0);

  // CHAIN → immediately run Stage 2 (AI summarize) on the freshly ingested items so a
  // scheduled pull yields finished cards with zero delay. Bounded (NEWS_CHAIN_LIMIT) and
  // guarded: it POSTs to /api/news-process with the shared secret; a chain failure is
  // reported but never fails the pull. Set chain=0 to ingest only. The AI gates in
  // news-process still apply (nothing runs unless AI_PAID_ENABLED=true, etc.).
  let chained = null;
  const doChain = String(q.chain ?? "1") !== "0";
  if (!doChain) chained = { skipped: "chain disabled (chain=0)" };
  else if (!process.env.NEWS_PULL_SECRET) chained = { skipped: "NEWS_PULL_SECRET not set" };
  else if (inserted === 0 && !truthy(q.force_chain)) chained = { skipped: "no new items ingested" };
  else {
    try {
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const base = process.env.PUBLIC_BASE_URL || `${proto}://${host}`;
      const lim = Math.max(1, Math.min(30, parseInt(process.env.NEWS_CHAIN_LIMIT, 10) || 15));
      const pr = await fetch(`${base}/api/news-process`, {
        method: "POST",
        headers: { "x-news-secret": process.env.NEWS_PULL_SECRET, "content-type": "application/json" },
        body: JSON.stringify({ limit: lim, confirm_bulk: 1 }),
      });
      chained = { status: pr.status, result: await pr.json().catch(() => null) };
    } catch (e) {
      chained = { error: String((e && e.message) || e).slice(0, 200) };
    }
  }

  return res.status(200).json({ ok: true, sources: results.length, inserted, results, chained });
}
