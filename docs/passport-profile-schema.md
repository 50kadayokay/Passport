# Passport Company Profile — Content Schema (for ChatGPT)

This describes the single `profile` JSON object that powers a company's profile in the Passport app.
Give this to ChatGPT along with the company's source material (press releases, website, corporate deck,
financials) and ask it to return **one JSON object** matching this shape.

## How the app uses it
Each top-level key below drives a specific **page or card** in the app. If a field is empty or missing,
the app **hides** that piece cleanly — so it's always better to omit a field than to invent/guess a value.
Never fabricate numbers, grades, dates, or quotes; only use what the source material supports.

## Global rules
- Output **valid JSON only** (no comments, no trailing commas).
- **Dates** are always `"YYYY-MM-DD"`.
- **Money/quantities** are strings written the way an investor reads them: `"C$30 million"`, `"289,837,502"`, `"1,742 g/t AgEq"`.
- **Images** are URL strings (or left empty). Do not invent image URLs — the operator adds photos in the editor.
- Keep prose **plain-language and factual**. Short where noted. No hype, no adjectives you can't source.
- `enabled: false` on a team member or project hides it. Omit the field (or use `true`) to show it.

---

# 1. `company` — Identity (hero + header, every page)

```json
"company": {
  "name": "Argenta Silver Corp.",
  "slogan": "A Pure Silver Company",              // short tagline under the name
  "ticker": "AGAG",                                // primary ticker (display)
  "commodity": "Silver",                           // primary metal
  "jurisdiction": "Salta Province, Argentina",     // where the flagship is
  "website": "https://argentasilver.com",
  "stage": "exploration",                          // exploration | development | production …
  "location": "Salta Province, Argentina",         // headline location (basic-listing card)
  "listings": [                                    // all exchange listings → ticker widgets
    { "ex": "TSXV", "sym": "AGAG" },
    { "ex": "OTCQX", "sym": "AGAGF" },
    { "ex": "FRA", "sym": "T1K" }
  ]
}
```
Notes: `ex` should contain the recognizable exchange code (TSXV, TSX, CSE, OTCQX, NASDAQ, NYSE, FSE/FRA, LSE, ASX) — the app derives the currency and the live-quote link from it.

# 2. `brand` — Branding & imagery (URLs, usually filled by the operator, not ChatGPT)

```json
"brand": {
  "color": "#10b981",     // accent colour that themes the profile
  "logo": "…",            // square logo
  "avatar": "…",          // circular profile icon (Explore + header)
  "hero": "…",            // large hero/status-card photograph
  "statusLogo": "…"       // transparent logo that fades in over the hero
}
```
ChatGPT can leave these empty; the operator uploads images. Only include a `color` if the brand colour is known.

# 3. `companyStatus` — Status card (top of Overview) — "What's happening right now"

```json
"companyStatus": {
  "statusHeadline": "25,000 m Drill Program",                 // the single biggest thing happening now
  "statusHeadlineSubtext": "Resource expansion and discovery drilling is active across El Quevar.",  // one supporting sentence
  "latestUpdate": "~22,000 m drilled, with ~40% of assays pending.",   // most recent concrete update
  "investmentImpact": "Each result can expand the known silver system.", // why it matters to an investor (1 line)
  "nextCatalyst": "Pending Drill Assays",                     // the next thing investors are waiting for
  "expected": "Q3 2026",                                      // when (app prefixes "Expected")
  "progressBar": {                                            // optional numeric progress (e.g. holes drilled)
    "enabled": true, "current": 14, "total": 26, "unit": "holes"
  }
}
```
Keep everything here **short**. This is the opening argument, not a report.

# 4. `companyBrief` — 60-second AI Brief + Investment Thesis

```json
"companyBrief": {
  "shortSummary": "Argenta is advancing a high-grade silver district in Salta, Argentina …",  // 1–2 sentence plain summary
  "keyPoints": [                                             // the investment thesis — punchy, factual bullets
    "~22,000 m drilled since May 2025",
    "More than 20 targets defined",
    "Yaxtché footprint expanded by ~20%",
    "C$30 million treasury reported"
  ],
  "sections": [                                              // the deeper "60-second brief" (each = one card)
    { "k": "How They Create Value", "v": "As an explorer, the company creates value by …" },
    { "k": "Why It Matters", "v": "Silver sits where monetary demand meets industrial growth …" },
    { "k": "Current Focus", "v": "Management is drilling …" },
    { "k": "What Success Looks Like", "v": "Proving continuity and grade, converting drilling into a maiden resource …" }
  ]
}
```
`sections[].v` can instead be `"bullets": ["…","…"]` for a bulleted card. `keyPoints` should be self-contained facts (they're shown as the standalone thesis).

# 5. `ceoNote` — Optional CEO voice (near top of profile)

```json
"ceoNote": { "text": "A short, human note from the person running the company.", "name": "Joaquín Marias", "title": "President & CEO", "photo": "" }
```
Only include if you have a real quote/message. Empty `text` hides the card.

# 6. `contact` — Contact links (footer)

```json
"contact": { "phone": "+1 604 555 0100", "email": "ir@argentasilver.com", "twitter": "argentasilver", "linkedin": "company/argenta-silver" }
```

# 7. `capital` — Capital page (financial strength)

```json
"capital": {
  "marketCap": "C$45 million",
  "sharePrice": "C$1.57",
  "cash": "C$30 million",
  "workingCapital": "C$28 million",     // its OWN figure — do not copy cash
  "debt": "$0",
  "outstanding": "289,837,502",         // basic shares
  "fd": "340,310,327",                  // fully diluted
  "options": "18,500,000",
  "warrants": "32,000,000",
  "reportingDate": "As at March 31, 2026",   // balance-sheet provenance
  "latestFiling": "Q1 2026 MD&A",

  "financing": "C$23,000,000",          // most recent raise — AMOUNT ONLY
  "financingType": "Bought Deal LIFE",
  "financingDate": "January 2026",
  "financingPrice": "C$1.20",
  "financingUse": "Exploration and drilling at El Quevar",

  "ownership": "~15% institutional · ~13% high net worth · ~10% Frank Giustra · ~2% management · ~50% retail",

  "headline": "Fully funded through 2026",   // optional capital-status card
  "subtext": "The current treasury funds the active program without further dilution."
}
```
Notes: `financing` must be **just the amount** (the app shows type/date separately). `ownership` written as `"NN% label"` items separated by ` · ` renders as a segmented ownership bar on the iPad view.

# 8. `team` — Leadership page

```json
"team": [
  {
    "name": "Joaquín Marias",
    "role": "President, CEO & Director",
    "short": "Argentine geologist with 15+ years in precious-metals exploration.",   // one-line bio (cards)
    "full": "Marias has more than 15 years of international precious-metals experience. He previously advised …",  // full bio (feature)
    "photo": "",
    "linkedin": "in/joaquin-marias"
  }
]
```
List the CEO **first** (the app features member #1 as a large profile). `short` = card line, `full` = expanded bio.

# 9. `timeline` — Timeline page (the company's news history)

Array of releases/milestones, one per material date.

```json
"timeline": [
  {
    "date": "2026-07-06",                                   // YYYY-MM-DD (drives ordering + quarter grouping)
    "headline": "Wide High-Grade Silver Hit 120m Beyond Yaxtché",   // short plain-language title (timeline card)
    "originalTitle": "Argenta Intersects 482 g/t Ag over 12m …",     // the verbatim press-release headline
    "whatHappened": "Drilling returned a wide, high-grade silver interval well outside the current resource.",  // real description
    "whyItMatters": "It extends high-grade silver beyond the resource model and defines a new expansion area.", // investor takeaway
    "whatHappensNext": "Assays for step-out holes are pending.",     // ONLY if the company disclosed a next step
    "keyNumbers": ["482 g/t Ag over 12 m", "120 m beyond the resource"],  // headline numbers (bullets)
    "key": true,                                             // true = a KEY milestone (shown in the curated view)
    "fullText": "The full formatted press-release text, if available.",   // enables "Read Full Release"
    "fullImages": []                                        // optional screenshot URLs of the release
  }
]
```
Set `key: true` on genuine milestones (discovery holes, financings closed, resource updates, major appointments) — not routine updates. Everything is optional except `date` and a `headline`.

# 10. `projects` — Projects page (the emotional centre)

Array of projects. Anything not supported by sources should be **omitted** — each block hides independently.

```json
"projects": [
  {
    "key": "el-quevar",
    "name": "El Quevar",
    "locationFull": "Salta Province, Argentina",
    "tag": "Flagship",                    // small status label
    "stageName": "Resource Expansion",
    "stageIdx": 3,                        // 0..5 position on the lifecycle bar (see stages below)
    "gallery": ["https://…jpg"],          // project photos (URLs)

    "snapshot": {                          // the fundamentals grid — use ONLY these six keys
      "location":    { "value": "Salta Province", "value2": "Northwestern Argentina",
                        "detail": [["Country","Argentina"],["Nearest Community","Pocitos"],["Elevation","~4,000–5,000 m"]],
                        "note": "Existing road access and an established camp reduce infrastructure needs." },
      "commodity":   { "value": "Silver", "value2": "Gold · Copper locally",
                        "detail": [["Indicated Grade","482 g/t Ag"],["Inferred Grade","417 g/t Ag"]], "note": "" },
      "ownership":   { "value": "100% Owned",
                        "detail": [["Operating Company","Silex Argentina S.A."],["Interest","100%"]], "note": "" },
      "landPackage": { "value": "31 Concessions", "value2": "56,706 ha",
                        "detail": [["Total Area","~56,706 hectares"],["Resource Footprint","<1% of the property"]], "note": "" },
      "depositType": { "value": "Epithermal Silver", "value2": "High to intermediate sulphidation",
                        "detail": [["Deposit Model","High-sulphidation epithermal"],["Host Rocks","Dacite domes"]], "note": "" },
      "pastProducer":{ "value": "No", "detail": [], "note": "" }
    },

    "district": {                          // "District Context" card (regional setting)
      "body": "El Quevar lies in the Andean Central Volcanic Zone within the Quevar volcanic complex …",
      "points": [ { "k": "Belt/Trend", "v": "Central Volcanic Zone" }, { "k": "Land Consolidation", "v": "31 concessions" } ]
    },
    "geology": {                           // "Geology" card
      "body": "Silver is concentrated where volcanic rocks were fractured, altered and brecciated …",
      "points": [ { "k": "Structural Controls", "v": "NW–SE and NE–SW faults" }, { "k": "Mineralization", "v": "Silver-rich sulphides" } ]
    },
    "explorationHistory": {                // "Exploration History" card
      "timeline": [ { "era": "2010–2015", "v": "Prior operator drilled the Yaxtché zone …" },
                    { "era": "2025–present", "v": "Argenta acquired the project and began district drilling." } ]
    },
    "drillResults": {                      // "Best Drill Results" card (omit if pre-drill)
      "rows": [
        { "hole": "QDH-25-041", "grade": "482 g/t Ag over 12.0 m", "interval": "From 118.0 m", "note": "Includes 1,742 g/t Ag over 1.5 m." }
      ]
    },

    "brief": {                             // 60-second project brief (tap-through sheet)
      "overview": "…", "thesis": "…", "focus": "…", "different": "…", "risks": "…", "means": "…"
    },
    "unique": {                            // what makes it different
      "summary": "…", "diffs": [ { "h": "Grade already proven", "t": "Built on past-producing structures." } ],
      "evidence": ["Bonanza-grade discovery hole already in hand"], "takeaway": "…"
    },
    "targets": {                           // exploration targets
      "summary": "…", "priority": [ { "name": "Quevar North", "why": "Untested strike extension." } ],
      "evidence": ["…"], "closing": "…"
    },
    "scenarios": { "bull": { "text": "…" }, "bear": { "text": "…" }, "next": { "text": "…" } },
    "stage": {                             // current-stage detail (tap-through)
      "current": "Resource Expansion", "summary": "…", "program": "25,000 m drill program",
      "activity": "Drilling + assays", "completed": ["Yaxtché resource defined"], "closing": "…"
    }
  }
]
```

**Snapshot keys are fixed** — only `location`, `commodity`, `ownership`, `landPackage`, `depositType`, `pastProducer` render; any other key is ignored. Each = `{ value, value2, detail: [[label,val],…], note }`.
**Card blocks** use `points: [{k,v}]`, history uses `[{era,v}]`, drill rows use `[{hole,grade,interval,note}]`.
Omit `drillResults` entirely for a pre-drill project — the app shows an honest "no drill results disclosed yet."

### Lifecycle stages (for `stageIdx` 0–5)
`0 Acquisition · 1 Validation · 2 Target Gen · 3 Drilling · 4 Discovery · 5 Production`

# 11. `tier` — Basic listing (optional)

```json
"tier": "listing"
```
`"listing"` = the app renders the **compact single-page basic profile** (hero, logo, status card, short brief) instead of the full tabbed profile. Omit (or `""`) for a full profile.

---

# Minimal skeleton (copy this and fill in)

```json
{
  "company":       { "name": "", "slogan": "", "ticker": "", "commodity": "", "jurisdiction": "", "website": "", "stage": "", "location": "", "listings": [ { "ex": "", "sym": "" } ] },
  "companyStatus": { "statusHeadline": "", "statusHeadlineSubtext": "", "latestUpdate": "", "investmentImpact": "", "nextCatalyst": "", "expected": "", "progressBar": { "enabled": false, "current": 0, "total": 0, "unit": "" } },
  "companyBrief":  { "shortSummary": "", "keyPoints": [], "sections": [ { "k": "", "v": "" } ] },
  "ceoNote":       { "text": "", "name": "", "title": "", "photo": "" },
  "contact":       { "phone": "", "email": "", "twitter": "", "linkedin": "" },
  "capital":       { "marketCap": "", "sharePrice": "", "cash": "", "workingCapital": "", "debt": "", "outstanding": "", "fd": "", "options": "", "warrants": "", "reportingDate": "", "latestFiling": "", "financing": "", "financingType": "", "financingDate": "", "financingPrice": "", "financingUse": "", "ownership": "", "headline": "", "subtext": "" },
  "team":          [ { "name": "", "role": "", "short": "", "full": "", "photo": "", "linkedin": "" } ],
  "timeline":      [ { "date": "", "headline": "", "originalTitle": "", "whatHappened": "", "whyItMatters": "", "whatHappensNext": "", "keyNumbers": [], "key": false, "fullText": "", "fullImages": [] } ],
  "projects":      [ { "key": "", "name": "", "locationFull": "", "tag": "", "stageName": "", "stageIdx": 0, "gallery": [],
      "snapshot": { "location": { "value": "", "value2": "", "detail": [], "note": "" }, "commodity": { "value": "", "detail": [], "note": "" }, "ownership": { "value": "", "detail": [], "note": "" }, "landPackage": { "value": "", "detail": [], "note": "" }, "depositType": { "value": "", "detail": [], "note": "" }, "pastProducer": { "value": "", "detail": [], "note": "" } },
      "district": { "body": "", "points": [] }, "geology": { "body": "", "points": [] },
      "explorationHistory": { "timeline": [] }, "drillResults": { "rows": [] },
      "brief": { "overview": "", "thesis": "", "focus": "", "different": "", "risks": "", "means": "" },
      "unique": { "summary": "", "diffs": [], "evidence": [], "takeaway": "" },
      "targets": { "summary": "", "priority": [], "evidence": [], "closing": "" },
      "scenarios": { "bull": { "text": "" }, "bear": { "text": "" }, "next": { "text": "" } },
      "stage": { "current": "", "summary": "", "program": "", "activity": "", "completed": [], "closing": "" } } ],
  "brand":         { "color": "", "logo": "", "avatar": "", "hero": "", "statusLogo": "" },
  "tier": ""
}
```
