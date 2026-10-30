// src/aiBrief/historicalBrief.js — HISTORICAL / EXISTING-SUMMARY → BriefV1 mapping (Path A).
//
// Presentation-only, deterministic, NO AI and NO API calls. Maps the fields an existing
// press-release summary ALREADY has into the approved BriefV1 (Kingsmen V2) shape, VERBATIM —
// nothing is invented. Handles the two stored summary shapes:
//   • Company-timeline items:  whatHappened / why / takeaways[] / whatHappensNext   (PR_YEARS)
//   • Feed press-release objects: summaryLong (mineex_summary) / context / keyNumbers / watch
//
// KEY RESULTS: the existing "key numbers" — whether stored as {value,label} objects or as curated
// strings like "446 g/t Ag over 28.0 m" or "C$0.80 per share" — are PARSED (deterministically) into
// the same structured metric rows Kingsmen uses: a large value, an optional unit, and a descriptor.
// Only strings that cleanly begin with a real numeric value become rows; anything else is preserved
// VERBATIM as a Highlight so no information is lost and nothing is fabricated. TAKEAWAY is carried
// from the release's own disclosed next step (whatHappensNext / watch) — never invented.
//
// Pure and import-safe (no React/DOM), so it is unit-testable on its own.

// Parse one curated "key number" STRING into a structured Key Results row {v, u, desc}, using ONLY
// the text given. Returns null when the string does not begin with a real numeric value (so the
// caller keeps it as a Highlight instead). Examples:
//   "446 g/t Ag over 28.0 m" -> { v:"446",  u:"g/t Ag", desc:"over 28.0 m" }
//   "120 m step-out"         -> { v:"120",  u:"m",      desc:"step-out" }
//   "C$0.80 per share"       -> { v:"C$0.80", u:"",     desc:"per share" }
//   "C$23,000,000"           -> { v:"C$23,000,000", u:"", desc:"" }
//   "20+ priority targets"   -> { v:"20+",  u:"",       desc:"priority targets" }
//   "Vein remains open"      -> null (no leading number)
const VALUE_RE = /^([~<>≈]?\s*(?:C\$|US\$|A\$|CA\$|\$|€|£)?\s*\d[\d,]*(?:\.\d+)?(?:[MBK])?(?:\s*%|\s*\+)?)(?:\s+(million|billion|bn|thousand))?/i;
const UNIT_RE = /^(g\/t(?:\s+[A-Za-z][A-Za-z]*(?:Eq)?)?|oz\/t|oz|ppm|%|metres?|meters?|m|km|Mt|Moz|koz|kt|kg|tonnes?\s+per\s+day|tonnes?|tpd|grams?|t|ha|Mlbs?|lbs?)\b/;
function parseKeyNumber(s) {
  const str = String(s == null ? "" : s).trim();
  if (!str) return null;
  const m = VALUE_RE.exec(str);
  if (!m) return null;
  let v = (m[1] + (m[2] ? " " + m[2] : "")).replace(/\s+/g, " ").trim();
  if (!/\d/.test(v)) return null;                 // must contain an actual digit
  let rest = str.slice(m[0].length).trim();
  let u = "";
  const um = UNIT_RE.exec(rest);
  if (um) { u = um[1].trim(); rest = rest.slice(um[0].length).trim(); }
  const desc = rest.replace(/^[-–—:·,\s]+/, "").trim();
  return { v, u, desc };
}

// Normalize any stored "key number" list into structured Key Results rows + leftover highlights.
// Accepts {value,label} / {v,desc} objects AND plain strings.
function splitKeyNumbers(keyNumbers) {
  const rows = [], highlights = [];
  for (const k of Array.isArray(keyNumbers) ? keyNumbers : []) {
    if (k && typeof k === "object") {
      const v = (k.v != null ? k.v : k.value);
      const label = String((k.desc != null ? k.desc : k.label) || "").trim();
      if (v != null && String(v).trim()) {
        // Sources commonly store the WHOLE figure in `value` ("98.56 g/t Au over 8.2 m",
        // "2,500 tonne per day") with the descriptor in `label`. Split the value into its leading
        // number + unit so the big blue value is just the number (never a long blob that overflows
        // and hides the label), and fold any remaining value text together with the label into the
        // descriptor. A value with no leading number (already a clean label-less row, or a pre-made
        // {v,u,desc}) is kept verbatim; the unit falls back to an explicit k.u.
        const parsed = parseKeyNumber(String(v));
        if (parsed) {
          const desc = [parsed.desc, label].filter(Boolean).join(" · ");
          rows.push({ v: parsed.v, u: parsed.u || String(k.u || "").trim(), desc, rel: k.rel || "", sec: k.sec || parsed.sec || "" });
        } else {
          rows.push({ v: String(v), u: k.u || "", desc: label, rel: k.rel || "", sec: k.sec || "" });
        }
      } else if (label) highlights.push(label);
    } else if (k != null && String(k).trim()) {
      const row = parseKeyNumber(k);                 // "446 g/t Ag over 28.0 m" -> structured row
      if (row) rows.push(row);
      else highlights.push(String(k).trim());         // non-numeric -> preserved verbatim
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
  // Key Results come from whichever of the stored lists this item carries: the timeline's
  // `takeaways` (curated key-number strings) and/or the feed's `keyNumbers`.
  const a = splitKeyNumbers(item.keyNumbers);
  const b = splitKeyNumbers(item.takeaways);
  const seen = new Set();
  const kr = [...a.rows, ...b.rows].filter((r) => { const key = `${r.v}|${r.u}|${r.desc}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const hs = new Set();
  const highlights = [...a.highlights, ...b.highlights].filter((h) => { if (hs.has(h)) return false; hs.add(h); return true; });
  // Takeaway: ONLY the release's own disclosed next step — never fabricated. Prefer the timeline's
  // whatHappensNext, then the feed's "watch". Omitted when neither exists.
  const tk = (item.whatHappensNext && String(item.whatHappensNext).trim()) ? String(item.whatHappensNext).trim()
    : (item.watch && String(item.watch).trim()) ? String(item.watch).trim()
    : "";
  if (!String(wh).trim() && !String(wy).trim() && !kr.length && !highlights.length) return null;
  return {
    cat: "",                 // keep existing badge behaviour for historical items
    head: item.headline || item.originalTitle || item.originalHeadline || item.label || "",
    wh,                      // existing What Happened (whatHappened / summaryLong), verbatim
    wy,                      // existing Why It Matters (why / context), verbatim
    kr,                      // structured Key Results rows parsed from the existing key numbers
    highlights,              // non-numeric key numbers, VERBATIM — preserves the data
    ...(tk ? { tk } : {}),   // Takeaway only when the source discloses a next step
    _historical: true,       // marks a mapped (non-AI) Brief
  };
}
