-- ROLLBACK for 0066 (from its own notes). LOSES DATA: Mine IQ chat history.
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
drop table if exists public.mineiq_messages;
drop table if exists public.mineiq_threads;
commit;
