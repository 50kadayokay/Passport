-- BATCH 11: 0066_mineiq_conversations.sql .. 0068_site_contract.sql (3 files)

-- ======== 0066_mineiq_conversations.sql ========
-- ============================================================================
-- 0066_mineiq_conversations.sql — NOT APPLIED. Prepared for review.
--
-- Server-side history for MineIQ chat. Until this is applied, threads live in
-- the browser (src/lib/mineiqChat.js) and therefore do not follow a user to
-- another device or to a colleague. The portal says so in the history panel
-- rather than implying a sync that is not happening.
--
-- WHY NOT REUSE `conversations` / `messages`
-- ------------------------------------------
-- Those are the INVESTOR↔COMPANY inbox (0014, 0047). Their rows carry an
-- investor_id and a company_slug, and their policies are written so that an
-- investor can read their own side of a thread. Putting a company's private AI
-- prompts in that table would place them one policy mistake away from the
-- investor who is allowed to read the other rows -- and would need `investor_id`
-- to become nullable, weakening the constraint the inbox depends on. Separate
-- tables, separate policies.
--
-- WHO CAN READ A THREAD
-- ---------------------
-- The author, always. Other members of the company ONLY if the author shares it.
-- An earlier draft of this file gated on owns_company() alone, which would have
-- made every employee's chat history readable by every colleague the moment it
-- was applied -- a CEO drafting a financing question, visible to the whole
-- team. Company scope is necessary but not sufficient: both conditions are
-- checked, so leaving the company also ends access to anything shared.
--
-- Writes are the author's alone. `shared_with_company` lets someone publish a
-- thread to colleagues; it does not let colleagues edit, delete, or continue it,
-- because a shared conversation that anyone can append to is no longer a record
-- of who asked what.
--
-- WHAT IT IS NOT. Not a knowledge store. Nothing written here is a company
-- fact, is retrieved by mineiq_search, or reaches an investor: a chat message
-- is a record of a question asked, and the rule that chat cannot overwrite
-- trusted company facts is preserved by these tables holding no facts at all.
-- ============================================================================

begin;

create table if not exists public.mineiq_threads (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  -- Private by default. Sharing is an explicit act, never a side effect of
  -- belonging to the same company.
  shared_with_company boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.mineiq_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.mineiq_threads(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  body        text not null default '',
  -- The sources the answer cited, as returned. Stored so reopening a thread
  -- shows the same provenance the reader saw at the time; re-deriving them
  -- later would show today's record, not the one that was answered from.
  sources     jsonb not null default '[]'::jsonb,
  grounded    boolean,
  created_at  timestamptz not null default now()
);

-- The listing query is always (company, me, newest first).
create index if not exists idx_mineiq_threads_mine on public.mineiq_threads (company_id, user_id, updated_at desc);
create index if not exists idx_mineiq_messages_thread on public.mineiq_messages (thread_id, created_at);

alter table public.mineiq_threads  enable row level security;
alter table public.mineiq_messages enable row level security;

-- owns_company() is the company's owner or an active membership (0006), the same
-- gate the portal itself uses. Platform admins are deliberately NOT included: a
-- company's private questions to its own assistant are not support material.
--
-- READ: mine, or shared with a company I belong to.
create policy "mineiq_threads_select" on public.mineiq_threads for select to authenticated
  using (public.owns_company(company_id) and (user_id = auth.uid() or shared_with_company));

-- WRITE: mine only, and the row must name me. `user_id = auth.uid()` in the
-- CHECK is what stops a caller inserting a thread under a colleague's name.
create policy "mineiq_threads_insert" on public.mineiq_threads for insert to authenticated
  with check (public.owns_company(company_id) and user_id = auth.uid());
create policy "mineiq_threads_update" on public.mineiq_threads for update to authenticated
  using (public.owns_company(company_id) and user_id = auth.uid())
  with check (public.owns_company(company_id) and user_id = auth.uid());
create policy "mineiq_threads_delete" on public.mineiq_threads for delete to authenticated
  using (public.owns_company(company_id) and user_id = auth.uid());

-- Messages inherit their thread's visibility rather than carrying their own
-- copy of the rule: one place to get it right, and a thread that stops being
-- shared takes its messages with it.
create policy "mineiq_messages_select" on public.mineiq_messages for select to authenticated
  using (exists (
    select 1 from public.mineiq_threads t
     where t.id = thread_id
       and public.owns_company(t.company_id)
       and (t.user_id = auth.uid() or t.shared_with_company)
  ));
create policy "mineiq_messages_insert" on public.mineiq_messages for insert to authenticated
  with check (exists (
    select 1 from public.mineiq_threads t
     where t.id = thread_id and t.user_id = auth.uid() and public.owns_company(t.company_id)
  ));
create policy "mineiq_messages_delete" on public.mineiq_messages for delete to authenticated
  using (exists (
    select 1 from public.mineiq_threads t
     where t.id = thread_id and t.user_id = auth.uid() and public.owns_company(t.company_id)
  ));

-- Column-level grants, matching 0061a's posture: anon gets nothing at all, and
-- `authenticated` gets only what the policies above then filter.
revoke all on public.mineiq_threads  from anon;
revoke all on public.mineiq_messages from anon;
grant select, insert, update, delete on public.mineiq_threads  to authenticated;
grant select, insert, delete        on public.mineiq_messages to authenticated;

commit;

-- ============================================================================
-- ROLLBACK -- additive, so this restores the database exactly.
-- ============================================================================
-- begin;
-- drop table if exists public.mineiq_messages;
-- drop table if exists public.mineiq_threads;
-- commit;


-- ======== 0067_conference_mode_feature.sql ========
-- ============================================================================
-- 0067_conference_mode_feature.sql — NOT APPLIED. Prepared for review.
--
-- One row. Conference Mode has been sold and delivered, but it has never
-- existed in the entitlement catalogue, so there is no authoritative way to ask
-- "has this company bought it?" -- which is exactly the question the portal's
-- Conference tab now has to answer before it decides which of two experiences
-- to show. Until this is applied, every company resolves to "not purchased",
-- and the portal shows the sales experience to customers who are already
-- paying.
--
-- WHY A FEATURE AND NOT A PLAN
-- ----------------------------
-- 0005's plans (passport / passport_communications / passport_managed) are the
-- subscription ladder. Conference Mode is bought alongside one of them rather
-- than being a rung on it, so it is granted per company through
-- `company_features` -- the override path 0005 already built for exactly this.
-- No plan_features row: adding one would silently hand Conference Mode to every
-- company on that plan.
--
-- THE FOUR STATES THE PORTAL READS, all from rows that already exist:
--   active    company_features row, enabled = true   (my_features returns it)
--   inactive  company_features row, enabled = false  (expired, or switched off)
--   none      no row at all
--   requested NOT A DATABASE STATE. An inquiry goes to `demo_bookings` through
--             /api/conference-inquiry, which the company's own JWT cannot read
--             back -- it is a service-role sales table. The portal therefore
--             treats "requested" as a local hint for duplicate-press
--             prevention and says so, rather than inventing a status it cannot
--             verify. Making it real needs a company-readable request table.
--
-- Granting it stays an admin action through the existing provisioning path;
-- nothing in the portal writes to company_features.
-- ============================================================================

begin;

insert into public.features (id, label, description) values
  ('conference_mode', 'Conference Mode',
   'The full-screen iPad booth for trade shows, with a managed presentation and a QR code that sends visitors to the investor profile.')
on conflict (id) do update set label = excluded.label, description = excluded.description;

commit;

-- ============================================================================
-- ROLLBACK
-- Deleting the feature cascades to any company_features row referencing it
-- (0005 declares `on delete cascade`), which would revoke Conference Mode from
-- every company that has it. Disable the grant instead, per company:
--   update public.company_features set enabled = false
--    where feature_id = 'conference_mode' and company_id = '<uuid>';
-- ============================================================================
-- delete from public.features where id = 'conference_mode';


-- ======== 0068_site_contract.sql ========
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
