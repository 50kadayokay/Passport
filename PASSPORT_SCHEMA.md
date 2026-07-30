# Passport — Company Profile Schema

**What this is:** the exact structure the Passport app reads. Every field name here is a hard
contract with the app's code — if a name doesn't match, that widget renders empty.

**How it's used:** ChatGPT reads a company's documents and returns JSON in this shape. You paste
it into Admin → Import. The app derives everything it renders from this one object.

**The gold standard is Kingsmen.** All examples below are Kingsmen's real values — that is the
richness bar every company should hit.

---

## The rule that makes profiles rich (read this first)

Thin profiles happen when fields are filled with a single line. Kingsmen is rich because it
follows two repeating patterns. **Every generated section must follow them.**

**Pattern A — Snapshot cell** (the tap-through fundamentals):
```
value    → the headline fact (2-4 words)
value2   → optional second line
detail   → 4-8 [label, value] pairs   ← THIS is what makes the detail card substantive
note     → 1-2 sentences: why this matters to an investor
```

**Pattern B — Content block** (the detail sheets behind every card):
```
summary  → 1-2 sentences framing the topic
table    → 6-8 [label, value] pairs of hard facts   (or a structured list)
closing  → 1-2 sentences: the "so what" for an investor
```

Use `null` for a fact the documents don't state. **Never invent.** Never write "N/A" — use `null`
so the row hides cleanly.

---

## Top-level shape

```json
{
  "company":       { ... },
  "companyStatus": { ... },
  "companyBrief":  { ... },
  "capital":       { ... },
  "team":          [ ... ],
  "timeline":      [ ... ],
  "projects":      [ ... ]
}
```
Images (`brand.logo`, project photos, headshots) are **not** in this JSON — you upload those.

---

## 1. `company` — identity
**Powers:** profile header (name, ticker, website, tagline) + Capital tab listings.

| Field | What goes in it | Kingsmen example |
|---|---|---|
| `name` | Legal company name | `"Kingsmen Resources"` |
| `ticker` | Primary listing | `"TSXV: KNG"` |
| `website` | Full URL | `"https://www.kingsmenresources.com"` |
| `slogan` | Their own tagline. Do NOT invent one | `"Chihuahua's preeminent explorationist"` |
| `commodity` | Primary metals | `"Silver & Gold"` |
| `jurisdiction` | Primary location | `"Chihuahua, Mexico"` |
| `listings[]` | `{ ex, sym }` per exchange | `[{ "ex": "TSXV", "sym": "KNG" }]` |

---

## 2. `companyStatus` — the Company Status card
**Powers:** the big card at the top of the Overview tab. This is the single most-read widget.
**Must be refreshed every time news lands** — it is stale by definition otherwise.

| Field | What goes in it | Kingsmen example |
|---|---|---|
| `statusHeadline` | What they're doing **right now**. ≤40 chars, punchy | `"26-Hole Drill Campaign"` |
| `statusHeadlineSubtext` | One sentence expanding it | `"Phase 1 diamond drilling is actively underway at Las Coloradas."` |
| `latestUpdate` | The single most recent material development | `"Three drill holes submitted to the lab for assays."` |
| `investmentImpact` | Why that matters, one balanced sentence | `"Could expand the high-grade silver system."` |
| `nextCatalyst` | Short label for the next value event | `"Phase 1 Assays"` |
| `expected` | Timing if stated, else `""` | `"Expected H2 2026"` |
| `progressBar` | Only if a countable program exists | `{ "enabled": true, "current": 14, "total": 26, "unit": "holes" }` |

---

## 3. `companyBrief` — AI Brief + Core Value Drivers
**Powers:** the "Explain [Company] in 60 Seconds" sheet, and the Core Value Drivers rail.

| Field | What goes in it |
|---|---|
| `shortSummary` | 2-3 sentence plain-English summary of the opportunity |
| `keyPoints[]` | **3-5 Core Value Drivers.** Each ≤10 words, concrete, fact-backed |
| `sections[]` | The six-part 60-second orientation (below) |

`keyPoints` example (Kingsmen):
```json
["Active 26-hole drill campaign underway",
 "Fully funded through 2026 — no near-term dilution",
 "Historic high-grade silver-gold district",
 "District-scale consolidated land package",
 "Multiple drill-ready discovery targets"]
```

`sections[]` — **exactly these six, in this order.** All prose (`v`) except Competitive
Advantages, which is `bullets`:
1. `What They Do` — what they actually explore/mine, where, at what stage
2. `How They Create Value` — the mechanism by which the business creates value
3. `Why It Matters` — the commodity/market context
4. `Competitive Advantages` — **3-5 `bullets`**, each a fact-backed edge
5. `Current Focus` — what management is doing right now
6. `What Success Looks Like` — what winning looks like over the coming years

```json
{ "k": "What They Do", "v": "Kingsmen Resources is a junior mineral exploration company focused on silver and gold in Mexico..." }
{ "k": "Competitive Advantages", "bullets": ["District-scale land in a Tier-1 Mexican silver belt", "..."] }
```

---

## 4. `capital` — Capital tab
**Rule:** the tiles are **key numbers, not sentences.** Copy figures exactly as disclosed.

| Field | What goes in it | Kingsmen example |
|---|---|---|
| `outstanding` | Common shares outstanding | `"34,523,086"` |
| `fd` | Fully diluted | `"44.9M"` |
| `options` / `warrants` | Counts | `"5,200,000"` |
| `cash` | Cash position | `"C$4.2M"` |
| `debt` | Total debt (`"C$0"` if none) | `"C$0"` |
| `marketCap` / `sharePrice` | As disclosed | `"C$18.5M"` / `"C$0.21"` |
| `ownership` | Insider/institutional split | `"≈24% insider"` |
| `state` | **One of exactly:** `Fully Funded`, `Recently Financed`, `Production Funded`, `Financing Expected`, `Capital Allocation Update`, `Strategic Acquisition Funding` | `"Fully Funded"` |
| `headline` | Capital-status headline — about **funding**, not a company blurb | `"Fully Funded Through 2026"` |
| `subtext` | One sentence backing it | `"The C$13M February bought deal fully funds the planned 2026 program."` |
| `financing` | Most recent raise | `"C$13.0M bought deal, February 2026"` |
| `financingDate` / `financingType` / `financingPrice` / `financingUse` | Split-out fields | `"February 2026"` / `"Bought Deal"` / `"C$0.90"` |

> `headline` must describe the **capital position** ("Fully Funded Through 2026"), never a general
> company description. That was a real defect on enCore.

---

## 5. `team` — Leadership
**Powers:** Team tab. Only real, named people with disclosed titles.

```json
{ "name": "Scott Emerson", "role": "President, CEO & Director",
  "short": "One line (≤120 chars) — prior companies, credentials",
  "full":  "2-4 sentence bio if the documents provide one" }
```

---

## 6. `timeline` — press releases
**Powers:** the Timeline tab and "read full release".

```json
{ "date": "2026-05-12",
  "headline": "Kingsmen Completes 60 km² Precision Drone Magnetic Survey",
  "whyItMatters": "One sentence on the investor significance",
  "keyNumbers": ["60 km² surveyed", "2.5 km corridor"],
  "fullText": "The complete verbatim release text" }
```
`date` must be `YYYY-MM-DD`. `fullText` can come from the bulk document upload rather than ChatGPT.

---

## 7. `projects[]` — the Projects tab
The richest section. Each project has identity fields, a **snapshot**, and a **content** object.

### 7a. Project identity
| Field | What goes in it | Kingsmen example |
|---|---|---|
| `key` | Short slug | `"las-coloradas"` |
| `name` | Project name | `"Las Coloradas"` |
| `tag` | One-line status | `"Active · 2026 Drill Program"` |
| `locationFull` | District, state, country | `"Parral District, Chihuahua, Mexico"` |
| `stageName` | Human stage label | `"Discovery-Stage Drilling"` |
| `stageIdx` | `0`=Explore `1`=Discovery `2`=Resource `3`=Studies `4`=Development `5`=Production | `1` |

### 7b. `snapshot` — the fundamentals grid (Pattern A)
Six cells. Fill every one the documents support. **Each needs `detail` + `note` or the tap-through
card is a one-liner.**

`location` · `commodity` · `ownership` · `landPackage` · `depositType` · `pastProducer`

Kingsmen example:
```json
"location": {
  "value": "Parral District",
  "value2": "Chihuahua, Mexico",
  "detail": [["Mining district","Parral District"], ["State / province","Chihuahua"],
             ["Country","Mexico"], ["Coordinates","≈27.05° N, 105.45° W"],
             ["Elevation","≈1,700 m"], ["Jurisdiction","Tier-1 silver belt"]],
  "note": "Chihuahua is one of the world's most established silver-mining jurisdictions, with deep operating history, infrastructure and skilled labour."
}
```

### 7c. `content` — the twelve detail blocks (Pattern B)
This is what makes project cards compelling. **All twelve.**

| Block | Powers | Shape |
|---|---|---|
| `brief` | "Understand this project in 60 seconds" | `overview, thesis, focus, opportunity, risks, different, means` |
| `location` | Location snapshot tap-through | `summary, table[8], closing` |
| `commodities` | Commodities tap-through | `summary, table[6], closing` |
| `land` | Land Position tap-through | `summary, table[8], closing` |
| `district` | **District Context** card | `summary, table[], closing` |
| `geology` | **Geological Model** card | `summary, table[7], closing` |
| `strategy` | **Exploration Strategy** card | `summary, program, objectives[], priority[], evidence[], future, closing` |
| `results` | **Exploration Results** card | `summary, intercepts[{hole,grade,width,note}], latest, pending, holes, metres, closing` |
| `targets` | Drill Targets | `summary, priority[{name,objective,status}], evidence[], closing` |
| `stage` | **Project Stage** card | `summary, current, program, activity, completed[], next, timing, closing` |
| `unique` | What sets this apart | `summary, diffs[{h,t,fact}], evidence[], takeaway` |
| `scenarios` | Bull / Bear / Next | `bull{text}, bear{text}, next{text}` |

Kingsmen `geology` example:
```json
"geology": {
  "summary": "Las Coloradas is a classic epithermal silver-gold vein system. Metal sits in northwest-trending structures that stay open at depth...",
  "table": [["Deposit Type","Low-sulphidation epithermal vein"],
            ["Host Rocks","Volcanic & sedimentary sequence"],
            ["Structural Controls","NW-trending Soledad & Soledad II veins"],
            ["Mineralization Style","High-grade Ag-Au veins with Pb-Zn-Cu credits"],
            ["Alteration","Quartz-calcite veining; felsic intrusive association"],
            ["Historic Production","ASARCO-era, shallow high-grade silver"],
            ["Historic Resource", null]],
  "closing": "The model explains why Kingsmen drills where it does: grade is controlled by structure, so testing flexures, intersections and depth extensions is the most direct route to a discovery."
}
```

`scenarios.bear` must state **real risk honestly** — a sanitized bear case is a defect:
```json
"bear": { "text": "Drilling fails to demonstrate continuity between mineralized zones, weakening the discovery thesis." }
```

---

## Hard rules for generation

1. **Extract only from the supplied documents.** This is a public profile for a regulated issuer —
   a fabricated share count, grade, or executive is a serious harm. Missing → `null`.
2. **Copy numbers exactly** (commas, units, currency). Use the most recent disclosed figure.
3. **Fill `detail` and `note` on every snapshot cell**, and `summary`/`table`/`closing` on every
   content block. A single-line answer is the #1 cause of a thin profile.
4. **Factual, never promotional.** Write like an analyst.
5. **Output valid JSON only** — exact field names, no extra keys, no commentary.
6. List anything you could not fill in a trailing `notFound[]` array.
