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
