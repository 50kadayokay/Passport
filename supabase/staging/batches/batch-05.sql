-- BATCH 5: 0024_news_automation.sql .. 0033_subscription_expiry.sql (10 files)

-- ======== 0024_news_automation.sql ========
-- ============================================================================
-- 0024_news_automation.sql — hands-off daily news + rich cards + auto-approve.
--
-- Backend/pipeline only. Adds:
--   (1) news_sources.auto_approve + optional per-source user_agent
--   (2) news_items.category (app-card taxonomy) + commodity (primary metal)
--   (3) news_public view recreated to expose category + commodity
--   (4) official WIRE sources (auto_approve candidates), proxy-gated + DISABLED
--       until NEWS_PROXY_URL + a verified feed_url are set
--   (5) working junior-mining feeds (Junior Mining Network, MiningFeeds), ENABLED,
--       auto_approve=false (manual review) — flip to true once you trust them.
--
-- Nothing auto-publishes until BOTH: env NEWS_AUTO_APPROVE_ENABLED=true AND the
-- source row has auto_approve=true and publisher_type in ('wire','regulatory').
-- Does NOT touch any shipped iOS build. Apply in the Supabase SQL editor.
-- ============================================================================

begin;

-- (1) SOURCE FLAGS -----------------------------------------------------------
alter table public.news_sources
  add column if not exists auto_approve boolean not null default false,   -- trusted → publish without manual review
  add column if not exists user_agent  text;                              -- optional per-source UA override

-- (2) RICH APP-CARD FIELDS ON ITEMS ------------------------------------------
alter table public.news_items
  add column if not exists category  text,   -- Drill Results | Financing | MRE/Resource | Management | Property Acquisition | General News
  add column if not exists commodity text;   -- primary metal (Gold, Silver, Copper, Lithium, Uranium, …)

-- (3) RECREATE THE SAFE PUBLIC VIEW (adds category + commodity) ---------------
-- Still exposes ONLY display-safe fields for live + approved + canonical items.
-- provenance / internal facts / publisher excerpt remain unexposed. Additive:
-- existing app reads keep working; new columns are simply available.
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
  ni.category,
  ni.commodity,
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

-- (4) OFFICIAL WIRE SOURCES (auto_approve candidates) ------------------------
-- These block direct server fetches, so they are fetch_via='proxy' + DISABLED.
-- To activate one: set NEWS_PROXY_URL (a fetch proxy, {url} placeholder or
-- ?url= append), set the row's verified feed_url, then enabled=true.
update public.news_sources
   set auto_approve = true, publisher_type = 'wire'
 where key = 'globenewswire_mining';

insert into public.news_sources
  (key, name, publisher_type, adapter, feed_url, homepage_url, enabled, fetch_via, auto_approve, store_full_text, allow_source_image, attribution_required, terms_note)
values
  ('newsfile', 'Newsfile (TMX)', 'wire', 'rss',
   null, 'https://www.newsfilecorp.com/', false, 'proxy', true, false, false, true,
   'Official junior-mining newswire. RSS blocks server IPs — set NEWS_PROXY_URL + verified feed_url, then enable. Preserve original release link.'),
  ('cnw_mining', 'CNW / Cision — Mining', 'wire', 'rss',
   null, 'https://www.newswire.ca/', false, 'proxy', true, false, false, true,
   'Canada Newswire mining releases. Set NEWS_PROXY_URL + verified feed_url, then enable. Preserve original release link.')
on conflict (key) do nothing;

-- (5) WORKING JUNIOR-MINING FEEDS (verified reachable) -----------------------
-- Editorial aggregators of junior-mining press releases. ENABLED now for
-- immediate coverage; auto_approve=false so they route through manual review.
-- Metadata + MineEx summary + attribution + outbound link only (no full text;
-- images OFF → MineEx fallback). Flip auto_approve=true per source once trusted.
insert into public.news_sources
  (key, name, publisher_type, adapter, feed_url, homepage_url, enabled, fetch_via, auto_approve, store_full_text, allow_source_image, attribution_required, terms_note)
values
  ('junior_mining_network', 'Junior Mining Network', 'editorial', 'rss',
   'https://feeds.feedburner.com/JuniorMiningNetwork', 'https://www.juniorminingnetwork.com/', true, 'direct', false, false, false, true,
   'Junior-mining press-release aggregator. Headline + MineEx summary + attribution + outbound link only.'),
  ('miningfeeds', 'MiningFeeds', 'editorial', 'rss',
   'https://miningfeeds.com/feed/', 'https://miningfeeds.com/', true, 'direct', false, false, false, true,
   'Mining news/PR aggregator. Metadata + MineEx summary + attribution + outbound link only.')
on conflict (key) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- To go FULLY hands-off on a working feed once you trust its quality, e.g.:
--   update public.news_sources set auto_approve = true, publisher_type = 'wire'
--    where key = 'junior_mining_network';
-- and set env NEWS_AUTO_APPROVE_ENABLED=true in Vercel.
-- ---------------------------------------------------------------------------


-- ======== 0025_push_notifications.sql ========
-- ============================================================================
-- 0025_push_notifications.sql — device tokens + delivery outbox for push.
--
-- Backend half of "follow a company → get pushed its news". Additive; touches no
-- shipped behavior. The CLIENT half (Capacitor push plugin + APNs entitlement)
-- is a later app build. Fan-out logic lives in api/news-notify.js; the actual
-- APNs send drains public.notification_outbox.
--
--   push_tokens          — one row per (user, device token). User-owned (RLS).
--   notification_outbox  — one queued push per (news_item, user, token).
--                          Service-role only; idempotent via the unique key.
--   news_items.push_notified_at — set once an item has been fanned out (so the
--                          fan-out never double-enqueues).
-- ============================================================================
begin;

-- 1) DEVICE TOKENS -----------------------------------------------------------
create table if not exists public.push_tokens (
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text not null default 'ios' check (platform in ('ios','web','android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
create index if not exists idx_push_tokens_user on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon;
grant select, insert, update, delete on public.push_tokens to authenticated;
drop policy if exists push_tokens_own_select on public.push_tokens;
create policy push_tokens_own_select on public.push_tokens for select using (auth.uid() = user_id);
drop policy if exists push_tokens_own_insert on public.push_tokens;
create policy push_tokens_own_insert on public.push_tokens for insert with check (auth.uid() = user_id);
drop policy if exists push_tokens_own_update on public.push_tokens;
create policy push_tokens_own_update on public.push_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists push_tokens_own_delete on public.push_tokens;
create policy push_tokens_own_delete on public.push_tokens for delete using (auth.uid() = user_id);

drop trigger if exists trg_touch_push_tokens on public.push_tokens;
create trigger trg_touch_push_tokens before update on public.push_tokens
  for each row execute function public.touch_updated_at();

-- 2) DELIVERY OUTBOX ---------------------------------------------------------
-- Service-role only (the fan-out writes it, the sender drains it). No client
-- access at all. The unique key makes re-runs idempotent (never double-send).
create table if not exists public.notification_outbox (
  id           uuid primary key default gen_random_uuid(),
  news_item_id uuid not null references public.news_items(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  token        text not null,
  platform     text not null default 'ios',
  title        text not null,
  body         text not null,
  data         jsonb not null default '{}'::jsonb,
  status       text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts     int  not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  unique (news_item_id, user_id, token)
);
create index if not exists idx_outbox_pending on public.notification_outbox (status, created_at) where status = 'pending';

alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;   -- service role only

-- 3) FAN-OUT MARKER ----------------------------------------------------------
alter table public.news_items add column if not exists push_notified_at timestamptz;

commit;


-- ======== 0026_news_press_release_flag.sql ========
-- ============================================================================
-- 0026_news_press_release_flag.sql — split News (editorial) from Companies (PRs).
--
-- Adds news_items.is_press_release (set by the AI in _newsAI.js v5): TRUE = a
-- company's own official disclosure/press release; FALSE = third-party editorial.
-- Null = not yet classified (older items; the app treats null as editorial/News
-- until reprocessed). Recreates the public view to expose it so the app can route:
--   is_press_release = true  → Companies tab
--   else                     → News tab
-- Additive; the in-review build ignores the new column. Reprocess existing items
-- (force_reprocess) to backfill the flag, or let it fill in as new items process.
-- ============================================================================
begin;

alter table public.news_items add column if not exists is_press_release boolean;

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
  ni.category,
  ni.commodity,
  ni.is_press_release,
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

commit;


-- ======== 0027_market_quotes.sql ========
-- ============================================================================
-- 0027_market_quotes.sql — delayed market quotes for the watchlist / "your
-- companies today" / price alerts. Provider-agnostic: a daily cron writes one
-- row per tracked symbol; the app reads the public view.
--
-- DELAYED / END-OF-DAY data only (avoids real-time exchange redistribution
-- licensing). Show a "delayed" label in the UI. Market data (last price, EOD
-- OHLC) is factual public data; we store the latest snapshot, not a redistributed
-- real-time feed.
-- ============================================================================
begin;

-- Optional per-company override of the data-provider symbol, for the microcaps
-- where auto-mapping (primary_ticker → SYM.V) is wrong. Null = derive in code.
alter table public.companies add column if not exists market_symbol text;

create table if not exists public.quotes (
  symbol       text primary key,              -- provider symbol, e.g. 'AGAG.V'
  company_id   uuid references public.companies(id) on delete set null,
  exchange     text,                          -- TSXV | TSX | CSE
  price        numeric,
  currency     text,
  change       numeric,                       -- absolute day change
  change_pct   numeric,                        -- percent day change
  prev_close   numeric,
  open         numeric,
  high         numeric,
  low          numeric,
  volume       bigint,
  as_of        date,                           -- the trading day this reflects
  is_delayed   boolean not null default true,
  provider     text,                           -- which source produced it
  updated_at   timestamptz not null default now()
);
create index if not exists quotes_company_idx on public.quotes (company_id);

-- RLS: quotes are public (delayed) market data → readable by everyone; only the
-- service role writes (the cron), which bypasses RLS.
alter table public.quotes enable row level security;
revoke all on public.quotes from anon, authenticated;
grant select on public.quotes to anon, authenticated;
drop policy if exists quotes_public_read on public.quotes;
create policy quotes_public_read on public.quotes for select to anon, authenticated using (true);

commit;


-- ======== 0028_story_studio.sql ========
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


-- ======== 0029_company_self_serve.sql ========
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


-- ======== 0030_selfserve_fixes.sql ========
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


-- ======== 0031_invite_provisioning.sql ========
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


-- ======== 0032_tier_entitlements_align.sql ========
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


-- ======== 0033_subscription_expiry.sql ========
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
