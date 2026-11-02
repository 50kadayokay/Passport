// Saved carousel configurations — a company's reusable LOOK.
//
// WHAT A CONFIGURATION IS NOT
// ---------------------------
// It carries no release content. No headline, no figure, no unit, no
// qualifier, no date, no image. Applying one to a new release must dress the
// NEW facts; a configuration that remembered last month's assay would print
// it under this month's headline, which is the worst thing this feature could
// do. `sanitise()` enforces that with a whitelist, not a promise.
//
// Company-scoped by key. Production storage (company_blueprints + a
// membership model) is a separate security review and is NOT implemented.

const KEY = (companyId) => `mineex.social.configs.${companyId || "none"}`;
const now = () => new Date().toISOString();
const uid = () => `cfg_${Math.random().toString(36).slice(2, 10)}`;

/** The ONLY fields a configuration may carry. */
export function sanitise(input = {}) {
  const layouts = {};
  Object.entries(input.layouts || {}).forEach(([k, v]) => { layouts[String(k)] = String(v == null ? "" : v); });
  return {
    id: String(input.id || uid()),
    name: String(input.name || "Untitled configuration").slice(0, 80),
    family: String(input.family || ""),
    layouts,                                   // slideId -> composition id
    order: Array.isArray(input.order) ? input.order.map(String) : [],
    accent: String(input.accent || ""),
    ground: String(input.ground || ""),           // "" = the family's own
    imageTreatment: String(input.imageTreatment || ""),
    isDefault: !!input.isDefault,
    createdAt: input.createdAt || now(),
    updatedAt: now(),
  };
}

const read = (companyId) => {
  try { const raw = JSON.parse(localStorage.getItem(KEY(companyId)) || "[]");
        return Array.isArray(raw) ? raw.map(sanitise) : []; } catch { return []; }
};
const write = (companyId, list) => {
  try { localStorage.setItem(KEY(companyId), JSON.stringify(list.map(sanitise))); } catch { /* preference only */ }
  return list;
};

export const listConfigs = (companyId) => read(companyId);
export const defaultConfig = (companyId) => read(companyId).find((c) => c.isDefault) || null;

export function saveConfig(companyId, config) {
  const clean = sanitise(config);
  const list = read(companyId);
  const i = list.findIndex((c) => c.id === clean.id);
  if (i >= 0) list[i] = clean; else list.push(clean);
  if (clean.isDefault) list.forEach((c) => { if (c.id !== clean.id) c.isDefault = false; });
  write(companyId, list);
  return clean;
}
export function renameConfig(companyId, id, name) {
  const list = read(companyId);
  const c = list.find((x) => x.id === id);
  if (c) { c.name = String(name || c.name).slice(0, 80); write(companyId, list); }
  return c || null;
}
export function duplicateConfig(companyId, id) {
  const src = read(companyId).find((x) => x.id === id);
  if (!src) return null;
  return saveConfig(companyId, { ...src, id: uid(), name: `${src.name} copy`, isDefault: false, createdAt: now() });
}
export function removeConfig(companyId, id) {
  write(companyId, read(companyId).filter((c) => c.id !== id));
}
export function setDefaultConfig(companyId, id) {
  const list = read(companyId);
  list.forEach((c) => { c.isDefault = c.id === id; });
  write(companyId, list);
}

/** Capture the CURRENT look as a configuration. Reads only design state. */
export const captureConfig = ({ name, family, accent, ground, slides = [], order = [] }) => sanitise({
  name, family, accent, ground,
  layouts: slides.reduce((m, s) => { m[s.id] = s.layout || ""; return m; }, {}),
  order: order.length ? order : slides.map((s) => s.id),
});

/** Dress THIS release in a saved look. Content is never touched. */
export function applyConfig(carousel, config) {
  if (!carousel || !config) return carousel;
  const slides = (carousel.slides || []).map((s) => ({ ...s, layout: config.layouts[s.id] != null ? config.layouts[s.id] : s.layout }));
  // Unknown or missing ids fall back to the deck's own order, so an older
  // configuration never drops or invents a slide.
  const known = slides.map((s) => s.id);
  const order = (config.order || []).filter((id) => known.includes(id));
  known.forEach((id) => { if (!order.includes(id)) order.push(id); });
  // The draft remembers WHICH configuration it is wearing. That is design
  // state, not content, so it rides along with the draft's own autosave
  // without touching a single field the release supplied.
  return { ...carousel, slides, order, configId: config.id, edited: true };
}

/** Rebuild kept the facts; keep the LOOK too.
 *  Refreshing from the summary writes new slides from the release. Slide ids
 *  are stable, so the design the company chose -- layouts, order and which
 *  configuration is in use -- carries across instead of snapping back to the
 *  factory arrangement and silently changing the export order. */
export function carryDesign(next, prev) {
  if (!next || !prev) return next;
  const was = {};
  (prev.slides || []).forEach((s) => { was[s.id] = s.layout || ""; });
  const slides = (next.slides || []).map((s) => (was[s.id] != null ? { ...s, layout: was[s.id] } : s));
  const known = slides.map((s) => s.id);
  const order = (prev.order || []).filter((id) => known.includes(id));
  known.forEach((id) => { if (!order.includes(id)) order.push(id); });
  return { ...next, slides, order, configId: prev.configId || "" };
}

/** The saved configuration this draft is currently wearing, if it still exists. */
export const activeConfig = (companyId, carousel) =>
  (carousel && carousel.configId && read(companyId).find((c) => c.id === carousel.configId)) || null;

/** A stable fingerprint of the DESIGN only -- what a configuration stores.
 *  Comparing it against a loaded configuration is how the editor knows there
 *  are unsaved *design* changes, which is a different thing from the draft's
 *  own autosave and must never be confused with it. */
export function designSignature({ family, accent, ground, slides = [], order = [] }) {
  const layouts = (slides || []).map((s) => `${s.id}:${s.layout || ""}`).sort().join("|");
  const ord = (order && order.length ? order : (slides || []).map((s) => s.id)).join(">");
  return `${family || ""}~${accent || ""}~${ground || ""}~${layouts}~${ord}`;
}
export const configSignature = (cfg) => cfg
  ? designSignature({ family: cfg.family, accent: cfg.accent, ground: cfg.ground,
      slides: Object.entries(cfg.layouts || {}).map(([id, layout]) => ({ id, layout })),
      order: cfg.order || [] })
  : "";

/** Render/export order. Falls back to deck order for older drafts. */
export function orderedSlides(carousel) {
  const slides = (carousel && carousel.slides) || [];
  const order = (carousel && carousel.order) || [];
  if (!order.length) return slides;
  const byId = new Map(slides.map((s) => [s.id, s]));
  const out = order.map((id) => byId.get(id)).filter(Boolean);
  slides.forEach((s) => { if (!out.includes(s)) out.push(s); });
  return out;
}

/** Advisory only -- never blocking. Reordering changes presentation, never
 *  which facts sit on which slide. */
export function orderWarnings(carousel) {
  const ids = orderedSlides(carousel).map((s) => s.id);
  const w = [];
  if (ids.length && ids[ids.length - 1] !== "closing" && ids.includes("closing"))
    w.push("The closing slide is not last — readers usually expect contact details at the end.");
  if (ids.indexOf("results") > -1 && ids.indexOf("announce") > -1 && ids.indexOf("results") < ids.indexOf("announce"))
    w.push("Key Results appear before the announcement, so the figures arrive without their headline.");
  return w;
}
