-- ROLLBACK for 0061b (from its own notes). EMERGENCY ONLY: back to table-wide
-- SELECT on companies for anon (owner_id and preview_token become readable).
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
do $$ declare col text; begin
  for col in select column_name from information_schema.columns where table_schema = 'public' and table_name = 'companies'
  loop execute format('revoke select (%I) on public.companies from anon', col); end loop;
  grant select on public.companies to anon;
end $$;
commit;
