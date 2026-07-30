// The ChatGPT prompt used to generate a company profile.
//
// Kept here (rather than in a doc) so the admin can copy it in one click. Paste it into a
// fresh ChatGPT conversation, attach the company's documents, and paste the returned
// BLOCK 1 into Admin → Import a company from JSON.
//
// Every field name below is a hard contract with the app's code. If this template drifts
// from the schema in PASSPORT_SCHEMA.md, the importer will start reporting unknown keys —
// that's the signal to reconcile them.

export const PROMPT_TEMPLATE = `You are producing a public, investor-facing company profile for PASSPORT, a mobile app where
retail investors follow junior mining companies. I'm giving you a company's public documents
(press releases, technical reports, MD&A, presentations, website pages). Return structured JSON
that I import directly into the app.

═══════════════════════════════════════════════════════════════════
FIRST, UNDERSTAND THE COMPANY — do not fill fields blindly
═══════════════════════════════════════════════════════════════════
The single biggest failure mode is treating this like a form: reading one figure, writing one
field, moving on. That produces a profile that is technically correct and completely lifeless —
a list of facts that never adds up to a company. You must do better than that.

Before you write a single field, READ EVERYTHING and build a genuine understanding, the way a
sharp analyst would after a first full pass:
  • THE STORY — In one honest paragraph to yourself: what is this company actually trying to do,
    why should anyone care, and what has to go right? What's the ONE thing that makes it
    interesting? What's the real risk? If you can't say it in plain English, you haven't
    understood it yet — keep reading.
  • THE THROUGH-LINE — A great profile has a spine. The status, the projects, the capital, the
    timeline are not six separate topics — they are one story told from different angles. The
    drill result in the timeline IS the progress on the project IS what the status card is about.
    Hold the whole picture in your head so every field reinforces the same coherent narrative.
  • THEN WRITE — Now fill the fields. Each one is a facet of that single understanding, not an
    isolated lookup. A field should read like it was written by someone who has read the whole
    story and is now telling you one part of it — not by someone who was handed one cell to fill.

CROSS-AWARENESS IS REQUIRED. Every field is written knowing what the others say:
  • The status card assumes the reader will also see the projects — so it frames, it doesn't
    re-explain. The project brief assumes the reader saw the status — so it goes deeper, it
    doesn't repeat the headline. The bull case knows what the geology section already established.
  • When two fields touch the same fact, they approach it from different heights: one states it,
    the next explains why it matters, the next what it means for the future. Never the same
    sentence twice.
  • The result should feel like a guided tour by someone who knows the company cold — not a
    database dump. A reader moving through the profile should feel the pieces connect.

THE BAR — write so that an average person with no mining background finishes the profile and
thinks: "I actually understand what this company does, I can see why it might matter, and that
was genuinely easy — even enjoyable — to read." Lively, clear, human. Never dry, never a
brochure. If a sentence is boring or could describe any company, rewrite it until it's about
THIS one. (All of this lives INSIDE the accuracy rules below — every word still traces to a
disclosed fact. Vivid and true, never vivid and invented.)

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
• Conflicting sources → see WHERE TO LOOK below. Authority beats recency. Never average or
  merge figures.

═══════════════════════════════════════════════════════════════════
CURRENCY — the profile must reflect where the company stands TODAY
═══════════════════════════════════════════════════════════════════
A CEO reading their own profile must think "yes, this is exactly where we are right now."
• Find the single MOST RECENT material development across all documents (newest press release,
  newest filing) and make sure the STATUS CARD reflects it: statusHeadline = what's happening
  now, latestUpdate = that newest event, nextCatalyst = the next disclosed step after it. A
  status card describing a six-month-old event when a newer one exists is a failure.
• Every figure = the most recently disclosed value (newest financials for cash/shares, newest
  resource for tonnes/grade). If a later document revises an earlier number, use the later one.
• Set "asOfDate" to the date of the NEWEST document you used (YYYY-MM-DD). This stamps how
  current the profile is.
• If the newest document you were given is itself old (e.g. many months stale), say so in the
  audit and set "reviewRequired": true — the operator may be missing a recent release.
• Never present a superseded plan as current. If the company said in March it "plans to drill"
  and a June release says drilling is done, the current status is "drilling complete".

═══════════════════════════════════════════════════════════════════
WHERE TO LOOK — which document is authoritative for each field
═══════════════════════════════════════════════════════════════════
Documents are NOT equally reliable. Use the strongest available source for every field.
AUTHORITY BEATS RECENCY — a newer presentation does not override older audited financials.
Recency only breaks ties within the same authority tier.

CAPITAL — shares outstanding, fully diluted, cash, debt, working capital, financings, market cap
  1. Financial statements  2. MD&A  3. Financing / offering documents  4. Presentation
  Never take capital data from a presentation when a filed financial document has it.

GEOLOGY & TECHNICAL — deposit type, mineralization, resources, metallurgy, drill results
  1. Technical report (NI 43-101 / JORC)  2. PEA / PFS / FS  3. Technical news releases
  4. Presentation
  Resource figures, grades and geological interpretation come from technical documents.

PROJECT — location, ownership, land package, infrastructure, permits, access, nearby operations
  1. Technical report  2. Official project web pages  3. Presentation

STRATEGY & OUTLOOK — strategy, management priorities, current focus, planned work, risk
  1. MD&A  2. Most recent material news releases  3. Presentation

TIMELINE — milestones, drill campaigns, financings, acquisitions, discoveries, leadership changes
  1. Press releases ONLY. One entry per material release.
  Never reconstruct a timeline from a presentation.

LEADERSHIP & GOVERNANCE — executives, directors, committees, biographies
  1. AGM / information circular  2. Governance documents  3. Official corporate website
  Never infer a biography or a title.

PRESENTATIONS ARE A LEAD, NOT A SOURCE.
Corporate presentations are marketing documents. Their role in extraction is to tell you what
to INVESTIGATE — not what to write. When a presentation introduces a fact, verify it against a
technical report, financial filing, MD&A or official news release before populating it. If a
claim appears ONLY in a presentation and cannot be corroborated, either omit it or record it as
MISSING in the audit. This is the primary route by which promotional language enters a profile.

CONFLICT RESOLUTION — when two documents disagree:
  1. Name both documents in the audit.
  2. State which you used, and why.
  3. Apply the precedence above — do NOT default to the newer document.
  Example: a presentation reports C$18M cash; the latest quarterly financial statements report
  C$16.7M. Use C$16.7M — filed financials are authoritative for capital data.

═══════════════════════════════════════════════════════════════════
WRITING STANDARD
═══════════════════════════════════════════════════════════════════
VOICE — write for a curious first-time retail investor, not a mining analyst. Clear, plain,
active, and a little human. The reader is smart but new to mining: translate every piece of
jargon the first time it appears ("epithermal vein — a fracture where hot mineral-rich fluids
deposited silver"). Short sentences. Active voice ("Drilling hit 446 g/t silver", not "silver
mineralization was intersected"). The tone is confident and engaging — but the energy comes
from CLARITY and a genuinely interesting fact, NEVER from adjectives or spin.

THE LINE YOU DO NOT CROSS — accessible is not promotional:
• Never use hype words: "exciting", "world-class", "robust", "compelling", "high-quality",
  "significant" (as praise), "poised to", "unlocking value". If you'd read it in a marketing
  deck, cut it.
• Never reference share price, valuation, investment merit, or "opportunity". Never predict
  success or say anything "will" happen — only what the company disclosed it is doing.
• State risk honestly and plainly — a softened risk statement is a defect. The bear case must
  bite.
• Enthusiasm is allowed ONLY as plain-language clarity about a real disclosed fact. "They just
  hit high-grade silver 120m outside their known deposit — the system is bigger than the map
  shows" is good: it's vivid AND factual. "This world-class discovery is poised to unlock
  tremendous value" is banned.
• This is a regulated issuer's public profile. Every sentence must trace to a disclosed fact.

NO REDUNDANCY — every field owns a DISTINCT job. Never restate the same fact in two places.
Before writing a field, check what its neighbours already say and cover new ground:
• statusHeadline = the ONE current thing happening now. latestUpdate = the newest single event.
  investmentImpact = why that matters. nextCatalyst = what's coming. Four different facts.
• brief.overview = what the project IS. brief.thesis = the geological idea being tested.
  brief.focus = the question being worked right now. brief.different = the durable edge.
  brief.risks = what could go wrong. brief.means = the milestone that settles it. Six angles,
  never the same sentence reworded.
• whatHappened = the substance of a release. whyItMatters = its significance. Never overlap.
• If two fields want the same fact, the fact belongs to ONE of them — pick the closest owner
  and give the other field a genuinely different angle or leave it null.

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
        // 5 CORE VALUE DRIVERS (aim for 5; never fewer than 4). ~5-8 words each, MAX 50
        // chars. Scannable, fact-backed. Fewer than 5 reads as thin — dig deeper before
        // settling for 4.
        // BANNED: "Experienced management team", "Attractive valuation", "Well positioned
        // for growth", "Great jurisdiction" — anything true of dozens of juniors.
        // VALUE DRIVER = what the company is DOING (changes within a year).
        // COMPETITIVE ADVANTAGE = what it POSSESSES (still true in years) → goes in the
        // sections below, NOT here. They must not duplicate.
      "Active 26-hole drill campaign underway",
      "Fully funded through 2026 — no near-term dilution",
      "Multiple drill-ready discovery targets",
      "Historic high-grade past-producing district",
      "Recent C$13M bought deal fully funds 2026"
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
        // Every value is a KEY NUMBER, copied EXACTLY as disclosed (commas, currency,
        // decimals). null for anything not disclosed — never duplicate one figure into
        // another field.
    "outstanding": "34,523,086",     "fd": "44.9M",
    "options": null,                 "warrants": null,
    "cash": "C$4.2M",                "debt": "C$0",
    "workingCapital": "C$3.9M",      // the DISCLOSED working-capital figure. NOT the same as
                                     // cash — leave null if the documents don't state it.
    "marketCap": "C$18.5M",          "sharePrice": "C$0.21",
    "reportingDate": "Mar 31, 2026", // the balance-sheet date the cash/WC figures are AS OF.
    "latestFiling": "Q1 2026 Interim MD&A",  // the filing they came from. null if unknown.
    "ownership": null,               // insider/institutional split; juniors often don't disclose
    "state": "Fully Funded",
        // EXACTLY one of: Fully Funded | Recently Financed | Production Funded |
        // Financing Expected | Capital Allocation Update | Strategic Acquisition Funding
    "headline": "Fully Funded Through 2026",
        // About the FUNDING POSITION. Never a company description.
        // BAD: "Producing uranium company with growing cash flow" — that's a company blurb.
    "subtext": "The C$13M February bought deal fully funds the planned 2026 program.",
    "financing": "C$13.0M",
        // AMOUNT ONLY — just the raise size. The app shows type and date SEPARATELY, so a
        // full description here ("C$13M bought deal, February 2026") gets echoed 3× and reads
        // terribly. Put the pieces in the fields below, never in "financing".
    "financingDate": "February 2026", "financingType": "Bought Deal",
    "financingPrice": "C$0.90",       "financingUse": "2026 exploration program"
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

      // FUNDAMENTALS GRID (2x2 tap-through tiles). Fill every cell the docs support.
      // The detail rows + note are what make the tap-through worth opening — a cell with
      // only a value is a one-line failure. Each cell: value (+ optional value2) + 4-8
      // detail [label,value] pairs + a note.
      "snapshot": {
        "location":    { "value": "Parral District", "value2": "Chihuahua, Mexico",
                         "detail": [["Mining District","Parral District"], ["Province / State","Chihuahua"],
                                    ["Country","Mexico"], ["Road Access","Year-round; ~38 km from Parral"],
                                    ["Power","Grid power nearby"], ["Nearby Community","Parral · 38 km"]],
                         "note": "Why the location helps or constrains DEVELOPMENT. Operational only — no GPS." },
        "commodity":   { "value": "Silver · Gold",
                         "detail": [["Primary","Silver (Ag)"], ["Secondary","Gold · Lead · Zinc"],
                                    ["Reporting Basis","Silver-equivalent (AgEq)"],
                                    ["Deposit Style","Low-sulphidation epithermal vein"]],
                         "note": "Why this mix matters to THIS project. Copy AgEq/AuEq EXACTLY, never convert." },
        "ownership":   { "value": "100% Owned",
                         "detail": [["Interest","100% owned"], ["JV partners","None"], ["Royalties","None disclosed"]],
                         "note": "..." },
        "landPackage": { "value": "15 Claims · 845 ha",
                         "detail": [["Total area","845 hectares"], ["Concessions","15 claims"], ["Strike length","~2.5 km"]],
                         "note": "..." },
        "depositType": { "value": "Epithermal Vein",
                         "detail": [["Model","Low-sulphidation epithermal"], ["Host rocks","Volcanic & sedimentary"]],
                         "note": "..." },
        "pastProducer":{ "value": "ASARCO",
                         "detail": [["Operator","ASARCO"], ["Era","20th century"]],
                         "note": "..." }        // omit entirely if the project was never mined
      },

      // DETAIL BLOCKS — each is a TOP-LEVEL key on the project (NOT nested under "content").
      // These power the tap-through sheets. The field shapes are a hard contract: a wrong
      // shape renders nothing. Omit any block the documents can't support (Tier 2/3 projects).

      // "Understand this project in 60 seconds" — prose only.
      "brief": {
        "overview":  "3-5 sentences — what this project IS. Descriptive: no current program, catalysts or risk.",
        "thesis":    "2-4 sentences — the geological idea being TESTED (the hypothesis, not the progress).",
        "focus":     "2-4 sentences — the technical question being worked on right now.",
        "different": "2-4 sentences — durable technical differentiators.",
        "risks":     "2-4 sentences — real technical risk, plainly. DO NOT SOFTEN. Technical only.",
        "means":     "2-4 sentences — why it matters to an investor; what milestone determines success."
      },

      // "District Context" card. The regional / district-scale setting — the mineral belt
      // or trend the project sits on, neighbouring or past-producing mines, majors who have
      // worked the district, and how the land package was assembled. This is the "why here"
      // context an investor needs, distinct from the project's own geology. OMIT the whole
      // "district" block if the documents give no district-scale context (don't pad it).
      "district": {
        "body": "2-4 sentences on the district/belt setting: what mineral trend it sits on, which producing or past-producing mines are nearby, who else has worked the area, and how the land was consolidated.",
        "points": [{ "k": "Mineral Belt", "v": "Central Mexican Silver Belt" },
                   { "k": "Neighbouring Mines", "v": "Santa Barbara, San Francisco de Oro" },
                   { "k": "Past Operators", "v": "ASARCO, Coeur Mining, Electrum Group" },
                   { "k": "Land Position", "v": "15 concessions consolidated into one package" }]
      },

      // "Geological Model" card. body = a paragraph; points = key characteristics.
      "geology": {
        "body": "2-4 sentences on the deposit model, host rocks, structures and mineralization style.",
        "points": [{ "k": "Deposit Type", "v": "Low-sulphidation epithermal vein" },
                   { "k": "Host Rocks", "v": "Volcanic & sedimentary sequence" },
                   { "k": "Structural Controls", "v": "NW-trending veins" },
                   { "k": "Mineralization Style", "v": "High-grade Ag-Au with base-metal credits" }]
      },

      // "Exploration Strategy" card = a chronological history of work / operators on the project.
      "explorationHistory": {
        "timeline": [{ "era": "20th century", "v": "ASARCO mined the Soledad structures." },
                     { "era": "2023-24", "v": "Consolidated 15 concessions into one package." },
                     { "era": "2026", "v": "26-hole drill program underway." }]
      },

      // "Exploration Results" card. Real drill intercepts exactly as disclosed. OMIT "rows"
      // entirely if the project has no drill results (producer / pre-drill) — the app shows
      // a clean pre-drill state instead of a fake one.
      "drillResults": {
        "rows": [{ "hole": "LC-24-01", "interval": "0.70 m", "grade": "1,742 g/t AgEq",
                   "note": "Bonanza-grade discovery hole at Soledad." }]
      },

      // "What Sets This Project Apart". Every diff MUST carry a disclosed number/name as "fact".
      "unique": {
        "summary": "1-2 sentences framing what makes this project stand out.",
        "diffs": [{ "h": "Proven high-grade district", "t": "Built on past-producing mines.",
                    "fact": "Historic grades of 300-518 g/t silver" }],
        "evidence": ["100% owned", "Confirmed down-dip continuity"],
        "takeaway": "1-2 sentences — the single reason to keep watching."
      },

      // Drill / exploration targets.
      "targets": {
        "summary": "1-2 sentences on the target set.",
        "priority": [{ "name": "Soledad", "why": "Depth extension of the past-producing trend." }],
        "evidence": ["3D IP geophysics imaged sulphide structures."],
        "closing": "1-2 sentences — what proving these would mean."
      },

      // Bull / Bear / Next Validation. 1-2 sentences each.
      "scenarios": {
        "bull": { "text": "Drilling confirms continuity and expands the system." },
        "bear": { "text": "MUST state genuine risk — no resource, continuity unproven, commodity exposure. A sanitised bear case is a defect." },
        "next": { "text": "The next real validation point (assays, resource, permit)." }
      },

      // "Project Stage" tap-through sheet — makes the stage roadmap tappable.
      "stage": {
        "current": "Discovery",
        "summary": "1-2 sentences on where the project sits in its lifecycle now.",
        "program": "The current work program, e.g. 26-hole diamond drill program.",
        "activity": "What is physically happening on the ground now.",
        "completed": ["2-4 recently completed milestones."],
        "closing": "What must happen to advance to the next stage."
      }
    }
  ],

  "timeline": [
      // One entry per press release.
    { "date": "2026-05-12",
      "headline": "Wide High-Grade Silver Hit 120m Beyond the Yaxché Resource",
          // A plain-language headline a NON-TECHNICAL retail investor understands at a glance,
          // scanning the feed WITHOUT opening it. Translate the jargon, don't echo it:
          //   - Say what it MEANS, not just the raw assay. "446 g/t Ag over 28m" is a fragment
          //     only a geologist parses — rewrite it as "wide high-grade silver hit" and put the
          //     grade in keyNumbers instead.
          //   - Name the asset/target and the significance (a discovery? an extension? a permit?
          //     a financing?). "120m step-out" → "120m beyond the current resource".
          //   - Do NOT just copy the company's official title verbatim — issuers write for
          //     analysts. Rewrite it for a first-time investor. ≤ 70 characters, no ticker,
          //     no "Company Announces / Reports / Provides Update On" filler.
          // Good:  "Wide High-Grade Silver Hit 120m Beyond the Yaxché Resource"
          // Good:  "20+ New Drill Targets Defined Across the District"
          // Bad:   "120 m Step-Out Returns 446 g/t Ag Over 28 m"  (jargon fragment)
          // Bad:   "Argenta Silver Reports Assay Results From Yaxché" (vague filler)
      "originalTitle": "Argenta Silver Corp. Intersects 446 g/t Ag Over 28.0 Metres, 120 Metres Northwest of the Yaxché Resource",
          // The company's ACTUAL, verbatim press-release title, copied exactly as published
          // (this is what's shown when the reader opens the card — the official headline). The
          // "headline" field above is your plain-language rewrite for the card face; this is the
          // untouched original. If the real title isn't in the documents, use null.
      "whatHappened": "2-3 sentences describing what the release actually announced — the substance, in plain language. Name the hole/asset/figure. This is the summary an investor reads INSTEAD of the full release. Be concrete, factual, no spin. ~200-300 chars.",
      "whyItMatters": "1-2 sentences on the investor significance — why this event moves (or doesn't move) the thesis. Conditional language for unproven outcomes. Do NOT restate whatHappened. ~120-200 chars.",
      "whatHappensNext": null,
          // ONLY the concrete next step the COMPANY itself disclosed (e.g. \"Assays for the
          // remaining 4 holes are pending.\"). If the company did not state a next step, use
          // null — do NOT invent, forecast, or speculate. A guessed next step is a defect.
      "keyNumbers": ["446 g/t Ag over 28m", "120m step-out"],
      "key": true,
          // true ONLY for genuine milestones — discovery holes, resource estimates, permits,
          // financings, production starts. Routine updates are false.
          // Include routine releases (conferences, IR agreements, option grants) for
          // completeness, but always mark them false.
      "fullText": null }        // LEAVE NULL — full text is linked separately
  ]
}

═══════════════════════════════════════════════════════════════════
OUTPUT — return these TWO sections, in this order
═══════════════════════════════════════════════════════════════════

=== PROFILE JSON ===
Valid JSON only, matching the schema above. No commentary. This is what I paste into the app.

=== EVIDENCE AUDIT ===
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

═══════════════════════════════════════════════════════════════════
BEGIN
═══════════════════════════════════════════════════════════════════
The documents follow. Read all of them, then output the two sections above and NOTHING else.

Do not restate, summarise, quote or reformat any part of these instructions. Do not explain
your approach, list the rules back to me, or describe what you are about to do. Do not ask
clarifying questions unless a document is unreadable.

Your entire reply must begin with "=== PROFILE JSON ===" and contain only the populated JSON
and the evidence table.`;

// Scope lines appended to the template to run one section at a time.
//
// A real company (technical report + financials + MD&A + circular + governance + every
// release) is far more than one response can extract honestly. Asking for everything at once
// forces the model to either truncate or fabricate — and a well-behaved one refuses outright.
// Each pass imports independently; the importer merges sections and dedupes the timeline.
export const PASSES = [
  {
    id: "all",
    label: "All in one",
    hint: "Small companies only (~15-25 documents)",
    scope: "",
  },
  {
    id: "p1",
    label: "Pass 1 · Company",
    hint: "Identity, status, brief, capital, team",
    scope: `
═══════════════════════════════════════════════════════════════════
SCOPE FOR THIS PASS — read carefully, this overrides the schema above
═══════════════════════════════════════════════════════════════════
Return ONLY these keys this time:
  archetype, asOfDate, confidence, reviewRequired, notFound,
  company, companyStatus, companyBrief, capital, team

OMIT "projects" and "timeline" entirely — they are handled in separate passes. Do not
include them as empty arrays; leave the keys out.

The evidence audit covers only the fields you populate in this pass.`,
  },
  {
    id: "p2",
    label: "Pass 2 · Projects",
    hint: "One project per run if they're large",
    scope: `
═══════════════════════════════════════════════════════════════════
SCOPE FOR THIS PASS — read carefully, this overrides the schema above
═══════════════════════════════════════════════════════════════════
Return ONLY these keys this time:
  archetype, asOfDate, confidence, reviewRequired, notFound, projects

OMIT company, companyStatus, companyBrief, capital and team entirely — they were handled in
a previous pass. Do not include them as empty objects; leave the keys out.

If the company has several substantial projects and covering them all would force you to
truncate, do the FLAGSHIP ONLY and tell me plainly which projects you left for a later run.
A complete flagship beats six thin ones.

The evidence audit covers only the projects you populate in this pass.`,
  },
  {
    id: "p3",
    label: "Pass 3 · Timeline",
    hint: "Press releases, in batches",
    scope: `
═══════════════════════════════════════════════════════════════════
SCOPE FOR THIS PASS — read carefully, this overrides the schema above
═══════════════════════════════════════════════════════════════════
Return ONLY these keys this time:
  archetype, asOfDate, confidence, reviewRequired, notFound, timeline

OMIT every other key entirely.

Process ONLY the press releases provided in this batch — one entry per release. I may run
several batches; entries merge and deduplicate on import, so never summarise a release that
isn't in front of you now.

If there are more releases than you can cover without truncating, do them in date order
(newest first), stop while your output is still complete, and tell me plainly which date you
stopped at so I can continue from there.

The evidence audit covers only the entries you populate in this pass.`,
  },
];

export function promptForPass(passId) {
  const pass = PASSES.find((p) => p.id === passId) || PASSES[0];
  return pass.scope ? `${PROMPT_TEMPLATE}\n${pass.scope}\n` : PROMPT_TEMPLATE;
}

// A SINGLE new press release for a company that's already live. Self-contained (no need to
// re-attach the big onboarding template). Produces one ready-to-import timeline entry —
// including the FULL formatted release text — plus a refreshed status card.
export const UPDATE_PROMPT = `This company already has a live Passport profile. I'm giving you ONE new press release
(attached). Produce a single, ready-to-import update. Return the same two-block output:
=== PROFILE JSON ===  then  === EVIDENCE AUDIT ===.

═══════════════════════════════════════════════════════════════════
ACCURACY & VOICE (unchanged from onboarding)
═══════════════════════════════════════════════════════════════════
• Use ONLY facts stated in the release. Copy figures EXACTLY (commas, units, currency). Not
  disclosed → null. Never invent. This is a regulated issuer's public profile.
• Write for a curious first-time retail investor: clear, plain, active, a little human — never
  promotional. No hype words ("world-class", "exciting", "poised to"). Never reference share
  price. State risk honestly.

═══════════════════════════════════════════════════════════════════
RETURN THIS JSON
═══════════════════════════════════════════════════════════════════
{
  "timeline": [
    {
      "date": "2026-08-15",                 // the release date, YYYY-MM-DD
      "headline": "Wide High-Grade Silver Hit 120m Beyond the Resource",
          // PLAIN-LANGUAGE card title a non-technical investor grasps at a glance. Translate
          // jargon (put the raw grade in keyNumbers, not here). Name the asset + significance.
          // ≤ 70 chars. Not the company's official title verbatim — rewrite it for a beginner.
      "originalTitle": "Company Intersects 446 g/t Ag Over 28.0 Metres, 120m NW of Resource",
          // The company's ACTUAL, verbatim release title, copied exactly. Shown when the card
          // is opened. (headline = your rewrite; originalTitle = untouched original.)
      "whatHappened": "2-3 plain-language sentences on what the release actually announced — the
          substance, named figures, no spin. ~200-300 chars.",
      "whyItMatters": "1-2 sentences on investor significance — why it moves (or doesn't move)
          the thesis. Conditional language for unproven outcomes. Don't restate whatHappened.",
      "whatHappensNext": null,
          // ONLY a concrete next step the COMPANY disclosed (e.g. "Assays for 4 holes pending").
          // If none stated, null. Never invent or forecast.
      "keyNumbers": ["446 g/t Ag over 28m", "120m step-out"],
      "key": true,                          // true only for genuine milestones; routine = false
      "fullText": "# <original release title>\\n\\n<THE COMPLETE RELEASE, reproduced in full — do
          NOT summarize>. Format it to read cleanly: put the headline as a '# ' line, each section
          heading as a '## ' line, a blank line between paragraphs. Reproduce the body text
          faithfully. DROP the boilerplate: forward-looking / cautionary statements, the 'About
          the Company' block, and contact/IR footers."
    }
  ],
  "companyStatus": {
      // A REFRESHED status card — latestUpdate, investmentImpact, nextCatalyst and expected go
      // stale the moment news lands. Re-run the selection: this release MAY become the new
      // status, or a bigger ongoing initiative may still outrank it. A routine release must not
      // displace a more material one. Return the full companyStatus object.
  }
}

Only add these if THIS release actually changed them (else omit): "capital" (if a financing),
"projects" (only the affected project's affected blocks — merged by key), "companyBrief" (only
if the thesis genuinely moved).

=== EVIDENCE AUDIT ===
A short table for the fields you filled: Field | Value | Verification (QUOTED/DERIVED/
SYNTHESIZED/SELECTED/MISSING) | Source + date | Supporting quote | Why.`;

// Final pre-publish gate. The operator pastes a FINISHED profile (built over the passes above)
// and RE-ATTACHES the same source documents. This prompt does NOT rewrite anything — it is a
// skeptical auditor that hunts for the failure modes that survive generation: figures that
// drifted from the source, claims nothing supports, a status card gone stale, thin or missing
// sections, and promotional voice. Output is a triaged report + a single GO / FIX-FIRST verdict
// the operator can act on in seconds. The profile JSON is appended after this text at copy time.
export const QA_PROMPT = `You are the final fact-checker for a public, investor-facing company profile on PASSPORT
(a mobile app for retail investors following junior mining companies). Below this prompt you'll
find the FINISHED profile as JSON, and I've RE-ATTACHED the source documents it was built from
(technical reports, financials, MD&A, news releases, presentations).

Your job is to AUDIT, not to rewrite. Assume the profile may contain errors and find them. A
junior issuer's public profile carries regulatory weight — a wrong grade, tonnage, cash figure,
or unsupported claim is a real problem. Be skeptical. When in doubt, flag it.

═══════════════════════════════════════════════════════════════════
CHECK EVERY ONE OF THESE
═══════════════════════════════════════════════════════════════════
1. NUMBERS — For every figure in the profile (grades, widths, tonnes, ounces, $ raised, cash,
   shares, %, dates), find it in the sources and confirm it is copied EXACTLY: same value, unit,
   and currency. Flag anything you cannot locate, anything transcribed wrong (transposed digits,
   dropped decimal, g/t vs %, m vs ft, C$ vs US$, koz vs Moz), and any figure that contradicts
   another figure elsewhere in the profile.
2. UNSUPPORTED CLAIMS — Every sentence in companyBrief, companyStatus, whatHappened, whyItMatters
   and project text must trace to a source. Flag claims nothing supports, and forecasts/outcomes
   stated as fact that should be conditional ("could", "targeting") or removed.
3. STALENESS — Does companyStatus (latestUpdate / investmentImpact / nextCatalyst / expected)
   reflect the MOST RECENT material release in the sources? Flag if a newer release should have
   displaced it, or if a "next catalyst" has already happened or lapsed. Sanity-check asOfDate.
4. COMPLETENESS — Flag sections that are missing or too thin to be credible: no projects, empty
   capital, a one-line team, a flagship project with no resource/stage/location, or a timeline
   missing obviously material releases that appear in the sources.
5. VOICE — Flag promotional or hype language ("world-class", "exciting", "poised to", "unlock",
   "high-grade" used as a slogan rather than a measured grade), ANY reference to share price,
   and jargon in card headlines a first-time investor wouldn't grasp.
6. CONSISTENCY — Flag internal contradictions: commodity/jurisdiction/stage that disagree across
   company, projects and status; a ticker or name that appears two different ways.

═══════════════════════════════════════════════════════════════════
RETURN THIS — nothing else
═══════════════════════════════════════════════════════════════════
VERDICT: one of
  • GO — no blocking issues; safe to publish (minor nits allowed, listed under LOW).
  • FIX FIRST — one or more blocking issues; do NOT publish until resolved.

Then a triaged list. Group by severity, most severe first. Omit empty groups.

BLOCKING (wrong or unsupported facts — must fix before publish)
  • [field / path] — what's wrong — the source says "<exact quote>" (doc, date) — the fix.

SHOULD FIX (stale, incomplete, or misleading, but not factually false)
  • [field / path] — the issue — why it matters — the fix.

LOW (voice, polish, nits)
  • [field / path] — the issue — the fix.

VERIFIED (brief) — the material figures/claims you checked and confirmed correct, so I know the
coverage was real and not skipped.

Cite the source document and a short verbatim quote for every BLOCKING item — if you can't quote
a source for a figure, that itself is the finding (unsupported). If a claimed fact simply isn't
in the attached sources, say so plainly rather than guessing whether it's true.`;

// ─────────────────────────────────────────────────────────────────────────────
// PASS 4 — FEATURED & COMPARE. A top-up that runs AFTER the app profile exists
// (passes 1–3). Input: the company's existing Passport profile JSON + its documents.
// It REUSES everything already banked (milestones + key data verbatim) and ADDS the
// master schema's new sections (conference framing, catalysts, compare, media,
// citations, stage-adaptive project technical). Output is a DELTA that merges in.
// See MASTER_SCHEMA.md. Same tool for a new company (run 1–3 first) and an existing
// one like Argenta (just run this). Exported as CONFERENCE_PROMPT so the admin
// "Conference prompt" button copies it.
// ─────────────────────────────────────────────────────────────────────────────
export const CONFERENCE_PROMPT = `You are running PASS 4 — the CONFERENCE pass — for a junior mining company on PASSPORT.

INPUT: 1) the company's EXISTING Passport profile JSON (already extracted), 2) the company's
CORPORATE PRESENTATION, and 3) its authoritative documents (financials, MD&A, technical reports,
news releases). REUSE what the profile already holds; only ADD the conference sections below.
Return a DELTA that merges into the profile.

═══════════════════════════════════════════════════════════════════
SOURCES & EMPHASIS — LEAD WITH THE PRESENTATION
═══════════════════════════════════════════════════════════════════
The CORPORATE PRESENTATION is the company's own best pitch — its story, its chosen emphasis, its
featured projects, its headline numbers, its framing, its visual priorities. LEAN ON IT HEAVILY.
It decides the narrative and its arc, what leads each section, which stats are "the" stats, the
competitive framing, and which images matter (which map, cross-section, core photo, on which page).
  • The PRESENTATION drives STORY, EMPHASIS, ORDERING and the VISUAL PLAN.
  • The AUTHORITATIVE DOCS (+ the profile) are the source of TRUTH for every figure — verify each
    stat against them, and neutralise any promotional or forward-looking language into analyst voice.
  • If a claim is in the deck but unsupported by a filing, drop it. Facts from filings; framing from
    the deck. (If no presentation is attached, work from the profile + docs.)

THE HARD RULES
• Every number/name/grade/date must exist in the profile or the authoritative docs. Copy figures
  EXACTLY. Never invent — missing = null + list its path in notFound.
• MILESTONES ARE VERBATIM: do NOT output or re-word "timeline". To feature milestones, list their
  DATES in conference.featuredMilestoneDates — the booth reuses the profile's exact text.

═══════════════════════════════════════════════════════════════════
WRITING STANDARD — this is a premium booth, not a data dump
═══════════════════════════════════════════════════════════════════
Write like a sharp mining analyst who knows this company cold and is briefing a serious investor —
confident, specific, vivid, economical. NOT a student doing the bare minimum.
  • Every sentence must be about THIS company. If a sentence could describe any junior miner
    ("a company focused on defining and expanding mineralization"), it is filler — rewrite it with
    the specific fact, place, grade, geology, operator or event that makes it true only here.
  • Lead with the interesting thing. Concrete over abstract. No throat-clearing, no hedging, no
    boilerplate, and don't restate the company name every sentence.
  • Analyst voice: assured and precise, never promotional, never hype, never share price. Vivid and
    true — every phrase still traces to a disclosed fact.
  • Read each paragraph back: would a smart investor actually find it worth reading in a 60-second
    window? If it's flat, generic or elementary, it is not finished.

═══════════════════════════════════════════════════════════════════
THE CONTENT MODEL (this is the important part)
═══════════════════════════════════════════════════════════════════
The booth is a 60–90 second story. Build it as a sequence of sections. TWO rules govern all of it:

1) EVERY SECTION = a short CONTEXT PARAGRAPH first, then its KEY INFORMATION.
   The paragraph frames why the section matters and what the reader is looking at; the key
   information is the hard facts/numbers. A section is never just a pile of numbers.

2) SAY EACH FACT ONCE — no redundancy across the whole profile.
   Each figure has ONE home section. A number may appear in the glance-strip (highlights) AND, at
   more depth, in its home section — but NEVER a third time, and NEVER with identical wording.
   Narrative paragraphs (overview, project narrative, section context, investment case) FRAME and
   EXPLAIN; they do not recite figures that already appear as data. Example: cash lives in Capital
   only; resource grade lives in Results only — the overview must not restate either.

Understand the company first (what they do, what management is building, what differentiates them,
what the evidence is, what to remember). Adapt to the archetype — explorer / developer / producer /
royalty — and lead each section with what actually matters for that stage. Think visually: prefer
facts that become maps, photos, drill tables, timelines, stats.

═══════════════════════════════════════════════════════════════════
OUTPUT — return ONE JSON DELTA, exactly these keys
═══════════════════════════════════════════════════════════════════
{
  "conference": {
    "hook": "",              // ONE line for the hero (<= 8 words)

    "overview": "",          // COMPANY OVERVIEW paragraph: who they are, what they do, and why they
                             //   exist — clear and accessible but VIVID and specific to this company
                             //   (per the writing standard), never generic. END by naming the
                             //   flagship project (and note whether it's a single asset or a
                             //   portfolio of several) so it segues into the Projects section.
                             //   NO recited numbers here — this frames, it doesn't list stats.
    "mission": "",           // ONE sentence: the company's mission / objective, in its own words (optional)

    "macroContext": "",      // ONE sentence on why the COMMODITY/market matters now (not company facts)
    "region": "",            // JURISDICTION paragraph: the mining belt/jurisdiction, nearby producing
                             //   mines, access & infrastructure, and why the address matters (its own page).
    "districtContext": "",   // 1–2 sentences: district history, nearby operators, past production, comparison
    "regionalGeology": "",   // 1–2 sentences: the regional geological setting / belt model

    "highlights": [          // 3–5 glance-strip stats. Each MUST carry a short context line.
      { "value": "", "label": "", "context": "" }   // context = one clause on what the number means
    ],

    "resultsIntro": "",      // Section-4 CONTEXT paragraph: what the technical evidence proves
    "timelineIntro": "",     // Section-5 CONTEXT paragraph: the momentum / track record
    "capitalIntro": "",      // Section-6 CONTEXT paragraph: the funding situation & runway
    "leadershipIntro": "",   // Section-7 CONTEXT paragraph: why this team is credible

    "investmentCase": [      // Why Invest — as MANY evidence-backed reasons as the docs support (no fixed number)
      { "reason": "", "evidence": "", "standsOutBecause": "" }
    ],
    "competitiveAdvantages": [""],   // 2–5 short differentiators shown under Why Invest (district scale,
                                     //   high grade, funded, jurisdiction, insider ownership, team, etc.)

    "featuredMilestoneDates": ["YYYY-MM-DD"],   // which timeline entries to feature (text reused verbatim)
    "featuredProjectKey": "",

    "style": "scene", "enabled": true, "heroVideo": null, "boothQrUtm": null, "kioskIdleTimeout": 45
  },

  "catalysts": [ { "label": "", "timing": "", "type": "assay|resource|study|permit|construction|production|financing", "impact": "" } ],

  "projects": [            // one entry per project — its KEY, a 3-paragraph narrative, + new technical blocks
    {
      "key": "",
      "narrative": [       // EXACTLY 2–3 swipeable CONTEXT paragraphs, in this order:
        "",                //   ¶1 — the asset: what & where, ownership, land position, jurisdiction
        "",                //   ¶2 — the geology / deposit: what's there and why it's prospective
        ""                 //   ¶3 — the current campaign: what's being done right now and what's next
      ],
      "resource":    { "category": "", "tonnes": "", "grade": "", "containedMetal": "", "cutoff": "" },
      "economics":   { "studyType": "PEA|PFS|FS", "npv": "", "irr": "", "capex": "", "payback": "", "mineLife": "", "aisc": "" },
      "production":  { "annualOutput": "", "aisc": "", "freeCashFlow": "", "reserveLife": "" },
      "metallurgy":  { "recovery": "", "method": "", "testwork": "" },
      "infrastructure": { "power": "", "road": "", "water": "", "port": "", "notes": "" },
      "royalty":     { "assets": [ { "name": "", "type": "NSR|stream", "rate": "", "operator": "", "status": "" } ] }
    }
  ],

  "compare": {            // NOT shown on the booth — normalized data for app screening. Fill or null.
    "stageIndex": 0, "primaryCommodity": "", "commodities": [""],
    "marketCapTier": "nano|micro|small|mid", "jurisdiction": "", "jurisdictionRisk": "low|moderate|high",
    "flagshipGradeAgEq": "", "resourceOz": null, "fundedStatus": ""
  },

  "media": {              // asset inventory — describe what exists (you can't make images)
    "heroVideo": null, "heroPhoto": null,
    "projectAerials": [""], "corePhotos": [""], "crossSections": [""], "maps": [""], "headshots": [""], "other": [""]
  },

  "citations": {          // MATERIAL figures only — path -> { value, quote, doc, date, verification }
    "capital.cash": { "value": "", "quote": "", "doc": "", "date": "", "verification": "QUOTED|DERIVED|SYNTHESIZED|SELECTED" }
  },

  "notFound": [""]
}

RULES
• Fill the project technical block(s) the stage supports; set the others null. For each project
  output only its "key" + narrative + technical — the importer merges by key.
• Do NOT output "team" or "timeline" — leave both untouched.
• highlights: pick the 3–5 numbers that define the company at a glance, each with a context clause;
  do not restate any of them in the paragraphs.
• investmentCase: as many genuinely-supported reasons as exist; each factual, unique, concise, and
  explains why the company stands out from peers.

• Return the JSON first. THEN, on a new line, output a short human-readable IMAGE GUIDE (not JSON)
  telling the operator which presentation slide / figure to upload to each booth image slot:
      === IMAGE GUIDE ===
      Hero: <which slide / drone photo>
      Jurisdiction map: <which regional / district / infrastructure map slide>
      Assets — <project name>: <claim map, geology map, cross / long section, 3D model, core photos — by slide>
      Results: <cross-section, resource model, assay visual, core — by slide>
  List only images the presentation / documents actually contain. This tells the operator exactly
  what to drop into the Conference-booth image slots and the project gallery.

FINAL TEST: after ~90 seconds, would an investor understand who the company is, what it owns, why it
matters, how it's progressing, why it stands out, and want to keep following it on Passport — with
NOTHING said twice? If not, refine.`;
