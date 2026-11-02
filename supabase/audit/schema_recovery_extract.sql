-- schema_recovery_extract.sql
-- READ-ONLY. Run in the PRODUCTION Supabase SQL editor.
--
-- PURPOSE
-- -------
-- Capture every database object that exists in production but has no definition
-- in supabase/migrations/, so a baseline migration can be written from
-- authoritative metadata rather than inferred from application code.
--
-- Known gaps this is meant to close:
--   • tables created by hand in the prototype era and never captured:
--       companies, profiles, contact_submissions, demo_bookings
--   • public.is_admin() -- 59 references across 20 migrations, 0 definitions
--   • whatever else this extract turns up
--
-- SAFETY
-- ------
-- Every statement below reads CATALOG METADATA ONLY. None of them select a
-- single row of table data, so no customer information, message body, document
-- or credential can appear in the output.
--
-- TWO THINGS TO CHECK BEFORE YOU SEND ANY RESULT BACK:
--
--   1. Query 6 returns FUNCTION SOURCE. A SECURITY DEFINER function can legally
--      contain a hard-coded key. Skim the `definition` column for anything
--      resembling a credential -- 'sk-', 'eyJ', 'postmark', 'Bearer ', or a long
--      opaque string. If you find one, REDACT it and tell me the function name
--      instead. I do not need the secret to write the baseline; I need to know
--      the function exists and what shape it has.
--
--   2. DO NOT run `select * from public.app_secrets` or any variant. Nothing
--      here does. That table's contents are not needed and must not be pasted.
--
-- RETURNING RESULTS
-- -----------------
-- Each query is numbered and independent. The Supabase SQL editor shows only the
-- LAST statement's result set, so run them ONE AT A TIME.
--
-- For wide or long results (6, 7, 8) use the editor's "Download CSV" and send the
-- file -- pasting a truncated table loses exactly the rows that matter. For the
-- short ones, pasted text is fine. Label each with its query number.


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


-- ════════════════════════════════════════════════════════════════════════════
-- 3. INDEXES on those four tables. Some are created by migration 0001; the
--    overlap is expected and harmless (the baseline uses IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════════════════
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('companies','profiles','contact_submissions','demo_bookings')
order by tablename, indexname;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. TRIGGERS, all tables, user-defined only. Migrations declare 22; anything
--    else here is unversioned. Includes the auth.users trigger that fires
--    handle_new_user(), which lives OUTSIDE the public schema and is therefore
--    easy to miss when rebuilding.
-- ════════════════════════════════════════════════════════════════════════════
select
  n.nspname           as schema_name,
  c.relname           as table_name,
  t.tgname            as trigger_name,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c     on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname in ('public','auth')
order by n.nspname, c.relname, t.tgname;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. EVERY live function in public, with ownership, SECURITY DEFINER, config and
--    EXECUTE grants -- but NOT bodies (those are query 6, which is gated).
--    I diff this against the 72 the migrations define, in BOTH directions:
--    live-but-unversioned needs capturing, versioned-but-absent means a
--    migration never actually applied.
-- ════════════════════════════════════════════════════════════════════════════
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef                               as security_definer,
  pg_get_userbyid(p.proowner)               as owner,
  p.proconfig                               as config,
  coalesce(array_to_string(p.proacl, ' | '), 'NULL = PUBLIC may execute') as acl
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
order by p.proname, args;


-- ════════════════════════════════════════════════════════════════════════════
-- 6. DEFINITIONS of only the functions the migrations do NOT define.
--    The exclusion list is the 72 names found in supabase/migrations/.
--    ** SKIM THIS OUTPUT FOR CREDENTIALS BEFORE SENDING -- see the header. **
-- ════════════════════════════════════════════════════════════════════════════
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef                               as security_definer,
  pg_get_userbyid(p.proowner)               as owner,
  p.proconfig                               as config,
  coalesce(array_to_string(p.proacl, ' | '), 'NULL = PUBLIC may execute') as acl,
  pg_get_functiondef(p.oid)                 as definition
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prokind = 'f'
  and p.proname not in (
    'accept_company_invitation', 'actor_can_publish', 'admin_provision_company', 'admin_set_billing',
    'am_following', 'bump_conversation', 'bump_submission_throttle', 'can_touch_company',
    'claim_deliveries', 'claim_notification_outbox', 'claim_push_token', 'company_blueprints_set_updated_at',
    'company_conversation_senders', 'company_engagement_daily', 'company_engagement_totals', 'company_follower_count',
    'company_go_live', 'company_has_agreement', 'company_has_feature', 'company_notifications',
    'company_owner_guard', 'company_post_engagement', 'complete_delivery', 'create_company_invitation',
    'delete_own_account', 'docs_path_company', 'feed_discover', 'feed_following',
    'feed_latest', 'finish_notification_outbox', 'get_preview_company', 'handle_new_user',
    'idg_arr', 'idg_block', 'idg_bool', 'idg_enc',
    'idg_note', 'idg_part', 'idg_section', 'inventory_digest',
    'mark_conversation_read', 'mark_notifications_seen', 'mineiq_search', 'my_company_role',
    'my_features', 'outbox_health', 'owns_company', 'owns_company_slug',
    'peek_company_invitation', 'persist_canonical', 'persist_verification', 'phase3_0041_append_only',
    'phase3_append_only', 'phase3_no_truncate', 'plan_for_tier', 'portal_readiness',
    'post_engagement', 'prune_submission_throttle', 'publish_publication', 'reconcile_outbox',
    'record_company_agreement', 'release_push_token', 'release_revisions_append_only', 'replay_delivery',
    'revise_publication', 'safe_uuid', 'sha256_hex', 'source_transcripts_no_update',
    'sync_owner_membership', 'touch_updated_at', 'unpublish_publication', 'upsert_timeline_entry'
  )
order by p.proname;


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
