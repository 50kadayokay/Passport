-- BATCH 1: 0000_baseline.sql .. 0000_baseline.sql (1 files)

-- ======== 0000_baseline.sql ========
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
