# MineEx Company Portal V1.0 — release record

Released to production 2026-11-03 (UTC 2026-11-04 03:05). **Feature development is frozen.** Phase 5b
(0080, 0085–0088, 0090, 0091) is not started and needs separate approval. Any new development needs
approval first.

Current priorities: onboard paying mining companies, monitor production reliability, fix
customer-reported defects.

## 1. Production version

| Component | Version |
|---|---|
| passport (Vercel, `passport-xi-five.vercel.app`): portal, admin, investor web app, all APIs | `main` = `30e4379` (application tree identical to `portal-work` `9372248`)* |
| mineex-site (Vercel, `mineex.ca`) | unchanged code `9dfafd7`; deployment `mineex-site-llh8lrz4g` (fresh `vercel deploy --prod` of that source, bundle identical to the previous one except the build stamp) |
| mineex-conference (Vercel) | redeploys from `main`; no `CRON_SECRET`, so it cannot run the dispatcher |
| Native apps | unchanged; they call the passport APIs |
| Database (Supabase `rvptronniomlqumjhyrr`) | every migration through Phase 5 (list below) |

\* This document is committed on `portal-work` afterwards; it changes no application code.

**Migrations applied to production by the runner** (2026-11-02 and 2026-11-03, each checkpoint true,
recorded in `supabase/production-log/apply-log.jsonl`): 0061a, 0094 · Phase 3A 0058, 0095, 0077,
0092, 0093 · Phase 4 0062, 0063, 0096, 0064, 0065a, 0065b, 0065c, 0066 · Phase 5 0068, 0069b, 0071,
0072, 0073a, 0073b, 0073c, 0074, 0075, 0076, 0078.

**Configuration changed for V1**
- passport, Production: `PUBLIC_BASE_URL=https://passport-xi-five.vercel.app` (added; the publish
  nudge reaches the dispatcher instead of a login-protected deployment URL).
- passport: `vercel.json` schedules `GET /api/dispatch` every 5 minutes, authenticated by the existing
  Sensitive `CRON_SECRET`.
- mineex-site, Production: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public values),
  `POSTMARK_SERVER_TOKEN` (Sensitive), `MESSAGES_FROM_EMAIL=support@mineex.ca`. No service key.

**Code changed for V1 after the Phase 1 deploy**: press-release summaries call OpenAI
(`api/structure-release.js`, model `gpt-4o`, override with `AI_MODEL_RELEASE`); the invitation sign-in
form fills in the invited email (`src/auth/AuthGate.jsx`).

## 2. Acceptance criteria (all verified in production 2026-11-03)

| # | Criterion | Evidence |
|---|---|---|
| 1 | A company can be onboarded and its owner can sign in | Test company `zz-smoke-test-internal-not-a-company` created and handed off; the owner accepted (owner membership active, `owner_id` set, profile role `company`, active `passport` subscription) and signed in. prod-check OWNER 8/8. Invitation form shows the invited email after the fix. |
| 2 | The owner can edit its investor profile | Profile edited and saved as a draft. |
| 3 | The owner can publish profile changes and announcements | Profile published (`profile_published` by the company in `activity_log`). Press release uploaded, OpenAI summary accurate, published. |
| 4 | Investors see published changes | Dispatcher runs on every publish and every 5 minutes (`dispatcher_runs`: nudge 02:50, cron 03:10 and 03:15 UTC); feed posts written. Rolled-back simulation: a guest sees 0 of the test posts while the company is a draft and 2 once an admin publishes it. |
| 5 | Tenant isolation and authorization | Guests read nothing private (prod-check). As each account (read only, rolled back, 17/0): an investor cannot see draft companies, memberships or notifications and is refused another company's Mine IQ; a viewer is refused Clear all, profile edits and drafts; only a platform admin can change a company's status (`company_owner_guard`). |
| 6 | The existing investor app keeps working | prod-check phase5 63 PASS / 0 FAIL; feed and company cards load; no 5xx in 29 responses; security headers pass. mineex.ca byte-identical apart from the lead-form fix. |

## 3. Known limitations

- **Signed-in checks for investor, viewer and admin** were proven in the database, not by a live
  password sign-in (the saved passwords did not match). The owner's live sign-in passed.
- **Retry summary:** after leaving a release page with a failed summary, no retry button is shown;
  re-uploading works.
- **Summary category** can be imperfect (the test release was filed under "Exploration").
- **Website lead storage** shares one rate-limit identity (Vercel's egress IP: 5/hour per IP, 20 per
  /24, 200 overall). Emails to support@mineex.ca are still sent. Fix before scaling traffic.
- **Postmark** plan: 100 emails a month (12 used on 2026-11-03).
- **mineex.ca/app web messaging** answers `service-not-configured` (pre-existing); native and
  passport-hosted messaging work.
- **Admin company list** loads at most 1,000 companies (the database has 1,575).
- **Stripe card checkout** not tested end to end in production.
- **Invitations are not emailed**: the admin copies the link and sends it.
- Supabase default TRUNCATE privileges remain on 35 tables (inert through the API; the deferred 0061b
  removes them).

## 4. Rollback procedures

| What | How | Effect |
|---|---|---|
| passport code | Vercel → passport → Deployments → Instant Rollback to the previous Ready deployment | Immediate; database unchanged |
| Scheduled dispatcher | Vercel → passport → Settings → Cron Jobs → Disable, or revert the `vercel.json` line | Publishing still runs the queue through the nudge |
| Publish nudge address | remove `PUBLIC_BASE_URL` and redeploy | Queue runs only on the 5-minute schedule |
| OpenAI summaries | roll back the passport deployment (see above) | Summaries need Anthropic credit again |
| mineex-site | Vercel → mineex-site → Instant Rollback to `mineex-site-kyljlsh9s` | Lead forms break again (no settings) |
| A database migration | `node scripts/apply-migrations-production.mjs --rollback --only <file> --ref=… --approved-by=…` in your terminal, strictly in reverse order; rollback files in `supabase/rollbacks/` | Per file; lossy ones are listed in `docs/PRODUCTION-ROLLOUT-PLAN.md`; never roll back 0071 while 0088 is applied |
| Whole database | Supabase → Database → Backups (daily, physical) | Last resort: loses everything since the backup |

## 5. Onboarding a paying company (about 5 minutes)

1. **Create** — `passport-xi-five.vercel.app/admin` → **Companies** → **Bulk-add listings** → paste
   the exact company name → check "1 new" → add. It is created as a **draft** (hidden from investors).
2. **Hand off** — select the company → **Hand off** → the owner's email → **Generate link** → **Copy**.
3. **Send the link** yourself (it expires after 14 days and works only for that email).
4. **The owner** opens the link, creates their account (or signs in), and lands in the portal as
   owner. They edit and publish the profile, upload releases and invite their team (Settings → Team;
   choose the role explicitly, the invite form defaults to Editor). Everything stays private while the
   company is a draft.
5. **Go live** — when the profile is ready: admin → the company → **Publish**. Investors see it from
   then on, and their published releases reach the feed within seconds (at most 5 minutes).
6. **Billing** — set their plan in admin → Billing (or run one Stripe test checkout first if they
   pay by card).

If an owner reports a stuck page or sign-in problem, check the admin console first (a stale page
needs a reload; sessions expire after about an hour).

## 6. Monitoring

- **Publishing queue:** `dispatcher_runs` gets a `cron` row every 5 minutes; alerts (backlog age,
  stuck leases, dead deliveries) show on admin → Delivery Operations.
- **Read-only health check:** `PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/prod-check.mjs --stage=phase5`
  (optionally with `SMOKE_*_EMAIL` set; it asks for each password by email).
- **AI spend:** OpenAI usage dashboard; Anthropic is no longer used by release summaries.
- **Email:** Postmark activity and the monthly count.

## 7. Operational cleanup (separate from V1 development)

- Delete the leftover admin account `extract-test-1784413994483@t.local`
  (`66e069dc-182c-49b1-a547-85107753c2b6`; verified disposable, no ownership or references).
- Remove the stale pending owner invitation on the test company (harmless; expires 14 days after
  2026-11-04).
- Re-save the smoke-test passwords in the password manager (investor was re-created; viewer and admin
  did not match) so the live signed-in check can run.
- Keep `zz-smoke-test-internal-not-a-company` as a hidden draft for future checks; never publish it.
- Delete `~/.mineex-prod-dsn` when production database work is finished.
