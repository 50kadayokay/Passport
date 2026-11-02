-- ROLLBACK for 0094_company_follows_upsert_grant.sql. Revokes exactly the
-- column grant 0094 adds, which leaves 0061a's grants on company_follows
-- (authenticated: select, insert, delete; anon: nothing). Installed apps'
-- follow() (merge-duplicates) is refused again (42501).
-- Verified in a rolled-back transaction by scripts/company-follows-0094-check.mjs.
begin;

revoke update (user_id, company_id) on public.company_follows from authenticated;

commit;
