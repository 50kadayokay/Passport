-- 0039_media_asset_sources.sql
-- MULTI-SOURCE PROVENANCE — where MineEx has encountered an asset.
--
-- THREE DISTINCT CONCEPTS
-- -----------------------
--   media_assets         WHAT the asset is        (canonical file: sha, mime, dims)
--   media_asset_sources  WHERE we ENCOUNTERED it  (observation — not approval)
--   publication_media    WHERE it is USED         (a deliberate company choice)
--
-- Deduplicate the ASSET; never deduplicate away its HISTORY. Identical bytes in
-- releases A, B and C are ONE media_asset and THREE source rows. Reusing the
-- asset must never overwrite or discard A's provenance.
--
-- Observing an asset in a document is NOT approval to reuse it. Nothing here
-- implies publication; that lives solely in publication_media.
--
-- OCCURRENCE vs CANONICAL
-- -----------------------
-- original_filename and original_caption are properties of an OCCURRENCE, not of
-- the file: the same logo can be "logo.png" in one release and "header-2.png"
-- with a different caption in the next. Pretending there is one universally
-- correct value would make the column a lie, so they move to the source rows.
-- media_assets is empty, so this is a clean correction, not a data migration.
--
-- CROSS-COMPANY SAFETY IS STRUCTURAL
-- ----------------------------------
-- Company A's asset must never link to Company B's document. Enforced by
-- COMPOSITE foreign keys carrying a redundant company_id, so the database itself
-- rejects the association — not application code, and not only RLS. Because the
-- FKs are MATCH SIMPLE, a null document/update simply skips its constraint,
-- which is what we want for an asset uploaded with no source.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

begin;

-- ============================================================
-- 1) targets for the composite foreign keys
-- ============================================================
-- (id) is already unique on each of these; (id, company_id) is therefore
-- trivially unique too. These exist only so a composite FK can reference them.
create unique index if not exists media_assets_id_company_key on public.media_assets (id, company_id);
create unique index if not exists documents_id_company_key    on public.documents    (id, company_id);
create unique index if not exists updates_id_company_key      on public.updates      (id, company_id);

-- ============================================================
-- 2) occurrence fields leave the canonical asset
-- ============================================================
-- Safe: media_assets has zero rows (verified before applying).
alter table public.media_assets drop column if exists original_filename;
alter table public.media_assets drop column if exists original_caption;

-- ============================================================
-- 3) media_asset_sources
-- ============================================================
create table if not exists public.media_asset_sources (
  id uuid primary key default gen_random_uuid(),

  -- Denormalised ON PURPOSE: it is the pivot every composite FK below shares,
  -- which is what makes a cross-company association structurally impossible.
  company_id uuid not null references public.companies(id) on delete cascade,

  media_asset_id uuid not null,

  -- Where we saw it. Both nullable — an asset can come from a document, from an
  -- update, or be uploaded directly with no source at all.
  source_document_id uuid,
  source_update_id   uuid,

  -- OCCURRENCE properties: what THIS release called it.
  original_filename text,
  original_caption  text,

  -- Extraction detail specific to this sighting (page number, position, extractor
  -- version, confidence). Keeps per-sighting facts out of the canonical row.
  extraction_meta jsonb not null default '{}'::jsonb,

  seen_at    timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- The asset must belong to the SAME company as this source row.
  constraint media_asset_sources_asset_fk
    foreign key (media_asset_id, company_id)
    references public.media_assets (id, company_id) on delete cascade,

  -- ...and so must the document it was seen in.
  constraint media_asset_sources_document_fk
    foreign key (source_document_id, company_id)
    references public.documents (id, company_id) on delete set null,

  -- ...and the update.
  constraint media_asset_sources_update_fk
    foreign key (source_update_id, company_id)
    references public.updates (id, company_id) on delete set null
);

-- DETERMINISTIC duplicate handling: one row per (asset, document) and one per
-- (asset, update). Re-running extraction over the same document updates the
-- existing sighting instead of stacking near-identical rows. Partial indexes
-- because a NULL source is not a duplicate of another NULL source.
create unique index if not exists media_asset_sources_doc_key
  on public.media_asset_sources (media_asset_id, source_document_id)
  where source_document_id is not null;

create unique index if not exists media_asset_sources_update_key
  on public.media_asset_sources (media_asset_id, source_update_id)
  where source_update_id is not null;

create index if not exists media_asset_sources_asset_idx   on public.media_asset_sources (media_asset_id, seen_at desc);
create index if not exists media_asset_sources_company_idx on public.media_asset_sources (company_id, seen_at desc);
create index if not exists media_asset_sources_doc_idx     on public.media_asset_sources (source_document_id);

-- ============================================================
-- 4) RLS
-- ============================================================
alter table public.media_asset_sources enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='media_asset_sources'
  loop execute format('drop policy %I on public.media_asset_sources', p.policyname); end loop;
end $$;

create policy "owner_all" on public.media_asset_sources for all to authenticated
  using (public.can_touch_company(company_id))
  with check (public.can_touch_company(company_id));

commit;

-- ============================================================
-- VERIFY (read-only — run after applying)
-- ============================================================
--   select count(*) from public.media_asset_sources;   -- 0
--
--   select column_name from information_schema.columns
--    where table_name='media_assets' and column_name in ('original_filename','original_caption');
--   -- expect 0 rows (they moved to the source)
--
--   select conname from pg_constraint
--    where conrelid = 'public.media_asset_sources'::regclass and contype = 'f';
--   -- expect the three composite FKs
