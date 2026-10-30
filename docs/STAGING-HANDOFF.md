# Staging environment & security verification — handoff

Written 2026-10-30, at the end of the session that built the staging rig and
ran the tenant-isolation suite for the first time. It exists so the next
session does not have to re-derive any of it.

**Nothing in here is a credential.** Where one is needed, the instruction says
how to obtain and store it, never what it is.

---

## 1 · The staging project

| | |
|---|---|
| Project ref | `jmljfovtfxcdhjmtlnva` |
| Name | `mineex-staging` |
| Organisation | `mineex-staging` (**Free** — deliberately not the Pro org, which bills $10/mo per project) |
| Region | `us-east-1` (East US) |
| Postgres | 17.11, Nano compute |
| Created | 2026-10-29 |

**Production is `rvptronniomlqumjhyrr`. It is never a valid target for anything
in this document.**

### Connecting

The connection string lives in `supabase/staging/.connection` (gitignored,
chmod 600). It is built from the password alone:

```bash
node scripts/staging-connect.mjs      # prompts hidden, saves, tests
node scripts/staging-connect.mjs --test
```

The anon/publishable key lives in `supabase/staging/.isolation-env`
(gitignored, chmod 600):

```bash
node scripts/staging-anon-key.mjs     # prompts hidden, merges into the env file
```

Both scripts de-duplicate a doubled paste, which happened repeatedly, and
neither ever prints what it read. `scripts/check-staging-dsn.mjs` validates the
saved string and emits only booleans, counts and four fields that structurally
cannot hold a secret.

> A password was once leaked into a transcript by a check that masked
> `url.password` and then printed `url.pathname`, which held a repeated copy of
> the whole URI. That password was rotated. The rule learned: **nothing derived
> from a credential file may reach stdout**, masked or not.

### Guards

Both the migration runner and the isolation suite refuse production by ref,
with no override flag. `scripts/apply-migrations.mjs` additionally uses an
**allowlist** (`ALLOWED_REFS`), so an unvouched Supabase project is refused by
default — a denylist only stops the project someone remembered to name.

---

## 2 · Migrations — all 74 applied

Replayed onto an empty project for the first time in the project's history.
`0055_enable_device_push.sql` is excluded even from staging: it arms real push,
and a staging project pointed at the same APNs/FCM credentials could reach real
phones.

```bash
node scripts/apply-migrations.mjs                       # all, stop at first failure
node scripts/apply-migrations.mjs --from <file>.sql     # resume
node scripts/apply-migrations.mjs --dry                 # plan only
```

### Three defects, found only because the replay ran

**`0043_verification_canonical.sql` — used a function 100 lines before defining
it.** Production never noticed: it was built in the remedial order 0042, 0045,
0043, 0044, so `0045` had already created `phase3_no_truncate()`. A replay in
filename order has not. *Fixed: the definition moved above its first use, body
byte-identical, `audit-sync.mjs` still reports the two copies identical.*

**`0065b_engagement_corrections.sql` — could never have been applied
anywhere.** It adds an OUT column to three functions `0048` already created,
using `create or replace`, which Postgres refuses (42P13). **It would have
failed on production identically.** This is the migration that fixes the live
dwell bug. *Fixed: three `drop function if exists` with exact identity
signatures, no CASCADE (`pg_depend` showed no dependents). Owner, SECURITY
DEFINER, volatility, search_path and every grant — `service_role` included —
confirmed identical before and after by diffing the ACL.*

**The runner assumed one non-transactional file.** `0050b` has six
`CREATE INDEX CONCURRENTLY` statements and was not in the hand-kept list.
*Fixed: detection reads the property off the file, stripping comments first —
`0050a` mentions CONCURRENTLY only in prose and must stay transactional, and
`0050b`'s first three matches are comments too.* No migration changed.

### Final schema

74 tables · 1 view · 82 functions · 144 RLS policies · 5 storage buckets ·
7 event triggers · **0 tables without RLS**.

---

## 3 · Production ↔ staging schema differences

Staging applies **everything**, production does not. Known, deliberate
divergences:

| Migration | Production | Staging | Consequence |
|---|---|---|---|
| `0061b_companies_column_grants` | **deferred** | applied | Staging replaces anon's table-wide SELECT on `companies` with column grants, so `select=*` **fails** rather than omitting. Native apps bundle the web build and send `select=*`, which is why it is deferred. |
| `0029_company_self_serve` | **deferred** | applied | `company_claims` exists only in staging. |
| `0011`, `0027`, `0028` | deferred | applied | Outbox tooling, market quotes, Story Studio. |
| `0055_enable_device_push` | deferred | **excluded** | Arms real push. |
| `0043` (fixed) | pre-fix version | fixed version | Harmless — production was built in the remedial order. |
| `0065a/b/c`, `0066`, `0068` | **NOT APPLIED** | applied | Analytics breakdowns, dwell correction, Mine IQ persistence, site credentials. |

**Still unapplied in production**, verified 2026-10-30 by
`supabase/audit/verify_unverified_migrations.sql`: `0058`, `0061a`, `0062`,
`0063`, `0064`, `0065a`, `0065b`, `0065c`, `0066`, `0068`.

---

## 4 · Test fixtures and identities

```bash
node scripts/seed-isolation-fixtures.mjs     # idempotent; safe to re-run
```

Six identities, each a real `auth.users` row with a bcrypt password, so the
suite holds **genuine JWTs**. Written directly via SQL because the Auth Admin
API needs the `service_role` key, which is deliberately not available.

| Identity | Role | Belongs to |
|---|---|---|
| `iso-owner-a@staging.invalid` | company | Alpha (owner) |
| `iso-owner-b@staging.invalid` | company | Beta (owner) |
| `iso-staff-a@staging.invalid` | company | Alpha, membership role **`viewer`** (was the `'owner'` default until 2026-10-30, see `STAGING-PHASE-A.md`) |
| `iso-publisher-a@staging.invalid` | company | Alpha, membership role `publisher` (added 2026-10-30) |
| `iso-investor@staging.invalid` | investor | converses with Alpha only |
| `iso-investor-b@staging.invalid` | investor | converses with Beta only |
| `iso-admin@staging.invalid` | admin | — |

Companies: `iso-alpha-resources`, `iso-beta-minerals`. Both published, both
entitled to `portal_access`, `analytics`, `company_memory`, `conference_mode`.
Each carries a Mine IQ thread with a planted secret, a site credential, a media
asset and an investor conversation. All rows prefixed `iso-`.

> **Two investors on purpose.** With one investor on both sides, the suite read
> a conversation that was legitimately theirs and scored it a leak. The fixture
> was wrong, not the policy.

> **GoTrue gotcha.** A hand-inserted `auth.users` row leaves
> `confirmation_token`, `recovery_token`, `email_change_token_new` and
> `email_change` NULL. GoTrue scans those into non-nullable Go strings and every
> sign-in fails with *"Database error querying schema"* — an error naming
> neither table nor column. The seeder blanks them to `''`.

---

## 5 · Isolation results — 433 PASS · 0 FAIL · 41 SKIP (474 assertions)

```bash
set -a && . ./supabase/staging/.isolation-env && set +a
node scripts/tenant-isolation-test.mjs            # add --matrix for the full table
```

**No cross-tenant access by any identity on any tested database route.**
46 company-scoped tables, 1 user-scoped table, join-scoped children, company
RPCs and storage buckets.

Corrections made to the **test**, never to a policy:

- `company_claims` moved to a new `USER_SCOPED` list — its tenancy is `user_id`;
  `company_slug` names the company *being claimed*. Now asserts the property it
  actually has: one user must not read another's claims.
- `listing_reports` marked `WRITE_ONLY` — `authenticated: INSERT` and one INSERT
  policy. A report inbox, not a readable table.
- UPDATE probes now rewrite the **scoping column** (company A reassigning
  company B's row to itself) instead of a guessed `updated_at`. Needs no
  metadata, cannot fail for schema reasons, and tests actual row theft.
  PostgREST's OpenAPI endpoint now requires a secret key, so column metadata is
  unreachable with the anon key.
- `admin_set_billing` matched on its `not authorized` message, because plpgsql
  `raise exception` carries no SQLSTATE PostgREST maps to 403. Any *other* 400
  still fails.
- The anon control selects the column its filter already depends on
  (`news_item_companies` has no `id`).

### The 41 skips

| Count | Reason | Fix |
|---|---|---|
| **34** | No API base — the entire application layer | Staging API deployment |
| 4 | Join-scoped children with no fixture parent (`publication_media`, `update_documents`, `event_deliveries`, `story_renders`) | Extend the seeder |
| 2 | Storage objects not seeded (`company-media-private`, `company-docs`) | Seed via `SEEDED_OBJECT_ENV` |
| 1 | Company B has no engagement rows, so the denial proves nothing | Seed `post_events` |

**A run with any SKIP is not a proof.** The last 7 are cheap.

---

## 6 · Remaining security risks

**Application authorization is entirely unverified.** Every `api/` handler
rolls its own guard — `messages.js` has a local `authUser()`, `publish.js`
imports `verifyUser` from `_service.js`, `compose.js` imports `verifyBearer`
from `_supabase.js`, `dispatch.js` checks `x-dispatch-secret`. **None has been
tested.** Database isolation being strong says nothing about these.

**Four tables have RLS enabled and zero policies** — `ai_controls`,
`app_secrets`, `notification_outbox`, `submission_throttle`. That denies all
access to non-superusers. Probably deliberate (service-role-only), unconfirmed.
A deny-all table the application expects to read fails silently.

**Investigated and cleared, do not re-report:**

- *Claims abuse is bounded.* `company_claims_open_uniq` is a partial unique
  index on `(user_id, company_slug) where status = 'pending'` — one open claim
  per user per company. The table does not exist in production.
- *Token hash is not meaningfully exposed.* `site_credentials.token_hash` is
  readable by `can_touch_company()` = `owns_company() OR is_admin()` — owners
  and platform admins, **not** ordinary members. The value is sha256 of a token
  from 24 random bytes. Optional hardening: nothing legitimate ever reads it
  back, so withholding the column from SELECT would cost nothing.
- *anon holds UPDATE/DELETE/INSERT/TRUNCATE grants on `public.companies`* from
  Supabase's "automatically expose new tables" default. **All three write
  attempts were refused 401 by RLS.** The grant is permissive; the policy is the
  boundary. Staging was created with that setting ON deliberately, to mirror
  production rather than test a safer schema than the real one.

---

## 7 · Exact next steps — staging API deployment planning

**Not started. Nothing deployed. Do not deploy without explicit approval.**

The plan must cover:

1. Read every handler in `api/` (~50 files) and trace the guard each one uses.
2. The safest fully isolated staging deployment on the existing Vercel setup.
3. Guarantee staging cannot reach production Supabase, live company websites,
   production storage, investor notification channels or real publishing.
4. Enumerate **every external service that can take a live action** and say how
   each is disabled, mocked or sandboxed. At minimum: Stripe
   (`stripe-checkout`, `stripe-portal`, `stripe-webhook`), Postmark inbound and
   outbound mail, APNs/FCM push (`_push.js`, `_fcm.js`, `dispatch.js`), OpenAI
   (`_aiGuard.js`, `_openaiExtract.js`, `compose.js`), and the Site Contract
   endpoints (`site-content.js`, `site-manifest.js`).
5. How all 34 skipped application assertions execute against staging —
   `ENDPOINTS` in `scripts/_isolation-targets.mjs` already names every route
   with the guard it is *supposed* to have.
6. Authentication, authorization, cross-company access, privilege escalation,
   publishing permissions, API abuse.
7. Setup steps, costs, operational risks.
8. How staging eventually supports end-to-end testing of the Portal UI itself.

`ISOLATION_API_BASE` is the single variable that unlocks the 34.

> **Superseded 2026-10-30:** see `docs/STAGING-API-PLAN.md` (the plan) and
> `docs/STAGING-PHASE-A.md` (results). There are 37 routes, not 34. `ENDPOINTS`
> was removed because it could score unguarded routes as PASS, and the API layer
> now runs through `scripts/api-authz-test.mjs`.

---

## 8 · Master requirements matrix

The full Company Portal requirements — all fifteen areas from the original
audit brief — are tracked as a living checklist with per-item status,
implementation location, missing functionality and verification method:

**https://claude.ai/artifact/Bj5Eis1TdsW2SBi2LgXJSx**

37 rows: 29 requirement areas (`a01`–`a29`) plus 8 defect/finding records
(`d01`–`d08`). Status vocabulary: Functional (verified end to end) · Partial ·
UI only · Broken · Missing · Unverified.

**Headline findings outside security**, all still open:

- **The profile editor has no draft state.** `ProfileEditor.jsx:873` PATCHes the
  live row; the UI says *"Live — changes publish immediately."* No preview, no
  approval gate, and **no version snapshot on the company path** —
  `company_profile_versions` is written only by admin code.
- **Analytics is wrong on screen.** Dwell is computed from a millisecond column
  and labelled "Seconds spent reading": a 4-second read displays as 4,000.
  `0065b` fixes it and is unapplied. Impressions are structurally zero.
- **AI-suggested profile updates do not exist.** No code reads a release and
  proposes profile changes.
- **No centralized content record.** Each surface publishes independently;
  requirement 15's model is unbuilt. Conference Mode content is *compiled into
  the app bundle* (`src/conference/registry.js`, one company registered).
- **421 of 1,421 published companies are missing from the live investor app's
  directory and search.** PostgREST caps a page at 1000 and the request set no
  limit. Fix committed on `hotfix/directory-pagination`, **not pushed**.

### Repository state

- 13 commits on `portal-work`, **never pushed**. 1 commit on
  `hotfix/directory-pagination`, **never pushed**. `main` untouched by this
  work and 116 commits ahead of `origin/main` (pre-existing).
- Production database unchanged. The only production interaction was one
  read-only catalog query run by the user.
