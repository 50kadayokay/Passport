-- ============================================================================
-- 0087_audience_events.sql — a13. NOT APPLIED. Prepared for review.
--
-- The analytics events the portal could not show because nothing recorded
-- them: profile views, unique visitors, shares, and video progress.
--
-- WHY A NEW TABLE, NOT post_events. post_events is per POST, per signed-in
-- investor (user_id = auth.uid(), 0009/0073c), and the shipped 1.3.x apps
-- write to it. A profile view belongs to a company, and most profile views are
-- signed out (QR codes, shared links). Leaving post_events alone means no
-- installed app can be affected by this migration.
--
-- WHAT IT ADDS
--   company_events                 append-only; no client can read or write it
--   record_company_events(events)  the write path, anon + authenticated
--   company_audience_summary(co, days)   members-only totals
--   company_video_progress(co, days)     members-only, per media post
--
-- DEFINITIONS (shared with src/lib/analytics.js)
--   profile_view    a company profile opened in the investor app; at most ONE
--                   per visitor, per company, per UTC day (unique index)
--   unique visitor  a distinct visitor behind profile views in the window
--   share           a completed share sheet or a copied link, of the profile
--                   or one of its posts; at most 20 per visitor/company/day
--   video_progress  a viewer reached 25 / 50 / 75 / 100 % of a media post's
--                   video; each milestone once per visitor/post/UTC day
--
-- ANONYMOUS-SAFE. A visitor is 'u:<auth.uid()>' when signed in -- taken from
-- the JWT, never from the request -- and otherwise 'a:<random device id>', a
-- value the app generates and keeps in local storage. No IP, no user agent, no
-- name, nothing that identifies a person is stored. Readers return aggregates
-- only; no function returns a visitor or a user id.
--
-- TRUST. Anyone can call the write path, so these are engagement signals, not
-- audited figures: a determined client can inflate them, within the per-call
-- (20 events), per-day and published-company limits below. The portal says so.
--
-- Additive: one table, three functions. ROLLBACK: supabase/rollbacks/0087_audience_events.rollback.sql
-- ============================================================================

begin;

create table if not exists public.company_events (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  post_id    uuid references public.posts(id) on delete cascade,
  kind       text not null,
  visitor    text not null,
  user_id    uuid references auth.users(id) on delete set null,
  value      integer,
  detail     text,
  created_at timestamptz not null default now(),
  constraint company_events_kind_chk   check (kind in ('profile_view', 'share', 'video_progress')),
  constraint company_events_value_chk  check (kind <> 'video_progress' or value in (25, 50, 75, 100)),
  constraint company_events_detail_chk check (detail is null or detail in ('sheet', 'copy')),
  constraint company_events_post_chk   check (kind <> 'video_progress' or post_id is not null)
);
create index if not exists company_events_company_idx on public.company_events (company_id, kind, created_at desc);
create unique index if not exists company_events_view_once
  on public.company_events (company_id, visitor, ((created_at at time zone 'UTC')::date))
  where kind = 'profile_view';
create unique index if not exists company_events_video_once
  on public.company_events (post_id, visitor, value, ((created_at at time zone 'UTC')::date))
  where kind = 'video_progress';

alter table public.company_events enable row level security;
create policy "admin_read" on public.company_events for select to authenticated using (public.is_admin());
revoke all on public.company_events from anon, authenticated;
grant select on public.company_events to authenticated;   -- admin_read is the only row filter that admits anything

-- ---------------------------------------------------------------- write path
-- p_events: [{ k: kind, c: company slug or id, p?: post id, m?: media url,
--              v?: device id (signed out), n?: milestone, d?: 'sheet'|'copy' }]
-- Every malformed or ineligible item is skipped, never an error: telemetry must
-- not fail a screen. Returns how many events were newly recorded.
create or replace function public.record_company_events(p_events jsonb)
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  e jsonb; v_kind text; v_c text; v_co uuid; v_post uuid; v_visitor text; v_val integer; v_detail text;
  v_n integer := 0; v_rows integer;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then return 0; end if;
  if jsonb_array_length(p_events) > 20 then
    raise exception 'at most 20 events per call' using errcode = '22023';
  end if;

  for e in select * from jsonb_array_elements(p_events) loop
    continue when jsonb_typeof(e) <> 'object';
    v_kind := e ->> 'k';
    continue when v_kind is null or v_kind not in ('profile_view', 'share', 'video_progress');

    -- Who. Signed in: the JWT's user. Signed out: a device id of a fixed shape.
    if v_uid is not null then
      v_visitor := 'u:' || v_uid::text;
    elsif coalesce(e ->> 'v', '') ~ '^[A-Za-z0-9_-]{16,64}$' then
      v_visitor := 'a:' || (e ->> 'v');
    else
      continue;
    end if;

    -- Which company: published only, by slug or id.
    v_c := left(coalesce(e ->> 'c', ''), 120);
    v_co := null;
    if v_c ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select c.id into v_co from public.companies c where c.id = v_c::uuid and c.status = 'published';
    else
      select c.id into v_co from public.companies c where c.slug = v_c and c.status = 'published';
    end if;
    continue when v_co is null;

    -- Which post (optional for views and shares; required for video): a live
    -- post OF THAT COMPANY, by id, or by its media URL.
    v_post := null;
    if coalesce(e ->> 'p', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select p.id into v_post from public.posts p
       where p.id = (e ->> 'p')::uuid and p.company_id = v_co and p.removed_at is null;
    elsif coalesce(e ->> 'm', '') <> '' then
      select p.id into v_post from public.posts p
       where p.company_id = v_co and p.removed_at is null and p.media_url = left(e ->> 'm', 2000)
       order by p.published_at desc nulls last limit 1;
    end if;

    v_val := null; v_detail := null;
    if v_kind = 'video_progress' then
      continue when v_post is null;
      v_val := case when (e ->> 'n') in ('25', '50', '75', '100') then (e ->> 'n')::integer end;
      continue when v_val is null;
    elsif v_kind = 'share' then
      v_detail := case when (e ->> 'd') in ('sheet', 'copy') then e ->> 'd' end;
      continue when (select count(*) from public.company_events x
                      where x.company_id = v_co and x.visitor = v_visitor and x.kind = 'share'
                        and x.created_at >= ((now() at time zone 'UTC')::date)::timestamp at time zone 'UTC') >= 20;
    else
      v_post := null;   -- a profile view is of the company
    end if;

    insert into public.company_events (company_id, post_id, kind, visitor, user_id, value, detail)
    values (v_co, v_post, v_kind, v_visitor, v_uid, v_val, v_detail)
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_n := v_n + v_rows;
  end loop;
  return v_n;
end $$;
revoke execute on function public.record_company_events(jsonb) from public;
grant execute on function public.record_company_events(jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- summary
-- Window as 0065a/0073b: NULL = all time, else the UTC calendar window
-- [today - (p_days-1), today], p_days clamped to [1, 365].
create or replace function public.company_audience_summary(p_company uuid, p_days integer default null)
returns table (
  first_recorded_at  timestamptz,  -- the company's first event of any kind; NULL = never recorded
  profile_views      bigint,
  unique_visitors    bigint,
  signed_in_visitors bigint,
  shares             bigint,
  video_viewers      bigint,       -- distinct visitors who reached 25 % of any video
  video_completions  bigint        -- distinct (visitor, post) pairs that reached 100 %
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_from timestamptz; v_first timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  if p_days is not null then
    v_from := (((now() at time zone 'UTC')::date - (greatest(least(p_days, 365), 1) - 1))::timestamp at time zone 'UTC');
  end if;
  select min(e.created_at) into v_first from public.company_events e where e.company_id = p_company;
  return query
  select v_first,
         count(*) filter (where e.kind = 'profile_view'),
         count(distinct e.visitor) filter (where e.kind = 'profile_view'),
         count(distinct e.visitor) filter (where e.kind = 'profile_view' and e.visitor like 'u:%'),
         count(*) filter (where e.kind = 'share'),
         count(distinct e.visitor) filter (where e.kind = 'video_progress' and e.value = 25),
         count(distinct (e.visitor || ':' || e.post_id::text)) filter (where e.kind = 'video_progress' and e.value = 100)
    from public.company_events e
   where e.company_id = p_company
     and (v_from is null or e.created_at >= v_from);
end $$;
revoke execute on function public.company_audience_summary(uuid, integer) from public, anon;
grant  execute on function public.company_audience_summary(uuid, integer) to authenticated;

-- -------------------------------------------------------------- per video
create or replace function public.company_video_progress(p_company uuid, p_days integer default 30)
returns table (post_id uuid, reached_25 bigint, reached_50 bigint, reached_75 bigint, reached_100 bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_from timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  if p_days is not null then
    v_from := (((now() at time zone 'UTC')::date - (greatest(least(p_days, 365), 1) - 1))::timestamp at time zone 'UTC');
  end if;
  return query
  select e.post_id,
         count(distinct e.visitor) filter (where e.value = 25),
         count(distinct e.visitor) filter (where e.value = 50),
         count(distinct e.visitor) filter (where e.value = 75),
         count(distinct e.visitor) filter (where e.value = 100)
    from public.company_events e
    join public.posts p on p.id = e.post_id and p.removed_at is null
   where e.company_id = p_company and e.kind = 'video_progress'
     and (v_from is null or e.created_at >= v_from)
   group by e.post_id;
end $$;
revoke execute on function public.company_video_progress(uuid, integer) from public, anon;
grant  execute on function public.company_video_progress(uuid, integer) to authenticated;

commit;
