-- ============================================================================
-- 0015_account_deletion.sql — self-service account deletion (Apple Guideline
-- 5.1.1(v): an app with account creation must let the user delete their account
-- and data from inside the app).
--
-- `delete_own_account()` runs as its owner (SECURITY DEFINER) so it can remove the
-- caller's auth identity, but it only ever touches auth.uid() — a signed-in user
-- can delete ONLY themselves. The app calls it via /rest/v1/rpc with the user JWT.
-- ============================================================================

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- App data first (conversations cascade to messages). Explicit deletes so this
  -- works even where a foreign key lacks ON DELETE CASCADE.
  delete from public.conversations where investor_id = uid;
  delete from public.profiles      where id = uid;
  -- Then the auth identity itself.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
