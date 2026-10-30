// SIX DESIGN FAMILIES.
//
// Each is a different way of organising a slide, not a different palette on
// one layout. They vary in where the eye lands first (a figure, a sentence, a
// rule, an edge), how type is scaled between levels, whether the surface is
// light or dark, and what graphic device carries the brand. A company picking
// between them is picking a visual argument, not a colour.
//
// A family is DATA. The renderer reads it; nothing here draws. That is what
// lets a slide's content survive a family change untouched.

export const CANVAS = { w: 1080, h: 1350 };   // Instagram 4:5

// Shared type stack. System faces only: the export path rasterises SVG through
// the browser, and a webfont that has not loaded would silently rasterise as
// something else -- a wrong-looking slide is worse than a plain one.
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
const MONO = "'SF Mono', 'Roboto Mono', Menlo, Consolas, monospace";

// NOTE: unit styles are never uppercased. "g/t Au", "AgEq", "koz" and "m" are
// notation; upper-casing them changes what they say.
export const FAMILIES = {
  // 1. Tall, quiet, editorial. Generous margins, one idea per slide, a hairline
  //    rule as the only furniture. Reads like a broadsheet standfirst.
  broadsheet: {
    // Editorial deck: a plate, a column of metrics, a captioned photo.
    prefers: { announcement: "editorial", keyResults: "stack", context: "half", why: "quote", closing: "stacked" },
    // Editorial: photography is a plate, inset and captioned by the margin.
    photo: "inset", numerals: "serifLining", airy: 1.15, accentUse: "marks",
    id: "broadsheet", label: "Broadsheet", blurb: "Editorial and quiet. Wide margins, serif headlines, a single hairline.",
    dark: false, bg: "#ffffff", fg: "#0f172a", muted: "#64748b", rule: "#e2e8f0",
    pad: 96, gap: 34,
    type: { eyebrow: { f: SANS, s: 26, w: 700, tr: 6, up: true }, title: { f: SERIF, s: 86, w: 600, lh: 1.08 },
            body: { f: SERIF, s: 38, w: 400, lh: 1.5 }, figure: { f: SERIF, s: 132, w: 600 },
            unit: { f: SANS, s: 24, w: 700 }, desc: { f: SANS, s: 28, w: 500, lh: 1.35 },
            meta: { f: SANS, s: 24, w: 600, tr: 2 } },
    device: "rule",            // hairline above the title
  },

  // 2. Dark, dense, data-first. The figure is the hero at display size; text
  //    is support. Built for releases whose news IS a number.
  obsidian: {
    // Terminal deck: poster headline, one dominant figure, image as ground.
    prefers: { announcement: "poster", keyResults: "monolith", context: "bleed", why: "panel", closing: "bar" },
    // Terminal: photography is darkened to a ground; numerals dominate.
    photo: "darken", numerals: "display", airy: 0.92, accentUse: "figures",
    id: "obsidian", label: "Obsidian", blurb: "Dark and data-led. Display figures, tight sans, high contrast.",
    dark: true, bg: "#0b1220", fg: "#f8fafc", muted: "#94a3b8", rule: "rgba(248,250,252,0.14)",
    pad: 88, gap: 30,
    type: { eyebrow: { f: SANS, s: 24, w: 800, tr: 8, up: true }, title: { f: SANS, s: 78, w: 800, lh: 1.06 },
            body: { f: SANS, s: 36, w: 400, lh: 1.5 }, figure: { f: SANS, s: 168, w: 800 },
            unit: { f: SANS, s: 26, w: 800 }, desc: { f: SANS, s: 28, w: 500, lh: 1.35 },
            meta: { f: MONO, s: 24, w: 500, tr: 1 } },
    device: "accentBar",       // thick accent bar anchoring the lower edge
  },

  // 3. Swiss grid. Everything hangs off a visible 12-column rhythm, flush left,
  //    nothing centred, numerals tabular. Austere on purpose.
  grid: {
    // Systematic deck: asymmetric opener, 2x2 metrics, split photo.
    prefers: { announcement: "sidebar", keyResults: "quadrant", context: "vertical", why: "centred", closing: "centred" },
    // Systematic: photography is cropped square to the column; nothing centred.
    photo: "square", numerals: "tabular", airy: 1.0, accentUse: "rules",
    id: "grid", label: "Grid", blurb: "Swiss and systematic. Flush left, visible grid, tabular numerals.",
    dark: false, bg: "#f5f6f8", fg: "#111418", muted: "#6b7280", rule: "#d6d9de",
    pad: 80, gap: 26,
    type: { eyebrow: { f: SANS, s: 22, w: 700, tr: 10, up: true }, title: { f: SANS, s: 72, w: 700, lh: 1.1 },
            body: { f: SANS, s: 34, w: 400, lh: 1.55 }, figure: { f: SANS, s: 140, w: 700 },
            unit: { f: SANS, s: 22, w: 700 }, desc: { f: SANS, s: 26, w: 500, lh: 1.35 },
            meta: { f: SANS, s: 22, w: 600, tr: 4 } },
    device: "grid",            // faint column rules
  },

  // 4. Core sample. A vertical accent column down the left edge, like a logged
  //    interval, with content indented past it. The one family with an overtly
  //    sector-native device -- and it carries no geological claim.
  core: {
    // Technical deck: logged metrics, specimen strip, sober close.
    prefers: { announcement: "editorial", keyResults: "ledger", context: "vertical", why: "quote", closing: "stacked" },
    // Technical: photography is a specimen strip; numerals read as a log.
    photo: "strip", numerals: "mono", airy: 1.0, accentUse: "column",
    id: "core", label: "Core", blurb: "A logged column down the edge. Industrial, sector-native, restrained.",
    dark: false, bg: "#ffffff", fg: "#15202b", muted: "#5b6b7c", rule: "#e3e8ee",
    pad: 92, gap: 30, inset: 56,
    type: { eyebrow: { f: MONO, s: 24, w: 600, tr: 5, up: true }, title: { f: SANS, s: 74, w: 700, lh: 1.09 },
            body: { f: SANS, s: 35, w: 400, lh: 1.5 }, figure: { f: SANS, s: 146, w: 700 },
            unit: { f: MONO, s: 24, w: 600 }, desc: { f: SANS, s: 27, w: 500, lh: 1.35 },
            meta: { f: MONO, s: 23, w: 500, tr: 2 } },
    device: "column",          // full-height accent column at the left edge
  },

  // 5. Warm, soft, approachable. Rounded surfaces, cards with lift, a paper
  //    tone. For companies who do not want to look like a terminal.
  paper: {
    // Warm deck: centred opener, a single banner figure, panelled quote.
    prefers: { announcement: "centred", keyResults: "banner", context: "half", why: "panel", closing: "centred" },
    // Warm: photography is rounded and lifted; numerals stay humane.
    photo: "rounded", numerals: "soft", airy: 1.2, accentUse: "panels",
    id: "paper", label: "Paper", blurb: "Warm and approachable. Rounded cards, soft shadow, paper tone.",
    dark: false, bg: "#faf7f2", fg: "#1f2328", muted: "#6f6a62", rule: "#e8e1d6",
    pad: 86, gap: 30, radius: 36,
    type: { eyebrow: { f: SANS, s: 24, w: 700, tr: 5, up: true }, title: { f: SANS, s: 72, w: 700, lh: 1.12 },
            body: { f: SANS, s: 35, w: 400, lh: 1.55 }, figure: { f: SANS, s: 136, w: 700 },
            unit: { f: SANS, s: 24, w: 700 }, desc: { f: SANS, s: 27, w: 500, lh: 1.35 },
            meta: { f: SANS, s: 23, w: 600, tr: 2 } },
    device: "card",            // content sits on a raised rounded card
  },

  // 6. Full-bleed edge. Content pinned to the bottom under a large field of
  //    colour or imagery; the headline fights for space with nothing.
  bleed: {
    // Cinematic deck: photography wherever it exists, type over it.
    prefers: { announcement: "bleed", keyResults: "banner", context: "bleed", why: "centred", closing: "bar" },
    // Cinematic: photography is the surface; type sits on it.
    photo: "bleed", numerals: "display", airy: 0.95, accentUse: "fields",
    id: "bleed", label: "Bleed", blurb: "Full-bleed field with content pinned low. Confident and photographic.",
    dark: true, bg: "#101418", fg: "#ffffff", muted: "rgba(255,255,255,0.72)", rule: "rgba(255,255,255,0.18)",
    pad: 84, gap: 28,
    type: { eyebrow: { f: SANS, s: 24, w: 800, tr: 7, up: true }, title: { f: SANS, s: 80, w: 800, lh: 1.05 },
            body: { f: SANS, s: 36, w: 400, lh: 1.5 }, figure: { f: SANS, s: 152, w: 800 },
            unit: { f: SANS, s: 25, w: 800 }, desc: { f: SANS, s: 28, w: 500, lh: 1.35 },
            meta: { f: SANS, s: 23, w: 600, tr: 2 } },
    device: "field",           // accent/image field occupying the upper two-thirds
  },
};

export const FAMILY_IDS = Object.keys(FAMILIES);
export const DEFAULT_FAMILY = "broadsheet";
// New drafts open on a premium system. Saved drafts keep whatever family they
// were saved with, premium or classic -- nothing is rewritten underneath them.
export const DEFAULT_PREMIUM_FAMILY = "premium:broadsheet";
export const familyOf = (id) => FAMILIES[id] || FAMILIES[DEFAULT_FAMILY];

// Which compositions a given slide may use. "Switch layout" offers only what
// suits that slide's content, which is what keeps this a design tool rather
// than a pile of controls.
export const LAYOUTS = {
  announcement: ["stacked", "centred", "lower"],
  keyResults: ["hero", "list", "pair"],
  context: ["image", "text", "split"],
  why: ["quote", "plain"],
  closing: ["logo", "tickers"],
};
