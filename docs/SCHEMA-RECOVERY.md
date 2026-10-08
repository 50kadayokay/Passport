# Schema recovery and staging readiness

The migration set cannot be replayed onto an empty database. This is the plan to
fix that, prove it, and then run the tenant-isolation suite against a staging
environment.

Run `npm run check:deps` for the current machine-checked state.

---

## 1 · What is missing, and how we know

`scripts/migration-deps-check.mjs` reads all 61 migrations in filename order and,
for every referenced object, asks whether anything creates it and whether that
happens earlier. Two passes, because `insert into public.facts (a, b)` and
`public.owns_company(x)` are the same text shape — pass 1 learns what the set
creates, pass 2 judges references against it.

**Result: 5 missing objects, 0 ordering faults.**

| Kind | Object | Referenced by | First |
|---|---|---|---|
| TABLE | `companies` | 21 migrations | `0001` |
| FUNCTION | `is_admin()` | 18 migrations | `0001` |
| TABLE | `profiles` | 1 migration | `0004` |
| TABLE | `contact_submissions` | 1 migration | `0058` |
| TABLE | `demo_bookings` | 1 migration | `0058` |

Replay fails at `0001_security_lockdown.sql:19` — `drop trigger ... on
public.companies` against a table that does not exist.

**Zero ordering faults is the important half.** Once those five exist, the other
61 migrations replay in their current order. **No historical migration needs to
be edited**, which removes the only reason to touch them.

### What the checker cannot see

**A green result from `check:deps` means "no text-visible dependency is
unresolved." It is not a proof of reproducibility.** Only a real replay plus a
schema diff proves that. The tool prints this list on every run so the caveat
travels with the output rather than living only here.

| Blind spot | Why it matters |
|---|---|
| **Dynamic SQL — 20 of 61 migrations** use `execute format(...)` | `0042` and `0043` generate policies over a table list; `0045`, `0046`, `0053`, `0056` harden privileges the same way. Objects they create or reference are invisible to a text scan |
| Column drift | A column production has that no migration adds |
| Constraint drift | A hand-added check or foreign key |
| Function signatures | Matching is by **name only** — a call to `owns_company(uuid)` resolves against a definition of `owns_company(text)` |
| Extensions | `digest`, `crypt`, `to_tsvector` are allowlisted as built-in, so a missing `pgcrypto` or `pg_trgm` is **not** reported. Query 9 is the real check |
| Grants, RLS correctness, trigger argument mismatches | Structure only; the checker never evaluates semantics |
| Supabase-managed configuration | Auth settings, JWT config, vault secrets, edge functions, bucket configuration |

Two things that turned out **not** to be gaps, having been checked:

- **Realtime.** The app polls deliberately — `0014` chose short-interval polling
  for the investor inbox (`src/portal/Messages.jsx:28`, `src/lib/feed.js:156`).
  No publication membership to reproduce.
- **Reference data.** 8 migrations insert the rows the system needs to function —
  `plans`, `features`, `plan_features`, `listener_subscriptions`, `news_sources`,
  `composition_rules`. Replay creates them, so staging needs synthetic data only
  for *companies and users*, not for the platform's own catalogue.

### Drift in the other direction

Six tables are defined in migrations but absent from production, so those
migrations were never applied:

    app_secrets  brand_kits  company_claims  quotes  story_projects  story_renders

Sources: `0011`, `0027`, `0028`, `0029`. Each needs a decision — apply it, or
delete the migration. A set that is partly fiction is worse than either, because
every future reader has to rediscover which half is real.

This is also why queries 5 and 6 ask for live function names: the same partial
application may have left functions behind without their tables, or tables
without their functions.

### The queries are verified read-only

`npm run check:audit-sql` (`scripts/audit-sql-readonly-check.mjs`) asserts it
mechanically rather than asking you to take it on trust. Per statement:

1. it must open with `select` or `with` — nothing else is permitted;
2. it must contain no mutating keyword, splitting on semicolons that fall
   **outside** string literals, dollar-quotes and comments, so
   `select 1; delete from ...` cannot hide as one statement;
3. any secret-bearing catalog column it reads (`pg_get_functiondef`,
   `pg_get_expr`, `qual`, `with_check`, `proconfig`) obliges the file's header to
   warn the reader to skim for credentials.

**Result: 15 statements, 0 problems.** And the validator is proven to fail — a
hidden `delete` after a `select`, a trailing `update`, a `set role`, and
`pg_get_functiondef` without a header warning are each caught, while a semicolon
inside a string literal is correctly *not* treated as a statement break.

### Sensitive-value exposure

Not one statement selects a row of table data, so no company profile, message,
document or assay can appear in the output. Three columns can carry a literal
secret and are handled explicitly:

| Column | Handling |
|---|---|
| `pg_get_functiondef` (query 6) | Gated to **unversioned functions only** — the exclusion list carries all 72 names the migrations define, so you get the gaps rather than a dump of every body. Header instructs redaction |
| `pg_get_expr` (query 1, column defaults) | A default could hold a literal; same redaction instruction |
| `qual` / `with_check` (query 7) | Policy expressions; same |

`public.app_secrets` is never selected from, by any statement.

---

## 2 · The baseline migration

Scaffold: `supabase/audit/0000_baseline.scaffold.sql`. It is in `audit/`, not
`migrations/`, so it cannot be applied by walking the migrations directory —
move it only once filled and reviewed.

**Numbered `0000`** because `0001` modifies `companies`, so the baseline must
precede it. Written with `IF NOT EXISTS` throughout, so applying it to
production is a **no-op** — production already has all five. It is never needed
in production; it is what makes every other environment constructible.

Section order is dependency order: extensions → `profiles` → `companies` →
`is_admin()` → the two submission tables → the `auth.users` trigger → grants and
RLS.

Two things in it that are easy to get wrong:

- **The `auth.users` trigger.** `handle_new_user()` is defined by `0004` and
  redefined by `0023`, but the trigger that fires it sits on `auth.users` —
  outside `public`, so no public-schema audit sees it. Without it a fresh project
  creates auth users with no `profiles` row; every `is_admin()` and
  `owns_company()` then returns false, and the isolation suite's positive
  controls fail for reasons unrelated to isolation.
- **Grants must reproduce production exactly, including the anon over-grant.** A
  baseline that quietly fixes it makes staging diverge from production, which
  defeats the point. The cleanup is a separate migration applied to both.

### `is_admin()` specifically

`0004:6` documents it as `profiles.role = 'admin'`, and four independent controls
make that safe — signup hardcodes `'investor'` (`0023`), `profiles` has
INSERT/UPDATE/DELETE revoked from `authenticated` (`0004`), no migration ever
writes `role = 'admin'`, and all three role-writing functions are guarded.

But **the comment is not the function.** Copy the live definition verbatim from
query 6 and confirm:

- it reads `profiles.role` and nothing client-writable — no `auth.jwt()` claim,
  no `raw_user_meta_data`, no request header;
- `security definer`, owner and `set search_path` match the live values;
- the EXECUTE grant matches query 6's `acl`. Do not widen it.

This is the one unverified link in the whole isolation chain.

---

## 3 · Staging

Full steps in `docs/TENANT-ISOLATION-TESTING.md`. The constraints:

- **A separate Supabase project.** Free tier is enough; the suite writes a
  handful of rows.
- **Synthetic companies only.** Invented names, tickers and properties. No real
  customer's profile, documents, assays or messages.
- **Disposable accounts.** Four identities, throwaway addresses. Not your own
  login, not a customer's.
- **No production secrets.** Staging gets its own anon key, its own service-role
  key, its own `SUBMISSION_SALT`. Nothing is copied from production env.
- **Structure, not data.** The baseline reconstructs schema. Rows are seeded
  synthetically.

The suite enforces the boundary itself: `assertNotProduction()` refuses to start
against the production project ref, with no override flag, and the ref is read
from the same constant `scripts/api-auth-test.mjs` already pins so the guard
cannot drift from the thing it guards. Verified — exit code 2.

---

## 4 · Proving reproducibility

1. Fill the baseline from the query output; move it to `migrations/0000_baseline.sql`
2. `npm run check:deps` → must print **REPLAYABLE**
3. Replay all 62 migrations onto an empty staging project, in order. Skip `0055`
   (device push, deliberately unapplied) and skip `0058` (not until the client
   ships). Stop at the first error and fix the *migration*, not staging — a
   hand-patched staging environment proves nothing
4. Re-run `schema_recovery_extract.sql` against **both** staging and production
5. Diff the two outputs

Expected differences, and only these:

| Difference | Why |
|---|---|
| The 6 never-applied tables present in staging | Unless you decide to delete those migrations |
| `0055` objects absent from both | Deliberately unapplied |
| `0058` effects absent from both | Not until the client ships |
| Row counts, ids, timestamps | Staging is synthetic |

**Anything else is unexplained drift and must be resolved before the isolation
results mean anything.** A suite that passes against a schema which is not
production's has proved something about a different database.

---

## 5 · Then, and only then, the isolation suite

`npm run check:isolation -- --matrix` against staging. 48 targets, 5 identities,
7 sections.

`SKIP` is not `PASS`. The runner counts them separately and prints *"a run with
any SKIP is not a proof of isolation."* A result is a proof only at
`0 failed, 0 skipped`.

One false-pass vector is already documented in `scripts/_isolation-targets.mjs`:
a storage bucket that does not exist returns 404, which the suite reads as
"denied". The bucket names there came from the migrations (`company-media`,
`company-media-private`, `company-docs`) after an earlier version of the file
invented `public-assets`. Query 10a settles it authoritatively.

---

## Current state

| Item | Status |
|---|---|
| Missing-object inventory | **Done** — 5 objects, machine-checked, no false positives |
| Ordering faults | **Done** — zero; no historical migration needs editing |
| Extraction queries | **Written** — `supabase/audit/schema_recovery_extract.sql`, read-only |
| Baseline | **Scaffolded**, awaiting live metadata |
| Staging | **Documented**, not created |
| Reproducibility | **Not proven** — blocked on the baseline |
| Isolation results | **None** — 0 of 48 targets have ever run |
| Phase 3 | **Prepared, unapplied** — 38 unit tests passing |
