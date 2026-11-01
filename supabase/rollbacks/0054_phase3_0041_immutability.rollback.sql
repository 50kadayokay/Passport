-- ROLLBACK for 0054. Removes the append-only and no-truncate triggers from the
-- 0041 evidence tables and the function they call (phase3_no_truncate predates
-- 0054 and is kept). This REMOVES a data-protection control: evidence rows
-- become editable and deletable again. Emergency only.
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
drop trigger if exists source_transcripts_immutable    on public.source_transcripts;
drop trigger if exists extraction_attempts_immutable   on public.extraction_attempts;
drop trigger if exists source_transcripts_no_truncate  on public.source_transcripts;
drop trigger if exists extraction_attempts_no_truncate on public.extraction_attempts;
drop function if exists public.phase3_0041_append_only();
commit;
