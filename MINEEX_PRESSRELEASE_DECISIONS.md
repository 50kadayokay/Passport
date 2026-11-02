# MineEx Press-Release — §8 Architectural Decisions

Recommendation · Alternatives · Consequences for each of the 7 open decisions in `MINEEX_PRESSRELEASE_PLAN.md`.
Your stated preliminary preferences are noted inline. **These are decisions for approval — nothing here is implemented.**

---

## D1 — Canonical store for a published release
*Your preference: one canonical published release shared across the company timeline and the investor feed.*

- **Recommendation (matches your preference): single source of record = the publish spine's `publications` row; project it to BOTH surfaces.** On `PUBLICATION_PUBLISHED`, the existing `feed_projection_v1` listener already writes the feed `posts` row; add a second projection that writes the same release (with its `{blocks}` body) into the company's `profile.timeline`. One approval → one record → appears identically in the Today feed and on the company's Passport timeline. The `{blocks}` content-block body is stored once, on the canonical record.
- **Alternatives:**
  - *Two stores, written in parallel by the composer* — simpler to build, but they can drift (today's exact bug: `profile.timeline` full text is invisible to the feed). Rejected.
  - *Make `posts` the only store and render the company timeline from `posts`* — cleanest long-term, but reworks the investor timeline's data source (`PR_YEARS`/`FULL` from `profile.pp`) and risks the Kingsmen prototype path. Higher blast radius.
- **Consequences:** one new projection listener + a migration touching how `profile.timeline` is written on publish; must reconcile the historical `profile.timeline` entries with new spine-written ones; retire the dead `src/lib/publish.js` connector. Benefit: the "disconnected stores" gap closes and there is exactly one thing to approve and publish.

## D2 — Figure/table extraction fidelity
*Your preference: figure-aware extraction with original-PDF preservation and a page-rendering fallback.*

- **Recommendation (matches your preference): three-tier, preserve the original.**
  1. **Preserve** the source PDF/DOCX in Storage, always (audit + re-processing + "view original").
  2. **Extract embedded figures + associate captions** where the document exposes them (pdf.js image operators / DOCX media + nearby "Figure N" text) → true `{blocks}` with real captions.
  3. **Page-render fallback**: when embedded extraction is unreliable or the PDF is scanned/image-only (detected today by `analyzePdf`), render the relevant pages to images and place them as figure blocks.
- **Alternatives:**
  - *Page-render only* — simplest, always works, but figures come out as whole-page screenshots (lower fidelity, text baked into images, larger assets). Good as the fallback, weak as the default.
  - *Embedded-only* — highest fidelity but fails on scanned PDFs and messy encodings, with no graceful degradation.
- **Consequences:** most engineering of any decision (figure detection + caption association is the hard part, and the central missing producer); Storage cost for original + figures; a per-figure cost/latency budget. Tier 3 guarantees no release is ever figure-less. Tables remain an open sub-question (render-as-image first; structured-table parsing later).

## D3 — DOCX parsing location
- **Recommendation: client-side first, with `mammoth`.** Parse DOCX → HTML → text + inline images in the browser/WebView (same place PDF text extraction already runs), so one ingest path serves both formats and no server round-trip is needed for the common case.
- **Alternatives:**
  - *Server-side* — keeps heavy parsing off low-end devices and centralizes logic, but adds an upload-before-preview round-trip and server surface. Better if mobile parsing proves too heavy.
  - *Convert DOCX→PDF first* — reuses the PDF path but needs a converter (another dependency/service) and loses DOCX structure. Rejected.
- **Consequences:** `mammoth` is a well-maintained, permissive-license library; adds bundle weight (lazy-load it, like pdf.js). DOCX is far simpler than PDF for figures (media parts are explicit), so this is lower-risk than D2. Revisit server-side only if device performance disappoints.

## D4 — Mobile file picker
*Your preference: native iPhone file selection if required for reliable Files/iCloud support.*

- **Recommendation (matches your preference): add `@capawesome/capacitor-file-picker`.** A bare web `<input type=file>` in the WKWebView gives camera/photo-library but not reliable Files/iCloud Drive document selection; the native picker returns PDFs/DOCX from Files, iCloud Drive and third-party providers. Keep the web `<input>` path for desktop so the shared composer works everywhere.
- **Alternatives:**
  - *`@capacitor/filesystem`* — lower-level; still needs a document-picker UI; more glue.
  - *Web `<input>` only* — zero native change, but unreliable for iCloud documents (the reason you flagged this). Insufficient for the requirement.
- **Consequences:** a **native dependency → `cap sync` + rebuild + App Store resubmit**; one more plugin to maintain and keep Capacitor-version-aligned. This is the only decision here that gates on an App Store submission, so it should land in its own phase (Phase 4) with native verification. (Also relates to the flagged `Package.swift` reproducibility fix.)

## D5 — Push notifications on publish
- **Recommendation: bridge the spine into the existing push outbox.** Add a listener on `PUBLICATION_PUBLISHED` that enqueues `notification_outbox` rows for followers, reusing the APNs/FCM sender as-is. First reconcile the two follow models — the spine's `company_follows` vs the push pipeline's `user_company_relationships` — picking one as canonical (recommend `company_follows`, since in-app notifications already use it).
- **Alternatives:**
  - *Route publishes through `news_items`* — reuses `news-notify.js` wholesale with no new listener, but forces press releases into the news data model and its paid-tier gating, blurring "company release" vs "news." Rejected.
  - *In-app only (no push)* — already works today; zero new infra, but no lock-screen reach.
- **Consequences:** a new listener + follower-model reconciliation (a migration or a mapping view); respect existing `notification_prefs` (muted / min-materiality) and paid-tier rules; the APNs/FCM sender and tokens need no change. Depends on D1 (the canonical published record is what triggers it).

## D6 — Role enforcement on draft writes
- **Recommendation: enforce publish-capable roles on draft/profile writes when non-owner roles are first minted — not before — but build the UI role-aware now.** Publishing is *already* role-enforced (`actor_can_publish` = owner/admin/publisher). The gap is that *draft* writes gate on `owns_company` (membership existence, no role). Today only `owner` exists, so it's latent. Tie the fix to the moment editors/analysts/viewers are actually invited.
- **Alternatives:**
  - *Enforce now* — tightest, but an authz migration (`owns_company` split into existence-vs-role, or a new `can_edit_company`) with blast radius across every `can_touch_company` policy, for a risk that can't yet occur. Premature.
  - *Never enforce* — unacceptable once non-owner roles ship (an analyst/viewer could edit drafts and publish). Not an option long-term.
- **Consequences:** low effort now (UI reads `__CO_ROLE__` / `my_company_role`, already captured); the DB migration is deferred to the roles rollout and **requires your approval** (schema + authorization change). Documented in `MINEEX_AUTHZ_AUDIT.md`.

## D7 — Model & cost ceiling for Brief generation
- **Recommendation: tiered, cached, approval-gated.** Draft the Brief with a strong model (keep today's `claude-sonnet-5` in `structure-release.js`, or newer); run the cheap programmatic validator (grounding + dedup) in code with no model cost; reserve a second model pass only for flagged failures. Cache by document hash so re-opening a draft or re-previewing costs nothing. Human approval before any publish. One AI generation per release, not per edit (validate edits in code; only re-generate on request).
- **Alternatives:**
  - *Always use the top model, every edit* — best quality, worst cost; unnecessary given edits are user-driven.
  - *Cheapest model throughout* — risks exactly the fabrication/omission problems the editorial rules exist to prevent; false economy for the flagship feature.
- **Consequences:** needs a per-company/tier budget ceiling and the existing spend gate (`_aiGuard` / `_entitlement`); set a hard cap and a cache. Self-serve clients inherit the same tiering automatically. You set the ceiling (e.g. $ per release / per month) before Phase 1 real calls.

---

### Summary of recommendations vs your preferences
| # | Decision | Recommendation | Your stated preference |
|---|---|---|---|
| D1 | Canonical store | One record (spine) → projected to feed + timeline | ✅ one canonical release |
| D2 | Figure fidelity | Preserve original + embedded extraction + page-render fallback | ✅ figure-aware + preservation + page fallback |
| D3 | DOCX | Client-side `mammoth` first | (none stated) |
| D4 | Mobile picker | `@capawesome/capacitor-file-picker` | ✅ native if required |
| D5 | Push on publish | Bridge spine → `notification_outbox` (reconcile follows) | (none stated) |
| D6 | Role enforcement | Defer migration to roles rollout; UI role-aware now | (none stated) |
| D7 | Model/cost | Tiered + cached + approval-gated | (none stated) |

All three of your preferences align with the recommendations. **Still your calls:** D3, D5, D6, D7 — and confirmation of D1/D2/D4 as recommended. None implemented until you approve Phase 1.

---

## FINALIZED — decisions approved (2026-10-10)
Recorded as approved. **Nothing implemented; no production changes.**

| # | Approved decision |
|---|---|
| **D1** | One canonical published release, referenced by both the company timeline and the investor feed. |
| **D2** | Preserve the original document; figure-aware extraction; page-rendering fallback. |
| **D3** | DOCX via Mammoth where appropriate — **conditional on verifying figures, tables, captions, and document ordering** survive the parse. |
| **D4** | Native file-picker approach — **subject to compatibility testing** (device/iCloud/Files). |
| **D5** | Reuse existing notification infrastructure; fire **only after successful publication**; **de-duplicate** (idempotent per release+user). |
| **D6** | **Enforce existing server-side publishing permissions immediately** (`actor_can_publish` = owner/admin/publisher). Defer new role definitions + migrations until necessary. |
| **D7** | Tiered AI + caching + **mandatory human approval**. **Target ≤ $0.25 AI inference per ordinary release** initially; measure actual cost. |

Phase-1 acceptance gates implied by these: D3 → a figures/tables/ordering verification check before DOCX is accepted; D5 → idempotency key on the publish→notify bridge; D7 → per-release cost meter with a $0.25 budget alarm.
