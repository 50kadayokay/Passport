# Production launch checklist: controlled pilot (updated 2026-11-02)

Your steps, in order. Detail lives in `docs/PRODUCTION-ROLLOUT-PLAN.md` (the **Runbook**: commands,
rollbacks, "never" rules, stop conditions), `docs/PRODUCTION-ENV-AUDIT.md` (variable names),
`docs/PRODUCTION-TEST-ACCOUNTS.md` (smoke accounts) and `docs/PILOT-DISABLED-DELIVERY.md` (what stays off).
Nothing here has been done in production. Pilot scope: 2–3 companies.

## Done

- Live investor app (prod-v1.3.2) merged into `portal-work`; nothing live removed. Native company editor
  fixed (owner/admin only, draft and publish, no false success).
- 30 migrations to apply, all matching production's shape (two approved read-only audits). Runner:
  plan-only by default, one file per run, typed confirmation, capture-on-apply (production-exact
  rollbacks), no-transaction mode for 0065c/0073a, `--rollback`.
- Staging with every migration applied, including 0092 and 0093: isolation 1088/0/0/0, API authz 446/0,
  25 live suites, investor app 35/0, round trip 79/0, captures 15/0, `npm test`, web and native builds.
- Listing-report rate limit (0093): 5 per device per 10 min, 20 per network per hour, 600 per hour
  overall, one report per request; keyed only on the gateway-set address (live gateway test 131/0,
  adversarial 129/0, concurrency exact, installed 1.3.x apps unchanged). Alert on the admin Delivery
  operations page (red when the overall cap is hit, amber at 80%), verified on staging.
- Production Postgres errors explained (a local preview polling while signed out; the default is fixed).
- Vercel: preview builds off; every required Production variable present, including
  `SITE_REVALIDATE_SECRET`; nothing forbidden set. Production database password rotated.

## Your remaining steps before the rollout

1. **Test users.** Supabase → Authentication → Users → **Add user** (Auto Confirm) for the smoke
   investor, owner and viewer, passwords from your password manager (Test accounts doc §0–1). The test
   company and owner hand-off come later (step 6), because portal roles arrive with 0076.
2. **Backup.** Supabase → Database → **Backups**: note today's daily backup time. Start step 4 only after
   it. A restore is the last resort after rollbacks.
3. **Database connection file**, for the runner only: one line holding the production connection string
   with the current password, saved as `~/.mineex-prod-dsn` with `chmod 600`, outside the repo. Delete it
   after step 6.

## The rollout (each row needs your separate approval)

| Step | What | Stop if |
|---|---|---|
| 4a | I push `portal-work` and open the PR to `main`; **you merge it** (Vercel deploys; this also picks up `SITE_REVALIDATE_SECRET`). New features stay inert until their migrations. | a Preview build appears (delete it, check logs); Checkpoint 1 fails: Vercel instant rollback |
| 4b | Read-only smoke (`production-smoke.mjs --production`): pages, headers, CSP Report-Only, investor feed and profile. | any FAIL |
| 5a | Phase 3: 0058, 0077, 0092, 0093, 0061a | a checkpoint fails: the runner's `--rollback` for that file |
| 5b | Phase 4: 0062–0066 (0065c in no-transaction mode) | same |
| 5c | Phase 5: 0068–0078 (0073a no-transaction; 0071/0072/0076 capture-on-apply) | same |
| 5d | Phase 5b: 0080, 0085–0088, 0090, 0091 | same; never roll back 0071 while 0088 is applied |
| 6 | **You**: create the draft test company, hand it to the test owner, invite the viewer. Then the full smoke and investor-app checks; delete the connection file. | any investor-app regression: stop, roll back the last phase |
| 7 | After 24 h with no 5xx rise: **you** hand off the portal to 2–3 pilot companies. | |

Each migration runs in your terminal: the runner shows the file, you type the project ID to confirm
(30 times), and it records your approval text. It stops itself on the first failed checkpoint.

## Accepted for the pilot

- **Overall listing-report cap.** About 30 distinct networks sending 20 reports each could fill the
  600-per-hour cap; installed apps' "Report or claim" then shows an error until the hour rolls over
  (the website form and `/api/submit` are unaffected). Detected by the red banner on the admin Delivery
  operations page. No email in the pilot: `OPS_ALERT_TO` is a Phase 6 variable and alerts are evaluated only
  after publish nudges. Response: raise `global_per_window` in `listing_report_limits` (one SQL update).
- `user_id` on anonymous reports is unverified by design (installed apps send it with the anon key).
- The feed card can show an older logo after a profile edit (pre-existing with portal edits).
- Owners can still change their own published profile directly in the database (S1's proposed 0081
  trigger, not applied, would close it once the portal's calendar, QR logo and Briefs saves use drafts).
- Native app's call to the draft service is untested on a device (same pattern as native messaging; it
  fails closed with an error).

## Deferred past the pilot

- a19 real-model citation test; a20 Stripe self-serve checkout (pilot invoiced by hand); a26 fresh-database
  replay; a22.
- Phase 6 scheduled delivery and ops-alert email, push (0055; clear `notification_outbox` first), enforcing
  the CSP after a Report-Only review on the deploy, `conf_pkg_member_read` into SCHEMA-RECOVERY.
