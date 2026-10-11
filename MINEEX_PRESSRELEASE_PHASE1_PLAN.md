# MineEx Brief — Phase 1 Implementation Plan (for approval)

**Status:** proposal only. No Phase 1 code written. No merge to `main`, no deploy.
**Branch:** continue on `sync/main-into-appupdate-2026-10` (or a dedicated `feature/brief-v1` branch off it).
**Approved design baseline:** commit `db6ba5f` (dev-only benchmark) — the uniform cobalt Key Results rows + optional Takeaway, Bigger Picture removed. Phase 1 makes that layout the *real* reader, fed by generated data.

**Goal (user's words):** every company can upload a press release through MineEx and automatically receive a Brief matching the approved Kingsmen design and editorial standards — accurate, concise, non-repetitive, source-grounded, zero invented/padded content, auto-validated with warnings, editable, company-approved before publish, ≤ $0.25/release (measured), identical output + preview on mobile app and desktop portal.

---

## 0. What already exists (reuse map, verified)

| Capability | Lives in | Reuse / change |
|---|---|---|
| Per-release AI summarizer (Claude) | `api/structure-release.js` (model `claude-sonnet-5`, tool `emit_release_analysis`, `max_tokens 3000`) | **Extend** the tool schema (structured Key Results rows + optional Takeaway); keep its anti-invention prompt |
| PDF → text | `src/lib/pressRelease.js` `extractPdfText`/`formatReleaseText`; `src/lib/pdfText.js` `analyzePdf` | **Reuse as-is**; Claude also reads the PDF natively (`document` block) |
| Full-release render (`{blocks}`) | `src/aiBrief/PassportProto.jsx` `FullText` (~2058) | **Reuse as-is** |
| Reader | `PassportProto.jsx` `SummaryContent` (1898) | **Change**: promote the approved benchmark layout to the real path |
| Canned takeaway | `TAKEAWAY_BY_IMPACT` (`PassportProto.jsx:540`, dup `Onboarding.jsx:344`) | **Retire** — replaced by generated, omittable Takeaway |
| Timeline assembler | `src/lib/structureReleases.js` `assembleTimeline` (180), `toTimelineEntries` (268) | **Change**: stop discarding `evidence[]`; carry structured Key Results + Takeaway |
| Profile→reader compile | `src/lib/profileToPP.js` `mapTimeline` (119) → `{PR_YEARS, FULL}` | **Change**: compile structured Key Results + Takeaway into the reader item |
| Grounding/validation precedent | `api/_extractProfile.js` (`numericPassFailed` 22, `scanNarrativeRisk` 139, verbatim `provenance`, cheap→deep escalation) | **Reuse pattern** for `briefValidate` |
| Human QA | `promptTemplate.js` `QA_PROMPT` (702) + `src/admin/FactCheck.jsx` | **Reuse pattern** for the warnings/approval UI |
| Publish spine | `publications` table → `publish_publication` RPC (`0008_publish_spine.sql:103`) → `PUBLICATION_PUBLISHED` → `api/_listeners.js` (`feed_projection_v1`, `in_app_notifications_v1`) | **Reuse**; publish via the role-gated RPC, not the direct `profile` PATCH |
| Publish auth | `owns_company` (0006:100), `actor_can_publish` (0008:91, role-gated inside RPC) | **Reuse RPC path**; see §6 for the known client-PATCH role gap |
| AI spend control | `api/_aiGuard.js` call-count caps (no dollars for Anthropic); `_aiUsage.js` = OpenAI/news only | **Add** a dollar ledger for the Brief path (new, Anthropic-priced) |

**Key gaps Phase 1 must close:** (a) `keyNumbers` is an array of *strings* — there is no structured `{value, unit, descriptor, secondary, rel}` row model; (b) `classification.evidence[]` is generated but **discarded** by `assembleTimeline`, so nothing can ground on it; (c) the shown takeaway is canned, not generated; (d) there is **no dollar cost ledger** for Anthropic calls; (e) a press-release publish fires **in-app notifications only** (device push exists only on the news pipeline).

---

## 1. Architecture

Pipeline: **Upload → Ingest → Generate (BriefV1) → Validate → Editable preview → Company approval → Publish → Notify**, with one shared Brief object and one shared renderer across mobile + desktop.

```
 upload (PDF/DOCX/paste)
   │  mobile: composer "Press Release" → native file picker (replaces onPost stub)
   │  desktop: CommsCenter / MediaComposer
   ▼
 INGEST  src/lib/pressRelease.js (extractPdfText/formatReleaseText), pdfText.analyzePdf
   │        (+ new DOCX parser; + Claude reads PDF natively as a `document` block)
   ▼
 GENERATE  api/structure-release.js  (extended tool → BriefV1 + per-claim evidence)
   │        model: claude-sonnet-5 (default); records token usage → new dollar ledger
   ▼
 VALIDATE  api/_briefValidate.js  (grounding, number-preservation, dedup, hype, omit-rules)
   │        → warnings[]; escalate cheap→deep on failure (reuse _extractProfile pattern)
   ▼
 DRAFT     publications row (status=draft) : BriefV1 + {blocks} + source + evidence + warnings
   ▼
 PREVIEW   shared <BriefReader> = SummaryContent + FullText  (mobile + desktop identical)
   │        every field editable; validation re-runs on edit; warnings shown inline
   ▼
 APPROVE   company user approves (draft→review→approved); role-gated
   ▼
 PUBLISH   publish_publication RPC → PUBLICATION_PUBLISHED → _listeners
   │        feed_projection_v1 (posts) + in_app_notifications_v1 (in-app)
   └─(opt)  new push listener → notification_outbox → news-push-send path
```

### BriefV1 schema (the one canonical object)
```
headline        string   — factual; measurements preserved; never restates nothing
whatHappened    string   — the event; never restate headline
whyItMatters    string   — significance; never restate whatHappened
keyResults[]    0–4 rows { value, unit, descriptor, secondary?, rel? }
                           value/unit = left column; descriptor/secondary = right column;
                           rel = relationship label (e.g. "INCLUDING") marking an included
                           interval — by LABEL, not size/colour
takeaway        string?  — ONE insight beyond the other sections; OMITTED when none
blocks[]        full release: [{type:text}|{type:image,src,caption}]
evidence[]      per field/number: { field, claim, quote (verbatim) }  — PERSISTED
warnings[]      validator output: uncertain/ungrounded claims for human review
source          { kind:"pdf|docx|text", filename, hash, dateline }
```
This is the Phase-0 schema (`MINEEX_PRESSRELEASE_PLAN.md §5`) with `keyResults` now structured to match the approved rows, `takeaway` explicitly optional/omittable, and `evidence`/`warnings` persisted.

### Delivery milestones (each reviewable; Kingsmen re-benchmark is the gate before any real company)
- **1A — Generator + schema.** Extend `structure-release.js` tool to emit `keyResults[]` rows + optional `takeaway` + keep `evidence[]`; map into stored timeline; **retire `TAKEAWAY_BY_IMPACT`**; promote the approved reader layout to the real `SummaryContent` path. Re-benchmark Kingsmen.
- **1B — Validator.** `briefValidate` (grounding, number-preservation, dedup, hype blocklist, omit-rules) → `warnings[]`; cheap→deep escalation. Unit-tested.
- **1C — Editable preview + parity.** One shared `<BriefReader>` used by mobile and desktop; inline edit + warning surfacing; validation re-runs on edit; delete duplicate previews.
- **1D — Upload + approval + publish.** DOCX parser + native file picker (mobile) wired to the shared core; draft→approve→`publish_publication`; (optional) publish→push bridge.

---

## 2. Affected files

**Change**
- `api/structure-release.js` — extend `emit_release_analysis` schema (`keyResults[]` rows, optional `takeaway`, retained `evidence[]`); add usage recording (§5); optional tiered model.
- `src/lib/structureReleases.js` — `assembleTimeline`/`toTimelineEntries`: carry `keyResults`, `takeaway`, `evidence`, `warnings` into the stored entry (stop discarding evidence).
- `src/lib/profileToPP.js` — `mapTimeline`: compile structured `keyResults` + `takeaway` into the reader `item`; keep `FULL` for `{blocks}`.
- `src/aiBrief/PassportProto.jsx` — `SummaryContent`: make the approved benchmark layout the default (uniform rows + optional Takeaway), driven by real `item` fields; remove the canned "Investor Takeaway"/"Key Numbers"/"Stage Impact" blocks or reconcile; drop the `window.__BRIEF_BENCH__` gate once parity is proven (keep the benchmark reachable until then).
- `src/Onboarding.jsx` — remove the duplicate `TAKEAWAY_BY_IMPACT` + its use.
- `src/lib/publish.js` — route Brief publish through the role-gated `publications`/`publish_publication` path, not the direct `profile` PATCH (§6).
- Mobile composer (the `onPost` stub) + `src/console/CommsCenter.jsx` / `src/portal/MediaComposer.jsx` — wire to the shared ingest/generate/preview/publish core.

**New**
- `api/_briefValidate.js` — the validator (grounding/dedup/number-preservation/hype/omit) returning `warnings[]`.
- `src/components/BriefReader.jsx` (shared thin wrapper = `SummaryContent` + `FullText`) — single preview for mobile + desktop.
- `src/lib/docx.js` — DOCX → text (add `mammoth`; see D3 in DECISIONS).
- Dollar-usage ledger for Anthropic Brief calls (table `brief_ai_usage` + `recordBriefUsage()`), modeled on `_aiUsage.js` but Anthropic-priced.
- Migration(s): BriefV1 columns on `publications` (or a `brief jsonb`), `brief_ai_usage` table; (optional) a push listener + `notification_outbox` enqueue for `PUBLICATION_PUBLISHED`.
- A capacitor file-picker plugin for mobile upload (native dependency → rebuild + resubmit; gated approval).

---

## 3. Validation strategy

Enforced in `briefValidate` (code), not just the prompt — mirrors `_extractProfile.js`:
1. **Grounding.** Every `keyResults` value and every numeric/claim in `headline/whatHappened/whyItMatters/takeaway` must carry an `evidence` entry with a **verbatim** source quote. Missing provenance on a number → withhold that row/flag (`numericPassFailed`-style).
2. **Number preservation.** Diff every extracted number/unit/interval/currency/date against the source text; any value not present verbatim → `warning`. Exact classification wording preserved (no resource↔reserve relabeling, per `_extractProfile` rule).
3. **Non-repetition / dedup.** Cross-section check across `headline/whatHappened/whyItMatters/keyResults/takeaway`; if the Takeaway would restate a fact, number, or conclusion already shown → **omit it** (matches the approved editorial rule).
4. **No invention / no padding.** Optional sections and metric rows omitted when unsupported; never fabricate a second Key Result or a Takeaway to fill space.
5. **Hype blocklist.** Reject promotional phrasing ("strengthens the investment case", "game-changing", …) — reuse/extend the existing block rules.
6. **Narrative risk scan.** `scanNarrativeRisk`-style regex for residual reserve/resource claims in prose → mandatory human review.
7. **Escalation.** Cheap model first pass; on validation failure escalate to the stronger model (reuse the `CHEAP_MODEL → DEEP_MODEL` pattern) before surfacing to the human.
8. **Surfacing.** `warnings[]` render inline in the editable preview (FactCheck-style, jump-to-field); the company must resolve/acknowledge before approval. Validation re-runs on every edit.

**Human gate:** drafts never auto-publish. Company approval (draft→review→approved→published) is required; role-gated.

---

## 4. Testing requirements

- **Kingsmen re-benchmark (the gate).** Run the generator on the 8 real Kingsmen source releases and assert the output reproduces the approved `public/brief-bench.json`: all numbers preserved exactly, correct sections, **Takeaway omitted where we omitted it** (e.g. the 3D IP release), uniform Key Results rows with correct `rel` labels. Must pass before any other company.
- **`briefValidate` unit tests** — fixtures for: ungrounded number (flag), altered number vs source (flag), duplicated Takeaway (omit), padded/invented metric (reject), hype phrase (reject), clean release (0 warnings).
- **Reader golden-file tests** — KR rows render identically to the approved design; Takeaway omit path; 0–4 row counts; long monetary compact display + exact figure in secondary.
- **Parity test** — same BriefV1 → byte-identical rendered preview via the shared `<BriefReader>` on mobile and desktop.
- **Cost measurement** — run the 8 releases through the new ledger; assert measured **≤ $0.25/release** (report actuals, not estimates).
- **Regression** — existing `vite build`, `npm test` (ai-guard, currently 145/0), `check:demo-assets`; plus `predeploy:check`.

---

## 5. Cost (measured, with a recommended strategy)

**No dollar ledger exists for Anthropic today** — only `_aiGuard` call-count caps. Phase 1 adds `brief_ai_usage` + `recordBriefUsage()` (modeled on `_aiUsage.js`) so cost is **measured per release**, not assumed, and a per-company daily **dollar** cap can back the existing call-count caps.

**Projected cost (to be confirmed by measurement), current pricing:**
- Sonnet 5 = $3 / $15 per M (in/out); Haiku 4.5 = $1 / $5 per M.
- Typical release: input ≈ system+schema (~4k) + release text (~3k) ≈ **7k in**; Brief output ≈ **~1.2k out**.
- One Sonnet-5 generation call ≈ 7k×$3/M + 1.2k×$15/M ≈ **$0.039**. Add a validate/refine pass ≈ **+$0.03**. → **~$0.07/release**, ~3.5× under the $0.25 cap. Worst-case long release (~8k-word, PDF document tokens) stays **< $0.15**.

**Recommendation:** **single Sonnet-5 structured-generation call + a validation pass is the default** — it clears the budget with wide headroom and is the safest for the Kingsmen quality gate. Keep **Haiku 4.5 as an optional cheaper tier** for the deterministic validation/dedup pass (and potentially first-pass extraction) once the gate proves quality holds; this could drop cost toward ~$0.02–0.03/release. **Opus is not needed** (no `claude-opus` is used anywhere today). Decision is data-backed after the re-benchmark records real token counts. Add a page/size cap on PDF `document` input to bound the tail.

---

## 6. Rollback plan

- **Feature-flagged & off by default.** BriefV1 generation behind a flag + per-company entitlement (reuse `my_features`); the approved reader layout stays gated until parity is proven, then promoted. Flipping the flag off reverts to today's reader/timeline with no data change.
- **Kill switches reused.** New endpoint sits behind `_aiGuard` → honors `ai_enabled()` (DB) and `AI_ENDPOINTS_DISABLED` (env); the dollar cap adds a second fail-closed brake.
- **Additive storage.** BriefV1 persisted additively (new columns / `brief jsonb` on `publications`, new `brief_ai_usage` table). No destructive migration; the legacy timeline shape keeps working; old and new readers coexist during cutover.
- **Reversible publish.** `unpublish_publication` (emits `PUBLICATION_UNPUBLISHED`) soft-removes the post/feed projection.
- **Human gate = rollback.** Drafts never auto-publish; company approval required, so nothing reaches investors unreviewed.
- **Role-gap fix (publish path).** Known gap: the client `profile` PATCH path relies on `can_touch_company` RLS and does **not** enforce publisher role (only the `publish_publication` RPC does, via `actor_can_publish`). Phase 1 publishes through the **RPC path**, closing the gap for Briefs without a broad authz migration (see `[[authz-role-not-enforced]]`).
- **No main merge / no deploy** until you approve; all work on the feature branch; benchmark commit `db6ba5f` is the known-good design baseline to diff against.

---

## 7. Open approval items (before any 1A code)
1. Scope confirmation: deliver 1A–1D as Phase 1, or split 1D (upload/native/publish) into a follow-on? (The existing roadmap put ingestion/publish in Phases 2–4.)
2. DOCX via `mammoth` (new dep) — OK to add? (DECISIONS D3 = yes.)
3. Storage location for BriefV1: new columns on `publications` vs a `brief jsonb` — DB review required before any migration.
4. Push-on-publish bridge (1D optional) — build now or defer? (News pipeline has the enqueue/send pattern to reuse.)
5. Native file-picker plugin — rebuild + resubmit implication acknowledged?
