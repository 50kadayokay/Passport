// Three themes. Each is a set of CONSTRAINTS, not a skin.
//
// The rule every theme obeys: one ground, one ink, ONE accent. The accent may
// appear at most twice on a slide and never as a fill behind body text. Removing
// the option of a second colour is what keeps output disciplined when the source
// material is not.

export interface Theme {
  id: string;
  name: string;
  /** Page colour. */
  ground: string;
  /** Primary text. */
  ink: string;
  /** Secondary text and hairlines — always a tint of ink, never a new hue. */
  muted: string;
  /** Hairline rules. */
  rule: string;
  /** THE accent. One per theme. */
  accent: string;
  /** Ground used behind full-bleed imagery so photos share one tonal world. */
  imageGround: string;
  display: string;
  text: string;
  mono: string;
  /** How photography is graded so uneven source material reads as one set. */
  imageTreatment: { saturate: number; contrast: number; brightness: number };

  // ── What makes each theme a design SYSTEM rather than a palette ──────────
  /** Which face carries small labels. Mono reads as instrumentation. */
  labelFace: "text" | "mono";
  /** Which face carries the oversized figures. */
  metricFace: "display" | "text";
  metricWeight: number;
  /** Hairline weight. Technical drawings want a slightly heavier line. */
  ruleWeight: number;
  /** Does the underlying grid show as a drafting artefact? */
  showGrid: boolean;
  /** The generated background texture's character. */
  textureStyle: "contour" | "grain" | "grid";
  /** Ground/ink for the one or two inverted slides that give a deck its rhythm. */
  invertedGround: string;
  invertedInk: string;
  invertedMuted: string;
  /** Corner radius allowance. Editorial and Technical use none — squares, not cards. */
  radius: number;
}

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif";
const ARCHIVO = "'Archivo', 'Inter', -apple-system, 'Helvetica Neue', sans-serif";
const GROTESK = "'Space Grotesk', 'Inter', -apple-system, sans-serif";
const NEWSREADER = "'Newsreader', 'Iowan Old Style', Georgia, serif";
const FRAUNCES = "'Fraunces', 'Iowan Old Style', Georgia, serif";
const MONO = "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace";
const DIDONE = "'Playfair Display', 'Didot', 'Bodoni MT', Georgia, serif";

/**
 * EDITORIAL — warm paper, a high-contrast serif, one burnt accent. The hardest to
 * fake and the best test of whether the typography holds up on its own.
 */
export const editorial: Theme = {
  id: "editorial",
  name: "Editorial",
  ground: "#F6F4EF",
  ink: "#16181C",
  muted: "#6E7078",
  rule: "#DAD5CB",
  accent: "#A23A17",
  imageGround: "#E8E4DC",
  display: FRAUNCES,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.72, contrast: 1.06, brightness: 1.02 },
  labelFace: "text",
  metricFace: "display",
  metricWeight: 400,
  ruleWeight: 1,
  showGrid: false,
  textureStyle: "grain",
  invertedGround: "#16181C",
  invertedInk: "#F6F4EF",
  invertedMuted: "#9A9C9F",
  radius: 0,
};

/**
 * DARK PREMIUM — near-black, not black. A true #000 ground crushes core and rock
 * photography, which is where this material lives. The accent is a low-chroma
 * bronze; a saturated gold reads as crypto, not mining.
 */
export const darkPremium: Theme = {
  id: "dark-premium",
  name: "Dark Premium",
  ground: "#0B0C0E",
  ink: "#F2F0EC",
  muted: "#8B8F98",
  rule: "#24262B",
  accent: "#C08347",
  imageGround: "#141619",
  display: FRAUNCES,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.62, contrast: 1.12, brightness: 0.94 },
  labelFace: "text",
  metricFace: "display",
  metricWeight: 300,
  ruleWeight: 1,
  showGrid: false,
  textureStyle: "grain",
  invertedGround: "#F2F0EC",
  invertedInk: "#0B0C0E",
  invertedMuted: "#6B6F76",
  radius: 0,
};

/**
 * TECHNICAL — a drafting sheet. Monospace carries the labels, the accent is a
 * blueprint blue, and the grid is allowed to show. Suits sections, plan views and
 * resource tables, where the drawing is the subject.
 */
export const technical: Theme = {
  id: "technical",
  name: "Technical",
  ground: "#FBFBF9",
  ink: "#0E1116",
  muted: "#697180",
  rule: "#D8DDE4",
  accent: "#15618F",
  imageGround: "#EDF0F3",
  display: INTER,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.5, contrast: 1.1, brightness: 1.0 },
  labelFace: "mono",
  metricFace: "text",
  metricWeight: 600,
  ruleWeight: 1.25,
  showGrid: true,
  textureStyle: "contour",
  invertedGround: "#0E1116",
  invertedInk: "#FBFBF9",
  invertedMuted: "#8B94A2",
  radius: 0,
};

/**
 * SWISS — the International Style read straight: one tight grotesque, a visible
 * grid, and a single signal red used sparingly. No serif anywhere. Ruthless about
 * alignment, which is what makes the red land when it appears.
 */
export const swiss: Theme = {
  id: "swiss",
  name: "Swiss",
  ground: "#FFFFFF",
  ink: "#0A0A0A",
  muted: "#7A7A7A",
  rule: "#D6D6D6",
  accent: "#D2231F",
  imageGround: "#EDEDED",
  display: ARCHIVO,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.35, contrast: 1.14, brightness: 1.0 },
  labelFace: "text",
  metricFace: "text",
  metricWeight: 700,
  ruleWeight: 1.5,
  showGrid: true,
  textureStyle: "grid",
  invertedGround: "#0A0A0A",
  invertedInk: "#FFFFFF",
  invertedMuted: "#9A9A9A",
  radius: 0,
};

/**
 * BROADSHEET — a newspaper page. High-contrast serif, tight leading, heavy rules
 * doing the dividing rather than boxes or cards. Reads as reported, not marketed,
 * which suits results that should feel like fact rather than promotion.
 */
export const broadsheet: Theme = {
  id: "broadsheet",
  name: "Broadsheet",
  ground: "#FBFAF6",
  ink: "#111111",
  muted: "#5E5C57",
  rule: "#1A1A1A",
  accent: "#7A1F1F",
  imageGround: "#E4E1D8",
  display: NEWSREADER,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.18, contrast: 1.2, brightness: 1.02 },
  labelFace: "text",
  metricFace: "display",
  metricWeight: 400,
  ruleWeight: 2,
  showGrid: false,
  textureStyle: "grain",
  invertedGround: "#111111",
  invertedInk: "#FBFAF6",
  invertedMuted: "#9C9890",
  radius: 0,
};

/**
 * MONOLITH — near-black, one geometric sans, type at maximum scale and almost
 * nothing else. The most confident of the set and the least forgiving: with no
 * decoration to hide behind, the figures have to be worth the size.
 */
export const monolith: Theme = {
  id: "monolith",
  name: "Monolith",
  ground: "#08090A",
  ink: "#FFFFFF",
  muted: "#7E848C",
  rule: "#1E2126",
  accent: "#E8552F",
  imageGround: "#101215",
  display: GROTESK,
  text: GROTESK,
  mono: MONO,
  imageTreatment: { saturate: 0.4, contrast: 1.22, brightness: 0.88 },
  labelFace: "mono",
  metricFace: "display",
  metricWeight: 500,
  ruleWeight: 1,
  showGrid: false,
  textureStyle: "grain",
  invertedGround: "#FFFFFF",
  invertedInk: "#08090A",
  invertedMuted: "#6B7079",
  radius: 0,
};

/**
 * FIELD NOTES — the aesthetic of the logging sheet the data came from. Kraft
 * ground, monospace carrying the labels, olive accent. Utilitarian on purpose:
 * it makes technical content feel native rather than dressed up.
 */
export const fieldNotes: Theme = {
  id: "field-notes",
  name: "Field Notes",
  ground: "#EDE7D9",
  ink: "#221F1A",
  muted: "#6E675A",
  rule: "#C8BFA9",
  accent: "#5C6B3C",
  imageGround: "#DDD4C0",
  display: ARCHIVO,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.55, contrast: 1.04, brightness: 1.04 },
  labelFace: "mono",
  metricFace: "display",
  metricWeight: 700,
  ruleWeight: 1.25,
  showGrid: false,
  textureStyle: "contour",
  invertedGround: "#221F1A",
  invertedInk: "#EDE7D9",
  invertedMuted: "#918876",
  radius: 0,
};

/**
 * NOCTURNE — deep blue-black with a muted brass accent. The institutional end of
 * the range: what a fund's quarterly would look like if it were designed. Serif
 * display keeps it from reading as a tech deck.
 */
export const nocturne: Theme = {
  id: "nocturne",
  name: "Nocturne",
  ground: "#0B1020",
  ink: "#F0EEE9",
  muted: "#8892A6",
  rule: "#1E2740",
  accent: "#C2A15B",
  imageGround: "#131A2C",
  display: NEWSREADER,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.45, contrast: 1.1, brightness: 0.9 },
  labelFace: "text",
  metricFace: "display",
  metricWeight: 300,
  ruleWeight: 1,
  showGrid: false,
  textureStyle: "contour",
  invertedGround: "#F0EEE9",
  invertedInk: "#0B1020",
  invertedMuted: "#6B7385",
  radius: 0,
};

/**
 * OBSIDIAN — Monolith stripped further: true black, white type, and a cold steel
 * accent used almost nowhere. The discipline is the design; with no colour to
 * lean on, the only thing carrying the slide is the setting of the type.
 */
export const obsidian: Theme = {
  id: "obsidian",
  name: "Obsidian",
  ground: "#000000",
  ink: "#FFFFFF",
  muted: "#6E7378",
  rule: "#1A1C1E",
  accent: "#9FB3C8",
  imageGround: "#0A0B0C",
  display: GROTESK,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.22, contrast: 1.3, brightness: 0.82 },
  labelFace: "mono",
  metricFace: "display",
  metricWeight: 500,
  ruleWeight: 1,
  showGrid: false,
  textureStyle: "grain",
  invertedGround: "#FFFFFF",
  invertedInk: "#000000",
  invertedMuted: "#6E7378",
  radius: 0,
};

/**
 * SIGNAL — brutalist. Heavy grotesque at maximum weight and an acid accent that
 * is deliberately uncomfortable at scale, so it is rationed to one mark per
 * slide. Reads as an announcement rather than a report.
 */
export const signal: Theme = {
  id: "signal",
  name: "Signal",
  ground: "#0B0B0B",
  ink: "#F5F5F0",
  muted: "#77776F",
  rule: "#232320",
  accent: "#C8FF2E",
  imageGround: "#141412",
  display: ARCHIVO,
  text: ARCHIVO,
  mono: MONO,
  imageTreatment: { saturate: 0.3, contrast: 1.28, brightness: 0.84 },
  labelFace: "mono",
  metricFace: "text",
  metricWeight: 800,
  ruleWeight: 2,
  showGrid: false,
  textureStyle: "grid",
  invertedGround: "#C8FF2E",
  invertedInk: "#0B0B0B",
  invertedMuted: "#4A5A12",
  radius: 0,
};

/**
 * ULTRAMARINE — a blue-black ground with one electric blue. The accent sits close
 * enough to the ground in hue that it reads as light coming through the page
 * rather than ink laid on it.
 */
export const ultramarine: Theme = {
  id: "ultramarine",
  name: "Ultramarine",
  ground: "#060A18",
  ink: "#EEF1FF",
  muted: "#7C86A8",
  rule: "#161D33",
  accent: "#4B6BFF",
  imageGround: "#0C1226",
  display: GROTESK,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.5, contrast: 1.16, brightness: 0.86 },
  labelFace: "text",
  metricFace: "display",
  metricWeight: 500,
  ruleWeight: 1,
  showGrid: false,
  textureStyle: "contour",
  invertedGround: "#EEF1FF",
  invertedInk: "#060A18",
  invertedMuted: "#5B6480",
  radius: 0,
};

/**
 * BONE — Monolith's weight inverted onto paper. Same oversized geometric setting,
 * same restraint, but on a warm light ground: the option for a company whose
 * material has to print or sit on a white feed without shouting.
 */
export const bone: Theme = {
  id: "bone",
  name: "Bone",
  ground: "#F2F0EA",
  ink: "#101010",
  muted: "#6C6A64",
  rule: "#D6D2C8",
  accent: "#B4451F",
  imageGround: "#E2DED4",
  display: GROTESK,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.45, contrast: 1.12, brightness: 1.0 },
  labelFace: "mono",
  metricFace: "display",
  metricWeight: 600,
  ruleWeight: 1.5,
  showGrid: false,
  textureStyle: "grain",
  invertedGround: "#101010",
  invertedInk: "#F2F0EA",
  invertedMuted: "#8A867E",
  radius: 0,
};

/**
 * ATELIER — the fashion-magazine register. A high-contrast didone at large sizes,
 * hairline rules, wide-tracked small caps and a great deal of air. Nothing shouts;
 * the restraint is the statement. Suits a company that wants to look established
 * rather than exciting.
 */
export const atelier: Theme = {
  id: "atelier",
  name: "Atelier",
  ground: "#F4F1EC",
  ink: "#1A1A18",
  muted: "#8A857C",
  rule: "#C9C3B8",
  accent: "#8C6A3F",
  imageGround: "#E6E1D8",
  display: DIDONE,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.3, contrast: 1.06, brightness: 1.04 },
  labelFace: "text",
  metricFace: "display",
  metricWeight: 400,
  ruleWeight: 1,
  showGrid: false,
  textureStyle: "grain",
  invertedGround: "#1A1A18",
  invertedInk: "#F4F1EC",
  invertedMuted: "#9A9488",
  radius: 0,
};

/**
 * TERMINAL — everything set in monospace, phosphor on black. The one theme where
 * the type is the machine rather than the designer: assay tables, hole IDs and
 * coordinates all sit in their native form because nothing is proportional.
 */
export const terminal: Theme = {
  id: "terminal",
  name: "Terminal",
  ground: "#05070A",
  ink: "#D6F5DE",
  muted: "#4F7A5E",
  rule: "#12301E",
  accent: "#37E17B",
  imageGround: "#081109",
  display: MONO,
  text: MONO,
  mono: MONO,
  imageTreatment: { saturate: 0.2, contrast: 1.3, brightness: 0.8 },
  labelFace: "mono",
  metricFace: "display",
  metricWeight: 500,
  ruleWeight: 1,
  showGrid: true,
  textureStyle: "grid",
  invertedGround: "#D6F5DE",
  invertedInk: "#05070A",
  invertedMuted: "#4F7A5E",
  radius: 0,
};

/**
 * CYANOTYPE — a blueprint. Deep process blue with white line work, which is the
 * inverse of Technical rather than a restyling of it: the drawings read as
 * drafted rather than plotted, and the contour plate finally has a ground it
 * belongs on.
 */
export const cyanotype: Theme = {
  id: "cyanotype",
  name: "Cyanotype",
  ground: "#0B3A5D",
  ink: "#EAF4FB",
  muted: "#8FB4CE",
  rule: "#1D5580",
  accent: "#FFD166",
  imageGround: "#0E4468",
  display: ARCHIVO,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.25, contrast: 1.2, brightness: 0.92 },
  labelFace: "mono",
  metricFace: "text",
  metricWeight: 600,
  ruleWeight: 1.25,
  showGrid: true,
  textureStyle: "contour",
  invertedGround: "#EAF4FB",
  invertedInk: "#0B3A5D",
  invertedMuted: "#5C86A6",
  radius: 0,
};

/**
 * RISOGRAPH — two flat inks on warm stock. Deliberately slightly crude: the
 * accent is a spot colour rather than a highlight, and the grain keeps it from
 * looking digital. The most informal option in the set.
 */
export const risograph: Theme = {
  id: "risograph",
  name: "Risograph",
  ground: "#F3EAD8",
  ink: "#1F1B16",
  muted: "#7C7264",
  rule: "#D2C4A8",
  accent: "#C4361C",
  imageGround: "#E7D9BE",
  display: ARCHIVO,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.85, contrast: 1.18, brightness: 1.05 },
  labelFace: "mono",
  metricFace: "display",
  metricWeight: 800,
  ruleWeight: 2.5,
  showGrid: false,
  textureStyle: "grain",
  invertedGround: "#1F1B16",
  invertedInk: "#F3EAD8",
  invertedMuted: "#9A8E7C",
  radius: 0,
};

/**
 * PRIMARY — Bauhaus. Flat colour, geometric sans at heavy weights, thick rules
 * doing structural work. The loudest theme here, and the one that most obviously
 * is not a template: it looks authored because the shapes are doing the layout.
 */
export const primary: Theme = {
  id: "primary",
  name: "Primary",
  ground: "#F2F0EB",
  ink: "#111111",
  muted: "#6A6A66",
  rule: "#111111",
  accent: "#E63329",
  imageGround: "#E0DDD5",
  display: ARCHIVO,
  text: ARCHIVO,
  mono: MONO,
  imageTreatment: { saturate: 0.7, contrast: 1.16, brightness: 1.0 },
  labelFace: "text",
  metricFace: "display",
  metricWeight: 800,
  ruleWeight: 3,
  showGrid: false,
  textureStyle: "grid",
  invertedGround: "#132A8F",
  invertedInk: "#F2F0EB",
  invertedMuted: "#9DAAE0",
  radius: 0,
};

/**
 * LEDGER — the institutional register: navy, grey, a serif for figures and
 * tabular everything. Conservative on purpose. This is the theme for material
 * going to an institution rather than a feed.
 */
export const ledger: Theme = {
  id: "ledger",
  name: "Ledger",
  ground: "#FCFCFD",
  ink: "#16233C",
  muted: "#6B7689",
  rule: "#CBD3DF",
  accent: "#1B4C7E",
  imageGround: "#E8ECF2",
  display: NEWSREADER,
  text: INTER,
  mono: MONO,
  imageTreatment: { saturate: 0.4, contrast: 1.06, brightness: 1.0 },
  labelFace: "text",
  metricFace: "display",
  metricWeight: 400,
  ruleWeight: 1,
  showGrid: false,
  textureStyle: "contour",
  invertedGround: "#16233C",
  invertedInk: "#FCFCFD",
  invertedMuted: "#8A94A6",
  radius: 0,
};

export const THEMES: Theme[] = [
  editorial, broadsheet, atelier, ledger, swiss, primary,
  monolith, obsidian, signal, ultramarine, bone, darkPremium,
  technical, cyanotype, terminal, fieldNotes, risograph, nocturne,
];
export const getTheme = (id: string): Theme => THEMES.find((t) => t.id === id) || editorial;

/** sRGB relative luminance. */
function luminance([r, g, b]: number[]): number {
  const lin = (c: number) => { const v = (c as number) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r as number) + 0.7152 * lin(g as number) + 0.0722 * lin(b as number);
}

/** WCAG contrast ratio between two colours. */
function contrast(a: number[], b: number[]): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function parseHex(hex: string): number[] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m || !m[1]) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + ((b[i] as number) - v) * t);

/**
 * Admit a company's brand colour without letting it take over.
 *
 * Junior-mining brand colours are frequently fluorescent, or sit at a lightness
 * that vanishes into the theme ground. The brand gets the accent ROLE, but the
 * system keeps authority over chroma and contrast. Two passes, both measured
 * rather than eyeballed:
 *
 *   1. DESATURATE — pull toward the colour's own luminance-matched grey, scaled
 *      by how far chroma exceeds a tasteful ceiling. A fully fluorescent colour
 *      loses about half its chroma; a muted brand colour is untouched.
 *   2. CONTRAST — while the colour fails a 3.5:1 ratio against the ground, blend
 *      it toward ink or paper until it passes. This is a measurement, not a
 *      threshold I guessed at, so it holds for grounds this system doesn't have yet.
 *
 * The result is used as a rule, a figure, or a short line — never as a field
 * behind text, which no amount of correction would make comfortable to read.
 */
export function tameBrandColor(hex: string, theme: Theme): string {
  const rgb = parseHex(hex);
  const ground = parseHex(theme.ground);
  if (!rgb || !ground) return theme.accent;

  const inkTarget = parseHex(theme.ink) || [255, 255, 255];
  const groundIsDark = luminance(ground) < 0.5;
  // On a dark ground we lift toward the ink (light); on paper we deepen toward it.
  const pullTarget = groundIsDark ? inkTarget : [20, 22, 26];

  // 1) Desaturate proportionally to excess chroma.
  const max = Math.max(...rgb), min = Math.min(...rgb);
  const chroma = max === 0 ? 0 : (max - min) / max;
  const CHROMA_CEILING = 0.55;
  let out = rgb;
  if (chroma > CHROMA_CEILING) {
    const excess = Math.min(1, (chroma - CHROMA_CEILING) / (1 - CHROMA_CEILING));
    const l = luminance(rgb);
    const greyLevel = Math.round(Math.pow(l, 1 / 2.2) * 255);
    out = mix(out, [greyLevel, greyLevel, greyLevel], excess * 0.5);
  }

  // 2) Blend toward ink/paper until it clears 3.5:1 against the ground.
  const MIN_CONTRAST = 3.5;
  for (let step = 0; step < 20 && contrast(out, ground) < MIN_CONTRAST; step++) {
    out = mix(out, pullTarget, 0.08);
  }

  return toHex(out);
}
