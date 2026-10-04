-- ============================================================================
-- 0050b_mineiq_search_indexes.sql — the full-text indexes.
--
-- ⚠️  RUN EACH STATEMENT ON ITS OWN. DO NOT WRAP IN A TRANSACTION.
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block. Pasting this
-- whole file into an editor that wraps scripts in BEGIN/COMMIT will fail with
-- 25001. Run the two CREATE INDEX statements one at a time.
--
-- WHY CONCURRENTLY: a plain CREATE INDEX takes a SHARE lock and blocks every
-- write to the table while it builds. `documents` and `updates` are written
-- during ingestion and publishing, so an ordinary build stalls those flows.
-- CONCURRENTLY builds without blocking writes, at the cost of two table passes
-- and the inability to run in a transaction.
--
-- THE EXPRESSIONS MUST MATCH mineiq_search() EXACTLY. Postgres only uses an
-- expression index when the query's expression is identical -- same function,
-- same arguments, same order, same literals. One extra space inside the string
-- is fine; a different coalesce order is not. If search feels slow after this,
-- that is the first thing to check (see the verification query at the bottom).
--
-- IF A BUILD FAILS: an INVALID index is left behind. It is not used for queries
-- but it IS maintained on every write, so it must be dropped before retrying:
--
--   select indexrelid::regclass as idx, indisvalid
--     from pg_index where not indisvalid;
--
--   drop index concurrently if exists documents_fts_idx;   -- then retry
--
-- ============================================================================


-- 1) Documents. Run alone.
create index concurrently if not exists documents_fts_idx
  on public.documents using gin (
    to_tsvector('english', coalesce(filename, '') || ' ' || coalesce(title, '') || ' ' || coalesce(extracted_text, '')));


-- 2) Published releases. Run alone.
create index concurrently if not exists updates_fts_idx
  on public.updates using gin (
    to_tsvector('english', coalesce(detected ->> 'headline', '') || ' ' || coalesce(body, '')));


-- ---------------------------------------------------------------------------
-- VERIFY (read-only). Run after both builds.
-- ---------------------------------------------------------------------------
-- Every index must be valid, ready and used. `indisvalid=false` means the build
-- failed and the index must be dropped and rebuilt.
--
--   select c.relname as index, i.indisvalid as valid, i.indisready as ready
--     from pg_index i join pg_class c on c.oid = i.indexrelid
--    where c.relname in ('documents_fts_idx','updates_fts_idx','facts_fts_idx');
--
-- And confirm the planner actually uses them rather than scanning:
--
--   explain (costs off)
--   select id from public.documents
--    where to_tsvector('english', coalesce(filename,'') || ' ' || coalesce(title,'') || ' ' || coalesce(extracted_text,''))
--          @@ websearch_to_tsquery('english', 'drilling');
--
-- Expect "Bitmap Index Scan on documents_fts_idx". A "Seq Scan" means the
-- expression does not match -- compare it against mineiq_search() character by
-- character before assuming the index is broken.
