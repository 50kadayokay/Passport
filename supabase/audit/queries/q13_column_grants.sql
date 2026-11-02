-- READ-ONLY. Query 13 of 13 — column_grants
-- Split from supabase/audit/schema_recovery_extract.sql.
-- Catalog metadata only; selects no table data. Skim any function source or
-- expression column for credentials before sending the result back.

-- ════════════════════════════════════════════════════════════════════════════
-- 13. COLUMN-LEVEL grants, if any exist.
--     attacl is NULL unless a column was granted explicitly, so an empty result
--     is the expected and desirable answer -- it means table-level grants tell
--     the whole story and the baseline needs no per-column work.
-- ════════════════════════════════════════════════════════════════════════════
select
  c.relname::text as table_name,
  a.attname::text as column_name,
  array_to_string(a.attacl, ' | ') as column_grants
from pg_attribute a
join pg_class c     on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and a.attnum > 0 and not a.attisdropped
  and a.attacl is not null
order by table_name, column_name;
