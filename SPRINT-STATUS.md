# Sprint 1 status (checkpoint)

Started 2026-11-01. Branch `portal-work`, local only: nothing pushed, deployed or
applied to production. Source of truth: the 29-row requirements matrix
(https://claude.ai/artifact/Bj5Eis1TdsW2SBi2LgXJSx, collection `audit`).

Two separate measures, never mixed:
- **Feature completion** (29 requirements; working = 1, partial = 0.5,
  front end only = 0.25): **42%** at sprint start.
- **Production launch readiness** (migrations, investor-app safety, deploy,
  verification): see the bottom of this file.

## Batch
| Row | Was | Goal |
|---|---|---|
| a29 investor directory | broken | fix verified, ready to ship |
| a23 admin company creation/onboarding | unverified | proven end to end, defects fixed |
| a09 media library | unverified | upload, organise, delete, live-profile effect proven |
| a24 storage permissions | partial | cross-tenant write/delete proven |
| a25 audit trail | missing | if time: migration prepared and verified (rolled back) |

## Done
- **a29:** fix 0238f0b was already on this branch (and `hotfix/directory-pagination`).
  Added a stable page order (`order=name,slug`) and
  `scripts/directory-pagination-test.mjs` (runs the real loader from
  src/main.jsx against a mocked 1000-row-capped server): 9/0, in `npm test`.
  Remaining: the deploy, plus cherry-picking the order fix onto the hotfix branch.

- **a23 admin onboarding:** no defects in the path. `scripts/admin-onboarding-live-test.mjs`
  43/0 on staging (create/edit/publish as admin with refusals for investor, owner
  and other company; investor-app visibility; billing; invite, peek, accept; owner
  portal, readiness, agreement, go-live; isolation). UI click-through on the staging
  bundle: draft review -> Approve & Publish -> Invite -> invitee lands in the
  portal as Owner. NOT run: "Build from website" (spends OpenAI/Jina credit).
  Finding (not changed): admin "View Company" links are hard-coded to
  passport-xi-five.vercel.app, so on staging they open production.
- **a09 media library:** built permanent delete, which was missing entirely
  (files stayed public forever, and only the uploader could ever delete them).
  New `api/media-delete.js` (owner/admin/publisher; post must be down; deletes
  only this company's company-media files that nothing else uses; marks the
  update 'deleted'), `deleteMediaViaApi`, a "Delete permanently" button on
  taken-down posts. Defects fixed on the way: every PHOTO showed as "Video";
  a taken-down post showed "Processing"; every media post also appeared in Press
  Releases as a phantom "Draft · Date needed". `scripts/media-library-live-test.mjs`
  31/0; UI click-through (grid -> taken down -> delete -> library empty, object
  gone). Notes: a deleted file can stay reachable through Supabase's CDN for up
  to the upload's cache max-age (1 h). Investor app (shipped, not changed): every
  media post gets a "VIDEO" badge, photos included.
- **a24 storage permissions (still partial):** `scripts/storage-write-isolation-test.mjs`
  32/0 + 10 findings, real users on every bucket. Cross-company isolation holds
  everywhere. Role gaps: read-only analysts and viewers can delete company documents
  and private media, analysts can write private media, and any signed-in account
  (free investors included) can upload to the public buckets and company-docs.
  Fix prepared: `0078_storage_role_hardening` (+ rollback);
  `scripts/storage-role-0078-check.mjs` 17/0 rolled back; added to the rollback
  round trip. Applying it needs approval.
- **Tracker:** the matrix page now shows two separate measures (feature completion
  from a01–a29; launch readiness from 11 gates in its `readiness` collection).

## Pre-sprint work (same session)
- **0076 production blocker fixed:** brand_kits/story_projects statements guarded
  with to_regclass in the migration and rollback. `migration-0076-without-0028-check`
  12/0 (original fails, guarded applies, identical elsewhere, clean rollback);
  `migration-rollback-roundtrip` 60/0.
- **Function-drift query prepared, NOT run:** supabase/audit/production_function_source_2026_11_01.sql
  (Q01 source of 3 functions, Q02 existence of 37 tables). Staging dry run OK;
  `scripts/function-drift-diff.mjs` redacts secrets before display. Waiting for
  the user to approve running it (needs the DB password, rotation recommended first).

## Final regression sweep (2026-11-01, all on staging unless noted)
| Suite | Result |
|---|---|
| npm test (incl. new directory test) | pass |
| Build | pass |
| API authorization (`api-authz-test --local`, now covers media-delete) | 410/0, 0 skipped |
| Combined tenant isolation (with API routes, after fixture reseed) | 1001/0, 0 skipped |
| Live: publishing / messaging / roles (0076) | 51/0, 56/0, 97/0 |
| Live: admin onboarding (a23) / media library (a09) | 42/0, 31/0 |
| Storage write isolation (a24) | 32/0 + 10 findings (fixed by 0078) |
| Investor app live | 34/0 + 1 known BREAK (0077 not on staging) |
| Rolled back: round trip (now incl. 0078) / 0076-without-0028 / 0078 / 0077 / messaging schemas | 63/0, 12/0, 17/0, 14/0, 14/0 |
First combined-isolation run: 993/3/5. Cause: run straight after the API suite
without a reseed (rate-limit windows already used; F9 correctly refused to revive
the subscription the previous run had deleted). Reseeded, then rerun after the
window: 1001/0/0.

## Feature completion vs launch readiness
- Feature completion: **42% -> 53%** (a29 broken->functional, a23 and a09
  unverified->functional; a24 still partial).
- Production launch readiness: **27%** (11 gates: 1 done, 4 partial, 6 open).

## Blockers
- Production function source: waiting for approval + password.
- Any new staging migration: needs approval (standing rule).

## Sprint 2 (2026-11-01)
- **0077 + 0078 applied to STAGING** (approved): target verified, non-destructive
  (no data statements; listing reports, storage objects, documents, media assets,
  companies and protected snapshots unchanged), rollbacks tested (14/0, 17/0,
  round trip 63/0). Installed 1.3.x apps can file listing reports again.
- **a25 audit trail -> working:** API-side events for publish / correct / take
  down / media delete with actor and before/after (`api/_audit.js`); Activity log
  tab in Settings (was unreachable). audit-trail-live 21/0; UI checked.
- **a11 notifications clear-all -> working:** notifications-clear-live 20/0
  (no follow deleted; new events reappear). Finding: viewers can clear for everyone.
- **a18 Mine IQ history -> working:** fixed two defects (no answer was ever saved:
  PGRST102 mixed-key batch; every thread titled "New chat"). mineiq-history-live
  27/0 (AI mocked, no credit spent); UI: ask, reload, reopen.
- **a24 storage -> working:** storage-write-isolation --strict 40/0, 0 findings.
- Production password rotation checklist: docs/PRODUCTION-DB-PASSWORD-ROTATION.md.
- Four-session plan: docs/PARALLEL-SESSIONS.md (awaiting approval).

| Final sweep (staging) | Result |
|---|---|
| Combined isolation (reseeded) | 1001/0, 0 skipped |
| API authorization | 410/0 |
| Investor app | pass (listing report now works) |
| Storage strict / audit / notifications / Mine IQ | 40/0, 21/0, 20/0, 27/0 |
| Publishing / messaging / roles / onboarding / media | 51/0, 56/0, 97/0, 42/0, 31/0 |
| Round trip / messaging schemas | 63/0, 14/0 |
| npm test, build | pass |

Feature completion **53% -> 61%** (12 working, 11 partial, 4 missing, 1 unverified,
1 UI only). Launch readiness **36%** (11 gates: 3 done, 2 partial, 6 open).

## Parallel sessions, integration batches (2026-11-01)
- 0085 + 0086 applied to staging (approved; counts unchanged; round trip 67/0); a17/a21 live 37/0.
- Integrated on portal-work: S2 a17/a21 (ea6ceca); S3 a02/a10/a20/a28/a16 + fixes (4e8964f, 01bb380);
  S1 a06/a07/a08/a19 + page states (472f7db, 4ade3d0); S2 a14/a13/a15 slices 1-3 + fixes (ceef8cf, d6e4f7b).
- Integrated sweep: API authorization 435/0; every live suite passes (investor app, storage strict,
  booth/services 37/0, website, profile suggestions, publishing 51/0, messaging 56/0, roles 97/0,
  onboarding, media, audit, notifications, Mine IQ); round trip and messaging-schema pass; npm test
  (13 new suites) and build pass. Isolation inventory extended to 0087/0088 objects (rerun after apply).
- Feature completion **86%** (22 working, 6 partial, 1 missing); launch readiness unchanged at 36%.
- Waiting on the user: 0087/0088 staging apply; a08 decision; a19 real-AI run; a20 Stripe test keys;
  a26 empty project; a15 revalidate hook; viewer clear-all.

## Batch 4-5: 0087/0088 on staging, product decisions applied (2026-11-01)
- 0087 + 0088 applied to staging (approved): target verified, additive, no existing function or policy
  changed, data counts identical before and after; rollbacks proven (round trip 75/0 incl. 0080/0090).
- Tenant isolation **1075 passed, 0 failed, 0 unverified, 0 skipped**. A missing security-sensitive table or
  function now reports UNVERIFIED (exit 3), never a pass. API authorization 435/0.
- Decisions implemented and integrated: a08 (S1, unpublished text and facts leave Mine IQ), a15 signed website
  refresh (S2, no browser credentials, no outbound call on staging), notification Clear all owner/admin only
  (S3, 0090 written, rolled-back check 21/0, NOT applied). a28 pass on new screens (S3) and 11 fixes (S2).
- New defect found and fixed: mineiq_search ANDed every question word (S1 0080, rolled-back check 16/0, NOT applied).
- a07 verified live: S1 click-through 18/18 on staging. Live sweep: 24 suites green after three test-drift
  fixes (publishing settles the 0088 listeners; impressions ignores deleted investors; 0078 check unwinds).
- Feature completion **91%** (25 working, 3 partial, 1 missing). Implemented 97%, integrated 97%,
  verified (implemented + tested + integrated) 86%. Launch readiness unchanged at 36%.
- Blockers: apply 0080 and 0090 to staging (approval); a19 real-model run has no real OpenAI key on staging;
  a20 Stripe test keys; a26 disposable project; a22 deferred.

## Next
Apply 0080/0090 after approval, then rerun isolation and the live sweep.
