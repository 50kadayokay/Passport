-- READ-ONLY. Query 4 of 13 — triggers
-- Split from supabase/audit/schema_recovery_extract.sql.
-- Catalog metadata only; selects no table data. Skim any function source or
-- expression column for credentials before sending the result back.

-- ════════════════════════════════════════════════════════════════════════════
-- 4. TRIGGERS, all tables, user-defined only. Migrations declare 22; anything
--    else here is unversioned. Includes the auth.users trigger that fires
--    handle_new_user(), which lives OUTSIDE the public schema and is therefore
--    easy to miss when rebuilding.
-- ════════════════════════════════════════════════════════════════════════════
select
  n.nspname           as schema_name,
  c.relname           as table_name,
  t.tgname            as trigger_name,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c     on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname in ('public','auth')
order by n.nspname, c.relname, t.tgname;
