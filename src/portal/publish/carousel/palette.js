// Accents and grounds.
//
// A design family owns its own colour relationships -- which tone is the
// ground, which is the ink, which is the hairline that must stay only just
// visible. A company changing the background cannot be allowed to break
// those relationships, so a ground is not painted over the top of a slide:
// every colour the family drew is MOVED, keeping its distance from the ground
// and its hue, and flipping direction when the ground's polarity flips.
//
// The accent is never moved. It is the one colour the company chose, and a
// design that quietly shifted it would be lying about what it will export.

/* ---------------- colour maths ---------------- */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const hex3 = (h) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h);

export function hexToRgb(hex) {
  const h = hex3(String(hex).trim());
  const m = /^#([0-9a-f]{6})$/i.exec(h);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = ([r, g, b]) =>
  `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;

export function rgbToHsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  const l = (mx + mn) / 2;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === R ? ((G - B) / d + (G < B ? 6 : 0))
    : mx === G ? (B - R) / d + 2
      : (R - G) / d + 4;
  return [h / 6, s, l];
}
export function hslToRgb([h, s, l]) {
  if (!s) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    let T = t; if (T < 0) T += 1; if (T > 1) T -= 1;
    if (T < 1 / 6) return p + (q - p) * 6 * T;
    if (T < 1 / 2) return q;
    if (T < 2 / 3) return p + (q - p) * (2 / 3 - T) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const lightness = (hex) => { const rgb = hexToRgb(hex); return rgb ? rgbToHsl(rgb)[2] : 0.5; };

/** WCAG relative luminance, and the contrast ratio built from it. The move
 *  below is defined in these terms rather than in HSL lightness: two colours
 *  can share a lightness gap and read nothing alike, which is exactly how a
 *  warm family lost half its contrast when it moved onto white. */
export function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const a = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
export function contrastRatio(a, b) {
  const l1 = Math.max(luminance(a), luminance(b)), l2 = Math.min(luminance(a), luminance(b));
  return (l1 + 0.05) / (l2 + 0.05);
}

/* ---------------- the catalogue ---------------- */
// Five accents that hold up in print and on a phone: each is a deep,
// low-chroma pigment rather than a screen colour, so none of them fights the
// photography or reads as a default.
export const ACCENTS = [
  { id: "oxide",    label: "Oxide",    hex: "#B4472A", note: "Warm copper. Reads as earth and ore." },
  { id: "prussian", label: "Prussian", hex: "#1B3A5C", note: "Deep institutional blue. Quiet authority." },
  { id: "verdigris",label: "Verdigris",hex: "#1B4D3E", note: "Weathered green. Field and forest." },
  { id: "brass",    label: "Brass",    hex: "#7A5E25", note: "Muted gold. Precious without glitter." },
  { id: "garnet",   label: "Garnet",   hex: "#6E1F2E", note: "Dark red. Use sparingly, lands hard." },
];

// Five grounds, two light-warm, one light-cool, two dark. Any family can wear
// any of them; the ink moves to stay legible.
export const GROUNDS = [
  { id: "",         label: "Original", hex: "",        note: "The family's own ground." },
  { id: "paper",    label: "Paper",    hex: "#FFFFFF", note: "Pure white. Maximum contrast." },
  { id: "bone",     label: "Bone",     hex: "#F2EDE4", note: "Warm off-white. Softer on a feed." },
  { id: "mist",     label: "Mist",     hex: "#E7ECF1", note: "Cool pale grey. Clinical and calm." },
  { id: "graphite", label: "Graphite", hex: "#1C2026", note: "Soft dark. Dark without the void." },
  { id: "ink",      label: "Ink",      hex: "#0A0C0F", note: "Near black. Figures glow." },
];
export const groundHex = (id) => (GROUNDS.find((g) => g.id === id) || {}).hex || "";

/* ---------------- the move ---------------- */
/** Move one colour from the family's ground to the chosen one.
 *  Distance from the ground is preserved; direction follows the new ground's
 *  polarity, so ink on white becomes ink on black without going invisible. */
// A family's neutrals carry its TYPE: they must keep their separation from
// the ground or the words stop being readable. A family's saturated colours
// are its FURNITURE -- a banded footer, a plate, a rule in the house colour --
// and those are recognised by hue, not by contrast. Inverting one of those
// turns a deep teal band into a glowing cyan bar, which is how this first
// went wrong. Furniture therefore keeps its hue and its depth, and is nudged
// only far enough to stay visible against the new ground.
const CHROMA = 0.12;          // above this, a colour is a deliberate hue
const ON_FURNITURE = 2.0;     // type below this against the page sits on a panel
/** Chroma that does not lie at the ends of the scale. HSL saturation calls a
 *  pale blue-grey hairline "saturated"; the raw channel spread does not. */
const chromaOf = (hex) => { const [r, g, b] = hexToRgb(hex) || [0, 0, 0]; return (Math.max(r, g, b) - Math.min(r, g, b)) / 255; };
const FURNITURE_FLOOR = 2.2;  // a panel need only read as a distinct shape

export function moveColour(hex, fromGround, toGround, asInk = false) {
  const rgb = hexToRgb(hex);
  const from = hexToRgb(fromGround), to = hexToRgb(toGround);
  if (!rgb || !from || !to) return hex;
  if (fromGround.toLowerCase() === toGround.toLowerCase()) return hex;
  const target = contrastRatio(hex, fromGround);
  // The ground itself becomes the chosen ground exactly -- hue included.
  // TYPE REVERSED OUT ONTO FURNITURE. Cream type on a dark band has almost no
  // contrast with the page ground, because the page is not what it sits on.
  // Moving it against the page would destroy the only relationship that
  // matters, so it is left exactly as the family drew it -- and so is the
  // band underneath it.
  if (asInk && target < ON_FURNITURE) return hex;
  if (target < 1.04) return rgbToHex(to);
  const [h, s] = rgbToHsl(rgb);
  // Furniture: keep it exactly as drawn unless it has sunk into the ground.
  // Type is never furniture, whatever colour it is drawn in.
  if (!asInk && chromaOf(hex) > CHROMA && chromaOf(fromGround) <= CHROMA) {
    if (contrastRatio(hex, toGround) >= FURNITURE_FLOOR) return hex;
    return nudgeClear(hex, toGround, Math.min(target, FURNITURE_FLOOR));
  }
  // Away from the new ground: darker on a light ground, lighter on a dark one.
  const darker = luminance(toGround) > 0.18;
  const want = chromaOf(hex);
  const at = (l) => atLightness(h, s, l, want);
  // Contrast against a fixed ground is monotonic in lightness on each side of
  // it, so twenty bisections land within a rounding error of the ratio the
  // family drew -- which is the thing worth preserving, not the lightness.
  let lo = darker ? 0 : rgbToHsl(to)[2];
  let hi = darker ? rgbToHsl(to)[2] : 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(at(mid), toGround) > target) { if (darker) lo = mid; else hi = mid; }
    else if (darker) hi = mid; else lo = mid;
  }
  const out = at(clamp(darker ? lo : hi, 0, 1));
  // If the family asked for more separation than this ground can give, go as
  // far as the ground allows rather than silently landing mid-tone.
  return contrastRatio(out, toGround) + 0.15 < Math.min(target, contrastRatio(darker ? "#000000" : "#ffffff", toGround))
    ? (darker ? "#000000" : "#ffffff") : out;
}

/** Build a colour at a given lightness without letting it gain chroma.
 *  Holding HSL saturation while lightening inflates a deep teal into cyan, so
 *  saturation is pulled back until the channel spread matches what was drawn. */
function atLightness(h, s, l, wantChroma) {
  let sat = s;
  for (let k = 0; k < 14; k++) {
    const c = rgbToHex(hslToRgb([h, sat, l]));
    if (chromaOf(c) <= wantChroma * 1.06) return c;
    sat *= 0.86;
  }
  return rgbToHex(hslToRgb([h, sat, l]));
}

/** Move a colour the smallest distance that clears a contrast floor, keeping
 *  its hue and saturation. Used for furniture that has sunk into the ground. */
function nudgeClear(hex, ground, floor) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const up = luminance(ground) < luminance(hex);
  const want = chromaOf(hex);
  const at = (nl) => atLightness(h, s, nl, want);
  for (let i = 1; i <= 40; i++) {
    const nl = clamp(l + (up ? i : -i) * 0.0175, 0, 1);
    const c = at(nl);
    if (contrastRatio(c, ground) >= floor) return c;
    if (nl <= 0 || nl >= 1) break;
  }
  return at(up ? 0.82 : 0.18);
}

/** Recolour a whole slide's markup. The accent is left exactly as chosen, and
 *  image data is untouched because it never appears as a fill colour. */
export function recolourMarkup(markup, fromGround, toGround, keep = []) {
  if (!markup || !toGround || !fromGround) return markup;
  const spare = new Set(keep.filter(Boolean).map((c) => String(c).toLowerCase()));
  const moved = new Map();
  const forHex = (hex, asInk) => {
    const k = `${hex.toLowerCase()}|${asInk ? 1 : 0}`;
    if (spare.has(hex.toLowerCase())) return hex;
    if (!moved.has(k)) moved.set(k, moveColour(hex, fromGround, toGround, asInk));
    return moved.get(k);
  };
  const colours = (attrs, asInk) => attrs
    .replace(/#[0-9a-fA-F]{6}\b/g, (m) => forHex(m, asInk))
    // Families use translucent whites and blacks for hairlines and scrims.
    // Those are ground-relative too, so they move with everything else.
    .replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g, (m, r, g, b, a) => {
      const hex = rgbToHex([+r, +g, +b]);
      if (spare.has(hex.toLowerCase())) return m;
      const out = hexToRgb(forHex(hex, asInk));
      return `rgba(${out[0]}, ${out[1]}, ${out[2]}, ${a})`;
    });
  // WHICH RULE APPLIES IS DECIDED BY THE ELEMENT, not by the colour. A hue
  // used for type has to stay readable; the same hue used for a band is the
  // design's furniture and keeps its depth.
  return markup.replace(/<([a-zA-Z][\w-]*)\b([^>]*)>/g, (m, tag, attrs) =>
    `<${tag}${colours(attrs, tag === "text" || tag === "tspan")}>`);
}

/** The classic families describe themselves as a palette rather than markup,
 *  so they are moved at the descriptor instead. */
export function recolourFamily(fam, toGround) {
  if (!fam || !toGround) return fam;
  const from = fam.bg;
  const move = (c) => {
    if (!c) return c;
    if (/^#/.test(c)) return moveColour(c, from, toGround);
    const m = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/.exec(c);
    if (!m) return c;
    const out = hexToRgb(moveColour(rgbToHex([+m[1], +m[2], +m[3]]), from, toGround));
    return `rgba(${out[0]}, ${out[1]}, ${out[2]}, ${m[4]})`;
  };
  return { ...fam, bg: toGround, fg: move(fam.fg), muted: move(fam.muted), rule: move(fam.rule), dark: lightness(toGround) < 0.5 };
}

/** The ground a family painted for itself: the full-bleed rect every
 *  composition opens with. Read from the markup so no family has to declare
 *  it twice and drift. */
export function groundOf(markup) {
  const m = /<rect[^>]*\bwidth="1080"[^>]*\bheight="1350"[^>]*\bfill="(#[0-9a-fA-F]{6})"/.exec(markup || "");
  return m ? m[1] : "";
}
