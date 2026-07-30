# Passport — Master Company Schema

**What this is.** The single structured knowledge record extracted from a company's documents.
Every surface — the Passport app, the conference booth, and later the website / emails / AI chat —
**selects its subset** from this one record. Extract once; nothing re-reads the PDFs; nothing drifts.

```
Documents ─► ONE extraction ─► MASTER company JSON ─► app · conference · (web · chat · …) selectors
```

**Design rules**
1. **Backward-compatible.** The existing app fields keep their exact names/shapes (see
   `PASSPORT_SCHEMA.md`) so `mapProfileToPP` and the locked app-profile prompt keep working. The
   master only **adds** sections around them.
2. **Milestones are single-source & verbatim.** `timeline[]` is the one place milestone text lives.
   Every surface reuses those exact strings; the conference only *chooses which to feature*, never
   re-words them.
3. **Values stay clean; citations live in one indexed block.** Facts are plain values (easy for
   selectors); proof lives in `citations` (your evidence audit, now machine-usable).
4. **Wide frame, narrow fill.** Populate app + conference + citations + a few compare metrics now.
   Heavy domains (esg, governance, financialsDetail, web, deck) are **reserved** — empty until a
   surface needs them, so adding one later is a fill, never a reshape.
5. **Missing data adapts, never blanks.** Every field is optional. If the docs don't disclose it
   (e.g. metallurgy for an early explorer), it is `null` + logged in `meta.notFound` — never
   invented. Selectors render only what's present, so a section reshapes to the evidence a company
   actually has (explorer's Results = drill grade + core; developer's = economics + recovery). No
   empty slots, no fabrication.

Each block below is tagged `[consumers]` so you can see who reads it and build selectors against it.

---

## Top-level shape

```jsonc
{
  "meta":          { archetype, asOfDate, confidence, reviewRequired, notFound },  // [all]

  // ── EXISTING (unchanged — documented in PASSPORT_SCHEMA.md) ─────────────────
  "company":       { … },   // identity                         [app, conference, compare, chat]
  "companyStatus": { … },   // the "now" status card            [app, conference]
  "companyBrief":  { … },   // 60-sec brief + value drivers     [app, conference, chat]
  "capital":       { … },   // financials                       [app, conference, compare]
  "team":          [ … ],   // leadership + bios                [app, conference]
  "timeline":      [ … ],   // ★ SHARED VERBATIM milestones     [app, conference, chat]
  "projects":      [ … ],   // rich per-project (snapshot+content) [app, conference, chat]

  // ── NEW — populated now ────────────────────────────────────────────────────
  "catalysts":     [ … ],   // upcoming value events            [app, conference, alerts-reserved]
  "conference":    { … },   // editorial framing + booth config [conference]
  "compare":       { … },   // normalized, cross-company metrics [compare, app-explore]
  "media":         { … },   // asset inventory                  [conference, web, app]
  "citations":     { … },   // path → source (the evidence audit as data)  [chat, fact-check]

  // ── RESERVED — frame only, null until that surface is built ─────────────────
  "esg":            null,   // permitting, environment, community        [web, compliance]
  "governance":     null,   // board, committees, compensation           [web, deck]
  "financialsDetail": null, // full cap table, warrants schedule, burn   [deck, modeling]
  "web":            null,   // long-form pages, FAQs, SEO copy           [website]
  "deck":           null    // use-of-proceeds, comps, pitch arc         [investor deck]
}
```

Projects also gain stage-adaptive technical blocks (below). Everything else in `company*`,
`capital`, `team`, `timeline`, and `projects[].snapshot/content` is exactly today's schema.

---

## NEW sections (the part to proofread)

### `conference` — editorial framing + booth config  `[conference]`
The booth-specific *reframing* of knowledge that already lives elsewhere in the record. It stores
**no facts of its own** except the market/editorial lines — it points at the shared data.

```jsonc
"conference": {
  "hook": "",                 // the ONE thing (≤ 8 words) — synthesized from companyBrief
  "whyNow": "",               // the current catalyst / timing
  "macroContext": "",         // commodity/market backdrop (the only genuinely new prose)
  "differentiators": ["…"],   // 2–4 edges (from companyBrief.competitiveAdvantages)
  "highlights": [ { "value": "", "label": "", "note": null } ],   // 4–6 curated featured numbers
  "featuredMilestoneDates": ["YYYY-MM-DD"],  // WHICH timeline entries to feature — text reused verbatim
  "featuredProjectKey": "",   // which project leads
  "investmentCase": [ { "reason": "", "evidence": "", "standsOutBecause": "" } ],  // Section 8 — UNBOUNDED; as many as the docs genuinely support
  "style": "scene", "enabled": false, "heroVideo": null, "boothQrUtm": null, "kioskIdleTimeout": 45
}
```
> `highlights` values are **copied verbatim** from `capital` / `projects` / `companyStatus` — the
> conference selects and labels them, it doesn't mint new numbers. `featuredMilestoneDates` is how
> rule 2 is enforced: the booth references milestones by date, so their wording is always the app's.

### `projects[].{resource,economics,production,royalty}` — stage-adaptive technical  `[app-future, conference, compare, chat]`
Additive to the existing `projects[].content` (which already holds geology, drill `results`
+ intercepts, strategy, targets, stage, unique, scenarios). Fill the block(s) the docs support:

```jsonc
"resource":   { "category": "", "tonnes": "", "grade": "", "containedMetal": "", "cutoff": "" },
"economics":  { "studyType": "PEA|PFS|FS", "npv": "", "irr": "", "capex": "", "payback": "", "mineLife": "", "aisc": "" },
"production": { "annualOutput": "", "aisc": "", "freeCashFlow": "", "reserveLife": "" },
"royalty":    { "assets": [ { "name": "", "type": "NSR|stream", "rate": "", "operator": "", "status": "" } ] },
"metallurgy": { "recovery": "", "method": "", "testwork": "" },     // dev/producer — null for early explorers
"infrastructure": { "power": "", "road": "", "water": "", "port": "", "notes": "" }
```
> This is what fills the "some, not all" gap — economics/production/royalty/metallurgy/infrastructure
> are fields the app schema never asked for. Explorers leave them null; developers/producers/royalty
> cos fill what applies. A `null` block just doesn't render (design rule 5).

### `compare` — normalized cross-company metrics  `[compare, app-explore]`
Cheap to capture, powers screening/peer views and the app's Explore filters. Normalized so
companies are actually comparable.

```jsonc
"compare": {
  "stageIndex": 0,                     // 0 Explore … 5 Production
  "primaryCommodity": "", "commodities": ["…"],
  "marketCapValue": "", "marketCapCurrency": "", "marketCapTier": "nano|micro|small|mid",
  "jurisdiction": "", "jurisdictionRisk": "low|moderate|high",   // qualitative, Fraser-style
  "flagshipGradeAgEq": "",             // headline grade normalized to AgEq/AuEq if applicable
  "resourceOz": null, "resourceCategory": "",
  "enterpriseValue": null, "evPerResourceOz": null,
  "fundedStatus": ""                   // mirrors capital.state
}
```

### `media` — asset inventory  `[conference, web, app]`
What imagery/video exists (URLs if on file, else a description so a human knows what to source).

```jsonc
"media": { "heroVideo": null, "heroPhoto": null,
  "projectAerials": ["…"], "corePhotos": ["…"], "crossSections": ["…"], "maps": ["…"], "headshots": ["…"], "other": ["…"] }
```

### `citations` — the evidence audit, as data  `[chat, fact-check]`
Your evidence audit, keyed by field path instead of a prose table — so the AI chat can ground
answers and the fact-check tool can verify without re-parsing. Populate for the **material** figures
(grades, capital, resource, production), not every field.

```jsonc
"citations": {
  "capital.cash": { "value": "C$30.0M", "quote": "…cash of C$30.0 million…", "doc": "MD&A Q1 2025", "date": "2025-05-14", "verification": "QUOTED" },
  "projects.el-farol.content.results.headlineIntercept": { "value": "641 g/t AgEq / 1.4 m", "quote": "…returned 641 g/t AgEq over 1.4 m…", "doc": "NR 2025-03-12", "date": "2025-03-12", "verification": "QUOTED" }
}
```
> `verification` reuses your existing vocabulary: `QUOTED | DERIVED | SYNTHESIZED | SELECTED | MISSING`.

### `catalysts` — upcoming value events  `[app, conference, alerts-reserved]`
Powers Section 5's forward half (the past half is `timeline[]`, verbatim). Structured so alerts can
use it later.
```jsonc
"catalysts": [ { "label": "", "timing": "", "type": "assay|resource|study|permit|construction|production|financing", "impact": "" } ]
```

### Small additions to existing blocks  `[shared]`
Additive only — the existing fields stay for back-compat, these sit alongside:
- **`capital.ownershipSplit`** — `[ { "group": "insider|institutional|retail", "pct": "" } ]` (Section 6 wants insider vs institutional separately; the existing `capital.ownership` string is kept).
- **`team[].trackRecord`** — `""` one-line career highlight: discoveries / mines built / capital raised (Section 7 leads with this, not the full bio; `short`/`full` stay).

---

## How it gets filled (extraction, going forward)

Same multi-pass model you already use, one pass added:

- **Pass 1 Company** · **Pass 2 Projects** · **Pass 3 Timeline** — as today (unchanged).
- **Pass 4 — Featured & compare (NEW):** fills `conference`, `compare`, `media`, the
  stage-adaptive `resource/economics/production/royalty`, and `citations` — reusing the passes
  above (milestones verbatim), touching docs only for genuine gaps.

**Existing companies (Argenta):** no re-onboarding — run **Pass 4 as a top-up** against the stored
profile + docs; it reuses what's banked and fills only the new sections.

---

## Coverage across junior archetypes

| Archetype | Covered by |
|---|---|
| **Explorer** (most common) | existing `projects[].content` (geology, drill results, targets) + `conference` |
| **Developer** (PEA/PFS/FS) | `projects[].economics` + `resource` |
| **Producer** (small) | `projects[].production` + `resource` |
| **Royalty / streaming** | `projects[].royalty` |
| **Prospect generator / JV** | per-project `ownership` + `royalty.assets` (partner/operator) |
| **Diversified / polymetallic** | multi-`projects[]` array + `commodities[]` |

The reserved sections (`esg`, `governance`, `financialsDetail`) absorb anything a specific mandate
demands later — filled when the surface that needs them is built.
