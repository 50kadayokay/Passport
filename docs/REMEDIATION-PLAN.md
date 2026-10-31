# Remediation plan: F2–F12, D20–D21, and two issues found while planning

Written 2026-10-30, against `portal-work` at `b8204f2`. **This is a plan.
Nothing in it is implemented.** No deployment, push or merge, and no
production change. Findings come from `docs/STAGING-PHASE-A.md`. Each one
already has a regression probe, written so it fails today; that probe is what
proves the fix.

Two new issues surfaced while gathering facts for this plan:

- **S1 (isolation breach, live now):** the staging database calls the
  production app every minute.
- **D22:** production has no guaranteed dispatcher drain.

S1 leads the plan because it is live.

---

## 0 · Summary

### Priority order (security severity × customer impact × exploitability)

| # | Id | Issue | Severity | Customer impact today | Fix size |
|---|---|---|---|---|---|
| 1 | **S1** | Staging DB posts to the **production** `/api/dispatch` every minute | **Critical (isolation)** | None observed: every response 401 | Tiny (staging config) |
| 2 | **F3** | Forged "company" replies when the inbound secret is unset | High (conditional). **FIXED LOCALLY: Batch B, §7** | Investors could receive impersonated company messages | Small |
| 3 | **F4** | Paid AI open to any signed-in account and to other companies | High. **FIXED LOCALLY: Batch C, §8** | Unbounded AI spend; no data leak | Medium |
| 4 | **F2** | Checkout for any company by anyone; return URL from `Origin` | High | Billing integrity; open redirect after payment | Small–medium |
| 5 | **F5** | Request Host header decides where internal secrets go | **Low on Vercel**: measured 2026-10-30, the platform overwrites `Host`, `x-forwarded-host` and `forwarded` (§6 results). Defence in depth | None on Vercel; real on any host that passes headers through | Small, but **production-config dependent** (D22) |
| 6 | **D20** | Messaging cannot store a thread where 0063 is applied | High (functional) | None today; **breaks messaging the moment 0063 ships** | Small. **Implemented locally, §11** |
| 7 | **F12** | Form throttle keyed on `x-forwarded-for` | **Low on Vercel**: measured, Vercel overwrites `x-forwarded-for` with the real IP (§6 results). Hardening: switch to `x-real-ip` | None on Vercel | Small |
| 8 | **F7** | `contact`, `conference-inquiry` unthrottled | Medium. **FIXED LOCALLY: Batch B, §7** | Spam relay into the support inbox | Small |
| 9 | **F9** | Stripe webhook accepts replays; no de-duplication | Medium-low | A replayed "active" event could re-activate a cancelled plan | Small (+ optional migration) |
| 10 | **D22** | No guaranteed dispatcher drain in production (0011 deferred) | Medium (functional) | Missed or late feed and timeline projections | Medium (product decision) |
| 11 | **F10** | Config checked before auth on 8 routes | Low | Configuration disclosure | Small |
| 12 | **F8** | `revise-release` existence oracle | Low | Reveals which publication ids exist | Tiny |
| 13 | **F11** | Revisions never trigger the dispatcher | Low (functional) | Corrected releases reach the feed late, or never (see D22) | Tiny |
| 14 | **D21** | `/api/submit?form=contact` writes a non-existent column | Low (functional) | None: no UI calls `/api/submit` yet | Tiny |
| 15 | **F6** | No role separation inside a company | Medium (structural) | Any member, `viewer` included, reads everything and runs AI | Large; product decision first |

### Before staging, or fixed and tested inside isolated staging

Staging has **no customer data**: verified read-only, it holds 2 companies,
both `iso-` fixtures, 7 users, all `@staging.invalid`, and 0 news items. With
the Phase A controls in place, unfixed application code on staging cannot:

- reach a provider (mocked),
- reach production through the API (egress guard),
- charge money (Stripe mocked), or
- notify anyone (push blocked, mail mocked to `.invalid`).

So the application vulnerabilities are **safe to deploy unfixed and to fix
inside staging**, under four conditions:

| Must be true before the first staging deploy | Why |
|---|---|
| **S1 resolved**: **DONE** (job contained; replay and seeder safeguards in place, see §1 S1) | It is the one path from staging to production that the egress guard cannot see: it runs inside Supabase, not inside our code |
| **Vercel Authentication covers the deployment URL** | If the team plan cannot protect it, F2, F4 and F7 become publicly reachable on staging. Mocks keep them harmless, but strangers could write rows. In that case **fix F4, F7 and F2 first** |
| Crons disabled and the tripwire environment exactly as in `STAGING-PHASE-A.md` §7 | Already planned |
| **F5 and F12 FIXED before the first deploy** *(revised 2026-10-30, per your direction)* | Vulnerable code is not deployed to measure header behaviour. That question is answered by a separate secret-less diagnostic (§6) before the fixes are finalised |

| Can be fixed and verified inside isolated staging | Must be resolved before the corresponding **production** step |
|---|---|
| F2, F3, F4, F7, F8, F9, F10, F11, D21: all code-only, all with staging probes. **F5 and F12 are fixed before the first staging deploy**, informed by §6 | **F3** before production loses or rotates `MESSAGES_INBOUND_SECRET`. **F5** only after `PUBLIC_BASE_URL` is set on production **and** D22's guaranteed drain (§5) is live there. **D20** before migration 0063 is applied to production. **D21 + F12** before any UI is wired to `/api/submit` |

### Delivery sequence (each batch a separate change for approval)

| Batch | Contents | Why grouped | Production config needed first |
|---|---|---|---|
| **0** | S1 | **Done**: containment plus staging safeguards (uncommitted) | — |
| **0b** | §6 header diagnostic, then **F5 + F12** | Before the first staging deploy; no vulnerable code is deployed to learn the answer | None for staging. Production F5 waits for D22 |
| **A** | F10, F8, F11, D21 | Code-only; no behaviour change for a legitimate caller | — |
| **B** | F3, F7 | Inbound and form abuse | Read-only check: is `MESSAGES_INBOUND_SECRET` set, and does the Postmark inbound URL carry it? |
| **C** | F4 (with its two client changes) | Largest blast radius among the code fixes | — |
| **D** | F2 (with the billing UI gate) | Billing | `PUBLIC_APP_URL` on production |
| **E** | F9 (tolerance now, de-duplication as optional migration 0069) | Billing integrity | Optional migration |
| **F** | D20 | Must precede production 0063 | — |
| **G** | D22 (§5), then F5 **to production** | Production F5 removes the Host fallback that production's projections rely on today | `PUBLIC_BASE_URL` on production; the D22 option approved |
| **H** | F6 | Needs a product role matrix | Product decision |

Every batch must end with:

- `npm test` green, with the batch's KNOWN markers removed in the same change;
- `npm run check:api-authz` showing those probes PASS, 0 unexpected failures
  and no new SKIP;
- the combined isolation run counts recorded in `STAGING-PHASE-A.md`.

---

## 1 · Issue by issue

Each section covers: root cause and files; the exact fix; whether production
behaviour changes; migrations; regression tests and acceptance criteria; risk
of breaking MineEx; and dependencies.

---

### S1 · Staging database calls the production app every minute (CRITICAL)

**Found 2026-10-30 while planning F5. Verified read-only on staging.**

**Root cause.** `supabase/migrations/0011_outbox_ops.sql:88-97` schedules a
`pg_cron` job `outbox-drain` that runs `net.http_post` to a **hard-coded
production URL**, `https://passport-xi-five.vercel.app/api/dispatch`, every
minute. The staging replay applied 0011, and the migration runner's exclusion
list covered only `0055`.

**Observed on staging:**

- 741 runs since 07:17 UTC.
- pg_net keeps the last 6 hours of responses: all 360 retained are
  `401 {"error":"unauthorized"}`.
- The staging `app_secrets` table is empty, so the job sends an *empty*
  `x-dispatch-secret`, which production's dispatcher refuses (it fails
  closed). **No secret and no data crossed.** Production's logs will show
  these requests.
- No other database-side HTTP path exists: no function calls
  `net.http_*`/`http_request`, there are no database webhooks, and the pg_net
  queue is empty.

**Why Phase A missed it.** The egress guard lives in the Node process.
`pg_cron` and `pg_net` run inside Supabase, so no test in Phase A could see
them. My Phase A statement "zero production contact" was true **only of the
API layer**, and is corrected in `STAGING-PHASE-A.md`.

**STATUS: CONTAINED (2026-10-30), staging safeguards IMPLEMENTED (uncommitted).**

- You deactivated the job (`active = false`). Verified read-only: the last run
  was at 19:42:00 UTC, with no run and no pg_net response since, and the pg_net
  queue is empty.
- The job row still exists. A fresh replay no longer creates it, and the
  runner removes the existing one if 0011 is ever re-applied, because 0011's
  own `cron.unschedule('outbox-drain')` is kept. Deleting it now is optional
  and would be your action:
  `select cron.unschedule('outbox-drain');` against staging.

**What was implemented (staging tooling only; no migration file changed):**

1. **`scripts/_db-egress.mjs` (new): one source of truth.**
   - *Scanner:* finds every way a migration can make a database call out —
     pg_cron schedule or re-activation, `net.http_*`, Supabase webhooks
     (`supabase_functions.http_request`), the `http` extension, dblink,
     foreign servers. It ignores comments and catches schedules hidden inside
     dynamic `EXECUTE` strings.
   - *Transforms pinned by sha256:* 0011 is replayed on staging with **only**
     its `cron.schedule` statement removed. `pg_cron`, `pg_net`, `app_secrets`,
     `outbox_health()`, `reconcile_outbox()` and the unschedule step are kept
     byte for byte. If 0011 ever changes, the pin fails and the replay is
     refused until someone re-reads the file.
   - *Inspector:* what the live database can reach — cron jobs and their
     targets, HTTP-capable functions, webhook triggers, foreign servers, risky
     extensions, recent pg_net traffic and the queue.
2. **`scripts/apply-migrations.mjs`:**
   - Refuses, **before connecting**, any migration with egress and no
     reviewed transform.
   - Inspects **inside each migration's transaction, before commit**, so a
     job created dynamically at runtime is rolled back. Inspection queries run
     under savepoints so a failed probe can't abort the migration.
   - Refuses to report success if the final database can reach the network.
3. **`scripts/seed-isolation-fixtures.mjs`:** the same end-state check, so a
   database reset by re-seeding is verified too.
4. **`scripts/staging-db-egress-check.mjs` (new):** a read-only live check.
   `--strict` also fails on an inactive-but-dangerous job.
5. **`scripts/staging-db-guard-test.mjs` (new, in `npm test`):** 45 offline
   tests, plus 3 live read-only tests with `--network`.

**Production behaviour change: none.** The migration runner never targets
production (its allowlist refuses it), and every migration file is
byte-identical. Production applies 0011, when it does, from the original file.

**Migrations:** none.

**Still open:**

- (a) A full replay onto a *fresh, empty* project has not been run; it needs
  a second throwaway project. The dry run and offline tests cover the logic.
- (b) If staging later needs a scheduled drain, it should come from D22's
  design (§5), not 0011.

---

### F3 · `messages` inbound fails open

**Root cause.** In `api/messages.js`:

- `:169` checks the secret only `if (secret && …)`.
- `:196` chooses inbound mode when the body merely *contains* `MailboxHash`.
- `:181` skips the From-address check when `ceo_email` is null.

**Exact fix:**

1. Inbound only when `req.query.secret` is present. A body containing
   `MailboxHash` without it falls through to the send path, which requires a
   user token and a `companySlug`, so it fails there with 401 or 400.
2. If `MESSAGES_INBOUND_SECRET` is unset, inbound returns **503** (refusing
   rather than accepting) and logs it once.
3. Compare the secret in constant time (`crypto.timingSafeEqual` on equal
   lengths).
4. When `ceo_email` is null, refuse the reply: no email was ever sent for
   that thread, so a legitimate reply cannot exist.

**Production behaviour change: yes.** If production does **not** currently
set `MESSAGES_INBOUND_SECRET`, inbound replies stop until it is set and the
Postmark inbound webhook URL carries `?secret=`.

**Migrations:** none.

**Tests and acceptance.** Remove KNOWN F3 from `authz-risk-test` and add:

| Case | Expected |
|---|---|
| Secret unset | 503, nothing stored |
| Secret set, none supplied | 401 |
| Constant-time comparison | Pinned by a static check |
| Null `ceo_email` | Skipped, nothing stored |

The existing staging probes (wrong secret → 401; investor `MailboxHash` →
401; wrong sender → nothing stored) must stay PASS, plus a new positive
control: correct secret and correct sender store a `company` message.

**Risk: low–medium.** The only legitimate inbound sender is Postmark, using
the configured URL. The risk is purely the production config. **Dependency:**
a read-only check of production's Vercel environment and of the Postmark
inbound webhook URL before deploying.

---

### F4 · Paid AI reachable without company authorization

**Root cause.**

- `compose` (`api/compose.js:444`), `story-extract` (`:421`) and
  `story-fetch` (`:98`) authenticate but never authorize.
- `extract-company`, `extract-projects`, `extract-text`, `structure-batch`
  and `build-from-website` authorize but bypass `requireAiCaller`, so they
  have no kill switch, rate limit, body ceiling or daily cap.

**Callers (checked):**

| Route | Caller | How it calls |
|---|---|---|
| `compose` | Portal only: `src/lib/compose.js` (Media captions, Draft/Revise/Check facts), `src/lib/mineiq.js` and `mineiqChat.js` (portal Mine IQ) | Every mode except `caption` sends `companyId` |
| `story-extract`, `story-fetch` | Story Studio | Admin-gated: `src/main.jsx:955` `AuthGate requireAdmin` |
| `extract-*`, `structure-batch`, `build-from-website` | Onboarding and Admin (no `companyId`, admin path); `CommsCenter.jsx:145` | CommsCenter sends `companyId` |

**Exact fix:**

1. Extend `requireAiCaller` (`api/_aiGuard.js`) with one option,
   `adminWhenNoCompany: true`. When no `companyId` or `slug` is sent, require a
   platform admin. This is today's semantics for the extractors. Kill switch,
   size, rate limit and daily cap all still apply. No other behaviour of the
   guard changes.
2. Wire the guard:

| Route | Guard settings | Body limit |
|---|---|---|
| `compose` | `{ label: "compose", feature: "company_memory" }` | 2 MB (attachments) |
| `story-extract` | `{ label: "story-extract", adminWhenNoCompany: true }` | 8 MB (PDF) |
| `story-fetch` | `{ label: "story-fetch", adminWhenNoCompany: true }` | 16 KB |
| `extract-company`, `extract-projects`, `extract-text`, `structure-batch` | `{ feature: "company_memory", adminWhenNoCompany: true }`, replacing their own admin/feature branch | Per current usage |
| `build-from-website` | `{ adminWhenNoCompany: true }` | — |

3. **Client changes:**
   - `src/lib/compose.js:37` `generateCaption` must send `companyId`, and
     `MediaPage.jsx` must pass it. Without this, captions return 400.
   - Studio sends nothing new.

**Production behaviour change: yes, by design.**

- Investors and other companies get 403.
- Captions need `companyId` (shipped in the same change).
- All these routes gain the 200-per-10-minutes per-user and
  1000-per-day per-company limits, plus the kill switch.

**Migrations:** none. `requireAiCaller` uses 0057, which is applied in
production, since three routes already depend on it there.

**Tests and acceptance.** Remove KNOWN F4 (5 probes) and add:

- `AI_ENDPOINTS_DISABLED=true` → 503 on all 11 AI routes (offline, extending
  `ai-guard-test.mjs`);
- the DB kill switch off → 503 on all 11 (staging);
- 429 on each newly guarded route;
- 413 over each ceiling;
- admin with no company → admitted on extract-* and story-*;
- owner with no company → 403;
- a caption with `companyId` → 200.

`compose-test.mjs` and `mineiq-test.mjs` must still pass.

**Risk: medium.**

- (a) Missing `companyId` from any caller I didn't find gives a 400. The
  grep found all callers, but the client change ships in the same commit.
- (b) The per-company daily cap (1000) now counts compose and Mine IQ chat,
  so a very heavy company could hit it. Before shipping, read production's
  `ai_usage` volumes per company (read-only) to size the cap.
- (c) Onboarding bulk runs: `extract-projects` makes several calls per
  project. 200 per 10 minutes per user per endpoint should cover it, but
  verify on staging with the largest fixture.

---

### F2 · Checkout not restricted to the company's owners

**Root cause.**

- `api/stripe-checkout.js:41-47` treats "the caller can read the company row"
  as ownership, but published companies are publicly readable.
- `:49` takes `success_url` and `cancel_url` from `req.headers.origin`.
- `:41` interpolates `companyId` into the URL without encoding.
- `stripe-portal.js:20` finds the Stripe customer by the caller's **email**,
  not by company.

**Exact fix:**

1. New server helper `canManageBilling(userId, companyId)` in
   `api/_service.js`, read with the service role. True when
   `companies.owner_id = user`, **or** an active membership with
   `role = 'owner'`, **or** `profiles.role = 'admin'`. This matches the
   proposed policy: owners and platform admins.
2. `stripe-checkout`: validate `companyId` as a UUID; check auth, then
   `canManageBilling`, then the key (F10). Set `success_url`/`cancel_url`
   from `PUBLIC_APP_URL`; if it is unset, use the current hard-coded origin.
   Never use the request.
3. `stripe-portal`: require `companyId` and `canManageBilling`. Find the
   customer through Stripe's `subscriptions/search` on
   `metadata['company_id']`, which checkout already writes, not by email.
   Return URL from `PUBLIC_APP_URL`.
4. **Billing UI (`src/portal/Portal.jsx:995-1110`):** show "Upgrade" and
   "Manage billing" only when the caller can manage billing. Expose that
   through the existing `my_company_role` RPC, or one added for the purpose.
   Otherwise show "Ask an owner". Send `companyId` to `stripe-portal`.

**Production behaviour change: yes.**

- Non-owner members (`admin`, `editor`, `publisher`, `analyst`, `viewer`)
  can no longer start or manage billing.
- Post-checkout redirects always go to `PUBLIC_APP_URL`. On a preview or
  staging origin that differs from today's `Origin`-following behaviour.

**Migrations:** none (`subscriptions/search` reads metadata checkout already
writes).

**Tests and acceptance.** Remove KNOWN F2 (3 runtime probes and 2 offline)
and add:

| Caller | Expected |
|---|---|
| Owner | 200 |
| Membership-owner | 200 |
| Platform admin | 200 |
| Publisher, viewer, investor, other owner | 403, **no Stripe call** (egress) |
| `Origin: https://evil.invalid` | Return URLs unchanged |

Also: `stripe-portal` finds a customer by company and never by email (Stripe
mock records the path), and `companyId` that isn't a UUID gives 400.

**Risk: low–medium.** Companies whose billing is handled by a non-owner
member lose self-serve. Check production read-only for memberships where the
billing user isn't the owner, and for existing Stripe customers whose
subscription lacks `metadata.company_id` (if any, `stripe-portal` would stop
finding them). A metadata back-fill would then be needed in Stripe, which is
outside the code.

---

### F5 · Request headers choose where internal secrets are sent

> **Measured 2026-10-30 (§6 results):** not exploitable on Vercel; the
> platform overwrites `Host`, `x-forwarded-host` and `forwarded`. Severity is
> **low: defence in depth**. The exact fix is in §6 results, fix 2.

**Root cause.**

- `api/_service.js:86` (`invokeDispatchBestEffort`) sends `DISPATCH_SECRET`
  to `x-forwarded-host || host`.
- `news-broadcast.js:66`, `news-pull.js:154` and `news-process.js:355` send
  `NEWS_PULL_SECRET` to `PUBLIC_BASE_URL || host`.

**Exact fix.** One helper, `selfBaseUrl()`. It returns `PUBLIC_BASE_URL` (an
https URL, validated), else `https://${process.env.VERCEL_URL}`, which is set
by Vercel and not by the request. Otherwise it returns `null`, in which case
the chained call is skipped and logged. The four call sites use it and never
read request headers. F11's fix (pass `req`) becomes unnecessary because the
helper no longer needs the request.

**Production behaviour change.** Yes when `PUBLIC_BASE_URL` is unset there,
because chaining then goes to `VERCEL_URL`. That is the deployment's own
generated URL, which is correct but could sit behind Deployment Protection.
**Coupled to D22:** in production today, this best-effort call is the
**only** dispatcher trigger.

**Migrations:** none.

**Tests and acceptance.**

- Remove KNOWN F5 (the runtime H1 probe and 2 offline).
- New: with `PUBLIC_BASE_URL` set, chaining goes there for any
  `x-forwarded-host`.
- New: with neither variable set, no chained call is made.
- Publishing still projects to the feed on staging (`posts` row appears).

**Risk: medium, but only through D22.** Deploy only after `PUBLIC_BASE_URL`
is set on production and D22 is settled. **Sequencing (revised):** fix it
before the first staging deploy. Vercel's header behaviour is measured by the
secret-less diagnostic in §6, never by deploying this vulnerability.

---

### D20 · Messaging upserts target a constraint 0063 removed

> **Status (2026-10-30): implemented locally, see §11.** The plan below is the
> original. Two corrections from implementing it: the portal path also lacked
> an INSERT grant (42501), so it moved server-side rather than running under
> RLS; and duplicate messages are now prevented as well.

**Root cause.** 0063 dropped `conversations_investor_id_company_slug_key` and
replaced it with two **partial** unique indexes. PostgREST `on_conflict`
cannot target a partial index, so it returns `42P10`. There are two call
sites:

- `api/messages.js:100`: investor sends, `on_conflict=investor_id,company_slug`.
- `src/lib/messages.js:289`: company-initiated threads,
  `on_conflict=sender_company_id,company_slug`. This one was found during
  planning and has the same defect. It runs in the portal as the user.

**Exact fix (code only, works before and after 0063):** find-or-create.

1. Select the thread:
   - investor thread: `investor_id = X and company_slug = S and sender_company_id is null`;
   - company thread: `sender_company_id = C and company_slug = S`.
2. Insert if absent.
3. On `23505` (a concurrent insert), select again.

Server side this runs with the service role. Client side it runs as the user,
under RLS: check that the portal user can SELECT their company's threads.
0047 and 0063 policies indicate yes; to be verified on staging. Before 0063,
the select finds the same row the old constraint guarded, so behaviour is
identical.

**Production behaviour change:** none observable (same rows, no error). It
removes the 0063 blocker.

**Migrations:** none. (An RPC doing `INSERT … ON CONFLICT … WHERE
sender_company_id IS NULL` would also work, but needs a migration and a
grant review; not recommended.)

**Tests and acceptance:**

- Remove KNOWN D20.
- Staging (0063 present): investor send → 200, message stored, mocked email
  to `ceo@….invalid`.
- Sending twice reuses the same `conversationId`.
- New: company-initiated thread created, then reused, by the portal path.
- Offline: the pre-0063 path through a stub returns the existing
  conversation.

**Risk: low.** **Must ship before 0063 reaches production.**

---

### F12 · Form throttle trusts a client-supplied header

> **Measured 2026-10-30 (§6 results):** not exploitable on Vercel; the
> platform overwrites `x-forwarded-for` with the real client IP. Severity is
> **low: hardening**. Exact fix: prefer `x-real-ip` (§6 results, fix 1).
> `x-vercel-forwarded-for` is absent on Edge, and `x-client-ip` /
> `true-client-ip` are client-controlled.

**Root cause.** `api/_submissions.js:134-137` uses the first `x-forwarded-for`
entry as the client IP.

**Exact fix.** Read `x-vercel-forwarded-for`, then `x-real-ip` (both set by
the platform), then the socket address. Never use a client-controlled XFF
entry. Phase B confirms which header Vercel guarantees; the order may change
after measurement. The local emulator gains the same behaviour: it strips
client-sent forwarding headers and sets them from the socket, so local runs
mirror Vercel.

**Production behaviour change:** throttle buckets become per real IP. Users
behind one NAT share a bucket (unchanged in practice).

**Migrations:** none.

**Tests and acceptance:**

- Remove KNOWN F12.
- A spoofed `x-forwarded-for` after 429 → still 429.
- Different real addresses → separate buckets (offline test with stubbed
  headers).

**Risk: low.** **Dependency:** the §6 header diagnostic, which decides the
header order. It is fixed before the first staging deploy.

---

### F7 · `contact` and `conference-inquiry` unthrottled

**Root cause.** Both predate `api/_submissions.js` and never adopted its
`checkThrottle`.

**Exact fix.** Call `checkThrottle("contact" | "conference", clientIp(req))`
before storing or emailing; return 429 with `Retry-After`. Also reuse the
honeypot (`HONEYPOT_FIELD`), with the client forms sending an empty field.
That client change is optional; the throttle alone fixes F7.

**Production behaviour change:** yes. More than N submissions per window from
one IP get 429 (N from `THROTTLE_LIMITS`, currently used by `submit`).

**Migrations:** none (0057 is applied in production).

**Tests and acceptance:**

- Remove KNOWN F7 ×2: a burst of 8 must hit 429.
- Legitimate first submission → 200 with one mocked email to the configured
  recipient.

**Risk: low.** A conference booth with many visitors on one Wi-Fi network
could hit the limit; the booth flows use `conference-inquiry`. Size
`THROTTLE_LIMITS` for that (proposed: 20 per 10 minutes per IP for
`conference`).

---

### F9 · Stripe webhook replay and duplicates

**Root cause.** `api/stripe-webhook.js:20-27` (`verifySig`) never checks the
timestamp `t`, and nothing records processed event ids.

**Exact fix:**

1. **Now, no migration:** reject when `|now − t| > 300 s`, Stripe's own
   default tolerance. Accept any `v1` in the header (Stripe may send several
   during secret rotation).
2. **Optional `0069_stripe_events.sql`:** a `stripe_events(id text primary
   key, type text, received_at timestamptz)` table, service-role only, with
   RLS on and no policies. The handler inserts first; on conflict it returns
   200 without processing. Also store `event.created` against the
   subscription so an *older* event never overwrites a newer state.
   Out-of-order delivery is real with Stripe.

**Production behaviour change:** events older than 5 minutes are rejected
with 400 and Stripe retries them. Stripe's own retries are re-signed with a
fresh timestamp, so legitimate delivery is unaffected.

**Migrations:** optional 0069 (staging first, then production with approval).

**Tests and acceptance:**

- Remove KNOWN F9: a day-old signed event → 400.
- Fresh → 200.
- Two `v1` values, one valid → 200.
- With 0069: the same `evt.id` twice processes once; an older event after a
  newer one does not regress status.

**Risk:** low. A server clock skewed by more than 5 minutes would reject
webhooks; Vercel's clock is synchronised.

---

### D22 · No guaranteed dispatcher drain in production *(new)*

> The full proposed architecture is in **§5**. The options below are
> summarised there with retries, monitoring and rollout.

**Root cause.**

- `0011_outbox_ops.sql` (the per-minute `pg_cron` drain) is **deferred** in
  production (`STAGING-HANDOFF.md` §3).
- `vercel.json` has no dispatch cron.
- So production projections (feed, in-app notifications, Mine IQ facts,
  timeline, push queue) run only when `publish`/`unpublish` make their
  best-effort call. A failed call is never retried, and revisions never
  trigger one (F11).
- The code comment "cron is the safety net" is not true in production.

**Options (product and ops decision):**

| Option | What it takes |
|---|---|
| (a) **Recommended** | Add `/api/dispatch` to `vercel.json` crons, every minute. `vercel.json` crons send `Authorization: Bearer CRON_SECRET`, so the dispatcher must also accept `checkCronSecret`. Needs Pro (Hobby crons are daily) |
| (b) | Apply 0011 to production after S1's URL-as-data fix |

**Production behaviour change:** yes. Projections become guaranteed within
about a minute.

**Migrations:** (b) only.

**Tests and acceptance:**

- Kill the best-effort call in a staging test, then publish: the projection
  still appears within 2 minutes via the scheduled drain.
- The cron request is refused without the secret.

**Risk:** low. Draining is idempotent (deliveries are leased and marked).

---

### F10 · Configuration checked before authentication

**Root cause.** The API key is checked before auth in:

| Route | Key check (line) |
|---|---|
| `comms-generate` | 106 |
| `extract-company` | 119 |
| `extract-projects` | 178 |
| `extract-text` | 34 |
| `structure-batch` | 87 |
| `story-extract` | 418 |
| `stripe-checkout` | 26 |
| `stripe-portal` | 14 |

Most of these are absorbed by F4 and F2 (the guard runs first).

**Exact fix.** Move each key check after the guard. With F4, `requireAiCaller`
runs first anyway.

**Production behaviour change:** an unauthenticated caller sees 401 instead
of 500 when a key is missing. That only happens on a misconfigured
deployment.

**Tests and acceptance:**

- Remove KNOWN F10 ×2.
- Offline: for all 8 routes, an anonymous caller with the key unset gets 401.

**Risk:** none.

---

### F8 · `revise-release` existence oracle

**Root cause.** `api/revise-release.js:39-42` reads the publication with the
**service role** before the RPC's ownership check.

**Exact fix.** Read it as the caller, which is RLS-scoped, exactly like
`publish.js:31-36`. Not visible → 404. The RPC still enforces
`actor_can_publish`.

**Production behaviour change:** a non-owner gets 404 instead of 403. The
portal shows a generic error either way.

**Tests and acceptance:** remove KNOWN F8. A real and a fake id give the same
status. Viewer and owner probes keep their current results (403 forbidden
from the RPC for a viewer *who can see the row*, 200 for the owner).

**Risk:** none.

---

### F11 · Revisions never trigger the dispatcher

**Root cause.** `api/revise-release.js:65` calls
`invokeDispatchBestEffort()` with no `req`. The helper reads `req.headers`,
throws, and swallows the error.

**Exact fix.** Pass `req`. After F5, the helper doesn't need `req` at all.

**Production behaviour change:** yes. Corrections reach the feed promptly.
Today, with D22, they wait for the next publish or unpublish.

**Tests and acceptance:** remove KNOWN F11. A revision makes a dispatch call
(offline), and on staging the revised text appears in the projection.

**Risk:** none.

---

### D21 · `/api/submit` contact form writes a missing column

**Root cause.** `api/submit.js:99` (`buildRow`) sets `row.notes = message`
for every form, but `notes` exists only on `demo_bookings`.
`contact_submissions` has no `notes` column in the **production-derived
baseline** (`0000_baseline.sql:147`), so production is affected too. No UI
calls `/api/submit` yet; `src/site/Site.jsx:153` writes the table directly.

**Exact fix.** Add `notes: true` to the `demo` form in `FORMS`
(`api/_submissions.js`). `buildRow` writes `notes` only for forms that
declare it. For `contact`, `message` is already a passthrough column.

**Production behaviour change:** none (no caller).

**Migrations:** none.

**Tests and acceptance:**

- Remove KNOWN D21: `form=contact` → 200, stored, with exactly the baseline
  columns.
- `form=demo` still writes `notes` (`submissions-test.mjs` extended).

**Risk:** none.

---

### F6 · No role separation inside a company (structural; plan only)

**Root cause.** `owns_company()` (0006) is true for **any** active member.
`can_touch_company()` inherits that. Only `actor_can_publish` (0008) reads
the role.

**Needed first:** a role matrix approved by product. Proposed starting point:

| Role | Can do |
|---|---|
| `viewer` | Read only; no AI; no credentials |
| `analyst` | `viewer` + analytics |
| `editor` | Edit drafts + AI |
| `publisher` | `editor` + publish |
| `admin` | `publisher` + members and site credentials |
| `owner` | `admin` + billing |

**Exact fix (after approval):**

1. Migration `0070_company_roles.sql`: add
   `has_company_role(cid, roles text[])`, SECURITY DEFINER and stable.
2. Re-policy the sensitive tables: `site_credentials` and members to
   admin/owner; drafts writable by editor and up.
3. `requireFeature` and `requireAiCaller` gain a role argument.
4. `createInvitation()` stops defaulting to `owner`.

**Production behaviour change:** yes, substantial.
**Migrations:** yes.
**Tests:** a new role dimension in `_isolation-targets.mjs` and
`_api-routes.mjs`, covering every role × table and route.
**Risk: high.** Every existing member is currently treated as an owner;
mis-mapping would lock real users out. Requires a production read of current
membership roles before any change. **Not part of the pre-Phase-B work.**

---

## 2 · Migrations summary

| Migration | For | Required? | Production |
|---|---|---|---|
| none | S1 containment, F2, F3, F4, F5, F7, F8, F10, F11, F12, D20, D21 | — | — |
| `0069_dispatch_url_from_secrets` | S1 permanent fix / D22 option (b) | Optional | Only if 0011 is ever applied to production |
| `0069b_stripe_events` | F9 de-duplication and ordering | Optional | With approval |
| `0070_company_roles` | F6 | Yes, when F6 is approved | Later phase |

Every migration replays onto an empty staging project first, through
`scripts/apply-migrations.mjs`, before any production consideration.

---

## 3 · Read-only production checks needed before the related fixes ship

I won't do these; production is yours to look at.

1. Vercel env: is `MESSAGES_INBOUND_SECRET` set? Does the Postmark inbound
   webhook URL include `?secret=`? (F3)
2. Vercel env: are `PUBLIC_BASE_URL` and `PUBLIC_APP_URL` set? (F5, F2)
3. Vercel plan: Pro or Hobby. (D22 option (a), Deployment Protection, crons)
4. Database: count memberships where a non-owner manages billing, and active
   Stripe subscriptions without `metadata.company_id`. (F2)
5. Database: AI usage per company per day, last 30 days. (F4 cap sizing)
6. Production logs: confirm the S1 requests arrived as 401s and nothing else.

---

## 4 · Approvals requested

1. **S1:** containment done by you; safeguards implemented and tested
   (uncommitted). Approve a commit. Optionally run
   `select cron.unschedule('outbox-drain');` on staging to delete the inactive
   job row.
2. **The delivery sequence (§0)** and its batches. Each batch comes back as
   its own change for review before commit.
3. **The two proposed policies,** confirmed as final for F4 and F2, given the
   compatibility notes (caption `companyId`; non-owner members lose billing).
4. **The §6 header diagnostic:** a throwaway, secret-less Vercel project,
   deleted afterwards. Then F5 and F12 are fixed before the first staging
   deploy.
5. **A D22 decision (see §5):** `vercel.json` cron (recommended) or applying 0011 with
   the URL fix.
6. **Optional migrations** 0069 / 0069b, and F6 as a later phase.

---

## 5 · D22 proposal: a reliable publishing dispatcher (NOT implemented)

### What exists, and what is missing

The outbox already does most of the work, and it was checked in code:

| Part | Status | Where |
|---|---|---|
| Durable events plus per-listener deliveries | ✓ exists | `events`, `event_deliveries` (0008) |
| Leased claims, safe under concurrency (`FOR UPDATE SKIP LOCKED`, 120 s lease, reclaimed when expired) | ✓ exists | `claim_deliveries` (0008:150), `api/dispatch.js` |
| Retries with exponential backoff: 30 s × 2ⁿ, 6 attempts, then `dead` | ✓ exists | `complete_delivery` (0008:187-200) |
| Idempotent listeners, so a retry or re-delivery is harmless | ✓ every listener writes by upsert, ignore-duplicates or a keyed RPC (feed, notifications, Mine IQ facts, push queue, timeline) | `api/_listeners.js` |
| Admin health snapshot and dead-letter replay | ✓ exists, not surfaced anywhere | `outbox_health()`, `reconcile_outbox()` (0011) |
| **A guaranteed trigger** | ✗ **missing in production**. 0011 is deferred, `vercel.json` has no dispatch cron, and the only trigger is publish/unpublish's single best-effort call (F5, never made by revise, F11) | — |
| **Failure alerting** | ✗ dead deliveries and stuck leases are visible only if someone runs `outbox_health()` | — |
| **Detecting that the dispatcher itself stopped** | ✗ nothing records that it ran | — |

### Proposed architecture

```
publish / unpublish / revise ──► events + event_deliveries (same transaction as the state change)
        │                                      ▲
        └─ best-effort POST /api/dispatch      │ claim (lease, SKIP LOCKED)
           to selfBaseUrl() (F5-safe)          │ complete (backoff 30s·2ⁿ, dead after 6)
                                               │
   SCHEDULER (guaranteed) ─ every minute ──► /api/dispatch ── listeners (idempotent)
        Vercel Cron (Bearer CRON_SECRET)            │
                                                    ▼
                                    dispatcher_runs  (heartbeat: started, finished,
                                                      claimed, succeeded, failed, dead)
                                                    │
                       end of each run: outbox_health() ─► thresholds breached?
                                                    │            │ yes
                                                    │            ▼
                                                    │   ops_alerts (deduplicated: one per
                                                    │   condition per hour) + email to ops
                                                    ▼
                         Mission Control panel: health, recent runs, dead letters,
                         [Replay dead] → reconcile_outbox()
```

1. **Guaranteed trigger: Vercel Cron every minute** on `/api/dispatch`
   (recommended).
   - `dispatch.js` accepts `Authorization: Bearer CRON_SECRET` *or* the
     existing `x-dispatch-secret`; both are constant-time and fail closed.
   - Needs the Pro plan (Hobby crons run daily).
   - Fallback if not on Pro: Supabase `pg_cron`, with the URL **and** the
     secret read from `app_secrets` (the S1 lesson: the URL is data, absent
     means "do nothing"). Staging's replay keeps that job off unless staging
     configures its own URL.
2. **The best-effort call stays as an accelerator**, through `selfBaseUrl()`
   (F5) and fired by revise too (F11). It is never relied on.
3. **Heartbeat:** a new `dispatcher_runs` table (service-role only, RLS on,
   no policies). Each run inserts a row at start and updates it at the end.
   Retained 7 days by a trimming step in the same run.
4. **Monitoring thresholds**, evaluated at the end of each run from
   `outbox_health()` plus the heartbeat:

| Condition | Threshold | Meaning |
|---|---|---|
| `dead > 0` | any | A delivery exhausted its retries |
| `stuck_processing > 0` | any | A lease expired without completion |
| `oldest_pending_seconds` | > 300 | The backlog isn't draining |
| `orphan_publications` | > 0 for 10 min | Published but not in the feed |
| Last finished run | > 3 min ago | **Checked by the next run, and by an external uptime check** (below) |

5. **Alerting:**
   - A new `ops_alerts(condition, first_seen, last_sent, resolved_at)` table
     deduplicates to one email per condition per hour, plus one "resolved"
     email, through the existing Postmark path to an `OPS_ALERT_TO` address.
     On staging it is mocked by the egress guard.
   - Because a stopped scheduler can't alert about itself, add **one external
     check**: a Vercel Cron or uptime monitor hitting a small
     `/api/dispatch-health` (secret-protected) that returns 503 when the last
     run is older than 3 minutes.
6. **Operator surface:** a Mission Control panel (admin-only) showing health,
   the last 20 runs and dead letters, with **Replay dead**, which calls the
   existing `reconcile_outbox()`.
7. **Ordering and back-pressure:** keep per-listener independence (one failing
   listener never blocks the others), plus a run time budget below
   `maxDuration`, so a slow listener leaves its leases to expire and be
   reclaimed rather than timing out mid-write.

### Migrations (proposal)

`0071_dispatcher_observability.sql`: `dispatcher_runs`, `ops_alerts`, and a
`record_dispatcher_run()` helper, all service-role only. Applied to staging
first through the egress-safe runner. No change to `events`,
`event_deliveries` or the existing RPCs.

### Tests and acceptance (staging)

**Automated (runs in `npm test` or the staging suite):**

1. With the best-effort call disabled, publish: the `posts` row appears within
   2 minutes, from the scheduled drain alone.
2. A listener forced to fail: attempts follow 30 s, 60 s, 120 s…, then `dead`
   after 6; exactly one mocked alert email; replay through Mission Control →
   `succeeded`.
3. Stop the scheduler: `/api/dispatch-health` returns 503 after 3 minutes, and
   an alert is recorded.
4. The cron request without `CRON_SECRET` gets 401; with a user JWT, 401.
5. Two dispatchers run concurrently: no delivery is processed twice
   (`SKIP LOCKED`), proven by counting listener writes.
6. A revision is projected without any publish (F11 plus the scheduler).

**Manual check (needs a real browser session):**

7. The Mission Control panel loads its health and dead-letter data as an admin
   only.

### Rollout

1. Staging: migration 0071 → dispatcher changes → tests above.
2. Production: set `CRON_SECRET`, `OPS_ALERT_TO` and `PUBLIC_BASE_URL` →
   apply 0071 → deploy the dispatcher and cron (the cron starts draining
   immediately; idempotent) → watch the heartbeat → **only then** deploy the F5
   fix.

### Risk

- Low for correctness, because draining is already idempotent and leased.
- Main risk: a backlog of old undelivered events in production, from months
  of missed best-effort calls, draining all at once on the first cron run.
  Mitigation: run `outbox_health()` read-only on production first. If the
  backlog is large, drain in bounded batches (the existing `BATCH = 20` per
  listener per run already limits it). Push-queue rows still go through
  `news-push-send`'s own `PUSH_ENABLED` gate.

---

## 6 · Safe diagnostic for F5 / F12 header behaviour (no vulnerable code deployed)

### What we need to know

Does Vercel pass through a **client-supplied** `x-forwarded-host`, `host`,
`x-forwarded-for`, `x-real-ip`, `x-vercel-forwarded-for` or `forwarded`
header, for the Node and Edge runtimes, on a deployment like staging's? That
decides F12's header order and confirms F5's real-world severity. The F5 fix
doesn't depend on it: it removes header use entirely.

### Proposed design: a throwaway header-echo project (recommended)

- A **separate** Vercel project, `mineex-header-probe`, in the same team and
  region as staging, holding **one** Node function and **one** Edge function.
  Each returns the *names and values* of the forwarding headers it received,
  plus `req.socket.remoteAddress` (Node).
- **No environment variables, no secrets, no database, no outbound calls, no
  shared code with the app.** There is nothing in it to leak or abuse.
  Deployment Protection is on, with a bypass secret for the test.
- **Test:** send requests carrying sentinel values
  (`x-forwarded-host: canary.invalid`, `x-forwarded-for: 198.51.100.7`,
  `x-real-ip: 198.51.100.8`, `x-vercel-forwarded-for: 198.51.100.9`,
  `forwarded: for=198.51.100.10;host=canary.invalid`). Record which survive
  unchanged, which are overwritten, which are appended to, and what the
  socket address is.
- **Result:** a short table in `docs/STAGING-PHASE-A.md`. Then the project is
  **deleted**.
- **Cost:** none on an existing team. Total exposure: a public function that
  echoes the caller's own headers back to them, behind Vercel Authentication.

### Alternatives considered

| Option | Verdict |
|---|---|
| A staging-only echo route inside the app (`MINEEX_ENV`-gated) | Rejected: it adds a route to the production codebase, and a gate is one misconfiguration from being live |
| Rely on Vercel's documentation | Not evidence. Use it to form expectations, then confirm with the probe |
| Deploy the unfixed F5/F12 code to staging and probe it | **Rejected per your direction** |

### What changes afterwards

- **F12:** `clientIp()` reads the header the probe proves is platform-set,
  probably `x-vercel-forwarded-for` or `x-real-ip`, and never a
  client-controlled one.
- **F5:** `selfBaseUrl()` never reads request headers.
- **The local emulator** (`staging-api-server.mjs`) is updated to strip
  client-sent forwarding headers and set them the way the probe showed, so
  local runs match Vercel. The existing H1 and spoof probes in
  `api-authz-test.mjs` then pass against the fixed code, locally and on
  staging.

### Approval needed

Creating and then deleting the throwaway Vercel project. That needs the Vercel
CLI (not installed here) or the dashboard, and is a Phase B-type action.

### Status: PREPARED, NOT DEPLOYED (2026-10-30)

**Built:**

| File | What it is |
|---|---|
| `tools/header-probe/` | The probe: `api/node.js`, `api/edge.js`, the shared `_echo.js`, a minimal `vercel.json` and `package.json`, and a README with the deploy and delete runbook |
| `scripts/header-probe-test.mjs` | The diagnostic. Sends sentinel headers (198.51.100.0/24, `*.invalid`) and classifies each as survived, overwritten, appended or absent. Prints the F5 and F12 conclusions and writes `docs/header-probe-results.json`. Refuses MineEx production hosts |
| `scripts/header-probe-safety-test.mjs` | 23 offline checks, in `npm test`. See below |

**What `header-probe-safety-test.mjs` proves:**

- The probe reads no environment and makes no outbound call.
- It imports nothing outside its own directory, has no dependencies, and its
  `vercel.json` declares no crons, env or rewrites.
- Nothing in `api/` or `src/` references it.
- It never echoes cookie, authorization or bypass values.
- Against a **simulated platform proxy**, every verdict and both conclusions
  come out right.

`node scripts/header-probe-test.mjs --local` passes the no-proxy harness
check. The production `vite build` contains no trace of the probe.

**Approval needed to run it on Vercel:**

1. Create the separate `mineex-header-probe` project, with root directory
   `tools/header-probe`.
2. Turn on protection and a bypass secret.
3. `vercel deploy --prod`.
4. Run the diagnostic.
5. Delete the project.

That requires the Vercel CLI (not installed here) or the dashboard.

### RESULTS: run 2026-10-30, project created and deleted

**Run conditions:**

| | |
|---|---|
| Team | `50kadayokays-projects` (Pro) |
| Disposable project | `mineex-header-probe-0769f7` (`prj_iC4BorqMMEM6DHYGz6icUVsm495L`): no Git link, 0 env vars, no integrations, crons or domains beyond its own |
| CLI | `vercel@64.3.1`, integrity- and signature-verified |
| Deployed | Only the six `tools/header-probe` files, deployed from a byte-identical copy outside Git |
| Requests | Synthetic headers only (198.51.100.0/24, `*.invalid`), through the protected deployment URL with a probe-only bypass secret. The secret was never printed and is in no file |
| Raw results | `docs/header-probe-results.json`. Vercel's signed `forwarded` token and the caller's real IP are redacted; the file contains no secret |

**Observed Vercel behaviour (both runtimes unless stated):**

| Header the client sent | What the function received | Verdict |
|---|---|---|
| `Host` | the deployment hostname | platform-set |
| `x-forwarded-host: canary-….invalid` | the deployment hostname | **overwritten**, cannot be spoofed |
| `forwarded: for=…;host=canary-….invalid` | Vercel's own value, with a **signed** `sig=` token | **overwritten** |
| `x-forwarded-for: 198.51.100.7` | the caller's real public IP, **single value** | **overwritten, not appended**: cannot be spoofed |
| `x-real-ip: 198.51.100.8` | the caller's real public IP | **overwritten** |
| `x-vercel-forwarded-for: 198.51.100.9` | Node: the real IP. **Edge: absent** | overwritten on Node, **stripped on Edge** |
| `x-forwarded-proto: http` | `https` | overwritten |
| `x-vercel-ip-country: ZZ` | `CA` | overwritten |
| `x-client-ip`, `true-client-ip` | **exactly as sent** | **client-controlled: never trust** |
| (Node socket) `remoteAddress` | `127.0.0.1` | an internal proxy hop: **useless for client identity** |

**Production path, checked read-only:** `mineex.ca` resolves straight to
Vercel (76.76.21.21, `server: Vercel`, DNS at GoDaddy) with no third-party
proxy in front, so production traffic meets the same edge behaviour.

### Implications

- **F5 (Host header steers secrets).** On Vercel, `Host`, `x-forwarded-host`
  and `forwarded` are platform-set, so a client **cannot** redirect
  `DISPATCH_SECRET` or `NEWS_PULL_SECRET`. Severity drops from
  "critical if exploitable" to **low: defence in depth**. Still worth fixing:
  - the code trusts request headers by design, which breaks under any other
    host, local dev, the emulator, or a proxy added later;
  - it is coupled to D22 anyway.
- **F12 (throttle keyed on `x-forwarded-for`).** On Vercel, `x-forwarded-for`
  is **overwritten with the real client IP**, so today's `clientIp()` (first
  entry) is **not spoofable on Vercel**. Severity drops to **low: hardening**.
  The emulator finding came from my local server passing headers through,
  which Vercel does not.
- **New hazards the probe surfaced:**
  - `x-client-ip` and `true-client-ip` pass through untouched. No code reads
    them today; it must never start.
  - `x-vercel-forwarded-for` is **absent on Edge**, so code relying on it
    would break on Edge.
  - Vercel's `forwarded` header carries a signed token, so request headers
    must not be logged wholesale.

### Exact recommended fixes (not implemented; for approval)

1. **F12, `api/_submissions.js` `clientIp(req)`:** return `x-real-ip`
   (platform-set on both runtimes), else the **first** `x-forwarded-for`
   entry (platform-overwritten on Vercel), else `"unknown"`. Never read
   `x-client-ip`, `true-client-ip`, `x-vercel-forwarded-for` (absent on Edge)
   or `req.socket.remoteAddress` (127.0.0.1 on Vercel).
2. **F5, a new `selfBaseUrl()` in `api/_service.js`:** `PUBLIC_BASE_URL`
   (validated https) → `https://${VERCEL_URL}` → `null` (skip the chained
   call). Never read `Host`, `x-forwarded-host` or `forwarded`. Used by
   `invokeDispatchBestEffort`, `news-broadcast`, `news-pull` and
   `news-process`. Production sequencing is unchanged: D22's guaranteed drain
   first, then F5.
3. **Emulator fidelity, `scripts/staging-api-server.mjs`:** behave like the
   measured Vercel edge.
   - Overwrite `host`, `x-forwarded-host` and `forwarded` with its own host.
   - Overwrite `x-forwarded-for` and `x-real-ip` with the socket address; set
     `x-vercel-forwarded-for` on Node routes and strip it on Edge.
   - Pass `x-client-ip` and `true-client-ip` through, as Vercel does.

   After this, the local H1 and spoof probes report Vercel's real behaviour.
   The offline `authz-risk-test` F5 probe, which calls handlers with no proxy,
   stays as the defence-in-depth guard until fix 2 lands.
4. **Regression tests:**
   - an offline test that `clientIp()` ignores `x-client-ip` and
     `true-client-ip`, and handles a missing `x-vercel-forwarded-for`;
   - one that `selfBaseUrl()` never reads a request header;
   - an emulator test that client-sent forwarding headers are overwritten.

### Limitations

- **One point in time** (2026-10-30). Vercel can change edge behaviour; the
  probe can be re-run with the runbook.
- **Only Vercel-managed hostnames were probed** (the deployment URL and the
  project domain). `mineex.ca` was shown to hit the same edge by DNS and
  response headers, but no diagnostic request went to a custom domain.
- **One client:** IPv4, a single network, GET only. IPv6 clients and request
  bodies were not tested; there is no reason header handling would differ.
- `vercel.json` rewrites (for example `/n/:id`) were not exercised.
- **Exposure window.** The production alias was reachable without login for
  about 2–3 minutes, until protection was raised from the default
  `all_except_custom_domains` to `all`. Only a header echo could be returned
  (no secrets). Runtime request logs for that window couldn't be retrieved
  through the API, so other visitors in it can't be ruled out. The runbook now
  sets `all` before the first deploy.
- **Deletion.** The project, the deployment and both aliases return 404 from
  the API, and the project domain returns `DEPLOYMENT_NOT_FOUND`. The deleted
  deployment's *unique* hostname still redirected to Vercel login
  (`vercel.com/sso-api`) for at least 7 minutes, from edge cache. A
  never-existing hostname returns 404 immediately. That is a login wall, not
  content. Recheck later, or open it while logged in, to see the 404.

---

## 7 · Batch B: F3 and F7, IMPLEMENTED LOCALLY (2026-10-30, uncommitted, not deployed)

### Changes

| File | Change |
|---|---|
| `api/messages.js` (F3) | Inbound mode is selected **only** by `?secret`; a `MailboxHash` in the body no longer switches modes. `MESSAGES_INBOUND_SECRET` unset, blank or shorter than 16 characters gives **503** (Postmark retries, so replies are delayed, never forged or lost). The supplied secret is compared in **constant time**. A non-UUID `MailboxHash` is refused before any lookup. A thread with **no `ceo_email`** refuses the reply (it used to accept any sender). The sender must still equal the thread's `ceo_email`. Postmark retries of an already-stored reply return 200 |
| `api/_submissions.js` (F7, and F12 hardening) | New `guardLeadForm()`: honeypot and spam heuristics (discarded, 200), then the **durable database throttle** (`bump_submission_throttle`, atomic, already applied in production as 0057), before anything is stored or emailed. Separate buckets: `lead:contact` (5 per 10 min) and `lead:conference` (20 per 10 min, for shared booth Wi-Fi). **`clientIp()` now prefers `x-real-ip`**, then the first `x-forwarded-for` entry, and never reads `x-client-ip`, `true-client-ip`, `x-vercel-forwarded-for` or the socket. This follows the measured Vercel behaviour in §6 |
| `api/contact.js`, `api/conference-inquiry.js` | Call `guardLeadForm()` after validation. A 429 carries `Retry-After: 600` and sends no mail and stores no lead |
| `scripts/staging-api-server.mjs` | **Emulator fidelity:** it overwrites `Host`, `x-forwarded-host`, `forwarded`, `x-forwarded-for`, `x-real-ip` and `x-forwarded-proto` the way the measured Vercel edge does, and strips `x-vercel-forwarded-for` on Edge routes |
| Tests | New `scripts/inbound-and-forms-test.mjs` (39 offline, in `npm test`). `authz-risk-test` F3 marker removed: now 5 secure / 8 known. `api-authz-test`: a positive-control Postmark reply, exact-limit bursts and a **30-request concurrent** burst against the real staging database. `_api-routes.mjs` re-pinned for messages, contact and conference-inquiry |

**No migration. Nothing in `src/` changed.** The callers (`ContactPage.jsx`,
`ConferenceInquiry.jsx`, `lib/conference.js`) already show a clean error on
any non-OK response.

### Results

| Suite | Before Batch B | After |
|---|---|---|
| `npm test` | exit 0 | **exit 0** (now including `inbound-and-forms` 39/39) |
| Offline risk tests | 3 secure, 9 known | **5 secure, 8 known**, 0 unexpected |
| API suite (local emulation, staging data) | 263 / 16 / 1 | **268 / 12 / 1** (281 assertions), 0 unexpected |
| Combined database + API | 709 / 16 / 1 | **714 / 12 / 1** (727 assertions), 0 unexpected |
| Database only | 446 / 0 | 446 / 0 (API probes counted separately) |

**Key live results on staging:**

- A genuine Postmark reply is **stored and visible to the investor**.
- A wrong secret gets 401. An investor posting a `MailboxHash` body gets 4xx.
  A forged sender is skipped.
- Contact admits **exactly 5**, then 429, with no mail on any 429.
- **30 simultaneous** conference requests admitted exactly the remaining 19
  (20 in total), with exactly 19 emails, so the database counter holds under
  concurrency.
- Egress for the whole run: nothing beyond staging, 0 production attempts.

**Why 16 known failures became 12:**

| Change | Reason |
|---|---|
| F7 ×2 | **fixed** |
| F12 spoof probe | now passes because the emulator behaves like Vercel (measured) **and** `clientIp()` prefers `x-real-ip` |
| F5 H1 probe | now passes **only** because the emulator behaves like Vercel. **The F5 code fix is not done**; the offline `authz-risk-test` F5 probes still report it as known |

### Remaining 12 known failures (all tracked)

F4 ×5, F2 ×3, F8, F9, D20, D21. Also tracked:

- F5 (offline, defence in depth)
- F10, F11, F6
- **D22**, publishing reliability (§5)
- the `og-news` render skip

### Before Batch B goes to production (read-only checks for you)

1. `MESSAGES_INBOUND_SECRET` is set on production and is **at least 16
   characters**. Otherwise inbound replies get 503 and Postmark retries them
   until it is fixed.
2. The Postmark inbound webhook URL carries `?secret=<that value>`.
3. **`SUBMISSION_SALT` is set on production.** Without it, each serverless
   instance salts IP hashes with its own random value, and the throttle stops
   being shared across instances.

### Remaining risks

- **The throttle fails OPEN** if its database call fails (the documented
  policy shared with `submit.js`: a broken counter must not drop leads).
  During a database outage the forms are unthrottled.
- **The secret travels in the URL query string**, which platform request logs
  can record. Postmark supports HTTP Basic Auth on webhook URLs; moving to it
  is a proposed follow-up.
- **SMTP-level sender spoofing.** Someone who knows a conversation's UUID
  *and* its CEO address could send email with a forged `From` to the inbound
  address. Postmark passes SPF/DKIM results in the payload; requiring a pass
  is a proposed follow-up.
- **Shared networks.** Leads from one office or booth network share a bucket
  (5 per 10 min for contact, 20 for conference). Legitimate bursts beyond that
  get a clear error and the "email support directly" fallback.

---

## 8 · Batch C: F4 AI authorization, IMPLEMENTED LOCALLY (2026-10-30, uncommitted, not deployed)

### Caller review (before any change)

| Route | Real callers | Who uses them |
|---|---|---|
| `compose` (draft, revise, check_facts, caption) | `src/lib/compose.js` ← `portal/publish/DraftRelease.jsx`, `portal/MediaPage.jsx` | Company portal |
| `compose` (ask) | `src/lib/mineiqChat.js` ← `portal/MineIQ.jsx` (`askMineIq` in `lib/mineiq.js` has no callers) | Company portal |
| `comms-generate`, `extract-text` (with company) | `console/CommsCenter.jsx` | Company portal (`press`) |
| `structure-release` | `portal/publish/CreateRelease.jsx` (passes `companyId`), `Onboarding.jsx` (`onboarding:true`) | Company portal, onboarding |
| `audience-card` | `admin/AudienceCard.jsx` | Admin |
| `synthesize-profile`, `extract-company`, `extract-projects`, `extract-text`, `structure-batch` (no company) | `lib/structureReleases.js` ← `Onboarding.jsx`, `console/CompanyMemory.jsx` | Onboarding concierge / company console |
| `story-extract`, `story-fetch` | `src/studio/*` | **Story Studio, admin-only** (`main.jsx` `AuthGate requireAdmin`) |
| `build-from-website` | `admin/Admin.jsx`, `admin/onboarding/*` | Admin |

**Investor-facing Mine IQ:** no investor-app code calls any AI endpoint.
Investors see Mine IQ only as published facts read from the database, which
none of these routes serve. A test now pins this.

### Policy implemented (proposed; confirm before production)

| Surface | Admitted | Refused |
|---|---|---|
| Drafting and content creation: `compose` draft/revise/check_facts/caption, `comms-generate`, `structure-release`, `audience-card`, `synthesize-profile`, `extract-*`, `structure-batch` | **owner, admin, editor, publisher** of the named company; platform admin | **viewer, analyst** (`403 role_not_permitted`); investors; other companies; anonymous |
| Mine IQ `ask` (`compose` mode `ask`) | **any member role** of that company, viewer included; platform admin | investors; other companies; anonymous |
| Story Studio (`story-extract`, `story-fetch`) and `build-from-website` | **platform admin only**; a company named in the body is ignored | everyone else |
| Extractors with **no** company named (onboarding concierge) | platform admin, **unchanged** | everyone else |

### Changes

| File | Change |
|---|---|
| `api/_aiGuard.js` | `requireAiCaller` gains `adminOnly`, `adminWhenNoCompany` and `roles`. Roles are checked with **`my_company_role(cid)` called as the caller** (migration 0006; no new migration); platform admins always pass. New **per-user daily cap** (`AI_USER_DAILY_CAP`, default 1500) alongside the existing per-user burst window and per-company daily cap. Body ceilings for every newly guarded route. `DRAFTING_ROLES` and `MEMBER_ROLES` are each one exported line |
| `api/compose.js` | `verifyBearer` replaced by the guard per mode (`portal_access`, the entitlement that admits a company to `/portal` at all). The Mine IQ context uses the **authorised** company (`caller.companyId`), never re-read from the body |
| `api/comms-generate.js` | Guard with `communications_center` plus drafting roles, before the key check |
| `api/extract-company.js`, `extract-projects.js`, `extract-text.js`, `structure-batch.js` | Guard with `company_memory`, `adminWhenNoCompany` and drafting roles, **before** the key check (F10 for these). Redundant inner checks removed |
| `api/structure-release.js`, `audience-card.js`, `synthesize-profile.js` | Gain `roles: DRAFTING_ROLES` |
| `api/story-extract.js`, `story-fetch.js`, `build-from-website.js` | Guard with `adminOnly` |
| `src/lib/compose.js`, `src/portal/MediaPage.jsx` | **The only client change:** captions now send `companyId` |
| Tests | New `scripts/ai-access-test.mjs`: 193 offline tests, mutation-checked (allowing viewers to draft gives 22 failures; removing the role check, 33; making Story Studio non-admin, 6). `ai-guard-test` stub learns `my_company_role` (145/145, every prior case unchanged). `authz-risk-test` F4 and story-extract F10 markers removed (7 secure / 6 known). Live suite: role-aware matrices, a Mine IQ ask entry, no-company concierge probes, SSRF probes run as admin |

**No migration. No change to `vercel.json` or environment configuration.**

### Results

| Suite | Before Batch C | After |
|---|---|---|
| `npm test` | exit 0 | **exit 0** (now including `ai-access` 193/193) |
| Offline risk tests | 5 secure / 8 known | **7 secure / 6 known**, 0 unexpected |
| API suite (staging) | 268 / 12 / 1 (281) | **314 / 7 / 1** (322), 0 unexpected |
| Combined database + API | 714 / 12 / 1 (727) | **760 / 7 / 1** (768), 0 unexpected |

**F4: all 5 known probes now pass on staging.** Verified live:

- owner, publisher and admin draft;
- the viewer is refused drafting (`role_not_permitted`) but **may ask Mine IQ**;
- investors and other companies are refused everywhere;
- Story Studio admits only the admin.

Offline also verifies:

- an owner naming another company is refused **without consuming that
  company's AI budget**;
- admitted calls are charged to the authorised company;
- the kill switch covers all 13 AI surfaces;
- anonymous callers get 401, not a configuration 500, on every route;
- the per-user daily cap refuses the call over the cap with no provider call.

### Remaining 7 known failures, all tracked

**Batch D, F2 ×3**, F8, F9, **D20**, D21. Also tracked:

- F5 (offline; defence in depth)
- F10 for `stripe-checkout` and `stripe-portal` (part of Batch D)
- F11, F6
- **D22**, publishing reliability (§5)
- the `og-news` render skip

### Found during Batch C

- **D23 (pre-existing, unchanged by this batch).** Company Memory
  (`console/CompanyMemory.jsx`, at `/onboarding`, open to non-admin company
  users) and the self-serve builder call `extract-text`, `structure-batch`,
  `extract-company` and `extract-projects` through `lib/structureReleases.js`
  helpers that **drop the `companyId`**. Those requests take the admin-only
  branch, so **ordinary company users are refused** (403), both before and
  after this batch; confirmed live ("owner, no company → 403"). Proposed fix,
  not implemented: thread `companyId` through those helpers so company users
  are authorised for their own company. It is a client change and needs
  approval.
- **A broken test script, pre-existing.** `scripts/compose-test.mjs` imports
  `callClaude`, which was removed in `a2727b3` when Mine IQ moved to OpenAI. It
  is not part of `npm test`. Not fixed here.

### Before Batch C goes to production (read-only checks for you)

1. **Confirm the role policy:** viewers and analysts may ask Mine IQ but not
   draft.
2. **Count production members with role `viewer` or `analyst`.** They would
   lose drafting. `createInvitation()` defaults to `owner`, so probably none.
3. **Check production AI usage per user and per company per day.** The new
   per-user cap (1500) and the existing company cap (1000) should sit well
   above real use.
4. `SUBMISSION_SALT` set (already required by Batch B; the AI counters use it
   too).

### Remaining risks

- **Portal UX for read-only roles.** A viewer opening Draft or Media sees a
  403 error rather than a hidden or disabled control. A UI follow-up:
  `my_company_role` is already available to the client.
- **Fail-closed availability.** If the database counters or the role lookup
  are unreachable, AI requests are refused (503 or 502), as the guard already
  did for its three original routes. That is safer for spend, but stricter
  than before for `compose`, `comms-generate` and the extractors.
- **The role check costs one extra database call** per admitted AI request.

---

## 9 · Batch D: F2 billing authorization, IMPLEMENTED LOCALLY (2026-10-30, uncommitted, not deployed)

### Caller review

| Caller | Flow | Change needed |
|---|---|---|
| `src/portal/Portal.jsx` `BillingView` → `/api/stripe-checkout` with `{ tier, companyId }` | "Pay by card" | none (already sends `companyId`) |
| `BillingView` → `/api/stripe-portal` with an **empty body** | "Manage / cancel card" | **now sends `companyId`** |
| Stripe → `/api/stripe-webhook` | provisioning | none: still reads the same `metadata.company_id` checkout stamps |
| Admin billing (`admin_set_billing` RPC, manual / invoiced plans) | Mission Control | none (separate path, `is_admin()`) |

### Policy implemented (approved)

Owners and **company admins** of THAT company may start checkout and open the
billing portal. Platform admins keep access for manual and invoiced billing.
Editors, publishers, analysts, viewers, investors and other companies are
refused. Roles are checked server-side, as the caller, with `my_company_role()`.

### Changes

| File | Change |
|---|---|
| `api/_roles.js` *(new)* | The shared role check: `callerCompanyRole`, `callerIsPlatformAdmin`, `requireCompanyRole` (401 / 400 bad UUID / 403 / 502 fail-closed), and `BILLING_ROLES = ["owner", "admin"]`. `api/_aiGuard.js` now imports from it; behaviour is unchanged (145 + 193 AI tests pass) |
| `api/_appOrigin.js` *(new)* | The one return origin: `PORTAL_ORIGIN` (validated https; http only for localhost) or the existing default `https://passport-xi-five.vercel.app`. **Never** the request's `Origin`, `Host` or `Referer`. Deliberately not `PUBLIC_APP_URL`, which `share-news.js` uses for the marketing site (`mineex.ca`), and which does not serve `/portal` |
| `api/stripe-checkout.js` | The role check **before** any Stripe configuration is read (F10). The session is stamped with the **authorised** `companyId`. Fixed return URLs |
| `api/stripe-portal.js` | Requires `companyId` and the role check. Finds the Stripe customer **by company**: Stripe Search on `metadata['company_id']`, which checkout stamps on every subscription. If Search is unavailable, falls back to the caller's email but accepts only a customer whose subscription is stamped with this company. Fixed return URL |
| `src/portal/Portal.jsx` | Sends `companyId` to `stripe-portal`. Billing actions show only for owners and company admins; other members see "Only an owner or admin … can change billing" |
| `api/_stagingEgress.js` | The staging Stripe mock now models `subscriptions/search` (inert in production) |
| Fixtures | New `iso-editor-a` (editor) and `iso-coadmin-a` (company admin) on company A. Each seed resets Stripe-created subscriptions and the `iso-` tiers, using the guard's provisioning setting for the admin-managed tier, set locally inside a transaction |
| Tests | New `scripts/billing-access-test.mjs` (58, in `npm test`, mutation-checked: letting editors pay, trusting `Origin`, or finding the customer by email each give 2 failures). `authz-risk-test` F2 ×2 and Stripe F10 markers removed (now 10 secure / 3 known). Live suite: billing matrices with the editor and company admin, and a **live webhook round trip** |

**No migration. No change to `vercel.json` or environment configuration.**

### Webhook compatibility (no live Stripe transaction)

- **Offline:** events are signed with an **independent** implementation of
  Stripe's documented scheme (HMAC-SHA256 over `t.payload`), not the
  handler's own code. A `checkout.session.completed` **built from the exact
  parameters `stripe-checkout` sent** provisions the authorised company on
  `passport` with the right tier. `subscription.updated` (past_due),
  `subscription.deleted` (cancelled) and `invoice.payment_failed` (past_due)
  map correctly. Unknown types write nothing. Four kinds of bad signature are
  refused. A header with Stripe's extra `v0` scheme is accepted.
- **Live on staging:** a signed `checkout.session.completed` for company B,
  then `customer.subscription.deleted`, read back **as B's owner**: active on
  `passport` with tier `basic`, then cancelled. The subscription lookup went
  to the staging Stripe mock, never to Stripe.
- **New compatibility gap, tracked with F9:** during a webhook-secret
  **rotation** Stripe sends **two** `v1` signatures. The handler keeps only
  the last, so a valid first one is rejected. The F9 fix should accept any
  matching `v1`.
- **Limitation:** Stripe's official library isn't installed here, and
  installing it would be a new download needing approval. The independent
  implementation follows Stripe's published scheme, and Phase B's optional
  Stripe test mode would confirm it end to end.

### Results

| Suite | Before Batch D | After |
|---|---|---|
| `npm test` | exit 0 | **exit 0** (now including `billing-access` 58/58) |
| Offline risk tests | 7 secure / 6 known | **10 secure / 3 known** (F5 ×2, F11) |
| API suite (staging) | 314 / 7 / 1 (322) | **333 / 4 / 1** (338), 0 unexpected |
| Combined database + API | 760 / 7 / 1 (768) | **781 / 4 / 1** (786), 0 unexpected |

**F2: all 3 known probes now pass.** Checkout and the billing portal admit
the owner, the company admin, the platform admin and B's own owner. They
refuse the **editor**, publisher, viewer, investor, and cross-company owners
and admins.

**Remaining 4 known failures:** F8, F9, **D20**, D21. Also tracked: **D23**,
**D22**, **F5**, F11, F6, and the `og-news` render skip.

**A mistake during this batch, fixed:** my first tier reset in the seeder hit
`company_owner_guard` and aborted the seed halfway. The rotated site tokens
were never written to the env file, and the counters were never reset. That
caused one run's 5 unexpected failures. Corrected, and the next runs were
clean.

### Before Batch D goes to production (read-only checks for you)

1. **Stripe:** confirm every live subscription carries
   `metadata.company_id`. Checkout has always stamped it, but a subscription
   created in the Stripe dashboard would not have it, and its company would
   then get 404 from "Manage billing".
2. **Memberships:** confirm no company relies on an editor or publisher to
   pay.
3. **`PORTAL_ORIGIN`:** optional. Unset keeps today's origin. Set it if the
   portal moves to a custom domain.

---

## 10 · AI usage and recommended limits (review; NOT implemented)

### What could and could not be reviewed

**Actual usage is in production, which is out of scope, so I have not seen
any real numbers.** What exists:

- `supabase/audit/ai_usage_review.sql` *(new, verified read-only by
  `scripts/audit-sql-readonly-check.mjs` and exercised inside a read-only
  transaction on staging)*. It reads the AI guard's own counters for real
  per-user (salted hash) and per-company call counts, publication volume as
  a proxy for the routes that had **no** counters before Batch C, and the
  news pipeline's token totals. **Run it in production and send me the
  results.**
- From the code:
  - Anthropic routes default to `claude-sonnet-5` (output up to 8,000
    tokens) and `claude-haiku-4-5` (batch/text).
  - OpenAI routes default to `gpt-4o-mini` (compose, ask, comms) and
    `gpt-4o` (extraction).
  - Portal AI calls record no tokens or cost; only the news pipeline does
    (`news_ai_usage`, with `AI_DAILY_USD_LIMIT`). The repo's OpenAI price
    defaults are flagged unverified (`AI_PRICING_VERIFIED` unset).

### Current limits (after Batch C)

| Limit | Scope | Value |
|---|---|---|
| Burst | per user, per endpoint, per 10 minutes | 200 (`AI_CALLS_PER_WINDOW`) |
| Daily | per user, all endpoints | 1,500 (`AI_USER_DAILY_CAP`) |
| Daily | per company, all endpoints | 1,000 (`AI_COMPANY_DAILY_CAP`) |
| Request size | per endpoint | 16 KB – 8 MB |

### Recommendation (to finalise against the query results)

| Limit | Recommended | Reasoning |
|---|---|---|
| Interactive burst (compose, ask, comms-generate, structure-release, audience-card) | **30 per 10 min** per user per endpoint | A person drafting and refining makes roughly 10–20 calls in 10 minutes. 200 lets a script burn a day's budget in minutes |
| Bulk / onboarding burst (structure-batch, extract-*, synthesize-profile, build-from-website) | **120 per 10 min** | The concierge runs batches: about 5 calls per project for `extract-projects`, plus 1 per 8 releases for `structure-batch` |
| Per-user daily, company users | **300** | About 15× a heavy interactive day |
| Per-user daily, platform admins | **1,500** (keep) | Onboarding several companies in a day |
| Per-company daily | **3× the observed p95** from query 2, with a floor of 200; or by plan, e.g. Basic 200 / Pro 500 | Ties the ceiling to real use, and to what the company pays for |
| **Spend ceiling** | a portal-AI daily USD limit, like the news pipeline's | Call counts don't bound cost when one call can produce 8,000 output tokens. **Needs per-call token recording**, which means a new table or extending `news_ai_usage`: a migration, so **approval first** |

Per-endpoint and per-role caps need a small change to `requireAiCaller`, a
label-to-limit map. That is no migration, but it is a production behaviour
change, so it should be its own approved item.

---

## 11 · D20: messaging after 0063, IMPLEMENTED LOCALLY (2026-10-30, uncommitted, not deployed)

### The exact conflict (measured on staging)

| Call site | Request | Staging answer | Cause |
|---|---|---|---|
| `api/messages.js` (investor send) | `POST conversations?on_conflict=investor_id,company_slug` (service role) | **400 `42P10`** | 0063 replaced the full unique `conversations_investor_id_company_slug_key` with **partial** indexes: `uq_conv_investor_thread (investor_id, company_slug) WHERE sender_company_id IS NULL` and `uq_conv_company_thread (sender_company_id, company_slug) WHERE sender_company_id IS NOT NULL`. PostgREST's `on_conflict` can only name a full constraint |
| `src/lib/messages.js` `startCompanyThread` (portal) | `POST conversations?on_conflict=sender_company_id,company_slug` (as the user) | **400 `42P10`** | Same |
| The same row, as a plain insert, as the user | `POST conversations` | **403 `42501`** "permission denied for table conversations" | **A second defect.** 0052 grants `authenticated` only **SELECT** on `conversations`. 0063's `conv_insert_company` policy can never be reached, so company-started threads could not work from the browser even without the upsert |
| `sendCompanyReply` (company reply in an existing thread) | `POST messages`, `sender='company'` | **201** | Works; not affected |

Production does not have 0063: the old full constraint is there and the
investor upsert works. **Every fix below must work on both schemas, and
does.**

### The fix (code only; no migration, no grant, no policy change)

- **Find-or-create, server-side, as the service role.**
  - It selects the thread, inserts it if absent, and re-selects if a
    concurrent insert loses on the unique index (409/23505).
  - Investor threads are matched as `sender_company_id == null`. Before 0063
    the column does not exist and reads as `undefined`, so the same code runs
    on production's schema.
  - The old upsert's refresh of `company_name`/`ceo_email` is kept: a PATCH,
    only when they changed.
- **New: `POST /api/messages` with `action: "start"`** (same endpoint, so the
  Hobby function cap is unchanged). It replaces the portal's direct
  upsert. It enforces 0063's `conv_insert_company` rule in code:
  - **Caller:** signed in, and `my_company_role(fromCompanyId)` asked as the
    caller is non-null. That is exactly `owns_company()`: any active member
    or the owner; platform admins not included, as in 0063.
  - **Row fields:** `investor_id` = the acting user. `company_name` is
    resolved server-side. Client-supplied `investor_id`, `sender_company_id`
    and `company_name` are ignored.
  - **Recipient:** must exist, and a company cannot message itself.
  - **Before 0063:** answers 503 `company-threads-unavailable`. It never
    silently creates an investor thread instead.
  - **First message:** `sender='investor'` (positional: the initiating side,
    as 0063 defines).
- **Duplicate messages.**
  - **With a client idempotency key** (`clientMessageId`, a UUID), the
    database enforces it. The key is stored in `messages.email_id` as
    `client:<conversation>:<uuid>`, and the existing unique index
    `uq_messages_email` (0014) rejects a second insert. The losing request
    returns the stored message. Postmark MessageIDs never carry the
    `client:` prefix, so the two uses cannot collide.
  - **Without a key** (the investor app today), an identical body from the
    same side of the same thread within **30 s** is returned instead of
    stored. A retried send also no longer emails the CEO twice.
  - **Trade-off to review:** this repurposes `email_id` rather than adding a
    column, which avoids a migration. A dedicated column would be cleaner
    and needs approval.
- **Client.**
  - `startCompanyThread` now calls the API. The portal's compose box sends
    one `clientMessageId` per (recipient, text), so pressing Send again after
    a network failure cannot post twice.
  - The investor app is unchanged; it relies on the 30-second window.
- **Fixture correction.** The seeder's `ceo_email` update is now limited to
  investor threads (`sender_company_id is null`). Before, it would have put a
  CEO address on a company-started thread with the same recipient slug.
- **Isolation-probe correction** (`tenant-isolation-test.mjs`).
  - **Cause:** since 0063, `conversations.company_slug` names the
    **recipient**. A thread company A started with B carries B's slug, and A
    is a party to it. Once D20 made such threads possible, two probes
    counted A's own sent thread as a leak.
  - **Fix:** they now exclude only rows with `sender_company_id = A`. Any
    other B row visible to A still fails. The join probe now picks a parent
    thread A is not a party to.

### Authorization: unchanged, and still to decide (F6)

- **Unchanged.** Who may message as a company is exactly what RLS already
  allowed: any active member, viewers included, for both replies (0047) and
  company-started threads (0063). D20 does not narrow or widen it.
- **Open decision.** Batch C's drafting policy (owner/admin/editor/publisher)
  is **not** applied to messaging, because no messaging policy has been
  approved. If messaging should follow it, that is a separate change:
  - `handleStart`: a role list;
  - 0047/0063: their policies, which needs a migration;
  - tracked with F6.

### Tests

| Suite | Result |
|---|---|
| **New** `scripts/messaging-flow-test.mjs` (offline, in `npm test`) | **70 / 70**. In-memory PostgREST that enforces 0063's partial indexes, the pre-0063 full constraint and `uq_messages_email`, answers `on_conflict` with 42P10, and interleaves requests randomly. Covers investor → company (new, reuse, CEO refresh, unclaimed company), retries (keyed, unkeyed, malformed key, outside window), concurrency (25 rounds × 8 parallel first messages → 1 thread; 25 × 6 concurrent keyed retries → 1 message; same for company starts), company start (create, reuse, viewer, separate from the same person's private thread), 12 refusals (anonymous, invalid token, investor, cross-company ×2, platform admin non-member, outsider, self, unknown recipient, bad/missing ids), role check down → 502, spoofed fields ignored, pre-0063 schema, existing history preserved, no egress. **Fails against the previous handler** (verified) |
| **New** `scripts/messaging-live-test.mjs` (staging, real database, `npm run test:messaging-live`) | **53 / 53, run twice** |
| API suite (staging) | **339 / 3 / 1** (343). D20 resolved; 5 new `action:"start"` assertions (positive control, anonymous, cross-company, investor, platform admin) |
| Combined database + API | **787 / 3 / 1** (791), 0 unexpected |
| `npm test` | **exit 0** |
| `vite build` | succeeds |

**What the live staging run proved, each checked in the database (service-role reads), not just by HTTP status:**

- **The defect is real and untouched.** The old upsert still returns 42P10
  on staging. The browser still cannot insert conversations: no grant was
  added.
- **Investor → company:** 200. The message lands in the **existing seeded
  thread**; the database has exactly one investor thread for the pair, the
  message is stored once, and earlier history is unchanged. Company A reads
  it; company B and another investor cannot.
- **Retries:**
  - A repeated `clientMessageId` is stored once.
  - An unkeyed resend within the window is folded into the first.
  - 6 concurrent keyed retries store one message.
- **Concurrency:** 8 parallel first messages into a **new** thread produce
  exactly one thread and all 8 messages.
- **Company → investor:** A's owner replies in the investor thread (201) and
  the investor reads it. A's viewer may also reply (unchanged). Refused:
  company B replying into A's thread, and the investor posting as
  `'company'`. Neither refused row exists.
- **Company → company:**
  - A's owner starts a thread with B. The database row has
    `sender_company_id=A`, `company_slug=B`, `investor_id` = the actor, no
    CEO address, and one `'investor'` message.
  - A's viewer reuses the same thread.
  - B sees the thread and replies; A reads the reply and continues from the
    browser (0063 `msg_insert_sender_company`).
  - Both investors are blind to the thread, and B cannot write as A.
- **Refusals:** anonymous 401. Investor, cross-company owner (twice),
  platform-admin non-member and investor B: 403. Self-message: 400. Unknown
  recipient: 404. **The database shows no thread or message created by any
  of them.**
- **Concurrent starts:** 6 parallel starts B → A produce one thread, exactly
  one response says `created`, and 6 messages are stored. 5 concurrent keyed
  retries store one message. A → B and B → A stay separate.
- **Boundary:** no outbound call blocked. 12 Postmark mails, all mocked, all
  to `.invalid` fixture addresses.

**What the live test writes on staging.** Only messages marked `[d20-live]`.
It also deletes and recreates three test-owned threads each run (investor B →
A, A → B, B → A), so the creation race is exercised every time. It deletes a
thread **only if every message in it carries the marker**; otherwise it stops.
Seeded fixture threads are never deleted.

**Not verified.**
- The portal UI and the investor app were not clicked through in a browser.
  The client change is covered by the build and by calling the same API the
  client calls.
- Production was not touched.
- The investor app's own sends were exercised only via the API, not through
  its UI.

### Before D20 goes to production

1. **Order.** D20 is safe to deploy **before** 0063: the code is verified on
   the pre-0063 schema offline only, because staging has 0063. It must be
   live **before** 0063 is applied to production.
2. **Read-only check:** count conversations that would collide under 0063.
   This query should return 0 rows:
   ```sql
   select investor_id, company_slug, count(*)
   from conversations
   group by 1, 2
   having count(*) > 1;
   ```
3. **Company-started threads** stay unavailable (503) until 0063 is applied
   there, and the portal shows "not switched on yet".

### Remaining known failures and tracked items

- **Known failures (3):** F8, F9, D21.
- **Tracked:** D23 (below), D22, F5, F11, F6, the og-news render skip, the
  S1 inactive cron row (yours to unschedule if wanted), the AI limits (§10,
  unchanged), and the read-only `supabase/audit/ai_usage_review.sql`
  (preserved, unchanged).

---

## 12 · D23: Company Memory drops `companyId`, INVESTIGATED ONLY (2026-10-30, not implemented)

> **Status (2026-10-30): implemented locally, see §13.** The investigation
> below stands; implementing it found three more defects (listed in §13).

Measured on staging through the local API server (AI provider mocked;
staging-only throttle counters were bumped). Each AI route the helpers call
was tried as each role, once as the helpers send it today (no `companyId`)
and once with `companyId`:

| Route (helper) | Owner / editor today | With `companyId` | Viewer with `companyId` | Platform admin today |
|---|---|---|---|---|
| `structure-batch` (`structureReleasesBatched`) | **403** Admin only | 200 | 403 (role) | 200 |
| `extract-company` (`extractCompany`) | **403** | 200 | 403 | 200 |
| `extract-projects` (`extractProjects`) | **403** | 200 | 403 | 200 |
| `extract-text` (scanned-PDF fallback) | **403** | 200 | 403 | 200 |
| `synthesize-profile` (`synthesizeProfile` in re-analyze) | **400** companyId required | passes guard | 403 | **400, admins too** |

**What a user sees.**
- **Company owners and editors.**
  - "Re-analyze from memory" finishes with a success message: "Rebuilt from
    N documents: 0 timeline entries, 0 projects, 0 leaders, capital none
    found." Every AI step was refused and swallowed.
  - `mergeExtraction` writes nothing it did not receive, so **no existing
    data is lost**, but nothing is rebuilt.
  - "Analyze new documents" raises an error (the projects step throws).
    Documents are not marked reflected, so nothing is lost.
- **Platform admins.** Everything works, except that the **company status
  card and AI brief are never rebuilt** by re-analyze, for anyone.
  `synthesizeProfile` is called with neither `companyId` nor `onboarding`,
  and that route has no admin fallback. This was **not in the earlier D23
  note**.
- **Billing.** Admin runs are charged to the admin's limits, not the
  company's.
- **Onboarding (`Onboarding.jsx`) is a different path and works.** It passes
  `onboarding: true` (and a slug for synthesis), though `extractCompany` and
  `extractProjects` there also omit it and rely on the caller being an
  admin.

**Proposed fix (client only; no server, policy or migration change).**
- Thread `companyId` from `reanalyzeFromMemory`/`analyzeNewDocuments` into:
  - `structureReleasesBatched` → `callBatch` body;
  - `extractCompany` and `extractProjects` → `extractPart`;
  - `extractDocText`;
  - `synthesizeProfile`.
- With it, owners, admins, editors and publishers are admitted for their own
  company, charged to it, and capped by it. Viewers and analysts get 403, as
  the approved Batch C policy says. Platform admins keep access.
- **Also recommended:**
  - make re-analyze report "the AI steps were refused" instead of a zero
    success;
  - stop retrying 403s inside `extractPart`'s retry loop (it retries a
    refusal up to 3 times).
- **Tests:** an offline stub asserting each helper's body carries
  `companyId`; plus the staging table above re-run through the helpers.
- **Awaiting your review; not implemented.**

---

## 13 · D23: Company Memory and builder AI, IMPLEMENTED LOCALLY (2026-10-30, uncommitted, not deployed)

D20 committed as `bde0ff7` before this work began.

### What was wrong (all confirmed, offline and on staging)

| # | Defect | Effect |
|---|---|---|
| 1 | The helpers dropped `companyId` (§12) | Company users refused (403); platform-admin runs billed to the admin, not the company |
| 2 | `synthesizeProfile` in re-analysis sent neither `companyId` nor `onboarding` | **400 for everyone**; the status card and AI brief were never regenerated |
| 3 | Re-analysis sent synthesis the **profile-shaped** timeline (`title`, `summary`, `ai.*`), but synthesis reads `headline`, `whatHappened`, `whyItMatters` | Even when it ran, the model saw only dates and titles |
| 4 | `analyzeNewDocuments` called `str()`, which is not defined in its module | "Analyze new documents" threw `ReferenceError` for **every** caller, platform admins included |
| 5 | Refusals swallowed: `extractCompany` returned `null`, `synthesizeProfile` retried 403/400, and `extractPart` re-caught its own refusal and **retried it 3×** | A fully refused run reported "Rebuilt: 0 timeline entries" as a success |
| 6 | Saves used `Prefer: return=minimal`. Under 0001's `auth_update` (owner or platform admin), a company admin's, editor's or publisher's PATCH matches **0 rows and returns 200** | Silent "success" with nothing saved. Analyze-new then marked documents reflected, dropping them from the queue |
| 7 | `extract-company` / `extract-projects`, given no inline corpus, read stored releases **by `slug`** while the guard authorised **`companyId`** (extract-projects read as anon) | A member of A could be authorised and billed as A while naming B's slug |

### Changes (no schema, migration, RLS, grant or rate-limit change)

- **`src/lib/structureReleases.js`**
  - **Company scope on every call.** `aiScope({companyId, slug, onboarding})` is forwarded by every helper: `structureReleasesBatched`/`callBatch`, `extractCompany`, `extractProjects`/`extractPart`, `extractDocText`, `synthesizeProfile`.
  - **Failures carry their status.** A refusal (400/401/403/404/413) is final and never retried; `extractProjects` stops after the first refused part.
  - **Re-analyze and analyze-new** pass `companyId` throughout. Their results carry `steps` (one outcome per step).
  - **Synthesis input.** Synthesis receives the assembled chronology. When this run dated nothing, it falls back to the saved profile timeline (`profileTimelineToChronology`).
  - **`str` defined.**
- **`src/lib/memoryAccess.js` (new)**
  - **`memoryAccess` / `loadMemoryAccess`:** two rules, both asked of the database as the caller.
    - **Run** = Batch C `DRAFTING_ROLES` (mirrored; a test fails if it drifts).
    - **Save** = owner or platform admin (0001).
  - **`saveCompanyProfile`:** saves by id with `return=representation` and **requires one row back**.
  - **`readCompanyProfile`:** reads by id.
  - **`summarizeSteps`:** turns step outcomes into what the person is told; `error` means do not save.
- **`src/console/CompanyMemory.jsx`**
  - **Preflight.** Both actions check access **before any AI is spent**; the buttons are disabled with the reason.
  - **No false success.** An all-refused/failed run is reported and **not saved**.
  - **Verified save.** Documents are marked reflected **only after a verified save**.
  - **Refresh.** `onSaved` → the console's `refresh()` reloads the company, so the new card shows without a page reload (`CompanyConsole.jsx`).
- **`src/Onboarding.jsx` (self-serve builder).** `extractCompany` / `extractProjects` now carry the same subject as its timeline call (`slug: savedSlug, onboarding: true`).
- **`api/_aiGuard.js`.** A request naming both `companyId` and `slug` must name **the same company** (400 `subject_mismatch`); an unresolvable slug counts as a mismatch.
- **`api/extract-company.js`, `api/extract-projects.js`.** The stored-corpus fallback reads **by the authorised `companyId`**, as the caller.
- **`api/_stagingEgress.js` (staging-only mock).** The five Company Memory tools now return deterministic, `[staging mock]`-tagged content, so staging can prove persistence. The overview echoes its input count and first headline.
- **Fixtures.** The seeder adds `ISOLATION_ANALYST` (role `analyst` on company A).

### Who can do what now (measured on staging)

| Caller (company A) | AI admitted | Saves the rebuild | Console behaviour |
|---|---|---|---|
| Owner | yes | **yes** | rebuild runs, saved, refreshed |
| Platform admin | yes | **yes** | same |
| Company admin, editor, publisher | yes (Batch C) | **no**: RLS, owner only | stopped before spending: "only the company owner or a MineEx admin can save" |
| Viewer, analyst | **no** (403) | no | stopped before spending: "cannot run AI analysis" |
| Investor, owner of B | no | no | cannot even read A's documents (RLS); nothing sent |

### Decision needed: who may SAVE an AI rebuild?

> **Decided 2026-10-30: owners, company admins and platform admins. Implemented in §14.**

Batch C says owners, admins, editors and publishers may **draft**. The
database lets only the **owner** (and platform admins) **write**
`companies.profile`. D23 does not resolve the conflict; it stops it from
being silent. Options:

1. **Keep it owner-only** (current). Only the owner, or MineEx, can run
   Company Memory. That matches the console, which only opens an owner's own
   company.
2. **Admit company admins too**, via a server route that checks the role and
   writes with the service role. This is a code-only policy change; it
   needs your approval.
3. **Change 0001's UPDATE policy** to members with drafting roles. This
   needs a migration and approval.

The same RLS rule silently no-ops **ProfileEditor's** saves for non-owner
members (`return=minimal`). That is pre-existing, outside D23, and tracked
as a new finding.

### Tests

| Suite | Result |
|---|---|
| **New** `scripts/memory-ai-test.mjs` (offline, in `npm test`) | **76 / 76**. Real client helpers → real API handlers in-process → stub database with 0001's UPDATE rule. Covers: the access table for all 8 roles; every request names A; the owner's statuses; the role matrix through the real guard (owner, company admin, editor, publisher and platform admin admitted; viewer, analyst, investor and B's owner refused with no provider call, reported as an error); one request per step when refused; subject mismatch ×4; reads by id; the saved-timeline fallback; persistence ×6 roles; analyze-new completes; console wiring. **Fails against the previous code** (verified: it crashes on the first rebuild) |
| **New** `scripts/memory-ai-live-test.mjs` (staging, `npm run test:memory-ai-live`) | **67 / 67, run twice** |
| API suite (staging) | 339 / 3 / 1, unchanged |
| Combined database + API | 787 / 3 / 1, 0 unexpected |
| Live messaging (D20) | 53 / 53 |
| `npm test` and build | pass |

**The live run.** It goes through the real client helpers and real RLS, and
reads back from the database:
- **Owner:** 8 AI requests, all for A and all 200.
  - `companies.profile.companyStatus` = "[staging mock] status from 2 releases", written from the rebuilt headlines.
  - Brief, timeline (2 dated entries), leadership, projects and `pp` persisted.
  - Re-read as the owner (the refresh path) shows the new card.
- **Platform admin:** persisted.
- **Company admin, editor, publisher:** AI admitted. The save is reported as "not saved", the profile is byte-identical, and the console's preflight would have stopped first.
- **Viewer and analyst:** every request 403, no AI spent, reported as refused, profile unchanged.
- **Investor and B's owner:** cannot read A's documents.
- **Subject mismatch:** 400; B's owner with A's id 403; AI spent only on the positive control.
- **Saved-timeline path:** card regenerated from the saved timeline, and reported as such.
- **Analyze-new:** completes and marks documents reflected after the save. A viewer's run marks nothing.
- **Boundary:** no stray host; every AI call was the staging mock.
- **Cleanup:** company A's profile is restored (verified identical) and the test documents are removed.

**How the browser code runs under node.** The client's Supabase URL
resolves to its built-in default (the production project) without Vite's
env. The live suite's fetch shim rewrites that host and its publishable key
to staging's **before** any request is made, and throws on any other host.
Production was never contacted (shim count: 70 rewrites, 0 stray hosts).

**Staging rate limit.** Staging sets `AI_CALLS_PER_WINDOW=12` so the API
suite can test throttling. The suite resets staging's counters between the
owner's phases; it does not change the limit. Production's default is 200.
A full rebuild uses at most 25 `extract-projects` calls (6 projects × 4
parts, plus discover).

**Not verified.**
- The console was not clicked through in a browser; the page is covered by
  the build and by running its exact sequence.
- The self-serve builder's change is covered by source checks and the
  server's slug path, not by a run of `Onboarding.jsx`.
- Real model output was not exercised (staging mocks it).

### Still open / tracked

- **D23 decisions:**
  - who may save (above);
  - whether the extractors should accept `onboarding: true` for a brand-new
    company. Today they are admin-only when no company row exists, unchanged.
- **New finding:** non-owner members' ProfileEditor / publish saves are
  silent no-ops under 0001.
- **Deployment order (unchanged):** D20 must reach production **before**
  migration 0063.
- **Known failures (3):** F8, F9, D21.
- **Tracked:** F9, D22, F5, F11, F6, the og-news render skip, the S1 inactive
  cron row, AI limits (§10, unchanged), and `ai_usage_review.sql`
  (preserved).

---

## 14 · D23 save permission: owners and company admins, IMPLEMENTED (2026-10-30)

### Policy (approved)

| Caller | Run Company Memory AI | Save a rebuild to the live profile |
|---|---|---|
| Owner, company admin, platform admin | yes | **yes** |
| Editor, publisher | yes (generate) | **no** |
| Viewer, analyst, investor, other companies | no | no |

### `POST /api/memory-save` (new; no RLS change, no migration)

1. **Identity:** `verifyBearer`.
2. **Role:** `my_company_role(companyId)` asked **as the caller** (active
   membership role, or `owner` via `owner_id`). It must be `owner` or `admin`,
   or the caller is a platform admin (`profiles.role`). An unavailable role
   check is 502 (fails closed).
3. **Subject:** the company is read **by the authorised id** (service role). A
   `slug`, if sent, must be that company's (400 `subject_mismatch`).
4. **Payload:** `fields` may only contain `timeline`, `companyStatus`,
   `companyBrief`, `company`, `capital`, `team`, `projects`.
   - Types and sizes are checked; the body is capped at 3 MB (413).
   - `__proto__`, `constructor` and `prototype` are refused at any depth.
   - `company` may only carry `name`, `ticker`, `website`, `slogan`,
     `commodity`, `jurisdiction`, `listings`. `name` and `ticker` are
     identifiers and **fill only**.
   - `pp` is **recomputed server-side**, never accepted.
   - Everything else in the profile is kept from the stored row.
5. **Write:** only the `profile` column is written. `owner_id`, `tier`,
   `status`, `slug`, `name`, billing, memberships and ids cannot be reached.
6. **Concurrency:**
   - The client sends the `updated_at` it merged against. A different
     stored value is 409 `stale_base`.
   - The write is a compare-and-set on the `updated_at` the route read (the
     existing `companies_touch` trigger bumps it on every update).
   - Zero rows written is 409 `concurrent_write`, never success. A database
     failure is 502.

**Console.**
- Company Memory saves through this route for owners, company admins and
  platform admins (`saveCompanyProfile(companyId, next, updatedAt)`), and no
  longer builds `pp` itself.
- Editors and publishers see the reason and are stopped before any AI is
  spent.

### Editors and publishers cannot reach the live profile another way

Measured on staging as the editor and the publisher:

| Path | Result |
|---|---|
| Direct PATCH of `companies` (ProfileEditor, `publish.js`) | 0 rows (0001 RLS: owner or platform admin) |
| `/api/memory-save` | 403 |
| `/api/build-from-website` (the other server-side profile writer) | 403 (platform-admin tool) |
| `rpc/upsert_timeline_entry` | 403 (revoked from users in 0051; only the publishing pipeline adds a **published release's** timeline entry, by design) |
| `rpc/admin_set_billing` | "not authorized" (`is_admin()`) |

**Related finding, not changed (new, d29).** `company_go_live` (0035) checks
`owns_company()`, which admits **any active member**, viewers included. Any
member can therefore flip the company's `status` to published once the
agreement is recorded. That is status, not profile, and it was found by
reading the code; it was not exercised, because calling it would publish the
staging company. It is tracked with F6.

### Tests

| Suite | Result |
|---|---|
| `memory-ai-test.mjs` (offline, in `npm test`) | **118 / 118** |
| `memory-ai-live-test.mjs` (staging) | **97 / 97** |
| API suite (staging) | **352 / 3 / 1** (356): 13 new `memory-save` assertions |
| Combined database + API | **800 / 3 / 1** (804), 0 unexpected |
| Live messaging (D20) | 53 / 53 |
| `npm test` and build | pass |

**What the offline suite (118) covers:**
- client and server agree on the save roles and the field allowlist;
- persistence for 9 roles (owner, company admin and platform admin saved,
  with one profile-only write and privileged columns untouched; editor,
  publisher, viewer, analyst, investor and B's owner 403 with nothing
  written);
- 15 payload/isolation refusals, each with nothing written;
- 413;
- identifiers fill only;
- stale base 409;
- 20 rounds × 5 concurrent saves: exactly one 200, four 409, and the stored
  card is the winner's;
- database write failure 502, and the console reports "not saved";
- zero rows (row changed under the write) 409;
- role check down 502;
- editor/publisher bypass via direct PATCH, `memory-save` and
  `build-from-website`;
- an editor of an **unpublished** company with a consistent `companyId` +
  `slug` is admitted, and with B's slug refused.

**Fixed before commit.** The first version of the `companyId`/`slug`
consistency check resolved the slug through RLS. 0001's `auth_read` hides an
unpublished company's row from its own admins and editors, so every portal
request of theirs that carries both fields (`structureRelease`) would have got
a false 400. The check now resolves the slug with the service role, which
reveals only whether the slug names that id. A regression test catches the
RLS version.

**What the live suite (97) adds on staging:**
- **Company admin:** a full rebuild, saved, with privileged columns
  unchanged, and the refresh shows it.
- **Editor and publisher:** AI admitted, `memory-save` 403, profile
  unchanged.
- **Refusals:** 7 roles refused; 6 payload attacks refused, with profile and
  privileged columns verified unchanged.
- **Concurrency:** 3 rounds of 5 concurrent saves across owner, company
  admin and platform admin, with the database holding the winner. Stale base
  409.
- **Bypass table** above.

### Remaining limitations

- **Self-serve builder:** the `Onboarding.jsx` change is verified by source
  checks and the server's slug path, not by running the page. A brand-new
  company with no row stays admin-only, unchanged.
- **Console:** not clicked through in a browser. The local dev server can
  fall back to production, so the exact console sequence was run against
  staging instead.
- **Model output:** staging mocks the AI, so real model output was not
  exercised.
- **Out of scope here, tracked:** profile drafts, approval and versioning
  (a04, a05: ProfileEditor still writes live) and non-owner ProfileEditor
  saves being silent no-ops (d28).
- **Deployment order (unchanged):** D20 must reach production before
  migration 0063.

---

## 15 · F9: Stripe webhook replay, rotation, idempotency and ordering, IMPLEMENTED LOCALLY (2026-10-30, uncommitted, not deployed)

D23 was committed as `1dda3d6` before this work began.

### What was wrong (from reading the handler and schema)

| # | Defect | Effect |
|---|---|---|
| 1 | `verifySig` never checked the timestamp | A captured, correctly signed event could be replayed **forever** (the KNOWN F9 probe: a day-old event got 200) |
| 2 | Only the **last** `v1` was kept | During a secret roll Stripe signs with both secrets; a valid first signature was rejected |
| 3 | The raw body was decoded **chunk by chunk** into a string | A multi-byte character split across chunks changes the bytes and fails verification |
| 4 | No record of processed event ids | Duplicates and concurrent deliveries are applied again |
| 5 | No ordering | An older event delivered late overwrote newer state; a replayed "active" could re-activate a cancelled plan |
| 6 | No binding of company to subscription | An event for **another** subscription carrying a company's id (an old, replaced subscription, for example) could cancel that company's current billing |
| 7 | Write errors ignored | A failed upsert still returned 200, so Stripe never retried and the change was lost |
| 8 | `invoice.payment_failed` (no tier) reset `plan_id` to `passport` | A Pro company lost its plan on a failed payment |
| 9 | Checkout passed Stripe's raw status through | `incomplete` was stored as the portal status, a value nothing else understands |

### Changes

**`api/stripe-webhook.js`** (works with or without the migration):
1. **Signature over the raw bytes.** Any `v1` may match, each compared in
   constant time. `v0` is never trusted.
2. **Timestamp:** within **300 s** either side (Stripe's default). Stripe's
   own retries are re-signed with a fresh timestamp, so legitimate delivery
   is unaffected.
3. **Shape:** an `evt_` id, a type, an integer `created` and an object, or 400.
4. **Company checks.** The company id must be a UUID. A checkout session
   must name the **same** company in `metadata.company_id` and
   `client_reference_id` (both written by `stripe-checkout`), or it is
   ignored.
5. **Status mapping.** Every status goes through the same mapping:
   active/trialing → active, past_due → past_due, else cancelled.
6. **`stripe_apply_event()` (0069b)** records and applies each event in one
   transaction. If the function is missing (PGRST202, i.e. 0069b not
   applied), the handler falls back to the previous direct writes and logs
   that de-duplication is off.
7. **Write failures** return 500, so Stripe retries.

**`supabase/migrations/0069b_stripe_events.sql`: PREPARED, NOT APPLIED. Needs your approval.**
- **New table `stripe_events`.** The event id is the primary key. It is
  service-role only (RLS on, no policies, privileges revoked from anon and
  authenticated). This is the durable idempotency key. It holds across
  serverless instances, because a concurrent insert of the same id waits on
  the key and then conflicts.
- **Three nullable columns on `company_subscriptions`** (no default, no
  backfill): `stripe_subscription_id` (the binding), `stripe_status` (raw;
  `canceled` is terminal) and `stripe_event_at` (`created` of the last
  applied event).
- **`stripe_apply_event()`, one transaction:**
  1. Claim the event id, else return `duplicate`.
  2. Lock the company row (serialises that company's events).
  3. Refuse an event for a subscription the company is not bound to
     (`other_subscription`). Exceptions: a checkout, which binds, and a
     `subscription.created` when the bound subscription is no longer active.
  4. Refuse an older event (`stale`).
  5. Refuse to revive a canceled subscription (`terminal`).
  6. Otherwise upsert and bind, and set the tier when active (`applied`).
  7. An event with no tier keeps the stored plan.
  8. Any exception rolls back the event row too, so Stripe's retry is
     processed rather than seen as a duplicate.
- **Impact:**
  - `ADD COLUMN … NULL` is metadata-only (no rewrite, brief lock).
  - Nothing existing reads the new columns; entitlements still read
    `plan_id` and `status`.
  - Existing rows have no binding: the first event for a company binds it.
  - Manual/invoiced rows are untouched unless a Stripe event for that
    company arrives, exactly as before.
  - One small row per Stripe event.
- **Rollback** is in the file header.
- **Order:** the code is safe to deploy before or after 0069b. De-duplication,
  ordering and binding start the moment 0069b is applied.

### Tests

| Suite | Result |
|---|---|
| **New** `scripts/stripe-webhook-test.mjs` (offline, in `npm test`) | **66 / 66**; details below. **Fails against the old handler** (5 failures, then it crashes) |
| **New** `scripts/stripe-webhook-sql-check.mjs` (staging, `npm run test:stripe-webhook-sql`) | **25 / 25**; details below |
| **New** `scripts/stripe-webhook-live-test.mjs` (staging, `npm run test:stripe-webhook-live`) | **19 / 19**; details below |
| `billing-access-test` | **59 / 59** (was 58 + 1 KNOWN): rotation now asserted; webhook cases run on the pre-0069b path |
| API suite (staging) | **354 / 2 / 1** (357). F9 resolved; new rotation assertion; payloads now carry `created` and unique ids |
| Combined database + API | **802 / 2 / 2** (806), 0 unexpected. The new SKIP is `stripe_events` not existing on staging; see below |
| Live messaging, live Company Memory | 53 / 53, 97 / 97 |
| `npm test` and build | pass |

**What the offline suite (66) covers:**
- **Signatures and timestamps:**
  - ±301 s refused; a day-old event refused; 295 s accepted;
  - rotation with the first or the second `v1` valid; neither valid refused;
  - `v0` ignored;
  - 8 malformed or forged headers, each with nothing recorded;
  - a multi-byte character split across chunks still verifies.
- **Malformed events:** 7 shapes refused, plus non-JSON.
- **Existing behaviour through 0069b:** checkout, past_due, upgrade to Pro,
  payment failed keeping the plan, deleted, ignored types.
- **Idempotency and replay:** a duplicate is 200 `{duplicate: true}`; a
  re-signed redelivery is a duplicate; replaying the old "active" after
  cancellation is a duplicate and the company stays cancelled; the original
  hour-old signature is refused.
- **Concurrency:**
  - 25 rounds × 10 concurrent deliveries of one event: exactly 1 applied;
  - 25 rounds × 4 shuffled concurrent updates: the newest always wins.
- **Out of order:** stale, terminal, a late old checkout, re-binding on a new
  checkout.
- **Unrelated companies:** another subscription's delete or payment failure;
  a mismatched checkout; unknown or malformed company; manual company B
  never touched; `created` for a second subscription does not steal the
  binding; legacy unbound rows bind on their first event.
- **Failed writes:** a mid-transaction failure is 500 and leaves nothing
  recorded, and the retry is applied.
- **Pre-0069b path:** applied, with the tolerance and company checks
  enforced.
- **Migration file:** pinned.

**What the SQL check (25) covers on staging.** The migration runs inside
**one transaction that is always rolled back**. The scenarios run as
`service_role` with service-role JWT claims, as PostgREST does:
- applied, duplicate (one row), newer, stale, Pro upgrade, plan kept on
  payment failure;
- other_subscription, deleted, terminal, re-bind on created, a third
  subscription refused, unknown company, ignored-but-recorded;
- manual company B untouched; no event left `pending`;
- an exception leaves no event row; the `evt_` check constraint holds;
- anon and authenticated may neither execute the function nor read the
  table; service_role may execute;
- **after the rollback, no table, columns or function exist.**

**What the live check (19) covers on staging**, through the local staging
API with synthetic, locally signed events and no Stripe account:
- **Signatures:** fresh 200; day-old, −301 s and +400 s refused; rotation
  with either `v1` valid 200, neither valid refused; tampered body, no
  signature and malformed events refused.
- **Billing, read back from the database:** company B's checkout →
  active/passport/basic, then past_due, payment failed, cancelled.
- **Unrelated companies:** a mismatched checkout is ignored with neither
  company changed; a malformed company id is ignored.
- **Pre-0069b behaviour:** the path is detected as legacy, and the
  duplicate-within-window limitation is shown.
- **Boundary:** Stripe was mock only.
- **Cleanup:** rows and tiers are restored and verified identical.

**Found while testing:** the `company_owner_guard` trigger refuses a tier
change unless `auth.role()` is `service_role` or a platform admin. Through
PostgREST with the service key that holds, so the function works for the
webhook. A direct `postgres` connection without claims would be refused,
which is relevant to anyone running it by hand.

**Isolation inventory.** `stripe_events` carries a `company_id`, so the
combined suite now has a **SERVICE_ONLY** category: anon, company users and
investors must be refused even their own company's rows. Until 0069b is on
staging this reports **SKIP** ("table not on this database"), never a pass.

### What is NOT done (needs approval)

- **Applying 0069b** to staging (then the live suite exercises the 0069b
  path end to end, including concurrent deliveries across real
  connections), and later to production. **Until it is applied,
  de-duplication, ordering and binding are not active anywhere.** The
  tolerance, rotation, shape, company cross-check and retry-on-failure
  changes are active without it.
- **Not run:** Stripe's official library (not installed; would be a new
  download) and live Stripe test-mode delivery.

### Still tracked

- **Known failures:** F8, D21.
- **Next: D22**, reliable press-release publishing (stop for review
  before implementing).
- **Also tracked:** F5, F6, F11, d28, d29, profile drafts/approval/versioning
  (a04, a05), the og-news render skip, the S1 inactive cron row, AI limits
  (§10, unchanged) and `ai_usage_review.sql` (preserved).
- **Deployment order:** D20 before migration 0063; 0069b may go before or
  after the F9 code.

---

## 16 · F9 migration 0069b APPLIED TO STAGING ONLY (2026-10-30), persistent results

**Production: not touched. Nothing pushed, merged, deployed or committed.**

### Preflight (all passed before applying)

| Check | Result |
|---|---|
| Target | The connection names `jmljfovtfxcdhjmtlnva` and not the production ref; the runner's allowlist agrees |
| Database egress | `check:staging-db-egress`: no egress (the one inactive `outbox-drain` row is contained) |
| Guard suite | `staging-db-guard-test --network`: 48 / 48 |
| Plan | The runner listed exactly one file, `0069b_stripe_events.sql` |
| Destructive operations | None: no DROP, DELETE or UPDATE of existing data; `ADD COLUMN … NULL` only |
| Privileges and exposure | Table: RLS on, no policies, all privileges revoked from public, anon and authenticated. Function: `SECURITY DEFINER` with `search_path = public, pg_temp`; EXECUTE revoked from public, anon and authenticated, granted to service_role only |
| Existing subscriptions | Snapshot before applying: 2 rows, 24 entitlement cells (12 granted), 2 tiers |
| Rolled-back dry run | 31 / 31 |

`company_subscriptions` remains readable by that company's members (0005
`owner_read`). They will see their own subscription's Stripe id and status.
That is not a credential, and writes stay admin-only.

**First binding (your point 5): one gap found in review and fixed before
applying.** As first written, the first event for an existing, unbound
company bound whatever subscription it named. A late `deleted` or
`payment_failed` for an **old** subscription carrying the company's id could
therefore cancel the company and set the wrong binding. Now:
- **Dead checkouts:** a checkout for a subscription that is not live never
  binds or replaces anything (`dead_checkout`).
- **First binding by anything but a checkout:**
  1. The function releases its claim and answers `needs_verification`.
  2. The handler asks Stripe for the company's **current** subscription: the
     newest live one, else the newest.
  3. The handler calls again. An event for any other subscription is recorded
     as `unverified_binding` and changes nothing.
  4. If Stripe can't be asked, the first binding is **refused**, never
     guessed.
- **An event naming no subscription** can't be attributed and changes nothing.

### Applying, and a staging-runner defect found doing it

`node scripts/apply-migrations.mjs --from 0069b_stripe_events.sql` committed
the migration, then reported **FAILED** with "SAVEPOINT can only be used in
transaction blocks".

- **Cause:** the file has its own `begin;` / `commit;`. Its `commit` ended
  the runner's transaction, so the runner's **pre-commit** egress check (S1)
  ran after the commit, and its savepoint failed.
- **Scope:** 56 migration files carry their own begin/commit. For all of
  them, that in-transaction check has never been effective since S1. The
  static scan before connecting and the end-state check that refuses a
  database able to reach the network kept working.
- **For 0069b:** the static scan had passed. Afterwards, egress was checked
  and is none, and subscriptions, entitlements and tiers were identical to
  the snapshot.
- **Fixed (staging tooling only):**
  - `runnerBody()` in `scripts/_db-egress.mjs` masks dollar-quoted bodies
    and comments, then strips a file's single top-level begin/commit, so the
    runner's own transaction and pre-commit check govern.
  - Any other transaction control (two transactions, a top-level `ROLLBACK`,
    a bare `END;`) is refused.
  - **Tests:** 7 new offline cases (`staging db guard` now 52 offline, 55
    live).
  - **Live proof:** a harmless own-transaction probe file applied through
    the fixed runner reports "ALL 1 APPLIED. Database egress: none".

### Results on staging (persistent schema)

| Suite | Result |
|---|---|
| `stripe-webhook-sql-check` (applied mode) | **39 / 39** |
| `stripe-webhook-live-test` (the real handler via the local staging API, synthetic signed events) | **41 / 41** |
| `stripe-webhook-test` (offline, in `npm test`) | **81 / 81** |
| Subscriptions and entitlements after all tests | Identical to the pre-apply snapshot except `updated_at` on company B's row, where the live test's restore fired the existing touch trigger. Entitlements identical; tiers identical; no Stripe binding left on any existing row; no test events left in `stripe_events` |
| API suite | **354 / 2 / 1** (KNOWN F8, D21) |
| Combined database + API | **810 / 2 / 1**, 0 unexpected (was 802/2/2). The `stripe_events` SERVICE_ONLY probe moved from SKIP to 8 passing assertions |
| `npm test`, build, live messaging, live Company Memory, staging db guard (live), db egress | all pass (live messaging 54/54) |

**What the database check (39) covers.** Scenarios run in a rolled-back
transaction, so no scenario data persists:
- duplicate, ordering, plan kept on payment failure, other subscription,
  terminal, re-bind, unknown company;
- first binding: `needs_verification` with the claim released, then
  `unverified_binding`, dead checkout, then binding to the proven current
  subscription;
- rollback on exception, then retry;
- privileges for anon, authenticated and service_role.

Real concurrency, committed then restored:
- 5 rounds × the **same event on 8 separate database connections at once**:
  exactly 1 applied, 7 duplicates each time;
- **8 different events with shuffled timestamps on 8 connections**: the
  newest wins;
- exactly one `stripe_events` row per distinct event;
- company A's row and tier restored exactly.

**What the live check (41) covers.** Each step goes through the real
handler, with results read back from the database:
- **Signatures:** tolerance (day-old, −301 s, +400 s), rotation either way,
  tampered, missing, malformed.
- **Billing:** company B's checkout, past_due, payment failed, cancelled.
- **Idempotency and concurrency:** re-binding on a new live checkout; a
  duplicate is 200 `{duplicate:true}`, recorded once; **8 concurrent
  deliveries through the API: 1 applied, 7 duplicates**.
- **Ordering and cancellation:** an older event is stale; payment failed
  keeps Pro; an unbound subscription's delete is `other_subscription`;
  cancellation applies; **replaying the old "active" after cancellation is a
  duplicate**; a new "active" for the canceled subscription is `terminal`.
- **First binding:** an unbound company's unproven delete is
  `unverified_binding`.
- **Failed transactions:** a raising call leaves no event row, and the retry
  is processed.
- **Privileges:** company owners A and B, an investor, a viewer and anon are
  refused SELECT on `stripe_events` and EXECUTE on `stripe_apply_event`.
- **Boundary:** Stripe was mock only.
- **Cleanup:** verified identical.

**Found and fixed during the reruns (D20 code).** The live messaging suite
failed intermittently. Its concurrent-retry key was derived from an earlier
key by replacing the last character with `f`, which collided about 1 run in
16. That exposed a real defect: an idempotency key reused for different text
returned **500** `message-failed`. It now returns **409**
`idempotency-key-reused`, with nothing stored under it. The test uses a fresh
key. Offline (71) and live (54, run twice) tests now assert the 409.

### Remaining limitations

- **Production:** 0069b is not applied there. Production keeps the legacy
  path (tolerance, rotation and company checks active; no de-duplication,
  ordering or binding) until you approve applying it.
- **First binding on staging:** the Stripe mock's subscription search
  returns nothing, so first binding by a non-checkout event is only shown
  refusing (`unverified_binding`). The positive verified path is proven by
  the database check (with an explicit current subscription) and offline.
  It has not run against real Stripe search.
- **Stripe search unavailable** (some accounts, or an outage): a legacy
  company's first non-checkout event is recorded `unverified_binding` and
  not applied. A checkout, or an admin setting
  `company_subscriptions.stripe_subscription_id`, establishes the binding.
- **Search lag:** search is eventually consistent (up to about a minute). A
  brand-new subscription's first event could be refused as unverified if
  search lags. The checkout event binds independently.
- **Not run:** Stripe's official library and live test-mode delivery.
- **Commit:** F9 is uncommitted, per your instruction, until you review
  these results.

### Still tracked

- **Known failures:** F8, D21.
- **Next: D22** (stop for review before implementing).
- **Also tracked:** F5, F6, F11, d28, d29, a04/a05 (drafts, approval,
  versioning), the og-news render skip, the S1 inactive cron row, AI limits
  (unchanged) and `ai_usage_review.sql` (preserved).
- **Deployment order:** D20 before 0063. For 0069b, the code is safe either
  way, and production needs separate approval.

**Before committing F9 (2026-10-30).** The repaired runner was proven live on
staging against a migration that manages its own transaction and builds an
HTTP-capable function at runtime from fragments, so the static scan cannot
see it. The runner found it **inside its transaction**, rolled back and
refused ("added database egress, rolled back"), and the function does not
exist on staging afterwards. Before the fix, that file's own `commit;` would
have committed it ahead of the check, exactly as happened with 0069b.

---

## 17 · D22: reliable publishing and distribution, FINDINGS AND PLAN (2026-10-30, nothing implemented)

F9 was committed as `5b22866` before this work began. This section
**supersedes the §5 proposal**, which was written before the code and staging
were inspected end to end.

### How a release is supposed to reach investors

```
Portal "Publish"  ──► /api/publish (auth, entitlement, actor_can_publish)
                        └─► publish_publication() RPC, ONE transaction:
                              publications.status = published
                              + events(PUBLICATION_PUBLISHED, idempotency key)
                        └─► invokeDispatchBestEffort(req)   (1.5 s, Host header: F5)
/api/revise-release ──► revise_publication() → events(PUBLICATION_REVISED)
                        └─► invokeDispatchBestEffort()      (no req → throws, swallowed: F11)
/api/unpublish      ──► unpublish_publication() → events(PUBLICATION_UNPUBLISHED)

/api/dispatch (x-dispatch-secret) ─► for each listener: claim_deliveries (lease 120 s,
   SKIP LOCKED, creates missing delivery rows) → handle → complete_delivery
   (retry 30 s·2ⁿ, dead after 6)
     feed_projection_v1      → posts            (the investor app reads posts)
     in_app_notifications_v1 → notifications    (needs the post first)
     mineiq_facts_v1         → facts            (AI extraction)
     profile_timeline_v1     → companies.profile.timeline (upsert_timeline_entry)
     device_push_v1          → notification_outbox (NOT subscribed: 0055 deferred;
                                news-push-send hourly, PUSH_ENABLED off)
```

There is no connector for the other destinations (LinkedIn, X, newsletter,
website, push). Comms Center reports them honestly as "pending" (`connectorIsLive`).
That is a missing product (a22), not part of D22.

### Findings (verified in code; staging measured read-only)

| # | Finding | Evidence | Effect |
|---|---|---|---|
| 1 | **No guaranteed trigger anywhere.** Production: 0011's cron is deferred and `vercel.json` has no dispatch cron. Staging: the only cron row is inactive (S1). The only trigger is publish/unpublish's best-effort call (Host header, F5; 1.5 s timeout added to the publish response). **Revise never triggers** (F11: `invokeDispatchBestEffort()` with no `req` throws inside its own try) | code; staging `cron.job` | A release, revision or unpublish reaches investors only if the best-effort call happens to complete. Otherwise it waits indefinitely, while the portal says "Published" |
| 2 | **Staging feed projection fails on every release.** `posts.media_url` (written by `feed_projection_v1`, read by the investor app) exists in no migration; 0009 only backfills from it "if it exists" | staging: feed_projection_v1 **34 dead, 8 failed, 40 succeeded** (the successes are unpublish PATCHes and fixtures), PGRST204 *Could not find the 'media_url' column*; in_app_notifications_v1 **32 dead** ("post not yet projected") | Schema drift: a migration-built database cannot deliver releases. Production probably has the legacy column; **unverified** (audit query 9) |
| 3 | **Silent loss on read errors.** `db.getJson` returns `null` on any HTTP error, and listeners treat `null` as "nothing to do", so the delivery is marked **succeeded** | `feedProjectionV1`, `profileTimelineV1`, `mineIqFactsV1` (`if (!pub) return`) | A transient database error permanently skips the feed post, timeline entry or facts |
| 4 | **device_push silently drops** when the post is not projected yet. Its comment says "the next drain picks it up", but it returns, so the delivery succeeds | `devicePushV1` | Lost pushes once push is enabled |
| 5 | **Mine IQ claim-before-work.** The claim row is inserted before extraction. An AI failure or timeout throws, but the retry finds the claim and returns | `mineIqFactsV1` | One AI failure (or a 60 s function kill) means facts are **never** extracted for that release |
| 6 | **Large follower lists break notifications.** `user_id=in.(…)` grows with followers; a long URL fails, `getJson` gives `null`, and `prefs \|\| []` ignores mute and threshold preferences, so **muted users are notified**. For push, tokens become `[]`, so nobody is pushed | `inAppNotificationsV1`, `devicePushV1` | Correctness and a preference-privacy defect beyond a few hundred followers |
| 7 | **Unpublish is incomplete.** The feed's PATCH result is unchecked, and the timeline entry is never removed (no UNPUBLISHED subscription) | code; 0051 subscriptions | An unpublished release stays on the company's profile timeline |
| 8 | **Backfill storm on the first real drain.** `claim_deliveries` creates deliveries for **every historical event** of a subscribed type | 0008:153-157 | Production's first scheduled drain could run AI extraction on every past release and notify followers about months-old releases. Size unknown (audit query 6) |
| 9 | **Dependency handled two ways.** in_app throws until the post exists, then dies after 6 attempts if the feed is broken; push drops silently | staging dead letters | One upstream failure cascades into permanent loss downstream |
| 10 | **No visibility.** The company sees "Published" immediately; `publishOutcome.js` polls and reports "pending" forever. Dead letters, stuck leases and a stopped dispatcher alert no one; `outbox_health()` is admin-only and unused | code | A paid customer cannot tell their release did not reach investors; neither can MineEx |
| 11 | **No run budget.** Listeners run serially, 20 per batch, with AI calls inside a 60 s function | `api/dispatch.js` | Timeouts mid-run (leases recover, but combined with #5, facts are lost) |

**Kept and sound:**
- event creation inside the state-change transaction, with idempotency keys;
- leased, `SKIP LOCKED` claims;
- backoff and dead-lettering;
- keyed or upserting listeners (feed, notifications, timeline);
- company id always read from the authoritative publication row;
- publish authorization (`actor_can_publish`: owner/admin/publisher/platform admin).

### Read-only production audit (run before approving anything)

`supabase/audit/outbox_review.sql`: 10 statements, verified read-only by
`scripts/audit-sql-readonly-check.mjs`. It answers:
- whether pg_cron or pg_net exist (is there any scheduler);
- which outbox functions and listener subscriptions are present;
- events and deliveries by listener and status;
- **the never-attempted backlog a first drain would process** (query 6);
- orphan publications;
- recent errors;
- the `posts` columns (the drift in #2);
- non-passport publications.

### Implementation plan (phased; each phase has its own approval)

**Phase 1: correctness, code only (no migration, no deployment).**
1. **Strict reads in listeners.** An HTTP error **throws** (retry). "Not
   found" is distinguished from "could not ask".
2. **device_push:** throws until the post exists.
3. **Mine IQ:** on any failure, release the claim (delete the claim row
   before rethrowing). A claim older than 15 minutes with
   `facts_written is null` counts as abandoned and is re-taken.
4. **Followers** read in chunks of 100 ids. A failed chunk throws; never
   "no preferences".
5. **Unpublish:** the feed PATCH is checked.
6. **F5 + F11:** one `selfBaseUrl()` = `PUBLIC_BASE_URL` → `https://VERCEL_URL`
   → none, never request headers. Publish, unpublish **and revise** use it.
   The publish response no longer waits on it (fire and forget).
7. **Dispatcher run budget:** it stops claiming new work after ~45 s and
   reports per-listener counts.
8. **Notification listeners skip stale events:** `occurred_at` older than
   72 h is recorded and not sent. This stops the backfill storm (#8) for
   notifications without a migration.

**Phase 2: migration `0071_publishing_reliability.sql` (prepared, applied to staging only after approval).**
- **`posts.media_url text`, `add column if not exists`.** This is the drift
  fix; a no-op where production already has it.
- **Unpublish removes the timeline entry:** subscribe `profile_timeline_v1`
  to `PUBLICATION_UNPUBLISHED`, plus `remove_timeline_entry(p_company, p_key)`,
  service-role only.
- **`dispatcher_runs`:** a heartbeat (started, finished, claimed, succeeded,
  failed, dead), service-role only, trimmed after 7 days.
- **`ops_alerts`:** one alert per condition per hour, plus a resolved notice.
- **`publication_delivery_status(p_publication)`:** SECURITY DEFINER. It
  returns per-listener status (`delivered` / `retrying` / `failed`) only to
  callers who can see that company's publication (`can_touch_company` or a
  platform admin). Company isolation is enforced in SQL and tested
  cross-company.
- **Mine IQ backfill policy:** `listener_subscriptions.active_from`, so a
  listener only gets deliveries for events after it was enabled. A
  historical AI backfill becomes a deliberate, separate admin action.

**Phase 3: the guaranteed trigger (production change; needs approval).**
- **Vercel Cron every minute** on `/api/dispatch`. The team is on Pro (d15).
- **Authentication:** `dispatch.js` also accepts `Authorization: Bearer
  CRON_SECRET`, constant-time and fail closed.
- **Health:** a `GET /api/dispatch?health` mode returns 503 when the last
  heartbeat is older than 3 minutes. It is folded into the same function (no
  new function), and an external uptime monitor watches it.
- **Fallback if Vercel Cron is not wanted:** pg_cron with the URL **and**
  the secret in `app_secrets` (the S1 lesson: absent means do nothing).

**Phase 4: visibility and operations.**
- **Portal publish confirmation:** reads `publication_delivery_status`:
  "Live in the investor app", "Retrying", or "Delivery failed: MineEx has
  been alerted", instead of polling forever.
- **Alerting:** at the end of each run, thresholds (dead > 0, stuck leases,
  oldest pending > 5 min, orphans, heartbeat age) are recorded in
  `ops_alerts` and emailed to `OPS_ALERT_TO` via Postmark (mocked on
  staging).
- **Mission Control (admin):** health, recent runs, dead letters, and
  **Replay**, using the existing `reconcile_outbox()` / `replay_delivery()`.

**Tests and staging verification** (staging runs the dispatcher through
the local server, because staging has no Vercel cron):
- **Offline:** strict reads (an error retries rather than succeeding);
  push retries until projected; Mine IQ releases its claim on failure;
  chunked followers with mute respected at 1,000 followers; stale events not
  notified; selfBaseUrl never reads headers (F5); revise dispatches (F11);
  run budget.
- **Staging, real database:**
  - publish, then the drain alone → a post, timeline entry and facts (needs
    the 0071 drift fix);
  - a revision projects with no publish;
  - unpublish removes the post and the timeline entry;
  - a forced listener failure → backoff → dead → one alert row (mock mail)
    → replay → succeeded;
  - two dispatchers concurrently on separate connections → no double
    processing;
  - a stopped heartbeat → health 503.
- **Isolation:** company B cannot read A's delivery status; a viewer cannot
  publish (unchanged).

### Decisions needed from you

1. **Run `supabase/audit/outbox_review.sql` in production** and share the
   counts. Query 6 (backlog) and query 9 (posts columns) decide how Phase 2
   and 3 roll out.
2. **Approve Phase 1** (code-only correctness fixes, including F5 and F11).
3. **Approve preparing migration 0071** (drift fix, unpublish timeline,
   heartbeat, alerts, delivery-status function, `active_from`) for staging.
4. **Scheduler:** Vercel Cron (recommended) or pg_cron.
5. **Backfill policy:** skip notifications for events older than 72 h
   (recommended); Mine IQ historical extraction off by default, as an
   explicit admin action.
6. **Unpublish removes the profile timeline entry:** recommended yes.
7. **Ops alert recipient** (`OPS_ALERT_TO`) and an uptime monitor for the
   health endpoint.

**Order of rollout to production (later, with approval):**
1. Run the audit.
2. Apply 0071.
3. Deploy Phases 1, 2 and 4.
4. Enable the cron and watch the heartbeat. The F5 fix ships with Phase 1
   (`selfBaseUrl`), so the D22 drain exists before F5 is relied on.
5. D20 must still reach production before 0063.

### Tracked alongside

- **Coordinated with D22 (Phase 1):** F5, F11.
- **Also tracked:** F6, D21, d28, d29, profile drafts/approval/versioning
  (a04, a05), a07 (runtime proof a release reaches the investor app), the
  og-news skip, the S1 inactive cron row.

---

## 18 · D22 Phase 1: publishing reliability, IMPLEMENTED LOCALLY (2026-10-31, uncommitted, not deployed)

No scheduler created, no production configuration changed, no migration
applied, nothing pushed or deployed. Staging was investigated with read-only or
rolled-back probes; the live tests write only their own marked test rows and
remove them.

### Changes (code only)

- **Strict reads** (`api/_service.js` `getRows`). Every listener read throws
  on an HTTP error, so the delivery retries. A missing dependency throws. Every
  write is checked (`mustWrite`).
- **Feed** (`feed_projection_v1`):
  - the unpublish soft-remove is checked;
  - `media_url` is sent only when the post has one. Press releases now
    project on a database without the legacy column (staging). **Media
    posts still need 0071.**
- **Push** (`device_push_v1`): retries until the feed post exists, instead of
  completing and dropping the push.
- **Mine IQ** (`mineiq_facts_v1`): a claim lifecycle with no schema change.
  - `facts_written = -1` means "running"; `>= 0` means "done" (rows from
    before D22 read as done).
  - A failure **releases** the claim.
  - A claim still "running" after 15 minutes (a killed run) is taken over.
  - A fresh claim held elsewhere means retry later.
  - Supersession writes are checked.
  - The docstring of `extractFacts` ("returns [] on any failure") is wrong:
    `callOpenAITool` throws after 3 internal attempts, which is what made
    claim-before-work lose facts.
- **Followers:** read in pages of 1,000 (PostgREST's cap used to truncate
  silently), preferences and tokens in chunks of 100, writes in chunks of 500.
  Mute and threshold preferences are applied; upserts keep it idempotent.
- **Historical events** (`occurred_at` more than 72 h before processing): no
  in-app notification, no push, no automatic AI extraction. The feed and
  timeline still project. Each skip returns `{skipped:"historical"}` and is
  counted in the dispatcher summary. A current release's retries finish
  within about 32 minutes, far inside the cutoff. **Trade-off:** if no
  dispatcher runs for more than 72 h (possible until Phase 3), releases from
  that gap are projected but not notified.
- **AI backfill** is an explicit admin action:
  - a platform admin calls `POST /api/dispatch {action:"backfill",
    listener:"mineiq_facts_v1", publication_id}`;
  - non-admins get 401 or 403;
  - only Mine IQ can be backfilled.
- **Dispatcher:**
  - a 40 s run budget (no new claim after it; `DISPATCH_BUDGET_MS` overrides
    it for tests);
  - Mine IQ claimed 2 at a time, other listeners 20;
  - repeated claims while batches come back full;
  - the summary reports claimed / ok / failed / skipped / lease_lost /
    budget_exhausted.
- **F5:** `selfBaseUrl()` = `PUBLIC_BASE_URL` (https; http only for loopback)
  → `https://VERCEL_URL` → **none**, never request headers.
  - Used by the dispatch nudge **and** the three news chains (`news-pull`,
    `news-process`, `news-broadcast`, which sent `NEWS_PULL_SECRET` to
    `PUBLIC_BASE_URL || Host`).
  - With no trusted base, internal calls are skipped and the work stays
    queued.
- **F11:** revise-release awaits the nudge with no request object (it threw
  inside its own try before).
- **First correction (newly found, below):** revise-release records the
  original release as revision 1 before the first correction, through the
  same RPC and authorization. The correction becomes revision 2 and emits
  `PUBLICATION_REVISED`.
- **Staging harness and mock** (staging-only):
  - `PUBLIC_BASE_URL` is the harness's own loopback origin;
  - the OpenAI mock returns one tagged fact for `report_facts`;
  - a release carrying `[staging-mock:ai-fail-once]` fails its first
    listener attempt.

### Publishing failures now prevented (verified)

| Failure | Offline | Staging (real database) |
|---|---|---|
| Read error marks a delivery done (feed, timeline, Mine IQ, notifications) | ✓ 4 listeners: 503 → failed → retry succeeds | — (read errors cannot be induced safely on staging) |
| Failed write, including unpublish soft-remove, silently ignored | ✓ failed → retried; persistent → dead with reason | ✓ unpublish removes the post |
| Push dropped when the post is not projected yet | ✓ retries; queued once | — (push not subscribed on staging) |
| One AI failure loses a release's facts forever | ✓ claim released, retry extracts; stale claim taken over; 3 concurrent → 1 AI call | ✓ mocked outage → failed with reason → claim released → retry stores the fact |
| Muted followers notified / pushes vanish beyond a few hundred followers | ✓ 1,250 followers: all minus muted and below-threshold; longest URL < 8,000 chars; replay adds nothing | ✓ the muted follower got nothing |
| A failed preferences read becomes "no preferences" | ✓ failed, nobody notified, retry notifies once | — |
| Surprise notifications and AI cost for old events | ✓ a 30-day event projected, not notified, no AI; a 48 h event notifies; skip counted | ✓ the same, read back from the database |
| Dispatcher killed at its time limit | ✓ budget stops claiming; nothing left half-claimed | — |
| Duplicates under concurrent dispatchers | ✓ 10 × 4 dispatchers: every delivery processed once | ✓ racing nudges + 4 dispatchers: 4 posts, 4 notifications, 4 fact sets |
| F5: Host / X-Forwarded-Host / Forwarded choose where secrets go | ✓ 4 header variants, news chain, fail-safe without a trusted base, http refused, VERCEL_URL fallback | ✓ canary host never contacted |
| F11: revisions never dispatch | ✓ | ✓ |
| **First correction never delivered** | ✓ revision 2, event, feed updated; second correction revision 3; unchanged no-op; 403 for non-publishers | ✓ the corrected headline reached the same feed post and the timeline; Mine IQ reconciled; repeat run → revision 3 |
| Isolation | ✓ an event naming company B projects only onto the publication's company A | ✓ owner of B, viewer, investor refused publish; publisher allowed; no event from refusals |

### Still requires migration 0071 or a scheduler

| Gap | Needs |
|---|---|
| Media posts on a migration-built database (`posts.media_url`) | 0071 A |
| Revision 1 recorded at publish (Phase 1 does it at first correction) | 0071 B |
| **Unpublish leaves the profile timeline entry** (verified on staging) | 0071 C + listener code |
| Backfill guard for a newly enabled listener (Phase 1 covers notifications and AI by event age only) | 0071 D |
| Heartbeat, alerting, dead-letter visibility | 0071 E + Phase 4 |
| Company-visible delivery status ("Live" / "Retrying" / "Failed") | 0071 F + Phase 4 UI |
| **Anything delivered without a nudge** (missed nudges, retries after backoff, a release published while the dispatcher was unreachable) | **Phase 3 scheduler**. Today a failed delivery waits for the next publish anywhere on the platform |
| 66 dead deliveries on staging from before the fix | an admin replay (`reconcile_outbox`) |

`supabase/migrations/0071_publishing_reliability.sql` is **prepared, not
applied, not executed**. It is based on the current 3-argument
`publish_publication` (0036) with 0060's grants. Every part is additive and
the rollback is in the header. The isolation inventory now lists
`remove_timeline_entry` as internal; its probe passes only because the
function does not exist yet.

### Scheduler: Vercel Cron, checked against Vercel's current documentation

- **Plan limits** (Vercel docs, last updated 2026-07-15 / 2026-08-11):
  - Pro: 100 cron jobs per project, **once per minute**, per-minute precision.
  - Hobby: once per day, ±59 min. Unusable for a dispatcher.
  - This project uses 4 of 100.
  - The team plan is **Pro** per the earlier measurement (d15). That was
    not re-verified this session; confirm in the dashboard.
- **Behaviour that shapes the design:**
  1. **No retries, best-effort delivery.** Runs are occasionally missed or
     duplicated, so the outbox's leased, idempotent claims fit. The
     heartbeat must tolerate a missed minute.
  2. **Overlap is possible** if a run outlasts the interval. The 40 s budget
     plus `SKIP LOCKED` claims keep a 1-minute schedule safe.
  3. **Invocations are GET with `Authorization: Bearer CRON_SECRET`.**
     `/api/dispatch` is POST + `x-dispatch-secret` today, so Phase 3 must
     accept that form, constant-time and fail closed.
  4. Crons run only for the production deployment and do not follow
     redirects.
  5. Duration follows the function's `maxDuration` (60 s here).
  6. **Deployment Protection's interaction with cron requests is not stated
     on these pages.** Verify before relying on it.
- **Recommendation:** Vercel Cron `* * * * *` on `/api/dispatch` (Pro). Keep
  pg_cron, with the URL and secret in `app_secrets`, as the documented
  fallback.

### Newly discovered launch blockers

1. **The first correction of every release was never delivered.** Fixed in
   code (Phase 1); 0071 B makes it structural.
2. **Unpublishing leaves the release on the company's profile timeline.**
   Needs 0071 C.
3. **No scheduler: failed or missed deliveries are not retried on their
   own.** Needs Phase 3.
4. **Revised releases can never be deleted** (`release_revisions` is
   append-only, so a cascade from `publications` is refused). Likely
   intended for disclosure records; there is no admin path to retire one.
   Decision needed.
5. **`scripts/listener-test.mjs` defaults to the production project** and
   reads a service key from `.env.import`. It is a legacy live test, not in
   `npm test`, and was not run. Recommend retargeting it to staging or
   deleting it.

### Production audit: what would run, if approved

- **Target:** the production Supabase project `rvptronniomlqumjhyrr`, SQL
  editor, run **by you**. I have no production credentials and connect to
  nothing.
- **Scope:** `supabase/audit/outbox_review.sql`, 10 statements:
  - extensions;
  - outbox functions present;
  - listener subscriptions;
  - events by type;
  - deliveries by listener and status;
  - the never-attempted backlog;
  - orphan publications;
  - the last 20 failures (error text truncated to 120 chars);
  - the `posts` columns;
  - non-passport publications.

  Query 11 (`cron.job`) is commented out and only for if pg_cron exists.
- **Read-only:** every statement is a SELECT over tables or catalogs.
  `scripts/audit-sql-readonly-check.mjs` verifies it mechanically (10 of 10
  read-only; no writes, DDL, `SET`, `DO` or locks). No content or user
  identity is returned.

### Tests

| Suite | Result |
|---|---|
| **New** `publishing-reliability-test.mjs` (offline, in `npm test`) | **80 / 80**; **36 of its 72 original checks fail against the previous code** |
| **New** `publishing-live-test.mjs` (staging) | **39 / 39, run 3 times** (fixture reuse: revisions 2, then 3) |
| `authz-risk-test` | **19 secure, 0 KNOWN** (F5 ×2 and F11 resolved; new fail-safe cases) |
| `mineiq-test` | 76 / 76 (updated for the claim lifecycle and push retry) |
| `npm test`, build | pass |
| API suite | 354 / 2 / 1 (KNOWN F8, D21) |
| Combined database + API | **816 / 2 / 1**, 0 unexpected |
| Live webhook / messaging / Company Memory | 41 / 41, 54 / 54, 97 / 97 |
| Staging db guard (live), db egress | 55 / 55; no egress |

**Staging residue (permanent by design):** one revised `[d22-live]` release
from the first live run, unpublished (append-only history), plus the reused
revision fixture, unpublished between runs.

### Decisions needed

- **Review Phase 1**, then approve the commit.
- **Run `outbox_review.sql`** in production (scope above).
- **Approve 0071** for staging.
- **Phase 3:** Vercel Cron (recommended).
- **Retiring revised releases** (blocker 4).
- **`listener-test.mjs`:** retarget it to staging or delete it.

---

## 19 · D22 Phase 2: migration 0071 review (2026-10-31; NOT applied; uncommitted)

Phase 1 was committed as `4883f2f`. **0071 was not part of that commit.** It
remains an untracked, unapplied proposal. Nothing was applied persistently, no
cron was enabled, and production was not touched.

### Review findings and corrections

| Area | Finding | Result |
|---|---|---|
| `posts.media_url` | `add column if not exists text`: a no-op where production has the legacy column, created where it does not. A different legacy type in production would be kept (audit query 9 shows it) | OK |
| `publish_publication` signature | Staging has exactly one: `(uuid, uuid, timestamptz)` from 0036, SECURITY DEFINER, `search_path=public`, EXECUTE service_role only (0060). **The first draft of 0071 redefined a 2-argument version**, which would have created a stray overload and changed nothing `/api/publish` calls | **Corrected** to the 3-argument version, same settings and grants; verified a single signature after applying |
| Revision 1 at publish | Recorded once from `updates.body` and `content.headline`, `on conflict do nothing`; nothing when the body is empty | OK; the Phase 1 route baseline becomes a no-op once history exists (verified) |
| Unpublish timeline cleanup | **As drafted, subscribing `profile_timeline_v1` to UNPUBLISHED would replay every historical unpublish event**, in arbitrary order. A release unpublished long ago and published again since would lose its **live** timeline entry | **Corrected:** the new subscription carries `active_from = now()`, and the listener re-checks the current status ("published again" is skipped). Verified in SQL and offline |
| Delivery status | **As drafted, "latest event" matched every event sharing the newest `created_at`**, mixing a publish's and an unpublish's deliveries | **Corrected:** exactly one event (newest; `id` breaks ties), with the event type returned. Isolation verified: owner and member of A see it; owner of B and investors see nothing (empty, no existence oracle); anon is denied |
| Heartbeat and alerts | RLS on; no anon/authenticated privileges; service_role writes | OK |
| Newly enabled listeners | `active_from` gates delivery **creation** in `claim_deliveries`. Existing subscriptions keep NULL (unchanged behaviour, verified). A future listener should be added with `active_from = now()` | OK |
| Rollback | **As drafted, rollback was comment text**, and it could not have restored `claim_deliveries` before dropping the column it reads | **Corrected:** `supabase/rollbacks/0071_publishing_reliability.rollback.sql`, outside `migrations/`, restores 0008's `claim_deliveries` and 0036's `publish_publication` **verbatim** before dropping anything. It keeps `posts.media_url` and revision rows. Verified byte-identical function definitions after rollback |
| Existing publications and backlog | No table rewrite and no row change. Revision 1 is written only on future publishes. The UNPUBLISHED subscription creates no deliveries for past events. The feed and other listeners are unchanged. Media posts start projecting on databases without the column | OK |
| 72 h cutoff during an outage | With Phase 1 alone, releases published during a dispatcher outage longer than 72 h are **projected but never notified** | **Corrected in code:** optional `DELIVERY_EPOCH`. Events after it are never historical (late notifications instead of none), and the 72 h rule then only stops backfill of events from before reliable delivery. Set when the scheduler goes live (a production config change, later approval) |

Listener code for Phase 2 (uncommitted; safe before 0071, because until the
subscription exists nothing reaches the new branch):
- `profile_timeline_v1` handles UNPUBLISHED: it removes the entry through
  `remove_timeline_entry`, never the release, and re-checks the current
  status.
- `isHistorical()` honours `DELIVERY_EPOCH`.
- **Order for staging:** this code, then 0071.

### Rolled-back verification on staging: 47 / 47

`scripts/publishing-0071-check.mjs` (`npm run test:publishing-0071`) applies
0071 **exactly as the guarded runner would** (`runnerBody`), inside one
transaction that is always rolled back.
- **Static:** no egress; the runner governs the transaction; no
  DROP/DELETE/TRUNCATE.
- **Schema and authorization:**
  - `media_url` exists and existing posts are untouched;
  - a single 3-argument `publish_publication`, service_role only;
  - `claim_deliveries`, `remove_timeline_entry`, the heartbeat and the
    alerts are service_role only;
  - delivery status: authenticated yes, anon no.
- **Behaviour:**
  - revision 1 at publish, the first correction is revision 2 with its
    event, an empty body records nothing, a backdated publish works;
  - `active_from`: a 30-day-old unpublish is not replayed, while the
    existing feed subscription still sees old events;
  - `remove_timeline_entry` removes exactly one entry and refuses an empty
    key;
  - isolation by role (owner A, viewer A, owner B, investor, anon).
- **The rollback file:** applied in a savepoint, it restores both functions
  byte-identically and removes everything else, keeping `media_url` and the
  revision rows.
- **Afterwards:** no column, function, table or test row persisted; the
  functions are exactly as before.

**Verdict: 0071 (as corrected) is ready to apply to staging**, with your
approval, through `scripts/apply-migrations.mjs` (whose in-transaction
egress check now governs files with their own begin/commit). Not yet
verified: concurrency across committed connections, and the end-to-end
listener path on the persistent schema. Both run after a staging
application (`npm run test:publishing-live`, extended).

### Retiring test publications (append-only respected)

`scripts/retire-test-publications.mjs`: staging only, a dry run unless
`--apply`, and only for publications whose headline starts with a known test
marker. For each:
- unpublish through `unpublish_publication` as the owner (lifecycle and
  outbox stay consistent);
- remove projections (post, notifications, push queue, facts, Mine IQ
  claims, timeline entry);
- **delete** when there are no revisions;
- otherwise **keep** it with its history, marked `content.retired`.
  `release_revisions` is never written.

Applied on staging to the one leftover from the first D22 live run: kept and
marked, 0 revision rows touched. The reused live-test revision fixture is
skipped unless `--include-fixture`. For **production**, the same idea would
be a product feature (an admin "withdraw/retire"), not this script.

### Legacy scripts cannot target production

- **New `scripts/_target-guard.mjs`:**
  - `requireStagingTarget` (no default; production refused; only the
    allowlisted staging project);
  - `requireProductionOptIn` (a production tool runs only when
    `MINEEX_PRODUCTION_TOOL` names that exact script);
  - `requireLiveAiOptIn` (`MINEEX_LIVE_AI=1`).
- **Patched:**
  - `listener-test`, `publish-endpoint-test`, `portal-smoke-test` and
    `spine-test` defaulted to production **and** read a service key from
    `.env.import`. Now they need staging explicitly and never read env files;
  - `privilege-hardening-test` defaulted to production;
  - `mineiq-live-test` loaded every variable from four local env files,
    including production keys, and spent real AI credit. Now it requires an
    opt-in and an explicit key;
  - `import-kingsmen-media` writes to production by design and now needs
    the explicit opt-in.
- **Reviewed and left:** `conference-snapshot` and `gen-argenta-package`
  read published data with the anon key and write nothing.
- **New `scripts/script-target-guard-test.mjs`** (in `npm test`, 20 checks):
  - every script is scanned (no `.env` reads in code; production URLs only in
    6 reviewed files);
  - each guarded script, run with a **clean environment** pointed at
    production and with nothing set, exits 2 before any request;
  - the production tool refuses without its own opt-in, and the live-AI test
    without `MINEEX_LIVE_AI=1`.
  - The detectors were confirmed to flag the old `listener-test` (text match
    only; the old script was not executed).

### Tests

| Suite | Result |
|---|---|
| `publishing-reliability` (offline) | **89 / 89** (new: unpublish timeline removal, "published again" not removed, failed removal retried, DELIVERY_EPOCH) |
| `script-target-guard` (offline, new) | **20 / 20** |
| `publishing-0071-check` (staging, rolled back, new) | **47 / 47** |
| `publishing-live` (staging) | 39 / 39 |
| `npm test`, build | pass |
| API suite | 354 / 2 / 1 (KNOWN F8, D21) |
| Combined | 816 / 2 / 1, 0 unexpected |
| Database egress | none |

### Approvals requested

1. Commit this Phase 2 review work (listener code, guards, retirement tool,
   0071 + rollback as **unapplied** files, tests, docs).
2. **Apply 0071 to staging** (then extend the live suite to the persistent
   schema).
3. Later: the production audit (read-only, pending), Phase 3 scheduler,
   `DELIVERY_EPOCH` and `PUBLIC_BASE_URL` on production.

---

## 20 · D22: 0071 APPLIED TO STAGING; Phase 3 scheduler implemented locally (2026-10-31)

The Phase 2 review work was committed as `af03b93`. **Production untouched.**
No push, merge or deploy; no cron enabled; production audit not run.

### Migration 0071 on staging

- **Target:** the connection names `jmljfovtfxcdhjmtlnva`, not production.
- **Preflight:** no database egress; the runner planned exactly one file.
- **Snapshot before** (`scripts/publishing-snapshot.mjs`, read-only): 8
  publications, 115 events, 295 delivery rows, 8 subscriptions, 2 company
  timelines, 5 posts, 8 revisions, 2 billing rows, plus the entitlement
  matrix.
- **Applied** with `node scripts/apply-migrations.mjs --from
  0071_publishing_reliability.sql` → **"ALL 1 APPLIED. Database egress:
  none."** The repaired runner checked egress inside its own transaction,
  before commit.
- **Snapshot after:** changed **only** `subscriptions` (+1:
  `profile_timeline_v1` / `PUBLICATION_UNPUBLISHED`, `active_from` =
  application time) and `functions` (`publish_publication`,
  `claim_deliveries`). Publications, events, deliveries, timelines, posts,
  revisions, billing and entitlements were identical.
- **Persistent verification** (`publishing-0071-check.mjs --pre <snapshot>`,
  probes in rolled-back transactions): **46 / 46**.
  - **Schema and signature:** `media_url` exists; a single 3-argument
    `publish_publication`.
  - **Grants:**
    - `publish_publication`, `claim_deliveries` and `remove_timeline_entry`:
      service_role only;
    - delivery status: authenticated yes, anon no;
    - heartbeat and alerts: no anon/authenticated access, RLS on.
  - **Behaviour:** revision 1 at publish; the first correction is revision
    2; `active_from` blocks the replay of a 30-day-old unpublish.
  - **Isolation:** owner and member of A see A's status; B and investors see
    nothing; anon is denied.
  - **Rollback file:** exercised in a savepoint, it restores both functions
    byte-identically to the pre-0071 snapshot.

### Persistent staging tests

| Suite | Result | Covers |
|---|---|---|
| `publishing-live-test` (extended for 0071) | **51 / 51, run twice** | Publish → feed → **investor-app anon query** (incl. `media_url`, which failed on staging before); revision 1 at publish; first correction → revision 2, same post, timeline updated, Mine IQ revision 2; **delivery status** (owner/member see it; B and investor empty; anon 401); **heartbeat and alerts** refused to users and anon; `remove_timeline_entry` refused to users; **unpublish removes the post AND the timeline entry** and the post leaves the anon feed; AI failure → retry; 4 concurrent dispatchers, no duplicates; historical event projected, not notified, no AI; publish authorization unchanged |
| `dispatch-scheduler-live-test` (new) | **18 / 18** | See Phase 3 |
| `publishing-0071-check` (applied mode) | 46 / 46 | Above |

**Existing data intact:**
- the 6 non-test publications are unchanged;
- the 2 timelines and the 5 posts match the pre-apply digest;
- the delivery queue is empty (no pending, failed or processing
  deliveries).
- **Billing: one change, not caused by 0071.** The fixture seeder (run by
  the live suite) deletes iso company B's leftover `note='stripe'`
  (cancelled) subscription from earlier webhook tests, by design, so each
  run starts from the same billing state. The manual subscription is
  untouched.

**A transient failure, reproduced clean.** One back-to-back batch degraded:
the combined suite had 43 skips, the form throttle failed open (its
documented policy when the database is unreachable), and one live suite
crashed. Rerun individually, everything passed (combined 816 / 2 / 1). The
cause is not proven; it is consistent with Supabase auth and connection
limits under back-to-back suites.

### Residual staging changes (all marked)

- **0071 objects** (persistent, approved).
- **Retired test publications.** Publishing now writes an append-only
  revision 1, so each live run retires **2** test releases (main flow and
  AI-failure case): unpublished, `content.retired`, history kept. Releases
  that need no text publish with an empty body and are deleted.
  Currently: 6 `[d22-live]` publications, 5 retired, plus the unpublished
  revision fixture.
- **Three new staging-only values** in the gitignored
  `supabase/staging/.api-env`: `STAGING_CRON_SECRET`,
  `DISPATCH_HEALTH_TOKEN` and `OPS_ALERT_TO=ops@mineex-staging.invalid`
  (random values, never printed).
- **66 dead deliveries** from before Phase 1 remain; an admin replay would
  clear them. They now raise the `dead_deliveries` alert, which the
  scheduler test restored afterwards.

### Phase 3: the scheduler (code implemented locally; NOT activated)

**Cron authentication** (`api/_cronAuth.js`):
- **What authenticates a run:** only Vercel Cron's own `Authorization:
  Bearer <CRON_SECRET>` on a GET, compared in constant time. The secret must
  be set and at least 16 characters; unset or short is a refusal.
- **What never does:** the user agent and `x-vercel-cron-schedule` (both
  client-settable).
- **Staging:** the production name `CRON_SECRET` stays forbidden;
  `STAGING_CRON_SECRET` is used instead.
- **Health:** a **separate** `DISPATCH_HEALTH_TOKEN`. A monitoring service
  holding it can read liveness but cannot trigger a run, and the cron secret
  cannot read health.

**Dispatcher** (`api/dispatch.js` + `api/_dispatchOps.js`):

| Request | Purpose |
|---|---|
| GET + cron bearer | scheduled run (`trigger: "cron"`) |
| POST + `x-dispatch-secret` | nudges and manual runs (unchanged) |
| GET `?health=1` + health token | 200 when a run finished in the last 180 s, else 503, with last-run age, last cron age, open alerts and current conditions |

- **Heartbeat:** every run writes a `dispatcher_runs` row (start, finish,
  per-listener summary, alerts). A failed heartbeat write never stops
  delivery.
- **Alerts:** evaluated after every run:
  - `dead_deliveries`, `stuck_leases`, and `backlog_age` (over 300 s);
  - recorded in `ops_alerts`;
  - one email per condition per hour while it holds, one on resolution, to
    `OPS_ALERT_TO` via the existing Postmark path;
  - without `OPS_ALERT_TO`, recorded only, and the run says so.
- **Overlap handling:** claims are leased with `SKIP LOCKED`, the 40 s
  budget fits inside a 1-minute schedule, and every overlapping run records
  its own heartbeat. Vercel documents that runs can overlap, be missed or be
  duplicated, and are never retried. The leased, idempotent outbox handles
  all three, and health catches a stopped schedule.
- **Monitoring of the scheduler itself:** a stopped scheduler cannot alert
  about itself. An **external uptime monitor** polls the health check (every
  minute or two) and pages on 503.

**Vercel plan constraints** (Vercel docs, checked 2026-10-31):
- Pro: per-minute schedules, per-minute precision, 100 crons per project
  (4 used).
- Hobby: once a day, ±59 min. Unusable.
- The team is Pro per d15 (confirm in the dashboard).
- Duration is the function's `maxDuration` (60 s).
- Crons run only for production deployments and do not follow redirects.
- **Open:** how Deployment Protection treats cron requests is not stated in
  the docs. Verify on a protected preview or staging project before relying
  on it.

**Tests:**
- `dispatch-scheduler-test` (offline, in `npm test`): **30 / 30**.
  - **Authentication:** no or wrong bearer; user-agent and schedule headers
    ignored; GET with the nudge secret, POST with the cron bearer, an unset
    secret and a short secret all refused.
  - **Heartbeat:** written every run; a failing heartbeat is non-fatal.
  - **Health:** its own token; the cron secret cannot read it; the health
    token cannot trigger a run; 503 with no run or a stale run.
  - **Alerts:** raise → hold → remind after an hour → resolve → clear;
    stuck leases and backlog detected; no ops address means record-only.
  - **Overlap:** 3 overlapping runs.
  - **Pins:** `vercel.json` has **no** dispatch cron.
- `dispatch-scheduler-live-test` (staging): **18 / 18**.
  - Authentication refusals.
  - **A release published with no nudge was projected by a scheduled run
    alone.**
  - The heartbeat row in the database.
  - The dead-letter alert recorded once with one mocked email to `.invalid`,
    then held.
  - Health 200 with the token and refused without it.
  - 3 overlapping runs, a single post.
  - Cleanup restored alerts and heartbeat rows exactly.

**Activation (needs approval; not done):**
1. Apply 0071 to production (after the read-only audit).
2. Set `CRON_SECRET` (≥ 16 random characters), `DISPATCH_HEALTH_TOKEN`,
   `OPS_ALERT_TO`, `PUBLIC_BASE_URL` and, at go-live, `DELIVERY_EPOCH`.
3. Add to `vercel.json`: `{ "path": "/api/dispatch", "schedule": "* * * * *" }`.
4. Deploy, then watch the heartbeat and health.
5. Configure the external uptime monitor on the health check.
6. Decide the 66-dead-letters equivalent in production (the audit's queries
   5 and 8) **before** the first drain: replay or leave dead.

### Next D22 blockers

1. **Production audit** (read-only; your approval): backlog size (query 6)
   and `posts` columns (query 9) decide the first-drain plan.
2. **Production application of 0071** (approval).
3. **Phase 3 activation:** production env values and `vercel.json` cron
   (approval), plus an external uptime monitor.
4. **Deployment Protection vs cron requests:** verify.
5. **Phase 4:** the portal shows `publication_delivery_status` on the publish
   confirmation; a Mission Control panel for health, dead letters and replay.
6. **Retiring a revised release** in production needs a product decision
   (admin "withdraw"); the staging tool is not for production.

### Tests (this step)

| Suite | Result |
|---|---|
| `npm test` (incl. dispatch-scheduler 30, publishing-reliability 89, script-targets 20) | pass |
| Build | pass |
| API suite | 354 / 2 / 1 (KNOWN F8, D21) |
| Combined | 816 / 2 / 1, 0 unexpected |
| Live: publishing 51 ×2, scheduler 18, 0071 check 46, webhook 41, messaging 54, Company Memory 97 | pass |
| Staging db guard 55; db egress | pass; none |

**Uncommitted:** the Phase 3 scheduler code and tests, the extended live
publishing test, the snapshot tool, the retirement idempotency fix, and the
0071 header status. Awaiting your review.

## 21 · D22 Phase 4: delivery status and delivery operations, IMPLEMENTED LOCALLY (2026-10-31, uncommitted, not deployed)

No migration. Everything uses objects 0071 already created (applied to STAGING
only): `publication_delivery_status()`, `dispatcher_runs`, `ops_alerts`.
No production configuration, no cron, nothing pushed or deployed.

### What a company sees (portal)

- **Publication status and delivery status are separate.** "Live" is the
  release record (the publish committed). "Delivery" is what the outbox did
  afterwards, for each destination: Investor feed, Pro Profile timeline,
  Follower notifications, MineIQ knowledge.
- **States:**
  - **Delivered.**
  - **Pending:** queued, or not picked up yet. Deliveries are created lazily, so
    a destination with no row yet is pending, never delivered.
  - **Retrying:** a failed attempt, retrying automatically.
  - **Failed:** a dead letter. The page says "the MineEx team can see this
    failure and can retry it".
  - **No delivery record:** published more than 24 h ago with no row at all,
    most likely before tracking began.
- **Where it shows:**
  - the publish confirmation (polls every 5 s, up to 3 min);
  - an opened live release (re-polls after a correction);
  - library cards: a chip for Pending, Retrying and Failed only; Delivered stays
    quiet.
- **Isolation is the database's job:** the RPC returns rows only to members of
  the release's company and to platform admins, and its columns carry no error
  text.
- **Files:** `src/lib/deliveryStatus.js` (mapping, fetch),
  `src/portal/publish/DeliveryStatus.jsx`, plus `CreateRelease.jsx`,
  `ReleaseLibrary.jsx` and `publishDrafts.js` (embeds `publications.created_at`).
- **"Delivered" means the destination finished processing.** That includes
  deliberate skips: notifications are not sent for historical or demo releases.

### What a platform admin sees (Mission Control → Delivery Operations)

`api/ops.js` gates every request with `requireAdmin` (401 signed out, 403
everyone else) before any service-role read. The UI is
`src/admin/DeliveryOps.jsx`.

- **Health:**
  - dispatcher running or stalled (the Phase 3 health logic);
  - last successful run (finished, with no listener error);
  - last scheduled run. Staging shows "Not active", which is true: no scheduler
    is enabled anywhere.
- **Outbox:** totals by status, and counts by destination and status.
- **Alerts:**
  - **Acknowledge** records who and when, and pauses reminder emails while the
    alert holds (`evaluateAlerts` keeps the acknowledgement; it is dropped on
    resolution).
  - **Resolve** is refused while the condition still holds.
- **Lists:**
  - Dead letters, Retrying and Pending, by company, paged;
  - History: events newest first, each with all of its deliveries.
- **Detail:** the full internal error, the event, the release, the sibling
  deliveries, and whether a replay is allowed and why.

### Replay rules (no mass redispatch)

- One delivery per request. Lists and `{all:true}` get 400.
  `reconcile_outbox` is never called.
- Dead letters only. A `failed` delivery already retries on its own schedule.
- Never superseded: if the release has a newer event, replay gets 409.
- Requires `confirm: true` and the `updated_at` the admin was shown. The UPDATE
  is a compare-and-set on `status = 'dead'` and that `updated_at`, so a double
  click or a race redispatches once. Tested with 5 and 6 concurrent requests:
  exactly one is accepted.
- Attempts are kept, so a replay buys exactly ONE more attempt.
- At most 10 replays a minute across all admins (429 beyond).
- Audited in `dispatcher_runs` (trigger `replay`: admin, delivery, previous
  state and error excerpt).
  - Interim, no migration. Health now counts only `cron`, `nudge` and `manual`
    rows (`RUN_TRIGGERS`), so an audit row is never a heartbeat.
  - A dedicated audit table belongs with a25.

### D24 · found and fixed: out-of-order delivery re-published withdrawn releases

The feed projection never re-checked the release's current status, so a
`PUBLICATION_PUBLISHED` delivery that ran after the unpublish (a retry, or a
replay) put the withdrawn release back in the investor feed (`removed_at:
null`). Follower notifications then went out about it, because they key off the
post.

A late `UNPUBLISHED` delivery after a re-publish would also hide a live post,
and Mine IQ extracted facts from releases withdrawn before extraction ran.

**Fix** (`api/_listeners.js`), the same rule the timeline listener already used:
- the feed skips PUBLISHED or REVISED events unless the release is published,
  and skips UNPUBLISHED events if it is published again;
- Mine IQ skips releases that are not published.

**Proof:** 8 new offline assertions. 4 of them fail on the committed code,
and all pass with the fix.

### Also corrected

`src/lib/publishOutcome.js` called Supabase Cron "the guaranteed backstop".
There is none (§17); the comment now says so.

### Tests

| Suite | Result |
|---|---|
| `delivery-ops-test` (new, offline, real handler, stub Supabase) | 71/71. Mutation check: removing the compare-and-set fails the race test. |
| `publishing-reliability-test` | 97/97 (+8: out-of-order D24) |
| `npm test`, build | pass |
| `delivery-ops-live-test` (new, staging, real fixture users, local harness) | 45/45; cleanup verified identical (ops_alerts, company A profile; release and run rows deleted) |
| API authz suite | 364 / 2 / 1 (+10 for `/api/ops`; KNOWN F8, D21; 0 unexpected) |
| Combined | 826 / 2 / 1 |
| Live publishing (re-run with the D24 fix) / scheduler | 51/51, 18/18 |

**UI workflow, verified in a browser against staging:**
- **Setup:**
  - A staging bundle (`MINEEX_ENV=staging`; the vite tripwire enforces the
    staging project), served on loopback with `/api` proxied to the staging
    harness. Never the vite dev server.
  - Sessions were obtained server-side from the fixture file; no credential
    passed through the transcript.
- **Company A owner:**
  - the card shows Live and Failed separately;
  - the release shows Delivery: Failed, with each destination;
  - no error text anywhere on the page (checked against the injected error
    string).
- **Platform admin:**
  - health, alerts and counts render;
  - the dead letter's detail shows the internal error;
  - Replay (confirm text checked) leads to "Replayed and delivered.", and the
    list refreshes;
  - Acknowledge records who and when;
  - Resolve while dead letters remain shows the refusal;
  - the empty state and History render.
- **Company user at `/admin`:** "Admins only".
- **Network:** no request to the production project was seen. The bundle does
  contain public demo-image URLs on production storage, used only by demo
  pages, which were not visited.
- **Not verified:** the publish-confirmation screen's live polling through the
  UI. Its component and RPC are exercised on the release screen and in the live
  test, but a full UI publish was not run.

**Found in passing, not fixed (out of D22 scope), D25:** `Publish.jsx` calls
`setHandoff` (lines 81, 84, 99) but never declares it. Leaving the review
screen throws a ReferenceError, and dropping a file on the library would throw
too. This dates from `df931e5`.

### Remaining D22 blockers (all need your approval)

1. **Production read-only audit** (`supabase/audit/outbox_review.sql`, 10
   statements): backlog size and dead letters decide the first-drain plan.
2. **Apply 0071 to production.** Phase 4's RPC, tables and admin page depend on
   it. Without it, the portal says "Delivery status is not available yet" and
   the admin page reports that 0071 is needed (503), with no internals.
3. **Phase 3 activation:**
   - production `CRON_SECRET`, `DISPATCH_HEALTH_TOKEN`, `OPS_ALERT_TO`,
     `PUBLIC_BASE_URL`, `DELIVERY_EPOCH`;
   - the `vercel.json` cron;
   - an external uptime monitor;
   - verification of Deployment Protection against cron requests.
4. **Production dead letters:** decide before the first drain, using the
   admin page one at a time. There is deliberately no bulk replay.
5. **Withdrawing a revised release in production** needs a product decision.
6. **Optional:** a dedicated audit table for replays (with a25), replacing the
   interim `dispatcher_runs` rows.

**Uncommitted:** all of Phase 4. Awaiting your review.

## 22 · a04 / d28 / d29 profile drafts, and D25: IMPLEMENTED LOCALLY, 0072 PREPARED (2026-10-31; uncommitted; 0072 NOT applied)

D22 Phase 4 was committed as `d5dfe07`.

### Approved policy (2026-10-31)

- **Draft** (create, edit, save, preview, discard): the owner, a company admin
  or an editor, plus platform admins.
- **Publish** profile changes **and take a company live**: the owner, a company
  admin, or a platform admin.
- Publishers, analysts and viewers can do neither.
- **Company Memory rebuild** (D23) still saves directly to the live profile
  (unchanged). A draft publish refuses (`live_changed`) if a rebuild changed the
  live editor fields in the meantime.
- **Intentional administrative exception:** the Mission Control concierge
  editor (`src/admin/ProfileEditor.jsx`) still writes the live profile
  directly. This is approved for now.

### Design

Drafts **cannot** live in `companies.profile`: anon holds SELECT on that whole
column (0061b, confirmed on staging).

**Migration 0072** (`supabase/migrations/0072_profile_drafts.sql`, rollback in
`supabase/rollbacks/`):

| Object | What it does |
|---|---|
| `company_profile_drafts` | One draft per company. Holds only `{projects, pp}`, plus a version, the live fingerprint it started from, and who changed it and when. RLS on, with no client grants: service role only. |
| `profile_actor_role()` | The caller's role in the company. |
| `profile_editor_fingerprint()` | md5 of the live `projects` and `pp`. Timeline is deliberately excluded. |
| `load_profile_draft()`, `save_profile_draft()`, `publish_profile_draft()`, `discard_profile_draft()` | SECURITY DEFINER, service role only, and each **re-checks the actor's role**. |
| `company_go_live` | Identical to 0035 except the authorisation line: owner, company admin or platform admin, instead of `owns_company()` (d29). |

**Publish is one function, so one transaction.** It:
1. snapshots the live profile into `company_profile_versions` (0013);
2. replaces **only** `projects` and `pp` on the **current** live row, so
   timeline entries and other services' fields are preserved;
3. appends to `activity_log` (0006);
4. deletes the draft.

**`api/profile-draft.js`:** verifies the session, checks the role as the caller
(fast and explicit), then calls the 0072 function with the verified user as
`p_actor`. Database refusals map to explicit HTTP errors:

| Error | HTTP |
|---|---|
| `forbidden` | 403 |
| `stale_draft`, `stale_base`, `draft_missing`, `no_draft`, `live_changed` | 409 |
| `invalid` | 400 |
| `too_large` | 413 |
| 0072 missing | 503 |

**Portal editor:**
- loads through the route;
- **Save draft** never touches the live profile;
- **Publish changes** (shown only to roles that can publish) and **Discard
  draft**;
- labels for "Live profile", "Unpublished draft" and "Unsaved changes";
- the preview is labelled "Draft preview — not public";
- conflicts are explained, with a Reload action;
- a refused user sees "You can't edit this profile" (d28: no fake "Saved ✓").

The go-live refusal text now names the approved roles.

### d28 notes

`src/lib/publish.js`'s profile write, named in d28, has **no callers**: it is
dead code.

### D25: fixed

`Publish.jsx` declares the handoff state. A file dropped on the library is
passed to `CreateRelease`, which ingests it through `handleFile` (one upload
path, guarded against a double ingest). New check:
`scripts/undeclared-setter-test.mjs`. It scans `src/` for `setX(` calls with no
declaration, and fails on the old `Publish.jsx`.

**Browser test on a staging bundle (company A owner):**
- Opening a release and pressing its back control returns to the library with
  no error; this threw before.
- A file dropped on the library now reaches the upload pipeline; before, it
  opened an empty upload page.

### D26 · NEW, found by the D25 drop test, not fixed (outside this batch)

**Every press-release upload fails on staging** at "Could not save the source
text".
- `storeTranscript()` (`src/lib/sourceTranscript.js`) posts with
  `Prefer: resolution=merge-duplicates`.
- PostgREST runs that as `INSERT … ON CONFLICT DO UPDATE`, which needs UPDATE.
- 0053 revoked UPDATE from `authenticated`, on purpose, because transcripts are
  immutable evidence.

Whether production has 0053 is unknown; the production audit is pending. If it
does, uploads are broken there too.

Likely fix: `resolution=ignore-duplicates`, then read back the existing row. A
client change, no migration.

**Residue on staging (append-only by design):** 2 `documents` rows
(`d25-live-drop-test.txt`) and their 2 failed `extraction_attempts` rows. The
storage objects were removed.

### Tests so far

| Suite | Result |
|---|---|
| `profile-drafts-0072-check` (staging, ONE rolled-back transaction) | **78/78** |
| `profile-draft-test` (offline, real route, stub Supabase) | 66/66; mutation check: admitting editors to publish fails 3 |
| `undeclared-setter-test` | 4/4; fails on the old `Publish.jsx` |
| `npm test`, build | pass |
| API authz suite | 376 / 2 / 1 (+12 for `/api/profile-draft`; KNOWN F8, D21; 0 unexpected) |

**What the rolled-back check proved:**
- permissions: drafts are unreachable by anon and authenticated, even
  directly;
- every role in the approved policy, for load, save, publish, discard and
  go-live;
- the draft never changes the live profile or its `updated_at`, and anon never
  sees it;
- version compare-and-set (stale tab, double first save, a draft that
  disappeared);
- draft recovery on reload;
- a forced mid-publish failure leaves the live profile, the snapshots and the
  draft untouched;
- publish preserves a timeline entry written meanwhile, and every other key;
- a snapshot and an audit row are written;
- `live_changed` when a rebuild altered the live fields;
- discard;
- the rollback file restores 0035's `company_go_live` exactly;
- nothing persisted afterwards.

**Not yet tested** (needs 0072 on staging):
- truly concurrent saves from two connections;
- the route and the editor against the real functions;
- the full browser workflow: draft, preview, publish, unauthorized roles,
  conflict recovery.

**Next:** your approval to apply 0072 to STAGING only. Then live tests, the
browser workflow, and the matrix.

### 22b · 0072 APPLIED TO STAGING ONLY (2026-10-31), persistent results

**Target:** `jmljfovtfxcdhjmtlnva`, via the guarded runner
(`--from 0072_profile_drafts.sql`, 1 file). Database egress: none. Production
is untouched.

**Pre/post snapshot** (`scripts/profile-drafts-snapshot.mjs`, read-only). The
diff is exactly:
- `company_go_live` redefined;
- six functions added. Five are service-role only; `profile_editor_fingerprint`
  is executable by everyone, but it is a pure md5 of its argument and reads no
  table;
- `company_profile_drafts` created, with service-role grants only.

Every company's profile content, status, timeline and editor fields are
unchanged. `company_profile_versions` and `activity_log` are unchanged, and so
are all policies, the anon column grants on `companies`, and the
`companies`, versions and activity grants.

One false alarm: the first compare flagged `updated_at` on both companies. The
compare had matched a JSON ISO string against `String(Date)`; the timestamps
were identical. The tool was fixed to compare instants.

**Applied-mode check** (`--pre` snapshot, rolled back): **77/77**. The rollback
rehearsal restores 0035's `company_go_live` exactly, and was itself rolled back.

**Live test** (`scripts/profile-draft-live-test.mjs`, real fixture users,
staging harness, two DB connections): **61/61**.
- **Roles:** owner, company admin, editor and platform admin load; publisher,
  analyst, viewer, investor and another company get 403; signed out gets 401.
  Saves and discards are refused for the five disallowed roles. Publish is
  refused for editor, publisher, viewer and another company.
- **Simultaneous API saves:** 5 at once; exactly one is accepted, and the
  stored draft is the winner's (no mixed writes).
- **Simultaneous publishes:** 3 at once; exactly one succeeds, with one
  snapshot and one audit row. The timeline entry written meanwhile is
  preserved, and every other key is unchanged.
- **Two connections:**
  - simultaneous first saves: one is created, the other gets `stale_draft`;
  - a save during an open publish **waited about 1.6 s**, then got
    `draft_missing`;
  - simultaneous publishes: one succeeds, the other gets `no_draft`, and only
    the winner writes a snapshot.
- **Company Memory rebuild** (`/api/memory-save`, direct to live as approved)
  succeeds. The draft is then flagged stale, and publishing returns 409
  `live_changed`; the rebuild is not overwritten.
- **Discard** is role-gated and version-checked.
- **Go-live:** editor, publisher, analyst, viewer, another company and an
  investor get `forbidden`; owner, company admin and platform admin are
  admitted.
- **Concierge exception:** a platform admin's snapshot plus direct PATCH still
  works and is immediately live. A company admin's direct PATCH still matches
  0 rows (RLS unchanged), and the portal no longer uses that path.
- **Cleanup:** company A's profile content was restored identically, company B
  was untouched, and no drafts, versions or activity rows were left.

**Browser workflow** (staging bundle, loopback, sessions set server-side):
1. Editor opens the editor: "Live profile"; Save draft is disabled until a
   change; no Publish button.
2. Edits the name: "Unsaved changes", and the preview "Draft preview — not
   public" shows the new name.
3. Save draft: "Unpublished draft", with "The owner or an admin can review and
   publish it". In the database the live profile is unchanged and the draft is
   version 1.
4. Reload: the draft comes back.
5. Stale tab: tab B (still on version 1) saves after tab A. It gets "Someone
   else saved this draft…" with a Reload action, its typed edits are kept, and
   the stored draft stays tab A's version 2.
6. Viewer and publisher see "You can't edit this profile", with no draft
   content.
7. Owner sees the editor's draft and publishes. The confirm dialog appears;
   the notice reads "Published. Investors now see these changes."; anon now
   sees the new name; one snapshot and one audit row exist.
8. Owner edits, saves, then discards: back to "Live profile"; the live profile
   is untouched and the discard is audited.

No new console errors. The editor header now wraps on narrow screens (found in
step 1, fixed).

**Suites:**

| Suite | Result |
|---|---|
| `npm test`, build | pass |
| API authz | 376 / 2 / 1 (KNOWN F8, D21; 0 unexpected) |
| Combined isolation | 876 / 2 / 1 |

The isolation inventory now classifies `company_profile_drafts` as service-only
(its insert probe uses the table's real columns, so a refusal is a permission
refusal) and the five functions as internal.
