// Blueprint → profile COMPILE (Phase 2). Conference-only for now.
//
// PURE: takes the Blueprint data + the company's current profile, returns a NEW profile
// with ONLY `profile.conference` updated from the Blueprint (+ recompiled pp). Never
// mutates the input, never touches shared profile fields, never writes anything itself —
// the caller decides whether to preview (in-memory) or publish (persist).
//
// Isolation guarantee (see compileMap.js): only fields whose compile-map target is
// `conference.*` are written; `shared`/read-only fields are ignored, so the app's shared
// data (company, projects, timeline, capital) is left exactly as-is.

import { mapProfileToPP } from "../profileToPP.js";
import { CONFERENCE_COMPILE_MAP, PASSPORT_COMPILE_MAP } from "./compileMap.js";

const S = (x) => (x == null ? "" : String(x));
const isApproved = (f) => f && f.approvalStatus === "approved";
const valueOf = (f) => (f && f.rawValue != null && typeof f.rawValue === "object") ? f.rawValue : (f ? f.displayValue : "");
const nonEmpty = (v) => v != null && !(typeof v === "string" && v.trim() === "") && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);

// requireApproval=true  → publish (only approvalStatus:'approved' content compiles)
// requireApproval=false → preview (all selected/edited content, so the render is populated
//                          even mid-review while you iterate on layout)
export function compileConferenceBlueprint(data, profile, { requireApproval = true } = {}) {
  const p = profile || {};
  const conf = { ...(p.conference || {}) };   // preserve current conference (style/enabled/etc.)
  const written = [];
  const fields = data && data.fields ? data.fields : {};

  Object.values(CONFERENCE_COMPILE_MAP).forEach((entry) => {
    if (entry.pool || !entry.eligible || entry.readOnly) return;
    if (!String(entry.target).startsWith("conference")) return;  // conference-only; skip shared
    const f = fields[entry.fieldKey];
    if (!f) return;
    if (requireApproval && !isApproved(f)) return;
    const v = valueOf(f);
    if (!nonEmpty(v)) return;
    const key = String(entry.profilePath).replace(/^conference\./, "");
    conf[key] = v;
    written.push(`conference.${key}`);
  });

  const pool = (k) => ((data && data.pools && data.pools[k]) || [])
    .filter((r) => r.selected && (!requireApproval || r.approvalStatus === "approved"))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const hs = pool("highlights");
  if (hs.length) { conf.highlights = hs.map((r) => ({ value: S(r.values.number || r.values.headline), label: S(r.values.headline), context: S(r.values.supportingFact || r.values.whyItMatters) })); written.push(`conference.highlights (${hs.length})`); }
  const rs = pool("reasons");
  if (rs.length) { conf.investmentCase = rs.map((r) => ({ reason: S(r.values.headline), evidence: S(r.values.supportingFact), standsOutBecause: S(r.values.whyItMatters) })); written.push(`conference.investmentCase (${rs.length})`); }
  const ms = pool("milestones");
  if (ms.length) { conf.featuredMilestoneDates = ms.map((r) => S(r.values.date || r.id)); written.push(`conference.featuredMilestoneDates (${ms.length})`); }

  const nextProfile = { ...p, conference: conf };
  nextProfile.pp = mapProfileToPP(nextProfile);
  return { nextProfile, written };
}

// A human-readable dry-run diff: which conference keys change, old → new, plus a hard
// assertion that NO shared profile key changed (proof the app can't move).
export function conferenceCompileDiff(data, profile, opts) {
  const p = profile || {};
  const { nextProfile, written } = compileConferenceBlueprint(data, p, opts);
  const beforeConf = p.conference || {}, afterConf = nextProfile.conference || {};
  const keys = Array.from(new Set([...Object.keys(beforeConf), ...Object.keys(afterConf)]));
  const changes = [];
  keys.forEach((k) => {
    const a = JSON.stringify(beforeConf[k] ?? null), b = JSON.stringify(afterConf[k] ?? null);
    if (a !== b) changes.push({ key: `conference.${k}`, before: beforeConf[k], after: afterConf[k] });
  });
  // Prove nothing outside `conference`/`pp` changed.
  const sharedChanged = Object.keys(nextProfile).filter((k) => k !== "conference" && k !== "pp")
    .filter((k) => JSON.stringify(nextProfile[k]) !== JSON.stringify(p[k]));
  return { nextProfile, written, changes, sharedChanged };
}

// ============================================================================
// PASSPORT (app) compile — overlays approved Blueprint edits onto the existing
// profile, writing only shared profile fields. NEVER writes `conference` (readOnly
// in the compile-map), so publishing the app can't move the booth. Deep-clones the
// input; nothing here persists.
// ============================================================================
const PASSPORT_POOL_COLS = {
  projects: ["name", "stageName", "tag", "locationFull", "enabled"],
  timeline: ["date", "headline", "whyItMatters", "key"],
  team: ["name", "role", "short", "full", "enabled"],
};
const idOfFor = {
  projects: (x) => S(x.key || x.id || x.name),
  timeline: (x) => S(x.id || x.date || x.d),
  team: (x) => S(x.id || (x.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")),
};
function setDeep(obj, path, value) {
  const ks = String(path).split(".");
  let cur = obj;
  for (let i = 0; i < ks.length - 1; i++) { if (!cur[ks[i]] || typeof cur[ks[i]] !== "object" || Array.isArray(cur[ks[i]])) cur[ks[i]] = {}; cur = cur[ks[i]]; }
  cur[ks[ks.length - 1]] = value;
}

export function compilePassportBlueprint(data, profile, { requireApproval = true } = {}) {
  const p = JSON.parse(JSON.stringify(profile || {}));   // deep clone — safe to write nested
  const written = [];
  const fields = data && data.fields ? data.fields : {};

  Object.values(PASSPORT_COMPILE_MAP).forEach((entry) => {
    if (entry.pool || !entry.eligible || entry.readOnly || entry.target !== "profile") return;
    const f = fields[entry.fieldKey];
    if (!f) return;
    if (requireApproval && f.approvalStatus !== "approved") return;
    const v = (f.rawValue != null && typeof f.rawValue === "object") ? f.rawValue : f.displayValue;
    if (!nonEmpty(v)) return;
    setDeep(p, entry.profilePath, v);
    written.push(entry.profilePath);
  });

  // Pools — overlay editable scalar columns onto matching existing items (by stable id).
  // Never adds/removes items (the profile owns structure); preserves rich object data.
  ["projects", "timeline", "team"].forEach((pool) => {
    const recs = ((data && data.pools && data.pools[pool]) || []).filter((r) => !requireApproval || r.approvalStatus === "approved");
    if (!recs.length || !Array.isArray(p[pool])) return;
    const idx = new Map(p[pool].map((x, i) => [idOfFor[pool](x), i]));
    let n = 0;
    recs.forEach((r) => {
      const at = idx.get(S(r.id)); if (at == null) return;
      PASSPORT_POOL_COLS[pool].forEach((c) => { const val = (r.values || {})[c]; if (val !== undefined && val !== "") p[pool][at][c] = val; });
      n++;
    });
    if (n) written.push(`${pool} (${n})`);
  });

  p.pp = mapProfileToPP(p);
  return { nextProfile: p, written };
}

export function passportCompileDiff(data, profile, opts) {
  const p = profile || {};
  const { nextProfile, written } = compilePassportBlueprint(data, p, opts);
  const changes = [];
  const keys = Array.from(new Set([...Object.keys(p), ...Object.keys(nextProfile)]));
  keys.forEach((k) => { if (k === "pp") return; if (JSON.stringify(p[k] ?? null) !== JSON.stringify(nextProfile[k] ?? null)) changes.push(k); });
  const conferenceChanged = JSON.stringify(p.conference ?? null) !== JSON.stringify(nextProfile.conference ?? null);
  return { nextProfile, written, changes, conferenceChanged };
}
