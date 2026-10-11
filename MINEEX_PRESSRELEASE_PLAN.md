# MineEx — Unified Press-Release Publishing + Standardized Brief

**Status:** AUDIT + PLAN for approval. No code, migrations, or deploy until you approve.
**Date:** 2026-10-10 · **Branch:** `sync/main-into-appupdate-2026-10`
**Goal:** one publishing engine, equally capable on mobile + desktop: `+ → Publish Press Release → Select File → Auto-process → Preview/Edit → Approve & Publish`, with a standardized, source-grounded MineEx Brief.

---

## 1. Headline finding

**~70% of this already exists and is production-grade.** The event-sourced publish spine, the follower-notification path, the AI that generates the exact Brief fields, the figure-capable reader, and the faithful preview mechanism are all built. The real work is: a **figure-aware ingestion producer**, a **native file picker + DOCX**, **wiring mobile publish (today a no-op stub)**, **one shared preview**, and turning **grounding/validation from a manual ChatGPT prompt into code** — plus deleting duplicated/legacy paths.

---

## 2. What EXISTS and is reusable

| Capability | Where | Notes |
|---|---|---|
| Atomic, idempotent, event-sourced publish | `publish_publication` RPC (0008) → `events`/`event_deliveries` → `dispatch.js` | Production-grade backbone |
| Publish is **role-enforced** | `actor_can_publish` (owner/admin/publisher) | Correct for the status flip |
| Client publish entry (cross-device) | `src/lib/publishClient.js` `publishViaApi`; `api/publish.js` | Already used by CommsCenter/PublishPanel |
| Investor feed projection | `feed_projection_v1` → `posts` → `feed_*` RPCs → `src/lib/feed.js` | Published release → Today feed |
| In-app follower notifications on publish | `in_app_notifications_v1` → `notifications` (prefs-aware, press_release only) | Writes in-app rows (no push) |
| Real APNs/FCM sender | `api/news-push-send.js`, `_fcm.js`, `_push.js`, `push_tokens`, `notification_outbox` | Reusable sender; wired to **news**, not publications |
| Cross-device draft substrate | `publications.status='draft'` server rows | Resume = re-read the draft |
| Profile undo/version safety net | `company_profile_versions` + `src/lib/profileVersions.js` | Backup for any Kingsmen write |
| PDF → text (2 extractors) | `src/lib/pressRelease.js` `extractPdfText` (+ `formatReleaseText`), `src/lib/pdfText.js` (`pdfToText`, `analyzePdf` scanned-detection) | Line reconstruction + cleaning |
| AI per-release Brief generator | `api/structure-release.js` `emit_release_analysis` (claude-sonnet-5) | Emits `headline, whatHappened, whyItMatters, whatHappensNext, keyNumbers[], investorTakeaway, stageFrom/To` **+ `evidence[]{claim,quote}`** |
| ~~Company-level "Broader Context"~~ | ~~`api/synthesize-profile.js`~~ | **Dropped from BriefV1** (see §5) — Bigger Picture / Broader Context removed from the Brief after dev-benchmark review |
| Metric-card selector | `src/aiBrief/proHighlights.js` `buildProHighlights` | Reusable for Key Results cards |
| Grounding/validation pattern | `api/_extractProfile.js` provenance + `scanNarrativeRisk`; `QA_PROMPT`; `FactCheck.jsx` evidence-audit | Proven — but QA is a **manual** ChatGPT prompt |
| **Figure-capable full-release reader** | `FullText` (PassportProto.jsx:1977) — supports `{blocks:[{type:image,src,caption}|{text}]}` interleaved | The target render format already renders |
| Investor render surfaces | `TimelineView`, `SummaryContent`, `BoothTimeline` (exported) | |
| **Faithful live preview** | mount exported `CompanyProfile` + `applyPP`/`setPpFrame`/`setPpPreviewLive` (proven in `ProfileEditor.AppPreview`) | Pixel-accurate; the preview mechanism to reuse |
| Figure upload to Storage | `src/lib/storage.js` `uploadCompanyMedia` (bucket `company-media`), `flushProfileAssets` (base64→URL) | |

## 3. What's MISSING (the build list)

1. **Figure/table/caption extraction → the `{blocks}` model.** Current PDF path is text-only; the content-block format has **no producer** (the 58-release fixture was hand-authored). *Central missing piece.*
2. **DOCX support anywhere** — no parser, not an accepted upload type.
3. **`mapTimeline` can't emit `{blocks}`** — only flat `{text, images[]}` (uncaptioned, unordered). Must extend end-to-end (`timeline[i]` → `FULL` blocks).
4. **Native file picker** for iPhone Files/iCloud — no Capacitor filesystem/file-picker plugin installed.
5. **Mobile publish is a no-op** — composer `onPost={() => {}}` (PassportProto.jsx:11959–60); image-only + caption, no PDF, no block authoring, no spine call.
6. **Standardized single Brief schema** + surface/persist the generated `investorTakeaway` and `evidence[]` (today discarded) and **retire `TAKEAWAY_BY_IMPACT`** — 4 hardcoded strings keyed on impact tier = *your repetition complaint*.
7. **Programmatic grounding + repetition/dedup validator** (headline vs whyItMatters vs keyNumbers), run in code, not pasted ChatGPT.
8. **One shared preview component** (kill duplicated `admin/PressReleases.Preview` and `CommsCenter.DraftBody`).
9. **Role enforcement on draft writes** — `owns_company` checks membership *existence*, not role; any active member can write drafts (authz change → your approval; see `MINEEX_AUTHZ_AUDIT.md`).
10. **Push-on-publish bridge** — spine emits in-app rows but never enqueues APNs/FCM; bridge `PUBLICATION_PUBLISHED` → `notification_outbox`, reconciling `company_follows` vs `user_company_relationships`.
11. **Two disconnected stores** — `profile.timeline` (full text/figures, admin-only annotation) vs `posts` (feed). Decide canonical or write both.

## 4. Target architecture — ONE engine, thin platform shells

**Shared core (platform-agnostic, `src/lib/`) — identical on mobile + desktop:**
- **Ingest** (`releaseIngest`): file → canonical parsed release `{ text, figures:[{image, caption, order}] }`. PDF text via `extractPdfText`; **new** PDF figure extraction (pdf.js image ops / page render); **new** DOCX via `mammoth` → HTML → text+images. Scanned-PDF → existing Haiku transcription fallback.
- **Structure + Brief** (extend `api/structure-release.js`): one forced-tool call emits **BriefV1** (below) **and** figure placement → the `{blocks}` interleaved reader model. Same call returns `evidence[]` per field.
- **Validate** (`briefValidate`, new, code): grounding (each factual claim maps to a source passage), repetition/dedup guard, unit/number preservation check, hype-phrase blocklist. Re-run after any user edit.
- **Persist**: draft = `publications` row (`content` jsonb = BriefV1 + blocks + source-doc ref). Figures → `company-media` Storage. Resume = re-read the draft (cross-device, already RLS-readable).
- **Publish**: existing spine (`publishViaApi` → `publish_publication`); extend `feed_projection_v1` to also write a `profile.timeline` entry with blocks (or make `posts` canonical and render the timeline from it — see Open Decision 1). Notifications via existing in-app + new push bridge.

**Thin shells (reuse 100% of the core):**
- **Mobile**: wire the composer's "Press Release" path → native file picker → shared ingest → shared Brief/preview → shared publish. Replace the `onPost` stub.
- **Desktop**: CommsCenter / new "Publish Press Release" flow drives the *same* core + the *same* preview.
- **Shared preview**: export a thin Reader wrapper (`FullText` + `SummaryContent`) **or** inject the draft into `pp` and mount `CompanyProfile`; both platforms use it. Delete the two duplicate previews.

## 5. The standardized MineEx Brief (BriefV1)

**Schema** (maps 1:1 to your spec; most fields already generated by `structure-release.js`):
```
headline            string   — factual, measurements preserved, no boilerplate
whatHappened        string   — 1–2 sentences, the actual event (never restate headline)
whyItMatters        string   — 1–2 sentences significance (never restate whatHappened)
keyResults[]        2–4 uniform rows { value, unit, descriptor, secondary, rel? }  — adapts to drill/finance/M&A/exploration; `rel` = relationship label (e.g. INCLUDING) distinguishing a primary result from an included interval, by label not sizing
takeaway            string?  — optional; ONE genuine insight that adds value beyond headline/whatHappened/whyItMatters/keyResults; omit entirely when none exists (never filler)
blocks[]            full release: interleaved {type:text} | {type:image,src,caption}
evidence[]          per claim: { field, claim, sourcePassage }   — persisted, powers validation + optional citation UI
```
> **Dev-benchmark decision (2026-10):** the **Bigger Picture / Broader Context** section is **removed** from BriefV1. The Brief is: headline → What Happened → Why It Matters → Key Results (uniform rows) → The Takeaway (optional, omitted when no genuine insight). Any verified history that previously lived in Broader Context is folded into Why It Matters only when genuinely necessary — never as a separate panel.
**Editorial rules → enforced in `briefValidate`, not just in the prompt:**
- Each section carries new information; dedup check across headline/whatHappened/whyItMatters/keyResults/takeaway.
- The Takeaway must not restate a fact, number, or conclusion already in another section; if it would, omit it.
- Preserve exact grades, intervals, drill-hole IDs, currencies, dates (number-preservation diff vs source).
- Every factual claim traceable to a passage (`evidence`); unsupported → flagged, not published.
- Hype-phrase blocklist ("strengthens the investment case", "game-changing", "materially re-rates", …).
- Omit optional sections/metrics when unsupported — never invent to fill space.
**Visual:** premium research-card styling (strong type, hierarchy, prominent metric cards), 10–15s glance, balanced on iPhone — rendered by the **same** investor components mobile + desktop. Every section/metric editable pre-publish; validation re-runs on edit.

## 6. Phased plan (each phase reviewable; Kingsmen is the quality gate)

- **Phase 0 — Benchmark & spec (no app code):** finalize BriefV1 + validation rules; run the **Kingsmen comparison** — current repetitive summaries vs new format on real releases — and **demonstrate improvement before broad rollout** (your explicit gate). Deliverable: side-by-side report.
- **Phase 1 — Brief generator + validator:** standardize BriefV1 from `structure-release.js`; add `briefValidate` (grounding + dedup); surface/persist `investorTakeaway`+`evidence`; **retire `TAKEAWAY_BY_IMPACT`**; render in `SummaryContent`. Uses existing text extraction (no new ingestion yet). Re-benchmark Kingsmen.
- **Phase 2 — Figure-aware ingestion → `{blocks}`:** PDF figure extraction + DOCX parser + `mapTimeline` `{blocks}` support + figure upload to Storage; faithful full-release preview via shared `FullText`.
- **Phase 3 — Unified draft + publish + shared preview:** draft = `publications` (BriefV1+blocks+source), cross-device resume, publish via spine; extend feed projection → timeline; one shared preview (delete duplicates).
- **Phase 4 — Mobile end-to-end:** add native file-picker plugin; wire composer (replace `onPost` stub) to the shared core; native build + simulator verify.
- **Phase 5 — Notifications + roles:** push-on-publish bridge (`PUBLICATION_PUBLISHED` → `notification_outbox`), follower-model reconciliation; role-enforced draft writes (authz migration).
- **Phase 6 — Hardening & self-serve:** cost controls (caching, batching, tiered models, human approval), automated QA, broad rollout to onboarded companies.

## 7. Safety & approval gates (nothing proceeds without your OK)
- **Migrations/schema:** draft content shape, push bridge, authz role-gating, any new columns.
- **Native dependency:** a Capacitor file-picker plugin changes the native build → rebuild + resubmit.
- **Kingsmen writes:** backup (`company_profile_versions`) + explicit approval; draft row first, never the live published row blindly (pp-override trap).
- **Paid AI calls:** real Anthropic/OpenAI usage has cost — gated, cached, tiered.
- **Deploy:** none without your say-so.

## 8. Open decisions for you
1. **Canonical store:** `profile.timeline` (figure-rich) vs `posts` (feed) — or write both? (Affects where the release of record lives.)
2. **Figure extraction fidelity:** render PDF pages → images (simpler, lower fidelity) vs extract embedded rasters + associate captions (higher fidelity, more work/cost).
3. **DOCX:** client-side (`mammoth`) vs server-side.
4. **Mobile file picker:** `@capawesome/capacitor-file-picker` (recommended) — confirm adding the native dep.
5. **Push on publish:** bridge the spine into `notification_outbox` vs route publishes through `news_items`.
6. **Role enforcement timing:** enforce publish roles on draft writes now, or defer until non-owner roles are actually minted.
7. **Model/cost ceiling** for Brief generation.
