-- 0069b_stripe_events.sql — F9: Stripe webhook idempotency, ordering and binding.
--
-- STATUS: APPLIED TO STAGING ONLY (jmljfovtfxcdhjmtlnva, 2026-10-30, approved).
-- NOT applied to production; production needs its own approval.
-- api/stripe-webhook.js works without it (legacy path, no de-duplication) and
-- uses it automatically once it exists.
--
-- WHAT IT ADDS
--   1. public.stripe_events: one row per Stripe event id that was processed.
--      The primary key IS the idempotency guarantee: a second delivery of the
--      same event -- a Stripe retry, a replay, or a concurrent delivery to
--      another serverless instance -- cannot insert, and is acknowledged
--      without touching billing. Service role only: RLS on, no policies, no
--      grants to anon/authenticated.
--   2. Three nullable columns on public.company_subscriptions:
--        stripe_subscription_id  the Stripe subscription this company's billing
--                                is BOUND to (set by checkout, or by the first
--                                event for a company that has none)
--        stripe_status           Stripe's raw status (canceled is terminal)
--        stripe_event_at         event.created of the last event applied
--      Nullable, no default, no backfill: existing rows (manual/invoiced
--      billing, and Stripe rows from before this migration) are unchanged and
--      simply have no binding yet.
--   3. public.stripe_apply_event(...): records the event and applies it in ONE
--      transaction, serialised per company by a row lock on companies. Rules:
--        duplicate           event id already recorded            -> nothing
--        unknown_company     metadata names no company            -> nothing
--        dead_checkout       a checkout whose subscription is not
--                            live never binds or replaces anything -> nothing
--        needs_verification  FIRST binding of a company (no row, or
--                            no binding yet) by anything other than
--                            a checkout: the claim is released and
--                            the caller must name the company's
--                            CURRENT subscription, verified against
--                            Stripe, and call again               -> nothing
--        unverified_binding  ...it did, and this event is not for
--                            that subscription (a late event for an
--                            old one, an unrelated one, or Stripe
--                            could not be asked)                  -> nothing
--        other_subscription  the company is bound to a DIFFERENT
--                            subscription (except a live checkout,
--                            which binds, and subscription.created
--                            when the bound one is no longer active) -> nothing
--        stale               older than the last applied event     -> nothing
--        terminal            the bound subscription is canceled
--                            and this is not its deletion           -> nothing
--        applied             upsert the subscription row, bind, and
--                            set companies.tier when active
--      An exception rolls back the whole transaction, INCLUDING the event row,
--      so Stripe's retry is processed normally rather than seen as a duplicate.
--
-- IMPACT
--   * company_subscriptions: ADD COLUMN ... NULL is a metadata-only change in
--     Postgres 11+ (no table rewrite); a brief ACCESS EXCLUSIVE lock.
--   * Nothing existing reads the new columns. my_features / entitlements read
--     plan_id and status exactly as before.
--   * The plan is derived with plan_for_tier() (0032), the same mapping as the
--     webhook's TIER_PLAN. An event WITHOUT a tier (invoice.payment_failed)
--     keeps the stored plan instead of resetting it to 'passport' -- the legacy
--     path's behaviour, which downgraded a Pro company's plan on a failed
--     payment.
--   * Rows grow by one per Stripe event (a few per company per year).
--
-- ROLLBACK
--   drop function if exists public.stripe_apply_event(text, text, timestamptz, uuid, text, text, text, text, text, timestamptz, text);
--   drop table if exists public.stripe_events;
--   alter table public.company_subscriptions
--     drop column if exists stripe_subscription_id,
--     drop column if exists stripe_status,
--     drop column if exists stripe_event_at;
--   (The webhook falls back to its legacy path when the function is missing.)

begin;

create table if not exists public.stripe_events (
  id                text primary key check (id ~ '^evt_[A-Za-z0-9_]{1,250}$'),
  type              text not null,
  stripe_created    timestamptz not null,
  company_id        uuid,
  subscription_id   text,
  outcome           text not null,
  received_at       timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from public, anon, authenticated;

alter table public.company_subscriptions
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_status          text,
  add column if not exists stripe_event_at        timestamptz;

create or replace function public.stripe_apply_event(
  p_event_id      text,
  p_type          text,
  p_created       timestamptz,
  p_company       uuid,
  p_subscription  text,
  p_kind          text,        -- bind | sync | delete | payment_failed | ignore
  p_status        text,        -- portal status: active | past_due | cancelled
  p_stripe_status text,        -- Stripe's raw subscription status
  p_tier          text,        -- free | basic | pro, or null (keep the stored plan)
  p_renews_at     timestamptz,
  p_verified_subscription text default null   -- the company's CURRENT subscription, as
                                              -- the caller verified with Stripe (first binding only)
)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row     public.company_subscriptions%rowtype;
  v_found   boolean := false;
  v_outcome text;
  v_plan    text;
begin
  if p_kind not in ('bind', 'sync', 'delete', 'payment_failed', 'ignore') then
    raise exception 'stripe_apply_event: unknown kind %', p_kind using errcode = '22023';
  end if;

  -- 1. Idempotency. A concurrent delivery of the same id waits on the primary
  --    key until this transaction ends, then finds the row and stops here.
  insert into public.stripe_events (id, type, stripe_created, company_id, subscription_id, outcome)
  values (p_event_id, p_type, p_created, p_company, p_subscription, 'pending')
  on conflict (id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  if p_kind = 'ignore' or p_company is null then
    v_outcome := 'ignored';
  else
    -- 2. Serialise every event for this company (and confirm it exists).
    perform 1 from public.companies where id = p_company for update;
    if not found then
      v_outcome := 'unknown_company';
    else
      select * into v_row from public.company_subscriptions where company_id = p_company for update;
      v_found := found;

      -- 3. Binding: events for a subscription this company is not bound to
      --    must not change its billing.
      --
      -- 3a. A checkout for a subscription that is not live (Stripe says
      --     canceled / incomplete / ...) never binds or replaces anything.
      if p_kind = 'bind' and coalesce(p_status, '') not in ('active', 'past_due')
         and (not v_found or v_row.stripe_subscription_id is distinct from p_subscription) then
        v_outcome := 'dead_checkout';
      end if;

      -- 3b. FIRST binding (no row, or a row with no binding: every row that
      --     predates 0069b, and manual billing). Only a live checkout may bind
      --     on its own. Any other event must be for the company's CURRENT
      --     subscription as verified with Stripe by the caller; a late event
      --     for an old subscription, or an unrelated one carrying this
      --     company's id, must not set the binding or change billing.
      if v_outcome is null and p_kind <> 'bind' and (not v_found or v_row.stripe_subscription_id is null) then
        if p_verified_subscription is null then
          -- Not verified yet: release the claim so the caller can verify
          -- and call again with the same event id.
          delete from public.stripe_events where id = p_event_id;
          return 'needs_verification';
        elsif p_subscription is distinct from p_verified_subscription then
          v_outcome := 'unverified_binding';
        end if;
      end if;

      -- 3c. An event that names no subscription cannot be attributed to the
      --     binding (a checkout always carries one).
      if v_outcome is null and p_kind <> 'bind' and p_subscription is null then
        v_outcome := 'other_subscription';
      end if;

      -- 3d. Bound to a different subscription.
      if v_outcome is null and v_found and v_row.stripe_subscription_id is not null and p_subscription is not null
         and v_row.stripe_subscription_id <> p_subscription then
        if p_kind = 'bind'
           or (p_type = 'customer.subscription.created' and coalesce(v_row.status, '') <> 'active') then
          null;   -- a new, live subscription replaces the binding
        else
          v_outcome := 'other_subscription';
        end if;
      end if;

      -- 4. Ordering: never let an older event overwrite a newer state.
      if v_outcome is null and v_found and v_row.stripe_event_at is not null and p_created < v_row.stripe_event_at then
        v_outcome := 'stale';
      end if;

      -- 5. A canceled subscription stays canceled (Stripe cannot revive it).
      if v_outcome is null and v_found and v_row.stripe_subscription_id is not distinct from p_subscription
         and v_row.stripe_status in ('canceled', 'incomplete_expired') and p_kind <> 'delete' then
        v_outcome := 'terminal';
      end if;

      -- 6. Apply.
      if v_outcome is null then
        v_plan := case when p_tier is null then coalesce(v_row.plan_id, 'passport') else public.plan_for_tier(p_tier) end;
        insert into public.company_subscriptions
               (company_id, plan_id, status, renews_at, note, updated_at, stripe_subscription_id, stripe_status, stripe_event_at)
        values (p_company, v_plan, p_status, p_renews_at, 'stripe', now(),
                coalesce(p_subscription, v_row.stripe_subscription_id), p_stripe_status, p_created)
        on conflict (company_id) do update
           set plan_id                = excluded.plan_id,
               status                 = excluded.status,
               renews_at              = excluded.renews_at,
               note                   = 'stripe',
               updated_at             = now(),
               stripe_subscription_id = excluded.stripe_subscription_id,
               stripe_status          = coalesce(excluded.stripe_status, public.company_subscriptions.stripe_status),
               stripe_event_at        = excluded.stripe_event_at;
        -- The display tier follows only a GOOD subscription (unchanged rule).
        if p_status = 'active' and p_tier is not null then
          update public.companies set tier = p_tier where id = p_company and tier is distinct from p_tier;
        end if;
        v_outcome := 'applied';
      end if;
    end if;
  end if;

  update public.stripe_events set outcome = v_outcome where id = p_event_id;
  return v_outcome;
end
$$;

revoke execute on function public.stripe_apply_event(text, text, timestamptz, uuid, text, text, text, text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.stripe_apply_event(text, text, timestamptz, uuid, text, text, text, text, text, timestamptz, text)
  to service_role;

commit;
