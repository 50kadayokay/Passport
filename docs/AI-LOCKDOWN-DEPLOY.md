# AI endpoint lockdown — production deployment sequence

Scope: the AI endpoint security patch and `0057_submission_throttle.sql`. Nothing
else. `0000`, `0058`, `0059`, `0060` and the schema-recovery work are **not** part
of this deployment.

Every gate below must pass before the next step. A failed gate stops the
sequence — it does not get worked around.

---

## The three verifications you asked for

### 1 · Company resolution cannot silently authorize the wrong company

**This found a real flaw, now fixed.** The earlier guard resolved the caller's own
company *whenever* `companyId` was absent. An admin belonging to company A, opening
a surface for company B with a missing `companyId`, would have been authorized
against **A**, charged to **A**'s budget, and allowed to proceed on **B**'s data.
Authorization subject and data subject would have diverged silently.

The exception now requires **three independent conditions**:

| Condition | Where |
|---|---|
| The **endpoint** permits it — `allowOnboarding` | `audience-card` is **false**; its company is always known |
| The **request** declares it — `onboarding: true` | Set only by `src/Onboarding.jsx`, the profile builder |
| The **caller** independently resolves to an entitled company, or is a platform admin | `callerOwnCompany()` + `requireFeature`, or `requireAdmin` |

| Request shape | Outcome |
|---|---|
| `companyId` or `slug` present | `requireFeature` on **that** company. **No fallback, ever** |
| No company, `onboarding: true`, endpoint allows | Own company (entitlement checked) or admin |
| No company, no onboarding claim | **400 `companyId is required`** |
| `companyId: B` while caller owns A | **403** — never silently allowed via A |

Proven by test §15 (400, not substitution) and §16 (named company never falls
back). `callerOwnCompany` reads `company_memberships` **as the caller**, so RLS
decides; it deliberately avoids `companies?owner_id=eq.<uid>` as the primary test
because `auth_read` is `owner_id = auth.uid() OR status='published' OR is_admin()`,
which would also return every published company.

### 2 · Rate limits — atomic, pre-flight, and *not* dollar limits

**Atomicity.** Both tiers go through one SQL statement:

```sql
insert into public.submission_throttle as t (ip_hash, form, window_start, count)
values (p_ip_hash, p_form, p_window_start, 1)
on conflict (ip_hash, form, window_start) do update set count = t.count + 1
returning count;
```

`INSERT ... ON CONFLICT DO UPDATE` takes a **row-level lock** on the conflicting
row. A concurrent caller blocks until the first transaction commits, then the
`DO UPDATE` re-reads the committed row, so `count = t.count + 1` cannot lose an
update — correct at READ COMMITTED, no advisory locks or `SERIALIZABLE` needed.
`RETURNING count` in a `DO UPDATE` yields the **post-increment** value, which is
what the guard compares. Gate 1c below verifies this empirically rather than on
my reading of the semantics.

**One honest imprecision:** the burst and company counters are two separate RPCs,
so they are two transactions. A request that passes the burst check and then fails
the company cap has consumed one burst unit without a model call. That
over-counts slightly against the user; it never under-counts, so it cannot let
spend through. Deliberate — one combined transaction would mean a bespoke RPC for
marginal benefit.

**Checked before Anthropic.** Gate order in `api/_aiGuard.js`:
kill switches (line 141) → size (180) → auth/authz/entitlement (195) → burst
(261) → company budget (285). The handler's `fetch(ANTHROPIC_URL)` is
unreachable until all pass. Test sections 1–8 and 11–17 assert **zero billable
calls** on every refusal path, counting requests to `api.anthropic.com` rather
than trusting the status code.

**These are REQUEST-COUNT limits, not spending limits.** This distinction matters:

- One `structure-release` call may carry an 8 MB base64 PDF — on the order of
  10⁵ input tokens — while another carries 200 characters. The cost ratio between
  two requests that both count as "1" is easily three orders of magnitude.
- So `AI_COMPANY_DAILY_CAP = 1000` bounds **calls per company per day**, not
  dollars. Worst case is 1000 near-maximal requests, which is a materially large
  bill.

**The only real dollar control is at the provider.** Before deploying, set a hard
spend limit and budget alerts on the Anthropic account (Console → Billing →
Limits). Nothing in this codebase can enforce a dollar ceiling, and claiming
otherwise would be the same category of error as the original hole.

### 3 · Vercel environment variables are *not* an emergency control

**I was wrong about this, and you were right to flag it.** Vercel binds
environment variables to a **deployment**. Editing one in the dashboard changes
nothing about a running deployment — it takes effect only on the next build.
`AI_ENDPOINTS_DISABLED` is therefore a redeploy with extra steps, and a redeploy
is exactly what you cannot rely on mid-incident.

So the emergency control is now **in the database**, added to `0057`:

```sql
-- EMERGENCY DISABLE. Effective on the next request. No build, no deploy.
update public.ai_controls
   set enabled = false, reason = 'why · who · when', updated_at = now()
 where id;

-- Re-enable:
update public.ai_controls
   set enabled = true, reason = null, updated_at = now()
 where id;
```

`api/_aiGuard.js` reads `public.ai_enabled()` on every AI request, before the
size check and before auth. Cost: one RPC (~10–30 ms) on a request that takes
seconds. **Not cached** — caching would reintroduce the very propagation delay
this exists to remove.

`ai_controls` has RLS on with **zero policies** and all privileges revoked from
`anon`/`authenticated`: service-role and owner only.

Three states, deliberately distinguishable in the response:

| `detail` | Meaning |
|---|---|
| `ai-disabled-db` | Someone flipped the flag. Intentional |
| `ai-disabled-env` | The env var is set — a *planned* disable shipped with a build |
| `rate-limiter-unavailable` | `0057` missing or the database is unreachable. **Not** read as "disabled" |

Tests §14 (env), §17 (database, reversible, and distinguished from an outage).

---

## Deployment sequence

### Step 1 — apply `0057_submission_throttle.sql`

Production SQL editor, as the `postgres` role.

**Gate 1a — objects exist**
```sql
select
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('submission_throttle','ai_controls')) as tables,   -- 2
  (select count(*) from pg_proc
    where pronamespace='public'::regnamespace
      and proname in ('bump_submission_throttle','prune_submission_throttle','ai_enabled')) as fns; -- 3
```

**Gate 1b — not exposed to the browser**
```sql
select table_name, grantee, string_agg(privilege_type, ', ') as privs
  from information_schema.role_table_grants
 where table_schema='public'
   and table_name in ('submission_throttle','ai_controls')
   and grantee in ('anon','authenticated')
 group by table_name, grantee;
-- expect ZERO rows
```

**Gate 1c — the increment is atomic under concurrency**

Sequential first:
```sql
select public.bump_submission_throttle('gate','ai:test', date_trunc('hour', now()));  -- 1
select public.bump_submission_throttle('gate','ai:test', date_trunc('hour', now()));  -- 2
```
Then concurrent — 20 parallel calls must produce exactly 22, with no duplicates:
```bash
SB=https://<ref>.supabase.co; SRK=<service-role-key>
W=$(date -u +%Y-%m-%dT%H:00:00Z)
seq 1 20 | xargs -P 20 -I{} curl -s -X POST "$SB/rest/v1/rpc/bump_submission_throttle" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H 'Content-Type: application/json' \
  -d "{\"p_ip_hash\":\"gate\",\"p_form\":\"ai:test\",\"p_window_start\":\"$W\"}" | sort -n | tr '\n' ' '
```
Expect `3 4 5 … 22` — twenty distinct values, none repeated. **A repeated value is
a lost update and the limiter does not hold.** Then clean up:
```sql
delete from public.submission_throttle where ip_hash = 'gate';
```

**Gate 1d — the switch starts on**
```sql
select enabled, reason from public.ai_controls;   -- true, null
select public.ai_enabled();                       -- true
```

### Step 2 — provider spend limit

Anthropic Console → Billing → set a hard monthly spend cap and an alert
threshold. **Gate 2:** the cap is visible in the console. This is the only
dollar-denominated control that exists.

### Step 3 — environment variables

```
SUBMISSION_SALT = <long random string>          # required
AI_CALLS_PER_WINDOW = 200                       # optional, this is the default
AI_COMPANY_DAILY_CAP = 1000                     # optional, this is the default
```
Leave `AI_ENDPOINTS_DISABLED` **unset**.

**Gate 3:** all three visible in Vercel → Settings → Environment Variables,
scoped to Production. They take effect with the step-4 build, which is why they
are set first.

### Step 4 — deploy

Server **and** client in one deployment. A server-only deploy makes legitimate
callers 401, because they are not yet sending a session.

**Gate 4:** the Vercel deployment reports Ready, and its commit is the one
carrying `api/_aiGuard.js`.

### Step 5 — smoke test: the hole is closed

```bash
for e in structure-release synthesize-profile audience-card; do
  printf '%-20s ' "$e"
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://mineex.ca/api/$e" \
    -H 'Content-Type: application/json' \
    -d '{"mode":"extract","text":"t","timeline":[{"date":"2026-01-01","title":"t"}]}'
done
```
**Gate 5: all three return 401.** They return 400 today. Anything other than 401
— especially a 200 — means the guard is not in the deployed build; go to step 8.

### Step 6 — smoke test: legitimate workflows

| # | Path | Expect |
|---|---|---|
| 6a | Portal → Publish → Create Release → analyze a pasted release | Succeeds |
| 6b | Same draft → "improve" / refine | Succeeds |
| 6c | Admin → Mission Control → Audience Card → Generate | Succeeds |
| 6d | Profile builder → document extract + overview | Succeeds |
| 6e | A company with no active subscription | **403**, not a hang or a 500 |

**Gate 6: 6a–6d succeed and 6e is 403.** Any failure → step 8, then diagnose.

### Step 7 — confirm metering is live

```sql
select form, count(*) as rows, max(count) as peak
  from public.submission_throttle
 where form like 'ai:%'
 group by form order by form;
```
**Gate 7:** rows exist for `ai:structure-release` (from 6a/6b) and `ai:company`.
If `ai:company` is empty after 6a–6d, the budget tier is not being reached and
the cross-window cap is not in force.

### Step 8 — emergency disable drill

Do this **once, deliberately, while you are watching** — an untested emergency
control is not a control.

```sql
update public.ai_controls set enabled = false, reason = 'deploy drill', updated_at = now() where id;
```
Retry 6a. **Gate 8a:** it fails with `503 {"detail":"ai-disabled-db"}`.
```sql
update public.ai_controls set enabled = true, reason = null, updated_at = now() where id;
```
Retry 6a. **Gate 8b:** it succeeds again.

---

## Rollback

| Symptom | Action |
|---|---|
| Anything unexpected, cause unknown | `update public.ai_controls set enabled=false …` — instant, no deploy |
| Legitimate users 429 | Raise `AI_CALLS_PER_WINDOW` / `AI_COMPANY_DAILY_CAP` (needs a redeploy to take effect) |
| Legitimate users 503 `rate-limiter-unavailable` | `0057` missing or increment broken — step 1 |
| Legitimate users 401 | Non-atomic deploy — redeploy both halves |
| Legitimate users 400 `companyId is required` | A caller lost its company context — identify it; do **not** loosen the guard |

**Reverting the deployment is not an approved rollback.** The previous deployment
is the vulnerability. Disable via the database flag and fix forward.

`0057` itself should not be rolled back while the new code is deployed — the
guard would then refuse every AI request with `503`. If `0057` must go, disable
AI first, then drop, then redeploy without the guard.

---

## Residual risks at GO

1. **Request counts are not dollars.** 1000 calls/day/company can be a large
   bill. The provider-side cap in step 2 is the only real ceiling.
2. **Steps 5–8 have never been executed.** No environment existed to run them.
   The guard logic is covered by 139 unit assertions; the deployed product paths
   are not.
3. **Caps are judgment, not measurement** — derived from reading `concurrency = 4`
   in the fan-out, not from observed traffic. Watch gate 7 after the first bulk run.
4. **`AudienceCard`'s `company.id`** is read from a slug lookup and the button is
   disabled without a company, so it should always be present. If it ever is not,
   the request now gets a clean **400** rather than being charged to the wrong
   company — the failure mode is safe, but it would be a visible bug.
5. **The `ai_enabled()` RPC adds one round trip per AI request.** If the database
   is slow, AI requests get slower. Deliberate: an uncached read is what makes
   the switch immediate.
