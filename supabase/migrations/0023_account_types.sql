-- ============================================================================
-- 0023_account_types.sql — investor-only signup + company account tiers.
--
-- (1) HARDEN SIGNUP: every self-signup becomes 'investor', full stop. Company
--     accounts are provisioned by a platform admin (concierge), never by signup.
--     (0004 still allowed a crafted signup to self-assign 'company' — closed here.)
-- (2) TIERS: companies get a tier (listing/free/basic/pro) + a managed flag.
-- (3) PROVISIONING: one admin-only function to grant the company role, link the
--     user to a company, and set the tier — since profiles is otherwise write-locked.
-- Backend only; does not affect any shipped build.
-- ============================================================================

begin;

-- (1) SIGNUP = INVESTOR ONLY -------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Ignore any client-supplied role. Public signups are always investors;
  -- company/admin are granted only by a deliberate privileged action.
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'investor')
  on conflict (id) do nothing;
  return new;
end
$function$;

-- (2) COMPANY ACCOUNT TIERS --------------------------------------------------
alter table public.companies
  add column if not exists tier text not null default 'listing'
    check (tier in ('listing','free','basic','pro')),
  add column if not exists managed_by_admin boolean not null default true;
-- tier: listing = auto public directory entry (no owner, factual only)
--       free    = claimed account, cannot publish (upsell state)
--       basic   = basic profile + timeline; can publish PRESS RELEASES
--       pro     = rich profile + media; can self-edit (desktop)
-- managed_by_admin: true = you run it (concierge); false = company self-serve

-- (3) CONCIERGE PROVISIONING (admin only) ------------------------------------
-- Grants the company role, links the user to the company, and sets the tier in
-- one privileged call. profiles is write-locked (0004), so this SECURITY DEFINER
-- function is the only path to the 'company' role.
create or replace function public.admin_provision_company(
  p_user uuid, p_company uuid, p_tier text, p_managed boolean default true
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_tier not in ('free','basic','pro') then
    raise exception 'invalid tier: %', p_tier;
  end if;
  update public.profiles set role = 'company' where id = p_user;
  update public.companies
     set owner_id = p_user, tier = p_tier, managed_by_admin = p_managed
   where id = p_company;
end
$function$;

revoke all on function public.admin_provision_company(uuid,uuid,text,boolean) from public, anon;
grant execute on function public.admin_provision_company(uuid,uuid,text,boolean) to authenticated;

commit;
