-- 0032: Align plan entitlements with the Free / Basic / Pro tab ladder.
--
-- The tab gating limits BASIC companies to Overview + a press-release Timeline, and reserves
-- media / external channels / analytics for PRO. But plan_for_tier (0030) mapped basic →
-- 'passport_communications', which ALSO grants LinkedIn/X/newsletter/push + analytics — more
-- than a Basic company should get. This realigns publishing rights to match the ladder:
--
--   free  → passport           (base profile; app-feed presence)
--   basic → passport           (edit profile + publish press releases to the MineEx feed only)
--   pro   → passport_managed    (everything: external channels, push, analytics, website)
--
-- The 'passport_communications' plan is left intact (unused by the ladder now; available for a
-- future mid-tier). Existing basic subscriptions on the old plan are moved to 'passport'.
-- Run in Supabase → SQL Editor. Idempotent.

begin;

create or replace function public.plan_for_tier(p_tier text)
returns text language sql immutable as $function$
  select case p_tier
    when 'free'  then 'passport'
    when 'basic' then 'passport'
    when 'pro'   then 'passport_managed'
    else 'passport'
  end;
$function$;

-- Realign any already-provisioned Basic companies to the corrected plan.
update public.company_subscriptions s
   set plan_id = 'passport', updated_at = now()
  from public.companies c
 where c.id = s.company_id
   and c.tier = 'basic'
   and s.plan_id = 'passport_communications';

commit;
