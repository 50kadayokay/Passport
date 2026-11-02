// api/_briefValidate.js — deterministic BriefV1 validator (Phase 1B, modified Option 3).
//
// Does NOT trust the model's own evidence. It independently verifies grounding and
// classifies each Brief PASS / REVIEW / FAIL:
//   FAIL   — a factual error: a number is ungrounded (even after unit-equivalence), or a
//            Key Results figure is not attached to its own measurement context in the source.
//   REVIEW — everything factual checks out, but at least one supporting passage could not be
//            verified verbatim and no source span could be auto-extracted (human eyes needed).
//   PASS   — all numbers contextually grounded AND every claim is backed by a verbatim quote
//            or a deterministically auto-extracted verbatim source span.
// Pure, import-safe, no network.

const normText = (s) => String(s || "")
  .toLowerCase()
  .replace(/[   ]/g, " ")
  .replace(/[‐-―]/g, "-")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, " ")
  .trim();

const NUMRE = /\d[\d.,]*\d|\d/g;
const HOLE = /[a-z]{1,3}-?\d+-\d+/gi;                       // drill-hole ids e.g. LC-26-020
const stripHoles = (s) => String(s || "").replace(HOLE, " ");
const holeIds = (s) => (normText(s).match(/[a-z]{1,3}-?\d+-\d+/g) || []);
// numbers, with hole-id digit fragments removed so "LC-26-020" doesn't yield 26/020
const numTokens = (s) => (stripHoles(s).match(NUMRE) || []).map((x) => x.replace(/,/g, ""));
// trailing-zero-insensitive: 218.00 -> 218 so model padding doesn't break matching
const trimNum = (t) => t.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

// ---- measurement/unit classification (deterministic column-consistency checks) ----
const GRADE_UNIT = /(g\s*\/\s*t|g\s*\/\s*tonne|ppm|oz\s*\/\s*t|ageq|aueq|%)/i; // a grade/assay unit label
const LEN_IN_VALUE = /\d[\d.,]*\s*(k?m|metre|meter|metres|meters)\b/i;          // value is a length (e.g. "5.20 m", "16 km")
// descriptor enumerates a count of things ("samples > 500", "five targets"). "holes"/"intercepts"
// are excluded because they appear as singular LOCATION references ("hole LC-26-013") in grade rows.
const COUNT_NOUN = /\b(samples|targets)\b/i;
// a count value is a SMALL integer (2, 9, 14); a 3-4 digit number is a grade, not a count.
const SMALL_INT = (s) => /^\d{1,2}$/.test(String(s || "").replace(/[, ]/g, ""));
const ATTRIBUTED_HIST = /(previously reported|previous(ly)?|historic|prior\b|earlier|announced (on )?[a-z]+ \d|\b20\d\d\b)/i; // clear historical attribution

// Transaction-status: the source describes a conditional/staged deal (option / earn-in),
// but the Brief prose asserts a COMPLETED acquisition or outright ownership without saying so.
const SRC_CONDITIONAL = /\boption to acquire\b|\bacquire an option\b|\boption agreement\b|\bearn[-\s]?in\b|\bto earn (up to )?\d+\s*%|\bright to acquire\b/i;
const ASSERTS_OWNERSHIP = /\b(completed?|completes)\s+(the\s+)?acquisition\b|\bnow owns\b|\bhas acquired\b|\bacquired\s+(a\s+)?\d+\s*%|\bacquires?\s+(the\s+)?\d+\s*%/i;
const MENTIONS_CONDITIONAL = /\boption\b|\bearn[-\s]?in\b|\bto earn\b/i;

// A number is grounded if it (or its compacted integer part, or a km<->m equivalent with >=2
// significant digits) appears in the comma-stripped source. This is where "16,000 m" == "16 km".
function numberGrounded(tok, srcNoCommas) {
  const t = trimNum(String(tok).replace(/,/g, ""));
  if (srcNoCommas.includes(t)) return true;
  const intPart = t.split(".")[0];
  if (intPart.length >= 2 && srcNoCommas.includes(intPart)) return true; // compacted money (13.0M -> 13,000,000)
  const n = parseFloat(t);
  if (Number.isFinite(n) && n !== 0) {
    for (const alt of [n / 1000, n * 1000]) {           // km <-> m equivalence
      const whole = Math.round(alt);
      if (String(whole).replace("-", "").length >= 2 && srcNoCommas.includes(String(whole))) return true;
      if (alt % 1 !== 0 && srcNoCommas.includes(String(alt))) return true;
    }
  }
  return false;
}

// Do tokens a and b occur within `win` chars of each other anywhere in the source?
function coOccur(a, b, src, win = 90) {
  let idx = src.indexOf(a);
  while (idx >= 0) {
    const lo = Math.max(0, idx - win), hi = idx + a.length + win;
    if (src.slice(lo, hi).includes(b)) return true;
    idx = src.indexOf(a, idx + 1);
  }
  return false;
}

const verbatim = (quote, srcNorm) => { const nq = normText(quote); return nq.length >= 12 && srcNorm.includes(nq); };

// Distinctive tokens of a claim: numbers, drill-hole IDs, and content words (>= 6 chars).
function distinctiveTokens(s) {
  const t = normText(s);
  const nums = numTokens(s);
  const holes = (t.match(/[a-z]{1,3}-\d+-\d+/g) || []);
  const words = (t.match(/[a-z][a-z'-]{5,}/g) || []).filter((w) => !["company", "resources", "limited", "mineral", "project", "projects"].includes(w));
  return [...new Set([...nums, ...holes, ...words])];
}

// Deterministic span: can we find source text that supports this claim's distinctive tokens?
function supportingSpan(claim, srcNorm, srcNoCommas) {
  const toks = distinctiveTokens(claim);
  if (!toks.length) return { found: false, coverage: 0 };
  let hit = 0, anyNumberOrHole = false;
  for (const tk of toks) {
    const isNum = /^\d/.test(tk), isHole = /-\d+-\d+$/.test(tk);
    const present = (isNum ? numberGrounded(tk, srcNoCommas) : srcNorm.includes(tk));
    if (present) { hit++; if (isNum || isHole) anyNumberOrHole = true; }
  }
  const coverage = +(hit / toks.length).toFixed(2);
  // "reliable" = most distinctive tokens present AND at least one concrete anchor (number/hole id)
  return { found: coverage >= 0.6 && anyNumberOrHole, coverage };
}

export function validateBrief(brief, sourceText) {
  const srcNorm = normText(sourceText);
  const srcNoCommas = srcNorm.replace(/,/g, "");
  const factualErrors = [], evidenceIssues = [], notes = [];
  const kr = Array.isArray(brief.keyResults) ? brief.keyResults : [];

  // 1) KEY RESULTS — value grounded + attached to its own measurement context.
  kr.forEach((r, i) => {
    const label = `KR[${i}] "${r.value} ${r.unit}"`;
    const uStr = String(r.unit || ""), vStr = String(r.value || ""), dStr = String(r.descriptor || "");

    // 1a) MEASUREMENT / UNIT MISMATCH (deterministic) — the left column must be self-consistent.
    if (LEN_IN_VALUE.test(vStr) && GRADE_UNIT.test(uStr))
      factualErrors.push(`${label}: value is a length but the unit labels it a grade — put the grade in value and the interval in the descriptor`);
    else if (SMALL_INT(vStr) && GRADE_UNIT.test(uStr) && COUNT_NOUN.test(dStr))
      factualErrors.push(`${label}: value is a count (${dStr.match(COUNT_NOUN)[0]}) but the unit labels it a grade — unit should be 'Samples'/'Holes'/'Targets'`);

    // 1a') INCLUDING misuse — the first row can include nothing; a sub-interval must share the parent hole.
    if (r.rel === "INCLUDING" && i === 0)
      factualErrors.push(`${label}: the first Key Results row is marked INCLUDING, but there is no parent row above it for it to be included in`);
    if (r.rel === "INCLUDING" && i > 0) {
      const mine = holeIds(`${vStr} ${dStr} ${r.secondary || ""}`);
      const prev = kr[i - 1];
      const parent = holeIds(`${prev.value} ${prev.descriptor} ${prev.secondary || ""}`);
      if (mine.length && parent.length && !mine.some((h) => parent.includes(h)))
        factualErrors.push(`${label}: marked INCLUDING but its hole (${mine.join("/")}) differs from the parent row's (${parent.join("/")}) — a different hole cannot be an included sub-interval`);
    }

    // 1b) HISTORICAL displayed as a current Key Result (deterministic, from the model's own timeframe tag).
    if (r.timeframe === "historical") {
      if (ATTRIBUTED_HIST.test(dStr) || ATTRIBUTED_HIST.test(String(r.secondary || "")))
        notes.push(`${label}: historical result shown as a Key Result (attributed as context) — confirm it does not displace a current result`);
      else
        factualErrors.push(`${label}: a previously-reported/historical result is presented as a current Key Result without attribution — remove it or mark it clearly as prior context`);
    }

    // primary = a GROUNDED form of this row's value (prefer the display value, then the exact figure)
    const candidates = [...numTokens(r.value), ...numTokens(r.exactFigure)];
    if (!candidates.length) return;                       // label-only row (rare) — nothing to ground
    const prim = candidates.map(trimNum).find((t) => numberGrounded(t, srcNoCommas));
    if (!prim) { factualErrors.push(`${label}: value "${r.value}" not grounded in source`); return; }
    if (r.exactFigure && !numberGrounded(numTokens(r.exactFigure)[0] || "", srcNoCommas))
      notes.push(`${label}: exactFigure "${r.exactFigure}" not a verbatim source figure (keep the source's own figure/unit)`);

    // genuine CONTEXT anchors = interval numbers + drill-hole ids from descriptor/secondary
    const anchors = [...new Set([
      ...numTokens(r.descriptor), ...numTokens(r.secondary),
      ...holeIds(`${r.value} ${r.descriptor} ${r.secondary}`),
    ])].map((a) => (/-\d+/.test(a) ? a : trimNum(a))).filter((a) => a && a !== prim);
    // only cross-check when there IS a secondary measurement to attach to (grades w/ intervals, etc.)
    if (anchors.length) {
      const attached = anchors.some((a) => {
        const aIn = /[a-z]/.test(a) ? srcNorm.includes(a) : numberGrounded(a, srcNoCommas);
        return aIn && coOccur(prim, a.replace(/,/g, ""), srcNoCommas, 120);
      });
      if (!attached) factualErrors.push(`${label}: figure ${prim} not co-located with its interval/hole (${anchors.join("/")}) in source`);
    }

    if (r.evidenceQuote && !verbatim(r.evidenceQuote, srcNorm)) {
      const span = supportingSpan([prim, ...anchors].join(" ") + " " + r.descriptor, srcNorm, srcNoCommas);
      if (span.found) notes.push(`${label}: model quote paraphrased; verbatim source span auto-verified`);
      else evidenceIssues.push(`${label}: evidence not verbatim and no source span found`);
    }
  });

  // 2) NARRATIVE numbers must be grounded (headline / whatHappened / whyItMatters / takeaway).
  for (const [f, txt] of [["headline", brief.headline], ["whatHappened", brief.whatHappened], ["whyItMatters", brief.whyItMatters], ["takeaway", brief.takeaway]]) {
    for (const t of [...new Set(numTokens(txt))].filter((x) => x.length >= 2)) {
      if (!numberGrounded(t, srcNoCommas)) factualErrors.push(`${f}: number ${t} not grounded in source`);
    }
  }

  // 2b) TRANSACTION STATUS — don't present an option/earn-in as a completed acquisition/ownership.
  if (SRC_CONDITIONAL.test(srcNorm)) {
    for (const [f, txt] of [["headline", brief.headline], ["whatHappened", brief.whatHappened]]) {
      const t = String(txt || "");
      if (ASSERTS_OWNERSHIP.test(t) && !MENTIONS_CONDITIONAL.test(t))
        factualErrors.push(`${f}: asserts a completed acquisition/ownership, but the source describes an option/earn-in — say the company 'options' or 'acquires an option to earn' the interest, not that it acquired/owns the project`);
    }
  }

  // 3) NARRATIVE evidence — verbatim, else deterministically span-verified, else REVIEW.
  const fieldText = { headline: brief.headline, whatHappened: brief.whatHappened, whyItMatters: brief.whyItMatters, takeaway: brief.takeaway };
  (Array.isArray(brief.evidence) ? brief.evidence : []).forEach((e, i) => {
    if (!e) return;
    // An evidence entry for an OMITTED field (the field has no text AND no claim/quote) carries no
    // claim to verify — skip it. This does NOT relax evidence for any field that was actually used.
    const omitted = e.field && Object.prototype.hasOwnProperty.call(fieldText, e.field) && !String(fieldText[e.field] || "").trim();
    if (omitted && !String(e.claim || "").trim() && !String(e.quote || "").trim()) return;
    if (!e.quote) { evidenceIssues.push(`evidence[${i}] (${e.field}): missing quote`); return; }
    if (verbatim(e.quote, srcNorm)) return;
    const span = supportingSpan(e.claim || e.quote, srcNorm, srcNoCommas);
    if (span.found) notes.push(`evidence[${i}] (${e.field}): model quote paraphrased; verbatim source span auto-verified (coverage ${span.coverage})`);
    else evidenceIssues.push(`evidence[${i}] (${e.field}): not verbatim and no supporting source span (coverage ${span.coverage}) — needs review`);
  });

  // 4) Compaction (soft warning only).
  kr.forEach((r, i) => {
    const digits = String(r.value || "").replace(/[^0-9]/g, "");
    if ((digits.length >= 7 || /[MK]\b/.test(String(r.value || ""))) && !String(r.exactFigure || "").trim())
      notes.push(`KR[${i}] ${r.value}: compact/large value without exactFigure`);
  });

  const status = factualErrors.length ? "FAIL" : (evidenceIssues.length ? "REVIEW" : "PASS");
  return { status, factualErrors, evidenceIssues, notes };
}
