# Staging API deployment — plan for review

Written 2026-10-30. **This is a plan. Nothing in it has been deployed,
implemented or approved.** It follows `docs/STAGING-HANDOFF.md` §7.

Evidence standard: every statement about a handler comes from reading its code
in this worktree (`portal-work`, at `29de7e9`). Code reading shows what a
handler *should* do. It does not show what it *does*. Only four facts below were
checked at runtime, all through read-only queries against **staging**
(`jmljfovtfxcdhjmtlnva`); they are marked **[runtime]**. Everything else is
**[code]**: still unverified until staging runs it.

Production (`rvptronniomlqumjhyrr`) was not contacted.

---

## 0 · Summary

The safe design is a **separate Vercel project** that is deployed from the CLI
and not connected to Git. It sits behind Vercel Authentication, has cron jobs
disabled, and points only at the staging Supabase project. **Isolation must be
enforced in code**, because Vercel serverless functions have no outbound
firewall: environment configuration can't stop a hard-coded URL. Two small
changes, active only when `MINEEX_ENV=staging`, do the enforcement:

1. **A production tripwire in `api/_supabase.js`.** Today a missing or
   malformed `VITE_SUPABASE_URL` makes the server *silently fall back to
   production* (`_supabase.js:37`). The browser bundle does the same
   (`src/lib/supabase.js:12`). Under staging, any resolved URL that is not the
   staging project must stop the function at import.
2. **An outbound allowlist (`api/_stagingEgress.js`).** It is imported first by
   `_supabase.js`, which every one of the 37 routes reaches. It wraps
   `globalThis.fetch` and `http2.connect`. Only the staging Supabase host, the
   deployment's own host and Stripe **test mode** are allowed through. Each
   provider that takes a live action gets a local mock that records the call.
   Every other host throws and is logged.

On top of that, the test suite needs fixing before its results mean anything.
Code reading shows that the current API section (§7 of
`tenant-isolation-test.mjs`) would report PASS for routes that are not guarded.
It accepts 400 and 405 as denials, sends one fixed body to every route, has no
positive controls, and declares the wrong guard for 9 routes. It also omits 3
routes.

Six security findings came out of the handler trace (§3). Two need a product
decision as well as a fix.

---

## 1 · Runtime facts established this session

| # | Fact | Why it matters |
|---|---|---|
| R1 | `iso-staff-a` has `company_memberships.role = 'owner'` **[runtime]**. The column defaults to `'owner'` (0006) and the seeder sets no role. | The "staff, not owner" identity is a co-owner at membership level. Today it **cannot** test publishing permission or any separation of roles inside a company. Handoff §4 describes it wrongly. |
| R2 | `ai_enabled()` returns `true` on staging **[runtime]**. | The AI guard checks the kill switch *before* auth. With the switch off, every AI route returns 503 to everyone, and auth tests can't run. It must stay on, with providers mocked. |
| R3 | 4 `news_sources` rows are `enabled` on staging **[runtime]**, seeded by 0018/0024 with live RSS URLs. | One call to `news-pull` would fetch live third-party sites. Disable them on staging. |
| R4 | `push_tokens` is empty on staging **[runtime]**. | Push has nowhere to go even if the other push guards failed. Keep it that way: seed only fake tokens. |

One local-machine finding, from file and key names only (no value was printed):
this worktree's `vite.config.js` dev API loads `.env.import`, which holds a
Supabase `sb_secret_` key, a Stripe key (test mode, `sk_test_`), an OpenAI key
and a Stripe webhook secret. It also loads `.env.vercel.local`, which holds an
Anthropic key and a `VITE_SUPABASE_URL` that is **not a supabase.co URL**.
`_supabase.js` treats a value like that as unusable and falls back to
**production**. Which project the `sb_secret_` key belongs to can't be told from
its shape, so this plan treats it as production. **Running `npm run dev`
against staging from this worktree would combine production credentials with
staging targets.** All local staging work must happen in a checkout with none
of these files (§6, Phase A).

---

## 2 · Every handler and the guard it actually uses [code]

37 routable files (the 24 `_*.js` files are helpers that Vercel does not route).
"Declared" is the guard that was listed in `ENDPOINTS` in `scripts/_isolation-targets.mjs`
(removed in Phase A; replaced by `scripts/_api-routes.mjs`).
A ✗ means the declaration does not match the code.

Shared guards:
- `requireFeature` (`_entitlement.js`): verifies the bearer token with Supabase,
  then calls `my_features(cid)` *as the user*. An empty list means 403. This
  covers ownership and paid entitlement in one call.
- `requireAdmin` (`_entitlement.js`): verifies the token, then requires the
  caller's own `profiles.role = 'admin'`.
- `requireAiCaller` (`_aiGuard.js`): env kill switch, then service role
  present, then DB kill switch, then body size, then `requireFeature`
  (or the onboarding path: own company or admin), then a per-user rate limit,
  then a per-company daily cap. Every check fails closed.
- `verifyUser` / `verifyBearer`: authentication only. **No company check.**
- `actor_can_publish(company, actor)` (0008): true for the company owner, an
  active member whose role is `owner`/`admin`/`publisher`, or a platform admin.
- `checkNewsAuth` (`_news.js`): `x-news-secret = NEWS_PULL_SECRET` **or**
  `Bearer CRON_SECRET`. Both comparisons are constant-time and fail closed
  when unset.
- `checkDispatchSecret` (`_service.js`): `x-dispatch-secret`, fails closed.
- `verifySiteToken` (`_siteAuth.js`): hashed `mxs_`/`mxd_` token. The company
  comes from the token alone, and every failure denies.

| Route | Actual guard | Declared | Live actions it can take |
|---|---|---|---|
| `audience-card` | `requireAiCaller`, `company_memory` | open ✗ | Anthropic |
| `build-from-website` | `requireAdmin` | admin | Jina reader (fetches a **live company website**), Anthropic/OpenAI through `_extractProfile`/`_imageIngest`, service-role PATCH of `companies.profile` |
| `comms-generate` | `requireFeature`, `communications_center` | user | OpenAI |
| `compose` | `verifyBearer` only. Reads go through RLS as the user | user | OpenAI. **Any signed-in account, investors included, can run it** |
| `conference-inquiry` | **none** (public form), **no throttle** | open | Postmark to `CONFERENCE_INQUIRY_TO`, otherwise the hard-coded `support@mineex.ca`; service-role insert |
| `contact` | **none**, **no throttle** | open | Same as above (`CONTACT_TO`) |
| `dispatch` | `DISPATCH_SECRET` | secret | Five listeners: feed, in-app notifications, Mine IQ facts, **`device_push_v1` (queues push rows)**, timeline. Database writes only |
| `extract-company` | admin **if no companyId**, otherwise `requireFeature` `company_memory` | admin ✗ | Anthropic, **outside the AI guard** |
| `extract-docx` | `requireFeature`, `company_memory` | user | None (parses locally) |
| `extract-projects` | admin or feature, as `extract-company` | admin ✗ | Anthropic, outside the AI guard |
| `extract-text` | admin or feature | admin ✗ | Anthropic, outside the AI guard |
| `market-pull` | `checkNewsAuth` | secret | EODHD; writes `quotes` |
| `messages` | **send:** its own `authUser()`, any signed-in user. **inbound:** `MESSAGES_INBOUND_SECRET` **only when set** | user ✗ (two modes) | Postmark outbound to the company's CEO address |
| `news-broadcast` | `checkNewsAuth` **or** `requireAdmin` | admin ✗ | Queues push for every follower, then calls `news-push-send` on `PUBLIC_BASE_URL` or the request's Host |
| `news-notify` | `checkNewsAuth` | secret | Queues `notification_outbox` |
| `news-process` | `checkNewsAuth` | secret | OpenAI, follows live article URLs (`redirect: follow`), Yahoo Finance, can auto-create companies, chains to `news-notify` |
| `news-pull` | `checkNewsAuth` | secret | Fetches RSS feeds from `news_sources`, optional proxy, chains to `news-process` |
| `news-push-send` | `checkNewsAuth` + `PUSH_ENABLED === "true"` | secret | **APNs (http2) and FCM to real devices** |
| `news-review` | `requireAdmin` | admin | None |
| `news-usage` | `requireAdmin` (no method check) | admin | None |
| `og-news` | **none** (GET image) | open | jsdelivr font fetch; anon read of `news_public` |
| `publish` | `verifyUser`, then RLS read of the publication, `my_features`, the destination's feature, then the RPC's `actor_can_publish` | user | Publishes; the dispatcher call goes to the request's **Host header** |
| `revise-release` | `verifyUser`, then a **service-role** existence read, then the RPC's `actor_can_publish` | user | Revises a published release |
| `share-news` | **none** (GET page) | open | Anon read of `news_public` |
| `site-content` | site/draft token, GET | — **missing** | None (inbound read) |
| `site-manifest` | site token, GET/PUT | — **missing** | Writes `company_blueprints` |
| `story-extract` | `verifyUser` only; **the API-key check runs before auth** | user | Anthropic. **Any signed-in account**, outside the AI guard |
| `story-fetch` | `verifyUser` only | user | Server-side fetch of **any public URL** (DNS check, no redirects) |
| `stripe-checkout` | key check, then `verifyUser`, then "the company row is visible to the caller" | user ✗ (not an ownership check) | Stripe Checkout session |
| `stripe-portal` | key check, then `verifyUser`. Customer found **by email** | user | Stripe Billing Portal session |
| `stripe-webhook` | HMAC signature (fails closed) | secret | Writes `company_subscriptions` and `companies.tier` |
| `structure-batch` | admin or feature | admin ✗ | Anthropic, outside the AI guard |
| `structure-release` | `requireAiCaller`, `company_memory`, onboarding allowed | user | Anthropic |
| `submit` | **none** by design; honeypot + IP throttle | — **missing** | Service-role insert |
| `synthesize-profile` | `requireAiCaller`, `company_memory`, onboarding allowed | admin ✗ | Anthropic |
| `unpublish` | `verifyUser`, then RLS read, then the RPC's `actor_can_publish` | user | Unpublishes |
| `verify-source` | `requireFeature`, `company_memory`, then `userRpc` as the user | user | None |

**Tally:** 9 declarations are wrong (audience-card, extract-company,
extract-projects, extract-text, structure-batch, synthesize-profile,
news-broadcast, messages, stripe-checkout) and 3 routes are missing
(site-content, site-manifest, submit). That leaves **37 routes, not 34**.

---

## 3 · Security findings from the trace [code; staging will confirm or refute]

Ranked by impact. None has been exercised at runtime.

**F1 · Production fallback (server and browser).** `_supabase.js:37,58` and
`src/lib/supabase.js:12` use the production project whenever the URL setting
is missing or invalid. For staging that is the single most likely way to touch
production by accident. *Fix:* the tripwire in §0.

**F2 · `stripe-checkout` does not check ownership.** "Ownership" means the
caller can read the `companies` row. Published companies are publicly
readable, so any signed-in account can open a Checkout for any published
company. Payment would then upgrade that company through the webhook.
Separately, `success_url` comes from the request's `Origin` header. *Expected
staging result:* A→B checkout with a valid `tier` returns **200 (FAIL)**. The
current suite reports a false PASS here because it sends no `tier`, which
returns 400.

**F3 · `messages` inbound accepts anyone when the secret is unset.**
`messages.js:169` skips the check if `MESSAGES_INBOUND_SECRET` is empty. A
request is treated as inbound when its body *contains* `MailboxHash`, so any
caller can post a forged "company" reply into a known conversation. The
sender check only compares the JSON `From` field, and is skipped when
`ceo_email` is null. **Whether production sets this secret is unknown.** I did
not look, and production is out of scope.

**F4 · Paid AI outside the AI guard.** `story-extract` and `compose` need only
*any* signed-in account (sign-up is open through the investor app).
`extract-company`, `extract-projects`, `extract-text`, `structure-batch` and
`build-from-website` call Anthropic/OpenAI with no kill switch, no rate limit
and no daily cap. `requireAiCaller` already does all three for three routes.
Product question: should investors be able to run `compose` or `story-extract`
at all?

**F5 · The Host header picks where secrets are sent.**
`invokeDispatchBestEffort` sends `DISPATCH_SECRET` to
`${x-forwarded-host || host}/api/dispatch`. `news-broadcast`, `news-pull` and
`news-process` send `NEWS_PULL_SECRET` to `PUBLIC_BASE_URL || host`. If
Vercel passes a client-supplied `x-forwarded-host` through, an attacker who can
reach `publish` could receive the dispatch secret. I believe Vercel overwrites
that header, but I have not confirmed it, **and it has not been tested.** The staging
egress log tests it directly (§5, test H1). *Fix in any case:* use a fixed
`PUBLIC_BASE_URL`, never request headers.

**F6 · No role separation inside a company.** `owns_company()` (0006) is true
for *any* active member, whatever their role. So a `viewer` or `analyst`
passes every `can_touch_company` policy, including reading
`site_credentials.token_hash`. **Matrix row d07 says "NOT ordinary members".
That is wrong** and is corrected there. Publishing is the one place role is
enforced (`actor_can_publish`), and the fixture defect R1 means nothing tests
it yet.

Lower severity: `contact` and `conference-inquiry` have no throttle (`submit`
has one), which makes them a free email relay into the support inbox.
`revise-release` reveals whether a publication exists, because its read uses
the service role (404 vs 403). It also calls `invokeDispatchBestEffort()`
without `req`, which throws silently, so a revision never triggers an
immediate dispatch. `story-fetch` checks DNS and then fetches, which leaves a
DNS-rebinding window. `stripe-webhook` has no timestamp tolerance and does not
de-duplicate events. `stripe-portal` finds the Stripe customer by email, not
by company. `publish`, `unpublish`, `revise-release` and `stripe-checkout`
insert IDs into PostgREST URLs without encoding; the reads run as the user,
so RLS still applies.

---

## 4 · Isolation guarantees, and what enforces each one

| Must not reach | Primary control | Second, independent control |
|---|---|---|
| **Production Supabase** (DB, auth, storage) | The tripwire: when `MINEEX_ENV=staging`, a resolved URL other than `https://jmljfovtfxcdhjmtlnva.supabase.co` throws at import. The fallback is disabled. The browser build fails without the variable. | The egress allowlist blocks `rvptronniomlqumjhyrr.supabase.co` and logs the attempt. No production key exists in the staging Vercel project, and keys can't cross projects anyway. |
| **Production storage** | Storage sits behind the same Supabase host, so the controls above cover it | Staging buckets hold only `iso-` fixtures |
| **Live company websites** | Egress allowlist: `r.jina.ai`, arbitrary story-fetch URLs, RSS feeds and article URLs are all blocked or mocked | The 4 `news_sources` disabled on staging (R3). Crons disabled. `site_credentials` tokens are staging-only, so a live site's token is unknown to staging. Since a15 (S2, 2026-11-01) `api/_siteRevalidate.js` POSTs a signed revalidate to a company's configured https hook after a website delivery. On staging a recording mock transport answers and the egress guard blocks company hosts, so no real call leaves. |
| **Investor notification channels** (push, email) | Push: no APNs/FCM credentials in the project, `PUSH_ENABLED` unset, `http2.connect` blocked, `0055` excluded | `push_tokens` empty (R4). Email: Postmark mocked. The Supabase Auth email sender is pointed at a sink or turned off (Auth sends real email on its own, outside our code). |
| **Real publishing** | Publishing writes only to the staging DB. Listeners are DB-only, and push is blocked above. | No custom domain. `mineex.ca` is never used. Deployment Protection keeps the staging UI private. |
| **Real money** | Stripe allowed only with a key matching `^(sk\|rk)_test_` (checked at import). Live keys throw. | The webhook secret comes from a test-mode endpoint. Test mode cannot charge a card. |
| **Paid AI** | Anthropic/OpenAI mocked by default | Optional, separately approved "live AI" tier: dedicated keys with provider-side hard budget caps |

**Why code and not configuration.** Hard-coded hosts include
`api.anthropic.com` (10 files), `api.openai.com` (3), `api.postmarkapp.com`
(3), `api.stripe.com` (3), APNs/FCM, `r.jina.ai`, EODHD, Yahoo, jsdelivr and
`passport-xi-five.vercel.app` (Stripe's return-URL fallback). None of them can
be redirected with an environment variable. Leaving a key unset protects some
routes but not others: `story-extract`, `stripe-checkout` and `stripe-portal`
then fail with 500 *before* their auth check, so the suite would be testing
configuration rather than guards. Mocks let every route run its real guard
while nothing real happens.

### Every external service that can take a live action

| Service | Reached from | Staging treatment |
|---|---|---|
| **Supabase production** | Fallback in `_supabase.js` and `src/lib/supabase.js` | Blocked: tripwire plus allowlist |
| **Stripe** | `stripe-checkout`, `stripe-portal`, `stripe-webhook` | **Sandboxed**: real Stripe test mode, `sk_test_` enforced, test-mode price IDs, test webhook endpoint. Using Stripe test mode, not a mock, lets checkout run end to end |
| **Postmark** outbound | `messages`, `contact`, `conference-inquiry` | **Mocked**: the allowlist answers `200 {MessageID}` and logs recipient and subject. `POSTMARK_SERVER_TOKEN=staging-mock` |
| **Postmark** inbound | `messages?secret=` | Not connected; nothing points Postmark at staging. Tested by posting signed and unsigned payloads directly (F3) |
| **APNs** | `news-push-send` (http2) | **Disabled** four ways: no credentials, `PUSH_ENABLED` unset, `http2.connect` blocked, no tokens. A positive push test, if wanted, would use a mocked http2 session that is never a real Apple host |
| **FCM** | `news-push-send`, `_fcm.js` (plus `oauth2.googleapis.com`) | **Disabled**: no credentials, unset switch, allowlist blocks both hosts |
| **Anthropic** | 10 files | **Mocked**: a fixed, schema-shaped response per route label. `ANTHROPIC_API_KEY=staging-mock` |
| **OpenAI** | `_openaiExtract`, `_newsAI`, `comms-generate`, `compose` | **Mocked** the same way. `OPENAI_API_KEY=staging-mock` |
| **Jina reader** | `build-from-website` | **Mocked** with fixture markdown. It would otherwise read live company sites |
| **Arbitrary URL fetch** | `story-fetch`, `_newsAI.fetchArticleText`, `news-pull` | **Blocked**, except a fixture host served by the mock, so the story-fetch SSRF checks can still be tested |
| **EODHD / Yahoo Finance** | `market-pull`, `_newsAI` | Mocked. Read-only, but blocked by default |
| **jsdelivr** | `og-news` font | Allowed (static public asset, read-only) or vendored. Your call |
| **Site Contract** | `site-content`, `site-manifest` | Inbound only, so nothing to mock. Tested with staging-minted `mxs_`/`mxd_` tokens. Never configure a live site's build with a staging token |
| **Dispatch / news chaining** | Calls back to the deployment itself | Allowed only to the deployment's own `VERCEL_URL`. Any other host is blocked and logged (test H1) |
| **Supabase Auth email** | Supabase itself, not our code | Sign-ups disabled on staging, plus custom SMTP to a sink (or Auth email off) |
| **Vercel Cron** | `vercel.json` | Crons disabled in project settings and `CRON_SECRET` unset, so a cron request gets 401 |

---

## 5 · How the 34 skipped assertions run, and why the suite changes first

`ISOLATION_API_BASE` does unlock the 34. But read against the code, the
current §7 logic would produce results that cannot be trusted:

- **400 counts as "denied".** `stripe-checkout` with no `tier` returns 400
  before any auth runs, so it records PASS while F2 sits behind it.
- **POST only.** `site-content` is GET-only, and a 405 counts as a PASS for anon.
- **One body for every route.** Most routes reject `{companyId, company_slug,
  publicationId}` as malformed before reaching their guard.
- **No positive control.** A route that refuses *everyone* passes every
  denial check. Owner A must succeed against A before A→B denial means
  anything.
- **Wrong declarations** (§2) and **3 routes missing**.
- **Deployment Protection** returns 401 to every request without a bypass
  header, which would turn all 34 into false PASSes. The suite must send
  `x-vercel-protection-bypass`, and must check it reaches the function by
  requiring a known 2xx first.

**What the suite becomes:** a per-route table, `API_ROUTES` in
`_isolation-targets.mjs`. Each route gets a **valid request fixture**
(`method`, `body(ids)`, `headers`), an **actual guard class**, and an
**expected status per identity**. Each route then runs:

| Probe | Identity | Expected |
|---|---|---|
| P0 reachability | anon on `og-news` | 200 (proves the bypass header works) |
| P1 unauthenticated | anon | exactly 401 (or a documented 200 for the 5 public routes) |
| P2 positive control | owner A → A, a valid request | 2xx. **Without this, P3 is reported as SKIP, not PASS** |
| P3 cross-tenant | owner A → B, same request | 403 or 404, exact, **never 400** |
| P4 wrong role | investor → A | 403 for company routes |
| P5 staff role | staff A → A, after R1 is fixed (role `viewer`) | 403 on `publish`, `unpublish`, `revise-release`; 2xx on read routes |
| P6 admin | admin → any company | per class: `requireAdmin` allows, `owns_company` RPCs deny |
| P7 secret routes | no, wrong-length, wrong-value and correct secret | 401, 401, 401, 2xx |

That makes about 37 × 5 identity probes plus the secret matrix. Afterwards,
**34 SKIP should become at least 180 decided assertions, all with a positive
control**, and none decided by a 400.

**Scenario tests** that the route matrix can't express:

- **H1, Host header:** `publish` with `x-forwarded-host: canary.invalid`.
  PASS if the egress log shows the dispatch call went to the deployment's own
  host, and no request to `canary.invalid` was attempted (F5).
- **M1–M3, messages inbound:** an unsigned `MailboxHash` post with the secret
  set must give 401. With the secret unset it shows F3. An investor sending
  `MailboxHash` in a send body must not create a `sender='company'` row.
- **S1–S3, Stripe:** A→B checkout with a valid tier (F2). A webhook with a
  bad signature or no secret gives 400. A replayed signed event with an old
  timestamp shows the missing tolerance.
- **T1–T6, Site Contract:** site token reading drafts, draft token PUTting a
  manifest, revoked, expired, cross-company, and a `?company=` parameter
  ignored. `scripts/site-contract-test.mjs` already covers these with an
  injected store. Staging runs them against the real table.
- **A1–A3, AI abuse:** investor calls `story-extract` and `compose` (F4
  policy). With `AI_CALLS_PER_WINDOW=3` set on staging (the default is 200
  per 10 minutes), the 4th call gives 429. A body over the limit gives
  413 before any provider call, confirmed in the egress log.
- **E1, egress:** after the whole run, the egress log must contain **zero
  blocked attempts other than the planned canaries**, and zero attempts to a
  production host.

Expected FAILs, **predicted from code and so far unverified**: F2 (S1), F3
(M2, if the secret is unset), and F4 (A1, unless the policy is "any signed-in
user").

---

## 6 · Implementation sequence

Each step ends at a gate. Nothing moves to the next step without your approval.

**Phase A — local, no deployment, $0**
1. Fix the seeder: give `iso-staff-a` an explicit `role='viewer'` and add a
   `publisher` identity. Seed the 7 cheap skips (4 parent rows, 2 storage
   objects, Company B `post_events`), a draft publication per company, a
   conversation with a `ceo_email` on `.invalid`, and fake push tokens only if
   a push test needs them. Disable the 4 `news_sources` (staging only).
2. Write `_stagingEgress.js`, the tripwire, and the `loadServerEnv` guard
   (refuse to load `.env.import` or `.env.vercel.local` when
   `MINEEX_ENV=staging`). Unit-test them: production URL, a garbage URL, a
   `sk_live_` key, a blocked host and http2 must all throw.
3. Rewrite §7 of the suite with the route table, positive controls and the
   bypass header. Add `site-content`, `site-manifest` and `submit`.
4. Run the handlers **locally** against staging, in a **fresh checkout with no
   `.env*` files**, with only a staging env file loaded. This is a cheap dry
   run, not proof: the Vite shim does not populate `req.query` (noted in
   `_siteAuth.js`), so `messages` inbound (`req.query.secret`) behaves
   differently here than on Vercel.
   **Gate A:** egress log clean, tripwire proven, the suite runs end to end.

**Phase B — Vercel staging project (needs approvals 1–4)**
5. Create the project `mineex-staging` in the existing team: **no Git
   connection**, region `iad1`, Vercel Authentication on for all deployments,
   Protection Bypass for Automation secret generated, Cron Jobs disabled, no
   custom domain.
6. Set the environment (production environment of *that* project only):
   `MINEEX_ENV=staging`, `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (staging),
   `SUPABASE_SERVICE_ROLE_KEY` (**staging** project), `DISPATCH_SECRET` and
   `NEWS_PULL_SECRET` (fresh random values), `MESSAGES_INBOUND_SECRET` (fresh),
   `STRIPE_SECRET_KEY` (`sk_test_`), test `STRIPE_PRICE_*`, a test-mode
   `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/
   `POSTMARK_SERVER_TOKEN`/`MESSAGES_FROM_EMAIL` set to mock sentinels,
   `PUBLIC_BASE_URL` set to the staging URL, and `CONTACT_TO`/
   `CONFERENCE_INQUIRY_TO` set to a `.invalid` address.
   **Deliberately unset:** `CRON_SECRET`, `PUSH_ENABLED`, every `APNS_*` and
   `FCM_*`, `EODHD_API_KEY`, `JINA_API_KEY`, `NEWS_PROXY_URL`,
   `NEWS_AUTOCREATE_ENABLED`, `NEWS_AUTO_APPROVE_ENABLED`.
7. Supabase staging Auth: Site URL and redirect URLs set to the staging
   domain, sign-ups disabled, SMTP sink, no OAuth providers.
8. Deploy one named commit with `vercel deploy` from a clean checkout. Record
   the commit SHA and deployment URL.
   **Gate B:** a smoke test proves the tripwire is live on the real runtime
   (a deliberately mis-set preview deployment must 500 at import), and
   `og-news` returns 200 through the bypass.
9. Run the full suite. Expect the predicted FAILs.
   **Gate C:** review the results with you. Fixes for F1–F6 are separate,
   individually approved changes. None is part of this plan.

**Phase C — Portal UI end to end (later)**
10. Build the UI with the staging `VITE_*` values (the build fails without
    them) and deploy it in the same project, so UI and API share one origin.
11. Playwright, logged in as each fixture identity through the bypass, runs
    the matrix workflows: profile edit, release ingest and publish, unpublish,
    revise, media, messaging, Stripe test checkout with card `4242…`, and the
    Site Contract fetch. The egress log is an assertion in every test, so a
    UI test fails if it causes an outbound call that was not mocked.
12. Re-seed between runs with `seed-isolation-fixtures.mjs`, which is
    idempotent. A full reset reruns the migration replay.

---

## 7 · Approvals I need from you

1. **The staging `service_role` key in a Vercel project.** The handoff kept it
   out on purpose. The API's service-role routes can't run without it. It is
   scoped to the staging project only.
2. **A new Vercel project in the existing team.** Also confirm the plan: the
   comment in `messages.js` mentions the "Hobby 12-function cap", but
   production has 37 functions and hourly crons, which suggests Pro. **I could
   not verify which plan the team is on.** That decides the cost line and
   whether Protection Bypass for Automation is available.
3. **Code changes** limited to staging-gated paths: `_stagingEgress.js`, the
   tripwire in `_supabase.js` and `src/lib/supabase.js`, the guard in
   `vite.config.js`, the suite rewrite and the seeder fix. With
   `MINEEX_ENV` unset, production behaviour is unchanged except in one place:
   the server fallback logs louder.
4. **A Stripe test-mode webhook endpoint** pointing at the staging URL.
5. **Policy decisions:** may investors call `compose` and `story-extract` (F4)?
   Should `stripe-checkout` require owner or admin (F2)?
6. **Optional:** a "live AI" tier with dedicated, hard-capped keys.

---

## 8 · Estimated costs

| Item | Monthly |
|---|---|
| Supabase staging (Free org, already exists) | $0. Pauses after ~7 days idle; un-pausing is manual |
| Vercel staging project on an existing Pro team | $0 base. Function and bandwidth use for test runs should stay well inside included usage. **Unverified until the plan is confirmed** |
| Stripe test mode | $0 |
| Postmark, Anthropic, OpenAI, Jina, APNs/FCM | $0 (mocked or disabled) |
| Optional live-AI tier | Capped at whatever you set; suggest $10–20 |
| **Total** | **$0 baseline; ≤ $20 with live AI** |

---

## 9 · Operational risks

| Risk | Mitigation |
|---|---|
| A required env var is forgotten and the code falls back to production | The tripwire makes this an import-time 500, never a silent connection |
| A Preview deploy inherits production environment variables | Separate project; never use Preview deployments of the production project for staging |
| Git auto-deploys an unreviewed branch | No Git connection; CLI deploys of named commits only |
| A new handler adds an un-mocked provider | Unknown hosts throw. The E1 assertion fails the run |
| Someone runs the local dev API with production `.env` files | `loadServerEnv` refuses them when `MINEEX_ENV=staging`; Phase A uses a fresh checkout |
| Staging tokens leak into a live site build | Staging `mxs_` tokens are seeded for `iso-` companies only and never written to `sites/` |
| The staging DB pauses | The suite's preflight already fails loudly on an unreachable project |
| Schema drift: staging applies migrations that production does not (handoff §3) | A staging PASS proves the *staging* schema. Every result is labelled with the migration set it ran against |
| Mocks hide real provider failures | Mocks test authorization, not provider integration. The optional live-AI tier and Stripe test mode cover integration |
| False confidence from code that exists | Nothing moves to Functional in the matrix until the staging run records it |
