# Production launch sequence (consolidated 2026-11-02)

The one sequence from here to the pilot. Already done in production: the code deploy (746d86d, PR #1),
0061a and 0094 (2026-11-02, verified). Everything below waits for your approval; the stop rules and
rollbacks are on each step. Detail behind it: `docs/PRODUCTION-ROLLOUT-PLAN.md` (one row per migration:
how it runs, what it needs, its rollback).

**Every session:** work in `~/"Claude Projects/Passport-Portal"` on `portal-work`; `~/.mineex-prod-dsn` and
`~/.mineex-prod-ca.crt` exist (mode 600; the CA file makes every production connection verify Supabase's
certificate); today's backup has run (Supabase → Database → Backups). Each migration line: the runner shows
the file, you **type the project ID**, it applies ONE file, checks its checkpoint, prints the before/after
diff and stops on the first failure.

**Stop rules (every step):** a checkpoint reads false, the diff shows anything the step does not name, a
smoke FAIL, a 5xx rise in Vercel, or any investor-app or mineex.ca regression → stop, roll back THAT step,
tell Claude. Roll back one file:
```bash
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --rollback --only <file> --ref=rvptronniomlqumjhyrr --approved-by="<you>, rollback"
```
Lossy rollbacks also need `--accept-data-loss="<why>"`. **Never** roll back 0071 while 0088 is applied;
never run 0059's rollback.

## Step 1 — code deploy (APPROVAL A2)

`portal-work` now carries the messaging change 0096 relies on (company-started threads record
`started_by`; the portal names the sending company). Merge `portal-work` into `main` (PR, as for #1);
Vercel deploys passport. It works before and after 0096, so it goes first.
- Check: `node scripts/prod-check.mjs --stage=deploy` (with the CA and DSN variables) → 0 FAIL.
- Rollback: Vercel → Deployments → previous Production → Instant Rollback (no data involved).

## Phase 3 group A — lead forms and listing reports (APPROVAL B)

```bash
# 1. 0058_close_public_insert.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0058_close_public_insert.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 3 approval in Claude chat"
# 2. 0095_public_lead_form_guard.sql   (keeps mineex.ca's lead forms working after 0058 (run straight after it))
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0095_public_lead_form_guard.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 3 approval in Claude chat"
# 3. 0077_listing_reports_installed_app_compat.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0077_listing_reports_installed_app_compat.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 3 approval in Claude chat"
# 4. 0092_listing_reports_column_insert.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0092_listing_reports_column_insert.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 3 approval in Claude chat"
# 5. 0093_listing_reports_rate_limit.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0093_listing_reports_rate_limit.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 3 approval in Claude chat"
```
Checkpoint after the phase (read-only unless stated):
```bash
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/prod-check.mjs --stage=phase3
```
- `prod-check --stage=phase3`: every Phase 3 marker PASS, 0 FAIL.
- **mineex.ca homepage form** (you, in a browser): submit the form at the bottom of https://mineex.ca with name `Launch test`, your email, company `MineEx test`. Expect "Thanks — we'll be in touch shortly." Then tell Claude, who deletes that one row (read-write, with your OK).
- Installed app: Report a listing still sends (the smoke covers the request shape).

## Phase 4 — messaging, notifications, analytics, Mine IQ (APPROVAL C)

```bash
# 6. 0062_message_attachments.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0062_message_attachments.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
# 7. 0063_company_initiated_threads.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0063_company_initiated_threads.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
# 8. 0096_conversations_legacy_upsert.sql   (keeps mineex.ca/app investor messaging working after 0063 (run straight after it))
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0096_conversations_legacy_upsert.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
# 9. 0064_notification_clearing.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0064_notification_clearing.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
# 10. 0065a_analytics_breakdown.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0065a_analytics_breakdown.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
# 11. 0065b_engagement_corrections.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0065b_engagement_corrections.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
# 12. 0065c_analytics_indexes.sql   (runs outside a transaction (index build); the runner handles it)
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0065c_analytics_indexes.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
# 13. 0066_mineiq_conversations.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0066_mineiq_conversations.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 4 approval in Claude chat"
```
Checkpoint after the phase (read-only unless stated):
```bash
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/prod-check.mjs --stage=phase4
```
- `prod-check --stage=phase4`: 0 FAIL.
- **mineex.ca/app messaging** (you): signed in as the smoke investor at https://mineex.ca/app, message the test company (or any company you own). Expect the message to send (no "Couldn't send"). Send a second one: same thread.
- Portal (passport host): the inbox loads; a company-to-company thread can be started (after Phase 5, when roles exist).

## Phase 5 — website contract, publishing, drafts, roles (APPROVAL D)

```bash
# 14. 0068_site_contract.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0068_site_contract.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 15. 0069b_stripe_events.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0069b_stripe_events.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 16. 0071_publishing_reliability.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0071_publishing_reliability.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 17. 0072_profile_drafts.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0072_profile_drafts.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 18. 0073a_impression_dedupe_index.sql   (runs outside a transaction (index build); the runner handles it)
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0073a_impression_dedupe_index.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 19. 0073b_impression_tracking.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0073b_impression_tracking.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 20. 0073c_post_events_client_guard.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0073c_post_events_client_guard.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 21. 0074_profile_revision_history.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0074_profile_revision_history.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 22. 0075_profile_versions_privileges.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0075_profile_versions_privileges.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 23. 0076_company_roles.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0076_company_roles.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
# 24. 0078_storage_role_hardening.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0078_storage_role_hardening.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5 approval in Claude chat"
```
Checkpoint after the phase (read-only unless stated):
```bash
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/prod-check.mjs --stage=phase5
```
- `prod-check --stage=phase5`: 0 FAIL (owner/viewer role checks now run).

## Phase 5b — search, booths, services, fan-out, notification clearing (APPROVAL E)

```bash
# 25. 0080_mineiq_search_any_term.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0080_mineiq_search_any_term.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
# 26. 0085_conference_booth_config.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0085_conference_booth_config.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
# 27. 0086_service_requests.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0086_service_requests.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
# 28. 0087_audience_events.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0087_audience_events.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
# 29. 0088_content_fanout.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0088_content_fanout.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
# 30. 0090_notification_clear_roles.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0090_notification_clear_roles.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
# 31. 0091_notification_clear_no_platform_admin.sql
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/apply-migrations-production.mjs --apply --only 0091_notification_clear_no_platform_admin.sql --ref=rvptronniomlqumjhyrr --approved-by="<your name>, <date>, Phase 5b approval in Claude chat"
```
Checkpoint after the phase (read-only unless stated):
```bash
PRODUCTION_DB_CA_FILE=~/.mineex-prod-ca.crt PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/prod-check.mjs --stage=phase5b
```
- `prod-check --stage=phase5b`, then `--stage=final`: 0 FAIL.

## After Phase 5b — you

Create the draft test company, hand it to the test owner, the owner invites the viewer
(`docs/PRODUCTION-TEST-ACCOUNTS.md` §2–4). Then `prod-check --stage=final` with accounts.

## Pilot

After 24 h with no 5xx rise and a clean `final`: hand the portal to 2–3 pilot companies (Admin → Hand off).
Then delete the connection file: `rm ~/.mineex-prod-dsn`.
