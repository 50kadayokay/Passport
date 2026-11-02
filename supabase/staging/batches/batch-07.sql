-- BATCH 7: 0042_source_inventories.sql .. 0050b_mineiq_search_indexes.sql (10 files)

-- ======== 0042_source_inventories.sql ========
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
  -- HOW this part was discovered: the relationship that reached it. Parts are found
  -- through content types and relationships, never filenames, so the route is the
  -- provenance claim -- the same bytes reached two ways are two different assertions
  -- about the package.
  via           text,
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

  -- WHICH note this record concerns. A separator or continuation belongs to a
  -- specific note, and a footnote is identified by its id; without this two records
  -- about different notes are indistinguishable.
  note_ref      int,
  -- normal | separator | continuationSeparator. This decides whether a note is
  -- CONTENT or furniture, so it changes verifier behaviour, not just description.
  note_type     text,
  -- Namespace URI of an unrecognised element. The same local name in two namespaces
  -- is two different elements.
  ns            text,
  -- Relationship type URI of a part this verifier cannot read. chart vs oleObject
  -- is a different statement about what went unread and why.
  rel_type      text,

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
  p_bytes bigint, p_sha256 text, p_walked boolean, p_error text, p_via text)
returns text language sql immutable parallel safe as $$
  select 'P' || public.idg_enc(p_part_name) || public.idg_enc(p_part_kind)
             || public.idg_enc(p_content_type)
             || public.idg_enc(case when p_bytes is null then null else p_bytes::text end)
             || public.idg_enc(p_sha256) || public.idg_bool(p_walked) || public.idg_enc(p_error)
             || public.idg_enc(p_via)
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
  p_kind text, p_reason text, p_chars int, p_excerpt text,
  p_note_ref int, p_note_type text, p_ns text, p_rel_type text)
returns text language sql immutable parallel safe as $$
  select 'N' || public.idg_enc(p_note_kind) || public.idg_enc(p_part_name)
             || public.idg_enc(p_xml_path) || public.idg_enc(p_element)
             || public.idg_enc(p_kind) || public.idg_enc(p_reason)
             || public.idg_enc(case when p_chars is null then null else p_chars::text end)
             || public.idg_enc(p_excerpt)
             || public.idg_enc(case when p_note_ref is null then null else p_note_ref::text end)
             || public.idg_enc(p_note_type) || public.idg_enc(p_ns) || public.idg_enc(p_rel_type)
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
         select array_agg(public.idg_part(part_name, part_kind, content_type, bytes, sha256, walked, error, via))
           from public.source_inventory_parts where inventory_id = p_inventory), '{}'::text[]))
    || public.idg_section('blocks', coalesce((
         select array_agg(public.idg_block(part_name, part_kind, xml_path, source_block, source_order, structures, text))
           from public.source_inventory_blocks where inventory_id = p_inventory), '{}'::text[]))
    || public.idg_section('notes', coalesce((
         select array_agg(public.idg_note(note_kind, part_name, xml_path, element, kind, reason, chars, excerpt,
                                          note_ref, note_type, ns, rel_type))
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


-- ======== 0043_verification_canonical.sql ========
-- 0043_verification_canonical.sql
--
-- PHASE 3D, step 2 of 3: verification runs, individual findings, canonical sources
-- and canonical spans.
--
-- WHAT CHANGED FROM THE NEVER-APPLIED FIRST DRAFT
-- -----------------------------------------------
--   * findings are FIRST-CLASS ROWS, not only a jsonb blob. A supplemented span
--     cites the specific finding that authorized it, so "what permitted this text
--     to be added?" resolves to a row rather than to an array index.
--   * every relationship is COMPOSITE (id, company_id). Cross-wiring a span to
--     another tenant's canonical is now a foreign-key violation rather than
--     something RLS happens to hide.
--   * a run references a PERSISTED inventory, so canonical provenance never points
--     at evidence that exists only in memory.
--
-- OFFSET SEMANTICS
-- ----------------
-- transcript_start is 1-BASED UNICODE CHARACTERS, the coordinate system substr()
-- uses. It is NOT a JavaScript string index: JS counts UTF-16 units, so the two
-- diverge by one per astral character, and a validator mixing them would approve
-- the wrong slice on any document containing an emoji. Callers convert before
-- persisting; the column means what PostgreSQL means.
--
-- Run in Supabase -> SQL Editor AFTER 0042. Idempotent.

begin;

-- ============================================================
-- 1) VERIFICATION RUNS
-- ============================================================
create table if not exists public.verification_runs (
  id                  uuid primary key default gen_random_uuid(),
  document_id         uuid not null,
  company_id          uuid not null,
  transcript_id       uuid not null,
  inventory_id        uuid not null,

  run_status          text not null check (run_status in ('COMPLETED','FAILED')),
  verdict             text check (verdict in ('VERIFIED','DISCREPANCY','INDETERMINATE')),
  -- A run that could not execute has not earned a verdict, and vice versa. The
  -- constraint makes the pairing unforgeable rather than conventional.
  constraint verification_runs_verdict_ck
    check ((run_status = 'FAILED' and verdict is null) or (run_status = 'COMPLETED' and verdict is not null)),

  verifier            text not null,
  verifier_version    text not null,
  ruleset_version     text not null,

  transcript_sha256   text not null,
  inventory_digest    text not null,

  counts              jsonb not null default '{}'::jsonb,   -- summary only; rows are authoritative
  fatal               text,
  created_at          timestamptz not null default now(),

  constraint verification_runs_document_fk
    foreign key (document_id, company_id) references public.documents (id, company_id) on delete cascade,
  constraint verification_runs_transcript_fk
    foreign key (transcript_id, company_id) references public.source_transcripts (id, company_id) on delete cascade,
  constraint verification_runs_inventory_fk
    foreign key (inventory_id, company_id) references public.source_inventories (id, company_id) on delete cascade
);

create unique index if not exists verification_runs_id_company_key on public.verification_runs (id, company_id);
create index if not exists verification_runs_document_idx on public.verification_runs (document_id, created_at desc);

-- ============================================================
-- 2) VERIFICATION FINDINGS -- authoritative provenance
-- ============================================================
create table if not exists public.verification_findings (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null,
  company_id        uuid not null,

  category          text not null check (category in (
                      'MATCHED','LAYOUT_DIFFERENCE','INTENTIONALLY_IGNORED',
                      'MISSING_FROM_TRANSCRIPT','UNEXPECTED_IN_TRANSCRIPT',
                      'ORDER_DIFFERENCE','UNSUPPORTED_SOURCE_ELEMENT')),
  disposition       text check (disposition in ('SUPPLEMENTABLE','NON_SUPPLEMENTABLE')),
  severity          text check (severity in ('MATERIAL','INCIDENTAL')),

  part_name         text,
  part_kind         text,
  xml_path          text,
  source_block      int,
  source_order      int,
  chars             int not null default 0,

  -- Deterministic reconstruction ranges. 1-based characters, as above.
  transcript_start  int,
  transcript_length int,

  rule_id           text,                     -- the ignore rule, where one applied
  reason            text,
  excerpt           text,                     -- DIAGNOSTIC ONLY: never a text source
  created_at        timestamptz not null default now(),

  constraint verification_findings_run_fk
    foreign key (run_id, company_id) references public.verification_runs (id, company_id) on delete cascade,
  -- Only a MISSING finding can authorize adding text. Attaching SUPPLEMENTABLE to
  -- anything else would let an unrelated finding license a supplement.
  constraint verification_findings_disposition_ck
    check (disposition is null or category in ('MISSING_FROM_TRANSCRIPT','UNEXPECTED_IN_TRANSCRIPT',
                                               'ORDER_DIFFERENCE','UNSUPPORTED_SOURCE_ELEMENT')),
  constraint verification_findings_supplementable_ck
    check (disposition <> 'SUPPLEMENTABLE' or category = 'MISSING_FROM_TRANSCRIPT')
);

create unique index if not exists verification_findings_id_company_key on public.verification_findings (id, company_id);
create index if not exists verification_findings_run_idx on public.verification_findings (run_id, category);
create index if not exists verification_findings_addr_idx on public.verification_findings (run_id, part_name, source_block);

-- ============================================================
-- 3) CANONICAL SOURCES
-- ============================================================
create table if not exists public.canonical_sources (
  id                    uuid primary key default gen_random_uuid(),
  document_id           uuid not null,
  company_id            uuid not null,
  transcript_id         uuid not null,
  inventory_id          uuid not null,
  verification_run_id   uuid not null,

  composer              text not null,
  composer_version      text not null,
  composition_ruleset   text not null,

  serialized            text not null,
  region_offsets        jsonb not null default '[]'::jsonb,

  char_count            int  generated always as (length(serialized)) stored,        -- CHARACTERS
  byte_count            int  generated always as (octet_length(serialized)) stored,  -- UTF-8 bytes
  sha256                text generated always as (public.sha256_hex(serialized)) stored,

  created_at            timestamptz not null default now(),

  constraint canonical_sources_document_fk
    foreign key (document_id, company_id) references public.documents (id, company_id) on delete cascade,
  constraint canonical_sources_transcript_fk
    foreign key (transcript_id, company_id) references public.source_transcripts (id, company_id) on delete cascade,
  constraint canonical_sources_inventory_fk
    foreign key (inventory_id, company_id) references public.source_inventories (id, company_id) on delete cascade,
  constraint canonical_sources_run_fk
    foreign key (verification_run_id, company_id) references public.verification_runs (id, company_id) on delete cascade,
  constraint canonical_sources_text_ck check (length(serialized) > 0)
);

create unique index if not exists canonical_sources_id_company_key on public.canonical_sources (id, company_id);
-- A newer composer or ruleset produces a NEW version; nothing is ever replaced, so
-- a canonical someone relied on stays exactly as it was.
create unique index if not exists canonical_sources_version_uniq
  on public.canonical_sources (document_id, transcript_id, composer_version, composition_ruleset, sha256);
create index if not exists canonical_sources_document_idx on public.canonical_sources (document_id, created_at desc);

-- ============================================================
-- 3b) COMPOSITION RULES -- the ruleset, as data the database can check
-- ============================================================
-- A supplement span cites a rule. Until now the database stored that citation
-- without checking it, so "which rule allowed this text in?" was answered by the
-- caller rather than verified. Deriving the rule id by string arithmetic
-- ('supplement_' || part_kind) is not a fix: the composer's real ids are
-- supplement_headers for part kind 'header' and supplement_footers for 'footer',
-- so that shortcut rejects every legitimate header and footer supplement while
-- looking correct against a footnotes fixture.
--
-- The ruleset therefore lives here, as rows. A cited rule must exist, must cover
-- the part kind the source block actually came from, and must authorize the region
-- the span was placed in.
create table if not exists public.composition_rules (
  rule_id          text not null,
  rule_version     text not null,
  ruleset_version  text not null,
  part_kind        text not null,
  region_kind      text not null check (region_kind in ('body','footnotes','endnotes','headers','footers')),
  why              text not null,
  created_at       timestamptz not null default now(),
  primary key (rule_id, rule_version),
  -- One rule per part kind per ruleset: a part kind with two rules would make
  -- "which rule applies?" a choice rather than a determination.
  constraint composition_rules_partkind_uniq unique (ruleset_version, part_kind)
);

-- Mirrors COMPOSITION_RULES in api/_canonicalSource.js. There is deliberately no
-- rule for body text: if an engine loses a body paragraph, where it belonged is not
-- deterministically recoverable from a part boundary, so no rule can honestly
-- authorize putting it back.
insert into public.composition_rules (rule_id, rule_version, ruleset_version, part_kind, region_kind, why) values
  ('supplement_footnotes','1.0.0','1.0.0','footnotes','footnotes',
   'footnote parts are self-delimiting: each w:footnote is a complete unit in its own region'),
  ('supplement_endnotes','1.0.0','1.0.0','endnotes','endnotes',
   'endnote parts are self-delimiting in the same way'),
  ('supplement_headers','1.0.0','1.0.0','header','headers',
   'a header part is a complete region; its text needs no position inside the body'),
  ('supplement_footers','1.0.0','1.0.0','footer','footers',
   'a footer part is a complete region')
on conflict (rule_id, rule_version) do nothing;

-- A cited rule must keep saying what it said. Rewriting or removing one would
-- retroactively change the meaning of every canonical that cites it, so the rule
-- table is append-only too -- a new ruleset version is the way to change a rule.
drop trigger if exists composition_rules_immutable on public.composition_rules;
create trigger composition_rules_immutable before update or delete on public.composition_rules
  for each row execute function public.phase3_append_only();

drop trigger if exists composition_rules_no_truncate on public.composition_rules;
create trigger composition_rules_no_truncate before truncate on public.composition_rules
  for each statement execute function public.phase3_no_truncate();

alter table public.composition_rules enable row level security;
drop policy if exists composition_rules_read on public.composition_rules;
create policy composition_rules_read on public.composition_rules for select to authenticated using (true);
revoke all on public.composition_rules from anon;
revoke all on public.composition_rules from authenticated;
grant select on public.composition_rules to authenticated;

-- ============================================================
-- 3c) A COMPOSITE KEY THIS MIGRATION NEEDS FROM 0042'S TABLE
-- ============================================================
-- canonical_spans references source_inventory_blocks (id, company_id), and
-- PostgreSQL requires a UNIQUE key on exactly those columns before it will accept
-- the foreign key. 0042 created the table without one, so applying 0043 failed
-- with 42830 until this existed.
--
-- It is created HERE, by the migration that needs it, rather than by rewriting
-- the already-applied 0042 -- the same pattern 0042 itself used when it added
-- source_transcripts_id_company_key to a table 0041 owns. Doing it here also
-- means a fresh database in numeric order gets the key before 0043 declares the
-- foreign key that depends on it.
create unique index if not exists source_inventory_blocks_id_company_key
  on public.source_inventory_blocks (id, company_id);

-- ============================================================
-- 4) CANONICAL SPANS -- the authoritative structure
-- ============================================================
create table if not exists public.canonical_spans (
  id                       uuid primary key default gen_random_uuid(),
  canonical_id             uuid not null,
  company_id               uuid not null,

  canonical_order          int  not null,
  region_kind              text not null check (region_kind in ('body','footnotes','endnotes','headers','footers')),
  text                     text not null,

  part_name                text,
  part_kind                text,
  xml_path                 text,
  source_block             int,
  source_order             int,
  structures               jsonb not null default '[]'::jsonb,

  engine_extracted         boolean not null,
  origin                   text not null check (origin in ('engine','supplement')),

  -- engine spans: where in the immutable transcript this text came from
  transcript_start         int,
  transcript_length        int,

  -- supplement spans: the block copied from, and the finding + rule that allowed it
  inventory_block_id       uuid,
  authorizing_finding_id   uuid,
  composition_rule_id      text,
  composition_rule_version text,

  created_at               timestamptz not null default now(),

  constraint canonical_spans_canonical_fk
    foreign key (canonical_id, company_id) references public.canonical_sources (id, company_id) on delete cascade,
  constraint canonical_spans_block_fk
    foreign key (inventory_block_id, company_id) references public.source_inventory_blocks (id, company_id) on delete restrict,
  constraint canonical_spans_finding_fk
    foreign key (authorizing_finding_id, company_id) references public.verification_findings (id, company_id) on delete restrict,
  -- A cited rule must be a rule that exists, at the version cited. Outside the RPC
  -- as well as inside it.
  constraint canonical_spans_rule_fk
    foreign key (composition_rule_id, composition_rule_version)
    references public.composition_rules (rule_id, rule_version) on delete restrict,

  -- The shape of a span is decided by its origin, and each origin owes a different
  -- debt: an engine span must point into the transcript; a supplement must name the
  -- block it copied, the finding that authorized it, and the rule that applied.
  constraint canonical_spans_origin_ck check (
    (origin = 'engine' and engine_extracted
       and transcript_start is not null and transcript_length is not null
       and inventory_block_id is null and authorizing_finding_id is null
       and composition_rule_id is null)
    or
    (origin = 'supplement' and not engine_extracted
       and inventory_block_id is not null and authorizing_finding_id is not null
       and composition_rule_id is not null and composition_rule_version is not null
       and transcript_start is null and transcript_length is null)
  ),
  constraint canonical_spans_order_uniq unique (canonical_id, canonical_order),
  constraint canonical_spans_order_nonneg check (canonical_order >= 0),
  constraint canonical_spans_text_ck check (length(text) > 0)
);

create unique index if not exists canonical_spans_id_company_key on public.canonical_spans (id, company_id);
create index if not exists canonical_spans_canonical_idx on public.canonical_spans (canonical_id, canonical_order);

-- ============================================================
-- 5) IMMUTABILITY + RLS (read-only for clients; writes via 0044 RPCs)
-- ============================================================
-- Defined here as well as in 0045 so this file stands alone: a fresh database
-- applying 0042, 0043, 0044, 0045 in numeric order must end in the same state as
-- the remedial order (0042, 0045, 0043, 0044) used in production. `create or
-- replace` makes the duplication idempotent, and scripts/audit-sync.mjs asserts
-- the two copies are identical so they cannot drift.
create or replace function public.phase3_no_truncate()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only; it cannot be truncated', tg_table_name
    using errcode = '42501',
          hint = 'TRUNCATE bypasses row-level security and row triggers, which is '
                 'exactly why this statement-level guard exists. Evidence is not erasable.';
end $$;

do $$
declare t text;
begin
  foreach t in array array['verification_runs','verification_findings','canonical_sources','canonical_spans']
  loop
    execute format('drop trigger if exists %I_immutable on public.%I', t, t);
    execute format('create trigger %I_immutable before update or delete on public.%I for each row execute function public.phase3_append_only()', t, t);
    -- TRUNCATE is restricted by neither RLS nor row-level triggers, so the row
    -- guard above does not cover it. See 0045.
    execute format('drop trigger if exists %I_no_truncate on public.%I', t, t);
    execute format('create trigger %I_no_truncate before truncate on public.%I for each statement execute function public.phase3_no_truncate()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%I_read" on public.%I', t, t);
    execute format('create policy "%I_read" on public.%I for select to authenticated using (public.can_touch_company(company_id))', t, t);
    -- Supabase default privileges grant ALL on new tables in schema public to
    -- anon and authenticated. Revoke HERE rather than leaving it to 0044, so no
    -- state between the two migrations has evidence writable by grant.
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- No INSERT policy, no UPDATE policy, no DELETE policy, no anon policy on any of
-- the four. Every write goes through the trusted boundary in 0044.

comment on table public.verification_findings is
  'Individual findings as first-class append-only rows. A supplemented canonical '
  'span cites the finding that authorized it. `excerpt` is diagnostic only and is '
  'never a source of text -- supplements copy from source_inventory_blocks.';
comment on column public.canonical_spans.transcript_start is
  '1-BASED UNICODE CHARACTER offset into the engine transcript, the coordinate '
  'system substr() uses. Not a JavaScript UTF-16 index.';

commit;


-- ======== 0044_persist_rpcs.sql ========
-- 0044_persist_rpcs.sql
--
-- PHASE 3D, step 3 of 3: the two trusted transactional write boundaries.
--
-- WHY RPCs RATHER THAN CONSTRAINTS
-- --------------------------------
-- An audit of the first draft established that a well-formed forged canonical was
-- accepted: RLS checks WHO you are, CHECK constraints check a row in isolation, and
-- neither can answer "do these spans actually reconstruct this serialized text, and
-- does this supplement's text actually appear in the package?" Those are questions
-- about a WHOLE WRITE, and a whole write is what a function can see.
--
-- Two boundaries, because evidence and conclusion must not be created together:
--
--   persist_verification()  writes inventory + run + findings atomically
--   persist_canonical()     may only CITE those rows; it never creates evidence
--                           that authorizes itself
--
-- Both are SECURITY DEFINER and both re-check authorization with
-- can_touch_company() against the caller's own auth.uid(). Direct INSERT is granted
-- to nobody, so a client cannot compose a row by hand.
--
-- Everything inside a function body is one transaction: any RAISE rolls the whole
-- write back, so a parent can never survive without its children.
--
-- Run AFTER 0042 and 0043. Idempotent.

begin;

-- ============================================================
-- 1) persist_verification(payload jsonb) -> uuid (the run id)
-- ============================================================
-- payload = {
--   document_id, transcript_id,
--   inventory: { engine, engine_version, package_sha256, digest, stats,
--                parts: [...], blocks: [...], notes: [...] },
--   run: { run_status, verdict, verifier, verifier_version, ruleset_version,
--          transcript_sha256, counts, fatal },
--   findings: [...]
-- }
create or replace function public.persist_verification(payload jsonb)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company     uuid;
  v_document    uuid := (payload->>'document_id')::uuid;
  v_transcript  uuid := (payload->>'transcript_id')::uuid;
  v_inventory   uuid;
  v_run         uuid;
  v_digest      text;
  v_tsha        text;
  v_status      text := payload->'run'->>'run_status';
  v_verdict     text := payload->'run'->>'verdict';
  b             jsonb;
begin
  -- Same contract discipline as persist_canonical: an undefined field is refused,
  -- never ignored. Digest and tenant are DERIVED here, so a caller supplying either
  -- is operating on a misunderstanding worth surfacing.
  if exists (select 1 from jsonb_object_keys(payload) k where k not in
               ('document_id','transcript_id','inventory','run','findings')) then
    raise exception 'unrecognised field(s) in payload: %',
      (select string_agg(k, ', ') from jsonb_object_keys(payload) k where k not in
        ('document_id','transcript_id','inventory','run','findings'))
      using errcode = '22023';
  end if;

  if v_document is null or v_transcript is null then
    raise exception 'document_id and transcript_id are required' using errcode = '22023';
  end if;

  -- Tenant comes from the DOCUMENT, never from the payload: a caller must not be
  -- able to nominate which company a row belongs to.
  select company_id into v_company from public.documents where id = v_document;
  if v_company is null then raise exception 'unknown document' using errcode = '23503'; end if;
  if not public.can_touch_company(v_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  -- The transcript must belong to the same document AND company.
  select sha256 into v_tsha from public.source_transcripts
   where id = v_transcript and document_id = v_document and company_id = v_company;
  if v_tsha is null then
    raise exception 'transcript does not belong to this document' using errcode = '23503';
  end if;
  if (payload->'run'->>'transcript_sha256') is distinct from v_tsha then
    raise exception 'run transcript hash does not match the stored transcript' using errcode = '22023';
  end if;

  insert into public.source_inventories
    (document_id, company_id, transcript_id, engine, engine_version, package_sha256, digest, stats)
  values (v_document, v_company, v_transcript,
          payload->'inventory'->>'engine', payload->'inventory'->>'engine_version',
          payload->'inventory'->>'package_sha256', payload->'inventory'->>'digest',
          coalesce(payload->'inventory'->'stats', '{}'::jsonb))
  returning id into v_inventory;

  insert into public.source_inventory_parts
    (inventory_id, company_id, part_name, part_kind, content_type, bytes, sha256, walked, error, via)
  select v_inventory, v_company, p->>'part_name', p->>'part_kind', p->>'content_type',
         (p->>'bytes')::bigint, p->>'sha256', coalesce((p->>'walked')::boolean, false), p->>'error',
         p->>'via'
    from jsonb_array_elements(coalesce(payload->'inventory'->'parts', '[]'::jsonb)) p;

  insert into public.source_inventory_blocks
    (inventory_id, company_id, part_name, part_kind, xml_path, source_block, source_order, structures, text)
  select v_inventory, v_company, b2->>'part_name', b2->>'part_kind', b2->>'xml_path',
         (b2->>'source_block')::int, (b2->>'source_order')::int,
         coalesce(b2->'structures', '[]'::jsonb), b2->>'text'
    from jsonb_array_elements(coalesce(payload->'inventory'->'blocks', '[]'::jsonb)) b2;

  insert into public.source_inventory_notes
    (inventory_id, company_id, note_kind, part_name, xml_path, element, kind, reason, chars, excerpt,
     note_ref, note_type, ns, rel_type)
  select v_inventory, v_company, n->>'note_kind', n->>'part_name', n->>'xml_path', n->>'element',
         n->>'kind', n->>'reason', coalesce((n->>'chars')::int, 0), n->>'excerpt',
         (n->>'note_ref')::int, n->>'note_type', n->>'ns', n->>'rel_type'
    from jsonb_array_elements(coalesce(payload->'inventory'->'notes', '[]'::jsonb)) n;

  -- Recompute the inventory digest from what was actually STORED. A digest the
  -- caller supplies is a claim; one derived from the persisted rows is a fact, and
  -- the canonical step binds to it.
  --
  -- inventory-digest-v1 covers the COMPLETE manifest -- parts, blocks and notes.
  -- The earlier blocks-only digest left a part's walked flag, a part's error and
  -- every note unbound, so an inventory could be rewritten in ways that change what
  -- its verdict means while still matching its recorded digest.
  v_digest := public.inventory_digest(v_inventory);

  if v_digest is distinct from (payload->'inventory'->>'digest') then
    raise exception 'inventory digest does not match the manifest supplied (stored % vs claimed %)',
      left(coalesce(v_digest,'null'),16), left(coalesce(payload->'inventory'->>'digest','null'),16)
      using errcode = '22023';
  end if;

  insert into public.verification_runs
    (document_id, company_id, transcript_id, inventory_id, run_status, verdict,
     verifier, verifier_version, ruleset_version, transcript_sha256, inventory_digest, counts, fatal)
  values (v_document, v_company, v_transcript, v_inventory, v_status, v_verdict,
          payload->'run'->>'verifier', payload->'run'->>'verifier_version',
          payload->'run'->>'ruleset_version', v_tsha, v_digest,
          coalesce(payload->'run'->'counts', '{}'::jsonb), payload->'run'->>'fatal')
  returning id into v_run;

  insert into public.verification_findings
    (run_id, company_id, category, disposition, severity, part_name, part_kind, xml_path,
     source_block, source_order, chars, transcript_start, transcript_length, rule_id, reason, excerpt)
  select v_run, v_company, f->>'category', f->>'disposition', f->>'severity',
         f->>'part_name', f->>'part_kind', f->>'xml_path',
         (f->>'source_block')::int, (f->>'source_order')::int, coalesce((f->>'chars')::int, 0),
         (f->>'transcript_start')::int, (f->>'transcript_length')::int,
         f->>'rule_id', f->>'reason', f->>'excerpt'
    from jsonb_array_elements(coalesce(payload->'findings', '[]'::jsonb)) f;

  -- Every SUPPLEMENTABLE finding must resolve to exactly one stored block, or the
  -- canonical step could never satisfy it and the evidence is malformed now.
  if exists (
    select 1 from public.verification_findings vf
     where vf.run_id = v_run and vf.disposition = 'SUPPLEMENTABLE'
       and (select count(*) from public.source_inventory_blocks sb
             where sb.inventory_id = v_inventory and sb.part_name = vf.part_name
               and sb.source_block is not distinct from vf.source_block) <> 1
  ) then
    raise exception 'a SUPPLEMENTABLE finding does not resolve to exactly one inventory block'
      using errcode = '22023';
  end if;

  return v_run;
end $$;

-- ============================================================
-- 2) persist_canonical(payload jsonb) -> uuid (the canonical id)
-- ============================================================
-- payload = { verification_run_id, composer, composer_version, composition_ruleset,
--             region_offsets, spans: [...] }
--
-- `serialized` is NOT accepted from the caller. It is RECONSTRUCTED from the spans
-- by the database, which is the only way "the spans reconstruct the text" can be a
-- fact rather than an assertion.
create or replace function public.persist_canonical(payload jsonb)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_run        uuid := (payload->>'verification_run_id')::uuid;
  r            public.verification_runs%rowtype;
  v_canonical  uuid;
  v_serialized text;
  v_expected   int;
  s            jsonb;
  v_region     text;
  v_regions    text[] := array['body','footnotes','endnotes','headers','footers'];
  v_block      public.source_inventory_blocks%rowtype;
  v_finding    public.verification_findings%rowtype;
  v_rule       public.composition_rules%rowtype;
  v_tt         text;
  v_offsets    jsonb := '[]'::jsonb;
  v_off        int := 0;
  v_chunk      text;
  v_chunks     text[] := '{}';
begin
  -- Reject any field the contract does not define.
  --
  -- The audit caught this: a payload carrying `serialized` was ACCEPTED, because
  -- the function simply ignored the key and reconstructed from spans. The stored
  -- text was correct, so nothing was forged -- but the caller got a success for an
  -- operation that did something other than what it asked for, and a client that
  -- believes it supplied the serialization has no way to learn otherwise. Refusing
  -- is the honest answer; ignoring is the dangerous one.
  if exists (select 1 from jsonb_object_keys(payload) k where k not in
               ('verification_run_id','composer','composer_version','composition_ruleset',
                'region_offsets','spans')) then
    raise exception 'unrecognised field(s) in payload: %; serialized is RECONSTRUCTED from spans and may not be supplied',
      (select string_agg(k, ', ') from jsonb_object_keys(payload) k where k not in
        ('verification_run_id','composer','composer_version','composition_ruleset','region_offsets','spans'))
      using errcode = '22023';
  end if;

  select * into r from public.verification_runs where id = v_run;
  if r.id is null then raise exception 'unknown verification run' using errcode = '23503'; end if;
  if not public.can_touch_company(r.company_id) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  -- Eligibility. A canonical may only be built on a run that completed and reached
  -- a verdict that authorizes it.
  if r.run_status <> 'COMPLETED' then
    raise exception 'verification did not complete; no canonical may be composed' using errcode = '22023';
  end if;
  if r.verdict not in ('VERIFIED','DISCREPANCY') then
    raise exception 'verdict % does not authorize composition', r.verdict using errcode = '22023';
  end if;

  -- Nothing unrecoverable may remain outstanding.
  if exists (select 1 from public.verification_findings f
              where f.run_id = v_run
                and f.category in ('UNEXPECTED_IN_TRANSCRIPT','ORDER_DIFFERENCE','UNSUPPORTED_SOURCE_ELEMENT')) then
    raise exception 'findings that cannot be recovered deterministically are outstanding' using errcode = '22023';
  end if;
  if exists (select 1 from public.verification_findings f
              where f.run_id = v_run and f.category = 'MISSING_FROM_TRANSCRIPT'
                and coalesce(f.disposition,'') <> 'SUPPLEMENTABLE') then
    raise exception 'a missing-content finding is not SUPPLEMENTABLE' using errcode = '22023';
  end if;

  select transcript_text into v_tt from public.source_transcripts where id = r.transcript_id;

  -- Spans are STAGED first. Building the parent last means its generated sha256 and
  -- char_count describe a reconstruction the database performed from validated
  -- spans -- and it means no UPDATE is ever needed, so the append-only trigger
  -- stays absolute rather than needing an exemption.
  -- Staging table defined EXPLICITLY, not with LIKE.
  -- CREATE TABLE ... LIKE always copies NOT NULL, so a LIKE-derived stage would
  -- inherit canonical_id NOT NULL and reject every staged row -- the parent id is
  -- precisely the one value staging cannot know yet.
  create temporary table if not exists _stage_spans (
    company_id uuid, canonical_order int, region_kind text, text text,
    part_name text, part_kind text, xml_path text, source_block int, source_order int,
    structures jsonb, engine_extracted boolean, origin text,
    transcript_start int, transcript_length int,
    inventory_block_id uuid, authorizing_finding_id uuid,
    composition_rule_id text, composition_rule_version text
  ) on commit drop;
  delete from _stage_spans;

  -- Spans, validated one at a time against the evidence.
  v_expected := 0;
  for s in select value from jsonb_array_elements(coalesce(payload->'spans','[]'::jsonb)) loop
    if (s->>'canonical_order')::int <> v_expected then
      raise exception 'canonical_order must be dense from 0; expected % got %',
        v_expected, s->>'canonical_order' using errcode = '22023';
    end if;
    v_expected := v_expected + 1;

    if (s->>'origin') = 'engine' then
      -- The text must BE the transcript slice it claims. 1-based characters.
      if substr(v_tt, (s->>'transcript_start')::int, (s->>'transcript_length')::int) is distinct from (s->>'text') then
        raise exception 'engine span % does not match the transcript slice it cites', s->>'canonical_order'
          using errcode = '22023';
      end if;
      insert into _stage_spans
        (company_id, canonical_order, region_kind, text, part_name, part_kind, xml_path,
         source_block, source_order, structures, engine_extracted, origin, transcript_start, transcript_length)
      values (r.company_id, (s->>'canonical_order')::int, s->>'region_kind', s->>'text',
              s->>'part_name', s->>'part_kind', s->>'xml_path', (s->>'source_block')::int,
              (s->>'source_order')::int, coalesce(s->'structures','[]'::jsonb),
              true, 'engine', (s->>'transcript_start')::int, (s->>'transcript_length')::int);

    elsif (s->>'origin') = 'supplement' then
      -- The block must exist in THIS run's inventory, at the address claimed.
      select * into v_block from public.source_inventory_blocks
       where inventory_id = r.inventory_id and part_name = s->>'part_name'
         and source_block is not distinct from (s->>'source_block')::int;
      if v_block.id is null then
        raise exception 'supplement span % cites an inventory block that does not exist', s->>'canonical_order'
          using errcode = '23503';
      end if;
      -- ...and the text must be that block's text, exactly. This is the check the
      -- whole architecture exists for: one character of drift is a different hash
      -- and a different document.
      if v_block.text is distinct from (s->>'text') then
        raise exception 'supplement span % text differs from its inventory source', s->>'canonical_order'
          using errcode = '22023';
      end if;
      -- ...and a SUPPLEMENTABLE finding from THIS run must authorize it.
      select * into v_finding from public.verification_findings
       where run_id = v_run and category = 'MISSING_FROM_TRANSCRIPT' and disposition = 'SUPPLEMENTABLE'
         and part_name = s->>'part_name' and source_block is not distinct from (s->>'source_block')::int;
      if v_finding.id is null then
        raise exception 'no SUPPLEMENTABLE finding authorizes supplement span %', s->>'canonical_order'
          using errcode = '22023';
      end if;
      -- A caller that NAMES a finding must name the one that actually authorizes
      -- this span. Resolving by address and quietly overwriting a disagreeing id
      -- would return success for an operation other than the one requested --
      -- the same failure class as accepting an invented `serialized`.
      if (s->>'authorizing_finding_id') is not null
         and (s->>'authorizing_finding_id')::uuid is distinct from v_finding.id then
        raise exception 'span % cites finding %, but the finding that authorizes it is %',
          s->>'canonical_order', s->>'authorizing_finding_id', v_finding.id
          using errcode = '22023';
      end if;

      -- ...and the rule it cites must be a real rule, at the cited version, from
      -- the ruleset this canonical claims, covering the kind of part the block came
      -- from, authorizing the region the span was placed in. Four separate things,
      -- because a citation that is right about three of them and wrong about the
      -- fourth is still text placed somewhere no rule allows.
      select * into v_rule from public.composition_rules
       where rule_id = s->>'composition_rule_id'
         and rule_version = s->>'composition_rule_version';
      if v_rule.rule_id is null then
        raise exception 'span % cites composition rule %@%, which does not exist',
          s->>'canonical_order', s->>'composition_rule_id', s->>'composition_rule_version'
          using errcode = '23503';
      end if;
      if v_rule.ruleset_version is distinct from (payload->>'composition_ruleset') then
        raise exception 'span % cites rule % from ruleset %, but this canonical claims ruleset %',
          s->>'canonical_order', v_rule.rule_id, v_rule.ruleset_version, payload->>'composition_ruleset'
          using errcode = '22023';
      end if;
      if v_rule.part_kind is distinct from v_block.part_kind then
        raise exception 'span % cites rule %, which covers % parts, but its source block is a % part',
          s->>'canonical_order', v_rule.rule_id, v_rule.part_kind, coalesce(v_block.part_kind,'(null)')
          using errcode = '22023';
      end if;
      if v_rule.region_kind is distinct from (s->>'region_kind') then
        raise exception 'span % is placed in region %, but rule % authorizes region %',
          s->>'canonical_order', s->>'region_kind', v_rule.rule_id, v_rule.region_kind
          using errcode = '22023';
      end if;

      insert into _stage_spans
        (company_id, canonical_order, region_kind, text, part_name, part_kind, xml_path,
         source_block, source_order, structures, engine_extracted, origin,
         inventory_block_id, authorizing_finding_id, composition_rule_id, composition_rule_version)
      values (r.company_id, (s->>'canonical_order')::int, s->>'region_kind', s->>'text',
              s->>'part_name', s->>'part_kind', s->>'xml_path', (s->>'source_block')::int,
              (s->>'source_order')::int, coalesce(s->'structures','[]'::jsonb),
              false, 'supplement', v_block.id, v_finding.id,
              s->>'composition_rule_id', s->>'composition_rule_version');
    else
      raise exception 'span % has an unknown origin', s->>'canonical_order' using errcode = '22023';
    end if;
  end loop;

  if v_expected = 0 then
    raise exception 'a canonical with no spans is not a canonical' using errcode = '22023';
  end if;

  -- Every SUPPLEMENTABLE finding must have been satisfied by exactly one span. This
  -- is the reciprocal check: iterating spans answers "was each span legitimate", not
  -- "was each authorized recovery actually performed".
  if exists (
    select 1 from public.verification_findings f
     where f.run_id = v_run and f.disposition = 'SUPPLEMENTABLE'
       and (select count(*) from _stage_spans cs where cs.authorizing_finding_id = f.id) <> 1
  ) then
    raise exception 'an authorized recovery was not performed exactly once' using errcode = '22023';
  end if;

  -- Reconstruct the serialization FROM THE STORED SPANS, in fixed region order.
  foreach v_region in array v_regions loop
    select string_agg(text, E'\n' order by canonical_order) into v_chunk
      from _stage_spans where region_kind = v_region;
    if v_chunk is not null then
      v_chunks := v_chunks || v_chunk;
      v_offsets := v_offsets || jsonb_build_object('kind', v_region, 'start', v_off, 'end', v_off + length(v_chunk));
      v_off := v_off + length(v_chunk) + 2;   -- the E'\n\n' joiner
    end if;
  end loop;
  v_serialized := array_to_string(v_chunks, E'\n\n');

  if payload ? 'region_offsets' and payload->'region_offsets' <> '[]'::jsonb
     and not ((payload->'region_offsets') @> v_offsets and v_offsets @> (payload->'region_offsets')) then
    raise exception 'supplied region_offsets do not match the reconstruction' using errcode = '22023';
  end if;

  -- Write the parent with the reconstruction the DATABASE built, then promote the
  -- staged spans. The generated sha256/char_count therefore describe text derived
  -- from validated spans, never text a caller asserted.
  insert into public.canonical_sources
    (document_id, company_id, transcript_id, inventory_id, verification_run_id,
     composer, composer_version, composition_ruleset, serialized, region_offsets)
  values (r.document_id, r.company_id, r.transcript_id, r.inventory_id, v_run,
          payload->>'composer', payload->>'composer_version', payload->>'composition_ruleset',
          v_serialized, v_offsets)
  returning id into v_canonical;

  insert into public.canonical_spans
    (canonical_id, company_id, canonical_order, region_kind, text, part_name, part_kind, xml_path,
     source_block, source_order, structures, engine_extracted, origin,
     transcript_start, transcript_length, inventory_block_id, authorizing_finding_id,
     composition_rule_id, composition_rule_version)
  select v_canonical, company_id, canonical_order, region_kind, text, part_name, part_kind, xml_path,
         source_block, source_order, structures, engine_extracted, origin,
         transcript_start, transcript_length, inventory_block_id, authorizing_finding_id,
         composition_rule_id, composition_rule_version
    from _stage_spans order by canonical_order;

  return v_canonical;
end $$;

-- ============================================================
-- 3) THE TRUST BOUNDARY
-- ============================================================
revoke all on public.source_inventories, public.source_inventory_parts,
               public.source_inventory_blocks, public.source_inventory_notes,
               public.verification_runs, public.verification_findings,
               public.canonical_sources, public.canonical_spans from anon, authenticated;
grant select on public.source_inventories, public.source_inventory_parts,
                public.source_inventory_blocks, public.source_inventory_notes,
                public.verification_runs, public.verification_findings,
                public.canonical_sources, public.canonical_spans to authenticated;

revoke all on function public.persist_verification(jsonb) from public, anon;
revoke all on function public.persist_canonical(jsonb) from public, anon;
grant execute on function public.persist_verification(jsonb) to authenticated;
grant execute on function public.persist_canonical(jsonb) to authenticated;

commit;

-- ============================================================
-- VERIFY
-- ============================================================
--   select to_regprocedure('public.persist_verification(jsonb)'),
--          to_regprocedure('public.persist_canonical(jsonb)');
--   -- direct insert must be denied for authenticated (expect 42501):
--   set role authenticated;
--   insert into public.canonical_sources (document_id, company_id, transcript_id, inventory_id,
--          verification_run_id, composer, composer_version, composition_ruleset, serialized)
--   values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
--           gen_random_uuid(), 'x','1','1','forged');
--   reset role;


-- ======== 0045_phase3_privilege_hardening.sql ========
-- 0045_phase3_privilege_hardening.sql
--
-- REMEDIAL. Closes two gaps found in production AFTER 0042 was applied.
-- 0042 is already live and is NOT rewritten; this migration corrects the state
-- 0042 left behind.
--
-- WHAT WENT WRONG
-- ---------------
-- 1. Supabase configures default privileges on schema public, so the four new
--    inventory tables were created with ALL privileges granted to `anon` AND
--    `authenticated`:
--
--        DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
--    0042 contains no REVOKE. The only revoke lives in 0044, so every state
--    between the two left evidence tables writable-by-grant, restrained solely
--    by RLS. The isolated audit never caught it because the audit schema does
--    not inherit those defaults, and the audit additionally performed a blanket
--    revoke immediately after creating its tables -- which modelled the intended
--    end state rather than what the migration actually does.
--
-- 2. TRUNCATE was among those privileges, and TRUNCATE is not restricted by RLS
--    and does not fire row-level triggers. The append-only guard is
--    BEFORE UPDATE OR DELETE ... FOR EACH ROW, so a TRUNCATE would have erased
--    the evidence without the guard running once. The guarantee recorded in
--    docs/OPERATIONAL_CONSTRAINTS.md (OC-1) was therefore not absolute: it was
--    absolute against DELETE, which is the only verb the audit attempted.
--
-- Neither gap exposed data -- the tables are empty, and RLS refused an anon
-- INSERT in production (401 / 42501) -- but both are closed here rather than
-- carried forward.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- It does not touch `service_role`. That role's privileges are inspected
-- separately (supabase/audit/inspect_0042_privileges.sql) because the trusted
-- persistence path may depend on them, and a revoke made on assumption is how
-- the next outage starts. service_role is restrained by the triggers below,
-- which fire for every role regardless of privilege.
--
-- It does not alter the existing UPDATE/DELETE protection, RLS, policies, or
-- anything outside the four tables and nine functions 0042 created.
--
-- Run in Supabase -> SQL Editor AFTER 0042. Idempotent.

begin;

-- ============================================================
-- 1) TRUNCATE PROTECTION
-- ============================================================
-- Statement-level, because TRUNCATE has no rows to offer a row-level trigger.
-- It is a SEPARATE function from phase3_append_only() rather than a branch
-- inside it: that function reads OLD, which does not exist in a TRUNCATE
-- trigger, and widening it would put a NULL-reference hazard in the guard that
-- protects everything else.
create or replace function public.phase3_no_truncate()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only; it cannot be truncated', tg_table_name
    using errcode = '42501',
          hint = 'TRUNCATE bypasses row-level security and row triggers, which is '
                 'exactly why this statement-level guard exists. Evidence is not erasable.';
end $$;

comment on function public.phase3_no_truncate() is
  'Statement-level TRUNCATE guard for Phase 3 evidence. Fires for every role, '
  'including service_role, because TRUNCATE is restricted by neither RLS nor '
  'row-level triggers.';

-- ============================================================
-- 2) THE FOUR TABLES 0042 CREATED
-- ============================================================
-- Intended privileges are taken from the architecture, not from what Supabase
-- happened to grant:
--   anon          -> nothing. No Phase 3 evidence is ever public.
--   authenticated -> SELECT only, scoped by the existing RLS policy. This is the
--                    same grant 0044 settles on; applying it here means the
--                    0042 -> 0045 state is already correct rather than waiting
--                    for a later migration to fix it.
-- Writes for every role go through the SECURITY DEFINER RPCs in 0044.
do $$
declare t text;
begin
  foreach t in array array['source_inventories','source_inventory_parts',
                           'source_inventory_blocks','source_inventory_notes']
  loop
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);

    execute format('drop trigger if exists %I_no_truncate on public.%I', t, t);
    execute format('create trigger %I_no_truncate before truncate on public.%I
                    for each statement execute function public.phase3_no_truncate()', t, t);
  end loop;
end $$;

-- ============================================================
-- 3) THE NINE FUNCTIONS 0042 CREATED
-- ============================================================
-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default, so these
-- were callable by anon and authenticated. The finding was broader than tables.
--
-- None of them should be reachable from a client:
--   * idg_* are the digest encoders. Exposing them lets a caller compute what a
--     manifest WOULD hash to, which is a forgery-shaped tool and no use to a
--     legitimate client.
--   * inventory_digest() reads the evidence tables. It is SECURITY INVOKER so
--     RLS still applies, but there is no reason for a client to call it.
--   * the trigger guards are not callable meaningfully at all.
--
-- The SECURITY DEFINER RPCs in 0044 are owned by the same role that owns these
-- functions, and an owner keeps its own rights, so revoking from PUBLIC does not
-- affect the trusted path. Trigger execution is likewise unaffected: EXECUTE is
-- checked when a trigger is created, not each time it fires.
revoke all on function public.idg_enc(text)                                                  from public, anon, authenticated;
revoke all on function public.idg_arr(jsonb)                                                 from public, anon, authenticated;
revoke all on function public.idg_bool(boolean)                                              from public, anon, authenticated;
revoke all on function public.idg_part(text, text, text, bigint, text, boolean, text, text)  from public, anon, authenticated;
revoke all on function public.idg_block(text, text, text, int, int, jsonb, text)             from public, anon, authenticated;
revoke all on function public.idg_note(text, text, text, text, text, text, int, text,
                                       int, text, text, text)                                from public, anon, authenticated;
revoke all on function public.idg_section(text, text[])                                      from public, anon, authenticated;
revoke all on function public.inventory_digest(uuid)                                         from public, anon, authenticated;
revoke all on function public.phase3_append_only()                                           from public, anon, authenticated;
revoke all on function public.phase3_no_truncate()                                           from public, anon, authenticated;

commit;

-- ============================================================
-- AFTERWARDS
-- ============================================================
-- Verify with:
--   node scripts/verify-migration.mjs 0042   (re-run: the grant rows must now pass)
--   supabase/audit/inspect_0042_privileges.sql
--
-- 0043 carries the same revoke/grant/TRUNCATE-trigger logic for the tables IT
-- creates, so applying it cannot reopen this gap. A fresh database run in
-- numeric order (0042, 0043, 0044, 0045) ends in the same state as the
-- deployment order used here (0042, 0045, 0043, 0044).


-- ======== 0046_service_role_no_direct_writes.sql ========
-- 0046_service_role_no_direct_writes.sql
--
-- Closes the last direct-write bypass of the Phase 3 validation boundary.
--
-- THE INTENDED BOUNDARY
-- ---------------------
--   application/server -> validated persistence RPC -> immutable evidence tables
--
-- No application role should be able to step around the RPCs and write evidence
-- directly, because every check that makes evidence trustworthy -- digest
-- recomputation, span/transcript comparison, supplement authorization, the
-- reciprocal finding check -- lives inside those functions. A direct INSERT
-- produces rows that look identical to validated ones and are not.
--
-- WHAT PRODUCTION ACTUALLY SHOWED (probe_service_role_path.sql)
-- -------------------------------------------------------------
--   * anon           holds nothing on the nine evidence tables.
--   * authenticated  holds SELECT only. It already cannot write directly.
--   * service_role   holds DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
--                    TRUNCATE, UPDATE on all nine. That is the bypass.
--
-- WHY REVOKING IS SAFE
-- --------------------
-- persist_verification and persist_canonical are SECURITY DEFINER owned by
-- `postgres`, and `postgres` also owns all nine tables. A SECURITY DEFINER
-- function executes with its OWNER's privileges, so the RPCs write the evidence
-- on postgres's ownership and never on the caller's grants. Measured, not
-- assumed: proowner = postgres, and every table's relowner = postgres.
--
-- Separately, the probe established that service_role could not usefully reach
-- the RPCs anyway: can_touch_company() resolves through auth.uid(), which is
-- NULL for a service-key call, so persist_verification as service_role already
-- fails with `42501 not authorized for this company`. The database role is not
-- the authorization identity; the end user's JWT is.
--
-- EXECUTE IS RETAINED
-- -------------------
-- Holding EXECUTE on the RPCs is not a bypass -- it IS the validated path, and
-- the tenant gate still has to accept the caller. Revoking it would buy nothing
-- and would foreclose a future trusted path that legitimately carries a user's
-- JWT. So EXECUTE is left exactly as it is for every role that has it.
--
-- SELECT IS RETAINED
-- ------------------
-- Reading evidence is not writing it, and server-side code needs to read what it
-- just persisted in order to return it. RLS still applies to authenticated;
-- service_role bypasses RLS on reads, which is its existing, intended role.
--
-- EXPLICITLY NOT TOUCHED
-- ----------------------
--   source_transcripts, extraction_attempts   (0041; written today from the
--                                              browser as `authenticated`, and
--                                              changing them would break the
--                                              live pipeline)
--   can_touch_company(), owns_company(), is_admin()
--   the RPC authorization model
--   OC-1 / purge semantics
--
-- Run in Supabase -> SQL Editor AFTER 0044. Idempotent.

begin;

do $$
declare t text;
begin
  foreach t in array array['source_inventories','source_inventory_parts',
                           'source_inventory_blocks','source_inventory_notes',
                           'composition_rules','verification_runs',
                           'verification_findings','canonical_sources','canonical_spans']
  loop
    -- Named verbs rather than ALL, so SELECT survives without needing a re-grant
    -- and this migration cannot quietly remove something it did not intend to.
    execute format(
      'revoke insert, update, delete, truncate, trigger, references on public.%I from service_role', t);
  end loop;
end $$;

commit;

-- ============================================================
-- AFTERWARDS
-- ============================================================
-- Expected end state on all nine tables:
--   anon           none
--   authenticated  SELECT
--   service_role   SELECT
-- and on both RPCs: EXECUTE for authenticated and service_role, not anon, not PUBLIC.
--
-- The triggers from 0042/0043/0045 remain the backstop: they fire for every role,
-- so even a privilege granted by mistake later cannot UPDATE, DELETE or TRUNCATE
-- evidence.


-- ======== 0047_company_messaging_access.sql ========
-- ============================================================================
-- 0047_company_messaging_access.sql — let a company read and answer its own
-- investor messages from the Company Portal.
--
-- 0014 built the investor side only: `conv_select` and `msg_select` both require
-- auth.uid() = investor_id, and the company side existed solely as the Postmark
-- inbound webhook writing with the service role. The consequence is that a
-- signed-in company user cannot read a single one of their own conversations
-- from the browser. The portal's Messages inbox needs exactly that, so this
-- migration adds the company side of the same two tables.
--
-- Design notes:
--   • `conversations.company_slug` is text with no foreign key (0014's choice),
--     so authorization resolves slug -> companies.id -> owns_company(id).
--     owns_company() already covers the owner AND active memberships, so a
--     company's staff see the inbox without a second rule to keep in sync.
--   • Company replies may only ever be inserted as sender='company'. The WITH
--     CHECK enforces that, so a company cannot forge a message attributed to
--     the investor in their own thread.
--   • Read state is per CONVERSATION, not per message: the inbox marks a thread
--     read, which is all a Gmail-style unread dot needs, and it avoids opening
--     an UPDATE surface on `messages` (where it would also expose `body`).
--   • Marking read therefore goes through a SECURITY DEFINER RPC rather than an
--     UPDATE policy, so the only writable column is the one we intend.
-- ============================================================================

-- ---------------------------------------------------------------- read state
alter table public.conversations
  add column if not exists company_read_at timestamptz;

comment on column public.conversations.company_read_at is
  'When the company last opened this thread. NULL = never opened. Set only by mark_conversation_read().';

-- ------------------------------------------------------------- authorization
-- Slug -> company -> ownership, in one place. SECURITY DEFINER because the
-- policy must resolve the company row even though the caller may not be able to
-- select it directly; STABLE so the planner can hoist it out of the row loop.
create or replace function public.owns_company_slug(p_slug text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies c
     where c.slug = p_slug
       and public.owns_company(c.id)
  );
$$;

revoke execute on function public.owns_company_slug(text) from public;
grant  execute on function public.owns_company_slug(text) to authenticated;

-- ------------------------------------------------------------------ policies
-- Investor policies from 0014 stay exactly as they are; these are additive, and
-- PostgreSQL ORs multiple permissive policies together.
drop policy if exists conv_select_company on public.conversations;
create policy conv_select_company on public.conversations
  for select using (public.owns_company_slug(company_slug));

drop policy if exists msg_select_company on public.messages;
create policy msg_select_company on public.messages
  for select using (
    exists (select 1 from public.conversations c
             where c.id = conversation_id
               and public.owns_company_slug(c.company_slug))
  );

-- A company may add messages to its own threads, and only as itself.
drop policy if exists msg_insert_company on public.messages;
create policy msg_insert_company on public.messages
  for insert with check (
    sender = 'company'
    and exists (select 1 from public.conversations c
                 where c.id = conversation_id
                   and public.owns_company_slug(c.company_slug))
  );

-- --------------------------------------------------------------- mark as read
create or replace function public.mark_conversation_read(p_conversation uuid)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_slug text; v_now timestamptz;
begin
  select c.company_slug into v_slug
    from public.conversations c where c.id = p_conversation;

  if v_slug is null then
    raise exception 'conversation not found' using errcode = '22023';
  end if;

  if not public.owns_company_slug(v_slug) then
    raise exception 'not authorized for this conversation' using errcode = '42501';
  end if;

  v_now := now();
  update public.conversations set company_read_at = v_now where id = p_conversation;
  return v_now;
end $$;

revoke execute on function public.mark_conversation_read(uuid) from public;
grant  execute on function public.mark_conversation_read(uuid) to authenticated;

-- -------------------------------------------------------------------- grants
grant select         on public.conversations to authenticated;
grant select, insert on public.messages      to authenticated;

-- Sorting the inbox by recency, scoped to one company.
create index if not exists idx_conv_slug_recent
  on public.conversations (company_slug, last_message_at desc);

-- --------------------------------------------------------- who is writing to us
-- An inbox that lists UUIDs is useless, but `investor_profiles` is self-only
-- (0016: auth.uid() = user_id) and the company cannot read auth.users at all.
--
-- Rather than open `investor_profiles` with a policy -- which would disclose
-- every column, bio included, and could not be narrowed per column without also
-- restricting investors reading their own row -- this returns the four display
-- fields the inbox actually needs, and only for people who have already chosen
-- to write to this company. No email address is exposed: the company never had
-- the investor's address (0014 routes replies through Postmark), and this does
-- not change that.
create or replace function public.company_conversation_senders(p_slug text)
returns table (investor_id uuid, display_name text, investor_company text, investor_role text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.user_id, p.display_name, p.company, p.role
    from public.investor_profiles p
   where public.owns_company_slug(p_slug)
     and exists (
       select 1 from public.conversations c
        where c.company_slug = p_slug
          and c.investor_id = p.user_id
     );
$$;

revoke execute on function public.company_conversation_senders(text) from public;
grant  execute on function public.company_conversation_senders(text) to authenticated;


-- ======== 0048_company_engagement_analytics.sql ========
-- ============================================================================
-- 0048_company_engagement_analytics.sql — let a company see its own numbers.
--
-- Engagement HAS been recorded all along; the company just could never read it:
--   post_events           (0009)  impression | open | save | unsave | dwell
--   company_follows       (0009)  follows, keyed by company_id
--   user_company_rel.     (0016)  follows, keyed by company_slug  <- second source
--   post_likes/post_saves (0016)  keyed by company_slug + post_key
-- Every one of those is RLS'd to `user_id = auth.uid()`, so the Analytics page
-- had nothing to show and said "coming soon" instead.
--
-- These functions return AGGREGATES ONLY. That is deliberate and not merely
-- convenient: a company has a legitimate interest in how many investors read a
-- release, and no interest in WHICH investor read it. Nothing here can return
-- a user_id, and no policy is added to the underlying tables, so the per-row
-- privacy of 0009/0016 is left exactly as it was.
--
-- NOT INCLUDED: shares. Nothing in this database records a share -- post_events'
-- CHECK constraint allows impression/open/save/unsave/dwell and nothing else.
-- Reporting a share count would mean inventing one, so the page shows shares as
-- not yet tracked. Adding it means adding the event at the point of sharing
-- first; that is an app change, not a reporting change.
-- ============================================================================

-- ------------------------------------------------------------------- totals
create or replace function public.company_engagement_totals(p_company uuid)
returns table (
  views            bigint,   -- impressions: the post appeared in a feed
  reads            bigint,   -- opens: the investor actually opened it
  avg_dwell_secs   numeric,  -- mean of recorded dwell values
  followers        bigint,
  likes            bigint,
  saves            bigint,
  posts            bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  select c.slug into v_slug from public.companies c where c.id = p_company;

  return query
  select
    (select count(*) from public.post_events e
       join public.posts p on p.id = e.post_id
      where p.company_id = p_company and e.kind = 'impression'),
    (select count(*) from public.post_events e
       join public.posts p on p.id = e.post_id
      where p.company_id = p_company and e.kind = 'open'),
    (select round(avg(e.value)::numeric, 1) from public.post_events e
       join public.posts p on p.id = e.post_id
      where p.company_id = p_company and e.kind = 'dwell' and e.value is not null),
    -- Two follow sources exist and a person may appear in both, so count
    -- DISTINCT users across the union rather than summing the two tables.
    (select count(*) from (
        select f.user_id from public.company_follows f where f.company_id = p_company
        union
        select r.user_id from public.user_company_relationships r
         where r.company_slug = v_slug and r.is_following
     ) u),
    (select count(*) from public.post_likes l where l.company_slug = v_slug),
    -- Saves live in both models too (post_saves rows and 'save' post_events).
    (select
       (select count(*) from public.post_saves s where s.company_slug = v_slug)
     + (select count(*) from public.post_events e
          join public.posts p on p.id = e.post_id
         where p.company_id = p_company and e.kind = 'save')),
    (select count(*) from public.posts p
      where p.company_id = p_company and p.removed_at is null);
end $$;

revoke execute on function public.company_engagement_totals(uuid) from public, anon;
grant  execute on function public.company_engagement_totals(uuid) to authenticated;

-- -------------------------------------------------------------------- daily
-- One row per day for the trend line. Days with no activity are returned as
-- zeroes rather than omitted, so a chart does not silently close the gaps and
-- imply activity that did not happen.
create or replace function public.company_engagement_daily(p_company uuid, p_days integer default 30)
returns table (day date, views bigint, reads bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  return query
  with span as (
    select generate_series(
      (current_date - (greatest(least(p_days, 365), 1) - 1))::date,
      current_date,
      interval '1 day'
    )::date as day
  ),
  ev as (
    select (e.created_at at time zone 'UTC')::date as day, e.kind
      from public.post_events e
      join public.posts p on p.id = e.post_id
     where p.company_id = p_company
       and e.created_at >= current_date - (greatest(least(p_days, 365), 1) - 1)
  )
  select s.day,
         count(*) filter (where ev.kind = 'impression'),
         count(*) filter (where ev.kind = 'open')
    from span s left join ev on ev.day = s.day
   group by s.day
   order by s.day;
end $$;

revoke execute on function public.company_engagement_daily(uuid, integer) from public, anon;
grant  execute on function public.company_engagement_daily(uuid, integer) to authenticated;

-- ---------------------------------------------------------------- per post
-- Which releases actually landed. Aggregates per post, no user identities.
create or replace function public.company_post_engagement(p_company uuid, p_limit integer default 20)
returns table (
  post_id uuid, title text, published_at timestamptz,
  views bigint, reads bigint, likes bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  select c.slug into v_slug from public.companies c where c.id = p_company;

  return query
  select p.id, p.title, p.published_at,
         (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'impression'),
         (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'open'),
         (select count(*) from public.post_likes l
           where l.company_slug = v_slug and l.post_key = p.id::text)
    from public.posts p
   where p.company_id = p_company and p.removed_at is null
   order by p.published_at desc
   limit greatest(least(p_limit, 100), 1);
end $$;

revoke execute on function public.company_post_engagement(uuid, integer) from public, anon;
grant  execute on function public.company_post_engagement(uuid, integer) to authenticated;

-- Supports the daily rollup's date filter.
create index if not exists idx_post_events_created on public.post_events (created_at);


-- ======== 0049_company_notifications.sql ========
-- ============================================================================
-- 0049_company_notifications.sql — who followed you, who liked a release.
--
-- WHERE THE PRIVACY LINE SITS
-- ---------------------------
-- 0048 exposes engagement as AGGREGATES ONLY and says so explicitly: a company
-- has an interest in how many investors read a release and none in which one.
-- This migration names individuals, so it needs to say why that is not a
-- reversal.
--
-- The distinction is deliberate vs passive:
--   • A FOLLOW or a LIKE is an act the investor chose and expects to be seen,
--     the way following a company on LinkedIn is. Naming them is the point of
--     the act.
--   • A VIEW, an OPEN or a DWELL time is passive. The investor did not signal
--     anything to anybody; reporting who did those would be surveillance.
-- So follows and likes carry a name here; views and reads stay aggregate in
-- 0048 and are not exposed per-person anywhere.
--
-- Only display fields are returned -- the same four 0047 uses for messaging --
-- and never an email address.
-- ============================================================================

-- ------------------------------------------------------- the unread marker
create table if not exists public.company_notification_reads (
  company_id uuid primary key references public.companies(id) on delete cascade,
  seen_at    timestamptz not null default now()
);

alter table public.company_notification_reads enable row level security;

drop policy if exists cnr_select on public.company_notification_reads;
create policy cnr_select on public.company_notification_reads
  for select using (public.owns_company(company_id));

-- LEAST PRIVILEGE, EXPLICITLY. Supabase grants anon and authenticated all seven
-- privileges on every newly created table. 0014 left that default in place on
-- the messaging tables and it survived two years until 0047's verification
-- caught it (fixed by 0052). Every table this migration creates revokes it in
-- the same breath, so the defect cannot be reintroduced.
revoke all on public.company_notification_reads from anon, authenticated;
grant select on public.company_notification_reads to authenticated;

-- ------------------------------------------------------------------ the feed
create or replace function public.company_notifications(p_company uuid, p_limit integer default 50)
returns table (
  kind             text,        -- 'follow' | 'like'
  actor_name       text,
  actor_role       text,
  actor_company    text,
  subject          text,        -- the release title, for a like
  occurred_at      timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  select c.slug into v_slug from public.companies c where c.id = p_company;

  return query
  with follows as (
    -- Two follow sources, as in 0048. DISTINCT ON keeps the earliest record per
    -- person so someone present in both tables appears once.
    select distinct on (u.user_id) u.user_id, u.at
      from (
        select f.user_id, f.created_at as at
          from public.company_follows f
         where f.company_id = p_company
        union all
        -- NOTE: user_company_relationships.created_at is when the ROW was
        -- created, which may predate the moment is_following became true.
        -- It is the only timestamp the table offers.
        select r.user_id, r.created_at
          from public.user_company_relationships r
         where r.company_slug = v_slug and r.is_following
      ) u
     order by u.user_id, u.at asc
  ),
  events as (
    select 'follow'::text as kind, f.user_id, null::text as subject, f.at as occurred_at
      from follows f
    union all
    select 'like'::text, l.user_id, coalesce(p.title, 'a release'), l.created_at
      from public.post_likes l
      left join public.posts p on p.id::text = l.post_key
     where l.company_slug = v_slug
  )
  select e.kind,
         ip.display_name,
         ip.role,
         ip.company,
         e.subject,
         e.occurred_at
    from events e
    left join public.investor_profiles ip on ip.user_id = e.user_id
   order by e.occurred_at desc
   limit greatest(least(p_limit, 200), 1);
end $$;

revoke execute on function public.company_notifications(uuid, integer) from public, anon;
grant  execute on function public.company_notifications(uuid, integer) to authenticated;

-- ------------------------------------------------------------- mark as seen
create or replace function public.mark_notifications_seen(p_company uuid)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_now timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  v_now := now();
  insert into public.company_notification_reads (company_id, seen_at)
       values (p_company, v_now)
  on conflict (company_id) do update set seen_at = excluded.seen_at;
  return v_now;
end $$;

revoke execute on function public.mark_notifications_seen(uuid) from public, anon;
grant  execute on function public.mark_notifications_seen(uuid) to authenticated;

create index if not exists idx_post_likes_slug_created
  on public.post_likes (company_slug, created_at desc);


-- ======== 0050a_mineiq_and_publication_push.sql ========
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

begin;

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

-- LEAST PRIVILEGE, EXPLICITLY. Supabase grants anon and authenticated all seven
-- privileges on every newly created table. 0014 left that default in place on
-- the messaging tables and it survived two years until 0047's verification
-- caught it (fixed by 0052). Every table this migration creates revokes it in
-- the same breath, so the defect cannot be reintroduced.
revoke all on public.mineiq_ingestions from anon, authenticated;
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

-- documents and updates do NOT get a stored column.
--
-- `GENERATED ... STORED` rewrites the entire table and holds ACCESS EXCLUSIVE
-- for the duration -- every read and write blocks. On `facts` that is free
-- because the table is empty. On `documents` and `updates`, which carry live
-- data and are written during ingestion, it is an outage.
--
-- They use EXPRESSION indexes instead, created CONCURRENTLY in 0050b. Same
-- query plan, no rewrite, no exclusive lock.
--
-- mineiq_search() below must use the IDENTICAL expression, or the planner will
-- ignore the index and sequentially scan every document on every question.

-- Safe here: facts is empty, so this is instant.
create index if not exists facts_fts_idx on public.facts using gin (fts);

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

commit;


-- ======== 0050b_mineiq_search_indexes.sql ========
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
