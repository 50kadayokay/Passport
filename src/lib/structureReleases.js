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

import { authHeaders } from "./auth.js";
import { isPortalDemo } from "./demoMode.js";

const API = "/api/structure-release";

// Errors worth retrying: provider overload (529), rate limit (429), gateway/
// timeout (502/503/504), and network failures (fetch throws, no status). A 4xx
// like 400/401/403 is a real rejection — retrying it just wastes calls.
const RETRYABLE = new Set([429, 502, 503, 504, 529]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// THE AUTHORISATION SUBJECT OF EVERY AI CALL (D23). The server authorises,
// rate-limits and bills each request against the company it names
// (api/_aiGuard.js): `companyId` (or a `slug` that resolves to one), or
// `onboarding: true` for the builder before a company row exists. These helpers
// used to drop it, so every company user fell through to the platform-admin-only
// branch and was refused. Every helper below now forwards it.
export function aiScope({ companyId = null, slug = null, onboarding = false } = {}) {
  const s = {};
  if (companyId) s.companyId = companyId;
  if (slug) s.slug = slug;
  if (onboarding) s.onboarding = true;
  return s;
}

// An AI request that failed, with the HTTP status when there was one, so a
// caller can tell "refused" (401/403/400) from "try again later" (429/5xx).
function aiError(message, status = 0) { const e = new Error(message); e.status = status; return e; }
// Used by analyzeNewDocuments' date filter, which called str() without it ever
// being defined here: "Analyze new" threw a ReferenceError for every caller.
const str = (v) => (v == null ? "" : String(v));
export const isRefusal = (e) => !!e && [400, 401, 403, 404, 413].includes(e.status);

// Analyze a single release. `input` is either a text string, or { text, pdf }
// where pdf is base64 PDF bytes (no data: prefix) that Claude reads natively.
// Returns the `analysis` object or throws.
//
// Retries transient failures with exponential backoff + jitter. Over a large
// corpus (100+ calls) Anthropic overload (529) is near-certain on some calls; a
// single retry pass turns "silently dropped release" into "arrived a few seconds
// late". `attempts` total tries (default 4 → up to ~1+2+4s of backoff).
export async function structureRelease(input, context = {}, { attempts = 4, companyId = null, slug = null, onboarding = false } = {}) {
  // DEMO. A real call here costs money per press release. The fixture carries a
  // previously-generated V2 card in the exact response shape, so the review
  // screen and the Takeaway/Key Results rendering are exercised for real
  // without a paid request. Matched to the text that was ingested.
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) {
    const { demoStructure } = await import("../portal/__fixtures/releaseDemoAdapter.js");
    return demoStructure(typeof input === "string" ? input : (input && input.text) || "");
  }
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
      // Signed-in callers only: this endpoint spends AI credits per request.
      const h = await authHeaders();
      const res = await fetch(API, {
        method: "POST",
        headers: { ...h, "content-type": "application/json" },
        body: JSON.stringify({ mode: "extract", ...payload, context, companyId, slug, onboarding }),
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
// `existingV2` (from prod-v1.3.2): approved V2 Briefs already on the live profile,
// so the batch endpoint never regenerates one an eligible release already has.
async function callBatch(batch, token, context, scope = {}, attempts = 3, existingV2 = null) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    let res;
    try {
      res = await fetch("/api/structure-batch", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ releases: batch.map((b) => ({ id: b.id, text: b.text })), context, ...scope, existingV2: existingV2 || undefined }),
      });
    } catch (e) { lastErr = e; if (i === attempts - 1) throw e; await sleep(800 * 2 ** i + Math.floor(Math.random() * 400)); continue; }
    if (res.ok) return (await res.json()).entries || [];
    const data = await res.json().catch(() => ({}));
    lastErr = aiError(data.error || `Batch failed (${res.status})`, res.status);
    // A refusal is final: retrying it only repeats the refusal.
    if (!RETRYABLE.has(res.status) || i === attempts - 1) throw lastErr;
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
    ...((e.v2 && !e.v2._needsReview) ? { v2: e.v2 } : {}),   // carry an APPROVED/PASS BriefV1 only (never a _needsReview brief)
  };
}

/**
 * Revise an existing analysis against a written instruction ("shorten it", "lead
 * with the grades", "drop the forward-looking language").
 *
 * The server's `refine` mode has existed since this endpoint was written; the
 * portal simply never called it. Same retry policy as structureRelease(), for
 * the same reason: retryability is decided from the HTTP status, never from the
 * error text.
 *
 * `instruction` may be empty -- that is a plain regenerate, which is why the
 * Regenerate button and the Improve button are one code path.
 */
export async function refineRelease(current, instruction = "", text = "", context = {}, { attempts = 3, companyId = null, slug = null, onboarding = false } = {}) {
  if (!current) throw new Error("Nothing to revise yet.");
  // DEMO. Regenerate/Improve also spend AI credits per press. Refused rather
  // than faked: returning a silently unchanged card would look like the model
  // had considered the instruction and declined it, which is worse than saying
  // the feature is off. The company can still edit every field by hand.
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) {
    throw new Error("Rewriting with AI is disabled in the demo. Edit the summary directly — every field is editable.");
  }
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    let retryable = false;
    try {
      // Signed-in callers only: this endpoint spends AI credits per request.
      const h = await authHeaders();
      const res = await fetch(API, {
        method: "POST",
        headers: { ...h, "content-type": "application/json" },
        body: JSON.stringify({ mode: "refine", current, instruction: String(instruction || ""), text, context, companyId, slug, onboarding }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.analysis;
      }
      const data = await res.json().catch(() => ({}));
      lastErr = new Error(data.error || `Could not revise the summary (${res.status})`);
      retryable = RETRYABLE.has(res.status);
    } catch (e) {
      lastErr = e;
      retryable = true;
    }
    if (!retryable || i === attempts - 1) throw lastErr;
    await new Promise((r) => setTimeout(r, 800 * 2 ** i + Math.random() * 400));
  }
  throw lastErr;
}

export async function structureReleasesBatched(items, { token, context = {}, batchSize = 8, concurrency = 3, onProgress, companyId = null, slug = null, onboarding = false, existingV2 = null } = {}) {
  const scope = aiScope({ companyId, slug, onboarding });
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
        const entries = await callBatch(b, token, context, scope, 3, existingV2);
        // match each entry back to its item by id; fall back to positional.
        entries.forEach((e, idx) => {
          const item = byId.get(String(e.id)) || b[idx];
          if (item) results.push({ item, analysis: entryToAnalysis(e) });
        });
      } catch (e) {
        b.forEach((item) => results.push({ item, error: (e && e.message) || "batch failed", status: (e && e.status) || 0 }));
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
export async function structureReleases(items, { context = {}, concurrency = 4, onProgress, companyId = null, slug = null, onboarding = false } = {}) {
  const list = Array.isArray(items) ? items.filter((it) => it && (String(it.text || "").trim() || it.pdf)) : [];
  const results = new Array(list.length);
  let done = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const i = cursor++;
      const item = list[i];
      try {
        results[i] = { item, analysis: await structureRelease({ text: item.text, pdf: item.pdf }, context, { companyId, slug, onboarding }) };
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
        // Refined BriefV1 (validated server-side). Rides through to the reader when present;
        // absent → the reader maps the card fields into BriefV1 instead.
        v2: (r.analysis && r.analysis.v2) || null,
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
// Exported because the Company Portal filters press releases by the SAME list.
// One definition, so a category the app can show is never a category the portal
// cannot filter by (and vice versa).
export const TIMELINE_CATEGORIES = ["Discovery", "Drilling", "Financing", "Permitting", "Infrastructure", "Acquisition", "Resource Growth", "Exploration", "Corporate"];
const TL_CATS = TIMELINE_CATEGORIES;
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
    ...((e.v2 && !e.v2._needsReview) ? { v2: e.v2 } : {}),   // APPROVED/PASS BriefV1 only onto the entry (held REVIEW/FAIL never persisted)
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
export async function synthesizeProfile({ company = {}, timeline = [], projects = [] } = {}, { attempts = 3, companyId = null, slug = null, onboarding = false, onError } = {}) {
  if (!Array.isArray(timeline) || !timeline.length) { if (onError) onError(aiError("No dated releases to summarise.", 0)); return null; }
  let lastErr = null;
  // The synthesis call intermittently returns a 200 with an empty overview (the model
  // occasionally emits the forced tool with no content). Retry until we get a usable
  // status headline, so a one-off empty response doesn't leave the profile blank.
  for (let i = 0; i < attempts; i++) {
    try {
      // Signed-in callers only: this endpoint spends AI credits per request.
      const h = await authHeaders();
      const res = await fetch("/api/synthesize-profile", {
        method: "POST",
        headers: { ...h, "content-type": "application/json" },
        body: JSON.stringify({ company, timeline, projects, ...aiScope({ companyId, slug, onboarding }) }),
      });
      const data = await res.json().catch(() => ({}));
      const ov = res.ok ? data.overview : null;
      if (ov && ov.companyStatus && ov.companyStatus.statusHeadline) return ov;
      lastErr = res.ok ? aiError("The overview came back empty.", 200) : aiError(data.error || `Overview failed (${res.status})`, res.status);
      // Refused or malformed: retrying cannot change the answer.
      if (!res.ok && !RETRYABLE.has(res.status)) break;
    } catch (e) { lastErr = e; /* network: transient, retry */ }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 700 * 2 ** i + Math.floor(Math.random() * 300)));
  }
  if (onError) onError(lastErr || aiError("Overview failed.", 0));
  return null;
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

async function extractPart(releases, part, project, token, scope = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    let res;
    try {
      res = await fetch("/api/extract-projects", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ releases, part, project, ...scope }),
      });
    } catch (e) { lastErr = e; if (i === attempts - 1) throw e; await new Promise((r) => setTimeout(r, 800 * 2 ** i + Math.floor(Math.random() * 400))); continue; }
    if (res.ok) return await res.json();
    const data = await res.json().catch(() => ({}));
    lastErr = aiError(data.error || `Extract ${part} failed (${res.status})`, res.status);
    // 529/502/503/504/429 are transient; 4xx (bad request / not permitted) are
    // final. This used to throw inside its own try, so a refusal was retried.
    if (!RETRYABLE.has(res.status) || i === attempts - 1) throw lastErr;
    await new Promise((r) => setTimeout(r, 800 * 2 ** i + Math.floor(Math.random() * 400)));
  }
  throw lastErr;
}

// A discovered project is "operated" (gets a full page) unless it's a royalty/NSR
// interest — the extractor tags those, and there's no site to describe.
const isOperated = (p) => !/\bNSR\b|royalty/i.test(`${p.name || ""} ${p.tag || ""}`);

export async function extractProjects(releases, { token, onProgress, companyId = null, slug = null, onboarding = false } = {}) {
  const scope = aiScope({ companyId, slug, onboarding });
  const corpus = (Array.isArray(releases) ? releases : []).filter((r) => r && r.text && String(r.text).trim());
  if (!corpus.length) return { projects: [], corpusNotes: [], skipped: [] };

  const disc = await extractPart(corpus, "discover", "", token, scope);
  const all = Array.isArray(disc.projects) ? disc.projects : [];
  // Cap the number of fully-detailed projects: each one costs several sequential AI
  // calls, so 10+ projects means 50+ calls (slow, costly, and more failure surface).
  // Keep the first N operated projects; the rest are listed but not deep-detailed.
  const MAX_DETAILED = 6;
  const operatedAll = all.filter(isOperated);
  const operated = operatedAll.slice(0, MAX_DETAILED);
  const overflow = operatedAll.slice(MAX_DETAILED).map((p) => p.name);
  const skipped = [...all.filter((p) => !isOperated(p)).map((p) => p.name), ...overflow];

  // total steps = discover (done) + PARTS per operated project, for progress.
  const totalSteps = operated.length * PROJECT_PARTS.length;
  let step = 0;
  const projects = [];
  for (const base of operated) {
    const entry = { ...base };
    for (const part of PROJECT_PARTS) {
      try {
        const j = await extractPart(corpus, part, base.name, token, scope);
        const { meta, notFound, ...rest } = j || {};
        Object.assign(entry, rest);
        entry.notFound = [...(entry.notFound || []), ...(notFound || [])];
      } catch (e) {
        // A refusal will not change between parts; stop rather than spend it N times.
        if (isRefusal(e)) throw e;
        /* one transient part failing shouldn't lose the whole project */
      }
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
export async function extractCompany(releases, { token, attempts = 3, companyId = null, slug = null, onboarding = false, onError } = {}) {
  const corpus = (Array.isArray(releases) ? releases : []).filter((r) => r && r.text && String(r.text).trim());
  if (!corpus.length) return null;
  let lastErr;
  // Still returns null on failure (the builder carries on without these
  // fields), but now SAYS why through onError, so a refusal is not reported
  // upstream as "nothing found".
  const fail = (e) => { if (onError) onError(e); return null; };
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch("/api/extract-company", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ releases: corpus, ...aiScope({ companyId, slug, onboarding }) }),
      });
      if (res.ok) return await res.json();
      const data = await res.json().catch(() => ({}));
      lastErr = aiError(data.error || `Company extraction failed (${res.status})`, res.status);
      if (!RETRYABLE.has(res.status)) return fail(lastErr);   // hard error → give up
    } catch (e) { lastErr = e; if (i === attempts - 1) return fail(e); }
    await new Promise((r) => setTimeout(r, 800 * 2 ** i + Math.floor(Math.random() * 400)));
  }
  return fail(lastErr);
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
async function extractDocText(pdfBase64, token, scope = {}, onError) {
  try {
    const res = await fetch("/api/extract-text", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ pdf: pdfBase64, ...scope }),
    });
    if (!res.ok) { if (onError) onError(aiError(`Transcription failed (${res.status})`, res.status)); return ""; }
    const j = await res.json().catch(() => ({}));
    return j.text || "";
  } catch { return ""; }
}

// The chronology synthesize-profile reads (assembleTimeline's shape) rebuilt
// from a SAVED profile.timeline (toTimelineEntries' shape). Re-analysis uses it
// when the documents produced no dated releases this run, so the status card
// and brief are still regenerated from the timeline the company already has.
export function profileTimelineToChronology(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => e && /^\d{4}-\d{2}-\d{2}/.test(String(e.date || "")))
    .map((e) => {
      const ai = e.ai || {};
      return {
        date: String(e.date), headline: String(e.title || ""), category: String(e.category || ""),
        whatHappened: String(ai.whatHappened || ""), whyItMatters: String(e.summary || ""),
        whatHappensNext: String(ai.whatHappensNext || ""), keyNumbers: Array.isArray(ai.keyNumbers) ? ai.keyNumbers : [],
        stageFrom: String(ai.stageFrom || ""), stageTo: String(ai.stageTo || ""), impact: String(ai.impact || ""),
        key: !!e.key, projects: Array.isArray(ai.projects) ? ai.projects : [],
      };
    })
    .sort((x, y) => y.date.localeCompare(x.date));
}

// One record per pipeline step, so the caller can report what ACTUALLY happened
// instead of "rebuilt: 0 timeline entries" when every step was refused.
//   { ok, count?, status?, error?, skipped? }
const stepOk = (count) => ({ ok: true, count });
const stepFail = (e) => ({ ok: false, status: (e && e.status) || 0, error: (e && e.message) || "failed", refused: isRefusal(e) });

/** True when no AI step produced anything and at least one was refused. */
export function allAiStepsRefused(steps) {
  const list = Object.values(steps || {}).filter((x) => x && !x.skipped);
  return list.length > 0 && list.every((x) => !x.ok) && list.some((x) => x.refused);
}

// Ensure a set of stored docs have text (free pdf.js first, AI fallback). Shared
// by re-analyze and incremental add. Mutates each doc's extracted_text and saves.
// Returns the first transcription error, if any (null otherwise).
async function ensureDocsText(docs, token, deps, onProgress, scope = {}) {
  const { downloadDocumentBase64, saveDocumentText } = deps || {};
  const { pdfToText } = await import("./pdfText.js");
  const b64ToBuffer = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); return u.buffer; };
  let i = 0, firstErr = null;
  for (const d of docs) {
    i++;
    if (d.extracted_text && d.extracted_text.trim()) continue;
    if (onProgress) onProgress(`Reading document ${i} of ${docs.length}…`);
    if (isPdfDoc(d) && d.storage_path && downloadDocumentBase64) {
      const b64 = await downloadDocumentBase64(d.storage_path);
      if (b64) {
        let txt = "";
        try { txt = await pdfToText(b64ToBuffer(b64)); } catch (_) { /* fall through to AI */ }
        if (!txt || txt.trim().length < 30) txt = await extractDocText(b64, token, scope, (e) => { firstErr = firstErr || e; });   // scanned PDF → AI
        if (txt) { d.extracted_text = txt; if (saveDocumentText) await saveDocumentText(d.id, txt); }
      }
    }
  }
  return firstErr;
}

// `deps` injects the memory helpers (documentsForExtraction, downloadDocumentBase64,
// saveDocumentText) so this module stays free of a circular import on memory.js.
//
// D23. Every AI call is made FOR `companyId` -- authorised, limited and billed
// against that company -- and the result carries `steps`, one outcome per step.
// `existingTimeline` (the profile's saved timeline) is the fallback chronology
// for the status card and brief when this run produced no dated releases.
export async function reanalyzeFromMemory(companyId, { token, onProgress, deps, existingTimeline = [], existingV2 = null } = {}) {
  const { documentsForExtraction } = deps || {};
  if (!documentsForExtraction) throw new Error("memory deps required");
  if (!companyId) throw new Error("companyId required");
  const scope = aiScope({ companyId });
  const docs = await documentsForExtraction(companyId);
  if (!docs.length) return null;
  const steps = {};

  // 1) Ensure every document has text: free client-side pdf.js first, the AI
  // transcription endpoint only for a scanned PDF with no text layer.
  const tErr = await ensureDocsText(docs, token, deps, onProgress, scope);
  if (tErr) steps.transcribe = stepFail(tErr);

  // 2) The full corpus — every document that has text, with its best date.
  const corpus = docs
    .filter((d) => d.extracted_text && d.extracted_text.trim())
    .map((d) => ({ date: d.doc_date || dateFromName(d.filename), text: d.extracted_text, name: d.filename }));

  // 3) Timeline via BATCHED structuring. Structure EVERY document and let the AI
  // read each one's date from its content (the dateline) — do NOT pre-filter by
  // filename. assembleTimeline keeps only entries the AI dated; undated reference
  // docs (decks, website pages) fall out of the timeline and inform the profile.
  // RESILIENCE: each step is isolated, so one failure never loses the others.
  const prItems = corpus.map((d, i) => ({ id: "m" + i, name: d.name, text: d.text }));
  let out = { timeline: [], timelineEntries: [] };
  if (prItems.length) {
    if (onProgress) onProgress("Rebuilding the timeline…");
    try {
      const results = await structureReleasesBatched(prItems, { token, companyId, existingV2, onProgress: (dn, tot) => onProgress && onProgress(`Analyzing release ${dn} of ${tot}…`) });
      const failed = results.filter((r) => r.error);
      const timeline = assembleTimeline(results);
      out = { timeline, timelineEntries: toTimelineEntries(timeline), results };
      steps.timeline = failed.length === results.length && results.length
        ? stepFail(aiError(failed[0].error, failed[0].status))
        : { ...stepOk(timeline.length), ...(failed.length ? { partial: failed.length } : {}) };
    } catch (e) { steps.timeline = stepFail(e); if (onProgress) onProgress("Timeline step hit a snag — continuing with the rest…"); }
  } else steps.timeline = { ok: false, skipped: true, error: "no document text" };

  const releases = corpus.map((d) => ({ date: d.date || "0000-00-00", text: d.text })).filter((r) => r.text && r.text.trim().length > 20);
  if (onProgress) onProgress("Reading company details, capital and leadership…");
  let company = null, projects = null, coErr = null;
  company = await extractCompany(releases, { token, companyId, onError: (e) => { coErr = e; } });
  steps.company = company ? stepOk(1) : coErr ? stepFail(coErr) : { ok: false, skipped: true, error: "no text" };
  if (onProgress) onProgress("Extracting projects — this takes a few minutes…");
  try {
    projects = await extractProjects(releases, { token, companyId, onProgress: (dn, tot, label) => onProgress && onProgress(`Building projects: ${label} (${dn}/${tot})…`) });
    steps.projects = stepOk(((projects && projects.projects) || []).length);
  } catch (e) { steps.projects = stepFail(e); if (onProgress) onProgress("Projects step hit a snag — saving the rest…"); }

  // 4) The investor-facing OVERVIEW (Company Status card + AI Brief), from the
  //    chronology rebuilt above -- or, when this run dated nothing, from the
  //    timeline already on the profile. Sent in assembleTimeline's shape, which
  //    is what synthesize-profile reads (it used to get the profile shape and
  //    lost every field but the title).
  let companyStatus = null, companyBrief = null;
  const chronology = out.timeline && out.timeline.length ? out.timeline : profileTimelineToChronology(existingTimeline);
  if (chronology.length) {
    if (onProgress) onProgress("Writing the company status and AI brief…");
    const id = (company && company.identity) || {};
    const cap = (company && company.capital) || {};
    let ovErr = null;
    const overview = await synthesizeProfile({
      company: { name: id.name, ticker: id.ticker, commodity: id.commodity, jurisdiction: id.jurisdiction, ...cap },
      timeline: chronology,
      projects: ((projects && projects.projects) || []).map((p) => ({ name: p.name, tag: p.tag })),
    }, { companyId, onError: (e) => { ovErr = e; } });
    if (overview) { companyStatus = overview.companyStatus || null; companyBrief = overview.companyBrief || null; }
    steps.overview = overview ? { ...stepOk(1), source: out.timeline && out.timeline.length ? "rebuilt timeline" : "saved timeline" } : stepFail(ovErr);
  } else steps.overview = { ok: false, skipped: true, error: "no dated releases to summarise" };

  return { ...out, company, projects, companyStatus, companyBrief, steps, docCount: docs.length, textCount: corpus.length };
}

// Intelligent incremental add: process ONLY the new (unreflected) documents and
// route each by what it is —
//   • a dated press release  → new timeline entries (merged, not rebuilt)
//   • a reference doc (deck / website page / undated) → update the profile
// Company/projects/identity are re-read from the new docs so a dropped deck fills
// capital/projects/leadership; the caller merges CONSERVATIVELY (mergeIncremental),
// so a routine press release never clobbers hand-edited profile fields.
// Returns { timelineEntries, company, projects, routing, reflectedIds, steps }.
export async function analyzeNewDocuments(companyId, { token, onProgress, deps, existingV2 = null } = {}) {
  const { unreflectedDocuments } = deps || {};
  if (!unreflectedDocuments) throw new Error("memory deps required");
  if (!companyId) throw new Error("companyId required");
  const scope = aiScope({ companyId });
  const docs = await unreflectedDocuments(companyId);
  if (!docs.length) return { routing: { newDocs: 0 }, timelineEntries: [], company: null, projects: null, reflectedIds: [], steps: {} };
  const steps = {};

  // 1) Make sure the new docs have text.
  const tErr = await ensureDocsText(docs, token, deps, onProgress, scope);
  if (tErr) steps.transcribe = stepFail(tErr);
  const withText = docs.filter((d) => d.extracted_text && d.extracted_text.trim());

  // 2) Structure the new docs → new timeline entries (the AI dates them; undated
  //    reference docs fall out of the timeline).
  const items = withText.map((d, i) => ({ id: "n" + i, name: d.filename, text: d.extracted_text }));
  let timelineEntries = [];
  if (items.length) {
    if (onProgress) onProgress("Sorting new documents…");
    const results = await structureReleasesBatched(items, { token, companyId, existingV2 });
    const failed = results.filter((r) => r.error);
    // Only DATED entries (real press releases) go on the timeline; undated
    // reference docs (decks, website pages) fall through to the profile.
    timelineEntries = toTimelineEntries(assembleTimeline(results)).filter((e) => /^\d{4}-\d{2}-\d{2}/.test(str(e.date)));
    steps.timeline = failed.length === results.length && results.length ? stepFail(aiError(failed[0].error, failed[0].status)) : stepOk(timelineEntries.length);
  }

  // 3) Update profile facts from the new docs (a deck fills capital/projects/team).
  const newReleases = withText.map((d) => ({ date: d.doc_date || "", text: d.extracted_text })).filter((r) => r.text.trim().length > 20);
  let company = null, projects = null;
  if (newReleases.length) {
    if (onProgress) onProgress("Updating company details from the new documents…");
    let coErr = null;
    company = await extractCompany(newReleases, { token, companyId, onError: (e) => { coErr = e; } });
    steps.company = company ? stepOk(1) : coErr ? stepFail(coErr) : { ok: false, skipped: true };
    if (onProgress) onProgress("Updating projects…");
    try {
      projects = await extractProjects(newReleases, { token, companyId, onProgress: (dn, tot, label) => onProgress && onProgress(`Projects: ${label} (${dn}/${tot})…`) });
      steps.projects = stepOk(((projects && projects.projects) || []).length);
    } catch (e) { steps.projects = stepFail(e); }
  }

  const datedNew = timelineEntries.length;
  const refDocs = withText.length - datedNew;
  return {
    timelineEntries, company, projects, steps,
    routing: { newDocs: docs.length, withText: withText.length, timelineAdded: datedNew, referenceDocs: Math.max(0, refDocs) },
    reflectedIds: docs.map((d) => d.id),
  };
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
