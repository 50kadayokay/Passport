# Passport — Per-Widget Prompts for ChatGPT

Paste the **standing instructions** once at the top of the conversation.
Then paste **one block below at a time**, in order. Each block is self-contained.

Order: 1 → 3 (Overview), 4 → 9 (Projects), 10 → 13 (Capital), 14 → 15 (Team/Timeline).

---

## BLOCK 1 — Company Status Card

```
Spec the COMPANY STATUS CARD using the 7-section format.

WHAT IT CURRENTLY DISPLAYS (in layout order):
- A "COMPANY STATUS" label, plus a photo slot (I upload the image)
- A large headline (what the company is doing right now)
- A one-sentence subtext under it
- A progress bar with a label and a percentage
- Four boxes in a 2x2 grid: Latest Update | Investment Impact | Next Catalyst | Expected

KINGSMEN REFERENCE (this is the richness bar):
- Headline: "26-Hole Drill Campaign"
- Subtext: "Phase 1 diamond drilling is actively underway at Las Coloradas."
- Progress: "14 / 26 holes" (54%)
- Latest Update: "Three drill holes submitted to the lab for assays."
- Investment Impact: "Could expand the high-grade silver system."
- Next Catalyst: "Phase 1 Assays"
- Expected: "Expected H2 2026"

KNOWN CONSTRAINTS:
- The headline must be an ACTIVITY, not an identity. "26-Hole Drill Campaign" is right;
  "Leading Silver Explorer" is wrong. Roughly 40 characters max.
- This card goes stale the moment new news lands, so it must be regenerated on every update.
- Today the app renders only ONE progress model: a numeric bar (current/target). If there is
  no real count, the bar hides entirely rather than showing a fake 0%.

PAY PARTICULAR ATTENTION TO:
- Selection logic: how to choose WHICH initiative becomes the status, so a conference
  announcement or option grant never displaces a material operational program.
- Progress models for companies with nothing countable: royalty companies, prospect
  generators, companies awaiting a permit decision, companies evaluating acquisitions.
  Flag any progress display that would need to be built.
```

---

## BLOCK 2 — AI Brief (60-Second Company Orientation)

```
Spec the AI BRIEF using the 7-section format.

WHAT IT CURRENTLY DISPLAYS:
A card on the Overview tab titled "Explain [Company] in 60 Seconds". Tapping it opens a
sheet containing six labelled sections, read top to bottom.

THE SIX SECTIONS (fixed, in this order):
1. What They Do
2. How They Create Value
3. Why It Matters
4. Competitive Advantages  (this one is 3-5 bullets; the rest are prose)
5. Current Focus
6. What Success Looks Like

KINGSMEN REFERENCE (the richness bar):
- What They Do: "Kingsmen Resources is a junior mineral exploration company focused on silver
  and gold in Mexico. It acquires past-producing mining districts in the country's historic
  silver belts and re-explores them with modern techniques to test whether they hold larger
  systems than earlier miners ever defined."
- Competitive Advantages bullets: "District-scale land in a Tier-1 Mexican silver belt" /
  "Built on past-producing mines — grade is already proven" / "A bonanza-grade discovery hole
  already in hand (1,742 g/t AgEq)" / "Fully funded 2026 drill program" / "100% owned"

PURPOSE OF THIS WIDGET:
Orientation, not data. It's for an investor who has never heard of the company. It should
explain the business in plain English — context, not a repeat of the financials or project
detail that live elsewhere.

PAY PARTICULAR ATTENTION TO:
- Are these the right six sections for every company archetype? A royalty company or a
  producer may need a different set — tell me if so, and which.
- Length per section, so the whole thing genuinely reads in about 60 seconds.
- How to keep it factual without becoming dry, and non-promotional without becoming negative.
```

---

## BLOCK 3 — Core Value Drivers

```
Spec the CORE VALUE DRIVERS widget using the 7-section format.

WHAT IT CURRENTLY DISPLAYS:
A black bar on the Overview tab labelled "Core Value Drivers". Tapping it expands a vertical
timeline-style rail with 3-5 short points, each on its own line with a node and icon.

KINGSMEN REFERENCE (the richness bar):
- "Active 26-hole drill campaign underway"
- "Fully funded through 2026 — no near-term dilution"
- "Historic high-grade silver-gold district"
- "District-scale consolidated land package"
- "Multiple drill-ready discovery targets"

KNOWN CONSTRAINTS:
- These are SHORT — roughly 10 words each. They are scannable claims, not sentences.
- Each must be backed by a disclosed fact, not a general virtue.
- 3-5 items. Fewer than 3 looks empty; more than 5 stops being scannable.

PAY PARTICULAR ATTENTION TO:
- What makes a genuine "value driver" versus filler. "Experienced management team" is the
  kind of thing I want excluded unless it's backed by something specific.
- How these should differ from the AI Brief's Competitive Advantages, so the two widgets
  don't duplicate each other.
- Archetype variants: what the drivers should be for a producer or royalty company, where
  "drill campaign underway" doesn't apply.
```

---

## BLOCK 4 — Project Snapshot (fundamentals grid)

```
Spec the PROJECT SNAPSHOT using the 7-section format.

WHAT IT CURRENTLY DISPLAYS:
On each project's page, a 2x2 grid of four tiles. Each tile shows an icon, a small label, and
a headline value. Tapping a tile opens a detail sheet.

THE AVAILABLE FUNDAMENTALS (six defined; the best four fill the grid):
Location & Jurisdiction · Primary Commodity · Ownership · Land Package · Deposit Type ·
Past Producer

KINGSMEN REFERENCE — one cell, showing the full richness bar:
  Location & Jurisdiction
  value:  "Parral District"
  value2: "Chihuahua, Mexico"
  detail: Mining district → Parral District
          State / province → Chihuahua
          Country → Mexico
          Coordinates → ~27.05 N, 105.45 W
          Elevation → ~1,700 m
          Jurisdiction → Tier-1 Mexican silver belt
  note:   "Chihuahua is one of the world's most established silver-mining jurisdictions, with
           deep operating history, infrastructure and skilled labour."

Every cell needs that structure: headline value, optional second line, 4-8 supporting fact
pairs, and a closing note on why it matters. A cell with only a headline value produces a
one-line detail sheet, which is the main thing I'm trying to eliminate.

KNOWN CONSTRAINTS:
- Only four tiles are visible; the grid fills with the best four the company actually supports.
- A "Drill Targets" tile can replace one of these when the project has real drill targets.

PAY PARTICULAR ATTENTION TO:
- Are these the right six fundamentals for every archetype? A producing mine or a royalty
  interest may need different ones (e.g. production rate, operator, royalty terms).
- Priority order: which four should win when a company supports more than four.
- What each detail sheet should contain beyond the fact pairs.
```

---

## BLOCK 5 — Project Stage

```
Spec the PROJECT STAGE widget using the 7-section format.

WHAT IT CURRENTLY DISPLAYS:
A dark card on the project page showing a horizontal roadmap of six fixed stages —
Explore, Discovery, Resource, Studies, Develop, Produce — with the current stage highlighted.
Tapping it opens a detail sheet about where the project stands.

KINGSMEN REFERENCE (the detail sheet content):
  summary:   "Las Coloradas has moved from generating targets to actively drilling them. It has
              a confirmed high-grade discovery but no defined resource yet — the current work is
              about proving size and continuity."
  current:   "Discovery"
  program:   "26-hole diamond drill program (Phase 1 underway)"
  activity:  "Drilling and submitting Phase 1 holes for assay"
  completed: ["Consolidated 15 concessions into one district package",
              "Completed mapping, geochemistry and 3D IP geophysics",
              "Maiden hole returned 1,742 g/t AgEq"]
  next:      "Phase 1 assay results from the 26-hole program"
  timing:    "Assays pending; results expected through 2026"
  closing:   "To advance from Discovery toward Resource, drilling needs to demonstrate
              continuity between zones and enough consistent grade and width to support a
              maiden resource estimate."

PAY PARTICULAR ATTENTION TO:
- The six-stage roadmap is linear and exploration-shaped. How should it behave for a royalty
  interest, a prospect generator, or a past-producing asset being restarted? Flag if a
  different stage model is needed.
- Rules for deciding which stage a project is in, so it's consistent across companies.
- What must be true to claim a stage — I don't want "Resource" claimed without a resource.
```

---

## BLOCK 6 — Technical Intelligence Cards

```
Spec the TECHNICAL INTELLIGENCE CARDS using the 7-section format.

WHAT IT CURRENTLY DISPLAYS:
A section on each project page with four tappable cards. Each opens a detail sheet.
  - District Context      (Claims, structures, regional context)
  - Exploration Strategy  (Programs, operators, targets)
  - Geological Model      (Rocks, structures, mineralization)
  - Exploration Results   (Intercepts, assays, sections)

KINGSMEN REFERENCE — the Geological Model sheet:
  summary: "Las Coloradas is a classic epithermal silver-gold vein system. Metal sits in
            northwest-trending structures that stay open at depth, with deeper skarn and
            porphyry potential hinting at a much larger system."
  table:   Deposit Type → Low-sulphidation epithermal vein
           Host Rocks → Volcanic & sedimentary sequence
           Structural Controls → NW-trending Soledad & Soledad II veins
           Mineralization Style → High-grade Ag-Au veins with Pb-Zn-Cu credits
           Alteration → Quartz-calcite veining; felsic intrusive association
           Historic Production → ASARCO-era, shallow high-grade silver
  closing: "The model explains why Kingsmen drills where it does: grade is controlled by
            structure, so testing flexures, intersections and depth extensions of the Soledad
            veins is the most direct route to a discovery."

Exploration Results uses a different shape — a list of drill intercepts (hole, grade, width,
note) plus latest/pending status — rather than a fact table.

PAY PARTICULAR ATTENTION TO:
- What belongs in each of the four cards, and the boundary between them (District Context vs.
  Geological Model in particular).
- What Exploration Results should show for a company with NO drill results — a producer, a
  royalty holder, or a pre-drill explorer. This is a real gap I hit.
- Whether producers need a different fourth card (e.g. Operations / Production) instead of
  Exploration Results.
```

---

## BLOCK 7 — Understand This Project in 60 Seconds

```
Spec the PROJECT BRIEF ("Understand this project in 60 seconds") using the 7-section format.

WHAT IT CURRENTLY DISPLAYS:
A blue card on the project page. Tapping it opens a sheet with the project explained in plain
English across several labelled parts.

KINGSMEN REFERENCE (the parts and the bar):
  overview:    "Las Coloradas is a district-scale silver-gold project in the Parral district of
                Chihuahua, Mexico. It consolidates several past-producing ASARCO-era mines into
                a single 845-hectare package."
  thesis:      "Management is testing whether the two northwest-trending Soledad vein structures
                — mined only to the historic water table — continue as one connected, high-grade
                system along a ~2.5 km corridor and downward."
  focus:       "An active 26-hole diamond program is testing strike and depth continuity; three
                holes have been submitted for assay."
  opportunity: "Multiple high-grade structures remain open along the corridor. The biggest prize
                is proving they connect into one continuous, district-scale system."
  risks:       "Early-stage drill program with no defined resource. Drilling could show
                mineralization is less continuous than the historic workings imply."
  different:   "Unlike most early-stage explorers, it's built on past-producing mines and already
                has a bonanza-grade discovery hole in hand."
  means:       "For an investor, this is a funded drill program actively testing whether a proven
                high-grade district connects into one large system."

KNOWN CONSTRAINT:
An earlier version of this was too dense to actually read in 60 seconds. Length discipline
matters here.

PAY PARTICULAR ATTENTION TO:
- How this differs from the company-level AI Brief so they don't read as duplicates.
- The risks part must state real risk plainly — a softened version is a defect.
- Whether every part is needed, or whether some should merge to hit the 60-second promise.
```

---

## BLOCK 8 — What Sets This Project Apart

```
Spec the "WHAT SETS THIS PROJECT APART" widget using the 7-section format.

WHAT IT CURRENTLY DISPLAYS:
A section on the project page presenting the project's differentiators, each paired with a
supporting fact.

KINGSMEN REFERENCE (the richness bar):
  summary: "Among early-stage silver explorers, Las Coloradas stands out for pairing a proven
            historic producer with a confirmed modern discovery, inside a fully-consolidated,
            fully-funded district."
  differentiators (each has a heading, an explanation, and a hard fact):
    - "Proven high-grade district" / built on past-producing ASARCO mines / fact: "Historic
      grades of 300-518 g/t silver"
    - "Bonanza-grade discovery in hand" / maiden hole returned district-defining grade /
      fact: "1,742 g/t AgEq over 0.70 m"
    - "District-scale consolidation" / 15 concessions unified / fact: "845 ha, ~2.5 km corridor"
    - "Fully funded program" / 2026 campaign financed / fact: "C$13M bought deal"
    - "Open at depth" / historic mining stopped at the water table / fact: "Open below ~125 m"
  takeaway: "A funded drill program is actively testing whether a proven high-grade district
             connects into one large system — and the first results already point that way."

PAY PARTICULAR ATTENTION TO:
- The rule that every differentiator must carry a disclosed number or name as proof. I want
  claims without proof excluded entirely.
- How many differentiators is right.
- How this avoids duplicating Core Value Drivers (company level) — this one is project level.
```

---

## BLOCK 9 — Bull / Bear / Next Validation

```
Spec the SCENARIOS widget (Bull Case / Bear Case / Next Validation Point) using the 7-section
format.

WHAT IT CURRENTLY DISPLAYS:
Three selectable cases on the project page. Each expands to a short statement.

KINGSMEN REFERENCE:
  Bull: "Drilling confirms continuity and expands the known high-grade silver system, opening a
         path to a maiden resource."
  Bear: "Drilling fails to demonstrate continuity between mineralized zones, weakening the
         discovery thesis."
  Next: "Pending assays from the current 26-hole campaign will confirm whether grade and
         continuity extend across the program — the key driver of a re-rate."

KNOWN CONSTRAINTS:
- 1-2 sentences each. These are read quickly.
- The bear case must state genuine risk — no defined resource, exploration risk, commodity
  exposure, permitting risk. A sanitized bear case is a defect and I will treat it as one.
- No share-price predictions in any of the three.

PAY PARTICULAR ATTENTION TO:
- How to keep bull and bear genuinely balanced rather than bull-weighted.
- Archetype variants: what bull/bear look like for a producer (operational/cost risk) or a
  royalty company (partner execution risk) versus an explorer.
- What qualifies as a legitimate "next validation point" versus a vague ambition.
```

---

## BLOCK 10 — Capital Status Card

```
Spec the CAPITAL STATUS CARD using the 7-section format.

WHAT IT CURRENTLY DISPLAYS:
A card at the top of the Capital tab: a state pill, a large headline, a supporting sentence,
and a runway bar with start/end labels.

KINGSMEN REFERENCE:
  state:    "Fully Funded"
  headline: "Fully Funded Through 2026"
  summary:  "The C$13M February bought deal fully funds the planned 2026 exploration program,
             with no near-term financing required."
  runway:   Today → Through 2026

APPROVED STATE VOCABULARY (must be one of these — it drives the colour of the pill):
Fully Funded · Recently Financed · Production Funded · Financing Expected ·
Capital Allocation Update · Strategic Acquisition Funding

KNOWN PROBLEM I WANT FIXED:
On another company this card produced "Producing U.S. uranium company with growing cash flow
and diversified financing" — that is a company description, not a capital status. The headline
must be about the FUNDING POSITION specifically: are they funded, for how long, and what
happens next.

PAY PARTICULAR ATTENTION TO:
- Rules that force the headline to be about funding, never a general company blurb.
- How to pick the right state from the approved list.
- What the runway bar should show when runway isn't disclosed — and flag if a different
  display is needed.
- Archetype variants: a cash-flowing producer, a pre-revenue explorer, and a royalty company
  have very different capital stories.
```

---

## BLOCK 11 — Capital Snapshot Tiles

```
Spec the CAPITAL SNAPSHOT TILES using the 7-section format.

WHAT IT CURRENTLY DISPLAYS:
A row of small tiles on the Capital tab. Each shows a label, a large value, and a small
sub-line. Tapping one opens a detail sheet. Current tiles: Latest Financing · Cash ·
Basic Shares · Working Capital.

KINGSMEN REFERENCE:
  Latest Financing → "C$13.0M" / sub: "Bought Deal · February 2026"
  Cash            → "C$4.2M"  / sub: "As of Mar 31, 2026"
  Basic Shares    → "34.5M"
  Debt            → "C$0"

KNOWN PROBLEM I WANT FIXED:
These tiles were rendering long headline sentences instead of key numbers, which made them
oversized and hard to scan. A tile must lead with a NUMBER. Supporting prose belongs in the
detail sheet behind it, not on the tile face.

PAY PARTICULAR ATTENTION TO:
- Which four tiles matter most, and whether that set should change by archetype (a producer
  might want production or revenue; a royalty company might want royalty count).
- Formatting rules for numbers so they stay scannable (C$13.0M, not C$13,000,000).
- What each detail sheet should contain behind the tile.
- What a tile shows when the figure isn't disclosed — and whether it should hide entirely.
```

---

## BLOCK 12 — Share Structure & Ownership

```
Spec the SHARE STRUCTURE and OWNERSHIP widgets using the 7-section format.

WHAT THEY CURRENTLY DISPLAY:
Two rows on the Capital tab, each opening a detail sheet.
  - Share Structure: preview "34.5M basic · 44.9M fully diluted"
  - Ownership:       preview shows the insider/institutional split

KINGSMEN REFERENCE:
  Share structure rows: Common Shares Outstanding 34,523,086 · Options · Warrants
  Fully diluted: 44.9M
  Ownership: Insider Ownership ~24% (institutional not reported)

KNOWN CONSTRAINTS:
- Share counts must be copied EXACTLY as disclosed, commas included, most recent figure.
- Ownership is frequently not disclosed by juniors. When it isn't, the widget must say so
  plainly rather than implying a number.

PAY PARTICULAR ATTENTION TO:
- What belongs in the share structure sheet beyond the raw counts (dilution, expiry, pricing).
- How to present ownership when only partial data exists — insider known, institutional not.
- Whether these two should stay separate or merge into one capital-structure widget.
```

---

## BLOCK 13 — Financing History

```
Spec the FINANCING HISTORY widget using the 7-section format.

WHAT IT CURRENTLY DISPLAYS:
A "Latest Financing" tile that opens a detail sheet listing the most recent raise, plus a
history of prior raises.

KINGSMEN REFERENCE:
  Feb 2026  · C$13.0M · Bought Deal          · C$0.90 · 2026 Exploration Program
  Nov 2025  · C$4.15M · Private Placement    · C$0.45 · Discovery follow-up drilling
  May 2025  · C$1.14M · Private Placement    · C$0.20 · Permitting & drill preparation
  Nov 2024  · C$1.0M  · Non-Brokered         · C$0.15 · General working capital

KNOWN PROBLEM I WANT FIXED:
The detail sheet was dumping every field even when empty, showing rows of "Not Reported".
Empty rows should simply not appear.

PAY PARTICULAR ATTENTION TO:
- Which fields per raise are essential versus optional (amount, date, type, price, use of
  proceeds, lead broker).
- How many historical raises to show before it becomes noise.
- What this should show for a company that has never raised (a spin-out, or a cash-flowing
  producer that self-funds).
```

---

## BLOCK 14 — Leadership Team

```
Spec the LEADERSHIP TEAM widget using the 7-section format.

WHAT IT CURRENTLY DISPLAYS:
A list of people on the Team tab. Each shows a photo (I upload these), name, role, and a short
line. Tapping a person opens a fuller biography.

KINGSMEN REFERENCE:
  name:  "Scott Emerson"
  role:  "President, CEO & Director"
  short: one line — prior companies and credentials
  full:  2-4 sentences

KNOWN CONSTRAINTS:
- Only real, named people with disclosed titles. No invented people, no invented credentials,
  no padding the list with unnamed "advisors".
- Officers first, then directors.
- Photos are uploaded by me and are not part of the generated content.

PAY PARTICULAR ATTENTION TO:
- What makes a useful one-line bio for an investor versus filler. I want prior discoveries,
  exits, and relevant operating experience — not "seasoned professional".
- How many people to include before it stops being useful.
- What to do when only a name and title are disclosed and there's no biography available.
```

---

## BLOCK 15 — Timeline (Press Releases)

```
Spec the TIMELINE using the 7-section format.

WHAT IT CURRENTLY DISPLAYS:
The Timeline tab, grouped by year and quarter. Each entry shows a date, a headline, a short
"why it matters" line, and key numbers. Tapping an entry opens the full release text.

KINGSMEN REFERENCE (one entry):
  date:     2026-05-12
  headline: "Kingsmen Completes 60 km2 Precision Drone Magnetic Survey"
  why:      one sentence on the investor significance
  numbers:  key figures pulled from the release
  full:     the complete verbatim release text

KNOWN CONSTRAINTS:
- The full verbatim text is uploaded in bulk separately, so it does NOT need to be generated.
- Only what is stated in the release — no interpretation beyond significance.
- Dates must be exact.

PAY PARTICULAR ATTENTION TO:
- Rules for the "why it matters" line so it adds insight rather than restating the headline.
- Which releases deserve to be flagged as key milestones versus routine, and the rule for
  deciding.
- Whether non-material releases (conference attendance, IR agreements) should appear in the
  timeline at all, or be excluded the way they're excluded from the status card.
- How to handle a company with 70+ releases so the timeline stays readable.
```
