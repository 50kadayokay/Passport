-- ============================================================================
-- 0061b_companies_column_grants.sql — NOT APPLIED. DEFERRED INDEFINITELY.
--
-- Withholds owner_id and preview_token from anon on public.companies.
--
-- WHY THIS IS NOT SCHEDULED
-- -------------------------
-- capacitor.config.json sets webDir: "dist" with NO server.url, so the iOS and
-- Android apps COMPILE THE WEB BUILD INTO THE BINARY. An installed build runs a
-- frozen copy of the JS. fetchCompany() -- called from PassportProto.jsx:7819,
-- :11418 and App.jsx:49, i.e. the native investor app -- sent `select=*` before
-- the accompanying patch.
--
-- Postgres cannot make a column revoke override a table-level grant, so the
-- table grant must be dropped and re-granted per column. Under column grants
-- `select=*` does not quietly omit what you may not read: IT FAILS THE WHOLE
-- REQUEST. So the moment this is applied, every already-installed build loses
-- company profiles until its user updates.
--
-- App Store adoption is NOT a mitigation. Old installs can remain active
-- indefinitely, and no waiting period makes this safe. Do not apply on the
-- assumption that "enough" users have upgraded.
--
-- WHAT WOULD MAKE IT SAFE, AND WHAT WOULD NOT
-- -------------------------------------------
--  • preview_token CAN be protected without breaking select=*: move it out of
--    companies into a side table keyed by company_id with its own RLS. Then
--    select=* simply never returns it and no client, old or new, can break.
--    Its only readers are the admin console and the preview flow -- a small,
--    self-contained change. This is the recommended route.
--  • owner_id CANNOT be moved cheaply. 0001's companies SELECT policy is
--    literally `owner_id = auth.uid() or status = 'published' or is_admin()`,
--    0006's trigger maintains memberships from it, and owns_company() reads it.
--    Relocating it means rewriting the core policy to consult another table --
--    and the obvious substitute, owns_company(), is SECURITY DEFINER and reads
--    companies, so calling it from a companies policy risks recursive policy
--    evaluation. Not a privilege migration's job.
--  • Severity supports that split: preview_token is an actual secret;
--    owner_id is an opaque UUID whose subject cannot be resolved (auth.users is
--    not exposed, and after 0061a anon reads no user-keyed table at all). All
--    5 claimed companies are currently unpublished, so nothing leaks today.
-- ============================================================================

begin;

do $$
declare col text;
begin
  revoke select on public.companies from anon;
  for col in
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'companies'
       and column_name not in ('owner_id', 'preview_token')
  loop
    execute format('grant select (%I) on public.companies to anon', col);
  end loop;
end $$;

commit;

-- MAINTENANCE COST: a column added to companies AFTER this runs gets no anon
-- grant and is invisible to the investor app until granted. Column grants have
-- no "and everything future" form. A public view would, and was ruled out.

-- ============================================================================
-- ROLLBACK -- EMERGENCY ONLY.
-- ============================================================================
-- begin;
-- do $$ declare col text; begin
--   for col in select column_name from information_schema.columns
--      where table_schema='public' and table_name='companies'
--   loop execute format('revoke select (%I) on public.companies from anon', col); end loop;
--   grant select on public.companies to anon;
-- end $$;
-- commit;
