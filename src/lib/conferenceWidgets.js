// ─────────────────────────────────────────────────────────────────────────────
// Conference Mode — shared widget candidate catalog
//
// One source of truth for the per-page "widget / badge" pools defined in the
// MineEx Conference Mode spec. Both the Conference Blueprint (admin review UI)
// and the booth renderer (ConferenceScenes) import this so the two never drift.
//
// The catalog itself is pure metadata: an ordered list of { key, label } per
// page. VALUES are resolved separately on each side (the Blueprint reads the raw
// profile; the renderer reads the mapped booth data), because the two consume
// different data shapes. What IS shared — and stored on the profile — is the
// reviewer's curation, in a conference-isolated layer:
//
//   conference.<page>Widgets      { [key]: "value" }   // AI-extracted OR manually entered
//   conference.<page>WidgetKeys   [ "key", ... ]        // which widgets show, in order
//
// These are FLAT, distinct keys per page (not nested under one object) on purpose:
// applyImport() shallow-merges `conference` one level deep, so a shared container
// would be clobbered pass-to-pass, whereas distinct keys each survive their own
// pass — matching how the spec keeps per-page conference objects separate.
//
// A widget's effective value = <page>Widgets[key] (explicit) ?? auto-resolved value.
// Deselecting a widget never deletes its underlying value — selection is just a
// view over the pool. When <page>WidgetKeys is absent, we fall back to "show
// every candidate that has a value" so nothing breaks for un-curated companies.
export const widgetsKey = (page) => `${page}Widgets`;
export const widgetKeysKey = (page) => `${page}WidgetKeys`;
// Reviewer-authored custom widgets (beyond the fixed pool): conference.<page>CustomWidgets is an
// array of { key, label }. Their values live in the same <page>Widgets map and they select/order
// through <page>WidgetKeys just like catalog widgets.
export const customWidgetsKey = (page) => `${page}CustomWidgets`;
// The effective candidate pool for a page = fixed catalog + any reviewer-added custom widgets.
export function widgetPool(pageKey, conf = {}) {
  const custom = conf && Array.isArray(conf[customWidgetsKey(pageKey)]) ? conf[customWidgetsKey(pageKey)] : [];
  return [...(CONF_WIDGET_POOLS[pageKey] || []), ...custom.filter((w) => w && w.key)];
}
// ─────────────────────────────────────────────────────────────────────────────

// Ordered candidate pools, verbatim from the spec's widget-priority lists.
export const CONF_WIDGET_POOLS = {
  // PAGE 1 — Company Overview (show ~6–8). "Do not include municipality."
  overview: [
    { key: "commodity", label: "Primary Commodity" },
    { key: "flagship", label: "Flagship Project" },
    { key: "stage", label: "Company Stage" },
    { key: "operationsLocation", label: "Operations Location" },
    { key: "jurisdiction", label: "Jurisdiction" },
    { key: "currentActivity", label: "Current Activity" },
    { key: "assets", label: "Number of Assets" },
    { key: "ownership", label: "Ownership" },
    { key: "landPackage", label: "Land Package" },
    { key: "headquarters", label: "Headquarters" },
  ],
  // PAGE 3 — Jurisdiction (show ~5–8). "Omit municipality entirely."
  jurisdiction: [
    { key: "country", label: "Country" },
    { key: "district", label: "Mining District" },
    { key: "mineralBelt", label: "Mineral Belt" },
    { key: "nearbyMines", label: "Nearby Producing Mines" },
    { key: "nearbyOperators", label: "Nearby Operators" },
    { key: "infrastructure", label: "Infrastructure" },
    { key: "permitting", label: "Permitting Status" },
    { key: "historicProduction", label: "Historic District Production" },
    { key: "regionalGeology", label: "Regional Geology" },
    { key: "provinceState", label: "Province / State / Territory" },
  ],
  // PAGE 4A — Portfolio Overview.
  portfolio: [
    { key: "flagship", label: "Flagship Project" },
    { key: "numProjects", label: "Number of Projects" },
    { key: "commodity", label: "Primary Commodity" },
    { key: "stage", label: "Portfolio Stage" },
    { key: "ownership", label: "Ownership" },
    { key: "landPackage", label: "Total Land Package" },
    { key: "jurisdiction", label: "Jurisdiction" },
    { key: "activePrograms", label: "Active Programs" },
  ],
  // PAGE 5 — Drill Results / Technical Results (exploration-stage pool).
  results: [
    { key: "bestResult", label: "Best Drill Result" },
    { key: "latestResult", label: "Latest Drill Result" },
    { key: "widestInterval", label: "Widest Significant Interval" },
    { key: "currentProgram", label: "Current Drill Program" },
    { key: "drillingStatus", label: "Drilling Status" },
    { key: "holesCompleted", label: "Holes Completed" },
    { key: "assaysPending", label: "Assays Pending" },
    { key: "openDirections", label: "Open Directions" },
    { key: "resourceStatus", label: "Resource Status" },
    { key: "nextProgram", label: "Next Work Program" },
  ],
  // INDIVIDUAL PROJECT — badges for one project's scene (curated per project, flagship first).
  // Stored per stable project key in conference.projectWidgets / projectWidgetKeys.
  project: [
    { key: "stage", label: "Stage" },
    { key: "status", label: "Active / Inactive" },
    { key: "commodity", label: "Commodity" },
    { key: "ownership", label: "Ownership" },
    { key: "location", label: "Location" },
    { key: "landPackage", label: "Land Package" },
    { key: "depositType", label: "Deposit Type" },
    { key: "brownfieldGreenfield", label: "Brownfield / Greenfield" },
    { key: "pastProducer", label: "Past Producer" },
    { key: "geologicalModel", label: "Geological Model" },
    { key: "currentProgram", label: "Current Program" },
    { key: "targets", label: "Targets" },
    { key: "latestUpdate", label: "Latest Update" },
    { key: "historicProduction", label: "Historic Production" },
  ],
  // CAPITAL — "Can they fund the plan?" (12 candidates).
  capital: [
    { key: "fundingStatus", label: "Funding Status" },
    { key: "cash", label: "Cash" },
    { key: "workingCapital", label: "Working Capital" },
    { key: "latestFinancing", label: "Latest Financing" },
    { key: "shares", label: "Shares Outstanding" },
    { key: "fd", label: "Fully Diluted Shares" },
    { key: "ownership", label: "Ownership" },
    { key: "strategicInvestors", label: "Strategic Investors" },
    { key: "warrants", label: "Warrants" },
    { key: "options", label: "Options" },
    { key: "debt", label: "Debt" },
    { key: "balanceSheetDate", label: "Balance Sheet Date" },
  ],
};

const _isEmpty = (v) =>
  v == null || v === "" || (Array.isArray(v) && v.filter((x) => x != null && x !== "").length === 0);

// Coerce any resolved value to a short display string (arrays → " · " joined).
export function widgetText(v) {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(widgetText).filter(Boolean).join(" · ");
  if (typeof v === "object") {
    const pick = [v.value, v.label, v.name, v.amount, v.v].filter((x) => x != null && x !== "");
    return (pick.length ? pick : Object.values(v)).map(widgetText).filter(Boolean).join(" · ");
  }
  return String(v);
}

// Resolve the ordered, display-ready widget list for a page.
//   pageKey  — key into CONF_WIDGET_POOLS
//   auto     — { [widgetKey]: autoResolvedValue } from the caller's own data shape
//   conf     — the whole conference object (reads conf.<pageKey>Widgets / <pageKey>WidgetKeys)
// Returns [{ key, label, value }] — already filtered to the selection (or, when no
// selection is stored, to every candidate that has a value) and ordered.
// Core: given a pool + a value store + a selection array, return the ordered display list.
function pickWidgets(pool, auto, store, selRaw) {
  const valueOf = (k) => { const explicit = store[k]; return _isEmpty(explicit) ? auto[k] : explicit; };
  const sel = Array.isArray(selRaw) ? selRaw : null;
  const byKey = Object.fromEntries(pool.map((w) => [w.key, w]));
  // Curated: honor the reviewer's chosen set + order. Un-curated: every candidate with a value.
  const ordered = sel ? sel.map((k) => byKey[k]).filter(Boolean) : pool.filter((w) => !_isEmpty(valueOf(w.key)));
  return ordered.map((w) => ({ key: w.key, label: w.label, value: valueOf(w.key) })).filter((w) => !_isEmpty(w.value));
}

export function resolveWidgets(pageKey, auto = {}, conf = {}) {
  return pickWidgets(widgetPool(pageKey, conf), auto, (conf && conf[widgetsKey(pageKey)]) || {}, conf && conf[widgetKeysKey(pageKey)]);
}

// Per-project widget resolution. Selections live in a conference-isolated layer keyed by the
// stable project key: conference.projectWidgets[projKey] (values) + projectWidgetKeys[projKey]
// (selection/order). Un-curated projects fall back to every project candidate that has a value.
export function resolveProjectWidgets(projKey, auto = {}, conf = {}) {
  const store = (conf && conf.projectWidgets && conf.projectWidgets[projKey]) || {};
  const sel = conf && conf.projectWidgetKeys && conf.projectWidgetKeys[projKey];
  return pickWidgets(CONF_WIDGET_POOLS.project || [], auto, store, sel);
}
