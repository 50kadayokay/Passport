-- ============================================================================
-- 0049_company_notifications.sql — who followed you, who liked a release.
--
-- WHERE THE PRIVACY LINE SITS
-- ---------------------------
-- 0048 exposes engagement as AGGREGATES ONLY and says so explicitly: a company
-- has an interest in how many investors read a release and none in which one.
-- This migration names individuals, so it needs to say why that is not a
-- reversal.
--
-- The distinction is deliberate vs passive:
--   • A FOLLOW or a LIKE is an act the investor chose and expects to be seen,
--     the way following a company on LinkedIn is. Naming them is the point of
--     the act.
--   • A VIEW, an OPEN or a DWELL time is passive. The investor did not signal
--     anything to anybody; reporting who did those would be surveillance.
-- So follows and likes carry a name here; views and reads stay aggregate in
-- 0048 and are not exposed per-person anywhere.
--
-- Only display fields are returned -- the same four 0047 uses for messaging --
-- and never an email address.
-- ============================================================================

-- ------------------------------------------------------- the unread marker
create table if not exists public.company_notification_reads (
  company_id uuid primary key references public.companies(id) on delete cascade,
  seen_at    timestamptz not null default now()
);

alter table public.company_notification_reads enable row level security;

drop policy if exists cnr_select on public.company_notification_reads;
create policy cnr_select on public.company_notification_reads
  for select using (public.owns_company(company_id));

grant select on public.company_notification_reads to authenticated;

-- ------------------------------------------------------------------ the feed
create or replace function public.company_notifications(p_company uuid, p_limit integer default 50)
returns table (
  kind             text,        -- 'follow' | 'like'
  actor_name       text,
  actor_role       text,
  actor_company    text,
  subject          text,        -- the release title, for a like
  occurred_at      timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  select c.slug into v_slug from public.companies c where c.id = p_company;

  return query
  with follows as (
    -- Two follow sources, as in 0048. DISTINCT ON keeps the earliest record per
    -- person so someone present in both tables appears once.
    select distinct on (u.user_id) u.user_id, u.at
      from (
        select f.user_id, f.created_at as at
          from public.company_follows f
         where f.company_id = p_company
        union all
        -- NOTE: user_company_relationships.created_at is when the ROW was
        -- created, which may predate the moment is_following became true.
        -- It is the only timestamp the table offers.
        select r.user_id, r.created_at
          from public.user_company_relationships r
         where r.company_slug = v_slug and r.is_following
      ) u
     order by u.user_id, u.at asc
  ),
  events as (
    select 'follow'::text as kind, f.user_id, null::text as subject, f.at as occurred_at
      from follows f
    union all
    select 'like'::text, l.user_id, coalesce(p.title, 'a release'), l.created_at
      from public.post_likes l
      left join public.posts p on p.id::text = l.post_key
     where l.company_slug = v_slug
  )
  select e.kind,
         ip.display_name,
         ip.role,
         ip.company,
         e.subject,
         e.occurred_at
    from events e
    left join public.investor_profiles ip on ip.user_id = e.user_id
   order by e.occurred_at desc
   limit greatest(least(p_limit, 200), 1);
end $$;

revoke execute on function public.company_notifications(uuid, integer) from public;
grant  execute on function public.company_notifications(uuid, integer) to authenticated;

-- ------------------------------------------------------------- mark as seen
create or replace function public.mark_notifications_seen(p_company uuid)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_now timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  v_now := now();
  insert into public.company_notification_reads (company_id, seen_at)
       values (p_company, v_now)
  on conflict (company_id) do update set seen_at = excluded.seen_at;
  return v_now;
end $$;

revoke execute on function public.mark_notifications_seen(uuid) from public;
grant  execute on function public.mark_notifications_seen(uuid) to authenticated;

create index if not exists idx_post_likes_slug_created
  on public.post_likes (company_slug, created_at desc);
