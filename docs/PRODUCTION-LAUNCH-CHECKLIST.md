# Production launch checklist: controlled pilot (2026-11-01)

Your steps, in order. Detail lives in `docs/PRODUCTION-ROLLOUT-PLAN.md` (the **Runbook**: commands,
rollbacks, "never" rules, stop conditions), `docs/PRODUCTION-ENV-AUDIT.md` (variable names),
`docs/PRODUCTION-TEST-ACCOUNTS.md` (smoke accounts) and `docs/PILOT-DISABLED-DELIVERY.md` (what stays off).
Nothing here has been done in production.

## Ready (verified on staging, no production change)

- 29 migrations to apply; all match production's shape (two approved read-only audits). The four
  "drifted" functions are token-identical to the repo, so nothing production-specific is overwritten.
- Runner: plan-only by default; one file per run, exact ref, typed confirmation, `--approved-by`;
  capture-on-apply (production-exact rollbacks, staging 15/0); no-transaction mode for 0065c/0073a;
  `--rollback` that records itself. Offline 119/0, 66/0, 42/0, 61/0.
- Staging, everything applied except 0092: isolation 1077/0/0 unverified/0 skipped, API authz 435/0,
  25 live suites, investor app 35/0, messaging 63/0, round trip 78/0, `npm test` and build.
- Outbox-drain, scheduled delivery and push stay off (`check:s2-pilot-disabled` 44/0).
- Production database password rotated.

## Part 1: two reads before you approve (nothing changes; about 10 minutes)

1. **Postgres errors.** Supabase → Passport V1 → **Logs → Postgres**, last 24 hours, severity ERROR and
   FATAL. Screenshot the list (messages only). One is already explained (the first audit's cron check).
2. **Vercel names.** Vercel → project → **Settings → Environment Variables**, filter **Production**.
   Screenshot the **names** (values stay hidden; don't click the eye). I compare them with the env audit.

(Alternatively, connect Claude in Chrome and I read both pages myself, read-only.)

## Part 2: after your approval, your settings (about 20 minutes)

3. **Vercel production variables** (values never in chat or git):
   - add `SITE_REVALIDATE_SECRET` (a long random value from your password manager; server only);
   - confirm `SUBMISSION_SALT` and `DISPATCH_SECRET` exist (add them if Part 1 shows they don't);
   - remove anything in the env audit's "must be absent" list that Part 1 finds.
3b. **Preview deployments, before anything is pushed.** `VITE_SUPABASE_URL` and the anon key are
   scoped "Production and Preview", and the code falls back to production when they are unset. So
   pushing `portal-work`, or opening its PR, would build a Preview of the new code against the
   **production** database. Either turn preview builds off (Settings → Git → **Ignored Build Step**:
   "Only build production"; recommended), or set the Preview values to the staging project and remove
   every server secret (`SUPABASE_SERVICE_ROLE_KEY` and the rest) from Preview. Plan Runbook Step 1b.
4. **Test users.** Supabase → Authentication → Users → **Add user** (Auto Confirm) for the smoke
   investor, owner and viewer, passwords from your password manager (Test accounts doc §0–1). The test
   company and owner hand-off come later (step 9), because portal roles arrive with 0076.
5. **Backup.** Supabase → Database → **Backups**: note today's daily backup time. Start step 7 only after
   it. A restore is the last resort after rollbacks.
6. **Database connection file**, for the runner only: one line holding the production connection string
   with the new password, saved as `~/.mineex-prod-dsn` with `chmod 600`, outside the repo. You delete it
   after step 9.

## Part 3: the rollout (I run it in your terminal; you confirm each migration)

| Step | What | Stop if |
|---|---|---|
| 7a | Only after 3b: I push `portal-work` and open the PR to `main`; **you merge it** (Vercel deploys). New features stay inert until their migrations. | a Preview deployment appears built against production (delete it, then check the logs); or Checkpoint 1 fails: Vercel instant rollback, no database state to undo |
| 7b | Read-only smoke (`production-smoke.mjs --production`): pages, security headers, CSP Report-Only, investor feed/profile. Owner checks report "skipped" until step 9. | any FAIL |
| 8a | Phase 3: 0058, 0077, 0092, 0061a | a checkpoint fails: the runner's `--rollback` for that file |
| 8b | Phase 4: 0062–0066 (0065c in no-transaction mode) | same |
| 8c | Phase 5: 0068–0078 (0073a no-transaction; 0071/0072/0076 capture-on-apply) | same |
| 8d | Phase 5b: 0080, 0085–0088, 0090, 0091 | same; never roll back 0071 while 0088 is applied |
| 9 | **You**: create the draft test company, hand it to the test owner, invite the viewer (Test accounts doc §2–4). Then the full smoke and investor-app checks; delete the connection file. | any investor-app regression: stop, roll back the last phase |
| 10 | After 24 h with no 5xx rise: **you** hand off the portal to 2–3 pilot companies. | |

Each migration runs in your terminal: the runner shows the file, you type the project ID to confirm
(29 times), and it records your approval text. It stops itself on the first failed checkpoint.

## Accepted for the pilot (your decision in the approval)

- Anonymous listing reports have no rate limit and accept many rows per request. Production allows that
  today with no limits at all; 0058 + 0077 + 0092 add length, type and column limits. Close the
  anonymous path once installed 1.3.x apps fade out.

## Deferred past the pilot

- a19 real-model citation test (OpenAI key on staging); a20 Stripe self-serve checkout (pilot invoiced
  by hand); a26 fresh-database replay (disposable Supabase project); a22.
- Phase 6 scheduled delivery, push (0055; clear `notification_outbox` first), enforcing the CSP after a
  Report-Only review on the deploy, `conf_pkg_member_read` into SCHEMA-RECOVERY.
