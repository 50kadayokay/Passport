-- 0042_source_inventories.sql  (SUPERSEDES the never-applied 0042_canonical_sources.sql)
--
-- PHASE 3D, step 1 of 3: persist the independent OOXML inventory as EVIDENCE.
--
-- WHY THIS COMES FIRST
-- --------------------
-- The durable provenance chain is:
--   original document -> source transcript -> source inventory
--                     -> verification run/findings -> canonical source/spans
-- Evidence must exist immutably BEFORE anything cites it. The first draft of this
-- phase stored only an inventory DIGEST on the canonical row, which meant canonical
-- provenance pointed at an inventory that existed only in memory: the digest proved
-- binding, but "was this 390-character supplement actually in the package?" could
-- never be answered afterwards.
--
-- It also meant the DATABASE could not check a supplement. With the inventory
-- persisted at block granularity, persist_canonical() can compare a supplement's
-- text against the exact source text it claims to come from, instead of trusting
-- the composer's word for it.
--
-- CHARACTER SEMANTICS
-- -------------------
-- char_count columns are PostgreSQL length() -- CHARACTERS (Unicode codepoints).
-- Not UTF-16 code units. JavaScript's String.length disagrees on any astral
-- character (emoji, CJK extensions, many mathematical symbols), so callers convert
-- at their boundary; the database's count is the authority. octet_length is stored
-- alongside because bytes are the one measure both sides always agree on.
--
-- Run in Supabase -> SQL Editor. Idempotent.

begin;

-- ============================================================
-- 0) COMPOSITE KEYS FOR TENANT-STRUCTURAL FOREIGN KEYS
-- ============================================================
-- 0039 established the pattern: a child references (id, company_id) so attaching a
-- row to another tenant's parent is a CONSTRAINT VIOLATION, not a policy decision.
-- These indexes make that pattern available to the Phase 3 tables.
create unique index if not exists source_transcripts_id_company_key
  on public.source_transcripts (id, company_id);

-- ============================================================
-- 1) SOURCE INVENTORIES
-- ============================================================
create table if not exists public.source_inventories (
  id                 uuid primary key default gen_random_uuid(),
  document_id        uuid not null,
  company_id         uuid not null,
  -- An inventory is a reading of the PACKAGE; the transcript is a reading by the
  -- engine. Binding both to the same document is what lets a verification run
  -- compare like with like.
  transcript_id      uuid not null,

  engine             text not null,          -- e.g. mineex-ooxml-inventory
  engine_version     text not null,
  package_sha256     text not null,          -- digest of the original .docx bytes

  -- inventory-digest-v1 over the COMPLETE manifest -- parts, blocks and notes.
  -- Recomputed by persist_verification() from the rows it just stored, never taken
  -- from the caller, and re-checkable at any time with public.inventory_digest().
  digest             text not null,

  -- Counts and the classification summary. Detail lives in the child tables.
  stats              jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),

  constraint source_inventories_document_fk
    foreign key (document_id, company_id) references public.documents (id, company_id) on delete cascade,
  constraint source_inventories_transcript_fk
    foreign key (transcript_id, company_id) references public.source_transcripts (id, company_id) on delete cascade
);

create unique index if not exists source_inventories_id_company_key on public.source_inventories (id, company_id);
create index if not exists source_inventories_document_idx on public.source_inventories (document_id, created_at desc);

-- ============================================================
-- 2) PARTS -- immutable package evidence
-- ============================================================
create table if not exists public.source_inventory_parts (
  id            uuid primary key default gen_random_uuid(),
  inventory_id  uuid not null,
  company_id    uuid not null,
  part_name     text not null,               -- word/footnotes.xml
  part_kind     text,                        -- document | footnotes | header | ...
  content_type  text,
  bytes         bigint,
  sha256        text,                        -- digest of the part's raw bytes
  walked        boolean not null default false,
  error         text,
  created_at    timestamptz not null default now(),

  constraint source_inventory_parts_inv_fk
    foreign key (inventory_id, company_id) references public.source_inventories (id, company_id) on delete cascade,
  constraint source_inventory_parts_uniq unique (inventory_id, part_name)
);

-- ============================================================
-- 3) BLOCKS -- the exact source text, at the granularity composition needs
-- ============================================================
-- One row per (part, paragraph instance) of VISIBLE text. This is the granularity
-- at which supplementation happens, so it is the granularity the database must be
-- able to check. Storing a truncated excerpt here would reintroduce exactly the
-- problem that made findings unusable as a text source.
create table if not exists public.source_inventory_blocks (
  id            uuid primary key default gen_random_uuid(),
  inventory_id  uuid not null,
  company_id    uuid not null,

  part_name     text not null,
  part_kind     text,
  xml_path      text not null,
  source_block  int,                          -- paragraph instance, null when unblocked
  source_order  int not null,                 -- position in the inventory walk
  structures    jsonb not null default '[]'::jsonb,

  text          text not null,                -- EXACT, never trimmed or normalised

  char_count    int  generated always as (length(text)) stored,          -- CHARACTERS
  byte_count    int  generated always as (octet_length(text)) stored,    -- UTF-8 bytes
  sha256        text generated always as (public.sha256_hex(text)) stored,

  created_at    timestamptz not null default now(),

  constraint source_inventory_blocks_inv_fk
    foreign key (inventory_id, company_id) references public.source_inventories (id, company_id) on delete cascade,
  -- The address persist_canonical() resolves a supplement against. Unique, so a
  -- span's provenance can never point at two blocks.
  constraint source_inventory_blocks_addr_uniq unique (inventory_id, part_name, source_block, source_order),
  constraint source_inventory_blocks_text_ck check (length(text) > 0)
);

create index if not exists source_inventory_blocks_addr_idx
  on public.source_inventory_blocks (inventory_id, part_name, source_block);

-- ============================================================
-- 4) NON-VISIBLE AND UNSUPPORTED CONSTRUCTS -- classification evidence
-- ============================================================
-- Kept because a verdict of VERIFIED asserts that every non-visible construct
-- matched an explicit rule. Without these rows that assertion is unauditable.
create table if not exists public.source_inventory_notes (
  id            uuid primary key default gen_random_uuid(),
  inventory_id  uuid not null,
  company_id    uuid not null,
  note_kind     text not null check (note_kind in ('ignored','unsupported','note')),
  part_name     text,
  xml_path      text,
  element       text,
  kind          text,
  reason        text,
  chars         int not null default 0,
  excerpt       text,
  created_at    timestamptz not null default now(),

  constraint source_inventory_notes_inv_fk
    foreign key (inventory_id, company_id) references public.source_inventories (id, company_id) on delete cascade
);

create index if not exists source_inventory_notes_inv_idx on public.source_inventory_notes (inventory_id, note_kind);

-- ============================================================
-- 4b) inventory-digest-v1 -- the identity of the COMPLETE inventory
-- ============================================================
-- Mirrors api/_inventoryDigest.js exactly; see that file for the reasoning. In
-- short: the previous digest covered blocks only, so a part could flip
-- walked=true -> false, a part's error could change, and any note could be
-- rewritten, all without changing the digest. Notes are what make a verdict of
-- VERIFIED auditable, so an inventory whose notes are unbound cannot support the
-- claim that every non-visible construct matched an explicit rule.
--
-- Encoding: every field is BYTELENGTH ":" VALUE, with "~" for NULL. NULL and ''
-- therefore differ ("~" vs "0:"), and no separator inside a value can imitate a
-- field boundary because the reader knows the length before it reads the bytes.
-- Records carry a type tag and sections carry their name and row count, so a part
-- cannot be read as a block and a truncated section cannot pass as a shorter one.

create or replace function public.idg_enc(v text)
returns text language sql immutable parallel safe as $$
  select case when v is null then '~' else octet_length(v)::text || ':' || v end
$$;

-- An ordered array of labels: its length, then its elements IN ORDER. Order is
-- meaningful here -- structures is a nesting stack, not a set.
create or replace function public.idg_arr(j jsonb)
returns text language sql immutable parallel safe as $$
  select public.idg_enc(
           case when jsonb_typeof(j) = 'array' then jsonb_array_length(j) else 0 end::text)
      || coalesce((select string_agg(public.idg_enc(e.value #>> '{}'), '' order by e.ord)
                     from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end)
                          with ordinality e(value, ord)), '')
$$;

create or replace function public.idg_bool(b boolean)
returns text language sql immutable parallel safe as $$
  select public.idg_enc(case when b is null then null when b then 'true' else 'false' end)
$$;

create or replace function public.idg_part(
  p_part_name text, p_part_kind text, p_content_type text,
  p_bytes bigint, p_sha256 text, p_walked boolean, p_error text)
returns text language sql immutable parallel safe as $$
  select 'P' || public.idg_enc(p_part_name) || public.idg_enc(p_part_kind)
             || public.idg_enc(p_content_type)
             || public.idg_enc(case when p_bytes is null then null else p_bytes::text end)
             || public.idg_enc(p_sha256) || public.idg_bool(p_walked) || public.idg_enc(p_error)
$$;

create or replace function public.idg_block(
  p_part_name text, p_part_kind text, p_xml_path text,
  p_source_block int, p_source_order int, p_structures jsonb, p_text text)
returns text language sql immutable parallel safe as $$
  select 'B' || public.idg_enc(p_part_name) || public.idg_enc(p_part_kind)
             || public.idg_enc(p_xml_path)
             || public.idg_enc(case when p_source_block is null then null else p_source_block::text end)
             || public.idg_enc(case when p_source_order is null then null else p_source_order::text end)
             || public.idg_arr(p_structures) || public.idg_enc(p_text)
$$;

create or replace function public.idg_note(
  p_note_kind text, p_part_name text, p_xml_path text, p_element text,
  p_kind text, p_reason text, p_chars int, p_excerpt text)
returns text language sql immutable parallel safe as $$
  select 'N' || public.idg_enc(p_note_kind) || public.idg_enc(p_part_name)
             || public.idg_enc(p_xml_path) || public.idg_enc(p_element)
             || public.idg_enc(p_kind) || public.idg_enc(p_reason)
             || public.idg_enc(case when p_chars is null then null else p_chars::text end)
             || public.idg_enc(p_excerpt)
$$;

-- Rows sort by their ENCODED BYTES. Sequence information lives in
-- source_block/source_order INSIDE the row, not in list position, so sorting loses
-- nothing -- and COLLATE "C" is plain UTF-8 byte order, which is what
-- Buffer.compare gives the JavaScript side without either needing to agree on a
-- locale.
create or replace function public.idg_section(p_name text, p_rows text[])
returns text language sql immutable parallel safe as $$
  select public.idg_enc(p_name)
      || public.idg_enc(coalesce(array_length(p_rows, 1), 0)::text)
      || coalesce((select string_agg(r, '' order by r collate "C") from unnest(p_rows) r), '')
$$;

-- THE DIGEST, computed from the rows AS STORED. persist_verification() calls this
-- after writing, so the value it compares against a caller's claim is derived from
-- what the database actually holds, never from what it was told.
create or replace function public.inventory_digest(p_inventory uuid)
returns text language sql stable as $$
  select public.sha256_hex(
    'inventory-digest-v1' || E'\n'
    || public.idg_section('parts', coalesce((
         select array_agg(public.idg_part(part_name, part_kind, content_type, bytes, sha256, walked, error))
           from public.source_inventory_parts where inventory_id = p_inventory), '{}'::text[]))
    || public.idg_section('blocks', coalesce((
         select array_agg(public.idg_block(part_name, part_kind, xml_path, source_block, source_order, structures, text))
           from public.source_inventory_blocks where inventory_id = p_inventory), '{}'::text[]))
    || public.idg_section('notes', coalesce((
         select array_agg(public.idg_note(note_kind, part_name, xml_path, element, kind, reason, chars, excerpt))
           from public.source_inventory_notes where inventory_id = p_inventory), '{}'::text[]))
  )
$$;

comment on function public.inventory_digest(uuid) is
  'inventory-digest-v1. Identity of the COMPLETE inventory manifest: parts, blocks '
  'and notes. Excludes ids, inventory_id, company_id, created_at and the generated '
  'char_count/byte_count/sha256 columns -- none describe the source, and all would '
  'make the same inventory hash differently on re-persist.';

-- ============================================================
-- 5) IMMUTABILITY + RLS
-- ============================================================
-- Append-only means BOTH verbs. An UPDATE-only guard leaves a delete-then-reinsert
-- path that produces a different row saying something else, which is the same
-- corruption by a longer route.
--
-- This is a TRIGGER rather than an RLS policy on purpose: service_role bypasses
-- RLS, so a policy would guarantee nothing against anything holding the service
-- key. A trigger fires for every role. Only dropping or disabling the trigger,
-- which requires ownership, gets past it -- and that is an auditable schema
-- change rather than a routine write.
create or replace function public.phase3_append_only()
returns trigger language plpgsql as $$
begin
  -- Do NOT assume an `id` column. composition_rules is keyed (rule_id, rule_version)
  -- and has none, and referencing old.id there raised a type error instead of this
  -- refusal -- the delete was still blocked, but by the wrong thing, with a message
  -- that told an operator nothing.
  raise exception '% is append-only; row % cannot be %',
    tg_table_name,
    coalesce(to_jsonb(old) ->> 'id', left(to_jsonb(old)::text, 120)),
    case when tg_op = 'DELETE' then 'deleted' else 'modified' end
    using errcode = '42501',
          hint = 'Evidence is not editable or erasable. Record a new inventory or run instead.';
end $$;

-- The previous UPDATE-only guard, removed by name so an upgraded database does not
-- keep a weaker trigger alongside the new one.
drop function if exists public.phase3_no_update() cascade;

do $$
declare t text;
begin
  foreach t in array array['source_inventories','source_inventory_parts','source_inventory_blocks','source_inventory_notes']
  loop
    execute format('drop trigger if exists %I_immutable on public.%I', t, t);
    execute format('create trigger %I_immutable before update or delete on public.%I for each row execute function public.phase3_append_only()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%I_read" on public.%I', t, t);
    execute format('create policy "%I_read" on public.%I for select to authenticated using (public.can_touch_company(company_id))', t, t);
  end loop;
end $$;

-- NOTE: there is deliberately NO insert policy here. Writes go through
-- persist_verification() in 0044, which is SECURITY DEFINER. A well-formed row a
-- client composes by hand is exactly the forgery this phase exists to prevent, and
-- "well-formed" is not a property RLS can check.

comment on table public.source_inventories is
  'Independent OOXML reading of a document package. Evidence for a verification run; '
  'written only by persist_verification().';
comment on table public.source_inventory_blocks is
  'Exact source text per (part, paragraph instance). char_count is PostgreSQL '
  'length() -- Unicode characters, not UTF-16 units. This is what persist_canonical() '
  'compares a supplement against.';

commit;
