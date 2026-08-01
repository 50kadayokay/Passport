// Blueprint Phase 1 — projection + import unit tests (no network, no Supabase).
//
// Proves: (1) projecting a profile into either Blueprint NEVER mutates the source
// profile (source is deep-frozen; any write throws in strict mode + fingerprint is
// re-checked); (2) both projections produce the expected field/pool structure;
// (3) an empty profile projects cleanly with NO hard-coded Kingsmen defaults leaking;
// (4) the Blueprint importer round-trips (export → parse → diff → apply) without touching
// any profile.
//
//   node scripts/blueprint-projection-test.mjs

import projectPassport from "../src/lib/blueprints/projectProfileToPassportBlueprint.js";
import projectConference from "../src/lib/blueprints/projectProfileToConferenceBlueprint.js";
import { parseBlueprintImport, diffBlueprintImport, applyBlueprintImport } from "../src/lib/blueprints/blueprintImport.js";
import { conferenceCompileDiff, passportCompileDiff } from "../src/lib/blueprints/compile.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } };
const section = (t) => console.log("\n" + t);

function deepFreeze(o) {
  if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
}

const SAMPLE = {
  company: { name: "Argenta Silver", ticker: "AGAG", jurisdiction: "Salta, Argentina", stage: "exploration", commodity: "Silver", slogan: "Testing the scale of El Quevar", listings: [{ ex: "TSXV", sym: "AGAG" }] },
  companyStatus: { statusHeadline: "Actively drilling El Quevar", nextCatalyst: "Assay results", expected: "Q3 2026" },
  companyBrief: { shortSummary: "District-scale silver explorer.", keyPoints: ["45.3 Moz Ag", "100% owned"] },
  capital: { outstanding: "180M", fd: "205M", cash: "C$30M", debt: "C$0", reportingDate: "2026-03-31", financing: "C$23M", financingDate: "2026-01-22", ownership: "~45% institutional" },
  team: [
    { name: "Joaquín Marias", role: "President, CEO & Director", full: "15+ years in precious-metals exploration.", enabled: true, photo: "https://x/y.jpg" },
    { name: "Aaron Triplett", role: "CFO", short: "CPA, CA." },
  ],
  timeline: [
    { id: "2026-07-06", date: "2026-07-06", headline: "Wide High-Grade Silver Hit 120m Beyond Yaxtché", whyItMatters: "Extends silver outside the resource model.", key: true },
    { id: "2025-05-05", date: "2025-05-05", headline: "Phase 1 drilling", whyItMatters: "", key: false },
  ],
  projects: [
    { key: "el-quevar", name: "El Quevar", enabled: true, stageName: "Advanced Exploration",
      snapshot: { ownership: { value: "100%" }, landPackage: { value: "56,706 ha" }, depositType: { value: "Epithermal Ag" } },
      brief: { overview: "Hosts the Yaxtché silver resource." },
      targets: { priority: [{ name: "Northwest Step-out", why: "High-grade continuity" }] },
      drillResults: { rows: [{ hole: "QVD-469", from: "10", to: "38", interval: "28 m", grade: "446 g/t Ag", commodity: "Ag" }] },
      gallery: [{ src: "https://x/g1.jpg", caption: "Core" }] },
  ],
  conference: {
    enabled: true, style: "scene", hook: "Testing the scale of El Quevar", overview: "Argenta advances El Quevar.",
    region: "High Andes of Salta.", districtContext: "Quevar volcanic complex.", timelineIntro: "From acquisition to expansion.",
    featuredProjectKey: "el-quevar", featuredMilestoneDates: ["2026-07-06"],
    highlights: [{ value: "45.3 Moz Ag", label: "Indicated Resource", context: "at 482 g/t Ag" }],
    investmentCase: [{ reason: "High-grade resource base", evidence: "45.3 Moz Ag indicated", standsOutBecause: "Expanding, not grassroots." }],
    differentiators: ["Existing high-grade resource"], whyNow: "40% of assays pending.",
  },
  importMeta: {
    notFound: ["CONFLICT: capital.cash — two figures reported"],
    auditLog: [{ at: "2026-07-01T00:00:00Z", sections: ["capital", "company"], text: "cash\tC$30 million\tQUOTED\t\"cash and equivalents of C$30 million\"\tMD&A" }],
  },
};

// ---------------------------------------------------------------- 1. no mutation
section("1. Projection does not mutate the source profile");
const before = JSON.stringify(SAMPLE);
const frozen = deepFreeze(JSON.parse(before)); // fresh frozen copy
let passportData, conferenceData;
try {
  passportData = projectPassport(frozen);
  conferenceData = projectConference(frozen);
  ok(true, "projections ran on a frozen profile without throwing");
} catch (e) {
  ok(false, "projection threw (attempted mutation?): " + e.message);
}
ok(JSON.stringify(frozen) === before, "source profile is byte-identical after projection");

// ---------------------------------------------------------------- 2. shapes
section("2. Projection shapes");
ok(passportData && passportData.blueprintType === "passport", "passport blueprintType");
ok(passportData.fields["company.name"] && passportData.fields["company.name"].displayValue === "Argenta Silver", "passport company.name projected");
ok((passportData.pools.projects || []).length === 1, "passport projects pool = 1");
ok((passportData.pools.timeline || []).length === 2, "passport timeline pool = 2");
ok((passportData.pools.team || []).length === 2, "passport team pool = 2");
ok(passportData.fields["company.name"].sources.length >= 0, "passport fields carry a sources array");

ok(conferenceData && conferenceData.blueprintType === "conference", "conference blueprintType");
ok(Array.isArray(conferenceData.pageOrder) && conferenceData.pageOrder.length === 11, "conference has 11 pages in pageOrder");
ok((conferenceData.pools.highlights || []).length === 1, "conference highlights pool seeded");
ok((conferenceData.pools.projects || []).length === 1, "conference projects pool seeded");
ok((conferenceData.pools.milestones || []).length === 2, "conference milestones pool seeded");
ok((conferenceData.pools.leaders || []).length === 2, "conference leaders pool seeded");
ok((conferenceData.pools.reasons || []).length === 1, "conference reasons pool seeded");
ok((conferenceData.pools.results || []).length === 1, "conference drill results pool seeded");
ok(conferenceData.fields["hero.legalName"].displayValue === "Argenta Silver", "conference hero name from profile");
// conflict + evidence mapping
const cashField = passportData.fields["capital.cash"];
ok(Array.isArray(cashField.conflicts) && cashField.conflicts.length === 1, "conflict mapped to capital.cash");
ok(passportData.fields["capital.cash"].sources.length >= 1, "audit evidence mapped to capital.cash");

// ---------------------------------------------------------------- 3. empty profile
section("3. Empty profile projects cleanly with no Kingsmen leak");
const emptyPassport = projectPassport({});
const emptyConf = projectConference({});
ok(["empty", "needs_manual_review", "not_extracted"].includes(emptyPassport.fields["company.name"].status), "empty required company.name is classified missing (needs_manual_review)");
ok(emptyConf.fields["overview.focus"].status === "needs_ai_writing", "no-source conference field classified needs_ai_writing");
ok((emptyPassport.pools.projects || []).length === 0, "empty profile → no projects");
const emptyBlob = (JSON.stringify(emptyPassport) + JSON.stringify(emptyConf)).toLowerCase();
ok(!emptyBlob.includes("kingsmen"), "no Kingsmen defaults leaked into an empty projection");
ok(!emptyBlob.includes("chihuahua"), "no Kingsmen location leaked into an empty projection");

// ---------------------------------------------------------------- 4. import round-trip
section("4. Blueprint import round-trips and never targets a profile");
const exported = JSON.stringify(conferenceData);
const parsed = parseBlueprintImport(exported);
ok(parsed.ok, "export re-parses");
const diff = diffBlueprintImport(conferenceData, parsed.payload, { expectedType: "conference" });
ok(diff.ok && diff.errors.length === 0, "self-import diff has no errors");
const applied = applyBlueprintImport(conferenceData, parsed.payload, { expectedType: "conference" });
ok(applied && applied.next && applied.next.fields, "apply returns merged data");
ok(JSON.stringify(conferenceData) === exported, "apply did not mutate the original blueprint data");
// unknown-key + null-overwrite safety
const badDiff = diffBlueprintImport(conferenceData, { blueprintType: "conference", fields: { "not.a.real.key": { displayValue: "x" } }, pools: {} }, { expectedType: "conference" });
ok(badDiff.unknownFieldKeys.includes("not.a.real.key"), "unknown field key reported, not written");

// ---------------------------------------------------------------- 5. compile isolation
section("5. Conference compile writes ONLY conference (app can't move)");
const frozen2 = deepFreeze(JSON.parse(before));
// Approve every conference field + select pools so compile has something to write.
const cData = JSON.parse(JSON.stringify(conferenceData));
Object.values(cData.fields).forEach((f) => { f.approvalStatus = "approved"; });
Object.values(cData.pools).forEach((list) => list.forEach((r) => { r.approvalStatus = "approved"; r.selected = true; }));
const cDiff = conferenceCompileDiff(cData, frozen2, { requireApproval: true });
ok(JSON.stringify(frozen2) === before, "compile did not mutate the source profile");
ok(cDiff.sharedChanged.length === 0, "compile changed ZERO shared profile fields (app stays identical)");
ok(cDiff.changes.length > 0, "compile produced conference changes");
ok(cDiff.changes.every((c) => c.key.startsWith("conference.")), "every compiled change is under conference.*");
ok(cDiff.nextProfile.pp && cDiff.nextProfile.pp.CONFERENCE, "recompiled pp carries CONFERENCE");

// ---------------------------------------------------------------- 6. passport compile isolation
section("6. Passport compile writes ONLY shared profile (booth can't move)");
const frozen3 = deepFreeze(JSON.parse(before));
const pData = JSON.parse(JSON.stringify(passportData));
Object.values(pData.fields).forEach((f) => { f.approvalStatus = "approved"; });
Object.values(pData.pools).forEach((list) => list.forEach((r) => { r.approvalStatus = "approved"; }));
const pDiff = passportCompileDiff(pData, frozen3, { requireApproval: true });
ok(JSON.stringify(frozen3) === before, "passport compile did not mutate the source profile");
ok(pDiff.conferenceChanged === false, "passport compile left conference UNCHANGED (booth stays identical)");
ok(!pDiff.changes.includes("conference"), "conference not among changed profile keys");
ok(pDiff.nextProfile.pp && pDiff.nextProfile.pp.COMPANY, "recompiled pp carries COMPANY");

// ---------------------------------------------------------------- summary
console.log(`\n${fail === 0 ? "✓ ALL PASS" : "✗ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
