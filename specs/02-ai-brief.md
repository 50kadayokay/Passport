# 02 — AI Brief (60-Second Company Orientation)

| | |
|---|---|
| **Surface** | Overview tab → "Explain [Company] in 60 Seconds" card → bottom sheet |
| **Specced** | ✅ |
| **Bound to fields** | ✅ |
| **Renders today** | ✅ Fully — no build required |

---

## Purpose

**Investor question:** *If I had one minute with an analyst, how would they explain this company?*

Orientation, **not news**. It explains the business model, operating strategy, investment
context, competitive strengths, current execution, and long-term objective in plain language —
enough that a first-time investor can understand every other page in the profile.

**Intentionally timeless.** It should remain accurate even if no press release is issued for
several months. It must not replace the Status, Projects, Timeline, or Capital pages.

---

## Editorial standard

This is a **detail sheet, not a card face** — richness is required. Each section must contain
enough evidence to educate a new investor while staying concise and non-repetitive.

**Format:** prose sections of **2–3 sentences** each, except *Competitive Advantages*, which
is structured bullets.

**Total budget: ~350 words.** The card promises "60 Seconds" — Kingsmen's reference runs
~330 words (~90 seconds of reading). Going much beyond breaks the promise.

Avoid promotional language. Avoid repeating detail that belongs on other pages.

---

## The six sections (fixed vocabulary, fixed order)

1. **What They Do**
2. **How They Create Value**
3. **Why It Matters**
4. **Competitive Advantages** ← bullets
5. **Current Focus**
6. **What Success Looks Like**

> These titles are **rendered as the section headers** and are pinned. They must be identical
> across every company or profiles stop being comparable. See binding notes.

---

## Content rules per section

### What They Do
*What business is this company in?* — 2–3 sentences covering company type, principal
commodity, primary jurisdiction, core business model.
Do **not** discuss current drilling, financing, recent news, or catalysts.

- ✅ `Kingsmen Resources is a junior exploration company focused on silver and gold projects in Mexico. The company acquires and explores historic mineral districts using modern exploration techniques.`
- ❌ `Kingsmen recently announced a 26-hole drill campaign.`

### How They Create Value
*What is management's disclosed strategy?* — 2–3 sentences describing the stated operating
strategy. Describe the approach; never predict success or imply value creation is guaranteed.
Do not discuss current operational progress.

Archetype strategy shapes:
| Archetype | Value model |
|---|---|
| Explorer | Acquire → Explore → Discover → Define Resource |
| Developer | Study → Permit → Build → Produce |
| Producer | Operate → Expand → Optimize |
| Royalty | Acquire Royalties → Generate Cash Flow |
| Prospect Generator | Acquire Projects → Partner → Retain Upside |

### Why It Matters
*What broader industry or project context explains this company?* — 2–3 sentences of factual
context: commodity use, jurisdiction, geology, district, industry background.
Never recommend, discuss upside, imply valuation, or predict.

- ✅ `Silver is used in both industrial applications and investment products.`
- ❌ `Silver demand is poised to drive the next bull market.`

### Competitive Advantages
*What durable characteristics distinguish this company?* — **3–5 structured bullets.** Only
advantages directly supported by disclosure. **Never infer an advantage.**

Qualifying examples: district-scale land package · 100% project ownership · existing mineral
resource · historic producing district · existing infrastructure · fully funded exploration
program · strategic operating partner · tier-one jurisdiction.

Excluded: conferences, recent news, temporary milestones, promotional claims.

### Current Focus
*What is management working on today?* — 2–3 sentences. Bridges the timeless description to
current execution. Summarizes the initiative selected by the **Company Status Card**, then adds
context the card can't hold: *what* they're doing, *why*, and *what question they're trying to
answer*.

Do **not** repeat Latest Update, Next Catalyst, or Expected timing — those belong to the
Status Card.

### What Success Looks Like
*If management executes its stated strategy, what is the logical next stage?* — 2–3 sentences
describing the natural progression of the business.

| Archetype | Progression |
|---|---|
| Explorer | Discovery → Resource Definition → Development Evaluation |
| Developer | Engineering → Permitting → Construction → Production |
| Producer | Long-term operation and optimization |
| Royalty | Growing royalty portfolio and cash flow |
| Prospect Generator | Partner-funded exploration and retained project exposure |

Never speculate, discuss valuation, predict acquisitions, or reference share price.

---

## Selection logic

This widget **does not rank news.** It synthesizes durable disclosure into a long-term
overview. Prioritize information expected to remain true over time. Where documents differ,
use the most recent authoritative disclosure.

**Archetype declaration** is required before populating — it determines which strategy and
lifecycle descriptions apply throughout.

### Exclusions
Conference attendance · investor presentations used only for slogans · CEO interviews ·
podcasts · social media · analyst opinions · IR agreements · branding language · promotional
copy · share-price commentary.

---

## Archetype variants

| Archetype | Primary focus |
|---|---|
| Explorer | Discovery and resource definition |
| Developer | Engineering, permitting, mine development |
| Producer | Mining operations and production growth |
| Royalty Company | Royalty acquisition and portfolio cash flow |
| Prospect Generator | Partner-funded exploration and retained project exposure |
| Pending Transaction | Transaction rationale and post-transaction operating strategy |

---

## Missing-data behavior

If a section cannot be supported by disclosure → **omit the section entirely.**

> **Structural note (Claude):** the renderer already filters out sections with no content, so
> an omitted section disappears cleanly. Do **not** write `"Not disclosed"` as a section body —
> that produces a section header with a dead placeholder under it, which is worse than the
> section simply not being there.

Never infer strategy, competitive advantages, or future objectives.

---

## Extraction metadata

Dominant archetype · as-of date · overall confidence · review required.
Metadata only — never displayed. Carried in the audit trail.

---

## ⚙️ BINDING NOTES (Claude)

All content lives in **`profile.companyBrief.sections[]`**.

Each section is an object:
```json
{ "k": "What They Do", "v": "prose…" }
{ "k": "Competitive Advantages", "bullets": ["…", "…"] }
```

| Rule | Detail |
|---|---|
| `k` | The section title — **rendered as the visible header.** Must match the fixed vocabulary exactly. |
| `v` | Prose body. Use for all sections **except** Competitive Advantages. |
| `bullets` | Array of strings. Use **only** for Competitive Advantages. |
| Order | The array order is the render order. Keep the six in sequence. |
| Empty | Omit the object entirely. The renderer filters empties. |

**Sibling fields under `companyBrief` — not part of this widget:**
- `keyPoints[]` → powers **Core Value Drivers** (widget 03)
- `shortSummary` → maps to `ONE_LINER`, which is currently **not rendered anywhere**. Don't
  spend generation effort on it until it has a home.

---

## 🔨 BUILD FLAGS

**None.** This widget renders fully today. Images are uploaded manually and out of scope.

---

## 📋 CORRECTIONS APPLIED TO THE SUBMITTED SPEC

1. **Removed "Brief Introduction" as a section.** It was specced as "static text only, no
   company-specific information" — that's UI chrome, not data. The sheet already renders a
   fixed subtitle ("Understand this company in under a minute — context, not data"). Adding it
   as a section would put an empty static entry into the data array. **Six sections, not seven.**

2. **Reverted the section title to "How They Create Value."** The spec renamed it to "How
   Management Intends to Create Value." Section titles are rendered headers and are pinned in
   the schema — drift makes profiles non-comparable and breaks the Kingsmen reference.
   *(Open for a decision: the longer title is arguably more accurate about disclosed strategy,
   but it must then be changed everywhere at once, including the built-in reference.)*

3. **Dropped the Pattern B requirement.** The spec's editorial standard demanded "1–2 sentence
   summary + 6–8 hard facts + closing," then every section rule said "2–4 sentences" — an
   internal contradiction. Pattern B applies to **project detail sheets** (geology, location,
   land), which render `summary` + `table` + `closing`. The AI Brief renders **prose sections**
   — there is no table structure. Richness here means *substantive sentences*, not tables.

4. **Changed missing-data handling** from `"Not disclosed"` to omitting the section, since the
   renderer already filters empty sections.

5. **Tightened length** from 2–4 sentences to **2–3**, with a ~350-word total budget, so the
   "60 Seconds" label on the card stays honest.
