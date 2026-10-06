-- ============================================================================
-- 0042_push_token_ownership.sql — one device token belongs to one signed-in user.
--
-- PROBLEM (R4 / B13)
--   push_tokens is keyed (user_id, token), so the SAME device token can be
--   attached to several users at once, and nothing removed it on logout:
--
--     Investor A signs in   -> row (A, tok)
--     A signs out           -> row (A, tok) REMAINS
--     Investor B signs in   -> row (B, tok) added
--     => the device now receives A's notifications as well as B's.
--
--   RLS cannot fix this from B's session: push_tokens_own_delete only allows
--   auth.uid() = user_id, so B may not remove A's row. The cleanup therefore has
--   to happen either while A is still signed in (client-side, on logout) or in a
--   SECURITY DEFINER function. We do both: the logout path is the clean case,
--   and this function is the safety net for when A never logged out cleanly
--   (app killed, session expired, reinstall).
--
-- SCOPE OF THE DELETE — deliberately narrow
--   Matching is by the EXACT token string, which identifies one app install on
--   one device. Removing rows for other users with that token therefore only
--   detaches THIS device from those accounts. An investor's OTHER devices have
--   different token strings and are never touched.
-- ============================================================================
begin;

-- Register (or re-register) this device for the CALLING user, and detach the
-- same device from every other account, atomically.
create or replace function public.claim_push_token(
  p_token    text,
  p_platform text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'claim_push_token requires an authenticated user';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'claim_push_token requires a token';
  end if;
  if p_platform not in ('ios','android','web') then
    raise exception 'claim_push_token: unsupported platform %', p_platform;
  end if;

  -- This device is no longer any other account's device.
  delete from public.push_tokens
   where token = p_token
     and user_id <> v_uid;

  -- Idempotent upsert for the caller (primary key is (user_id, token)).
  insert into public.push_tokens (user_id, token, platform)
  values (v_uid, p_token, p_platform)
  on conflict (user_id, token)
  do update set platform = excluded.platform, updated_at = now();
end;
$$;

revoke all on function public.claim_push_token(text,text) from public, anon;
grant execute on function public.claim_push_token(text,text) to authenticated;

-- Detach this device from the CALLING user only (used on logout).
-- Scoped to auth.uid() so it can never affect another account, and to the exact
-- token so it can never affect the same investor's other devices.
create or replace function public.release_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_token is null then return; end if;
  delete from public.push_tokens
   where user_id = v_uid
     and token = p_token;
end;
$$;

revoke all on function public.release_push_token(text) from public, anon;
grant execute on function public.release_push_token(text) to authenticated;

commit;
