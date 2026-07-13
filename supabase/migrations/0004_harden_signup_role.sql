-- 0004_harden_signup_role.sql
-- SECURITY FIX (critical): close client-controlled privilege escalation at signup.
--
-- Before: handle_new_user() copied raw_user_meta_data->>'role' straight into
-- profiles.role, so a crafted signup with data:{role:"admin"} became a platform
-- admin (is_admin() = profiles.role='admin'). This constrains the role to a safe
-- allowlist and locks down direct writes to profiles.
--
-- Normal one-time migration, wrapped in a transaction. Re-running is harmless
-- (CREATE OR REPLACE / idempotent grants), but this is not designed as a
-- repeatedly-rerun migration.

begin;

-- 1) Never trust client metadata for a privileged role. Only 'company' or
--    'investor' may be self-assigned at signup; anything else (incl. 'admin',
--    'owner') falls back to the least-privileged 'investor'. Admin is granted
--    only by a deliberate, separate action — never via signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  requested text := new.raw_user_meta_data->>'role';
  safe_role text := case when requested in ('company','investor') then requested else 'investor' end;
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, safe_role)
  on conflict (id) do nothing;
  return new;
end
$function$;

-- 2) Ensure RLS is on for profiles (no-op if already enabled).
alter table public.profiles enable row level security;

-- 3) Defense-in-depth: profiles is written ONLY by the SECURITY DEFINER trigger
--    (which runs as the table owner). Remove all direct client write privileges
--    so no session can UPDATE its own role even if a policy were misconfigured.
--    Reads stay governed by the existing profiles_self_read policy.
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;

commit;
