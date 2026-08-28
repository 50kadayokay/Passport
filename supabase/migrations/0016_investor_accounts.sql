-- ============================================================================
-- 0016_investor_accounts.sql — MineEx investor account system (Stage 1: schema).
--
-- Creates the user-owned tables that will back the investor account (profile,
-- preferences, company relationships, media likes/saves, notification prefs) and
-- extends account deletion to wipe them. Backend only — no UI, no data migration.
--
-- KEY DECISIONS (from the audit):
--   • The existing `public.profiles` table is client-WRITE-LOCKED for security
--     (migration 0004). We do NOT touch its structure or grants. Investor profile
--     data lives in its own `investor_profiles` table instead.
--   • Companies are identified by SLUG everywhere (matching messaging in 0014), so
--     relationships/likes/saves key on `company_slug` (text), not a company UUID.
--   • Every table is owned by the authenticated user: RLS restricts all access to
--     `auth.uid() = user_id`, and everything cascades when the auth user is deleted.
--   • Favourite and Watchlist are mutually exclusive — enforced by a CHECK.
--
-- This stage causes ZERO visible change in the app; nothing reads these tables yet.
-- ============================================================================

create extension if not exists pgcrypto;

-- Shared trigger to keep `updated_at` fresh on write.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 1) investor_profiles — the editable investor identity + onboarding flag.
--    Mirrors the fields the existing Investor Profile UI uses (name→display_name,
--    investorType→investor_type). NOT the locked-down `profiles` table.
-- ---------------------------------------------------------------------------
create table if not exists public.investor_profiles (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  display_name            text,
  website                 text,
  bio                     text,
  company                 text,
  industry                text,
  role                    text,
  location                text,
  investor_type           text,
  onboarding_completed    boolean     not null default false,
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2) investor_preferences — optional personalization signals (arrays of slugs/tags).
-- ---------------------------------------------------------------------------
create table if not exists public.investor_preferences (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  commodities   text[] not null default '{}',
  jurisdictions text[] not null default '{}',
  stages        text[] not null default '{}',
  interests     text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3) user_company_relationships — one row per (investor, company slug) carrying
--    following / favourite / watchlist. Favourite and Watchlist are mutually
--    exclusive (CHECK); one relationship row per pair (UNIQUE).
-- ---------------------------------------------------------------------------
create table if not exists public.user_company_relationships (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  company_slug          text not null,
  is_following          boolean not null default false,
  is_favourite          boolean not null default false,
  is_watchlist          boolean not null default false,
  notifications_enabled boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, company_slug),
  constraint fav_watch_mutually_exclusive check (not (is_favourite and is_watchlist))
);
create index if not exists idx_ucr_user on public.user_company_relationships (user_id);

-- ---------------------------------------------------------------------------
-- 4) post_likes / 5) post_saves — per-user media interactions. A "post" has no DB
--    id (posts live in company profile JSON), so it's identified by the existing
--    (company_slug, post_key) the client already computes. Composite PK = no dupes.
-- ---------------------------------------------------------------------------
create table if not exists public.post_likes (
  user_id      uuid not null references auth.users(id) on delete cascade,
  company_slug text not null,
  post_key     text not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, company_slug, post_key)
);

create table if not exists public.post_saves (
  user_id      uuid not null references auth.users(id) on delete cascade,
  company_slug text not null,
  post_key     text not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, company_slug, post_key)
);

-- ---------------------------------------------------------------------------
-- 6) notification_preferences — account-level toggles. Schema only; APNs/device
--    registration and delivery are NOT built here (that's a later stage).
-- ---------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id                     uuid primary key references auth.users(id) on delete cascade,
  push_enabled                boolean not null default true,
  followed_company_news       boolean not null default true,
  followed_company_results    boolean not null default true,
  followed_company_financings boolean not null default true,
  followed_company_media      boolean not null default true,
  favourite_priority          boolean not null default true,
  watchlist_alerts            boolean not null default true,
  mineex_recommendations      boolean not null default true,
  mineex_announcements        boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers (tables that have the column)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_touch_investor_profiles on public.investor_profiles;
create trigger trg_touch_investor_profiles before update on public.investor_profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_investor_preferences on public.investor_preferences;
create trigger trg_touch_investor_preferences before update on public.investor_preferences
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_ucr on public.user_company_relationships;
create trigger trg_touch_ucr before update on public.user_company_relationships
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_notification_prefs on public.notification_preferences;
create trigger trg_touch_notification_prefs before update on public.notification_preferences
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security — every table is private to its owner (auth.uid() = user_id).
-- anon is revoked outright; authenticated keeps Supabase's default grants but RLS
-- limits it to its own rows. No service-role logic is exposed to the client.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'investor_profiles','investor_preferences','user_company_relationships',
    'post_likes','post_saves','notification_preferences'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format('drop policy if exists %I_insert on public.%I;', t, t);
    execute format('drop policy if exists %I_update on public.%I;', t, t);
    execute format('drop policy if exists %I_delete on public.%I;', t, t);
    execute format('create policy %I_select on public.%I for select using (auth.uid() = user_id);', t, t);
    execute format('create policy %I_insert on public.%I for insert with check (auth.uid() = user_id);', t, t);
    execute format('create policy %I_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t, t);
    execute format('create policy %I_delete on public.%I for delete using (auth.uid() = user_id);', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Account deletion — extend the existing RPC to wipe every investor-owned table.
-- All tables cascade from auth.users anyway, but explicit deletes are clearer and
-- order-safe. Structure/grants of `profiles` are unchanged (we only DELETE a row).
-- ---------------------------------------------------------------------------
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from public.conversations               where investor_id = uid;  -- cascades messages
  delete from public.user_company_relationships  where user_id = uid;
  delete from public.post_likes                  where user_id = uid;
  delete from public.post_saves                  where user_id = uid;
  delete from public.investor_preferences        where user_id = uid;
  delete from public.notification_preferences    where user_id = uid;
  delete from public.investor_profiles           where user_id = uid;
  delete from public.profiles                    where id = uid;
  delete from auth.users                         where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
