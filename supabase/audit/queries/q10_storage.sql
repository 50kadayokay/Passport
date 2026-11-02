-- READ-ONLY. Query 10 of 13 — storage
-- Split from supabase/audit/schema_recovery_extract.sql.
-- Catalog metadata only; selects no table data. Skim any function source or
-- expression column for credentials before sending the result back.

-- ════════════════════════════════════════════════════════════════════════════
-- 10. STORAGE buckets and their policies. The migrations reference
--     company-docs, company-media and company-media-private. The isolation
--     suite needs the AUTHORITATIVE list, because a bucket name that does not
--     exist returns 404, which the suite reads as "access denied" -- a wrong
--     name is a FALSE PASS.
-- ════════════════════════════════════════════════════════════════════════════
-- 10a --
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets order by name;

-- 10b --
select policyname, roles::text as applies_to, cmd,
       qual as using_expr, with_check as check_expr
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
