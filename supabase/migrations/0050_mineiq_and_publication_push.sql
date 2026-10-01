-- ============================================================================
-- 0050_mineiq_and_publication_push.sql — Phase B, items 1-4.
--
--   1. MineIQ ingestion idempotency   (claim table + unique key on facts)
--   2. MineIQ supersession            (a `measure` identity to chain on)
--   3. MineIQ retrieval               (full-text indexes + a scoped RPC)
--   4. Device push for publications   (reuse the existing outbox + sender)
--
-- Nothing unrelated is touched. `facts` has existed since 0005 and has never
-- had a writer, so widening it now carries no data-migration risk.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) IDEMPOTENCY
-- ---------------------------------------------------------------------------
-- Provenance moves out of jsonb and into real columns: a foreign key can be
-- indexed and cannot be typo'd, and PostgREST can only upsert on real columns.
alter table public.facts
  add column if not exists publication_id uuid references public.publications(id) on delete set null;

-- The upsert target. Computed by the writer as a stable digest of
-- (publication_id, kind, subject, the fact's own identifying values), so the
-- SAME fact extracted twice collapses to one row while two genuinely different
-- drill holes from one release stay separate.
alter table public.facts
  add column if not exists fact_key text;

-- The supersession identity — see (2).
alter table public.facts
  add column if not exists measure text;

-- NOT partial. A partial unique index cannot serve as an ON CONFLICT arbiter
-- unless the statement repeats the predicate, and PostgREST's `on_conflict=`
-- cannot express one -- the upsert would fail at runtime. A plain unique index
-- is correct anyway: NULLs never conflict in a unique index, so the rows that
-- predate this column (fact_key null) coexist freely.
create unique index if not exists facts_company_factkey_uk
  on public.facts (company_id, fact_key);

create index if not exists facts_company_publication_idx
  on public.facts (company_id, publication_id);

comment on column public.facts.fact_key is
  'Stable digest of the fact''s identity. Unique per company; the upsert target.';
comment on column public.facts.measure is
  'What this fact MEASURES (kind|subject|value-shape). Two facts sharing a measure describe the same quantity at different times.';

-- The claim table. Two dispatcher workers racing the same event would each run
-- their own extraction, and two LLM runs do not produce byte-identical facts --
-- so a unique key on the rows alone cannot prevent duplicates. Claiming the
-- PUBLICATION first does: the loser's insert conflicts and it returns without
-- extracting anything.
create table if not exists public.mineiq_ingestions (
  publication_id uuid primary key references public.publications(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  ingested_at    timestamptz not null default now(),
  facts_written  integer not null default 0
);

alter table public.mineiq_ingestions enable row level security;

drop policy if exists mineiq_ing_select on public.mineiq_ingestions;
create policy mineiq_ing_select on public.mineiq_ingestions
  for select using (public.can_touch_company(company_id));

grant select on public.mineiq_ingestions to authenticated;

-- ---------------------------------------------------------------------------
-- 2) SUPERSESSION
-- ---------------------------------------------------------------------------
-- `superseded_by` already exists (0005). What was missing is a way to find the
-- fact being superseded. `measure` supplies it: a share count and a later share
-- count share a measure; two drill holes do not.
--
-- Only CURRENT facts are ever chained. A drill result is a historical event and
-- is never superseded by a later one -- both remain true.
create index if not exists facts_current_measure_idx
  on public.facts (company_id, measure)
  where measure is not null and superseded_by is null;

-- ---------------------------------------------------------------------------
-- 3) RETRIEVAL
-- ---------------------------------------------------------------------------
-- Postgres full-text, not embeddings: no external call, no per-query cost, and
-- it degrades honestly (a miss returns nothing rather than something wrong).
-- 'english' is passed explicitly so the expression is IMMUTABLE and the column
-- can be GENERATED ... STORED.
alter table public.facts
  add column if not exists fts tsvector
  generated always as (
    to_tsvector('english',
      coalesce(subject, '') || ' ' || coalesce(quote, '') || ' ' || coalesce(data::text, ''))
  ) stored;

alter table public.documents
  add column if not exists fts tsvector
  generated always as (
    to_tsvector('english',
      coalesce(filename, '') || ' ' || coalesce(title, '') || ' ' || coalesce(extracted_text, ''))
  ) stored;

alter table public.updates
  add column if not exists fts tsvector
  generated always as (
    to_tsvector('english',
      coalesce(detected ->> 'headline', '') || ' ' || coalesce(body, ''))
  ) stored;

create index if not exists facts_fts_idx     on public.facts     using gin (fts);
create index if not exists documents_fts_idx on public.documents using gin (fts);
create index if not exists updates_fts_idx   on public.updates   using gin (fts);

-- The ONE retrieval path for MineIQ. SECURITY DEFINER so it can read across the
-- three tables consistently, but gated on owns_company() FIRST: a caller who
-- does not belong to the company gets an exception, not rows. company_id is a
-- parameter that is checked, never a filter that could be forgotten.
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
           ts_rank(u.fts, q)
      from public.updates u
     where u.company_id = p_company
       and u.status = 'published'
       and u.fts @@ q
     order by ts_rank(u.fts, q) desc
     limit lim
  )
  union all
  (
    select 'document'::text, d.id,
           coalesce(d.title, d.filename, 'Document'),
           left(coalesce(d.extracted_text, ''), 6000),
           d.doc_date,
           ts_rank(d.fts, q)
      from public.documents d
     where d.company_id = p_company
       and d.fts @@ q
     order by ts_rank(d.fts, q) desc
     limit lim
  );
end $$;

revoke execute on function public.mineiq_search(uuid, text, integer) from public;
grant  execute on function public.mineiq_search(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) DEVICE PUSH FOR PUBLICATIONS
-- ---------------------------------------------------------------------------
-- The outbox and the APNs sender already exist (0025, api/news-push-send.js),
-- but the outbox was built for the NEWS pipeline: news_item_id is NOT NULL, so
-- a company publication could not be queued at all.
--
-- The sender selects only (id, token, title, body, data) and never joins
-- news_items, so widening the table lets company publications reuse the exact
-- same delivery path with no change to the sender.
alter table public.notification_outbox
  alter column news_item_id drop not null;

alter table public.notification_outbox
  add column if not exists post_id uuid references public.posts(id) on delete cascade;

-- A row belongs to exactly one source. Existing rows all carry news_item_id and
-- a null post_id, so this validates without a backfill.
alter table public.notification_outbox
  drop constraint if exists notification_outbox_one_source;
alter table public.notification_outbox
  add constraint notification_outbox_one_source
  check ((news_item_id is not null) <> (post_id is not null));

-- DUPLICATE PUSH PROTECTION. One device, one post, one notification -- for ever.
-- Replaying PUBLICATION_PUBLISHED conflicts here and writes nothing, so a
-- retried or re-delivered event cannot buzz a phone twice.
-- Also NOT partial, for the same ON CONFLICT reason. News rows carry a null
-- post_id and so never conflict with each other here.
create unique index if not exists notification_outbox_post_token_uk
  on public.notification_outbox (post_id, user_id, token);

create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (status, created_at) where status = 'pending';
