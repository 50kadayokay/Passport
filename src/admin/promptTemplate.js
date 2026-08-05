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
  4. ALSO add one entry to the top-level "notFound" array, beginning with "CONFLICT:", so the
     reviewer sees it immediately without reading the audit. Format:
       "CONFLICT: <field or subject> — <Doc A> says <X> (<date>), <Doc B> says <Y> (<date>); used <value> because <authority reason>."
     Every genuine disagreement between two documents on a fact you populated gets one such line.
     This is not optional — an unsurfaced conflict is the failure that breaks trust on review.
  Example: a presentation reports C$18M cash; the latest quarterly financial statements report
  C$16.7M. Use C$16.7M — filed financials are authoritative for capital data. And add to notFound:
  "CONFLICT: capital.cash — Corporate presentation says C$18M (2026-03), Q1 financials say C$16.7M
  (2026-05); used C$16.7M because filed financials outrank a presentation for capital data."

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
  "notFound": [],                    // two kinds of entry: (1) plain strings for what you honestly
                                     //   could not fill; (2) "CONFLICT: ..." lines for every genuine
                                     //   disagreement between documents (see CONFLICT RESOLUTION).
                                     //   Both surface to the reviewer before publish.

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

LENGTH RULE (read first): The === PROFILE JSON === is MANDATORY and must be COMPLETE and valid.
The === EVIDENCE AUDIT === is secondary. If returning BOTH would exceed your maximum response
length, OMIT the evidence audit entirely and return ONLY a complete PROFILE JSON. NEVER truncate
the JSON to make room for the audit, and never split the JSON across multiple messages — a single
complete JSON with no audit is far more useful than a JSON cut off mid-object. Do not ask; just
drop the audit if you must.

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
(followed by the evidence table only if it fits in one response — otherwise the complete JSON
alone, per the LENGTH RULE above).`;

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
  if (!pass.scope) return PROMPT_TEMPLATE;
  // Scope FIRST (before the schema) so the model anchors on the narrow pass, then again at the
  // end. Without the leading banner the model reads the full schema and tries to output every
  // section (projects, timeline, …) and declares the result too large.
  const banner = `${pass.scope}

⚠️ CRITICAL — READ THIS BEFORE THE SCHEMA BELOW:
You are running ONE NARROW PASS. Output ONLY the top-level keys listed directly above. IGNORE
every other part of the schema that follows — those sections (e.g. projects, timeline) belong to
OTHER passes and MUST NOT appear in your output. This pass's JSON is SMALL and MUST fit in a
single response: do not say it is too large, do not split it across messages, do not add sections
that aren't in the allowed-keys list. The full schema and rules below are reference for the few
keys you ARE producing.

═══════════════════════════════════════════════════════════════════
`;
  return `${banner}\n${PROMPT_TEMPLATE}\n${pass.scope}\n`;
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
export const CONFERENCE_PROMPT = `You are running PASS 4 — CONFERENCE MODE — for a mining company on PASSPORT.

PASSPORT Conference Mode is a premium, convention-ready digital investor experience designed to replace or outperform a traditional company one-pager.

Your task is not merely to summarize the company or reproduce its corporate presentation.

Your task is to convert the company’s existing Passport profile, corporate presentation and authoritative public disclosure into a concise, factual, visually guided 60–90 second investor story.

The completed Conference Mode should allow a convention attendee to understand:

• Who the company is
• What business it is in
• What it owns or controls
• Where its assets are located
• What stage those assets are at
• What makes the company technically or commercially notable
• What evidence supports the investment thesis
• What management is doing now
• What must be proven next
• Whether the company is funded
• Why the team is credible
• Why an investor should continue following the company on Passport

The experience must work for any mining or resource company, including:

• Grassroots explorers
• Discovery-stage explorers
• Resource-stage explorers
• Developers
• Construction-stage companies
• Producers
• Royalty and streaming companies
• Prospect generators
• Project generators
• Multi-asset companies
• Diversified commodity companies
• Processing or recovery companies
• Tailings-recovery businesses
• Hybrid business models

The Passport interface remains consistent between companies, but the narrative, technical emphasis and enabled modules must adapt to the company’s actual business model and stage.

═══════════════════════════════════════════════════════════════════
INPUTS
═══════════════════════════════════════════════════════════════════

You may receive:

1. The company’s EXISTING Passport profile JSON
2. The company’s CORPORATE PRESENTATION
3. Technical reports
4. Mineral-resource and mineral-reserve reports
5. Preliminary economic assessments
6. Pre-feasibility or feasibility studies
7. Financial statements
8. Management’s Discussion and Analysis
9. News releases
10. Sustainability, permitting or community documents
11. Royalty or asset-level operator disclosure
12. Other authoritative public-company documents

Reuse the existing Passport profile wherever possible.

Do not reconstruct fields that already exist unless this pass specifically requests an updated or expanded version.

Return only the fields explicitly included in the output schema below.

Do not reproduce unrelated profile fields.

Existing arrays must merge using their designated key, such as a project’s key.

═══════════════════════════════════════════════════════════════════
CORE OPERATING PRINCIPLE
═══════════════════════════════════════════════════════════════════

Build a fixed Passport product structure around an adaptive company narrative.

The standard Conference Mode flow is:

1. Hero
2. Company
3. Highlights
4. Jurisdiction or Operating Footprint
5. Projects or Assets
6. Technical Evidence, Results or Operations
7. Milestones
8. Capital
9. Leadership
10. Why Invest
11. Follow

The investor should recognize the Passport interface from one company to another.

However, never force every company into the same technical story.

Enable, suppress or adapt modules according to the company’s stage, business model and material disclosure.

A section should appear only when it materially improves investor understanding.

═══════════════════════════════════════════════════════════════════
SOURCE HIERARCHY
═══════════════════════════════════════════════════════════════════

Different sources serve different purposes.

Use the following hierarchy.

1. TECHNICAL REPORTS, RESOURCE REPORTS, RESERVE REPORTS, PEA, PFS AND FS

Primary authority for:

• Geology
• Deposit type
• Mineral resources
• Mineral reserves
• Grades
• Tonnes
• Contained metal
• Cut-off grades
• Metallurgy
• Recoveries
• Infrastructure
• Mine plans
• Economics
• Capital costs
• Operating costs
• Mine life
• Production assumptions

2. FINANCIAL STATEMENTS AND MD&A

Primary authority for:

• Cash
• Debt
• Working capital
• Shares outstanding
• Options
• Warrants
• Financing proceeds
• Capital structure
• Expenditures
• Going-concern or liquidity disclosure
• Current corporate risks

3. NEWS RELEASES

Primary authority for:

• Recent drill results
• Exploration progress
• Current programs
• Assays
• Permits
• Studies
• Construction updates
• Production updates
• Financings
• Corporate appointments
• Milestones
• Upcoming catalysts

4. CORPORATE PRESENTATION

Primary authority for:

• The company’s intended story
• Narrative emphasis
• Project ordering
• Visual priorities
• Featured maps
• Featured sections
• Featured photographs
• Which numbers management considers defining
• How management frames the opportunity

The corporate presentation drives:

• Story
• Emphasis
• Ordering
• Visual hierarchy
• Narrative arc

Authoritative documents drive:

• Factual accuracy
• Exact figures
• Dates
• Grades
• Ownership
• Resource and reserve disclosure
• Economics
• Capital structure

Facts from authoritative disclosure.

Framing from the presentation.

Never use a presentation as the final authority for a material figure when a technical report, filing or newer authoritative disclosure is available.

If the presentation contains a factual claim that cannot be verified through the profile or authoritative disclosure, exclude it.

═══════════════════════════════════════════════════════════════════
DATE AND SOURCE-CONFLICT RULES
═══════════════════════════════════════════════════════════════════

When two sources contain different values:

1. Determine whether they represent different effective dates.
2. Use the newest authoritative disclosure with a clearly stated reporting or effective date.
3. Never combine values from different reporting periods into one capital snapshot.
4. Never silently choose between unresolved conflicting values.
5. Never use a newer corporate presentation to override an older but still-current technical report unless the presentation cites a newer authoritative technical disclosure.
6. Record unresolved material conflicts in notFound using:

"CONFLICT: <path> — <brief description>"

Examples:

"CONFLICT: capital.cash — presentation and latest filing report different values without matching effective dates"

"CONFLICT: projects.el-quevar.ownership — company website and technical report disclose different interests"

═══════════════════════════════════════════════════════════════════
HARD FACTUAL RULES
═══════════════════════════════════════════════════════════════════

Every:

• Number
• Name
• Grade
• Interval
• Date
• Ownership percentage
• Resource
• Reserve
• Recovery
• Economic figure
• Production figure
• Financing figure
• Infrastructure measurement
• Land-area figure
• Project-stage claim

must exist in the existing profile or supplied authoritative documents.

Copy figures exactly.

Do not round unless the source itself presents a rounded figure.

Do not convert units unless the output field explicitly requires normalization.

Never invent.

Never estimate.

Never extrapolate.

Never calculate an undisclosed economic result.

Never infer a mineral resource from drill results.

Never infer a reserve from a resource.

Never infer production potential from a resource.

Never describe a project as permitted unless the relevant permit is disclosed.

Never describe infrastructure as available for project use merely because it exists nearby.

Never describe a company as funded beyond the period or program supported by disclosed information.

Missing information must be:

• Set to null where the schema permits null
• Listed in notFound

When an entire stage-inapplicable technical block is null, list only the block path once in notFound.

Do not list every child field individually.

═══════════════════════════════════════════════════════════════════
PROHIBITED CONTENT
═══════════════════════════════════════════════════════════════════

Never use the following as evidence in the Conference Mode narrative:

• Share price
• Share-price appreciation
• Trading volume
• Historical stock performance
• Market-cap growth
• Exchange awards
• Investor-relations awards
• Promotional rankings
• Paid research targets
• Analyst price targets
• Shareholder testimonials
• Management testimonials
• Investor quotations
• Unverified superlatives
• Social-media engagement
• Popularity claims

Do not allow those items to influence:

• The hook
• Highlights
• Investment Case
• Competitive Advantages
• Company-specific insights

Do not reference the company’s share price anywhere.

Market capitalization may be used only in the normalized compare block if it is required and supported by current data.

═══════════════════════════════════════════════════════════════════
MILESTONE RULE
═══════════════════════════════════════════════════════════════════

Milestones are verbatim.

Do not output, rewrite, summarize, improve or paraphrase timeline entries.

The existing Passport timeline owns the milestone wording.

To feature a milestone in Conference Mode, output only its exact date in:

conference.featuredMilestoneDates

Only select dates that already exist in the profile timeline or authoritative supplied documents.

Do not output a timeline object.

═══════════════════════════════════════════════════════════════════
STEP 1 — UNDERSTAND THE COMPANY BEFORE WRITING
═══════════════════════════════════════════════════════════════════

Do not begin field extraction immediately.

First determine internally:

1. COMPANY ARCHETYPE

Choose the closest applicable model:

• Grassroots Explorer
• Discovery-Stage Explorer
• Resource-Stage Explorer
• Developer
• Construction-Stage Company
• Producer
• Royalty or Streaming Company
• Prospect Generator
• Processing or Recovery Company
• Tailings-Recovery Company
• Diversified or Multi-Asset Company
• Hybrid

2. PRIMARY INVESTMENT THESIS

What is management fundamentally trying to build, prove, expand, permit, finance, construct, operate or monetize?

3. SECONDARY INVESTMENT THESIS

What additional source of value or optionality exists?

4. BIGGEST TECHNICAL DIFFERENTIATOR

Examples:

• Grade
• Scale
• Geometry
• Metallurgy
• Recovery
• Resource quality
• Reserve quality
• Geological model
• Infrastructure
• Historical production
• District position
• Processing advantage

5. BIGGEST BUSINESS DIFFERENTIATOR

Examples:

• Ownership
• Strategic partner
• Existing mill
• Royalty structure
• Partner-funded model
• Low capital intensity
• Consolidated land package
• Permitting status
• Management track record
• Offtake
• Financing structure

6. PRINCIPAL RISK OR UNANSWERED QUESTION

What must still be proven?

7. NEXT VALIDATION EVENT

What upcoming event is most likely to strengthen or weaken the thesis?

8. CURRENT OBJECTIVE

What is the company doing now?

9. CURRENT BOTTLENECK

What prevents the company from advancing to the next stage?

10. MATERIALITY ORDER

Rank the company’s projects or assets by current materiality.

Then ask internally:

“If a mining fund manager gave me exactly 60 seconds to explain this company, what would I say?”

That answer becomes the backbone of Conference Mode.

Every section must support that story.

Do not output this internal classification unless it is represented in the requested schema.

═══════════════════════════════════════════════════════════════════
STEP 2 — ADAPT THE STORY TO THE COMPANY TYPE
═══════════════════════════════════════════════════════════════════

GRASSROOTS EXPLORER

Emphasize:

• Geological thesis
• Land position
• Target generation
• Geochemistry
• Geophysics
• Historical work
• Access
• Initial field program
• Evidence supporting drill targets
• Upcoming first-pass testing

Do not imply discovery.

Do not create a resource section unless one exists.

DISCOVERY-STAGE EXPLORER

Emphasize:

• Discovery context
• Drill intercepts
• Geometry
• Continuity
• Scale indicators
• Step-outs
• Geophysical or geological support
• Follow-up program
• What must be drilled next

Do not imply a resource before one is disclosed.

RESOURCE-STAGE EXPLORER

Emphasize:

• Resource quality
• Resource category
• Grade
• Contained metal
• Expansion potential
• Metallurgy
• Infill and step-out drilling
• Path toward an updated resource or economic study

DEVELOPER

Emphasize:

• Resource and reserve quality
• Economics
• Permitting
• Metallurgy
• Engineering
• Infrastructure
• Project financing
• Construction readiness
• Development schedule
• Outstanding de-risking work

CONSTRUCTION-STAGE COMPANY

Emphasize:

• Construction progress
• Budget
• Schedule
• Procurement
• Financing
• Major equipment
• Workforce
• Commissioning
• First-production timing
• Execution risks

PRODUCER

Emphasize:

• Current operations
• Production
• Costs
• Recoveries
• Throughput
• Guidance
• Mine life
• Reserves
• Expansion
• Operational performance
• Balance sheet
• Capital allocation

Do not make exploration results the centre of the story unless they are materially tied to mine-life growth.

ROYALTY OR STREAMING COMPANY

Emphasize:

• Portfolio composition
• Operator quality
• Producing assets
• Development assets
• Paying royalties
• Royalty rates
• Streams
• Geographic and operator diversification
• Near-term asset-level catalysts
• Revenue or cash flow
• Partner-funded growth

Do not write as though the company operates the underlying mines.

PROSPECT GENERATOR

Emphasize:

• Portfolio
• Partner-funded programs
• Retained interests
• Royalties
• Joint ventures
• Partner quality
• Deal pipeline
• Capital efficiency
• Exposure to multiple discovery programs

MULTI-ASSET COMPANY

Lead with the flagship or most material operating asset.

Include secondary assets only if they materially contribute to:

• Current value
• Near-term catalysts
• Commodity diversification
• Production
• Resource scale
• Strategic optionality

Do not give every minor property equal weight.

PROCESSING, RECOVERY OR TAILINGS COMPANY

Emphasize:

• Feed source
• Ownership or contractual rights
• Process
• Recoveries
• Throughput
• Product
• Operating model
• Permitting
• Infrastructure
• Economics
• Commercial partnerships
• Technology validation

Do not force an in-ground exploration narrative onto these businesses.

═══════════════════════════════════════════════════════════════════
STEP 3 — COMPANY-SPECIFIC OBSERVATION PASS
═══════════════════════════════════════════════════════════════════

After understanding the standard company story, actively search all supplied material for important facts that are not adequately represented by the standard checklist.

Do not stop because the normal fields are complete.

Look for anything that an experienced mining analyst would naturally mention when explaining why this company differs from peers.

Examples include, but are not limited to:

• Founder history
• Management’s prior discoveries
• Prior mines built
• Prior companies sold
• Strategic investors
• Major-company partnerships
• Government participation
• Indigenous partnerships
• Community agreements
• Local ownership
• Unusual ownership terms
• Earn-in structures
• Joint ventures
• Carried interests
• Royalty burdens
• Streams
• Offtake agreements
• Processing agreements
• Toll milling
• Existing mills
• Existing plants
• Existing underground workings
• Declines
• Shafts
• Port access
• Rail
• Power
• Water rights
• Camps
• Roads
• Airstrips
• Historical production
• Former operators
• Historical mine closure
• Rehabilitation
• Historical databases
• Preserved drill core
• District consolidation
• Land fragmentation
• Patent claims
• Exploration technology
• Artificial intelligence
• Machine learning
• Proprietary processing
• Ore sorting
• Unusual metallurgy
• By-product credits
• Metallurgical penalties
• Concentrate quality
• Commodity purity
• Unusual grade distribution
• Bulk-tonnage potential
• Narrow-vein selectivity
• Open-pit or underground optionality
• Stockpiles
• Tailings
• Near-surface mineralization
• Existing permits
• Permit amendments
• Environmental baseline work
• Government funding
• Strategic or critical-mineral status
• Defence relevance
• Supply-chain relevance
• Nearby mills
• Nearby producers
• Nearby discoveries
• Regional consolidation
• Scarcity of comparable assets
• Unusual financing structure
• Asset-sale history
• Spin-out history
• M&A strategy
• Optional non-core assets
• Commodity-cycle relevance
• Seasonality
• Altitude
• Logistics
• Climate
• Security
• Jurisdiction-specific fiscal terms

For each material observation, decide:

1. Is it already captured in a standard section?
2. Can it be integrated naturally into a standard or conditional module?
3. Is it material enough to influence the investment thesis?
4. Does it deserve a standalone custom section?

Prefer integrating information into the closest standard section.

Do not create arbitrary standalone sections merely because a fact is interesting.

A standalone custom section is allowed only when:

• The information is highly material
• It cannot be communicated clearly in an existing standard section
• Omitting it would materially weaken investor understanding

Use no more than two custom sections for one company.

Capture all material out-of-checklist observations in:

conference.companySpecificInsights

This is both a coverage mechanism and a product-development signal for Passport.

═══════════════════════════════════════════════════════════════════
STEP 4 — PRESENTATION INTERPRETATION
═══════════════════════════════════════════════════════════════════

The corporate presentation represents the company’s intended narrative.

Do not reproduce it.

Preserve what it is trying to communicate while removing:

• Marketing language
• Promotional adjectives
• Unsupported claims
• Share-price references
• Repetition
• Slogans presented as facts
• Investor persuasion
• Testimonials
• Vague superlatives
• Peer valuation comparisons

Retain:

• Story
• Emphasis
• Order
• Project priority
• Visual hierarchy
• Featured technical evidence
• Featured maps
• Featured photographs
• Management’s strategic focus

Rewrite the company’s intended story into factual analyst language.

The presentation may determine which facts lead.

It may not determine whether those facts are true.

═══════════════════════════════════════════════════════════════════
WRITING STANDARD
═══════════════════════════════════════════════════════════════════

Write like a senior mining analyst briefing a serious investor.

The voice must be:

• Factual
• Assured
• Specific
• Economical
• Technically literate
• Accessible to an informed general investor
• Neutral rather than promotional

Do not write like:

• Investor Relations
• A marketing agency
• A student
• A technical-report abstract
• A press-release generator
• A generic AI assistant

Every sentence must be specific to this company.

Apply this test:

“If the company name were removed, could this sentence apply to dozens of junior miners?”

If yes, rewrite it.

Bad:

“The company is focused on advancing its flagship project and creating shareholder value.”

Better:

“The current program is testing whether the northwest extension of the Yaxtché deposit can be converted into a larger silver resource.”

Lead with the interesting thing.

Concrete over abstract.

Prefer:

• Named projects
• Named deposits
• Named districts
• Exact stages
• Specific geological controls
• Specific technical objectives
• Specific operating evidence
• Specific upcoming decisions

Avoid:

• “World class”
• “Exceptional”
• “Premier”
• “Tier one”
• “Compelling”
• “Highly prospective”
• “Significant upside”
• “Strong potential”
• “Exciting”
• “Transformational”
• “Best in class”

unless the phrase appears inside a direct title or formal disclosed classification and remains necessary.

Never write empty statements such as:

• “The project offers exploration upside.”
• “The company is well positioned.”
• “Management is focused on execution.”
• “The asset benefits from strong fundamentals.”

Explain exactly what creates the upside, positioning, execution advantage or fundamental support.

═══════════════════════════════════════════════════════════════════
CONFERENCE STORYTELLING STANDARD
═══════════════════════════════════════════════════════════════════

Conference Mode should feel like a guided exhibit.

It should not feel like disconnected widgets.

Each section must:

1. Answer one investor question
2. Create a natural reason to continue to the next section

The intended progression is:

COMPANY — Who are they and what are they trying to build?
↓
HIGHLIGHTS — What facts define the company at a glance?
↓
JURISDICTION OR OPERATING FOOTPRINT — Why does the address matter?
↓
PROJECTS OR ASSETS — What exactly does the company own or earn exposure to?
↓
RESULTS, ECONOMICS OR OPERATIONS — What evidence supports the story?
↓
MILESTONES — How did the company reach its current position?
↓
CAPITAL — Can it execute the current plan?
↓
LEADERSHIP — Why is this team credible for the work ahead?
↓
WHY INVEST — What is the integrated evidence-backed case?
↓
FOLLOW — What should the investor watch next?

The finished story should feel cumulative.

Do not reset the reader at the start of every section.

═══════════════════════════════════════════════════════════════════
SECTION CONSTRUCTION RULE
═══════════════════════════════════════════════════════════════════

Every major section begins with a short context paragraph.

Then present the key evidence.

Never begin a section with an unexplained pile of statistics.

Each context paragraph should answer:

• Why is the investor seeing this section?
• What should they understand?
• Why does it matter to the broader thesis?

Context paragraphs frame and interpret.

Structured fields carry figures.

Do not recite an entire table inside a paragraph.

═══════════════════════════════════════════════════════════════════
REDUNDANCY RULE
═══════════════════════════════════════════════════════════════════

Say each fact once.

Every material figure has one primary home section.

A defining figure may appear:

1. Once in conference.highlights
2. Once in its detailed technical or capital home

It must not appear a third time with the same wording.

Examples:

• Cash belongs in Capital
• Resource grade belongs in Results or Resource
• Production belongs in Production
• Ownership belongs in the Project or Asset section
• Management track record belongs in Leadership
• Upcoming assays belong in Catalysts

The overview frames the company. It does not recite numbers.

The project narrative explains the asset. It does not reproduce the resource table.

The investment case interprets evidence. It should not repeat full figures already displayed elsewhere.

When the investment case relies on a previously displayed fact, refer to it in shortened interpretive language rather than repeating the entire number.

Bad:

“QVD-469 returned 446 g/t Ag over 28.0 metres, including 1,195 g/t Ag over 6.0 metres.”

when the same exact result already appears in Highlights and Results.

Better:

“The principal northwest step-out moved high-grade mineralization beyond the current resource boundary.”

═══════════════════════════════════════════════════════════════════
HIGHLIGHTS RULE
═══════════════════════════════════════════════════════════════════

Select 3–5 defining facts.

Each highlight must contain:

• A value
• A short label
• A short context clause explaining what the value means

Select facts that explain the company at a glance.

The highlight mix should normally include different dimensions, such as:

• Scale
• Grade
• Ownership
• Production
• Economics
• Funding
• Drill result
• Portfolio size
• Royalty exposure
• Infrastructure
• Project stage

Do not select five variations of the same category.

Do not place a number in Highlights merely because it is large.

Choose the numbers that most clearly define the company’s current thesis.

═══════════════════════════════════════════════════════════════════
JURISDICTION AND DISTRICT RULE
═══════════════════════════════════════════════════════════════════

The jurisdiction section is not a generic country summary.

Explain why this specific location matters to this specific company.

Where disclosed, consider:

• Mining belt
• District
• Geological province
• Nearby mines
• Nearby operators
• Historical production
• Access
• Roads
• Rail
• Port
• Power
• Water
• Workforce
• Processing facilities
• Community
• Permitting framework
• Fiscal structure
• Altitude
• Climate
• Seasonality
• Security
• Regional infrastructure

Do not make broad political or jurisdiction-risk claims without support.

Nearby companies are context, not implied validation.

Never imply that nearby production proves the user company’s project will become a mine.

═══════════════════════════════════════════════════════════════════
PROJECT AND ASSET MATERIALITY RULE
═══════════════════════════════════════════════════════════════════

Output one project object per material project or asset.

Do not automatically include every claim, royalty or minor property.

Include a project when it is material to at least one of:

• Current valuation thesis
• Current spending
• Current production
• Current resource or reserve base
• Near-term catalysts
• Strategic optionality
• Company identity

Order projects by materiality.

The flagship goes first.

For a royalty company, the project key may represent a material royalty or stream asset.

For a portfolio company, do not give inactive or immaterial assets equal narrative weight.

═══════════════════════════════════════════════════════════════════
PROJECT NARRATIVE RULE
═══════════════════════════════════════════════════════════════════

Each project receives exactly 2–3 swipeable context paragraphs.

Use this order when applicable:

Paragraph 1 — THE ASSET
Explain: what it is, where it is, ownership, land position, current stage, relevant infrastructure or access.

Paragraph 2 — THE TECHNICAL OR OPERATING BASIS
For exploration and development assets: geology, deposit type, resource or reserve context, mineralization, scale model, metallurgy where central.
For producers: mine and plant, ore sources, processing, current operating structure.
For royalties: operator, underlying asset, royalty or stream exposure, current status.

Paragraph 3 — CURRENT WORK AND NEXT DECISION
Explain: what is happening now, what management is trying to prove or complete, what result or milestone would move the project forward.

Do not duplicate structured resource, economic or production figures inside these paragraphs.

═══════════════════════════════════════════════════════════════════
RESULTS AND TECHNICAL EVIDENCE RULE
═══════════════════════════════════════════════════════════════════

For explorers, Results should explain what drilling, sampling, geophysics or mapping has established.

Do not imply more than the evidence supports.

A drill intercept does not by itself prove: mineability, economic viability, resource scale, continuity, true width or recoverability, unless the relevant evidence is disclosed.

For developers, Results may instead emphasize: resource conversion, reserve definition, metallurgy, engineering, economics, permitting, optimization.

For producers, Results may emphasize: production, costs, recoveries, throughput, guidance, mine-life replacement, expansion.

For royalty companies, Results may emphasize: operator progress, first production, resource growth, construction, royalty revenue, asset-level catalysts.

Adapt resultsIntro accordingly.

═══════════════════════════════════════════════════════════════════
ECONOMICS RULE
═══════════════════════════════════════════════════════════════════

Never fabricate project economics.
Never insert template economics.
Never transfer economics from another project.
Never infer economics from a presentation graphic without a disclosed study.

A project may have an economics block only if it has a disclosed PEA, PFS or FS.

Use the study’s exact terminology and effective date.

If no economic study exists: "economics": null

If a PEA exists but a field is not disclosed: set that field to null.

Do not infer: NPV, IRR, Capex, Payback, Mine life, AISC.

Do not combine figures from different economic cases unless the selected case is clearly identified and consistently used.

Prefer the company’s stated base case when disclosed.

═══════════════════════════════════════════════════════════════════
PRODUCTION RULE
═══════════════════════════════════════════════════════════════════

Populate production only for an operating or formally guided project.

Use actual or company-guided figures exactly as disclosed.

Do not describe historical production as current production.

Do not infer future production from a PEA or resource unless the output explicitly identifies the economic study basis.

If not applicable: "production": null

═══════════════════════════════════════════════════════════════════
METALLURGY RULE
═══════════════════════════════════════════════════════════════════

Use only disclosed metallurgical information.

Distinguish between: preliminary testwork, locked-cycle testwork, pilot-scale testwork, historical plant performance, economic-study assumptions, current operating recovery.

Do not present testwork recovery as guaranteed operating recovery.

If recovery is not disclosed: "recovery": null

Describe the processing method only when supported.

═══════════════════════════════════════════════════════════════════
INFRASTRUCTURE RULE
═══════════════════════════════════════════════════════════════════

Differentiate between: on-site infrastructure, nearby third-party infrastructure, infrastructure available under agreement, conceptual future infrastructure, infrastructure requiring construction.

Do not imply access rights where none are disclosed.

Populate only the supported fields: power, road, water, port, notes. Use null for unsupported items.

═══════════════════════════════════════════════════════════════════
CAPITAL RULE
═══════════════════════════════════════════════════════════════════

Use the newest clearly dated authoritative capital snapshot.

Financial statements and MD&A override presentations.

Do not mix cash from one date, shares from another date, debt from another date, working capital from another date, unless each value is explicitly dated and the output makes the distinction clear.

capitalIntro should explain what the balance sheet means for the current program.

Do not claim the company is “fully funded” unless disclosure supports funding for a clearly defined program, construction plan or operating period.

Prefer precise language such as:
• “Funded through the current drill campaign”
• “Financed through construction”
• “Treasury supports the planned 2026 program”
• “Additional financing will be required before construction”

Never imply permanent funding.

═══════════════════════════════════════════════════════════════════
LEADERSHIP RULE
═══════════════════════════════════════════════════════════════════

Do not output the existing team array.

Use leadershipIntro to explain why the relevant team is suited to the company’s current stage.

Prioritize: discoveries made, mines built, operations led, projects permitted, financings completed, companies sold, technical specialization, in-country operating experience, relevant government or community experience, royalty or capital-allocation experience.

Avoid generic statements such as “Management has extensive experience.”

Explain the relevant experience.

Do not overstate track records. Use disclosed information only.

═══════════════════════════════════════════════════════════════════
INVESTMENT CASE RULE
═══════════════════════════════════════════════════════════════════

The Investment Case is a synthesis. It is not a promotional list.

Include as many reasons as the supplied evidence genuinely supports.

Do not target a fixed number.

Each reason must be: unique, material, factual, supported, specific to the company, relevant to its current stage.

Each entry must contain:
reason — the investor conclusion.
evidence — the supporting fact or concise body of evidence.
standsOutBecause — why that evidence differentiates the company or materially affects the thesis.

Do not repeat the same reason in different language.

Do not treat the following as standalone investment reasons unless material: exchange listing, website availability, generic exposure to a commodity, a large number of social followers, management optimism, share-price performance.

Include risk-aware distinctions.

For example: a large land package is not automatically an advantage. It becomes an investment reason only when the company has evidence, ownership, access and a strategy capable of testing it.

═══════════════════════════════════════════════════════════════════
COMPETITIVE ADVANTAGES RULE
═══════════════════════════════════════════════════════════════════

Select 2–5 short differentiators.

These appear beneath Why Invest.

They should summarize the company’s strongest evidence-backed distinctions.

Examples: existing high-grade resource, fully permitted construction project, operating mill under ownership, partner-funded exploration portfolio, producing royalty portfolio, district consolidation, low-cost operating position, strategic infrastructure, high insider ownership.

Do not use promotional adjectives.

Do not repeat identical wording from Investment Case.

═══════════════════════════════════════════════════════════════════
CATALYST RULE
═══════════════════════════════════════════════════════════════════

Catalysts must be: future-facing, supported by current disclosure, relevant to a decision or validation event, specific enough to understand, timed only as precisely as the source permits.

Allowed types: assay, resource, study, permit, construction, production, financing.

Examples: pending drill assays, updated mineral resource, metallurgical report, PEA, PFS, FS, permit decision, construction milestone, commissioning, first production, financing close.

Do not create a catalyst from a general corporate ambition.

Do not assign a quarter, month or year unless disclosed.

Use “Timing not disclosed” when the catalyst is confirmed but no timing is provided.

The impact field must explain what the catalyst would test or change.

Do not predict a positive result.

═══════════════════════════════════════════════════════════════════
COMPANY-SPECIFIC INSIGHTS RULE
═══════════════════════════════════════════════════════════════════

Capture material observations that were not adequately represented by the standard checklist.

Each entry must contain: title, context, evidence, recommendedPlacement, materiality.

Allowed recommended placements: overview, jurisdiction, projects, results, timeline, capital, leadership, investmentCase, standalone.

Allowed materiality: high, medium.

Do not include low-value trivia.

A company-specific insight may still be integrated into another Conference Mode field.

This array exists to ensure the observation is not lost and to flag possible future Passport modules.

If there are no genuinely material out-of-checklist observations: return an empty array.

═══════════════════════════════════════════════════════════════════
CUSTOM SECTION RULE
═══════════════════════════════════════════════════════════════════

Use custom sections only when highly material information cannot be clearly represented in an existing standard section.

Maximum: 2 custom sections per company.

Examples that may justify a custom section: proprietary processing technology central to the business, a producing mill serving multiple third-party deposits, a major strategic partnership fundamental to project advancement, a tailings-recovery operating model, a district-consolidation strategy central to the thesis, a unique royalty-generation model.

Each custom section must contain: key, title, context, keyInformation, recommendedMedia.

Do not use custom sections to repeat standard content.

If none are required: return an empty array.

═══════════════════════════════════════════════════════════════════
MEDIA AND IMAGE STRATEGY
═══════════════════════════════════════════════════════════════════

The presentation should guide the visual hierarchy.

Inventory only images that actually exist in the supplied documents.

Do not invent images.

Do not describe an image as available merely because it would be useful.

Prefer: real project photography, drone or aerial photographs, regional maps, property maps, claim maps, infrastructure maps, geological maps, cross-sections, long sections, resource models, reserve models, mine plans, core photography, plant photography, construction photography, operating-site photography, royalty-asset maps, production charts, headshots.

Avoid leading with: decorative stock imagery, commodity-price charts, share-price charts, generic country photographs, marketing collages, testimonials, promotional comparison tables.

The hero should normally use the most visually compelling authentic image that also communicates the company’s principal asset or business.

Describe presentation images by exact page or slide whenever possible.

═══════════════════════════════════════════════════════════════════
INFORMATION COVERAGE AUDIT
═══════════════════════════════════════════════════════════════════

After drafting the complete output, perform a second pass through every supplied source.

Ask: “What material information in these documents has not yet been represented anywhere?”

Look specifically for: a major project not included, a material ownership term, a royalty or stream, a historical producer, a resource or reserve category, a study, a current program, a critical infrastructure fact, a permit, a financing dependency, a strategic investor, a management track record, a material operating risk, a unique processing advantage, a company-specific observation, a major visual, a catalyst, a material non-core asset, a conflicting current value.

If information materially improves investor understanding: integrate it into the most appropriate section.

Do not duplicate information already captured.

Repeat the audit until no material information remains unrepresented.

Completing the checklist is not sufficient. The company must be fully represented.

═══════════════════════════════════════════════════════════════════
REDUNDANCY AUDIT
═══════════════════════════════════════════════════════════════════

After the coverage audit, perform a separate redundancy audit.

Search the entire output for repeated: figures, grades, intervals, resource totals, ownership percentages, cash figures, production figures, land-area figures, infrastructure measurements, management claims, catalyst descriptions.

For every repeated fact, decide where its primary home belongs.

Retain it in Highlights only when it is one of the defining 3–5 facts.

Retain the full detail in its technical home.

Shorten or remove it everywhere else.

The final output must contain no unnecessary repetition.

═══════════════════════════════════════════════════════════════════
FINAL QUALITY TEST
═══════════════════════════════════════════════════════════════════

Before returning the output, test it against all of the following.

1. Would a knowledgeable mining analyst consider it accurate?
2. Would the company’s CEO recognize the company’s intended story without seeing promotional language copied back?
3. Would an investor understand the company in approximately 60–90 seconds?
4. Is every paragraph specific to this company?
5. Does the story adapt to the company’s business model and current stage?
6. Are the most material assets presented first?
7. Is every material figure supported?
8. Has every major figure been stated no more than the allowed number of times?
9. Have share-price references and testimonials been removed?
10. Have unsupported claims been removed?
11. Are economics null when no disclosed economic study exists?
12. Are production fields null when there is no current or formally guided production?
13. Are milestones represented only by selected dates?
14. Does every image recommendation refer to an image that actually exists?
15. Has all material out-of-checklist information been captured in companySpecificInsights?
16. Are custom sections limited to zero, one or two genuinely necessary sections?
17. Does the final Why Invest section synthesize the evidence instead of repeating the booth?
18. Does the story explain what management is trying to prove next?
19. Does the investor understand the principal unresolved risk or dependency?
20. Does the output make the investor want to continue following the company on Passport?

If any answer is no: revise the output before returning it.

═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════

Return:
1. One JSON DELTA
2. Then the IMAGE GUIDE

Do not return preliminary analysis.
Do not return the internal archetype classification.
Do not return explanations before the JSON.
Do not return commentary after the Image Guide.
Do not wrap the JSON in markdown code fences.
The JSON must be valid.

Use exactly this structure:

{
  "conference": {
    "hook": "",
    "overview": "",
    "mission": null,

    "macroContext": null,
    "region": null,
    "districtContext": null,
    "regionalGeology": null,

    "highlights": [
      { "value": "", "label": "", "context": "" }
    ],

    "resultsIntro": null,
    "timelineIntro": "",
    "capitalIntro": null,
    "leadershipIntro": null,

    "investmentCase": [
      { "reason": "", "evidence": "", "standsOutBecause": "" }
    ],

    "competitiveAdvantages": [""],

    "companySpecificInsights": [
      { "title": "", "context": "", "evidence": "", "recommendedPlacement": "overview|jurisdiction|projects|results|timeline|capital|leadership|investmentCase|standalone", "materiality": "high|medium" }
    ],

    "customSections": [
      { "key": "", "title": "", "context": "", "keyInformation": [ { "label": "", "value": "", "context": "" } ], "recommendedMedia": "" }
    ],

    "featuredMilestoneDates": [ "YYYY-MM-DD" ],

    "featuredProjectKey": "",

    "style": "scene",
    "enabled": true,
    "heroVideo": null,
    "boothQrUtm": null,
    "kioskIdleTimeout": 45
  },

  "catalysts": [
    { "label": "", "timing": "", "type": "assay|resource|study|permit|construction|production|financing", "impact": "" }
  ],

  "projects": [
    {
      "key": "",
      "narrative": [ "", "", "" ],
      "resource": { "category": "", "tonnes": "", "grade": "", "containedMetal": "", "cutoff": "" },
      "economics": { "studyType": "PEA|PFS|FS", "effectiveDate": "", "case": "", "npv": "", "npvDiscountRate": "", "irr": "", "capex": "", "sustainingCapital": "", "payback": "", "mineLife": "", "aisc": "" },
      "production": { "reportingBasis": "actual|guidance|study", "period": "", "annualOutput": "", "throughput": "", "recovery": "", "aisc": "", "cashCost": "", "freeCashFlow": "", "reserveLife": "" },
      "metallurgy": { "recovery": "", "method": "", "testwork": "" },
      "infrastructure": { "power": "", "road": "", "water": "", "port": "", "notes": "" },
      "royalty": { "assets": [ { "name": "", "type": "NSR|stream", "rate": "", "operator": "", "status": "" } ] }
    }
  ],

  "compare": {
    "stageIndex": 0,
    "primaryCommodity": "",
    "commodities": [""],
    "marketCapTier": "nano|micro|small|mid",
    "jurisdiction": "",
    "jurisdictionRisk": "low|moderate|high",
    "flagshipGradeAgEq": "",
    "resourceOz": null,
    "fundedStatus": ""
  },

  "media": {
    "heroVideo": null,
    "heroPhoto": null,
    "projectAerials": [],
    "corePhotos": [],
    "crossSections": [],
    "maps": [],
    "headshots": [],
    "other": []
  },

  "citations": {
    "<material.path>": { "value": "", "quote": "", "doc": "", "date": "", "verification": "QUOTED|DERIVED|SYNTHESIZED|SELECTED" }
  },

  "notFound": []
}

═══════════════════════════════════════════════════════════════════
SCHEMA POPULATION RULES
═══════════════════════════════════════════════════════════════════

CONFERENCE.HOOK
• Maximum 8 words • One line • Specific to the company • Communicates the central story • No slogan unless the slogan is factual and suitable • No promotional superlative

CONFERENCE.OVERVIEW
Write one concise company-introduction paragraph. It must explain: who the company is, what it does, what management is trying to build or prove, what distinguishes the business model, the flagship project, principal operation or portfolio. End by naming the flagship project or describing the principal portfolio so the paragraph naturally transitions into Assets. Do not recite figures.

CONFERENCE.MISSION
One sentence. Use the company’s disclosed mission or objective where available. Neutralize promotional language. Set null if no meaningful company-specific mission can be supported.

CONFERENCE.MACROCONTEXT
One sentence explaining why the commodity or market is relevant. Do not include company facts. Do not include commodity-price predictions. Set null if macro context would be generic or irrelevant.

CONFERENCE.REGION
A company-specific jurisdiction or operating-footprint paragraph. Set null only when jurisdiction is not meaningful to the business model.

CONFERENCE.DISTRICTCONTEXT
One or two sentences addressing district history, nearby operators, historical production or relevant comparisons. Set null if not applicable.

CONFERENCE.REGIONALGEOLOGY
One or two sentences on the regional geological setting. Set null for companies where regional geology is not relevant, such as certain diversified royalty portfolios.

CONFERENCE.HIGHLIGHTS
Output 3–5 entries. Each must include context.

CONFERENCE.RESULTSINTRO
Adapt it to: technical evidence, economics, construction, production, royalty-asset progress, processing performance. Set null only if no results or operating-evidence section is warranted.

CONFERENCE.TIMELINEINTRO
Explain the company’s momentum, transformation or development sequence. Do not include rewritten milestone text.

CONFERENCE.CAPITALINTRO
Explain the funding situation and its implications. Set null only when capital information is unavailable or not applicable.

CONFERENCE.LEADERSHIPINTRO
Explain why the team is relevant to the current stage. Set null if leadership evidence is insufficient.

CONFERENCE.COMPANYSPECIFICINSIGHTS
Return an empty array if none exist.

CONFERENCE.CUSTOMSECTIONS
Return an empty array if none are required.

PROJECTS
Output only: key, narrative, applicable technical blocks. The importer merges projects by key. For each project: use exactly 2–3 narrative paragraphs; set stage-inapplicable blocks to null; do not return empty objects full of null child fields.

Examples:
An early explorer may use: narrative, infrastructure, resource = null, economics = null, production = null, metallurgy = null, royalty = null.
A developer may use: narrative, resource, economics, metallurgy, infrastructure, production = null, royalty = null.
A producer may use: narrative, resource, economics where a study remains material, production, metallurgy, infrastructure, royalty = null.
A royalty company’s material asset may use: narrative, royalty, other project blocks only when relevant to understanding the underlying asset.

COMPARE
This block is not shown directly in Conference Mode. It supports Passport screening and comparison. Fill only supported normalized values. Use null where required information is unavailable. Do not guess jurisdiction risk. If no defensible risk classification exists, use null even if the enum does not display null in the example.

MEDIA
Inventory only real assets. Use empty arrays when no suitable assets exist.

CITATIONS
Cite material figures only. Include citations for: resource, reserve, grade, major drill result, economics, production, cash, debt, shares, ownership, land package, material infrastructure, metallurgy, royalty terms, material catalyst timing. Do not create a citation for every sentence.

Verification definitions:
QUOTED — the value appears directly in the cited source.
DERIVED — the value was calculated from disclosed source figures.
SYNTHESIZED — the statement combines multiple disclosed facts without changing their meaning.
SELECTED — the item was selected from an existing list, such as a milestone date or featured project.

NOTFOUND
List: missing material information, stage-inapplicable blocks, unsupported expected fields, unresolved conflicts. Use clear schema paths.

═══════════════════════════════════════════════════════════════════
IMAGE GUIDE FORMAT
═══════════════════════════════════════════════════════════════════

After the JSON, output:

=== IMAGE GUIDE ===

Hero: <exact presentation page or slide and image>
Jurisdiction: <exact regional, district, access or operating-footprint map>
Assets — <project or asset name>: <exact claim map, property map, aerial, geology map, mine image or portfolio visual>
Results: <exact drill section, resource model, production chart, plant photograph, construction image or royalty-asset visual>
Infrastructure: <exact page or slide, only if material>
Leadership: <exact headshot page or source, only if available>
Custom — <section title>: <exact supporting image, only when a custom section exists>

List only images that actually appear in the supplied documents.

State exact page or slide numbers whenever available.

Do not recommend share-price charts, promotional comparison charts or testimonials.

═══════════════════════════════════════════════════════════════════
FINAL INSTRUCTION
═══════════════════════════════════════════════════════════════════

The goal is not to fill every possible field.

The goal is to represent the company completely, accurately and efficiently.

Use the fixed Passport interface.
Adapt the content to the company.
Omit irrelevant modules.
Capture material information beyond the checklist.
Never sacrifice consistency for novelty.
Never sacrifice material information merely to preserve the checklist.

After approximately 90 seconds, the investor must understand: the company, the assets, the evidence, the current plan, the funding position, the next validation events, the principal differentiators, the reason to continue following the company on Passport.

Return the JSON first.
Then return the Image Guide.
Return nothing else.`;

// ─────────────────────────────────────────────────────────────────────────────
// CONFERENCE — SECTION-BY-SECTION BUILD
// The repeatable booth workflow: bulk-upload the company's docs once, then work
// through this list. Each section is a small, self-contained prompt that outputs
// ONLY that section's JSON. Paste the doc text + the section prompt into ChatGPT,
// load the JSON back, and that page fills. Work down the list until it's done.
// ─────────────────────────────────────────────────────────────────────────────
const CONF_SECTION_RULES = `RULES
- Use ONLY the supplied documents. If a field is not supported by the documents, set it to null (or [] for a list). Never invent, never use outside knowledge, never guess.
- Quote technical figures VERBATIM — grades, intervals, dollar amounts, dates, share counts. Do not round, convert, or rephrase them.
- Neutralize promotional language. No superlatives unless a document states them as fact.
- Output ONLY the JSON shape shown below — nothing else. No other keys, no commentary before or after, no markdown code fences. It must be valid JSON.`;

export const CONFERENCE_SECTIONS = [
  {
    id: "overview", label: "Company Overview", n: 1,
    docs: "Corporate presentation + website 'About' page.",
    guide: `conference.hook — the central story in 8 words or fewer, specific, no slogan-speak.
conference.overview — ONE paragraph: who the company is, what management is building or proving, the business model, and the flagship asset (end by naming it).
conference.mission — the company's own disclosed mission/objective in one sentence, or null.
conference.macroContext — one sentence on why the commodity/market is relevant, or null.
conference.heroStatistic — the ONE defining number or phrase for the company (e.g. { value: "641 g/t AgEq", label: "Bonanza grade", context: "maiden hole" } or { value: "C$13M", label: "Funded drill campaign", context: "" }). value = short. Set null if nothing strong enough.
company.slogan — the company's own tagline, verbatim, if it has one.`,
    skeleton: { company: { slogan: "" }, conference: { hook: "", overview: "", mission: null, macroContext: null, heroStatistic: { value: "", label: "", context: "" } } },
  },
  {
    id: "highlights", label: "Highlights", n: 2,
    docs: "Corporate presentation + the most material recent news releases.",
    guide: `conference.highlights — 3 to 5 items. Each: value (a SHORT punchy stat, e.g. "1,742 g/t AgEq" — keep qualifiers OUT of value), label (2-4 words), context (one sentence on why it matters). Order by materiality.
conference.highlightsIntro — one short paragraph framing what the highlights add up to.`,
    skeleton: { conference: { highlights: [{ value: "", label: "", context: "" }], highlightsIntro: "" } },
  },
  {
    id: "jurisdiction", label: "Jurisdiction & District", n: 3,
    docs: "Technical report (location/geology sections) + corporate presentation.",
    guide: `company.jurisdiction — the specific district/region name (e.g. "Parral Mining District, Chihuahua, Mexico"). This is the bold header of the page.
conference.region — a company-specific paragraph on the operating footprint (assets, size, why here).
conference.districtContext — district history, nearby operators, historical production, or null.
conference.regionalGeology — the regional geological setting in 1-2 sentences, or null.`,
    skeleton: { company: { jurisdiction: "" }, conference: { region: "", districtContext: null, regionalGeology: null } },
  },
  {
    id: "projects", label: "Projects / Assets", n: 4,
    docs: "Technical report(s) — one project per run if they are large.",
    guide: `One entry per project. key — a stable slug (e.g. "las-coloradas"). snapshot — the quick facts. narrative — 2-3 short paragraphs. geology, targets — from the technical report. Set conference.featuredProjectKey to the flagship's key.
conference.portfolioOverview — ONE short paragraph framing the whole portfolio (only meaningful if there are 2+ projects; else null). conference.portfolioTitle — an optional short headline for the portfolio page (e.g. "Three district-scale assets"), else null.`,
    skeleton: { projects: [{ key: "", name: "", tag: "", snapshot: { location: "", commodity: "", ownership: "", landPackage: "", depositType: "" }, narrative: ["", "", ""], geology: "", targets: { priority: "", closing: "" } }], conference: { featuredProjectKey: "", portfolioOverview: null, portfolioTitle: null } },
  },
  {
    id: "results", label: "Drill Results & Technical Evidence", n: 5,
    docs: "Technical report + drill-result news releases.",
    guide: `projects[].drillResults.rows — the best intercepts, one row each: hole, interval (e.g. "15.7 m"), grade (e.g. "74 g/t AgEq"). VERBATIM.
projects[].resource / economics — only if a resource estimate or economic study (PEA/PFS/FS) exists; else null.
conference.resultsIntro — one paragraph framing the technical evidence and what it's testing.`,
    skeleton: { projects: [{ key: "", drillResults: { rows: [{ hole: "", interval: "", grade: "" }] }, resource: null, economics: null }], conference: { resultsIntro: "" } },
  },
  {
    id: "milestones", label: "Milestones (feature + intro)", n: 6, useProfile: true,
    docs: "Uses your EXISTING timeline — NO documents. Click 'Copy profile JSON' and paste it with this prompt. (If the timeline isn't populated yet, run Timeline in the App Blueprint first — it batches the releases.)",
    guide: `You are given the company's EXISTING Passport profile, which ALREADY contains a full timeline array. DO NOT re-extract, re-list, or rewrite the timeline. Output ONLY these two small fields:
conference.featuredMilestoneDates — the 4 to 6 MOST important milestone dates. Each MUST EXACTLY match a date/id already present in the profile's timeline (verbatim, YYYY-MM-DD). Never invent a date.
conference.timelineIntro — ONE short paragraph on the company's momentum and trajectory. Do not rewrite any milestone text.
This output is tiny — print it directly in your reply. Do NOT write it to a file.`,
    skeleton: { conference: { featuredMilestoneDates: ["YYYY-MM-DD"], timelineIntro: "" } },
  },
  {
    id: "capital", label: "Capital", n: 7,
    docs: "Financial statements + MD&A + financing news releases.",
    guide: `capital — cash, debt, shares outstanding, fully diluted, market cap (if stated), and financing history. Verbatim figures with the reporting date.
conference.capitalIntro — one paragraph on the funding position and what it enables.`,
    skeleton: { capital: { cash: "", debt: "", outstanding: "", fd: "", marketCap: "", reportingDate: "", financing: [{ amount: "", date: "", type: "" }] }, conference: { capitalIntro: "" } },
  },
  {
    id: "leadership", label: "Leadership", n: 8,
    docs: "Website team page or corporate deck (for bios). Management circular gives names/titles only.",
    guide: `team — one entry per person, officers first then directors: name, role (real title — CEO, CFO, VP Exploration, Director), short (1-sentence), full (2-3 sentence bio).
conference.leadershipIntro — one sentence on why the team fits the company's stage, or null.`,
    skeleton: { team: [{ name: "", role: "", short: "", full: "" }], conference: { leadershipIntro: null } },
  },
  {
    id: "why", label: "Why Invest", n: 9, useProfile: true,
    docs: "Synthesis — best from your EXISTING profile (Copy profile JSON). You may also attach the corporate deck.",
    guide: `conference.investmentCase — 3-5 items, each: reason, evidence (specific, from the profile/docs), standsOutBecause. conference.competitiveAdvantages — 3-5 short phrases. conference.companySpecificInsights — any material fact that didn't fit elsewhere.
conference.investmentSummary — ONE paragraph synthesizing the strongest established reasons to keep researching this company (not a repeat of every card, non-promotional).
conference.investorTakeaway — ONE short line: the single strongest overall takeaway, already supported elsewhere.`,
    skeleton: { conference: { investmentCase: [{ reason: "", evidence: "", standsOutBecause: "" }], competitiveAdvantages: [""], companySpecificInsights: [{ title: "", context: "", evidence: "", materiality: "high|medium" }], investmentSummary: "", investorTakeaway: "" } },
  },
];

// A small, focused, self-contained prompt for ONE booth section.
export function conferenceSectionPrompt(id) {
  const s = CONFERENCE_SECTIONS.find((x) => x.id === id) || CONFERENCE_SECTIONS[0];
  const source = s.useProfile
    ? `SOURCE: You are given the company's EXISTING Passport profile JSON (pasted with this prompt). Use it as your source — do not re-extract data that already exists. ${s.docs}`
    : `DOCUMENTS TO USE: ${s.docs}`;
  const fillFrom = s.useProfile ? "from the profile provided" : "from the documents";
  return `You are populating ONE section of a PASSPORT Conference Mode booth for a mining or resource company.

SECTION: ${s.label}
${source}

${CONF_SECTION_RULES}

FIELD GUIDANCE
${s.guide}

OUTPUT — fill this exact JSON shape ${fillFrom} (null / [] where unsupported). This output is SMALL — print it directly in your reply, do not write it to a file. Output NOTHING else:
${JSON.stringify(s.skeleton, null, 2)}
`;
}
