-- ============================================================================
-- 0094_company_follows_upsert_grant.sql — NOT APPLIED. Prepared for review (S3).
--
-- company_follows: UPDATE on (user_id, company_id) for authenticated, so the
-- installed apps' follow() keeps working after 0061a.
--
-- WHY. Every store build (1.0 to 1.3.2, prod-v1.3.2 src/lib/feed.js follow())
-- POSTs { user_id, company_id } to company_follows with
-- Prefer: resolution=merge-duplicates. PostgREST sends that as
--   INSERT ... ON CONFLICT (id) DO UPDATE SET user_id = ..., company_id = ...
-- and PostgreSQL requires UPDATE on the SET columns for any ON CONFLICT DO
-- UPDATE, whether or not a row conflicts. 0061a re-grants only select, insert
-- and delete, so that request fails with 42501 (reproduced on staging by S4:
-- 403 with merge-duplicates, 201 with ignore-duplicates). The fix in code
-- (ignore-duplicates, 3212e72) is in no store build. Found by
-- docs/INSTALLED-APP-COMPATIBILITY-MATRIX.md (row I12).
--
-- WHY IT CHANGES NOTHING ELSE. company_follows has no UPDATE policy for
-- non-admins: 0009 defines own_select, own_insert, own_delete and admin_all
-- (is_admin() only), and no pending migration adds one. With RLS on, a
-- non-admin UPDATE therefore matches no row, and an ON CONFLICT that hits an
-- existing row is refused by RLS. The grant only satisfies the privilege check
-- the planner makes for ON CONFLICT DO UPDATE. Two columns, not the table:
-- exactly the SET list PostgREST builds from the app's payload.
--
-- SELF-CHECK. The migration refuses to run (and changes nothing) unless RLS is
-- on for company_follows and every UPDATE/ALL policy on it is admin-only
-- (is_admin()), i.e. the premise above holds in the database it runs on.
--
-- WHAT DOES NOT CHANGE. 0061a's select/insert/delete; anon (nothing); every
-- policy; post_events, post_likes, user_company_relationships; the service role.
--
-- Needs: 0061a. Production: run it right after 0061a (Phase 3).
-- ROLLBACK: supabase/rollbacks/0094_company_follows_upsert_grant.rollback.sql
-- Verified in a rolled-back transaction by scripts/company-follows-0094-check.mjs.
-- ============================================================================

begin;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.company_follows'::regclass) then
    raise exception '0094: RLS is off on company_follows; refusing to grant UPDATE' using errcode = '55000';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'company_follows'
                and cmd in ('UPDATE', 'ALL')
                and coalesce(qual, '') !~ '^\(?(public\.)?is_admin\(\)\)?$') then
    raise exception '0094: company_follows has a non-admin UPDATE policy; refusing to grant UPDATE' using errcode = '55000';
  end if;
end $$;

grant update (user_id, company_id) on public.company_follows to authenticated;

commit;
