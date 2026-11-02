// The Conference Mode template and theme catalogue, as the portal needs it.
//
// WHY THIS FILE EXISTS RATHER THAN AN IMPORT
// ------------------------------------------
// The authoritative lists live in aiBrief/conferenceV3/ConferenceV3.jsx, which
// exports TEMPLATE_LIST and THEME_LIST. Importing them here would be the
// obvious thing and is the wrong thing: that module is the booth, it builds to
// a 1.78 MB chunk, and the portal would pull all of it to render twenty-seven
// names. The alternative -- extracting a shared manifest -- means editing the
// booth, which is the one piece this work is not supposed to touch.
//
// So this is a copy, and a copy drifts. scripts/conference-catalog-check.mjs
// re-derives both lists from ConferenceV3.jsx and fails if they disagree, which
// turns a silent drift into a failing check. If the booth gains a template,
// that check tells you to add it here.

/* Named CONFERENCE_* rather than TEMPLATES/THEMES on purpose: those words
   appear as bare prose in the marketing components, and an export that generic
   made scripts/check-imports.mjs report them as unimported usages. A specific
   name also reads better at the call site. */

/** Every booth template, in the booth's own order. */
export const CONFERENCE_TEMPLATES = [
  { key: "monolith",   label: "Monolith" },
  { key: "terminal",   label: "Terminal" },
  { key: "terrain",    label: "Terrain" },
  { key: "expedition", label: "Expedition" },
  { key: "atlas",      label: "Atlas" },
  { key: "keynote",    label: "Keynote" },
  { key: "keynote2",   label: "Keynote II" },
  { key: "pulse",      label: "Pulse" },
  { key: "pulse2",     label: "Pulse II" },
  { key: "grid",       label: "Grid" },
  { key: "signal",     label: "Signal" },
  { key: "blueprint",  label: "Blueprint" },
  { key: "vein",       label: "Vein" },
  { key: "chronicle",  label: "Chronicle" },
  { key: "crucible",   label: "Crucible" },
  { key: "filament",   label: "Filament" },
  { key: "folio",      label: "Folio" },
  { key: "crimson",    label: "Crimson" },
  { key: "tableau",    label: "Tableau" },
  { key: "gyre",       label: "Gyre" },
  { key: "beacon",     label: "Beacon" },
  { key: "lattice",    label: "Lattice" },
  { key: "relay",      label: "Relay" },
  { key: "spectra",    label: "Spectra" },
  { key: "vista",      label: "Vista" },
  { key: "cirrus",     label: "Cirrus" },
  { key: "terminal2",  label: "Terminal II" },
];

/** Every booth theme. `tone` is for the portal's swatches only. */
export const CONFERENCE_THEMES = [
  { key: "obsidian",  label: "Obsidian",  tone: "#0B0F17" },
  { key: "meridian",  label: "Meridian",  tone: "#0E1A2B" },
  { key: "cellar",    label: "Cellar",    tone: "#1A1410" },
  { key: "pine",      label: "Pine",      tone: "#0D1A16" },
  { key: "amethyst",  label: "Amethyst",  tone: "#17101F" },
  { key: "graphite",  label: "Graphite",  tone: "#17191C" },
  { key: "porcelain", label: "Porcelain", tone: "#F2F3F5" },
  { key: "harbor",    label: "Harbor",    tone: "#0C1620" },
];

// What ConferenceV3Booth falls back to when a company has chosen nothing.
export const DEFAULTS = { template: "monolith", theme: "obsidian" };

export const templateLabel = (k) =>
  (CONFERENCE_TEMPLATES.find((t) => t.key === k) || {}).label || prettyKey(k);
export const themeLabel = (k) =>
  (CONFERENCE_THEMES.find((t) => t.key === k) || {}).label || prettyKey(k);
export const themeTone = (k) => (CONFERENCE_THEMES.find((t) => t.key === k) || {}).tone || "#0B0F17";

const prettyKey = (s) => String(s || "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
