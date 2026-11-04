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

## Batch 6: 0080/0090 on staging, launch preparation (2026-11-01)
- 0080 + 0090 applied to staging (approved). Preflight: target jmljfovtfxcdhjmtlnva; each changes one function; a rolled-back
  apply-then-rollback restored the live definition, ACL and SECURITY DEFINER exactly; no table, policy, other function or row
  count changed. Applied from a directory holding only those two files, so 0085-0088 were not re-run. Post-diff identical apart
  from the two functions.
- Mine IQ: live mineiq_search answers natural questions, still refuses other companies, investors and anon
  (mineiq-search-0080-live-check 8/0; a07 click-through 18/0; rolled-back 16/0).
- Notifications: viewer, analyst and editor get 403 from Clear all, owner and admin clear (notifications-clear-live 26/0).
  Platform admins are admitted per the 0076 role model; isolation now classes the RPC as role-guarded (stricter for viewers).
- Isolation 1077/0/0 unverified/0 skipped; API authz 435/0; round trip 73/0; 25 live suites green; npm test and build pass.
- Merged S3: read-only production smoke (staging 40/0, page and header checks need a deploy), Stripe test-mode check (SKIPs
  without test keys), webhook renews_at fix, security headers in vercel.json (offline 32/0, not deployed).
- In progress: S1 production-mode migration runner (g06), S2 production-shape review + rollout plan (g02/g03).
- Feature completion 91% (25 working, 3 partial, 1 missing); implemented 97%, integrated 97%, verified 86%. Launch readiness 36%.
- Later on 2026-11-01: merged S1's production runner (plan-only by default, 114/0, never run), S2's rollout plan (27
  migrations, plan = manifest 19/0) and 0071 rollback guard (staging 11/0), S3's CSP Report-Only (29/0). Round trip 73/0,
  publishing-0071 46/0, npm test and build pass. Launch readiness 41% (g06 now partial). Open: the read-only production audit
  query (R1/R3/R4) needs approval; S1 is fixing the browser-side Anthropic call in src/Onboarding.jsx.

## Batch 7: production audits, 0091 on staging, launch checklist (2026-11-01)
- Two approved read-only production audits. The four "drifted" functions are token-identical to the repo (formatting only),
  storage policies and mineiq_search match, so all 28 pending migrations apply in production's shape. Production password rotated.
- Capture-on-apply rollbacks proven production-exact on staging (15/0) after fixing a verify-step bug that test found.
- 0091 applied to staging (approved): platform admins need their own owner/admin membership to Clear all. Only that function
  changed. Live 31/0, 0091 check 26/0, isolation 1077/0/0/0, authz 435/0, 25 live suites, investor app 35/0, round trip 75/0,
  npm test and build pass.
- docs/PRODUCTION-LAUNCH-CHECKLIST.md: the remaining approvals and configuration. Launch readiness 64% (7/11 gates).

## Batch 8: live production baseline merged (2026-11-02)
- prod-v1.3.2 (223 live investor-app commits since Oct 5) merged into portal-work (96fb1eb); not the 42 newer
  consolidated-2026-10 commits (user decision). 17 conflicts resolved by area (S1 AI, S2 share-news, S3 investor app
  and portal shell, S4 build files). Every line prod added across its 655 changed files is present or deliberately
  combined (16 files, each reviewed). Prod's predeploy AI guard is back in the Vercel build; its draft-stripping
  and slim native build are kept; the CSP allows prod's second inline script.
- Follow-ups: prod's /api/brief-generate now behind the shared AI guard (inert in production: no key);
  two prod dev scripts no longer default to production; prod's own brief-contract test expectation fixed.
- S3 round 12 merged (66bdb3c): the API fails closed outside a production deploy; member-only polls need a
  session and stop on 401/403; guests keep the feed's new-posts prompt.
- Staging on the final code: isolation 1088/0/0 unverified/0 skipped, API authz 446/0, 25 live suites green
  (investor app 35/0, 0 breaking), round trip 78/0, captures 15/0, npm test, production and native builds.
- Open decision: prod's native ?manage= profile editor (any member sees it; owner saves bypass drafts; others get a
  false "Profile updated").

## Batch 9: native company profile editor fixed (2026-11-02)
- prod-v1.3.2's native ?manage= editor (user-approved fix, S3 ce810f6 + 0f4a8fa after S2's review): owners and admins
  only, by the server's role answer (owner_id or an active owner/admin membership); saves go load -> draft -> publish
  through /api/profile-draft, the portal's workflow; "Profile updated" only after publish succeeds, otherwise the
  server's reason; a failed photo upload stops before any write; an open portal draft is never published from the
  app; the app no longer touches /rest/v1/companies. Server: publish already requires owner/admin (platform admins
  keep their portal admin power). manage-editor-test 58/0.
- Open (user decisions, not blockers): S1's proposed 0081 trigger (unapplied) would make drafts the only path for
  owners too, but first needs the portal's calendar, QR logo and Briefs saves moved to drafts; the feed card logo
  reads profile.brand, which portal and app pp edits do not update (pre-existing).
- Staging on the final code: isolation 1088/0/0/0, API authz 446/0, 25 live suites (investor app 35/0), round trip
  78/0, captures 15/0, npm test, web and native builds. Not yet checked on a device: the native API call
  (capacitor://localhost, same pattern as native messaging).

## Batch 10: overnight launch preparation (2026-11-02)
- portal-work pushed to GitHub (secret-scanned). Read-only production audits re-run: no drift except 3 test users.
- S1: 31-step migration verification; fixed 0077's checkpoint (would read false after 0092). S2: prod-check.mjs per
  stage (staging dry run 51/0). S3: installed-app compatibility matrix (315/0); 0094 prepared for the one break
  (installed Follow upsert after 0061a), not applied.
- Staging: isolation 1088/0/0/0, authz 446/0, 25 live suites, rate-limit 119/129/131, alert 9/0, round trip 82/0,
  captures 15/0, checkpoints 31/0, npm test and builds. Handoff: docs/MORNING-HANDOFF-2026-11-02.md.
- 0094 applied to staging (approved 2026-11-02): apply-then-rollback fidelity exact (only 2 column grants change), 0094 check 24/0,
  installed-app matrix 315/0, round trip 81/0, runner checkpoints 31/0, npm test. Phase 3 now runs all six files.
- PRODUCTION 2026-11-02 (user-approved: 0061a and 0094 only; backup 02 Nov 09:15 UTC): 0061a then 0094 applied by the user,
  both checkpoints true; runner diffs showed only the intended ACLs. Read-only audits after each: only the intended grants
  changed. prod-check --stage=phase3: 35 PASS, 0 FAIL (4 INCOMPLETE need accounts). TLS now verified with Supabase's root CA
  (PRODUCTION_DB_CA_FILE). 0058, 0077, 0092, 0093 HELD (mineex.ca lead form); Phase 4 needs the 0063 messaging fix first.
- PRODUCTION 2026-11-03, mineex.ca LEAD FORMS FIXED: mineex-site got 4 Production variables (Supabase URL + publishable key,
  Postmark token + sender support@mineex.ca; no service key) and a fresh deploy of the unchanged 9dfafd7 source (bundle identical
  except the build stamp; the previous deployment kept for rollback). Live: contact (#8) and Conference Mode (#9) enquiries stored,
  both emails delivered. Follow-ups before scaling: the shared rate-limit identity (Vercel egress IP) and Postmark's 100/month plan.
- PRODUCTION 2026-11-03, PHASE 3A COMPLETE: 0058, 0095, 0077, 0092, 0093 applied by the runner 03:35-03:38 UTC, each checkpoint true
  (0058 then 0095 chained; forms closed for seconds). prod-check --stage=phase3: 44 PASS, 0 FAIL, 4 INCOMPLETE (smoke accounts).
  Read-only audit vs post-A2: only the intended changes (Q01/Q03/Q09/Q17; 4 more companies is normal activity); function source identical.
  Before applying: a rolled-back staging rehearsal of 0058-applied/0095-failed and both recoveries (14/0), state matched production exactly.
  mineex.ca/contact returns 502 delivery-failed: PRE-EXISTING, mineex-site has no environment variables (no Supabase URL, no
  service key, no Postmark), so /api/contact can neither store nor email. The database accepts its exact anon insert (rolled-back
  production transaction). No test row was stored. Phase 4 not started.
- PRODUCTION 2026-11-02, gate A2 COMPLETE: main = 50c0381 (merge of portal-work 245324e; tree identical to the tested commit),
  Vercel passport + mineex-conference deployed (both success; mineex-conference also deploys from main, as on 746d86d).
  prod-check --stage=deploy 35 PASS / 0 FAIL (4 INCOMPLETE need smoke accounts); new portal bundle live; mineex.ca HTML and
  bundles byte-identical before/after; read-only audits: schema, grants, policies and functions unchanged (one new investor
  sign-up only); apply log unchanged (0061a, 0094). Staging: 0095 + 0096 applied; full regression green. Next: approval B (Phase 3A).
