-- ============================================================================
-- 0048_company_engagement_analytics.sql — let a company see its own numbers.
--
-- Engagement HAS been recorded all along; the company just could never read it:
--   post_events           (0009)  impression | open | save | unsave | dwell
--   company_follows       (0009)  follows, keyed by company_id
--   user_company_rel.     (0016)  follows, keyed by company_slug  <- second source
--   post_likes/post_saves (0016)  keyed by company_slug + post_key
-- Every one of those is RLS'd to `user_id = auth.uid()`, so the Analytics page
-- had nothing to show and said "coming soon" instead.
--
-- These functions return AGGREGATES ONLY. That is deliberate and not merely
-- convenient: a company has a legitimate interest in how many investors read a
-- release, and no interest in WHICH investor read it. Nothing here can return
-- a user_id, and no policy is added to the underlying tables, so the per-row
-- privacy of 0009/0016 is left exactly as it was.
--
-- NOT INCLUDED: shares. Nothing in this database records a share -- post_events'
-- CHECK constraint allows impression/open/save/unsave/dwell and nothing else.
-- Reporting a share count would mean inventing one, so the page shows shares as
-- not yet tracked. Adding it means adding the event at the point of sharing
-- first; that is an app change, not a reporting change.
-- ============================================================================

-- ------------------------------------------------------------------- totals
create or replace function public.company_engagement_totals(p_company uuid)
returns table (
  views            bigint,   -- impressions: the post appeared in a feed
  reads            bigint,   -- opens: the investor actually opened it
  avg_dwell_secs   numeric,  -- mean of recorded dwell values
  followers        bigint,
  likes            bigint,
  saves            bigint,
  posts            bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  select c.slug into v_slug from public.companies c where c.id = p_company;

  return query
  select
    (select count(*) from public.post_events e
       join public.posts p on p.id = e.post_id
      where p.company_id = p_company and e.kind = 'impression'),
    (select count(*) from public.post_events e
       join public.posts p on p.id = e.post_id
      where p.company_id = p_company and e.kind = 'open'),
    (select round(avg(e.value)::numeric, 1) from public.post_events e
       join public.posts p on p.id = e.post_id
      where p.company_id = p_company and e.kind = 'dwell' and e.value is not null),
    -- Two follow sources exist and a person may appear in both, so count
    -- DISTINCT users across the union rather than summing the two tables.
    (select count(*) from (
        select f.user_id from public.company_follows f where f.company_id = p_company
        union
        select r.user_id from public.user_company_relationships r
         where r.company_slug = v_slug and r.is_following
     ) u),
    (select count(*) from public.post_likes l where l.company_slug = v_slug),
    -- Saves live in both models too (post_saves rows and 'save' post_events).
    (select
       (select count(*) from public.post_saves s where s.company_slug = v_slug)
     + (select count(*) from public.post_events e
          join public.posts p on p.id = e.post_id
         where p.company_id = p_company and e.kind = 'save')),
    (select count(*) from public.posts p
      where p.company_id = p_company and p.removed_at is null);
end $$;

revoke execute on function public.company_engagement_totals(uuid) from public, anon;
grant  execute on function public.company_engagement_totals(uuid) to authenticated;

-- -------------------------------------------------------------------- daily
-- One row per day for the trend line. Days with no activity are returned as
-- zeroes rather than omitted, so a chart does not silently close the gaps and
-- imply activity that did not happen.
create or replace function public.company_engagement_daily(p_company uuid, p_days integer default 30)
returns table (day date, views bigint, reads bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  return query
  with span as (
    select generate_series(
      (current_date - (greatest(least(p_days, 365), 1) - 1))::date,
      current_date,
      interval '1 day'
    )::date as day
  ),
  ev as (
    select (e.created_at at time zone 'UTC')::date as day, e.kind
      from public.post_events e
      join public.posts p on p.id = e.post_id
     where p.company_id = p_company
       and e.created_at >= current_date - (greatest(least(p_days, 365), 1) - 1)
  )
  select s.day,
         count(*) filter (where ev.kind = 'impression'),
         count(*) filter (where ev.kind = 'open')
    from span s left join ev on ev.day = s.day
   group by s.day
   order by s.day;
end $$;

revoke execute on function public.company_engagement_daily(uuid, integer) from public, anon;
grant  execute on function public.company_engagement_daily(uuid, integer) to authenticated;

-- ---------------------------------------------------------------- per post
-- Which releases actually landed. Aggregates per post, no user identities.
create or replace function public.company_post_engagement(p_company uuid, p_limit integer default 20)
returns table (
  post_id uuid, title text, published_at timestamptz,
  views bigint, reads bigint, likes bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  select c.slug into v_slug from public.companies c where c.id = p_company;

  return query
  select p.id, p.title, p.published_at,
         (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'impression'),
         (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'open'),
         (select count(*) from public.post_likes l
           where l.company_slug = v_slug and l.post_key = p.id::text)
    from public.posts p
   where p.company_id = p_company and p.removed_at is null
   order by p.published_at desc
   limit greatest(least(p_limit, 100), 1);
end $$;

revoke execute on function public.company_post_engagement(uuid, integer) from public, anon;
grant  execute on function public.company_post_engagement(uuid, integer) to authenticated;

-- Supports the daily rollup's date filter.
create index if not exists idx_post_events_created on public.post_events (created_at);
