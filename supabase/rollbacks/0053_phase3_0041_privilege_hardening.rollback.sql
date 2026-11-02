-- ROLLBACK for 0053. Restores Supabase's default grants on the two 0041
-- evidence tables (all privileges to anon and authenticated). RLS still applies,
-- but this re-widens privileges 0053 removed: an emergency measure only.
-- Before using in production, compare with production's CURRENT grants on
-- these tables (if 0053 was never applied there, those ARE the pre-state).
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
grant all on public.source_transcripts  to anon, authenticated;
grant all on public.extraction_attempts to anon, authenticated;
commit;
