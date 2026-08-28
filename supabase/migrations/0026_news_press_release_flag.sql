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
