-- ROLLBACK for 0073c_post_events_client_guard.sql (a12). Restores 0009's
-- own_insert policy verbatim and removes the created_at guard. Data untouched.
-- Verified in a rolled-back transaction by scripts/analytics-0065-0073-check.mjs.
begin;
drop trigger if exists post_events_client_guard on public.post_events;
drop function if exists public.post_events_client_guard();
drop policy if exists "own_insert" on public.post_events;
create policy "own_insert" on public.post_events for insert to authenticated with check (user_id = auth.uid());
commit;
