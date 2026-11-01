-- ROLLBACK for 0060. ███ SECURITY REGRESSION ███ Restores EXECUTE on
-- publish_publication for public/anon/authenticated -- the forgeable-actor hole
-- 0060 closed (any client could publish as any actor). Stopgap only, and only
-- if the server publish path itself is broken by 0060.
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
grant execute on function public.publish_publication(uuid, uuid, timestamptz) to public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'publish_publication'
              and pg_get_function_identity_arguments(p.oid) = 'p_publication_id uuid, p_actor uuid') then
    execute 'grant execute on function public.publish_publication(uuid, uuid) to public, anon, authenticated';
  end if;
end $$;
commit;
