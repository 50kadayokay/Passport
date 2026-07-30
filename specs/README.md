# Passport — Widget Specifications

One file per widget. Each holds the content spec, the binding notes (spec element → real
app field name), and build flags (what renders today vs. what needs building).

**Related files**
- `../PASSPORT_SCHEMA.md` — the structural contract (field names, types)
- `../WIDGET_PROMPTS.md` — the per-widget prompts to paste into ChatGPT

**Workflow:** ChatGPT writes the spec → paste it to Claude → Claude files it here, binds it
to real field names, and flags what needs building.

---

## Status

| # | Widget | Surface | Specced | Bound | Renders today |
|---|---|---|---|---|---|
| 01 | [Company Status Card](01-company-status-card.md) | Overview | ✅ | ✅ | ⚠️ 1 of 3 progress renderers |
| 02 | [AI Brief](02-ai-brief.md) | Overview | ✅ | ✅ | ✅ |
| 03 | [Core Value Drivers](03-core-value-drivers.md) | Overview | ✅ | ✅ | ⚠️ bar doesn't hide when empty |
| 04 | Project Snapshot (grid + selection) | Projects | — | — | ✅ |
| 04a | [→ Location & Jurisdiction](04a-location-jurisdiction.md) | Projects | ✅ | ✅ | ⚠️ needs hero + summary |
| 04b | [→ Commodities](04b-commodities.md) | Projects | ✅ | ✅ | ⚠️ needs hero + chips rewired |
| 05 | Project Stage | Projects | — | — | ⚠️ needs stage detail data |
| 06 | Technical Intelligence Cards | Projects | — | — | ✅ |
| 07 | [Project Brief (60 seconds)](07-project-brief.md) | Projects | ✅ | ✅ | ⚠️ empty sections leave orphaned headings |
| 08 | What Sets This Project Apart | Projects | — | — | ✅ |
| 09 | Bull / Bear / Next Validation | Projects | — | — | ✅ |
| 10 | Capital Status Card | Capital | — | — | ✅ |
| 11 | Capital Snapshot Tiles | Capital | — | — | ✅ |
| 12 | Share Structure & Ownership | Capital | — | — | ✅ |
| 13 | Financing History | Capital | — | — | ✅ |
| 14 | Leadership Team | Team | — | — | ✅ |
| 15 | Timeline | Timeline | — | — | ✅ |

---

## Build queue

Accumulated from spec build flags, in priority order:

1. **Stage progress renderer** (01) — unblocks developers, producers, and any company
   without a countable program
2. **Milestone Waiting renderer** (01) — unblocks permit-pending, transaction-pending,
   and awaiting-assay companies
3. **Next Catalyst full-width span** (01) — small; drops the Expected cell when no timing
   is disclosed, instead of leaving an orphaned label

---

## Cross-cutting rules — resolved

Now handled globally in the master editorial instructions, so they apply to every widget
and don't need re-litigating per spec:

- ✅ **Source traceability** — document name + date + verbatim quote, via the audit block
- ✅ **As-of date** — extraction metadata
- ✅ **Confidence / review-required** — extraction metadata
- ✅ **Archetype declaration** — stated before any selection logic runs
- ✅ **Brevity vs. richness** — brevity on card faces, richness in detail sheets
  (Patterns A and B)
- ✅ **null vs "Not disclosed"** — null for structured data so rows hide; visible-text
  fields per widget spec

## Still open

- **Closed stage vocabularies** per archetype (needed when the stage renderer is built)
- **Evidence rules for claiming a stage** (same)
