# 04b — Commodities (Project Snapshot cell)

| | |
|---|---|
| **Shape** | Pattern A **extended** — hero + chips + summary + fact table + closing note |
| **Surface** | Projects tab → Snapshot grid → "Commodities" tile → detail sheet |
| **Specced** | ✅ |
| **Bound to fields** | ✅ |
| **Renders today** | ⚠️ Table + note render; hero, chips and summary need rewiring |

---

## Purpose

**Investor question:** *What metals is this project targeting, and why does that commodity mix matter?*

Explains the project's commodity exposure, the mineralization style, and how the commodities
relate to one another. It should explain **what is actually being explored or produced** — not
teach commodity investing.

> **Editorial standard:** the focus is the *project*, not the commodity market. Every statement
> should help explain the project's mineralization, reporting, or economics.

---

## What it displays

1. Opening summary
2. Primary commodity hero card
3. Secondary commodity chips
4. Commodity fact table
5. Commodity context (closing)

---

## Content rules

### Opening summary
2–4 sentences. Primary commodity, significant secondaries, deposit style (if material), and
why this mix characterizes the project. **No prices, no macro demand, no drill results.**

- ✅ `Las Coloradas is a silver-focused project with meaningful gold, lead, zinc, and copper credits hosted within a low-sulphidation epithermal system.`
- ❌ `Silver demand is expected to rise due to electrification.`

### Primary commodity hero card
The dominant commodity plus its chemical symbol: `Silver (Ag)` · `Copper (Cu)` · `Gold (Au)` ·
`Nickel (Ni)` · `Lithium (Li)`.

Use the company's **disclosed** primary commodity. **Never infer it** from market cap or branding.

### Secondary commodity chips
Only commodities that are disclosed, materially present, or reported alongside the primary.
Hide insignificant or undisclosed ones. Do not rank by market value — preserve the company's
reported order where practical.

### Commodity fact table
Populate only supported rows; hide the rest.

| Row | Rules |
|---|---|
| **Commodity Mix** | `Gold-silver` · `Copper-gold` · `Polymetallic` · `Silver-equivalent reporting` · `Uranium-vanadium` |
| **Deposit Style** | `Porphyry` · `Epithermal` · `VMS` · `IOCG` · `Orogenic gold` · `Sediment-hosted copper` · `Athabasca unconformity-hosted`. Prefer company/technical-report terminology. |
| **Reporting Basis** | Only if disclosed: `Gold-equivalent (AuEq)` · `Silver-equivalent (AgEq)` · `Copper-equivalent (CuEq)` · `Individual metal reporting`. **More useful than Commodity Mix** — equivalent reporting drives how investors interpret drill results. |
| **Associated Metals** | Significant payable or consistently reported by-products: `Gold, lead, zinc and copper credits` · `Nickel with cobalt` · `Copper with molybdenum`. Hide if none. |
| **Typical End Uses** | **Only** where the mix benefits from understanding its industrial/strategic role — uranium → nuclear fuel · rare earths → permanent magnets · graphite → battery anodes. **For mature commodities (gold, silver, copper), omit** unless it explains the project's economics. Prevents the widget becoming a commodity encyclopedia. |

**Optional rows** (only when disclosed and material): payable metals · metallurgical
characteristics · recovery assumptions · processing method · concentrate type.

### Commodity context (closing)
2–4 sentences on the practical significance of the commodity assemblage: polymetallic credits
supporting economics · deposit style controlling recoveries · equivalent reporting simplifying
comparisons · multiple payable metals diversifying revenue potential.

- ✅ `The presence of multiple payable metals means mineralized intervals may derive value from more than a single commodity, depending on future metallurgy and mine design.`
- ❌ `Copper demand will soar because of AI and EV adoption.`

---

## Selection logic

Project-level technical disclosure first:
1. Technical reports (NI 43-101, JORC, PEA, PFS, FS)
2. Project technical sections
3. Corporate presentations
4. Project webpages
5. Recent technical news releases

Where sources differ, use the newest authoritative technical disclosure.
**Preserve commodity terminology exactly as reported.**

### Exclusions
Commodity price forecasts · supply-demand forecasts · analyst commentary · macroeconomic
opinions · investment recommendations · ESG commentary · geopolitical speculation · generic
"critical minerals" marketing language unless directly relevant · promotional statements about
future demand.

**Never infer the primary commodity.**

---

## Archetype variants

| Type | Emphasis |
|---|---|
| Precious metals | Primary precious metal, by-product credits, equivalent reporting, deposit style |
| Base metals | Primary metal, associated payable metals, concentrate characteristics, processing implications |
| Battery materials | Commodity suite, strategic mineral relationships, processing pathway, product spec |
| Uranium | Reporting basis, associated vanadium/rare earths, deposit style, processing method |
| Producing mine | Include processing and payable products where disclosed |

> Note: these variants are by **commodity type**, not company archetype — a sensible adaptation
> for this widget.

---

## Missing-data behavior

Hide unsupported rows individually. If only the primary commodity is disclosed, render the
summary, hero card, and chips (if any), with only supported rows in the table.
Never insert `"Not disclosed"`.

---

## ⚙️ BINDING NOTES (Claude)

**Field:** `projects[].snapshot.commodity`

```json
"commodity": {
  "value":   "Silver · Gold",
  "value2":  "Polymetallic epithermal",
  "summary": "Las Coloradas is a silver-focused project with…",   // NEW
  "detail":  [["Primary","Silver (Ag)"],
              ["Secondary Commodities","Gold · Lead · Zinc · Copper"],
              ["Reporting Basis","Silver-equivalent (AgEq)"],
              ["Deposit Style","Low-sulphidation epithermal vein"],
              ["Associated Metals","Lead · Zinc · Copper credits"]],
  "note":    "These metals precipitate together from the same fluids…"
}
```

| Spec element | Field |
|---|---|
| Hero card | `value` (+ symbol) |
| Secondary chips | derived from the `Secondary Commodities` row in `detail[]` |
| Opening summary | `summary` ← **new field** |
| Fact table | `detail[]` |
| Commodity context | `note` |

**Same consolidation as 04a:** `content.commodities` is dead — never mapped, no longer
rendered. Everything lives on the snapshot cell.

**Equivalent reporting must never be converted or reformatted.** `1,742 g/t AgEq` stays exactly
as disclosed — this is an accuracy rule, not a style one.

---

## 🔨 BUILD FLAGS

| Item | Status |
|---|---|
| Fact table from `detail[]` | ✅ Renders today |
| Closing note from `note` | ✅ Renders today |
| **Hero card** | ⚠️ `HeroBand` component **exists but is orphaned** — needs rewiring |
| **Secondary commodity chips** | ⚠️ `CommodityChips` component **exists (line 3816) but is orphaned** — needs rewiring |
| **`summary` field** | ❌ Needs adding (shared with 04a) |
| Chips render only when >1 material commodity | ❌ Needs the conditional |

Both `HeroBand` and `CommodityChips` were built for the original (broken) sheet and were
dropped when I replaced it with the crash-safe generic renderer. They are intact — this is
rewiring, not new construction.

---

## 📋 NOTE — reference drift

The "omit Typical End Uses for mature commodities" rule would **strip a row from Kingsmen's
reference**, which currently carries:

`["Typical Industrial Uses", "Silver — electronics, solar, monetary; Gold — monetary, technology"]`

That is precisely the commodity-encyclopedia content the new rule excludes. Same pattern as the
Core Value Drivers drift — the gold standard predates the rule.

**Decision needed:** update Kingsmen's reference to match the rule, or accept it's stale.
Recommend updating, so the reference doesn't contradict the spec.
