// api/news-process.js — Stage 2/3 AI processing (HIDDEN, REVIEW-FIRST).
//
// Claims a small batch of status='ingested' news_items and, per item:
//   1) transient full-text fetch (read to summarize/fact-check, then discarded)
//   2) one grounded forced-tool AI call → relevance + extraction + MineEx summary
//      + numeric fact-check
//   3) deterministic company linking (ticker/name) → news_item_companies (company_id)
//   4) writes results; relevant → status='review', noise → status='rejected'
// Then clusters same-story items (entity + event + day, with title-similarity fallback).
//
// NOTHING becomes 'live'. Nothing is exposed to the app. No cron. Call manually:
//   curl -X POST ".../api/news-process?limit=25" -H "x-news-secret: $NEWS_PULL_SECRET"
import { serviceConfigured, serviceRest } from "./_service.js";
import { checkNewsAuth, isCronRequest } from "./_news.js";
import { fetchArticleText, analyzeItem, buildCompanyIndex, matchCompany, clusterItems, PROCESSING_VERSION, normTicker, normName } from "./_newsAI.js";
import { recordUsage, daySpendUSD, dailyLimitUSD, estimateBatch } from "./_aiUsage.js";

export const config = { maxDuration: 300 };
const MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const CONCURRENCY = 5;
const DEFAULT_BATCH = 3;      // small default test batch
const HARD_CAP = 30;          // absolute per-call ceiling
const BULK_THRESHOLD = 5;     // > this many items requires explicit confirm_bulk
const MAX_RETRIES = 3;        // a failing item is skipped once it hits this (no paid loop)
const paidEnabled = () => String(process.env.AI_PAID_ENABLED || "").toLowerCase() === "true";
const truthy = (v) => v === true || String(v) === "1" || String(v).toLowerCase() === "true";
// Auto-approval MASTER switch (default OFF). Even when on, an item auto-publishes ONLY
// if its source is flagged auto_approve AND is a wire/regulatory publisher (see processItem).
const autoApproveEnabled = () => String(process.env.NEWS_AUTO_APPROVE_ENABLED || "").toLowerCase() === "true";
const cronProcessLimit = () => Math.max(1, Math.min(HARD_CAP, parseInt(process.env.NEWS_CRON_PROCESS_LIMIT, 10) || 15));

// Auto-create a basic 'listing' company when a press release names a company (with a
// ticker) that isn't in the directory — env-gated + ticker-required + deduped, so it
// fills gaps without spawning junk/duplicate profiles. Uses the same listing pp-blob
// format as the ~900 seeded directory companies, so it renders as a basic profile.
const autoCreateEnabled = () => String(process.env.NEWS_AUTOCREATE_ENABLED || "").toLowerCase() === "true";
const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60);

async function createListingStub(a, idx) {
  const pc = a.primary_company || {};
  const name = String(pc.name || "").trim();
  const rawTicker = String(pc.ticker || "").trim();
  if (!name || !rawTicker) return null;                 // need a real name + ticker
  const tkey = normTicker(rawTicker);
  if (!tkey || idx.byTicker.has(tkey)) return null;      // exists (or unusable ticker)
  const nkey = normName(name);
  if (nkey && idx.byName.has(nkey)) return null;         // name-dup safety
  const slug = slugify(name);
  if (!slug) return null;
  const ex = String(pc.exchange || "").trim().toUpperCase();
  const commodity = a.commodity || (Array.isArray(a.commodities) && a.commodities[0]) || "";
  const jurisdiction = Array.isArray(a.jurisdictions) ? a.jurisdictions.slice(0, 2).join(", ") : "";
  const pp = {
    TIER: "listing",
    COMPANY: { name, ticker: (ex ? `${ex}: ` : "") + rawTicker, commodity, jurisdiction },
    EXCHANGES: [{ ex, sym: rawTicker }],
    LISTING_BRIEF: `${name} — ${commodity ? commodity + " " : ""}exploration${jurisdiction ? `, ${jurisdiction}` : ""}. Auto-listed from a press release.`,
    AUTO_CREATED: true,
  };
  const row = { name, slug, primary_ticker: rawTicker, status: "published", tier: "listing", managed_by_admin: true, profile: { pp } };
  const r = await serviceRest("companies?on_conflict=slug", { method: "POST", body: [row], prefer: "resolution=ignore-duplicates,return=representation" });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  const co = Array.isArray(rows) && rows[0];
  if (!co || !co.id) return null;                        // slug already existed → skip
  idx.byTicker.set(tkey, { id: co.id, slug: co.slug, name, primary_ticker: rawTicker });
  if (nkey) idx.byName.set(nkey, { id: co.id, slug: co.slug, name, primary_ticker: rawTicker });
  return { company_id: co.id, company_slug: co.slug, tier: "listing", confidence: 0.8, method: "auto-created" };
}

async function processItem(item, idx, reprocess, operation) {
  let a, usage, cost = 0, sourceTextLen = 0;
  try {
    const sourceText = await fetchArticleText(item.url);
    sourceTextLen = sourceText ? sourceText.length : 0;
    ({ analysis: a, usage } = await analyzeItem({ ...item, sourceName: item.source ? item.source.name : "" }, sourceText));
    // Record ACTUAL token usage the API returned BEFORE anything else can fail.
    cost = await recordUsage({ news_item_id: item.id, operation, model: MODEL, usage, processing_version: PROCESSING_VERSION });
  } catch (e) {
    // Bounded retry: count the failure + store the error, then rethrow. The next run
    // skips items at MAX_RETRIES, so a broken item can never be paid-retried in a loop.
    const msg = String((e && e.message) || e).slice(0, 300);
    await serviceRest(`news_items?id=eq.${item.id}`, { method: "PATCH", body: { retry_count: (item.retry_count || 0) + 1, last_error: msg }, prefer: "return=minimal" }).catch(() => {});
    throw e;
  }
  const relevant = !!a.is_relevant;
  const patch = {
    relevant,
    reject_reason: relevant ? null : (a.reject_reason || a.relevance_reason || "not relevant"),
    commodities: a.commodities || [],
    commodity: a.commodity || null,          // primary metal — rich app card
    jurisdictions: a.jurisdictions || [],
    event_type: a.event_type || null,
    category: a.category || null,            // app-card taxonomy (Drill Results / Financing / …)
    is_press_release: typeof a.is_press_release === "boolean" ? a.is_press_release : null, // Companies tab vs News tab
    stage: a.stage || null,
    materiality_score: Number.isFinite(a.materiality_score) ? a.materiality_score : null,
    materiality_label: a.materiality_label || null,
    facts: {
      ticker: (a.primary_company && a.primary_company.ticker) || null,
      company: (a.primary_company && a.primary_company.name) || null,
      project: a.project || null,
      material_numbers: a.material_numbers || [],
      key_dates: a.key_dates || [],
      financing_amount: a.financing_amount || null,
      grades_intercepts: a.grades_intercepts || [],
      resources: a.resources || [],
      other_companies: a.other_companies || [],
      core_event: a.core_event || null,
      canonical_entity: a.canonical_entity || null,
      source_text_available: sourceTextLen > 120,
    },
    fact_check: a.fact_check || {},
    provenance: a.provenance || [],
    mineex_summary: a.mineex_summary || null,
    plain_english_explanation: a.plain_english_explanation || "",   // "" (not null) so reprocess cursor advances
    context: a.context || "",
    key_numbers: a.key_numbers || [],
    processed_at: new Date().toISOString(),
    ai_model: MODEL,
    processing_version: PROCESSING_VERSION,  // mark COMPLETE at this version
    retry_count: 0,
    last_error: null,
  };
  // Smart auto-approval: a source the operator has EXPLICITLY flagged auto_approve, whose
  // AI processing succeeded cleanly (relevant, has a summary + provenance, no fact conflict),
  // publishes straight to the Today feed. Everything else lands in review. Gated by: the
  // master env switch + the per-source flag (the operator's per-source trust decision) +
  // the quality checks below. Flip a source's auto_approve off to send it back to review.
  const src = item.source || {};
  const autoApprove = !reprocess && relevant && autoApproveEnabled() && !!src.auto_approve
    && !!a.mineex_summary && Array.isArray(a.provenance) && a.provenance.length > 0
    && (!a.fact_check || a.fact_check.verdict !== "conflict");
  // Reprocess re-runs the AI on already-processed items to refresh the format WITHOUT
  // touching approval state, clustering, or company links (human decisions stand).
  if (!reprocess) {
    patch.status = autoApprove ? "live" : (relevant ? "review" : "rejected");
    patch.review_state = autoApprove ? "approved" : "pending";
  }
  await serviceRest(`news_items?id=eq.${item.id}`, { method: "PATCH", body: patch, prefer: "return=minimal" });

  let link = null;
  if (!reprocess && relevant) {
    let m = matchCompany(a, idx);
    // FIX 4: on macro/other pieces only accept a specific TICKER match — no name links.
    const macro = a.event_type === "Macro/Market" || a.event_type === "Other";
    // No directory match on a press release → auto-create a DISCOVERABLE basic listing.
    // It comes back tier:'listing', which the PAID gate below skips — so the stub exists
    // for search/discovery, but its release is NOT linked (that's a paid feature).
    if (!m && !macro && autoCreateEnabled() && a.is_press_release) {
      m = await createListingStub(a, idx);
    }
    // PAID GATE: linking a release to a company (feed attribution + a public timeline) is
    // a paid feature. Only basic/pro companies get news_item_companies rows; free/listing
    // profiles (incl. auto-created stubs) stay passive, release-free directory entries.
    const paid = m && (m.tier === "basic" || m.tier === "pro");
    if (m && paid && (!macro || m.method === "ticker")) {
      await serviceRest("news_item_companies?on_conflict=news_item_id,company_id", {
        method: "POST",
        body: [{ news_item_id: item.id, company_id: m.company_id, company_slug: m.company_slug, confidence: m.confidence, method: m.method }],
        prefer: "resolution=ignore-duplicates,return=minimal",
      });
      link = m;
    }
  }
  return { id: item.id, title: item.title, published_at: item.published_at, analysis: a, relevant, auto_approved: !!autoApprove, link, source: item.source ? item.source.key : null, cost, usage };
}

// Runs the batch in small concurrent chunks, enforcing the daily budget BETWEEN
// chunks: once cumulative spend reaches the ceiling, no further AI calls are made.
async function runPool(items, idx, reprocess, operation, budget) {
  const results = []; const errors = []; let stopped = false;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    if (budget && budget.spent >= budget.limit) { stopped = true; break; }
    const chunk = items.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map((it) => processItem(it, idx, reprocess, operation)));
    settled.forEach((s, k) => {
      if (s.status === "fulfilled") { results.push(s.value); if (budget) budget.spent += (s.value.cost || 0); }
      else errors.push({ id: chunk[k].id, title: chunk[k].title, error: String((s.reason && s.reason.message) || s.reason).slice(0, 200) });
    });
  }
  return { results, errors, stopped };
}

export default async function handler(req, res) {
  // GET allowed for a Vercel Cron backstop that drains the queue; POST for manual/chained.
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!checkNewsAuth(req)) return res.status(401).json({ error: "unauthorized" });
  if (!serviceConfigured()) return res.status(500).json({ error: "Supabase service env missing" });

  const q = { ...(req.query || {}), ...(req.body || {}) };
  const cron = isCronRequest(req);                     // a trusted scheduled caller
  const reprocess = truthy(q.reprocess);
  const confirmBulk = truthy(q.confirm_bulk) || cron;  // cron is implicitly bulk-confirmed
  const forceReprocess = truthy(q.force_reprocess);

  let limit = parseInt(q.limit, 10);
  if (!Number.isFinite(limit)) limit = cron ? cronProcessLimit() : DEFAULT_BATCH;
  limit = Math.max(1, Math.min(HARD_CAP, limit));

  const operation = reprocess ? "news-reprocess" : "news-process";

  // GATE 0 — reprocessing already-completed articles requires an explicit force flag.
  // (Bulk reprocess additionally needs confirm_bulk, enforced by GATE 2 below.)
  if (reprocess && !forceReprocess) {
    return res.status(409).json({
      ok: false, mode: "force_reprocess_required",
      reason: "Reprocessing already-completed articles requires force_reprocess=true. This guard stops accidental re-billing of items already at the current processing version.",
      processing_version: PROCESSING_VERSION,
      needed: limit > BULK_THRESHOLD ? ["force_reprocess=true", "confirm_bulk=1"] : ["force_reprocess=true"],
    });
  }

  // Select candidates — NO AI runs yet. Normal: never-processed items only, below the
  // retry cap. Reprocess (force): review/live items, oldest processing_version first.
  const sel = "id,title,description,canonical_url,url,categories,published_at,retry_count,processing_version,source_id,source:news_sources(key,name,publisher_type,auto_approve)";
  const filter = reprocess
    ? `status=in.(review,live)&order=processing_version.asc.nullsfirst,materiality_score.desc.nullslast&limit=${limit}`
    : `status=eq.ingested&retry_count=lt.${MAX_RETRIES}&order=published_at.desc&limit=${limit}`;
  const br = await serviceRest(`news_items?${filter}&select=${sel}`);
  if (!br.ok) return res.status(500).json({ error: `batch query HTTP ${br.status}` });
  const batch = await br.json().catch(() => []);
  if (!batch.length) {
    return res.status(200).json({
      ok: true, processed: 0, candidates: 0, processing_version: PROCESSING_VERSION,
      message: reprocess ? "no review/live items to reprocess" : `no un-processed items — all caught up at ${PROCESSING_VERSION}`,
    });
  }

  // GATE 1 — paid AI disabled (default): dry-run ONLY. No OpenAI request is made.
  if (!paidEnabled()) {
    return res.status(200).json({
      ok: true, mode: "dry_run",
      reason: "AI_PAID_ENABLED is not 'true' — no OpenAI request will be made.",
      operation, processing_version: PROCESSING_VERSION,
      candidates: batch.length,
      ...estimateBatch(batch.length, MODEL),
      how_to_run: "Set AI_PAID_ENABLED=true and AI_DAILY_USD_LIMIT. For >5 items also pass confirm_bulk=1; to redo completed items pass force_reprocess=true.",
    });
  }

  // GATE 2 — bulk confirmation for >5 items: return the projected MAX cost, don't run.
  if (limit > BULK_THRESHOLD && !confirmBulk) {
    return res.status(409).json({
      ok: false, mode: "bulk_confirmation_required",
      reason: `Requested ${limit} items (> ${BULK_THRESHOLD}). Re-send the same request with confirm_bulk=1 to execute.`,
      operation, processing_version: PROCESSING_VERSION,
      candidates: batch.length,
      projection: estimateBatch(batch.length, MODEL),
    });
  }

  // GATE 3 — daily spend ceiling, fail-closed.
  const dayLimit = dailyLimitUSD();
  if (dayLimit == null) {
    return res.status(409).json({ ok: false, mode: "no_daily_limit_set", error: "AI_DAILY_USD_LIMIT is not set — refusing to spend uncapped. Set a daily ceiling first." });
  }
  const day = await daySpendUSD();
  if (!day.ok) return res.status(500).json({ ok: false, error: "usage ledger unreadable — failing closed (no AI calls made)." });
  if (day.spent >= dayLimit) {
    return res.status(429).json({
      ok: false, mode: "daily_limit_reached",
      error: `Daily AI spend limit reached: $${day.spent.toFixed(4)} of $${dayLimit.toFixed(2)}. No further processing today.`,
      spent_today_usd: day.spent, daily_limit_usd: dayLimit,
    });
  }

  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY missing" });

  // Load the company directory once for deterministic linking (no AI).
  const cr = await serviceRest("companies?status=eq.published&select=id,name,slug,primary_ticker,tier&limit=3000");
  if (!cr.ok) return res.status(500).json({ error: `companies query HTTP ${cr.status}` });
  const idx = buildCompanyIndex(await cr.json().catch(() => []));

  const budget = { limit: dayLimit, spent: day.spent };
  const { results, errors, stopped } = await runPool(batch, idx, reprocess, operation, budget);
  const spentThisRun = +(budget.spent - day.spent).toFixed(6);
  const costFields = {
    spent_this_run_usd: spentThisRun,
    spent_today_usd: +budget.spent.toFixed(6),
    daily_limit_usd: dayLimit,
    stopped_due_to_daily_limit: !!stopped,
  };

  // Reprocess re-generates section text ONLY. It must never re-cluster, re-link, or flip
  // approval state — so skip the clustering pass entirely and return a minimal report.
  if (reprocess) {
    const failed = results.filter((r) => !r.analysis || !r.analysis.mineex_summary).length;
    return res.status(200).json({
      ok: true, mode: "reprocess", model: MODEL, processing_version: PROCESSING_VERSION,
      batch: batch.length, processed: results.length,
      regenerated: results.length - failed, generation_failures: failed, ...costFields, errors,
    });
  }

  // FIX 3: ROLLING clustering — cluster the new relevant items against recently
  // processed items (last 5 days), preserving existing cluster keys so a duplicate
  // that arrives in a later batch still joins the same story.
  const newRelevant = results.filter((r) => r.relevant);
  const newIds = new Set(newRelevant.map((r) => r.id));
  const pool = newRelevant.map((r) => ({
    id: r.id, title: r.title, published_at: r.published_at,
    analysis: { canonical_entity: r.analysis.canonical_entity, event_type: r.analysis.event_type, material_numbers: r.analysis.material_numbers || [] },
    preKey: null, preCanonical: false,
  }));
  const since = new Date(Date.now() - 5 * 86400e3).toISOString();
  const exRes = await serviceRest(`news_items?status=in.(review,live)&published_at=gte.${encodeURIComponent(since)}&select=id,title,published_at,event_type,facts,cluster_key,is_canonical&limit=300`);
  const existing = exRes.ok ? await exRes.json().catch(() => []) : [];
  const curState = new Map();
  for (const x of existing) {
    if (newIds.has(x.id)) continue;
    curState.set(x.id, { cluster_key: x.cluster_key || null, is_canonical: !!x.is_canonical });
    pool.push({
      id: x.id, title: x.title, published_at: x.published_at,
      analysis: { canonical_entity: (x.facts && (x.facts.canonical_entity || x.facts.company)) || x.title, event_type: x.event_type, material_numbers: (x.facts && x.facts.material_numbers) || [] },
      preKey: x.cluster_key || null, preCanonical: !!x.is_canonical,
    });
  }
  const clusters = clusterItems(pool);
  let clustered = 0;
  for (const [id, c] of clusters) {
    const cur = curState.get(id);
    if (!newIds.has(id) && cur && cur.cluster_key === c.cluster_key && cur.is_canonical === c.is_canonical) continue; // unchanged existing → skip write
    await serviceRest(`news_items?id=eq.${id}`, { method: "PATCH", body: { cluster_key: c.cluster_key, is_canonical: c.is_canonical }, prefer: "return=minimal" });
    if (c.cluster_size > 1) clustered++;
  }

  const relevantCount = results.filter((r) => r.relevant).length;
  const clusterGroups = new Set([...clusters.values()].filter((c) => c.cluster_size > 1).map((c) => c.cluster_key)).size;
  return res.status(200).json({
    ok: true,
    model: MODEL,
    batch: batch.length,
    processed: results.length,
    relevant: relevantCount,
    rejected: results.length - relevantCount,
    auto_approved: results.filter((r) => r.auto_approved).length,
    linked: results.filter((r) => r.link).length,
    duplicate_clusters: clusterGroups,
    items_in_a_cluster: clustered,
    ...costFields,
    errors,
  });
}
