-- ============================================================================
-- 0065b_engagement_corrections.sql — NOT APPLIED. Prepared for review.
--
-- THIS FILE CHANGES NUMBERS THAT ARE ALREADY ON SCREEN IN PRODUCTION.
-- Nothing here is additive. It replaces three APPLIED 0048 functions because
-- each one reports something the portal cannot show truthfully. 0065a is the
-- additive half and can be applied without this file; this file cannot
-- sensibly be applied without 0065a, because the corrected totals are only
-- checkable against the per-item list 0065a provides.
--
-- RETURN SHAPES ARE UNCHANGED, DELIBERATELY. `create or replace function`
-- cannot alter a function's return type, and a drop-then-create would leave a
-- window where the portal's RPC 404s. So every column stays exactly as 0048
-- declared it, byte for byte, and only the bodies change. That is also why
-- `save_actions` and the retired/orphan figures live in 0065a's new functions
-- instead of being added here as extra columns.
--
-- THE FOUR CORRECTIONS
-- --------------------
-- 1. DWELL IS STORED IN MILLISECONDS, REPORTED AS SECONDS.
--    src/aiBrief/Feed.jsx:195 is the only writer of a 'dwell' event, in
--    PostDetail's effect cleanup:
--        recordPostEvent(postId, "dwell", Math.round(Date.now() - openedAt.current))
--    openedAt is `useRef(Date.now())` (line 188), so `value` is a count of
--    MILLISECONDS. 0048 returns `round(avg(e.value), 1)` and names the column
--    avg_dwell_secs; the portal prints it as seconds. A 68-second read has
--    always displayed as 68,400.
--    Every row in the column is milliseconds -- one writer, one unit, since
--    0009 created the table -- so dividing by 1000 at read time converts the
--    whole history correctly and exactly once. There is no mixed-unit era to
--    detect and no backfill to run.
--    FIXED IN SQL, NOT IN THE CLIENT, ON PURPOSE. The native app is a Capacitor
--    build with webDir "dist" and no server.url, so its web bundle is COMPILED
--    INTO THE BINARY: a client-side change reaches a phone only when that phone
--    installs a new App Store build. Changing the writer would therefore put
--    seconds and milliseconds in the same column, indistinguishable, for as
--    long as any old build survives. The writer stays as it is.
--    NATIVE APP COMPATIBILITY: unaffected. Nothing in the investor app reads
--    avg_dwell_secs, or calls company_engagement_totals,
--    company_engagement_daily or company_post_engagement at all -- they are
--    reached only by src/lib/engagement.js, which only the company portal
--    (desktop, gated at >=1024px) imports. The app keeps WRITING the same
--    millisecond values it always has.
--
-- 2. SAVES WERE TWO DIFFERENT MEASUREMENTS ADDED TOGETHER.
--    0048 computed saves as `count(post_saves rows) + count('save' events)`.
--    Those are not the same quantity:
--      • post_saves is CURRENT STATE -- investorData.js savePost() inserts,
--        unsavePost() DELETES. It answers "is this saved right now".
--      • post_events kind='save' is a HISTORICAL ACTION, append-only;
--        PassportProto writes one on a feed save and 'unsave', though the CHECK
--        allows it, is emitted by nothing, so an event is never undone.
--    Summing them double counts anyone who saved on both surfaces and mixes a
--    state with an event log. Canonical definition adopted here and in 0065a:
--    `saves` = currently saved, from post_saves ALONE. Save presses are
--    reported separately as `save_actions` by 0065a's functions, and the two
--    are never summed. A feed save writes only an event -- the feed's own saved
--    list is device-local localStorage (savedStore, PassportProto.jsx:8099) and
--    never reaches the database -- so save_actions legitimately exceeds saves.
--
-- 3. RETIRED POSTS WERE COUNTED IN THE TOTALS BUT CANNOT BE IN THE LIST.
--    0048 counted opens, dwell and saves over ALL of a company's posts while
--    counting `posts` with `removed_at is null`. The portal's item list can
--    only show posts that are live, so a retired post's opens inflated the
--    total with nothing on screen to account for them.
--    POLICY, applied consistently across 0065a and 0065b: every figure counts
--    LIVE posts only, so the lifetime total equals the press/media split equals
--    the sum of the visible list -- an identity the reader can check by adding
--    up the column. Retired engagement is not discarded: 0065a's
--    company_engagement_unattributed returns it, and the portal prints it as
--    its own labelled line directly under the lifetime figures.
--    Note that removed_at is a REVERSIBLE hide, not a delete -- set on
--    PUBLICATION_UNPUBLISHED and cleared again on re-publish
--    (api/_listeners.js:31 and :64) -- so a company that unpublishes a post
--    will see its lifetime total fall and then recover. That is why the
--    retired line is shown rather than merely subtracted.
--
-- 4. ORPHANED post_keys WERE COUNTED BUT ARE ATTRIBUTABLE TO NOTHING.
--    post_likes and post_saves key content as (company_slug, post_key text)
--    with no foreign key, so a row can name a post_key matching no row in
--    `posts`. 0048 counted every such row for the slug. No item can ever
--    account for one, so these functions count only likes and saves that
--    resolve to a live post, and company_engagement_unattributed reports the
--    remainder as orphan_likes / orphan_saves.
--
-- THE WINDOW ARGUMENT
-- -------------------
-- p_days NULL means ALL TIME, matching 0065a. For this function that means the
-- series runs from the company's first recorded event to today instead of from
-- a fixed offset; see the body. A number is still clamped to [1, 365].
--
-- WINDOW BOUNDARY — EXPLICIT UTC
-- ------------------------------
-- company_engagement_daily bucketed by `(created_at at time zone 'UTC')::date`
-- but filtered on bare `current_date`, which resolves in the database's
-- TimeZone setting. On any project not set to UTC its buckets and its filter
-- disagreed, silently. Both are now explicit UTC, matching 0065a exactly, so no
-- window on the page depends on a GUC.
--
-- SCOPE
-- -----
-- Three function bodies. No table, column, index, policy or event kind. The
-- revoke/grant pairs are re-issued verbatim from 0048 for idempotence --
-- `create or replace` preserves existing privileges, so they are no-ops that
-- keep the file self-describing. NO OTHER FUNCTION'S GRANTS ARE TOUCHED.
-- ============================================================================

begin;

-- ------------------------------------------------------------------ totals
create or replace function public.company_engagement_totals(p_company uuid)
returns table (
  views            bigint,   -- impressions. Nothing emits one: structurally 0.
  reads            bigint,   -- opens: the investor actually opened it
  avg_dwell_secs   numeric,  -- SECONDS. The column stores milliseconds.
  followers        bigint,
  likes            bigint,
  saves            bigint,   -- CURRENTLY saved (post_saves). Not save presses.
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
  with mine as (
    select p.id, p.id::text as key
      from public.posts p
     where p.company_id = p_company and p.removed_at is null
  )
  select
    (select count(*) from mine m join public.post_events e on e.post_id = m.id
      where e.kind = 'impression'),
    (select count(*) from mine m join public.post_events e on e.post_id = m.id
      where e.kind = 'open'),
    (select round((avg(e.value) / 1000.0)::numeric, 1)
       from mine m join public.post_events e on e.post_id = m.id
      where e.kind = 'dwell' and e.value is not null),
    -- Two follow sources exist and a person may appear in both, so count
    -- DISTINCT users across the union rather than summing the two tables.
    -- Unchanged from 0048; it was already right.
    (select count(*) from (
        select f.user_id from public.company_follows f where f.company_id = p_company
        union
        select r.user_id from public.user_company_relationships r
         where r.company_slug = v_slug and r.is_following
     ) u),
    (select count(*) from mine m join public.post_likes l on l.post_key = m.key
      where l.company_slug = v_slug),
    (select count(*) from mine m join public.post_saves s on s.post_key = m.key
      where s.company_slug = v_slug),
    (select count(*) from mine);
end $$;

revoke execute on function public.company_engagement_totals(uuid) from public, anon;
grant  execute on function public.company_engagement_totals(uuid) to authenticated;

-- ------------------------------------------------------------------- daily
create or replace function public.company_engagement_daily(p_company uuid, p_days integer default 30)
returns table (day date, views bigint, reads bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_today date; v_since date; v_from timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  v_today := (now() at time zone 'UTC')::date;

  if p_days is null then
    -- ALL TIME. The series has to start somewhere, so it starts at this
    -- company's first recorded event rather than at an arbitrary date -- a
    -- company that published last week gets a one-week chart, not a decade of
    -- empty days. Capped at five years so one company's history can never
    -- return an unbounded number of rows.
    select min((e.created_at at time zone 'UTC')::date) into v_since
      from public.post_events e
      join public.posts p on p.id = e.post_id
     where p.company_id = p_company and p.removed_at is null;
    v_since := greatest(coalesce(v_since, v_today), v_today - 1825);
  else
    v_since := v_today - (greatest(least(p_days, 365), 1) - 1);
  end if;
  v_from := v_since::timestamp at time zone 'UTC';

  return query
  with span as (
    select generate_series(v_since, v_today, interval '1 day')::date as day
  ),
  ev as (
    select (e.created_at at time zone 'UTC')::date as day, e.kind
      from public.post_events e
      join public.posts p on p.id = e.post_id
     where p.company_id = p_company and p.removed_at is null
       and e.created_at >= v_from
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

-- --------------------------------------------------------- per release list
-- Superseded for the portal by 0065a's company_content_performance, but
-- corrected rather than left behind: a function reporting the same metric in a
-- different unit is a trap for whoever reads it next.
create or replace function public.company_post_engagement(p_company uuid, p_limit integer default 20)
returns table (
  post_id uuid, title text, published_at timestamptz,
  views bigint, reads bigint, avg_dwell_secs numeric, likes bigint
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
         (select round((avg(e.value) / 1000.0)::numeric, 1) from public.post_events e
           where e.post_id = p.id and e.kind = 'dwell' and e.value is not null),
         (select count(*) from public.post_likes l
           where l.company_slug = v_slug and l.post_key = p.id::text)
    from public.posts p
   where p.company_id = p_company and p.removed_at is null
   order by p.published_at desc
   limit greatest(least(p_limit, 500), 1);
end $$;

revoke execute on function public.company_post_engagement(uuid, integer) from public, anon;
grant  execute on function public.company_post_engagement(uuid, integer) to authenticated;

commit;

-- ============================================================================
-- ROLLBACK — restores 0048's bodies verbatim.
--
-- READ THIS BEFORE RUNNING IT. Rolling back is not a neutral revert: it puts
-- dwell back into milliseconds under a column named _secs (a 1000x
-- overstatement), restores the double-counted saves, and lets retired posts and
-- orphaned keys back into the totals so the page stops adding up. Roll back
-- only if one of the new bodies is actively wrong, and expect the portal's
-- numbers to jump when you do.
-- ============================================================================
-- begin;
-- create or replace function public.company_engagement_totals(p_company uuid)
-- returns table (
--   views bigint, reads bigint, avg_dwell_secs numeric,
--   followers bigint, likes bigint, saves bigint, posts bigint
-- )
-- language plpgsql stable security definer set search_path = public, pg_temp as $$
-- declare v_slug text;
-- begin
--   if not public.owns_company(p_company) then
--     raise exception 'not authorized for this company' using errcode = '42501';
--   end if;
--   select c.slug into v_slug from public.companies c where c.id = p_company;
--   return query
--   select
--     (select count(*) from public.post_events e
--        join public.posts p on p.id = e.post_id
--       where p.company_id = p_company and e.kind = 'impression'),
--     (select count(*) from public.post_events e
--        join public.posts p on p.id = e.post_id
--       where p.company_id = p_company and e.kind = 'open'),
--     (select round(avg(e.value)::numeric, 1) from public.post_events e
--        join public.posts p on p.id = e.post_id
--       where p.company_id = p_company and e.kind = 'dwell' and e.value is not null),
--     (select count(*) from (
--         select f.user_id from public.company_follows f where f.company_id = p_company
--         union
--         select r.user_id from public.user_company_relationships r
--          where r.company_slug = v_slug and r.is_following
--      ) u),
--     (select count(*) from public.post_likes l where l.company_slug = v_slug),
--     (select
--        (select count(*) from public.post_saves s where s.company_slug = v_slug)
--      + (select count(*) from public.post_events e
--           join public.posts p on p.id = e.post_id
--          where p.company_id = p_company and e.kind = 'save')),
--     (select count(*) from public.posts p
--       where p.company_id = p_company and p.removed_at is null);
-- end $$;
--
-- create or replace function public.company_engagement_daily(p_company uuid, p_days integer default 30)
-- returns table (day date, views bigint, reads bigint)
-- language plpgsql stable security definer set search_path = public, pg_temp as $$
-- begin
--   if not public.owns_company(p_company) then
--     raise exception 'not authorized for this company' using errcode = '42501';
--   end if;
--   return query
--   with span as (
--     select generate_series(
--       (current_date - (greatest(least(p_days, 365), 1) - 1))::date,
--       current_date, interval '1 day')::date as day
--   ),
--   ev as (
--     select (e.created_at at time zone 'UTC')::date as day, e.kind
--       from public.post_events e
--       join public.posts p on p.id = e.post_id
--      where p.company_id = p_company
--        and e.created_at >= current_date - (greatest(least(p_days, 365), 1) - 1)
--   )
--   select s.day,
--          count(*) filter (where ev.kind = 'impression'),
--          count(*) filter (where ev.kind = 'open')
--     from span s left join ev on ev.day = s.day
--    group by s.day order by s.day;
-- end $$;
--
-- create or replace function public.company_post_engagement(p_company uuid, p_limit integer default 20)
-- returns table (
--   post_id uuid, title text, published_at timestamptz,
--   views bigint, reads bigint, avg_dwell_secs numeric, likes bigint
-- )
-- language plpgsql stable security definer set search_path = public, pg_temp as $$
-- declare v_slug text;
-- begin
--   if not public.owns_company(p_company) then
--     raise exception 'not authorized for this company' using errcode = '42501';
--   end if;
--   select c.slug into v_slug from public.companies c where c.id = p_company;
--   return query
--   select p.id, p.title, p.published_at,
--          (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'impression'),
--          (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'open'),
--          (select round(avg(e.value)::numeric, 1) from public.post_events e
--            where e.post_id = p.id and e.kind = 'dwell' and e.value is not null),
--          (select count(*) from public.post_likes l
--            where l.company_slug = v_slug and l.post_key = p.id::text)
--     from public.posts p
--    where p.company_id = p_company and p.removed_at is null
--    order by p.published_at desc
--    limit greatest(least(p_limit, 500), 1);
-- end $$;
-- commit;
