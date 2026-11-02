-- READ-ONLY. Query 8 of 13 — table_grants
-- Split from supabase/audit/schema_recovery_extract.sql.
-- Catalog metadata only; selects no table data. Skim any function source or
-- expression column for credentials before sending the result back.

-- ════════════════════════════════════════════════════════════════════════════
-- 8. GRANTS on every public table, by role. Establishes the real starting point
--    for the anon-privilege cleanup and shows which grants the baseline must
--    reproduce. Use Download CSV.
-- ════════════════════════════════════════════════════════════════════════════
select table_name, grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated','service_role','postgres','PUBLIC')
group by table_name, grantee
order by table_name, grantee;
