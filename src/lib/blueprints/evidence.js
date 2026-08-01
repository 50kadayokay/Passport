// Project the existing importMeta.auditLog into the Blueprint source-record format.
// READ-ONLY: never mutates or deletes the original audit data. Matching is best-effort
// (the audit tables are free-form per extraction pass), so a field gets the audit rows
// that mention its label / path token; section-level evidence is surfaced as a flag.

import { makeSource } from "./types.js";

const S = (x) => (x == null ? "" : String(x));

// Flatten auditLog[{at,sections,text}] into candidate rows. Handles TSV, pipe tables,
// and plain lines. Each row keeps its source pass context.
export function parseAuditRows(auditLog) {
  const rows = [];
  (Array.isArray(auditLog) ? auditLog : []).forEach((entry) => {
    const text = S(entry && entry.text);
    if (!text) return;
    text.split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line || /^[-=|\s]+$/.test(line)) return; // skip separators
      // Prefer tab, then pipe, then 2+ spaces as the column delimiter.
      let cols;
      if (line.includes("\t")) cols = line.split("\t");
      else if (line.includes("|")) cols = line.split("|");
      else cols = line.split(/\s{2,}/);
      cols = cols.map((c) => c.trim()).filter((c) => c !== "");
      rows.push({ text: line, cols, at: entry.at || null, sections: Array.isArray(entry.sections) ? entry.sections : [] });
    });
  });
  return rows;
}

const VERIFY_MAP = { QUOTED: "verified", DERIVED: "verified", SYNTHESIZED: "unreviewed", SELECTED: "unreviewed", MISSING: "rejected" };
const CONF_MAP = { QUOTED: "high", DERIVED: "medium", SYNTHESIZED: "low", SELECTED: "low", MISSING: "unknown" };

// Turn one matched audit row into a source record. Looks for a verification tag and
// a quoted string within the row.
function rowToSource(row) {
  const tag = (row.cols.map((c) => c.toUpperCase()).find((c) => VERIFY_MAP[c])) || "";
  const quoteCol = row.cols.find((c) => /["“].+["”]/.test(c)) || row.cols.slice().sort((a, b) => b.length - a.length)[0] || row.text;
  const docCol = row.cols.find((c) => /\.(pdf|docx?|html?)$|report|md&a|news release|presentation|filing|financial/i.test(c)) || "";
  return makeSource({
    sourceDocumentName: docCol,
    exactQuote: S(quoteCol).replace(/^[-•\s]+/, "").slice(0, 600),
    authority: tag === "QUOTED" || tag === "DERIVED" ? "primary" : "supporting",
    confidence: CONF_MAP[tag] || "unknown",
    verificationStatus: VERIFY_MAP[tag] || "unreviewed",
    accessedAt: row.at || null,
  });
}

// Sources for a specific field. `tokens` = strings to match against (label + last path
// segment). Caps at 4 to avoid flooding a field with the whole audit.
export function sourcesForField(rows, tokens = []) {
  const needles = tokens.map((t) => S(t).toLowerCase()).filter((t) => t.length >= 3);
  if (!needles.length) return [];
  const matched = rows.filter((r) => {
    const hay = r.text.toLowerCase();
    return needles.some((n) => hay.includes(n));
  });
  return matched.slice(0, 4).map(rowToSource);
}

// Whether ANY audit pass covered this profile section (evidence exists even if no row
// matched a specific field).
export function hasSectionEvidence(auditLog, sectionKeys = []) {
  const want = new Set(sectionKeys.map(S));
  return (Array.isArray(auditLog) ? auditLog : []).some(
    (e) => Array.isArray(e.sections) && e.sections.some((s) => want.has(S(s)))
  );
}

// Conflicts recorded by the extractor as importMeta.notFound "CONFLICT:" lines,
// filtered to those that mention a token.
export function conflictsForField(notFound, tokens = []) {
  const needles = tokens.map((t) => S(t).toLowerCase()).filter((t) => t.length >= 3);
  return (Array.isArray(notFound) ? notFound : [])
    .filter((x) => /^conflict:/i.test(S(x)))
    .filter((x) => !needles.length || needles.some((n) => S(x).toLowerCase().includes(n)))
    .map((x) => S(x));
}
