-- ============================================================================
-- 0068_site_contract.sql — NOT APPLIED. Prepared for review.
--
-- Stage 0 of the website programme: what a bespoke site needs in order to read
-- its content from MineEx. No editor, no publishing listener, no change to any
-- existing publishing path.
--
-- FOUR THINGS
--   1. company_blueprints RLS — let a company's STAFF in, not only its owner.
--   2. blueprint_type gains 'website'.
--   3. company_blueprints gains `manifest` — written by the site, not the company.
--   4. site_credentials — hashed, scoped, revocable tokens.
--
-- Touches no existing table's data, no policy outside company_blueprints, and
-- no function the investor app, MineIQ, Conference Mode or the publishing
-- dispatcher depend on.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. THE STAFF-ACCESS DEFECT
--
-- 0012 shipped before company_memberships existed, so its policies predicate on
-- `companies.owner_id` directly:
--
--     using (public.is_admin() or exists (select 1 from public.companies c
--            where c.id = company_id and c.owner_id = auth.uid()))
--
-- Every other company-scoped table in the schema uses owns_company(), which is
-- owner OR an active membership. The result is that an invited staff member --
-- the person a company actually delegates its website to -- is denied on the
-- one table the website editor is built on. The self-service editor would have
-- worked for exactly one person per company.
--
-- Replaced with owns_company(), which is NOT a widening of the trust boundary:
-- it is the same predicate the portal already uses for press releases, media,
-- analytics and messaging. Admin access is preserved via can_touch_company(),
-- which is owns_company() OR is_admin() -- so the two policies below are
-- exactly equivalent to the old ones plus active staff.
-- ---------------------------------------------------------------------------
do $$
declare p record;
begin
  for p in (select policyname from pg_policies
             where schemaname = 'public' and tablename = 'company_blueprints')
  loop execute format('drop policy %I on public.company_blueprints', p.policyname); end loop;
end $$;

create policy "blueprint_company_read" on public.company_blueprints
  for select to authenticated
  using (public.can_touch_company(company_id));

create policy "blueprint_company_write" on public.company_blueprints
  for all to authenticated
  using (public.can_touch_company(company_id))
  with check (public.can_touch_company(company_id));

-- anon is default-denied: no policy names it, so blueprint drafts stay
-- unreachable from the public read path. Unchanged from 0012.

-- ---------------------------------------------------------------------------
-- 2. A website is a third kind of blueprint.
-- ---------------------------------------------------------------------------
alter table public.company_blueprints drop constraint if exists company_blueprints_blueprint_type_check;
alter table public.company_blueprints add constraint company_blueprints_blueprint_type_check
  check (blueprint_type in ('passport', 'conference', 'website'));

-- ---------------------------------------------------------------------------
-- 3. MANIFEST vs DATA — two authorities, two columns.
--
-- `data`     is the company's site content: headings, imagery, section order.
--            Written by the company through the portal.
-- `manifest` is the component schema: which sections exist and what fields they
--            expose. GENERATED FROM THE SITE'S SOURCE and uploaded by its build.
--
-- Separate columns because they have different authors and different blast
-- radii. In one jsonb blob, a company edit could overwrite the schema that
-- describes its own editor, and a deploy could clobber a customer's copy.
-- ---------------------------------------------------------------------------
alter table public.company_blueprints add column if not exists manifest jsonb;

comment on column public.company_blueprints.manifest is
  'Component schema uploaded by the site build (site token). Never written by the company.';
comment on column public.company_blueprints.data is
  'Site content authored by the company through the portal. Never written by a deploy.';

-- ---------------------------------------------------------------------------
-- 4. SITE CREDENTIALS
--
-- WHY NOT company_destinations.secret_ref: that column is a POINTER into a
-- credential vault ("secret_ref text, -- pointer into the credential vault; NOT
-- the token"). There is no vault, and these tokens need their own lifecycle --
-- expiry, revocation, last-used, two distinct kinds. A column comment promising
-- a vault is not a place to start putting secrets.
--
-- HASHED AT REST. `token_hash` is sha256(token). The plaintext is shown once at
-- creation and never stored, so a leaked database row yields nothing usable.
--
-- TWO KINDS:
--   site   long-lived, server/build only. Reads published content; uploads the
--          manifest.
--   draft  short-lived, minted per preview. Reads draft content. Expires alone.
-- ---------------------------------------------------------------------------
create table if not exists public.site_credentials (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  kind        text not null check (kind in ('site', 'draft')),
  token_hash  text not null unique,
  label       text not null default '',
  expires_at  timestamptz,
  revoked_at  timestamptz,
  last_used_at timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);

-- Verification looks a token up by hash and then checks the company; the hash is
-- already unique, so this index serves listing and revocation sweeps.
create index if not exists idx_site_credentials_company
  on public.site_credentials (company_id, kind, created_at desc);

alter table public.site_credentials enable row level security;

-- A company may SEE its credentials (label, kind, expiry, last use) so it can
-- audit and revoke. It can never read token_hash back to anything useful, and
-- it cannot mint one: issuing is an admin/service operation, because a token is
-- provisioned alongside a website MineEx builds.
create policy "site_credentials_read" on public.site_credentials
  for select to authenticated
  using (public.can_touch_company(company_id));

create policy "site_credentials_revoke" on public.site_credentials
  for update to authenticated
  using (public.can_touch_company(company_id))
  with check (public.can_touch_company(company_id));

revoke all on public.site_credentials from anon;
grant select, update on public.site_credentials to authenticated;

commit;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- select policyname, cmd from pg_policies
--  where schemaname='public' and tablename in ('company_blueprints','site_credentials')
--  order by tablename, policyname;
--
-- Expect: blueprint_company_read (SELECT), blueprint_company_write (ALL),
--         site_credentials_read (SELECT), site_credentials_revoke (UPDATE).

-- ============================================================================
-- ROLLBACK
-- Restores 0012's owner-only policies. Note that doing so re-breaks staff
-- access to the website editor, which is the defect this migration exists to
-- fix -- roll back only if can_touch_company() itself is found to be wrong.
-- ============================================================================
-- begin;
-- drop table if exists public.site_credentials;
-- alter table public.company_blueprints drop column if exists manifest;
-- alter table public.company_blueprints drop constraint if exists company_blueprints_blueprint_type_check;
-- alter table public.company_blueprints add constraint company_blueprints_blueprint_type_check
--   check (blueprint_type in ('passport','conference'));
-- drop policy if exists "blueprint_company_read" on public.company_blueprints;
-- drop policy if exists "blueprint_company_write" on public.company_blueprints;
-- create policy "blueprint_owner_admin_read" on public.company_blueprints
--   for select to authenticated
--   using (public.is_admin() or exists (
--     select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid()));
-- create policy "blueprint_owner_admin_write" on public.company_blueprints
--   for all to authenticated
--   using (public.is_admin() or exists (
--     select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid()))
--   with check (public.is_admin() or exists (
--     select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid()));
-- commit;
