# Renderer Map — which content shape each widget actually uses

**Governing principle:** *Richness is universal. Pattern B is not.*

Before writing any widget spec, determine how that widget **actually renders**, then write
content to fit that renderer. Applying the wrong pattern produces content the app can't draw.

This map is derived from the source code. It is the authority.

---

## Shape 1 — Prose

Substantive sentences. **No** fact table, **no** label/value rows.
Richness = thoughtful prose that fully answers the question without padding.

| Widget | Field |
|---|---|
| AI Brief sections | `companyBrief.sections[].v` |
| Project Brief ("60 seconds") | `content.brief` — overview, thesis, focus, opportunity, risks, different, means |
| Bull / Bear / Next Validation | `content.scenarios.{bull,bear,next}.text` |
| Company Status card fields | short prose — headline, subtext, latest update, impact |

---

## Shape 2 — Pattern A · Fundamentals cell

A tappable tile whose detail sheet is built from the tile's own data.

```
headline value (2-4 words)
+ optional second line
+ 4-8 supporting [label, value] fact pairs
+ 1-2 sentence note on why it matters
```

| Widget | Field |
|---|---|
| Project Snapshot cells | `snapshot.location` · `.commodity` · `.ownership` · `.landPackage` · `.depositType` · `.pastProducer` |

---

## Shape 3 — Pattern B · Fact table

```
1-2 sentence framing summary
+ table of 6-8 [label, value] rows
+ 1-2 sentence closing ("so what")
```

| Widget | Field |
|---|---|
| Location detail | `content.location` |
| Commodities detail | `content.commodities` |
| Land Position detail | `content.land` |
| Geological Model | `content.geology` |
| District Context | `content.district` |

---

## Shape 4 — Pattern B · Structured records

Same summary/evidence/closing spine, but the evidence is **typed records or lists**, not
label/value rows. Do not force these into a fact table.

| Widget | Field | Evidence shape |
|---|---|---|
| Exploration Strategy | `content.strategy` | `objectives[]`, `priority[]`, `evidence[]` — lists of strings |
| Exploration Results | `content.results` | `intercepts[{hole, grade, width, note}]` |
| Drill Targets | `content.targets` | `priority[{name, objective, status}]` + `evidence[]` |
| What Sets This Apart | `content.unique` | `diffs[{h, t, fact}]` + `evidence[]` |
| Project Stage | `content.stage` | `completed[]` + current/program/activity/next/timing |

---

## Shape 5 — Key-number tile

Tile face leads with a **number**; prose belongs in the detail sheet behind it.

| Widget | Field |
|---|---|
| Capital snapshot tiles | `capital.*` → `CAP`, `METRIC_DETAIL` |
| Capital Status card | `capital.state` / `.headline` / `.subtext` |

---

## Shape 6 — Record list

Repeating records rendered as rows or cards.

| Widget | Field | Record |
|---|---|---|
| Leadership Team | `team[]` | `{name, role, short, full}` |
| Timeline | `timeline[]` | `{date, headline, whyItMatters, keyNumbers[], fullText}` |
| Financing History | `capital.financing*` → `RAISES` | `{date, amount, type, price, use}` |
| Ownership | `capital.ownership` → `OWNERSHIP` | `[label, value]` rows |

---

## Quick rule

| If the widget renders… | Use |
|---|---|
| paragraphs | Shape 1 — prose |
| a tappable fact tile | Shape 2 — Pattern A |
| a label/value table | Shape 3 — Pattern B table |
| typed lists or records | Shape 4 — Pattern B records |
| a big number | Shape 5 — key-number tile |
| repeating rows | Shape 6 — record list |
