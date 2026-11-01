-- Production function-source inspection, 2026-11-01.
-- TARGET: the PRODUCTION Supabase project rvptronniomlqumjhyrr. Nowhere else.
--
-- READ-ONLY. Two SELECTs over the system catalogue. Q01 reads the
-- stored definition of exactly three functions with pg_get_functiondef(), which
-- formats catalogue text and does NOT execute, replace or modify the function.
-- No application table is read. Q02 only checks which tables EXIST (to_regclass). Run only through
-- scripts/production-audit-run.mjs (BEGIN READ ONLY ... ROLLBACK).
--
-- SENSITIVE OUTPUT: this returns function SOURCE. A SECURITY DEFINER body may
-- hold a credential or secret. The result file is written to the gitignored
-- supabase/audit/results/ folder; the runner redacts emails, JWTs, URLs and
-- connection strings before writing, and scripts/function-drift-diff.mjs scans
-- again for keys and long secret-like strings before anything is displayed.
-- Never commit or share the raw result file.
--
-- The three signatures are the ones production reported in the first audit (Q10):
--   public.accept_company_invitation(text)
--   public.publish_publication(uuid, uuid, timestamp with time zone)
--   public.revise_publication(uuid, text, text, text, uuid)

select 'Q01' as q,
       p.oid::regprocedure::text           as signature,
       pg_get_userbyid(p.proowner)          as owner,
       p.prosecdef                          as security_definer,
       p.provolatile                        as volatility,
       coalesce(array_to_string(p.proconfig, ','), '') as config,
       coalesce((select string_agg(x::text, ',' order by x::text) from unnest(p.proacl) x), '(default)') as execute_acl,
       md5(pg_get_functiondef(p.oid))       as digest,
       pg_get_functiondef(p.oid)            as definition
  from pg_proc p
 where p.oid in ('public.accept_company_invitation(text)'::regprocedure,
                 'public.publish_publication(uuid, uuid, timestamp with time zone)'::regprocedure,
                 'public.revise_publication(uuid, text, text, text, uuid)'::regprocedure)
 order by 2;

-- Q02 · Existence only: every pre-existing table the pending migrations
-- (0058-0077, excluding deferred 0055 and 0061b) reference. 0076 failed this
-- for brand_kits and story_projects; this confirms there are no others.
select 'Q02' as q, t.name as table_name, to_regclass('public.' || t.name) is not null as exists_in_db
  from (values
  ('activity_log'),
  ('brand_kits'),
  ('companies'),
  ('company_blueprints'),
  ('company_destinations'),
  ('company_follows'),
  ('company_invitations'),
  ('company_memberships'),
  ('company_notification_reads'),
  ('company_profile_versions'),
  ('company_subscriptions'),
  ('contact_submissions'),
  ('conversations'),
  ('demo_bookings'),
  ('documents'),
  ('event_deliveries'),
  ('events'),
  ('facts'),
  ('features'),
  ('investor_profiles'),
  ('listener_subscriptions'),
  ('listing_reports'),
  ('media_asset_sources'),
  ('media_assets'),
  ('messages'),
  ('post_events'),
  ('post_likes'),
  ('post_saves'),
  ('posts'),
  ('profiles'),
  ('publication_media'),
  ('publications'),
  ('release_revisions'),
  ('story_projects'),
  ('update_documents'),
  ('updates'),
  ('user_company_relationships')
  ) as t(name)
 order by 3, 2;
