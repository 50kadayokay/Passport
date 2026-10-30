# Staging Phase A: local safety and test harness, final results

Written 2026-10-30. Phase A was approved as **local-only**. Nothing was
deployed, pushed, merged or committed. Production (`rvptronniomlqumjhyrr`)
was never contacted: no production database, environment or API. All network
traffic went to the **staging** project (`jmljfovtfxcdhjmtlnva`) or stayed on
this machine (§3). No security fix was implemented. The plan this executes is
`docs/STAGING-API-PLAN.md`.

**What "verified" means here.** The tripwire, the egress guard and the offline
risk tests are verified by execution. The API results come from a **local
emulation of Vercel's runtime** (`scripts/staging-api-server.mjs`) running
against real staging data with the staging service key. They are evidence
about the code. They are not evidence about Vercel, which is what Phase B
tests. Where a result depends on Vercel's behaviour (F5, F12), this document
says so.

---

## 1 · Final counts

| Suite | Command | PASS | FAIL | SKIP |
|---|---|---|---|---|
| **Combined: database + API, one ledger** | `ISOLATION_API_BASE=… node scripts/tenant-isolation-test.mjs` | **709** | **16** (all KNOWN) | **1** |
| ↳ database layer (staging) | same, §1–§6, §8 | 446 | 0 | 0 |
| ↳ API layer (local emulation) | `npm run check:api-authz` | 263 | 16 (all KNOWN, 0 unexpected) | 1 |
| Staging tripwire + egress | `npm run check:staging-guard -- --network` | 94 | 0 | — |
| Offline risk regression | `npm run check:authz-risks` | 3 secure | 9 KNOWN | — |
| All unit suites | `npm test` | exit 0 | — | — |
| Production build | `npx vite build` | succeeds | — | — |

With the staging service key, **112 of the 113 earlier API skips are now
decided.**

**The one remaining SKIP is `og-news` rendering.** `og-news` fetches its font
from `cdn.jsdelivr.net`, which the staging egress guard blocks by design, so
the image can't render. Its *security* property is tested and passes: an
unauthenticated request is admitted and reads only staging `news_public`.
Removing the skip needs a decision (§7, item 8). **Because of that one SKIP,
this run is still not a formal proof.**

**All 16 failures are known:**

| Kind | Ids |
|---|---|
| Vulnerabilities | F2 ×3, F4 ×5, F5, F7 ×2, F8, F9, F12 |
| Functional defects (not authorization) | D20, D21 |

No failure is unexplained.

### What changed in the harness after the key arrived (no assertion weakened)

Every change makes the suite *demand* evidence it previously could not see:

- **Positive-control rule.** A cross-tenant denial now needs the *caller's own*
  control. Any other denial needs *some* control on the route, such as the
  admin's or the secret's. Before this, admin-only and secret routes had
  correct denials parked as SKIP.
- **Admission evidence from the handler's own post-guard path.** `market-pull`
  needed `EODHD_API_KEY=staging-mock` (the call is mocked). `news-broadcast`
  admits, then answers "news_item not found". `messages` admits, then fails
  with "conversation-failed". `submit` admits, then fails with "store-failed".
  The failures that follow are recorded as their own FAILs: D20 and D21.
- **Site Contract checks compared by identity, not bytes.** The body carries a
  `generatedAt` timestamp, so a byte comparison never matched. The probe now
  requires `company.id` = A and no trace of B anywhere.
- **site-manifest has a write control.** A uploads its own manifest, reads it
  back, and B's token must never see it.
- **The seeder resets `submission_throttle`.** Re-runs inside the throttle
  window were meeting limits the previous run had used up.

---

## 2 · Authorization boundaries verified (staging data, local emulation)

| Identity | Admitted | Refused | Result |
|---|---|---|---|
| **Owner A** | Every company route for A; publish, revise and unpublish its own releases | Company B on every company-scoped route, admin routes, secret routes | 43 PASS · 2 FAIL (F2 checkout and F4 compose for B) |
| **Publisher A** (`publisher` role) | Publish A's release; AI routes for A, up to the rate limit | — | 2 PASS · 1 FAIL (F5) |
| **Viewer A** (`viewer` role) | Read and AI routes for A (by design, `owns_company`) | **Publish, revise, unpublish (403 `forbidden`)**; company B | 24 PASS · 2 FAIL (F2 checkout, F4 compose for B) |
| **Owner B** | B's routes | **A's releases (unpublish 404, revise 403)** | 13 PASS · 1 FAIL (F8: revise answers 403 for a real id and 404 for a fake one) |
| **Investor** | Messaging (send admitted) | Every company, admin and publishing route (403/404) | 17 PASS · 5 FAIL (F2 checkout; F4 compose, story-extract, story-fetch) |
| **Platform admin** | Admin routes; checkout for any company (matches the proposed policy) | — | 5 PASS |
| **Anonymous** | Public routes only | Every authenticated route (401); bad Stripe signatures; wrong secrets | 91 PASS · 5 FAIL (F7 ×2, F9, F12, D21) · 1 SKIP (og-news render) |
| **Site tokens** | A's token → A's content and manifest | Revoked, expired, wrong kind, a user JWT, and `?company=` / `companyId=` / `company_id=` / `slug=` naming B: always A's content | 17 PASS |

**Publishing permission holds at the database:** `actor_can_publish` refuses
the viewer and admits the publisher and the owner.

**Database layer:** no cross-tenant read, write, delete or row-reassignment by
any identity on any of the 46 company-scoped tables, the join-scoped children,
company RPCs or private storage. Every one of those denials is backed by a
passing positive control.

---

## 3 · No production or external contact

Evidence:

- **Every run this turn passed through the egress log**
  (`supabase/staging/egress.log`): 2,624 decisions between 19:14 and 19:25.
  The log was cleared at the start of this turn, so earlier Phase A runs are
  covered only by their own whole-run assertions, which also passed.

  | Action | Host | Count |
  |---|---|---|
  | allowed | `jmljfovtfxcdhjmtlnva.supabase.co` (staging) | 2,298 |
  | allowed | the local server itself (`127.0.0.1`) | 15 |
  | **mocked, never sent** | Anthropic 118, OpenAI 48, Postmark 90 (all to `.invalid`), Stripe 30 | 286 |
  | blocked (planned canaries) | `example.com`, `canary.invalid`, `cdn.jsdelivr.net` | 25 |
  | **production, any action** | `rvptronniomlqumjhyrr` | **0** |
  | allowed anywhere else | — | **0** |

- The tripwire refuses production URLs, production keys and live provider keys
  at import (94 tests).

**Outside the egress log:**

- The test harness and the seeder connect directly to **staging** (Auth,
  storage API and the Postgres pooler). Both refuse any non-staging reference.
- **DNS:** `story-fetch` resolved `example.com` and `[::1]` through the system
  resolver before its fetch was blocked. That is a DNS query, not a request,
  and the only non-staging network activity.

---

## 4 · Confirmed vulnerabilities

Every row below is confirmed by execution and **none has been fixed.** The
policy on the right is **proposed**, pending a review of the existing
authorization and billing flows.

| Id | Vulnerability | Confirmed by | Proposed policy / expected behaviour |
|---|---|---|---|
| **F2** | `stripe-checkout` starts a checkout for **any published company** for any signed-in account: owner A for B, a viewer, an investor. `success_url`/`cancel_url` come from the request's `Origin` header | Emulation (3 probes) + offline | Owners and platform admins only; fixed return origin |
| **F3** | `messages` inbound accepts **unauthenticated forged "company" replies** when `MESSAGES_INBOUND_SECRET` is unset, because the inbound path is chosen by body shape | Offline. On staging, with the secret set, all 3 inbound probes refuse correctly | Fail closed when the secret is unset. **Whether production sets it is unknown** |
| **F4** | Paid AI drafting runs for **investors** (`compose`, `story-extract`, `story-fetch`) and for **another company's users** (`compose` for B, as owner A and as viewer A) | Emulation (5 probes) + offline | Only authorized company users, for their own company |
| **F5** | The request's `x-forwarded-host`/`Host` decides **where `DISPATCH_SECRET` and `NEWS_PULL_SECRET` are sent** | Emulation + offline. Staging egress stopped it | Use `PUBLIC_BASE_URL` only. **Whether Vercel lets a client set these headers is unverified (Phase B)** |
| **F7** | `contact` and `conference-inquiry` have **no throttle**: 8/8 posts accepted, each emailing support | Emulation | Reuse `submit`'s throttle |
| **F8** | `revise-release` reveals whether a publication id exists: **403 for a real id, 404 for a fake** | Emulation | Same answer for both (read as the user) |
| **F9** | `stripe-webhook` accepts a correctly signed **day-old event (replay)**, and does not de-duplicate events | Emulation | Reject a timestamp older than 300 s; de-duplicate on `evt.id` |
| **F10** | `story-extract` and `stripe-checkout` check their API key **before** auth (anonymous callers get 500, not 401) | Offline | Check config after auth |
| **F12** *(new)* | The form throttle keys on the **client-supplied** first `x-forwarded-for` value. Changing it resets the limit | Emulation | Key on the platform-verified client IP. **Whether Vercel overwrites the header is unverified (Phase B)** |
| **F6** | No role separation inside a company: any active member, `viewer` included, passes every `owns_company` gate | Code + emulation (viewer admitted to AI routes, refused publishing) | Product decision on what each role may do |

### Functional defects found (not authorization)

| Id | Defect | Evidence |
|---|---|---|
| **D20** | **Investor ↔ company messaging cannot store a message wherever migration 0063 is applied.** `messages.js` upserts with `on_conflict=investor_id,company_slug`; 0063 left only *partial* unique indexes, so PostgREST returns `42P10` | Reproduced directly on staging and through the route. Production has not applied 0063, so it works there today and **will break when 0063 is applied** |
| **D21** | `/api/submit` with `form=contact` writes a `notes` column that `contact_submissions` doesn't have, so every such submission fails with 502 (`PGRST204`) | Staging. Production's tables were created by hand (`_submissions.js` says so) and may differ. Not checked |
| **F11** | `revise-release` never triggers the dispatcher (`invokeDispatchBestEffort()` is called without `req`) | Offline |
| — | The owner's own storage upload is refused unless the `documents`/`media_assets` row exists first | Staging (seeder). Whether the portal's upload flow does this: unverified |

---

## 5 · Recommended security fixes, in priority order

Ordered by **production exposure × ease of exploitation**. Each is a separate
change for your approval. Each comes with its test already written, because
the KNOWN marker comes off in the same change as the fix.

| # | Fix | Why this position | Before approving, check |
|---|---|---|---|
| 1 | **F3: fail closed on inbound messages** when the secret is unset; route inbound on the secret, never on body shape | Lets an outsider put words in a company's mouth inside an investor's inbox. The fix is a few lines | **Read-only check of production's Vercel env:** is `MESSAGES_INBOUND_SECRET` set? If not, set it *before* deploying the fix, or inbound replies stop |
| 2 | **F4: put every paid AI route behind `requireAiCaller` with company context** (compose, story-extract, story-fetch, extract-*, structure-batch, build-from-website) | Sign-up is open, so anyone can spend the AI budget with no kill switch, rate limit or cap | Onboarding and admin concierge flows that call these without a company (`requireAiCaller` already has an onboarding path) |
| 3 | **F2: checkout for owners and platform admins only**; fixed return origin | Billing integrity: a stranger's payment changes another company's tier | Portal billing panel (`src/portal/Portal.jsx:1016`) and the admin billing flow |
| 4 | **F5: `PUBLIC_BASE_URL` only**, required on every deployment | Possibly critical (secret exfiltration), possibly a no-op if Vercel strips the header. The fix is trivial either way | Set `PUBLIC_BASE_URL` on production first |
| 5 | **F12 + F7: throttle on the platform-verified IP**, and add the throttle to `contact` and `conference-inquiry` | Spam relay into the support inbox; header spoofing defeats the existing throttle | Which header Vercel guarantees (Phase B answers this) |
| 6 | **F9: webhook timestamp tolerance + event de-duplication** | Replaying an old "active" event could re-activate a cancelled subscription. Needs a captured signed payload, so the likelihood is low | None |
| 7 | **F8, F10:** answer real and fake ids the same; check config after auth | Information leaks | None |
| 8 | **F6: role-aware company access** | Largest change; needs the product to define what each role may do | A product decision first |

**Functional fixes to schedule alongside (not security):**

- **D20 must be fixed before 0063 is applied to production**, or messaging
  breaks the moment it is.
- D21: check production's `contact_submissions` schema.
- F11: pass `req`.

---

## 6 · What changed (cumulative for Phase A)

### Production code paths (all inert unless `MINEEX_ENV=staging`)

| File | Change |
|---|---|
| `api/_stagingEnv.js` *(new)* | Tripwire. On staging: exact staging URL with no fallback; refuses production keys, production-named service keys, real provider keys, live Stripe, push credentials, `CRON_SECRET`, armed switches and any variable naming production. Also refuses a staging target without the flag. Errors name the variable, never its value. Edge-safe. |
| `api/_stagingEgress.js` *(new)* | Allowlist. Layer 1 wraps `fetch`: allow staging and self, mock and record providers, block everything else, re-check redirects at every hop. Layer 2 wraps `net.Socket.connect`. The log never holds headers, bodies or query strings. Edge-safe. |
| `api/_supabase.js` | Imports the egress module first; on staging, uses the validated config with no fallback. Production resolution unchanged. |
| `api/_service.js` | On staging, reads only `STAGING_SUPABASE_SERVICE_ROLE_KEY`. |
| `src/lib/supabase.js` | A staging bundle throws unless it targets staging. Production fallback unchanged. |
| `vite.config.js` | Refuses a mis-targeted staging build. The dev API loads no `.env*` files on staging. |

### Harness, fixtures, docs

| File | Change |
|---|---|
| `scripts/staging-api-server.mjs` *(new)* | Local Vercel emulation (Node and Edge) built from a clean environment; listens on 127.0.0.1 only; exposes `/__staging/egress` |
| `scripts/staging-api-env.mjs` *(new)* | Builds `.api-env`; captures the staging service key through a hidden prompt and keeps it only after staging confirms it |
| `scripts/_api-routes.mjs` *(new)* | All 37 routes: the guard read from code and pinned against drift, a valid request, admission evidence, an identity matrix. `ENDPOINTS` removed |
| `scripts/api-authz-test.mjs` *(new)* | The API suite. Positive controls; 400/405/5xx never count as denials; egress evidence; KNOWN labels for F*/D* |
| `scripts/authz-risk-test.mjs` *(new)* | Offline regression tests for F2–F5 and F10–F11 |
| `scripts/staging-guard-test.mjs` *(new)* | 94 tests: tripwire, build guard, egress across 7 clients, static coverage, Edge safety |
| `scripts/seed-isolation-fixtures.mjs` | Explicit roles (viewer, publisher); publications reset each run; removed post; join parents; storage objects uploaded as B; real site tokens; CEO contacts on `.invalid`; extra entitlements; news sources disabled; **throttle counters reset** |
| `scripts/tenant-isolation-test.mjs`, `_isolation-targets.mjs` | §7 delegates to the API suite; `posts` hidden-subset assertion; seeded join parents; storage owner control; publisher identity |
| `package.json`, `.gitignore` | New checks in `npm test`; `.api-env` and `egress.log` ignored |
| `docs/STAGING-API-PLAN.md`, `docs/STAGING-HANDOFF.md` | Cross-references; identity table corrected |

### Staging database (staging only)

Fixtures were re-seeded. Roles were corrected. The 4 `news_sources` were
disabled. Throttle counters are reset on each seed. The suite publishes,
revises and unpublishes `iso-` publications and uploads one site manifest for
company A.

---

## 7 · Exactly what needs your approval before Phase B

Phase B is **not started.**

1. **Commit this work** on `portal-work` (no push). A CLI deploy needs a named
   commit. Nothing is committed yet.
2. **Create the Vercel project** `mineex-staging` in the existing team, with no
   Git connection. **Also confirm the team plan** (Hobby or Pro): it decides
   cost, function limits and whether Protection Bypass for Automation exists.
3. **Put the staging service key on that project** as
   `STAGING_SUPABASE_SERVICE_ROLE_KEY`.
4. **Project settings:** Vercel Authentication on for all deployments, a
   Protection Bypass for Automation secret, Cron Jobs disabled, no custom
   domain, region `iad1`, and a Node version that has
   `process.getBuiltinModule` (≥ 20.16 / 22.3). Without it, staging refuses to
   start (fails closed).
5. **Environment:** `.api-env`'s contents with *fresh* secrets, plus
   `MINEEX_ENV=staging` and `STAGING_SELF_HOSTS` set to the deployment host.
   Nothing from production.
6. **Staging Supabase Auth settings:** staging Site URL and redirect URLs,
   sign-ups disabled, an SMTP sink (or Auth email off).
7. **A CLI deploy of that one commit** (`vercel deploy`). The CLI is not
   installed on this machine yet.
8. **The og-news font decision**, which removes the last SKIP. Either allow
   GETs to `cdn.jsdelivr.net/npm/@fontsource/` on staging, or vendor the two
   font files into the repo. Vendoring also removes a third-party dependency
   from production and is the one I recommend, but it is a code change to
   production behaviour.
9. *(Optional)* **Stripe test mode** on staging. This would be the first real
   external call.

**Not Phase B, but needed before fixes 1 and 4:** a read-only look at
production's Vercel environment, to see whether `MESSAGES_INBOUND_SECRET` and
`PUBLIC_BASE_URL` are set. You can do that in the Vercel dashboard. I have not
touched production.

Phase B then answers what the emulation cannot: whether Vercel lets a client
set `x-forwarded-host` (F5) and `x-forwarded-for` (F12), real Edge-runtime
behaviour, and the protection wall.
