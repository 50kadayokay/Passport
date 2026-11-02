-- READ-ONLY. Query 9 of 13 — rls_sequences_types_extensions
-- Split from supabase/audit/schema_recovery_extract.sql.
-- Catalog metadata only; selects no table data. Skim any function source or
-- expression column for credentials before sending the result back.

-- ════════════════════════════════════════════════════════════════════════════
-- 9. RLS status, plus sequences, custom types, views and extensions. The
--    migrations declare no custom types and one view (news_public); anything
--    else is unversioned. Extensions matter because a fresh project does not
--    enable pgcrypto, uuid-ossp or pg_trgm by default and several migrations
--    assume them.
-- ════════════════════════════════════════════════════════════════════════════
select 'rls'::text as kind, c.relname::text as name,
       ('rls:' || c.relrowsecurity::text || ' forced:' || c.relforcerowsecurity::text)::text as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
union all
select 'sequence'::text, c.relname::text, pg_get_userbyid(c.relowner)::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'S'
union all
select 'type'::text, t.typname::text, t.typtype::text
  from pg_type t join pg_namespace n on n.oid = t.typnamespace
 where n.nspname = 'public' and t.typtype in ('e','d')
union all
select 'view'::text, c.relname::text, ''::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('v','m')
union all
select 'extension'::text, extname::text, extversion::text from pg_extension
order by kind, name;
