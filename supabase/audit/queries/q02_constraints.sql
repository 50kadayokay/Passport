-- READ-ONLY. Query 2 of 13 — constraints
-- Split from supabase/audit/schema_recovery_extract.sql.
-- Catalog metadata only; selects no table data. Skim any function source or
-- expression column for credentials before sending the result back.

-- ════════════════════════════════════════════════════════════════════════════
-- 2. CONSTRAINTS on those four tables -- primary keys, foreign keys, unique,
--    check. pg_get_constraintdef emits ready-to-use DDL.
-- ════════════════════════════════════════════════════════════════════════════
select
  c.relname::text          as table_name,
  con.conname::text        as constraint_name,
  case con.contype when 'p' then 'primary key' when 'f' then 'foreign key'
                   when 'u' then 'unique'      when 'c' then 'check'
                   when 'x' then 'exclude'     else con.contype::text end as kind,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c     on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('companies','profiles','contact_submissions','demo_bookings')
order by table_name, kind, constraint_name;
