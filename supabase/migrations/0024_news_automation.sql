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
