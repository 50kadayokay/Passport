// LOCAL, TEST-ONLY fixture for Phase 3 universal-template validation. NOT production data —
// only referenced by the localhost /editordemo?fixture=copper harness. A fictional company that
// is deliberately UNLIKE Kingsmen: copper (not Ag-Au), British Columbia (not Mexico), exploration
// stage (not Discovery), NO drill results, NO historic production, TWO projects — the second one
// intentionally near-empty to exercise optional/empty rendering and project isolation.
// Shapes mirror exactly what PassportProto ProjectsView reads (see pro-editor-1to1 memory).

// Fallback-safety test: a real (non-Kingsmen) company with PROJECTS_FULL explicitly null.
// The investor Projects tab must show a CLEAN EMPTY state — never Kingsmen's projects.
export const EMPTY_FIXTURE = {
  pp: {
    COMPANY: { name: "Northshore Copper", slug: "northshore-copper", website: "https://northshorecopper.ca", commodity: "Copper", jurisdiction: "British Columbia, Canada", stage: "Exploration" },
    ONE_LINER: "Advancing porphyry copper targets in British Columbia.",
    EXCHANGES: [{ ex: "TSXV", sym: "NSC" }],
    PROJECTS_DATA: {}, PROJECTS_FULL: null,
  },
};

// Kingsmen-demo test: mimics the pp-absent default (COMPANY = Kingsmen, PROJECTS_FULL null).
// The prototype (KINGSMEN_PROJ) MUST still render here.
export const KINGSMEN_PROTO_FIXTURE = {
  pp: { COMPANY: { name: "Kingsmen Resources", website: "https://www.kingsmenresources.com" }, PROJECTS_DATA: {}, PROJECTS_FULL: null },
};

export const COPPER_FIXTURE = {
  pp: {
    COMPANY: {
      name: "Northshore Copper", slug: "northshore-copper",
      website: "https://northshorecopper.ca",
      commodity: "Copper", jurisdiction: "British Columbia, Canada",
      stage: "Exploration", focus: "Geophysics & target definition",
      projectsLabel: "2 Projects", flagshipKey: "copper-ridge",
      slogan: "Advancing porphyry copper targets in British Columbia",
    },
    ONE_LINER: "Advancing district-scale porphyry copper targets in British Columbia.",
    EXCHANGES: [{ ex: "TSXV", sym: "NSC" }, { ex: "OTCQB", sym: "NSCCF" }],
    THESIS: [], WHY: [], BRIEF_SECTIONS: [],
    // Light list (editor iterates these keys). Names only — rich data lives in PROJECTS_FULL.
    PROJECTS_DATA: {
      "copper-ridge": { key: "copper-ridge", name: "Copper Ridge" },
      "nechako-zone": { key: "nechako-zone", name: "Nechako Zone" },
    },
    PROJECTS_FULL: {
      "copper-ridge": {
        key: "copper-ridge", name: "Copper Ridge", stageIdx: 0,
        snap: [
          { label: "Location & Jurisdiction", icon: "MapPin", value: "Cariboo district, BC", detail: [["District", "Cariboo"], ["Province", "British Columbia"], ["Country", "Canada"]], note: "Tier-1 mining jurisdiction." },
          { label: "Primary Commodity", icon: "Gem", value: "Copper", value2: "± Au, Mo", detail: [["Primary", "Copper"], ["Co-product", "Gold, Molybdenum"]] },
          { label: "Deposit Type", icon: "Mountain", value: "Porphyry Cu-Au", detail: [["Model", "Calc-alkalic porphyry"], ["Host rocks", "Intrusive complex"]] },
        ],
        cards: [
          { kind: "map", body: "Central BC porphyry belt, road-accessible.", points: [{ k: "Claims", v: "12,400 ha" }, { k: "Regional context", v: "Quesnel Terrane" }] },
          { kind: "history", body: "Explored via geophysics and soils; never drilled.", timeline: [{ era: "2023", v: "Airborne magnetics" }, { era: "2024", v: "IP survey + soils" }] },
          { kind: "geology", body: "Calc-alkalic porphyry with potassic alteration.", points: [{ k: "Alteration", v: "Potassic core" }, { k: "Mineralization", v: "Cu sulphides" }] },
          { kind: "drills", body: "No modern drilling yet.", rows: [], empty: true, emptyMsg: "Maiden drill program planned for 2026." },
        ],
        content: {
          stage: { current: "Exploration", summary: "Drill-targeting stage ahead of a maiden program.", program: "Airborne magnetics + IP survey", activity: "Modelling geophysics to finalise drill targets", next: "Permit and drill 8–10 holes", timing: "2026", completed: ["Property-wide airborne MAG", "3D IP inversion"], closing: "Finalise targets, permit, and drill." },
          targets: { summary: "Four coincident geophysical/geochemical targets defined.", priority: [
            { name: "Ridge North", status: "Drill-ready", objective: "Coincident IP chargeability + Cu-in-soil anomaly." },
            { name: "South Gossan", status: "Advanced", objective: "Leached cap over a magnetic low." },
            { name: "East Contact", status: "Early", objective: "Skarn potential at the intrusive contact." },
          ], evidence: ["2 km IP chargeability trend", "Cu-in-soil to 0.4%"], closing: "Targets are drill-ready pending permits." },
          unique: { summary: "District-scale porphyry system with no modern drilling.", diffs: [
            { h: "Untested at depth", t: "No hole has tested the IP anomaly below 150 m.", fact: "0 m tested" },
            { h: "Road-accessible", t: "Year-round road access lowers drill costs.", fact: "" },
          ], evidence: ["Historic trenching only"], takeaway: "A rare untested porphyry target in a Tier-1 jurisdiction." },
          scenarios: { bull: { text: "Discovery hole confirms a large porphyry system." }, bear: { text: "Anomalies reflect barren alteration." }, next: { text: "Maiden drill results, expected 2026." } },
          brief: { overview: "Copper Ridge is a road-accessible porphyry copper target in central BC.", thesis: "Coincident geophysics + geochem over an untested intrusive.", focus: "Finalising drill targets from 3D IP.", different: "No modern drilling despite strong anomalies.", risks: "Pre-discovery; anomalies unconfirmed by drilling.", means: "A low-cost, high-leverage maiden drill program." },
        },
      },
      // Deliberately minimal — tests optional/empty states + isolation from Copper Ridge.
      "nechako-zone": {
        key: "nechako-zone", name: "Nechako Zone",
        content: { brief: { overview: "An early-stage grassroots claim block acquired in 2025." } },
      },
    },
  },
};
