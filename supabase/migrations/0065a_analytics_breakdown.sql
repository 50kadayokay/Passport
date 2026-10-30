-- ============================================================================
-- 0065a_analytics_breakdown.sql — NOT APPLIED. Prepared for review.
--
-- PURELY ADDITIVE. Four new read-only functions. No existing function is
-- touched, no table, column, event kind or instrumentation is added, and
-- dropping all four restores the database exactly. 0048's behaviour is
-- unchanged by this file.
--
-- The behaviour CHANGES live in 0065b, deliberately separated so the additive
-- half can be approved and applied on its own.
--
-- WHAT IT ADDS
--   company_engagement_by_type        -- engagement split press_release vs media
--   company_follower_growth           -- first-time follows per day
--   company_content_performance       -- per-item lifetime + windowed
--   company_engagement_unattributed   -- the engagement the item list CANNOT show
--
-- WHY THE FOURTH ONE EXISTS
-- -------------------------
-- The portal shows a lifetime total, a press/media split and a per-item list on
-- one screen, and a reader will add the list up. Two kinds of engagement cannot
-- appear in that list:
--   • RETIRED CONTENT. removed_at is set when a publication is unpublished
--     (api/_listeners.js:31) and cleared again on re-publish, so it is a
--     reversible hide, not a delete. Those opens really happened.
--   • ORPHANED KEYS. post_likes/post_saves key content as (company_slug,
--     post_key text) with no foreign key, so a row can name a post_key that
--     matches nothing in `posts`.
-- Everything else here counts LIVE posts only, so the list reconciles exactly.
-- This function is how the difference stays visible instead of silently
-- vanishing: the portal prints it as its own line under the lifetime figures.
--
-- CANONICAL DEFINITION OF A SAVE
-- ------------------------------
-- Two different things were being added together, and they are not the same
-- measurement:
--   • post_saves is CURRENT STATE. investorData.js savePost() inserts a row and
--     unsavePost() DELETES it, so the table answers "is this saved right now".
--   • post_events kind='save' is a HISTORICAL ACTION, append-only. PassportProto
--     writes one when an investor saves from the feed, and 'unsave' -- allowed by
--     the CHECK -- is never emitted by anything, so an event can never be undone.
-- So: `saves` means currently saved, from post_saves alone. `save_actions`
-- means save presses ever recorded, from post_events alone. They are returned
-- side by side and NEVER summed. A feed save writes only an event (the feed's
-- own saved list, savedStore, is device-local localStorage and never reaches the
-- database), so save_actions will exceed saves; that is a real difference
-- between two surfaces, not a discrepancy to reconcile away.
--
-- THE WINDOW ARGUMENT
-- -------------------
-- p_days NULL means ALL TIME -- no lower bound at all -- and is how the portal's
-- period toggle asks for a company's whole history. A number is clamped to
-- [1, 365]; that clamp deliberately does NOT apply to the null case, because
-- "all time" is not a long window, it is the absence of one. Every windowed
-- figure on the page reads the same argument, so a reader who switches the
-- toggle cannot end up comparing a 30-day chart against a 90-day column.
--
-- WINDOW BOUNDARY — EXPLICIT UTC
-- ------------------------------
-- Every window is the calendar window [today - (p_days-1), today] computed in
-- UTC: `(now() at time zone 'UTC')::date`, with the lower bound converted back
-- to a timestamptz at UTC midnight for the created_at comparison. NOT
-- `current_date`, and not a rolling p_days x 24h from the current instant.
-- 0048 mixed all three: it bucketed by `(created_at at time zone 'UTC')::date`
-- but filtered on bare `current_date`, which resolves in the database's TimeZone
-- setting -- so on any project not set to UTC its buckets and its filter
-- disagreed. Being explicit removes the dependency on a GUC entirely.
--
-- PRESS RELEASES vs MEDIA, AND WHY PHOTOS vs VIDEOS IS NOT OFFERED
-- ----------------------------------------------------------------
-- posts.post_type is 'press_release' or 'media'. Media posts travel the same
-- event path as releases, so their opens and dwell were already recorded and
-- merely blended; splitting on post_type separates them with no new collection.
-- That is the whole of what post_type can say. It CANNOT tell a photo from a
-- video: both are post_type 'media' and mediaPosts.js writes the same shape for
-- either. Guessing from a URL extension would be a guess, so nothing here
-- returns a photo/video split and the portal reports media as one group.
--
-- WHAT IS STILL NOT MEASURED
-- --------------------------
-- The app emits exactly three event kinds -- 'open', 'dwell', 'save' -- and
-- nothing else. So impressions (the CHECK allows 'impression'; nothing ever
-- writes one, which makes 0048's `views` structurally zero and read rate
-- uncomputable), profile views, unique visitors, shares, unsaves, and video
-- plays/watch time/completion are all uncollected. No function here invents
-- them; the UI marks them untracked rather than zero.
--
-- AUTHORIZATION
-- -------------
-- Each function: SECURITY DEFINER, pinned search_path, `stable`, no writes, no
-- dynamic SQL, and owns_company(p_company) checked FIRST so the exception
-- raises before a single row is read. owns_company (0006) is the company's
-- owner OR an active company_memberships row -- owner and staff, deliberately
-- not platform admins and not investors. EXECUTE revoked from public and anon,
-- granted only to authenticated. Identical posture to 0048. NO OTHER GRANT IN
-- THE SCHEMA IS TOUCHED BY THIS FILE.
-- ============================================================================

begin;

-- ------------------------------------------------- totals, split by content
-- p_days scopes the ENGAGEMENT, not the content: `posts` is always the number
-- of live posts of that type, because it is the denominator a reader needs
-- beside an open count ("1,149 opens across 6 live releases"). Counting posts
-- published inside the window instead would pair opens-in-window against a
-- different population, since an open in the last 30 days is very often on a
-- post published long before it.
--
-- A WINDOWED `saves` NEEDS SAYING OUT LOUD: post_saves is current state, so a
-- windowed count means "saved during this period AND STILL SAVED". An investor
-- who saved in the window and later unsaved leaves no row and is not counted.
-- That is the only thing the table can answer; it does not keep history.
-- `save_actions` has no such caveat -- events are append-only -- which is
-- exactly why the two are reported separately.
create or replace function public.company_engagement_by_type(p_company uuid, p_days integer default null)
returns table (
  post_type      text,
  posts          bigint,     -- live posts of this type. NOT period-scoped.
  reads          bigint,     -- 'open' events in the period. The real one.
  avg_dwell_secs numeric,    -- SECONDS, converted from the stored milliseconds.
  likes          bigint,
  saves          bigint,     -- saved in the period and still saved
  save_actions   bigint      -- save presses in the period (append-only)
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text; v_since date; v_from timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  select c.slug into v_slug from public.companies c where c.id = p_company;
  -- NULL p_days = all time, matching every other function here.
  if p_days is not null then
    v_since := (now() at time zone 'UTC')::date - (greatest(least(p_days, 365), 1) - 1);
    v_from  := v_since::timestamp at time zone 'UTC';
  end if;

  return query
  -- post_likes/post_saves key on post_key TEXT, so matching them needs
  -- posts.id::text. Written as a correlated `exists (... where p.id::text =
  -- l.post_key)` that cast makes the primary key index unusable and rescans
  -- `posts` once per like row. Materialising the cast once, over a relation the
  -- size of this company's content, makes all of it hash joins instead.
  with mine as (
    select p.id, p.id::text as key, p.post_type
      from public.posts p
     where p.company_id = p_company and p.removed_at is null
  ),
  cnt as (select m.post_type, count(*) as posts from mine m group by m.post_type),
  ev  as (
    select m.post_type,
           count(*) filter (where e.kind = 'open') as reads,
           count(*) filter (where e.kind = 'save') as save_actions,
           round(((avg(e.value) filter (where e.kind = 'dwell' and e.value is not null)) / 1000.0)::numeric, 1) as avg_dwell
      from mine m join public.post_events e on e.post_id = m.id
     where v_from is null or e.created_at >= v_from
     group by m.post_type
  ),
  lk  as (
    select m.post_type, count(*) as likes
      from mine m join public.post_likes l on l.post_key = m.key
     where l.company_slug = v_slug
       and (v_from is null or l.created_at >= v_from)
     group by m.post_type
  ),
  sv  as (
    select m.post_type, count(*) as saves
      from mine m join public.post_saves s on s.post_key = m.key
     where s.company_slug = v_slug
       and (v_from is null or s.created_at >= v_from)
     group by m.post_type
  )
  select cnt.post_type, cnt.posts,
         coalesce(ev.reads, 0), ev.avg_dwell,
         coalesce(lk.likes, 0), coalesce(sv.saves, 0), coalesce(ev.save_actions, 0)
    from cnt
    left join ev on ev.post_type = cnt.post_type
    left join lk on lk.post_type = cnt.post_type
    left join sv on sv.post_type = cnt.post_type;
end $$;

revoke execute on function public.company_engagement_by_type(uuid, integer) from public, anon;
grant  execute on function public.company_engagement_by_type(uuid, integer) to authenticated;

-- ------------------------------------------------------- follower growth
-- Both follow sources, deduplicated by user the way 0048 does it, bucketed on
-- the day of that user's FIRST follow -- so an investor who follows, unfollows
-- and follows again is one new follower, on the original date.
--
-- Two caveats the caller has to carry, because the data cannot answer them:
--   • user_company_relationships.created_at is when the ROW was created, which
--     may predate the moment is_following became true. It is the only timestamp
--     that table offers (0049 records the same caveat).
--   • is_following is current state, and an unfollow DELETES the company_follows
--     row outright, so a follow that has since ended leaves no trace. This
--     therefore counts first-time follows BY PEOPLE STILL FOLLOWING and cannot
--     be read as gross new follows. The portal labels it that way.
create or replace function public.company_follower_growth(p_company uuid, p_days integer default 30)
returns table (day date, new_followers bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text; v_since date; v_from timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  select c.slug into v_slug from public.companies c where c.id = p_company;
  -- NULL p_days = all time: no lower bound, and no clamp to apply.
  if p_days is not null then
    v_since := (now() at time zone 'UTC')::date - (greatest(least(p_days, 365), 1) - 1);
    v_from  := v_since::timestamp at time zone 'UTC';
  end if;

  return query
  with firsts as (
    select distinct on (u.user_id) u.user_id, u.at
      from (
        select f.user_id, f.created_at as at from public.company_follows f
         where f.company_id = p_company
        union all
        select r.user_id, r.created_at from public.user_company_relationships r
         where r.company_slug = v_slug and r.is_following
      ) u
     order by u.user_id, u.at asc
  )
  select (f.at at time zone 'UTC')::date, count(*)
    from firsts f
   where v_from is null or f.at >= v_from
   group by 1 order by 1;
end $$;

revoke execute on function public.company_follower_growth(uuid, integer) from public, anon;
grant  execute on function public.company_follower_growth(uuid, integer) to authenticated;

-- ------------------------------------- per-item performance, with a window
-- company_post_engagement plus post_type, saves and a p_days slice, so the
-- content list can show lifetime AND recent for the same item. `posts` rows are
-- created on publication and published_at is NOT NULL, so there are no drafts
-- to filter out here and no NULLs to order around.
create or replace function public.company_content_performance(p_company uuid, p_days integer default 30, p_limit integer default 200)
returns table (
  post_id        uuid,
  title          text,
  post_type      text,
  published_at   timestamptz,
  reads          bigint,
  reads_recent   bigint,
  avg_dwell_secs numeric,    -- SECONDS, converted from the stored milliseconds.
  likes          bigint,
  saves          bigint,     -- currently saved
  save_actions   bigint      -- save presses ever
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text; v_since date; v_from timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  select c.slug into v_slug from public.companies c where c.id = p_company;
  -- NULL p_days = all time, in which case reads_recent equals reads by
  -- definition. The portal relabels the column rather than hiding it, so the
  -- two readings stay side by side and obviously identical.
  if p_days is not null then
    v_since := (now() at time zone 'UTC')::date - (greatest(least(p_days, 365), 1) - 1);
    v_from  := v_since::timestamp at time zone 'UTC';
  end if;

  return query
  select p.id, p.title, p.post_type, p.published_at,
         (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'open'),
         (select count(*) from public.post_events e
           where e.post_id = p.id and e.kind = 'open'
             and (v_from is null or e.created_at >= v_from)),
         (select round((avg(e.value) / 1000.0)::numeric, 1) from public.post_events e
           where e.post_id = p.id and e.kind = 'dwell' and e.value is not null),
         (select count(*) from public.post_likes l
           where l.company_slug = v_slug and l.post_key = p.id::text),
         (select count(*) from public.post_saves s
           where s.company_slug = v_slug and s.post_key = p.id::text),
         (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'save')
    from public.posts p
   where p.company_id = p_company and p.removed_at is null
   order by p.published_at desc
   limit greatest(least(p_limit, 500), 1);
end $$;

revoke execute on function public.company_content_performance(uuid, integer, integer) from public, anon;
grant  execute on function public.company_content_performance(uuid, integer, integer) to authenticated;

-- --------------------------------- the engagement the item list cannot show
-- See "WHY THE FOURTH ONE EXISTS" at the top. Everything else counts live posts
-- only so the totals equal the sum of the visible list; this is how the
-- remainder stays on screen rather than disappearing.
create or replace function public.company_engagement_unattributed(p_company uuid)
returns table (
  retired_posts bigint,   -- unpublished; removed_at set, reversible
  retired_reads bigint,
  retired_likes bigint,
  retired_saves bigint,
  orphan_likes  bigint,   -- post_key matches no row in posts at all
  orphan_saves  bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  select c.slug into v_slug from public.companies c where c.id = p_company;

  return query
  with every as (
    select p.id, p.id::text as key, p.removed_at
      from public.posts p where p.company_id = p_company
  ),
  retired as (select e.id, e.key from every e where e.removed_at is not null)
  select
    (select count(*) from retired),
    (select count(*) from retired r join public.post_events e on e.post_id = r.id
      where e.kind = 'open'),
    (select count(*) from retired r join public.post_likes l on l.post_key = r.key
      where l.company_slug = v_slug),
    (select count(*) from retired r join public.post_saves s on s.post_key = r.key
      where s.company_slug = v_slug),
    (select count(*) from public.post_likes l
      where l.company_slug = v_slug
        and not exists (select 1 from every e where e.key = l.post_key)),
    (select count(*) from public.post_saves s
      where s.company_slug = v_slug
        and not exists (select 1 from every e where e.key = s.post_key));
end $$;

revoke execute on function public.company_engagement_unattributed(uuid) from public, anon;
grant  execute on function public.company_engagement_unattributed(uuid) to authenticated;

commit;

-- ============================================================================
-- ROLLBACK -- additive, so this restores the database exactly.
-- ============================================================================
-- begin;
-- drop function if exists public.company_engagement_by_type(uuid, integer);
-- drop function if exists public.company_follower_growth(uuid, integer);
-- drop function if exists public.company_content_performance(uuid, integer, integer);
-- drop function if exists public.company_engagement_unattributed(uuid);
-- commit;
