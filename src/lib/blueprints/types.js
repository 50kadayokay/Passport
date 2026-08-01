// Blueprint shared types, constants, and small pure helpers.
//
// Phase 1 goal: a common field wrapper + factories used by BOTH the Passport and
// Conference Blueprints, so the UI is config-driven and the two projections share a
// vocabulary. Nothing here reads module globals or mutates a source profile.

export const BLUEPRINT_TYPES = ["passport", "conference"];

// Row-level lifecycle of a whole Blueprint (stored on company_blueprints.status).
export const BLUEPRINT_STATUSES = ["draft", "in_review", "approved", "archived"];

// Per-field content state. Split into PRESENT states and classified MISSING states
// (the production classifier). Legacy strings (needs_writing/needs_research/conflict/
// empty) stay valid so older stored blueprints keep loading.
export const PRESENT_STATUSES = ["extracted", "evidence_available", "needs_review", "verified", "approved"];
export const MISSING_STATUSES = [
  "not_disclosed",        // company has not disclosed this
  "not_extracted",        // present in a source but not yet pulled in
  "needs_ai_writing",     // needs AI-assisted drafting
  "needs_manual_review",  // a human must decide
  "conflicting_sources",  // sources disagree
  "awaiting_confirmation",// waiting on company sign-off
];
export const NEUTRAL_STATUSES = ["empty", "intentionally_omitted", "not_applicable"];
export const FIELD_STATUSES = [
  ...PRESENT_STATUSES,
  ...MISSING_STATUSES,
  ...NEUTRAL_STATUSES,
  // legacy aliases kept for back-compat with any already-stored blueprint
  "needs_writing", "needs_research", "conflict",
];

// Which statuses count as "missing" for review queues / completion.
export const IS_MISSING = new Set([...MISSING_STATUSES, "empty", "needs_writing", "needs_research", "conflict"]);
export const IS_PRESENT = new Set(PRESENT_STATUSES);

// Default classification for a freshly-projected empty field.
export function defaultMissingStatus({ sourceKind, required } = {}) {
  if (sourceKind === "none") return "needs_ai_writing"; // presentation copy to author
  if (required) return "needs_manual_review";
  return "not_extracted";
}

// Per-field product approval (the review decision).
export const APPROVAL_VALUES = ["unreviewed", "in_review", "approved", "rejected"];

// Source authority + confidence + verification vocab (evidence records).
export const SOURCE_AUTHORITY = ["primary", "supporting", "contextual", "unknown"];
export const SOURCE_CONFIDENCE = ["high", "medium", "low", "unknown"];
export const SOURCE_VERIFICATION = ["unreviewed", "verified", "disputed", "rejected"];

// Template identity. Bump the version when the field set changes; older stored
// versions remain valid (the DB unique key is per version).
export const PASSPORT_TEMPLATE_KEY = "passport.v1";
export const CONFERENCE_TEMPLATE_KEY = "conference.v1";
// LOCKED at 1.0. Do not silently mutate the template field sets after this — any
// change to passportTemplate.js / conferenceTemplate.js must bump TEMPLATE_VERSION
// to a new value so existing v1.0 blueprints (one row per (company,type,version))
// are never rewritten.
export const TEMPLATE_VERSION = "1.0";
export const ADAPTER_VERSION = "phase1-1.0";

const S = (x) => (x == null ? "" : String(x));
export const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

export function nonEmpty(v) {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true; // numbers, booleans
}

// Safe dot-path getter: getPath(profile, "company.name"). Never throws.
export function getPath(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

// Deterministic slug for stable pool-record IDs.
export function slugId(...parts) {
  return parts
    .map(S)
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

// Stable JSON fingerprint (sorted keys) — used for the "no mutation" proof and for
// change detection. Pure; no Date/random.
export function fingerprint(obj) {
  const seen = new WeakSet();
  const norm = (v) => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return null;
      seen.add(v);
      if (Array.isArray(v)) return v.map(norm);
      return Object.keys(v).sort().reduce((o, k) => { o[k] = norm(v[k]); return o; }, {});
    }
    return v;
  };
  try { return JSON.stringify(norm(obj)); } catch { return ""; }
}

// The canonical field wrapper. Every Blueprint field is one of these.
export function makeField(fieldKey, opts = {}) {
  const rawValue = opts.rawValue !== undefined ? opts.rawValue : "";
  const displayValue = opts.displayValue !== undefined ? opts.displayValue : rawValue;
  const has = nonEmpty(displayValue) || nonEmpty(rawValue);
  const sources = Array.isArray(opts.sources) ? opts.sources : [];
  const conflicts = Array.isArray(opts.conflicts) ? opts.conflicts : [];
  let status = opts.status;
  if (!status) {
    if (conflicts.length) status = "conflicting_sources";
    else if (!has) status = opts.missingStatus || "empty";
    else if (sources.length) status = "evidence_available";
    else status = "extracted";
  }
  return {
    fieldKey,
    rawValue,
    displayValue,
    status,
    required: !!opts.required,
    approvalStatus: opts.approvalStatus || "unreviewed",
    reviewerNotes: opts.reviewerNotes || "",
    sources,
    conflicts,
    revisionHistory: Array.isArray(opts.revisionHistory) ? opts.revisionHistory : [],
    layoutGuidance: opts.layoutGuidance || null,
  };
}

// Canonical evidence source record.
export function makeSource(opts = {}) {
  return {
    sourceDocumentName: opts.sourceDocumentName || "",
    sourceDocumentType: opts.sourceDocumentType || "",
    documentDate: opts.documentDate || null,
    pageNumber: opts.pageNumber ?? null,
    exactQuote: opts.exactQuote || "",
    sourceUrl: opts.sourceUrl || null,
    accessedAt: opts.accessedAt || null,
    authority: SOURCE_AUTHORITY.includes(opts.authority) ? opts.authority : "supporting",
    confidence: SOURCE_CONFIDENCE.includes(opts.confidence) ? opts.confidence : "unknown",
    verificationStatus: SOURCE_VERIFICATION.includes(opts.verificationStatus) ? opts.verificationStatus : "unreviewed",
    reviewerNotes: opts.reviewerNotes || "",
  };
}

// A repeatable pool record (projects, highlights, results, milestones, leaders, ...).
// Keeps a stable `id` so import merges by identity, never by position.
export function makeRecord(id, opts = {}) {
  return {
    id: S(id) || slugId("item"),
    label: opts.label || "",
    values: isObj(opts.values) ? opts.values : {},
    status: opts.status || (nonEmpty(opts.values) ? "extracted" : "empty"),
    approvalStatus: opts.approvalStatus || "unreviewed",
    selected: opts.selected !== undefined ? !!opts.selected : true,
    featured: !!opts.featured,
    order: Number.isFinite(opts.order) ? opts.order : 0,
    sources: Array.isArray(opts.sources) ? opts.sources : [],
    conflicts: Array.isArray(opts.conflicts) ? opts.conflicts : [],
    reviewerNotes: opts.reviewerNotes || "",
  };
}

// Section/page completion tally over a set of field wrappers + pool records.
export function tally(fields = [], records = []) {
  const all = [...fields, ...records];
  const t = { total: all.length, approved: 0, unreviewed: 0, missing: 0, conflicts: 0, needsWriting: 0, present: 0 };
  all.forEach((f) => {
    if (f.approvalStatus === "approved") t.approved++;
    else t.unreviewed++;
    if (IS_MISSING.has(f.status)) t.missing++;
    if (IS_PRESENT.has(f.status)) t.present++;
    if (f.status === "conflicting_sources" || f.status === "conflict" || (Array.isArray(f.conflicts) && f.conflicts.length)) t.conflicts++;
    if (f.status === "needs_ai_writing" || f.status === "needs_writing") t.needsWriting++;
  });
  return t;
}
