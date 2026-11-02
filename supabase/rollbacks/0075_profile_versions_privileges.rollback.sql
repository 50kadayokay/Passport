-- ROLLBACK for 0075_profile_versions_privileges.sql: restores the previous
-- (Supabase default) grants exactly. Verified by
-- scripts/profile-versions-privileges-check.mjs.
begin;
grant all on public.company_profile_versions to anon;
grant all on public.company_profile_versions to authenticated;
commit;
