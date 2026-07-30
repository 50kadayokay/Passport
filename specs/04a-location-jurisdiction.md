# 04a — Location & Jurisdiction (Project Snapshot cell)

| | |
|---|---|
| **Shape** | Pattern A **extended** — hero + summary + fact table + closing note |
| **Surface** | Projects tab → Snapshot grid → "Location" tile → detail sheet |
| **Specced** | ✅ |
| **Bound to fields** | ✅ |
| **Renders today** | ⚠️ Partial — table + note render; hero band and summary need building |

---

## Purpose

**Investor question:** *Where is this project, and how does its location affect exploration,
development, and potential production?*

Explains the project's **physical and operating environment** — whether the location supports
efficient exploration and mine development. Not where it sits on a map.

> **The framing that drives everything here:** location is an *investment characteristic*, not
> a geography lesson. Prefer operationally relevant facts over descriptive trivia.

---

## What it displays

1. **Hero location card** — at-a-glance geographic identity
2. **Opening summary** — orientation before the facts
3. **Fact table** — 6–8 supported rows
4. **Why This Location Matters** — closing investor context

---

## Content rules

### Hero location card
Country · district or mining camp · short jurisdiction descriptor.

The descriptor should identify the recognized mining region or operating context:
`Tier-1 Mexican silver belt` · `Established uranium district` · `Pilbara iron region` ·
`Nevada gold trend` · `Athabasca Basin`

**Never invent a descriptor.** Use only widely recognized or company-disclosed descriptions.

### Opening summary
2–4 sentences. Mining district, province/state, country, operational setting, infrastructure,
overall mining context. **Do not repeat individual fact-table values** — orient the reader
before the detail.

- ✅ `Las Coloradas sits within the Parral District of Chihuahua, one of Mexico's historic silver belts. The project benefits from year-round access and established regional mining infrastructure.`
- ❌ `The project is located in Mexico.`

### Fact table
Populate only supported rows; **hide unsupported rows.** Never force eight.

| Row | Rules |
|---|---|
| **Mining District / Jurisdiction** | Recognized district, camp, basin, belt or geological region. If both district and jurisdiction exist, prefer the district. |
| **Province / State** | Administrative region |
| **Country** | Country of operation |
| **Road Access** | Operational access: `Year-round highway access` · `Gravel road access` · `Seasonal winter road` · `Helicopter supported`. **Avoid subjective descriptions** like "excellent access." |
| **Power Availability** | Only if disclosed: `Grid power nearby` · `Existing transmission corridor` · `Diesel generation`. Hide if undisclosed. |
| **Nearby Community** | Nearest operational community or mining service centre. Prefer logistics relevance over mere proximity. |
| **Climate / Seasonal Access** | Only if operationally relevant: `Accessible year-round` · `Winter road only` · `Seasonal exploration` · `Tropical wet season constraints` |

**Optional rows** (only if materially disclosed): port access · rail access · airport proximity ·
existing mill nearby · industrial infrastructure · Indigenous agreements (only where tied to
project operations).

### Why This Location Matters
2–4 sentences on the **operational implications**: established mining district · skilled labour ·
nearby infrastructure · existing mills · permitting familiarity · year-round exploration ·
regional geological endowment.

Do not speculate. Do not imply easier permitting unless directly supported. Do not compare
jurisdictions without objective evidence.

- ✅ `The Parral District has supported silver mining for centuries and provides established infrastructure and mining services. Existing regional expertise may reduce logistical complexity as exploration advances.`
- ❌ `This jurisdiction almost guarantees rapid mine development.`

---

## Selection logic

Use the most specific project-level disclosure available, in priority order:

1. Technical reports (NI 43-101, JORC, PEA, PFS, FS)
2. Corporate presentations
3. Project webpages
4. Recent project-specific news releases
5. MD&A

Where sources differ, prefer the newest authoritative **technical** disclosure.

### Exclusions
GPS coordinates · postal addresses · tourist information · national history · political
commentary · commodity outlook · company strategy · drill results · resource estimates ·
promotional descriptions · unsupported jurisdiction rankings.

Avoid `Excellent location` · `Great jurisdiction` · `Mining friendly` unless backed by
objective facts explaining **why**.

---

## Archetype variants

| Archetype | Emphasis |
|---|---|
| Explorer | Access, exploration season, district geology, logistics |
| Developer | Permitting environment, infrastructure, construction access, utilities |
| Producer | Operating infrastructure, workforce, transportation, supply chain |
| Royalty asset | Underlying operating jurisdiction and district; skip infrastructure irrelevant to the royalty |
| Early-stage | Only supported facts — never infer operational characteristics |

---

## Missing-data behavior

Hide unsupported rows individually. If only Province, Country and Mining District are
disclosed, render only those three. If no meaningful location information exists beyond the
project name, **hide the widget**. Never insert `"Not disclosed"` into the fact table.

---

## ⚙️ BINDING NOTES (Claude)

**Field:** `projects[].snapshot.location`

```json
"location": {
  "value":   "Parral District",              // hero headline
  "value2":  "Chihuahua, Mexico",            // hero subline
  "summary": "Las Coloradas sits within…",   // NEW — opening paragraph
  "detail":  [["Mining District","Parral District"],
              ["Province / State","Chihuahua"],
              ["Country","Mexico"],
              ["Road Access","Year-round; ~38 km from Parral"],
              ["Power Availability","Grid power nearby"],
              ["Nearby Community","Hidalgo del Parral · 38 km"],
              ["Climate / Seasonal Access","Semi-arid; accessible all year"]],
  "note":    "The Parral District has supported silver mining for centuries…"  // why it matters
}
```

| Spec element | Field |
|---|---|
| Hero location card | `value` + `value2` |
| Opening summary | `summary` ← **new field, needs adding** |
| Fact table | `detail[]` — array of `[label, value]` |
| Why This Location Matters | `note` |

### 🏛️ Architecture decision — one shape, not two

Kingsmen carries this content **twice**: once as a snapshot tile (`snapshot.location`) and
again as a Pattern B block (`content.location` with `summary`/`table`/`closing`). They say
substantially the same thing.

**`content.location` is dead and should stay dead:**
- It was **never produced by the mapping** — no onboarded company has ever had it
- It is no longer referenced by any renderer

**Resolution: consolidate on the snapshot cell (Pattern A) and extend it with `summary`.**
Pattern A already provides three of the four elements — `detail[]` *is* the fact table, `note`
*is* the closing. Only the opening summary was missing.

Benefits: one block per cell for ChatGPT to generate instead of two · one renderer · no
duplication in the reference · lower generation cost.

Same consolidation applies to `content.commodities` and `content.land` — see 04b, 04c.

---

## 🔨 BUILD FLAGS

| Item | Status |
|---|---|
| Fact table from `detail[]` | ✅ Renders today |
| Closing note from `note` | ✅ Renders today |
| **Hero location card** (`value` + `value2` + descriptor) | ❌ **Needs building** |
| **`summary` field** — schema + renderer | ❌ **Needs building** |
| Rows expand/contract with no blank placeholders | ✅ Already behaves this way |

The generic snapshot sheet I built renders `value` / `value2` / `detail` / `note`. It needs a
hero band at the top and the new `summary` paragraph beneath it to fully match this spec.
