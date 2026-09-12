// SAMPLE DATA — invented company, project, people and results. Dev use only.

import type { StudioFixture } from "./types";

const releaseText = `Terrane Vale Minerals Ltd. Intersects 42.7 Metres of 3.14 g/t Gold at the Boulder Zone, Halvard Project

VANCOUVER, British Columbia, March 12, 2026 - Terrane Vale Minerals Ltd. (TSXV: TVM) (OTCQB: TVMLF) ("Terrane Vale" or the "Company") today announced assay results from the first six holes of its Phase 2 diamond drilling program at the 100%-owned Halvard Project in the Golden Triangle, British Columbia.

Highlights

- Hole HVD-26-017 returned 42.7 metres grading 3.14 g/t gold from 186.0 metres, including 4.2 metres of 21.60 g/t gold from 201.3 metres.
- Hole HVD-26-019 returned 18.4 metres grading 1.92 g/t gold from 121.5 metres.
- Hole HVD-26-021 intersected 9.6 metres grading 0.88 g/t gold from 244.0 metres, extending the Boulder Zone 180 metres to the northeast of the previously defined limit.
- Hole HVD-26-018 returned no significant results.

The Phase 2 program comprised 24 holes totalling 8,420 metres, drilled with two rigs between October 2025 and February 2026. Assays remain pending for a further nine holes and are expected through the second quarter of 2026.

"These are the widest gold intercepts drilled at Halvard to date, and hole HVD-26-021 tells us the Boulder Zone does not stop where we thought it did," said Ingrid Sollie, President and Chief Executive Officer of Terrane Vale.

Reported intervals are downhole lengths. True widths are not yet known and are estimated to be between 60% and 80% of downhole length.

Quality Assurance and Quality Control: All drill core was sawn in half, with one half submitted to an accredited laboratory in Vancouver. Certified reference materials, blanks and field duplicates were inserted into the sample stream at a rate of one in twenty.

Qualified Person: Marcus Trelawney, P.Geo., Vice President Exploration of the Company, is the Qualified Person as defined by National Instrument 43-101 and has reviewed and approved the technical content of this news release.

Forward-Looking Statements: This news release contains forward-looking statements that involve risks and uncertainties. Actual results may differ materially from those expressed or implied.`;

const anchor = (quote: string) => ({ quote });

export const drillResultsFixture: StudioFixture = {
  id: "drill-halvard",
  label: "Drill results — Halvard Project",
  releaseType: "drill_results",
  releaseText,
  extraction: {
    schemaVersion: 1,
    releaseType: "drill_results",
    releaseTypeConfidence: "high",
    secondaryTypes: [],
    company: {
      name: "Terrane Vale Minerals Ltd.",
      tickers: [
        { exchange: "TSXV", symbol: "TVM" },
        { exchange: "OTCQB", symbol: "TVMLF" },
      ],
    },
    headline: "Terrane Vale Minerals Ltd. Intersects 42.7 Metres of 3.14 g/t Gold at the Boulder Zone, Halvard Project",
    dateline: { date: "2026-03-12", place: "Vancouver, British Columbia" },
    summary: {
      whatHappened:
        "Terrane Vale reported assays from the first six holes of a 24-hole Phase 2 drill program at its Halvard Project.",
      whyItMatters:
        "The best hole returned 42.7 m at 3.14 g/t gold, the widest gold intercept drilled at Halvard so far, and a second hole extended the Boulder Zone 180 m northeast of its previously defined limit.",
      whatHappensNext:
        "Assays for a further nine holes are outstanding and are expected through the second quarter of 2026.",
    },
    projects: [
      {
        name: "Halvard Project",
        commodities: ["Gold"],
        jurisdiction: { country: "Canada", region: "British Columbia", label: "Golden Triangle, British Columbia" },
        ownership: "100%-owned",
        anchor: anchor("100%-owned Halvard Project in the Golden Triangle, British Columbia"),
      },
    ],
    primaryJurisdiction: { country: "Canada", region: "British Columbia", label: "Golden Triangle, British Columbia" },
    commodities: ["Gold"],
    drill: {
      program: {
        name: "Phase 2 diamond drilling",
        holesCompleted: 24,
        metresDrilled: { value: 8420, unit: "m", raw: "8,420 metres" },
        rigCount: 2,
        status: "completed",
        description: "24-hole Phase 2 diamond drilling program at the Halvard Project.",
        anchor: anchor("The Phase 2 program comprised 24 holes totalling 8,420 metres, drilled with two rigs"),
      },
      holes: [
        {
          id: "HVD-26-017",
          target: "Boulder Zone",
          intervals: [
            {
              from: { value: 186.0, unit: "m", raw: "186.0 metres" },
              to: { value: 228.7, unit: "m", raw: "228.7 metres" },
              length: { value: 42.7, unit: "m", raw: "42.7 metres" },
              trueWidthReported: false,
              grades: [{ element: "Au", value: 3.14, unit: "g/t", raw: "3.14 g/t gold" }],
              includes: [
                {
                  from: { value: 201.3, unit: "m", raw: "201.3 metres" },
                  to: { value: 205.5, unit: "m", raw: "205.5 metres" },
                  length: { value: 4.2, unit: "m", raw: "4.2 metres" },
                  trueWidthReported: false,
                  grades: [{ element: "Au", value: 21.6, unit: "g/t", raw: "21.60 g/t gold" }],
                  anchor: anchor("including 4.2 metres of 21.60 g/t gold from 201.3 metres"),
                },
              ],
              isHighlight: true,
              anchor: anchor("Hole HVD-26-017 returned 42.7 metres grading 3.14 g/t gold from 186.0 metres"),
            },
          ],
          anchor: anchor("Hole HVD-26-017 returned 42.7 metres grading 3.14 g/t gold from 186.0 metres"),
        },
        {
          id: "HVD-26-019",
          target: "Boulder Zone",
          intervals: [
            {
              from: { value: 121.5, unit: "m", raw: "121.5 metres" },
              to: { value: 139.9, unit: "m", raw: "139.9 metres" },
              length: { value: 18.4, unit: "m", raw: "18.4 metres" },
              trueWidthReported: false,
              grades: [{ element: "Au", value: 1.92, unit: "g/t", raw: "1.92 g/t gold" }],
              isHighlight: true,
              anchor: anchor("Hole HVD-26-019 returned 18.4 metres grading 1.92 g/t gold from 121.5 metres"),
            },
          ],
          anchor: anchor("Hole HVD-26-019 returned 18.4 metres grading 1.92 g/t gold from 121.5 metres"),
        },
        {
          id: "HVD-26-021",
          target: "Boulder Zone northeast extension",
          intervals: [
            {
              from: { value: 244.0, unit: "m", raw: "244.0 metres" },
              to: { value: 253.6, unit: "m", raw: "253.6 metres" },
              length: { value: 9.6, unit: "m", raw: "9.6 metres" },
              trueWidthReported: false,
              grades: [{ element: "Au", value: 0.88, unit: "g/t", raw: "0.88 g/t gold" }],
              isHighlight: true,
              anchor: anchor("Hole HVD-26-021 intersected 9.6 metres grading 0.88 g/t gold from 244.0 metres"),
            },
          ],
          anchor: anchor("extending the Boulder Zone 180 metres to the northeast of the previously defined limit"),
        },
        {
          id: "HVD-26-018",
          intervals: [],
          noSignificantResults: true,
          anchor: anchor("Hole HVD-26-018 returned no significant results."),
        },
      ],
      highlights: [
        {
          from: { value: 186.0, unit: "m", raw: "186.0 metres" },
          to: { value: 228.7, unit: "m", raw: "228.7 metres" },
          length: { value: 42.7, unit: "m", raw: "42.7 metres" },
          trueWidthReported: false,
          grades: [{ element: "Au", value: 3.14, unit: "g/t", raw: "3.14 g/t gold" }],
          isHighlight: true,
          anchor: anchor("Hole HVD-26-017 returned 42.7 metres grading 3.14 g/t gold from 186.0 metres"),
        },
        {
          from: { value: 121.5, unit: "m", raw: "121.5 metres" },
          to: { value: 139.9, unit: "m", raw: "139.9 metres" },
          length: { value: 18.4, unit: "m", raw: "18.4 metres" },
          trueWidthReported: false,
          grades: [{ element: "Au", value: 1.92, unit: "g/t", raw: "1.92 g/t gold" }],
          isHighlight: true,
          anchor: anchor("Hole HVD-26-019 returned 18.4 metres grading 1.92 g/t gold from 121.5 metres"),
        },
      ],
      assaysPending: true,
      assaysPendingDetail: "Assays remain pending for a further nine holes and are expected through the second quarter of 2026.",
      stepOut: { value: 180, unit: "m", raw: "180 metres" },
      qaqcStated: true,
    },
    quotes: [
      {
        name: "Ingrid Sollie",
        role: "President and Chief Executive Officer",
        quote: "These are the widest gold intercepts drilled at Halvard to date, and hole HVD-26-021 tells us the Boulder Zone does not stop where we thought it did",
        anchor: anchor("These are the widest gold intercepts drilled at Halvard to date"),
      },
    ],
    qualifiedPerson: {
      name: "Marcus Trelawney",
      credentials: "P.Geo.",
      role: "Vice President Exploration",
      statement: "is the Qualified Person as defined by National Instrument 43-101 and has reviewed and approved the technical content of this news release",
      anchor: anchor("Marcus Trelawney, P.Geo., Vice President Exploration of the Company, is the Qualified Person"),
    },
    headlineNumbers: [
      {
        label: "Best intercept",
        value: "42.7 m",
        qualifier: "@ 3.14 g/t Au",
        context: "Hole HVD-26-017, Boulder Zone",
        kind: "length",
        emphasis: "primary",
        caveat: "Downhole length, not true width",
        anchor: anchor("Hole HVD-26-017 returned 42.7 metres grading 3.14 g/t gold from 186.0 metres"),
      },
      {
        label: "Including",
        value: "4.2 m",
        qualifier: "@ 21.60 g/t Au",
        context: "From 201.3 m",
        kind: "grade",
        emphasis: "primary",
        caveat: "Downhole length, not true width",
        anchor: anchor("including 4.2 metres of 21.60 g/t gold from 201.3 metres"),
      },
      {
        label: "Step-out",
        value: "180 m",
        qualifier: "northeast",
        context: "Beyond the previously defined Boulder Zone limit",
        kind: "distance",
        emphasis: "secondary",
        anchor: anchor("extending the Boulder Zone 180 metres to the northeast of the previously defined limit"),
      },
      {
        label: "Phase 2 program",
        value: "8,420 m",
        qualifier: "24 holes",
        context: "Two rigs, Oct 2025 – Feb 2026",
        kind: "length",
        emphasis: "secondary",
        anchor: anchor("24 holes totalling 8,420 metres"),
      },
    ],
    facts: [
      {
        id: "f1",
        statement: "Hole HVD-26-017 returned 42.7 m grading 3.14 g/t gold from 186.0 m downhole.",
        kind: "measurement",
        confidence: "high",
        anchor: anchor("Hole HVD-26-017 returned 42.7 metres grading 3.14 g/t gold from 186.0 metres"),
      },
      {
        id: "f2",
        statement: "That interval includes 4.2 m grading 21.60 g/t gold from 201.3 m.",
        kind: "measurement",
        confidence: "high",
        anchor: anchor("including 4.2 metres of 21.60 g/t gold from 201.3 metres"),
      },
      {
        id: "f3",
        statement: "Hole HVD-26-021 extended the Boulder Zone 180 m northeast of its previously defined limit.",
        kind: "measurement",
        confidence: "high",
        anchor: anchor("extending the Boulder Zone 180 metres to the northeast of the previously defined limit"),
      },
      {
        id: "f4",
        statement: "Hole HVD-26-018 returned no significant results.",
        kind: "assertion",
        confidence: "high",
        anchor: anchor("Hole HVD-26-018 returned no significant results."),
      },
      {
        id: "f5",
        statement: "True widths are not known and are estimated at 60–80% of downhole length.",
        kind: "assertion",
        confidence: "high",
        anchor: anchor("True widths are not yet known and are estimated to be between 60% and 80% of downhole length."),
      },
      {
        id: "f6",
        statement: "Assays for nine further holes are outstanding, expected in Q2 2026.",
        kind: "forward_looking",
        confidence: "high",
        anchor: anchor("Assays remain pending for a further nine holes and are expected through the second quarter of 2026."),
      },
    ],
    forwardLooking: true,
    cautionaryNotes: [
      "Reported intervals are downhole lengths; true widths are not yet known and are estimated at 60–80% of downhole length.",
    ],
    warnings: [],
  },
};
