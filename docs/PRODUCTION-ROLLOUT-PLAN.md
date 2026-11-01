# Production rollout plan: portal launch without disturbing the investor app

**Status: PROPOSED. Nothing here has been executed. Every phase needs explicit
approval. Production = Supabase `rvptronniomlqumjhyrr` ("Passport V1"), shared by
the investor app (web + iOS/Android 1.3.x, tag `prod-v1.3.2`), the public site,
the portal and Mission Control.**

Items marked **[audit]** are decided by the production read-only audit
(`supabase/audit/production_readiness_2026_10_31.sql`). It ran on 2026-11-01;
see "Production audit results" at the end, which supersedes Phase 3's list.

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
- Every migration runs through the guarded runner with an egress check, one file
  per transaction (CONCURRENTLY index files outside a transaction).
  The runner currently targets STAGING only; a production mode (same guards,
  production DSN supplied by you, never stored) must be built and reviewed
  first. Not built.
- After every phase: re-run the read-only audit and diff it against the
  expected state.

## Phase 0: preconditions (no production change)

| Check | Pass condition |
|---|---|
| Read-only audit run and reviewed | **[audit]** results analysed; discrepancies vs staging explained |
| Sign-up trigger (Q16) | exactly one profile-creating trigger, or a decision on 0059 |
| Policy and function digests (Q08, Q10, Q17) | production matches the state each rollback restores, or rollbacks adjusted and re-verified |
| Listing-reports decision | approve 0077 (keep the anon path for installed builds) |
| Rollbacks | all 29 verified (`migration-rollback-roundtrip`: 60/0); privilege rollbacks compared with production's current grants **[audit]** |
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

## Phase 3: security batch (only after Checkpoint 1)

In this order, each only if Q01 shows it pending **[audit]**:

1. 0057 (throttle and AI switch; `/api/submit` needs it).
2. **0058 + 0077 in the same runner session** (closes the contact and demo
   forms, keeps listing reports open for installed apps).
3. 0059 **only per Q16.**
4. 0061a (verified safe for the app: it re-grants exactly what the app uses).
5. 0053, 0054, 0056, 0060 if pending (no app dependency found).

- **Checkpoint 3:** audit diff = exactly these changes; investor-app smoke
  (guest + test account: follow, like, save, watchlist, notifications, message,
  report listing from web and from an installed 1.3.x build); public forms;
  sign-up creates exactly one profile (test account).
- **Stop if:** any of the above; roll back in reverse order.

## Phase 4: messaging and analytics schema (only after Checkpoint 3)

0062 → **0063 (requires Phase 1's messaging code; never before it)** → 0064 →
0065a → 0065b → 0065c (CONCURRENTLY) → 0066 → 0067.

- **Checkpoint 4:** messaging both directions incl. attachments; analytics pages;
  notifications; investor smoke as in Checkpoint 3.

## Phase 5: portal schema (only after Checkpoint 4)

0068 → 0069b → 0071 → 0072 → 0073a (CONCURRENTLY) → 0073b → 0073c → 0074 →
0075 → 0076 → 0078 (storage role hardening; requires 0076's has_company_role).

- **Checkpoint 5:** portal end-to-end with real roles (owner, admin, editor,
  publisher, analyst, viewer, using test accounts); investor smoke again; audit diff.
- **Stop if:** any; 0076's rollback is verified exact.

## Phase 6: cron and delivery (separate approval)

Production cron and delivery activation stay off until explicitly approved
(standing instruction).

## Rollback summary

All 29 pending migrations have a rollback file verified by the round trip.
**Lossy or risky rollbacks:**
- **Data loss:**
  - 0057: throttle counters; the AI switch resets to ON.
  - 0062: attachment rows; the bucket stays.
  - 0066: Mine IQ history.
  - 0068: website tokens and the blueprint manifest; website blueprints are kept.
  - 0069b: the Stripe event ledger.
  - 0071 / 0072 / 0074: see their files.
- **Re-open security holes:** 0053, 0056, 0058, 0060, 0061a, 0061b (emergency only).
- **0059:** only if production had no such trigger before (Q16), otherwise it breaks sign-up.
- **0067:** cascades Conference Mode removal.

## Production audit results (2026-11-01 00:47 UTC; read-only; 20/21 answered, Q15: no pg_cron)

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

## Sprint 1 updates (2026-11-01)
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

