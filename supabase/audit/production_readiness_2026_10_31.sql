-- Production readiness audit, 2026-10-31.
-- TARGET: the PRODUCTION Supabase project rvptronniomlqumjhyrr. Nowhere else.
--
-- READ-ONLY. Every statement below is a SELECT (or WITH ... SELECT). It reads
-- catalogue metadata and aggregate COUNTS of a few application tables. It
-- writes nothing, grants nothing, changes no setting and takes no lock beyond
-- the ordinary ACCESS SHARE a SELECT takes. scripts/audit-sql-readonly-check.mjs
-- verifies that mechanically (it is part of `npm test`). Run it inside a
-- read-only transaction as well (scripts/production-audit-run.mjs does: the
-- server then refuses any write even if one slipped past review).
--
-- WHAT IT RETURNS: counts, booleans, names of tables/columns/policies/roles,
-- and md5 digests. NEVER emails, names, tokens, message text or function and
-- policy SOURCE. Two expressions read secret-bearing catalogue columns --
-- pg_get_functiondef and policy qual/with_check -- but only ever through md5()
-- or a boolean regex test, so their text never appears in the output. Skim the
-- output for credentials anyway before sharing it; there should be none.
--
-- Statements are independent and numbered Q00-Q15; a missing object is
-- guarded (to_regclass / to_regprocedure) so it reports "absent" instead of
-- erroring. Q15 reads cron.job and is LAST: on a project without pg_cron it is
-- the only statement that can error, and nothing after it is lost.
-- ═══════════════════════════════════════════════════════════════════════════

-- Q00 · Identity. Confirms the connection is the intended project before
-- anything is read into the report.
select 'Q00' as q, current_database() as db, current_user as role_name,
       now() as at, split_part(version(), ' ', 2) as pg_version,
       (select count(*) from public.companies) as companies;

-- Q01 · Which migrations are on production (no ledger exists; each row tests an
-- object or privilege that only that migration creates). Verifies the
-- manifest (scripts/_migration-manifest.mjs) and decides what a production
-- rollout must apply, in order.
with m(migration, present, evidence) as (
  select '0053_phase3_0041_privilege_hardening',
         case when to_regclass('public.source_transcripts') is null then null
              else not has_table_privilege('anon', 'public.source_transcripts', 'SELECT')
                   and not has_table_privilege('authenticated', 'public.source_transcripts', 'UPDATE') end,
         'anon cannot read / authenticated cannot update source_transcripts'
  union all select '0054_phase3_0041_immutability',
         exists (select 1 from pg_trigger where tgname = 'source_transcripts_immutable'), 'trigger source_transcripts_immutable'
  union all select '0055_enable_device_push (deliberately deferred)',
         case when to_regclass('public.listener_subscriptions') is null then null
              else exists (select 1 from public.listener_subscriptions where listener = 'device_push_v1') end,
         'listener_subscriptions has device_push_v1'
  union all select '0056_function_execute_hardening',
         case when to_regprocedure('public.owns_company_slug(text)') is null then null
              else not has_function_privilege('anon', 'public.owns_company_slug(text)', 'EXECUTE') end,
         'anon cannot execute owns_company_slug(text)'
  union all select '0057_submission_throttle',
         to_regclass('public.submission_throttle') is not null, 'table submission_throttle'
  union all select '0058_close_public_insert',
         case when to_regclass('public.contact_submissions') is null then null
              else not has_table_privilege('anon', 'public.contact_submissions', 'INSERT')
                   and not has_table_privilege('anon', 'public.demo_bookings', 'INSERT') end,
         'anon cannot insert contact_submissions / demo_bookings (site forms then need /api/submit)'
  union all select '0059_auth_user_trigger',
         exists (select 1 from pg_trigger where tgname = 'on_auth_user_created'), 'trigger on_auth_user_created'
  union all select '0060_publish_actor_hardening',
         case when not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'publish_publication') then null
              else not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'publish_publication'
                                and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))) end,
         'no publish_publication overload is executable by anon or authenticated'
  union all select '0061a_table_privilege_hardening',
         case when to_regclass('public.user_company_relationships') is null then null
              else not has_table_privilege('anon', 'public.user_company_relationships', 'SELECT') end,
         'anon cannot read user_company_relationships'
  union all select '0061b_companies_column_grants',
         not has_table_privilege('anon', 'public.companies', 'SELECT'), 'anon has no table-wide SELECT on companies'
  union all select '0062_message_attachments',
         to_regclass('public.message_attachments') is not null, 'table message_attachments'
  union all select '0063_company_initiated_threads',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'conversations' and column_name = 'sender_company_id'),
         'conversations.sender_company_id'
  union all select '0064_notification_clearing',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'company_notification_reads' and column_name = 'cleared_at'),
         'company_notification_reads.cleared_at'
  union all select '0065a_analytics_breakdown',
         (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in
           ('company_content_performance', 'company_engagement_by_type', 'company_engagement_unattributed', 'company_follower_growth')) = 4,
         '4 analytics functions'
  union all select '0065b_engagement_corrections',
         coalesce((select bool_or(pg_get_functiondef(oid) ~ 'with mine as') from pg_proc
                    where pronamespace = 'public'::regnamespace and proname = 'company_engagement_totals'), false),
         'company_engagement_totals has the 0065b body (boolean only)'
  union all select '0065c_analytics_indexes',
         (select count(*) from pg_indexes where indexname in ('idx_post_likes_slug_key', 'idx_post_saves_slug_key', 'idx_ucr_slug_following')) = 3,
         '3 indexes'
  union all select '0066_mineiq_conversations',
         to_regclass('public.mineiq_threads') is not null, 'table mineiq_threads'
  union all select '0067_conference_mode_feature',
         case when to_regclass('public.features') is null then null
              else exists (select 1 from public.features where id = 'conference_mode') end,
         'features row conference_mode'
  union all select '0068_site_contract',
         to_regclass('public.site_credentials') is not null, 'table site_credentials'
  union all select '0069b_stripe_events',
         to_regclass('public.stripe_events') is not null, 'table stripe_events'
  union all select '0071_publishing_reliability',
         to_regclass('public.dispatcher_runs') is not null and to_regclass('public.ops_alerts') is not null, 'tables dispatcher_runs, ops_alerts'
  union all select '0072_profile_drafts',
         to_regclass('public.company_profile_drafts') is not null, 'table company_profile_drafts'
  union all select '0073a_impression_dedupe_index',
         exists (select 1 from pg_indexes where indexname = 'post_events_impression_once'), 'index post_events_impression_once'
  union all select '0073b_impression_tracking',
         exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'record_post_impressions'), 'function record_post_impressions'
  union all select '0073c_post_events_client_guard',
         exists (select 1 from pg_trigger where tgname = 'post_events_client_guard'), 'trigger post_events_client_guard'
  union all select '0074_profile_revision_history',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'company_profile_versions' and column_name = 'kind'),
         'company_profile_versions.kind'
  union all select '0075_profile_versions_privileges',
         case when to_regclass('public.company_profile_versions') is null then null
              else not has_table_privilege('anon', 'public.company_profile_versions', 'SELECT') end,
         'anon cannot read company_profile_versions'
  union all select '0076_company_roles',
         exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'has_company_role'), 'function has_company_role'
)
select 'Q01' as q, migration, coalesce(present::text, 'prerequisite object absent') as applied, evidence from m;

-- Q02 · D21 and the public forms. The actual columns of the three form tables
-- (does contact_submissions have `message`, and not `notes`?).
select 'Q02' as q, table_name, string_agg(column_name, ',' order by ordinal_position) as columns
  from information_schema.columns
 where table_schema = 'public' and table_name in ('contact_submissions', 'demo_bookings', 'listing_reports')
 group by table_name order by table_name;

-- Q03 · Who may write the form tables directly (0058 state), and when each last
-- received a row (are the live site forms storing anything?). Counts only.
select 'Q03' as q, t.table_name,
       has_table_privilege('anon', 'public.' || t.table_name, 'INSERT') as anon_insert,
       has_table_privilege('authenticated', 'public.' || t.table_name, 'INSERT') as authenticated_insert,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.table_name and p.cmd in ('INSERT', 'ALL')) as insert_policies
  from (values ('contact_submissions'), ('demo_bookings'), ('listing_reports')) as t(table_name)
 where to_regclass('public.' || t.table_name) is not null;

select 'Q03b' as q,
       (select count(*) from public.contact_submissions) as contact_rows,
       (select max(created_at) from public.contact_submissions) as contact_last,
       (select count(*) from public.contact_submissions where created_at > now() - interval '30 days') as contact_30d,
       (select count(*) from public.demo_bookings) as demo_rows,
       (select max(created_at) from public.demo_bookings) as demo_last,
       (select count(*) from public.demo_bookings where created_at > now() - interval '30 days') as demo_30d;

-- Q04 · Sizing 0076 (a03): membership roles in use. Who would LOSE write access
-- under the approved matrix (analyst/viewer today write freely; editors lose
-- publish/delete). Counts only.
select 'Q04' as q, role, status, count(*) as memberships, count(distinct company_id) as companies
  from public.company_memberships group by role, status order by role, status;

select 'Q04b' as q,
       (select count(*) from public.companies) as companies,
       (select count(*) from public.companies where status = 'published') as published,
       (select count(*) from public.companies where owner_id is not null) as with_account_owner,
       (select count(distinct company_id) from public.company_memberships where status = 'active' and role <> 'owner') as companies_with_non_owner_members,
       (select count(*) from public.company_memberships m join public.companies c on c.id = m.company_id
         where m.status = 'active' and m.role = 'owner' and m.user_id <> c.owner_id) as co_owner_memberships;

-- Q05 · Invitations (0076 retags existing rows as 'provision'; its rollback
-- revokes pending MEMBER invitations only). Counts by role/status, no emails.
select 'Q05' as q, role, status, (expires_at is not null and expires_at < now()) as expired, count(*) as invitations
  from public.company_invitations group by 2, 3, 4 order by 2, 3, 4;

-- Q06 · Account types (profiles.role): how many platform admins exist.
select 'Q06' as q, coalesce(role, '(null)') as role, count(*) as profiles from public.profiles group by 2 order by 2;

-- Q07 · RLS coverage: any public table WITHOUT row-level security.
select 'Q07' as q, c.relname as table_without_rls
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity
 order by 1;

-- Q08 · Policy digests on every table 0076 re-policies, so the 0076 rollback
-- (written from STAGING's catalogue) can be checked against production's real
-- policies: same digest = rollback restores production exactly. md5 only.
select 'Q08' as q, tablename, policyname, cmd, roles::text as roles,
       md5(cmd || coalesce(qual, '') || '|' || coalesce(with_check, '') || roles::text) as digest
  from pg_policies
 where schemaname = 'public' and tablename in
   ('updates', 'update_documents', 'publications', 'publication_media', 'documents', 'media_assets', 'media_asset_sources',
    'facts', 'brand_kits', 'company_destinations', 'company_blueprints', 'story_projects', 'site_credentials', 'activity_log',
    'conversations', 'messages', 'companies', 'company_invitations', 'company_memberships')
 order by tablename, policyname;

-- Q09 · Table grants that 0075/0076 change, and the s01 TRUNCATE exposure.
select 'Q09' as q, table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated')
   and table_name in ('activity_log', 'site_credentials', 'company_memberships', 'company_invitations', 'company_profile_versions', 'contact_submissions', 'demo_bookings',
                      -- tables the live investor app writes directly (0058, 0061a, 0073c change their privileges/policies)
                      'listing_reports', 'company_follows', 'post_events', 'post_likes', 'post_saves', 'user_company_relationships',
                      'investor_profiles', 'investor_preferences', 'notification_preferences', 'notification_prefs', 'companies')
 group by table_name, grantee order by table_name, grantee;

select 'Q09b' as q, count(distinct table_name) as public_tables_with_truncate_for_anon_or_authenticated
  from information_schema.role_table_grants
 where table_schema = 'public' and privilege_type = 'TRUNCATE' and grantee in ('anon', 'authenticated');

-- Q10 · Function digests (md5 only) for the functions 0072/0076 build on or
-- replace, to compare with staging and with the bodies the rollbacks restore.
select 'Q10' as q, p.oid::regprocedure::text as signature, md5(pg_get_functiondef(p.oid)) as digest,
       p.prosecdef as security_definer
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('accept_company_invitation', 'create_company_invitation', 'owns_company', 'can_touch_company',
                     'actor_can_publish', 'my_company_role', 'is_admin', 'publish_publication', 'revise_publication')
 order by 2;

-- Q11 · Volumes the pending migrations touch (row counts only).
select 'Q11' as q,
       (select count(*) from public.activity_log) as activity_log_rows,
       (select count(*) from public.activity_log where source = 'ui') as activity_ui_rows,
       (select count(*) from public.company_profile_versions) as profile_versions,
       (select count(*) from public.publications) as publications,
       (select count(*) from public.publications where status = 'published') as published_publications,
       (select count(*) from public.messages) as messages,
       (select count(*) from public.conversations) as conversations;

-- Q12 · Extensions present (database-side egress: pg_net, http, pg_cron).
select 'Q12' as q, extname, extversion from pg_extension order by 2;

-- Q13 · Storage buckets and whether each is public (no object names).
select 'Q13' as q, id as bucket, public from storage.buckets order by 2;

-- Q14 · Accounts: totals only.
select 'Q14' as q, count(*) as auth_users, count(*) filter (where email_confirmed_at is not null) as confirmed,
       count(*) filter (where last_sign_in_at > now() - interval '30 days') as signed_in_30d
  from auth.users;

-- Q16 · Sign-up safety (0059). EVERY trigger on auth.users, plus a digest of
-- handle_new_user. If production already creates profiles through a trigger
-- with another name, applying 0059 would add a second one and every new
-- investor sign-up could fail; this row set decides that before anything runs.
select 'Q16' as q, t.tgname as trigger_name, t.tgenabled as enabled, md5(pg_get_triggerdef(t.oid)) as definition_digest,
       p.oid::regprocedure::text as calls, md5(pg_get_functiondef(p.oid)) as function_digest
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
 order by t.tgname;

-- Q17 · Policies on every table the live investor app writes or reads directly
-- (md5 digests only), to compare with staging, where the investor-app
-- regression suite passes with all pending migrations applied.
select 'Q17' as q, tablename, policyname, cmd, roles::text as roles,
       md5(cmd || coalesce(qual, '') || '|' || coalesce(with_check, '') || roles::text) as digest
  from pg_policies
 where schemaname = 'public' and tablename in
   ('listing_reports', 'company_follows', 'post_events', 'post_likes', 'post_saves', 'user_company_relationships',
    'investor_profiles', 'investor_preferences', 'notification_preferences', 'notification_prefs', 'notifications',
    'posts', 'news_items', 'push_tokens', 'profiles')
 order by tablename, policyname;

-- Q15 · Scheduled jobs (pg_cron). Job names, schedules and active flags; the
-- command itself is reduced to an md5 and a yes/no "calls out over HTTP" so no
-- URL or secret it may embed is printed. LAST: errors only if pg_cron is absent.
select 'Q15' as q, jobid, jobname, schedule, active, md5(command) as command_digest,
       (command ~* 'net\.http|http_post|https?://') as calls_out
  from cron.job order by jobid;
