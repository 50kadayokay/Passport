// SAMPLE DATA — invented company, terms and participants. Dev use only.

import type { StudioFixture } from "./types";

const releaseText = `Terrane Vale Minerals Ltd. Announces Upsized C$12.0 Million Private Placement

VANCOUVER, British Columbia, April 2, 2026 - Terrane Vale Minerals Ltd. (TSXV: TVM) (OTCQB: TVMLF) ("Terrane Vale" or the "Company") announces that, further to its news release of March 26, 2026, it has increased the size of its previously announced non-brokered private placement to raise aggregate gross proceeds of up to C$12,000,000.

The offering consists of up to 20,000,000 units at a price of C$0.45 per unit for gross proceeds of up to C$9,000,000, and up to 5,000,000 flow-through shares at a price of C$0.60 per share for gross proceeds of up to C$3,000,000. Each unit consists of one common share and one-half of one common share purchase warrant, with each whole warrant exercisable at C$0.65 for a period of 24 months from closing.

Kestrel Resource Partners has agreed to subscribe for C$4,000,000 of the offering and will hold approximately 9.9% of the Company's issued and outstanding shares on closing.

The Company intends to use the proceeds of the offering as follows: C$7,000,000 for Phase 3 drilling at the Halvard Project, C$2,500,000 for regional exploration and target generation, and the balance for general working capital.

Closing is expected on or about April 24, 2026 and remains subject to the approval of the TSX Venture Exchange. All securities issued will be subject to a statutory hold period of four months and one day from the date of issuance.

Forward-Looking Statements: This news release contains forward-looking statements that involve risks and uncertainties.`;

const anchor = (quote: string) => ({ quote });

export const financingFixture: StudioFixture = {
  id: "financing-tvm",
  label: "Financing — upsized private placement",
  releaseType: "financing",
  releaseText,
  extraction: {
    schemaVersion: 1,
    releaseType: "financing",
    releaseTypeConfidence: "high",
    secondaryTypes: [],
    company: {
      name: "Terrane Vale Minerals Ltd.",
      tickers: [
        { exchange: "TSXV", symbol: "TVM" },
        { exchange: "OTCQB", symbol: "TVMLF" },
      ],
    },
    headline: "Terrane Vale Minerals Ltd. Announces Upsized C$12.0 Million Private Placement",
    dateline: { date: "2026-04-02", place: "Vancouver, British Columbia" },
    summary: {
      whatHappened:
        "Terrane Vale upsized its previously announced non-brokered private placement to gross proceeds of up to C$12.0 million.",
      whyItMatters:
        "The raise is split between C$9.0 million of units and C$3.0 million of flow-through shares, with C$7.0 million earmarked for Phase 3 drilling at Halvard, and brings in Kestrel Resource Partners at a 9.9% position.",
      whatHappensNext:
        "Closing is expected on or about April 24, 2026, subject to TSX Venture Exchange approval.",
    },
    projects: [
      {
        name: "Halvard Project",
        commodities: ["Gold"],
        jurisdiction: { country: "Canada", region: "British Columbia" },
        anchor: anchor("C$7,000,000 for Phase 3 drilling at the Halvard Project"),
      },
    ],
    primaryJurisdiction: { country: "Canada", region: "British Columbia" },
    commodities: ["Gold"],
    financing: {
      type: "private_placement",
      grossProceeds: { value: 12000000, currency: "CAD", raw: "C$12,000,000" },
      maximumRaise: { value: 12000000, currency: "CAD", raw: "C$12,000,000" },
      upsized: true,
      tranches: [
        { label: "Units", amount: { value: 9000000, currency: "CAD", raw: "C$9,000,000" }, status: "announced" },
        { label: "Flow-through shares", amount: { value: 3000000, currency: "CAD", raw: "C$3,000,000" }, status: "announced" },
      ],
      units: {
        description: "one common share and one-half of one common share purchase warrant",
        pricePerUnit: { value: 0.45, currency: "CAD", raw: "C$0.45 per unit", perUnit: true },
        unitCount: 20000000,
        warrantRatio: 0.5,
        warrantExercisePrice: { value: 0.65, currency: "CAD", raw: "C$0.65", perUnit: true },
        warrantTermMonths: 24,
      },
      flowThrough: { amount: { value: 3000000, currency: "CAD", raw: "C$3,000,000" } },
      useOfProceeds: [
        {
          purpose: "Phase 3 drilling at the Halvard Project",
          amount: { value: 7000000, currency: "CAD", raw: "C$7,000,000" },
          anchor: anchor("C$7,000,000 for Phase 3 drilling at the Halvard Project"),
        },
        {
          purpose: "Regional exploration and target generation",
          amount: { value: 2500000, currency: "CAD", raw: "C$2,500,000" },
          anchor: anchor("C$2,500,000 for regional exploration and target generation"),
        },
        {
          purpose: "General working capital",
          anchor: anchor("the balance for general working capital"),
        },
      ],
      participants: [
        {
          name: "Kestrel Resource Partners",
          role: "strategic",
          amount: { value: 4000000, currency: "CAD", raw: "C$4,000,000" },
          resultingStake: 0.099,
          anchor: anchor("Kestrel Resource Partners has agreed to subscribe for C$4,000,000 of the offering"),
        },
      ],
      closingDate: "2026-04-24",
      holdPeriod: "four months and one day from the date of issuance",
      conditions: ["Subject to the approval of the TSX Venture Exchange"],
    },
    quotes: [],
    headlineNumbers: [
      {
        label: "Gross proceeds",
        value: "C$12.0M",
        qualifier: "upsized",
        context: "Non-brokered private placement",
        kind: "money",
        emphasis: "primary",
        anchor: anchor("aggregate gross proceeds of up to C$12,000,000"),
      },
      {
        label: "Unit price",
        value: "C$0.45",
        qualifier: "+ ½ warrant at C$0.65",
        context: "20,000,000 units",
        kind: "money",
        emphasis: "secondary",
        anchor: anchor("20,000,000 units at a price of C$0.45 per unit"),
      },
      {
        label: "To Phase 3 drilling",
        value: "C$7.0M",
        qualifier: "58% of the raise",
        context: "Halvard Project",
        kind: "money",
        emphasis: "primary",
        anchor: anchor("C$7,000,000 for Phase 3 drilling at the Halvard Project"),
      },
      {
        label: "Strategic order",
        value: "C$4.0M",
        qualifier: "~9.9% on closing",
        context: "Kestrel Resource Partners",
        kind: "money",
        emphasis: "secondary",
        anchor: anchor("Kestrel Resource Partners has agreed to subscribe for C$4,000,000 of the offering"),
      },
    ],
    facts: [
      {
        id: "f1",
        statement: "The private placement was upsized to gross proceeds of up to C$12,000,000.",
        kind: "financial",
        confidence: "high",
        anchor: anchor("increased the size of its previously announced non-brokered private placement"),
      },
      {
        id: "f2",
        statement: "Units are priced at C$0.45 and include one-half warrant exercisable at C$0.65 for 24 months.",
        kind: "financial",
        confidence: "high",
        anchor: anchor("each whole warrant exercisable at C$0.65 for a period of 24 months from closing"),
      },
      {
        id: "f3",
        statement: "C$7,000,000 of the proceeds is allocated to Phase 3 drilling at Halvard.",
        kind: "financial",
        confidence: "high",
        anchor: anchor("C$7,000,000 for Phase 3 drilling at the Halvard Project"),
      },
      {
        id: "f4",
        statement: "C$7.0M is approximately 58% of the C$12.0M raise.",
        kind: "financial",
        confidence: "high",
        derived: true,
        derivation: "7,000,000 ÷ 12,000,000 = 0.583",
        anchor: anchor("C$7,000,000 for Phase 3 drilling at the Halvard Project"),
      },
      {
        id: "f5",
        statement: "Closing is expected on or about April 24, 2026, subject to TSXV approval.",
        kind: "forward_looking",
        confidence: "high",
        anchor: anchor("Closing is expected on or about April 24, 2026 and remains subject to the approval of the TSX Venture Exchange."),
      },
    ],
    forwardLooking: true,
    cautionaryNotes: ["Closing remains subject to TSX Venture Exchange approval."],
    warnings: [],
  },
};
