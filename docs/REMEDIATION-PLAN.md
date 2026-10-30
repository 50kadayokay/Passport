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
