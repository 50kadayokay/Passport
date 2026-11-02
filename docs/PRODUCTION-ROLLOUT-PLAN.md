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
- Every migration runs through the production runner
  (`scripts/apply-migrations-production.mjs`, S1): one file per run, one
  transaction per file, an egress check, capture-on-apply for every function the
  file touches, and a pre/post snapshot diff. The two CONCURRENTLY files (0065c,
  0073a) also go through the runner, in its no-transaction mode (S1, being
  added). Until that mode lands, the runner refuses them and the rollout waits
  at that step; nothing is run by hand. The production DSN is supplied by you
  and never stored in the repo.
- After every phase: re-run the read-only audit and diff it against the
  expected state.

## Runbook: the order to run it, and who runs each step

One ordered list for the whole launch. `docs/PRODUCTION-LAUNCH-CHECKLIST.md` is
the one-page summary of it. **Who:** *you* means the user. Only you hold
production access, approve, and type every production command. *S4* coordinates,
holds the staging evidence and reviews each step's output with you. No session
connects to production.

Shared settings for the commands below (in your own shell, never in chat or git):
- `PRODUCTION_DSN_FILE`: a file outside the repo, mode 600, holding the production
  connection string as `postgres`; the runner refuses anything else. Optional:
  `PRODUCTION_DB_CA_FILE` (Supabase's CA certificate).
- For the rollback commands, a `pg_service.conf` entry named `mineex_prod` outside
  the repo, so the connection string never appears on a command line.
- `SMOKE_INVESTOR_*`, `SMOKE_OWNER_*` and optionally `SMOKE_VIEWER_*`: the
  production test accounts (gate g07).

### One read-only check per step: `scripts/prod-check.mjs`
After each step below, run its stage. Nothing is written: HTTP goes through the
smoke's read-only guard, and catalog reads run in `BEGIN READ ONLY` transactions.
Accounts are asked for at a hidden prompt, and the DSN comes from
`PRODUCTION_DSN_FILE`. Each check prints PASS / FAIL / INCOMPLETE / NOT YET. The
exit code is 0 for PASS, 1 for FAIL, 2 for REFUSED and 3 for INCOMPLETE.

| After | Command |
|---|---|
| Step 3 (the Vercel deploy) | `PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/prod-check.mjs --stage=deploy` |
| Phase 3 (after 0061a) | `... node scripts/prod-check.mjs --stage=phase3` |
| Phase 4 (after 0066) | `... --stage=phase4` |
| Phase 5 (after 0078) | `... --stage=phase5` |
| Phase 5b (after 0091) | `... --stage=phase5b` |
| Step 6, before the pilot opens | `... --stage=final` |

Each stage runs:
- `production-smoke.mjs`. A check that needs a later migration reads NOT YET.
- `/api/ops` for a guest, which must be refused, and for the admin account if given, which must also show the listing-report limit.
- Every pending migration's runner marker: applied up to this stage, not yet after it.
- The 0092/0093 listing-report guard, checked in the catalog. No report is ever submitted.
- A check that no pg_cron outbox drain exists.

Dry run against staging:

```
node scripts/prod-check.mjs --staging --app <staging app or API URL> --stage=final
```

On staging, migrations ahead of the stage are expected and report INFO.

### Step 1 · Preconditions (you, with S4)
Every row of "Phase 0" below passes. `npm test` and the build are green on the
commit being deployed, and the staging evidence in the launch checklist is
current.

### Step 1b · Before anything is pushed: keep preview deployments off production (you, in Vercel)
**Why.**
- Vercel scopes `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to "Production and Preview".
- Pushing `portal-work`, or opening its PR, builds a **Preview** deployment of the new code against the **production** database, before any migration.
- Removing the Preview values is not enough. Both the browser bundle (`src/lib/supabase.js`) and the API (`api/_supabase.js`) fall back to the production project when `VITE_SUPABASE_URL` is unset.
- Any server secret scoped to Preview (for example `SUPABASE_SERVICE_ROLE_KEY`) would also let the preview API write to production.

Do **one** of these, then check it, before the first push:
1. **Recommended: turn preview builds off.** Vercel → project → Settings → Git →
   **Ignored Build Step**: choose "Only build production" (or a command that skips
   when `VERCEL_ENV` is not `production`; confirm the exact option on that page).
   Nothing previews, so nothing can reach production early.
2. **Or keep previews and point them at staging:**
   - Set the Preview values of `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to
     the staging project (`jmljfovtfxcdhjmtlnva`): staging's URL and its
     publishable key.
   - Remove `SUPABASE_SERVICE_ROLE_KEY` and every other server secret from the
     Preview scope. A preview then cannot write anywhere with service rights.

**Check:**
- After the push and after the PR opens, Vercel → Deployments shows **no** Preview
  build for the branch (option 1), or the preview's network requests go only to
  `jmljfovtfxcdhjmtlnva` (option 2).
- **Stop if** a Preview built against production. Delete that deployment, then
  check the production Postgres and API logs for its traffic before going on.

The same fallback is why a local dev or preview server must never run without
staging settings (S4, 2026-11-01: a signed-out local preview polled production).

### Step 2 · Backup (you), before Phase 3
1. In Supabase, open the production project, then Database → Backups. Confirm the
   newest daily backup completed and note its time.
2. **What Pro gives you (as of 2026; confirm on that page):**
   - **Daily backups** are automatic, kept for 7 days and restored from that page.
     There is no "back up now" button for them, so a backup "taken just before"
     Phase 3 means one of two things:
     - schedule Phase 3 soon after a fresh daily backup has completed; or
     - also take your own logical dump to storage outside the repo, for
       example `supabase db dump` or `pg_dump` against the same connection.
       That is an extra copy, not the restore path Supabase supports.
   - **Point-in-time recovery (PITR)** is a paid add-on. It needs at least the
     Small compute size, and it replaces daily backups with restore to any
     second within its retention (7, 14 or 28 days). It would let a restore land
     just before the bad step instead of at the last daily backup. Enabling it
     is your decision and a cost; this plan does not require it.
3. **A restore is the last resort, after rollbacks.**
   - Restoring rewinds the whole database. Every investor action after the
     restore point is lost: sign-ups, follows, messages, listing reports and news
     processing.
   - The project is unavailable while it runs.
   - Use it only if a step's rollback fails or cannot undo the damage, such as
     data loss outside the step's scope.
   - Every migration has a verified rollback, and the functions also have
     capture-on-apply rollbacks, so a rollback is always tried first.

### Step 3 · Phase 1: deploy the API and web (you, in Vercel)
1. Set the variables under "Environment variables" below that are needed before
   Phase 1. Leave everything under "Must NOT be set" unset, including
   `PUSH_ENABLED`.
2. Push `portal-work` and deploy it to production, only after Step 1b.
3. **Checkpoint:**

   ```
   node scripts/production-smoke.mjs --app <production web URL> --supabase https://rvptronniomlqumjhyrr.supabase.co --production
   ```

   Then the manual items of Checkpoint 1 below.
4. **Stop if:** any FAIL, or a 5xx rise. **Rollback:** Vercel instant rollback to
   the previous deployment. There is no database state to undo.

### Step 4 · Phase 2: native build (you, store review), in parallel
It has no schema dependency. Checkpoint 2 is below.

### Step 5 · Phases 3 to 5b: migrations, one file at a time (you)
Run them in the order of "Production migration order" below (31 rows; row 0 is
never run). For each file:
1. **Plan (connects to nothing):**

   ```
   node scripts/apply-migrations-production.mjs
   ```

   The next step must be this file. Read its "needs", its "capture" line and its
   checkpoint SQL.
2. **Apply:**

   ```
   node scripts/apply-migrations-production.mjs --apply --only <file> --ref=rvptronniomlqumjhyrr --approved-by="<your name, date, and where you approved>"
   ```

   Type the ref again at the prompt. Before connecting, the runner refuses:
   - a file that is not the next step;
   - a file with no rollback;
   - a file whose functions it cannot capture;
   - staging, or anything not connected as `postgres`.

   Then, in order:
   1. It captures production's current function definitions to
      `supabase/audit/results/apply-capture-<file>-<time>.sql` (gitignored, mode
      600, never shown).
   2. It applies the file in one transaction and checks the file's marker inside
      it.
   3. It commits, then prints the pre/post diff and logs it to
      `supabase/production-log/`.
3. **0065c and 0073a** (CONCURRENTLY) use the same command; the runner runs them
   in its no-transaction mode (S1). If the runner still refuses them, stop and
   wait for that mode.
4. **0058, then 0077,** in the same session, with nothing in between.
5. **Per-file checkpoint:** the runner's marker reads "applied", and its diff
   shows only the file's intended objects. Anything else is a stop.
6. **After the last file of each phase (0061a, 0066, 0078, 0091):**
   1. Re-run the read-only audit and diff it against the expected state:

      ```
      PRODUCTION_DATABASE_URL=... node scripts/production-audit-run.mjs --target production supabase/audit/production_readiness_2026_10_31.sql supabase/audit/results/after-phase-<n>.json
      ```

      Results stay in the gitignored folder.
   2. Run the smoke command from Step 3.
   3. Work through the phase's items under "Checkpoints" and "Post-launch smoke list".
   4. You approve the next phase.

### Step 6 · Smoke and observe (you)
After 0091: the smoke command, the investor-app checks, and 24 h with no rise in
5xx or client errors.

### Step 7 · Open the pilot (you)
Give the portal to 2–3 pilot companies through their owner accounts.

Scheduled delivery, the outbox drain and push stay off throughout; see
`docs/PILOT-DISABLED-DELIVERY.md`, checked by `check:s2-pilot-disabled`. Phase 6
needs its own approval.

### Rolling back a migration (you, with S4)
**Order.** Strictly reverse: only the most recently applied file, then the one
before it. Never jump past a file that is still applied.

**Command.** The runner does it, with the same flags, exact ref, typed
confirmation and DSN file as an apply:

  ```
  PRODUCTION_DSN_FILE=<path outside the repo> node scripts/apply-migrations-production.mjs \
      --rollback --only <file> --ref=<production ref> --approved-by="<who approved, and where>" \
      [--accept-data-loss="<the decision, and who made it>"]
  ```

- It refuses anything but the file it applied most recently, and every case
  under **Never** below. A lossy rollback needs `--accept-data-loss`.
- Transaction files: the marker must read applied, then a pre-snapshot. One
  transaction runs the committed rollback, then the capture file that apply
  wrote (production's own function text), if there is one. The marker must then
  read NOT applied, or nothing is committed. Then a post-snapshot and diff.
- The CONCURRENTLY files (0065c, 0073a) run their `DROP INDEX CONCURRENTLY`
  statements one at a time, outside a transaction.
- It logs `rolled_back`, so the plan offers the file again. The plan's ROLLBACK
  section shows which file is next.

**Afterwards.**
1. Re-run the read-only audit.
2. If the runner refused, failed or was interrupted, nothing more runs until
   `--reviewed <file>` is recorded after inspection. The manual commands
   (`psql "service=mineex_prod" -v ON_ERROR_STOP=1 -f supabase/rollbacks/<file>.rollback.sql`,
   then the capture file; no `-1`) are for when the runner itself cannot
   connect. Decide that with S4.

**Never:**
- **0071 while 0088 is applied.** Its rollback refuses (R2); roll back 0088 first.
- **0059's rollback, in production, ever.** 0059 is already applied there (it is
  not in the list), and its rollback drops `on_auth_user_created`, which would
  break investor sign-up.
- **0000_baseline.** Never run; it has no rollback.
- **0067's rollback.** It is already applied and cascades Conference Mode
  removal; it is not part of this rollout.
- **A lossy rollback without a decision.** The Rollback column marks them (for
  example 0072 drops unpublished drafts). Before running one, decide with S4
  whether the loss is acceptable or a forward fix is better.

### Stop conditions (any one: stop, do not continue, tell S4)
- **The runner refuses, errors or is interrupted.** Nothing more runs until
  `--reviewed <file>` is recorded after inspection.
- **Capture-on-apply fails.** The runner applies nothing; leave it that way.
- **The marker** does not read "applied" after commit, or the pre/post diff
  shows anything outside the file's intended change.
- **The read-only audit** after a phase differs from the expected state.
- **Any smoke failure, or any investor-app regression.** That covers feed,
  profile, follow, messaging, listing report and sign-up (exactly one profile).
- **A rise in API 5xx** or client error reports.
- **Any data change outside the step's scope.**
- **Anything about delivery.** A website revalidate call, a push, or a scheduled
  job appears that `docs/PILOT-DISABLED-DELIVERY.md` says cannot happen.

On a stop:
1. Roll back that file (above), or the deploy for Phase 1.
2. Re-run the audit.
3. Report before doing anything else.
4. Restoring a backup comes only after rollbacks (Step 2).

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
| Preview deployments (Step 1b) | preview builds turned off for the branch, or Preview scoped to staging with no server secrets, BEFORE anything is pushed |
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
| 3 | `0092_listing_reports_column_insert.sql` | 3 | transaction; immediately after 0077, same runner session (it narrows the door 0077 reopens) | 0077 | re-opens: guests can set id/created_at again (restores the post-0077 table-level grants) |
| 4 | `0093_listing_reports_rate_limit.sql` | 3 | transaction; immediately after 0092, same runner session (bounds the same door: rate limit + one row per request) | 0092 | re-opens: no rate limit or per-request cap on direct reports (drops the guard, its tables and its counters) |
| 5 | `0061a_table_privilege_hardening.sql` | 3 | transaction | — | re-opens anon grants |
| 6 | `0062_message_attachments.sql` | 4 | transaction | — | lossy: attachment rows (bucket kept) |
| 7 | `0063_company_initiated_threads.sql` | 4 | transaction; only after Phase 1 messaging code | — | clean |
| 8 | `0064_notification_clearing.sql` | 4 | transaction | — | clean (cleared_at dropped) |
| 9 | `0065a_analytics_breakdown.sql` | 4 | transaction | — | clean |
| 10 | `0065b_engagement_corrections.sql` | 4 | transaction | 0065a | clean (restores 0048 bodies) |
| 11 | `0065c_analytics_indexes.sql` | 4 | outside a transaction (CONCURRENTLY), one statement at a time | 0065a | clean |
| 12 | `0066_mineiq_conversations.sql` | 4 | transaction | — | lossy: Mine IQ history |
| 13 | `0068_site_contract.sql` | 5 | transaction | — | lossy: website tokens, blueprint manifest |
| 14 | `0069b_stripe_events.sql` | 5 | transaction | — | lossy: Stripe event ledger |
| 15 | `0071_publishing_reliability.sql` | 5 | transaction; capture-on-apply (R1; the runner captures before every function-replacing file, 21 in all) | — | lossy (drops dispatcher_runs, ops_alerts, listener active_from); restores repo 0036/0008: same behaviour as production (R1); byte-exact via the captured rollback |
| 16 | `0072_profile_drafts.sql` | 5 | transaction; capture-on-apply (R1; the runner captures before every function-replacing file, 21 in all) | — | lossy: unpublished drafts; restores 0035's company_go_live: same behaviour as production (R1) |
| 17 | `0073a_impression_dedupe_index.sql` | 5 | outside a transaction (CONCURRENTLY) | — | clean |
| 18 | `0073b_impression_tracking.sql` | 5 | transaction | — | clean |
| 19 | `0073c_post_events_client_guard.sql` | 5 | transaction | — | re-opens: clients can backdate post_events again |
| 20 | `0074_profile_revision_history.sql` | 5 | transaction | 0072 | lossy (drops company_profile_versions.kind; snapshot rows kept) |
| 21 | `0075_profile_versions_privileges.sql` | 5 | transaction | — | re-opens anon grants |
| 22 | `0076_company_roles.sql` | 5 | transaction; capture-on-apply (R1; the runner captures before every function-replacing file, 21 in all) | 0072 | lossy (drops company_invitations.kind; revokes pending member invitations) and re-opens (TRUNCATE/REFERENCES/TRIGGER for anon/authenticated on memberships and invitations); restores 0031's accept_company_invitation (R1) |
| 23 | `0078_storage_role_hardening.sql` | 5 | transaction (R4 cleared) | 0076 | re-opens storage writes (repo 0037/0040 policies; production's six match them exactly) |
| 24 | `0080_mineiq_search_any_term.sql` | 5b | transaction | — | restores 0050a's mineiq_search; production-exact (R3 cleared) |
| 25 | `0085_conference_booth_config.sql` | 5b | transaction | — | lossy: published booth looks |
| 26 | `0086_service_requests.sql` | 5b | transaction | 0076 | lossy: service requests (export first) |
| 27 | `0087_audience_events.sql` | 5b | transaction | 0071 | lossy: audience events |
| 28 | `0088_content_fanout.sql` | 5b | transaction; deploy `api/_listeners.js` first (Phase 1) | 0071 | lossy: destination copies; **roll back before 0071** (R2) |
| 29 | `0090_notification_clear_roles.sql` | 5b | transaction | 0064, 0076 | re-opens: any member can clear notifications again (restores 0064's body) |
| 30 | `0091_notification_clear_no_platform_admin.sql` | 5b | transaction; right after 0090 | 0090 | re-opens: platform admins can clear without membership again (restores 0090's body) |
<!-- migration-order:end -->

**Already applied in production, not in the list:** 0053, 0054, 0056, 0057, 0059 (never run its rollback in production), 0060 and 0067.

**Deferred, never run:** 0011, 0027, 0028, 0029, 0055 and 0061b.

### Checkpoints

- **Phase 3, after 0061a:**
  - The audit diff contains exactly these changes.
  - Investor-app smoke passes (list below).
  - Public contact and demo go through `/api/submit`.
  - A listing report works from the web and from an installed 1.3.x build.
  - A guest cannot set `id` or `created_at` on a listing report (0092).
  - A sixth listing report from one device inside 10 minutes is refused, and so is a request carrying two reports (0093).
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

No dispatch cron is added by this rollout. The proof, with `file:line` evidence, is `docs/PILOT-DISABLED-DELIVERY.md` (`check:s2-pilot-disabled`, in `npm test`).

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

All 30 migrations that run have a rollback file. The round trip passes on staging (`migration-rollback-roundtrip`). Lossy and security-reopening rollbacks are marked in the table above.

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

