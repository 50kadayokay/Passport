// DEV/DEMO HARNESS — renders the Blueprint editors with a projected sample profile,
// with NO Supabase table and NO auth, so the workspace can be reviewed/screenshotted
// before the 0012 migration is applied. Reached at /bpdemo. Not part of the product
// surface — safe to delete. (Save/status buttons will no-op error without the table.)

import React, { useMemo, useState } from "react";
import { projectProfileToPassportBlueprint } from "../../lib/blueprints/projectProfileToPassportBlueprint.js";
import { projectProfileToConferenceBlueprint } from "../../lib/blueprints/projectProfileToConferenceBlueprint.js";
import PassportBlueprintEditor from "./PassportBlueprintEditor.jsx";
import ConferenceBlueprintEditor from "./ConferenceBlueprintEditor.jsx";

const SAMPLE = {
  company: { name: "Argenta Silver Corp.", ticker: "AGAG", website: "argentasilver.com", jurisdiction: "Salta, Argentina", stage: "exploration", commodity: "Silver", location: "Salta, Argentina", headquarters: "Vancouver, BC", slogan: "Testing the scale of El Quevar", listings: [{ ex: "TSXV", sym: "AGAG" }, { ex: "OTCQB", sym: "AGAGF" }] },
  companyStatus: { statusHeadline: "Actively drilling El Quevar", statusHeadlineSubtext: "25,000 m program underway", latestUpdate: "Wide high-grade silver intersected 120 m beyond the Yaxtché resource boundary.", nextCatalyst: "Assay results", expected: "Q3 2026" },
  companyBrief: { shortSummary: "District-scale silver explorer advancing the 100%-owned El Quevar project in Salta, Argentina.", keyPoints: ["45.3 Moz Ag indicated at Yaxtché", "56,706 ha, 100% owned", "20+ district targets"] },
  capital: { outstanding: "180.2M", fd: "205.4M", options: "12.1M", warrants: "8.0M", cash: "C$30.0M", workingCapital: "C$28.5M", debt: "C$0", marketCap: "C$95M", ownership: "~45% institutional", reportingDate: "2026-03-31", financing: "C$23.0M bought deal", financingDate: "2026-01-22", financingType: "Bought deal", financingUse: "Exploration & technical program at El Quevar" },
  team: [
    { name: "Joaquín Marias", role: "President, CEO & Director", full: "More than 15 years of international precious-metals exploration and development experience. Previously advised Fiore Group and worked with Dolly Varden Silver.", enabled: true, linkedin: "in/joaquinmarias" },
    { name: "Aaron Triplett", role: "Chief Financial Officer", short: "CPA, CA with 15+ years in public-company finance, controls and compliance.", enabled: true },
    { name: "Michelle Borthwick", role: "VP Corporate Affairs & Corporate Secretary", short: "Governance and corporate-finance professional with 25+ years across public issuers.", enabled: true },
    { name: "Guillermo Peralta", role: "Argentina Chief Geologist", short: "Geologist with 18+ years across four countries, including eight years at Kinross Gold.", enabled: true },
    { name: "Geir Liland", role: "Director", short: "Former Argenta CEO; officer and director of junior public companies.", enabled: true },
    { name: "D. Jeffrey Harder", role: "Director", short: "Retired Deloitte partner with 40+ years in valuation, M&A and financial advisory.", enabled: true },
  ],
  timeline: [
    { id: "2026-07-06", date: "2026-07-06", headline: "Wide High-Grade Silver Hit 120m Beyond Yaxtché", whyItMatters: "Extends high-grade silver outside the existing resource model and defines an area for expansion drilling.", key: true, originalTitle: "Argenta Intersects 446 g/t Ag over 28.0 m" },
    { id: "2026-06-30", date: "2026-06-30", headline: "20+ Targets Defined Across the El Quevar District", whyItMatters: "Broadens the project beyond Yaxtché with multiple district-scale test locations.", key: true },
    { id: "2026-02-03", date: "2026-02-03", headline: "El Quevar Drill Program Expanded to 25,000 Metres", whyItMatters: "Larger funded program increases drilling for resource expansion and new-target testing.", key: true },
    { id: "2026-01-22", date: "2026-01-22", headline: "C$23 Million Financing Closed", whyItMatters: "Capital for a substantially larger exploration and technical program without investor warrants.", key: true },
    { id: "2025-11-10", date: "2025-11-10", headline: "Maiden Resource of 45.3 Moz Ag", whyItMatters: "Established the scale of Yaxtché.", key: true },
    { id: "2024-10-24", date: "2024-10-24", headline: "100% of El Quevar Acquired for US$3.5 Million", whyItMatters: "Secured the district asset.", key: true },
  ],
  projects: [
    { key: "el-quevar", name: "El Quevar", enabled: true, stageName: "Advanced Exploration",
      snapshot: { ownership: { value: "100%" }, landPackage: { value: "56,706 ha" }, depositType: { value: "Epithermal Ag" }, location: { detail: "Salta Province" } },
      brief: { overview: "Hosts the high-grade Yaxtché silver resource within a 31-concession district land package." },
      stage: { current: "Advanced Exploration", summary: "25,000 m program testing resource expansion and district targets.", activity: "Drilling" },
      targets: { priority: [{ name: "Northwest Step-out", why: "High-grade continuity beyond the resource boundary" }, { name: "Azufre", why: "District-scale untested target" }] },
      drillResults: { rows: [
        { hole: "QVD-469", from: "212", to: "240", interval: "28.0 m", grade: "446 g/t Ag", commodity: "Ag", date: "2026-07-06", note: "120 m NW step-out" },
        { hole: "QVD-465", from: "180", to: "195", interval: "15.0 m", grade: "512 g/t Ag", commodity: "Ag", date: "2026-05-26" },
        { hole: "QVD-460", from: "90", to: "132", interval: "42.0 m", grade: "268 g/t Ag", commodity: "Ag", date: "2026-04-14" },
      ] },
      gallery: [{ src: "x1", caption: "Cross-section" }, { src: "x2", caption: "Core" }] },
    { key: "azufre", name: "Azufre", enabled: true, stageName: "Early Exploration",
      snapshot: { ownership: { value: "100%" }, landPackage: { value: "included" }, depositType: { value: "Epithermal" } },
      brief: { overview: "District target north of Yaxtché." }, targets: { priority: [] }, drillResults: { rows: [] }, gallery: [] },
  ],
  conference: {
    enabled: true, style: "scene", hook: "Testing the scale of El Quevar",
    overview: "Argenta Silver is a resource-stage exploration company advancing the 100%-owned El Quevar silver project in Salta Province, Argentina.",
    macroContext: "Silver is both a precious metal and an industrial input used in solar, electrification and electronics.",
    region: "El Quevar sits in the high Andes of Salta Province, accessible by road near Pocitos with regional rail, power and a mining gas pipeline nearby.",
    districtContext: "Covers Quevar South, Quevar North and Azufre within the Quevar volcanic complex; Apex Silver and Golden Minerals previously left 100,000+ m of drilling and preserved core.",
    regionalGeology: "Andean Central Volcanic Zone; Miocene volcanic centres, intersecting NW–SE and NE–SW faults, silicification and advanced argillic alteration hosting silver-rich epithermal mineralization.",
    timelineIntro: "Argenta moved from acquiring El Quevar in October 2024 to re-logging historical core, completing its first drill campaign, financing a larger program and extending high-grade silver beyond the existing resource boundary.",
    resultsIntro: "Current technical evidence is testing whether high-grade silver continues beyond the Yaxtché boundary and whether separate targets represent additional mineralized centres.",
    capitalIntro: "Argenta reports C$30 million cash, C$0 debt and a C$23M January 2026 financing allocated to El Quevar.",
    leadershipIntro: "The team combines corporate finance and governance with Argentina-based legal and geological leadership.",
    featuredProjectKey: "el-quevar", featuredMilestoneDates: ["2026-07-06", "2026-06-30", "2026-02-03", "2026-01-22"],
    featuredGrade: { grade: "446 g/t Ag", width: "over 28.0 m", location: "Yaxtché NW step-out", context: "120 m beyond the resource boundary" },
    evidenceType: "drill_results",
    highlights: [
      { value: "45.3 Moz Ag", label: "Indicated Resource", context: "at Yaxtché, average grade 482 g/t Ag" },
      { value: "56,706 ha", label: "Controlled Land Package", context: "31 concessions" },
      { value: "446 g/t Ag", label: "Northwest Step-out", context: "over 28.0 m, 120 m beyond the boundary" },
      { value: "25,000 m", label: "Expanded Drill Campaign", context: "resource expansion + district targets" },
      { value: "C$30M", label: "Reported Cash", context: "no debt, no warrants" },
    ],
    investmentCase: [
      { reason: "A high-grade resource provides a defined technical starting point.", evidence: "Yaxtché contains 45.3 Moz Ag indicated at 482 g/t Ag.", standsOutBecause: "Expanding an existing resource, not a grassroots target." },
      { reason: "Recent drilling moved the growth thesis beyond the historical model.", evidence: "QVD-469 hit high-grade silver 120 m NW of the boundary.", standsOutBecause: "A specific area to test continuity and growth." },
      { reason: "The property is materially larger than the known deposit.", evidence: "31 concessions across ~56,706 ha with 20+ targets.", standsOutBecause: "District-scale testing without consolidating ground." },
    ],
    differentiators: ["Existing high-grade Yaxtché resource", "100%-owned district land package", "100,000+ m of historical drilling"],
    whyNow: "A ≥25,000 m program is underway with ~40% of assays pending and metallurgical testwork advancing.",
    strategicPartnerships: [],
  },
  brand: { color: "#059669" },
  contact: { email: "ir@argentasilver.com", twitter: "@ArgentaSilver", linkedin: "company/argenta-silver" },
  importMeta: {
    notFound: ["CONFLICT: capital.cash — two cash figures reported (C$30.0M vs C$37.5M) across periods"],
    auditLog: [{ at: "2026-07-01T00:00:00Z", sections: ["capital", "company", "projects"], text: "capital.cash\tC$30.0 million\tQUOTED\t\"cash and cash equivalents of C$30.0 million\"\tMD&A Q1 2026\np.4\nresource\t45.3 Moz Ag indicated\tDERIVED\t\"Indicated Mineral Resource of 45.3 Moz\"\tNI 43-101 Technical Report" }] },
};

export default function BlueprintDemo() {
  const [view, setView] = useState("list");
  const passportRow = useMemo(() => ({ id: "demo-passport", company_id: "argenta-silver-corp", template_version: "0.1", status: "draft", data: projectProfileToPassportBlueprint(SAMPLE) }), []);
  const conferenceRow = useMemo(() => ({ id: "demo-conference", company_id: "argenta-silver-corp", template_version: "0.1", status: "draft", data: projectProfileToConferenceBlueprint(SAMPLE) }), []);

  if (view === "passport") return <div className="h-screen"><PassportBlueprintEditor row={passportRow} onBack={() => setView("list")} companySlug="argenta-silver-corp" companyProfile={SAMPLE} canPublish={false} /></div>;
  if (view === "conference") return <div className="h-screen"><ConferenceBlueprintEditor row={conferenceRow} onBack={() => setView("list")} companySlug="argenta-silver-corp" companyProfile={SAMPLE} canPublish={false} /></div>;

  return (
    <div className="min-h-screen bg-slate-100 p-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-emerald-600">Dev harness · /bpdemo</div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-slate-900">Blueprint workspace preview</h1>
        <p className="mt-1 text-[14px] text-slate-500">Projected from a sample Argenta profile — no database, no auth. Save is disabled here; this is for reviewing the editorial workspace.</p>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <button onClick={() => setView("passport")} className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:border-slate-400">
            <div className="text-[17px] font-extrabold text-slate-900">Passport Blueprint →</div>
            <div className="mt-1 text-[13px] text-slate-500">Review the full profile field structure with evidence, missing-state classification and bulk approval.</div>
          </button>
          <button onClick={() => setView("conference")} className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:border-slate-400">
            <div className="text-[17px] font-extrabold text-slate-900">Conference Blueprint →</div>
            <div className="mt-1 text-[13px] text-slate-500">The complete 11-chapter spec with Layout / Content / Evidence modes and a booth visual proof.</div>
          </button>
        </div>
      </div>
    </div>
  );
}
