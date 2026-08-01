// Generate the real Argenta Blueprint package from its LIVE profile (read-only).
// Fetches the published Argenta profile via the anon key, runs the pure projections,
// and writes the export package + reports. Proves the projection is non-mutating by
// fingerprinting the source profile before/after.
//
//   node scripts/gen-argenta-package.mjs <outDir>

import { writeFileSync } from "node:fs";
import projectPassport from "../src/lib/blueprints/projectProfileToPassportBlueprint.js";
import projectConference from "../src/lib/blueprints/projectProfileToConferenceBlueprint.js";
import { PASSPORT_TEMPLATE } from "../src/lib/blueprints/passportTemplate.js";
import { CONFERENCE_TEMPLATE, CONFERENCE_FIELD_COUNT, CONFERENCE_POOL_COUNT } from "../src/lib/blueprints/conferenceTemplate.js";
import { fingerprint, IS_MISSING } from "../src/lib/blueprints/types.js";

const OUT = process.argv[2] || ".";
const SB = process.env.VITE_SUPABASE_URL || "https://rvptronniomlqumjhyrr.supabase.co";
const KEY = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_NNxikHZSGZ0CYnzN7jckLg_vPvrRCTl";
const w = (name, obj) => { const p = `${OUT}/${name}`; writeFileSync(p, JSON.stringify(obj, null, 2)); console.log("  wrote", p); };

const missing = (data) => {
  const by = {}; const list = [];
  Object.values(data.fields || {}).forEach((f) => { if (IS_MISSING.has(f.status)) { by[f.status] = (by[f.status] || 0) + 1; list.push({ fieldKey: f.fieldKey, status: f.status, required: f.required }); } });
  return { total: list.length, byReason: by, fields: list };
};
// A projection gap = a template field whose src has no current profile source ('none').
const gaps = (pages) => {
  const out = [];
  pages.forEach((pg) => (pg.fields || []).forEach((f) => { if (f.src === "none") out.push({ page: pg.key, fieldKey: f.key, label: f.label, group: f.group }); }));
  return out;
};

const res = await fetch(`${SB}/rest/v1/companies?slug=eq.argenta-silver-corp&select=profile`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
const rows = await res.json();
if (!rows || !rows[0] || !rows[0].profile) { console.error("Could not fetch Argenta profile:", JSON.stringify(rows).slice(0, 200)); process.exit(1); }
const profile = rows[0].profile;

// Baseline BEFORE projection.
const fpProfileBefore = fingerprint(profile);
const fpPpBefore = fingerprint(profile.pp || {});

const passport = projectPassport(profile);
const conference = projectConference(profile);

// Prove non-mutation.
const fpProfileAfter = fingerprint(profile);
const fpPpAfter = fingerprint(profile.pp || {});
const unchanged = fpProfileBefore === fpProfileAfter && fpPpBefore === fpPpAfter;

w("argenta-passport-blueprint.json", passport);
w("argenta-conference-blueprint.json", conference);
w("passport-template.json", { key: PASSPORT_TEMPLATE.key, version: PASSPORT_TEMPLATE.version, sections: PASSPORT_TEMPLATE.sections, projectFields: PASSPORT_TEMPLATE.projectFields, timelineFields: PASSPORT_TEMPLATE.timelineFields, teamFields: PASSPORT_TEMPLATE.teamFields });
w("conference-template.json", { key: CONFERENCE_TEMPLATE.key, version: CONFERENCE_TEMPLATE.version, fieldCount: CONFERENCE_FIELD_COUNT, poolCount: CONFERENCE_POOL_COUNT, pages: CONFERENCE_TEMPLATE.pages, pools: CONFERENCE_TEMPLATE.pools, pageOrder: CONFERENCE_TEMPLATE.pageOrder });
w("argenta-passport-missing.json", missing(passport));
w("argenta-conference-missing.json", missing(conference));
w("argenta-projection-gaps.json", { note: "Template fields with no current profile source (src='none') — these need extraction or authoring.", conference: gaps(CONFERENCE_TEMPLATE.pages) });

console.log("\nSUMMARY");
console.log("  source profile unchanged by projection:", unchanged ? "YES ✓" : "NO ✗");
console.log("  passport fields:", Object.keys(passport.fields).length, "| pools:", Object.keys(passport.pools).map((k) => `${k}:${passport.pools[k].length}`).join(" "));
console.log("  conference fields:", Object.keys(conference.fields).length, "| pools:", Object.keys(conference.pools).map((k) => `${k}:${conference.pools[k].length}`).join(" "));
console.log("  passport missing:", missing(passport).total, "| conference missing:", missing(conference).total);
console.log("  conference projection gaps (src=none):", gaps(CONFERENCE_TEMPLATE.pages).length);
process.exit(unchanged ? 0 : 1);
