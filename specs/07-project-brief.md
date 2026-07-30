# 07 — 60-Second Project Brief

| | |
|---|---|
| **Shape** | 1 — prose (no tables, no label/value rows, no structured records) |
| **Surface** | Projects tab → "Understand this project in 60 seconds" card → bottom sheet |
| **Specced** | ✅ |
| **Bound to fields** | ✅ |
| **Renders today** | ⚠️ Renders, but empty sections leave orphaned headings |

---

## Purpose

**Investor question:** *If I only had one minute, how would a technical analyst explain this project?*

Orients the investor to **one specific asset** before they read geology, drill results, maps,
or technical data. Complements — never duplicates — the Snapshot, Geological Model,
Exploration Results, Stage, or Status widgets.

---

## Sections (fixed order)

1. **Orientation** — unlabelled opening summary
2. **Discovery Thesis**
3. **Current Technical Focus**
4. **What Makes This Project Different**
5. **Key Technical Risks**
6. **What This Means**

> The project name renders as the sheet title from project identity — it is not brief content.
> Section headings are **hardcoded in the app**, not data.

---

## Content rules

### Orientation (opening summary)
*What is this project?* — 3–5 sentences. Project type, location, commodities, ownership (if
material), scale, why it's in the portfolio. **Descriptive only** — no current drill program,
no catalysts, no risk.

- ✅ `Las Coloradas is a district-scale silver-gold exploration project in Chihuahua, Mexico. The project consolidates several historic producing mines into one land package and is being explored as a connected mineral system.`
- ❌ `The company is currently drilling 26 holes.`

### Discovery Thesis
*What geological idea is management trying to prove?* — 2–4 sentences. The central exploration
hypothesis; the single most important technical idea behind the project. Examples: connecting
historic vein systems · extending known mineralization · discovering blind deposits ·
expanding an existing resource · proving district-scale continuity.

Describe the **hypothesis** — not drilling progress, not results.

### Current Technical Focus
*What technical question is management working on right now?* — 2–4 sentences. Current
activity, technical objective, work program, immediate goal. Examples: testing strike
continuity · expanding known zones · confirming depth extensions · validating geophysical
targets.

Avoid operational updates that belong on the Status card.

### What Makes This Project Different
*Why is this technically different from similar projects?* — 2–4 sentences. Only **durable**
technical differentiators supported by disclosure: historic producing district · unusually
high grades · district consolidation · existing infrastructure · multiple mineralizing events ·
exceptional geological setting.

No valuation. No peer comparisons unless the company makes a supportable one. No promotion.

### Key Technical Risks
*What are the principal geological or technical uncertainties?* — 2–4 sentences. State real
risk honestly: no defined resource · continuity not demonstrated · grade variability ·
structural complexity · limited drilling · permitting uncertainty (only where it gates project
advancement).

**Do not soften risk. Do not include corporate risk** (cash, financing, management) — that
belongs elsewhere.

### What This Means
*Why does this project matter to an investor?* — 2–4 sentences. What management is trying to
achieve, why the current work matters, what future milestone determines success. The
conclusion that ties the technical story into investment context.

- ✅ `The current program is designed to determine whether the known mineralized structures form a larger connected system. Future assay results and follow-up drilling will indicate whether the exploration model is supported.`
- ❌ `This project could become one of Canada's next major discoveries.`

No prediction, no valuation, no recommendation.

---

## Selection logic

Synthesizes **durable** project disclosure — information that stays relevant across the
current exploration or development stage. Where documents differ: prefer the most recent
technical disclosure, current project descriptions over outdated marketing, and reconcile via
the latest authoritative source.

### Exclusions
Conference presentations containing only slogans · CEO interviews · podcasts · social media ·
analyst commentary · share-price discussion · promotional statements · corporate news
unrelated to this project · financing announcements unless they directly change the technical
program.

---

## Archetype variants

| Type | Focus |
|---|---|
| Exploration | Exploration thesis, geology, discovery model, drilling objectives |
| Development | Engineering, permitting, construction readiness, development pathway |
| Producing | Mining operation, production profile, optimization, expansion |
| Royalty asset | Royalty interest, producing assets, cash-flow characteristics, operator activity |
| Early-stage / limited disclosure | Only what is directly supported. **Never invent a discovery thesis that hasn't been disclosed.** |

---

## Missing-data behavior

Each section evaluated independently. Unsupported → **hide that section.** Never write
`"Not disclosed"`.

If only Orientation can be populated, that is an acceptable brief for a **Tier 3** project.
If nothing meaningful exists beyond the project name, **do not render the brief at all** — the
project page falls back to "Details coming soon."

---

## Boundaries — preventing duplication across project widgets

| Widget | Answers |
|---|---|
| **60-Second Project Brief** | What is this, what is being proved, what's unique, what are the risks, why does it matter |
| Project Snapshot | Key factual attributes (location, ownership, land, commodities) |
| Project Stage | Where it sits in its lifecycle |
| Geological Model | Geology and mineralization model |
| Exploration Strategy | Planned objectives and technical work |
| Exploration Results | Drill, sampling and assay outcomes |
| Drill Targets | Priority targets and current testing |
| What Sets This Apart | Concise factual differentiators, structured |

The Brief is the **narrative that ties the technical widgets together** — it orients before the
investor dives into structured detail.

---

## ⚙️ BINDING NOTES (Claude)

All content lives in **`projects[].content.brief`**.

| Spec section | Field | Renders as |
|---|---|---|
| Orientation | `overview` | Unlabelled lead paragraph (`ExecLead`) |
| Discovery Thesis | `thesis` | Section, heading hardcoded |
| Current Technical Focus | `focus` | Section, heading hardcoded |
| What Makes This Project Different | `different` | Section, heading hardcoded |
| Key Technical Risks | `risks` | Section, heading hardcoded |
| What This Means | `means` | Closing note, "What this means" |
| Project Name | `projects[].name` | Sheet title — **not** brief content |

**Section headings are hardcoded UI strings, not data.** ChatGPT supplies only the six body
values; it cannot and should not emit headings.

**`opportunity` is dead — correctly omitted.** Kingsmen's reference data contains a
`brief.opportunity` value, but it is neither carried by the mapping nor drawn by the renderer.
Do not generate it.

**Card visibility:** the whole "Understand this project in 60 seconds" card only appears when
`content.brief` exists, so a project with no brief degrades cleanly.

---

## 🔨 BUILD FLAGS

ChatGPT recorded none, but its own missing-data rule requires one:

| Item | Status |
|---|---|
| **Hide each section when its field is empty** | ❌ **Needs building** (small) |

The six sections render **unconditionally**. An empty `thesis` produces the heading "Discovery
Thesis" with nothing beneath it — the same orphaned-label problem found on the Status card's
`Expected` field. The spec correctly says unsupported sections should hide; the renderer
doesn't do that yet.
