-- ============================================================================
-- 0073c_post_events_client_guard.sql — a12. APPLIED TO STAGING ONLY (2026-10-31); NOT production.
--
-- Found by the a12 live test (2026-10-31): a signed-in investor could POST
-- post_events rows directly with an ARBITRARY created_at. 0073a stops a second
-- impression on the same UTC day, but a backdated row lands on another day --
-- so one investor could add one impression per post for every invented past
-- day, and drag "recorded since" back to a date nothing was recorded on. The
-- same backdating worked for opens, dwell and saves (pre-existing).
--
-- TWO RULES, both enforced in the database:
--   1. A client never chooses WHEN an event happened. A BEFORE INSERT trigger
--      sets created_at = now() whenever the caller is anon or authenticated
--      (auth.role()). The service role and direct database sessions (fixtures,
--      backfills) are unaffected.
--   2. Impressions are written ONLY through record_post_impressions() (0073b):
--      validated ids, live posts only, at most 50 a call, one per investor per
--      post per UTC day. The own_insert policy (0009) now excludes
--      kind = 'impression'; the function is SECURITY DEFINER (table owner) and
--      is not subject to it. Nothing else ever emitted an impression, so no
--      client path breaks.
--
-- NOT CHANGED: grants (0061a), the select policy, the CHECK on kind, any data.
-- Still possible and out of scope: an investor recording many OPENS of a post
-- (opens are actions, not de-duplicated by design) -- noted in the plan.
-- ROLLBACK: supabase/rollbacks/0073c_post_events_client_guard.rollback.sql
-- ============================================================================

begin;

create or replace function public.post_events_client_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    new.created_at := now();
  end if;
  return new;
end $$;

drop trigger if exists post_events_client_guard on public.post_events;
create trigger post_events_client_guard
  before insert on public.post_events
  for each row execute function public.post_events_client_guard();

-- 0009's own_insert, plus: not an impression.
drop policy if exists "own_insert" on public.post_events;
create policy "own_insert" on public.post_events for insert to authenticated
  with check (user_id = auth.uid() and kind <> 'impression');

commit;
