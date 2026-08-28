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
