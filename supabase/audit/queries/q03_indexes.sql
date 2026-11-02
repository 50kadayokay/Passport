-- READ-ONLY. Query 3 of 13 — indexes
-- Split from supabase/audit/schema_recovery_extract.sql.
-- Catalog metadata only; selects no table data. Skim any function source or
-- expression column for credentials before sending the result back.

-- ════════════════════════════════════════════════════════════════════════════
-- 3. INDEXES on those four tables. Some are created by migration 0001; the
--    overlap is expected and harmless (the baseline uses IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════════════════
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('companies','profiles','contact_submissions','demo_bookings')
order by tablename, indexname;
