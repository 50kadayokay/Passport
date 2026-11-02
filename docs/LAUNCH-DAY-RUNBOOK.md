# Launch-day runbook (generated 2026-11-02 from the runner's plan)

Everything here waits for your explicit approval at each **APPROVAL** line. Nothing in this file has been
run in production. Companions: `docs/PRODUCTION-LAUNCH-CHECKLIST.md` (overview, accepted risks),
`docs/PRODUCTION-ROLLOUT-PLAN.md` (rollbacks, "never" rules, stop conditions).

**Before starting:** the connection file exists (`~/.mineex-prod-dsn`, mode 600), today's daily backup has run
(Supabase → Database → Backups; ~09:15 UTC), and you have the test-user passwords in your password manager.
Work in the project folder: `cd "/Users/leifer/Claude Projects/Passport-Portal"`, on branch `portal-work`.

## 1. Code deployment — APPROVAL A

1. Open the pull request (already pushed: `portal-work` @ the commit in the handoff):
   https://github.com/50kadayokay/Passport/compare/main...portal-work?expand=1
   Title: **Portal launch: live baseline v1.3.2 + Company Portal**. Paste the body from `docs/PR-portal-work.md`.
2. **You merge it** (GitHub "Merge pull request"). Vercel builds Production from `main` (~2–4 min).
3. Vercel → Deployments: the new Production deployment shows **Ready**. If it fails, nothing changed: stop.
4. Smoke (read-only): see section 3, stage `deploy`.
5. **Stop if:** any smoke FAIL, a 5xx rise, or the investor app misbehaves → Vercel → Deployments → previous
   Production deployment → **Instant Rollback**. No database state to undo.

## 2. Database migrations — one APPROVAL per phase

31 files in all. Run each line in your terminal; the runner shows the file, you **type the project ID** to confirm, it applies
ONE file, checks its checkpoint and stops on the first failure. Two files (0065c, 0073a) run without a
transaction (index builds); the runner handles that. Functions a file replaces are captured from production
first, so a rollback restores production exactly.

If a step fails: do not continue. Roll back that one file:
`PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --rollback --only <file> --ref=rvptronniomlqumjhyrr --approved-by="<you>, rollback"`
(lossy rollbacks also need `--accept-data-loss="<why>"`). **Never** roll back 0071 while 0088 is applied; never
run 0059's rollback.

### Phase 3 — APPROVAL B

```bash
# 1. 0058_close_public_insert.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0058_close_public_insert.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 3 approval in Claude chat"
# 2. 0077_listing_reports_installed_app_compat.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0077_listing_reports_installed_app_compat.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 3 approval in Claude chat"
# 3. 0092_listing_reports_column_insert.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0092_listing_reports_column_insert.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 3 approval in Claude chat"
# 4. 0093_listing_reports_rate_limit.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0093_listing_reports_rate_limit.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 3 approval in Claude chat"
# 5. 0061a_table_privilege_hardening.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0061a_table_privilege_hardening.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 3 approval in Claude chat"
# 6. 0094_company_follows_upsert_grant.sql   (fixes installed apps' Follow after 0061a; applied and verified on staging 2026-11-02)
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0094_company_follows_upsert_grant.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 3 approval in Claude chat"
```
Then smoke stage `phase3` (section 3).

### Phase 4 — APPROVAL C

```bash
# 7. 0062_message_attachments.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0062_message_attachments.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
# 8. 0063_company_initiated_threads.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0063_company_initiated_threads.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
# 9. 0064_notification_clearing.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0064_notification_clearing.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
# 10. 0065a_analytics_breakdown.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0065a_analytics_breakdown.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
# 11. 0065b_engagement_corrections.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0065b_engagement_corrections.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
# 12. 0065c_analytics_indexes.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0065c_analytics_indexes.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
# 13. 0066_mineiq_conversations.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0066_mineiq_conversations.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
```
Then smoke stage `phase4` (section 3).

### Phase 5 — APPROVAL D

```bash
# 14. 0068_site_contract.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0068_site_contract.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 15. 0069b_stripe_events.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0069b_stripe_events.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 16. 0071_publishing_reliability.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0071_publishing_reliability.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 17. 0072_profile_drafts.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0072_profile_drafts.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 18. 0073a_impression_dedupe_index.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0073a_impression_dedupe_index.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 19. 0073b_impression_tracking.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0073b_impression_tracking.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 20. 0073c_post_events_client_guard.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0073c_post_events_client_guard.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 21. 0074_profile_revision_history.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0074_profile_revision_history.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 22. 0075_profile_versions_privileges.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0075_profile_versions_privileges.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 23. 0076_company_roles.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0076_company_roles.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 24. 0078_storage_role_hardening.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0078_storage_role_hardening.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
```
Then smoke stage `phase5` (section 3).

### Phase 5b — APPROVAL E

```bash
# 25. 0080_mineiq_search_any_term.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0080_mineiq_search_any_term.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
# 26. 0085_conference_booth_config.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0085_conference_booth_config.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
# 27. 0086_service_requests.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0086_service_requests.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
# 28. 0087_audience_events.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0087_audience_events.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
# 29. 0088_content_fanout.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0088_content_fanout.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
# 30. 0090_notification_clear_roles.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0090_notification_clear_roles.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
# 31. 0091_notification_clear_no_platform_admin.sql
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0091_notification_clear_no_platform_admin.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
```
Then smoke stages `phase5b` and `final` (section 3).

## 3. Smoke checks (read-only, in your terminal)

One command per stage (`scripts/prod-check.mjs`). It prompts, hidden, for the test investor, owner, optional
viewer, optional platform admin, and the owner's company slug; reads the database only inside READ ONLY
transactions; submits nothing. Exit 0 PASS, 1 FAIL, 3 INCOMPLETE. Checks that need a later phase print NOT YET.

```bash
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/prod-check.mjs --stage=deploy    # after the Vercel deploy
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/prod-check.mjs --stage=phase3    # after Phase 3
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/prod-check.mjs --stage=phase4
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/prod-check.mjs --stage=phase5
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/prod-check.mjs --stage=phase5b
PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/prod-check.mjs --stage=final     # after the test company exists
```

Before Phase 5 the owner and viewer role checks read NOT YET (they need 0076); that is expected.

## 4. After Phase 5 — you

Create the draft test company and hand it to the test owner; the owner invites the viewer
(`docs/PRODUCTION-TEST-ACCOUNTS.md` §2–4). Then smoke stage `final`.

## 5. Pilot

After 24 h with no 5xx rise and a clean `final` smoke: hand off the portal to 2–3 pilot companies (Admin →
Hand off). Then delete the connection file: `rm ~/.mineex-prod-dsn`.
