-- READ-ONLY. ALL 13 queries in ONE statement, returning one JSON document.
--
-- WHY THIS EXISTS
-- ---------------
-- The Supabase SQL editor shows only the LAST statement's result, so the split
-- files in supabase/audit/queries/ have to be run one at a time -- thirteen
-- copy-paste-run cycles. This is the same information as a single row you can
-- download once.
--
-- Catalog metadata only. Not one sub-query selects a row of table data, so no
-- company profile, message, document or assay can appear in the output.
--
-- BEFORE SENDING THE RESULT BACK: the `functions_unversioned` section contains
-- function SOURCE. A SECURITY DEFINER body may legally hold a hard-coded key.
-- Search the output for 'sk-', 'eyJ', 'postmark' and 'Bearer ' and redact
-- anything that looks like a credential -- the function NAME is all that is
-- needed to write the baseline.
--
-- If this errors, one sub-query is unhappy with your Postgres version; fall back
-- to supabase/audit/queries/q01..q13, which isolate the failure.

select jsonb_pretty(jsonb_build_object(

  -- 1. column definitions for the four unversioned tables, as DDL
  'columns_ddl', (
    select jsonb_object_agg(t.relname, t.ddl) from (
      select c.relname,
        'create table if not exists public.' || c.relname || ' (' || chr(10) ||
        string_agg(
          '  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
            || case when a.attidentity <> '' then ' generated '
                 || case a.attidentity when 'a' then 'always' else 'by default' end
                 || ' as identity'
               else coalesce(' default ' || pg_get_expr(ad.adbin, ad.adrelid), '') end
            || case when a.attnotnull then ' not null' else '' end,
          ',' || chr(10) order by a.attnum) || chr(10) || ');' as ddl
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('companies','profiles','contact_submissions','demo_bookings')
      group by c.relname) t),

  -- 2. constraints on those four
  'constraints', (
    select jsonb_agg(jsonb_build_object('table', c.relname, 'name', con.conname,
             'type', con.contype::text, 'definition', pg_get_constraintdef(con.oid))
             order by c.relname, con.conname)
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('companies','profiles','contact_submissions','demo_bookings')),

  -- 3. indexes on those four
  'indexes', (
    select jsonb_agg(jsonb_build_object('table', tablename, 'name', indexname,
             'definition', indexdef) order by tablename, indexname)
    from pg_indexes where schemaname = 'public'
      and tablename in ('companies','profiles','contact_submissions','demo_bookings')),

  -- 4. ALL user triggers, public AND auth (the auth.users one is easy to miss)
  'triggers', (
    select jsonb_agg(jsonb_build_object('schema', n.nspname, 'table', c.relname,
             'name', t.tgname, 'definition', pg_get_triggerdef(t.oid))
             order by n.nspname, c.relname, t.tgname)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname in ('public','auth')),

  -- 5. every function's metadata, no bodies
  'functions_all', (
    select jsonb_agg(jsonb_build_object('name', proname,
             'args', pg_get_function_identity_arguments(oid),
             'security_definer', prosecdef, 'owner', pg_get_userbyid(proowner),
             'config', proconfig,
             'acl', coalesce(array_to_string(proacl, ' | '), 'NULL = PUBLIC may execute'))
             order by proname)
    from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f'),

  -- 6. definitions of ONLY the functions the migrations do not define
  --    ** SKIM THIS FOR CREDENTIALS BEFORE SENDING **
  'functions_unversioned', (
    select jsonb_agg(jsonb_build_object('name', proname,
             'args', pg_get_function_identity_arguments(oid),
             'security_definer', prosecdef, 'owner', pg_get_userbyid(proowner),
             'config', proconfig,
             'acl', coalesce(array_to_string(proacl, ' | '), 'NULL = PUBLIC may execute'),
             'definition', pg_get_functiondef(oid)) order by proname)
    from pg_proc
    where pronamespace = 'public'::regnamespace and prokind = 'f'
      and proname not in (
        'accept_company_invitation', 'actor_can_publish', 'admin_provision_company', 'admin_set_billing', 'am_following', 'bump_conversation',
        'bump_submission_throttle', 'can_touch_company', 'claim_deliveries', 'claim_notification_outbox', 'claim_push_token', 'company_blueprints_set_updated_at',
        'company_conversation_senders', 'company_engagement_daily', 'company_engagement_totals', 'company_follower_count', 'company_go_live', 'company_has_agreement',
        'company_has_feature', 'company_notifications', 'company_owner_guard', 'company_post_engagement', 'complete_delivery', 'create_company_invitation',
        'delete_own_account', 'docs_path_company', 'feed_discover', 'feed_following', 'feed_latest', 'finish_notification_outbox',
        'get_preview_company', 'handle_new_user', 'idg_arr', 'idg_block', 'idg_bool', 'idg_enc',
        'idg_note', 'idg_part', 'idg_section', 'inventory_digest', 'mark_conversation_read', 'mark_notifications_seen',
        'mineiq_search', 'my_company_role', 'my_features', 'outbox_health', 'owns_company', 'owns_company_slug',
        'peek_company_invitation', 'persist_canonical', 'persist_verification', 'phase3_0041_append_only', 'phase3_append_only', 'phase3_no_truncate',
        'plan_for_tier', 'portal_readiness', 'post_engagement', 'prune_submission_throttle', 'publish_publication', 'reconcile_outbox',
        'record_company_agreement', 'release_push_token', 'release_revisions_append_only', 'replay_delivery', 'revise_publication', 'safe_uuid',
        'sha256_hex', 'source_transcripts_no_update', 'sync_owner_membership', 'touch_updated_at', 'unpublish_publication', 'upsert_timeline_entry'
      )),

  -- 7. all RLS policies
  'policies', (
    select jsonb_agg(jsonb_build_object('table', tablename, 'name', policyname,
             'permissive', permissive, 'roles', roles::text, 'cmd', cmd,
             'using', qual, 'check', with_check) order by tablename, cmd, policyname)
    from pg_policies where schemaname = 'public'),

  -- 8. table grants by role
  'table_grants', (
    select jsonb_agg(jsonb_build_object('table', table_name, 'grantee', grantee,
             'privileges', privs) order by table_name, grantee)
    from (select table_name, grantee,
                 string_agg(privilege_type, ', ' order by privilege_type) as privs
          from information_schema.role_table_grants
          where table_schema = 'public'
            and grantee in ('anon','authenticated','service_role','postgres','PUBLIC')
          group by table_name, grantee) g),

  -- 9a. RLS status per table
  'rls', (
    select jsonb_object_agg(c.relname,
             jsonb_build_object('enabled', c.relrowsecurity, 'forced', c.relforcerowsecurity))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'),

  -- 9b. extensions, types, views
  'extensions', (select jsonb_object_agg(extname, extversion) from pg_extension),
  'custom_types', (
    select jsonb_agg(jsonb_build_object('name', t.typname, 'kind', t.typtype::text))
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype in ('e','d')),
  'views', (
    select jsonb_agg(c.relname::text order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v','m')),

  -- 10. storage
  'storage_buckets', (
    select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'public', public,
             'size_limit', file_size_limit, 'mime', allowed_mime_types) order by name)
    from storage.buckets),
  'storage_policies', (
    select jsonb_agg(jsonb_build_object('name', policyname, 'roles', roles::text,
             'cmd', cmd, 'using', qual, 'check', with_check) order by policyname)
    from pg_policies where schemaname = 'storage' and tablename = 'objects'),

  -- 11. sequences, and what owns them
  'sequences', (
    select jsonb_agg(jsonb_build_object('name', sequencename, 'start', start_value,
             'min', min_value, 'max', max_value, 'increment', increment_by,
             'cycle', cycle, 'cache', cache_size) order by sequencename)
    from pg_sequences where schemaname = 'public'),
  'sequence_owners', (
    select jsonb_agg(jsonb_build_object('sequence', s.relname::text,
             'table', t.relname::text, 'column', a.attname::text,
             'deptype', d.deptype::text) order by s.relname)
    from pg_class s
    join pg_namespace n on n.oid = s.relnamespace
    join pg_depend d on d.objid = s.oid and d.classid = 'pg_class'::regclass
    join pg_class t on t.oid = d.refobjid
    join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
    where n.nspname = 'public' and s.relkind = 'S' and d.deptype in ('a','i')),

  -- 12. DEFAULT privileges -- the mechanism behind the recurring anon over-grant
  'default_privileges', (
    select jsonb_agg(jsonb_build_object(
             'granting_role', coalesce(pg_get_userbyid(d.defaclrole), '(any)'),
             'schema', coalesce(n.nspname, '(all)'),
             'object_type', case d.defaclobjtype
               when 'r' then 'table' when 'S' then 'sequence'
               when 'f' then 'function' when 'T' then 'type'
               when 'n' then 'schema' else d.defaclobjtype::text end,
             'privileges', array_to_string(d.defaclacl, ' | ')))
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace),

  -- 13. column-level grants (empty is the expected answer)
  'column_grants', (
    select jsonb_agg(jsonb_build_object('table', c.relname::text,
             'column', a.attname::text, 'grants', array_to_string(a.attacl, ' | ')))
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
      and a.attacl is not null)

)) as schema_snapshot;
