// api/_news.js — helpers for the automated news pipeline (Stage 1 ingestion).
//
// Dependency-free RSS parsing, URL canonicalization, hashing, dedup helpers, and
// per-request secret auth. This module turns feeds into normalized, de-duplicated
// METADATA rows only. It never keeps the article body: content:encoded is read
// solely to detect a lead-image URL, then discarded. No AI, no display.
import crypto from "node:crypto";

export function sha256(s) { return crypto.createHash("sha256").update(String(s || ""), "utf8").digest("hex"); }

// Constant-time compare for equal-length secrets.
function secretEq(got, want) {
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

// Secret auth for manual/chained calls (x-news-secret header vs NEWS_PULL_SECRET).
export function checkNewsSecret(req) {
  const h = req.headers || {};
  return secretEq(String(h["x-news-secret"] || h["X-News-Secret"] || ""), process.env.NEWS_PULL_SECRET);
}

// Vercel Cron auth: Vercel attaches `Authorization: Bearer <CRON_SECRET>` to scheduled
// requests when CRON_SECRET is set in the project env. Lets a GET cron authenticate.
export function checkCronSecret(req) {
  const h = req.headers || {};
  const auth = String(h.authorization || h.Authorization || "");
  const got = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return secretEq(got, process.env.CRON_SECRET);
}
export function isCronRequest(req) { return checkCronSecret(req); }

// Either credential is accepted on the automated endpoints.
export function checkNewsAuth(req) { return checkNewsSecret(req) || checkCronSecret(req); }

// A realistic browser UA — the two enabled sources (Mining.com, Northern Miner)
// serve 200 to this; WAF-blocked sources are marked fetch_via='proxy' and skipped.
export const NEWS_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36";

// Tracking params stripped before dedup so the same article via different links
// collapses to one canonical URL.
const TRACKING = [/^utm_/i, /^utm$/i, /^gclid$/i, /^dclid$/i, /^fbclid$/i, /^msclkid$/i, /^mc_cid$/i, /^mc_eid$/i, /^ref$/i, /^ref_src$/i, /^referrer$/i, /^_hsenc$/i, /^_hsmi$/i, /^igshid$/i, /^spm$/i, /^cmpid$/i, /^campaign$/i, /^src$/i, /^source$/i];
export function normalizeUrl(raw, canonicalHint) {
  const input = String(canonicalHint || raw || "").trim();
  try {
    const url = new URL(input);
    url.hash = "";
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const keep = [];
    for (const [k, v] of url.searchParams.entries()) if (!TRACKING.some((re) => re.test(k))) keep.push([k, v]);
    url.search = "";
    keep.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    for (const [k, v] of keep) url.searchParams.append(k, v);
    return url.toString().replace(/\/$/, "");
  } catch {
    return input.split("#")[0].replace(/\/$/, "");
  }
}

// Normalized title → a stable key/hash. Catches the same story from a slightly
// different URL. Used as the SECONDARY (windowed) dedup signal.
export function titleKey(t) {
  return String(t || "").toLowerCase().replace(/&[a-z]+;/g, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
// Token-overlap similarity (0..1) — exported for a future fuzzy pass; Stage 1
// dedup uses exact hashes for speed/precision.
export function titleSimilar(a, b) {
  const A = new Set(titleKey(a).split(" ").filter(Boolean));
  const B = new Set(titleKey(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / Math.max(A.size, B.size);
}

// Full HTML-entity decode: numeric (&#8217; / &#x2019;) AND named. RSS titles are
// riddled with these (&#8217;=’, &#038;=&, &#8211;=–, &nbsp;) and un-decoded they
// look broken in the feed. Decode &amp; LAST so we don't double-unescape.
const NAMED = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'",
  lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„",
  mdash: "—", ndash: "–", hellip: "…", middot: "·", bull: "•",
  trade: "™", reg: "®", copy: "©", deg: "°", frac12: "½",
  eacute: "é", egrave: "è", agrave: "à", uuml: "ü", ouml: "ö", auml: "ä", ntilde: "ñ", ccedil: "ç" };
const cp = (n) => { try { return (n >= 0 && n <= 0x10ffff) ? String.fromCodePoint(n) : ""; } catch { return ""; } };
const unesc = (s) => String(s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => cp(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => cp(parseInt(d, 10)))
  .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name) => (Object.prototype.hasOwnProperty.call(NAMED, name.toLowerCase()) ? NAMED[name.toLowerCase()] : m))
  .replace(/&amp;/g, "&")
  .trim();
const tag = (xml, name) => {
  const m = new RegExp(`<${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s[^>]*)?>([\\s\\S]*?)</${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>`, "i").exec(xml);
  return m ? unesc(m[1]) : "";
};
const attrOf = (xml, name, attr) => {
  const m = new RegExp(`<${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*\\b${attr}=["']([^"']+)["']`, "i").exec(xml);
  return m ? m[1] : "";
};

// A SOURCE image URL reference (never downloaded): media:content / media:thumbnail
// / enclosure first, else the first content <img>. Storing the reference is not
// caching or redistribution — display stays gated by source.allow_source_image.
function extractImage(itemXml) {
  for (const t of ["media:content", "media:thumbnail", "enclosure"]) {
    const u = attrOf(itemXml, t, "url");
    if (u && /^https?:/i.test(u) && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(u)) return u;
    if (u && /^https?:/i.test(u) && /image/i.test(attrOf(itemXml, t, "type"))) return u;
  }
  const body = tag(itemXml, "content:encoded") || tag(itemXml, "description");
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(body);
  if (m && /^https?:/i.test(m[1]) && !/favicon|logo|1x1|32x32|blank/i.test(m[1])) return m[1];
  return "";
}

export function parseDate(s) {
  const d = new Date(String(s || ""));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Parse an RSS 2.0 / Atom-ish feed into normalized items. Body is never kept.
export function parseFeed(xml) {
  const items = [];
  const parts = String(xml || "").split(/<item(?:\s[^>]*)?>/i).slice(1);
  for (const raw of parts) {
    const itemXml = raw.split(/<\/item>/i)[0];
    const title = tag(itemXml, "title");
    const link = unesc(tag(itemXml, "link")) || attrOf(itemXml, "link", "href");
    if (!title || !link) continue;
    const categories = [];
    const re = /<category[^>]*>([\s\S]*?)<\/category>/gi; let cm;
    while ((cm = re.exec(itemXml)) && categories.length < 8) { const c = unesc(cm[1]); if (c) categories.push(c); }
    items.push({
      title,
      link,
      guid: tag(itemXml, "guid"),
      pubDate: tag(itemXml, "pubDate") || tag(itemXml, "dc:date") || tag(itemXml, "published") || tag(itemXml, "updated"),
      // publisher excerpt only, HTML stripped + capped — summarization input, never surfaced verbatim
      description: tag(itemXml, "description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800),
      author: tag(itemXml, "dc:creator") || tag(itemXml, "author"),
      categories,
      imageUrl: extractImage(itemXml),
    });
  }
  return items;
}

// Build a news_items row from a parsed feed item. No article body is ever included.
export function toRow(source, it) {
  const canonical_url = normalizeUrl(it.link);
  return {
    source_id: source.id,
    url: it.link,
    canonical_url,
    url_hash: sha256(canonical_url),
    content_hash: sha256(titleKey(it.title)),
    guid: it.guid || null,
    title: String(it.title).slice(0, 500),
    description: it.description || null,        // excerpt only
    image_url: it.imageUrl || null,            // reference only; display gated by source.allow_source_image
    author: it.author || null,
    categories: it.categories || [],
    published_at: parseDate(it.pubDate),
    status: "ingested",
    review_state: "pending",
  };
}
