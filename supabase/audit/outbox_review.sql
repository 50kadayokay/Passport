-- outbox_review.sql — Is publishing actually being delivered in production?
--
-- READ-ONLY. Counts and dates only; no content, no user identity, no writes, no
-- locks. Run in the PRODUCTION SQL editor by a person, before D22 is approved
-- (docs/REMEDIATION-PLAN.md §17). scripts/audit-sql-readonly-check.mjs verifies
-- mechanically that it only reads.
--
-- WHY: the dispatcher that turns a published release into a feed post, an in-app
-- notification, Mine IQ facts and a timeline entry runs only when something
-- triggers it. The plan must not assume a scheduler exists. These queries say
-- whether one does, how far behind delivery is, and what a first scheduled drain
-- would do (including how many AI extractions and notifications it would start).

-- 1. Is there a scheduler at all? (Empty for pg_cron/pg_net = no database scheduler.)
select extname, extversion from pg_extension where extname in ('pg_cron', 'pg_net');

-- 2. Which outbox migrations are present? (functions they define)
select p.proname,
       case when p.proname is not null then 'present' end as state
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('claim_deliveries', 'complete_delivery', 'outbox_health', 'reconcile_outbox',
                    'revise_publication', 'upsert_timeline_entry')
order by 1;

-- 3. Which listeners are subscribed to which events?
select listener, event_type from public.listener_subscriptions order by 1, 2;

-- 4. Events written, by type and age.
select event_type, count(*) as events, min(created_at) as first, max(created_at) as last
from public.events group by 1 order by 1;

-- 5. Delivery state per listener.
select listener, status, count(*) as deliveries, max(attempts) as max_attempts,
       min(next_attempt_at) as oldest_due
from public.event_deliveries group by 1, 2 order by 1, 2;

-- 6. THE BACKLOG A FIRST DRAIN WOULD PROCESS: (event, subscribed listener) pairs
--    with no delivery row yet. claim_deliveries() creates these on its first call,
--    for every historical event -- including AI extraction (mineiq_facts_v1) and
--    follower notifications (in_app_notifications_v1) for old releases.
select ls.listener, count(*) as never_attempted,
       min(e.created_at) as oldest_event, max(e.created_at) as newest_event
from public.events e
join public.listener_subscriptions ls on ls.event_type = e.event_type
where not exists (select 1 from public.event_deliveries d where d.event_id = e.id and d.listener = ls.listener)
group by 1 order by 1;

-- 7. Published to the profile but not in the investor feed (orphans).
select count(*) as published_without_live_post,
       min(p.published_at) as oldest, max(p.published_at) as newest
from public.publications p
where p.destination_id = 'passport' and p.status = 'published'
  and not exists (select 1 from public.posts po where po.publication_id = p.id and po.removed_at is null);

-- 8. Recent failures (error text only, truncated; no content).
select listener, status, attempts, left(last_error, 120) as last_error, updated_at
from public.event_deliveries
where status in ('failed', 'dead')
order by updated_at desc
limit 20;

-- 9. Schema drift check: does posts have the columns the feed listener writes?
--    (Staging, rebuilt from migrations, has NO posts.media_url, so every feed
--    projection there fails with PGRST204.)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'posts'
order by ordinal_position;

-- 10. Non-passport publications (LinkedIn, X, newsletter, website, push have no
--     delivery connector; anything "published" there was never sent).
select destination_id, status, count(*) as publications
from public.publications
where destination_id <> 'passport'
group by 1, 2 order by 1, 2;

-- 11. IF query 1 shows pg_cron, run this too (it errors when pg_cron is absent):
--     select jobid, jobname, schedule, active, command from cron.job order by jobid;
--     The command reveals the URL the job calls; the secret is read from app_secrets.
