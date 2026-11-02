-- ROLLBACK for 0056. Restores PostgreSQL's default EXECUTE for PUBLIC and the
-- explicit anon grant on the four functions 0056 closed. Re-opens what 0056
-- closed: emergency only. Compare with production's current grants first.
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
grant execute on function public.owns_company_slug(text)           to public, anon;
grant execute on function public.mark_conversation_read(uuid)       to public, anon;
grant execute on function public.company_conversation_senders(text) to public, anon;
grant execute on function public.mineiq_search(uuid, text, integer) to public, anon;
commit;
