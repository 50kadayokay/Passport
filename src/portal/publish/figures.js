// Figure checks shared by Mine IQ's answer checks (api/_mineiqGrounding.js)
// and the a06 profile suggestions (profileSuggestions.js). Pure. Lives here, not
// in api/, because the portal imports it and the dev server routes /api/* URLs
// to handlers.

// Numbers as people write them: 12.4, 1,250,000, 0.85, 2026. Comma grouping is
// stripped before comparison so "1,250,000" in the answer matches "1250000" in a
// source and vice versa -- that is formatting, not a different figure.
const NUM = /\d[\d,]*(?:\.\d+)?/g;

const normNum = (s) => String(s).replace(/,(?=\d{3}\b)/g, "").replace(/,$/, "").replace(/\.$/, "");

/** Figures in a text worth checking. Single digits are skipped: list numbers,
 *  days of the month and "2 releases" are noise, not disclosures. */
export function figuresIn(text) {
  const out = [];
  for (const m of String(text || "").matchAll(NUM)) {
    const n = normNum(m[0]);
    if (!/\d/.test(n)) continue;
    if (/^\d$/.test(n)) continue;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** The figures in `answer` that appear nowhere in `sourceText`. */
export function unsupportedFigures(answer, sourceText) {
  const have = new Set(figuresIn(sourceText));
  // A source written "12.40" supports an answer written "12.4" and the reverse;
  // trailing zeros after a decimal point are formatting.
  const trim = (n) => (n.includes(".") ? n.replace(/0+$/, "").replace(/\.$/, "") : n);
  const haveTrim = new Set([...have].map(trim));
  return figuresIn(answer).filter((n) => !have.has(n) && !haveTrim.has(trim(n)));
}
