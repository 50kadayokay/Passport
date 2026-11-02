// Deterministic press-release fixtures for the portal demo.
//
// WHY FIXTURES AND NOT THE REAL PIPELINE
// --------------------------------------
// Ingestion writes (documents, storage, media_assets) and summarisation costs
// money per call. Neither belongs in a demo that anyone can open and drag a
// file onto fifty times. These stand in for both, in the EXACT shapes
// ingestRelease and structureRelease return, so everything downstream -- the
// review screen, the V2 card, the publish validation, profileToPP -- is the
// real code path operating on real-shaped data.
//
// EVERY WORD BELOW IS INVENTED. No production release is copied. The company is
// deliberately not named in the body text, so the same fixture reads correctly
// whichever sandbox company the harness is pointed at.
//
// TWO RELEASES, chosen to exercise the V2 design's two hard cases:
//   drilling   many numeric results with units -- the Key Results layout has to
//              stay aligned and legible at six rows.
//   financing  almost no figures and a different category -- the same card has
//              to look deliberate when the Key Results block is nearly empty.
// The one picked is derived from the FILENAME, so dragging "financing.pdf"
// demonstrates the financing path without any UI to choose it.

const DRILLING = {
  key: "drilling",
  headline: "Drilling Returns 31.4 m of 4.8 g/t Au Including 2.1 m of 46.2 g/t Au",
  releaseDate: null,          // filled in at ingest time — see demoIngest()
  text: `FOR IMMEDIATE RELEASE

Drilling Returns 31.4 m of 4.8 g/t Au Including 2.1 m of 46.2 g/t Au at the Keel Zone

The Company is pleased to report assay results from the first six holes of the
autumn programme at the Keel zone.

Hole RC-26-088 returned 31.4 metres grading 4.8 g/t gold from 149.0 metres,
including 2.1 metres grading 46.2 g/t gold. The intercept is the widest
high-grade interval drilled on the property to date and extends the zone
140 metres down-plunge from the 2025 discovery hole.

Hole RC-26-089, collared 60 metres along strike, returned 18.7 metres grading
2.9 g/t gold from 161.5 metres. Hole RC-26-090 returned 9.2 metres grading
6.1 g/t gold from 204.0 metres, confirming the zone remains open at depth.

Three holes remain in progress. Assays are pending for approximately 1,400
metres of core. The programme is fully funded through to the end of the year.

Qualified Person
The scientific and technical information in this release has been reviewed and
approved by the Company's Qualified Person as defined by National Instrument
43-101.

Forward-Looking Statements
This release contains forward-looking information. Actual results may differ
materially from those expressed or implied.`,
  analysis: {
    card: {
      headline: "Widest high-grade intercept to date extends the Keel zone 140 m down-plunge",
      category: "Discovery",
      whatHappened: "The first six holes of the autumn programme returned 31.4 m at 4.8 g/t gold, including 2.1 m at 46.2 g/t, and two further mineralised intercepts along strike and at depth.",
      whyItMatters: "This is the widest high-grade interval drilled on the property, and it extends the zone 140 m down-plunge from the discovery hole — the first direct evidence the system has depth as well as grade.",
      whatHappensNext: "Three holes remain in progress with assays pending on approximately 1,400 m of core.",
      keyNumbers: [
        { value: "31.4 m @ 4.8 g/t Au", label: "RC-26-088 from 149.0 m" },
        { value: "2.1 m @ 46.2 g/t Au", label: "included in the above" },
        { value: "18.7 m @ 2.9 g/t Au", label: "RC-26-089, 60 m along strike" },
        { value: "9.2 m @ 6.1 g/t Au", label: "RC-26-090, open at depth" },
        { value: "140 m", label: "down-plunge extension" },
        { value: "~1,400 m", label: "core awaiting assay" },
      ],
      stageFrom: "Discovery",
      stageTo: "Delineation",
      investorTakeaway: "A wider, higher-grade intercept that extends the zone at depth moves this from a single discovery hole toward something that can carry a resource estimate — with three holes still pending.",
      projectsMentioned: ["Keel zone"],
      sourceUrl: "",
    },
    classification: {
      suggestedImpact: "Transformational",
      suggestedKey: true,
      impactReason: "The widest high-grade intercept to date, extending the zone down-plunge, materially changes what the deposit could become.",
      milestoneReason: "A step-change in the drill record that a later reader would need to understand the story.",
      confidence: "high",
    },
    proposedChanges: [],
  },
};

const FINANCING = {
  key: "financing",
  headline: "Company Closes Upsized C$18.2 Million Bought Deal Financing",
  releaseDate: null,
  text: `FOR IMMEDIATE RELEASE

Company Closes Upsized C$18.2 Million Bought Deal Financing

The Company announces that it has closed its previously announced bought deal
private placement, upsized twice on strong demand, for aggregate gross proceeds
of C$18,200,000.

The offering was fully subscribed. Net proceeds will fund the 2027 exploration
programme through to a maiden resource estimate, and for general working
capital.

The securities issued are subject to a statutory hold period expiring four
months and one day from closing. The offering remains subject to final
acceptance of the exchange.

Forward-Looking Statements
This release contains forward-looking information. Actual results may differ
materially from those expressed or implied.`,
  analysis: {
    card: {
      headline: "Upsized bought deal closes fully subscribed at C$18.2 million",
      category: "Financing",
      whatHappened: "The bought deal private placement closed fully subscribed for gross proceeds of C$18.2 million, having been upsized twice on demand.",
      whyItMatters: "The programme is now funded through to a maiden resource estimate, which removes the financing overhang that usually sits over a company between discovery and resource.",
      whatHappensNext: "Proceeds fund the 2027 exploration programme; the securities carry a four-month hold period.",
      keyNumbers: [
        { value: "C$18.2M", label: "gross proceeds" },
        { value: "Fully subscribed", label: "upsized twice on demand" },
      ],
      stageFrom: "Discovery",
      stageTo: "Delineation",
      investorTakeaway: "Being funded through to a maiden resource removes the question most likely to have been asked at the next financing, and does it without a discount to a distressed tape.",
      projectsMentioned: [],
      sourceUrl: "",
    },
    classification: {
      suggestedImpact: "High",
      suggestedKey: true,
      impactReason: "Full funding to a defined milestone removes near-term dilution risk.",
      milestoneReason: "The financing that paid for the next phase is part of the durable record.",
      confidence: "high",
    },
    proposedChanges: [],
  },
};

export const RELEASE_FIXTURES = [DRILLING, FINANCING];

/** Pick a fixture from the dropped file's name. Drilling is the default. */
export function fixtureForFile(file) {
  const n = String((file && file.name) || "").toLowerCase();
  if (/financ|placement|bought|raise|offering|capital/.test(n)) return FINANCING;
  return DRILLING;
}
