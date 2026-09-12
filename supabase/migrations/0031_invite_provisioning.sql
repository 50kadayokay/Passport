-- 0031: Make accepting a company invitation ACTUALLY provision a working portal.
--
-- The gap: accept_company_invitation() (0007) only inserted a company_memberships row. But:
--   • Editing the profile needs companies.owner_id = auth.uid() (companies UPDATE RLS, 0001).
--   • Publishing (and even passing the portal entitlement gate) needs a company_subscriptions
--     row — my_features() resolves features from the subscription's plan.
-- So an invited company landed on the "locked" screen and could neither edit nor publish.
--
-- This mirrors the fix already made for admin_provision_company in 0030: on accept, hand off
-- ownership (owner_id + role='company') and create an active subscription for the company's
-- tier (plan_for_tier from 0030). Owner_id is only set when currently NULL, so a handoff never
-- yanks an existing owner.
--
-- The owner-guard (0029/0030) blocks non-admins from changing owner_id, and this function runs
-- as the invited (non-admin) user, so we add a session-local bypass flag that ONLY these
-- SECURITY DEFINER provisioning functions set. Run in Supabase → SQL Editor. Idempotent.

begin;

-- 1) Owner-guard: also bypass when a provisioning function sets app.provisioning='on' (session-
--    local, so it never leaks to a normal client UPDATE).
create or replace function public.company_owner_guard()
returns trigger
language plpgsql
as $function$
begin
  if public.is_admin()
     or coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('app.provisioning', true), '') = 'on' then
    return new;
  end if;
  if new.tier             is distinct from old.tier             then raise exception 'company_owner_guard: tier is admin-managed'; end if;
  if new.status           is distinct from old.status           then raise exception 'company_owner_guard: status is admin-managed'; end if;
  if new.slug             is distinct from old.slug             then raise exception 'company_owner_guard: slug is immutable'; end if;
  if new.owner_id         is distinct from old.owner_id         then raise exception 'company_owner_guard: owner_id is admin-managed'; end if;
  if new.primary_ticker   is distinct from old.primary_ticker   then raise exception 'company_owner_guard: ticker is admin-managed'; end if;
  if new.managed_by_admin is distinct from old.managed_by_admin then raise exception 'company_owner_guard: managed flag is admin-managed'; end if;
  return new;
end
$function$;

-- 2) accept_company_invitation: membership (as before) + full provisioning.
create or replace function public.accept_company_invitation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.company_invitations; v_email text;
begin
  select * into v from public.company_invitations where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if v.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'used'); end if;
  if v.expires_at is not null and v.expires_at < now() then
    update public.company_invitations set status = 'expired' where id = v.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  if v_email <> lower(v.email) then return jsonb_build_object('ok', false, 'error', 'email_mismatch'); end if;

  insert into public.company_memberships (company_id, user_id, role, status)
  values (v.company_id, auth.uid(), v.role, 'active')
  on conflict (company_id, user_id) do update set status = 'active', role = excluded.role;

  -- Hand off a WORKING portal: role, ownership (if unclaimed), and an active subscription.
  perform set_config('app.provisioning', 'on', true);   -- transaction-local guard bypass
  update public.profiles set role = 'company' where id = auth.uid() and role is distinct from 'admin';
  update public.companies set owner_id = coalesce(owner_id, auth.uid()) where id = v.company_id;
  insert into public.company_subscriptions (company_id, plan_id, status)
    select v.company_id, public.plan_for_tier(c.tier), 'active' from public.companies c where c.id = v.company_id
  on conflict (company_id) do update set status = 'active', plan_id = excluded.plan_id, updated_at = now();

  update public.company_invitations
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v.id;

  return jsonb_build_object('ok', true, 'company_id', v.company_id);
end $$;

commit;
