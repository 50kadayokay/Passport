// Onboarding Engine — Pass 0 pure classification logic (no I/O, node-testable).
// Document type, disclosed-date detection, extraction state, and by-subject authority.

const S = (x) => (x == null ? "" : String(x));
const lc = (x) => S(x).toLowerCase();

// Controlled document-type vocabulary.
export const DOC_TYPES = [
  "annual_financials", "interim_financials", "mdna", "technical_report",
  "resource_estimate", "pea", "prefeasibility", "feasibility", "press_release",
  "financing_document", "management_info_circular", "investor_presentation",
  "project_webpage", "capital_structure_webpage", "leadership_webpage",
  "other_website", "media_asset", "unknown",
];
export const DOC_TYPE_LABELS = {
  annual_financials: "Annual financial statements", interim_financials: "Interim financial statements",
  mdna: "MD&A", technical_report: "Technical report", resource_estimate: "Mineral-resource estimate",
  pea: "PEA", prefeasibility: "Prefeasibility study", feasibility: "Feasibility study",
  press_release: "Press release", financing_document: "Financing document",
  management_info_circular: "Management information circular", investor_presentation: "Investor presentation",
  project_webpage: "Project webpage", capital_structure_webpage: "Capital-structure webpage",
  leadership_webpage: "Leadership webpage", other_website: "Other website capture",
  media_asset: "Image / media asset", unknown: "Unknown",
};

// Extraction lifecycle states (a row existing ≠ "processed").
export const DOC_STATES = [
  "uploaded", "queued", "extracting", "processed", "partially_processed",
  "image_only", "duplicate", "failed", "manually_excluded",
];

// By-SUBJECT authority: a source can be strong for one category, weak for another.
// { strong, useful, weak } lists of subject categories.
const AUTHORITY = {
  annual_financials:        { strong: ["capital", "financials"], useful: ["overview"], weak: ["geology", "resources", "activity"] },
  interim_financials:       { strong: ["capital", "financials"], useful: [], weak: ["geology", "resources"] },
  mdna:                     { strong: ["capital", "financials", "activity"], useful: ["overview", "strategy"], weak: ["resources"] },
  technical_report:         { strong: ["geology", "resources", "drilling", "metallurgy"], useful: ["projects"], weak: ["capital"] },
  resource_estimate:        { strong: ["resources"], useful: ["geology"], weak: ["capital"] },
  pea:                      { strong: ["economics", "resources"], useful: ["projects"], weak: [] },
  prefeasibility:           { strong: ["economics", "resources"], useful: ["projects"], weak: [] },
  feasibility:              { strong: ["economics", "resources"], useful: ["projects"], weak: [] },
  press_release:            { strong: ["activity", "milestones", "drilling"], useful: ["capital", "projects"], weak: ["resources"] },
  financing_document:       { strong: ["capital", "financings"], useful: [], weak: ["geology"] },
  management_info_circular: { strong: ["leadership", "governance"], useful: ["capital"], weak: ["geology"] },
  investor_presentation:    { strong: ["language", "overview", "visuals"], useful: ["projects", "activity"], weak: ["capital", "resources"] },
  project_webpage:          { strong: ["projects", "overview"], useful: ["geology"], weak: ["capital"] },
  capital_structure_webpage:{ strong: ["capital"], useful: [], weak: ["resources"] },
  leadership_webpage:       { strong: ["leadership"], useful: [], weak: [] },
  other_website:            { strong: [], useful: ["overview", "language"], weak: ["capital", "resources"] },
  media_asset:              { strong: ["visuals"], useful: [], weak: ["capital", "resources"] },
  unknown:                  { strong: [], useful: [], weak: [] },
};
export function authorityFor(type) { return AUTHORITY[type] || AUTHORITY.unknown; }

// Type classification from filename + extracted text. Returns { type, confidence, needsReview, signals }.
export function classifyType({ filename = "", text = "", mime = "" } = {}) {
  const name = lc(filename), body = lc(text).slice(0, 8000), hay = name + " \n " + body;
  if (/^image\//.test(mime) || /\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return { type: "media_asset", confidence: "high", needsReview: false, signals: ["image mime/extension"] };
  const has = (...ws) => ws.some((w) => hay.includes(w));
  const rules = [
    ["mdna", () => has("management's discussion", "management discussion and analysis", "md&a", "mda ")],
    ["annual_financials", () => has("annual financial statements", "audited financial statements", "consolidated financial statements") && has("year ended", "annual")],
    ["interim_financials", () => has("interim financial statements", "condensed consolidated interim", "three months ended", "six months ended", "nine months ended")],
    ["technical_report", () => has("ni 43-101", "ni43-101", "technical report", "qualified person")],
    ["resource_estimate", () => has("mineral resource estimate", "resource estimate", "indicated resource", "inferred resource")],
    ["feasibility", () => has("feasibility study") && !has("pre-feasibility", "prefeasibility")],
    ["prefeasibility", () => has("pre-feasibility", "prefeasibility")],
    ["pea", () => has("preliminary economic assessment", "pea ")],
    ["management_info_circular", () => has("management information circular", "information circular", "notice of meeting", "proxy")],
    ["financing_document", () => has("subscription agreement", "private placement", "bought deal", "prospectus", "offering document") && !has("news release", "press release")],
    ["press_release", () => has("news release", "press release", "announces", "provides update", "for immediate release", "tsxv", "otcqb")],
    ["investor_presentation", () => has("investor presentation", "corporate presentation") || /presentation/.test(name) || /deck/.test(name)],
    ["capital_structure_webpage", () => has("capital structure", "shares outstanding", "fully diluted") && has("http", "www.", "webpage")],
    ["leadership_webpage", () => (has("board of directors", "management team", "leadership") && has("http", "www.", "webpage"))],
    ["project_webpage", () => has("http", "www.", "webpage") && has("project", "property", "deposit")],
    ["other_website", () => has("http", "www.", "webpage")],
  ];
  const hits = rules.filter(([, f]) => { try { return f(); } catch { return false; } }).map(([t]) => t);
  if (!hits.length) return { type: "unknown", confidence: "low", needsReview: true, signals: [] };
  // First strong match wins; confidence high if a single clear hit, medium if multiple.
  const type = hits[0];
  const confidence = hits.length === 1 ? "high" : "medium";
  return { type, confidence, needsReview: confidence !== "high", signals: hits };
}

// Detect the DISCLOSED date from the document (not upload/file time). Returns
// { date, source, confidence, dateType, candidates }.
const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
export function detectDate({ text = "", filename = "" } = {}) {
  const head = S(text).slice(0, 4000);
  const found = [];
  const push = (iso, source, dateType) => { if (iso && !found.some((f) => f.date === iso)) found.push({ date: iso, source, dateType }); };
  const toIso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const monthNum = (name) => MONTHS.split("|").indexOf(lc(name)) + 1;
  // "May 12, 2026" / "12 May 2026"
  let m;
  const reA = new RegExp(`(${MONTHS})\\s+(\\d{1,2}),?\\s+(\\d{4})`, "gi");
  while ((m = reA.exec(head))) push(toIso(m[3], monthNum(m[1]), m[2]), "text", "publication");
  const reB = new RegExp(`(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})`, "gi");
  while ((m = reB.exec(head))) push(toIso(m[3], monthNum(m[2]), m[1]), "text", "publication");
  // ISO in text
  const reC = /(20\d{2})-(\d{2})-(\d{2})/g;
  while ((m = reC.exec(head))) push(toIso(m[1], m[2], m[3]), "text", "publication");
  // "as at / period ended" → reporting/effective
  if (/period ended|as at|year ended|three months ended|effective date/i.test(head) && found.length) found[0].dateType = /effective date/i.test(head) ? "effective" : "reporting";
  // Filename date fallback
  const fn = filename.match(/(20\d{2})[-_](\d{2})[-_](\d{2})/);
  if (fn) push(toIso(fn[1], fn[2], fn[3]), "filename", "publication");
  const best = found[0];
  return {
    date: best ? best.date : null,
    source: best ? best.source : "none",
    confidence: best ? (best.source === "text" ? "high" : "medium") : "none",
    dateType: best ? best.dateType : "unknown",
    candidates: found.slice(0, 6),
  };
}

// Extraction state from the health analysis. `dup` = duplicate classification (or null).
export function computeState({ analysis, isPdf, isImage, dup } = {}) {
  if (dup && dup.status === "exact") return "duplicate";
  if (isImage) return "image_only";
  if (!isPdf) return analysis && analysis.totalChars > 0 ? "processed" : "failed";
  if (!analysis || !analysis.ok) return "failed";
  if (analysis.numPages === 0) return "failed";
  if (analysis.readablePct === 0) return "image_only";
  if (analysis.readablePct < 60 || analysis.imageOnlyPages > 0) return "partially_processed";
  return "processed";
}

// Whether the doc needs a human before extraction continues.
export function needsReview({ typeResult, dateResult, state }) {
  return (
    (typeResult && typeResult.needsReview) ||
    (typeResult && typeResult.type === "unknown") ||
    (dateResult && dateResult.source === "none") ||
    ["failed", "image_only", "partially_processed"].includes(state)
  );
}

// Duplicate classification against already-stored docs. exactHashes = Set of sha256.
// existing = [{ id, sha256, kind, title, doc_date }]. Returns { status, of } where status
// is exact | probable_revision | possible | unique.
export function classifyDuplicate({ sha256, type, title, docDate }, existing = []) {
  const exact = existing.find((e) => e.sha256 && e.sha256 === sha256);
  if (exact) return { status: "exact", of: exact.id };
  const norm = (t) => lc(t).replace(/[^a-z0-9]+/g, " ").trim();
  const nt = norm(title);
  if (nt) {
    const revision = existing.find((e) => e.kind === type && norm(e.title) && (norm(e.title) === nt || norm(e.title).includes(nt) || nt.includes(norm(e.title))) && e.doc_date !== docDate);
    if (revision) return { status: "probable_revision", of: revision.id };
    const possible = existing.find((e) => e.kind === type && norm(e.title) === nt);
    if (possible) return { status: "possible", of: possible.id };
  }
  return { status: "unique", of: null };
}

// Inventory summary counts (pure).
export function summarize(docs = []) {
  const m = (d) => d.meta || {};
  const pages = docs.reduce((n, d) => n + (m(d).pageCount || 0), 0);
  const textPages = docs.reduce((n, d) => n + (m(d).textPages || 0), 0);
  const imgPages = docs.reduce((n, d) => n + (m(d).imageOnlyPages || 0), 0);
  const byState = (s) => docs.filter((d) => d.extraction_status === s).length;
  return {
    uploaded: docs.length,
    unique: docs.filter((d) => (m(d).duplicateStatus || "unique") === "unique").length,
    duplicates: docs.filter((d) => ["exact", "probable_revision", "possible"].includes(m(d).duplicateStatus)).length,
    pages, textPages, imageOnlyPages: imgPages,
    processed: byState("processed"), partial: byState("partially_processed"),
    imageOnly: byState("image_only"), failed: byState("failed"),
    unknownType: docs.filter((d) => (d.kind || "unknown") === "unknown").length,
    needsReview: docs.filter((d) => m(d).needsReview || (d.kind || "unknown") === "unknown").length,
  };
}

// Documents whose unresolved state blocks the Evidence-Graph phase (gate).
export const GATE_BLOCKING_STATES = ["failed", "partially_processed", "image_only"];
export function gateRisks(docs = []) {
  const risky = docs.filter((d) => {
    const st = d.extraction_status;
    const m = d.meta || {};
    if (m.manually_excluded || st === "manually_excluded" || st === "duplicate") return false;
    if (GATE_BLOCKING_STATES.includes(st)) return !m.gate_override;
    if (m.needsReview) return !m.gate_override;
    if ((d.kind || "unknown") === "unknown") return !m.gate_override;
    return false;
  });
  return { blocked: risky.length > 0, count: risky.length, docs: risky };
}
