// src/aiBrief/historicalBrief.js — HISTORICAL / EXISTING-SUMMARY → BriefV1 mapping (Path A).
//
// Presentation-only, deterministic, NO AI and NO API calls. Maps the fields an existing
// press-release summary ALREADY has into the approved BriefV1 shape, VERBATIM — nothing is
// invented. Handles the two existing summary shapes:
//   • Company-timeline items:  whatHappened / why / takeaways[]            (PR_YEARS)
//   • Feed press-release objects: summaryLong (mineex_summary) / context / keyNumbers / watch
// Structured keyNumbers ({value,label}) become Key Results rows; free-text keyNumbers/takeaways
// become Highlights so the data is never lost. A Takeaway is mapped only when the source item
// already carries one (`watch`); it is never fabricated. Returns null when nothing is mappable
// (so the caller falls back to the existing reader). Category is left blank so badge logic is
// unchanged.
//
// Pure and import-safe (no React/DOM), so it is unit-testable on its own.

// Normalize one existing "key number" into either a structured Key Results row {v,desc} or a
// free-text highlight string. Existing summaries store these two ways:
//   • {value,label}  (feed/mock + ChatGPT prompt output)  → a Key Results row
//   • a plain string "446 g/t Ag over 28m"                → a highlight bullet
function splitKeyNumbers(keyNumbers) {
  const rows = [], highlights = [];
  for (const k of Array.isArray(keyNumbers) ? keyNumbers : []) {
    if (k && typeof k === "object") {
      const v = (k.v != null ? k.v : k.value);
      const desc = (k.desc != null ? k.desc : k.label) || "";
      if (v != null && String(v).trim()) rows.push({ v: String(v), desc: String(desc), u: k.u || "", rel: k.rel || "", sec: k.sec || "" });
      else if (String(desc).trim()) highlights.push(String(desc));
    } else if (k != null && String(k).trim()) {
      highlights.push(String(k));
    }
  }
  return { rows, highlights };
}

export function historicalToV2(item) {
  if (!item) return null;
  const wh = (item.whatHappened && String(item.whatHappened).trim()) ? item.whatHappened
    : (item.summaryLong && String(item.summaryLong).trim()) ? item.summaryLong
    : (item.mineex_summary && String(item.mineex_summary).trim()) ? item.mineex_summary
    : (item.label ? `${item.label}.` : "");
  const wy = (item.why && String(item.why).trim()) ? item.why
    : (item.context && String(item.context).trim()) ? item.context
    : "";
  const { rows: kr, highlights: knHighlights } = splitKeyNumbers(item.keyNumbers);
  const takeaways = Array.isArray(item.takeaways) ? item.takeaways.filter(Boolean).map(String) : [];
  // Highlights = free-text key numbers first, then any legacy takeaway bullets (deduped).
  const highlights = [...knHighlights, ...takeaways.filter((t) => !knHighlights.includes(t))];
  // A Takeaway is only ever carried over from an existing "what to watch next" field — never
  // fabricated from the headline (keeps the editorial rule: no forced Takeaways).
  const tk = (item.watch && String(item.watch).trim()) ? String(item.watch) : "";
  if (!String(wh).trim() && !String(wy).trim() && !kr.length && !highlights.length) return null;
  return {
    cat: "",                 // keep existing badge behaviour for historical items
    head: item.headline || item.originalTitle || item.originalHeadline || item.label || "",
    wh,                      // existing What Happened (whatHappened / summaryLong), verbatim
    wy,                      // existing Why It Matters (why / context), verbatim
    kr,                      // structured {value,label} key numbers → Key Results rows
    highlights,              // free-text key numbers / takeaways, VERBATIM — preserves the data
    ...(tk ? { tk } : {}),   // Takeaway only if the source already has a "watch next"
    _historical: true,       // marks a mapped (non-AI) Brief
  };
}
