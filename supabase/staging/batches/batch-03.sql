-- BATCH 3: 0003_preview_links.sql .. 0013_profile_versions.sql (11 files)

-- ======== 0003_preview_links.sql ========
-- 0003_preview_links.sql
-- Private preview links for spec-built (unpublished) profiles.
--
-- Sales motion: we build a polished profile for a company from their public
-- materials, keep it as a DRAFT (invisible to the world), and send the CEO a
-- private link to view it on their phone before they've paid or signed up.
--
-- How it stays private: each company gets an unguessable `preview_token`. The
-- public RLS policy still exposes ONLY published rows. To read a draft you must
-- call get_preview_company(slug, token) with the exact token — a SECURITY
-- DEFINER function that bypasses RLS but returns a row only on an exact
-- slug + token match. No token, no draft. Guessing a UUID is infeasible.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

-- ---------- per-company secret token ----------
alter table public.companies
  add column if not exists preview_token uuid not null default gen_random_uuid();

create unique index if not exists companies_preview_token_key
  on public.companies (preview_token);

-- ---------- token-gated draft reader ----------
-- Returns the company as jsonb (owner_id + token stripped) when BOTH the slug
-- and the secret token match; NULL otherwise. Works for any status, so a draft
-- is viewable via its private link without publishing it.
create or replace function public.get_preview_company(p_slug text, p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(c) - 'owner_id' - 'preview_token'
  from public.companies c
  where c.slug = p_slug
    and c.preview_token = p_token
  limit 1;
$$;

-- Only this function may be called by the public; it self-enforces the token.
revoke all on function public.get_preview_company(text, uuid) from public;
grant execute on function public.get_preview_company(text, uuid) to anon, authenticated;


-- ======== 0004_harden_signup_role.sql ========
-- 0004_harden_signup_role.sql
-- SECURITY FIX (critical): close client-controlled privilege escalation at signup.
--
-- Before: handle_new_user() copied raw_user_meta_data->>'role' straight into
-- profiles.role, so a crafted signup with data:{role:"admin"} became a platform
-- admin (is_admin() = profiles.role='admin'). This constrains the role to a safe
-- allowlist and locks down direct writes to profiles.
--
-- Normal one-time migration, wrapped in a transaction. Re-running is harmless
-- (CREATE OR REPLACE / idempotent grants), but this is not designed as a
-- repeatedly-rerun migration.

begin;

-- 1) Never trust client metadata for a privileged role. Only 'company' or
--    'investor' may be self-assigned at signup; anything else (incl. 'admin',
--    'owner') falls back to the least-privileged 'investor'. Admin is granted
--    only by a deliberate, separate action — never via signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  requested text := new.raw_user_meta_data->>'role';
  safe_role text := case when requested in ('company','investor') then requested else 'investor' end;
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, safe_role)
  on conflict (id) do nothing;
  return new;
end
$function$;

-- 2) Ensure RLS is on for profiles (no-op if already enabled).
alter table public.profiles enable row level security;

-- 3) Defense-in-depth: profiles is written ONLY by the SECURITY DEFINER trigger
--    (which runs as the table owner). Remove all direct client write privileges
--    so no session can UPDATE its own role even if a policy were misconfigured.
--    Reads stay governed by the existing profiles_self_read policy.
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;

commit;


-- ======== 0005_comms_foundation.sql ========
-- 0005_comms_foundation.sql
-- Milestone: Investor Communications OS — foundation.
--
-- Adds the data layer for:
--   • a feature-permission system (plans are bundles of features; never `if plan = 'tier2'`)
--   • Company Memory (documents + extracted facts)
--   • the Update → Publication → Destination pipeline
--
-- Nothing here changes the existing `companies` / `profiles` tables or the
-- investor app. `companies.profile` stays exactly as it is; `profile.pp` simply
-- becomes a DERIVED artifact that the 'passport' destination compiles and writes,
-- rather than the source of truth. The renderer never has to know.
--
-- SECURITY NOTES — read before editing:
--
-- 1. Entitlements are deliberately NOT a column on `companies`. The existing
--    "auth_update" policy (0001) lets an owner update ANY column of their own
--    row, so a `companies.plan_id` could be self-granted with a single PATCH
--    against PostgREST. Subscriptions live in their own table where owners have
--    SELECT but only admins have INSERT/UPDATE/DELETE.
--
-- 2. Same reasoning for `company_features` (per-company overrides): owner-read,
--    admin-write. A customer must never be able to grant themselves a feature.
--
-- 3. RLS here is the real enforcement boundary. A can() helper in React is
--    cosmetic. Server code (api/*) must check company_has_feature() too — the
--    AI endpoints spend real money per call.
--
-- 4. Connector credentials must NOT be stored in company_destinations.config —
--    it is owner-readable. `config` is for non-secret settings only (page id,
--    handle, from-name). Tokens go in a vault keyed by `secret_ref`.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

-- ============================================================
-- helpers
-- ============================================================

-- Does the current user own this company? SECURITY DEFINER so that policies on
-- child tables can ask without recursing through the companies policies.
create or replace function public.owns_company(cid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies c
    where c.id = cid and c.owner_id = auth.uid()
  );
$$;

-- Owner or platform admin — the access rule for every table below.
create or replace function public.can_touch_company(cid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.owns_company(cid) or public.is_admin();
$$;

-- ============================================================
-- 1) FEATURE PERMISSIONS
-- ============================================================

-- The catalogue of capabilities. Features are DATA, so a new one is a row, not a
-- branch in the app.
create table if not exists public.features (
  id          text primary key,
  label       text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- Plans are just named bundles of features.
create table if not exists public.plans (
  id    text primary key,
  label text not null,
  rank  int  not null default 0,   -- display order, low → high
  created_at timestamptz not null default now()
);

create table if not exists public.plan_features (
  plan_id    text not null references public.plans(id)    on delete cascade,
  feature_id text not null references public.features(id) on delete cascade,
  primary key (plan_id, feature_id)
);

-- Which plan a company is on. Separate table — see SECURITY NOTE 1.
create table if not exists public.company_subscriptions (
  company_id uuid primary key references public.companies(id) on delete cascade,
  plan_id    text not null references public.plans(id),
  status     text not null default 'active',   -- active | past_due | cancelled
  started_at timestamptz not null default now(),
  renews_at  timestamptz,
  note       text,
  updated_at timestamptz not null default now()
);

-- Per-company overrides. `enabled = false` is an explicit DENY that beats the
-- plan (e.g. suspend one connector without downgrading the whole account);
-- `enabled = true` grants a feature the plan doesn't include (trials, comps).
create table if not exists public.company_features (
  company_id uuid not null references public.companies(id) on delete cascade,
  feature_id text not null references public.features(id)  on delete cascade,
  enabled    boolean not null default true,
  note       text,
  created_at timestamptz not null default now(),
  primary key (company_id, feature_id)
);

-- THE resolver. Default-deny: no subscription and no override → false.
-- Override wins over plan, in both directions.
create or replace function public.company_has_feature(cid uuid, fid text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    -- an explicit override decides it outright
    (select cf.enabled from public.company_features cf
      where cf.company_id = cid and cf.feature_id = fid),
    -- otherwise: does the company's active plan include it?
    (select exists (
       select 1
         from public.company_subscriptions s
         join public.plan_features pf on pf.plan_id = s.plan_id
        where s.company_id = cid
          and s.status = 'active'
          and pf.feature_id = fid
     )),
    false
  );
$$;

-- What the UI calls to build can(). Returns the resolved feature ids for a
-- company the caller is allowed to see. Admins get everything, so the admin
-- console isn't gated by a customer's plan.
create or replace function public.my_features(cid uuid)
returns setof text
language sql stable security definer set search_path = public as $$
  select f.id
    from public.features f
   where public.can_touch_company(cid)
     and (public.is_admin() or public.company_has_feature(cid, f.id));
$$;

-- ============================================================
-- 2) COMPANY MEMORY — documents + facts
-- ============================================================

-- Every file ever ingested. The blob lives in the existing `company-docs`
-- bucket (migration 0002); this row is the metadata + the extracted text the AI
-- actually reads.
--
-- Why extracted_text lives here and not in Storage: the AI reads text, not
-- bytes. Keeping it in Postgres means Copilot/extraction never egress from
-- Storage, so bandwidth stays flat no matter how much is stored. The blob is
-- kept only for provenance — "show me the original".
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  storage_path  text,                  -- e.g. company-docs/<owner>/<uuid>.pdf
  filename      text,
  mime          text,
  bytes         bigint,
  sha256        text,                  -- dedup: same file dropped twice is one row
  kind          text,                  -- press_release | deck | technical_report | interview | financing | other
  doc_date      date,                  -- the document's own date, not upload time
  title         text,
  extracted_text    text,
  extraction_status text not null default 'pending',  -- pending | done | failed | skipped
  extraction_error  text,
  meta          jsonb not null default '{}'::jsonb,
  uploaded_by   uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Same file, same company → one document. Partial: a null hash must not collide.
create unique index if not exists documents_company_sha_key
  on public.documents (company_id, sha256) where sha256 is not null;
create index if not exists documents_company_idx on public.documents (company_id);
create index if not exists documents_kind_idx    on public.documents (company_id, kind);
create index if not exists documents_date_idx    on public.documents (company_id, doc_date desc);

-- Structured knowledge extracted from documents. This is what compiles into the
-- profile and answers Copilot questions.
--
-- `document_id` + `quote` are the provenance pair: every fact points at the
-- document it came from and the verbatim phrase that proves it. This is the
-- same "Check your work" contract the Audience Card already ships, applied to
-- everything — non-negotiable for a regulated issuer.
create table if not exists public.facts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  kind        text not null,           -- project | person | drill_result | financing | capital | timeline_event | media | other
  subject     text,                    -- the project/person this is about
  data        jsonb not null,
  document_id uuid references public.documents(id) on delete set null,
  quote       text,                    -- verbatim phrase from the source
  confidence  real,
  superseded_by uuid references public.facts(id) on delete set null,  -- facts change; keep the chain
  created_at  timestamptz not null default now()
);
create index if not exists facts_company_idx on public.facts (company_id);
create index if not exists facts_kind_idx    on public.facts (company_id, kind);
create index if not exists facts_subject_idx on public.facts (company_id, kind, subject);
create index if not exists facts_doc_idx     on public.facts (document_id);

-- ============================================================
-- 3) UPDATES → PUBLICATIONS → DESTINATIONS
-- ============================================================

-- The canonical Update. The CEO writes one line ("Completed hole LC-27, assays
-- submitted") and everything else is generated from it. This is the object the
-- whole Communications Center turns on.
create table if not exists public.updates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  author_id   uuid references auth.users(id),
  body        text not null,
  occurred_on date,                    -- when the thing happened, if not today
  status      text not null default 'draft',   -- draft | generating | review | approved | published | failed
  detected    jsonb not null default '{}'::jsonb,  -- AI's answer to "what changed?"
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists updates_company_idx on public.updates (company_id, created_at desc);
create index if not exists updates_status_idx  on public.updates (company_id, status);

-- Files attached to an update (site photos, the signed PDF, video).
create table if not exists public.update_documents (
  update_id   uuid not null references public.updates(id)   on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  primary key (update_id, document_id)
);

-- The connector registry. Adding Instagram later is a row here plus a publish()
-- implementation — no change to the Communications Center.
create table if not exists public.destinations (
  id          text primary key,        -- passport | website | linkedin | x | newsletter | push
  label       text not null,
  feature_id  text references public.features(id),  -- which entitlement unlocks it
  rank        int not null default 0,
  config_schema jsonb not null default '{}'::jsonb, -- shape of company_destinations.config
  created_at  timestamptz not null default now()
);

-- A company's wiring for one destination.
-- `config` is OWNER-READABLE — non-secret settings only (see SECURITY NOTE 4).
-- OAuth tokens are referenced by `secret_ref`, never stored here.
create table if not exists public.company_destinations (
  company_id     uuid not null references public.companies(id)   on delete cascade,
  destination_id text not null references public.destinations(id) on delete cascade,
  enabled     boolean not null default true,
  config      jsonb not null default '{}'::jsonb,
  secret_ref  text,                    -- pointer into the credential vault; NOT the token
  status      text not null default 'disconnected',  -- disconnected | connected | error
  last_error  text,
  updated_at  timestamptz not null default now(),
  primary key (company_id, destination_id)
);

-- One generated artifact for one destination, from one update.
--
-- `update_id` is the "generated from" link: if the update changes, everything
-- downstream can regenerate. The unique constraint means a double-clicked
-- Publish cannot post twice to X — the second insert conflicts instead.
create table if not exists public.publications (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id)    on delete cascade,
  update_id      uuid not null references public.updates(id)      on delete cascade,
  destination_id text not null references public.destinations(id),
  content     jsonb not null default '{}'::jsonb,   -- destination-shaped payload
  status      text not null default 'draft',        -- draft | review | approved | queued | published | failed | skipped
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  published_at timestamptz,
  external_id  text,                   -- the post/message id at the destination
  external_url text,
  error        text,
  attempts     int not null default 0,
  regenerated_from uuid references public.publications(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (update_id, destination_id)
);
create index if not exists publications_company_idx on public.publications (company_id, created_at desc);
create index if not exists publications_update_idx  on public.publications (update_id);
create index if not exists publications_status_idx  on public.publications (company_id, status);

-- ---------- updated_at auto-touch (reuses 0001's function) ----------
do $$
declare t text;
begin
  foreach t in array array['company_subscriptions','documents','updates','company_destinations','publications']
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ============================================================
-- 4) RLS — every table, owner-or-admin, matching 0001's pattern
-- ============================================================

-- Reference tables: any signed-in user may READ (the UI needs to show what a
-- plan would unlock); only admins may WRITE.
do $$
declare t text; p record;
begin
  foreach t in array array['features','plans','plan_features','destinations']
  loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t
    loop execute format('drop policy %I on public.%I', p.policyname, t); end loop;

    execute format('create policy "read_all_auth" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "admin_write"  on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Entitlement tables: owner may READ their own, ONLY admin may write.
-- This is the paywall. See SECURITY NOTES 1 and 2.
do $$
declare t text; p record;
begin
  foreach t in array array['company_subscriptions','company_features']
  loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t
    loop execute format('drop policy %I on public.%I', p.policyname, t); end loop;

    execute format('create policy "owner_read" on public.%I for select to authenticated
                    using (public.can_touch_company(company_id))', t);
    execute format('create policy "admin_write" on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Company-owned working data: owner or admin, full access. Never anon —
-- memory and drafts are private even when the profile is published.
do $$
declare t text; p record;
begin
  foreach t in array array['documents','facts','updates','company_destinations','publications']
  loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t
    loop execute format('drop policy %I on public.%I', p.policyname, t); end loop;

    execute format('create policy "owner_all" on public.%I for all to authenticated
                    using (public.can_touch_company(company_id))
                    with check (public.can_touch_company(company_id))', t);
  end loop;
end $$;

-- update_documents has no company_id of its own — gate it through its update.
alter table public.update_documents enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='update_documents'
  loop execute format('drop policy %I on public.update_documents', p.policyname); end loop;
end $$;
create policy "owner_all" on public.update_documents for all to authenticated
  using (exists (select 1 from public.updates u
                  where u.id = update_id and public.can_touch_company(u.company_id)))
  with check (exists (select 1 from public.updates u
                  where u.id = update_id and public.can_touch_company(u.company_id)));

-- ============================================================
-- 5) SEED — the feature catalogue, the three plans, the destinations
-- ============================================================

insert into public.features (id, label, description) values
  ('passport_profile',      'Passport profile',      'Build and publish the investor profile. Documents update overview, projects, timeline, capital, team and media.'),
  ('company_memory',        'Company memory',        'Every uploaded document is stored, extracted and searchable.'),
  ('communications_center', 'Communications Center', 'Write one update; AI drafts every destination. Review and publish.'),
  ('website_publish',       'Website publishing',    'Publish structured Passport content to the company website.'),
  ('linkedin_publish',      'LinkedIn publishing',   'Publish updates to LinkedIn.'),
  ('x_publish',             'X publishing',          'Publish updates to X.'),
  ('newsletter_publish',    'Newsletter',            'Send updates to the investor mailing list.'),
  ('push_publish',          'Push notifications',    'Notify followers in the Passport app.'),
  ('analytics',             'Investor analytics',    'Profile views, follows, reading time, geography.'),
  ('custom_website',        'Managed website',       'Passport-hosted investor website, maintained for you.')
on conflict (id) do update set label = excluded.label, description = excluded.description;

insert into public.plans (id, label, rank) values
  ('passport',                'Passport',                  10),
  ('passport_communications', 'Passport Communications',   20),
  ('passport_managed',        'Passport Managed Presence', 30)
on conflict (id) do update set label = excluded.label, rank = excluded.rank;

-- Tier 1 — manage the profile. No external publishing.
insert into public.plan_features (plan_id, feature_id)
select 'passport', f from unnest(array['passport_profile','company_memory']) f
on conflict do nothing;

-- Tier 2 — everything above + the Communications Center and its connectors.
insert into public.plan_features (plan_id, feature_id)
select 'passport_communications', f from unnest(array[
  'passport_profile','company_memory','communications_center',
  'linkedin_publish','x_publish','newsletter_publish','push_publish','analytics'
]) f
on conflict do nothing;

-- Tier 3 — everything above + the managed website.
insert into public.plan_features (plan_id, feature_id)
select 'passport_managed', f from unnest(array[
  'passport_profile','company_memory','communications_center',
  'linkedin_publish','x_publish','newsletter_publish','push_publish','analytics',
  'website_publish','custom_website'
]) f
on conflict do nothing;

-- The Passport profile is itself just a destination — that is the whole point.
insert into public.destinations (id, label, feature_id, rank) values
  ('passport',   'Passport profile', 'passport_profile',   10),
  ('push',       'Push notification','push_publish',       20),
  ('website',    'Website',          'website_publish',    30),
  ('linkedin',   'LinkedIn',         'linkedin_publish',   40),
  ('x',          'X',                'x_publish',          50),
  ('newsletter', 'Newsletter',       'newsletter_publish', 60)
on conflict (id) do update set label = excluded.label, feature_id = excluded.feature_id, rank = excluded.rank;

-- Every existing company keeps working: put them on the base plan. Existing
-- rows are left alone so a real subscription is never downgraded by a re-run.
insert into public.company_subscriptions (company_id, plan_id, note)
select c.id, 'passport', 'backfilled by 0005'
  from public.companies c
on conflict (company_id) do nothing;


-- ======== 0006_portal_foundation.sql ========
-- 0006_portal_foundation.sql
-- Company Portal — access-architecture foundation.
--
-- Adds four things and changes NO existing behaviour:
--
--   1. A `portal_access` entitlement, seeded into every plan, so any company with
--      an active subscription can reach the desktop Company Portal. Access is an
--      ENTITLEMENT, never a client flag (see 0005 SECURITY NOTE 1).
--
--   2. `company_memberships` — the future authorization spine. Single-owner TODAY:
--      every company with an owner_id gets exactly one backfilled 'owner' row. But
--      the table already carries `role` (owner/admin/editor/publisher/analyst/
--      viewer) and `status`, so adding a teammate later is an INSERT, not a schema
--      rewrite. `owns_company()` is widened to accept owner_id OR an active
--      membership, so every existing RLS policy keeps working untouched.
--
--   3. `activity_log` — an append-only audit trail. Company users may INSERT and
--      SELECT their own company's rows but cannot UPDATE or DELETE them; only a
--      platform admin can. This is what makes admin edits attributable and
--      publishing actions non-erasable.
--
--   4. `portal_readiness(cid)` — proves, per company, that a working portal exists
--      (company row + active owner membership + active entitlement). The Admin
--      console renders this so you can see at a glance that every company is Ready.
--
-- Depends on 0001 (is_admin), 0005 (owns_company/can_touch_company/features/plans/
-- company_subscriptions). Run in Supabase -> SQL Editor. Idempotent: safe to re-run.

begin;

-- ============================================================
-- 1) PORTAL ACCESS ENTITLEMENT
-- ============================================================

insert into public.features (id, label, description) values
  ('portal_access', 'Company Portal', 'Access the desktop Company Portal to manage the company.')
on conflict (id) do update set label = excluded.label, description = excluded.description;

-- Every plan includes portal access — paying for Passport at any tier means you
-- get the portal. (Per-company DENY is still possible via company_features.)
insert into public.plan_features (plan_id, feature_id)
select p.id, 'portal_access' from public.plans p
on conflict do nothing;

-- ============================================================
-- 2) COMPANY MEMBERSHIPS — the authorization spine
-- ============================================================

create table if not exists public.company_memberships (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id)       on delete cascade,
  -- Roles exist now so later expansion is data, not DDL. Launch only creates 'owner'.
  role        text not null default 'owner'
              check (role in ('owner','admin','editor','publisher','analyst','viewer')),
  status      text not null default 'active'
              check (status in ('active','invited','suspended','removed')),
  invited_by  uuid references auth.users(id),
  joined_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, user_id)
);
create index if not exists memberships_company_idx on public.company_memberships (company_id);
create index if not exists memberships_user_idx    on public.company_memberships (user_id);

-- Backfill: every currently-owned company gets one active 'owner' membership.
insert into public.company_memberships (company_id, user_id, role, status)
select c.id, c.owner_id, 'owner', 'active'
  from public.companies c
 where c.owner_id is not null
on conflict (company_id, user_id) do nothing;

-- Auto-provision the owner membership on company create / owner assignment, so
-- the membership spine is ALWAYS authoritative — a company created after this
-- migration (concierge or self-serve) gets its owner membership automatically,
-- with no app change and no manual step. Idempotent. (Ownership transfer is an
-- admin flow; we reactivate the new owner but leave prior rows for the audit
-- trail rather than silently revoking here.)
create or replace function public.sync_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null then
    insert into public.company_memberships (company_id, user_id, role, status)
    values (new.id, new.owner_id, 'owner', 'active')
    on conflict (company_id, user_id) do update set status = 'active';
  end if;
  return new;
end $$;

drop trigger if exists companies_sync_owner on public.companies;
create trigger companies_sync_owner
  after insert or update of owner_id on public.companies
  for each row execute function public.sync_owner_membership();

-- Widen ownership to accept owner_id OR an active membership. SECURITY DEFINER
-- (unchanged from 0005) means this does NOT recurse through the memberships RLS
-- policy below. Every policy that calls owns_company()/can_touch_company() now
-- transparently honours memberships too.
create or replace function public.owns_company(cid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies c
     where c.id = cid and c.owner_id = auth.uid()
  ) or exists (
    select 1 from public.company_memberships m
     where m.company_id = cid and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

-- The caller's effective role for a company (highest privilege wins). Used by the
-- portal to decide what to render; the DB still enforces via RLS. Returns null if
-- the caller has no relationship to the company.
create or replace function public.my_company_role(cid uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.role
       from public.company_memberships m
      where m.company_id = cid and m.user_id = auth.uid() and m.status = 'active'
      order by case m.role
                 when 'owner' then 0 when 'admin' then 1 when 'publisher' then 2
                 when 'editor' then 3 when 'analyst' then 4 else 5 end
      limit 1),
    (select 'owner' from public.companies c where c.id = cid and c.owner_id = auth.uid())
  );
$$;

-- RLS: a user may read their OWN memberships (needed to resolve which companies
-- they belong to) or any membership of a company they can touch (to see the team).
-- Writes are admin-only for launch — owners cannot yet self-manage a team, which
-- keeps the single-owner model tight. can_touch_company() is SECURITY DEFINER so
-- referencing it here does not recurse.
alter table public.company_memberships enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='company_memberships'
  loop execute format('drop policy %I on public.company_memberships', p.policyname); end loop;
end $$;
create policy "read_own_or_touchable" on public.company_memberships for select to authenticated
  using (user_id = auth.uid() or public.can_touch_company(company_id));
create policy "admin_write" on public.company_memberships for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 3) ACTIVITY LOG — append-only audit trail
-- ============================================================

create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  actor_id    uuid references auth.users(id),
  actor_kind  text not null default 'company'
              check (actor_kind in ('company','admin','system')),
  action      text not null,          -- profile_updated | broadcast_published | media_uploaded | ...
  entity      text,                   -- what was affected (e.g. 'profile.capital')
  old_value   jsonb,
  new_value   jsonb,
  reason      text,
  source      text,                   -- ui | api | admin_edit | smoke_test
  created_at  timestamptz not null default now()
);
create index if not exists activity_company_idx on public.activity_log (company_id, created_at desc);

-- Append-only for company users: SELECT + INSERT only, no UPDATE/DELETE policy for
-- them, so history cannot be rewritten. Admins get full control for corrections.
alter table public.activity_log enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='activity_log'
  loop execute format('drop policy %I on public.activity_log', p.policyname); end loop;
end $$;
create policy "read_touchable"   on public.activity_log for select to authenticated
  using (public.can_touch_company(company_id));
create policy "insert_touchable" on public.activity_log for insert to authenticated
  with check (public.can_touch_company(company_id));
create policy "admin_all"        on public.activity_log for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 4) PORTAL READINESS — provable, per company
-- ============================================================

-- Returns { ready: bool, missing: text[] }. A company is portal-ready when it has
-- a row, an active owner membership, and an active subscription (which now grants
-- portal_access). SECURITY DEFINER + an internal can_touch_company() gate so the
-- Admin console can call it for any company while a stranger gets 'not_authorized'.
create or replace function public.portal_readiness(cid uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  missing text[] := array[]::text[];
  has_company boolean;
  has_owner   boolean;
  has_sub     boolean;
begin
  if not public.can_touch_company(cid) then
    return jsonb_build_object('ready', false, 'missing', array['not_authorized']);
  end if;

  select exists(select 1 from public.companies where id = cid) into has_company;
  if not has_company then
    return jsonb_build_object('ready', false, 'missing', array['company']);
  end if;

  select exists(select 1 from public.company_memberships m
                 where m.company_id = cid and m.role = 'owner' and m.status = 'active')
    into has_owner;
  if not has_owner then missing := array_append(missing, 'owner'); end if;

  select exists(select 1 from public.company_subscriptions s
                 where s.company_id = cid and s.status = 'active')
    into has_sub;
  if not has_sub then missing := array_append(missing, 'entitlement'); end if;

  return jsonb_build_object('ready', array_length(missing, 1) is null, 'missing', missing);
end $$;

-- ---------- updated_at auto-touch (reuses 0001's function) ----------
drop trigger if exists company_memberships_touch on public.company_memberships;
create trigger company_memberships_touch before update on public.company_memberships
  for each row execute function public.touch_updated_at();

commit;


-- ======== 0007_company_invitations.sql ========
-- 0007_company_invitations.sql
-- Company handoff — invite a real company owner, securely, with no service key.
--
-- The concierge builds a company (owner_id = admin). To hand it to the real
-- company, an admin issues an invitation for their email; the company signs in
-- with THAT email and is made an owner of THAT company — the email match is
-- enforced in the database (auth.jwt() email must equal the invite email), so a
-- leaked link is useless to anyone else.
--
-- Two SECURITY DEFINER RPCs carry the flow so the table itself stays admin-only:
--   • create_company_invitation(company, email, role) -> { id, token }  (admin only)
--   • accept_company_invitation(token)                -> { ok, company_id | error }
--
-- Acceptance inserts a company_membership (the 0006 spine), so the invited user
-- immediately resolves the portal. Idempotent. Run in Supabase -> SQL Editor.

begin;

create table if not exists public.company_invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  email       text not null,
  role        text not null default 'owner'
              check (role in ('owner','admin','editor','publisher','analyst','viewer')),
  token       text not null unique,
  status      text not null default 'pending'
              check (status in ('pending','accepted','revoked','expired')),
  invited_by  uuid references auth.users(id),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists invitations_company_idx on public.company_invitations (company_id);
create index if not exists invitations_email_idx    on public.company_invitations (lower(email));

-- Table is admin-only for direct access; the accept path goes through the RPC
-- below (SECURITY DEFINER), so the invited user never needs a row-level grant.
alter table public.company_invitations enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='company_invitations'
  loop execute format('drop policy %I on public.company_invitations', p.policyname); end loop;
end $$;
create policy "admin_all" on public.company_invitations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Create an invitation. Admin-only (checked inside). Returns the token so the
-- console can build a link to hand to the company.
create or replace function public.create_company_invitation(p_company_id uuid, p_email text, p_role text default 'owner')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_token text; v_id uuid; v_role text;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  v_role := case when p_role in ('owner','admin','editor','publisher','analyst','viewer') then p_role else 'owner' end;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.company_invitations (company_id, email, role, token, invited_by, status, expires_at)
  values (p_company_id, lower(trim(p_email)), v_role, v_token, auth.uid(), 'pending', now() + interval '14 days')
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

-- Accept an invitation as the signed-in user. Enforces that the caller's own
-- verified email matches the invite. On success, inserts/reactivates the caller's
-- company membership and marks the invite accepted.
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

  update public.company_invitations
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v.id;

  return jsonb_build_object('ok', true, 'company_id', v.company_id);
end $$;

commit;


-- ======== 0008_publish_spine.sql ========
-- 0008_publish_spine.sql  — CHECKPOINT 1: publish spine & dispatcher plumbing.
-- See docs/adr/0001-publish-event-architecture.md and the phase deployment plan.
--
-- Spine only: durable outbox + versioned publish/unpublish RPCs + LEASE-BASED
-- delivery claiming. No listener tables (posts/follows/notifications = CP2), no
-- publish lockdown (= 0009, applied only after a green prod smoke test).
--
-- Hardening in this revision:
--   • Lease-based claiming (locked_at/lease_expires_at/locked_by): a crashed
--     dispatcher's 'processing' row is reclaimed after its lease expires, never
--     stranded. complete_delivery is lease-guarded, so a revived stale worker
--     cannot clobber a reclaimed delivery.
--   • Publish authorization restricted to publish-capable roles only
--     (owner/admin/publisher + platform admin) — an editor/analyst/viewer cannot
--     publish or unpublish.
--   • Recognized-event-type + positive-version constraints.
--   • listener_subscriptions: deliveries are created ONLY for event types a
--     listener declares support for.
--   • EXECUTE revoked from PUBLIC (not just anon/authenticated — role-specific
--     revokes leave the default PUBLIC grant intact) and granted only to
--     service_role, for every spine SECURITY DEFINER function incl. replay.
--
-- Depends on 0001 (is_admin), 0005 (publications/companies), 0006
-- (company_memberships). Idempotent. Run in Supabase -> SQL Editor.

begin;

alter table public.publications add column if not exists publish_seq integer not null default 0;

-- ============================================================
-- OUTBOX  (with recognized-type + positive-version constraints)
-- ============================================================
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  event_type      text not null,
  event_version   integer not null default 1,
  publication_id  uuid references public.publications(id) on delete cascade,
  company_id      uuid references public.companies(id) on delete cascade,
  actor_user_id   uuid,
  payload         jsonb not null default '{}'::jsonb,   -- ids + context only, never content
  idempotency_key text not null unique,
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  constraint events_type_chk    check (event_type in ('PUBLICATION_PUBLISHED','PUBLICATION_UNPUBLISHED')),
  constraint events_version_chk check (event_version >= 1)
);
create index if not exists events_type_idx on public.events (event_type, created_at desc);

create table if not exists public.event_deliveries (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  listener        text not null,                        -- versioned, e.g. 'feed_projection_v1'
  status          text not null default 'pending' check (status in ('pending','processing','succeeded','failed','dead')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at       timestamptz,
  lease_expires_at timestamptz,
  locked_by       text,
  last_error      text,
  processed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (event_id, listener)
);
create index if not exists deliveries_claim_idx on public.event_deliveries (listener, status, next_attempt_at);
create index if not exists deliveries_lease_idx on public.event_deliveries (listener, status, lease_expires_at);

-- Which event types each versioned listener supports. Deliveries are only created
-- for supported (listener, event_type) pairs. Seeded per listener in checkpoint 2.
create table if not exists public.listener_subscriptions (
  listener   text not null,
  event_type text not null,
  primary key (listener, event_type)
);

alter table public.events                 enable row level security;
alter table public.event_deliveries       enable row level security;
alter table public.listener_subscriptions enable row level security;
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies
           where schemaname='public' and tablename in ('events','event_deliveries','listener_subscriptions')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;
create policy "admin_read" on public.events                 for select to authenticated using (public.is_admin());
create policy "admin_read" on public.event_deliveries       for select to authenticated using (public.is_admin());
create policy "admin_read" on public.listener_subscriptions for select to authenticated using (public.is_admin());

-- ============================================================
-- AUTHORIZATION  (publish-capable roles only)
-- ============================================================
create or replace function public.actor_can_publish(p_company uuid, p_actor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.companies c where c.id = p_company and c.owner_id = p_actor)
      or exists (select 1 from public.company_memberships m
                  where m.company_id = p_company and m.user_id = p_actor and m.status = 'active'
                    and m.role in ('owner','admin','publisher'))
      or exists (select 1 from public.profiles pr where pr.id = p_actor and pr.role = 'admin');
$$;

-- ============================================================
-- PUBLISH / UNPUBLISH  (service-role only)
-- ============================================================
create or replace function public.publish_publication(p_publication_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.publications; v_seq integer; v_key text; v_event_id uuid;
begin
  select * into v from public.publications where id = p_publication_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.actor_can_publish(v.company_id, p_actor) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v.status = 'published' then return jsonb_build_object('ok', true, 'already', true, 'publication_id', v.id, 'published_at', v.published_at); end if;
  if v.status not in ('draft', 'review', 'approved') then return jsonb_build_object('ok', false, 'error', 'invalid_transition', 'status', v.status); end if;

  v_seq := coalesce(v.publish_seq, 0) + 1;
  update public.publications set status = 'published', published_at = now(), publish_seq = v_seq, error = null where id = v.id;
  v_key := 'publish:' || v.id::text || ':' || v_seq::text;
  insert into public.events (event_type, event_version, publication_id, company_id, actor_user_id, payload, idempotency_key)
  values ('PUBLICATION_PUBLISHED', 1, v.id, v.company_id, p_actor,
          jsonb_build_object('publication_id', v.id, 'company_id', v.company_id, 'publish_seq', v_seq), v_key)
  on conflict (idempotency_key) do nothing returning id into v_event_id;
  return jsonb_build_object('ok', true, 'publication_id', v.id, 'published_at', now(), 'event_id', v_event_id, 'idempotency_key', v_key);
end $$;

create or replace function public.unpublish_publication(p_publication_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.publications; v_seq integer; v_key text; v_event_id uuid;
begin
  select * into v from public.publications where id = p_publication_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.actor_can_publish(v.company_id, p_actor) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v.status <> 'published' then return jsonb_build_object('ok', true, 'already', true, 'status', v.status); end if;

  v_seq := coalesce(v.publish_seq, 0) + 1;
  update public.publications set status = 'draft', publish_seq = v_seq where id = v.id;
  v_key := 'unpublish:' || v.id::text || ':' || v_seq::text;
  insert into public.events (event_type, event_version, publication_id, company_id, actor_user_id, payload, idempotency_key)
  values ('PUBLICATION_UNPUBLISHED', 1, v.id, v.company_id, p_actor,
          jsonb_build_object('publication_id', v.id, 'company_id', v.company_id, 'publish_seq', v_seq), v_key)
  on conflict (idempotency_key) do nothing returning id into v_event_id;
  return jsonb_build_object('ok', true, 'publication_id', v.id, 'event_id', v_event_id, 'idempotency_key', v_key);
end $$;

-- ============================================================
-- DISPATCHER  (lease-based; service-role only)
-- ============================================================

-- Claim a batch for one listener: due pending/failed rows OR expired-lease
-- 'processing' rows (reclaim after a crashed worker). Only creates deliveries for
-- SUPPORTED event types. Sets a fresh lease + worker. FOR UPDATE SKIP LOCKED so
-- concurrent dispatchers never grab the same row.
create or replace function public.claim_deliveries(p_listener text, p_worker text, p_limit integer default 10, p_lease_seconds integer default 120)
returns setof public.events language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  insert into public.event_deliveries (event_id, listener)
  select e.id, p_listener from public.events e
  join public.listener_subscriptions ls on ls.listener = p_listener and ls.event_type = e.event_type
  where not exists (select 1 from public.event_deliveries d where d.event_id = e.id and d.listener = p_listener)
  on conflict (event_id, listener) do nothing;

  select array_agg(id) into v_ids from (
    select d.id from public.event_deliveries d
    where d.listener = p_listener
      and (
        (d.status in ('pending','failed') and d.next_attempt_at <= now())
        or (d.status = 'processing' and d.lease_expires_at is not null and d.lease_expires_at < now())
      )
    order by d.next_attempt_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 100))
  ) s;

  if v_ids is null then return; end if;

  update public.event_deliveries
     set status = 'processing', attempts = attempts + 1,
         locked_at = now(),
         lease_expires_at = now() + (greatest(5, coalesce(p_lease_seconds, 120)) * interval '1 second'),
         locked_by = p_worker, updated_at = now()
   where id = any(v_ids);

  return query select e.* from public.events e join public.event_deliveries d on d.event_id = e.id where d.id = any(v_ids);
end $$;

-- Finalize — ONLY if this worker still holds the lease (locked_by match + still
-- processing). Returns true if it applied; false means the lease was stolen/expired
-- and a reclaiming worker owns it now, so this stale result is ignored.
create or replace function public.complete_delivery(p_event_id uuid, p_listener text, p_worker text, p_ok boolean, p_error text default null, p_max_attempts integer default 6)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rows integer;
begin
  if p_ok then
    update public.event_deliveries
       set status = 'succeeded', processed_at = now(), last_error = null,
           locked_at = null, lease_expires_at = null, locked_by = null, updated_at = now()
     where event_id = p_event_id and listener = p_listener and locked_by = p_worker and status = 'processing';
  else
    update public.event_deliveries d
       set status = case when d.attempts >= p_max_attempts then 'dead' else 'failed' end,
           last_error = p_error,
           next_attempt_at = now() + (interval '30 seconds' * power(2, least(d.attempts, 8))),
           locked_at = null, lease_expires_at = null, locked_by = null, updated_at = now()
     where d.event_id = p_event_id and d.listener = p_listener and d.locked_by = p_worker and d.status = 'processing';
  end if;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

create or replace function public.replay_delivery(p_event_id uuid, p_listener text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.event_deliveries
     set status = 'pending', next_attempt_at = now(), last_error = null,
         locked_at = null, lease_expires_at = null, locked_by = null, updated_at = now()
   where event_id = p_event_id and listener = p_listener;
end $$;

-- Lock EVERY spine SECURITY DEFINER function to the service role. Revoking from
-- PUBLIC is mandatory — PUBLIC covers anon + authenticated, and a role-specific
-- revoke leaves the default PUBLIC grant intact.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.publish_publication(uuid, uuid)',
    'public.unpublish_publication(uuid, uuid)',
    'public.claim_deliveries(text, text, integer, integer)',
    'public.complete_delivery(uuid, text, text, boolean, text, integer)',
    'public.replay_delivery(uuid, text)',
    'public.actor_can_publish(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

commit;

-- ============================================================
-- PROOF: final EXECUTE grants on the spine functions. Expect only 'service_role'
-- (plus the function owner implicitly). anon/authenticated/PUBLIC must NOT appear.
-- ============================================================
select routine_name, grantee, privilege_type
  from information_schema.routine_privileges
 where routine_schema = 'public'
   and routine_name in ('publish_publication','unpublish_publication','claim_deliveries',
                        'complete_delivery','replay_delivery','actor_can_publish')
 order by routine_name, grantee;


-- ======== 0009_feed_listeners.sql ========
-- 0009_feed_listeners.sql — CHECKPOINT 3–4 substrate (reconciliation-aware).
--
-- An earlier trigger-based feed draft had already created posts/company_follows/
-- post_events (old shape) + an auto-post TRIGGER. This migration:
--   • drops that trigger so the dispatcher is the ONLY projector,
--   • upgrades posts in place to the normalized schema (adds columns, backfills),
--   • creates notifications + notification_prefs,
--   • (re)creates the feed RPCs — feed_discover joins back to posts so it is immune
--     to any legacy columns left on the table,
--   • seeds listener subscriptions.
-- Idempotent + safe whether the old objects exist or not. Run in Supabase SQL Editor.

begin;

-- 0) Remove the abandoned trigger-based projector.
drop trigger if exists publications_project_post on public.publications;
drop function if exists public.project_publication_to_post() cascade;

-- 1) POSTS — ensure table, then bring it up to the normalized schema.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null unique references public.publications(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
alter table public.posts add column if not exists post_type text not null default 'press_release';
alter table public.posts add column if not exists category text;
alter table public.posts add column if not exists summary text;
alter table public.posts add column if not exists thumbnail_url text;
alter table public.posts add column if not exists source_url text;
alter table public.posts add column if not exists materiality_score integer;
alter table public.posts add column if not exists materiality_label text;
alter table public.posts add column if not exists project_id text;

-- Backfill new columns from legacy ones only if those legacy columns exist.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='materiality') then
    execute 'update public.posts set materiality_label = coalesce(materiality_label, materiality)';
    execute $q$update public.posts set materiality_score = coalesce(materiality_score,
      case materiality_label when 'Transformational' then 90 when 'High' then 70 when 'Moderate' then 40 when 'Low' then 15 else null end)$q$;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='media_url') then
    execute 'update public.posts set thumbnail_url = coalesce(thumbnail_url, media_url)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='kind') then
    execute 'update public.posts set post_type = coalesce(post_type, kind)';
  end if;
end $$;

create index if not exists posts_published_idx on public.posts (published_at desc) where removed_at is null;
create index if not exists posts_company_idx   on public.posts (company_id, published_at desc) where removed_at is null;
alter table public.posts enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='posts'
  loop execute format('drop policy %I on public.posts', p.policyname); end loop;
end $$;
create policy "public_read" on public.posts for select to anon, authenticated
  using (removed_at is null and exists (select 1 from public.companies c where c.id = company_id and c.status = 'published'));
create policy "admin_all" on public.posts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2) FOLLOWS (may already exist)
create table if not exists public.company_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), unique (user_id, company_id)
);
create index if not exists follows_user_idx on public.company_follows (user_id);
create index if not exists follows_company_idx on public.company_follows (company_id);
alter table public.company_follows enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='company_follows'
  loop execute format('drop policy %I on public.company_follows', p.policyname); end loop;
end $$;
create policy "own_select" on public.company_follows for select to authenticated using (user_id = auth.uid());
create policy "own_insert" on public.company_follows for insert to authenticated with check (user_id = auth.uid());
create policy "own_delete" on public.company_follows for delete to authenticated using (user_id = auth.uid());
create policy "admin_all"  on public.company_follows for all to authenticated using (public.is_admin()) with check (public.is_admin());
create or replace function public.company_follower_count(cid uuid) returns integer language sql stable security definer set search_path=public as $$ select count(*)::int from public.company_follows where company_id = cid; $$;
create or replace function public.am_following(cid uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists (select 1 from public.company_follows where company_id = cid and user_id = auth.uid()); $$;

-- 3) POST EVENTS (may already exist)
create table if not exists public.post_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('impression','open','save','unsave','dwell')),
  value integer, created_at timestamptz not null default now()
);
create index if not exists post_events_post_idx on public.post_events (post_id, kind);
alter table public.post_events enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='post_events'
  loop execute format('drop policy %I on public.post_events', p.policyname); end loop;
end $$;
create policy "own_insert" on public.post_events for insert to authenticated with check (user_id = auth.uid());
create policy "own_select" on public.post_events for select to authenticated using (user_id = auth.uid() or public.is_admin());
create or replace function public.post_engagement(pid uuid) returns integer language sql stable security definer set search_path=public as $$ select count(*)::int from public.post_events where post_id = pid and kind in ('open','save'); $$;

-- 4) NOTIFICATIONS + PREFS (fresh)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'new_release',
  company_id uuid references public.companies(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  title text not null, body text, deep_link text, read_at timestamptz,
  created_at timestamptz not null default now(), unique (user_id, post_id, kind)
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='notifications'
  loop execute format('drop policy %I on public.notifications', p.policyname); end loop;
end $$;
create policy "own_select" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "own_update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin_all"  on public.notifications for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.notification_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  channel text not null default 'in_app', min_materiality integer not null default 0,
  muted boolean not null default false, updated_at timestamptz not null default now()
);
create unique index if not exists notif_prefs_global_idx  on public.notification_prefs (user_id, channel) where company_id is null;
create unique index if not exists notif_prefs_company_idx on public.notification_prefs (user_id, company_id, channel) where company_id is not null;
alter table public.notification_prefs enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='notification_prefs'
  loop execute format('drop policy %I on public.notification_prefs', p.policyname); end loop;
end $$;
create policy "own_all" on public.notification_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5) FEED RPCs
create or replace function public.feed_following(p_limit integer default 20, p_before timestamptz default null)
returns setof public.posts language sql stable security definer set search_path=public as $$
  select po.* from public.posts po
   where po.removed_at is null
     and exists (select 1 from public.companies c where c.id = po.company_id and c.status = 'published')
     and exists (select 1 from public.company_follows f where f.company_id = po.company_id and f.user_id = auth.uid())
     and (p_before is null or po.published_at < p_before)
   order by po.published_at desc limit greatest(1, least(coalesce(p_limit,20),50));
$$;
create or replace function public.feed_latest(p_limit integer default 20, p_before timestamptz default null)
returns setof public.posts language sql stable security definer set search_path=public as $$
  select po.* from public.posts po
   where po.removed_at is null
     and exists (select 1 from public.companies c where c.id = po.company_id and c.status = 'published')
     and (p_before is null or po.published_at < p_before)
   order by po.published_at desc limit greatest(1, least(coalesce(p_limit,20),50));
$$;
-- Discover joins back to posts, so the returned rowtype always matches posts even
-- with legacy columns present. Deterministic score + per-company diversity cap that
-- relaxes when the live pool is small (low-volume fallback).
create or replace function public.feed_discover(p_limit integer default 20, p_offset integer default 0)
returns setof public.posts language sql stable security definer set search_path=public as $$
  with base as (
    select po.id, po.company_id, po.published_at,
      ( coalesce(po.materiality_score,0)*0.3
      + case when exists (select 1 from public.company_follows f where f.company_id=po.company_id and f.user_id=auth.uid()) then 8 else 0 end
      + least(public.post_engagement(po.id),20)*0.5
      - extract(epoch from (now()-po.published_at))/3600.0*0.05 ) as score
    from public.posts po
    where po.removed_at is null and exists (select 1 from public.companies c where c.id=po.company_id and c.status='published')
  ), ranked as (
    select b.*, row_number() over (partition by b.company_id order by b.score desc, b.published_at desc) as rn,
           (select count(*) from base) as total from base b
  )
  select p.* from public.posts p join ranked r on r.id = p.id
   where r.rn <= case when r.total <= 10 then 1000 else 2 end
   order by r.score desc, p.published_at desc
   limit greatest(1, least(coalesce(p_limit,20),50)) offset greatest(0, coalesce(p_offset,0));
$$;

-- 6) Listener subscriptions
insert into public.listener_subscriptions (listener, event_type) values
  ('feed_projection_v1','PUBLICATION_PUBLISHED'),
  ('feed_projection_v1','PUBLICATION_UNPUBLISHED'),
  ('in_app_notifications_v1','PUBLICATION_PUBLISHED')
on conflict (listener, event_type) do nothing;

commit;


-- ======== 0010_publish_lockdown.sql ========
-- 0010_publish_lockdown.sql — CHECKPOINT 6: close the direct client publish path.
--
-- Apply ONLY after a green production smoke test through /api/publish (done), and
-- re-run the smoke test afterward. Replaces the permissive 0005 "owner_all" policy
-- on publications with granular policies whose WITH CHECK forbids clients ever
-- writing status='published'. The publish_publication() RPC is SECURITY DEFINER and
-- bypasses RLS, so /api/publish remains the ONE publish path; everything else can
-- only touch drafts. Idempotent. Run in Supabase -> SQL Editor.

begin;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='publications'
  loop execute format('drop policy %I on public.publications', p.policyname); end loop;
end $$;

create policy "pub_select" on public.publications for select to authenticated
  using (public.can_touch_company(company_id));
create policy "pub_insert" on public.publications for insert to authenticated
  with check (public.can_touch_company(company_id) and status <> 'published');
create policy "pub_update" on public.publications for update to authenticated
  using (public.can_touch_company(company_id))
  with check (public.can_touch_company(company_id) and status <> 'published');
create policy "pub_delete" on public.publications for delete to authenticated
  using (public.can_touch_company(company_id));

commit;


-- ======== 0011_outbox_ops.sql ========
-- 0011_outbox_ops.sql — CHECKPOINT 12–13: scheduled drain + observability + reconciliation.
--
-- • Enables pg_cron + pg_net and schedules a once-per-minute POST to the protected
--   /api/dispatch (the guaranteed drain; best-effort invocation from /api/publish is
--   the accelerator). The dispatch secret is read at runtime from a locked table so
--   it never appears in the cron definition.
-- • outbox_health() — admin snapshot of queued/processing/dead + oldest pending.
-- • reconcile_outbox() — admin repair: reclaim stuck (expired-lease) deliveries,
--   replay dead ones, and report published-but-unprojected publications.
--
-- Run in Supabase -> SQL Editor. Idempotent. After running, the dispatch secret is
-- inserted separately (server-side) so it is never pasted here.

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Locked secret store: RLS on with NO policies → no client (anon/authenticated) can
-- read it; the service role and superuser (cron) bypass RLS.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='app_secrets'
  loop execute format('drop policy %I on public.app_secrets', p.policyname); end loop;
end $$;
-- (no policies → deny all to anon/authenticated)

-- ---- observability ----
create or replace function public.outbox_health()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('error', 'admin only'); end if;
  return jsonb_build_object(
    'events', (select count(*) from public.events),
    'deliveries_by_status', (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (select status, count(*) c from public.event_deliveries group by status) a),
    'by_listener', (select coalesce(jsonb_agg(jsonb_build_object('listener', listener, 'status', status, 'count', c) order by listener, status), '[]'::jsonb) from (select listener, status, count(*) c from public.event_deliveries group by listener, status) b),
    'dead', (select count(*) from public.event_deliveries where status = 'dead'),
    'stuck_processing', (select count(*) from public.event_deliveries where status = 'processing' and lease_expires_at < now()),
    'oldest_pending_seconds', (select coalesce(extract(epoch from (now() - min(next_attempt_at)))::int, 0) from public.event_deliveries where status in ('pending','failed')),
    'orphan_publications', (select count(*) from public.publications p where p.destination_id = 'passport' and p.status = 'published'
                             and not exists (select 1 from public.posts po where po.publication_id = p.id and po.removed_at is null))
  );
end $$;

-- ---- reconciliation (repair) ----
create or replace function public.reconcile_outbox()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_stuck int; v_dead int; v_orphans int;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  update public.event_deliveries
     set status = 'pending', locked_by = null, locked_at = null, lease_expires_at = null, next_attempt_at = now()
   where status = 'processing' and lease_expires_at < now();
  get diagnostics v_stuck = row_count;

  update public.event_deliveries
     set status = 'pending', next_attempt_at = now(), last_error = null
   where status = 'dead';
  get diagnostics v_dead = row_count;

  select count(*) into v_orphans from public.publications p
   where p.destination_id = 'passport' and p.status = 'published'
     and not exists (select 1 from public.posts po where po.publication_id = p.id and po.removed_at is null);

  return jsonb_build_object('reclaimed_stuck', v_stuck, 'replayed_dead', v_dead, 'orphan_publications', v_orphans);
end $$;

revoke execute on function public.outbox_health()    from public, anon;
revoke execute on function public.reconcile_outbox() from public, anon;

-- ---- scheduled drain (Supabase Cron → protected /api/dispatch) ----
-- Unschedule any prior job of the same name, then schedule every minute. The secret
-- is read from app_secrets at run time, so it is not stored in the job definition.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'outbox-drain') then
    perform cron.unschedule('outbox-drain');
  end if;
exception when others then null;
end $$;

select cron.schedule('outbox-drain', '* * * * *', $job$
  select net.http_post(
    url := 'https://passport-xi-five.vercel.app/api/dispatch',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-dispatch-secret', coalesce((select value from public.app_secrets where key = 'dispatch_secret'), '')
    )
  );
$job$);

commit;


-- ======== 0012_company_blueprints.sql ========
-- 0012_company_blueprints.sql
-- Two-Blueprint draft system — Phase 1 (ADDITIVE, non-destructive).
--
-- Adds ONE new table (`company_blueprints`) holding editable REVIEW drafts that sit in
-- front of the live company profile. Phase 1 does NOT compile Blueprint data back into
-- `companies.profile` — it is a safe, versioned workspace only.
--
-- SELF-CONTAINED: defines its own updated_at trigger and an RLS predicate that depends
-- ONLY on `public.is_admin()` (already used by the live `companies` RLS) and
-- `companies.owner_id`. No dependency on can_touch_company / touch_updated_at, so it
-- applies cleanly regardless of which earlier helper migrations are present.
--
-- Changes NO existing table, policy, function, or behaviour. Idempotent: safe to re-run.
-- Rollback: `drop table if exists public.company_blueprints cascade;
--            drop function if exists public.company_blueprints_set_updated_at();`

begin;

create table if not exists public.company_blueprints (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  blueprint_type   text not null check (blueprint_type in ('passport','conference')),
  template_key     text not null,
  template_version text not null,
  status           text not null default 'draft'
                   check (status in ('draft','in_review','approved','archived')),
  data             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id),
  updated_by       uuid references auth.users(id),
  unique (company_id, blueprint_type, template_version)
);

create index if not exists company_blueprints_company_idx on public.company_blueprints (company_id);
create index if not exists company_blueprints_type_idx    on public.company_blueprints (company_id, blueprint_type);

-- Own updated_at trigger (no dependency on public.touch_updated_at).
create or replace function public.company_blueprints_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists company_blueprints_touch on public.company_blueprints;
create trigger company_blueprints_touch before update on public.company_blueprints
  for each row execute function public.company_blueprints_set_updated_at();

-- ============================================================
-- RLS — authenticated owner or platform admin only. NO anon policy → anon is
-- default-denied, so Blueprint drafts are never publicly readable and never surface
-- through the public (published-only) company read path.
-- ============================================================
alter table public.company_blueprints enable row level security;

do $$
declare p record;
begin
  for p in (select policyname from pg_policies
            where schemaname='public' and tablename='company_blueprints')
  loop execute format('drop policy %I on public.company_blueprints', p.policyname); end loop;
end $$;

-- Predicate: platform admin OR the company's owner. Reused verbatim for read + write.
create policy "blueprint_owner_admin_read" on public.company_blueprints
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.companies c
               where c.id = company_blueprints.company_id and c.owner_id = auth.uid())
  );

create policy "blueprint_owner_admin_write" on public.company_blueprints
  for all to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.companies c
               where c.id = company_blueprints.company_id and c.owner_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.companies c
               where c.id = company_blueprints.company_id and c.owner_id = auth.uid())
  );

-- Nudge PostgREST to pick up the new table immediately.
notify pgrst, 'reload schema';

commit;


-- ======== 0013_profile_versions.sql ========
-- 0013_profile_versions.sql
-- Profile version history — a per-company safety net so any profile change is
-- recoverable (the "go back to how it was N hours/days ago" guarantee).
--
-- ADDITIVE / non-destructive: adds ONE new table (`company_profile_versions`) that
-- stores immutable timestamped snapshots of `companies.profile`. Nothing writes here
-- automatically at the DB level — the admin app snapshots the CURRENT profile into this
-- table immediately BEFORE it overwrites `companies.profile` (see src/lib/profileVersions.js),
-- and can restore any snapshot in one click.
--
-- Changes NO existing table, policy, function, or behaviour. Idempotent: safe to re-run.
-- RLS depends ONLY on public.is_admin() and companies.owner_id (same predicate shape as
-- 0012), so it applies cleanly regardless of which helper migrations are present.
--
-- Rollback: drop table if exists public.company_profile_versions cascade;
--           drop function if exists public.company_profile_versions_no_update();

begin;

create table if not exists public.company_profile_versions (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  slug         text not null,
  profile      jsonb not null,
  note         text,                       -- e.g. "before conference publish", "before restore"
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);

create index if not exists company_profile_versions_company_idx
  on public.company_profile_versions (company_id, created_at desc);

-- ============================================================
-- RLS — authenticated owner or platform admin only. NO anon policy → anon is
-- default-denied, so snapshots (which contain the full profile) are never public.
-- Snapshots are append-only history: INSERT + SELECT + DELETE (for pruning) are
-- allowed to owner/admin; UPDATE is denied so a snapshot can never be silently rewritten.
-- ============================================================
alter table public.company_profile_versions enable row level security;

do $$
declare p record;
begin
  for p in (select policyname from pg_policies
            where schemaname='public' and tablename='company_profile_versions')
  loop execute format('drop policy %I on public.company_profile_versions', p.policyname); end loop;
end $$;

-- Shared predicate: platform admin OR the company's owner.
create policy "profile_versions_read" on public.company_profile_versions
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.companies c
               where c.id = company_profile_versions.company_id and c.owner_id = auth.uid())
  );

create policy "profile_versions_insert" on public.company_profile_versions
  for insert to authenticated
  with check (
    public.is_admin()
    or exists (select 1 from public.companies c
               where c.id = company_profile_versions.company_id and c.owner_id = auth.uid())
  );

-- Pruning old snapshots (keep the most recent N) is a DELETE, allowed to owner/admin.
create policy "profile_versions_delete" on public.company_profile_versions
  for delete to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.companies c
               where c.id = company_profile_versions.company_id and c.owner_id = auth.uid())
  );

-- No UPDATE policy → snapshots are immutable once written.

commit;
