// ppToProfile.js — the inverse of profileToPP's project mapping.
import { mapProfileToPP } from "./profileToPP.js";
//
// Phase 4B canonical-source migration: the portal ProfileEditor authors the rich investor
// data in COMPILED shape (pp.PROJECTS_FULL[key], via setProjectFull/setContent/setSnap/setCard).
// To make `profile.projects` the canonical source — so a later admin/extractor recompile
// (mapProfileToPP) reproduces the portal's edits instead of clobbering them — every save must
// also write the edits back into `profile.projects` SOURCE shape.
//
// `reverseProjectToSource` inverts `mapOneProject`. It is verified faithful by a
// pp -> source -> pp round-trip (see scratchpad/rtReverse.mjs): for real production data
// (Argenta, enCore, Kingsmen) mapProfileToPP(reverse(PF)).PROJECTS_FULL === PF, field-for-field.
//
// DATA-INTEGRITY NOTE: this never DROPS a project. `reconcileProjectsFromPP` merges reverse-mapped
// edits ONTO the existing source project (so source-only fields survive) and keeps projects that
// aren't in PROJECTS_FULL untouched (disabled / nameless projects the mapper filters out).

// Canonical snapshot label -> source key (inverse of profileToPP SNAP_MAP).
const SNAP_LABEL_TO_SRC = {
  "Location & Jurisdiction": "location",
  "Primary Commodity": "commodity",
  "Ownership": "ownership",
  "Land Package": "landPackage",
  "Deposit Type": "depositType",
  "Past Producer": "pastProducer",
};
// Per-project objects mapOneProject passes straight through — keep them so a recompile re-emits them.
const PASSTHROUGH = ["narrative", "resource", "economics", "production", "metallurgy", "infrastructure", "deposit", "drilling", "royalty"];
const DEFAULT_DRILL_MSG = "No drill results disclosed for this project yet.";

// One compiled PROJECTS_FULL[key] entry -> its `profile.projects[i]` source shape.
export function reverseProjectToSource(full) {
  if (!full || typeof full !== "object") return {};
  const src = { key: full.key, name: full.name };
  if (full.stageName != null) src.stageName = full.stageName;
  if (Number.isFinite(Number(full.stageIdx))) src.stageIdx = Number(full.stageIdx);
  if (full.status && full.status.label) src.tag = full.status.label;

  // snapshot cards -> snapshot:{ <srcKey>:{value,value2,detail,note} }
  const snapshot = {};
  (full.snap || []).forEach((s) => {
    const k = SNAP_LABEL_TO_SRC[s.label];
    if (!k) return;
    snapshot[k] = { value: s.value || "", value2: s.value2 || "", detail: s.detail || [], note: s.note || "" };
  });
  if (Object.keys(snapshot).length) src.snapshot = snapshot;

  // technical-intelligence cards -> district / geology / explorationHistory / drillResults
  (full.cards || []).forEach((c) => {
    if (c.kind === "map") src.district = { body: c.body || "", points: c.points || [] };
    else if (c.kind === "geology") src.geology = { body: c.body || "", points: c.points || [] };
    else if (c.kind === "history") src.explorationHistory = { body: c.body || "", timeline: c.timeline || [] };
    else if (c.kind === "drills") {
      // mapOneProject ALWAYS emits a drills card (empty = "pre-drilling"); only carry it back to
      // source when it holds real content, so an empty project gains no hollow passthrough on recompile.
      const hasRows = Array.isArray(c.rows) && c.rows.length;
      if (hasRows || (c.body && c.body.trim())) {
        src.drillResults = { body: c.body || "", rows: c.rows || [] };
        if (c.emptyMsg) src.drillResults.emptyMsg = c.emptyMsg;
      } else if (c.emptyMsg && c.emptyMsg !== DEFAULT_DRILL_MSG) {
        src.drillResults = { emptyMsg: c.emptyMsg }; // a custom pre-drill message is editable content
      }
    }
  });

  // sheet content -> stage / brief / unique / targets / scenarios (already canonical shapes)
  const ct = full.content || {};
  if (ct.stage) src.stage = { ...ct.stage };
  if (ct.brief) src.brief = { ...ct.brief };
  if (ct.unique) src.unique = { ...ct.unique };
  if (ct.targets) src.targets = { ...ct.targets };
  if (ct.scenarios) src.scenarios = { ...ct.scenarios };

  if (full.markers) src.markers = full.markers;
  if (full.gallery) src.gallery = full.gallery; // [{src}] — mapOneProject reads .src
  if (full.locationFull != null) src.locationFull = full.locationFull;
  PASSTHROUGH.forEach((k) => { if (full[k] != null) src[k] = full[k]; });
  return src;
}

// Merge the editor's compiled PROJECTS_FULL back onto the existing source list.
// - projects present in PROJECTS_FULL: reverse-mapped fields override, source-only fields kept.
// - projects NOT in PROJECTS_FULL (disabled/nameless, filtered out by mapProjects): kept untouched.
// - keys in PROJECTS_FULL with no existing source project (newly created in the editor): appended.
// Order follows the existing source, then any new keys — never resets or drops a project.
export function reconcileProjectsFromPP(existingProjects, PROJECTS_FULL) {
  const existing = Array.isArray(existingProjects) ? existingProjects : [];
  const PF = (PROJECTS_FULL && typeof PROJECTS_FULL === "object") ? PROJECTS_FULL : {};
  const keyOf = (p) => String((p && (p.key || p.id)) || "");
  const seen = new Set();
  const out = existing.map((base) => {
    const k = keyOf(base);
    if (k && PF[k]) { seen.add(k); return { ...base, ...reverseProjectToSource(PF[k]) }; }
    return base; // not represented in the rich editor — leave exactly as-is
  });
  Object.keys(PF).forEach((k) => { if (!seen.has(k)) out.push(reverseProjectToSource(PF[k])); });
  return out;
}

// The portal editor's canonical save transform (Phase 4B). Given the loaded profile and the
// editor's current compiled `pp`, produce the next profile to persist:
//   1. reverse-map pp.PROJECTS_FULL back onto profile.projects (canonical source),
//   2. recompile pp from that source, but SURGICALLY overlay ONLY the project-derived keys
//      (PROJECTS_FULL / PROJECTS_DATA[merged] / MAP_SITES / MAP_TOWN) onto the current pp —
//      every non-project pp field (COMPANY, ONE_LINER, LOGO, STATUS_IMG, BRAND, CONTACT,
//      CEO_NOTE, images from flushProfileAssets, admin-direct edits, …) is left exactly as-is.
// A full mapProfileToPP replace would regenerate those from possibly-stale source and destroy
// investor-visible data; the surgical overlay cannot. The reverse-map is round-trip-verified so
// the recompiled PROJECTS_FULL equals what the editor already shows. Exported (not inlined in
// ProfileEditor) so the exact same logic is exercised by the persisted-row validation tests.
export function buildCanonicalProfile(baseProfile, curPp) {
  const base = baseProfile || {};
  const pp = curPp || {};
  const projects = reconcileProjectsFromPP(base.projects, pp.PROJECTS_FULL || {});
  let recompiled;
  try { recompiled = mapProfileToPP({ ...base, projects }); }
  catch (_) { return { ...base, projects, pp }; } // never block a save on the mapper
  const mergedData = { ...(recompiled.PROJECTS_DATA || {}) };
  // Preserve legacy per-key PROJECTS_DATA fields the mapper doesn't emit (e.g. hand-edited stats/photos).
  Object.entries(pp.PROJECTS_DATA || {}).forEach(([k, v]) => { mergedData[k] = { ...(v || {}), ...(mergedData[k] || {}) }; });
  const nextPp = {
    ...pp,
    PROJECTS_FULL: recompiled.PROJECTS_FULL,
    PROJECTS_DATA: mergedData,
    MAP_SITES: recompiled.MAP_SITES,
    MAP_TOWN: recompiled.MAP_TOWN,
  };
  return { ...base, projects, pp: nextPp };
}
