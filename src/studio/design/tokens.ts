// The design system's fixed quantities.
//
// Everything here is absolute pixels on a 1080×1350 canvas. Nothing is relative,
// nothing is responsive: a slide is a printed page, not a web layout. That is what
// makes the output reproducible — the PNG export and the on-screen preview are the
// same numbers, so what you approve is what ships.

export const CANVAS = { w: 1080, h: 1350 } as const;

/**
 * Asymmetric margins. Optical, not mathematical: the eye reads a slightly larger
 * bottom margin as balanced, and social platforms crop the top edge more often
 * than the bottom. Centred margins are the single clearest tell of a template.
 */
export const MARGIN = { top: 84, right: 76, bottom: 104, left: 76 } as const;

export const COL_COUNT = 12;
export const GUTTER = 22;
export const CONTENT_W = CANVAS.w - MARGIN.left - MARGIN.right;
export const COL_W = (CONTENT_W - GUTTER * (COL_COUNT - 1)) / COL_COUNT;

/** x-position of a column edge, and the width spanning n columns. */
export const colX = (i: number) => MARGIN.left + i * (COL_W + GUTTER);
export const span = (n: number) => n * COL_W + (n - 1) * GUTTER;

/**
 * A deliberately non-linear type scale. The jump from `metric` to everything else
 * is what makes a number feel authored rather than merely large — a smooth
 * geometric ramp reads as a web page, not a page.
 */
export const TYPE = {
  metric: 208,
  metricSm: 132,
  display: 76,
  displaySm: 54,
  lead: 30,
  body: 21,
  caption: 16,
  label: 13.5,
  legal: 11.5,
} as const;

/**
 * Tracking moves opposite to size: large type tightens, small caps open up.
 * Getting this backwards is the most common reason big type looks amateur.
 */
export const TRACK = {
  metric: "-0.035em",
  display: "-0.022em",
  lead: "-0.011em",
  body: "0em",
  label: "0.115em",
} as const;

export const LEAD = { tight: 0.92, display: 1.06, lead: 1.34, body: 1.52 } as const;

/** A 12px baseline every vertical measure snaps to. */
export const BASELINE = 12;
export const snap = (v: number) => Math.round(v / BASELINE) * BASELINE;

/**
 * The vertical grid.
 *
 * Three zones, and every slide fills all three. Pinning content to a fixed top
 * offset and letting the rest of the page fall away is what made slides read as
 * empty rather than spacious: whitespace only feels composed when something holds
 * the other end of it. The foot is page furniture — a hairline, the issuer, the
 * slide count — the same device an annual report uses to make a mostly-empty page
 * still feel set.
 */
export const ZONE = {
  headTop: MARGIN.top,            // eyebrow row
  headRule: MARGIN.top + 30,      // hairline under it
  bodyTop: 244,                   // the idea lives here, optically centred
  bodyHeight: 852,                // → 1096
  footRule: 1160,
  footText: 1182,
} as const;
