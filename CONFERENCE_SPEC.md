# Passport — Conference Mode Spec & Pass 2 Prompt

> **STATUS — SHIPPED.** The 8-section booth storyboard (`ConferenceScenes` in
> `src/aiBrief/PassportProto.jsx`) is built and is the default for `/app?c=<slug>&ipad=1`.
> The **canonical Pass 2 prompt now lives in code** as `CONFERENCE_PROMPT`
> (`src/admin/promptTemplate.js`) and is copyable from the Admin toolbar ("Conference prompt").
> The importer accepts the `conference` key, and the profile editor has a **Conference booth**
> section (enable, layout, hero video, QR tag). Offline booth = PWA service worker (`public/sw.js`).
>
> **The real `conference` contract the renderer reads** (this supersedes the draft object in
> Part A below, which was the earlier design sketch):
> ```json
> { "conference": {
>     "enabled": true, "style": "scene", "heroVideo": "", "macroContext": "",
>     "heroHighlightStats": [ { "value": "", "label": "" } ],   // exactly 4
>     "evidenceType": "drill_results | economics | production | royalty",
>     "featuredGrade":      { "grade": "", "width": "", "location": "" },
>     "featuredEconomics":  { "npv": "", "irr": "", "capex": "", "payback": "" },
>     "featuredProduction": { "ounces": "", "aisc": "", "fcf": "" },
>     "featuredPortfolio":  { "paying": "", "nsr": "", "operators": "" },
>     "kioskIdleTimeout": 45, "boothQrUtm": "" } }
> ```
> Projects, leadership, timeline, capital and ownership are read straight from the profile — the
> `conference` object is only the hero framing, four headline stats, and the one featured proof.
> Everything below is the original design write-up, kept for the field-by-field rationale.

**What this is.** The plan for the second onboarding output: a *conference* package that drives
the iPad booth experience. It has two parts:

- **PART A — the `conference` object** the app renders, with every field traced to the exact
  source field in the Profile JSON. *This is the part to proofread: it tells you precisely which
  company data conference mode extracts and where each piece shows up.*
- **PART B — the Pass 2 "Conference Generator" prompt** you paste into ChatGPT to produce that
  object.

Nothing here changes your existing profile extraction (Pass 1). Conference mode is a second,
smaller pass that runs *after* a profile exists.

---

## The architecture (read once)

```
Company documents ──► PASS 1: Profile Extraction (your existing prompt) ──► Profile JSON
                                                                               │
                                        (Profile JSON = the single source of truth)
                                                                               │
                                                                               ▼
                          PASS 2: Conference Generator (this doc) ──► conference object
                                                                               │
                                                    (merged into the same Profile JSON)
                                                                               │
                                                                               ▼
                                mapProfileToPP → pp.CONFERENCE → iPad booth board
```

**The one rule that keeps the iPad from ever contradicting the mobile profile:**

> Pass 2's **only source of facts is the Profile JSON.** It may not state a number, name, grade,
> date, or claim that is not already in that JSON. The Corporate Presentation and website may be
> attached to the Pass 2 chat, but **only** to signal what management emphasizes and in what order
> — never to introduce or change a fact. *If it isn't in the Profile JSON, it can't appear on the
> iPad.*

This is why Pass 2 is a *selector*, not an *extractor*. The expensive document reading already
happened in Pass 1; Pass 2 organizes and prioritizes what's there into a 60–90 second trailer.

---

# PART A — The `conference` object (the layout, mapped to data)

This object is written into the Profile JSON under the top-level key `conference`. The app already
passes it straight through to the booth renderer (`profileToPP.js` → `CONFERENCE`), so these field
names are the contract.

Where a field says **← source**, that is the Profile JSON field Pass 2 must copy or select from.
"select" = pick the strongest item(s) from a list. "copy" = reproduce a value verbatim.

### 0. Render config (already consumed by the app today)

| Field | Meaning | Source |
|---|---|---|
| `enabled` | `true` to turn booth mode on | operator sets |
| `style` | `"board"` \| `"scene"` \| `"fixa"` — which booth layout | operator/default `"board"` |
| `macroContext` | one line of market/commodity context for the hero | ← `companyBrief.sections["Why It Matters"]` (condensed), fact-checked against docs |
| `kioskIdleTimeout` | seconds before the board resets to the hero (attract loop) | operator, default `90` |
| `boothQrUtm` | UTM string appended to the QR's `/app?c=<slug>` link | operator |

### 1. Editorial spine (NEW — the trailer's backbone)

The through-line your philosophy demands. Every section below must reinforce this.

| Field | Meaning | Limit | Source |
|---|---|---|---|
| `hook.headline` | The ONE thing to remember about this company | ≤ 40 chars | select/synthesize from `companyStatus.statusHeadline` + `companyBrief.keyPoints` |
| `hook.subtext` | One sentence expanding the hook | ≤ 120 chars | ← `companyStatus.statusHeadlineSubtext` |
| `throughLine` | 2–3 sentence spine — what this company is and why it matters | — | ← `companyBrief.shortSummary` (tightened) |
| `archetype` | `"explorer"` \| `"developer"` \| `"producer"` \| `"royalty"` — drives section emphasis & order | one value | ← top-level `archetype` |
| `sectionOrder` | ordered list of the section keys below, adapted to the archetype | — | Pass 2 decides per archetype (see prompt) |

### 2. Key stats strip (the scannable hero numbers)

`keyStats: [ { label, value } ]` — **3–5** numbers that define the company at a glance.

- ← selected & copied verbatim from any of: `capital.marketCap`, `capital.cash`, `capital.state`,
  `companyStatus.progressBar` (e.g. "14 / 26 holes"), `projects[].snapshot.landPackage`,
  `projects[].content.results` (`holes`, `metres`), `company.commodity`, `company.jurisdiction`.
- Which 3–5 depends on archetype (explorer → drilling + land; producer → production + cash flow).

### 3. Who / What they own — the flagship

| Field | Meaning | Source |
|---|---|---|
| `flagshipProjectKey` | which project leads the booth | ← one `projects[].key` |
| `featuredProjectKeys` | secondary projects to show, in order (may be empty) | ← other `projects[].key` |

The renderer pulls the full project (name, gallery, `snapshot`, `content`) from the profile by
key — Pass 2 does **not** recopy project bodies, only chooses the order.

### 4. Why it matters / What makes them different

| Field | Meaning | Source |
|---|---|---|
| `valueDrivers` | 3–5 one-line drivers (the "so what") | ← `companyBrief.keyPoints` (select strongest, copy) |
| `differentiators` | 2–4 lines: the real edge over peers | ← `companyBrief.sections["Competitive Advantages"].bullets` and/or flagship `projects[].content.unique.diffs[].fact` |

### 5. What they're doing right now (Current Program)

| Field | Meaning | Source |
|---|---|---|
| `currentProgram.headline` | what's active right now | ← `companyStatus.statusHeadline` |
| `currentProgram.detail` | one sentence | ← `companyStatus.latestUpdate` |
| `currentProgram.progress` | `{ current, total, unit }` if a countable program exists, else omit | ← `companyStatus.progressBar` |
| `currentProgram.stats` | `[ { label, value } ]` — live program numbers | ← flagship `projects[].content.stage` / `.strategy` / `.results` |

### 6. Evidence (the proof the story is real)

| Field | Meaning | Source |
|---|---|---|
| `evidence.intercepts` | `[ { hole, grade, width, note } ]` — the 3–5 strongest drill results | ← select from `projects[].content.results.intercepts` (copy verbatim) |
| `evidence.proofPoints` | 2–4 non-drill proof points (resource, historic production, survey) | ← `projects[].content.geology` / `.district` / `timeline[].keyNumbers` |

### 7. Are they funded (Capital)

| Field | Meaning | Source |
|---|---|---|
| `capitalHeadline` | funding-status headline | ← `capital.headline` |
| `capitalDetail` | one sentence | ← `capital.subtext` |
| `capitalStats` | `[ { label, value } ]` — treasury / financing / ownership | ← `capital.cash`, `capital.state`, `capital.financing`, `capital.ownership`, `capital.marketCap` (copy) |

### 8. Who's leading (Leadership)

`leadership: [ { name, role, note } ]` — the **2–4** most credential-heavy leaders (not the whole
team). ← select from `team[]`, copy `name`/`role`, condense `short` → `note`.

### 9. Next catalysts

`catalysts: [ { label, timing } ]` — the **1–3** upcoming value events.
← `companyStatus.nextCatalyst` + `companyStatus.expected`, and flagship
`projects[].content.stage.next` + `.timing`.

### 10. The CTA (why continue in Passport)

| Field | Meaning | Source |
|---|---|---|
| `cta.line` | one line inviting the scan | Pass 2 writes (generic, non-promotional) |
| `cta.qr` | `/app?c=<slug>` (+ `boothQrUtm`) | operator/slug |
| `contact` | phone / email / site / socials | ← top-level `contact` (already in profile) |

### Media note

Conference is image-heavy (hero, project galleries, headshots, maps). Those assets already live on
the profile (`brand.hero`, project galleries, `team[].photo`, `MAP_SITES`) and are **uploaded
manually**, exactly as today — Pass 2 does not produce images, it only orders the sections that
display them.

### Completeness gate

Pass 2 must be able to answer all ten of your questions (Who / What they own / Why it matters /
What's different / What now / What evidence / Funded? / Who leads / Next catalysts / Why follow).
Any it can't fill from the profile goes in a trailing `conferenceGaps: []` array — the operator's
signal that the *profile* needs enriching before this company is booth-ready.

---

# PART B — The Pass 2 "Conference Generator" prompt

> Paste this into a fresh ChatGPT chat. Attach: (1) the company's **Profile JSON** (required — the
> only source of facts) and (2) the **Corporate Presentation + website** (optional, emphasis-only).
> Return the `conference` object, which you import/merge into the company.

```
You are producing the CONFERENCE package for PASSPORT — the content that drives a premium iPad
kiosk experience at investor conferences for a junior mining company.

Your input is the company's completed PROFILE JSON. That JSON is the SINGLE SOURCE OF TRUTH.
You may ALSO be given the company's Corporate Presentation and website — use those ONLY to judge
what management emphasizes and in what order. They may NOT introduce or change any fact.

THE HARD RULE: If a number, name, grade, date, or claim is not in the Profile JSON, it CANNOT
appear in your output. You are selecting and organizing — never extracting, never inventing.

═══════════════════════════════════════════════════════════════════
CONFERENCE EXTRACTION PHILOSOPHY
═══════════════════════════════════════════════════════════════════
Your task is NOT to summarize the company. Your task is to build the editorial foundation for a
premium experience an investor consumes in ~60–90 seconds while standing at an iPad kiosk.

Conference Mode is the movie trailer. Passport is the feature film.

The experience must give a complete high-level understanding without overwhelming — the story,
the strengths, the current execution, the thesis — clearly enough that the investor wants to scan
the QR code and continue inside Passport. The objective is not to REDUCE information; it is to
ORGANIZE information into a coherent visual narrative.

EDITORIAL PRINCIPLES — before selecting any field, understand the company as a whole. Determine:
what business they are actually building; what management believes is most important; what
differentiates them from peers; what evidence supports the story; what an investor should remember
after one minute. Every element you select must reinforce that same narrative. The result must
feel like ONE continuous story, not ten unrelated pages.

DOCUMENT ROLE:
  • Facts come ONLY from the Profile JSON (which was itself built from authoritative sources).
  • The Corporate Presentation and website tell you what to FEATURE and how to ORDER it —
    narrative, emphasis, featured project, headline stats, competitive framing.
  • Never copy unsupported marketing language. If the presentation promotes a claim, use it only
    if the same fact exists in the Profile JSON.

GROUP, DO NOT FILTER: don't discard important information because there's a lot of it — organize it
into logical themes (Current Program, Capital, Project, Leadership, Evidence). Each theme should
feel complete while staying easy to scan.

ADAPT TO THE COMPANY: read the profile's `archetype` and lead with what actually matters for it —
  • explorer → discovery, drill results, district potential, exploration strategy
  • developer → economics, permitting, engineering, construction readiness
  • producer → production, cash flow, reserve life, expansion
  • royalty → royalty portfolio, producing assets, diversification, cash generation
Set `sectionOrder` to put the strongest theme first. Do not force every company into one template.

NOTHING IMPORTANT IS LOST: if a fact materially aids understanding — geological significance,
financial strength, operating status, exploration progress, ownership, district context,
leadership, catalysts, competitive advantages — it must appear somewhere. Complete understanding
with minimal reading, not minimal information.

THINK VISUALLY: select information that becomes maps, timelines, statistics, progress indicators,
comparisons, and imagery. Prefer hard numbers and short labels over paragraphs.

WRITING STANDARD: factual, analyst voice, never promotional; state things plainly; never reference
share price. Respect the field character limits.

═══════════════════════════════════════════════════════════════════
THE TEN QUESTIONS THE EXPERIENCE MUST ANSWER
═══════════════════════════════════════════════════════════════════
By the end, an investor should know: Who is this company? What do they own? Why does it matter?
What makes them different? What are they doing right now? What evidence supports the story? Are they
financially able to execute? Who is leading? What are the next catalysts? Why keep following inside
Passport? Any question you cannot answer FROM THE PROFILE JSON goes in `conferenceGaps[]`.

═══════════════════════════════════════════════════════════════════
OUTPUT — return a single JSON object named `conference`, exactly these keys
═══════════════════════════════════════════════════════════════════
{
  "enabled": true,
  "style": "board",
  "macroContext": "",
  "kioskIdleTimeout": 90,
  "boothQrUtm": "",

  "hook":        { "headline": "", "subtext": "" },
  "throughLine": "",
  "archetype":   "",
  "sectionOrder": [],

  "keyStats":        [ { "label": "", "value": "" } ],
  "flagshipProjectKey": "",
  "featuredProjectKeys": [],
  "valueDrivers":    [ "" ],
  "differentiators": [ "" ],

  "currentProgram": { "headline": "", "detail": "", "progress": { "current": 0, "total": 0, "unit": "" }, "stats": [ { "label": "", "value": "" } ] },
  "evidence":       { "intercepts": [ { "hole": "", "grade": "", "width": "", "note": "" } ], "proofPoints": [ "" ] },
  "capitalHeadline": "",
  "capitalDetail":   "",
  "capitalStats":    [ { "label": "", "value": "" } ],
  "leadership":      [ { "name": "", "role": "", "note": "" } ],
  "catalysts":       [ { "label": "", "timing": "" } ],
  "cta":             { "line": "", "qr": "/app?c=<slug>" },

  "conferenceGaps":  [ ]
}

RULES FOR THE OUTPUT:
  • Copy all numbers/names/grades/dates VERBATIM from the Profile JSON.
  • Omit a key (or use null / []) rather than invent — a missing progressBar means no `progress`.
  • keyStats: 3–5. differentiators: 2–4. evidence.intercepts: 3–5. leadership: 2–4. catalysts: 1–3.
  • sectionOrder must reference only real section keys and lead with the archetype's strongest theme.
  • Return ONLY the JSON. No commentary, no code fences beyond the object.

THE FINAL TEST: if an investor watched this for 90 seconds, would they leave with an accurate
understanding of the company, remember its most important strengths, understand what management is
trying to accomplish, and feel compelled to scan the QR code? If not, keep refining the selection
until the story is complete, cohesive, and memorable.
```

---

## Open decisions (for you)

1. **Booth layout** — the spec targets **Board** (the editorial scroll the CEO walks through). Your
   philosophy's "walking past a kiosk / 90-second trailer / visual stories" language actually leans
   toward **Scenes** (the auto-play showroom). The `conference` object above feeds *any* of the
   three; only the rendering differs. Which is the real target?
2. **Renderer gap** — the board today auto-renders every profile section. The curation fields above
   (`hook`, `sectionOrder`, `keyStats`, `flagshipProjectKey`, `evidence`…) need a small amount of
   renderer work to actually *drive* the layout. Confirm you want conference to be truly curated
   (worth the code) vs. "show everything, nicely ordered" (almost no code).
3. **Presentation attachment** — OK to attach the Corporate Presentation to the Pass 2 chat as an
   emphasis-only reference (recommended), or keep Pass 2 strictly Profile-JSON-only?
