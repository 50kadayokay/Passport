# Closing the unauthenticated AI endpoints

Narrowly scoped. This change touches the three endpoints that bill Anthropic and
nothing else — no portal development, no schema recovery, no privilege cleanup.

---

## What was wrong

`api/structure-release.js`, `api/synthesize-profile.js` and `api/audience-card.js`
each had exactly one gate:

```js
if (req.method !== "POST") return bad(res, 405, "Method not allowed");
const key = process.env.ANTHROPIC_API_KEY;
```

then POSTed to `api.anthropic.com/v1/messages` with `max_tokens` 1500–3000. No
token, no entitlement, no rate limit, no size cap.

**Confirmed against production**, with an empty `{}` body — the key check runs
before body validation, so this reached no model and spent nothing:

| Endpoint | Response |
|---|---|
| `/api/structure-release` | `400 "Provide the press-release text or PDF."` |
| `/api/synthesize-profile` | `400 "Provide the release chronology (timeline)."` |
| `/api/audience-card` | `400 "Provide the release chronology and/or the company brief."` |

A 400 proves all three are deployed, `ANTHROPIC_API_KEY` is set, and nothing
stood between an anonymous caller and a billed completion.

`0005_comms_foundation.sql` warned about this in its own header: *"Server code
(api/\*) must check company_has_feature() too — the AI endpoints spend real
money per call."*

---

## The fix

`api/_aiGuard.js` → `requireAiCaller(req, res, { label, feature })`, called as the
first statement of each handler.

| Order | Control | Response |
|---|---|---|
| 1 | Body size ceiling — 8 MB for `structure-release` (it takes base64 PDF), 512 KB for the other two | `413` |
| 2 | Authentication via `verifyBearer` | `401` unauth · `502` if Supabase unreachable |
| 3 | Company authorization **and** paid entitlement via `my_features(cid)` | `403` |
| 4 | Admin concierge path when there is no company row yet | `403` for non-admin |
| 5 | Rate limit — 200 per 10 min per verified user, **FAILS CLOSED** | `429` over limit · `503` if unconsultable |

It reuses `api/_entitlement.js` rather than reimplementing auth: `my_features(cid)`
already enforces `can_touch_company()` inside the database and resolves admins to
every feature, so one round trip answers both *"is this your company?"* and
*"is the feature paid for?"*. A second copy of those rules would drift.

**The admin-OR-company shape** is the one `api/structure-batch.js:98` and
`api/extract-company.js` already use. It is required, not a convenience:
`Onboarding.jsx:6454` calls `synthesizeProfile({ company: { name } })` *before the
company row exists*, so there is genuinely nothing to gate on. That path demands a
platform admin instead — strictly narrower than the feature check it replaces.

**Why the rate limit fails closed here** and fails open in `api/_submissions.js`:
losing a contact-form submission is worse than letting one through, but these
calls cost money, so an unconsultable counter means refuse.

**Why 200 and not 30:** the limit must clear the largest legitimate burst.
`structureReleases()` calls `/api/structure-release` once per release with
concurrency 4, so a bulk onboarding run is routinely 50–100 calls in minutes. A
limit of 30 would abort onboarding partway and look like a product bug. 200 per
10 minutes per *already-entitled* user is a backstop against a runaway client,
not the primary control. Tune with `AI_CALLS_PER_WINDOW`.

### Files

| File | Change |
|---|---|
| `api/_aiGuard.js` | **new** — the gate |
| `api/structure-release.js`, `api/synthesize-profile.js`, `api/audience-card.js` | +9 lines each: import, guard call, bail |
| `src/lib/structureReleases.js` | attach `authHeaders()`; thread `companyId` through `structureRelease` / `refineRelease` / `synthesizeProfile` |
| `src/admin/AudienceCard.jsx` | attach `authHeaders()`; send `companyId: company.id` |
| `src/portal/publish/CreateRelease.jsx` | pass the `companyId` already in scope at line 219 |
| `scripts/ai-guard-test.mjs` | **new** — 60 assertions, wired into `npm test` |

---

## Test results — actually executed

`npm run check:aiguard` → **60 passed, 0 failed.**

It stubs global `fetch`, routes every URL the handlers use, and counts any request
to `api.anthropic.com` as a violation. **The assertion is the billable-call count,
not the status code** — a 403 that already spent money would still fail.

| § | Scenario | Expected | Billable calls |
|---|---|---|---|
| 1 | No `Authorization` header | 401 | 0 |
| 2 | Forged / expired token | 401 | 0 |
| 3 | Authenticated, another company's id | **403** | 0 |
| 4 | Entitled company, plan lacks `company_memory` | 403 | 0 |
| 5 | No `companyId`, caller is not an admin | 403 | 0 |
| 6 | 9 MB payload | 413 | 0 |
| 7 | Throttle unreachable | **503** | 0 |
| 8 | Over the window limit | 429 + `Retry-After` | 0 |
| 9 | Entitled company, within limit | reaches provider | **exactly 1** |
| 10 | Admin concierge, no `companyId` | reaches provider | **exactly 1** |

**The test is proven able to fail.** Removing the guard from
`structure-release.js` produces:

```
✗ structure-release: no Authorization header → expected 401, got 502
✗ structure-release: no Authorization header → MUST NOT bill. billable calls: 1
```

That `billable calls: 1` on an unauthenticated request is the vulnerability
reproduced in a test.

**No secret reaches the browser.** After `npm run build`, `dist/` contains no
occurrence of `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`,
`POSTMARK_SERVER_TOKEN`, `SUBMISSION_SALT`, `MESSAGES_INBOUND_SECRET`, `sk-ant-`
or `sk-proj-`, and no `process.env.*` reference survives in the client bundle.

**Full suite:** `npm test` exit 0 — 19 scripts, 0 failed. Build clean.

---

## Onboarding compatibility — traced end to end

`requireAdmin` alone was **wrong**, and the trace is why.

`/onboarding` → `src/console/CompanyConsole.jsx:121` → `<Onboarding embedded />`.
`CompanyConsole` is **not** admin-gated: it reads `getMyRole()` only to decide
whether to show admin extras (line 64/76). Company users reach the profile
builder. (`src/portal/Portal.jsx:28` also lazy-imports `Onboarding` but never
renders it — a dead import.)

`Onboarding({ embedded, companySlug })` resolves its company three ways
(line 6290): the `companySlug` prop, then `?company=<slug>`, then
`fetchMyCompany()`. The resolved row's slug is held in `savedSlug`
(set at line 6330). But `?new=1` **returns before loading any row** (line 6295),
so there is genuinely no company — that is the real company-less case, and
demanding a `companyId` there would break first-time setup.

**The resolution — three branches, narrowest first:**

| Caller state | Branch | Outcome |
|---|---|---|
| `companyId` or `slug` in the body | `requireFeature(companyId, company_memory)` | Gated on the company **being edited** |
| No company named, caller belongs to one | Resolve the caller's own company, then `requireFeature` | First-time setup works |
| No company named, caller belongs to none | `requireAdmin` | Concierge only |

The middle branch is `callerOwnCompany(token)`, read **as the caller** so RLS
decides. It queries `company_memberships` — the authorization spine from `0006`,
whose policy is `user_id = auth.uid() OR can_touch_company(company_id)`, so a
caller sees only their own rows. It deliberately does **not** use
`companies?owner_id=eq.<uid>` alone as the primary test, because the `auth_read`
policy is `owner_id = auth.uid() OR status = 'published' OR is_admin()` — so
selecting companies as a user also returns every *published* company and would be
a useless ownership test.

**This does not become a hole.** An investor with no company resolves to nothing
and is refused (test §12). A company with no plan is refused (§12). Entitlement
is always checked separately — `callerOwnCompany` answers *"which company are
you?"*, never *"may you spend?"*.

Clients now send the slug (`savedSlug`) so the subject is the company being
edited rather than whichever company the caller happens to belong to — which also
means the budget below is charged to the right company.

## Entitlement semantics — `company_memory` is correct

It is in **all three plans**:

```
passport                 → passport_profile, company_memory
passport_communications  → + communications_center, linkedin/x/newsletter/push, analytics
passport_managed         → + website_publish, custom_website
```

and `plan_for_tier()` maps `free → passport`, `basic → passport`,
`pro → passport_managed`, default `passport`. **Every tier that has a plan
includes `company_memory`**, so gating on it disables nothing in any subscription.

A `listing` company — the auto directory entry, no owner, no subscription — has
no `company_subscriptions` row, so `my_features` returns empty and it gets 403.
Correct: it is not a customer and has no portal access.

## Rate limits and spending — two tiers

| Tier | Key | Window | Cap | Purpose |
|---|---|---|---|---|
| Burst | user + endpoint (`ai:<label>`) | 10 min | 200 | Runaway client or compromised session |
| Budget | **company** (`ai:company`) | 24 h UTC | 1000 | Cross-window accumulation |

**Both fail closed.** The burst limit is bucketed *per endpoint*, so a bulk
onboarding run against `structure-release` cannot exhaust an interactive user's
budget for `audience-card`.

The daily cap is keyed by **company, not user** — otherwise adding seats would
multiply the ceiling. 1000/day is roughly five full back-catalogue onboarding
runs; a company needing more is a conversation, not a silent charge. Tune with
`AI_CALLS_PER_WINDOW` and `AI_COMPANY_DAILY_CAP`.

One asymmetry worth stating: an **admin** acting with no company at all passes
`requireAdmin` and has no company budget, because there is no company to charge.
Staff are trusted; the burst limit still applies to them.

## Deployment checklist

| # | Step | Verify |
|---|---|---|
| 1 | Apply `0057_submission_throttle.sql` (production, additive) | `select public.bump_submission_throttle('probe','ai:test', date_trunc('hour',now()));` twice → **1 then 2**. Then `delete from public.submission_throttle where ip_hash='probe';` |
| 2 | Set env: `SUBMISSION_SALT=<long random>` | Required — an unsalted uuid hash is a liability for no benefit |
| 3 | Optional env: `AI_CALLS_PER_WINDOW=200`, `AI_COMPANY_DAILY_CAP=1000` | Defaults match; set only to override |
| 4 | Confirm `AI_ENDPOINTS_DISABLED` is **unset** | If set to `true` every AI call returns 503 |
| 5 | `npm test` then `npm run build` locally | Exit 0; `dist/` free of all secret patterns |
| 6 | Deploy — server **and** client together, one deploy | Non-atomic = legitimate callers 401 |
| 7 | Smoke: unauthenticated | three `curl` calls below → **401** |
| 8 | Smoke: portal company user | Create Release → analyze, then refine → both succeed |
| 9 | Smoke: admin | Mission Control → Audience Card → Generate → succeeds |
| 10 | Smoke: onboarding | Profile builder extract + overview → succeeds |
| 11 | Smoke: non-entitled company | **403**, not a silent failure |

```bash
for e in structure-release synthesize-profile audience-card; do
  printf '%s ' "$e"
  curl -s -o /dev/null -w '%{http_code}
' -X POST "https://mineex.ca/api/$e" \
    -H 'Content-Type: application/json' \
    -d '{"mode":"extract","text":"t","timeline":[{"date":"2026-01-01","title":"t"}]}'
done
# expect: 401 401 401   (today all three return 400, then bill)
```

Step 1 must precede step 6. The rate limiter fails closed, so code-first means
`503` on all three endpoints.

## Rollback — never back to open endpoints

**The kill switch is the rollback.** Set in Vercel, no redeploy, takes effect on
the next invocation:

```
AI_ENDPOINTS_DISABLED = true
```

All three endpoints then return `503 {"detail":"ai-disabled"}` before size, auth
or rate checks. AI features are off; **nothing is publicly accessible**. Proven
reversible by test §14 — clearing the variable resumes normal service.

| Symptom | Action | Do **not** |
|---|---|---|
| Legitimate users 429 | Raise `AI_CALLS_PER_WINDOW` / `AI_COMPANY_DAILY_CAP` | revert code |
| Legitimate users 503 `rate-limiter-unavailable` | `0057` is missing or the increment is broken — fix step 1 | revert code |
| Legitimate users 401 | Client/server deployed non-atomically — redeploy both | revert code |
| Guard misbehaving, cause unknown | `AI_ENDPOINTS_DISABLED=true` | revert code |

**Reverting the deployment is not an approved rollback** — it restores
unauthenticated AI spend. The previous deployment is the vulnerability. If the
new code must be abandoned, disable the feature and fix forward.

`0060` rolls back independently:
`grant execute on function public.publish_publication(uuid,uuid,timestamptz) to anon, authenticated;`
— which restores a known forgeable-actor defect, so it is a stopgap only.

