-- ============================================================================
-- 0055_enable_device_push.sql — TURN ON DEVICE PUSH. APPLY DELIBERATELY.
--
-- This is the ONLY thing that causes company publications to queue real push
-- notifications. It is a separate migration precisely so that applying schema
-- changes can never start buzzing investors' phones as a side effect.
--
-- BEFORE APPLYING, CONFIRM ALL THREE:
--
--   1. You intend real followers to be notified when a company publishes.
--   2. PUSH_ENABLED=true is set in the sending environment. Without it the
--      sender marks queued rows 'skipped' and delivers nothing, so applying
--      this alone is still safe -- that is the second layer, not a substitute
--      for thinking about the first.
--   3. You are not mid-test. Queued rows for test publications will be
--      delivered once the sender runs.
--
-- TO REVERSE: delete the row. Queued-but-unsent rows remain in
-- notification_outbox and can be inspected or marked 'skipped' by hand.
--
--   delete from public.listener_subscriptions
--    where listener = 'device_push_v1' and event_type = 'PUBLICATION_PUBLISHED';
-- ============================================================================

insert into public.listener_subscriptions (listener, event_type) values
  ('device_push_v1', 'PUBLICATION_PUBLISHED')
on conflict (listener, event_type) do nothing;
