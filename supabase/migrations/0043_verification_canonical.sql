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
