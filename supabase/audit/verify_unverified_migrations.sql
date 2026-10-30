-- Which of the six UNVERIFIED migrations are actually on production?
--
-- READ-ONLY. Catalog metadata only: pg_proc, pg_tables, pg_indexes and one
-- row from public.features. It reads no application data, writes nothing and
-- locks nothing. Safe to run on production during business hours.
--
-- Paste the whole file into the Supabase SQL editor and run it. Then, in
-- scripts/_migration-manifest.mjs, for each row:
--     applied = yes  -> delete its UNVERIFIED entry (derived APPLIED is right)
--     applied = no   -> move its entry to PENDING
--
-- Context: the manifest named 0065_analytics_breakdown.sql, which has never
-- existed -- the work shipped as 0065a/b/c. Those three, plus 0066/0067/0068,
-- were falling through to "applied by default" with nobody having checked.

with checks as (

  select '0065a_analytics_breakdown' as migration,
         count(*)::text              as found,
         '4'                         as expected,
         count(*) = 4                as applied
    from pg_proc
   where proname in ('company_content_performance',
                     'company_engagement_by_type',
                     'company_engagement_unattributed',
                     'company_follower_growth')

  union all
  -- 0065b REPLACES three functions 0048 already created, so existence proves
  -- nothing. Its bodies introduce a `with mine as (...)` CTE that 0048's lack.
  select '0065b_engagement_corrections',
         coalesce(bool_or(pg_get_functiondef(oid) ~ 'with mine as')::text, 'absent'),
         'true',
         coalesce(bool_or(pg_get_functiondef(oid) ~ 'with mine as'), false)
    from pg_proc
   where proname = 'company_engagement_totals'

  union all
  select '0065c_analytics_indexes',
         count(*)::text, '3', count(*) = 3
    from pg_indexes
   where indexname in ('idx_post_likes_slug_key',
                       'idx_post_saves_slug_key',
                       'idx_ucr_slug_following')

  union all
  select '0066_mineiq_conversations',
         count(*)::text, '2', count(*) = 2
    from pg_tables
   where schemaname = 'public'
     and tablename in ('mineiq_threads', 'mineiq_messages')

  union all
  select '0067_conference_mode_feature',
         count(*)::text, '1', count(*) = 1
    from public.features
   where id = 'conference_mode'

  union all
  select '0068_site_contract',
         count(*)::text, '1', count(*) = 1
    from pg_tables
   where schemaname = 'public'
     and tablename = 'site_credentials'
)
select migration,
       expected,
       found,
       case when applied then 'yes — delete its UNVERIFIED entry'
            else            'NO  — move it to PENDING' end as verdict
  from checks
 order by migration;
