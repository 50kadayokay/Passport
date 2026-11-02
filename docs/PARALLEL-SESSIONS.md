# Four-session plan (proposed, not launched)

All sessions start from the same local commit on `portal-work`. Nothing is
pushed, merged into `main`, deployed or applied to production. Every session
keeps the current permission mode; no prompts are bypassed.

## Sessions

| Session | Branch / worktree | Requirements | Owns (only it writes these) |
|---|---|---|---|
| **S1 Content & AI** | `portal/s1-content` · `../Passport-S1` | a06 AI profile suggestions from a release · a07 full publish through the UI · a08 Mine IQ facts on unpublish (decision below) · a19 grounding harness (real-AI run needs approval) | `api/compose.js`, `api/_mineiq*.js`, `api/_extractProfile.js`, `api/_openaiExtract.js`, `api/structure-*.js`, `api/synthesize-profile.js`, `api/extract-*.js`, `api/profile-draft.js`, `api/publish.js`, `api/unpublish.js`, `api/revise-release.js`, `api/media-delete.js`; `src/portal/MineIQ.jsx`, `src/portal/publish/**`, `src/portal/ProfileEditor.jsx`, `src/portal/MediaPage.jsx`, `src/portal/Content.jsx`; `src/lib/{mineiq,mineiqChat,compose,publishDrafts,publishClient,mediaPosts,structureReleases,profileToPP}.js`; migrations **0080–0084** |
| **S2 Distribution** | `portal/s2-distribution` · `../Passport-S2` | a15 central content record and fan-out · a17 Conference Mode content sync · a14 website content editing UI · a21 bespoke-offering requests and status · a13 missing analytics events | `api/_listeners.js`, `api/_dispatchOps.js`, `api/dispatch.js`, `api/site-*.js`, `api/_site*.js`, `api/conference-inquiry.js`; `src/portal/Conference.jsx`, `src/portal/Services.jsx`, `src/portal/Analytics.jsx`; `src/admin/ConferenceStudio.jsx`; `src/lib/{conference,engagement,impressions,analytics}.js`; investor-app event emission in `src/aiBrief/**` (additive and guarded only); migrations **0085–0089** |
| **S3 Experience & access** | `portal/s3-experience` · `../Passport-S3` | a28 empty/error/loading states and mobile pass · a02 portal gate test suite · a10 messaging UI click-through and role policy · a20 Stripe test-mode run · a16 verify | `src/portal/Portal.jsx`, `PortalGate.jsx`, `Messages.jsx`, `Notifications.jsx`, `TeamView.jsx`, `Updates.jsx`, `Documents.jsx`, `Home`/shared portal components, `src/admin/**` except ConferenceStudio; `api/messages.js`, `api/stripe-*.js`; `src/lib/{messages,team,companyNotifications,billing}.js`; migrations **0090–0094** |
| **S4 QA & integration** (this session, `portal-work`) | existing worktree | a26 fresh-database replay · a27 deployment record · integration of S1–S3 · every live staging suite · matrix and tracker | `package.json`, `scripts/*-live-test.mjs`, `scripts/api-authz-test.mjs`, `scripts/_api-routes.mjs`, `scripts/tenant-isolation-test.mjs`, `scripts/seed-isolation-fixtures.mjs`, `api/_service.js`, `api/_audit.js`, `api/_roles.js`, `api/_supabase.js`, `SPRINT-STATUS.md`, `docs/**` |

**Out of scope today:** a22 social publishing needs LinkedIn, X and Meta
developer apps and platform review, on your accounts. S2 may scope it only.

## Rules
- **Single owner per file.** A change in another session's file goes to that owner as a request through S4.
- **Staging.** Only S4 reseeds fixtures, runs live staging suites, or runs the local staging API server. S1–S3 run offline tests and rolled-back staging checks only (one transaction, always ROLLBACK).
- **Migrations.** Use only your number range. Verify each in a rolled-back check. S4 applies a batch to staging only after your approval.
- **Credentials.** S1–S3 receive `supabase/staging/.connection` only, for rolled-back checks. The service key (`.api-env`) and fixture passwords (`.isolation-env`) stay with S4.
- **Ports.** S1 4351/8911, S2 4352/8912, S3 4353/8913, S4 4321/8899.
- **Delivery.** Focused local commits on your own branch, plus a short `SESSION-STATUS.md` listing done items, test evidence and blockers. No pushes or merges.
- **Integration.** S4 merges finished items into `portal-work` in small batches, in the order S3 shell changes, then S1, then S2. The full regression suite runs after each batch. A feature counts as complete only once it's integrated and passing.
