-- ROLLBACK for 0057. Drops the submission throttle and the AI kill switch.
-- LOSES DATA: throttle counters (harmless) and the ai_controls row (the AI
-- emergency switch: if it was set to OFF, AI comes back ON on rollback).
-- /api/submit then fails CLOSED for lack of its counter; the AI guard refuses
-- AI calls (the switch is unreadable). Roll back the API first.
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
drop function if exists public.ai_enabled();
drop function if exists public.prune_submission_throttle();
drop function if exists public.bump_submission_throttle(text, text, timestamptz);
drop table if exists public.ai_controls;
drop table if exists public.submission_throttle;
commit;
