-- ROLLBACK for 0068 (from its own notes). LOSES DATA: drops site_credentials
-- (website tokens) and the blueprint manifest column; restores 0012's
-- owner-only blueprint policies (re-breaks staff access to the website editor).
-- If 0076 is applied, roll it back first. Existing 'website' blueprints are kept.
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
drop table if exists public.site_credentials;
alter table public.company_blueprints drop column if exists manifest;
alter table public.company_blueprints drop constraint if exists company_blueprints_blueprint_type_check;
-- NOT VALID: website blueprints created while 0068 was live are KEPT (the
-- original notes' plain ADD fails on them -- found by the round-trip test);
-- new website rows are refused again, which is the pre-0068 behaviour.
alter table public.company_blueprints add constraint company_blueprints_blueprint_type_check
  check (blueprint_type in ('passport','conference')) not valid;
drop policy if exists "blueprint_company_read" on public.company_blueprints;
drop policy if exists "blueprint_company_write" on public.company_blueprints;
create policy "blueprint_owner_admin_read" on public.company_blueprints
  for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid()));
create policy "blueprint_owner_admin_write" on public.company_blueprints
  for all to authenticated
  using (public.is_admin() or exists (
    select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid()))
  with check (public.is_admin() or exists (
    select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid()));
commit;
