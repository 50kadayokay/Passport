// The canonical shape of a V2 Key Result, and the normaliser that gets every
// legacy form there.
//
// THE DEFECT THIS FIXES
// ---------------------
// The audit found two incompatible representations of the same thing living in
// one application:
//
//   strings            what /api/structure-release returns ("2-4 short concrete
//                      facts/figures"), rendered as plain bullets on the
//                      company timeline.
//   { value, label }   what the news reader renders -- a figure on the left, a
//                      description on the right.
//
// Nothing converted between them. The timeline happened to work only because
// the release endpoint happened to emit strings; the moment it emitted the
// richer shape, `String({value,label})` would have put "[object Object]" on a
// public investor profile.
//
// CANONICAL: { value, label }. It is the richer of the two, it is what the
// approved V2 design renders, and a string collapses into it losslessly. The
// reverse is not true, which settles which direction normalisation goes.
//
// NORMALISE AT THE BOUNDARY, not at the point of use. Every consumer calls
// this, so there is one place where the legacy shape is understood and no
// renderer has to ask what it was handed.

/** "15.7 m @ 74 g/t AgEq" -> { value: "15.7 m @ 74 g/t AgEq", label: "" } */
function fromString(s) {
  const text = String(s == null ? "" : s).trim();
  if (!text) return null;

  // A great many legacy strings are already "figure — description" in one of a
  // few separators. Splitting them restores the two-column layout the V2 design
  // was built for, instead of dumping the whole line into the figure slot.
  // Conservative on purpose: only split when the left side reads like a figure,
  // or a prose sentence containing a dash would be torn in half.
  const m = text.match(/^(.{1,34}?)\s+[—–—:]\s+(.+)$/);
  if (m && /\d/.test(m[1])) return { value: m[1].trim(), label: m[2].trim() };

  return { value: text, label: "" };
}

function fromObject(o) {
  const value = String(o.value ?? o.figure ?? o.number ?? "").trim();
  const label = String(o.label ?? o.description ?? o.desc ?? o.unit ?? "").trim();
  if (!value && !label) return null;
  // An object carrying only a description is still a usable bullet.
  return value ? { value, label } : { value: label, label: "" };
}

/**
 * Normalise anything the pipeline has ever produced into canonical Key Results.
 * Never throws, never returns null entries, and always returns an array.
 */
export function normalizeKeyResults(input) {
  const list = Array.isArray(input) ? input : input == null ? [] : [input];
  return list
    .map((k) => {
      if (k == null) return null;
      if (typeof k === "string" || typeof k === "number") return fromString(k);
      if (typeof k === "object") return fromObject(k);
      return null;
    })
    .filter(Boolean);
}

/** Flatten back to display strings — for places that genuinely want one line. */
export const keyResultsToStrings = (input) =>
  normalizeKeyResults(input).map((k) => (k.label ? `${k.value} — ${k.label}` : k.value));

/** Does this set carry two-column data worth laying out as figure + description? */
export const hasLabelledResults = (input) => normalizeKeyResults(input).some((k) => !!k.label);
