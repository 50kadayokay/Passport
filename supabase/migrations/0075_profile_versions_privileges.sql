-- ============================================================================
-- 0075_profile_versions_privileges.sql — a05 follow-up. APPLIED TO STAGING ONLY (2026-10-31); NOT production.
-- Verified in a rolled-back staging transaction by
-- scripts/profile-versions-privileges-check.mjs.
--
-- FOUND 2026-10-31: anon and authenticated held EVERY table privilege on
-- company_profile_versions (SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES, TRIGGER) -- Supabase's default grant, which 0061a's privilege
-- hardening never covered for this table. RLS (0013/0074) already limits ROWS
-- to the owner or a platform admin, and PostgREST cannot issue TRUNCATE, but a
-- privilege that bypasses RLS (TRUNCATE) or that no path needs should not
-- exist.
--
-- WHAT IS NEEDED, AND KEPT:
--   authenticated: SELECT, INSERT, DELETE -- the admin tools (profileVersions.js:
--     listVersions, snapshotProfile, pruneVersions) and an owner, through RLS.
--   service_role: unchanged (the 0072/0074 functions run as the definer anyway).
-- WHAT IS REMOVED:
--   anon: everything (no logged-out surface reads snapshots).
--   authenticated: UPDATE (no update policy exists; kind is frozen by 0074),
--     TRUNCATE (bypasses RLS and the retention trigger), REFERENCES, TRIGGER.
-- Company deletion cascades as the table owner and is unaffected.
-- ROLLBACK: supabase/rollbacks/0075_profile_versions_privileges.rollback.sql
-- ============================================================================

begin;
revoke all on public.company_profile_versions from anon;
revoke update, truncate, references, trigger on public.company_profile_versions from authenticated;
grant select, insert, delete on public.company_profile_versions to authenticated;
commit;
