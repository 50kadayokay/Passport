# 01 — Company Status Card

| | |
|---|---|
| **Surface** | Overview tab (top card) |
| **Specced** | ✅ |
| **Bound to fields** | ✅ |
| **Renders today** | ⚠️ Partial — 1 of 3 progress renderers exists |

---

## Purpose

**Investor question:** *What is the company doing right now, and why does it matter?*

Not a news card. Not a timeline. It presents the company's **single highest-priority
operational initiative** so an investor understands the current focus in seconds.

---

## Editorial standard (global)

Built for mobile. **Brevity is a UI requirement, not a style preference.** Write to the
Kingsmen reference length — the maximum is a safety limit, never a target.

| Field | Target | Max |
|---|---|---|
| Primary Headline | ~22 chars | 30 |
| Supporting Summary | ~63 chars | 100 |
| Latest Update | ~38 chars | 90 |
| Investment Impact | ~41 chars | 90 |
| Next Catalyst | ~14 chars | 25 |
| Expected | ~7 chars | 20 |

### Compression rules
Before finalizing any visible text, remove:
- The company name, unless required for clarity
- The project name, if the headline already identifies it
- Dates, document names, parenthetical references
- Filler — "the company announced", "management stated", "it is expected that",
  "as previously disclosed"

Keep only the single most material fact. Do not combine multiple developments into one
sentence. Do not repeat information shown elsewhere on the card.

❌ `BLM authorized infrastructure construction at Dewey Burdock following NRC's issuance of the 20-year operating license and positive Environmental Assessment (June 18–22, 2026).`
✅ `BLM authorized construction at Dewey Burdock.`

---

## What it displays (layout order)

1. Status Label
2. Primary Headline
3. Supporting Summary
4. Initiative Image
5. Progress Display
6. Latest Update
7. Investment Impact
8. Next Catalyst
9. Expected Timing

---

## Content rules

### Status Label
Static. Identifies the widget as the company's current operational focus. Never changes by
company type.

### Primary Headline
Name the highest-priority operational initiative.
- 2–6 words · noun phrase only · no marketing language · no dates · no company names
- ✅ `26-Hole Drill Campaign` · `Mine Construction` · `Permit Review` · `Production Ramp-Up`
- ❌ `Kingsmen Continues Drilling` · `Exciting Company Update` · `Major News Release`

### Supporting Summary
Describe the initiative's current operational state. One sentence. State only the current
activity, location (if useful), and present stage. **Do not explain why it matters** — that
is the Investment Impact field.
- ✅ `Phase 1 drilling is underway at Las Coloradas.`
- ❌ `Kingsmen continues advancing its flagship project toward creating shareholder value.`

### Image
Most representative operational image, in priority order:
site activity → drill program → construction → mine infrastructure → property → project map.
**Never:** CEO photos, conference photos, logos, marketing graphics.

### Progress Display
**Never fabricate progress.** Choose exactly one renderer:

| Renderer | When | Examples |
|---|---|---|
| **Quantitative** | Company discloses measurable completion | `14 / 26 holes` · `5 / 12 wells` · `18 / 40 permits` |
| **Stage** | No measurable completion exists | Explorer: `Exploration → Drilling → Assays`<br>Developer: `PEA → PFS → FS → Permitting`<br>Producer: `Construction → Commissioning → Production` |
| **Milestone Waiting** | Work complete, awaiting a defined event | `Awaiting Assays` · `Awaiting Permit` · `Awaiting Court Approval` |

Stage renderer displays **no percentage**.

### Latest Update
Newest material development affecting **this initiative**. One fact, one sentence. No dates,
no company name, no combining updates.
- ✅ `Three holes submitted for assay.` · `BLM authorized construction.`
- ❌ `Three holes submitted for assay and additional mapping was completed.`
- ❌ `The company announced...`

### Investment Impact
Why the initiative matters — operational or strategic significance. One sentence. No
promotional language. **Never reference share price or valuation.**
- ✅ `Could expand the high-grade silver system.` · `Required before construction can begin.`
- ❌ `Very positive for shareholders.` · `Represents an exciting opportunity.`

### Next Catalyst
The next material event investors should expect. 2–4 words, noun phrase, no dates, no
explanations.
- ✅ `Phase 1 Assays` · `Permit Decision` · `Resource Estimate` · `First Production`
- ❌ `Management expects assays sometime in Q3.` · `Beaver Creek Conference`

### Expected
Only company guidance. Accept `Q3 2026`, `H2 2026`, `Late 2026`, `Mid-2027`.
**Never estimate or infer timing.**

When no timing is disclosed → leave the field **empty (null)**.

> **Structural note (Claude):** the four boxes are a fixed 2×2 grid — the `EXPECTED`
> label renders unconditionally, so an empty value leaves an orphaned label with `—`
> under it. Resolution: when `expected` is empty, **Next Catalyst spans the full width
> and the Expected cell is dropped**. Achieves the clean result without a stray label.
> See build flags.

---

## Selection logic

### Step 0 — Declare the archetype (before ranking anything)

The extraction must explicitly declare the company's **dominant archetype**:

`Explorer` · `Developer` · `Producer` · `Royalty Company` · `Prospect Generator` ·
`Pending Transaction`

If the company spans several, name the dominant one and note the secondary. **The declared
archetype determines which initiative hierarchy and which progress model apply.**

### Step 1 — Identify every active operational initiative, then rank:

1. Active drilling, construction, or production
2. Permitting or regulatory milestones
3. Economic studies (PEA, PFS, FS)
4. Resource estimate programs
5. Financing directly enabling project advancement
6. Material acquisitions or mergers
7. Production optimization or expansion
8. Awaiting material results (assays, permits, transaction close)

**Recency is only a tie-breaker.**

### Exclusions — never populate this card from:
Conference attendance · investor presentations · marketing campaigns · website launches ·
IR agreements · option or RSU grants · AGM results · routine financial filings · analyst
coverage · social media posts · branding updates · historical achievements · repeat
announcements without operational change

---

## Archetype variants

| Archetype | Primary focus |
|---|---|
| Explorer | Drilling, assays, discoveries |
| Developer | Studies, permitting, construction |
| Producer | Production, expansions, optimization |
| Royalty | Portfolio growth, royalty-generating assets |
| Prospect Generator | Partner-funded exploration, earn-in milestones |
| Pending Transaction | Acquisition, merger, arrangement, court approval |

---

## Missing-data behavior

If no active operational initiative exists → display the most material **pending**
operational milestone.

If none exists:
- Headline: `Corporate Maintenance`
- Summary: `No material operational initiative has been disclosed.`
- Latest Update: the latest material corporate development

---

## Extraction metadata

Inherited from the profile level. **Never displayed on the card** — it exists for freshness,
auditability, and quality control.

- **As-of date** — the most recent company disclosure reviewed when producing the card
- **Overall confidence** — High / Medium / Low
- **Review required** — Yes / No, set when disclosure conflicts, is ambiguous, or document
  coverage was incomplete

---

## ⚙️ BINDING NOTES (Claude — maps spec to real app fields)

All values live under `profile.companyStatus`.

| Spec element | Real field | Notes |
|---|---|---|
| Status Label | *(none)* | Static UI text — not data |
| Primary Headline | `statusHeadline` | Renders as the large headline |
| Supporting Summary | `statusHeadlineSubtext` | Renders under the headline |
| Initiative Image | *(not in JSON)* | Uploaded separately → `STATUS_IMG` |
| Progress Display | `progressBar` | **Needs extension — see build flags** |
| Latest Update | `latestUpdate` | 2×2 grid, top-left |
| Investment Impact | `investmentImpact` | 2×2 grid, top-right |
| Next Catalyst | `nextCatalyst` | 2×2 grid, bottom-left |
| Expected | `expected` | 2×2 grid, bottom-right |

Field names are **camelCase** and are a hard contract with the code. ChatGPT must never
emit its own names.

---

## 🔨 BUILD FLAGS

| Item | Status |
|---|---|
| **Quantitative progress** | ✅ Exists — `progressDone` / `progressTotal` / `progressLabel` |
| **Stage progress** | ❌ **Needs building** |
| **Milestone Waiting** | ❌ **Needs building** |
| **Next Catalyst full-width span** when `expected` is empty | ❌ **Needs building** (small) |

Current fallback (already shipped): when no real count exists the progress bar **hides
entirely** rather than showing a fake 0%. So a royalty or permit-pending company gets a
clean card today — just not yet differentiated.

---

## 📋 OPEN ITEMS

**Resolved**
- ✅ Source traceability → handled globally by the audit block (document + date + quote)
- ✅ As-of date → added to extraction metadata
- ✅ Confidence + review-required → added to extraction metadata
- ✅ Archetype declaration → added as Step 0 of selection logic
- ✅ `Expected` empty-state → resolved via full-width span

**Still open** (only needed when the stage renderer is built)
1. **Closed stage vocabularies** — the stage sets are still examples, not fixed lists, and
   there are none for Royalty / Prospect Generator / Pending Transaction.
2. **Evidence rules for claiming a stage** — what must be disclosed to claim each stage.
   This is what mis-classified a producing company as earliest-stage exploration.
