# Production rollout plan: portal launch without disturbing the investor app

**Status: PROPOSED. Nothing here has been executed. Every phase needs explicit
approval. Production = Supabase `rvptronniomlqumjhyrr` ("Passport V1"), shared by
the investor app (web + iOS/Android 1.3.x, tag `prod-v1.3.2`), the public site,
the portal and Mission Control.** Launch gates g02 (production migration review)
and g03 (rollout plan) are answered by this file; the review behind them is
"Production-shape review of 0071 onward" below (S2, 2026-11-01, offline).

Items marked **[audit]** are decided by the production read-only audit
(`supabase/audit/production_readiness_2026_10_31.sql`). It ran on 2026-11-01;
see "Production audit results" at the end. Items marked **[open]** are still
undecided and block the step they name.

Staging (`jmljfovtfxcdhjmtlnva`) has every migration below applied (0080 and
0090 since 2026-11-01), except 0055, which is deferred everywhere.

## Ground rules (apply to every phase)

- One phase at a time; the next starts only after its checkpoint passes and you
  approve it.
- **Stop conditions (any one → stop, do not continue, report):** a runner or
  migration error; any checkpoint check failing; an unexpected difference in the
  post-step read-only audit (anything beyond the step's intended change); a rise
  in API 5xx or client error reports; any investor-app smoke check failing; any
  data change outside the step's scope. On stop: roll back THAT step with its
  verified rollback file (`supabase/rollbacks/`), re-run the audit, and report
  before anything else.
- **Rollbacks run in strict reverse order of application.** Never roll back an
  earlier migration while a later one that depends on it is applied (see the
  "Needs" column; 0071 under 0088 is the dangerous case, finding R2).
- Every migration runs through the guarded runner with an egress check, one file
  per transaction (CONCURRENTLY index files outside a transaction, one statement
  at a time).
  The runner currently targets STAGING only; a production mode (same guards,
  production DSN supplied by you, never stored) must be built and reviewed
  first. Not built. **[open]**
- After every phase: re-run the read-only audit and diff it against the
  expected state.

## Deploy order

Code first, then schema, phase by phase:

1. **Phase 0**: preconditions. No production change.
2. **Phase 1**: deploy the API and web bundle. No schema change.
3. **Phase 2**: native store build. Runs in parallel, with no schema dependency.
4. **Phases 3 to 5b**: migrations, in the order of the table below, with a checkpoint after each phase.
5. **Phase 6**: cron and delivery activation. Needs separate approval.

Every piece of Phase 1 code runs on the current production schema. Features whose tables are missing stay inert:

| Code | What it does until its migration is applied |
|---|---|
| `/api/site-*` (until 0068) | Answers "not provisioned". `api/_siteAuth.js` handles the missing `site_credentials` table, and no site holds a token yet. |
| Booth config (until 0085) | The API answers "none" and booths use their compiled look. |
| Service requests (until 0086) | The page shows "not enabled yet" (`NotProvisioned`). |
| `record_company_events` (until 0087) | Returns 404. The web client drops it silently, at one request per batch. |
| `site_content_v1` / `conference_content_v1` (until 0088) | Get no deliveries, because they have no subscriptions. |
| The UNPUBLISHED branch of `profile_timeline_v1` | Must be deployed before 0071 (part C), which Phase 1 satisfies. |
| Messaging find-or-create | Must be live before 0063, which Phase 1 satisfies. |

## Phase 0: preconditions (no production change)

| Check | Pass condition |
|---|---|
| Read-only audit run and reviewed | **[audit]** results analysed; discrepancies vs staging explained |
| Sign-up trigger (Q16) | exactly one profile-creating trigger, or a decision on 0059 |
| Policy and function digests (Q08, Q10, Q17) | production matches the state each rollback restores, or rollbacks adjusted and re-verified |
| Listing-reports decision | approve 0077 (keep the anon path for installed builds) |
| Rollbacks | all verified by `migration-rollback-roundtrip` on staging; privilege rollbacks compared with production's current grants **[audit]** (R5) |
| Function drift (R1) | **Resolved (2026-11-01):** the four drifted functions are token-identical to the repo state before the pending migrations (formatting only). Capture-on-apply stays mandatory for byte-exact restores (staging check 15/0) |
| Replaced functions and storage policies (R3, R4) | **Done (2026-11-01):** `production_replaced_functions_2026_11_01.sql` run (approved). `mineiq_search` and all six storage policies 0078 replaces match the repo; the two other drifted functions moved to R1 |
| `SITE_REVALIDATE_SECRET` | set (server only) before Phase 1 ends |
| Staging evidence current | investor-app suite, messaging-schema check, 0077 check, all live suites, combined isolation: all pass |
| Smoke-test identity | a designated production test investor account (needs your approval) for post-deploy checks |

## Phase 1: deploy the API and web bundle (no schema change)

Deploys D20 (find-or-create messaging), `/api/submit`, F8, D21, the a03 UI,
role-aware controls and the listing-report change for the web app. **All of it
works on the current production schema:** the messaging code was verified on
the pre-0063 schema (`messaging-schema-compat-check`), `/api/submit` writes with
the service role, and portal features that need missing tables are inert until
their migrations.

- **Checkpoint 1:** web `/app` loads (guest feed, a `/p/` link, a company profile);
  investor send, inbox and thread with the test account; public contact, demo and
  listing report via `/api/submit`; `/api/og-news` returns a PNG (confirms Vercel
  bundled `api/_fonts`); no 5xx rise for 24 h.
- **Stop if:** any check fails → redeploy the previous build (Vercel instant
  rollback). No database state to undo.

## Phase 2: native app release (in parallel; App Store / Play review)

Next store build includes the listing report via `/api/submit` (with fallback).
Installed 1.3.x builds keep working throughout: 0077 keeps their anon path open.

- **Checkpoint 2:** the new build's report reaches `/api/submit` in production
  (test account). Track adoption; plan the later close of the anon path
  (re-apply 0058's listing_reports section) when 1.3.x usage is low.

## Production migration order

This is the authoritative list. `scripts/rollout-plan-manifest-test.mjs` (in `npm test`) fails if it ever differs from `PENDING` in `scripts/_migration-manifest.mjs`. It also fails if:
- a row comes before something it needs;
- a CONCURRENTLY file is not marked to run outside a transaction;
- a row that runs has no rollback file.

"Needs" names pending migrations only; already-applied prerequisites (0041, 0048, 0050a, 0057) are omitted. Rollback files are `supabase/rollbacks/<name>.rollback.sql`. "Lossy" means the rollback deletes data recorded since the apply; "re-opens" means it restores a security hole. Use those only in an emergency.

<!-- migration-order:start -->
| # | Migration | Phase | Runs | Needs | Rollback |
|---|---|---|---|---|---|
| 0 | `0000_baseline.sql` | — | **do not run**: no-op, production already has these objects (SCHEMA-RECOVERY §2) | — | none (not run) |
| 1 | `0058_close_public_insert.sql` | 3 | transaction; same runner session as 0077 | — | re-opens anon INSERT on forms |
| 2 | `0077_listing_reports_installed_app_compat.sql` | 3 | transaction; immediately after 0058 | 0058 | clean |
| 3 | `0061a_table_privilege_hardening.sql` | 3 | transaction | — | re-opens anon grants |
| 4 | `0062_message_attachments.sql` | 4 | transaction | — | lossy: attachment rows (bucket kept) |
| 5 | `0063_company_initiated_threads.sql` | 4 | transaction; only after Phase 1 messaging code | — | clean |
| 6 | `0064_notification_clearing.sql` | 4 | transaction | — | clean (cleared_at dropped) |
| 7 | `0065a_analytics_breakdown.sql` | 4 | transaction | — | clean |
| 8 | `0065b_engagement_corrections.sql` | 4 | transaction | 0065a | clean (restores 0048 bodies) |
| 9 | `0065c_analytics_indexes.sql` | 4 | outside a transaction (CONCURRENTLY), one statement at a time | 0065a | clean |
| 10 | `0066_mineiq_conversations.sql` | 4 | transaction | — | lossy: Mine IQ history |
| 11 | `0068_site_contract.sql` | 5 | transaction | — | lossy: website tokens, blueprint manifest |
| 12 | `0069b_stripe_events.sql` | 5 | transaction | — | lossy: Stripe event ledger |
| 13 | `0071_publishing_reliability.sql` | 5 | transaction; capture-on-apply (R1) | — | restores repo 0036/0008: same behaviour as production (R1); byte-exact via the captured rollback |
| 14 | `0072_profile_drafts.sql` | 5 | transaction; capture-on-apply (R1) | — | lossy: unpublished drafts; restores 0035's company_go_live: same behaviour as production (R1) |
| 15 | `0073a_impression_dedupe_index.sql` | 5 | outside a transaction (CONCURRENTLY) | — | clean |
| 16 | `0073b_impression_tracking.sql` | 5 | transaction | — | clean |
| 17 | `0073c_post_events_client_guard.sql` | 5 | transaction | — | clean |
| 18 | `0074_profile_revision_history.sql` | 5 | transaction | 0072 | clean (snapshot rows kept) |
| 19 | `0075_profile_versions_privileges.sql` | 5 | transaction | — | re-opens anon grants |
| 20 | `0076_company_roles.sql` | 5 | transaction; capture-on-apply (R1) | 0072 | restores 0031's accept_company_invitation: same behaviour as production (R1); revokes pending member invitations |
| 21 | `0078_storage_role_hardening.sql` | 5 | transaction (R4 cleared) | 0076 | re-opens storage writes (repo 0037/0040 policies; production's six match them exactly) |
| 22 | `0080_mineiq_search_any_term.sql` | 5b | transaction | — | restores 0050a's mineiq_search; production-exact (R3 cleared) |
| 23 | `0085_conference_booth_config.sql` | 5b | transaction | — | lossy: published booth looks |
| 24 | `0086_service_requests.sql` | 5b | transaction | 0076 | lossy: service requests (export first) |
| 25 | `0087_audience_events.sql` | 5b | transaction | 0071 | lossy: audience events |
| 26 | `0088_content_fanout.sql` | 5b | transaction; deploy `api/_listeners.js` first (Phase 1) | 0071 | lossy: destination copies; **roll back before 0071** (R2) |
| 27 | `0090_notification_clear_roles.sql` | 5b | transaction | 0064, 0076 | clean (restores 0064's body) |
| 28 | `0091_notification_clear_no_platform_admin.sql` | 5b | transaction; right after 0090 | 0090 | clean (restores 0090's body) |
<!-- migration-order:end -->

**Already applied in production, not in the list:** 0053, 0054, 0056, 0057, 0059 (never run its rollback in production), 0060 and 0067.

**Deferred, never run:** 0011, 0027, 0028, 0029, 0055 and 0061b.

### Checkpoints

- **Phase 3, after 0061a:**
  - The audit diff contains exactly these changes.
  - Investor-app smoke passes (list below).
  - Public contact and demo go through `/api/submit`.
  - A listing report works from the web and from an installed 1.3.x build.
  - A test sign-up creates exactly one profile.
- **Phase 4, after 0066:**
  - Messaging works in both directions, including attachments.
  - Analytics breakdowns and notifications work.
  - Investor smoke passes.
- **Phase 5, after 0078:**
  - The portal works end to end with real roles (owner, admin, editor, publisher, analyst, viewer), using test accounts.
  - Storage: a viewer cannot delete documents, and an investor cannot upload.
  - Investor smoke passes, and the audit diff is as expected.
- **Phase 5b, after 0090:**
  - The booth look publishes and is read back anonymously.
  - A service request is created, and an admin changes its status.
  - Profile views and shares show on Analytics.
  - Mine IQ answers a natural question.
  - Clear all works for an owner and is refused for a viewer, and for a platform admin with no owner/admin role in that company (0091).
  - Investor smoke passes.
  - Content fan-out is checked only after Phase 6 (it needs a drain).

## Environment variables (names only)

The names below come from comparing `process.env` reads in `api/` at `prod-v1.3.2` with the branch tip. Production's actual variable set has **not** been inspected. Confirm each one in the Vercel project settings, and never copy a value into the repo or a chat.

Set before or with Phase 1:

| Name | Why | When |
|---|---|---|
| `SUBMISSION_SALT` | `/api/submit` and the AI counters hash with it | Before Phase 1. Required before 0058. |
| `SITE_REVALIDATE_SECRET` | Server-side master for the signed website revalidate (`api/_siteRevalidate.js`) | **Before any company configures a `revalidate_url`**, and in any case before 0088. Without it a hooked delivery fails visibly and dead-letters after 6 attempts. |
| `STRIPE_WEBHOOK_SECRET` | `/api/stripe-webhook` | Before 0069b is used |
| `MESSAGES_INBOUND_SECRET` | F3: must not be lost or rotated before F3 is deployed | Keep |

`SITE_REVALIDATE_SECRET` is server only and must never get a `VITE_` copy, because Vite inlines `VITE_*` into the bundle. `npm run check:s2-revalidate-bundle` refuses one.

Set for Phase 6 (scheduled delivery, D22), not before:

| Name | Why |
|---|---|
| `CRON_SECRET` | Vercel Cron's bearer for a `/api/dispatch` cron |
| `DISPATCH_HEALTH_TOKEN` | Read-only health probe for the dispatcher |
| `OPS_ALERT_TO` | Where dispatcher alerts are mailed |
| `PUBLIC_BASE_URL` | F5's absolute links; required before F5 |
| `DELIVERY_EPOCH` | The moment a reliable drain went live. Events after it are never treated as historical. |

The following have safe defaults, so set them only to override: `AI_MODEL_ASK`, `AI_MODEL_COMPOSE`, `AI_MODEL_EXTRACT`, `AI_TIMEOUT_MS`, `AI_USER_DAILY_CAP` and `DISPATCH_BUDGET_MS`.

**Must NOT be set in production:**
- `MINEEX_ENV`, because `staging` turns on the egress guard and makes the revalidate a mock.
- `STAGING_CRON_SECRET`, `STAGING_EGRESS_LOG`, `STAGING_SELF_HOSTS`.
- Any `VITE_*REVALIDATE*` variable.
- `PUSH_ENABLED=true`, because push stays unarmed while 0055 is deferred.

**No longer read:** `MINEEX_BRIEF_API_KEY` and `MINEEX_BRIEF_MODEL`. Remove them only after Phase 1 is confirmed.

## Cron state

**Vercel Cron.** `vercel.json` schedules only the existing news jobs:
- `news-pull`
- `news-process`
- `news-notify`
- `news-push-send` (inert while `PUSH_ENABLED` is off)

No dispatch cron is added by this rollout.

**pg_cron.** The audit (Q15) found it absent in production. The `outbox-drain` job (0011, deferred) does not exist there and **stays inactive until it is explicitly approved**:
- No migration in the list schedules a job.
- 0011 is not applied.
- `pg_net` is absent, so the database makes no outbound calls.

**Consequence for the new listeners.** Without a scheduled drain, deliveries for `site_content_v1` and `conference_content_v1` (0088) run only when the dispatcher is invoked, exactly as for the existing feed listeners today. This also means no website revalidate call leaves production until something drains. Choosing the D22 drain (Vercel cron, recommended; or 0011) is Phase 6 and needs its own approval.

## Post-launch smoke list

Use the designated production test accounts (investor, plus one company account per role), which need your approval. Run each item after the phase named.

1. **Investor app (after every phase):**
   - Guest feed loads.
   - A `/p/` link opens.
   - A company profile opens.
   - Follow, like, save and watchlist work.
   - Notifications appear.
   - Message send, inbox and thread work.
   - Report a listing from the web and from an installed 1.3.x build.
   - Sign-up creates exactly one profile.
2. **Public site (Phase 1 onward):**
   - Contact, demo and listing report go through `/api/submit`.
   - `/api/og-news` returns a PNG.
   - No 5xx rise over 24 h.
3. **Portal (Phase 5 onward), per role:**
   - Profile: draft, publish and restore.
   - A release: publish, revise and unpublish (timeline entry removed).
   - Members: invite, accept, change role and remove.
   - Storage: upload and delete by role.
   - Delivery status shows on the release.
4. **Portal features (Phase 5b):**
   - Booth look: publish it, then read it anonymously through `conference_booth_config(slug)`.
   - Service request: create one as an editor; a platform admin moves it to `in_review`.
   - A profile view by the test investor appears in Analytics.
   - Mine IQ answers a question phrased naturally.
   - Notifications: Clear all as owner, refused as viewer.
5. **Delivery (Phase 6 only):**
   - After one approved drain, a published release reaches `destination_content` for `website` and `conference`.
   - With no hook configured, nothing is called.
   - A real website revalidate is tested only against a hook the company owns and has agreed to. Its outcome shows in `company_destinations.status` and `last_error`.

## Production-shape review of 0071 onward (S2, 2026-11-01)

The review was offline and read every file from 0071 to 0090 and every rollback. The inputs were:
- the production audit summary below;
- the manifest;
- `docs/SCHEMA-RECOVERY.md` (production lacks the objects of 0011, 0027, 0028 and 0029);
- a scan for every `create [or replace] function`, `drop policy` and object reference.

No applied migration was edited, and no production-only migration is needed yet.

**R1 · Function drift in four functions 0071, 0072 and 0076 replace. Resolved (2026-11-01): formatting only.**

| Function | Replaced by | Production equals (token for token) |
|---|---|---|
| `publish_publication(uuid, uuid, timestamptz)` | 0071 | 0036 |
| `claim_deliveries(text, text, integer, integer)` | 0071 | 0008 |
| `company_go_live(uuid, text)` | 0072 | 0035 |
| `accept_company_invitation(text)` | 0076 | 0031 |

- **What was found.** The digest audits (Q10 on 2026-10-31, then the replaced-function digests on 2026-11-01) showed these four bodies differ byte-for-byte from the repo. The second read-only production audit (`supabase/audit/production_function_source_four_2026_11_01.sql`, approved by the user, run by S4) showed every one is token-identical to the repo version that applied before the pending migrations. Only whitespace and line breaks differ. SECURITY DEFINER, `search_path` and execute grants match.
- **What it means.**
  - Production has no behaviour of its own in these functions, so 0071, 0072 and 0076 overwrite nothing meaningful. They are **no longer blocked**.
  - The committed rollbacks (0036, 0008, 0035 and 0031 text) restore behaviour identical to production's today.
  - No forward migration needs to carry production-only behaviour.
- **Capture-on-apply stays mandatory** for these three files in production. Just before each runs, the production runner (S1, `scripts/_function-capture.mjs`) saves the live definitions, owner and grants of every function the file touches into a gitignored, mode-600 rollback under `supabase/audit/results/`, and that file restores production byte for byte. `scripts/capture-rollback-staging-check.mjs` (S4) proves it on staging, in one transaction that is always rolled back. It plants production's exact bodies, applies 0071, 0072 and 0076, runs each captured rollback, and compares digests: 15/0, after S4's fix to its verify step. In production, back out with the captured rollback; the committed file is the fallback and gives the same behaviour.
- **Constraint (user, 2026-11-01): production function source stays out of git, chat and shared logs.** Findings are described as behaviour, never as source. The audit results, the redacted diffs from `scripts/function-drift-diff.mjs` (summary on the terminal; `--show` only in a terminal of the reader's own) and every captured rollback stay in the gitignored results folder, and none of them is committed.
- `revise_publication` also differed in Q10. No pending migration replaces it and it was not read; it stays a SCHEMA-RECOVERY item, not a blocker.

**R2 · Rolling back 0071 while 0088 is applied replays history into websites (rollback order).**
- 0088's subscriptions rely on `listener_subscriptions.active_from = now()`.
- 0071's rollback drops `active_from` and restores 0008's `claim_deliveries`, which ignores it.
- Both 0088 listeners would then be offered every historical `PUBLICATION_*` event: one `destination_content` write each, plus a signed revalidate POST per event to every configured hook.
- `site_content_v1` has no 72-hour guard (by design: `active_from` is the guard).
- Mitigations:
  - Always roll back 0088 before 0071.
  - `PREREQUISITES` records that 0087 and 0088 need 0071 (S4, f65ff7c).
  - **Done (2026-11-01):** 0071's rollback now refuses while any 0088 object exists (its subscriptions, `destination_content`, or either function), and its hint names the order. `check:s2-rollback-0071` (offline, in `npm test`) checks this; `check:s2-rollback-0071-staging` (S4 runs it, rolled back) proves it live. 0087 does not read `active_from` and needs no guard.

**R3 · Replaced functions whose production body was never digested. Closed (2026-11-01).** `production_replaced_functions_2026_11_01.sql` ran on production (approved; 3/3 answered, 0 errors, output scan clean) and S4 compared it with the repo state before the pending migrations (built on staging, then rolled back):
- `mineiq_search` (0080, rollback restores 0050a) **matches** the repo, so 0080's rollback is production-exact.
- `claim_deliveries` (0071) and `company_go_live` (0072) **differ** byte for byte: they moved to R1, which found the difference is formatting only.

**R4 · storage.objects policies in production (0078). Closed (2026-11-01).**
- All six policies 0078 drops and recreates match the repo exactly, and production has no extra permissive INSERT, UPDATE or DELETE policy, so 0078 closes the hole as intended.
- Production has one extra policy that is nowhere in the repo: `conf_pkg_member_read` (SELECT, `authenticated`). It looks hand-made for the conference package. 0078 does not touch it and it grants no write. **For `docs/SCHEMA-RECOVERY.md`:** it is production-only, so a fresh replay of the migrations would not recreate it; record it there (or capture it in a migration) before production is ever rebuilt from the repo.
- Buckets: `company-media`, `company-logos`, `company-docs` and `company-media-private` exist. `message-attachments` is absent, as expected: 0062 creates it, before 0078.
- `posts.media_url` already exists in production (0071 adds it only if missing; 0087 and the investor app read it).

**R5 · Low, verify only.**
- The 0075 and 0076 rollbacks restore grants by staging's ACL digest. Compare them with production's Q09 rows before relying on them (still the Phase 0 **[audit]** item).
- 0087 reads `posts.media_url`. 0071 adds it if it is missing, so 0087 follows 0071.
- No migration from 0071 onward references a deferred object, except 0076's `brand_kits`/`story_projects` statements, which are guarded (`migration-0076-without-0028-check` 12/0).
- 0080, 0085, 0086, 0087, 0088 and 0090 create only new objects, or replace functions created by pending migrations (0064, 0072). Their rollbacks are therefore exact in production as well.

## Rollback summary

All 27 migrations that run have a rollback file. The round trip passes on staging (`migration-rollback-roundtrip`). Lossy and security-reopening rollbacks are marked in the table above.

Special cases:
- **0059:** never in production; it is already applied there.
- **0067:** cascades Conference Mode removal, and is already applied.
- **0071, 0072 and 0076:** see R1. In production, back out with the rollback capture-on-apply saved (byte-exact). The committed rollbacks restore the same behaviour, differing only in formatting.
- **0071 under 0088:** see R2.

---

## History

### Production audit results (2026-11-01 00:47 UTC; read-only; 20/21 answered, Q15: no pg_cron)

**Already applied in production:** 0053, 0054, 0056, 0057, 0059, 0060, 0067.
**Pending:** 0058, 0061a, 0062, 0063, 0064, 0065a/b/c, 0066, 0068, 0069b, 0071,
0072, 0073a/b/c, 0074, 0075, 0076 (+ 0077). **Deferred:** 0055, 0061b; 0028
(story studio: `brand_kits`, `story_projects`) has never been applied.
(The audit's 0061a marker read "applied", but Q09 shows anon still holding all
privileges on `company_follows` and `post_events`, so 0061a is pending; the
marker tested a table that never had an anon grant. To fix in the audit file.)

**Data:** 1,571 companies (1,492 published), 5 with an account owner;
memberships: 5 owners + 1 viewer; 0 invitations; 29 accounts (24 investors,
3 company, 2 admins; 12 active in 30 days); 2 conversations; activity_log
empty; site forms still store through anon INSERT (6 demo requests in 30 days).
No pg_cron or pg_net (no database-side outbound calls). RLS on every table;
TRUNCATE granted on 41 tables (s01).

**Compared with staging:**
- Sign-up trigger identical; 0059 is already applied (exclude it; NEVER use its
  rollback in production). `handle_new_user` body differs from staging (no
  pending migration touches it).
- Investor-app table policies: 42/44 identical; the 2 differences are exactly
  0058 (`listing_reports`, covered by 0077) and 0073c (`post_events`).
- 0076-table policies: 26/30 identical; the differences are exactly the pending
  0063 and 0068 changes.
- **Function drift:** production's `accept_company_invitation`,
  `publish_publication` and `revise_publication` match NO version in the repo.

**New blockers from the audit (before any production migration):**
1. **0076 fails in production:** 10 statements target `brand_kits` /
   `story_projects`, which do not exist there (0028 never applied). Make them
   conditional and re-verify (staging, rolled back).
2. **Function drift:** retrieve production's source for the drifted functions
   (a second read-only query, needs approval) to build production-exact
   rollbacks for 0071/0076, keep production's first-owner handoff behaviour in
   0076, and confirm `/api/revise-release` matches production's
   `revise_publication`.
3. Phase 3 list updated: 0058 + 0077 together, then 0061a. Nothing else from
   0053–0060 is pending.

### Sprint 1 updates (2026-11-01)
- **0076 blocker fixed:** the brand_kits / story_projects statements are guarded
  with to_regclass in the migration and its rollback.
  `scripts/migration-0076-without-0028-check.mjs` 12/0: the original fails in
  production's shape, the guarded file applies, everything else it creates is
  identical, and the rollback is clean. `migration-rollback-roundtrip` 60/0 with
  the tables present (staging's applied state reproduced exactly).
- **New 0078_storage_role_hardening** (Phase 5, after 0076): storage writes and
  deletes follow the a03 drafting roles; investors can no longer upload to the
  public buckets. `scripts/storage-role-0078-check.mjs` 17/0 rolled back;
  included in the rollback round trip. The investor app never writes to storage.
- **Function drift:** `supabase/audit/production_function_source_2026_11_01.sql`
  (two read-only SELECTs) and `scripts/function-drift-diff.mjs` (secret
  redaction before display) are ready and dry-run on staging. Not run in
  production: waiting for approval, after the password is rotated.

