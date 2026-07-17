// Batch engine for the AI onboarding extractor.
//
// `api/structure-release.js` analyzes ONE press release (server-side, key hidden)
// and returns { card, classification, milestoneRecommendation, proposedChanges }.
// This module fans that call out over a whole corpus of releases, assembles the
// results into a year -> quarter timeline (newest first, full text preserved for
// "read full release"), and rolls the per-release `proposedChanges` up into a
// deduped set of suggestions for the other profile tabs (status, capital, projects).
//
// Nothing here runs until ANTHROPIC_API_KEY is set in Vercel — /api/structure-release
// returns 500 until then. The shapes are stable so the intake UI + mapper can be
// wired against them now and verified the moment the key lands.

const API = "/api/structure-release";

// Errors worth retrying: provider overload (529), rate limit (429), gateway/
// timeout (502/503/504), and network failures (fetch throws, no status). A 4xx
// like 400/401/403 is a real rejection — retrying it just wastes calls.
const RETRYABLE = new Set([429, 502, 503, 504, 529]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Analyze a single release. `input` is either a text string, or { text, pdf }
// where pdf is base64 PDF bytes (no data: prefix) that Claude reads natively.
// Returns the `analysis` object or throws.
//
// Retries transient failures with exponential backoff + jitter. Over a large
// corpus (100+ calls) Anthropic overload (529) is near-certain on some calls; a
// single retry pass turns "silently dropped release" into "arrived a few seconds
// late". `attempts` total tries (default 4 → up to ~1+2+4s of backoff).
export async function structureRelease(input, context = {}, { attempts = 4 } = {}) {
  const payload = typeof input === "string"
    ? { text: input }
    : { text: input.text || "", pdf: input.pdf || "" };
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    // `retryable` is decided from the HTTP status (or a thrown network error),
    // never from the error text — the message is the server's wording and can't
    // be trusted to encode retryability.
    let retryable = false;
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "extract", ...payload, context }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.analysis;
      }
      const data = await res.json().catch(() => ({}));
      lastErr = new Error(data.error || `Structuring failed (${res.status})`);
      retryable = RETRYABLE.has(res.status);
    } catch (e) {
      // fetch threw (network/DNS/abort) — no status, always transient.
      lastErr = e;
      retryable = true;
    }
    if (!retryable || i === attempts - 1) throw lastErr;
    // backoff: 0.8s, 1.6s, 3.2s … plus up to 400ms jitter so 4 workers don't
    // retry in lockstep and re-collide on the same overloaded moment.
    await sleep(800 * 2 ** i + Math.floor(Math.random() * 400));
  }
  throw lastErr || new Error("Structuring failed");
}

// Fan out over many releases with a small concurrency cap (default 4 — respects
// the API without a batch endpoint). `items`: [{ id, name, text }].
// `onProgress(done, total, item)` fires after each completes.
// Returns [{ item, analysis }] on success or [{ item, error }] per failed item —
// one bad release never sinks the batch.
export async function structureReleases(items, { context = {}, concurrency = 4, onProgress } = {}) {
  const list = Array.isArray(items) ? items.filter((it) => it && (String(it.text || "").trim() || it.pdf)) : [];
  const results = new Array(list.length);
  let done = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const i = cursor++;
      const item = list[i];
      try {
        results[i] = { item, analysis: await structureRelease({ text: item.text, pdf: item.pdf }, context) };
      } catch (e) {
        results[i] = { item, error: (e && e.message) || "failed" };
      }
      done++;
      if (onProgress) { try { onProgress(done, list.length, item); } catch (_) {} }
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, list.length)) }, worker);
  await Promise.all(workers);
  return results.filter(Boolean);
}

// YYYY-MM-DD -> { year, quarter } (Q1..Q4). Null-safe.
export function dateParts(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  if (!m) return { year: null, quarter: null, month: null };
  const month = Number(m[2]);
  return { year: Number(m[1]), month, quarter: "Q" + (Math.floor((month - 1) / 3) + 1) };
}

// Flatten the batch into a clean, newest-first list of timeline entries. Each entry
// keeps its verbatim source text (`fullText`) so the app's "read full release" works,
// plus the impact/milestone judgment and the release's own proposedChanges.
export function assembleTimeline(results) {
  return (results || [])
    .filter((r) => r && r.analysis && r.analysis.card)
    .map((r) => {
      const c = r.analysis.card;
      const cls = r.analysis.classification || {};
      const dp = dateParts(c.sourceDate);
      return {
        id: r.item.id,
        date: String(c.sourceDate || ""),
        year: dp.year,
        quarter: dp.quarter,
        headline: String(c.headline || ""),
        category: String(c.category || ""),
        whatHappened: String(c.whatHappened || ""),
        whyItMatters: String(c.whyItMatters || ""),
        whatHappensNext: String(c.whatHappensNext || ""),
        keyNumbers: Array.isArray(c.keyNumbers) ? c.keyNumbers : [],
        stageFrom: String(c.stageFrom || ""),
        stageTo: String(c.stageTo || ""),
        takeaway: String(c.investorTakeaway || ""),
        projects: Array.isArray(c.projectsMentioned) ? c.projectsMentioned : [],
        sourceUrl: String(c.sourceUrl || ""),
        impact: String(cls.suggestedImpact || ""),
        key: !!cls.suggestedKey,
        confidence: String(cls.confidence || ""),
        fullText: String(r.item.text || ""),
        proposedChanges: Array.isArray(r.analysis.proposedChanges) ? r.analysis.proposedChanges : [],
      };
    })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

// Group a flat timeline into [{ year, quarters: [{ quarter, items:[…] }] }] for the
// year -> quarter rendering, newest first.
export function groupByYearQuarter(entries) {
  const years = new Map();
  (entries || []).forEach((e) => {
    if (e.year == null) return;
    if (!years.has(e.year)) years.set(e.year, new Map());
    const q = years.get(e.year);
    if (!q.has(e.quarter)) q.set(e.quarter, []);
    q.get(e.quarter).push(e);
  });
  const qOrder = { Q4: 0, Q3: 1, Q2: 2, Q1: 3 };
  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, qmap]) => ({
      year,
      quarters: [...qmap.entries()]
        .sort((a, b) => (qOrder[a[0]] ?? 9) - (qOrder[b[0]] ?? 9))
        .map(([quarter, items]) => ({ quarter, items })),
    }));
}

// Roll every release's `proposedChanges` into a deduped set of suggestions for the
// OTHER tabs — newest release wins per target field. This is the "press releases
// inform the whole profile" behavior, for free (no extra AI call). The company
// still approves each before it applies.
export function synthesizeSuggestions(results) {
  const byKey = new Map();
  (results || [])
    .filter((r) => r && r.analysis)
    .slice()
    .sort((a, b) => String(a.analysis.card?.sourceDate || "").localeCompare(String(b.analysis.card?.sourceDate || "")))
    .forEach((r) => {
      (r.analysis.proposedChanges || []).forEach((ch) => {
        if (!ch || !ch.targetSection || !ch.targetField) return;
        const key = `${ch.targetSection}::${ch.targetRef || ""}::${ch.targetField}`;
        byKey.set(key, { ...ch, sourceDate: r.analysis.card?.sourceDate || "", sourceId: r.item.id });
      });
    });
  return [...byKey.values()];
}

// The timeline editor's category dropdown accepts this fixed set; the analyzer's
// richer CATEGORIES map down to it so an extracted entry is editable as-is.
const TL_CATS = ["Discovery", "Drilling", "Financing", "Permitting", "Infrastructure", "Acquisition", "Resource Growth", "Exploration", "Corporate"];
const CAT_MAP = {
  Resource: "Resource Growth", "Economic Study": "Corporate", Development: "Infrastructure",
  Construction: "Infrastructure", Production: "Corporate", Leadership: "Corporate",
  Partnership: "Corporate", Property: "Acquisition", Other: "Corporate",
};
const tlCategory = (c) => (TL_CATS.includes(c) ? c : (CAT_MAP[c] || "Exploration"));

// Map assembled entries -> the profile.timeline shape the builder + app read
// ({ id, title, date, category, summary, url, key }), with the rich extracted
// fields kept under `ai` for the app's expanded view + "read full release".
export function toTimelineEntries(assembled) {
  return (assembled || []).map((e) => ({
    id: e.id,
    title: e.headline,
    date: e.date,
    category: tlCategory(e.category),
    summary: e.whyItMatters || e.whatHappened,
    url: e.sourceUrl,
    key: e.key,
    ai: {
      whatHappened: e.whatHappened,
      whatHappensNext: e.whatHappensNext,
      keyNumbers: e.keyNumbers,
      takeaway: e.takeaway,
      impact: e.impact,
      confidence: e.confidence,
      stageFrom: e.stageFrom,
      stageTo: e.stageTo,
      projects: e.projects,
      fullText: e.fullText,
    },
  }));
}

// Layer 2 — synthesize the Company Status card + Brief from the assembled timeline.
// Returns { companyStatus, companyBrief, warnings } or null on failure.
export async function synthesizeProfile({ company = {}, timeline = [], projects = [] } = {}) {
  if (!Array.isArray(timeline) || !timeline.length) return null;
  try {
    const res = await fetch("/api/synthesize-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ company, timeline, projects }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data.overview || null;
  } catch (_) {
    return null;
  }
}

// ---- Projects extraction --------------------------------------------------
// Orchestrates /api/extract-projects, which is split into parts because a full
// project page is more output than the 60s serverless gateway allows in one call.
// Flow: discover the project list, then for each OPERATED project pull its
// snapshot / geology / results / narrative and merge into one object shaped for
// profileToPP's mapProjects (which feeds the app's Projects tab).
//
// `releases`: [{ date, text }] — the corpus (in onboarding, the timeline fullText).
// `token`: the admin's access token (concierge extraction runs before the company
// row exists, so it's admin-authenticated with an inline corpus).

const PROJECT_PARTS = ["snapshot", "geology", "results", "narrative"];

async function extractPart(releases, part, project, token, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch("/api/extract-projects", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ releases, part, project }),
      });
      if (res.ok) return await res.json();
      const data = await res.json().catch(() => ({}));
      lastErr = new Error(data.error || `Extract ${part} failed (${res.status})`);
      // 529/502/503/504/429 are transient; 4xx (bad request / not admin) are not.
      if (![429, 502, 503, 504, 529].includes(res.status)) throw lastErr;
    } catch (e) { lastErr = e; if (i === attempts - 1) throw e; }
    await new Promise((r) => setTimeout(r, 800 * 2 ** i + Math.floor(Math.random() * 400)));
  }
  throw lastErr;
}

// A discovered project is "operated" (gets a full page) unless it's a royalty/NSR
// interest — the extractor tags those, and there's no site to describe.
const isOperated = (p) => !/\bNSR\b|royalty/i.test(`${p.name || ""} ${p.tag || ""}`);

export async function extractProjects(releases, { token, onProgress } = {}) {
  const corpus = (Array.isArray(releases) ? releases : []).filter((r) => r && r.date && r.text);
  if (!corpus.length) return { projects: [], corpusNotes: [], skipped: [] };

  const disc = await extractPart(corpus, "discover", "", token);
  const all = Array.isArray(disc.projects) ? disc.projects : [];
  const operated = all.filter(isOperated);
  const skipped = all.filter((p) => !isOperated(p)).map((p) => p.name);

  // total steps = discover (done) + PARTS per operated project, for progress.
  const totalSteps = operated.length * PROJECT_PARTS.length;
  let step = 0;
  const projects = [];
  for (const base of operated) {
    const entry = { ...base };
    for (const part of PROJECT_PARTS) {
      try {
        const j = await extractPart(corpus, part, base.name, token);
        const { meta, notFound, ...rest } = j || {};
        Object.assign(entry, rest);
        entry.notFound = [...(entry.notFound || []), ...(notFound || [])];
      } catch (_) { /* one part failing shouldn't lose the whole project */ }
      step++;
      if (onProgress) { try { onProgress(step, totalSteps, `${base.name} · ${part}`); } catch (_) {} }
    }
    projects.push(entry);
  }
  return { projects, corpusNotes: disc.corpusNotes || [], skipped };
}

// ---- Company facts extraction (identity + capital + team) -----------------
// One call over the whole corpus. Returns { identity, capital, team, notFound }.
// Retries transient failures; returns null on hard failure so the caller can
// carry on without these fields rather than aborting onboarding.
export async function extractCompany(releases, { token, attempts = 3 } = {}) {
  const corpus = (Array.isArray(releases) ? releases : []).filter((r) => r && r.date && r.text);
  if (!corpus.length) return null;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch("/api/extract-company", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ releases: corpus }),
      });
      if (res.ok) return await res.json();
      const data = await res.json().catch(() => ({}));
      lastErr = new Error(data.error || `Company extraction failed (${res.status})`);
      if (![429, 502, 503, 504, 529].includes(res.status)) return null;   // hard error → give up quietly
    } catch (e) { lastErr = e; if (i === attempts - 1) return null; }
    await new Promise((r) => setTimeout(r, 800 * 2 ** i + Math.floor(Math.random() * 400)));
  }
  return null;
}

// Convenience: run the whole pipeline (fan out -> assemble -> group + suggestions).
export async function extractCorpus(items, opts = {}) {
  const results = await structureReleases(items, opts);
  const timeline = assembleTimeline(results);
  return {
    results,
    timeline,
    timelineEntries: toTimelineEntries(timeline), // ready for setTimeline(...)
    grouped: groupByYearQuarter(timeline),
    suggestions: synthesizeSuggestions(results),
    failures: results.filter((r) => r.error).map((r) => ({ name: r.item.name, error: r.error })),
  };
}
