// SAMPLE DATA — invented company and resource estimate. Dev use only.

import type { StudioFixture } from "./types";

const releaseText = `Terrane Vale Minerals Ltd. Reports Maiden Mineral Resource Estimate of 1.24 Million Ounces at Halvard

VANCOUVER, British Columbia, September 8, 2026 - Terrane Vale Minerals Ltd. (TSXV: TVM) ("Terrane Vale" or the "Company") announces a maiden mineral resource estimate for the Boulder Zone at its 100%-owned Halvard Project, prepared in accordance with National Instrument 43-101 with an effective date of August 15, 2026.

The estimate comprises an Indicated Mineral Resource of 14.6 million tonnes grading 1.68 g/t gold containing 789,000 ounces, and an Inferred Mineral Resource of 9.2 million tonnes grading 1.52 g/t gold containing 450,000 ounces.

The estimate is reported at a cut-off grade of 0.50 g/t gold within a constraining pit shell using a gold price of US$2,200 per ounce and a metallurgical recovery of 92%.

Inferred Mineral Resources are considered too speculative geologically to have economic considerations applied to them that would enable them to be categorised as Mineral Reserves. Mineral Resources that are not Mineral Reserves do not have demonstrated economic viability.

Qualified Person: The mineral resource estimate was prepared by Anneke Vorster, P.Geo., of an independent consultancy, who is a Qualified Person as defined by National Instrument 43-101.`;

const anchor = (quote: string) => ({ quote });

export const resourceFixture: StudioFixture = {
  id: "resource-halvard",
  label: "Resource update — maiden MRE",
  releaseType: "resource_update",
  releaseText,
  extraction: {
    schemaVersion: 1,
    releaseType: "resource_update",
    releaseTypeConfidence: "high",
    secondaryTypes: [],
    company: { name: "Terrane Vale Minerals Ltd.", tickers: [{ exchange: "TSXV", symbol: "TVM" }] },
    headline: "Terrane Vale Minerals Ltd. Reports Maiden Mineral Resource Estimate of 1.24 Million Ounces at Halvard",
    dateline: { date: "2026-09-08", place: "Vancouver, British Columbia" },
    summary: {
      whatHappened:
        "Terrane Vale reported a maiden NI 43-101 mineral resource estimate for the Boulder Zone at the Halvard Project with an effective date of August 15, 2026.",
      whyItMatters:
        "The estimate defines 789,000 indicated ounces and 450,000 inferred ounces, putting a first measured scale on a discovery that had only been described by drill intercepts.",
      whatHappensNext:
        "The release does not state a next step beyond the estimate itself.",
    },
    projects: [
      {
        name: "Halvard Project",
        commodities: ["Gold"],
        jurisdiction: { country: "Canada", region: "British Columbia" },
        ownership: "100%-owned",
        anchor: anchor("100%-owned Halvard Project"),
      },
    ],
    primaryJurisdiction: { country: "Canada", region: "British Columbia" },
    commodities: ["Gold"],
    resource: {
      standard: "NI 43-101",
      estimateKind: "maiden",
      effectiveDate: "2026-08-15",
      categories: [
        {
          category: "indicated",
          tonnes: { value: 14600000, unit: "t", raw: "14.6 million tonnes" },
          grades: [{ element: "Au", value: 1.68, unit: "g/t", raw: "1.68 g/t gold" }],
          contained: [{ element: "Au", value: 789000, unit: "oz", raw: "789,000 ounces" }],
          anchor: anchor("Indicated Mineral Resource of 14.6 million tonnes grading 1.68 g/t gold containing 789,000 ounces"),
        },
        {
          category: "inferred",
          tonnes: { value: 9200000, unit: "t", raw: "9.2 million tonnes" },
          grades: [{ element: "Au", value: 1.52, unit: "g/t", raw: "1.52 g/t gold" }],
          contained: [{ element: "Au", value: 450000, unit: "oz", raw: "450,000 ounces" }],
          anchor: anchor("Inferred Mineral Resource of 9.2 million tonnes grading 1.52 g/t gold containing 450,000 ounces"),
        },
      ],
      cutoff: { value: 0.5, unit: "g/t", basis: "constraining pit shell", raw: "0.50 g/t gold" },
      priceAssumptions: [
        { commodity: "Gold", price: { value: 2200, currency: "USD", raw: "US$2,200 per ounce", perUnit: true }, unit: "per ounce" },
      ],
      constraint: "pit_constrained",
      metallurgicalRecovery: [{ commodity: "Gold", recoveryPct: 92 }],
      notes: [
        "Inferred Mineral Resources are considered too speculative geologically to have economic considerations applied to them.",
        "Mineral Resources that are not Mineral Reserves do not have demonstrated economic viability.",
      ],
    },
    quotes: [],
    qualifiedPerson: {
      name: "Anneke Vorster",
      credentials: "P.Geo.",
      role: "Independent consultant",
      anchor: anchor("prepared by Anneke Vorster, P.Geo., of an independent consultancy"),
    },
    headlineNumbers: [
      {
        label: "Indicated",
        value: "789 koz",
        qualifier: "@ 1.68 g/t Au",
        context: "14.6 Mt",
        kind: "contained",
        emphasis: "primary",
        anchor: anchor("Indicated Mineral Resource of 14.6 million tonnes grading 1.68 g/t gold containing 789,000 ounces"),
      },
      {
        label: "Inferred",
        value: "450 koz",
        qualifier: "@ 1.52 g/t Au",
        context: "9.2 Mt",
        kind: "contained",
        emphasis: "primary",
        caveat: "Inferred resources cannot be converted to reserves",
        anchor: anchor("Inferred Mineral Resource of 9.2 million tonnes grading 1.52 g/t gold containing 450,000 ounces"),
      },
      {
        label: "Cut-off grade",
        value: "0.50 g/t",
        qualifier: "gold, within a pit shell",
        context: "US$2,200/oz gold, 92% recovery",
        kind: "grade",
        emphasis: "secondary",
        anchor: anchor("cut-off grade of 0.50 g/t gold within a constraining pit shell"),
      },
    ],
    facts: [
      {
        id: "f1",
        statement: "Indicated: 14.6 Mt at 1.68 g/t gold for 789,000 contained ounces.",
        kind: "measurement",
        confidence: "high",
        anchor: anchor("Indicated Mineral Resource of 14.6 million tonnes grading 1.68 g/t gold containing 789,000 ounces"),
      },
      {
        id: "f2",
        statement: "Inferred: 9.2 Mt at 1.52 g/t gold for 450,000 contained ounces.",
        kind: "measurement",
        confidence: "high",
        anchor: anchor("Inferred Mineral Resource of 9.2 million tonnes grading 1.52 g/t gold containing 450,000 ounces"),
      },
      {
        id: "f3",
        statement: "The estimate has an effective date of August 15, 2026 and is reported under NI 43-101.",
        kind: "date",
        confidence: "high",
        anchor: anchor("in accordance with National Instrument 43-101 with an effective date of August 15, 2026"),
      },
      {
        id: "f4",
        statement: "Cut-off is 0.50 g/t gold in a pit shell at US$2,200/oz gold and 92% recovery.",
        kind: "measurement",
        confidence: "high",
        anchor: anchor("using a gold price of US$2,200 per ounce and a metallurgical recovery of 92%"),
      },
    ],
    forwardLooking: false,
    cautionaryNotes: [
      "Mineral Resources that are not Mineral Reserves do not have demonstrated economic viability.",
      "Inferred Mineral Resources are too speculative geologically to have economic considerations applied.",
    ],
    warnings: [
      "The headline 1.24 Moz figure is the sum of indicated and inferred ounces, which the release does not state as a combined total.",
    ],
  },
};
