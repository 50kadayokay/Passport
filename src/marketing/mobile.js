// ─────────────────────────────────────────────────────────────────────────────
// Mobile design primitives.
//
// The marketing site was composed for a wide screen and, on a phone, that
// composition survived rather than being replaced: desktop whitespace ratios left
// huge dead bands, product renders landed in grid cells sized for two columns, and
// the nav kept a desktop-scale wordmark. These are the shared values a mobile
// composition is built from, so pages stop inventing their own.
//
// Desktop never reads this file. It is referenced only inside mobile branches and
// `@media (max-width: 860px)` blocks.
// ─────────────────────────────────────────────────────────────────────────────

// The one horizontal gutter. Everything on a phone lines up to this.
export const M_GUTTER = 22;

// Compact header. 64px of chrome on an 844px screen is 7.5% of the viewport before
// anything is said; 54 reads as deliberate and leaves the hero its room.
export const M_NAV_H = 54;

// Type scale. Fluid so a 430px phone gets a little more than a 390px one, with the
// ceiling chosen per role rather than one global shrink.
export const M_TYPE = {
  h1:      "clamp(40px, 11.6vw, 52px)",   // hero only
  h2:      "clamp(31px, 8.6vw, 39px)",    // major section headline
  h2Long:  "clamp(28px, 7.8vw, 35px)",    // long headlines that would otherwise wrap badly
  h3:      "clamp(20px, 5.2vw, 23px)",
  body:    "clamp(16.5px, 4.3vw, 18px)",
  bodySm:  "15.5px",
  eyebrow: "11.5px",
  cta:     "16px",
};

// Line-height and tracking that belong with the sizes above.
export const M_LEAD = { h1: 1.04, h2: 1.08, body: 1.5 };
export const M_TRACK = { h1: "-0.04em", h2: "-0.035em", eyebrow: "0.16em" };

// Vertical rhythm. A section is content-height; only a deliberate scene is viewport
// height. These are the gaps between the parts of one beat.
export const M_RHYTHM = {
  sectionY:   "clamp(52px, 13vw, 72px)",  // between sections
  eyebrowGap: 12,                          // eyebrow → headline
  headGap:    14,                          // headline → body
  mediaGap:   "clamp(24px, 6vw, 34px)",    // body → product visual
  ctaGap:     "clamp(20px, 5vw, 26px)",
};

// Product renders have to be readable. A phone screenshot below ~65% of the content
// width stops being a demonstration and becomes decoration.
export const M_MEDIA = { min: 0.65, target: 0.82, max: 0.92 };

// Touch targets. 44 is the floor, not the aim.
export const M_TAP = 44;

// The shared media query. One breakpoint, used everywhere, so "mobile" means the
// same thing in CSS as it does in useViewport() (which is < 760).
export const M_QUERY = "@media (max-width: 759px)";
