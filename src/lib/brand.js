/* ============================================================
   MINEEX BRAND — one source of truth for the mark, the canonical
   public origin, and how a company's own logo is resolved.
   ------------------------------------------------------------
   Everything that puts MineEx's identity or a customer's identity
   on screen (portal shell, QR placards, share cards) reads it from
   here so the four surfaces cannot drift apart.
   ============================================================ */

/* ---------------------------------------------------------------- canonical origin */

// The public origin a SHARED or PRINTED link must point at.
//
// Never use window.location.origin for these: a QR generated from a Vercel preview
// deploy, a staging alias or localhost would be printed onto a banner pointing at a
// host that dies. mineex.ca is the brand domain and serves the app at /app.
export const CANONICAL_ORIGIN = "https://mineex.ca";

// The canonical public URL for a company's investor profile.
// `slug` is the ONLY input — a profile link is derived from the company's own slug and
// nothing else, so one company's placard can never address another's profile.
export function profileUrl(slug) {
  const s = String(slug || "").trim();
  return s ? `${CANONICAL_ORIGIN}/app?c=${encodeURIComponent(s)}` : "";
}

/* ---------------------------------------------------------------- the mark */

// The MineEx mark IS the core sample: a rounded column of four strata bands. Nothing
// else — no letterform. Geometry copied verbatim from assets/brand/mineex-core-sample.svg.
//
// (An earlier version used mineex-mark-ink.svg, which draws an "M" letterform beside the
// bands. That put a second M next to the "MineEx" wordmark, which is wrong: the icon is
// the core sample and the word supplies the name.)
export const MARK_W = 512;
export const MARK_H = 1706.6666666666667;
export const MARK_VIEWBOX = `0 0 ${MARK_W} ${MARK_H}`;
export const MARK_RATIO = MARK_W / MARK_H;          // ~0.3 — tall and slender
const MARK_RX = 120.88888888888889;
const BAND_H = MARK_H / 4;
export const MARK_STRATA = ["#7A4E33", "#C4633B", "#B6BCC3", "#D9A24C"];

// The mark's inner markup, as a string — usable inside any <svg> (React via
// dangerouslySetInnerHTML, or string-built SVG files for download).
// `id` namespaces the clipPath so several marks can share one document.
export function markInnerSvg(id = "mx") {
  const bands = MARK_STRATA.map(
    (c, i) => `<rect x="0" y="${i * BAND_H}" width="${MARK_W}" height="${BAND_H}" fill="${c}"/>`
  ).join("");
  return `<defs><clipPath id="${id}-c"><rect x="0" y="0" width="${MARK_W}" height="${MARK_H}" rx="${MARK_RX}"/></clipPath></defs>` +
         `<g clip-path="url(#${id}-c)">${bands}</g>`;
}

// A standalone <svg> string for the mark at a given ink HEIGHT in px.
export function markSvg(height = 32, id = "mx") {
  const w = Math.round(height * MARK_RATIO);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${height}" viewBox="${MARK_VIEWBOX}">${markInnerSvg(id)}</svg>`;
}

// Cap height of the system UI stack at weight 800 — the height of the "M" itself, which
// is less than the font size (that also covers ascender/descender room). The core sample
// is set to this so it matches the M exactly wherever the lockup is drawn.
export const CAP_HEIGHT = 0.7046;   // measured from the live stack at weight 800

// Optical overshoot for the core sample. Matching the M's cap height EXACTLY makes the
// sample read shorter than the M, for two measured reasons: the M's ink dips ~0.125px
// below the baseline, and the sample's rounded caps mean its full width only begins a
// corner-radius in from each end, so its visual extent is shorter than its box. Type
// designers overshoot round glyphs past flat ones for the same reason.
export const MARK_OVERSHOOT = 1.065;

/* ---------------------------------------------------------------- company identity */

// A company's own logo, wherever it happens to live on the row.
//
// The compiled `pp.AVATAR` is the value the investor app actually renders, so it is
// preferred; the raw brand object is the fallback for rows whose pp has not been
// compiled yet. Returns "" when the company has no logo — callers show a monogram.
export function companyLogo(company) {
  const p = (company && company.profile) || {};
  const pp = p.pp || {};
  const brand = p.brand || {};
  const c = p.company || {};
  const cBrand = c.brand || {};
  const pick = [pp.AVATAR, pp.LOGO, brand.avatar, brand.logo, cBrand.avatar, cBrand.logo, c.logo];
  for (const v of pick) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

// The logo to print on the QR placard. A company can upload a DEDICATED print logo
// (profile.brand.qrLogo) — the on-screen avatar is often small, cropped or a dark-on-dark
// variant that prints badly. Falls back to the profile logo, then to a monogram.
export function placardLogo(company) {
  const brand = ((company && company.profile) || {}).brand || {};
  const v = brand.qrLogo;
  if (typeof v === "string" && v.trim()) return v.trim();
  return companyLogo(company);
}

// Up-to-two-letter monogram for a company with no logo.
export function companyMonogram(company) {
  const name = String((company && (company.name || company.slug)) || "").trim();
  if (!name) return "?";
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase() || "?"
  );
}
