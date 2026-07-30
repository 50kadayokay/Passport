# 03 — Core Value Drivers

| | |
|---|---|
| **Shape** | 1 — prose bullets (no Pattern A/B, no tap-through) |
| **Surface** | Overview tab → "Core Value Drivers" expandable bar |
| **Specced** | ✅ |
| **Bound to fields** | ✅ |
| **Renders today** | ⚠️ Renders, but the bar doesn't hide when empty |

---

## Purpose

**Investor question:** *What are the biggest reasons this company deserves attention right now?*

Scannable in under ten seconds. Unlike the AI Brief, this widget does **not explain** the
company — it surfaces the handful of factors that currently define its investment story.

---

## What it displays

An expandable bar labelled **Core Value Drivers**. Expanded, it shows **3–5 bullets** in a
vertical timeline rail with icon nodes. One idea per bullet. **No tap-through, no supporting
detail — the bullet is the entire content.**

---

## Content rules

Each bullet = one current, evidence-backed reason the story is compelling today. May be an
active operational program, a material financial strength, a high-quality asset, a major
strategic position, or a near-term opportunity already supported by disclosure.

Every bullet must be: supported by disclosure · material to the current story · understandable
without context · a short factual statement · one line.

**Length: ~5–8 words, 50 characters max.** (Kingsmen's real bullets run 38–48 chars. "~10
words" is the ceiling, not the target.)

### Good
- `Active 26-hole drill campaign underway`
- `Fully funded through 2026 — no near-term dilution`
- `Multiple drill-ready discovery targets`

### Bad
`Experienced management team` · `Strong shareholder value proposition` · `Excellent
exploration upside` · `Well positioned for growth` · `Attractive valuation` · `Highly
prospective assets` · `Great jurisdiction`

> **Heuristic:** avoid any statement that could apply equally to dozens of junior mining
> companies.

---

## Value Driver vs. Competitive Advantage

The distinction must stay consistent across Passport.

| | Core Value Driver | Competitive Advantage |
|---|---|---|
| **Answers** | Why follow this company *right now*? | What durably distinguishes it from peers? |
| **Lifespan** | Changes as the company progresses | Stable over years |
| **Nature** | What management is **doing** | What the company **possesses** |
| **Examples** | Active drill campaign · fully funded program · pending resource estimate · construction underway · first production approaching · recent district consolidation · major royalty acquisition | 100% project ownership · district-scale land package · historic producing district · existing infrastructure · Tier-1 jurisdiction · established royalty portfolio · long-life producing asset |

### Decision rule
- Removing it would materially change the company's story **this year** → **Value Driver**
- It would probably still describe the company **several years from now** → **Competitive Advantage**
- Qualifies as both → assign by primary role: **doing** = driver, **possessing** = advantage

Do not duplicate the same fact across both widgets.

---

## Selection logic

Identify all candidates from the full document set, then rank:

1. Active material operational program
2. Financial position enabling execution
3. Major project or asset quality
4. Near-term value-defining milestone already underway
5. Strategic asset or portfolio improvement

Select the strongest 3–5. **Materiality first; recency is only a tiebreaker.**

### Exclusions
Experienced management team (unless backed by a unique, material, currently-relevant
credential) · strong ESG commitment · good jurisdiction · attractive valuation · undervalued ·
large market opportunity · conference attendance · investor presentations · marketing slogans ·
social media · analyst opinions · share-price commentary · generic exploration potential ·
corporate vision statements · boilerplate copied from presentations.

---

## Archetype variants

| Archetype | Focus | Examples |
|---|---|---|
| **Explorer** | Active programs, funding, discovery potential, district quality, drill-ready targets | `Active drill campaign underway` · `Fully funded exploration program` |
| **Developer** | Permitting, engineering, construction, financing, development milestones | `Construction progressing on flagship project` · `Project financing secured` |
| **Producer** | Production, operational improvement, expansion, mine life, costs | `Production expansion underway` · `Mill optimization program` |
| **Royalty** | Portfolio, producing royalties, diversification, cash flow, acquisitions | `Diversified royalty portfolio` · `New producing royalty acquired` |
| **Prospect Generator** | Partner-funded exploration, earn-ins, retained exposure | `Multiple partner-funded drill programs` · `Active earn-in portfolio` |
| **Pending Transaction** | Merger, acquisition, arrangement, transaction milestones | `Acquisition awaiting shareholder approval` · `Strategic merger underway` |

---

## Missing-data behavior

Fewer than three qualifying drivers → include only those that qualify. **Never invent to reach
three.** No qualifying drivers → the widget should not render at all.

---

## ⚙️ BINDING NOTES (Claude)

**Field:** `profile.companyBrief.keyPoints[]` — a flat array of strings.

```json
"keyPoints": [
  "Active 26-hole drill campaign underway",
  "Fully funded through 2026 — no near-term dilution",
  "Multiple drill-ready discovery targets"
]
```

- Array order = render order (top to bottom on the rail)
- Icons are assigned by position in the app — not part of the data
- Sibling `companyBrief.sections[]` powers the **AI Brief** (widget 02); Competitive
  Advantages lives there, not here

---

## 🔨 BUILD FLAGS

ChatGPT recorded "None," but its own missing-data rule requires one:

| Item | Status |
|---|---|
| **Hide the whole bar when `keyPoints` is empty** | ❌ **Needs building** (small) |

Today the black "Core Value Drivers" bar renders unconditionally — tapping it on a company
with no drivers expands to nothing. That's the behaviour observed on enCore. The spec
correctly says the widget shouldn't render at all; that needs a code change.

---

## 📋 NOTE — the Kingsmen reference violates the new rule

Applied strictly, the Decision Rule reclassifies **2 of Kingsmen's 5 built-in drivers**:

| Kingsmen built-in | Under the new rule |
|---|---|
| Active 26-hole drill campaign underway | ✅ Driver |
| Fully funded through 2026 — no near-term dilution | ✅ Driver |
| Multiple drill-ready discovery targets | ✅ Driver |
| **District-scale consolidated land package** | ➡️ Competitive **Advantage** (a possession, durable) |
| **Historic high-grade silver-gold district** | ➡️ Competitive **Advantage** (a possession, durable) |

ChatGPT's own example lists are internally consistent with this — it puts *"recent district
consolidation"* (the act) under drivers and *"district-scale land package"* (the possession)
under advantages.

**Decision needed:** update the Kingsmen built-in list so the reference models the rule, or
accept the reference predates it. Recommend updating — otherwise the gold standard
contradicts the spec every new company is measured against.
