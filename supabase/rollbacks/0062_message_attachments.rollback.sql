-- ROLLBACK for 0062 (from its own notes). LOSES DATA: drops the
-- message_attachments table (attachment rows; the files stay in storage). The
-- bucket stays (see below).
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
drop policy if exists "msgattach_read"  on storage.objects;
drop policy if exists "msgattach_write" on storage.objects;
drop table if exists public.message_attachments;
drop function if exists public.can_touch_conversation(uuid);
-- The 'message-attachments' BUCKET is left in place: Supabase refuses SQL
-- deletes from storage tables ("use the Storage API"), so the original notes'
-- `delete from storage.buckets` cannot run (found by the round-trip test). An
-- unused bucket is harmless; remove it via the Storage API once empty, if wanted.
commit;
