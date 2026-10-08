# Tenant-isolation testing

How to prove that one paying company cannot reach another's data. Run by
`npm run check:isolation` (`scripts/tenant-isolation-test.mjs`).

**Every instruction here is a STAGING instruction.** Nothing in this document is
run against production. The suite refuses to start if pointed at the production
project and has no override flag.

---

## The blocker you will hit first

**A staging environment cannot currently be built from this repository.** The
schema has drifted from `supabase/migrations/` in both directions:

**In the migrations, absent from the live database** — these were never applied:

    app_secrets  brand_kits  company_claims  quotes  story_projects  story_renders

**In the live database, created by no migration** — these predate version
control and were made by hand in the Supabase dashboard:

    companies  contact_submissions  demo_bookings  profiles

`public.is_admin()` is in the same category: 59 references across 20 migrations,
no definition in any of them.

So replaying the migrations onto an empty project fails immediately —
`0001_security_lockdown.sql:19` runs `drop trigger ... on public.companies`
against a table that does not exist. 16 migrations declare a foreign key to
`companies`, 14 to `profiles` or `auth.users`.

**Reproducibility is a prerequisite for the isolation proof, not a parallel
task.** Until a fresh project can be built from the repo, there is nowhere safe
to run this suite.

### Closing it

1. Capture the four missing tables from the live schema into `0000_baseline.sql`
   — ordinary `CREATE TABLE IF NOT EXISTS`, taken from the live definitions, so
   it is a no-op against production and a foundation anywhere else.
2. Capture `is_admin()` into the same baseline, from the live
   `pg_get_functiondef` output, reviewed before it is committed.
3. Decide, per table, whether the six unapplied ones are wanted. If they are,
   apply them; if not, delete the migrations. A migration set that is partly
   fiction is worse than either.
4. Replay the whole set onto an empty project and confirm it completes.

Only then is step 1 below possible.

---

## 1 · Create the staging project — STAGING

A second Supabase project. Free tier is sufficient; the suite writes a handful of
rows.

    Supabase dashboard -> New project -> name it "mineex-staging"

Note its URL and anon key. Do **not** reuse production's.

## 2 · Build the schema — STAGING

Run the migration set in order against the staging project's SQL editor,
starting with the `0000_baseline.sql` from the section above. Stop at the first
error and fix the migration rather than hand-patching staging — the point of this
exercise is a schema that can be rebuilt.

Skip `0055` (device push). It is deliberately unapplied everywhere.

## 3 · Seed two companies and four identities — STAGING

Create through the dashboard's Auth panel, or by signing up on a staging build.
Disposable addresses; no real customer data.

| Identity | Needs |
|---|---|
| Company A user | `profiles.role = 'company'`, owner or active member of company A |
| Company B user | same, for company B |
| Investor | `profiles.role = 'investor'`, no company relationship |
| Admin | `profiles.role = 'admin'` |
| Anonymous | nothing — the suite uses the anon key alone |

`profiles` is write-locked by `0004`, so set the roles with
`admin_provision_company()` as the service role, or by direct SQL in the staging
editor. Seed at least one row per company in `publications`, `conversations`,
`updates`, `events` and `story_projects`, or the join-scoped assertions report
SKIP for want of a parent row.

## 4 · Configure and run — STAGING

    export ISOLATION_SUPABASE_URL=https://<staging-ref>.supabase.co
    export ISOLATION_ANON_KEY=<staging anon key>
    export ISOLATION_API_BASE=https://<staging-deployment>.vercel.app
    export ISOLATION_COMPANY_A_EMAIL=... ISOLATION_COMPANY_A_PASS=...
    export ISOLATION_COMPANY_A_ID=<uuid> ISOLATION_COMPANY_A_SLUG=<slug>
    export ISOLATION_COMPANY_B_EMAIL=... ISOLATION_COMPANY_B_PASS=...
    export ISOLATION_COMPANY_B_ID=<uuid> ISOLATION_COMPANY_B_SLUG=<slug>
    export ISOLATION_INVESTOR_EMAIL=... ISOLATION_INVESTOR_PASS=...
    export ISOLATION_ADMIN_EMAIL=...    ISOLATION_ADMIN_PASS=...
    export SUBMISSION_SALT=<any long random string>

    npm run check:isolation -- --matrix

Exit codes: `0` clean · `1` a FAIL · `2` pointed at production, refused ·
`3` environment incomplete.

## What it asserts

| § | Assertion | Identities |
|---|---|---|
| 1 | **Positive controls.** A can read its own rows; anon can read the public surface | companyA, anon |
| 2 | Cross-tenant SELECT denied on all 43 company-scoped tables | companyA, anon, investor |
| 3 | Cross-tenant INSERT / UPDATE / DELETE denied, with a forged company id in the payload | companyA |
| 4 | Join-scoped children denied via their parent (`messages`, `publication_media`, `update_documents`, `event_deliveries`, `story_renders`) | companyA |
| 5 | Admin retains cross-company access | admin |
| 6 | All 34 routes refuse unauthenticated, and refuse A acting on B | anon, companyA |
| 7 | Storage: A cannot list B's prefix | companyA |

Section 1 is not a formality. A denial-only suite passes perfectly against a
totally broken database, so the controls run first and their failure invalidates
everything after them.

## Reading the result

`SKIP` is never `PASS`. The summary counts them separately and prints *"a run
with any SKIP is not a proof of isolation."* A clean run is `0 failed, 0
skipped` — anything else is a partial result, and saying otherwise would be
claiming a test passed that did not execute.

The completeness check is the suite's own guard: it re-derives the
company-scoped table list from `supabase/migrations/` on every run and FAILS if a
table exists that `_isolation-targets.mjs` does not cover. Verified to catch a
gap — removing `facts` from the inventory produces `uncovered: facts`.
