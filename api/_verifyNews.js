// api/_verifyNews.js — deterministic post-generation verification for FEED news summaries.
//
// The model is already asked to cite provenance, but auto-approval only checked that provenance
// EXISTS — never that the summary is actually grounded in the article. That let a hallucinated or
// misspelled summary ship (e.g. a "What does this mean?" term "Ofake" that the source never
// contains — it says "offtake"). This module independently re-verifies the two failure modes that
// an investor would actually be misled by, WITHOUT trusting the model's own evidence:
//
//   1) Key Numbers grounding — every figure in key_numbers must appear in the source article
//      (comma-insensitive, with money-compaction and km<->m equivalence). A projected/derived or
//      invented number that is nowhere in the source is flagged.
//   2) Defined-term grounding — each SINGLE-WORD jargon term defined in plain_english_explanation
//      must appear in the source (or the summary). A one-word term found nowhere in the article is
//      almost always a model misspelling/invention; this is exactly what catches "Ofake".
//
// On any failure the caller holds the item for human review instead of auto-publishing (fail
// closed). Pure, import-safe, no network. Returns { ok, reasons, checked }.

const norm = (s) => String(s || "")
  .toLowerCase()
  .replace(/[‐-―]/g, "-")   // unicode hyphens/dashes -> "-"
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, " ")
  .trim();

const NUM = /\d[\d.,]*\d|\d/g;
const compactNum = (t) => String(t).replace(/,/g, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
const digitsOf = (s) => (String(s == null ? "" : s).match(NUM) || []).map(compactNum);

// A number is grounded if it (or its compacted integer, or a km<->m equivalent) appears in the
// comma-stripped source. Mirrors api/_briefValidate.js so "16,000 m" == "16 km", "13.0M" == 13,000,000.
function numberGrounded(tok, srcNoCommas) {
  const t = compactNum(String(tok).replace(/,/g, ""));
  if (!t) return true;
  if (srcNoCommas.includes(t)) return true;                 // exact (comma- and trailing-zero-insensitive)
  // NO loose integer-part fallback: a decimal like "22.3" must match in full, so it can't borrow
  // "22" from an unrelated "222,000". (Trailing-zero money like "13.0" already compacts to "13"
  // and is caught by the exact check above.) We still allow km<->m equivalence for intervals.
  const n = parseFloat(t);
  if (Number.isFinite(n) && n !== 0) {
    for (const alt of [n / 1000, n * 1000]) {
      const whole = Math.round(alt);
      if (String(whole).replace("-", "").length >= 2 && srcNoCommas.includes(String(whole))) return true;
      if (alt % 1 !== 0 && srcNoCommas.includes(String(alt))) return true;
    }
  }
  return false;
}

// Words that often HEAD a definition but may be phrased differently than the article; we only
// verify single-word jargon (where garbling actually shows up), and skip these generic heads so
// a legitimately-reworded common word never forces a false review.
const COMMON = new Set((
  "the a an of in to and or for with from on at by as is are was were be this that these those " +
  "value price cost costs share shares equity debt supply demand project projects company companies " +
  "mineral minerals material materials metal metals contract contracts agreement agreements ownership " +
  "interest framework strategy production capacity investment investments financing revenue margin " +
  "resource resources reserve reserves grade grades"
).split(" "));

export function verifyNewsBrief({ keyNumbers = [], plainEnglish = "", summary = "" } = {}, sourceText = "") {
  const reasons = [];
  const src = norm(sourceText);
  const srcNoCommas = src.replace(/,/g, "");
  const srcNoHyphen = srcNoCommas.replace(/-/g, "");
  const haveSource = src.length >= 120;

  // Without a readable source body we cannot verify anything. The caller already refuses to
  // auto-publish items whose full source was not retrieved, so report "not checked" and let that
  // gate stand rather than emitting false failures.
  if (!haveSource) return { ok: true, reasons: [], checked: false };

  // 1) Key Numbers grounding.
  if (Array.isArray(keyNumbers)) {
    for (const k of keyNumbers) {
      const val = k && typeof k === "object" ? (k.value != null ? k.value : (k.v != null ? k.v : k.number)) : k;
      const toks = digitsOf(val).filter((d) => d.length >= 2); // ignore trivial 1-digit tokens (years/counts)
      for (const d of toks) {
        if (!numberGrounded(d, srcNoCommas)) {
          reasons.push(`Key number "${String(val).slice(0, 48)}" is not found in the source article`);
          break;
        }
      }
    }
  }

  // 2) Defined-term grounding ("What does this mean?"). The model is instructed to define ONLY
  //    terms that appear in THIS article, so every meaningful word of a defined term should be
  //    present in the source (or the summary). A non-common word of length >= 5 that is nowhere
  //    in either is a misspelling or an invented term — e.g. "Ofake" in "Ofake agreements".
  const lines = String(plainEnglish || "").split(/\n|•|·/).map((s) => s.trim()).filter(Boolean);
  const sumNoHyphen = norm(summary).replace(/,/g, "").replace(/-/g, "");
  for (const line of lines) {
    const m = line.match(/^([^:]{2,48}):/);
    if (!m) continue;
    const term = m[1].trim();
    for (const w of term.split(/\s+/)) {
      const wn = norm(w).replace(/-/g, "");
      if (wn.length < 5 || COMMON.has(wn) || !/[a-z]/.test(wn)) continue; // skip short/common/numeric
      if (!srcNoHyphen.includes(wn) && !sumNoHyphen.includes(wn)) {
        reasons.push(`Defined term "${term}" uses "${w}", which does not appear in the source (possible misspelling or invented term)`);
        break; // one reason per term
      }
    }
  }

  return { ok: reasons.length === 0, reasons, checked: true };
}

// ── Known-term normalization ────────────────────────────────────────────────
// Canonical spellings for industry terms the model occasionally garbles into a NEAR-miss. Applied
// before grounding so a correct term is KEPT (not dropped). Deliberately conservative: each pattern
// only rewrites an unambiguous variant of a real term — never a guess. A badly-mangled term that no
// pattern matches (e.g. "Ofake", which has lost its "ft") stays unfixed and is then dropped by the
// grounding filter rather than wrongly "corrected".
const TERM_FIXES = [
  [/\bof[-\s]?take\b/gi, "offtake"],                 // "of-take" / "of take" / "oftake" -> offtake
  [/\boff[-\s]take\b/gi, "offtake"],                 // "off-take" / "off take" -> offtake
  [/\bn\.?i\.?\s*43[-\s]?101\b/gi, "NI 43-101"],     // NI 43-101 variants
  [/\bpre[-\s]?feasibility\b/gi, "pre-feasibility"],
  [/\bag\s*eq\b/gi, "AgEq"], [/\bau\s*eq\b/gi, "AuEq"],
];
const applyTermFixes = (s) => TERM_FIXES.reduce((t, [re, to]) => t.replace(re, to), String(s || ""));

// Rebuild a plain_english_explanation keeping its bullet structure, fixing known terms, and
// DROPPING any definition whose significant term word is still ungrounded after fixing.
function sanitizeExplanation(pe, srcNoHyphen, sumNoHyphen) {
  const raw = String(pe || "");
  if (!raw.trim()) return { text: raw, dropped: [] };
  const hadBullets = /[\n•·]/.test(raw);
  const parts = raw.split(/\n|•|·/).map((s) => s.trim()).filter(Boolean);
  const kept = [], dropped = [];
  for (const part of parts) {
    const fixed = applyTermFixes(part);
    const m = fixed.match(/^([^:]{2,48}):/);
    let drop = false;
    if (m) {
      for (const w of m[1].trim().split(/\s+/)) {
        const wn = norm(w).replace(/-/g, "");
        if (wn.length < 5 || COMMON.has(wn) || !/[a-z]/.test(wn)) continue;
        if (!srcNoHyphen.includes(wn) && !sumNoHyphen.includes(wn)) { drop = true; break; }
      }
    }
    if (drop) dropped.push(fixed); else kept.push(fixed);
  }
  const text = hadBullets ? kept.map((k) => (k.startsWith("•") ? k : `• ${k}`)).join("\n") : kept.join(" ");
  return { text, dropped };
}

// Produce a PUBLISH-SAFE version of the generated fields for a hands-off (no human review) feed:
// correct known-term spellings, and remove the specific unverifiable pieces (ungrounded Key Numbers,
// garbled/invented definitions) so what ships is grounded in the source. Prose fields (summary,
// context) get only safe known-term spelling fixes — never sentence surgery. Returns the cleaned
// fields plus a report of what changed (stored on fact_check for auditing).
export function sanitizeNewsBrief({ keyNumbers = [], plainEnglish = "", summary = "", context = "" } = {}, sourceText = "") {
  const src = norm(sourceText);
  const srcNoCommas = src.replace(/,/g, "");
  const srcNoHyphen = srcNoCommas.replace(/-/g, "");
  const haveSource = src.length >= 120;
  const report = { droppedNumbers: [], droppedDefs: [], termFixed: false };

  // Prose: only safe known-term spelling fixes.
  const summaryFixed = applyTermFixes(summary);
  const contextFixed = applyTermFixes(context);
  if (summaryFixed !== String(summary || "") || contextFixed !== String(context || "")) report.termFixed = true;

  let keptNumbers = Array.isArray(keyNumbers) ? keyNumbers.slice() : [];
  let explanation = String(plainEnglish || "");

  if (haveSource) {
    // Drop Key Numbers that are not grounded in the source.
    keptNumbers = (Array.isArray(keyNumbers) ? keyNumbers : []).filter((k) => {
      const val = k && typeof k === "object" ? (k.value != null ? k.value : (k.v != null ? k.v : k.number)) : k;
      const toks = digitsOf(val).filter((d) => d.length >= 2);
      const ok = toks.every((d) => numberGrounded(d, srcNoCommas));
      if (!ok) report.droppedNumbers.push(String(val).slice(0, 48));
      return ok;
    });
    // Fix + drop definitions.
    const sumNoHyphen = norm(summaryFixed).replace(/,/g, "").replace(/-/g, "");
    const san = sanitizeExplanation(plainEnglish, srcNoHyphen, sumNoHyphen);
    explanation = san.text;
    report.droppedDefs = san.dropped;
  } else {
    explanation = applyTermFixes(plainEnglish); // no source to ground against — spelling fixes only
  }

  report.changed = report.droppedNumbers.length > 0 || report.droppedDefs.length > 0 || report.termFixed;
  return { key_numbers: keptNumbers, plain_english_explanation: explanation, mineex_summary: summaryFixed, context: contextFixed, report };
}
