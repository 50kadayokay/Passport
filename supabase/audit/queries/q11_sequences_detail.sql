-- READ-ONLY. Query 11 of 13 — sequences_detail
-- Split from supabase/audit/schema_recovery_extract.sql.
-- Catalog metadata only; selects no table data. Skim any function source or
-- expression column for credentials before sending the result back.

-- ════════════════════════════════════════════════════════════════════════════
-- 11. SEQUENCES in full, plus what owns them.
--     Requirement: the baseline must reproduce sequences, not just note that
--     they exist. A serial/identity column whose sequence starts at the wrong
--     value collides on the first insert in staging.
-- ════════════════════════════════════════════════════════════════════════════
-- 11a --
select schemaname, sequencename, start_value, min_value, max_value,
       increment_by, cycle, cache_size
from pg_sequences
where schemaname = 'public'
order by sequencename;

-- 11b -- which table/column each sequence belongs to
select
  s.relname::text as sequence_name,
  t.relname::text as owned_by_table,
  a.attname::text as owned_by_column,
  d.deptype::text as dependency
from pg_class s
join pg_namespace n on n.oid = s.relnamespace
join pg_depend d   on d.objid = s.oid and d.classid = 'pg_class'::regclass
join pg_class t    on t.oid = d.refobjid
join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
where n.nspname = 'public' and s.relkind = 'S' and d.deptype in ('a', 'i')
order by sequence_name;
