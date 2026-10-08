-- READ-ONLY. Query 1 of 13 — columns_four_tables
-- Split from supabase/audit/schema_recovery_extract.sql.
-- Catalog metadata only; selects no table data. Skim any function source or
-- expression column for credentials before sending the result back.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. COLUMN DEFINITIONS for the four unversioned tables, emitted as DDL.
--    Generated rather than described, so the baseline is a copy and not a
--    reconstruction. Review the output before it is committed.
-- ════════════════════════════════════════════════════════════════════════════
select
  'create table if not exists public.' || c.relname || ' (' || E'\n' ||
  string_agg(
    '  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
      || case when a.attidentity <> '' then ' generated ' ||
           case a.attidentity when 'a' then 'always' else 'by default' end || ' as identity'
         else coalesce(' default ' || pg_get_expr(ad.adbin, ad.adrelid), '') end
      || case when a.attnotnull then ' not null' else '' end,
    ',' || E'\n' order by a.attnum)
  || E'\n);' as ddl
from pg_class c
join pg_namespace n  on n.oid = c.relnamespace
join pg_attribute a  on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('companies','profiles','contact_submissions','demo_bookings')
group by c.relname
order by c.relname;
