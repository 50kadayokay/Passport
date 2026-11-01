-- ============================================================================
-- 0080_mineiq_search_any_term.sql — NOT APPLIED. Prepared for review (S1, a19).
--
-- Mine IQ retrieval answers natural questions.
--
-- THE DEFECT (S4, a07 click-through on staging, 2026-11-01)
-- --------------------------------------------------------
-- 0050a's mineiq_search() builds its query with websearch_to_tsquery(), which
-- ANDs every word. A row matches only if it contains EVERY significant word of
-- the question, so:
--     "[a07-live] ... Closes C$2.1 Million Placement"  → the release
--     "What did <that release's word> raise?"          → nothing
-- because the release says "placement" and "proceeds", never "raise". People
-- ask questions in their own words; almost none came back with context.
--
-- WHAT CHANGES
-- ------------
-- Only how the question becomes a tsquery. Each whitespace-separated word goes
-- through plainto_tsquery('english', ...) on its own -- stemmed, stopwords and
-- punctuation dropped, quoting handled by Postgres -- and the words are ORed:
--     "What did a07zq raise?"   →   'a07zq' | 'rais'
-- A row matching ANY significant word is a candidate; ts_rank (unchanged) puts
-- rows matching more of them first, and each branch is still capped at p_limit.
-- At most 32 words are used, so a pasted paragraph cannot build a huge query.
--
-- UNCHANGED, deliberately:
--   - signature and return shape, so api/_mineiqSearch.js and every caller are
--     untouched;
--   - owns_company(p_company) checked FIRST (42501 for anyone else);
--   - facts: superseded_by is null (current knowledge only);
--   - releases: updates.status = 'published'. A taken-down release is removed
--     by the API layer's a08 filter (src/lib/mineiqActive.js), not here;
--   - the three tsvector expressions, character for character, so 0050b's GIN
--     indexes still serve them (an OR query uses the same index).
--
-- Rollback: supabase/rollbacks/0080_mineiq_search_any_term.rollback.sql
-- restores 0050a's definition exactly. No data changes either way.
-- Verified in a rolled-back transaction by scripts/mineiq-search-0080-check.mjs.
-- ============================================================================
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
declare q tsquery; t tsquery; w text; n integer := 0; lim integer;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  lim := greatest(least(coalesce(p_limit, 12), 50), 1);

  -- ANY significant word (0080). plainto_tsquery per word: stemmed, stopwords
  -- and punctuation removed, never throws on what a person types.
  for w in
    select x from regexp_split_to_table(left(coalesce(p_query, ''), 2000), '\s+') as x where x <> ''
  loop
    t := plainto_tsquery('english', w);
    continue when t is null or numnode(t) = 0;
    q := case when q is null then t else q || t end;
    n := n + 1;
    exit when n >= 32;
  end loop;
  if q is null then
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

-- As 0050a + 0056: signed-in callers only (the function checks the company).
revoke execute on function public.mineiq_search(uuid, text, integer) from public, anon;
grant  execute on function public.mineiq_search(uuid, text, integer) to authenticated;

commit;
