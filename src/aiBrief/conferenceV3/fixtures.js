// conferenceV3/fixtures.js — QA FIXTURES for Conference Mode V3. Six fictional companies in the SOURCE
// profile shape that buildV3Model() reads, engineered to exercise every branch of the finished
// foundation (model.js / confGeo.js / confCoverage.js) WITHOUT any real company's name or branding.
//
// Coverage of the foundation, by design:
//   • BOTH resource shapes — FLAT {category,tonnes,grade,containedMetal,cutoff} and
//     ROWS {summary, rows:[{category,tonnes,grade,contained}]} — appear across the set.
//   • company types explorer / developer / producer are all present (via meta.archetype).
//   • real disclosed project coordinates (markers[] / coordinates{}) so geo.projects + resolveGeo "coords".
//   • REAL jurisdictions (BC, Nevada, Sonora, Ontario, Yukon, Antofagasta, Western Australia) so the geo
//     resolver finds Natural-Earth outlines.
//   • typed media DATA path — media.maps + media.all tagged by category — plus conference.gallery pools.
//   • honest sparsity (D) so coverage reports lots of FALLBACK and nothing is fabricated.
//   • content pressure (F) for layout limits: 8 projects, long names, 200+ word thesis, 8+ catalysts,
//     12+ leaders, multiple tickers, many images.
//
// Every profile carries a `conference` block (buildV3Model reads it for heroStat / thesis / why /
// highlights). Imagery references the dev demo images that already ship at /demo/monolith/cNN.jpg —
// reused across fixtures; this is a dev fixture exercising the typed-media data path, so standing the
// same files in under different category tags is intentional and fine.

const DI = "/demo/monolith/";
const img = (n) => DI + n + ".jpg";

// ── A — EXPLORER ──────────────────────────────────────────────────────────────────────────────────
// Gold explorer, British Columbia. Real drill rows (fictional holes), NO resource, disclosed coords via
// markers[] on the flagship, several typed-media categories + a project_map. archetype "Explorer".
const A = {
  label: "A · Explorer",
  note: "2–3 grassroots projects, real drill rows, no resource, disclosed coords, rich typed imagery.",
  profile: {
    company: {
      name: "Aurora Ridge Metals Corp.",
      listings: [{ ex: "TSXV", sym: "ARM" }],
      commodity: "Gold",
      jurisdiction: "British Columbia, Canada",
      slogan: "High-grade gold discovery in the Golden Triangle.",
      oneLiner: "Drill-stage gold explorer advancing three district-scale properties in northwest B.C.",
      stage: "Exploration",
      flagshipKey: "sundance",
    },
    meta: { archetype: "Explorer" },
    conference: {
      enabled: true,
      featuredProjectKey: "sundance",
      hook: "Aurora Ridge is chasing a bulk-tonnage gold system in one of the world's premier discovery districts, with a maiden drill program already returning broad, near-surface intercepts.",
      overview: "Three road-accessible properties in the Golden Triangle, anchored by the Sundance discovery where the 2025 program cut wide zones of visible gold from surface.",
      heroStatistic: { value: "18.4 g/t Au", label: "Best drill intercept", context: "over 6.2 m at Sundance, hole SD-25-014" },
      highlights: [
        { value: "42,000 m", label: "Drilling planned", context: "across two seasons" },
        { value: "3", label: "District-scale properties", context: "100% owned" },
        { value: "1,120 m", label: "Strike drilled", context: "system open along trend" },
      ],
      jurisdictionWidgets: { district: "Golden Triangle", provinceState: "British Columbia", commodity: "Gold" },
      evidenceType: "drilling",
      investmentCase: [
        { reason: "Near-surface, high-grade gold open in all directions" },
        { reason: "Tier-one jurisdiction with existing road and power access" },
        { reason: "Fully funded through the next 15,000 m drill campaign" },
        { reason: "Experienced discovery team with two prior district sales" },
      ],
      gallery: {
        overview: [img("c03")], results: [img("c11")], jurisdiction: [img("c07")], follow: [img("c05")],
      },
    },
    projects: [
      {
        key: "sundance", name: "Sundance", tag: "Drill-stage discovery",
        snapshot: {
          location: { value: "Golden Triangle, B.C.", detail: [["District", "Golden Triangle"], ["Province", "British Columbia"], ["Country", "Canada"]] },
          ownership: { value: "100%" }, commodity: { value: "Gold" }, land: { value: "184 km²" },
        },
        brief: { overview: "Bulk-tonnage gold discovery with visible gold logged from surface across a 1.1 km trend." },
        unique: { evidence: ["Near-surface visible gold", "Zone open along strike and at depth", "Road-accessible year-round"] },
        markers: [{ lat: 56.72, lon: -130.14 }],
        drillResults: { rows: [
          { hole: "SD-25-014", interval: "6.2 m", grade: "18.4 g/t Au", note: "from 41 m downhole" },
          { hole: "SD-25-011", interval: "22.0 m", grade: "4.31 g/t Au", note: "including 3.0 m at 21.7 g/t Au" },
          { hole: "SD-25-007", interval: "38.5 m", grade: "2.68 g/t Au", note: "broad near-surface zone" },
          { hole: "SD-25-003", interval: "9.4 m", grade: "6.05 g/t Au", note: "" },
          { hole: "SD-24-002", interval: "14.1 m", grade: "3.12 g/t Au", note: "discovery hole" },
        ] },
        gallery: [
          { src: img("c15"), category: "core" }, { src: img("c11"), category: "drilling" },
          { src: img("c07"), category: "project_map" },
        ],
      },
      {
        key: "keystone", name: "Keystone", tag: "Early exploration",
        snapshot: {
          location: { value: "Golden Triangle, B.C.", detail: [["District", "Golden Triangle"], ["Province", "British Columbia"], ["Country", "Canada"]] },
          ownership: { value: "100%" }, commodity: { value: "Gold-Silver" }, land: { value: "96 km²" },
        },
        brief: { overview: "Epithermal gold-silver target with multiple untested soil anomalies along a 4 km corridor." },
        unique: { evidence: ["Coincident gold-in-soil and IP anomalies", "No historical drilling"] },
        gallery: [{ src: img("c06"), category: "field" }],
      },
      {
        key: "granite-flat", name: "Granite Flat", tag: "Grassroots",
        snapshot: {
          location: { value: "Northwest B.C.", detail: [["District", "Stikine"], ["Province", "British Columbia"], ["Country", "Canada"]] },
          ownership: { value: "100%" }, commodity: { value: "Copper-Gold" }, land: { value: "61 km²" },
        },
        brief: { overview: "Porphyry copper-gold target defined by a 2 km magnetic high, drill-ready for 2026." },
        unique: { evidence: ["Untested porphyry-scale magnetic anomaly"] },
        gallery: [{ src: img("c08"), category: "field" }],
      },
    ],
    capital: {
      outstanding: "84.2M", fd: "97.6M", options: "8.1M", warrants: "5.3M",
      cash: "C$11.4M", debt: "None", marketCap: "C$46M",
      financing: [
        { amount: "C$12.0M", date: "Mar 2025", type: "Flow-through placement" },
        { amount: "C$6.5M", date: "Sep 2024", type: "Hard-dollar placement" },
      ],
    },
    team: [
      { name: "Dr. Elena Marchetti", role: "President & CEO" },
      { name: "Raymond Okoye", role: "VP Exploration" },
      { name: "Sofia Delgado", role: "CFO" },
      { name: "James Whitehorse", role: "Chief Geologist" },
    ],
    timeline: [
      { date: "2024", headline: "Sundance discovery hole SD-24-002", whyItMatters: "First drill hole cut visible gold, defining a new system." },
      { date: "2025", headline: "Phase-2 program returns 18.4 g/t Au over 6.2 m", whyItMatters: "Confirmed high-grade continuity along strike." },
    ],
    catalysts: [
      { timing: "Q1 2026", label: "Winter drill program (15,000 m)", impact: "Test strike and depth extensions" },
      { timing: "Q2 2026", label: "Maiden resource scoping", impact: "First estimate of scale" },
    ],
    media: {
      hero: img("c03"), logo: "",
      photos: { overview: [img("c03")], jurisdiction: [img("c07")], results: [img("c11")], follow: [img("c05")], project: [img("c15")] },
      maps: [{ url: img("c07"), category: "jurisdiction_map", project: "Sundance" }],
      all: [
        { url: img("c03"), category: "field", alt: "Camp overview" },
        { url: img("c11"), category: "drilling", alt: "Drill rig at Sundance" },
        { url: img("c15"), category: "core", alt: "Mineralised core" },
        { url: img("c07"), category: "jurisdiction_map", alt: "Property location map" },
        { url: img("c06"), category: "field", alt: "Keystone ridge" },
      ],
    },
  },
};

// ── B — DEVELOPER ─────────────────────────────────────────────────────────────────────────────────
// Nevada gold developer. FLAT structured resource on flagship, a PFS economics block, treasury,
// catalysts, milestones, featuredProjectKey. archetype "Developer".
const B = {
  label: "B · Developer",
  note: "Flagship + 2, FLAT resource, PFS economics, treasury, catalysts, milestones.",
  profile: {
    company: {
      name: "Cordillera Gold Corp.",
      listings: [{ ex: "TSX", sym: "CDG" }, { ex: "NYSE", sym: "CDGO" }],
      commodity: "Gold",
      jurisdiction: "Nevada, United States",
      slogan: "A permit-stage Nevada gold mine with robust economics.",
      oneLiner: "Advancing the Silverline gold project toward a construction decision under a completed pre-feasibility study.",
      stage: "Development",
      flagshipKey: "silverline",
    },
    meta: { archetype: "Developer" },
    conference: {
      enabled: true,
      featuredProjectKey: "silverline",
      hook: "Cordillera's Silverline project pairs a 2.9 Moz gold resource with a PFS that delivers a 34% after-tax IRR at conservative metal prices, in the world's best mining jurisdiction.",
      overview: "A permit-stage, open-pit heap-leach gold project in Nevada with a completed pre-feasibility study and two satellite deposits providing resource upside.",
      heroStatistic: { value: "US$612M", label: "After-tax NPV(5%)", context: "at US$1,900/oz gold (PFS, 2025)" },
      highlights: [
        { value: "34%", label: "After-tax IRR", context: "PFS base case" },
        { value: "2.9 Moz", label: "M&I gold resource", context: "flagship deposit" },
        { value: "2.1 yrs", label: "Payback", context: "after tax" },
      ],
      jurisdictionWidgets: { district: "Battle Mountain Trend", provinceState: "Nevada", commodity: "Gold" },
      evidenceType: "economics",
      investmentCase: [
        { reason: "Completed PFS with a 34% after-tax IRR" },
        { reason: "Tier-one jurisdiction, conventional heap-leach flowsheet" },
        { reason: "Fully permitted state water rights already secured" },
        { reason: "Two satellite deposits offer near-term resource growth" },
      ],
      gallery: {
        overview: [img("c02")], results: [img("c12")], jurisdiction: [img("c10")], follow: [img("c05")],
      },
    },
    projects: [
      {
        key: "silverline", name: "Silverline", tag: "Pre-feasibility",
        snapshot: {
          location: { value: "Battle Mountain Trend, Nevada", detail: [["District", "Battle Mountain Trend"], ["State", "Nevada"], ["Country", "United States"]] },
          ownership: { value: "100%" }, commodity: { value: "Gold" }, land: { value: "212 km²" },
        },
        brief: { overview: "Open-pit, heap-leach gold project with a completed PFS and a 12-year mine life." },
        unique: { evidence: ["2.9 Moz M&I resource", "Conventional heap-leach metallurgy (78% recovery)", "Permitting well advanced"] },
        coordinates: { lat: 40.62, lng: -117.05 },
        resource: {
          category: "Measured & Indicated", tonnes: "78.4 Mt", grade: "1.15 g/t Au",
          containedMetal: "2.9 Moz Au", cutoff: "0.30 g/t Au", units: "Au",
        },
        economics: {
          studyType: "Pre-Feasibility Study", effectiveDate: "Jun 2025",
          npv: "US$612M (after-tax, 5%)", irr: "34%", capex: "US$298M", payback: "2.1 years",
          mineLife: "12 years", aisc: "US$1,010/oz",
        },
        metallurgy: { recovery: "78% Au", method: "Run-of-mine heap leach" },
        gallery: [{ src: img("c12"), category: "core" }, { src: img("c10"), category: "project_map" }],
      },
      {
        key: "east-star", name: "East Star", tag: "Resource-stage satellite",
        snapshot: {
          location: { value: "Battle Mountain Trend, Nevada", detail: [["District", "Battle Mountain Trend"], ["State", "Nevada"], ["Country", "United States"]] },
          ownership: { value: "100%" }, commodity: { value: "Gold" }, land: { value: "44 km²" },
        },
        brief: { overview: "Satellite oxide deposit 9 km from Silverline, potential mill feed." },
        unique: { evidence: ["Within trucking distance of the planned Silverline pad"] },
        resource: { category: "Inferred", tonnes: "14.2 Mt", grade: "0.92 g/t Au", containedMetal: "0.42 Moz Au", cutoff: "0.25 g/t Au" },
        gallery: [{ src: img("c13"), category: "field" }],
      },
      {
        key: "juniper", name: "Juniper", tag: "Exploration",
        snapshot: {
          location: { value: "Lander County, Nevada", detail: [["District", "Cortez Trend"], ["State", "Nevada"], ["Country", "United States"]] },
          ownership: { value: "70%" }, commodity: { value: "Gold" }, land: { value: "38 km²" },
        },
        brief: { overview: "Carlin-style exploration target along the Cortez Trend." },
        unique: { evidence: ["Untested along-trend jasperoid alteration"] },
        gallery: [{ src: img("c08"), category: "field" }],
      },
    ],
    capital: {
      outstanding: "168.9M", fd: "191.4M", options: "12.2M", warrants: "10.3M",
      cash: "US$54.0M", debt: "US$18.0M", marketCap: "US$430M", ownership: "Institutions 61%",
      financing: [
        { amount: "US$40.0M", date: "Feb 2025", type: "Bought-deal equity" },
        { amount: "US$18.0M", date: "Nov 2024", type: "Convertible debenture" },
      ],
    },
    team: [
      { name: "Marcus Fielder", role: "CEO" }, { name: "Priya Raman", role: "COO" },
      { name: "David Chen", role: "CFO" }, { name: "Anna Kowalski", role: "VP Projects" },
      { name: "Thomas Beaulieu", role: "VP Permitting" },
    ],
    timeline: [
      { date: "2023", headline: "Maiden 2.4 Moz resource at Silverline", whyItMatters: "Established project scale." },
      { date: "2024", headline: "PEA delivers positive economics", whyItMatters: "De-risked the development concept." },
      { date: "2025", headline: "PFS: US$612M NPV, 34% IRR", whyItMatters: "Advanced the project to a construction decision path." },
    ],
    catalysts: [
      { timing: "Q2 2026", label: "Feasibility study kickoff", impact: "Final technical de-risking" },
      { timing: "Q3 2026", label: "Record of Decision (federal permit)", impact: "Clears the path to construction" },
      { timing: "Q4 2026", label: "Project financing package", impact: "Funds construction" },
    ],
    media: {
      hero: img("c02"), logo: "",
      photos: { overview: [img("c02")], jurisdiction: [img("c10")], results: [img("c12")], follow: [img("c05")], project: [img("c13")] },
      maps: [{ url: img("c10"), category: "project_map", project: "Silverline" }],
      all: [
        { url: img("c02"), category: "infrastructure", alt: "Project site" },
        { url: img("c12"), category: "core", alt: "Oxide gold ore" },
        { url: img("c10"), category: "project_map", alt: "Silverline pit layout" },
        { url: img("c13"), category: "field", alt: "East Star outcrop" },
      ],
    },
  },
};

// ── C — PRODUCER ──────────────────────────────────────────────────────────────────────────────────
// Sonora copper producer. Full production block, reserves via resource.category "Proven & Probable",
// guidance + expansion catalysts, operations. archetype "Producer".
const C = {
  label: "C · Producer",
  note: "Full production block, P&P reserves, guidance + expansion catalysts, operating mine.",
  profile: {
    company: {
      name: "Cobreverde Resources Ltd.",
      listings: [{ ex: "TSX", sym: "CBV" }],
      commodity: "Copper",
      jurisdiction: "Sonora, Mexico",
      slogan: "A cash-generating copper producer with a decade-plus reserve life.",
      oneLiner: "Operating the Verde Grande open-pit copper mine in Sonora with a fully funded expansion underway.",
      stage: "Production",
      flagshipKey: "verde-grande",
    },
    meta: { archetype: "Producer" },
    conference: {
      enabled: true,
      featuredProjectKey: "verde-grande",
      hook: "Cobreverde runs a profitable open-pit copper mine in Sonora, generating free cash flow at a sub-US$2.00/lb cash cost, with an expansion set to lift output by 40%.",
      overview: "The Verde Grande mine is a conventional open-pit, SX-EW copper operation in Sonora, Mexico, backed by a 13-year proven-and-probable reserve and a sanctioned Phase-2 expansion.",
      heroStatistic: { value: "92,000 t", label: "Annual copper output", context: "2025 guidance, cathode" },
      highlights: [
        { value: "US$1.84/lb", label: "C1 cash cost", context: "2025 year-to-date" },
        { value: "13 yrs", label: "Reserve life", context: "proven & probable" },
        { value: "US$148M", label: "2024 free cash flow", context: "at realised prices" },
      ],
      jurisdictionWidgets: { district: "Sonora Copper Belt", provinceState: "Sonora", commodity: "Copper" },
      evidenceType: "production",
      investmentCase: [
        { reason: "Established free-cash-flow producer at low cash cost" },
        { reason: "13-year P&P reserve underpins the mine plan" },
        { reason: "Fully funded Phase-2 expansion lifts output 40%" },
        { reason: "Long-life SX-EW cathode operation, no smelter exposure" },
      ],
      gallery: {
        overview: [img("c01")], results: [img("c14")], jurisdiction: [img("c10")], follow: [img("c05")],
      },
    },
    projects: [
      {
        key: "verde-grande", name: "Verde Grande", tag: "Operating mine",
        snapshot: {
          location: { value: "Sonora Copper Belt, Mexico", detail: [["District", "Sonora Copper Belt"], ["State", "Sonora"], ["Country", "Mexico"]] },
          ownership: { value: "100%" }, commodity: { value: "Copper" }, land: { value: "340 km²" },
        },
        brief: { overview: "Open-pit SX-EW copper mine producing LME-grade cathode, in operation since 2018." },
        unique: { evidence: ["Sub-US$2.00/lb cash cost", "13-year P&P reserve", "Phase-2 expansion sanctioned"] },
        coordinates: { lat: 29.74, lng: -110.31 },
        resource: {
          category: "Proven & Probable", tonnes: "412 Mt", grade: "0.41% Cu",
          containedMetal: "1.69 Mt Cu", cutoff: "0.18% Cu", units: "Cu",
        },
        production: {
          reportingBasis: "100% owned", period: "FY2025 guidance",
          annualOutput: "92,000 t Cu cathode", throughput: "38,000 t/day ore",
          recovery: "84% Cu", aisc: "US$2.35/lb", cashCost: "US$1.84/lb",
          freeCashFlow: "US$148M (2024)", reserveLife: "13 years",
        },
        metallurgy: { recovery: "84% Cu", method: "Heap leach + SX-EW" },
        gallery: [{ src: img("c01"), category: "infrastructure" }, { src: img("c10"), category: "project_map" }],
      },
      {
        key: "la-cañada", name: "La Cañada", tag: "Development / expansion",
        snapshot: {
          location: { value: "Sonora, Mexico", detail: [["District", "Sonora Copper Belt"], ["State", "Sonora"], ["Country", "Mexico"]] },
          ownership: { value: "100%" }, commodity: { value: "Copper" }, land: { value: "88 km²" },
        },
        brief: { overview: "Adjacent oxide deposit feeding the Phase-2 expansion of the Verde Grande leach pads." },
        unique: { evidence: ["Shares infrastructure with the operating mine"] },
        resource: {
          summary: "Phase-2 expansion feed, reported at a 0.15% Cu cut-off.",
          rows: [
            { category: "Measured", tonnes: "64 Mt", grade: "0.38% Cu", contained: "0.24 Mt Cu" },
            { category: "Indicated", tonnes: "91 Mt", grade: "0.34% Cu", contained: "0.31 Mt Cu" },
          ],
        },
        gallery: [{ src: img("c14"), category: "field" }],
      },
    ],
    capital: {
      outstanding: "241.0M", fd: "252.5M", options: "9.0M", warrants: "2.5M",
      cash: "US$96.0M", debt: "US$60.0M", marketCap: "US$1.1B", ownership: "Insiders 8% · Institutions 55%",
      financing: [
        { amount: "US$120M", date: "2023", type: "Revolving credit facility" },
      ],
    },
    team: [
      { name: "Isabella Moreno", role: "CEO" }, { name: "Robert Hastings", role: "CFO" },
      { name: "Miguel Ángel Ruiz", role: "General Manager, Verde Grande" }, { name: "Karen Osei", role: "VP Sustainability" },
      { name: "Daniel Park", role: "VP Technical Services" },
    ],
    timeline: [
      { date: "2018", headline: "First cathode at Verde Grande", whyItMatters: "Transitioned to producer." },
      { date: "2023", headline: "Reserve life extended to 13 years", whyItMatters: "Underpinned long-term cash flow." },
      { date: "2025", headline: "Phase-2 expansion sanctioned", whyItMatters: "40% output growth funded from cash flow." },
    ],
    catalysts: [
      { timing: "2026", label: "FY2026 production guidance", impact: "Sets market output expectations" },
      { timing: "H2 2026", label: "Phase-2 expansion first ore", impact: "Steps output toward 130,000 t/yr" },
      { timing: "2027", label: "La Cañada reserve conversion", impact: "Extends mine life further" },
    ],
    media: {
      hero: img("c01"), logo: "",
      photos: { overview: [img("c01")], jurisdiction: [img("c10")], results: [img("c14")], follow: [img("c05")], project: [img("c02")] },
      maps: [{ url: img("c10"), category: "project_map", project: "Verde Grande" }],
      all: [
        { url: img("c01"), category: "infrastructure", alt: "SX-EW plant" },
        { url: img("c14"), category: "field", alt: "Open pit" },
        { url: img("c10"), category: "project_map", alt: "Mine layout" },
        { url: img("c02"), category: "infrastructure", alt: "Leach pads" },
      ],
    },
  },
};

// ── D — SPARSE ────────────────────────────────────────────────────────────────────────────────────
// One project, one image, NO resource, NO drills, minimal technical data. Coverage-honest: many
// FALLBACK, nothing fabricated. archetype "Prospect Generator" (→ explorer).
const D = {
  label: "D · Sparse",
  note: "One project, ~1 image, no resource, no drills, short thesis — coverage-honest, many FALLBACK.",
  profile: {
    company: {
      name: "Northwind Exploration Inc.",
      listings: [{ ex: "CSE", sym: "NWE" }],
      commodity: "Gold",
      jurisdiction: "Yukon, Canada",
      slogan: "Early-stage gold prospecting in the Yukon.",
      oneLiner: "A prospect generator with one grassroots gold property in the Yukon.",
      stage: "Exploration",
      flagshipKey: "moose-creek",
    },
    meta: { archetype: "Prospect Generator" },
    conference: {
      enabled: true,
      featuredProjectKey: "moose-creek",
      hook: "Northwind is a lean prospect generator advancing a single early-stage gold property in the Yukon toward its first drill test.",
      overview: "One 100%-owned grassroots gold property with encouraging surface geochemistry and no drilling to date.",
      // No curated headline statistic — a genuinely grassroots shell. Its STRONGEST MATERIAL EVIDENCE is the
      // structured geophysics/sampling story, not a drill hole and not a padded hero number.
      highlights: [
        { value: "48 km²", label: "Land package", context: "contiguous claims" },
      ],
      jurisdictionWidgets: { district: "Tintina Gold Belt", provinceState: "Yukon", commodity: "Gold" },
      evidenceType: "geochemistry",
      // intentionally NO investmentCase — a genuinely grassroots shell; the "investment" concept
      // should fall back honestly rather than be padded.
      investmentCase: [],
      gallery: {
        overview: [img("c06")],
      },
    },
    projects: [
      {
        key: "moose-creek", name: "Moose Creek", tag: "Grassroots",
        snapshot: {
          location: { value: "Tintina Gold Belt, Yukon", detail: [["District", "Tintina Gold Belt"], ["Territory", "Yukon"], ["Country", "Canada"]] },
          ownership: { value: "100%" }, commodity: { value: "Gold" }, land: { value: "48 km²" },
        },
        brief: { overview: "Grassroots gold property with anomalous gold-in-soil results; undrilled." },
        unique: { evidence: ["Gold-in-soil anomaly over 2 km"] },
        // Structured NON-DRILL evidence — a pre-drill explorer's strongest material evidence is its geophysics
        // + sampling, not a drill hole. Exercises the evidence layer without any drill-result architecture.
        geophysics: { method: "Airborne magnetics + ground IP", result: "1.8 km coincident IP chargeability–magnetic anomaly, untested", summary: "A 1,000 line-km airborne magnetic survey plus follow-up ground IP defined a 1.8 km coincident chargeability and magnetic-low anomaly along the interpreted Tintina structural corridor — the primary undrilled target." },
        sampling: { bestResult: "12.4 g/t Au rock chip", summary: "Rock-chip sampling returned up to 12.4 g/t Au from quartz-sulphide float across the anomaly." },
        gallery: [{ src: img("c06"), category: "field" }],
      },
    ],
    capital: {
      outstanding: "22.0M", cash: "C$0.8M", debt: "None",
    },
    team: [
      { name: "Gordon Pyle", role: "President & CEO" },
    ],
    timeline: [],       // no milestones disclosed → FALLBACK
    catalysts: [],      // no catalysts disclosed → FALLBACK
    media: {
      hero: img("c06"), logo: "",
      photos: { overview: [img("c06")] },
      maps: [],
      all: [{ url: img("c06"), category: "field", alt: "Moose Creek ridge" }],
    },
  },
};

// ── E — MULTI-ASSET ───────────────────────────────────────────────────────────────────────────────
// 5–6 projects across multiple real jurisdictions, mixed commodities, one flagship, mixed resource
// shapes (FLAT + ROWS), a couple drill-only. Stresses portfolio architecture. archetype "Developer".
const E = {
  label: "E · Multi-asset",
  note: "6 projects across Nevada/Ontario/Sonora/Antofagasta, mixed commodities, mixed resource shapes.",
  profile: {
    company: {
      name: "Meridian Metals Group Ltd.",
      listings: [{ ex: "TSX", sym: "MMG" }, { ex: "OTCQX", sym: "MMGX" }],
      commodity: "Gold, Copper, Silver",
      jurisdiction: "Nevada, United States",
      slogan: "A diversified precious- and base-metals portfolio across the Americas.",
      oneLiner: "Six projects spanning exploration to development across Nevada, Ontario, Sonora and Antofagasta.",
      stage: "Development",
      flagshipKey: "goldstrike-ridge",
    },
    meta: { archetype: "Developer" },
    conference: {
      enabled: true,
      featuredProjectKey: "goldstrike-ridge",
      hook: "Meridian holds a balanced, multi-jurisdiction portfolio anchored by the development-stage Goldstrike Ridge deposit, with resource growth and discovery upside across four countries.",
      overview: "A diversified metals developer with six assets: a flagship Nevada gold development, an Ontario resource, a Sonora silver deposit, an Antofagasta copper discovery, and two earlier-stage projects.",
      heroStatistic: { value: "4.6 Moz AuEq", label: "Global resource", context: "across the portfolio, all categories" },
      highlights: [
        { value: "6", label: "Projects", context: "4 jurisdictions" },
        { value: "3", label: "Metals", context: "Au · Cu · Ag" },
        { value: "US$410M", label: "Flagship NPV", context: "PEA, after-tax" },
      ],
      jurisdictionWidgets: { district: "Multiple", provinceState: "Nevada", commodity: "Gold, Copper, Silver" },
      evidenceType: "resource",
      investmentCase: [
        { reason: "Diversified across metals and stable jurisdictions" },
        { reason: "Flagship at PEA stage with clear path to PFS" },
        { reason: "Multiple resource-growth and discovery catalysts" },
        { reason: "Portfolio optionality: spin-out or JV candidates" },
      ],
      gallery: {
        overview: [img("c02")], results: [img("c12")], jurisdiction: [img("c10")], follow: [img("c05")],
      },
    },
    projects: [
      {
        key: "goldstrike-ridge", name: "Goldstrike Ridge", tag: "Development (PEA)",
        snapshot: {
          location: { value: "Eureka County, Nevada", detail: [["District", "Cortez Trend"], ["State", "Nevada"], ["Country", "United States"]] },
          ownership: { value: "100%" }, commodity: { value: "Gold" }, land: { value: "156 km²" },
        },
        brief: { overview: "Flagship open-pit gold development with a completed PEA." },
        unique: { evidence: ["2.1 Moz M&I gold resource", "Positive PEA economics"] },
        coordinates: { lat: 40.05, lng: -116.38 },
        resource: { category: "Measured & Indicated", tonnes: "61 Mt", grade: "1.07 g/t Au", containedMetal: "2.1 Moz Au", cutoff: "0.30 g/t Au" },
        economics: { studyType: "Preliminary Economic Assessment", effectiveDate: "2025", npv: "US$410M (after-tax)", irr: "29%", payback: "2.6 years", mineLife: "11 years" },
        gallery: [{ src: img("c12"), category: "core" }, { src: img("c10"), category: "project_map" }],
      },
      {
        key: "red-lake-north", name: "Red Lake North", tag: "Resource-stage",
        snapshot: {
          location: { value: "Red Lake, Ontario", detail: [["District", "Red Lake"], ["Province", "Ontario"], ["Country", "Canada"]] },
          ownership: { value: "100%" }, commodity: { value: "Gold" }, land: { value: "72 km²" },
        },
        brief: { overview: "High-grade underground gold resource in the Red Lake camp." },
        unique: { evidence: ["High-grade Archean gold system"] },
        coordinates: { lat: 51.06, lng: -93.79 },
        resource: {
          summary: "Underground resource reported at a 3.0 g/t Au cut-off.",
          rows: [
            { category: "Indicated", tonnes: "3.1 Mt", grade: "9.4 g/t Au", contained: "0.94 Moz Au" },
            { category: "Inferred", tonnes: "2.2 Mt", grade: "8.1 g/t Au", contained: "0.57 Moz Au" },
          ],
        },
        gallery: [{ src: img("c15"), category: "core" }],
      },
      {
        key: "plata-alta", name: "Plata Alta", tag: "Resource-stage",
        snapshot: {
          location: { value: "Sonora, Mexico", detail: [["District", "Sonora Silver Belt"], ["State", "Sonora"], ["Country", "Mexico"]] },
          ownership: { value: "80%" }, commodity: { value: "Silver" }, land: { value: "54 km²" },
        },
        brief: { overview: "Epithermal silver deposit with resource-expansion potential." },
        unique: { evidence: ["Open at depth below the current resource"] },
        coordinates: { lat: 29.11, lng: -110.98 },
        resource: { category: "Inferred", tonnes: "18 Mt", grade: "142 g/t Ag", containedMetal: "82 Moz Ag", cutoff: "50 g/t Ag" },
        gallery: [{ src: img("c13"), category: "field" }],
      },
      {
        key: "sierra-azul", name: "Sierra Azul", tag: "Drill-stage discovery",
        snapshot: {
          location: { value: "Antofagasta, Chile", detail: [["District", "Antofagasta"], ["Region", "Antofagasta"], ["Country", "Chile"]] },
          ownership: { value: "100%" }, commodity: { value: "Copper" }, land: { value: "220 km²" },
        },
        brief: { overview: "Porphyry copper discovery in the Antofagasta belt." },
        unique: { evidence: ["Broad copper porphyry intercepts from surface"] },
        markers: [{ lat: -23.61, lon: -69.22 }],
        drillResults: { rows: [
          { hole: "SA-25-001", interval: "312 m", grade: "0.58% Cu", note: "from 24 m, porphyry discovery" },
          { hole: "SA-25-004", interval: "188 m", grade: "0.71% Cu", note: "including 40 m at 1.1% Cu" },
          { hole: "SA-25-006", interval: "244 m", grade: "0.49% Cu", note: "" },
        ] },
        gallery: [{ src: img("c11"), category: "drilling" }],
      },
      {
        key: "coyote-wash", name: "Coyote Wash", tag: "Exploration",
        snapshot: {
          location: { value: "Nye County, Nevada", detail: [["District", "Walker Lane"], ["State", "Nevada"], ["Country", "United States"]] },
          ownership: { value: "100%" }, commodity: { value: "Gold-Silver" }, land: { value: "41 km²" },
        },
        brief: { overview: "Low-sulphidation epithermal gold-silver target, drill-ready." },
        unique: { evidence: ["Sinter and vein textures at surface"] },
        drillResults: { rows: [
          { hole: "CW-24-002", interval: "11.5 m", grade: "3.9 g/t Au", note: "first-pass drilling" },
        ] },
        gallery: [{ src: img("c08"), category: "field" }],
      },
      {
        key: "timmins-east", name: "Timmins East", tag: "Grassroots",
        snapshot: {
          location: { value: "Timmins, Ontario", detail: [["District", "Abitibi"], ["Province", "Ontario"], ["Country", "Canada"]] },
          ownership: { value: "60%" }, commodity: { value: "Gold" }, land: { value: "33 km²" },
        },
        brief: { overview: "Grassroots Abitibi gold property under option." },
        unique: { evidence: ["Along-strike from producing mines"] },
        gallery: [{ src: img("c06"), category: "field" }],
      },
    ],
    capital: {
      outstanding: "312.0M", fd: "345.0M", options: "18.0M", warrants: "15.0M",
      cash: "US$72.0M", debt: "US$20.0M", marketCap: "US$780M", ownership: "Institutions 48%",
      financing: [
        { amount: "US$50M", date: "Jan 2025", type: "Strategic placement" },
        { amount: "US$22M", date: "Aug 2024", type: "Equity financing" },
      ],
    },
    team: [
      { name: "Helena Voss", role: "CEO" }, { name: "Arjun Nair", role: "President" },
      { name: "Grace Liu", role: "CFO" }, { name: "Felipe Torres", role: "VP Exploration, South America" },
      { name: "Nathan Cole", role: "VP Development" }, { name: "Rebecca Stone", role: "VP Investor Relations" },
    ],
    timeline: [
      { date: "2023", headline: "Portfolio consolidated via three acquisitions", whyItMatters: "Created a diversified base." },
      { date: "2024", headline: "Sierra Azul copper discovery", whyItMatters: "Added a new growth vector." },
      { date: "2025", headline: "Goldstrike Ridge PEA delivered", whyItMatters: "Established the flagship's value." },
    ],
    catalysts: [
      { timing: "Q1 2026", label: "Sierra Azul resource estimate", impact: "First scale on the copper discovery" },
      { timing: "Q2 2026", label: "Goldstrike Ridge PFS start", impact: "Advances the flagship" },
      { timing: "Q3 2026", label: "Plata Alta infill drilling", impact: "Upgrades silver resource confidence" },
      { timing: "Q4 2026", label: "Coyote Wash maiden drill program", impact: "Tests a new discovery target" },
    ],
    media: {
      hero: img("c02"), logo: "",
      photos: { overview: [img("c02")], jurisdiction: [img("c10")], results: [img("c12")], follow: [img("c05")], project: [img("c15")] },
      maps: [
        { url: img("c10"), category: "project_map", project: "Goldstrike Ridge" },
        { url: img("c07"), category: "jurisdiction_map", project: "Sierra Azul" },
      ],
      all: [
        { url: img("c02"), category: "infrastructure", alt: "Goldstrike Ridge site" },
        { url: img("c12"), category: "core", alt: "Gold ore" },
        { url: img("c15"), category: "core", alt: "Red Lake high-grade core" },
        { url: img("c11"), category: "drilling", alt: "Sierra Azul drilling" },
        { url: img("c10"), category: "project_map", alt: "Portfolio map" },
        { url: img("c07"), category: "jurisdiction_map", alt: "South America assets" },
        { url: img("c13"), category: "field", alt: "Plata Alta" },
        { url: img("c08"), category: "field", alt: "Coyote Wash" },
      ],
    },
  },
};

// ── F — PRESSURE / EXCESS ─────────────────────────────────────────────────────────────────────────
// Deliberately extreme: 8 projects, very long names, 200+ word hook, 8+ catalysts, 12+ leaders,
// multiple tickers, several resources, many images. Layout-limit stress test. archetype "Developer".
const F = {
  label: "F · Pressure / Excess",
  note: "8 projects, long names, 200+ word thesis, 8+ catalysts, 12+ leaders, many images — layout stress.",
  profile: {
    company: {
      name: "Transcontinental Consolidated Precious & Base Metals Exploration and Development Holdings Corporation",
      listings: [
        { ex: "TSX", sym: "TCX" }, { ex: "NYSE American", sym: "TCXH" },
        { ex: "ASX", sym: "TCX" }, { ex: "Frankfurt", sym: "T7X" },
      ],
      commodity: "Gold, Copper, Silver, Zinc",
      jurisdiction: "Western Australia, Australia",
      slogan: "One of the most broadly diversified multi-commodity, multi-jurisdiction mineral exploration and development portfolios on the market today.",
      oneLiner: "An intentionally sprawling eight-project portfolio spanning four commodities and multiple continents, assembled to stress every layout limit of the presentation system.",
      stage: "Development",
      flagshipKey: "great-southern-consolidated",
    },
    meta: { archetype: "Developer" },
    conference: {
      enabled: true,
      featuredProjectKey: "great-southern-consolidated",
      hook: "Transcontinental Consolidated is a deliberately maximal mineral-resource enterprise whose portfolio has been assembled across an unusually broad range of commodities, development stages and jurisdictions, and whose corporate narrative is intentionally long in order to exercise the outer bounds of any presentation layout that must render it. The company controls eight distinct projects spanning gold, copper, silver and zinc, ranging from grassroots greenfields prospects with nothing more than encouraging surface geochemistry through to advanced, feasibility-stage development assets carrying multi-million-ounce and multi-billion-pound contained-metal endowments. These assets are distributed across Western Australia, Nevada, Ontario, Sonora and the Antofagasta region of northern Chile, which means the company simultaneously carries jurisdictional exposure to some of the most established and most prospective mining districts on the planet. Management's strategy is to advance the flagship Great Southern Consolidated development toward a construction decision while systematically de-risking the mid-tier resource assets, drilling the discovery-stage properties aggressively, and retaining optionality on the earliest-stage ground through joint ventures and potential spin-outs. The investment thesis rests on scale, diversification and catalyst density: at any given moment several projects are expected to be delivering drill results, resource updates, economic studies or permitting milestones, so that news flow is continuous rather than episodic. This paragraph is intentionally verbose to confirm that the layout can absorb a very long thesis without breaking, truncating awkwardly, or overflowing its container.",
      overview: "Eight projects, four commodities, five jurisdictions — from grassroots to feasibility — engineered as a maximal content-pressure case for the layout engine.",
      heroStatistic: { value: "11.8 Moz AuEq", label: "Aggregate portfolio resource", context: "all categories, all commodities, gold-equivalent" },
      highlights: [
        { value: "8", label: "Projects", context: "5 jurisdictions" },
        { value: "4", label: "Commodities", context: "Au · Cu · Ag · Zn" },
        { value: "US$1.9B", label: "Aggregate contained-metal value", context: "in-situ, indicative" },
        { value: "31", label: "Rigs deployed (peak)", context: "across the portfolio" },
      ],
      jurisdictionWidgets: { district: "Multiple", provinceState: "Western Australia", commodity: "Gold, Copper, Silver, Zinc" },
      evidenceType: "resource",
      investmentCase: [
        { reason: "Extreme diversification across four commodities and five jurisdictions" },
        { reason: "Continuous catalyst density from eight simultaneously active projects" },
        { reason: "Flagship at feasibility stage with billion-dollar-scale NPV" },
        { reason: "Deep bench of resource assets available for JV or spin-out" },
      ],
      gallery: {
        overview: [img("c02"), img("c03")], results: [img("c12"), img("c11")],
        jurisdiction: [img("c10"), img("c07")], follow: [img("c05"), img("c06")],
      },
    },
    projects: [
      {
        key: "great-southern-consolidated", name: "Great Southern Consolidated Gold & Base Metals Development Project", tag: "Feasibility",
        snapshot: {
          location: { value: "Eastern Goldfields, Western Australia", detail: [["District", "Eastern Goldfields"], ["State", "Western Australia"], ["Country", "Australia"]] },
          ownership: { value: "100%" }, commodity: { value: "Gold" }, land: { value: "486 km²" },
        },
        brief: { overview: "Flagship feasibility-stage open-pit and underground gold development with a multi-million-ounce reserve." },
        unique: { evidence: ["5.4 Moz P&P reserve", "Completed feasibility study", "Grid power and rail access"] },
        markers: [{ lat: -30.75, lon: 121.47 }],
        resource: { category: "Proven & Probable", tonnes: "142 Mt", grade: "1.18 g/t Au", containedMetal: "5.4 Moz Au", cutoff: "0.40 g/t Au" },
        economics: { studyType: "Feasibility Study", effectiveDate: "2025", npv: "US$1.42B (after-tax)", irr: "31%", capex: "US$690M", payback: "3.1 years", mineLife: "16 years", aisc: "US$980/oz" },
        gallery: [{ src: img("c12"), category: "core" }, { src: img("c10"), category: "project_map" }, { src: img("c02"), category: "infrastructure" }],
      },
      {
        key: "northern-frontier-porphyry", name: "Northern Frontier Regional Copper-Gold Porphyry Exploration Complex", tag: "Development (PFS)",
        snapshot: {
          location: { value: "Antofagasta, Chile", detail: [["District", "Antofagasta"], ["Region", "Antofagasta"], ["Country", "Chile"]] },
          ownership: { value: "100%" }, commodity: { value: "Copper-Gold" }, land: { value: "410 km²" },
        },
        brief: { overview: "Large copper-gold porphyry with a completed pre-feasibility study." },
        unique: { evidence: ["3.2 Blb contained copper", "Bulk-tonnage porphyry"] },
        markers: [{ lat: -23.44, lon: -69.05 }],
        resource: {
          summary: "Porphyry resource at a 0.20% CuEq cut-off.",
          rows: [
            { category: "Measured", tonnes: "310 Mt", grade: "0.44% Cu", contained: "3.0 Blb Cu" },
            { category: "Indicated", tonnes: "520 Mt", grade: "0.39% Cu", contained: "4.5 Blb Cu" },
            { category: "Inferred", tonnes: "280 Mt", grade: "0.35% Cu", contained: "2.2 Blb Cu" },
          ],
        },
        economics: { studyType: "Pre-Feasibility Study", npv: "US$980M (after-tax)", irr: "22%", mineLife: "24 years" },
        gallery: [{ src: img("c14"), category: "field" }, { src: img("c07"), category: "jurisdiction_map" }],
      },
      {
        key: "silverback-highlands", name: "Silverback Highlands District Epithermal Silver-Gold Property", tag: "Resource-stage",
        snapshot: {
          location: { value: "Sonora, Mexico", detail: [["District", "Sonora Silver Belt"], ["State", "Sonora"], ["Country", "Mexico"]] },
          ownership: { value: "75%" }, commodity: { value: "Silver-Gold" }, land: { value: "128 km²" },
        },
        brief: { overview: "District-scale epithermal silver-gold resource." },
        unique: { evidence: ["120 Moz silver-equivalent resource"] },
        markers: [{ lat: 28.94, lon: -110.62 }],
        resource: { category: "Indicated", tonnes: "26 Mt", grade: "168 g/t AgEq", containedMetal: "140 Moz AgEq", cutoff: "60 g/t AgEq" },
        gallery: [{ src: img("c13"), category: "core" }],
      },
      {
        key: "cariboo-deep", name: "Cariboo Deep Underground High-Grade Gold Vein System Project", tag: "Drill-stage",
        snapshot: {
          location: { value: "Red Lake, Ontario", detail: [["District", "Red Lake"], ["Province", "Ontario"], ["Country", "Canada"]] },
          ownership: { value: "100%" }, commodity: { value: "Gold" }, land: { value: "64 km²" },
        },
        brief: { overview: "High-grade underground gold vein system, actively drilling." },
        unique: { evidence: ["Bonanza-grade intercepts at depth"] },
        markers: [{ lat: 51.03, lon: -93.71 }],
        drillResults: { rows: [
          { hole: "CD-25-088", interval: "4.2 m", grade: "62.4 g/t Au", note: "including 1.0 m at 210 g/t Au" },
          { hole: "CD-25-081", interval: "6.9 m", grade: "18.7 g/t Au", note: "" },
          { hole: "CD-25-074", interval: "3.1 m", grade: "41.2 g/t Au", note: "" },
          { hole: "CD-25-066", interval: "8.8 m", grade: "12.0 g/t Au", note: "" },
        ] },
        gallery: [{ src: img("c15"), category: "core" }],
      },
      {
        key: "desert-thunder", name: "Desert Thunder Regional Carlin-Style Gold Exploration Land Package", tag: "Drill-stage",
        snapshot: {
          location: { value: "Eureka County, Nevada", detail: [["District", "Cortez Trend"], ["State", "Nevada"], ["Country", "United States"]] },
          ownership: { value: "100%" }, commodity: { value: "Gold" }, land: { value: "198 km²" },
        },
        brief: { overview: "Carlin-style gold exploration package with early drill success." },
        unique: { evidence: ["Sediment-hosted gold along a major trend"] },
        markers: [{ lat: 40.12, lon: -116.22 }],
        drillResults: { rows: [
          { hole: "DT-25-020", interval: "48 m", grade: "2.1 g/t Au", note: "oxide, from 30 m" },
          { hole: "DT-25-013", interval: "22 m", grade: "3.4 g/t Au", note: "" },
        ] },
        gallery: [{ src: img("c08"), category: "field" }],
      },
      {
        key: "blue-mountain-zinc", name: "Blue Mountain Sedimentary Exhalative Zinc-Lead-Silver Deposit", tag: "Resource-stage",
        snapshot: {
          location: { value: "Eastern Goldfields, Western Australia", detail: [["District", "Eastern Goldfields"], ["State", "Western Australia"], ["Country", "Australia"]] },
          ownership: { value: "90%" }, commodity: { value: "Zinc" }, land: { value: "77 km²" },
        },
        brief: { overview: "SEDEX zinc-lead-silver resource with base-metal upside." },
        unique: { evidence: ["High-grade zinc-lead lenses"] },
        markers: [{ lat: -30.41, lon: 121.02 }],
        resource: {
          summary: "SEDEX resource at a 3% ZnEq cut-off.",
          rows: [
            { category: "Indicated", tonnes: "12 Mt", grade: "8.4% ZnEq", contained: "2.2 Blb ZnEq" },
            { category: "Inferred", tonnes: "8 Mt", grade: "7.1% ZnEq", contained: "1.3 Blb ZnEq" },
          ],
        },
        gallery: [{ src: img("c14"), category: "core" }],
      },
      {
        key: "eagle-pass-greenfields", name: "Eagle Pass Greenfields Copper-Gold Generative Exploration Ground", tag: "Grassroots",
        snapshot: {
          location: { value: "Nye County, Nevada", detail: [["District", "Walker Lane"], ["State", "Nevada"], ["Country", "United States"]] },
          ownership: { value: "100%" }, commodity: { value: "Copper-Gold" }, land: { value: "112 km²" },
        },
        brief: { overview: "Generative greenfields copper-gold ground with early-stage targets." },
        unique: { evidence: ["Multiple untested geophysical anomalies"] },
        gallery: [{ src: img("c06"), category: "field" }],
      },
      {
        key: "timberline-generative", name: "Timberline Generative Abitibi Greenstone Belt Gold Prospect Portfolio", tag: "Grassroots",
        snapshot: {
          location: { value: "Timmins, Ontario", detail: [["District", "Abitibi"], ["Province", "Ontario"], ["Country", "Canada"]] },
          ownership: { value: "51%" }, commodity: { value: "Gold" }, land: { value: "58 km²" },
        },
        brief: { overview: "Grassroots Abitibi greenstone gold prospects under option." },
        unique: { evidence: ["Favourable structural setting"] },
        gallery: [{ src: img("c03"), category: "field" }],
      },
    ],
    capital: {
      outstanding: "612.0M", fd: "704.0M", options: "48.0M", warrants: "44.0M",
      cash: "US$140.0M", debt: "US$85.0M", marketCap: "US$2.4B", ownership: "Institutions 52% · Insiders 6%",
      financing: [
        { amount: "US$90M", date: "Mar 2025", type: "Bought-deal equity" },
        { amount: "US$60M", date: "Oct 2024", type: "Strategic investment" },
        { amount: "US$45M", date: "May 2024", type: "Convertible note" },
        { amount: "US$30M", date: "Jan 2024", type: "Flow-through" },
      ],
    },
    team: [
      { name: "Alexandra Whitfield", role: "Executive Chair" },
      { name: "Sebastián Ibáñez", role: "Chief Executive Officer" },
      { name: "Margaret O'Sullivan", role: "President" },
      { name: "Yusuf Adeyemi", role: "Chief Financial Officer" },
      { name: "Lena Petrov", role: "Chief Operating Officer" },
      { name: "Carlos Mendoza", role: "EVP, South America" },
      { name: "Fiona Campbell", role: "EVP, Australia" },
      { name: "Raj Malhotra", role: "VP Exploration" },
      { name: "Diane Fournier", role: "VP Development" },
      { name: "Kwame Boateng", role: "VP Sustainability" },
      { name: "Sarah Lindqvist", role: "VP Investor Relations" },
      { name: "Tobias Brandt", role: "VP Corporate Development" },
      { name: "Amara Nwosu", role: "VP Legal & General Counsel" },
    ],
    timeline: [
      { date: "2021", headline: "Formation via merger of three explorers", whyItMatters: "Created the multi-asset platform." },
      { date: "2022", headline: "Northern Frontier porphyry acquired", whyItMatters: "Added copper scale." },
      { date: "2023", headline: "Great Southern PEA completed", whyItMatters: "Defined the flagship." },
      { date: "2024", headline: "Cariboo Deep bonanza intercepts", whyItMatters: "Opened a high-grade growth story." },
      { date: "2025", headline: "Great Southern feasibility study delivered", whyItMatters: "Advanced flagship to a construction decision." },
    ],
    catalysts: [
      { timing: "Q1 2026", label: "Great Southern construction decision", impact: "Value re-rating trigger" },
      { timing: "Q1 2026", label: "Cariboo Deep resource estimate", impact: "First scale on the high-grade system" },
      { timing: "Q2 2026", label: "Northern Frontier feasibility start", impact: "Advances the copper asset" },
      { timing: "Q2 2026", label: "Desert Thunder step-out drilling", impact: "Tests district potential" },
      { timing: "Q3 2026", label: "Silverback Highlands infill drilling", impact: "Upgrades silver confidence" },
      { timing: "Q3 2026", label: "Blue Mountain metallurgical results", impact: "De-risks the zinc flowsheet" },
      { timing: "Q4 2026", label: "Eagle Pass maiden drill program", impact: "Discovery optionality" },
      { timing: "Q4 2026", label: "Timberline JV partner announcement", impact: "Non-dilutive advancement" },
      { timing: "2027", label: "Great Southern first gold pour", impact: "Transition toward producer status" },
    ],
    media: {
      hero: img("c02"), logo: "",
      photos: {
        overview: [img("c02"), img("c03")], jurisdiction: [img("c10"), img("c07")],
        results: [img("c12"), img("c11")], follow: [img("c05"), img("c06")], project: [img("c15"), img("c14")],
      },
      maps: [
        { url: img("c10"), category: "project_map", project: "Great Southern Consolidated Gold & Base Metals Development Project" },
        { url: img("c07"), category: "jurisdiction_map", project: "Northern Frontier Regional Copper-Gold Porphyry Exploration Complex" },
      ],
      all: [
        { url: img("c02"), category: "infrastructure", alt: "Flagship site" },
        { url: img("c03"), category: "field", alt: "Camp" },
        { url: img("c12"), category: "core", alt: "Gold core" },
        { url: img("c11"), category: "drilling", alt: "Drilling" },
        { url: img("c15"), category: "core", alt: "High-grade core" },
        { url: img("c14"), category: "field", alt: "Open pit" },
        { url: img("c13"), category: "core", alt: "Silver core" },
        { url: img("c10"), category: "project_map", alt: "Flagship map" },
        { url: img("c07"), category: "jurisdiction_map", alt: "Chile assets" },
        { url: img("c08"), category: "field", alt: "Desert Thunder" },
        { url: img("c06"), category: "field", alt: "Eagle Pass" },
        { url: img("c05"), category: "field", alt: "Portfolio field" },
      ],
    },
  },
};

export const FIXTURES = { A, B, C, D, E, F };
