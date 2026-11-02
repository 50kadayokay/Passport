-- STAGING REPLAY part 1 of 5 — migrations 0000 to 0008
-- Run against the STAGING project only. Never production.
-- Stop at the first error and report it; do not skip ahead.


-- ==================== 0000_baseline.sql ====================
-- 0000_baseline.sql — the foundational objects the prototype created by hand.
--
-- WHY THIS EXISTS
-- ---------------
-- The migration set could not be replayed onto an empty database. Migrations
-- start at 0001, which opens by running `drop trigger ... on public.companies`
-- against a table nothing creates. Four tables, three functions and two triggers
-- were made directly in the Supabase dashboard during the prototype and never
-- captured, so the only database they could ever build was the one that already
-- existed.
--
-- Every definition below was copied from live catalog metadata
-- (supabase/audit/schema_snapshot_oneshot.sql), not reconstructed from
-- application code or inferred from a comment.
--
-- WHY 0000
-- --------
-- 0001 MODIFIES companies, so the baseline must precede it. Everything here uses
-- IF NOT EXISTS / CREATE OR REPLACE, so applying it to PRODUCTION is a verified
-- no-op -- production already has all of it. It is never needed there; it is what
-- makes every OTHER environment constructible.
--
-- WHAT IS DELIBERATELY NOT HERE
-- -----------------------------
-- Objects later migrations already create. In particular:
--   • companies' policies (auth_read / auth_insert / auth_update / admin_delete /
--     public_read_published) and its indexes -> 0001
--   • companies_touch, companies_sync_owner, trg_company_owner_guard -> 0001, 0006, 0031
--   • the four storage buckets and their policies -> 0002
--   • touch_updated_at() -> 0001
--   • profiles' write lockdown (revoke insert/update/delete) -> 0004
--   • the *_touch / *_immutable / *_no_truncate triggers that 0005, 0042 and 0043
--     generate with `execute format(...)`
-- Reproducing any of those here would make the baseline fight its own history.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 0 · EXTENSIONS
-- Live: plpgsql 1.0, pgcrypto 1.3, uuid-ossp 1.1, supabase_vault 0.3.1,
--       pg_stat_statements 1.11.
-- Only the two the schema actually depends on are created here. plpgsql is
-- always present; supabase_vault and pg_stat_statements are platform-managed and
-- a fresh project gets them without being asked.
--   • pgcrypto  -> gen_random_uuid() (companies.id, companies.preview_token)
--                  and digest() (sha256_hex)
--   • uuid-ossp -> present live; kept so a replay matches
-- ════════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";


-- ════════════════════════════════════════════════════════════════════════════
-- 1 · profiles
-- FIRST, because is_admin() reads it and almost every policy calls is_admin().
--
-- NOTE on the default: role defaults to 'company' and has NO check constraint.
-- That is reproduced exactly as live. It is not the value a self-signup gets --
-- handle_new_user() (0004, then 0023) inserts 'investor' explicitly -- but any
-- future INSERT that omits the column would land on 'company'. Reproduced, not
-- corrected: changing it is a separate, reviewed decision, and a baseline that
-- silently improves production is a baseline that no longer describes it.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.profiles (
  id         uuid not null,
  email      text,
  role       text default 'company'::text not null,
  created_at timestamp with time zone default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_pkey') then
    alter table public.profiles add constraint profiles_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey') then
    alter table public.profiles add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 2 · companies
-- The root of the ownership model: 21 migrations reference it, 16 declare a
-- foreign key to it.
--
-- `tier` and `managed_by_admin` are in the live shape because 0023 added them
-- with ALTER TABLE ... IF NOT EXISTS. Including them here is harmless (0023's
-- ALTER becomes the no-op instead) and omitting them would leave a replay
-- briefly inconsistent with the check constraint 0023 also adds.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.companies (
  id               uuid default gen_random_uuid() not null,
  slug             text not null,
  name             text not null,
  primary_ticker   text,
  status           text default 'draft'::text not null,
  profile          jsonb default '{}'::jsonb not null,
  created_at       timestamp with time zone default now() not null,
  updated_at       timestamp with time zone default now() not null,
  owner_id         uuid,
  preview_token    uuid default gen_random_uuid() not null,
  tier             text default 'listing'::text not null,
  managed_by_admin boolean default true not null
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'companies_pkey') then
    alter table public.companies add constraint companies_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'companies_slug_key') then
    alter table public.companies add constraint companies_slug_key unique (slug);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'companies_owner_id_fkey') then
    alter table public.companies add constraint companies_owner_id_fkey
      foreign key (owner_id) references auth.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'companies_status_check') then
    alter table public.companies add constraint companies_status_check
      check ((status = any (array['draft'::text, 'published'::text])));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'companies_tier_check') then
    alter table public.companies add constraint companies_tier_check
      check ((tier = any (array['listing'::text, 'free'::text, 'basic'::text, 'pro'::text])));
  end if;
end $$;

-- companies_owner_idx, companies_status_idx and companies_slug_key are created by
-- 0001. These two are NOT, and exist live:
create unique index if not exists companies_preview_token_key
  on public.companies using btree (preview_token);
create index if not exists idx_companies_profile_gin
  on public.companies using gin (profile);
create index if not exists idx_companies_status
  on public.companies using btree (status);


-- ════════════════════════════════════════════════════════════════════════════
-- 3 · contact_submissions, demo_bookings
-- Referenced only by 0058. Both use `generated always as identity`, so their
-- sequences (contact_submissions_id_seq, demo_bookings_id_seq -- dependency type
-- 'i', start 1, increment 1) come with the column and need no separate DDL.
--
-- These column lists REPLACE the ones api/_submissions.js had to infer from
-- client code. Reconcile that file against this.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.contact_submissions (
  id         bigint generated always as identity not null,
  name       text,
  email      text,
  company    text,
  message    text,
  created_at timestamp with time zone default now()
);

create table if not exists public.demo_bookings (
  id             bigint generated always as identity not null,
  company        text,
  name           text,
  email          text,
  phone          text,
  country        text,
  preferred_date text,
  preferred_time text,
  notes          text,
  created_at     timestamp with time zone default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contact_submissions_pkey') then
    alter table public.contact_submissions add constraint contact_submissions_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'demo_bookings_pkey') then
    alter table public.demo_bookings add constraint demo_bookings_pkey primary key (id);
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 4 · is_admin()
-- Copied verbatim from pg_get_functiondef. 59 references across 20 migrations,
-- no definition in any of them until now.
--
-- VERIFIED SAFE: it reads profiles.role for auth.uid() and nothing a client can
-- write. No JWT claim, no raw_user_meta_data, no request header. Combined with
-- 0004 (which revokes insert/update/delete on profiles from authenticated) and
-- 0023 (signup hardcodes 'investor'), there is no client path to role='admin' --
-- it is grantable only by direct database access.
--
-- The EXECUTE grant is left at the Supabase default, which is what production
-- has. Do NOT narrow it here: policies on conversations, messages,
-- mineiq_ingestions and release_revisions are scoped TO public, and an RLS
-- expression is evaluated as the QUERYING role -- so anon needs EXECUTE for
-- those policies to evaluate at all. Revoking it turns a clean "no rows" into
-- "permission denied for function", which is how 0056 nearly broke every inbox.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.is_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$function$;


-- ════════════════════════════════════════════════════════════════════════════
-- 5 · set_updated_at()
-- Unversioned. Functionally identical to touch_updated_at() (0001); both exist
-- live and companies carries a trigger for each. Reproduced rather than merged,
-- because de-duplicating them changes production behaviour and belongs in its
-- own reviewed migration.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $function$
begin new.updated_at = now(); return new; end
$function$;


-- ════════════════════════════════════════════════════════════════════════════
-- 6 · rls_auto_enable()
-- THE MOST IMPORTANT THING IN THIS FILE, and it was invisible until now.
--
-- This is an EVENT TRIGGER function. It fires on CREATE TABLE in `public` and
-- enables row-level security automatically. It is why all 62 live tables have
-- RLS on, including ones no migration ever enabled it for -- the safety net
-- nobody wrote down.
--
-- A fresh project without it would create tables with RLS OFF. Every migration
-- that relies on the net rather than its own `alter table ... enable row level
-- security` would leave an open table, and the isolation suite would be testing
-- a database materially less safe than production.
--
-- Copied verbatim. The event trigger that WIRES it is in section 7.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;


-- ════════════════════════════════════════════════════════════════════════════
-- 7 · ensure_rls — THE EVENT TRIGGER THAT WIRES rls_auto_enable
--
-- Live definition, from pg_event_trigger:
--   name ensure_rls · event ddl_command_end · owner postgres · enabled O
--   tags ["CREATE TABLE","CREATE TABLE AS","SELECT INTO"]
--
-- This is the single most load-bearing object in this file. Without it the
-- function in section 6 is inert, a fresh project creates tables with RLS OFF,
-- and the tenant-isolation suite would be proving things about a database
-- materially less safe than production.
--
-- The other six live event triggers (pgrst_ddl_watch, pgrst_drop_watch,
-- issue_graphql_placeholder, issue_pg_cron_access, issue_pg_graphql_access,
-- issue_pg_net_access) are all owned by supabase_admin -- platform-managed, and
-- a fresh Supabase project gets them without being asked. Only ensure_rls is
-- owned by postgres, i.e. project-level, so it is the only one to reproduce.
--
-- CREATE EVENT TRIGGER has no IF NOT EXISTS, hence the guard. It is also a
-- privileged operation: run this migration as the SQL-editor role (postgres),
-- not through a pooled connection as a lesser role, or this section fails while
-- everything above it succeeds -- which would leave the net silently missing.
-- ════════════════════════════════════════════════════════════════════════════
do $$ begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 8 · TRIGGERS
--
-- The auth.users trigger that fires handle_new_user() is NOT here, deliberately.
-- An earlier draft of this file tried, guarded by `if the function exists`, and
-- that guard was wrong in a way worth recording: on a fresh database the
-- function does not exist at 0000, so the guard skips -- and 0004 creates the
-- FUNCTION but never the TRIGGER. The trigger would simply never be created,
-- which is the precise failure the guard was meant to prevent.
--
-- It cannot live here either way: handle_new_user() is defined by 0004 and
-- redefined by 0023, so a trigger created at 0000 would be a forward reference.
-- It lives in 0059_auth_user_trigger.sql, after 0023.
-- ════════════════════════════════════════════════════════════════════════════

-- companies' second updated_at trigger. companies_touch (touch_updated_at) is
-- created by 0001; this one is unversioned and also live.
drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- 9 · RLS AND POLICIES on the four tables
-- Only the policies no migration creates. companies' five policies come from
-- 0001 and are deliberately absent here.
--
-- RLS is enabled EXPLICITLY even though section 7 installs the ensure_rls net.
-- That is not redundant: the four tables are created in sections 1-3, BEFORE the
-- event trigger exists, so the net never fires for them. Every table created by
-- a later migration is covered automatically; these four have to say it
-- themselves. Deleting these four lines on the grounds that "the net handles it"
-- would leave the four most sensitive tables in the schema with RLS off.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.profiles            enable row level security;
alter table public.companies           enable row level security;
alter table public.contact_submissions enable row level security;
alter table public.demo_bookings       enable row level security;

-- profiles: read your own row, or anything if you are staff. 0004 refers to this
-- policy as already existing, which is exactly why it had to be captured.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated
  using ((id = auth.uid()) or public.is_admin());

-- The two public forms. Reproduced AS LIVE, including `with check (true)`.
-- 0058 is what closes that; a baseline that pre-empted it would make staging
-- safer than production and invalidate the comparison.
drop policy if exists anon_insert_contact on public.contact_submissions;
create policy anon_insert_contact on public.contact_submissions
  for insert to anon with check (true);

drop policy if exists admin_read_contact on public.contact_submissions;
create policy admin_read_contact on public.contact_submissions
  for select to authenticated using (public.is_admin());

drop policy if exists anon_insert_demo on public.demo_bookings;
create policy anon_insert_demo on public.demo_bookings
  for insert to anon with check (true);

drop policy if exists admin_read_demo on public.demo_bookings;
create policy admin_read_demo on public.demo_bookings
  for select to authenticated using (public.is_admin());


-- ════════════════════════════════════════════════════════════════════════════
-- 10 · GRANTS
-- Reproduced exactly as production, anon over-grant included. That is
-- deliberate and was explicitly approved: staging exists to reproduce
-- production's behaviour, and privilege cleanup is a separate, reviewed
-- migration applied to both.
--
-- In practice Supabase's ALTER DEFAULT PRIVILEGES already grants
-- anon/authenticated/service_role everything on each new table in `public` (two
-- entries, granted by `postgres` AND by `supabase_admin`), so these statements
-- are mostly belt-and-braces. They are stated anyway so the file describes the
-- end state rather than depending on a platform default that could change.
--
-- profiles is the exception and is NOT granted to anon -- matching live, where
-- anon holds nothing on it and authenticated holds only REFERENCES, SELECT,
-- TRIGGER. 0004 performs those revokes; this leaves the default in place so
-- 0004 still has something to revoke.
-- ════════════════════════════════════════════════════════════════════════════
grant select, insert, update, delete, truncate, references, trigger
  on public.companies, public.contact_submissions, public.demo_bookings
  to anon, authenticated;

-- profiles: granted to authenticated EXPLICITLY rather than left to Supabase's
-- default privileges. Live shows authenticated holding REFERENCES, SELECT,
-- TRIGGER on it -- which is precisely what remains after 0004 revokes INSERT,
-- UPDATE, DELETE and TRUNCATE. For 0004's revoke to produce that end state,
-- authenticated has to hold them first. Relying on the platform default would
-- make this file's correctness depend on a Supabase behaviour that could change.
grant select, insert, update, delete, truncate, references, trigger
  on public.profiles to authenticated;

grant select, insert, update, delete, truncate, references, trigger
  on public.profiles, public.companies, public.contact_submissions, public.demo_bookings
  to service_role;

commit;

-- ──────────────────────────────────────────────────────────── verification ──
-- On a FRESH project, after replaying the whole set:
--
--   -- 1. the five formerly-missing objects exist
--   select 'table' as kind, relname::text as name from pg_class
--    where relnamespace = 'public'::regnamespace and relkind = 'r'
--      and relname in ('companies','profiles','contact_submissions','demo_bookings')
--   union all
--   select 'function', proname::text from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('is_admin','set_updated_at','rls_auto_enable');
--   -- expect 7 rows
--
--   -- 2. the auth trigger fires (THE one that is easy to miss)
--   select tgname from pg_trigger where tgname = 'on_auth_user_created';
--
--   -- 3. the RLS safety net is wired
--   select evtname, evtevent, evtenabled from pg_event_trigger;
--
--   -- 4. the net actually works
--   create table public.zz_rls_probe (id int);
--   select relrowsecurity from pg_class where relname = 'zz_rls_probe';  -- expect t
--   drop table public.zz_rls_probe;
--
-- On PRODUCTION this migration must change NOTHING. Confirm before applying:
--   every create is IF NOT EXISTS / OR REPLACE, every constraint is guarded by a
--   pg_constraint existence check, and every policy is drop-then-create with the
--   live definition. It is recorded as applied for provenance, not for effect.

-- ==================== 0001_security_lockdown.sql ====================
-- 0001_security_lockdown.sql
-- Milestone 1 — Security Lockdown & RLS Hardening
--
-- Makes `companies` safe to expose publicly:
--   • anon (public) can read ONLY published companies
--   • writes require an authenticated session; owners touch only their own row
--   • admins (is_admin()) can read/write/delete anything
--   • removes the permissive prototype anon-write policies
-- Also adds indexes + an updated_at auto-touch trigger.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

-- ---------- updated_at auto-touch ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists companies_touch on public.companies;
create trigger companies_touch before update on public.companies
  for each row execute function public.touch_updated_at();

-- ---------- indexes ----------
create index if not exists companies_owner_idx  on public.companies (owner_id);
create index if not exists companies_status_idx on public.companies (status);
create unique index if not exists companies_slug_key on public.companies (slug);

-- ---------- reset ALL companies policies to the locked-down set ----------
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'companies'
  loop execute format('drop policy %I on public.companies', p.policyname); end loop;
end $$;

alter table public.companies enable row level security;

-- public / anon: read ONLY published companies
create policy "public_read_published" on public.companies
  for select to anon
  using (status = 'published');

-- authenticated: own rows (any status) + published + admin sees all
create policy "auth_read" on public.companies
  for select to authenticated
  using (owner_id = auth.uid() or status = 'published' or public.is_admin());

-- authenticated: create only a row you own (or admin)
create policy "auth_insert" on public.companies
  for insert to authenticated
  with check (owner_id = auth.uid() or public.is_admin());

-- authenticated: update only your own row (or admin)
create policy "auth_update" on public.companies
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

-- admin-only delete
create policy "admin_delete" on public.companies
  for delete to authenticated
  using (public.is_admin());

-- ==================== 0002_storage.sql ====================
-- 0002_storage.sql
-- Milestone 2 — Asset Storage
--
-- Buckets for company assets + RLS so authenticated users can only write into
-- their own folder (path = "${uid}/..."). Media + logos are publicly readable
-- (they render in the app); docs are private (for AI onboarding later).
--
-- Run in Supabase → SQL Editor. Idempotent.

insert into storage.buckets (id, name, public) values
  ('company-media', 'company-media', true),
  ('company-logos', 'company-logos', true),
  ('company-docs',  'company-docs',  false)
on conflict (id) do nothing;

-- reset any prior policies for these buckets
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects'
           and policyname in ('pp_public_read','pp_auth_read','pp_upload_own','pp_update_own','pp_delete_own')
  loop execute format('drop policy %I on storage.objects', p.policyname); end loop;
end $$;

-- public read for media + logos (rendered in the app)
create policy "pp_public_read" on storage.objects for select to anon
  using (bucket_id in ('company-media','company-logos'));

-- authenticated can read all three (incl. private docs)
create policy "pp_auth_read" on storage.objects for select to authenticated
  using (bucket_id in ('company-media','company-logos','company-docs'));

-- writes: only into your own top-level folder (first path segment = your uid)
create policy "pp_upload_own" on storage.objects for insert to authenticated
  with check (bucket_id in ('company-media','company-logos','company-docs')
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pp_update_own" on storage.objects for update to authenticated
  using (bucket_id in ('company-media','company-logos','company-docs')
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pp_delete_own" on storage.objects for delete to authenticated
  using (bucket_id in ('company-media','company-logos','company-docs')
         and (storage.foldername(name))[1] = auth.uid()::text);

-- ==================== 0003_preview_links.sql ====================
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

-- ==================== 0004_harden_signup_role.sql ====================
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

-- ==================== 0005_comms_foundation.sql ====================
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

-- ==================== 0006_portal_foundation.sql ====================
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

-- ==================== 0007_company_invitations.sql ====================
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

-- ==================== 0008_publish_spine.sql ====================
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
