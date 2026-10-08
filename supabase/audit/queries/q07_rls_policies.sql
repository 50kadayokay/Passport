-- READ-ONLY. Query 7 of 13 — rls_policies
-- Split from supabase/audit/schema_recovery_extract.sql.
-- Catalog metadata only; selects no table data. Skim any function source or
-- expression column for credentials before sending the result back.

-- ════════════════════════════════════════════════════════════════════════════
-- 7. ALL RLS policies, every table. Needed for the baseline AND for Phase 4's
--    TO public -> TO authenticated analysis, which must account for
--    PostgreSQL ORing permissive policies together. Use Download CSV.
-- ════════════════════════════════════════════════════════════════════════════
select schemaname, tablename, policyname, permissive, roles::text as applies_to,
       cmd, qual as using_expr, with_check as check_expr
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;
