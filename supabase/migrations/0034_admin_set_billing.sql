-- 0034: admin_set_billing — the manual (e-transfer/wire/cash) billing control.
--
-- Lets an admin record a payment / change a company's plan without Stripe: sets the tier and
-- upserts company_subscriptions (plan from plan_for_tier, status, paid-through = renews_at,
-- note='manual'). Combined with 0033's expiry check, setting renews_at to +1 year on payment
-- means access auto-locks a year later unless the admin extends it again. Admin-only.
-- Run in Supabase → SQL Editor. Idempotent.

begin;

create or replace function public.admin_set_billing(
  p_company uuid,
  p_tier text default null,
  p_status text default 'active',
  p_renews_at timestamptz default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tier text; v_plan text;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select coalesce(p_tier, tier) into v_tier from public.companies where id = p_company;
  if v_tier is null then return jsonb_build_object('ok', false, 'error', 'company_not_found'); end if;
  v_plan := public.plan_for_tier(v_tier);

  -- Admins bypass the owner-guard, so the tier update is allowed.
  if p_tier is not null then update public.companies set tier = p_tier where id = p_company; end if;

  insert into public.company_subscriptions (company_id, plan_id, status, renews_at, note, updated_at)
  values (p_company, v_plan, coalesce(p_status, 'active'), p_renews_at, 'manual', now())
  on conflict (company_id) do update
    set plan_id = excluded.plan_id, status = excluded.status, renews_at = excluded.renews_at,
        note = 'manual', updated_at = now();

  return jsonb_build_object('ok', true, 'tier', v_tier, 'plan', v_plan,
                            'status', coalesce(p_status, 'active'), 'renews_at', p_renews_at);
end $$;

revoke all on function public.admin_set_billing(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.admin_set_billing(uuid, text, text, timestamptz) to authenticated;

commit;
