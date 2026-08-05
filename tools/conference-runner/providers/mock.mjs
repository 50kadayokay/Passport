// Zero-cost provider that returns the prompt's own OUTPUT skeleton, lightly filled — so you can
// test the whole runner (grouping → validate → merge → report) without API keys or spend.

// The real skeleton is the LAST JSON object in the prompt's instruction half (guides contain small
// inline {…} examples, and the appended documents may contain braces too — so strip the docs
// section, then take the last balanced object).
function lastSkeleton(text) {
  const cut = String(text || "").split(/===\s*(?:COMPANY DOCUMENTS|DOCS)\s*===/)[0];
  let last = null, i = 0;
  while (i < cut.length) {
    const s = cut.indexOf("{", i);
    if (s < 0) break;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let j = s; j < cut.length; j++) {
      const c = cut[j];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; }
      else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end < 0) break;
    try { last = JSON.parse(cut.slice(s, end + 1)); } catch { /* skip malformed example */ }
    i = end + 1;
  }
  return last || {};
}

function fill(v) {
  if (v === "") return "[mock]";
  if (Array.isArray(v)) return v.length ? [fill(v[0])] : [];
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = fill(v[k]); return o; }
  return v; // keep nulls / example scalars as-is
}

export async function complete({ prompt }) {
  const text = JSON.stringify(fill(lastSkeleton(prompt)));
  return { text, usage: { inputTokens: Math.round((prompt || "").length / 4), outputTokens: Math.round(text.length / 4) }, model: "mock" };
}
