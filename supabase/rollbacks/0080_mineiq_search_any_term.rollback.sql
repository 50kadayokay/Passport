-- ROLLBACK for 0080_mineiq_search_any_term.sql. Restores 0050a's
-- mineiq_search() exactly: websearch_to_tsquery, every word required. No data
-- to undo -- 0080 changed only how the question becomes a tsquery. Grants are
-- left as 0056 set them (authenticated only).
-- Verified in a rolled-back transaction by scripts/mineiq-search-0080-check.mjs.
begin;

create or replace function public.mineiq_search(
  p_company uuid,
  p_query   text,
  p_limit   integer default 12
)
returns table (
  source      text,        -- 'fact' | 'document' | 'release'
  id          uuid,
  label       text,
  body        text,
  occurred_on date,
  rank        real
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q tsquery; lim integer;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  lim := greatest(least(coalesce(p_limit, 12), 50), 1);

  -- websearch_to_tsquery accepts what a person actually types ("las coloradas
  -- drilling") without throwing on punctuation, unlike to_tsquery.
  q := websearch_to_tsquery('english', coalesce(p_query, ''));
  if q is null or q = ''::tsquery then
    return;
  end if;

  return query
  (
    select 'fact'::text, f.id,
           coalesce(f.subject, f.kind),
           coalesce(f.quote, f.data::text),
           (f.data ->> 'disclosed_on')::date,
           ts_rank(f.fts, q)
      from public.facts f
     where f.company_id = p_company
       and f.superseded_by is null          -- current knowledge wins
       and f.fts @@ q
     order by ts_rank(f.fts, q) desc
     limit lim
  )
  union all
  (
    select 'release'::text, u.id,
           coalesce(u.detected ->> 'headline', 'Press release'),
           left(coalesce(u.body, ''), 4000),
           u.published_on,
           ts_rank(to_tsvector('english', coalesce(u.detected ->> 'headline', '') || ' ' || coalesce(u.body, '')), q)
      from public.updates u
     where u.company_id = p_company
       and u.status = 'published'
       and to_tsvector('english', coalesce(u.detected ->> 'headline', '') || ' ' || coalesce(u.body, '')) @@ q
     order by ts_rank(to_tsvector('english', coalesce(u.detected ->> 'headline', '') || ' ' || coalesce(u.body, '')), q) desc
     limit lim
  )
  union all
  (
    select 'document'::text, d.id,
           coalesce(d.title, d.filename, 'Document'),
           left(coalesce(d.extracted_text, ''), 6000),
           d.doc_date,
           ts_rank(to_tsvector('english', coalesce(d.filename, '') || ' ' || coalesce(d.title, '') || ' ' || coalesce(d.extracted_text, '')), q)
      from public.documents d
     where d.company_id = p_company
       and to_tsvector('english', coalesce(d.filename, '') || ' ' || coalesce(d.title, '') || ' ' || coalesce(d.extracted_text, '')) @@ q
     order by ts_rank(to_tsvector('english', coalesce(d.filename, '') || ' ' || coalesce(d.title, '') || ' ' || coalesce(d.extracted_text, '')), q) desc
     limit lim
  );
end $$;

revoke execute on function public.mineiq_search(uuid, text, integer) from public, anon;
grant  execute on function public.mineiq_search(uuid, text, integer) to authenticated;

commit;
