-- ROLLBACK for 0055 (device push; deliberately deferred, applied nowhere).
-- Stops the device-push listener from receiving new publication events.
-- Deliveries already queued are not removed.
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
delete from public.listener_subscriptions
 where listener = 'device_push_v1' and event_type = 'PUBLICATION_PUBLISHED';
commit;
