// COMPILE-MAP — Phase 2 PREPARATION ONLY. Non-executing metadata.
//
// Declares, per Blueprint field/pool, HOW it would eventually compile back into the
// company data — the target, eligibility, value type, and merge behaviour. This module
// contains NO write path: nothing here mutates companies.profile. A future Phase 2
// compile step will READ this map to do the writing, behind an explicit, gated action.
//
// The critical rule this encodes (so publishing the iPad view can't move the app):
//   • Conference fields sourced from shared profile data (src:'profile') are READ-ONLY
//     here (target:'shared') — the Conference publish never writes them.
//   • Only conference-narration fields (src:'conference' or authored 'none') compile
//     into `profile.conference.*`, which only the booth reads.
//   • The Passport Blueprint is the only thing that may write shared profile fields,
//     and it never writes `conference`.

import { PASSPORT_TEMPLATE } from "./passportTemplate.js";
import { CONFERENCE_TEMPLATE } from "./conferenceTemplate.js";

const valueTypeOf = (def) => (def.layout && def.layout.maximumLines > 2 ? "text" : "string");

// Known non-scalar / special-cased Passport fields.
const PASSPORT_OVERRIDES = {
  "company.listings":      { valueType: "array",  merge: "replace" },
  "companyBrief.keyPoints":{ valueType: "array",  merge: "replace" },
  "companyBrief.sections": { valueType: "array",  merge: "replace" },
  "brand":                 { valueType: "object", merge: "shallowMerge" },
  "cardMedia":             { valueType: "object", merge: "shallowMerge" },
  "catalysts":             { valueType: "array",  merge: "replace" },
  "media":                 { valueType: "array",  merge: "replace" },
  "stageNow":              { valueType: "number", merge: "set" },
  // Never written by the Passport publish:
  "conference":  { eligible: false, readOnly: true, note: "owned by the Conference Blueprint — Passport publish never writes conference." },
  "importMeta":  { eligible: false, readOnly: true, note: "extraction/audit metadata — never compiled." },
};

export const PASSPORT_COMPILE_MAP = (() => {
  const map = {};
  PASSPORT_TEMPLATE.sections.forEach((s) => {
    if (s.pool) return;
    (s.fields || []).forEach((def) => {
      map[def.key] = {
        fieldKey: def.key, target: "profile", profilePath: def.path,
        eligible: true, readOnly: false, valueType: valueTypeOf(def), merge: "set",
        ...(PASSPORT_OVERRIDES[def.key] || {}),
      };
    });
  });
  // Repeatable areas — merge by stable identity, never wholesale-replace.
  map["__pool.projects"] = { pool: "projects", target: "profile.projects", eligible: true, valueType: "array", merge: "byKey", idRule: "key || id || name", note: "merge by stable project key; never wholesale-replace." };
  map["__pool.timeline"] = { pool: "timeline", target: "profile.timeline", eligible: true, valueType: "array", merge: "dedupeByDate", idRule: "id || date", note: "reuses the Passport timeline; dedupe by date; wording preserved verbatim." };
  map["__pool.team"]     = { pool: "team",     target: "profile.team",     eligible: true, valueType: "array", merge: "byId", idRule: "id || slug(name)", note: "MERGE BY MEMBER ID — must preserve existing photos (do NOT inherit the profileImport wholesale-team-replace bug)." };
  return map;
})();

export const CONFERENCE_COMPILE_MAP = (() => {
  const map = {};
  CONFERENCE_TEMPLATE.pages.forEach((pg) => {
    (pg.fields || []).forEach((def) => {
      if (def.src === "profile") {
        // Mirrors shared profile data → READ-ONLY from the conference side.
        map[def.key] = { fieldKey: def.key, target: "shared", sharedPath: def.path, eligible: false, readOnly: true, valueType: valueTypeOf(def), merge: "none", note: "shared profile data — read-only; only the Passport Blueprint may change it." };
      } else if (def.src === "conference") {
        // Narration already sourced from profile.conference → writes straight back.
        map[def.key] = { fieldKey: def.key, target: "conference", profilePath: `conference.${def.path}`, eligible: true, readOnly: false, valueType: valueTypeOf(def), merge: "set" };
      } else {
        // Authored conference-only content with no current source.
        map[def.key] = { fieldKey: def.key, target: "conference", profilePath: `conference.${def.key.replace(/\./g, "_")}`, eligible: true, readOnly: false, valueType: valueTypeOf(def), merge: "set", note: "authored conference-only field." };
      }
    });
  });
  const P = (pool, entry) => { map["__pool." + pool] = { pool, ...entry }; };
  P("highlights",  { target: "conference.highlights",             eligible: true,  merge: "selectedOrdered", note: "selected + ordered highlight records." });
  P("reasons",     { target: "conference.investmentCase",         eligible: true,  merge: "selectedOrdered" });
  P("milestones",  { target: "conference.featuredMilestoneDates", eligible: true,  merge: "selectedDates", readOnly: false, note: "writes only the SELECTED milestone dates; wording stays in the shared timeline (read-only)." });
  P("projects",    { target: "shared", eligible: false, readOnly: true, note: "projects owned by the Passport profile; conference references featuredProjectKey only." });
  P("leaders",     { target: "shared", eligible: false, readOnly: true, note: "team owned by the Passport profile." });
  P("results",     { target: "shared", eligible: false, readOnly: true, note: "drill results live in projects; conference selects/features them." });
  P("targets",     { target: "shared", eligible: false, readOnly: true });
  P("financings",  { target: "shared", eligible: false, readOnly: true });
  ["overviewVisuals", "jurisdictionVisuals", "assetVisuals", "resultVisuals", "capitalVisuals"].forEach((v) =>
    P(v, { target: "conference.images", eligible: true, merge: "byId", note: "approved visuals → conference image slots (URLs already flushed to Storage)." }));
  P("assays", { target: "conference", eligible: true, merge: "byId", note: "authored conference-only assay/QAQC records." });
  return map;
})();

// Human-readable rollup for the export package / docs.
export function compileMapSummary() {
  const count = (m) => {
    const vals = Object.values(m);
    return {
      total: vals.length,
      eligible: vals.filter((e) => e.eligible).length,
      readOnly: vals.filter((e) => e.readOnly).length,
      toConference: vals.filter((e) => String(e.target).startsWith("conference")).length,
      shared: vals.filter((e) => e.target === "shared").length,
      toProfile: vals.filter((e) => e.target === "profile" || String(e.target).startsWith("profile.")).length,
    };
  };
  return { passport: count(PASSPORT_COMPILE_MAP), conference: count(CONFERENCE_COMPILE_MAP), status: "non-executing draft (Phase 2 prep)" };
}
