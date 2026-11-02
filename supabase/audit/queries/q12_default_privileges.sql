-- READ-ONLY. Query 12 of 13 — default_privileges
-- Split from supabase/audit/schema_recovery_extract.sql.
-- Catalog metadata only; selects no table data. Skim any function source or
-- expression column for credentials before sending the result back.

-- ════════════════════════════════════════════════════════════════════════════
-- 12. DEFAULT PRIVILEGES — the mechanism, not the symptom.
--
--     This is WHY the anon over-grant keeps coming back. Supabase ships ALTER
--     DEFAULT PRIVILEGES entries that grant anon and authenticated every verb on
--     each newly created table and EXECUTE on each new function. Migrations
--     0052, 0053 and 0056 each cleaned up after it without changing it, which is
--     why 0057 revokes its own grants in the same file that creates the table.
--
--     Staging must carry the SAME defaults, or a replay produces different
--     grants from production and the comparison in requirement 4 is meaningless.
-- ════════════════════════════════════════════════════════════════════════════
select
  coalesce(pg_get_userbyid(d.defaclrole), '(any)') as granting_role,
  coalesce(n.nspname, '(all schemas)')             as schema_name,
  case d.defaclobjtype
    when 'r' then 'table'    when 'S' then 'sequence'
    when 'f' then 'function' when 'T' then 'type'
    when 'n' then 'schema'   else d.defaclobjtype::text end as object_type,
  array_to_string(d.defaclacl, ' | ')              as default_privileges
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
order by schema_name, object_type, granting_role;
