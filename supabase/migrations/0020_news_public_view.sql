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
