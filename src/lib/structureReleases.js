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

// Analyze a single release. `input` is either a text string, or { text, pdf }
// where pdf is base64 PDF bytes (no data: prefix) that Claude reads natively.
// Returns the `analysis` object or throws.
export async function structureRelease(input, context = {}) {
  const payload = typeof input === "string"
    ? { text: input }
    : { text: input.text || "", pdf: input.pdf || "" };
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "extract", ...payload, context }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Structuring failed (${res.status})`);
  return data.analysis;
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
