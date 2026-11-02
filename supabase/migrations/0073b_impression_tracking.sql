-- ============================================================================
-- 0073b_impression_tracking.sql — a12. APPLIED TO STAGING ONLY (2026-10-31); NOT production.
--
-- Requires 0073a (its unique index is what ON CONFLICT infers). Additive: three
-- new functions; no table, column, policy, existing function or grant changes.
-- 0065a/0065b need no change: they already count kind = 'impression' rows, and
-- 0073a makes each such row mean "one investor saw this post on this UTC day".
--
-- WHAT IT ADDS
--   record_post_impressions(post_ids)    the investor app's write path
--   company_impression_summary(co, days) when recording began, impressions,
--                                        distinct viewers, and opens over the
--                                        SAME period (for an honest read rate)
--   company_post_impressions(co, days)   per live post: lifetime + windowed
--
-- HONEST HISTORY (a12 objective 8). Impressions were never recorded before the
-- app started sending them. Every figure here therefore carries
-- first_recorded_at -- the company's first impression -- and a read rate is
-- only computed over opens ON OR AFTER that moment. Opens from before it had no
-- impression to be measured against; dividing them by later impressions would
-- invent a rate. When nothing has been recorded, first_recorded_at is NULL and
-- the portal says "not recorded yet" instead of 0%.
--
-- WINDOW. p_days NULL = all time; otherwise clamped to [1, 365] and taken as
-- the UTC calendar window [today - (p_days-1), today] -- identical to 0065a.
--
-- ACCESS. record_post_impressions: signed-in users, as themselves (auth.uid()),
-- live posts only, at most 50 ids per call. The two readers: owns_company(), the
-- same gate as every 0048/0065 analytics function (the company's owner and its
-- active members; never another company, an investor or anon). Raised as
-- 42501 before any row is read.
--
-- ROLLBACK: supabase/rollbacks/0073b_impression_tracking.rollback.sql
-- ============================================================================

begin;

-- ------------------------------------------------------------ write path
create or replace function public.record_post_impressions(p_post_ids uuid[])
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_n integer;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if p_post_ids is null or cardinality(p_post_ids) = 0 then return 0; end if;
  if cardinality(p_post_ids) > 50 then
    raise exception 'at most 50 posts per call' using errcode = '22023';
  end if;
  insert into public.post_events (post_id, user_id, kind)
  select distinct p.id, v_uid, 'impression'
    from public.posts p
   where p.id = any(p_post_ids) and p.removed_at is null
  on conflict (post_id, user_id, ((created_at at time zone 'UTC')::date)) where kind = 'impression'
  do nothing;
  get diagnostics v_n = row_count;
  return v_n;   -- impressions newly recorded (duplicates and unknown/retired posts are not)
end $$;

revoke execute on function public.record_post_impressions(uuid[]) from public, anon;
grant  execute on function public.record_post_impressions(uuid[]) to authenticated;

-- --------------------------------------------------------------- summary
create or replace function public.company_impression_summary(p_company uuid, p_days integer default null)
returns table (
  first_recorded_at timestamptz,  -- the company's first impression; NULL = never recorded
  impressions       bigint,       -- in the window, live posts
  viewers           bigint,       -- distinct investors behind those impressions
  opens_since       bigint        -- opens in the window AND on/after first_recorded_at
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_since date; v_from timestamptz; v_first timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  if p_days is not null then
    v_since := (now() at time zone 'UTC')::date - (greatest(least(p_days, 365), 1) - 1);
    v_from  := v_since::timestamp at time zone 'UTC';
  end if;
  select min(e.created_at) into v_first
    from public.posts p join public.post_events e on e.post_id = p.id
   where p.company_id = p_company and e.kind = 'impression';

  -- No GROUP BY: always exactly one row, all zeros for a company with no events.
  return query
  select v_first,
         count(*) filter (where e.kind = 'impression'),
         count(distinct e.user_id) filter (where e.kind = 'impression'),
         count(*) filter (where e.kind = 'open' and v_first is not null and e.created_at >= v_first)
    from public.posts p join public.post_events e on e.post_id = p.id
   where p.company_id = p_company and p.removed_at is null
     and (v_from is null or e.created_at >= v_from)
     and e.kind in ('impression', 'open');
end $$;

revoke execute on function public.company_impression_summary(uuid, integer) from public, anon;
grant  execute on function public.company_impression_summary(uuid, integer) to authenticated;

-- -------------------------------------------------------------- per post
create or replace function public.company_post_impressions(p_company uuid, p_days integer default 30)
returns table (
  post_id            uuid,
  impressions        bigint,   -- lifetime, live post
  impressions_recent bigint    -- in the window
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_since date; v_from timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  if p_days is not null then
    v_since := (now() at time zone 'UTC')::date - (greatest(least(p_days, 365), 1) - 1);
    v_from  := v_since::timestamp at time zone 'UTC';
  end if;
  return query
  select p.id,
         count(e.id),
         count(e.id) filter (where v_from is null or e.created_at >= v_from)
    from public.posts p
    left join public.post_events e on e.post_id = p.id and e.kind = 'impression'
   where p.company_id = p_company and p.removed_at is null
   group by p.id;
end $$;

revoke execute on function public.company_post_impressions(uuid, integer) from public, anon;
grant  execute on function public.company_post_impressions(uuid, integer) to authenticated;

commit;
