# Passport — Full Status Brief
_Last updated: 2026-07-16_

> Context dump for an external LLM. Assumes zero prior knowledge. Written so someone can
> read this cold and tell us what's left to build.

---

## 1. What Passport is

A launch-ready SaaS for **junior mining companies** (small public exploration companies,
typically TSXV/CSE listed). It gives each company an investor-facing profile in a mobile
app, plus tooling to keep it current.

**Business model — concierge onboarding.** The founder (acting as platform admin) builds
and publishes a company's profile *for* them, then hands the account over once the company
signs an annual subscription. The company then owns and controls it.

**Where it's going.** Passport is being extended from "an investor profile" into an
**Investor Communications Operating System**: the company records an update once, and every
destination (Passport profile, website, LinkedIn, X, newsletter, push) updates from it. The
Passport profile becomes *one publishing destination among many*.

---

## 2. Stack & deployment

| Layer | Choice |
|---|---|
| Frontend | Vite + React + Tailwind |
| Routing | **No router** — pathname switch in `src/main.jsx` |
| Backend | Supabase (Postgres + GoTrue auth) |
| Auth | Hand-rolled `src/lib/auth.js`, localStorage sessions |
| Serverless | Vercel functions in `api/` |
| AI | Anthropic API, `claude-sonnet-5`, forced-tool schemas for typed output |
| Host | `passport-xi-five.vercel.app` (Vercel team `50kadayokays-projects`, project `passport`) |

**Note:** `vite build` does NOT compile `api/`. A syntax error in a serverless function
passes the local build and only fails at deploy. Always `node --check api/<file>.js`.

---

## 3. The four surfaces

| Path | File | Purpose |
|---|---|---|
| `/` | `src/site/Site.jsx` | Public marketing site |
| `/app` | `src/aiBrief/PassportProto.jsx` | Investor app — mobile phone-shell UI, the product investors see |
| `/onboarding` | `src/console/CompanyConsole.jsx` → wraps `src/Onboarding.jsx` | Company console + profile builder (desktop only) |
| `/admin` | `src/admin/MissionControl.jsx` | Founder's admin — Mission Control |

The investor app's company profile has **6 sub-tabs**: Overview, Projects, Timeline,
Capital, Team, Media.

---

## 4. Database (Supabase)

**Tables**
- `companies` — `owner_id`, `slug`, `name`, `status`, `primary_ticker`, `profile` (JSONB)
- `profiles` — `id`, `email`, `role` ∈ (`company`, `investor`, `admin`)

**Status lifecycle:** `draft → ready → published → archived`
(needs no migration — RLS already gates on `status = 'published'`)

**RLS**
- anon reads only `status = 'published'`
- owner reads/writes own rows (`owner_id = auth.uid()`)
- `is_admin()` (= `profiles.role = 'admin'`) sees everything

**Storage buckets** (already exist, owner-scoped policies): `company-media`,
`company-logos`, **`company-docs`**

**Migrations applied**
- `0001_security_lockdown.sql` — RLS + is_admin()
- `0002_storage.sql` — the three buckets
- `0003_preview_links.sql`
- `0004_harden_signup_role.sql` — fixed a **privilege-escalation bug**: signup copied
  `raw_user_meta_data->>'role'` straight into `profiles.role`, so `data:{role:"admin"}`
  on signup made you a platform admin. Now allowlisted to `company`/`investor`.

---

## 5. How data reaches the investor app

```
Onboarding builder  →  profile (rich JSONB)
                          │
                    [Publish] → mapProfileToPP()
                          ↓
                    profile.pp (flat render payload)
                          ↓
main.jsx fetches  companies?slug=eq.<slug>&select=pp:profile->pp
                          ↓
                    window.__PP__
                          ↓
       dynamic import PassportProto.jsx
                          ↓
   module-level consts read  _PP.X ?? <Kingsmen default>
```

`applyPP()` swaps the data at runtime (used by the builder's live preview). Every field is
`let` at module level so it's swappable.

**`src/lib/profileToPP.js` — what it maps today:**

| Section | Status |
|---|---|
| COMPANY (identity) | ✅ mapped |
| STATUS (status card) | ✅ mapped |
| ONE_LINER / THESIS | ✅ mapped |
| TEAM_MEMBERS | ✅ mapped |
| STAGES / STAGE_NOW | ✅ mapped |
| PR_YEARS + FULL (timeline) | ✅ mapped |
| **PROJECTS_DATA** | ❌ returns `{}` |
| **CAP** (capital) | ❌ returns empty |

Timeline quirk: `d` must be `"<Mon> <Day>"` because `groupByQuarter` does
`it.d.split(" ")[0]`. `id` is the ISO date and is also the `FULL` key powering
"read full release".

---

## 6. What is BUILT and VERIFIED

### Investor app (`/app`)
- Phone shell, bottom nav, 4 main tabs, company profile with 6 sub-tabs
- Rich timeline: press releases grouped by year/quarter, "read full release" works
- Status card, thesis, team, stage track
- **Projects tab is now fully data-driven** (done 2026-07-16, see §8)

### Onboarding / console
- Account-based loop, ownership, draft/ready/published lifecycle
- Skip button on every page; can Complete with just a company name (for testing)
- Green "Complete" button → `ready` → lands in admin's "Ready for Publish"
- Drag-and-drop document ingestion → AI extraction → timeline
- `?company=<slug>` lets admin drive any company's console

### Admin (`/admin`)
- Company list by logo + name, status filters
- **Ready for Publish** folder, preview pane with edit toggle, multi-select → Publish
- Archive (off the app, toggleable back on)
- **Audience Card** section (see below)

### AI engines (all deployed and tested against production)
| Endpoint | Does |
|---|---|
| `/api/structure-release` | Analyzes one press release (accepts text or base64 PDF) → structured entry |
| `/api/synthesize-profile` | Chronology → `companyStatus` + `companyBrief` |
| `/api/audience-card` | 5–7 grounded selling points, each with a **verbatim quote** for provenance |
| `/api/extract-projects` | **NEW** — drafts full project pages from the release corpus |

### Audience Card (`src/admin/AudienceCard.jsx`)
A shareable 1080×1350 (4:5) video for X/Twitter. Canvas + `captureStream()` +
`MediaRecorder` (prefers `video/mp4;codecs=avc1.42E01E`, falls back to WebM).

Three faces:
1. Company logo + ticker symbols fading up over the project photo (background removed
   from the logo via border flood-fill, tolerance 18, with a safety net)
2. Flip → **white** checklist of 5–7 selling points cascading in, under a full-bleed
   animated **cloud banner** ("WHY INVESTORS ARE WATCHING" + company name)
3. Flip → brand outro ("ANALYZED & PRESENTED BY …")

- **20 cloud colour palettes**, selectable via dots. Animation identical across all.
- **"Check your work"** button — shows the exact source release each point came from, with
  the verbatim quote highlighted. Adversarially tested: fabricated and paraphrased quotes
  correctly fail verification.
- 7-point runtime **13.06s** (under the 15s watch-time target), 4.1s hold once all points
  are on screen.

---

## 7. The Kingsmen situation (important context)

**Kingsmen Resources Ltd. (TSXV:KNG)** is a real junior miner and the demo/template
company. Its profile was **authored by hand** — it is not the output of the pipeline.

Kingsmen's data was hardcoded throughout `PassportProto.jsx` (6,252 lines) as the default
for every field. The pattern `_PP.X ?? <Kingsmen default>` means: if a company supplies
data it wins; if not, Kingsmen shows. That was fine for the demo and **catastrophic for
real customers** — a published company would render Kingsmen's projects.

Kingsmen also has **55 real press releases** stored in `profile.pp.FULL`
(557,348 chars, Apr 2023 → May 2026). This is the test corpus.

**The founder's admin account also *owns* the Kingsmen company row**, which caused a
"Welcome back, Kingsmen" bug (fixed).

---

## 8. Work completed 2026-07-16 (today)

### A. Audience Card refinements
- Cloud banner now **full-bleed** to the card edges (was an inset widget) → +20px for points
- **2.8× faster** cloud drift (old speeds took ~18s to cross, so nothing appeared to move)
- Slower cascade: 0.52s stagger, 4.1s hold with all points visible
- **20 palettes** (Azure, Cobalt, Citrus, Lime, Ember, Coral, Violet, Forest, Sage, Ochre,
  Graphite, Periwinkle, Teal, Midnight, Clay, Rust, Scarlet, Kelly, Taupe, Bone)
- Ink-aware halo behind the banner title — the near-white cloud centres drift under the
  type and were washing out white text on pale themes

### B. ProjectsView de-hardcode (the big correctness fix)
**Problem:** `ProjectsView` read a `PROJ` object declared *inside the component*, which
`applyPP` could never reach. Every published company showed Las Coloradas + Almoloya.
`MAP_SITES` hardcoded Chihuahua pins for everyone.

**Fixed:**
- `PROJECTS_FULL` is now a module-level `__PP__`-swappable source; Kingsmen's literal stays
  inline as the fallback (`null` → built-ins), so the demo is unchanged **by construction**
- Folded the per-project constants (`LC_SNAP`/`LC_STAGE`/`LC_UNIQUE`/`LC_CARDS` + `AM_*`)
  into each project entry, removing the `sel === "lc" ? … : …` ternaries
- **Icon registry**: project data arrives from Supabase as JSON and cannot carry a React
  component, so entries name their icon (`"MapPin"`) and resolve it at render. *This was
  the actual blocker on data-driving the page, not the mapper.*
- Supports **N projects** (was exactly 2); tabs scroll past two; a single project gets a
  title (its name previously never rendered at all); zero projects → empty state
- **Every block degrades independently** — gallery, map, brief, snapshot, stage track,
  technical cards, value drivers and their sheets each render only if data exists
- Map: `MAP_SITES` / `MAP_TOWN` / `MAP_BBOX` are data; frame computes from whatever is
  pinned via `computeBbox()`; Kingsmen keeps its hand-tuned literal bbox (computing it from
  its own pins widened the frame and changed the demo)

**Verified** in-browser across 4 states: Kingsmen (unchanged), empty company, name-only
project, two-project company with partial data. Zero Kingsmen strings leak into any
non-Kingsmen state.

### C. `/api/extract-projects` + the extraction spike

**The question:** the rich project page needs ~260 lines of structured prose per project
(12 sub-objects: brief, location, commodities, land, targets, stage, district, geology,
strategy, results, unique, scenarios). No CEO will type that. **Can the AI extract it from
press releases?**

**Method:** fed all 55 real Kingsmen releases in, graded against the hand-written Las
Coloradas page (a rare gold standard — real input + known-good output).

**Answer: YES.** In places it beats the hand-written page.

| Field | Result |
|---|---|
| Drill results | ✅ **Excellent** — real hole IDs (LC-25-010, 1,028 g/t AgEq), exact disclosed grades. Hand-written page only had generic labels ("Discovery Hole") |
| Nearby operations | ✅ **Excellent** — Cordero (Discovery Silver), La Cigarra (Kootenay), Santa Barbara (Grupo Mexico), with distances. Juniors name-drop neighbours constantly |
| Historic detail | ✅ **Richer than hand-written** — "mined 1943–1952, workings >250m strike to 125m depth, stopped at the water table, 0.6–0.8 g/t Au, 300–518 g/t Ag" vs. the page's "Historically mined by ASARCO" |
| Snapshot fundamentals | ✅ All 6 sub-blocks |
| Geology / targets / brief / unique / scenarios | ✅ (Almoloya returned all of them) |
| **Coordinates** | ❌ **0 pins for Las Coloradas** — no lat/lon in any release (correctly reported, not faked). Almoloya returned 3 |
| **Infrastructure** (road/power/water) | ❌ Genuinely absent from releases |

**Bonus finding:** the AI discovered a **third asset the hand-written page omits** — a 1%
NSR royalty on GoGold's Los Ricos North — and correctly flagged it as "royalty interest
only, not operated by Kingsmen."

**Key technical findings**
- The corpus is **~139k tokens and fits the 1M context window whole** → **no RAG, no
  chunking, no embeddings vendor needed.** Every call sees every release.
- Prompt caching works: 166k tokens read from cache at ~90% off.
- **Cost: ~$2.50–3.00 per company**, one-time.
- **Vercel's gateway kills any request at 60s**, and `maxDuration: 300` does NOT override
  it on the current plan. Output tokens drive latency (~95 tok/s), so anything over ~4,500
  output tokens dies. → Split into parts: `discover / snapshot / geology / results /
  narrative`, each with a small schema.
- **Schema descriptions matter enormously.** A bare `infrastructure` object with no
  description became a catch-all — the model filled it with ownership, geophysics and
  drill-program facts *while simultaneously reporting in `notFound` that no infrastructure
  data existed*. That's ambiguity, not hallucination. Fixed with a narrow description + a
  label enum; it now correctly omits the block.

---

## 9. KNOWN ISSUES / GAPS (the honest list)

### 🚨 Security
1. **Every AI endpoint is unauthenticated.** `/api/extract-projects`, `/api/audience-card`,
   `/api/structure-release`, `/api/synthesize-profile` check only that the API key env var
   exists. Verified by calling one with plain `curl`, no credentials — it ran a $2.54
   extraction. Anyone with the URL can burn the Anthropic balance. This becomes a revenue
   problem the moment features are paid.

### Functional gaps
2. **Projects onboarding collects only `{id, enabled, name}`.** `templateFor(id)` maps
   odd projects → Las Coloradas template, even → Almoloya. **The Kingsmen data is currently
   load-bearing placeholder content**, not a leftover. The renderer is now data-driven but
   nothing fills it.
3. **Capital is not mapped.** `CAP` returns empty → published companies show zeros.
4. **Preview ≠ publish.** The onboarding preview and `/admin` render
   `src/aiBrief/screens/CompanyProfile.jsx` (simple, data-driven). `/app` renders
   `PassportProto.jsx` (rich). They are different components.
5. **`src/aiBrief/App.jsx` is dead code** — nothing imports it.
6. **No document store.** `extractCorpus` reads dropped files, produces `profile.timeline`,
   and **throws the originals away.** Every onboarding permanently destroys corpus that
   cannot be backfilled. The `company-docs` bucket exists; the `documents` table does not.
7. **No real company has been run end-to-end** (onboard → extract → complete → publish).
   Kingsmen was authored by hand.

### Infrastructure
8. **Vercel Git integration is broken** — `git push` no longer triggers builds. Deploys go
   through `vercel deploy --prod` from the CLI.
9. **60s serverless gateway cap** (see §8C).

---

## 10. Decisions already made (don't relitigate)

| Decision | Why |
|---|---|
| **Rich project page, degrading gracefully** (not simple/generic) | Validated by the extraction spike — the AI can fill it |
| **`profile.pp` becomes a derived build artifact, not the source of truth** | Lets memory→facts→compile→publish work without touching the renderer. Makes "Passport profile is just one destination" real |
| **Corpus-in-context, not RAG** | 139k tokens fits 1M whole. Add RAG only if a company overflows (a few NI 43-101 technical reports would — each ~150k tokens) |
| **AI Analyst: CUT** | NI 43-101 requires a Qualified Person to sign technical disclosure; an LLM is not one. And LLMs cannot do geostatistics — asked for a probability map they confabulate something that *looks* like competent kriging. The grounded half (retrieval/comparison over the corpus) lives in CEO Copilot instead: **retrieve and compare, never interpret** |
| **Feature permissions must be server-enforced** | A `can()` helper in React is UX, not enforcement |
| **Store documents before building the AI on top** | Storage is ~$0.25/company/month (Supabase Pro: $25/mo incl. 100GB). The bill was never the reason to wait; the reason to act is that un-stored corpus is unrecoverable |

---

## 11. The target vision (5 engines)

```
Engine 1 — Company Memory      Everything flows in. Documents → AI extract → structured facts.
                               Projects, people, drill results, quotes, dates, photos,
                               timeline events, capital, technical reports.
                               → single source of truth.

Engine 2 — Communications      CEO writes ONE line: "Completed hole LC-27, assays submitted."
                               AI determines what changed: timeline? projects? website?
                               social? newsletter?

Engine 3 — AI Content          Generates destination-specific versions from the same source:
                               website article, timeline entry, LinkedIn, X thread,
                               newsletter, push notification.

Engine 4 — Approval            Nothing auto-publishes. Preview → edit → approve → publish.

Engine 5 — Publisher           Every destination is a connector implementing publish().
                               Passport / Website / LinkedIn / X / Newsletter / API.
                               Add Instagram, Mailchimp, WordPress without touching the rest.
```

**Data model direction:**
`Company → Documents → Media → Facts → Updates → Publications → Destinations → Analytics`

Every publication records `generated_from: update_#248`, so if the update changes,
everything regenerates.

**Subscription tiers (one app, feature-gated — never `if (plan === "tier2")`):**
| Tier | Adds |
|---|---|
| **Passport** | Profile management. Documents update overview/projects/timeline/capital/team/media. No external publishing. |
| **Passport Communications** | + Communications Center, connectors, multi-destination publishing |
| **Passport Managed Presence** | + investor website, hosting, maintenance, SEO, priority support |

Features are data (`passport_profile`, `communications_center`, `linkedin_publish`,
`x_publish`, `newsletter_publish`, `website_publish`, `analytics`, `custom_website`).
Plans are just bundles of features. Components check `can("communications_center")`.

---

## 12. Immediate roadmap as currently understood

**In progress:** migration `0005` — feature permissions + Communications Center models
(features / plans / plan_features / company_features / documents / facts / updates /
destinations / company_destinations / publications), all with RLS matching the existing
owner-or-admin pattern.

**Then, roughly in order:**
1. **Authenticate the AI endpoints** (blocks everything paid)
2. **Document store** — `documents` table + wire the existing `company-docs` bucket, so
   onboarding stops destroying corpus
3. **Map `PROJECTS_DATA` + `CAP`** — connect `extract-projects` output → `profileToPP` →
   the (now data-driven) renderer
4. **Onboarding Projects form** — a *correction* surface over AI drafts, not an authoring one
5. **Run one real company end-to-end** (never done)
6. Communications Center UI shell → update model → generation → approval → publisher
7. Website widgets (embeddable timeline / news / projects / status card) — cheap, sellable,
   and puts Passport on every client's IR page
8. CEO Copilot (chat over the corpus — no RAG needed)
9. Analytics (needs an events pipeline that doesn't exist yet)
10. Conference toolkit, annual report builder, mining intelligence network

---

## 13. Questions worth asking an outside reviewer

- Is the tier split (Passport / Communications / Managed Presence) the right packaging for
  junior miners, or should Communications be the entry product?
- The event-first workflow ("the press release is the wrong input — record the *event* and
  generate the release") is the strongest strategic idea on the table. It changes onboarding
  from "import your history" to "record what's happening now." What's the right sequencing —
  does it need customers living in the product daily first?
- Connector OAuth tokens: where do they live? A company-readable `config` JSONB is wrong.
- What obligations attach to AI-drafted content for a **regulated issuer**? Everything
  generated is grounded + provenance-checked, and nothing auto-publishes — is that enough?
- Is concierge onboarding a bridge to self-serve, or the actual long-term business?
