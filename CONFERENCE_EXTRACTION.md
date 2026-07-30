# Conference Extraction Script

**How to use this.** Open a fresh ChatGPT conversation, attach a company's public documents
(press releases, technical report / NI 43-101, MD&A, financial statements, investor presentation,
website pages), paste the prompt in the box below, and send. ChatGPT returns one JSON object in
the conference schema. You proofread that JSON — it's the company's real data, ready for us to
design a booth layout from.

This script only **extracts data**. It says nothing about how the booth looks — that's the next
step, driven by your visual examples.

---

## The prompt (copy everything in the box)

```
You are extracting a junior mining company's details into a structured CONFERENCE profile — the
factual foundation for a premium investor-conference iPad experience. I'm giving you the company's
public documents. Return ONE JSON object in the exact schema below.

═══════════════════════════════════════════════════════════════════
FIRST, UNDERSTAND THE COMPANY
═══════════════════════════════════════════════════════════════════
Before filling a single field, read everything and understand the company the way a sharp analyst
would: what are they actually building, why should anyone care, what has to go right, what is the
real risk, and what is the ONE thing that makes them interesting. Every field you write is a facet
of that single understanding — not an isolated lookup. The result should read like a guided tour by
someone who knows the company cold.

═══════════════════════════════════════════════════════════════════
ACCURACY — this is a public, regulated issuer's profile
═══════════════════════════════════════════════════════════════════
• Use ONLY facts stated in, or unambiguously implied by, the documents I supply.
• A fabricated share count, drill grade, executive name or date is a serious harm.
• Copy figures EXACTLY as disclosed — commas, units, currency, decimals ("34,523,086", not
  "34.5 million"). Use the most recent disclosed value.
• Anything the documents don't state → null. Never write "N/A", never guess.
• Factual and analytical, never promotional. State the real risk honestly.
• The investor presentation tells you what management EMPHASIZES (what to feature, ordering) — but
  every fact must still be verifiable in an authoritative document (financials, technical report,
  news releases). Do not copy unsupported marketing claims.

═══════════════════════════════════════════════════════════════════
RICHNESS — do not write thin
═══════════════════════════════════════════════════════════════════
Every project must be substantive: real geology, real drill results, real context — not one line.
Capture the drill intercepts, the economics, the capital position, the people's track records, the
catalysts. If the documents support it, it belongs in here. Depth is the point.

═══════════════════════════════════════════════════════════════════
OUTPUT — return ONE JSON object, exactly this shape
═══════════════════════════════════════════════════════════════════
{
  "company": {
    "name": "", "tickers": ["EXCH: SYM"], "commodity": "", "jurisdiction": "",
    "stage": "exploration | development | production | royalty",
    "headquarters": "", "website": ""
  },

  "story": {
    "hook": "",                 // the ONE thing to remember (≤ 8 words)
    "oneLiner": "",             // one sentence: what they do
    "narrative": "",            // 2–4 sentences: the real story + why it matters
    "whyNow": "",               // the current catalyst / why this moment
    "macroContext": "",         // the commodity / market backdrop, fact-based
    "thesis": ["", ""],         // 3–5 concrete value drivers (each ≤ 12 words)
    "differentiators": ["", ""],// 2–4 real edges over peers
    "bear": ""                  // the honest key risk (do not sanitise)
  },

  "highlights": [               // 4–6 defining numbers, verbatim from the docs
    { "value": "", "label": "", "note": null }
  ],

  "projects": [                 // ONE object per material asset — rich, never a one-liner
    {
      "name": "", "location": "", "jurisdiction": "", "ownership": "", "landPackage": "",
      "stage": "", "commodity": "", "depositType": "",
      "district": "",           // nearby mines / producing district context
      "geology": "",            // deposit model summary (2–4 sentences)
      "story": "",              // why THIS project matters
      "currentCampaign": {
        "headline": "", "holesDone": null, "holesTotal": null, "metres": null,
        "activeRigs": null, "nextStep": ""
      },
      "technical": {
        "type": "exploration | development | production | royalty",
        "drillResults": {       // exploration
          "headlineIntercept": { "hole": "", "grade": "", "width": "", "from": null, "to": null, "note": "" },
          "intercepts": [ { "hole": "", "grade": "", "width": "", "from": null, "to": null, "note": "" } ],
          "holesCompleted": null, "metresDrilled": null, "assaysPending": null
        },
        "resource": { "category": "", "tonnes": "", "grade": "", "containedMetal": "" },  // if disclosed
        "economics":  { "npv": "", "irr": "", "capex": "", "payback": "", "mineLife": "", "aisc": "" }, // developers
        "production": { "annualOutput": "", "aisc": "", "freeCashFlow": "", "reserveLife": "" },        // producers
        "royalty":    { "payingRoyalties": null, "avgNsr": "", "operators": null }                      // royalty cos
      },
      "imagery": [ "" ]         // describe the photos/maps/core shots the docs reference for this project
    }
  ],

  "capital": {
    "treasury": "", "sharesOutstanding": "", "fullyDiluted": "", "marketCap": "", "sharePrice": "",
    "fundingStatus": "", "recentFinancing": "", "runway": "",
    "ownershipSplit": [ { "group": "", "pct": "" } ]   // institutional / insider / retail, if disclosed
  },

  "leadership": [               // named people with disclosed roles
    { "name": "", "role": "", "trackRecord": "", "photo": null }   // trackRecord: past discoveries, exits, $ raised
  ],

  "timeline": [                 // milestones / execution history, most recent first
    { "date": "YYYY-MM-DD", "headline": "", "significance": "", "key": false }
  ],

  "catalysts": [                // upcoming value events
    { "label": "", "timing": "", "impact": "" }
  ],

  "evidence": [                 // the concrete facts that back the story
    { "claim": "", "proof": "", "source": "" }
  ],

  "media": {                    // asset inventory (describe what exists; you can't produce images)
    "heroVideo": null, "heroPhoto": null,
    "projectAerials": [ "" ], "corePhotos": [ "" ], "maps": [ "" ], "headshots": [ "" ]
  },

  "cta": {
    "contact": { "phone": null, "email": null, "ir": null, "website": null,
                 "twitter": null, "linkedin": null }
  },

  "notFound": [ "" ]            // anything material you could not fill, so gaps are visible
}

RULES:
• Fill every field the documents support; use null for anything not disclosed (don't drop keys).
• For each project, pick the "technical" branch matching its stage and fill it; leave the others'
  fields null.
• Copy all numbers verbatim. Return ONLY the JSON — no commentary, no code fences.
```

---

## The workflow this fits into

1. **Extract** — run the prompt above in ChatGPT with a company's docs → filled conference JSON.
2. **Proofread** — you check the JSON: right story, right projects, right drill results.
3. **Design** — you bring this JSON *plus your layout examples* to me, and I build the booth from it.

Tell me if any field is thin or missing before you run it on a real company — locking the schema now avoids re-extracting later.

---

## Worked example (FICTIONAL — illustrates a fully-filled result)

> This is **not a real company** — every figure is invented to show what a rich, complete
> extraction looks like. Use it to judge whether the schema captures enough, and to brainstorm
> layout against realistic-shaped data.

```json
{
  "company": {
    "name": "Cordillera Silver Corp.",
    "tickers": ["TSXV: CDS", "OTCQB: CDSLF"],
    "commodity": "Silver & Gold",
    "jurisdiction": "Durango, Mexico",
    "stage": "exploration",
    "headquarters": "Vancouver, BC, Canada",
    "website": "https://www.cordillerasilver.com"
  },
  "story": {
    "hook": "High-grade silver, drill-confirmed",
    "oneLiner": "A silver-gold explorer drilling out a high-grade epithermal discovery in Mexico's Faja de Plata.",
    "narrative": "Cordillera controls the 18,400-hectare El Farol district in Durango, where 2025 drilling confirmed a high-grade epithermal vein system that stays open along strike and at depth. A fully funded 25,000 m program is now testing whether isolated hits connect into a coherent resource.",
    "whyNow": "Phase 2 assays from the discovery zone are pending, with results expected through H2 2026.",
    "macroContext": "Silver demand is climbing on solar and grid buildout while new high-grade discoveries have grown scarce.",
    "thesis": [
      "District-scale land in a Tier-1 Mexican silver belt",
      "Drill-confirmed high-grade discovery, open at depth",
      "Fully funded through 2026 — no near-term dilution",
      "Multiple untested targets across the district"
    ],
    "differentiators": [
      "100%-owned, consolidated district (no royalties on the core)",
      "Team with two prior Mexican silver discoveries"
    ],
    "bear": "Drilling may fail to demonstrate continuity between mineralized zones, weakening the resource thesis."
  },
  "highlights": [
    { "value": "641 g/t AgEq", "label": "Discovery intercept", "note": "over 1.4 m at Yaxché" },
    { "value": "25,000 m", "label": "Funded 2026 program", "note": null },
    { "value": "C$30.0M", "label": "Treasury", "note": "fully funded" },
    { "value": "18,400 ha", "label": "District, 100% owned", "note": null }
  ],
  "projects": [
    {
      "name": "El Farol",
      "location": "Durango, Mexico",
      "jurisdiction": "Durango State",
      "ownership": "100%",
      "landPackage": "18,400 ha",
      "stage": "Discovery-stage drilling",
      "commodity": "Silver-gold (Pb-Zn credits)",
      "depositType": "Low-sulphidation epithermal vein",
      "district": "Faja de Plata; 40 km from an operating mid-tier silver mine",
      "geology": "NW-trending quartz-calcite veins hosted in a volcanic-sedimentary sequence. Grade is structurally controlled and the system remains open at depth.",
      "story": "The Yaxché vein returned the discovery hole; step-out drilling is testing strike and depth extensions plus three parallel structures.",
      "currentCampaign": {
        "headline": "Phase 2 diamond drilling underway",
        "holesDone": 11, "holesTotal": 25, "metres": 12400, "activeRigs": 2,
        "nextStep": "Assays on 6 holes pending; step-outs to the northwest"
      },
      "technical": {
        "type": "exploration",
        "drillResults": {
          "headlineIntercept": { "hole": "YAX-25-04", "grade": "641 g/t AgEq", "width": "1.4 m", "from": 182.0, "to": 183.4, "note": "within a broader 12 m zone at 190 g/t AgEq" },
          "intercepts": [
            { "hole": "YAX-25-04", "grade": "641 g/t AgEq", "width": "1.4 m", "from": 182.0, "to": 183.4, "note": "bonanza vein" },
            { "hole": "YAX-25-07", "grade": "312 g/t AgEq", "width": "3.2 m", "from": 145.5, "to": 148.7, "note": "hanging-wall splay" },
            { "hole": "SOL-25-02", "grade": "188 g/t AgEq", "width": "5.6 m", "from": 96.0, "to": 101.6, "note": "parallel structure" }
          ],
          "holesCompleted": 11, "metresDrilled": 12400, "assaysPending": 6
        },
        "resource": { "category": null, "tonnes": null, "grade": null, "containedMetal": null },
        "economics":  { "npv": "", "irr": "", "capex": "", "payback": "", "mineLife": "", "aisc": "" },
        "production": { "annualOutput": "", "aisc": "", "freeCashFlow": "", "reserveLife": "" },
        "royalty":    { "payingRoyalties": null, "avgNsr": "", "operators": null }
      },
      "imagery": ["Yaxché drone aerial", "core photo of 641 g/t interval", "district vein-map"]
    },
    {
      "name": "La Cumbre",
      "location": "Durango, Mexico",
      "jurisdiction": "Durango State",
      "ownership": "100%",
      "landPackage": "included in district",
      "stage": "Target definition",
      "commodity": "Silver-gold",
      "depositType": "Epithermal vein (interpreted)",
      "district": "Southern El Farol district",
      "geology": "Surface sampling has outlined a 2.5 km vein corridor; undrilled.",
      "story": "The next drill-ready target once Yaxché step-outs conclude.",
      "currentCampaign": { "headline": "Undrilled — surface work complete", "holesDone": null, "holesTotal": null, "metres": null, "activeRigs": null, "nextStep": "Permit drill pads for a 2027 maiden program" },
      "technical": {
        "type": "exploration",
        "drillResults": { "headlineIntercept": { "hole": null, "grade": null, "width": null, "from": null, "to": null, "note": null }, "intercepts": [], "holesCompleted": null, "metresDrilled": null, "assaysPending": null },
        "resource": { "category": null, "tonnes": null, "grade": null, "containedMetal": null },
        "economics": { "npv": "", "irr": "", "capex": "", "payback": "", "mineLife": "", "aisc": "" },
        "production": { "annualOutput": "", "aisc": "", "freeCashFlow": "", "reserveLife": "" },
        "royalty": { "payingRoyalties": null, "avgNsr": "", "operators": null }
      },
      "imagery": ["La Cumbre surface-sample map"]
    }
  ],
  "capital": {
    "treasury": "C$30.0M",
    "sharesOutstanding": "82,410,000",
    "fullyDiluted": "98,200,000",
    "marketCap": "C$85.0M",
    "sharePrice": "C$1.03",
    "fundingStatus": "Fully funded through 2026",
    "recentFinancing": "C$22.0M bought deal, March 2025 at C$0.85",
    "runway": "Funds the full 25,000 m program with no near-term raise",
    "ownershipSplit": [
      { "group": "Institutional", "pct": "38%" },
      { "group": "Management & insiders", "pct": "22%" },
      { "group": "Retail", "pct": "40%" }
    ]
  },
  "leadership": [
    { "name": "Elena Ruiz", "role": "President & CEO", "trackRecord": "Ex-Goldcorp; led the US$1.2B sale of a Mexican silver developer", "photo": null },
    { "name": "Mark Chen", "role": "VP Exploration", "trackRecord": "20+ years in the Faja de Plata; two prior discoveries", "photo": null },
    { "name": "Sara Idris", "role": "CFO", "trackRecord": "Raised over C$400M across junior miners", "photo": null }
  ],
  "timeline": [
    { "date": "2025-06-02", "headline": "Phase 2 drill program launched", "significance": "Fully funded 25,000 m program begins at Yaxché", "key": true },
    { "date": "2025-03-12", "headline": "Discovery hole: 641 g/t AgEq over 1.4 m", "significance": "Confirmed a high-grade epithermal system", "key": true },
    { "date": "2024-09-24", "headline": "Acquired and consolidated the El Farol district", "significance": "100% control of 18,400 ha", "key": true }
  ],
  "catalysts": [
    { "label": "Phase 2 assays (6 holes)", "timing": "H2 2026", "impact": "Tests continuity of the discovery zone" },
    { "label": "Maiden resource scoping", "timing": "2027", "impact": "First path to a valued resource" }
  ],
  "evidence": [
    { "claim": "High-grade discovery is real", "proof": "YAX-25-04: 641 g/t AgEq over 1.4 m", "source": "News release, 2025-03-12" },
    { "claim": "Fully funded", "proof": "C$30.0M treasury vs. fully-costed 2026 program", "source": "MD&A, Q1 2025" },
    { "claim": "District control", "proof": "18,400 ha, 100% owned, no core royalties", "source": "Technical report, 2024" }
  ],
  "media": {
    "heroVideo": "district drone loop (referenced in presentation)",
    "heroPhoto": "Yaxché ridge aerial",
    "projectAerials": ["El Farol district", "Yaxché vein trace"],
    "corePhotos": ["641 g/t interval", "SOL-25-02 parallel vein"],
    "maps": ["district vein map", "La Cumbre surface samples"],
    "headshots": ["Elena Ruiz", "Mark Chen", "Sara Idris"]
  },
  "cta": {
    "contact": { "phone": null, "email": "ir@cordillerasilver.com", "ir": null, "website": "https://www.cordillerasilver.com", "twitter": "@CordilleraAg", "linkedin": "cordillera-silver" }
  },
  "notFound": ["No mineral resource estimate disclosed yet", "No metallurgical recovery data"]
}
```

That's what "filled" looks like — that's the substance a layout gets to draw from.

