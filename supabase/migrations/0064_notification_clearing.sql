-- ============================================================================
-- 0064_notification_clearing.sql — NOT APPLIED. Prepared for review.
--
-- "Clear all" on the company's Notifications page.
--
-- WHAT CLEARING MUST NOT DO
-- -------------------------
-- It must not touch the follow or the like. Those are an INVESTOR'S acts, and
-- the company's notification list is only a view of them. A company tidying its
-- own page has no business un-following itself on someone else's behalf, and
-- the row in company_follows / post_likes is the investor's record, not ours.
-- So nothing here deletes anything.
--
-- HOW IT WORKS INSTEAD
-- --------------------
-- One nullable timestamp per company. The feed is derived and strictly ordered
-- by time, so "I have dealt with everything up to now" is a single value --
-- there is no per-item state to store, and a dismissals table with one row per
-- hidden event would be a far larger thing to maintain for the same result.
--
-- A later follow or like is NEWER than cleared_at and reappears, which is the
-- behaviour you want: clearing empties the page, it does not mute the company.
--
-- WHY NOT REUSE seen_at
-- ---------------------
-- seen_at already exists on this table and is tempting. It is set AUTOMATICALLY
-- every time the page is opened -- that is what drives the unread badge -- so
-- filtering on it would make the list empty itself on every visit. Clearing is
-- a deliberate act and needs a value only a deliberate act writes.
-- ============================================================================

begin;

alter table public.company_notification_reads
  add column if not exists cleared_at timestamptz;

comment on column public.company_notification_reads.cleared_at is
  'Set by mark_notifications_cleared(). company_notifications() hides events at or before it. NULL = never cleared. Distinct from seen_at, which is written automatically on every page view.';

-- ------------------------------------------------------------- the clear RPC
create or replace function public.mark_notifications_cleared(p_company uuid)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_now timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  v_now := now();
  insert into public.company_notification_reads (company_id, seen_at, cleared_at)
       values (p_company, v_now, v_now)
  on conflict (company_id) do update
    set cleared_at = excluded.cleared_at,
        seen_at    = excluded.seen_at;     -- clearing implies having seen them
  return v_now;
end $$;

revoke execute on function public.mark_notifications_cleared(uuid) from public, anon;
grant  execute on function public.mark_notifications_cleared(uuid) to authenticated;

-- --------------------------------------------- the feed honours cleared_at
-- Identical to 0049 except for the one WHERE clause at the end. Restated in
-- full rather than patched, because that is how CREATE OR REPLACE works and a
-- half-remembered body is how a filter gets silently dropped later.
create or replace function public.company_notifications(p_company uuid, p_limit integer default 50)
returns table (
  kind             text,
  actor_name       text,
  actor_role       text,
  actor_company    text,
  subject          text,
  occurred_at      timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text; v_cleared timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  select c.slug into v_slug from public.companies c where c.id = p_company;
  select r.cleared_at into v_cleared
    from public.company_notification_reads r where r.company_id = p_company;

  return query
  with follows as (
    select distinct on (u.user_id) u.user_id, u.at
      from (
        select f.user_id, f.created_at as at
          from public.company_follows f
         where f.company_id = p_company
        union all
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
  select e.kind, ip.display_name, ip.role, ip.company, e.subject, e.occurred_at
    from events e
    left join public.investor_profiles ip on ip.user_id = e.user_id
   -- THE ONLY CHANGE FROM 0049. NULL cleared_at means nothing is hidden, so an
   -- untouched company sees exactly what it saw before this migration.
   where v_cleared is null or e.occurred_at > v_cleared
   order by e.occurred_at desc
   limit greatest(least(p_limit, 200), 1);
end $$;

revoke execute on function public.company_notifications(uuid, integer) from public, anon;
grant  execute on function public.company_notifications(uuid, integer) to authenticated;

commit;

-- ============================================================================
-- ROLLBACK. Restores 0049's unfiltered feed. The column is LEFT IN PLACE: it
-- holds the only record of what each company cleared, and dropping it to undo a
-- filter would throw that away for no gain.
-- ============================================================================
-- begin;
-- drop function if exists public.mark_notifications_cleared(uuid);
-- -- then re-run 0049's company_notifications() definition verbatim.
-- commit;
