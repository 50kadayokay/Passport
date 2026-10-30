-- STAGING REPLAY part 3 of 5 — migrations 0028 to 0041
-- Run against the STAGING project only. Never production.
-- Stop at the first error and report it; do not skip ahead.


-- ==================== 0028_story_studio.sql ====================
-- ============================================================================
-- 0028_story_studio.sql — Story Studio foundation.
--
-- Story Studio turns ONE press release into a designed 6-slide carousel (PNG)
-- and a short vertical video (MP4). The pipeline is deliberately staged so each
-- step is inspectable and correctable by a human before the next one runs:
--
--   ingest → extract (structured mining facts) → verify (claim ↔ source)
--          → classify (release type) → direct (story beats) → design (JSON)
--          → render (PNG / MP4)
--
-- Everything the pipeline produces is stored as JSONB on ONE row (story_projects)
-- rather than shredded across tables. That is deliberate for V1: the document is
-- always read and written as a whole by the editor, versions stay trivially
-- diffable, and schema evolution is a code change rather than a migration.
--
-- Adds three tables and changes NO existing behaviour:
--   1. story_projects — the working document for one release.
--   2. story_renders  — export artifacts (PNG slides, MP4) pointing at Storage.
--   3. brand_kits     — per-company brand constraints the renderer obeys.
--
-- Depends on 0001 (is_admin, touch_updated_at), 0005/0006 (owns_company /
-- can_touch_company).
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.
-- ============================================================================

begin;

-- ============================================================
-- 1) STORY PROJECTS — one press release, end to end
-- ============================================================

create table if not exists public.story_projects (
  id           uuid primary key default gen_random_uuid(),
  -- Nullable on purpose: a release can be pasted in before anyone has decided
  -- which company row it belongs to. The ingest screen resolves it, and every
  -- downstream step (brand kit, export) requires it to be set.
  company_id   uuid references public.companies(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,

  title        text not null default '',
  status       text not null default 'ingested'
               check (status in ('ingested','extracting','extracted','verified',
                                 'directed','designed','rendered','failed')),

  -- SOURCE ------------------------------------------------------------------
  source_kind         text check (source_kind in ('paste','pdf','url')),
  source_url          text,
  source_filename     text,
  source_storage_path text,
  raw_text            text not null default '',   -- the exact text every claim is checked against
  content_hash        text,                       -- sha-256 of normalized raw_text (dedup)
  release_date        date,                       -- the release's OWN dateline date

  -- CLASSIFIER (stage 6) -----------------------------------------------------
  release_type            text check (release_type in ('drill_results','exploration_update',
                                                       'financing','resource_update','other')),
  release_type_confidence text check (release_type_confidence in ('high','medium','low')),

  -- PIPELINE PAYLOADS --------------------------------------------------------
  extraction      jsonb,   -- MiningExtraction: typed, source-anchored facts
  extraction_meta jsonb,   -- { provider, model, schemaVersion, warnings, usage, extractedAt }
  verification    jsonb,   -- VerificationReport: per-claim verdicts + reviewer decisions
  story           jsonb,   -- StoryPlan: the Story Director's ordered beats
  design          jsonb,   -- DesignDocument: resolved slides the renderer draws
  theme_id        text,    -- 'editorial' | 'dark-premium' | 'technical'

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_projects_company_idx on public.story_projects (company_id);
create index if not exists story_projects_author_idx  on public.story_projects (created_by);
create index if not exists story_projects_recent_idx  on public.story_projects (updated_at desc nulls last);

-- Dedup guard: the same release text can't be ingested twice for one company.
-- Partial so unassigned drafts and blank hashes never collide.
create unique index if not exists story_projects_dedup_idx
  on public.story_projects (company_id, content_hash)
  where company_id is not null and content_hash is not null and content_hash <> '';

-- ============================================================
-- 2) STORY RENDERS — export artifacts
-- ============================================================
-- Rows are records of an export, not the bytes: the file lives in Storage and
-- `storage_path` points at it. A failed render keeps its row so the UI can show
-- what went wrong instead of silently offering nothing.

create table if not exists public.story_renders (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.story_projects(id) on delete cascade,
  kind         text not null check (kind in ('png','png_zip','mp4')),
  slide_index  int,                    -- null for whole-deck (zip) and video renders
  storage_path text,
  width        int,
  height       int,
  bytes        int,
  status       text not null default 'pending' check (status in ('pending','ready','failed')),
  error        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists story_renders_project_idx on public.story_renders (project_id, created_at desc);

-- ============================================================
-- 3) BRAND KITS — the constraints the renderer obeys
-- ============================================================
-- One kit per company. The renderer reads it as RULES, not decoration: which two
-- colours it may use, which typeface pairing, where the logo is allowed to sit,
-- what disclaimer must appear. Restraint is enforced by the data.

create table if not exists public.brand_kits (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  name       text not null default '',

  palette    jsonb not null default '{}'::jsonb,  -- { ink, paper, accent, muted, ... }
  typography jsonb not null default '{}'::jsonb,  -- { display, text, mono, scale }
  assets     jsonb not null default '{}'::jsonb,  -- { logoLight, logoDark, wordmark, photos[], maps[] }
  rules      jsonb not null default '{}'::jsonb,  -- { logoPlacement, disclaimer, tickerLockup, ... }

  default_theme_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4) updated_at TRIGGERS
-- ============================================================

-- Reuses public.touch_updated_at(), created in 0001 and shared by companies,
-- investor, news and push tables. Deliberately NOT redefined here: a studio
-- migration must never be able to change behaviour for those tables.

drop trigger if exists story_projects_touch on public.story_projects;
create trigger story_projects_touch before update on public.story_projects
  for each row execute function public.touch_updated_at();

drop trigger if exists brand_kits_touch on public.brand_kits;
create trigger brand_kits_touch before update on public.brand_kits
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 5) RLS
-- ============================================================
-- A story project is reachable by a platform admin, by anyone who can touch the
-- company it belongs to, or — while it is still unassigned — by the person who
-- created it. Nothing here is ever public: a draft carousel must never leak
-- before the company publishes it.

alter table public.story_projects enable row level security;
alter table public.story_renders  enable row level security;
alter table public.brand_kits     enable row level security;

drop policy if exists story_projects_read  on public.story_projects;
drop policy if exists story_projects_write on public.story_projects;
drop policy if exists story_projects_edit  on public.story_projects;
drop policy if exists story_projects_del   on public.story_projects;

create policy story_projects_read on public.story_projects for select
  using (public.is_admin()
         or (company_id is not null and public.can_touch_company(company_id))
         or (company_id is null and created_by = auth.uid()));

create policy story_projects_write on public.story_projects for insert
  with check (created_by = auth.uid()
              and (company_id is null or public.can_touch_company(company_id)));

create policy story_projects_edit on public.story_projects for update
  using (public.is_admin()
         or (company_id is not null and public.can_touch_company(company_id))
         or (company_id is null and created_by = auth.uid()))
  with check (public.is_admin()
              or (company_id is not null and public.can_touch_company(company_id))
              or (company_id is null and created_by = auth.uid()));

create policy story_projects_del on public.story_projects for delete
  using (public.is_admin()
         or (company_id is not null and public.can_touch_company(company_id))
         or (company_id is null and created_by = auth.uid()));

-- Renders inherit their project's reachability.
drop policy if exists story_renders_read  on public.story_renders;
drop policy if exists story_renders_write on public.story_renders;
drop policy if exists story_renders_edit  on public.story_renders;
drop policy if exists story_renders_del   on public.story_renders;

create policy story_renders_read on public.story_renders for select
  using (exists (select 1 from public.story_projects p where p.id = project_id));

create policy story_renders_write on public.story_renders for insert
  with check (exists (select 1 from public.story_projects p where p.id = project_id));

create policy story_renders_edit on public.story_renders for update
  using (exists (select 1 from public.story_projects p where p.id = project_id))
  with check (exists (select 1 from public.story_projects p where p.id = project_id));

create policy story_renders_del on public.story_renders for delete
  using (exists (select 1 from public.story_projects p where p.id = project_id));

-- Brand kits follow company access exactly.
drop policy if exists brand_kits_read  on public.brand_kits;
drop policy if exists brand_kits_write on public.brand_kits;
drop policy if exists brand_kits_edit  on public.brand_kits;
drop policy if exists brand_kits_del   on public.brand_kits;

create policy brand_kits_read on public.brand_kits for select
  using (public.can_touch_company(company_id));

create policy brand_kits_write on public.brand_kits for insert
  with check (public.can_touch_company(company_id));

create policy brand_kits_edit on public.brand_kits for update
  using (public.can_touch_company(company_id))
  with check (public.can_touch_company(company_id));

create policy brand_kits_del on public.brand_kits for delete
  using (public.is_admin());

commit;

-- ==================== 0029_company_self_serve.sql ====================
-- 0029: Company self-serve foundation (Phase 1)
--
-- Turns the managed service into self-serve for FREE profiles. The heavy lifting is
-- already in place: companies.owner_id + owner/admin RLS (0001), and
-- admin_provision_company() to assign ownership+role+tier (0023). This migration adds
-- only the two missing pieces:
--
--   (1) company_claims — a signed-in company user asserts ownership of a listing. An
--       admin reviews and approves by calling admin_provision_company() (0023). RLS:
--       a user sees/creates only their OWN claims; admins see all.
--
--   (2) owner-guard trigger — RLS already lets an owner UPDATE their own company row,
--       but that is too broad: it would let them flip their own tier, rename their
--       slug, or move ownership. Postgres RLS can't restrict columns, so a BEFORE
--       UPDATE trigger blocks a non-admin from changing the money/identity/trust
--       fields (tier, status, slug, owner_id, primary_ticker, managed_by_admin), and
--       makes the protected demo companies admin-only. Service-role (backend pipeline,
--       backfills) and admins bypass. Owners keep full control of their profile CONTENT.

begin;

-- ============================ 1) company_claims ============================
create table if not exists public.company_claims (
  id            uuid primary key default gen_random_uuid(),
  company_slug  text not null,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_email text,                                    -- IR/company email to reach them
  evidence      text,                                    -- link / note supporting the claim
  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid
);
create index if not exists company_claims_user_idx   on public.company_claims (user_id);
create index if not exists company_claims_status_idx on public.company_claims (status);
create index if not exists company_claims_slug_idx   on public.company_claims (company_slug);
-- at most one OPEN claim per (user, company) — a resubmit after a decision is allowed
create unique index if not exists company_claims_open_uniq
  on public.company_claims (user_id, company_slug) where status = 'pending';

alter table public.company_claims enable row level security;

drop policy if exists company_claims_insert on public.company_claims;
create policy company_claims_insert on public.company_claims
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists company_claims_select on public.company_claims;
create policy company_claims_select on public.company_claims
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Admins review claims: read all + move status (approve/reject). A normal user has NO
-- update/delete path, so a claim can only be decided by an admin.
drop policy if exists company_claims_admin_all on public.company_claims;
create policy company_claims_admin_all on public.company_claims
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ========================= 2) owner-guard trigger =========================
create or replace function public.company_owner_guard()
returns trigger
language plpgsql
as $function$
begin
  -- Admins and the service role (backend pipeline, enrichment, backfills) bypass.
  if public.is_admin() or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  -- A non-admin owner edits CONTENT freely (RLS already restricts WHICH row they can
  -- touch to their own company), but never these money/identity/trust fields.
  if new.tier             is distinct from old.tier             then raise exception 'company_owner_guard: tier is admin-managed'; end if;
  if new.status           is distinct from old.status           then raise exception 'company_owner_guard: status is admin-managed'; end if;
  if new.slug             is distinct from old.slug             then raise exception 'company_owner_guard: slug is immutable'; end if;
  if new.owner_id         is distinct from old.owner_id         then raise exception 'company_owner_guard: owner_id is admin-managed'; end if;
  if new.primary_ticker   is distinct from old.primary_ticker   then raise exception 'company_owner_guard: ticker is admin-managed'; end if;
  if new.managed_by_admin is distinct from old.managed_by_admin then raise exception 'company_owner_guard: managed flag is admin-managed'; end if;
  return new;
end
$function$;

drop trigger if exists trg_company_owner_guard on public.companies;
create trigger trg_company_owner_guard
  before update on public.companies
  for each row execute function public.company_owner_guard();

commit;

-- ==================== 0030_selfserve_fixes.sql ====================
-- 0030: Self-serve provisioning fixes (found by the end-to-end dry-run)
--
-- Two gaps surfaced when a fresh company was walked through the real customer path
-- (provision → own → edit → publish):
--
--   BUG 1  The owner-guard trigger from 0029 was never actually installed on the live
--          DB (only the company_claims half took). A role='company' owner could flip
--          their own tier/status/slug — i.e. grant themselves paid features for free.
--          Re-install the guard function + trigger (idempotent).
--
--   BUG 2  admin_provision_company() set owner_id/role/tier but never created a
--          company_subscriptions row. Publishing is gated by my_features(), which reads
--          the SUBSCRIPTION (plan → plan_features), NOT companies.tier. So every newly
--          provisioned/claimed company was entitlement-less and could not publish a
--          press release OR media until a subscription was hand-inserted. Fix: the
--          provision RPC now also upserts a subscription, mapping the legacy tier to a
--          plan. Free companies still get the base 'passport' plan, which includes
--          passport_profile — so they CAN post to the MineEx feed (press releases +
--          media); paid plans add the external channels (LinkedIn/X/newsletter/push).
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

begin;

-- ============================ BUG 1: owner-guard =============================
create or replace function public.company_owner_guard()
returns trigger
language plpgsql
as $function$
begin
  if public.is_admin() or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if new.tier             is distinct from old.tier             then raise exception 'company_owner_guard: tier is admin-managed'; end if;
  if new.status           is distinct from old.status           then raise exception 'company_owner_guard: status is admin-managed'; end if;
  if new.slug             is distinct from old.slug             then raise exception 'company_owner_guard: slug is immutable'; end if;
  if new.owner_id         is distinct from old.owner_id         then raise exception 'company_owner_guard: owner_id is admin-managed'; end if;
  if new.primary_ticker   is distinct from old.primary_ticker   then raise exception 'company_owner_guard: ticker is admin-managed'; end if;
  if new.managed_by_admin is distinct from old.managed_by_admin then raise exception 'company_owner_guard: managed flag is admin-managed'; end if;
  return new;
end
$function$;

drop trigger if exists trg_company_owner_guard on public.companies;
create trigger trg_company_owner_guard
  before update on public.companies
  for each row execute function public.company_owner_guard();

-- ===================== BUG 2: provision creates a plan =======================
-- Legacy display tier → real entitlement plan.
create or replace function public.plan_for_tier(p_tier text)
returns text language sql immutable as $function$
  select case p_tier
    when 'free'  then 'passport'
    when 'basic' then 'passport_communications'
    when 'pro'   then 'passport_managed'
    else 'passport'
  end;
$function$;

create or replace function public.admin_provision_company(
  p_user uuid, p_company uuid, p_tier text, p_managed boolean default true
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_tier not in ('free','basic','pro') then
    raise exception 'invalid tier: %', p_tier;
  end if;
  update public.profiles set role = 'company' where id = p_user;
  update public.companies
     set owner_id = p_user, tier = p_tier, managed_by_admin = p_managed
   where id = p_company;
  -- Entitlement: a company can't publish without an active subscription. Upsert one
  -- for the tier's plan so ownership and the ability to publish arrive together.
  insert into public.company_subscriptions (company_id, plan_id, status)
  values (p_company, public.plan_for_tier(p_tier), 'active')
  on conflict (company_id) do update
     set plan_id = excluded.plan_id, status = 'active', updated_at = now();
end
$function$;

revoke all on function public.admin_provision_company(uuid,uuid,text,boolean) from public, anon;
grant execute on function public.admin_provision_company(uuid,uuid,text,boolean) to authenticated;

-- Backfill: any already-provisioned owner without a subscription gets one now, so
-- existing self-serve companies aren't stuck unable to publish.
insert into public.company_subscriptions (company_id, plan_id, status)
select c.id, public.plan_for_tier(c.tier), 'active'
  from public.companies c
 where c.owner_id is not null
   and not exists (select 1 from public.company_subscriptions s where s.company_id = c.id)
on conflict (company_id) do nothing;

commit;

-- ==================== 0031_invite_provisioning.sql ====================
-- 0031: Make accepting a company invitation ACTUALLY provision a working portal.
--
-- The gap: accept_company_invitation() (0007) only inserted a company_memberships row. But:
--   • Editing the profile needs companies.owner_id = auth.uid() (companies UPDATE RLS, 0001).
--   • Publishing (and even passing the portal entitlement gate) needs a company_subscriptions
--     row — my_features() resolves features from the subscription's plan.
-- So an invited company landed on the "locked" screen and could neither edit nor publish.
--
-- This mirrors the fix already made for admin_provision_company in 0030: on accept, hand off
-- ownership (owner_id + role='company') and create an active subscription for the company's
-- tier (plan_for_tier from 0030). Owner_id is only set when currently NULL, so a handoff never
-- yanks an existing owner.
--
-- The owner-guard (0029/0030) blocks non-admins from changing owner_id, and this function runs
-- as the invited (non-admin) user, so we add a session-local bypass flag that ONLY these
-- SECURITY DEFINER provisioning functions set. Run in Supabase → SQL Editor. Idempotent.

begin;

-- 1) Owner-guard: also bypass when a provisioning function sets app.provisioning='on' (session-
--    local, so it never leaks to a normal client UPDATE).
create or replace function public.company_owner_guard()
returns trigger
language plpgsql
as $function$
begin
  if public.is_admin()
     or coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('app.provisioning', true), '') = 'on' then
    return new;
  end if;
  if new.tier             is distinct from old.tier             then raise exception 'company_owner_guard: tier is admin-managed'; end if;
  if new.status           is distinct from old.status           then raise exception 'company_owner_guard: status is admin-managed'; end if;
  if new.slug             is distinct from old.slug             then raise exception 'company_owner_guard: slug is immutable'; end if;
  if new.owner_id         is distinct from old.owner_id         then raise exception 'company_owner_guard: owner_id is admin-managed'; end if;
  if new.primary_ticker   is distinct from old.primary_ticker   then raise exception 'company_owner_guard: ticker is admin-managed'; end if;
  if new.managed_by_admin is distinct from old.managed_by_admin then raise exception 'company_owner_guard: managed flag is admin-managed'; end if;
  return new;
end
$function$;

-- 2) accept_company_invitation: membership (as before) + full provisioning.
create or replace function public.accept_company_invitation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.company_invitations; v_email text;
begin
  select * into v from public.company_invitations where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if v.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'used'); end if;
  if v.expires_at is not null and v.expires_at < now() then
    update public.company_invitations set status = 'expired' where id = v.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  if v_email <> lower(v.email) then return jsonb_build_object('ok', false, 'error', 'email_mismatch'); end if;

  insert into public.company_memberships (company_id, user_id, role, status)
  values (v.company_id, auth.uid(), v.role, 'active')
  on conflict (company_id, user_id) do update set status = 'active', role = excluded.role;

  -- Hand off a WORKING portal: role, ownership (if unclaimed), and an active subscription.
  perform set_config('app.provisioning', 'on', true);   -- transaction-local guard bypass
  update public.profiles set role = 'company' where id = auth.uid() and role is distinct from 'admin';
  update public.companies set owner_id = coalesce(owner_id, auth.uid()) where id = v.company_id;
  insert into public.company_subscriptions (company_id, plan_id, status)
    select v.company_id, public.plan_for_tier(c.tier), 'active' from public.companies c where c.id = v.company_id
  on conflict (company_id) do update set status = 'active', plan_id = excluded.plan_id, updated_at = now();

  update public.company_invitations
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v.id;

  return jsonb_build_object('ok', true, 'company_id', v.company_id);
end $$;

commit;

-- ==================== 0032_tier_entitlements_align.sql ====================
-- 0032: Align plan entitlements with the Free / Basic / Pro tab ladder.
--
-- The tab gating limits BASIC companies to Overview + a press-release Timeline, and reserves
-- media / external channels / analytics for PRO. But plan_for_tier (0030) mapped basic →
-- 'passport_communications', which ALSO grants LinkedIn/X/newsletter/push + analytics — more
-- than a Basic company should get. This realigns publishing rights to match the ladder:
--
--   free  → passport           (base profile; app-feed presence)
--   basic → passport           (edit profile + publish press releases to the MineEx feed only)
--   pro   → passport_managed    (everything: external channels, push, analytics, website)
--
-- The 'passport_communications' plan is left intact (unused by the ladder now; available for a
-- future mid-tier). Existing basic subscriptions on the old plan are moved to 'passport'.
-- Run in Supabase → SQL Editor. Idempotent.

begin;

create or replace function public.plan_for_tier(p_tier text)
returns text language sql immutable as $function$
  select case p_tier
    when 'free'  then 'passport'
    when 'basic' then 'passport'
    when 'pro'   then 'passport_managed'
    else 'passport'
  end;
$function$;

-- Realign any already-provisioned Basic companies to the corrected plan.
update public.company_subscriptions s
   set plan_id = 'passport', updated_at = now()
  from public.companies c
 where c.id = s.company_id
   and c.tier = 'basic'
   and s.plan_id = 'passport_communications';

commit;

-- ==================== 0033_subscription_expiry.sql ====================
-- 0033: Access auto-locks when a subscription's paid-through date passes.
--
-- company_has_feature only checked status='active', with no time bound — so a manually-paid
-- company (e-transfer/wire) would keep access forever unless an admin remembered to flip the
-- status. This adds a paid-through check: an active subscription grants features only while
-- renews_at is null (no expiry set) OR in the future. When renews_at passes, entitlements go
-- dark automatically until an admin extends it (or Stripe's webhook pushes the next period).
--
-- Stripe subs are unaffected: their webhook keeps status/renews_at current, and a null
-- renews_at still means "no expiry" (safe default). Run in Supabase → SQL Editor. Idempotent.

begin;

create or replace function public.company_has_feature(cid uuid, fid text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select cf.enabled from public.company_features cf
      where cf.company_id = cid and cf.feature_id = fid),
    (select exists (
       select 1
         from public.company_subscriptions s
         join public.plan_features pf on pf.plan_id = s.plan_id
        where s.company_id = cid
          and s.status = 'active'
          and (s.renews_at is null or s.renews_at > now())
          and pf.feature_id = fid
     )),
    false
  );
$$;

commit;

-- ==================== 0034_admin_set_billing.sql ====================
-- 0034: admin_set_billing — the manual (e-transfer/wire/cash) billing control.
--
-- Lets an admin record a payment / change a company's plan without Stripe: sets the tier and
-- upserts company_subscriptions (plan from plan_for_tier, status, paid-through = renews_at,
-- note='manual'). Combined with 0033's expiry check, setting renews_at to +1 year on payment
-- means access auto-locks a year later unless the admin extends it again. Admin-only.
-- Run in Supabase → SQL Editor. Idempotent.

begin;

create or replace function public.admin_set_billing(
  p_company uuid,
  p_tier text default null,
  p_status text default 'active',
  p_renews_at timestamptz default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tier text; v_plan text;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select coalesce(p_tier, tier) into v_tier from public.companies where id = p_company;
  if v_tier is null then return jsonb_build_object('ok', false, 'error', 'company_not_found'); end if;
  v_plan := public.plan_for_tier(v_tier);

  -- Admins bypass the owner-guard, so the tier update is allowed.
  if p_tier is not null then update public.companies set tier = p_tier where id = p_company; end if;

  insert into public.company_subscriptions (company_id, plan_id, status, renews_at, note, updated_at)
  values (p_company, v_plan, coalesce(p_status, 'active'), p_renews_at, 'manual', now())
  on conflict (company_id) do update
    set plan_id = excluded.plan_id, status = excluded.status, renews_at = excluded.renews_at,
        note = 'manual', updated_at = now();

  return jsonb_build_object('ok', true, 'tier', v_tier, 'plan', v_plan,
                            'status', coalesce(p_status, 'active'), 'renews_at', p_renews_at);
end $$;

revoke all on function public.admin_set_billing(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.admin_set_billing(uuid, text, text, timestamptz) to authenticated;

commit;

-- ==================== 0035_company_agreements_golive.sql ====================
-- 0035_company_agreements_golive.sql — Phase 6B
--
-- Adds three things, all ADDITIVE (no existing table/column/policy is altered):
--   1. company_agreement_acceptances — a versioned record of who accepted the MineEx
--      company agreement, for which company, when. Gates onboarding Go-Live (not portal read).
--   2. RPCs: record_company_agreement / company_has_agreement / peek_company_invitation.
--   3. company_go_live — lets a company OWNER publish their own profile the first time,
--      gated server-side on: ownership + agreement accepted + active portal entitlement +
--      a minimally-complete profile. Reuses the exact owner-guard bypass 0031 established
--      (set_config('app.provisioning','on', true)) so the status flip is allowed for the
--      duration of this SECURITY DEFINER call only.
--
-- Backward compatibility: a grandfather backfill inserts an acceptance for every company that
-- already has an owner OR is already published, so no existing company is ever gated or forced
-- through onboarding. Run in Supabase → SQL Editor. Idempotent.

-- ---------------------------------------------------------------------------
-- 1) Acceptance table
-- ---------------------------------------------------------------------------
create table if not exists public.company_agreement_acceptances (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  user_id           uuid references auth.users(id) on delete set null,  -- signatory; null only for grandfather backfill rows
  agreement_version text not null,
  accepted_at       timestamptz not null default now(),
  ip                text,
  user_agent        text,
  unique (company_id, agreement_version)   -- one acceptance per company per version (idempotent)
);
create index if not exists agreement_acceptances_company_idx
  on public.company_agreement_acceptances (company_id);

alter table public.company_agreement_acceptances enable row level security;

-- Owners/members (and admins) may READ their company's acceptances. Writes go only through
-- the SECURITY DEFINER RPC below — never a direct client insert (mirrors the paywall pattern).
drop policy if exists "agreement_read" on public.company_agreement_acceptances;
create policy "agreement_read" on public.company_agreement_acceptances
  for select to authenticated
  using (public.can_touch_company(company_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- 2) Record acceptance (owner/member of the company; captures signatory + version + audit)
-- ---------------------------------------------------------------------------
create or replace function public.record_company_agreement(p_company_id uuid, p_version text)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare v_hdr json; v_at timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  -- Only someone who can touch this company (owner/active member) or an admin may sign.
  if not (public.can_touch_company(p_company_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(trim(p_version), '') = '' then return jsonb_build_object('ok', false, 'error', 'version_required'); end if;

  begin v_hdr := current_setting('request.headers', true)::json; exception when others then v_hdr := null; end;

  insert into public.company_agreement_acceptances (company_id, user_id, agreement_version, ip, user_agent)
  values (p_company_id, auth.uid(), p_version,
          coalesce(v_hdr ->> 'x-forwarded-for', ''),
          coalesce(v_hdr ->> 'user-agent', ''))
  on conflict (company_id, agreement_version) do update set agreement_version = excluded.agreement_version
  returning accepted_at into v_at;

  return jsonb_build_object('ok', true, 'accepted_at', v_at, 'version', p_version);
end;
$function$;

-- Has this company accepted the current agreement (or been grandfathered)? SECURITY DEFINER so
-- the gate resolves regardless of the caller's row-visibility. Grandfather rows (version
-- 'grandfathered%') satisfy the gate so pre-6B companies are never blocked.
create or replace function public.company_has_agreement(p_company_id uuid, p_version text)
returns boolean
language sql stable security definer set search_path = public
as $function$
  select exists (
    select 1 from public.company_agreement_acceptances a
    where a.company_id = p_company_id
      and (a.agreement_version = p_version or a.agreement_version like 'grandfathered%')
  );
$function$;

-- ---------------------------------------------------------------------------
-- 3) Read-only invitation peek — powers a branded invite landing without accepting.
--    Token-gated; returns only display fields (email is masked). No auth required.
-- ---------------------------------------------------------------------------
create or replace function public.peek_company_invitation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare v public.company_invitations; c public.companies;
begin
  select * into v from public.company_invitations where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if v.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'used'); end if;
  if v.expires_at is not null and v.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  select * into c from public.companies where id = v.company_id;
  -- The token is the bearer secret and the invited email is the recipient's own address, so
  -- returning it to the token holder is safe and lets the sign-in email be prefilled + locked.
  return jsonb_build_object(
    'ok', true,
    'company_name', coalesce(c.name, c.slug),
    'company_slug', c.slug,
    'logo', coalesce(c.profile -> 'pp' ->> 'LOGO', c.profile -> 'pp' ->> 'AVATAR', ''),
    'tier', coalesce(c.tier, 'free'),
    'email', v.email
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Owner self-serve Go-Live — the intentional first publication.
--    Gates (all server-enforced): caller owns/administers the company + agreement accepted +
--    active portal entitlement + a minimally-complete profile (a name). Only flips draft→published.
-- ---------------------------------------------------------------------------
create or replace function public.company_go_live(p_company_id uuid, p_version text)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare c public.companies;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  select * into c from public.companies where id = p_company_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if not (public.owns_company(p_company_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if c.status = 'published' then
    return jsonb_build_object('ok', true, 'status', 'published', 'already', true);  -- idempotent
  end if;
  if not public.company_has_agreement(p_company_id, p_version) then
    return jsonb_build_object('ok', false, 'error', 'agreement_required');
  end if;
  if not (public.is_admin() or public.company_has_feature(p_company_id, 'portal_access')) then
    return jsonb_build_object('ok', false, 'error', 'subscription_required');
  end if;
  -- Minimal quality gate: a public profile needs at least a company name.
  if coalesce(c.profile -> 'pp' -> 'COMPANY' ->> 'name', c.name, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'profile_incomplete');
  end if;

  perform set_config('app.provisioning', 'on', true);   -- transaction-local owner-guard bypass (see 0031)
  update public.companies set status = 'published' where id = p_company_id;

  return jsonb_build_object('ok', true, 'status', 'published');
end;
$function$;

grant execute on function public.record_company_agreement(uuid, text) to authenticated;
grant execute on function public.company_has_agreement(uuid, text)     to authenticated;
grant execute on function public.peek_company_invitation(text)         to anon, authenticated;
grant execute on function public.company_go_live(uuid, text)           to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Grandfather backfill — never gate an existing company. Any company that already has an
--    owner OR is already published is treated as having accepted, so onboarding/agreement/
--    go-live gates are transparent to them.
-- ---------------------------------------------------------------------------
insert into public.company_agreement_acceptances (company_id, user_id, agreement_version, accepted_at)
select c.id, c.owner_id, 'grandfathered-pre-6b', now()
from public.companies c
where (c.owner_id is not null or c.status = 'published')
on conflict (company_id, agreement_version) do nothing;

-- ==================== 0036_publish_timeline_phase1.sql ====================
-- 0036_publish_timeline_phase1.sql
-- Publishing system — TIMELINE PHASE 1. Strictly additive; no behaviour changes.
--
-- WHY
-- ---
-- A press release has TWO different dates and the schema only had one:
--
--   published_at = when the company ORIGINALLY issued the release
--   created_at   = when the record entered MineEx
--
-- A release dated 2025-03-04 uploaded in September 2026 belongs in 2025 / Q1 /
-- March 4 on the investor timeline. Today `publish_publication` hardcodes
-- `published_at = now()`, so it would appear as September 2026 news.
--
-- This migration adds the columns and gives the publish RPC an explicit date.
-- It changes nothing on its own: every existing caller omits the new argument
-- and keeps the old now() behaviour exactly.
--
-- NOT in this migration (deliberately): no backfill, no reads changed, no
-- profile.timeline touched. Those are Phases 2 and 3 and are gated on review.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

begin;

-- ============================================================
-- 1) updates — the publication record
-- ============================================================

-- The ORIGINAL publication date, as a DATE and deliberately not a timestamptz.
--
-- A press release is dated "March 4, 2025" — a calendar date, not an instant. Two
-- reasons this matters:
--
--   1. extract(year from timestamptz) is STABLE, not IMMUTABLE, because the answer
--      depends on the session TimeZone. Postgres rejects it in a generated column
--      (42P17: generation expression is not immutable).
--   2. Forcing it with AT TIME ZONE 'UTC' would compile, but would mis-file real
--      releases: a Vancouver company issuing at 18:00 PST on Dec 31 is 07:00 UTC
--      on Jan 1, and would land in the wrong YEAR and QUARTER.
--
-- A date has no zone, so the year and quarter are exactly the ones on the release.
-- posts.published_at stays timestamptz for feed ordering; the publish API converts.
alter table public.updates add column if not exists published_on date;

-- Where the release came from, when the source document or its metadata says so.
alter table public.updates add column if not exists source_url text;

-- Explicit human approval. The CEO is the final approver; record who and when.
alter table public.updates add column if not exists approved_by uuid references auth.users(id);
alter table public.updates add column if not exists approved_at timestamptz;

-- Year and quarter are DERIVED, never hand-entered — a stored value would be a
-- second source of truth that could disagree with published_on. Generated
-- columns make that impossible, and extract() on a date IS immutable. Null
-- published_on → null year/quarter, which is what we want for the 28 legacy
-- entries with unusable dates: not placeable, and never to be guessed.
alter table public.updates
  add column if not exists published_year int
  generated always as (extract(year from published_on)::int) stored;

alter table public.updates
  add column if not exists published_quarter int
  generated always as (extract(quarter from published_on)::int) stored;

-- Chronological reads per company.
create index if not exists updates_published_idx
  on public.updates (company_id, published_on desc nulls last);

-- Provenance lookup for the Phase 2 backfill and the Phase 3 union read. The
-- backfill stamps meta.origin / meta.source_key; Phase 3 suppresses a legacy
-- timeline entry ONLY when it finds the post generated from that exact entry.
-- No fuzzy title matching is involved anywhere in that decision.
create index if not exists updates_origin_idx
  on public.updates ((meta->>'origin'), (meta->>'source_key'));

-- ============================================================
-- 2) publish_publication — accept the original release date
-- ============================================================
--
-- The 2-argument version is DROPPED rather than left alongside a 3-argument
-- one: PostgREST resolves RPCs by argument name, and a 2-arg call that could
-- match either signature is an ambiguous-function error. Dropping and
-- recreating with a defaulted third argument keeps every existing 2-arg caller
-- working unchanged (api/publish.js passes p_publication_id + p_actor).
--
-- Security semantics are IDENTICAL to 0008: same actor_can_publish() gate, same
-- allowed status transitions, same publish_seq, same idempotency key. The only
-- change is which timestamp is written.

drop function if exists public.publish_publication(uuid, uuid);

create or replace function public.publish_publication(
  p_publication_id uuid,
  p_actor          uuid,
  p_published_at   timestamptz default null   -- null → now(), i.e. today's behaviour
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.publications; v_seq integer; v_key text; v_event_id uuid; v_at timestamptz;
begin
  select * into v from public.publications where id = p_publication_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.actor_can_publish(v.company_id, p_actor) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v.status = 'published' then return jsonb_build_object('ok', true, 'already', true, 'publication_id', v.id, 'published_at', v.published_at); end if;
  if v.status not in ('draft', 'review', 'approved') then return jsonb_build_object('ok', false, 'error', 'invalid_transition', 'status', v.status); end if;

  -- The caller may supply the original release date. Omitted → now(), unchanged.
  v_at := coalesce(p_published_at, now());

  v_seq := coalesce(v.publish_seq, 0) + 1;
  update public.publications
     set status = 'published', published_at = v_at, publish_seq = v_seq, error = null
   where id = v.id;

  v_key := 'publish:' || v.id::text || ':' || v_seq::text;
  insert into public.events (event_type, event_version, publication_id, company_id, actor_user_id, payload, idempotency_key)
  values ('PUBLICATION_PUBLISHED', 1, v.id, v.company_id, p_actor,
          jsonb_build_object('publication_id', v.id, 'company_id', v.company_id, 'publish_seq', v_seq), v_key)
  on conflict (idempotency_key) do nothing returning id into v_event_id;

  return jsonb_build_object('ok', true, 'publication_id', v.id, 'published_at', v_at,
                            'event_id', v_event_id, 'idempotency_key', v_key);
end $$;

commit;

-- ============================================================
-- VERIFY (read-only — run after applying)
-- ============================================================
-- New columns present, all null, nothing rewritten:
--   select count(*) total,
--          count(published_on) with_published_on,
--          count(published_year) with_year
--     from public.updates;
--
-- Exactly one publish_publication, taking three arguments:
--   select proname, pg_get_function_identity_arguments(oid)
--     from pg_proc where proname = 'publish_publication';
--
-- Existing posts untouched:
--   select count(*) from public.posts;

-- ==================== 0037_storage_docs_authorization.sql ====================
-- 0037_storage_docs_authorization.sql
-- SECURITY CORRECTION — private company documents.
--
-- THE PROBLEM
-- -----------
-- 0002 granted every authenticated user SELECT on all three buckets:
--
--   create policy "pp_auth_read" on storage.objects for select to authenticated
--     using (bucket_id in ('company-media','company-logos','company-docs'));
--
-- No company predicate. Any signed-in user — including any investor — could read
-- any object in `company-docs` for any company, given the path. That bucket holds
-- 327 recorded documents: technical reports, financials, MD&A, financing papers.
-- Unpredictable UUID paths are obscurity, not authorization.
--
-- THE GOVERNING PRINCIPLE
-- -----------------------
--   COMPANY OWNS THE RESOURCE.  USER PERFORMS THE ACTION.
--
-- Read access derives from:
--   storage object → documents record → company_id → can_touch_company()
--
-- Uploader identity is NOT an authorization mechanism anywhere below. "Uploaded
-- this once" must never imply "may read this forever", and a user who leaves a
-- company must lose access to its documents immediately.
--
-- WHY BOTH OLD SELECT POLICIES ARE DROPPED
-- ----------------------------------------
-- Permissive RLS policies OR together. Adding a narrow policy while leaving
-- pp_auth_read in place would leave the broad path completely intact. The old
-- SELECT policies are REPLACED, never supplemented.
--
-- WHY WRITE POLICIES ARE SPLIT PER BUCKET
-- ---------------------------------------
-- The two public buckets are written as `<uid>/<file>` by uploadToBucket() — one
-- folder segment, and it is a USER id. company-docs is written as a company path.
-- A single "folder is the company" rule would therefore break every logo and
-- media upload, so the buckets get separate write rules and the public ones keep
-- their existing uid behaviour byte-for-byte.
--
-- EFFECT ON ORPHANS
-- -----------------
-- 74 objects (125.5 MB) have no documents row — files left behind because
-- deleteDocument() removed the row and not the object. They become unreadable
-- except to the service role. Intended: they are abandoned, and nothing
-- references them. They are NOT deleted here.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

begin;

-- ============================================================
-- 0) helpers
-- ============================================================

-- Cast that yields null instead of raising. A policy that throws is a broken
-- query, not a denied one, so every cast of untrusted path text goes through this.
create or replace function public.safe_uuid(t text)
returns uuid language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

-- The company that owns a company-docs object, read from its path.
--
--   new     <company_id>/<uuid>.ext              folders = {company_id}
--   legacy  <uid>/<company_id>/<ts>-<name>.ext   folders = {uid, company_id}
--
-- In BOTH conventions the company is the LAST folder segment, so one expression
-- covers old and new objects and no existing file has to be moved.
-- Returns null for anything unparseable; can_touch_company(null) is false.
create or replace function public.docs_path_company(objname text)
returns uuid language sql stable as $$
  select public.safe_uuid(
    (storage.foldername(objname))[array_length(storage.foldername(objname), 1)]
  );
$$;

-- The SELECT policy joins documents on storage_path for every object read.
create index if not exists documents_storage_path_idx
  on public.documents (storage_path);

-- ============================================================
-- 1) remove the broad reads and the all-bucket write rules
-- ============================================================
drop policy if exists "pp_public_read" on storage.objects;
drop policy if exists "pp_auth_read"   on storage.objects;
drop policy if exists "pp_upload_own"  on storage.objects;
drop policy if exists "pp_update_own"  on storage.objects;
drop policy if exists "pp_delete_own"  on storage.objects;

-- ============================================================
-- 2) public buckets — behaviour unchanged
-- ============================================================
-- The investor app renders logos and media directly; they stay world-readable.
create policy "media_public_read" on storage.objects for select
  to anon, authenticated
  using (bucket_id in ('company-media', 'company-logos'));

-- Writes stay exactly as they were: your own uid folder.
create policy "media_write_own" on storage.objects for insert
  to authenticated
  with check (bucket_id in ('company-media', 'company-logos')
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "media_update_own" on storage.objects for update
  to authenticated
  using (bucket_id in ('company-media', 'company-logos')
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "media_delete_own" on storage.objects for delete
  to authenticated
  using (bucket_id in ('company-media', 'company-logos')
         and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 3) company-docs — private, company-derived
-- ============================================================

-- READ: through the document record only. No path shortcut, no uploader clause.
create policy "docs_company_read" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'company-docs'
    and exists (
      select 1
        from public.documents d
       where d.storage_path = 'company-docs/' || storage.objects.name
         and public.can_touch_company(d.company_id)   -- owner or admin, evaluated NOW
    )
  );

-- WRITE: into a company you are authorized for. Deliberately NOT the documents
-- join — the row does not exist yet when the bytes are uploaded, and making the
-- write depend on it would force either a permanent uploader exception or a
-- fragile two-phase insert. The path carries the company, so authorization is
-- still "company owns the resource", never "who uploaded it".
create policy "docs_company_insert" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-docs'
              and public.can_touch_company(public.docs_path_company(name)));

create policy "docs_company_update" on storage.objects for update
  to authenticated
  using (bucket_id = 'company-docs'
         and public.can_touch_company(public.docs_path_company(name)));

-- DELETE is path-derived on purpose. deleteDocument() removes the row FIRST (so a
-- failure can only orphan a file, never leave a live row pointing at a missing
-- one), which means the documents row is already gone when the object delete
-- runs. It also fixes a real gap: under the old uid rule a company owner could
-- not delete a document an admin had uploaded on their behalf.
create policy "docs_company_delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'company-docs'
         and public.can_touch_company(public.docs_path_company(name)));

commit;

-- ============================================================
-- VERIFY (read-only — run after applying)
-- ============================================================
-- Expect exactly these 8, and NO pp_* rows:
--   select policyname, roles, cmd from pg_policies
--    where schemaname='storage' and tablename='objects' order by policyname;
--   -- docs_company_delete, docs_company_insert, docs_company_read,
--   -- docs_company_update, media_delete_own, media_public_read,
--   -- media_update_own, media_write_own
--
-- Path helper handles both conventions (expect the same company uuid twice):
--   select public.docs_path_company('11111111-1111-1111-1111-111111111111/a.pdf'),
--          public.docs_path_company('99999999-9999-9999-9999-999999999999/11111111-1111-1111-1111-111111111111/b.pdf'),
--          public.docs_path_company('not-a-uuid/x.pdf');   -- expect null
--
-- Index present:
--   select indexname from pg_indexes
--    where tablename='documents' and indexname='documents_storage_path_idx';

-- ==================== 0038_media_assets.sql ====================
-- 0038_media_assets.sql
-- MEDIA FOUNDATION — canonical company media assets + per-publication selection.
--
-- THE MODEL
-- ---------
--   documents ──► extraction ──► media_assets ──► publication_media ──► publications
--                                (canonical,        (selection,          (already
--                                 reusable,          not ownership)       per-destination)
--                                 PRIVATE)
--
-- media_assets is the company's reusable asset record. publication_media says
-- whether a given publication USES it — nothing more. Because `publications` is
-- already one row per destination, the same asset can be included for MineEx and
-- LinkedIn and excluded for X with no duplication of the underlying file.
--
-- PRIVACY IS THE DEFAULT AND IT IS ENFORCED IN STORAGE, NOT JUST LABELLED
-- ----------------------------------------------------------------------
-- Extracting an image from an unpublished release must not make it public. The
-- canonical bytes live in a NEW PRIVATE bucket (`company-media-private`), never
-- in the public `company-media`. `visibility` is a record of state; the storage
-- policy below is what actually enforces it.
--
-- AUTHORIZATION follows 0037 exactly:
--   COMPANY OWNS THE RESOURCE.  USER PERFORMS THE ACTION.
--   read  → asset row → company_id → can_touch_company()
--   write → company id in the path
-- Uploader identity is not an authorization mechanism anywhere.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

begin;

-- ============================================================
-- 1) media_assets — the canonical, reusable, PRIVATE asset
-- ============================================================
create table if not exists public.media_assets (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,

  -- Provenance. Both nullable: an asset can be extracted from a document, or
  -- uploaded directly by the company later with no source document at all.
  source_document_id uuid references public.documents(id) on delete set null,
  source_update_id   uuid references public.updates(id)   on delete set null,
  extracted_at       timestamptz,          -- null → not extracted, uploaded directly

  -- What the source called it. Never overwritten, so the trail back to the
  -- original release stays intact even after the company edits a caption.
  original_filename text,
  original_caption  text,

  -- The bytes.
  mime_type    text,
  width        int,
  height       int,
  bytes        bigint,
  sha256       text,
  storage_path text,                       -- 'company-media-private/<company_id>/<uuid>.ext'

  -- Lifecycle. 'private' is the only state extraction may produce.
  visibility text not null default 'private'
    check (visibility in ('private', 'published')),

  -- Set only when a publication is approved and a public representation is made.
  -- The private canonical asset is NEVER mutated into a public one — this is an
  -- additional pointer, not a replacement.
  public_storage_path text,
  published_at        timestamptz,

  -- Room for dimensions-in-progress, EXIF, extractor notes, etc.
  meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- DEDUPLICATION. Identical BYTES for the same company are one asset — not one
-- per release that happened to embed the same figure. sha256 is exact, so this
-- merges only genuinely identical files; nothing is ever merged on filename,
-- caption or dimensions. Partial so rows without a hash yet are unconstrained.
create unique index if not exists media_assets_company_sha_idx
  on public.media_assets (company_id, sha256)
  where sha256 is not null;

create index if not exists media_assets_company_idx   on public.media_assets (company_id, created_at desc);
create index if not exists media_assets_doc_idx       on public.media_assets (source_document_id);
create index if not exists media_assets_update_idx    on public.media_assets (source_update_id);
create index if not exists media_assets_path_idx      on public.media_assets (storage_path);

-- ============================================================
-- 2) publication_media — SELECTION, not ownership
-- ============================================================
create table if not exists public.publication_media (
  publication_id  uuid not null references public.publications(id) on delete cascade,
  media_asset_id  uuid not null references public.media_assets(id) on delete cascade,

  -- The CEO's choice for THIS destination. Default false: extracting an image
  -- never implies publishing it.
  included   boolean not null default false,
  sort_order int     not null default 0,

  -- Per-destination caption. Null → fall back to the asset's original_caption.
  -- Stored here, never written back onto the asset.
  caption_override text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (publication_id, media_asset_id)
);

create index if not exists publication_media_asset_idx on public.publication_media (media_asset_id);
create index if not exists publication_media_pick_idx  on public.publication_media (publication_id, included, sort_order);

-- ============================================================
-- 3) RLS — same shape as the other comms tables (0005)
-- ============================================================
alter table public.media_assets      enable row level security;
alter table public.publication_media enable row level security;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='media_assets'
  loop execute format('drop policy %I on public.media_assets', p.policyname); end loop;
  for p in select policyname from pg_policies where schemaname='public' and tablename='publication_media'
  loop execute format('drop policy %I on public.publication_media', p.policyname); end loop;
end $$;

create policy "owner_all" on public.media_assets for all to authenticated
  using (public.can_touch_company(company_id))
  with check (public.can_touch_company(company_id));

-- publication_media has no company_id of its own — gate it through its publication.
create policy "owner_all" on public.publication_media for all to authenticated
  using (exists (select 1 from public.publications p
                  where p.id = publication_id and public.can_touch_company(p.company_id)))
  with check (exists (select 1 from public.publications p
                  where p.id = publication_id and public.can_touch_company(p.company_id)));

-- ============================================================
-- 4) private bucket + storage policies
-- ============================================================
insert into storage.buckets (id, name, public)
values ('company-media-private', 'company-media-private', false)
on conflict (id) do nothing;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects'
           and policyname in ('privmedia_company_read','privmedia_company_insert',
                              'privmedia_company_update','privmedia_company_delete')
  loop execute format('drop policy %I on storage.objects', p.policyname); end loop;
end $$;

-- READ: through the asset record → company → current authorization. Same chain
-- as company-docs in 0037. No path shortcut, no uploader clause.
create policy "privmedia_company_read" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'company-media-private'
    and exists (
      select 1 from public.media_assets m
       where m.storage_path = 'company-media-private/' || storage.objects.name
         and public.can_touch_company(m.company_id)
    )
  );

-- WRITE: company id from the path — the asset row does not exist yet when the
-- bytes land. docs_path_company() (0037) reads the last folder segment, which is
-- the company id for these company-oriented paths.
create policy "privmedia_company_insert" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-media-private'
              and public.can_touch_company(public.docs_path_company(name)));

create policy "privmedia_company_update" on storage.objects for update
  to authenticated
  using (bucket_id = 'company-media-private'
         and public.can_touch_company(public.docs_path_company(name)));

-- Path-derived like 0037's delete: the row is removed before the object, and an
-- authorized company user must be able to delete an asset an admin extracted.
create policy "privmedia_company_delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'company-media-private'
         and public.can_touch_company(public.docs_path_company(name)));

commit;

-- ============================================================
-- VERIFY (read-only — run after applying)
-- ============================================================
--   select count(*) from public.media_assets;       -- 0
--   select count(*) from public.publication_media;  -- 0
--
--   select id, public from storage.buckets where id = 'company-media-private';
--   -- expect public = false
--
--   select policyname, cmd from pg_policies
--    where schemaname='storage' and tablename='objects' and policyname like 'privmedia%';
--   -- expect 4 rows
--
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename in ('media_assets','publication_media');
--   -- expect owner_all on each

-- ==================== 0039_media_asset_sources.sql ====================
-- 0039_media_asset_sources.sql
-- MULTI-SOURCE PROVENANCE — where MineEx has encountered an asset.
--
-- THREE DISTINCT CONCEPTS
-- -----------------------
--   media_assets         WHAT the asset is        (canonical file: sha, mime, dims)
--   media_asset_sources  WHERE we ENCOUNTERED it  (observation — not approval)
--   publication_media    WHERE it is USED         (a deliberate company choice)
--
-- Deduplicate the ASSET; never deduplicate away its HISTORY. Identical bytes in
-- releases A, B and C are ONE media_asset and THREE source rows. Reusing the
-- asset must never overwrite or discard A's provenance.
--
-- Observing an asset in a document is NOT approval to reuse it. Nothing here
-- implies publication; that lives solely in publication_media.
--
-- OCCURRENCE vs CANONICAL
-- -----------------------
-- original_filename and original_caption are properties of an OCCURRENCE, not of
-- the file: the same logo can be "logo.png" in one release and "header-2.png"
-- with a different caption in the next. Pretending there is one universally
-- correct value would make the column a lie, so they move to the source rows.
-- media_assets is empty, so this is a clean correction, not a data migration.
--
-- CROSS-COMPANY SAFETY IS STRUCTURAL
-- ----------------------------------
-- Company A's asset must never link to Company B's document. Enforced by
-- COMPOSITE foreign keys carrying a redundant company_id, so the database itself
-- rejects the association — not application code, and not only RLS. Because the
-- FKs are MATCH SIMPLE, a null document/update simply skips its constraint,
-- which is what we want for an asset uploaded with no source.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

begin;

-- ============================================================
-- 1) targets for the composite foreign keys
-- ============================================================
-- (id) is already unique on each of these; (id, company_id) is therefore
-- trivially unique too. These exist only so a composite FK can reference them.
create unique index if not exists media_assets_id_company_key on public.media_assets (id, company_id);
create unique index if not exists documents_id_company_key    on public.documents    (id, company_id);
create unique index if not exists updates_id_company_key      on public.updates      (id, company_id);

-- ============================================================
-- 2) occurrence fields leave the canonical asset
-- ============================================================
-- Safe: media_assets has zero rows (verified before applying).
alter table public.media_assets drop column if exists original_filename;
alter table public.media_assets drop column if exists original_caption;

-- ============================================================
-- 3) media_asset_sources
-- ============================================================
create table if not exists public.media_asset_sources (
  id uuid primary key default gen_random_uuid(),

  -- Denormalised ON PURPOSE: it is the pivot every composite FK below shares,
  -- which is what makes a cross-company association structurally impossible.
  company_id uuid not null references public.companies(id) on delete cascade,

  media_asset_id uuid not null,

  -- Where we saw it. Both nullable — an asset can come from a document, from an
  -- update, or be uploaded directly with no source at all.
  source_document_id uuid,
  source_update_id   uuid,

  -- OCCURRENCE properties: what THIS release called it.
  original_filename text,
  original_caption  text,

  -- Extraction detail specific to this sighting (page number, position, extractor
  -- version, confidence). Keeps per-sighting facts out of the canonical row.
  extraction_meta jsonb not null default '{}'::jsonb,

  seen_at    timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- The asset must belong to the SAME company as this source row.
  constraint media_asset_sources_asset_fk
    foreign key (media_asset_id, company_id)
    references public.media_assets (id, company_id) on delete cascade,

  -- ...and so must the document it was seen in.
  constraint media_asset_sources_document_fk
    foreign key (source_document_id, company_id)
    references public.documents (id, company_id) on delete set null,

  -- ...and the update.
  constraint media_asset_sources_update_fk
    foreign key (source_update_id, company_id)
    references public.updates (id, company_id) on delete set null
);

-- DETERMINISTIC duplicate handling: one row per (asset, document) and one per
-- (asset, update). Re-running extraction over the same document updates the
-- existing sighting instead of stacking near-identical rows. Partial indexes
-- because a NULL source is not a duplicate of another NULL source.
create unique index if not exists media_asset_sources_doc_key
  on public.media_asset_sources (media_asset_id, source_document_id)
  where source_document_id is not null;

create unique index if not exists media_asset_sources_update_key
  on public.media_asset_sources (media_asset_id, source_update_id)
  where source_update_id is not null;

create index if not exists media_asset_sources_asset_idx   on public.media_asset_sources (media_asset_id, seen_at desc);
create index if not exists media_asset_sources_company_idx on public.media_asset_sources (company_id, seen_at desc);
create index if not exists media_asset_sources_doc_idx     on public.media_asset_sources (source_document_id);

-- ============================================================
-- 4) RLS
-- ============================================================
alter table public.media_asset_sources enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='media_asset_sources'
  loop execute format('drop policy %I on public.media_asset_sources', p.policyname); end loop;
end $$;

create policy "owner_all" on public.media_asset_sources for all to authenticated
  using (public.can_touch_company(company_id))
  with check (public.can_touch_company(company_id));

commit;

-- ============================================================
-- VERIFY (read-only — run after applying)
-- ============================================================
--   select count(*) from public.media_asset_sources;   -- 0
--
--   select column_name from information_schema.columns
--    where table_name='media_assets' and column_name in ('original_filename','original_caption');
--   -- expect 0 rows (they moved to the source)
--
--   select conname from pg_constraint
--    where conrelid = 'public.media_asset_sources'::regclass and contype = 'f';
--   -- expect the three composite FKs

-- ==================== 0040_storage_write_fix.sql ====================
-- 0040_storage_write_fix.sql
-- FIX: 0037 broke document uploads.
--
-- WHAT WENT WRONG
-- ---------------
-- 0037 correctly closed a real hole: pp_auth_read let ANY authenticated user read
-- ANY company's private documents. That fix is right and is NOT touched here.
--
-- But 0037 also replaced the WRITE policies, swapping "you may write into your own
-- uid folder" for "the company id in the path must pass can_touch_company()". Real
-- uploads then failed with:
--
--   403 Unauthorized — new row violates row-level security policy (AccessDenied)
--
-- even for a company OWNER who is also a platform ADMIN, with a path whose company
-- segment resolved correctly (verified: docs_path_company() returns the right uuid,
-- companies.owner_id matches the uploader, profiles.role = 'admin'). The write check
-- could not be satisfied from inside the storage RLS context.
--
-- WHY THE WRITE RULE GOES BACK
-- ----------------------------
-- Writes were never the vulnerability. Writing a file into your own folder leaks
-- nothing: the object is unreadable until a `documents` row points at it, and READ
-- authorization — the thing that actually mattered — still derives from
-- documents → company_id → can_touch_company(). Tightening the write path bought no
-- security and cost the feature.
--
-- So: INSERT and UPDATE go back to the uid-folder rule that every one of the 401
-- existing objects already satisfies. DELETE accepts EITHER rule, because a company
-- owner must be able to delete a document an admin uploaded on their behalf, and
-- deleteDocument() removes the `documents` row first (so a documents-join test would
-- have nothing left to match by the time the object delete runs).
--
-- Paths stay `<uid>/<company_id>/<file>`. The company id is still the LAST folder
-- segment, which is what docs_path_company() reads, so read authorization is
-- unchanged and no existing object has to move.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

begin;

-- 0037's company-path write rules, which are what broke uploads.
drop policy if exists "docs_company_insert" on storage.objects;
drop policy if exists "docs_company_update" on storage.objects;
drop policy if exists "docs_company_delete" on storage.objects;

-- The policies THIS file creates. Dropped first so the whole migration can be
-- re-run safely: without these, a second run fails with "policy already exists"
-- and the transaction rolls back, which makes "just run it again" unreliable
-- exactly when you are trying to confirm whether it ever applied.
drop policy if exists "docs_upload_own" on storage.objects;
drop policy if exists "docs_update_own" on storage.objects;
drop policy if exists "docs_delete_authorized" on storage.objects;
drop policy if exists "privmedia_write" on storage.objects;
drop policy if exists "privmedia_update" on storage.objects;

-- WRITE: your own folder. Identical to the pre-0037 rule that worked.
create policy "docs_upload_own" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-docs'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "docs_update_own" on storage.objects for update
  to authenticated
  using (bucket_id = 'company-docs'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- DELETE: your own folder OR any object belonging to a company you are authorized
-- for. The second arm is what lets an owner clean up admin-uploaded documents.
create policy "docs_delete_authorized" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'company-docs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_touch_company(public.docs_path_company(name))
    )
  );

-- The private media bucket has the same shape, so give it the same treatment
-- before it hits the identical wall. mediaAssets.js writes company-first paths,
-- so the uploader arm is added rather than swapped in.
drop policy if exists "privmedia_company_insert" on storage.objects;
drop policy if exists "privmedia_company_update" on storage.objects;

create policy "privmedia_write" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-media-private'
              and ((storage.foldername(name))[1] = auth.uid()::text
                   or public.can_touch_company(public.docs_path_company(name))));

create policy "privmedia_update" on storage.objects for update
  to authenticated
  using (bucket_id = 'company-media-private'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or public.can_touch_company(public.docs_path_company(name))));

commit;

-- ============================================================
-- UNCHANGED, AND STILL THE POINT OF 0037
-- ============================================================
-- docs_company_read      — company-docs readable only via documents → company
-- privmedia_company_read — private media readable only via media_assets → company
-- media_public_read      — company-media / company-logos stay public
--
-- VERIFY:
--   select policyname, cmd from pg_policies
--    where schemaname='storage' and tablename='objects' order by cmd, policyname;
--   -- INSERT: docs_upload_own, media_write_own, privmedia_write
--   -- UPDATE: docs_update_own, media_update_own, privmedia_update
--   -- DELETE: docs_delete_authorized, media_delete_own, privmedia_company_delete
--   -- SELECT: docs_company_read, media_public_read, privmedia_company_read

-- ==================== 0041_outbox_claim_lease.sql ====================
-- ============================================================================
-- 0041_outbox_claim_lease.sql — atomic claim/lease + retry lifecycle for
-- public.notification_outbox.
--
-- PROBLEM (W1-W4, found during the Android port)
--   The sender did:  SELECT ... WHERE status='pending'  →  send  →  PATCH result
--   Two overlapping invocations (the hourly cron plus a manual or retried call)
--   both SELECT the same pending rows and both deliver them. The unique key
--   (news_item_id,user_id,token) makes ENQUEUE idempotent; nothing made DELIVERY
--   idempotent. Additionally `attempts` was written as the literal 1, a row
--   marked 'failed' was never retried, and a worker dying mid-batch left rows
--   stuck forever.
--
-- SOLUTION
--   A SECURITY DEFINER function that claims rows with
--       SELECT ... FOR UPDATE SKIP LOCKED
--   and flips them to 'sending' with a lease, inside ONE transaction.
--
-- WHY THIS CANNOT DOUBLE-CLAIM
--   * FOR UPDATE takes a row-level write lock on each selected row and holds it
--     until the function's transaction commits.
--   * SKIP LOCKED makes a CONCURRENT claim skip those rows outright — it does
--     not block and it does not return them. So two workers can never receive
--     the same row from the SELECT.
--   * The UPDATE to status='sending' is in that same transaction, so by the time
--     the lock is released the row is no longer 'pending' and no longer matches
--     the claim predicate.
--   There is no window between "selected" and "marked", which is exactly the gap
--   the old read-then-write sender had.
--
-- STATE MACHINE
--   pending ──claim──▶ sending ──success──────▶ sent      (terminal)
--      ▲                  │
--      │                  ├──permanent/max────▶ failed    (terminal)
--      │                  │
--      └──retryable───────┘  attempts+1, next_attempt_at = now()+backoff
--      ▲
--      └──lease expiry (worker died) — reclaimed after lease_expires_at
--
--   'skipped' stays terminal and is unchanged (unroutable platform).
--
-- Additive and reversible: only new nullable columns plus one widened CHECK.
-- Existing rows keep working (next_attempt_at NULL = eligible immediately).
-- ============================================================================
begin;

-- 1) LEASE + RETRY COLUMNS ---------------------------------------------------
alter table public.notification_outbox
  add column if not exists claimed_at       timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists claimed_by       text,
  add column if not exists next_attempt_at  timestamptz;

-- 2) ALLOW THE 'sending' STATE ----------------------------------------------
alter table public.notification_outbox drop constraint if exists notification_outbox_status_check;
alter table public.notification_outbox
  add constraint notification_outbox_status_check
  check (status in ('pending','sending','sent','failed','skipped'));

-- 3) CLAIM INDEX -------------------------------------------------------------
-- The old partial index only covered status='pending'. The claim predicate also
-- has to find expired 'sending' leases, so index both.
drop index if exists public.idx_outbox_pending;
create index if not exists idx_outbox_claimable
  on public.notification_outbox (status, next_attempt_at, created_at)
  where status in ('pending','sending');

-- 4) THE ATOMIC CLAIM --------------------------------------------------------
-- Returns the rows this caller now owns. Anything returned is guaranteed to be
-- owned by exactly one worker until its lease expires.
create or replace function public.claim_notification_outbox(
  p_limit         int  default 200,
  p_lease_seconds int  default 300,
  p_max_attempts  int  default 5,
  p_worker        text default null
)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimable as (
    select o.id
    from public.notification_outbox o
    where
      o.attempts < p_max_attempts
      and (
        -- never attempted, or its backoff has elapsed
        (o.status = 'pending' and (o.next_attempt_at is null or o.next_attempt_at <= now()))
        -- a worker claimed this and died: the lease has expired, so reclaim it
        or (o.status = 'sending' and o.lease_expires_at is not null and o.lease_expires_at < now())
      )
    order by o.created_at asc
    limit p_limit
    for update skip locked          -- ← the concurrency guarantee
  )
  update public.notification_outbox o
     set status           = 'sending',
         claimed_at       = now(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         claimed_by       = p_worker
    from claimable c
   where o.id = c.id
  returning o.*;
end;
$$;

revoke all on function public.claim_notification_outbox(int,int,int,text) from public, anon, authenticated;

-- 5) RESULT REPORTING --------------------------------------------------------
-- One function so a worker can never leave a row in 'sending' by writing a
-- partial update, and so backoff is computed in the database (single clock).
--
--   p_outcome 'sent'      -> terminal success
--             'retry'     -> attempts+1; back to 'pending' with backoff, or
--                            'failed' once attempts reaches p_max_attempts
--             'failed'    -> terminal (permanent token / max attempts)
--             'release'   -> PROVIDER CONFIG failure: back to 'pending' WITHOUT
--                            burning an attempt. A bad key or malformed payload
--                            affects every row for that provider; burning
--                            attempts would destroy the whole queue for a
--                            mistake that is ours to fix.
create or replace function public.finish_notification_outbox(
  p_id            uuid,
  p_outcome       text,
  p_error         text default null,
  p_max_attempts  int  default 5,
  p_base_backoff  int  default 60
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts int;
begin
  select attempts into v_attempts from public.notification_outbox where id = p_id;
  if v_attempts is null then return; end if;

  if p_outcome = 'sent' then
    update public.notification_outbox
       set status = 'sent', sent_at = now(), last_error = null,
           attempts = v_attempts + 1,
           claimed_at = null, lease_expires_at = null, claimed_by = null, next_attempt_at = null
     where id = p_id;

  elsif p_outcome = 'retry' then
    if v_attempts + 1 >= p_max_attempts then
      update public.notification_outbox
         set status = 'failed', last_error = coalesce(p_error,'max attempts reached'),
             attempts = v_attempts + 1,
             claimed_at = null, lease_expires_at = null, claimed_by = null
       where id = p_id;
    else
      update public.notification_outbox
         set status = 'pending', last_error = p_error,
             attempts = v_attempts + 1,
             -- exponential backoff, capped at 1h: 60s, 120s, 240s, 480s …
             next_attempt_at = now() + make_interval(secs => least(p_base_backoff * power(2, v_attempts)::int, 3600)),
             claimed_at = null, lease_expires_at = null, claimed_by = null
       where id = p_id;
    end if;

  elsif p_outcome = 'release' then
    -- config failure: return to the queue untouched (no attempt burned)
    update public.notification_outbox
       set status = 'pending', last_error = p_error,
           claimed_at = null, lease_expires_at = null, claimed_by = null
     where id = p_id;

  else -- 'failed'
    update public.notification_outbox
       set status = 'failed', last_error = coalesce(p_error,'permanent failure'),
           attempts = v_attempts + 1,
           claimed_at = null, lease_expires_at = null, claimed_by = null
     where id = p_id;
  end if;
end;
$$;

revoke all on function public.finish_notification_outbox(uuid,text,text,int,int) from public, anon, authenticated;

commit;
