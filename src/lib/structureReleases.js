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

// Batched structuring — the cost-efficient path. Groups releases and sends each
// group to /api/structure-batch in ONE call, cutting ~1 call/doc to ~1 call per
// `batchSize` docs. Only works on TEXT (the batch endpoint reads text, not PDFs),
// so callers pass extracted text. Returns the SAME [{item, analysis}] shape as
// structureReleases so assembleTimeline is unchanged.
async function callBatch(batch, token, context, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch("/api/structure-batch", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ releases: batch.map((b) => ({ id: b.id, text: b.text })), context }),
      });
      if (res.ok) return (await res.json()).entries || [];
      const data = await res.json().catch(() => ({}));
      lastErr = new Error(data.error || `Batch failed (${res.status})`);
      if (![429, 502, 503, 504, 529].includes(res.status)) throw lastErr;
    } catch (e) { lastErr = e; if (i === attempts - 1) throw e; }
    await sleep(800 * 2 ** i + Math.floor(Math.random() * 400));
  }
  throw lastErr;
}

// Adapt a slim batch entry into the {card, classification, proposedChanges} shape
// assembleTimeline reads.
function entryToAnalysis(e) {
  return {
    card: {
      headline: e.headline, sourceDate: e.sourceDate, category: e.category,
      whatHappened: e.whatHappened, whyItMatters: e.whyItMatters, whatHappensNext: e.whatHappensNext,
      keyNumbers: Array.isArray(e.keyNumbers) ? e.keyNumbers : [], stageFrom: e.stageFrom, stageTo: e.stageTo,
      investorTakeaway: e.investorTakeaway, projectsMentioned: Array.isArray(e.projectsMentioned) ? e.projectsMentioned : [], sourceUrl: "",
    },
    classification: { suggestedImpact: e.impact, suggestedKey: !!e.key, confidence: "medium" },
    proposedChanges: [],
  };
}

export async function structureReleasesBatched(items, { token, context = {}, batchSize = 8, concurrency = 3, onProgress } = {}) {
  const list = (Array.isArray(items) ? items : []).filter((it) => it && String(it.text || "").trim());
  if (!list.length) return [];
  // split into batches
  const batches = [];
  for (let i = 0; i < list.length; i += batchSize) batches.push(list.slice(i, i + batchSize));
  const results = [];
  let doneDocs = 0, cursor = 0;
  const byId = new Map(list.map((it) => [String(it.id), it]));
  async function worker() {
    while (cursor < batches.length) {
      const b = batches[cursor++];
      try {
        const entries = await callBatch(b, token, context);
        // match each entry back to its item by id; fall back to positional.
        entries.forEach((e, idx) => {
          const item = byId.get(String(e.id)) || b[idx];
          if (item) results.push({ item, analysis: entryToAnalysis(e) });
        });
      } catch (_) {
        b.forEach((item) => results.push({ item, error: "batch failed" }));
      }
      doneDocs += b.length;
      if (onProgress) { try { onProgress(doneDocs, list.length); } catch (_) {} }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, batches.length)) }, worker));
  return results;
}

// Fan out over many releases with a small concurrency cap (default 4 — respects
// the API without a batch endpoint). `items`: [{ id, name, text }].
// `onProgress(done, total, item)` fires after each completes.
// Returns [{ item, analysis }] on success or [{ item, error }] per failed item —
// one bad release never sinks the batch. (Legacy per-doc path; batched is cheaper.)
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
  const corpus = (Array.isArray(releases) ? releases : []).filter((r) => r && r.text && String(r.text).trim());
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
  const corpus = (Array.isArray(releases) ? releases : []).filter((r) => r && r.text && String(r.text).trim());
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

// ---- Re-analyze from memory ------------------------------------------------
// Re-runs extraction over a company's ALREADY-STORED documents — no re-upload.
// Crucially it feeds the FULL corpus (press releases AND website/business pages)
// to the company + projects extractors, fixing the bug where those read only the
// dated timeline and never saw the Board/Share-Structure/project pages.
//
// Flow: load the stored docs -> make sure each has text (transcribe any PDF that
// doesn't, once, and save it) -> timeline from the dated press releases ->
// company + projects from EVERY document. Cheap on re-runs because transcription
// is cached (only pending docs are transcribed) and text is reused.

const dateFromName = (name) => { const m = /(\d{4}-\d{2}-\d{2})/.exec(String(name || "")); return m ? m[1] : ""; };
const isPdfDoc = (d) => /pdf/i.test(d.mime || "") || /\.pdf$/i.test(d.filename || "");

// Transcribe one PDF to text via the endpoint (Haiku). Returns "" on failure.
async function extractDocText(pdfBase64, token) {
  try {
    const res = await fetch("/api/extract-text", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ pdf: pdfBase64 }),
    });
    if (!res.ok) return "";
    const j = await res.json().catch(() => ({}));
    return j.text || "";
  } catch { return ""; }
}

// `deps` injects the memory helpers (documentsForExtraction, downloadDocumentBase64,
// saveDocumentText) so this module stays free of a circular import on memory.js.
export async function reanalyzeFromMemory(companyId, { token, onProgress, deps } = {}) {
  const { documentsForExtraction, downloadDocumentBase64, saveDocumentText } = deps || {};
  if (!documentsForExtraction) throw new Error("memory deps required");
  const docs = await documentsForExtraction(companyId);
  if (!docs.length) return null;

  // 1) Ensure every document has text. For PDFs that don't, extract it — FREE via
  // client-side pdf.js first, falling back to the AI transcription endpoint only
  // for the rare scanned/image PDF with no text layer.
  const { pdfToText } = await import("./pdfText.js");
  const b64ToBuffer = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); return u.buffer; };
  let ti = 0;
  for (const d of docs) {
    ti++;
    if (d.extracted_text && d.extracted_text.trim()) continue;
    if (onProgress) onProgress(`Reading document ${ti} of ${docs.length}…`);
    if (isPdfDoc(d) && d.storage_path) {
      const b64 = await downloadDocumentBase64(d.storage_path);
      if (b64) {
        let txt = "";
        try { txt = await pdfToText(b64ToBuffer(b64)); } catch (_) { /* fall through to AI */ }
        if (!txt || txt.trim().length < 30) txt = await extractDocText(b64, token);   // scanned PDF → AI
        if (txt) { d.extracted_text = txt; if (saveDocumentText) await saveDocumentText(d.id, txt); }
      }
    }
  }

  // 2) The full corpus — every document that has text, with its best date.
  const corpus = docs
    .filter((d) => d.extracted_text && d.extracted_text.trim())
    .map((d) => ({ date: d.doc_date || dateFromName(d.filename), text: d.extracted_text, name: d.filename }));

  // 3) Timeline via BATCHED structuring. Structure EVERY document and let the AI
  // read each one's date from its content (the dateline) — do NOT pre-filter by
  // filename, or a press release whose filename lacks a date gets skipped.
  // assembleTimeline then keeps only entries the AI dated (real press releases);
  // undated reference docs (decks, website pages) fall out of the timeline and
  // contribute to the profile instead.
  const prItems = corpus.map((d, i) => ({ id: "m" + i, name: d.name, text: d.text }));
  let out = { timeline: [], timelineEntries: [] };
  if (prItems.length) {
    if (onProgress) onProgress("Rebuilding the timeline…");
    const results = await structureReleasesBatched(prItems, { token, onProgress: (dn, tot) => onProgress && onProgress(`Analyzing release ${dn} of ${tot}…`) });
    const timeline = assembleTimeline(results);
    out = { timeline, timelineEntries: toTimelineEntries(timeline), results };
  }

  // 4) Company facts + projects from the WHOLE corpus (this is the fix).
  const releases = corpus.map((d) => ({ date: d.date || "0000-00-00", text: d.text })).filter((r) => r.text && r.text.trim().length > 20);
  if (onProgress) onProgress("Reading company details, capital and leadership…");
  const company = await extractCompany(releases, { token });
  if (onProgress) onProgress("Extracting projects — this takes a few minutes…");
  const projects = await extractProjects(releases, { token, onProgress: (dn, tot, label) => onProgress && onProgress(`Building projects: ${label} (${dn}/${tot})…`) });

  return { ...out, company, projects, docCount: docs.length, textCount: corpus.length };
}

// Convenience: run the whole pipeline (structure -> assemble -> group + suggestions).
// Uses the BATCHED structuring path when a token is supplied and items are text
// (the cheap path — ~1 call per 8 docs); falls back to the per-doc path otherwise
// (e.g. legacy PDF-as-base64 items without client-extracted text).
export async function extractCorpus(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const allText = list.length > 0 && list.every((it) => it && String(it.text || "").trim());
  const results = (opts.token && allText)
    ? await structureReleasesBatched(items, opts)
    : await structureReleases(items, opts);
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
