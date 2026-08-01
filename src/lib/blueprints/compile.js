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
import { CONFERENCE_COMPILE_MAP } from "./compileMap.js";

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
