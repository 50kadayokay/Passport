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
