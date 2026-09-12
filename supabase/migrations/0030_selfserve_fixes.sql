-- 0030: Self-serve provisioning fixes (found by the end-to-end dry-run)
--
-- Two gaps surfaced when a fresh company was walked through the real customer path
-- (provision → own → edit → publish):
--
--   BUG 1  The owner-guard trigger from 0029 was never actually installed on the live
--          DB (only the company_claims half took). A role='company' owner could flip
--          their own tier/status/slug — i.e. grant themselves paid features for free.
--          Re-install the guard function + trigger (idempotent).
--
--   BUG 2  admin_provision_company() set owner_id/role/tier but never created a
--          company_subscriptions row. Publishing is gated by my_features(), which reads
--          the SUBSCRIPTION (plan → plan_features), NOT companies.tier. So every newly
--          provisioned/claimed company was entitlement-less and could not publish a
--          press release OR media until a subscription was hand-inserted. Fix: the
--          provision RPC now also upserts a subscription, mapping the legacy tier to a
--          plan. Free companies still get the base 'passport' plan, which includes
--          passport_profile — so they CAN post to the MineEx feed (press releases +
--          media); paid plans add the external channels (LinkedIn/X/newsletter/push).
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

begin;

-- ============================ BUG 1: owner-guard =============================
create or replace function public.company_owner_guard()
returns trigger
language plpgsql
as $function$
begin
  if public.is_admin() or coalesce(auth.role(), '') = 'service_role' then
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

drop trigger if exists trg_company_owner_guard on public.companies;
create trigger trg_company_owner_guard
  before update on public.companies
  for each row execute function public.company_owner_guard();

-- ===================== BUG 2: provision creates a plan =======================
-- Legacy display tier → real entitlement plan.
create or replace function public.plan_for_tier(p_tier text)
returns text language sql immutable as $function$
  select case p_tier
    when 'free'  then 'passport'
    when 'basic' then 'passport_communications'
    when 'pro'   then 'passport_managed'
    else 'passport'
  end;
$function$;

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
  -- Entitlement: a company can't publish without an active subscription. Upsert one
  -- for the tier's plan so ownership and the ability to publish arrive together.
  insert into public.company_subscriptions (company_id, plan_id, status)
  values (p_company, public.plan_for_tier(p_tier), 'active')
  on conflict (company_id) do update
     set plan_id = excluded.plan_id, status = 'active', updated_at = now();
end
$function$;

revoke all on function public.admin_provision_company(uuid,uuid,text,boolean) from public, anon;
grant execute on function public.admin_provision_company(uuid,uuid,text,boolean) to authenticated;

-- Backfill: any already-provisioned owner without a subscription gets one now, so
-- existing self-serve companies aren't stuck unable to publish.
insert into public.company_subscriptions (company_id, plan_id, status)
select c.id, public.plan_for_tier(c.tier), 'active'
  from public.companies c
 where c.owner_id is not null
   and not exists (select 1 from public.company_subscriptions s where s.company_id = c.id)
on conflict (company_id) do nothing;

commit;
