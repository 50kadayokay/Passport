# Production launch checklist: controlled pilot (2026-11-01)

The short version of `docs/PRODUCTION-ROLLOUT-PLAN.md`. The plan holds the detail: the ordered
**Runbook** with exact commands, who runs each step, rollbacks, "never" rules and stop conditions; the
migration table; and the checkpoints. Nothing here has been done in production. Each **[you]** item is an
approval or a step only you can take; nothing past "Ready" starts without it.

## Ready (verified on staging, no production change)

- All 28 pending migrations apply in production's shape. Two read-only production audits (approved):
  storage policies and `mineiq_search` match the repo; the four "drifted" functions are token-identical
  to the repo (formatting only), so nothing production-specific is overwritten.
- Production-exact rollbacks: the runner captures production's functions and grants locally before each
  file and refuses to apply if that fails. Staging test: 0071/0072/0076 captures restore production's
  exact digests (15/0).
- Staging with everything applied (incl. 0091): isolation 1077/0/0 unverified/0 skipped,
  API authz 435/0, 25 live suites, investor app 35/0 (0 breaking), round trip 75/0, `npm test` and build.
- Production runner: plan-only by default; one file per run with `--apply`, `--approved-by`, the exact
  ref and a typed confirmation; refuses staging and superuser.
- Production database password rotated (2026-11-01).

## Approvals and configuration [you]

1. **Production test accounts** (gate g07): one test investor and one test company owner (optionally a
   viewer) for the read-only smoke. Credentials go into your own shell as `SMOKE_*` variables, never chat.
2. **Vercel production environment** (names only; values never in chat or git):
   - `SUBMISSION_SALT`: required before 0058.
   - `SITE_REVALIDATE_SECRET`: server only, no `VITE_` copy; before 0088 and before any company sets a
     revalidate URL.
   - `STRIPE_WEBHOOK_SECRET`: before 0069b is used. Keep `MESSAGES_INBOUND_SECRET` unchanged.
   - Must NOT be set: `MINEEX_ENV`, `STAGING_*`, any `VITE_*REVALIDATE*`, `PUSH_ENABLED=true`.
3. **Cron**: confirm outbox-drain and any dispatch cron stay off for the pilot (Phase 6 is separate).
   The offline proof is `docs/PILOT-DISABLED-DELIVERY.md` (`check:s2-pilot-disabled`).
4. **Backup** (before step 3 below): confirm a fresh daily backup in Supabase (Database → Backups;
   Pro). PITR is an optional paid add-on, and a restore is the last resort after rollbacks (Runbook Step 2).
5. **0077**: confirm it keeps the anonymous listing-report path open for installed 1.3.x apps.
6. **Push** `portal-work` and **approve the rollout** below. Each production migration run also records
   your approval text (`--approved-by`).

## Rollout (after approval, in this order; commands in the plan's Runbook)

| Step | What | Stop if |
|---|---|---|
| 1 | Deploy API and web (Vercel). New features stay inert until their migrations. | any Checkpoint 1 item fails: Vercel instant rollback, no DB state to undo |
| 2 | Read-only smoke against the deploy: `production-smoke.mjs --production` (pages, security headers, CSP Report-Only, investor feed/profile, role refusals). | any FAIL |
| 3 | Phase 3: 0058, 0077, 0061a (runner, one file each). | checkpoint fails: run that file's rollback |
| 4 | Phase 4: 0062–0066; 0065c through the runner's no-transaction mode (CONCURRENTLY). | same; if the runner still refuses 0065c, wait |
| 5 | Phase 5: 0068–0078; 0073a through the runner's no-transaction mode; 0071/0072/0076 with capture-on-apply. | same; capture file restores production exactly |
| 6 | Phase 5b: 0080, 0085–0088, 0090, 0091. | same; never roll back 0071 while 0088 is applied, and never run 0059's rollback |
| 7 | Smoke again plus investor-app checks (feed, profile, send/inbox, listing report); 24 h with no 5xx rise. | any investor-app regression: stop, roll back the last phase |
| 8 | Open the portal to 2–3 pilot companies (owner accounts). | |

## Deferred past the pilot

- a19 real-model citation test (needs an OpenAI key on staging).
- a20 Stripe self-serve checkout (pilot companies invoiced by hand; the test-mode script is ready).
- a26 fresh-database replay (needs a disposable Supabase project); `conf_pkg_member_read` to SCHEMA-RECOVERY.
- a22, Phase 6 (scheduled delivery), push (0055), enforcing the CSP after a Report-Only review on the deploy.
