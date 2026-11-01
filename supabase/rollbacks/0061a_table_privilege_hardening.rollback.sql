-- ROLLBACK for 0061a (from its own notes). EMERGENCY ONLY: restores Supabase's
-- default all-privileges grant, the over-grant 0061a removed. Prefer granting
-- back ONE missing privilege.
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
grant all on public.company_follows            to anon, authenticated;
grant all on public.post_events                to anon, authenticated;
grant all on public.post_likes                 to anon, authenticated;
grant all on public.user_company_relationships to anon, authenticated;
commit;
