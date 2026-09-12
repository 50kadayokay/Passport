// SAMPLE DATA — invented company, survey results and targets. Dev use only.

import type { StudioFixture } from "./types";

const releaseText = `Terrane Vale Minerals Ltd. Defines Four New Drill Targets Following Airborne Survey at Halvard

VANCOUVER, British Columbia, May 21, 2026 - Terrane Vale Minerals Ltd. (TSXV: TVM) ("Terrane Vale" or the "Company") announces the completion and interpretation of a 1,240 line-kilometre airborne magnetic and radiometric survey across the 312 square kilometre Halvard Project in the Golden Triangle, British Columbia.

The survey has defined four new drill-ready targets along a 6.2 kilometre corridor northeast of the Boulder Zone. Each target is coincident with a magnetic low interpreted as alteration and with anomalous gold-in-soil geochemistry.

A follow-up program of geological mapping and rock sampling was completed over the corridor in April and May. Twenty-eight rock samples returned values ranging from below detection to 14.30 g/t gold, with six samples exceeding 1.00 g/t gold. Rock samples are selective by nature and are not necessarily representative of the mineralisation hosted on the property.

The Company intends to test the two highest-priority targets, Kestrel and Vantage, in the Phase 3 drill program scheduled to begin in July 2026.

Qualified Person: Marcus Trelawney, P.Geo., Vice President Exploration of the Company, is the Qualified Person as defined by National Instrument 43-101 and has approved the technical content of this news release.`;

const anchor = (quote: string) => ({ quote });

export const explorationFixture: StudioFixture = {
  id: "exploration-halvard",
  label: "Exploration update — airborne survey and targets",
  releaseType: "exploration_update",
  releaseText,
  extraction: {
    schemaVersion: 1,
    releaseType: "exploration_update",
    releaseTypeConfidence: "high",
    secondaryTypes: [],
    company: { name: "Terrane Vale Minerals Ltd.", tickers: [{ exchange: "TSXV", symbol: "TVM" }] },
    headline: "Terrane Vale Minerals Ltd. Defines Four New Drill Targets Following Airborne Survey at Halvard",
    dateline: { date: "2026-05-21", place: "Vancouver, British Columbia" },
    summary: {
      whatHappened:
        "Terrane Vale completed and interpreted a 1,240 line-kilometre airborne magnetic and radiometric survey over the Halvard Project.",
      whyItMatters:
        "The survey defined four new drill-ready targets along a 6.2 km corridor northeast of the Boulder Zone, each coincident with alteration and anomalous gold-in-soil geochemistry.",
      whatHappensNext:
        "The two highest-priority targets, Kestrel and Vantage, are scheduled for testing in the Phase 3 drill program beginning July 2026.",
    },
    projects: [
      {
        name: "Halvard Project",
        commodities: ["Gold"],
        jurisdiction: { country: "Canada", region: "British Columbia", label: "Golden Triangle, British Columbia" },
        areaKm2: { value: 312, unit: "km2", raw: "312 square kilometre" },
        anchor: anchor("312 square kilometre Halvard Project in the Golden Triangle, British Columbia"),
      },
    ],
    primaryJurisdiction: { country: "Canada", region: "British Columbia", label: "Golden Triangle, British Columbia" },
    commodities: ["Gold"],
    exploration: {
      workTypes: ["geophysics", "geochemistry", "mapping", "surface_sampling", "target_generation"],
      surveys: [
        {
          method: "Airborne magnetic and radiometric",
          lineKm: { value: 1240, unit: "km", raw: "1,240 line-kilometre" },
          coverage: { value: 312, unit: "km2", raw: "312 square kilometre" },
          status: "interpreted",
          finding: "Four new drill-ready targets defined along a 6.2 km corridor northeast of the Boulder Zone.",
          anchor: anchor("1,240 line-kilometre airborne magnetic and radiometric survey"),
        },
      ],
      samples: [
        {
          kind: "rock",
          count: 28,
          highlights: [{ element: "Au", value: 14.3, unit: "g/t", raw: "14.30 g/t gold" }],
          selectiveSampleCaveatStated: true,
          anchor: anchor("Twenty-eight rock samples returned values ranging from below detection to 14.30 g/t gold"),
        },
      ],
      targetsDefined: 4,
      targetNames: ["Kestrel", "Vantage"],
      footprint: { value: 6.2, unit: "km", raw: "6.2 kilometre" },
      nextSteps: [
        "Test the Kestrel and Vantage targets in the Phase 3 drill program beginning July 2026.",
      ],
    },
    quotes: [],
    qualifiedPerson: {
      name: "Marcus Trelawney",
      credentials: "P.Geo.",
      role: "Vice President Exploration",
      anchor: anchor("Marcus Trelawney, P.Geo., Vice President Exploration of the Company"),
    },
    headlineNumbers: [
      {
        label: "New drill targets",
        value: "4",
        qualifier: "drill-ready",
        context: "Along a 6.2 km corridor northeast of the Boulder Zone",
        kind: "count",
        emphasis: "primary",
        anchor: anchor("defined four new drill-ready targets along a 6.2 kilometre corridor"),
      },
      {
        label: "Survey coverage",
        value: "1,240 km",
        qualifier: "line-kilometres flown",
        context: "Airborne magnetics and radiometrics over 312 km²",
        kind: "distance",
        emphasis: "primary",
        anchor: anchor("1,240 line-kilometre airborne magnetic and radiometric survey"),
      },
      {
        label: "Best rock sample",
        value: "14.30 g/t",
        qualifier: "gold",
        context: "One of 28 samples; six exceeded 1.00 g/t",
        kind: "grade",
        emphasis: "secondary",
        caveat: "Selective rock sample; not representative of the deposit",
        anchor: anchor("Twenty-eight rock samples returned values ranging from below detection to 14.30 g/t gold"),
      },
    ],
    facts: [
      {
        id: "f1",
        statement: "A 1,240 line-km airborne magnetic and radiometric survey was flown over the 312 km² Halvard Project.",
        kind: "measurement",
        confidence: "high",
        anchor: anchor("1,240 line-kilometre airborne magnetic and radiometric survey"),
      },
      {
        id: "f2",
        statement: "Four drill-ready targets were defined along a 6.2 km corridor northeast of the Boulder Zone.",
        kind: "assertion",
        confidence: "high",
        anchor: anchor("defined four new drill-ready targets along a 6.2 kilometre corridor northeast of the Boulder Zone"),
      },
      {
        id: "f3",
        statement: "Twenty-eight rock samples returned up to 14.30 g/t gold, with six above 1.00 g/t.",
        kind: "measurement",
        confidence: "high",
        anchor: anchor("with six samples exceeding 1.00 g/t gold"),
      },
      {
        id: "f4",
        statement: "The release states rock samples are selective and not necessarily representative.",
        kind: "assertion",
        confidence: "high",
        anchor: anchor("Rock samples are selective by nature and are not necessarily representative"),
      },
    ],
    forwardLooking: false,
    cautionaryNotes: [
      "Rock samples are selective by nature and are not necessarily representative of the mineralisation hosted on the property.",
    ],
    warnings: [],
  },
};
