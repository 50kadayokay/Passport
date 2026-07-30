# Passport — ChatGPT Schema Template

**The flow:** paste the template below into a fresh ChatGPT conversation → attach the
company's documents → it returns one JSON blob → paste that into
**Admin → [company] → Import JSON**. Done.

Nothing here costs API credits. Generation is your ChatGPT subscription; importing is a
database write.

> **If the company has 40+ documents** and ChatGPT truncates or gets thin toward the end
> (usually the timeline), use the **split passes** at the bottom of this file instead. Same
> content, run in three conversations. Start with the one-shot — most companies fit.

---

# THE TEMPLATE — paste this, then attach the documents

```
You are producing a public, investor-facing company profile for PASSPORT, a mobile app where
retail investors follow junior mining companies. I'm giving you a company's public documents
(press releases, technical reports, MD&A, presentations, website pages). Return structured JSON
that I import directly into the app.

═══════════════════════════════════════════════════════════════════
ACCURACY — this is a regulated issuer's public profile
═══════════════════════════════════════════════════════════════════
• Use ONLY facts stated in, or unambiguously implied by, the documents I supply.
• A fabricated share count, drill grade, executive name or date is a serious harm.
• Copy figures EXACTLY as disclosed — commas, units, currency, decimals. "34,523,086", not
  "34.5 million". Use the most recent disclosed value.
• Not disclosed → null. Never guess, estimate, or infer.
• READ EVERY DOCUMENT BEFORE WRITING. Do not work document-by-document.
• Don't stop at the first acceptable answer — the goal is the best-supported one. Check
  footnotes, tables, captions, appendices.
• Conflicting sources → prefer newer and more authoritative. Never average or merge figures.

═══════════════════════════════════════════════════════════════════
WRITING STANDARD
═══════════════════════════════════════════════════════════════════
• Write like a disciplined analyst. Never promotional or persuasive.
• Never reference share price, valuation, or investment merit. Never predict success.
• State risk honestly — a softened risk statement is a defect.
• Extract the underlying FACT and rewrite it plainly. Don't copy company marketing prose.

TWO LENGTH RULES, applied in different places:
1. CARD FACES (headlines, tiles, catalysts) — ruthlessly brief. The per-field limits below
   are CEILINGS, not targets. Shortest wording that conveys the fact wins.
2. DETAIL SHEETS (content behind a tap) — richness is REQUIRED. A one-line detail sheet is a
   failure. Depth of EVIDENCE is the goal; economy of WORDS is the constraint.

Cut from visible text: the company name where context implies it, dates inside the text,
document names, parenthetical citations, filler ("the company announced", "it is expected
that"). One fact per field — never join two developments with "and".

═══════════════════════════════════════════════════════════════════
FIELD NAMES ARE A HARD CONTRACT
═══════════════════════════════════════════════════════════════════
Use the exact names below, exactly as spelled, in camelCase. Do not rename, translate, add or
nest fields. Any field name I didn't give you is rejected on import.

IMAGES: never generate, source or describe images. Logos, site photos and headshots are
uploaded manually and are outside your scope.

═══════════════════════════════════════════════════════════════════
THE SCHEMA
═══════════════════════════════════════════════════════════════════

{
  "archetype": "Explorer|Developer|Producer|Royalty Company|Prospect Generator|Pending Transaction",
  "asOfDate": "YYYY-MM-DD",          // most recent disclosure you reviewed
  "confidence": "high|medium|low",
  "reviewRequired": false,           // true if sources conflicted or coverage was incomplete
  "notFound": [],                    // what you honestly could not fill

  "company": {
    "name": "Kingsmen Resources",
    "ticker": "TSXV: KNG",
    "website": "https://...",
    "slogan": null,                  // their own tagline only. DO NOT INVENT ONE.
    "commodity": "Silver & Gold",
    "jurisdiction": "Chihuahua, Mexico",
    "listings": [{ "ex": "TSXV", "sym": "KNG" }]
  },

  // ─── THE STATUS CARD — the most-read widget ──────────────────────────────
  // FIRST decide WHAT the status is. Do not just summarise the newest release.
  //   1. List every current material initiative.
  //   2. Rank: active drilling/construction/production > permitting or regulatory milestone >
  //      economic study (PEA/PFS/FS) > resource estimate > financing enabling advancement >
  //      material acquisition/merger > production optimization > awaiting results.
  //   3. Recency is only a TIEBREAKER. Materiality wins.
  //   NEVER the status: conference attendance, investor presentations, marketing, website
  //   launches, IR agreements, option/RSU grants, AGM results, routine filings, analyst
  //   coverage, social media, branding, historical achievements, repeat announcements.
  "companyStatus": {
    "statusHeadline": "26-Hole Drill Campaign",
        // The initiative. 2-6 words, noun phrase. An ACTIVITY, not an identity. MAX 30 chars.
        // Bad: "Leading Silver Explorer", "Exciting Company Update"
    "statusHeadlineSubtext": "Phase 1 diamond drilling is underway at Las Coloradas.",
        // One sentence: activity + location + stage. MAX 100 chars.
    "latestUpdate": "Three drill holes submitted for assay.",
        // Newest material development in THIS initiative. One fact. No dates, no company
        // name. MAX 90 chars.
    "investmentImpact": "Could expand the high-grade silver system.",
        // Why it matters. Conditional language for unproven outcomes. MAX 90 chars.
        // Bad: "Very positive for shareholders."
    "nextCatalyst": "Phase 1 Assays",
        // Next material event. 2-4 words, noun phrase. MAX 25 chars.
        // Bad: "Beaver Creek Conference"
    "expected": "H2 2026",
        // Disclosed guidance only. MAX 20 chars. null if not disclosed — NEVER estimate.
    "progressBar": { "enabled": true, "current": 14, "total": 26, "unit": "holes" }
        // ONLY if numerator AND denominator are both disclosed. Omit entirely otherwise —
        // never fabricate a percentage. "Permit submitted" is NOT 60%. "PEA underway" is
        // NOT 40%.
  },

  "companyBrief": {
    "keyPoints": [
        // 3-5 CORE VALUE DRIVERS. ~5-8 words each, MAX 50 chars. Scannable, fact-backed.
        // BANNED: "Experienced management team", "Attractive valuation", "Well positioned
        // for growth", "Great jurisdiction" — anything true of dozens of juniors.
        // VALUE DRIVER = what the company is DOING (changes within a year).
        // COMPETITIVE ADVANTAGE = what it POSSESSES (still true in years) → goes in the
        // sections below, NOT here. They must not duplicate.
      "Active 26-hole drill campaign underway",
      "Fully funded through 2026 — no near-term dilution",
      "Multiple drill-ready discovery targets"
    ],
    "sections": [
        // EXACTLY these six, this order. Prose 2-3 sentences each — except Competitive
        // Advantages (3-5 bullets). ~350 words total. The "k" values are fixed headers:
        // reproduce them exactly. Omit a section entirely if unsupported — never write
        // "Not disclosed".
      { "k": "What They Do", "v": "Business type, commodity, jurisdiction, model. No current news." },
      { "k": "How They Create Value", "v": "Management's DISCLOSED strategy. Never predict success." },
      { "k": "Why It Matters", "v": "Factual commodity/jurisdiction/geology context. No market calls." },
      { "k": "Competitive Advantages", "bullets": ["Durable, structural, disclosure-backed only"] },
      { "k": "Current Focus", "v": "What management is doing now. Don't repeat the status card's latest update / catalyst / timing." },
      { "k": "What Success Looks Like", "v": "The logical next stage of the business. No speculation." }
    ]
  },

  // ─── CAPITAL — tiles are KEY NUMBERS, not sentences ──────────────────────
  "capital": {
    "outstanding": "34,523,086",     "fd": "44.9M",
    "options": null,                 "warrants": null,
    "cash": "C$4.2M",                "debt": "C$0",
    "marketCap": "C$18.5M",          "sharePrice": "C$0.21",
    "ownership": null,               // insider/institutional split; juniors often don't disclose
    "state": "Fully Funded",
        // EXACTLY one of: Fully Funded | Recently Financed | Production Funded |
        // Financing Expected | Capital Allocation Update | Strategic Acquisition Funding
    "headline": "Fully Funded Through 2026",
        // About the FUNDING POSITION. Never a company description.
        // BAD: "Producing uranium company with growing cash flow" — that's a company blurb.
    "subtext": "The C$13M February bought deal fully funds the planned 2026 program.",
    "financing": "C$13.0M bought deal, February 2026",
    "financingDate": "February 2026", "financingType": "Bought Deal",
    "financingPrice": "C$0.90",       "financingUse": "2026 Exploration Program"
  },

  "team": [
      // Real named people with disclosed titles ONLY. Officers first, then directors.
      // Never invent people or credentials, never pad with unnamed "advisors".
      // A useful bio names prior discoveries, exits, relevant operating experience —
      // not "seasoned professional".
    { "name": "Scott Emerson", "role": "President, CEO & Director",
      "short": "One line, MAX 120 chars — prior companies, credentials",
      "full": "2-4 sentences if the documents provide a bio, else null" }
  ],

  // ─── PROJECTS ────────────────────────────────────────────────────────────
  // RICHNESS TIERS — match depth to evidence. NEVER pad a thin project.
  //   Tier 1 Flagship  — drives the story. Full detail everywhere.
  //   Tier 2 Secondary — real disclosure, less of it. Populate what's supported.
  //   Tier 3 Early     — a name, location and status is a COMPLETE answer. Do not invent
  //                      geology, a thesis, or drill history to fill it out.
  // FLAGSHIP FIRST in the array — it's the default view.
  "projects": [
    {
      "key": "las-coloradas",
      "name": "Las Coloradas",
      "short": "Las Coloradas",      // 2-3 word tab label. REQUIRED — the selector strip is
                                     // narrow and a long name hides every other tab.
      "tag": "Active · 2026 Drill Program",
      "locationFull": "Parral District, Chihuahua, Mexico",
      "stageName": "Discovery-Stage Drilling",
      "stageIdx": 1,
          // 0=Explore 1=Discovery 2=Resource 3=Studies 4=Development 5=Production
          // Only claim a stage the disclosure supports. A producing mine is 5; an explorer
          // with no resource is NOT 2.

      // THE FUNDAMENTALS GRID. Fill every cell the documents support.
      // detail + note ARE WHAT MAKE THE TAP-THROUGH WORTH OPENING. A cell with only a value
      // produces a one-line sheet — the single most common failure. 4-8 detail pairs each.
      "snapshot": {
        "location": {
          "value": "Parral District", "value2": "Chihuahua, Mexico",
          "summary": "2-4 sentences: district, region, operational setting, infrastructure.",
          "detail": [["Mining District","Parral District"], ["Province / State","Chihuahua"],
                     ["Country","Mexico"], ["Road Access","Year-round; ~38 km from Parral"],
                     ["Power Availability","Grid power nearby"],
                     ["Nearby Community","Hidalgo del Parral · 38 km"],
                     ["Climate / Seasonal Access","Semi-arid; accessible all year"]],
          "note": "Why the location helps or constrains DEVELOPMENT. Operational implications
                   only — not geography trivia. No GPS coordinates."
        },
        "commodity": {
          "value": "Silver · Gold", "summary": "...",
          "detail": [["Primary","Silver (Ag)"], ["Secondary Commodities","Gold · Lead · Zinc"],
                     ["Reporting Basis","Silver-equivalent (AgEq)"],
                     ["Deposit Style","Low-sulphidation epithermal vein"],
                     ["Associated Metals","Lead · Zinc · Copper credits"]],
          "note": "Why this mix matters to THIS project's economics. No price talk."
              // Copy AgEq/AuEq/CuEq EXACTLY — never convert or reformat.
              // Omit "typical end uses" for gold/silver/copper — encyclopedia filler.
        },
        "ownership":    { "value": "100% Owned", "summary": "...",
                          "detail": [["Interest","100% owned"], ["JV partners","None"],
                                     ["Royalties","None disclosed"]], "note": "..." },
        "landPackage":  { "value": "15 Claims · 845 ha", "summary": "...",
                          "detail": [["Total area","845 hectares"], ["Concessions","15 claims"],
                                     ["Strike length","~2.5 km corridor"],
                                     ["Open at depth","Below ~125 m"]], "note": "..." },
        "depositType":  { "value": "Epithermal Vein", "summary": "...",
                          "detail": [["Model","Low-sulphidation epithermal"],
                                     ["Host rocks","Volcanic & sedimentary"],
                                     ["Controls","NW-trending structures"]], "note": "..." },
        "pastProducer": { "value": "ASARCO", "summary": "...",
                          "detail": [["Operator","ASARCO"], ["Era","20th century"]],
                          "note": "..." }        // omit entirely if never mined
      },

      // THE DETAIL SHEETS. Each block: summary + evidence + closing.
      "content": {
        "brief": {                    // prose only, no tables
          "overview":  "3-5 sentences — what this project IS. Descriptive: no current program, no catalysts, no risk.",
          "thesis":    "2-4 sentences — the geological idea being TESTED. The hypothesis, not the progress.",
          "focus":     "2-4 sentences — the technical question being worked on right now.",
          "different": "2-4 sentences — durable technical differentiators.",
          "risks":     "2-4 sentences — real technical risk, plainly. DO NOT SOFTEN. Technical only (no cash/financing/management).",
          "means":     "2-4 sentences — why it matters to an investor; what milestone determines success. No prediction, no valuation."
        },
        "geology":  { "summary": "...", "table": [["Deposit Type","..."], ["Host Rocks","..."],
                       ["Structural Controls","..."], ["Mineralization Style","..."],
                       ["Alteration","..."], ["Historic Production","..."]], "closing": "..." },
        "strategy": { "summary": "...", "program": "...", "objectives": [], "priority": [],
                      "evidence": [], "future": "...", "closing": "..." },   // lists, NOT a table
        "results":  { "summary": "...",
                      "intercepts": [{ "hole": "Discovery Hole", "grade": "1,742 g/t AgEq",
                                       "width": "0.70 m", "note": "..." }],
                      "latest": "...", "pending": "...", "holes": "...", "metres": null,
                      "closing": "..." },
                      // Real hole IDs and grades exactly as disclosed. If the project has no
                      // drill results, omit "intercepts" and say so plainly in summary — a
                      // producing mine or royalty asset legitimately has none.
        "targets":  { "summary": "...",
                      "priority": [{ "name": "...", "objective": "...", "status": "Drilling" }],
                      "evidence": [], "closing": "..." },
        "stage":    { "summary": "...", "current": "Discovery",
                      "program": "26-hole diamond drill program", "activity": "...",
                      "completed": [], "next": "...", "timing": "...", "closing": "..." },
        "unique":   { "summary": "...",
                      "diffs": [{ "h": "Proven high-grade district", "t": "...",
                                  "fact": "Historic grades of 300-518 g/t silver" }],
                      "evidence": [], "takeaway": "..." },
                      // Every diff MUST carry a disclosed number or name as "fact".
                      // No proof, no diff.
        "scenarios": { "bull": { "text": "1-2 sentences" },
                       "bear": { "text": "MUST state genuine risk — no resource, continuity
                                          unproven, commodity exposure. A sanitised bear case
                                          is a defect." },
                       "next": { "text": "The next real validation point." } },
        "district": { "summary": "...", "table": [], "closing": "..." }
                      // Third-party mines/deposits nearby, named in the documents.
                      // Not this company's own assets.
      }
    }
  ],

  "timeline": [
      // One entry per press release.
    { "date": "2026-05-12",
      "headline": "Kingsmen Completes 60 km² Precision Drone Magnetic Survey",
      "whyItMatters": "One sentence of investor significance — must ADD insight, not restate the headline. MAX 120 chars.",
      "keyNumbers": ["60 km² surveyed", "2.5 km corridor"],
      "key": true,
          // true ONLY for genuine milestones — discovery holes, resource estimates, permits,
          // financings, production starts. Routine updates are false.
          // Include routine releases (conferences, IR agreements, option grants) for
          // completeness, but always mark them false.
      "fullText": null }        // LEAVE NULL — I upload full text separately
  ]
}

═══════════════════════════════════════════════════════════════════
OUTPUT — return TWO blocks
═══════════════════════════════════════════════════════════════════

=== BLOCK 1: DATA ===
Valid JSON only, matching the schema above. No commentary. This is what I paste into the app.

=== BLOCK 2: AUDIT ===
A table showing your work for every field you filled or deliberately left null:
  Field | Value written | Verification | Source document + date | Supporting quote | Why

Verification is exactly one of:
  QUOTED       - copied verbatim or near-verbatim from a document
  DERIVED      - calculated from disclosed figures (show the arithmetic)
  SYNTHESIZED  - written from multiple sources in your own words
  SELECTED     - you chose among candidates (name what you rejected and why)
  MISSING      - could not fill (say what you searched and what was absent)

A real supporting quote is mandatory for QUOTED and DERIVED — the actual sentence, not a
paraphrase. Sort SELECTED, SYNTHESIZED and MISSING first; QUOTED last. Never invent document
IDs — use the real filename and date.

SPECIAL INSTRUCTIONS FOR THIS COMPANY:
(leave blank unless I've written something here)

The documents follow.
```

---

# If the one-shot runs out of room

For a 40+ document company, ChatGPT may truncate or go thin toward the end (usually the
timeline). Run it in three conversations instead. Paste the same template each time, with one
of these lines added at the top:

**Pass 1** — `Return ONLY these keys this time: archetype, asOfDate, confidence, reviewRequired, notFound, company, companyStatus, companyBrief, capital, team. Skip projects and timeline.`

**Pass 2** — `Return ONLY the projects key this time (plus the metadata keys). Skip everything else.`

**Pass 3** — `Return ONLY the timeline key this time (plus the metadata keys), for the releases in this batch. Skip everything else.`

Each result imports independently — the importer merges sections and de-duplicates timeline
entries, so nothing gets overwritten.

---

# When news lands later

```
This company already has a Passport profile. I'm giving you ONE new press release. Return only
what changes — a delta, not the whole profile. Use the same schema and the same two-block output.

ALWAYS return:
  timeline       the single new entry
  companyStatus  a REFRESHED status card — latestUpdate, investmentImpact, nextCatalyst and
                 expected are stale the moment news lands. Re-run the selection ranking: this
                 release may or may not become the new status. A routine release must NOT
                 displace a more material ongoing initiative.

ONLY IF this release actually changed them:
  capital        if it's a financing
  projects       only the affected project, only the affected blocks — I merge by project key
  companyBrief   only if the thesis genuinely moved
```
