-- READ-ONLY. Query 5 of 13 — functions_all_metadata
-- Split from supabase/audit/schema_recovery_extract.sql.
-- Catalog metadata only; selects no table data. Skim any function source or
-- expression column for credentials before sending the result back.

-- ════════════════════════════════════════════════════════════════════════════
-- 5. EVERY live function in public, with ownership, SECURITY DEFINER, config and
--    EXECUTE grants -- but NOT bodies (those are query 6, which is gated).
--    I diff this against the 72 the migrations define, in BOTH directions:
--    live-but-unversioned needs capturing, versioned-but-absent means a
--    migration never actually applied.
-- ════════════════════════════════════════════════════════════════════════════
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef                               as security_definer,
  pg_get_userbyid(p.proowner)               as owner,
  p.proconfig                               as config,
  coalesce(array_to_string(p.proacl, ' | '), 'NULL = PUBLIC may execute') as acl
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
order by p.proname, args;
