-- 0038_media_assets.sql
-- MEDIA FOUNDATION — canonical company media assets + per-publication selection.
--
-- THE MODEL
-- ---------
--   documents ──► extraction ──► media_assets ──► publication_media ──► publications
--                                (canonical,        (selection,          (already
--                                 reusable,          not ownership)       per-destination)
--                                 PRIVATE)
--
-- media_assets is the company's reusable asset record. publication_media says
-- whether a given publication USES it — nothing more. Because `publications` is
-- already one row per destination, the same asset can be included for MineEx and
-- LinkedIn and excluded for X with no duplication of the underlying file.
--
-- PRIVACY IS THE DEFAULT AND IT IS ENFORCED IN STORAGE, NOT JUST LABELLED
-- ----------------------------------------------------------------------
-- Extracting an image from an unpublished release must not make it public. The
-- canonical bytes live in a NEW PRIVATE bucket (`company-media-private`), never
-- in the public `company-media`. `visibility` is a record of state; the storage
-- policy below is what actually enforces it.
--
-- AUTHORIZATION follows 0037 exactly:
--   COMPANY OWNS THE RESOURCE.  USER PERFORMS THE ACTION.
--   read  → asset row → company_id → can_touch_company()
--   write → company id in the path
-- Uploader identity is not an authorization mechanism anywhere.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

begin;

-- ============================================================
-- 1) media_assets — the canonical, reusable, PRIVATE asset
-- ============================================================
create table if not exists public.media_assets (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,

  -- Provenance. Both nullable: an asset can be extracted from a document, or
  -- uploaded directly by the company later with no source document at all.
  source_document_id uuid references public.documents(id) on delete set null,
  source_update_id   uuid references public.updates(id)   on delete set null,
  extracted_at       timestamptz,          -- null → not extracted, uploaded directly

  -- What the source called it. Never overwritten, so the trail back to the
  -- original release stays intact even after the company edits a caption.
  original_filename text,
  original_caption  text,

  -- The bytes.
  mime_type    text,
  width        int,
  height       int,
  bytes        bigint,
  sha256       text,
  storage_path text,                       -- 'company-media-private/<company_id>/<uuid>.ext'

  -- Lifecycle. 'private' is the only state extraction may produce.
  visibility text not null default 'private'
    check (visibility in ('private', 'published')),

  -- Set only when a publication is approved and a public representation is made.
  -- The private canonical asset is NEVER mutated into a public one — this is an
  -- additional pointer, not a replacement.
  public_storage_path text,
  published_at        timestamptz,

  -- Room for dimensions-in-progress, EXIF, extractor notes, etc.
  meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- DEDUPLICATION. Identical BYTES for the same company are one asset — not one
-- per release that happened to embed the same figure. sha256 is exact, so this
-- merges only genuinely identical files; nothing is ever merged on filename,
-- caption or dimensions. Partial so rows without a hash yet are unconstrained.
create unique index if not exists media_assets_company_sha_idx
  on public.media_assets (company_id, sha256)
  where sha256 is not null;

create index if not exists media_assets_company_idx   on public.media_assets (company_id, created_at desc);
create index if not exists media_assets_doc_idx       on public.media_assets (source_document_id);
create index if not exists media_assets_update_idx    on public.media_assets (source_update_id);
create index if not exists media_assets_path_idx      on public.media_assets (storage_path);

-- ============================================================
-- 2) publication_media — SELECTION, not ownership
-- ============================================================
create table if not exists public.publication_media (
  publication_id  uuid not null references public.publications(id) on delete cascade,
  media_asset_id  uuid not null references public.media_assets(id) on delete cascade,

  -- The CEO's choice for THIS destination. Default false: extracting an image
  -- never implies publishing it.
  included   boolean not null default false,
  sort_order int     not null default 0,

  -- Per-destination caption. Null → fall back to the asset's original_caption.
  -- Stored here, never written back onto the asset.
  caption_override text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (publication_id, media_asset_id)
);

create index if not exists publication_media_asset_idx on public.publication_media (media_asset_id);
create index if not exists publication_media_pick_idx  on public.publication_media (publication_id, included, sort_order);

-- ============================================================
-- 3) RLS — same shape as the other comms tables (0005)
-- ============================================================
alter table public.media_assets      enable row level security;
alter table public.publication_media enable row level security;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='media_assets'
  loop execute format('drop policy %I on public.media_assets', p.policyname); end loop;
  for p in select policyname from pg_policies where schemaname='public' and tablename='publication_media'
  loop execute format('drop policy %I on public.publication_media', p.policyname); end loop;
end $$;

create policy "owner_all" on public.media_assets for all to authenticated
  using (public.can_touch_company(company_id))
  with check (public.can_touch_company(company_id));

-- publication_media has no company_id of its own — gate it through its publication.
create policy "owner_all" on public.publication_media for all to authenticated
  using (exists (select 1 from public.publications p
                  where p.id = publication_id and public.can_touch_company(p.company_id)))
  with check (exists (select 1 from public.publications p
                  where p.id = publication_id and public.can_touch_company(p.company_id)));

-- ============================================================
-- 4) private bucket + storage policies
-- ============================================================
insert into storage.buckets (id, name, public)
values ('company-media-private', 'company-media-private', false)
on conflict (id) do nothing;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects'
           and policyname in ('privmedia_company_read','privmedia_company_insert',
                              'privmedia_company_update','privmedia_company_delete')
  loop execute format('drop policy %I on storage.objects', p.policyname); end loop;
end $$;

-- READ: through the asset record → company → current authorization. Same chain
-- as company-docs in 0037. No path shortcut, no uploader clause.
create policy "privmedia_company_read" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'company-media-private'
    and exists (
      select 1 from public.media_assets m
       where m.storage_path = 'company-media-private/' || storage.objects.name
         and public.can_touch_company(m.company_id)
    )
  );

-- WRITE: company id from the path — the asset row does not exist yet when the
-- bytes land. docs_path_company() (0037) reads the last folder segment, which is
-- the company id for these company-oriented paths.
create policy "privmedia_company_insert" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-media-private'
              and public.can_touch_company(public.docs_path_company(name)));

create policy "privmedia_company_update" on storage.objects for update
  to authenticated
  using (bucket_id = 'company-media-private'
         and public.can_touch_company(public.docs_path_company(name)));

-- Path-derived like 0037's delete: the row is removed before the object, and an
-- authorized company user must be able to delete an asset an admin extracted.
create policy "privmedia_company_delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'company-media-private'
         and public.can_touch_company(public.docs_path_company(name)));

commit;

-- ============================================================
-- VERIFY (read-only — run after applying)
-- ============================================================
--   select count(*) from public.media_assets;       -- 0
--   select count(*) from public.publication_media;  -- 0
--
--   select id, public from storage.buckets where id = 'company-media-private';
--   -- expect public = false
--
--   select policyname, cmd from pg_policies
--    where schemaname='storage' and tablename='objects' and policyname like 'privmedia%';
--   -- expect 4 rows
--
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename in ('media_assets','publication_media');
--   -- expect owner_all on each
