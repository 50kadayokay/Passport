-- 0033: Access auto-locks when a subscription's paid-through date passes.
--
-- company_has_feature only checked status='active', with no time bound — so a manually-paid
-- company (e-transfer/wire) would keep access forever unless an admin remembered to flip the
-- status. This adds a paid-through check: an active subscription grants features only while
-- renews_at is null (no expiry set) OR in the future. When renews_at passes, entitlements go
-- dark automatically until an admin extends it (or Stripe's webhook pushes the next period).
--
-- Stripe subs are unaffected: their webhook keeps status/renews_at current, and a null
-- renews_at still means "no expiry" (safe default). Run in Supabase → SQL Editor. Idempotent.

begin;

create or replace function public.company_has_feature(cid uuid, fid text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select cf.enabled from public.company_features cf
      where cf.company_id = cid and cf.feature_id = fid),
    (select exists (
       select 1
         from public.company_subscriptions s
         join public.plan_features pf on pf.plan_id = s.plan_id
        where s.company_id = cid
          and s.status = 'active'
          and (s.renews_at is null or s.renews_at > now())
          and pf.feature_id = fid
     )),
    false
  );
$$;

commit;
