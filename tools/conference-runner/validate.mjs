// Pull one JSON object out of an LLM reply and check it against a bundle's expected shape.

// Extract the first balanced {...} object from a model reply (tolerates code fences / prose).
export function extractJson(text) {
  let t = String(text || "").trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  if (start < 0) throw new Error("no JSON object in output");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(t.slice(start, i + 1));
    }
  }
  throw new Error("unbalanced JSON in output");
}

function countFilled(v) {
  if (v == null || v === "") return 0;
  if (Array.isArray(v)) return v.reduce((n, x) => n + countFilled(x), 0);
  if (typeof v === "object") return Object.values(v).reduce((n, x) => n + countFilled(x), 0);
  return 1;
}

// Compare a produced payload to the bundle skeleton. `missingTop` is informational (a pass may
// legitimately omit a key it found no data for). A pass is "usable" if it parsed to an object
// and filled at least one leaf.
export function validateShape(payload, skeleton) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, usable: false, errors: ["output is not a JSON object"], missingTop: [], filled: 0 };
  }
  const missingTop = Object.keys(skeleton || {}).filter((k) => !(k in payload));
  const filled = countFilled(payload);
  return { ok: errors.length === 0, usable: filled > 0, errors, missingTop, filled };
}
