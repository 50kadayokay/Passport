-- BATCH 4: 0014_messaging.sql .. 0023_account_types.sql (10 files)

-- ======== 0014_messaging.sql ========
-- ============================================================================
-- 0014_messaging.sql — Investor ↔ Company messaging (CEO email bridge).
--
-- The investor sees a normal in-app chat with "the company". Under the hood:
--   • investor sends  → row in `messages` (sender='investor') + an email to the
--                       company's CEO (done by /api/messages-send).
--   • CEO replies to that email → the inbound webhook (/api/messages-inbound)
--     inserts a row (sender='company') via the SERVICE ROLE, so it appears in
--     the investor's thread.
--
-- An investor may only ever hold a conversation with a COMPANY (one per company).
-- `ceo_email` is resolved server-side from the company's profile — never trusted
-- from the client — so the app can't be used to email arbitrary addresses.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  investor_id     uuid not null references auth.users(id) on delete cascade,
  company_slug    text not null,
  company_name    text,
  ceo_email       text,                                   -- delivery target (server-set)
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (investor_id, company_slug)                      -- one thread per (investor, company)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender          text not null check (sender in ('investor','company')),
  body            text not null,
  email_id        text,                                   -- provider msg id (inbound dedupe)
  created_at      timestamptz not null default now()
);

create index if not exists idx_messages_conv     on public.messages(conversation_id, created_at);
create index if not exists idx_conv_investor      on public.conversations(investor_id, last_message_at desc);
create unique index if not exists uq_messages_email on public.messages(email_id) where email_id is not null;

alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- Investors see & create only their own conversations. (Company-side inserts and
-- ceo_email are done by the service role in the serverless functions, which
-- bypasses RLS — so nothing sensitive is writable from the browser.)
drop policy if exists conv_select on public.conversations;
create policy conv_select on public.conversations for select using (auth.uid() = investor_id);

drop policy if exists msg_select on public.messages;
create policy msg_select on public.messages for select using (
  exists (select 1 from public.conversations c
          where c.id = conversation_id and c.investor_id = auth.uid())
);

-- Keep last_message_at fresh so the conversation list sorts by recency.
create or replace function public.bump_conversation() returns trigger
language plpgsql security definer as $$
begin
  update public.conversations set last_message_at = now() where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists trg_bump_conversation on public.messages;
create trigger trg_bump_conversation after insert on public.messages
  for each row execute function public.bump_conversation();

-- (The investor's open thread refreshes by short-interval polling — no realtime
-- publication needed, so this migration stays safely re-runnable.)


-- ======== 0015_account_deletion.sql ========
-- ============================================================================
-- 0015_account_deletion.sql — self-service account deletion (Apple Guideline
-- 5.1.1(v): an app with account creation must let the user delete their account
-- and data from inside the app).
--
-- `delete_own_account()` runs as its owner (SECURITY DEFINER) so it can remove the
-- caller's auth identity, but it only ever touches auth.uid() — a signed-in user
-- can delete ONLY themselves. The app calls it via /rest/v1/rpc with the user JWT.
-- ============================================================================

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
  -- App data first (conversations cascade to messages). Explicit deletes so this
  -- works even where a foreign key lacks ON DELETE CASCADE.
  delete from public.conversations where investor_id = uid;
  delete from public.profiles      where id = uid;
  -- Then the auth identity itself.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;


-- ======== 0016_investor_accounts.sql ========
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


-- ======== 0017_listing_reports.sql ========
-- ============================================================================
-- 0017_listing_reports.sql — corrections & claim requests for basic company listings.
--
-- Auto-generated "community listing" pages carry legal risk if a fact is wrong. This
-- table is the correction/takedown + claim-lead mechanism: anyone (signed in or not)
-- can SUBMIT a report ("this is wrong") or a claim ("this is my company"). Nobody can
-- READ the table via the client — the operator reviews rows with the service role in
-- the Supabase dashboard. Insert-only-for-the-public is the safe shape.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.listing_reports (
  company_slug text not null,
  company_name text,
  kind         text not null default 'error',   -- 'error' (correction) | 'claim'
  message      text,
  contact      text,                              -- optional email/phone the submitter leaves
  user_id      uuid,                              -- set when a signed-in investor submits
  created_at   timestamptz not null default now(),
  id           uuid primary key default gen_random_uuid()
);
create index if not exists idx_listing_reports_slug on public.listing_reports (company_slug);

alter table public.listing_reports enable row level security;

-- The public may INSERT (submit) but never SELECT/UPDATE/DELETE. No select policy exists,
-- so RLS denies all reads to anon/authenticated; only the service role (dashboard) reads.
revoke all on public.listing_reports from anon, authenticated;
grant insert on public.listing_reports to anon, authenticated;

drop policy if exists listing_reports_insert on public.listing_reports;
create policy listing_reports_insert on public.listing_reports
  for insert to anon, authenticated with check (true);


-- ======== 0018_news_foundation.sql ========
-- ============================================================================
-- 0018_news_foundation.sql — isolated foundation for the automated news system.
--
-- Stage 0 (schema) + support for Stage 1 (ingestion). REVIEW-FIRST: nothing is
-- publicly readable until an item is explicitly status='live' AND review_state
-- ='approved' — which the pipeline never does automatically. Completely isolated
-- from the publish/feed spine (posts / publications / events); dropping these
-- three tables fully removes the system.
--
-- Apply in the Supabase SQL editor / migration runner. No cron, no AI, no
-- client integration are created here.
-- ============================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) news_sources — the source registry. `adapter` + `terms_*` columns let us
--    swap a source to an official media/feed arrangement later WITHOUT any app
--    change. Sources start disabled; the operator flips `enabled` on.
-- ---------------------------------------------------------------------------
create table if not exists public.news_sources (
  id                   uuid primary key default gen_random_uuid(),
  key                  text not null unique,                 -- 'mining_com' | 'northern_miner' | 'globenewswire_mining'
  name                 text not null,                        -- display name / attribution label
  publisher_type       text not null default 'editorial'
                         check (publisher_type in ('editorial','wire','regulatory')),
  adapter              text not null default 'rss'
                         check (adapter in ('rss','api')),    -- fetch method; official arrangement later = 'api'
  feed_url             text,
  homepage_url         text,
  enabled              boolean not null default false,       -- OFF until the operator turns it on
  fetch_via            text not null default 'direct'
                         check (fetch_via in ('direct','proxy')), -- WAF-blocked sources need 'proxy'
  store_full_text      boolean not null default false,       -- editorial = never store the article body
  allow_source_image   boolean not null default false,       -- OFF until image rights confirmed → MineEx fallback used
  attribution_required boolean not null default true,
  terms_url            text,
  terms_note           text,
  -- polling cursor / health
  etag                 text,
  last_modified        text,
  last_fetched_at      timestamptz,
  last_status          text,
  last_error           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2) news_items — one row per ingested article. NO full-text column by design.
--    Dedup: canonical URL hash first, then normalized-title hash as fallback.
-- ---------------------------------------------------------------------------
create table if not exists public.news_items (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references public.news_sources(id) on delete cascade,
  -- links + dedup
  url            text not null,                 -- the raw item link
  canonical_url  text not null,                 -- normalized: tracking params + fragment stripped; rel=canonical preferred when available
  url_hash       text not null,                 -- sha256(canonical_url) — PRIMARY dedup key
  content_hash   text,                          -- sha256(normalized title) — SECONDARY dedup (windowed)
  guid           text,                          -- feed <guid> if present
  -- metadata (classification/summarization inputs; NOT displayed verbatim)
  title          text not null,
  description    text,                          -- publisher excerpt: summarization INPUT only, never surfaced verbatim
  image_url      text,                          -- SOURCE image URL reference only (never downloaded/rehosted)
  author         text,
  categories     text[] not null default '{}',
  published_at   timestamptz,
  -- MineEx-authored output (populated by later stages; nothing auto now)
  mineex_summary text,
  -- lifecycle (review-first)
  status         text not null default 'ingested'
                   check (status in ('ingested','classified','summarized','review','live','rejected')),
  review_state   text not null default 'pending'
                   check (review_state in ('pending','approved','rejected')),
  ingested_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (source_id, url_hash)                  -- idempotent re-polls (DB backstop)
);
create index if not exists news_items_url_hash_idx   on public.news_items (url_hash);
create index if not exists news_items_content_idx    on public.news_items (content_hash, ingested_at desc);
create index if not exists news_items_published_idx  on public.news_items (published_at desc);
create index if not exists news_items_status_idx     on public.news_items (status, review_state);
create index if not exists news_items_source_idx     on public.news_items (source_id, ingested_at desc);

-- ---------------------------------------------------------------------------
-- 3) news_item_companies — link an item to MineEx companies. company_id is the
--    canonical FK to the existing companies table; company_slug is optional
--    denormalized metadata only. Populated by a later classification stage.
-- ---------------------------------------------------------------------------
create table if not exists public.news_item_companies (
  news_item_id uuid not null references public.news_items(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  company_slug text,                              -- optional denormalized convenience only (NOT the relationship key)
  confidence   real,
  method       text,                              -- 'ticker' | 'name' | 'manual'
  created_at   timestamptz not null default now(),
  primary key (news_item_id, company_id)
);
create index if not exists news_item_companies_company_idx on public.news_item_companies (company_id);

-- touch triggers (reuse the shared function from 0001)
drop trigger if exists trg_touch_news_sources on public.news_sources;
create trigger trg_touch_news_sources before update on public.news_sources
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_news_items on public.news_items;
create trigger trg_touch_news_items before update on public.news_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — service role bypasses RLS (all writes happen there via the ingestion
-- endpoint). Config + review queue are admin-read only. The public may read
-- ONLY items that are live AND approved (none exist under review-first).
-- NOTE: a column-limited public VIEW (title + mineex_summary + attribution +
-- link, never the publisher excerpt) is a later DISPLAY-stage concern.
-- ---------------------------------------------------------------------------
alter table public.news_sources        enable row level security;
alter table public.news_items          enable row level security;
alter table public.news_item_companies enable row level security;

revoke all on public.news_sources, public.news_items, public.news_item_companies from anon, authenticated;
grant select on public.news_sources        to authenticated;             -- gated to admins by policy
grant select on public.news_items          to anon, authenticated;       -- gated to live+approved by policy
grant select on public.news_item_companies to anon, authenticated;       -- gated via parent item

drop policy if exists news_sources_admin_read on public.news_sources;
create policy news_sources_admin_read on public.news_sources
  for select to authenticated using (public.is_admin());

drop policy if exists news_items_admin_read on public.news_items;
create policy news_items_admin_read on public.news_items
  for select to authenticated using (public.is_admin());

drop policy if exists news_items_public_read on public.news_items;
create policy news_items_public_read on public.news_items
  for select to anon, authenticated
  using (status = 'live' and review_state = 'approved');

drop policy if exists news_item_companies_admin_read on public.news_item_companies;
create policy news_item_companies_admin_read on public.news_item_companies
  for select to authenticated using (public.is_admin());

drop policy if exists news_item_companies_public_read on public.news_item_companies;
create policy news_item_companies_public_read on public.news_item_companies
  for select to anon, authenticated
  using (exists (
    select 1 from public.news_items ni
    where ni.id = news_item_id and ni.status = 'live' and ni.review_state = 'approved'
  ));

-- ---------------------------------------------------------------------------
-- Seed sources.
--   • Mining.com + Northern Miner: editorial, RSS, DIRECT-fetchable, ENABLED.
--     Store metadata only (no full text), images OFF (fallback) until rights.
--   • GlobeNewswire — Mining: wire, DISABLED — exact Mining feed URL + fetch
--     path pending (blocks server IPs). Registry is adapter-swappable so we can
--     switch to an official arrangement without touching the app.
-- ---------------------------------------------------------------------------
insert into public.news_sources
  (key, name, publisher_type, adapter, feed_url, homepage_url, enabled, fetch_via, store_full_text, allow_source_image, attribution_required, terms_note)
values
  ('mining_com', 'Mining.com', 'editorial', 'rss',
   'https://www.mining.com/feed/', 'https://www.mining.com/', true, 'direct', false, false, true,
   'Headline + MineEx summary + attribution + outbound link only. No full-text republish; image rights unconfirmed → fallback.'),
  ('northern_miner', 'The Northern Miner', 'editorial', 'rss',
   'https://www.northernminer.com/feed/', 'https://www.northernminer.com/', true, 'direct', false, false, true,
   'Headline + MineEx summary + attribution + outbound link only. No image in feed; og:image rights unconfirmed → fallback.'),
  ('globenewswire_mining', 'GlobeNewswire — Mining', 'wire', 'rss',
   null, 'https://www.globenewswire.com/', false, 'proxy', false, false, true,
   'Exact Mining feed URL + fetch path pending (blocks server IPs). Preserve original release link. Adapter-swappable to an official arrangement.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Endpoint secret: the ingestion endpoint (/api/news-pull) checks the Vercel env
-- var NEWS_PULL_SECRET (set it in the Vercel dashboard). No cron is created here
-- — the endpoint runs only when called manually until you choose to schedule it.
-- ---------------------------------------------------------------------------


-- ======== 0019_news_ai.sql ========
-- ============================================================================
-- 0019_news_ai.sql — AI-processing output columns for news_items (Stage 2/3).
--
-- Additive only. Populated by /api/news-process (relevance, extraction, company
-- linking, MineEx summary, fact-check, clustering). Still REVIEW-FIRST: processed
-- items move to status='review' (relevant) or status='rejected' (noise) — NEVER
-- 'live'. Nothing becomes public. Company links use the existing
-- news_item_companies table (company_id FK).
-- ============================================================================
alter table public.news_items add column if not exists relevant         boolean;
alter table public.news_items add column if not exists reject_reason     text;
alter table public.news_items add column if not exists commodities       text[] not null default '{}';
alter table public.news_items add column if not exists jurisdictions     text[] not null default '{}';
alter table public.news_items add column if not exists event_type        text;
alter table public.news_items add column if not exists stage             text;
alter table public.news_items add column if not exists materiality_score integer;
alter table public.news_items add column if not exists materiality_label text;
alter table public.news_items add column if not exists facts             jsonb not null default '{}'::jsonb;  -- ticker/project/numbers/dates/financing/grades/resources
alter table public.news_items add column if not exists fact_check        jsonb not null default '{}'::jsonb;  -- {verdict, confidence, notes, flagged[]}
alter table public.news_items add column if not exists cluster_key       text;                                 -- same-story grouping
alter table public.news_items add column if not exists is_canonical      boolean not null default false;       -- the representative item of a cluster
alter table public.news_items add column if not exists processed_at      timestamptz;
alter table public.news_items add column if not exists ai_model          text;

create index if not exists news_items_cluster_idx    on public.news_items (cluster_key);
create index if not exists news_items_relevant_idx   on public.news_items (relevant, materiality_score desc);


-- ======== 0020_news_public_view.sql ========
-- ============================================================================
-- 0020_news_public_view.sql — the SAFE public projection for approved news.
--
-- The investor app reads news ONLY through this column-limited view, never the
-- raw news_items table. It exposes only display-safe fields (headline, MineEx
-- summary, source attribution, outbound link, commodity/jurisdiction, optional
-- image) for items that are live + approved + canonical (one card per story).
-- It NEVER exposes the publisher excerpt, internal facts, fact-check notes, or any
-- unapproved/duplicate row. Images appear only when the source allows it.
-- (security_invoker = false → the view runs with owner rights and returns exactly
--  these columns/rows, regardless of the underlying-table RLS.)
-- ============================================================================
create or replace view public.news_public
with (security_invoker = false) as
select
  ni.id,
  ni.title,
  ni.mineex_summary,
  ni.event_type,
  ni.commodities,
  ni.jurisdictions,
  ni.materiality_score,
  ni.materiality_label,
  ni.canonical_url,
  case when s.allow_source_image then ni.image_url else null end as image_url,
  ni.published_at,
  ni.cluster_key,
  s.key           as source_key,
  s.name          as source_name,
  s.homepage_url  as source_url,
  c.company_id,
  c.company_slug
from public.news_items ni
join public.news_sources s on s.id = ni.source_id
left join lateral (
  select company_id, company_slug
  from public.news_item_companies nc
  where nc.news_item_id = ni.id
  order by confidence desc nulls last
  limit 1
) c on true
where ni.status = 'live'
  and ni.review_state = 'approved'
  and ni.is_canonical = true;

grant select on public.news_public to anon, authenticated;


-- ======== 0021_news_ai_sections.sql ========
-- ============================================================================
-- 0021_news_ai_sections.sql — structured reading sections for the MineEx reader.
--
-- Phase 8. The AI now emits FOUR separate display sections instead of a single
-- summary blob, plus an INTERNAL provenance trail:
--   * mineex_summary            (already exists) — what was announced
--   * plain_english_explanation — "What does this mean?" (explains only the
--                                 technical terms that appear in THIS item)
--   * context                   — where it fits / what's next (SOURCE-ONLY)
--   * key_numbers               — the material figures as separate compact entries
--   * provenance                — INTERNAL evidence map (field → source quote);
--                                 never exposed to the public view.
--
-- The public view is DROPPED + recreated (not create-or-replace) so the three
-- new display columns can be projected in a sensible order.
-- ============================================================================

alter table public.news_items
  add column if not exists plain_english_explanation text,
  add column if not exists context                   text,
  add column if not exists key_numbers               jsonb not null default '[]'::jsonb,
  add column if not exists provenance                jsonb not null default '[]'::jsonb;

-- Recreate the safe public projection to expose the new display sections.
-- provenance is deliberately OMITTED — internal evidence only, never public.
drop view if exists public.news_public;

create view public.news_public
with (security_invoker = false) as
select
  ni.id,
  ni.title,
  ni.mineex_summary,
  ni.plain_english_explanation,
  ni.context,
  ni.key_numbers,
  ni.event_type,
  ni.commodities,
  ni.jurisdictions,
  ni.materiality_score,
  ni.materiality_label,
  ni.canonical_url,
  case when s.allow_source_image then ni.image_url else null end as image_url,
  ni.published_at,
  ni.cluster_key,
  s.key           as source_key,
  s.name          as source_name,
  s.publisher_type,
  s.homepage_url  as source_url,
  c.company_id,
  c.company_slug
from public.news_items ni
join public.news_sources s on s.id = ni.source_id
left join lateral (
  select company_id, company_slug
  from public.news_item_companies nc
  where nc.news_item_id = ni.id
  order by confidence desc nulls last
  limit 1
) c on true
where ni.status = 'live'
  and ni.review_state = 'approved'
  and ni.is_canonical = true;

grant select on public.news_public to anon, authenticated;


-- ======== 0022_news_ai_usage.sql ========
-- ============================================================================
-- 0022_news_ai_usage.sql — AI cost safeguards: usage ledger + reprocess guards.
--
-- Adds:
--   1) news_ai_usage — one row per Anthropic call, recording ACTUAL token usage
--      returned by the API (input/output/cache) plus computed cost. This is the
--      source of truth for the daily spend ceiling and the admin usage panel.
--   2) news_items.processing_version — the prompt/pipeline version that last
--      SUCCESSFULLY processed the item. Used to skip already-completed items so
--      we never silently re-bill for regenerating them.
--   3) news_items.retry_count / last_error — bounded retries: a failing item is
--      counted and skipped once it hits the cap, so no loop can keep paying to
--      retry the same broken item.
-- Admin-read via the existing public.is_admin(); writes are service-role only.
-- ============================================================================

alter table public.news_items
  add column if not exists processing_version text,
  add column if not exists retry_count        integer not null default 0,
  add column if not exists last_error          text;

create table if not exists public.news_ai_usage (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  news_item_id       uuid references public.news_items(id) on delete set null,
  operation          text not null,            -- e.g. 'news-process', 'news-reprocess'
  model              text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd           numeric(12,6) not null default 0,
  cost_is_actual     boolean not null default false,  -- true = derived from API-returned usage
  processing_version text
);

create index if not exists news_ai_usage_created_idx on public.news_ai_usage (created_at desc);
create index if not exists news_ai_usage_item_idx    on public.news_ai_usage (news_item_id);

alter table public.news_ai_usage enable row level security;

-- Admins can read the ledger; nobody else can. Service role bypasses RLS for writes.
drop policy if exists news_ai_usage_admin_read on public.news_ai_usage;
create policy news_ai_usage_admin_read on public.news_ai_usage
  for select to authenticated using (public.is_admin());

grant select on public.news_ai_usage to authenticated;  -- gated to admins by policy


-- ======== 0023_account_types.sql ========
-- ============================================================================
-- 0023_account_types.sql — investor-only signup + company account tiers.
--
-- (1) HARDEN SIGNUP: every self-signup becomes 'investor', full stop. Company
--     accounts are provisioned by a platform admin (concierge), never by signup.
--     (0004 still allowed a crafted signup to self-assign 'company' — closed here.)
-- (2) TIERS: companies get a tier (listing/free/basic/pro) + a managed flag.
-- (3) PROVISIONING: one admin-only function to grant the company role, link the
--     user to a company, and set the tier — since profiles is otherwise write-locked.
-- Backend only; does not affect any shipped build.
-- ============================================================================

begin;

-- (1) SIGNUP = INVESTOR ONLY -------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Ignore any client-supplied role. Public signups are always investors;
  -- company/admin are granted only by a deliberate privileged action.
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'investor')
  on conflict (id) do nothing;
  return new;
end
$function$;

-- (2) COMPANY ACCOUNT TIERS --------------------------------------------------
alter table public.companies
  add column if not exists tier text not null default 'listing'
    check (tier in ('listing','free','basic','pro')),
  add column if not exists managed_by_admin boolean not null default true;
-- tier: listing = auto public directory entry (no owner, factual only)
--       free    = claimed account, cannot publish (upsell state)
--       basic   = basic profile + timeline; can publish PRESS RELEASES
--       pro     = rich profile + media; can self-edit (desktop)
-- managed_by_admin: true = you run it (concierge); false = company self-serve

-- (3) CONCIERGE PROVISIONING (admin only) ------------------------------------
-- Grants the company role, links the user to the company, and sets the tier in
-- one privileged call. profiles is write-locked (0004), so this SECURITY DEFINER
-- function is the only path to the 'company' role.
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
end
$function$;

revoke all on function public.admin_provision_company(uuid,uuid,text,boolean) from public, anon;
grant execute on function public.admin_provision_company(uuid,uuid,text,boolean) to authenticated;

commit;
