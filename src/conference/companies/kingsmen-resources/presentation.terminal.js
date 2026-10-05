// Kingsmen Resources — TERMINAL presentation (Conference Mode).
//
// Facts come ONLY from ./dataset.json, the Conference-owned verified dataset (never from the MineEx
// investor profile). This file holds the Terminal presentation: state wording, figure tabs, map-highlight
// positions measured on the deck's own figures, crop/aspect metadata, Resolve ordering, and the local
// offline assets in ./assets (bundled by Vite with the booth — no network needed at runtime).
//
// Output: a profile object in the shape conferenceV3/model.js (buildV3Model) reads.

import D from "./dataset.json";
import CHIHUAHUA from "./geo-chihuahua.json";
import { CONFERENCE_WEB_ORIGIN } from "../../config.js";

// Local assets → bundled URLs.
const FILES = import.meta.glob("./assets/*", { eager: true, query: "?url", import: "default" });
const asset = (name) => FILES[`./assets/${name}`] || "";

const DECK = "Corporate deck";
const SITE = "Company website (kingsmenresources.com)";

// ── helpers over the Conference dataset (formatting only — no new facts) ────────────────────────
const proj = (key) => (D.projects || []).find((p) => p.key === key) || {};
const millions = (s) => { const n = parseFloat(String(s || "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? (n / 1e6).toFixed(1) + "M" : String(s || ""); };
const listJoin = (a) => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
const cap = D.capital || {};
const LC = proj("las-coloradas"), ALM = proj("almoloya");
// OWNERSHIP / LAND PACKAGE — presentation wording (audit, Sep 23 2026). The dataset records Las Coloradas as
// "100%" (from a news release) and Almoloya as "6 mining concessions" (company website); the company's own
// sources conflict, so Terminal shows only the defensible statements below and never those two values:
//   • Las Coloradas — company project page: "Kingsmen holds a seven-year option agreement to earn a 100% interest."
//   • Almoloya — news release Oct 24 2025: "Granted Option to Acquire 100%"; 866.25 ha (LOI release Jul 9 2025).
//     Concession count omitted (website: 6 concessions; LOI release: five mineral claims).
const OWN = { lc: "Option to earn 100%", lcDetail: "Seven-year option agreement", alm: "Option to acquire 100%" };
const ALM_HA = "866 ha";
const LC_MINE = `${LC.historicMines[0].name} · discovered ${LC.historicMines[0].discovered} · last major underground operations ${LC.historicMines[0].lastMajorUndergroundOperations}`;
const ms = D.milestones || [];
const program = (projName) => ms.find((m) => m.year === "2026" && m.title.includes(projName)) || null;
const shortMeters = (m) => (m && (m.title.match(/[\d,]+\s?m\b/) || [])[0]) || "";

// Log-column label for a milestone status (presentation only).
const STATUS_LABEL = { completed: "LOGGED", underway: "UNDERWAY", planned_2026: "2026 PROGRAM" };

// Terminal log rows: Conference milestones grouped (≤2 per row, same year + status) to keep one screen.
const logRows = (() => {
  const out = [];
  for (const m of ms) {
    const last = out[out.length - 1];
    if (last && last.date === m.year && last._status === m.status && !last.whyItMatters && last._n < 2) { last.whyItMatters = m.title; last._n++; continue; }
    out.push({ date: m.year, headline: m.title, status: STATUS_LABEL[m.status] || String(m.status || "").toUpperCase(), _status: m.status, _n: 1 });
  }
  return out.map(({ _status, _n, ...r }) => r);
})();

// Historic mines (District state): sites with disclosed dates, ordered by discovery.
const sites = [...(LC.historicMines || []), ...(ALM.historicMines || [])]
  .filter((h) => h.discovered && h.lastMajorUndergroundOperations)
  .sort((a, b) => parseInt(a.discovered, 10) - parseInt(b.discovered, 10))
  .map((h) => ({ name: h.name.replace(/\s+Mine$/, ""), marks: [[h.discovered, "Discovered"], [h.lastMajorUndergroundOperations, "Last major UG operations"], ["Present", "Modern district consolidation"]] }));

// Exploration targets — dataset text + status; Terminal frames them explicitly as targets.
const TARGET_SOURCE = `${DECK} p.6`;
const targets = (p) => (p.explorationTargets || []).filter((t) => t.status === "exploration_target").map((t) => ({
  name: t.name, title: `${t.name} — ${t.headline}`, status: "Exploration target", detail: t.detail,
  caveat: String(t.disclaimer || "Not a defined mineral resource.").replace(/^Exploration target\s*—\s*/i, "").replace(/^./, (c) => c.toUpperCase()),
  source: TARGET_SOURCE,
}));

// Deck headshots keyed by dataset team-member name.
const HEADSHOT = {
  "Scott Emerson": "team-scott-emerson.jpg", "Nick DeMare": "team-nick-demare.jpg", "Rodney B. Johnston": "team-rodney-johnston.jpg",
  "Kieran Downes": "team-kieran-downes.jpg", "Carlos Garza Moriel": "team-carlos-garza.jpg", "Mark J. Pryor": "team-mark-pryor.jpg",
  "Perla Cortes Garcia": "team-perla-cortes-garcia.jpg",
};
const royalty = (cap.royalties || [])[0];
const royaltyNote = royalty ? `${royalty.rate} ${royalty.type} on the ${royalty.property} property, part of the ${royalty.project} ${String(royalty.commodity || "").toLowerCase().replace(/\s*\/\s*/g, "/")} project in ${royalty.country}, operated by ${royalty.operator}.` : "";
const lcProg = program("Las Coloradas"), almProg = program("Almoloya");

// ── SPATIAL — native schematic (Terminal-drawn) ─────────────────────────────────────────────────────────
// Plane: kilometres from Hidalgo del Parral (x east, y south). Only TWO things here are real geography:
//   • the Chihuahua outline (Natural Earth admin-1, generalized) and its graticule, and
//   • the Parral anchor — GeoNames 4004867 (municipal seat): 26.929866°N, 105.666182°W.
// EVERYTHING ELSE IS SCHEMATIC — generalized, never surveyed:
//   • Almoloya: stated distance + stated direction ("30 kms East from mining town of Parral", deck p.7).
//   • Las Coloradas: stated distance (38 km, deck p.7) on a generalized bearing read from the company maps.
//   • Tier A: company-stated straight-line distances FROM LAS COLORADAS (deck p.8 table, which Kingsmen titles
//     "Operating Projects"), along approximate bearings read from the deck p.8 pins.
//   • Tier B: positions generalized from the company's regional maps (deck p.7; website "Our Neighbour's
//     Projects", itself marked approximate). No distances.
// The company's own maps disagree at the tens-of-km level; only Parral carries coordinates, and the permanent
// disclosure is part of the visual.
const PARRAL = { lat: 26.929866, lon: -105.666182 };
const KM_LON = 111.32 * Math.cos((PARRAL.lat * Math.PI) / 180), KM_LAT = 110.57, MI = 1.609344;
const km = ([lon, lat]) => [+((lon - PARRAL.lon) * KM_LON).toFixed(2), +((PARRAL.lat - lat) * KM_LAT).toFixed(2)];
const r1 = (v) => Math.round(v * 10) / 10;
// Las Coloradas: the company states only its DISTANCE from Parral (38 km, deck p.7). Its direction is not stated;
// the company maps (deck p.7, deck p.8 pins, website inset) all show it south-east of Parral, so it is drawn at
// 38 km on a generalized SE bearing. The Las Coloradas↔Almoloya distance is deliberately NOT used or shown — company
// sources conflict (deck p.8 table 25 mi; news releases ≈30 km).
const LC_BRG = 130, dLC = 38;
const LCX = dLC * Math.sin((LC_BRG * Math.PI) / 180), LCY = -dLC * Math.cos((LC_BRG * Math.PI) / 180);
const fromLC = (mi, brg) => [r1(LCX + mi * MI * Math.sin((brg * Math.PI) / 180)), r1(LCY - mi * MI * Math.cos((brg * Math.PI) / 180))];
const ring = CHIHUAHUA.ring.map(km);
const bb = ring.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]);
const grat = [
  ...[-108, -106, -104].map((lon) => ({ label: `${-lon}°W`, a: km([lon, 32]), b: km([lon, 25.4]), axis: "x" })),
  ...[26, 28, 30].map((lat) => ({ label: `${lat}°N`, a: km([-109.4, lat]), b: km([-103, lat]), axis: "y" })),
];
const pad = (b, p) => [b[0] - p, b[1] - p, b[2] + p, b[3] + p];

const SPATIAL = {
  disclosure: "Schematic · positions generalized · distances as stated by the company",
  sources: "Parral geolocated (GeoNames 4004867) · project positions generalized · Tier A distances from Las Coloradas per Kingsmen (deck p.8), bearings approximate · Tier B generalized (deck p.7, website)",
  legend: [
    ["anchor", "Parral · geolocated"],
    ["asset", "Kingsmen project · generalized"],
    ["A", "Operating per Kingsmen · distance stated"],
    ["B", "Neighbour · generalized"],
  ],
  levels: { State: "Chihuahua · Mexico", District: LC.district, Project: "" },
  outline: ring, graticule: grat,
  nodes: [
    { id: "parral", kind: "anchor", name: "Hidalgo del Parral", sub: "26.93°N · 105.67°W", at: [0, 0], lab: [-10, -12, "end"], src: "GeoNames 4004867" },
    { id: "lc", kind: "asset", name: LC.name, sub: "38 km from Parral", at: [r1(LCX), r1(LCY)], lab: [12, 5, "start"], src: `${DECK} p.7 (distance); bearing generalized from company maps` },
    { id: "alm", kind: "asset", name: ALM.name, sub: "30 km east of Parral", at: [30, 0], lab: [12, -8, "start"], src: `${DECK} p.7` },
    // Tier A — operating projects with company-stated straight-line distances from Las Coloradas (deck p.8)
    { id: "gogold", kind: "A", name: "Parral Tailings", op: "GoGold Resources", at: [-5, 3], lab: [-9, 4, "end"], src: `${DECK} p.8 (24 mi), p.7; ${SITE}` },
    { id: "sb", kind: "A", name: "Santa Barbara", op: "Grupo Mexico", at: fromLC(28, 290), lab: [-9, 14, "end"], src: `${DECK} p.8 (28 mi), p.7; ${SITE}` },
    { id: "gatos", kind: "A", name: "Los Gatos", op: "First Majestic Silver", at: fromLC(77, 320), lab: [9, 4, "start"], src: `${DECK} p.8 (77 mi), p.7; ${SITE}` },
    { id: "cusi", kind: "A", name: "Cusi", op: "Silverco Mining", at: fromLC(134, 327), lab: [9, 4, "start"], src: `${DECK} p.8 (134 mi), p.7; ${SITE}` },
    // Tier B — neighbouring projects, positions generalized from the company's regional maps (no distances stated)
    { id: "cordero", kind: "B", name: "Cordero", op: "Discovery Silver", at: [5, -20], lab: [8, -4, "start"], src: `${DECK} p.7; ${SITE}` },
    { id: "cigarra", kind: "B", name: "La Cigarra", op: "Kootenay Silver", at: [-25, -12], lab: [-8, 3, "end"], src: `${DECK} p.7; ${SITE}` },
    { id: "sfo", kind: "B", name: "San Francisco del Oro", op: "Minera Frisco", at: [-17, 13], lab: [-8, -2, "end"], src: `${DECK} p.7; ${SITE}` },
    { id: "smaria", kind: "B", name: "Santa Maria", op: "TSM", at: [-9, 21], lab: [-8, 4, "end"], src: `${DECK} p.7; ${SITE}` },
    { id: "naica", kind: "B", name: "Naica", op: "Industrias Peñoles", at: [15, -95], lab: [8, 4, "start"], src: `${DECK} p.7; ${SITE}` },
  ],
  steps: [
    { level: "State", proj: 0, frame: pad(bb, 18), graticule: true, show: ["parral", "lc"], focus: "lc", log: 3, labs: { lc: [12, 18, "start"] } },
    { level: "State", proj: 1, frame: pad(bb, 18), graticule: true, show: ["parral", "lc", "alm"], focus: "alm", log: 4, links: [["parral", "alm", ""]], labs: { lc: [12, 18, "start"], alm: [12, -14, "start"] } },
    // district: the Parral cluster at a readable scale; the far operations (and Naica) resolve as edge markers
    // along their generalized bearings, carrying the company's stated distance
    { level: "District", proj: 0, frame: [-62, -34, 72, 44], show: "all", focus: "lc", log: 6, legend: true, labs: { parral: [0, -15, "middle", true] },
      links: [["lc", "gogold", "24 mi"], ["lc", "sb", "28 mi"], ["lc", "gatos", "77 mi"], ["lc", "cusi", "134 mi"]],
      edges: [{ id: "gatos", label: "Los Gatos · 77 mi", sub: "First Majestic Silver", side: "l" }, { id: "cusi", label: "Cusi · 134 mi", sub: "Silverco Mining", side: "r" }, { id: "naica", label: "Naica", sub: "Industrias Peñoles", side: "r" }] },
    { level: "District", proj: 1, frame: [-44, -28, 74, 42], show: "all", dim: ["gogold", "sb", "gatos", "cusi", "cordero", "cigarra", "sfo", "smaria", "naica"], focus: "alm", log: 7, labs: { parral: [-10, -12, "end", true] },
      links: [["parral", "alm", "30 km east"], ["parral", "lc", "38 km"]], legend: true },
    { level: "Project", proj: 0, frame: [r1(LCX) - 18, r1(LCY) - 8, r1(LCX) + 42, r1(LCY) + 28], show: ["lc"], focus: "lc", log: 8, card: "lc", cardAt: "bl", figure: "lcClaims",
      edges: [{ id: "parral", label: "Parral · 38 km", side: "r" }, { id: "alm", label: "Almoloya", sub: "30 km east of Parral", side: "r" }] },
    { level: "Project", proj: 1, frame: [30 - 18, -26, 30 + 42, 10], show: ["alm"], focus: "alm", log: 9, card: "alm", cardAt: "tl", figure: "almClaims",
      edges: [{ id: "parral", label: "Parral · 30 km west", side: "l" }, { id: "lc", label: "Las Coloradas", sub: "38 km from Parral", side: "l" }] },
  ],
  log: [
    ["Region", "Chihuahua · Mexico"],
    ["Anchor", "Hidalgo del Parral · 26.93°N 105.67°W · geolocated"],
    ["Asset 01", `${LC.name} · 38 km from Parral`],
    ["Asset 02", `${ALM.name} · 30 km east of Parral`],
    ["Context", "4 listed by Kingsmen as operating · from Las Coloradas (p.8)"],
    ["Context", "5 of the neighbours on deck p.7 · generalized"],
    ["Bearings", "Generalized from company maps"],
    ["Project", `${LC.name} · ${LC.landPackage.area} · ${LC.landPackage.concessions.replace(/ mining/, "")}`],
    ["Project", `${ALM.name} · ${ALM_HA} · ${OWN.alm.toLowerCase()}`],
  ],
  cards: {
    lc: { name: LC.name, rows: [["Land package", `${LC.landPackage.area} · ${LC.landPackage.concessions}`], ["Status", `${OWN.lc} · ${OWN.lcDetail.toLowerCase()}`], ["Historic mine", `${LC.historicMines[0].name} · discovered ${LC.historicMines[0].discovered} · last major UG operations ${LC.historicMines[0].lastMajorUndergroundOperations}`], ["Commodities", LC.commodities]] },
    alm: { name: ALM.name, rows: [["Land package", ALM_HA], ["Status", OWN.alm], ["Historic mines", listJoin((ALM.historicMines || []).map((h) => h.name.replace(/\s+Mine$/, "")))], ["Commodities", ALM.commodities], ["2026 program", almProg ? `${shortMeters(almProg)} drilling — planned` : ""]].filter((r) => r[1]) },
  },
  figures: {
    lcClaims: { src: asset("lc-claims-map-p09.webp"), aspect: 2757 / 2124, label: "Las Coloradas district claims map", source: `${DECK} p.9` },
    almClaims: { src: asset("alm-claims-map-p15.webp"), aspect: 3000 / 1574, label: "Almoloya district claims map", source: `${DECK} p.15` },
  },
};

const EXCHANGE = { TSXV: "TSX Venture", OTCQB: "OTCQB", FSE: "Frankfurt" };
const LISTINGS = (D.company.listings || []).map((l) => ({ ex: EXCHANGE[l.ex] || l.ex, sym: l.sym }));

// ASSET REGISTER — compact project intelligence (verified fields only; commodities head the block)
const ASSET_FACTS = {
  [LC.name]: { head: LC.commodities, rows: [
    ["Jurisdiction", D.company.jurisdiction],                                  // deck p.7
    ["From Parral", "38 km"],                                                   // deck p.7
    ["Land package", `${LC.landPackage.area} · ${LC.landPackage.concessions}`], // company project page
    ["Status", `${OWN.lc} · ${OWN.lcDetail.toLowerCase()}`],                   // company project page
    ["Historic mine", `${LC.historicMines[0].name} · disc. ${LC.historicMines[0].discovered} · last major UG ops ${LC.historicMines[0].lastMajorUndergroundOperations}`], // deck p.18
    ["2026 program", lcProg ? `${shortMeters(lcProg)} drilling — ${lcProg.status === "underway" ? "underway" : "planned"}` : ""],          // deck p.3, p.6
  ].filter((r) => r[1]) },
  [ALM.name]: { head: ALM.commodities, rows: [
    ["Jurisdiction", D.company.jurisdiction],                                  // deck p.7
    ["From Parral", "30 km east"],                                              // deck p.7
    ["Land package", ALM_HA],                                                   // LOI release Jul 9 2025 (866.25 ha)
    ["Status", OWN.alm],                                                        // news release Oct 24 2025
    ["Historic mines", listJoin((ALM.historicMines || []).map((h) => h.name.replace(/\s+Mine$/, "")))], // deck p.7, p.17, p.18
    ["2026 program", almProg ? `${shortMeters(almProg)} drilling — planned` : ""],                          // deck p.6; news release
  ].filter((r) => r[1]) },
};

const profile = {
  company: {
    name: D.company.name, slogan: D.company.positioning, listings: D.company.listings,
    commodity: D.company.commodities, jurisdiction: D.company.jurisdiction,
  },
  capital: {
    outstanding: cap.sharesOutstanding, workingCapital: cap.workingCapital, fd: cap.fullyDiluted,
    asOf: cap.asOf,
    notes: royaltyNote ? [royaltyNote] : [],
  },
  projects: [
    {
      key: "las-coloradas", name: LC.name,
      tag: lcProg && lcProg.status === "underway" ? "Drilling underway" : "Exploration",
      snapshot: { commodity: LC.commodities, location: LC.distance },
      brief: { overview: `Includes the historic past-producing ${listJoin((LC.historicMines || []).map((h) => h.name))}.` },
      // project SITE photo (the deck cover image; the company website captions the same photo "Las Coloradas
      // project photo 1"). Drill core now lives in the Drilling intelligence view, where it has a reason to exist.
      gallery: [{ src: asset("lc-site-p01.jpg"), caption: "Las Coloradas project site · drilling", source: `${DECK} cover · ${SITE}` }],
    },
    {
      key: "almoloya", name: ALM.name, tag: "Exploration",
      snapshot: { commodity: ALM.commodities, location: ALM.distance },
      brief: { overview: `Includes the historic past-producing ${listJoin((ALM.historicMines || []).map((h) => h.name))}.` },
      // clean site photograph — "Almoloya property valley view" on the company website; the same view appears
      // annotated in deck p.17 ("Almoloya district · looking north"), which stays in Historic Workings only.
      gallery: [{ src: asset("alm-site-valley-web.webp"), caption: "Almoloya property valley view", source: `${SITE} · same view as ${DECK} p.17` }],
    },
  ],
  // project-level maps (claims) — consumed per project by buildV3Model (_projMaps)
  media: {
    maps: [
      { url: asset("lc-claims-map-p09.webp"), project: LC.name, category: "claims", label: "Las Coloradas district claims map", source: `${DECK} p.9`, aspect: 2757 / 2124 },
      { url: asset("alm-claims-map-p15.webp"), project: ALM.name, category: "claims", label: "Almoloya district claims map", source: `${DECK} p.15`, aspect: 3000 / 1574 },
    ],
  },
  timeline: logRows,
  team: (D.team || []).map((m) => ({ name: m.name, role: m.role, photo: HEADSHOT[m.name] ? asset(HEADSHOT[m.name]) : "" })),

  conference: {
    enabled: true,
    studio: { template: "terminal", theme: "obsidian", accent: "" },
    // TEMPORARY destination: the existing public MineEx investor profile (its content can differ from this
    // Conference dataset). To be replaced by the Conference-owned public page ${CONFERENCE_WEB_ORIGIN}/c/<slug>.
    followUrl: `${CONFERENCE_WEB_ORIGIN}/app?c=kingsmen-resources&utm_campaign=booth`,
    hook: "Two consolidated silver/gold land packages in the historic Parral Mining District.",
    // PRIMARY SIGNAL — a concrete, dated capital fact, deliberately NOT an exploration-target figure.
    heroStatistic: { value: cap.workingCapital, label: "Working capital", context: `Data as of ${cap.asOf}`, kind: "capital" },
    vitals: [
      ["Commodities", D.company.commodities],
      ["Jurisdiction", D.company.jurisdiction],
      ["District", LC.district],
    ],
    investmentCase: [
      { label: "Historic district", reason: "Hidalgo del Parral has produced silver and gold for over 400 years." },               // deck p.3
      { label: "Consolidation", reason: "Land consolidation key to unlocking exploration potential." },                       // deck p.18, p.20
      { label: "Active programs", reason: "2026 drilling is underway at Las Coloradas; exploration continues at Almoloya." },     // deck p.3
    ],
    resolvedParameters: [
      { tag: "Assets", k: "Projects", v: `${LC.name} · ${ALM.name}` },
      { tag: "Jurisdiction", k: "Location", v: `${LC.district} · ${D.company.jurisdiction}` },
      { tag: "Program", k: "2026", v: `${shortMeters(lcProg)} ${LC.name}${lcProg && lcProg.status === "underway" ? " (underway)" : ""} · ${shortMeters(almProg)} ${ALM.name}` },
      { tag: "Position", k: cap.asOf, v: `${cap.workingCapital} working capital · ${millions(cap.sharesOutstanding)} shares outstanding` },
      { tag: "District", k: "History", v: "Both projects have past-producing mines within the consolidated land packages" }, // deck p.3
    ],

    spatialNative: SPATIAL,

    // INTELLIGENCE — the company's own figures. Every figure carries its OWN context, answering (1) what am I
    // looking at, (2) what does the source establish, (3) why it matters at this stage of the exploration story
    // (descriptive, never a recommendation). Wording is taken from the dataset or read directly off the named
    // deck page. Targets appear only beside the figure they belong to, always qualified as exploration targets.
    intelligence: [
      {
        key: "LAS COLORADAS", project: LC.name,
        views: [
          {
            key: "DRILLING", label: "2025 drilling", src: asset("lc-drilling-2025-p11.webp"), aspect: 2609 / 2308, source: `${DECK} p.11 — 2025 Drilling Compilation`,
            inset: { src: asset("lc-core-p11.jpg"), caption: "Drill core · 2025 drilling", source: `${DECK} p.11` },
            focus: [{ box: [71.6, 54.6, 13.6, 9.6], label: "Las Coloradas Mine · label on figure" }],
            context: [
              { k: "What you're viewing", v: "2025 drilling compilation", n: "Drill holes, surface silver samples (ppm) and mapped veins/structures around the Las Coloradas Mine, with the 2025 intercept table." },   // deck p.11
              { k: "Source establishes", v: "Initial 3,000 m drill program completed", n: "Holes LC-25-001 to LC-25-012 are plotted; the legend marks high-grade holes in green." },                                     // deck p.6, p.11
              { k: "Stage", v: lcProg ? `2026 · ${shortMeters(lcProg)} drill program${lcProg.status === "underway" ? " — underway" : ""}` : "", n: "The 2025 program was the initial drilling; the 2026 program follows it." }, // deck p.3, p.6
            ],
            targets: [],
          },
          {
            key: "SECTION", label: "Mineralized holes", src: asset("lc-section-p12.webp"), aspect: 3000 / 2134, source: `${DECK} p.12 — Las Coloradas mineralized holes (section)`,
            context: [
              { k: "What you're viewing", v: "Section through LC-25-005, LC-25-010 and LC-26-013", n: "Drill traces on topography with silver (left) and gold (right) assay bar graphs and logged rock codes · scale 1:2,400." }, // deck p.12 legend
              { k: "Source establishes", v: "The company's mineralized holes, in section", n: "The deck presents these three holes as its Las Coloradas mineralized holes; core photographs are inset on the section." },       // deck p.12 title
              { k: "Why this view", v: "Depth, not just plan", n: "Adds the vertical relationship between drill traces and surface that the plan-view compilation cannot show." },
            ],
            targets: [],
          },
          {
            key: "GEOLOGY", label: "Geology", src: asset("lc-geology-p10.webp"), aspect: 2904 / 2178, source: `${DECK} p.10 — Geological Setting of Mineralization`,
            context: [
              { k: "What you're viewing", v: "Geological setting of mineralization", n: "Alluvium, QP intrusive, volcanics and sediments, with veins/structures, drainage and drill holes across the project." }, // deck p.10 legend
              { k: "Source establishes", v: "Leona · Aguilar · DBD · Mine · Saddle", n: "The figure annotates widespread anomalous silver geochemistry (unexplored) and an unexplored target of future exploration." }, // deck p.10
              { k: "Deposit model", v: "Epithermal high-grade vein · skarn · porphyry", n: "Silver-gold-lead-zinc-copper. 2024 mapping traced structures for 1.2 and 1.1 miles." },                                   // lcPage; deck p.6
            ],
            targets: [],
          },
          {
            key: "TARGETS", label: "Target zones", src: asset("lc-target-zones-p13.webp"), aspect: 2860 / 2041, source: `${DECK} p.13 — Target Zone Location Map`,
            context: [
              { k: "What you're viewing", v: "Target zone location map", n: "Surface silver samples (g/t) and drill collars along mapped veins from Leona and Aguilar through DBD to the Mine; an arrow points west to Saddle." }, // deck p.13
              { k: "2026 targets", v: "Soledad, Soledad II, subsidiary structures and Saddle zones", n: "Named in the company's 2026 drill program." },                                                                          // deck p.3
              { k: "How targets were set", v: "2025 · IP survey → IP drill targets identified", n: "Geophysics completed in 2025 alongside the initial drilling." },                                                              // deck p.6
            ],
            targets: ["Las Coloradas targets"],
          },
          {
            key: "SADDLE", label: "Saddle target", src: asset("lc-saddle-target-p14.webp"), aspect: 3000 / 1917, source: `${DECK} p.14 — Saddle Target`,
            focus: [{ box: [70.6, 65.4, 21.2, 9.4], label: "Saddle target · marked on figure" }],
            context: [
              { k: "What you're viewing", v: "Saddle target on regional magnetics", n: "Magnetic intensity (nanoteslas) at 1:250,000, with Hidalgo del Parral at upper left and the Saddle target marked." },    // deck p.14
              { k: "Location", v: "≈4.0 km (2.5 mi) west of the past-producing Las Coloradas mine", n: "" },                                                                                                                  // deck p.14
              { k: "Source establishes", v: "Broad, continuous mineralized area", n: "Initial sampling indicates a broad and continuous mineralized area; prospecting results indicate anomalous Au, Ag & Cu." },           // deck p.14
              { k: "Stage", v: "2026 drill target", n: "Prospective for epithermal, skarn and porphyry mineralization." },                                                                                                  // deck p.3, p.14
            ],
            targets: [],
          },
        ],
        targets: targets(LC),
      },
      {
        key: "ALMOLOYA", project: ALM.name,
        views: [
          {
            key: "HISTORIC DRILLING", label: "Historic drilling", src: asset("alm-historic-drilling-p16.webp"), aspect: 2599 / 2279, source: `${DECK} p.16 — Historic Drilling, Almoloya–Juliettas Zone`,
            context: [
              { k: "What you're viewing", v: "Historic drilling · Almoloya–Juliettas zone", n: "Seven Hemlo reverse-circulation holes (H1–H7, 1995–1996), shafts and gold (ppm) surface samples, with artisanal mining photos inset." }, // deck p.16 legend
              { k: "Source establishes", v: "Gold intersected in historic drilling", n: "Historic intercepts are annotated on the figure for holes H1, H2 and H4–H7, as reported by the company." },                               // deck p.16
              { k: "Next stage", v: almProg ? `2026 · ${shortMeters(almProg)} drill program planned` : "", n: "The Juliettas target calls for diamond drilling along the full strike length and at depth." },                  // deck p.6
            ],
            targets: ["Juliettas target"],
          },
          {
            key: "HISTORIC WORKINGS", label: "Historic workings", src: asset("alm-historic-workings-p17.jpg"), aspect: 3000 / 1808, source: `${DECK} p.17 — Almoloya Historic Mining Activity (looking north)`,
            context: [
              { k: "What you're viewing", v: "Almoloya district, looking north", n: "Old workings, the Cigarrero past producer, the mapped structure and the line of historic drilling, annotated on a site photograph." }, // deck p.17
              { k: "Past producers", v: listJoin((ALM.historicMines || []).map((h) => h.name.replace(/\s+Mine$/, ""))), n: "Cigarrero: discovered 1890, last major underground operations 1920; historic reports indicate ≈1.25 Mt of ore grading 600 g/t Ag, 40% Pb and 25% Zn." }, // dataset (deck p.18, p.6, pr20250709)
              { k: "Why it matters here", v: "The Cigarrero target is set on these historic grades", n: "The exploration target applies the historic Cigarrero grades to a tonnage range." },                                            // deck p.6
            ],
            targets: ["Cigarrero target"],
          },
          {
            key: "CLAIMS", label: "Claims", src: asset("alm-claims-map-p15.webp"), aspect: 3000 / 1574, source: `${DECK} p.15 — Almoloya District Claims Map`,
            context: [
              { k: "What you're viewing", v: "Almoloya district claims map", n: "Mining concessions with surrounding ejidos and Highway 45 — Leona Silver, Almoloya District, Chihuahua." },                           // deck p.15
              { k: "Land package", v: ALM_HA, n: `${OWN.alm} (news release, Oct 24 2025) · ${ALM.distance}.` },                                                                                                                   // LOI release; pr20251024; deck p.7
              { k: "Stage", v: "Option granted 2025 · sampling program completed", n: almProg ? `${shortMeters(almProg)} drill program planned for 2026.` : "" },                                                                  // pr20251024; deck p.6
            ],
            targets: [],
          },
        ],
        targets: targets(ALM),
      },
    ],

    history: {
      title: "District // consolidation",
      headline: "Three historic past-producing mines",
      sites,
      note: "Historically fragmented land ownership a major barrier to modern exploration",   // deck p.18
      statement: "Land consolidation key to unlocking exploration potential",                // deck p.18
      attribution: "Company positioning · corporate deck p.18",
      // Identified district photograph (deck p.5 caption: "Mina La Prieta, Parral, Chihuahua"). It is DISTRICT
      // CONTEXT — not a Kingsmen property — and is labelled so on screen.
      figure: { src: asset("district-la-prieta-p05.jpg"), aspect: 960 / 940, fit: "cover", caption: "District context · not a Kingsmen property", source: `Mina La Prieta · Parral, Chihuahua · ${DECK} p.5` },
    },

    teamPanel: { title: "Team // operators", tagline: "A leading Mexico exploration team", attribution: "Company description · corporate deck p.19" },
    logTitle: "System log // record & program",
    listings: LISTINGS,
    assetFacts: ASSET_FACTS,
    synthesisTitle: "Synthesis",
    // RESOLVE output wording. Scanning opens the Kingsmen page on MineEx (the configured destination) — the
    // copy never implies that scanning follows the company.
    output: {
      label: "Output // continue",
      headline: "Continue with Kingsmen",
      line: "Scan to continue with Kingsmen on MineEx",
      descriptor: "mineex.ca · Kingsmen Resources",
    },
  },
};

export default profile;
