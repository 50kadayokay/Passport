-- ROLLBACK for 0069b (from its own notes). LOSES DATA: the Stripe event ledger
-- and three subscription columns. The webhook falls back to its legacy path
-- when the function is missing.
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
drop function if exists public.stripe_apply_event(text, text, timestamptz, uuid, text, text, text, text, text, timestamptz, text);
drop table if exists public.stripe_events;
alter table public.company_subscriptions
  drop column if exists stripe_subscription_id,
  drop column if exists stripe_status,
  drop column if exists stripe_event_at;
commit;
