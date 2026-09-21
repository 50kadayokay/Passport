-- =====================================================================
-- PHASE 3D PERSISTENCE / SECURITY AUDIT  --  isolated schema, self-contained
-- =====================================================================
-- Paste this ENTIRE file into the Supabase SQL Editor and run it once, with
-- nothing selected. It:
--
--   1. builds p3d_audit with synthetic fixtures and the 0042-0044 architecture
--   2. runs the full attack matrix against the REAL functions/constraints/triggers
--   3. runs the Unicode/codepoint and transactionality suites
--   4. compares public row counts with the recorded baseline
--   5. DROPS p3d_audit CASCADE
--   6. returns the report LAST, from a pg_temp table that survives the drop
--
-- It never writes to public. The only public objects it reads are row counts.
--
-- RESULTS APPEAR IN THE FINAL RESULT PANE. Copy that table back.
-- =====================================================================

-- ---------------------------------------------------------------- results sink
-- pg_temp, so the report outlives DROP SCHEMA p3d_audit CASCADE.
drop table if exists pg_temp.audit_results;
create temp table pg_temp.audit_results (
  seq        serial primary key,
  category   text,
  attack     text,
  expected   text,
  actual     text,
  mechanism  text,
  pass       boolean
);

-- ------------------------------------------------------- public baseline, captured
-- Captured NOW rather than hardcoded. A number written down days ago answers "has
-- public changed since I last looked?", which is not the question -- other sessions
-- and real signups move these counts legitimately. The question is whether THIS RUN
-- changed anything, so the run records its own starting point and compares against
-- that. Concurrent writes from elsewhere can still perturb it, but the window is the
-- length of one audit rather than the age of a constant.
drop table if exists pg_temp.public_baseline;
create temp table pg_temp.public_baseline (tbl text primary key, n bigint);

do $$
declare t text; n bigint;
begin
  foreach t in array array['documents','source_transcripts','extraction_attempts','companies',
                           'updates','publications','media_assets','media_asset_sources',
                           'posts','events'] loop
    if to_regclass('public.'||t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      insert into pg_temp.public_baseline values (t, n);
    end if;
  end loop;
end $$;

create or replace function pg_temp.rec(
  p_cat text, p_attack text, p_expected text, p_actual text, p_mech text, p_pass boolean)
returns void language sql as $$
  -- coalesce: a comparison that evaluated to NULL (because a dependency was
  -- missing) is a FAILURE, not an absence. The first run reported 2 failures when
  -- 8 rows had actually failed, because NULL satisfies neither `pass` nor `not pass`.
  insert into pg_temp.audit_results (category, attack, expected, actual, mechanism, pass)
  values (p_cat, p_attack, coalesce(p_expected,'(null)'), coalesce(p_actual,'(null)'),
          p_mech, coalesce(p_pass, false));
$$;

-- Record the outcome of a statement that MUST fail.
create or replace function pg_temp.must_fail(
  p_cat text, p_attack text, p_sql text, p_mech text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.rec(p_cat, p_attack, 'rejected', 'ACCEPTED', p_mech, false);
exception when others then
  perform pg_temp.rec(p_cat, p_attack, 'rejected', sqlstate || ' ' || left(sqlerrm, 90), p_mech, true);
end $$;

-- Record the outcome of a statement that MUST fail FOR A SPECIFIC REASON. A plain
-- must_fail passes on any error, so a permission problem can masquerade as the
-- guarantee under test. This one requires the message to name the mechanism.
create or replace function pg_temp.must_fail_with(
  p_cat text, p_attack text, p_sql text, p_needle text, p_mech text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.rec(p_cat, p_attack, 'rejected: '||p_needle, 'ACCEPTED', p_mech, false);
exception when others then
  perform pg_temp.rec(p_cat, p_attack, 'rejected: '||p_needle,
    sqlstate || ' ' || left(sqlerrm, 90), p_mech, position(p_needle in sqlerrm) > 0);
end $$;

-- Record the outcome of a statement that MUST succeed.
create or replace function pg_temp.must_pass(
  p_cat text, p_attack text, p_sql text, p_mech text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.rec(p_cat, p_attack, 'accepted', 'accepted', p_mech, true);
exception when others then
  perform pg_temp.rec(p_cat, p_attack, 'accepted', 'REJECTED ' || sqlstate || ' ' || left(sqlerrm, 80), p_mech, false);
end $$;

-- =====================================================================
-- A. ISOLATED SCHEMA + SYNTHETIC PREREQUISITES
-- =====================================================================
drop schema if exists p3d_audit cascade;
create schema p3d_audit;

-- Local helpers. NOTHING here references public, so no FK can reach a production
-- row and DROP SCHEMA CASCADE has nothing outside the schema to cascade into.
create function p3d_audit.sha256_hex(t text) returns text
  language sql immutable strict as $$ select encode(sha256(convert_to(t,'UTF8')),'hex') $$;

-- Tenant check driven by a session GUC so the audit can impersonate a company.
create function p3d_audit.can_touch_company(cid uuid) returns boolean
  language sql stable as $$
  select coalesce(current_setting('p3d.company', true), '') = cid::text
$$;

create table p3d_audit.companies (
  id uuid primary key default gen_random_uuid(), name text not null);

create table p3d_audit.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references p3d_audit.companies(id) on delete cascade,
  filename text, sha256 text,
  constraint documents_id_company_key unique (id, company_id));

create table p3d_audit.source_transcripts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null, company_id uuid not null,
  engine text not null, engine_version text, transcript_text text not null,
  char_count int generated always as (length(transcript_text)) stored,
  sha256 text generated always as (p3d_audit.sha256_hex(transcript_text)) stored,
  constraint st_doc_fk foreign key (document_id, company_id)
    references p3d_audit.documents (id, company_id) on delete cascade,
  constraint st_id_company_key unique (id, company_id));

-- =====================================================================
-- B. THE 0042 EQUIVALENT -- inventories as evidence
-- =====================================================================
create table p3d_audit.source_inventories (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null, company_id uuid not null, transcript_id uuid not null,
  engine text not null, engine_version text not null,
  package_sha256 text not null, digest text not null,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint si_doc_fk foreign key (document_id, company_id)
    references p3d_audit.documents (id, company_id) on delete cascade,
  constraint si_tr_fk foreign key (transcript_id, company_id)
    references p3d_audit.source_transcripts (id, company_id) on delete cascade,
  constraint si_id_company_key unique (id, company_id));

create table p3d_audit.source_inventory_blocks (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null, company_id uuid not null,
  part_name text not null, part_kind text, xml_path text not null,
  source_block int, source_order int not null,
  structures jsonb not null default '[]'::jsonb,
  text text not null,
  char_count int  generated always as (length(text)) stored,
  byte_count int  generated always as (octet_length(text)) stored,
  sha256     text generated always as (p3d_audit.sha256_hex(text)) stored,
  created_at timestamptz not null default now(),
  constraint sib_inv_fk foreign key (inventory_id, company_id)
    references p3d_audit.source_inventories (id, company_id) on delete cascade,
  constraint sib_addr_uniq unique (inventory_id, part_name, source_block, source_order),
  constraint sib_text_ck check (length(text) > 0),
  constraint sib_id_company_key unique (id, company_id));

create table p3d_audit.source_inventory_parts (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null, company_id uuid not null,
  part_name text not null, part_kind text, content_type text,
  bytes bigint, sha256 text,
  walked boolean not null default false, error text, via text,
  created_at timestamptz not null default now(),
  constraint sip_inv_fk foreign key (inventory_id, company_id)
    references p3d_audit.source_inventories (id, company_id) on delete cascade,
  constraint sip_uniq unique (inventory_id, part_name),
  constraint sip_id_company_key unique (id, company_id));

create table p3d_audit.source_inventory_notes (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null, company_id uuid not null,
  note_kind text not null check (note_kind in ('ignored','unsupported','note')),
  part_name text, xml_path text, element text, kind text, reason text,
  chars int not null default 0, excerpt text,
  note_ref int, note_type text, ns text, rel_type text,
  created_at timestamptz not null default now(),
  constraint sin_inv_fk foreign key (inventory_id, company_id)
    references p3d_audit.source_inventories (id, company_id) on delete cascade,
  constraint sin_id_company_key unique (id, company_id));

-- ---------------------------------------------------------------- digest v1
-- Generated from 0042 by schema substitution, like the RPCs: a hand-kept copy is
-- how the last two defects hid.
create or replace function p3d_audit.idg_enc(v text)
returns text language sql immutable parallel safe as $$
  select case when v is null then '~' else octet_length(v)::text || ':' || v end
$$;

-- An ordered array of labels: its length, then its elements IN ORDER. Order is
-- meaningful here -- structures is a nesting stack, not a set.
create or replace function p3d_audit.idg_arr(j jsonb)
returns text language sql immutable parallel safe as $$
  select p3d_audit.idg_enc(
           case when jsonb_typeof(j) = 'array' then jsonb_array_length(j) else 0 end::text)
      || coalesce((select string_agg(p3d_audit.idg_enc(e.value #>> '{}'), '' order by e.ord)
                     from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end)
                          with ordinality e(value, ord)), '')
$$;

create or replace function p3d_audit.idg_bool(b boolean)
returns text language sql immutable parallel safe as $$
  select p3d_audit.idg_enc(case when b is null then null when b then 'true' else 'false' end)
$$;

create or replace function p3d_audit.idg_part(
  p_part_name text, p_part_kind text, p_content_type text,
  p_bytes bigint, p_sha256 text, p_walked boolean, p_error text, p_via text)
returns text language sql immutable parallel safe as $$
  select 'P' || p3d_audit.idg_enc(p_part_name) || p3d_audit.idg_enc(p_part_kind)
             || p3d_audit.idg_enc(p_content_type)
             || p3d_audit.idg_enc(case when p_bytes is null then null else p_bytes::text end)
             || p3d_audit.idg_enc(p_sha256) || p3d_audit.idg_bool(p_walked) || p3d_audit.idg_enc(p_error)
             || p3d_audit.idg_enc(p_via)
$$;

create or replace function p3d_audit.idg_block(
  p_part_name text, p_part_kind text, p_xml_path text,
  p_source_block int, p_source_order int, p_structures jsonb, p_text text)
returns text language sql immutable parallel safe as $$
  select 'B' || p3d_audit.idg_enc(p_part_name) || p3d_audit.idg_enc(p_part_kind)
             || p3d_audit.idg_enc(p_xml_path)
             || p3d_audit.idg_enc(case when p_source_block is null then null else p_source_block::text end)
             || p3d_audit.idg_enc(case when p_source_order is null then null else p_source_order::text end)
             || p3d_audit.idg_arr(p_structures) || p3d_audit.idg_enc(p_text)
$$;

create or replace function p3d_audit.idg_note(
  p_note_kind text, p_part_name text, p_xml_path text, p_element text,
  p_kind text, p_reason text, p_chars int, p_excerpt text,
  p_note_ref int, p_note_type text, p_ns text, p_rel_type text)
returns text language sql immutable parallel safe as $$
  select 'N' || p3d_audit.idg_enc(p_note_kind) || p3d_audit.idg_enc(p_part_name)
             || p3d_audit.idg_enc(p_xml_path) || p3d_audit.idg_enc(p_element)
             || p3d_audit.idg_enc(p_kind) || p3d_audit.idg_enc(p_reason)
             || p3d_audit.idg_enc(case when p_chars is null then null else p_chars::text end)
             || p3d_audit.idg_enc(p_excerpt)
             || p3d_audit.idg_enc(case when p_note_ref is null then null else p_note_ref::text end)
             || p3d_audit.idg_enc(p_note_type) || p3d_audit.idg_enc(p_ns) || p3d_audit.idg_enc(p_rel_type)
$$;

-- Rows sort by their ENCODED BYTES. Sequence information lives in
-- source_block/source_order INSIDE the row, not in list position, so sorting loses
-- nothing -- and COLLATE "C" is plain UTF-8 byte order, which is what
-- Buffer.compare gives the JavaScript side without either needing to agree on a
-- locale.
create or replace function p3d_audit.idg_section(p_name text, p_rows text[])
returns text language sql immutable parallel safe as $$
  select p3d_audit.idg_enc(p_name)
      || p3d_audit.idg_enc(coalesce(array_length(p_rows, 1), 0)::text)
      || coalesce((select string_agg(r, '' order by r collate "C") from unnest(p_rows) r), '')
$$;

-- THE DIGEST, computed from the rows AS STORED. persist_verification() calls this
-- after writing, so the value it compares against a caller's claim is derived from
-- what the database actually holds, never from what it was told.
create or replace function p3d_audit.inventory_digest(p_inventory uuid)
returns text language sql stable as $$
  select p3d_audit.sha256_hex(
    'inventory-digest-v1' || E'\n'
    || p3d_audit.idg_section('parts', coalesce((
         select array_agg(p3d_audit.idg_part(part_name, part_kind, content_type, bytes, sha256, walked, error, via))
           from p3d_audit.source_inventory_parts where inventory_id = p_inventory), '{}'::text[]))
    || p3d_audit.idg_section('blocks', coalesce((
         select array_agg(p3d_audit.idg_block(part_name, part_kind, xml_path, source_block, source_order, structures, text))
           from p3d_audit.source_inventory_blocks where inventory_id = p_inventory), '{}'::text[]))
    || p3d_audit.idg_section('notes', coalesce((
         select array_agg(p3d_audit.idg_note(note_kind, part_name, xml_path, element, kind, reason, chars, excerpt,
                                          note_ref, note_type, ns, rel_type))
           from p3d_audit.source_inventory_notes where inventory_id = p_inventory), '{}'::text[]))
  )
$$;

-- =====================================================================
-- C. THE 0043 EQUIVALENT -- runs, findings, canonical, spans
-- =====================================================================
create table p3d_audit.verification_runs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null, company_id uuid not null,
  transcript_id uuid not null, inventory_id uuid not null,
  run_status text not null check (run_status in ('COMPLETED','FAILED')),
  verdict text check (verdict in ('VERIFIED','DISCREPANCY','INDETERMINATE')),
  constraint vr_verdict_ck check (
    (run_status='FAILED' and verdict is null) or (run_status='COMPLETED' and verdict is not null)),
  verifier text not null, verifier_version text not null, ruleset_version text not null,
  transcript_sha256 text not null, inventory_digest text not null,
  counts jsonb not null default '{}'::jsonb, fatal text,
  constraint vr_doc_fk foreign key (document_id, company_id)
    references p3d_audit.documents (id, company_id) on delete cascade,
  constraint vr_tr_fk foreign key (transcript_id, company_id)
    references p3d_audit.source_transcripts (id, company_id) on delete cascade,
  constraint vr_inv_fk foreign key (inventory_id, company_id)
    references p3d_audit.source_inventories (id, company_id) on delete cascade,
  constraint vr_id_company_key unique (id, company_id));

create table p3d_audit.verification_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null, company_id uuid not null,
  category text not null check (category in (
    'MATCHED','LAYOUT_DIFFERENCE','INTENTIONALLY_IGNORED','MISSING_FROM_TRANSCRIPT',
    'UNEXPECTED_IN_TRANSCRIPT','ORDER_DIFFERENCE','UNSUPPORTED_SOURCE_ELEMENT')),
  disposition text check (disposition in ('SUPPLEMENTABLE','NON_SUPPLEMENTABLE')),
  severity text check (severity in ('MATERIAL','INCIDENTAL')),
  part_name text, part_kind text, xml_path text,
  source_block int, source_order int, chars int not null default 0,
  transcript_start int, transcript_length int,
  rule_id text, reason text, excerpt text,
  constraint vf_run_fk foreign key (run_id, company_id)
    references p3d_audit.verification_runs (id, company_id) on delete cascade,
  constraint vf_supplementable_ck
    check (disposition is distinct from 'SUPPLEMENTABLE' or category = 'MISSING_FROM_TRANSCRIPT'),
  constraint vf_id_company_key unique (id, company_id));

create table p3d_audit.canonical_sources (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null, company_id uuid not null,
  transcript_id uuid not null, inventory_id uuid not null, verification_run_id uuid not null,
  composer text not null, composer_version text not null, composition_ruleset text not null,
  serialized text not null, region_offsets jsonb not null default '[]'::jsonb,
  char_count int  generated always as (length(serialized)) stored,
  byte_count int  generated always as (octet_length(serialized)) stored,
  sha256     text generated always as (p3d_audit.sha256_hex(serialized)) stored,
  constraint cs_doc_fk foreign key (document_id, company_id)
    references p3d_audit.documents (id, company_id) on delete cascade,
  constraint cs_tr_fk foreign key (transcript_id, company_id)
    references p3d_audit.source_transcripts (id, company_id) on delete cascade,
  constraint cs_inv_fk foreign key (inventory_id, company_id)
    references p3d_audit.source_inventories (id, company_id) on delete cascade,
  constraint cs_run_fk foreign key (verification_run_id, company_id)
    references p3d_audit.verification_runs (id, company_id) on delete cascade,
  constraint cs_text_ck check (length(serialized) > 0),
  constraint cs_id_company_key unique (id, company_id));

create table p3d_audit.composition_rules (
  rule_id text not null, rule_version text not null, ruleset_version text not null,
  part_kind text not null,
  region_kind text not null check (region_kind in ('body','footnotes','endnotes','headers','footers')),
  why text not null,
  primary key (rule_id, rule_version),
  constraint cr_partkind_uniq unique (ruleset_version, part_kind));

-- Mirrors COMPOSITION_RULES in api/_canonicalSource.js. Note supplement_headers
-- covers part kind 'header' and supplement_footers covers 'footer' -- the reason a
-- derived id ('supplement_' || part_kind) is wrong, not merely inelegant.
insert into p3d_audit.composition_rules values
  ('supplement_footnotes','1.0.0','1.0.0','footnotes','footnotes','self-delimiting footnote parts'),
  ('supplement_endnotes','1.0.0','1.0.0','endnotes','endnotes','self-delimiting endnote parts'),
  ('supplement_headers','1.0.0','1.0.0','header','headers','a header part is a complete region'),
  ('supplement_footers','1.0.0','1.0.0','footer','footers','a footer part is a complete region');

create table p3d_audit.canonical_spans (
  id uuid primary key default gen_random_uuid(),
  canonical_id uuid not null, company_id uuid not null,
  canonical_order int not null, region_kind text not null check (
    region_kind in ('body','footnotes','endnotes','headers','footers')),
  text text not null,
  part_name text, part_kind text, xml_path text, source_block int, source_order int,
  structures jsonb not null default '[]'::jsonb,
  engine_extracted boolean not null,
  origin text not null check (origin in ('engine','supplement')),
  transcript_start int, transcript_length int,
  inventory_block_id uuid, authorizing_finding_id uuid,
  composition_rule_id text, composition_rule_version text,
  constraint csp_canon_fk foreign key (canonical_id, company_id)
    references p3d_audit.canonical_sources (id, company_id) on delete cascade,
  constraint csp_rule_fk foreign key (composition_rule_id, composition_rule_version)
    references p3d_audit.composition_rules (rule_id, rule_version) on delete restrict,
  constraint csp_block_fk foreign key (inventory_block_id, company_id)
    references p3d_audit.source_inventory_blocks (id, company_id) on delete restrict,
  constraint csp_finding_fk foreign key (authorizing_finding_id, company_id)
    references p3d_audit.verification_findings (id, company_id) on delete restrict,
  constraint csp_origin_ck check (
    (origin='engine' and engine_extracted
       and transcript_start is not null and transcript_length is not null
       and inventory_block_id is null and authorizing_finding_id is null and composition_rule_id is null)
    or (origin='supplement' and not engine_extracted
       and inventory_block_id is not null and authorizing_finding_id is not null
       and composition_rule_id is not null and composition_rule_version is not null
       and transcript_start is null and transcript_length is null)),
  constraint csp_order_uniq unique (canonical_id, canonical_order),
  constraint csp_order_nonneg check (canonical_order >= 0),
  constraint csp_text_ck check (length(text) > 0));

-- append-only triggers on every evidence and conclusion table
create function p3d_audit.append_only() returns trigger language plpgsql as $$
begin
  -- Mirrors 0042: no assumption of an `id` column, because composition_rules has none.
  raise exception '% is append-only; row % cannot be %',
    tg_table_name,
    coalesce(to_jsonb(old) ->> 'id', left(to_jsonb(old)::text, 120)),
    case when tg_op = 'DELETE' then 'deleted' else 'modified' end
    using errcode = '42501';
end $$;

do $$ declare t text; begin
  foreach t in array array['source_inventories','source_inventory_parts','source_inventory_blocks',
                           'source_inventory_notes','verification_runs',
                           'verification_findings','canonical_sources','canonical_spans'] loop
    execute format('create trigger %I_immutable before update or delete on p3d_audit.%I
                    for each row execute function p3d_audit.append_only()', t, t);
    execute format('alter table p3d_audit.%I enable row level security', t);
    execute format('create policy %I_read on p3d_audit.%I for select to authenticated
                    using (p3d_audit.can_touch_company(company_id))', t, t);
  end loop;
end $$;

revoke all on all tables in schema p3d_audit from anon, authenticated;
grant usage on schema p3d_audit to anon, authenticated;
grant select on all tables in schema p3d_audit to authenticated;

-- service_role holds broad DML in production and BYPASSES RLS. Granting it the same
-- here is what makes the deletion tests meaningful: a refusal must come from the
-- TRIGGER, not from a missing privilege. Without this grant they would pass for the
-- wrong reason.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema p3d_audit to service_role';
    execute 'grant all on all tables in schema p3d_audit to service_role';
  end if;
end $$;

create trigger composition_rules_immutable before update or delete on p3d_audit.composition_rules
  for each row execute function p3d_audit.append_only();

-- =====================================================================
-- D. THE 0044 EQUIVALENT -- the two trusted write boundaries
-- =====================================================================
create or replace function p3d_audit.persist_verification(payload jsonb)
returns uuid
language plpgsql security definer set search_path = p3d_audit, pg_temp as $fn$
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
  select company_id into v_company from p3d_audit.documents where id = v_document;
  if v_company is null then raise exception 'unknown document' using errcode = '23503'; end if;
  if not p3d_audit.can_touch_company(v_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  -- The transcript must belong to the same document AND company.
  select sha256 into v_tsha from p3d_audit.source_transcripts
   where id = v_transcript and document_id = v_document and company_id = v_company;
  if v_tsha is null then
    raise exception 'transcript does not belong to this document' using errcode = '23503';
  end if;
  if (payload->'run'->>'transcript_sha256') is distinct from v_tsha then
    raise exception 'run transcript hash does not match the stored transcript' using errcode = '22023';
  end if;

  insert into p3d_audit.source_inventories
    (document_id, company_id, transcript_id, engine, engine_version, package_sha256, digest, stats)
  values (v_document, v_company, v_transcript,
          payload->'inventory'->>'engine', payload->'inventory'->>'engine_version',
          payload->'inventory'->>'package_sha256', payload->'inventory'->>'digest',
          coalesce(payload->'inventory'->'stats', '{}'::jsonb))
  returning id into v_inventory;

  insert into p3d_audit.source_inventory_parts
    (inventory_id, company_id, part_name, part_kind, content_type, bytes, sha256, walked, error, via)
  select v_inventory, v_company, p->>'part_name', p->>'part_kind', p->>'content_type',
         (p->>'bytes')::bigint, p->>'sha256', coalesce((p->>'walked')::boolean, false), p->>'error',
         p->>'via'
    from jsonb_array_elements(coalesce(payload->'inventory'->'parts', '[]'::jsonb)) p;

  insert into p3d_audit.source_inventory_blocks
    (inventory_id, company_id, part_name, part_kind, xml_path, source_block, source_order, structures, text)
  select v_inventory, v_company, b2->>'part_name', b2->>'part_kind', b2->>'xml_path',
         (b2->>'source_block')::int, (b2->>'source_order')::int,
         coalesce(b2->'structures', '[]'::jsonb), b2->>'text'
    from jsonb_array_elements(coalesce(payload->'inventory'->'blocks', '[]'::jsonb)) b2;

  insert into p3d_audit.source_inventory_notes
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
  v_digest := p3d_audit.inventory_digest(v_inventory);

  if v_digest is distinct from (payload->'inventory'->>'digest') then
    raise exception 'inventory digest does not match the manifest supplied (stored % vs claimed %)',
      left(coalesce(v_digest,'null'),16), left(coalesce(payload->'inventory'->>'digest','null'),16)
      using errcode = '22023';
  end if;

  insert into p3d_audit.verification_runs
    (document_id, company_id, transcript_id, inventory_id, run_status, verdict,
     verifier, verifier_version, ruleset_version, transcript_sha256, inventory_digest, counts, fatal)
  values (v_document, v_company, v_transcript, v_inventory, v_status, v_verdict,
          payload->'run'->>'verifier', payload->'run'->>'verifier_version',
          payload->'run'->>'ruleset_version', v_tsha, v_digest,
          coalesce(payload->'run'->'counts', '{}'::jsonb), payload->'run'->>'fatal')
  returning id into v_run;

  insert into p3d_audit.verification_findings
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
    select 1 from p3d_audit.verification_findings vf
     where vf.run_id = v_run and vf.disposition = 'SUPPLEMENTABLE'
       and (select count(*) from p3d_audit.source_inventory_blocks sb
             where sb.inventory_id = v_inventory and sb.part_name = vf.part_name
               and sb.source_block is not distinct from vf.source_block) <> 1
  ) then
    raise exception 'a SUPPLEMENTABLE finding does not resolve to exactly one inventory block'
      using errcode = '22023';
  end if;

  return v_run;
end $fn$;

-- ============================================================
-- 2) persist_canonical(payload jsonb) -> uuid (the canonical id)
-- ============================================================
-- payload = { verification_run_id, composer, composer_version, composition_ruleset,
--             region_offsets, spans: [...] }
--
-- `serialized` is NOT accepted from the caller. It is RECONSTRUCTED from the spans
-- by the database, which is the only way "the spans reconstruct the text" can be a
-- fact rather than an assertion.
create or replace function p3d_audit.persist_canonical(payload jsonb)
returns uuid
language plpgsql security definer set search_path = p3d_audit, pg_temp as $fn$
declare
  v_run        uuid := (payload->>'verification_run_id')::uuid;
  r            p3d_audit.verification_runs%rowtype;
  v_canonical  uuid;
  v_serialized text;
  v_expected   int;
  s            jsonb;
  v_region     text;
  v_regions    text[] := array['body','footnotes','endnotes','headers','footers'];
  v_block      p3d_audit.source_inventory_blocks%rowtype;
  v_finding    p3d_audit.verification_findings%rowtype;
  v_rule       p3d_audit.composition_rules%rowtype;
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

  select * into r from p3d_audit.verification_runs where id = v_run;
  if r.id is null then raise exception 'unknown verification run' using errcode = '23503'; end if;
  if not p3d_audit.can_touch_company(r.company_id) then
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
  if exists (select 1 from p3d_audit.verification_findings f
              where f.run_id = v_run
                and f.category in ('UNEXPECTED_IN_TRANSCRIPT','ORDER_DIFFERENCE','UNSUPPORTED_SOURCE_ELEMENT')) then
    raise exception 'findings that cannot be recovered deterministically are outstanding' using errcode = '22023';
  end if;
  if exists (select 1 from p3d_audit.verification_findings f
              where f.run_id = v_run and f.category = 'MISSING_FROM_TRANSCRIPT'
                and coalesce(f.disposition,'') <> 'SUPPLEMENTABLE') then
    raise exception 'a missing-content finding is not SUPPLEMENTABLE' using errcode = '22023';
  end if;

  select transcript_text into v_tt from p3d_audit.source_transcripts where id = r.transcript_id;

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
      select * into v_block from p3d_audit.source_inventory_blocks
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
      select * into v_finding from p3d_audit.verification_findings
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
      select * into v_rule from p3d_audit.composition_rules
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
    select 1 from p3d_audit.verification_findings f
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
  insert into p3d_audit.canonical_sources
    (document_id, company_id, transcript_id, inventory_id, verification_run_id,
     composer, composer_version, composition_ruleset, serialized, region_offsets)
  values (r.document_id, r.company_id, r.transcript_id, r.inventory_id, v_run,
          payload->>'composer', payload->>'composer_version', payload->>'composition_ruleset',
          v_serialized, v_offsets)
  returning id into v_canonical;

  insert into p3d_audit.canonical_spans
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
end $fn$;

revoke all on function p3d_audit.persist_verification(jsonb) from public, anon;
revoke all on function p3d_audit.persist_canonical(jsonb)   from public, anon;
grant execute on function p3d_audit.persist_verification(jsonb) to authenticated;
grant execute on function p3d_audit.persist_canonical(jsonb)   to authenticated;

-- ---------------------------------------------------------------- digest constants
-- Computed by scripts/audit-digests.mjs from api/_inventoryDigest.js. NOTHING in
-- the database produces these values, so persist_verification()'s recomputation
-- from stored rows has to agree with an INDEPENDENT implementation rather than
-- with itself. Every fixture below is driven by one, which makes the agreement
-- load-bearing: if the two encoders diverge by a byte, the happy path stops.
select
  set_config('p3d.dig_runA', '667595b24b0ad75386c0ce6ad2b44b9a4256c42f804beec60f277e34cef4e1d3', false),
  set_config('p3d.dig_runFail', 'd487c0ea38369bac50e2451ac414c83880458eed98b2e50783045de4c80f7e8e', false),
  set_config('p3d.dig_runInd', 'c794f915e8bf17b1fde9769706fca39ab61dd1e696ad28a7e3b81063ea8a3d6d', false),
  set_config('p3d.dig_noContent', 'd4c684a4aee6e721bf1af0bd6face58c6d68073c96878780971cc01463de79ff', false),
  set_config('p3d.dig_ruleFootnotes', 'cf7cc104d3c6cb08d2327f1cf9acdda4b1643f720654dac88a1ea62981a92617', false),
  set_config('p3d.dig_ruleHeader', 'a054520b97f75d2efaf468a937aae0bb648f89a1615ee10837ef130dd0b3439a', false),
  set_config('p3d.dig_ruleFooter', '236ca4949389c96aa38d0fa2fa9b40d5e582a9318b195e845bcee93470db17a5', false),
  set_config('p3d.dig_mut_base', '667595b24b0ad75386c0ce6ad2b44b9a4256c42f804beec60f277e34cef4e1d3', false),
  set_config('p3d.dig_mut_blockOneChar', 'b923b2f3c59af83b1d8b7185022c61f56cf03abcf2a486bff588dbf7a2239787', false),
  set_config('p3d.dig_mut_partWalked', 'c698cf36128f33c2a90ee9498ea4b9b3b3ad8da1619045ff41bf4e102eab561c', false),
  set_config('p3d.dig_mut_partError', '82fe325bf5271af9443cb92d5c5d299b8603db9b053c6e72d2ca33bc92a3b1a3', false),
  set_config('p3d.dig_mut_noteKind', 'd9b7f1fd92cff8dd581960a29575c651321d8e7fe4a5a43f484c4f5990586190', false),
  set_config('p3d.dig_mut_noteReason', 'd7f5b4d00d3bc31d51e46b6791aaedd04e02e2867b004de8e12895a7a3bf51f3', false),
  set_config('p3d.dig_mut_noteProvenance', '6c83cc04593c43fa1ece0b14c5481f1a826b1f828dd94f95ffa73f25823c83ff', false),
  set_config('p3d.dig_mut_reordered', '667595b24b0ad75386c0ce6ad2b44b9a4256c42f804beec60f277e34cef4e1d3', false),
  set_config('p3d.dig_mut_partVia', 'a813f3cda289f8535e7e012c859cfdee4bb0dea1614e92a2b04f5c0d9ff4e744', false),
  set_config('p3d.dig_mut_noteRef', '3c2768fc147b26dca710e10df63dc2c1355c7bdca2cd0f7f6e9f7a930c1bcba6', false),
  set_config('p3d.dig_mut_noteType', 'a48d07d300e9af4ce2984658000f020ae60746dae61ea91d8872bf2784027931', false),
  set_config('p3d.dig_mut_noteNs', '7075e2ae909fc043b2b5711c5d8f4ff78edfbe76bf9abd13b16d59dc3e99fd1f', false),
  set_config('p3d.dig_mut_noteRelType', '7e3f91ee6c25d59a7d0e7fbdb9fb5faed6a557ccd55e26c1699c184d4c252d6a', false);

-- =====================================================================
-- E. FIXTURES + HAPPY PATH
-- =====================================================================
do $$
declare
  cA uuid; cB uuid; dA uuid; dB uuid; tA uuid; tB uuid; runA uuid; canA uuid;
  -- Transcript deliberately contains an emoji BEFORE a later span, so any
  -- UTF-16 vs codepoint confusion changes which text substr() selects.
  txt text := 'Body one.' || E'\n' || 'Grade 5 g/t ' || U&'\+01F44D' || ' then more.' || E'\n' || 'Body three.';
  fnText text := 'Footnote recovered text.';
  dig text; runFail uuid; runInd uuid; invA uuid; findA uuid; blkA uuid;
begin
  insert into p3d_audit.companies(name) values ('Audit A') returning id into cA;
  insert into p3d_audit.companies(name) values ('Audit B') returning id into cB;
  insert into p3d_audit.documents(company_id,filename,sha256) values (cA,'a.docx',repeat('a',64)) returning id into dA;
  insert into p3d_audit.documents(company_id,filename,sha256) values (cB,'b.docx',repeat('b',64)) returning id into dB;
  insert into p3d_audit.source_transcripts(document_id,company_id,engine,transcript_text)
    values (dA,cA,'audit-engine',txt) returning id into tA;
  insert into p3d_audit.source_transcripts(document_id,company_id,engine,transcript_text)
    values (dB,cB,'audit-engine','Other company text.') returning id into tB;

  perform set_config('p3d.company', cA::text, false);
  perform set_config('p3d.fixture', jsonb_build_object(
    'cA',cA,'cB',cB,'dA',dA,'dB',dB,'tA',tA,'tB',tB,'txt',txt,'fn',fnText)::text, false);

  -- The digest the RPC will demand, computed in JavaScript, not here.
  dig := current_setting('p3d.dig_runA', true);
  perform set_config('p3d.digest', dig, false);

  runA := p3d_audit.persist_verification(jsonb_build_object(
    'document_id',dA,'transcript_id',tA,
    'inventory',jsonb_build_object('engine','audit-inv','engine_version','1','package_sha256',repeat('c',64),
      'digest',dig,
      'parts',jsonb_build_array(
        jsonb_build_object('part_name','word/document.xml','part_kind','document',
          'content_type','application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
          'bytes',4096,'sha256',repeat('1',64),'walked',true,'via','package/_rels/.rels'),
        jsonb_build_object('part_name','word/footnotes.xml','part_kind','footnotes',
          'content_type','application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml',
          'bytes',512,'sha256',repeat('2',64),'walked',true,'via','word/_rels/document.xml.rels'),
        jsonb_build_object('part_name','word/charts/chart1.xml','part_kind','chart',
          'content_type','application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
          'bytes',900,'sha256',repeat('3',64),'walked',false,'error','KNOWN_UNREAD_REL',
          'via','word/_rels/document.xml.rels')),
      'notes',jsonb_build_array(
        jsonb_build_object('note_kind','ignored','part_name','word/document.xml','xml_path','document/body/p/pPr',
          'element','w:instrText','kind','field-instruction','reason','field instructions are not visible text','chars',18),
        jsonb_build_object('note_kind','unsupported','part_name','word/charts/chart1.xml','xml_path','chart',
          'element','c:chart','kind','chart','reason','chart text is not read by this engine','chars',0,
          'ns','http://schemas.openxmlformats.org/drawingml/2006/chart',
          'rel_type','http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart'),
        jsonb_build_object('note_kind','note','part_name','word/footnotes.xml','kind','footnote','chars',0,
          'note_ref',2,'note_type','normal')),
      'blocks',jsonb_build_array(
        jsonb_build_object('part_name','word/document.xml','part_kind','document','xml_path','document/body/p/r/t','source_block',0,'source_order',0,'text','Body one.'),
        jsonb_build_object('part_name','word/document.xml','part_kind','document','xml_path','document/body/p/r/t','source_block',1,'source_order',1,'text','Grade 5 g/t ' || U&'\+01F44D' || ' then more.'),
        jsonb_build_object('part_name','word/document.xml','part_kind','document','xml_path','document/body/p/r/t','source_block',2,'source_order',2,'text','Body three.'),
        jsonb_build_object('part_name','word/footnotes.xml','part_kind','footnotes','xml_path','footnotes/footnote/p/r/t','source_block',3,'source_order',3,'text',fnText))),
    'run',jsonb_build_object('run_status','COMPLETED','verdict','DISCREPANCY','verifier','audit-verifier',
      'verifier_version','1','ruleset_version','1','transcript_sha256',
      (select sha256 from p3d_audit.source_transcripts where id=tA)),
    'findings',jsonb_build_array(
      jsonb_build_object('category','MISSING_FROM_TRANSCRIPT','disposition','SUPPLEMENTABLE','severity','MATERIAL',
        'part_name','word/footnotes.xml','part_kind','footnotes','source_block',3,'source_order',3,
        'chars',length(fnText),'reason','absent from the engine transcript'))));
  perform set_config('p3d.run', runA::text, false);
  select id into invA from p3d_audit.verification_runs where id=runA;
  select inventory_id into invA from p3d_audit.verification_runs where id=runA;
  perform set_config('p3d.inv', invA::text, false);
  select id into findA from p3d_audit.verification_findings where run_id=runA limit 1;
  perform set_config('p3d.find', findA::text, false);
  select id into blkA from p3d_audit.source_inventory_blocks
    where inventory_id=invA and part_name='word/footnotes.xml';
  perform set_config('p3d.blk', blkA::text, false);
  perform pg_temp.rec('provenance','persist_verification happy path','accepted','accepted','RPC',true);

  -- a FAILED run and an INDETERMINATE run, for eligibility tests
  runFail := p3d_audit.persist_verification(jsonb_build_object(
    'document_id',dA,'transcript_id',tA,
    'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256',repeat('d',64),
      'digest',current_setting('p3d.dig_runFail', true),
      'blocks',jsonb_build_array(jsonb_build_object('part_name','word/x','xml_path','p','source_block',0,'source_order',0,'text','z'))),
    'run',jsonb_build_object('run_status','FAILED','verdict',null,'verifier','v','verifier_version','1',
      'ruleset_version','1','transcript_sha256',(select sha256 from p3d_audit.source_transcripts where id=tA)),
    'findings','[]'::jsonb));
  perform set_config('p3d.runfail', runFail::text, false);

  runInd := p3d_audit.persist_verification(jsonb_build_object(
    'document_id',dA,'transcript_id',tA,
    'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256',repeat('e',64),
      'digest',current_setting('p3d.dig_runInd', true),
      'blocks',jsonb_build_array(jsonb_build_object('part_name','word/y','xml_path','p','source_block',0,'source_order',0,'text','z'))),
    'run',jsonb_build_object('run_status','COMPLETED','verdict','INDETERMINATE','verifier','v','verifier_version','1',
      'ruleset_version','1','transcript_sha256',(select sha256 from p3d_audit.source_transcripts where id=tA)),
    'findings','[]'::jsonb));
  perform set_config('p3d.runind', runInd::text, false);
exception when others then
  perform pg_temp.rec('provenance','FIXTURE SETUP','succeeds','FAILED '||sqlstate||' '||left(sqlerrm,110),'setup',false);
end $$;

-- =====================================================================
-- E2. INVENTORY PARTS + NOTES -- the write surface 0044 has that the
--     earlier audit copy did not. Parts and notes are classification
--     evidence: a verdict of VERIFIED asserts every non-visible construct
--     matched an explicit rule, and these rows are what makes that auditable.
-- =====================================================================
do $$
declare inv uuid := current_setting('p3d.inv', true)::uuid;
        cA  uuid := current_setting('p3d.company', true)::uuid;
        n int; pid uuid; nid uuid; brk text;
begin
  select count(*) into n from p3d_audit.source_inventory_parts where inventory_id = inv;
  perform pg_temp.rec('inventory','parts persisted from the payload','3',n::text,
    'persist_verification writes source_inventory_parts', n = 3);

  -- Three notes, one of each kind: an ignored construct, an unsupported one, and a
  -- note-identity record carrying note_ref/note_type. A bare total is what let this
  -- expectation go stale when the fixture grew, so assert the COMPOSITION instead --
  -- it says what the fixture is rather than how many rows it happens to have.
  select count(*) into n from p3d_audit.source_inventory_notes where inventory_id = inv;
  perform pg_temp.rec('inventory','notes persisted from the payload','3',n::text,
    'persist_verification writes source_inventory_notes', n = 3);

  select string_agg(note_kind || '=' || c::text, ', ' order by note_kind) into brk
    from (select note_kind, count(*) c from p3d_audit.source_inventory_notes
           where inventory_id = inv group by note_kind) t;
  perform pg_temp.rec('inventory','notes persisted one per kind',
    'ignored=1, note=1, unsupported=1', coalesce(brk,'(none)'),
    'note_kind breakdown, not a bare total',
    brk = 'ignored=1, note=1, unsupported=1');

  -- The note-identity record must arrive with its bound fields intact.
  select count(*) into n from p3d_audit.source_inventory_notes
   where inventory_id = inv and note_kind = 'note' and note_ref = 2 and note_type = 'normal';
  perform pg_temp.rec('inventory','note identity fields round-trip','1',n::text,
    'note_ref and note_type persisted', n = 1);

  select count(*) into n from p3d_audit.source_inventory_notes
   where inventory_id = inv and note_kind = 'unsupported'
     and ns like 'http://schemas.openxmlformats.org/drawingml%'
     and rel_type like '%relationships/chart';
  perform pg_temp.rec('inventory','unsupported ns and rel_type round-trip','1',n::text,
    'ns and rel_type persisted', n = 1);

  select count(*) into n from p3d_audit.source_inventory_parts
   where inventory_id = inv and via is not null;
  perform pg_temp.rec('inventory','every part records how it was discovered','3',n::text,
    'via persisted for each part', n = 3);

  -- An unwalked part is evidence of a KNOWN_UNREAD relationship, and must survive
  -- with its error intact rather than being dropped for being uninteresting.
  select count(*) into n from p3d_audit.source_inventory_parts
   where inventory_id = inv and walked = false and error = 'KNOWN_UNREAD_REL';
  perform pg_temp.rec('inventory','unwalked part retains its error','1',n::text,
    'walked/error columns round-trip', n = 1);

  -- The tenant is DERIVED from the document; parts and notes inherit it.
  select count(*) into n from p3d_audit.source_inventory_parts
   where inventory_id = inv and company_id = cA;
  perform pg_temp.rec('inventory','parts inherit the derived company_id','3',n::text,
    'company read from the document, never the payload', n = 3);
  select count(*) into n from p3d_audit.source_inventory_notes
   where inventory_id = inv and company_id = cA;
  perform pg_temp.rec('inventory','notes inherit the derived company_id','3',n::text,
    'company read from the document, never the payload', n = 3);

  -- The digest covers BLOCKS only. That is deliberate -- supplementation copies
  -- from blocks -- but it means parts and notes are not digest-bound, so their
  -- integrity rests on append-only, which the next two tests exercise.
  select id into pid from p3d_audit.source_inventory_parts where inventory_id = inv limit 1;
  select id into nid from p3d_audit.source_inventory_notes where inventory_id = inv limit 1;
  perform set_config('p3d.part', pid::text, false);
  perform set_config('p3d.note', nid::text, false);
end $$;

select pg_temp.must_fail('inventory','UPDATE a persisted inventory part',
  format($q$ update p3d_audit.source_inventory_parts set walked = true where id = %L $q$,
    current_setting('p3d.part', true)), 'append-only trigger');

select pg_temp.must_fail('inventory','UPDATE a persisted inventory note',
  format($q$ update p3d_audit.source_inventory_notes set reason = 'rewritten' where id = %L $q$,
    current_setting('p3d.note', true)), 'append-only trigger');

-- Two readings of one part inside one inventory would make "which bytes did we
-- read?" ambiguous, so the address is unique. The whole run rolls back.
select pg_temp.must_fail('inventory','duplicate part_name within one inventory',
  format($q$ select p3d_audit.persist_verification(jsonb_build_object(
    'document_id',%L,'transcript_id',%L,
    'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256',repeat('f',64),
      'digest',p3d_audit.sha256_hex('word/z'||chr(31)||'0'||chr(31)||'0'||chr(31)||'z'),
      'parts',jsonb_build_array(
        jsonb_build_object('part_name','word/dup.xml','part_kind','document','walked',true),
        jsonb_build_object('part_name','word/dup.xml','part_kind','document','walked',true)),
      'blocks',jsonb_build_array(jsonb_build_object('part_name','word/z','xml_path','p','source_block',0,'source_order',0,'text','z'))),
    'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v','verifier_version','1',
      'ruleset_version','1','transcript_sha256',(select sha256 from p3d_audit.source_transcripts where id=%L)),
    'findings','[]'::jsonb)) $q$,
    (current_setting('p3d.fixture', true)::jsonb->>'dA'),
    (current_setting('p3d.fixture', true)::jsonb->>'tA'),
    (current_setting('p3d.fixture', true)::jsonb->>'tA')),
  'unique (inventory_id, part_name)');

-- An unrecognised note_kind is a classification this schema cannot interpret.
-- Accepting it would let "we checked everything" rest on a category nobody defined.
select pg_temp.must_fail('inventory','note with an undefined note_kind',
  format($q$ select p3d_audit.persist_verification(jsonb_build_object(
    'document_id',%L,'transcript_id',%L,
    'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256',repeat('0',64),
      'digest',p3d_audit.sha256_hex('word/z'||chr(31)||'0'||chr(31)||'0'||chr(31)||'z'),
      'notes',jsonb_build_array(jsonb_build_object('note_kind','probably-fine','reason','invented category')),
      'blocks',jsonb_build_array(jsonb_build_object('part_name','word/z','xml_path','p','source_block',0,'source_order',0,'text','z'))),
    'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v','verifier_version','1',
      'ruleset_version','1','transcript_sha256',(select sha256 from p3d_audit.source_transcripts where id=%L)),
    'findings','[]'::jsonb)) $q$,
    (current_setting('p3d.fixture', true)::jsonb->>'dA'),
    (current_setting('p3d.fixture', true)::jsonb->>'tA'),
    (current_setting('p3d.fixture', true)::jsonb->>'tA')),
  'CHECK note_kind in (ignored, unsupported, note)');

-- A failure anywhere in the function must leave NO parts or notes behind, or an
-- inventory could be cited as evidence while describing a package reading that
-- was never completed.
do $$
declare n int;
begin
  select count(*) into n from p3d_audit.source_inventory_parts p
   where not exists (select 1 from p3d_audit.source_inventories i where i.id = p.inventory_id);
  perform pg_temp.rec('transactionality','no orphan inventory parts survive','0',n::text,
    'function-level rollback', n = 0);
  select count(*) into n from p3d_audit.source_inventory_parts where part_name = 'word/dup.xml';
  perform pg_temp.rec('transactionality','rolled-back part insert left nothing','0',n::text,
    'function-level rollback', n = 0);
  select count(*) into n from p3d_audit.source_inventory_notes where note_kind = 'probably-fine';
  perform pg_temp.rec('transactionality','rolled-back note insert left nothing','0',n::text,
    'function-level rollback', n = 0);
end $$;

-- =====================================================================
-- E3. inventory-digest-v1
--
-- The digest used to cover blocks only, so a part could flip walked=true -> false,
-- a part's error could change, and any note could be rewritten, all while the
-- inventory still matched its recorded digest. Notes are what make a verdict of
-- VERIFIED auditable, so that gap undermined the verdict itself.
--
-- Each mutation below is persisted with ITS OWN JavaScript-computed digest. The
-- persist therefore succeeds only if the database's recomputation from stored rows
-- equals the independent implementation's, byte for byte -- so every accepted row
-- here is also a cross-implementation equality proof, not just a sensitivity check.
-- =====================================================================
do $$
declare
  f jsonb := current_setting('p3d.fixture', true)::jsonb;
  dA uuid := (f->>'dA')::uuid; tA uuid := (f->>'tA')::uuid;
  tsha text := (select sha256 from p3d_audit.source_transcripts where id=(f->>'tA')::uuid);
  invA uuid := current_setting('p3d.inv', true)::uuid;
  base text := current_setting('p3d.dig_runA', true);
  emoji text := U&'\+01F44D';
  parts jsonb; blocks jsonb; notes jsonb; muts jsonb; mu jsonb;
  runX uuid; invX uuid; got text; claimed text;
begin
  -- The main fixture, recomputed by the database from what it actually stored.
  got := p3d_audit.inventory_digest(invA);
  perform pg_temp.rec('digest','database recomputation equals the JS inventory digest',
    left(base,16), left(coalesce(got,'(null)'),16),
    'p3d_audit.inventory_digest(stored rows) vs api/_inventoryDigest.js', got = base);

  parts := jsonb_build_array(
    jsonb_build_object('part_name','word/document.xml','part_kind','document',
      'content_type','application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
      'bytes',4096,'sha256',repeat('1',64),'walked',true,'via','package/_rels/.rels'),
    jsonb_build_object('part_name','word/footnotes.xml','part_kind','footnotes',
      'content_type','application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml',
      'bytes',512,'sha256',repeat('2',64),'walked',true,'via','word/_rels/document.xml.rels'),
    jsonb_build_object('part_name','word/charts/chart1.xml','part_kind','chart',
      'content_type','application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
      'bytes',900,'sha256',repeat('3',64),'walked',false,'error','KNOWN_UNREAD_REL',
      'via','word/_rels/document.xml.rels'));
  blocks := jsonb_build_array(
    jsonb_build_object('part_name','word/document.xml','part_kind','document','xml_path','document/body/p/r/t','source_block',0,'source_order',0,'text','Body one.'),
    jsonb_build_object('part_name','word/document.xml','part_kind','document','xml_path','document/body/p/r/t','source_block',1,'source_order',1,'text','Grade 5 g/t '||emoji||' then more.'),
    jsonb_build_object('part_name','word/document.xml','part_kind','document','xml_path','document/body/p/r/t','source_block',2,'source_order',2,'text','Body three.'),
    jsonb_build_object('part_name','word/footnotes.xml','part_kind','footnotes','xml_path','footnotes/footnote/p/r/t','source_block',3,'source_order',3,'text','Footnote recovered text.'));
  notes := jsonb_build_array(
    jsonb_build_object('note_kind','ignored','part_name','word/document.xml','xml_path','document/body/p/pPr',
      'element','w:instrText','kind','field-instruction','reason','field instructions are not visible text','chars',18),
    jsonb_build_object('note_kind','unsupported','part_name','word/charts/chart1.xml','xml_path','chart',
      'element','c:chart','kind','chart','reason','chart text is not read by this engine','chars',0,
      'ns','http://schemas.openxmlformats.org/drawingml/2006/chart',
      'rel_type','http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart'),
    jsonb_build_object('note_kind','note','part_name','word/footnotes.xml','kind','footnote','chars',0,
      'note_ref',2,'note_type','normal'));

  -- label, digest key, mutated (parts, blocks, notes), and whether the digest MUST move
  muts := jsonb_build_array(
    jsonb_build_object('label','one-character block mutation','key','mut_blockOneChar','differs',true,
      'parts',parts,'notes',notes,
      'blocks',jsonb_set(blocks,'{3,text}','"Footnote recovered texd."'::jsonb)),
    jsonb_build_object('label','part walked flag flipped','key','mut_partWalked','differs',true,
      'blocks',blocks,'notes',notes,
      'parts',jsonb_set(parts,'{2,walked}','true'::jsonb)),
    jsonb_build_object('label','part error changed','key','mut_partError','differs',true,
      'blocks',blocks,'notes',notes,
      'parts',jsonb_set(parts,'{2,error}','"SOMETHING_ELSE"'::jsonb)),
    jsonb_build_object('label','note kind changed','key','mut_noteKind','differs',true,
      'parts',parts,'blocks',blocks,
      'notes',jsonb_set(notes,'{0,note_kind}','"note"'::jsonb)),
    jsonb_build_object('label','note text changed','key','mut_noteReason','differs',true,
      'parts',parts,'blocks',blocks,
      'notes',jsonb_set(notes,'{1,reason}','"chart text is not read by this engine."'::jsonb)),
    jsonb_build_object('label','note provenance changed','key','mut_noteProvenance','differs',true,
      'parts',parts,'blocks',blocks,
      'notes',jsonb_set(notes,'{0,xml_path}','"document/body/p/rPr"'::jsonb)),
    -- Sequence lives in source_block/source_order INSIDE each row, never in list
    -- position, so presenting the same manifest in another order is the same
    -- manifest. This is the determinism property, not a gap.
    -- One per field bound by the manifest expansion. Each changes exactly one value,
    -- so a digest that fails to move proves the field is outside the preimage.
    jsonb_build_object('label','part discovery route (via) changed','key','mut_partVia','differs',true,
      'blocks',blocks,'notes',notes,
      'parts',jsonb_set(parts,'{0,via}','"word/_rels/document.xml.rels"'::jsonb)),
    jsonb_build_object('label','note identity (note_ref) changed','key','mut_noteRef','differs',true,
      'parts',parts,'blocks',blocks,
      'notes',jsonb_set(notes,'{2,note_ref}','3'::jsonb)),
    jsonb_build_object('label','note type changed (content vs furniture)','key','mut_noteType','differs',true,
      'parts',parts,'blocks',blocks,
      'notes',jsonb_set(notes,'{2,note_type}','"separator"'::jsonb)),
    jsonb_build_object('label','unsupported element namespace changed','key','mut_noteNs','differs',true,
      'parts',parts,'blocks',blocks,
      'notes',jsonb_set(notes,'{1,ns}','"http://schemas.openxmlformats.org/drawingml/2006/main"'::jsonb)),
    jsonb_build_object('label','unread relationship type changed','key','mut_noteRelType','differs',true,
      'parts',parts,'blocks',blocks,
      'notes',jsonb_set(notes,'{1,rel_type}','"http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject"'::jsonb)),
    jsonb_build_object('label','same manifest presented in reverse order','key','mut_reordered','differs',false,
      'parts',(select jsonb_agg(x order by ord desc) from jsonb_array_elements(parts) with ordinality t(x,ord)),
      'blocks',(select jsonb_agg(x order by ord desc) from jsonb_array_elements(blocks) with ordinality t(x,ord)),
      'notes',(select jsonb_agg(x order by ord desc) from jsonb_array_elements(notes) with ordinality t(x,ord))));

  for mu in select * from jsonb_array_elements(muts) loop
    claimed := current_setting('p3d.dig_'||(mu->>'key'), true);
    runX := null;
    begin
      runX := p3d_audit.persist_verification(jsonb_build_object(
        'document_id',dA,'transcript_id',tA,
        'inventory',jsonb_build_object('engine','audit-inv','engine_version','1',
          'package_sha256',p3d_audit.sha256_hex(mu->>'key'),'digest',claimed,
          'parts',mu->'parts','blocks',mu->'blocks','notes',mu->'notes'),
        'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v',
          'verifier_version','1','ruleset_version','1','transcript_sha256',tsha),
        'findings','[]'::jsonb));
      perform pg_temp.rec('digest', format('%s: DB digest = JS digest', mu->>'label'),
        'accepted','accepted','persist_verification recomputes and compares', true);
    exception when others then
      perform pg_temp.rec('digest', format('%s: DB digest = JS digest', mu->>'label'),
        'accepted','REJECTED '||sqlstate||' '||left(sqlerrm,90),
        'persist_verification recomputes and compares', false);
    end;

    select inventory_id into invX from p3d_audit.verification_runs where id = runX;
    got := p3d_audit.inventory_digest(invX);
    if (mu->>'differs')::boolean then
      perform pg_temp.rec('digest', format('%s: digest moves', mu->>'label'),
        'differs from base', case when got is distinct from base then 'differs from base' else 'IDENTICAL' end,
        'field is inside the digest preimage', got is distinct from base);
    else
      perform pg_temp.rec('digest', format('%s: digest is unchanged', mu->>'label'),
        'identical to base', case when got = base then 'identical to base' else 'DIFFERS' end,
        'rows sort by encoded bytes; order is not identity', got = base);
    end if;
  end loop;
end $$;

-- Omitting or adding a row while claiming the complete manifest's digest. The
-- database hashes what it STORED, so a payload that is not the manifest cannot
-- carry the manifest's identity.
do $$
declare
  f jsonb := current_setting('p3d.fixture', true)::jsonb;
  tsha text := (select sha256 from p3d_audit.source_transcripts where id=(f->>'tA')::uuid);
  emoji text := U&'\+01F44D';
  base text := current_setting('p3d.dig_runA', true);
  tmpl text := $t$ select p3d_audit.persist_verification(jsonb_build_object(
      'document_id',%L,'transcript_id',%L,
      'inventory',jsonb_build_object('engine','audit-inv','engine_version','1',
        'package_sha256',%L,'digest',%L,
        'parts',%s,'blocks',%s,'notes',%s),
      'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v',
        'verifier_version','1','ruleset_version','1','transcript_sha256',%L),
      'findings','[]'::jsonb)) $t$;
  P text := $p$ jsonb_build_array(
      jsonb_build_object('part_name','word/document.xml','part_kind','document','content_type','application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml','bytes',4096,'sha256',repeat('1',64),'walked',true),
      jsonb_build_object('part_name','word/footnotes.xml','part_kind','footnotes','content_type','application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml','bytes',512,'sha256',repeat('2',64),'walked',true),
      jsonb_build_object('part_name','word/charts/chart1.xml','part_kind','chart','content_type','application/vnd.openxmlformats-officedocument.drawingml.chart+xml','bytes',900,'sha256',repeat('3',64),'walked',false,'error','KNOWN_UNREAD_REL')) $p$;
  B text; N text; cases jsonb; c jsonb;
begin
  B := $b$ jsonb_build_array(
      jsonb_build_object('part_name','word/document.xml','part_kind','document','xml_path','document/body/p/r/t','source_block',0,'source_order',0,'text','Body one.'),
      jsonb_build_object('part_name','word/document.xml','part_kind','document','xml_path','document/body/p/r/t','source_block',1,'source_order',1,'text','Grade 5 g/t '||U&'\+01F44D'||' then more.'),
      jsonb_build_object('part_name','word/document.xml','part_kind','document','xml_path','document/body/p/r/t','source_block',2,'source_order',2,'text','Body three.'),
      jsonb_build_object('part_name','word/footnotes.xml','part_kind','footnotes','xml_path','footnotes/footnote/p/r/t','source_block',3,'source_order',3,'text','Footnote recovered text.')) $b$;
  N := $n$ jsonb_build_array(
      jsonb_build_object('note_kind','ignored','part_name','word/document.xml','xml_path','document/body/p/pPr','element','w:instrText','kind','field-instruction','reason','field instructions are not visible text','chars',18),
      jsonb_build_object('note_kind','unsupported','part_name','word/charts/chart1.xml','xml_path','chart','element','c:chart','kind','chart','reason','chart text is not read by this engine','chars',0)) $n$;

  cases := jsonb_build_array(
    jsonb_build_object('label','omitted part',  'p', P||' - 2',                 'b', B,           'n', N),
    jsonb_build_object('label','omitted block', 'p', P,                         'b', B||' - 3',   'n', N),
    jsonb_build_object('label','omitted note',  'p', P,                         'b', B,           'n', N||' - 1'),
    jsonb_build_object('label','extra part',    'p', P||$x$ || jsonb_build_array(jsonb_build_object('part_name','word/invented.xml','walked',true))$x$, 'b', B, 'n', N),
    jsonb_build_object('label','extra block',   'p', P, 'b', B||$x$ || jsonb_build_array(jsonb_build_object('part_name','word/document.xml','xml_path','p','source_block',9,'source_order',9,'text','invented'))$x$, 'n', N),
    jsonb_build_object('label','extra note',    'p', P, 'b', B, 'n', N||$x$ || jsonb_build_array(jsonb_build_object('note_kind','note','reason','invented'))$x$));

  for c in select * from jsonb_array_elements(cases) loop
    perform pg_temp.must_fail_with('digest',
      format('%s while claiming the manifest digest', c->>'label'),
      format(tmpl, (f->>'dA'), (f->>'tA'), 'pkg-'||(c->>'label'), base, c->>'p', c->>'b', c->>'n', tsha),
      'inventory digest does not match',
      'digest recomputed from stored rows covers parts, blocks and notes');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Forging a newly bound field while claiming the true manifest digest.
--
-- These six fields were persisted and digested precisely because each changes
-- what the inventory MEANS: how a part was reached, which note a record concerns,
-- whether a note is content or furniture, which namespace an unreadable element
-- belongs to, and which relationship went unread. Before the expansion every one
-- of these could be rewritten while the digest still matched.
--
-- Each case below alters exactly one of them and presents the ORIGINAL digest.
-- The database hashes what it stored, so the claim cannot survive.
-- ---------------------------------------------------------------------
do $$
declare
  f jsonb := current_setting('p3d.fixture', true)::jsonb;
  tsha text := (select sha256 from p3d_audit.source_transcripts where id=(f->>'tA')::uuid);
  base text := current_setting('p3d.dig_runA', true);
  emoji text := U&'\+01F44D';
  parts jsonb; blocks jsonb; notes jsonb; cases jsonb; c jsonb;
begin
  parts := jsonb_build_array(
    jsonb_build_object('part_name','word/document.xml','part_kind','document',
      'content_type','application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
      'bytes',4096,'sha256',repeat('1',64),'walked',true,'via','package/_rels/.rels'),
    jsonb_build_object('part_name','word/footnotes.xml','part_kind','footnotes',
      'content_type','application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml',
      'bytes',512,'sha256',repeat('2',64),'walked',true,'via','word/_rels/document.xml.rels'),
    jsonb_build_object('part_name','word/charts/chart1.xml','part_kind','chart',
      'content_type','application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
      'bytes',900,'sha256',repeat('3',64),'walked',false,'error','KNOWN_UNREAD_REL',
      'via','word/_rels/document.xml.rels'));
  blocks := jsonb_build_array(
    jsonb_build_object('part_name','word/document.xml','part_kind','document','xml_path','document/body/p/r/t','source_block',0,'source_order',0,'text','Body one.'),
    jsonb_build_object('part_name','word/document.xml','part_kind','document','xml_path','document/body/p/r/t','source_block',1,'source_order',1,'text','Grade 5 g/t '||emoji||' then more.'),
    jsonb_build_object('part_name','word/document.xml','part_kind','document','xml_path','document/body/p/r/t','source_block',2,'source_order',2,'text','Body three.'),
    jsonb_build_object('part_name','word/footnotes.xml','part_kind','footnotes','xml_path','footnotes/footnote/p/r/t','source_block',3,'source_order',3,'text','Footnote recovered text.'));
  notes := jsonb_build_array(
    jsonb_build_object('note_kind','ignored','part_name','word/document.xml','xml_path','document/body/p/pPr',
      'element','w:instrText','kind','field-instruction','reason','field instructions are not visible text','chars',18),
    jsonb_build_object('note_kind','unsupported','part_name','word/charts/chart1.xml','xml_path','chart',
      'element','c:chart','kind','chart','reason','chart text is not read by this engine','chars',0,
      'ns','http://schemas.openxmlformats.org/drawingml/2006/chart',
      'rel_type','http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart'),
    jsonb_build_object('note_kind','note','part_name','word/footnotes.xml','kind','footnote','chars',0,
      'note_ref',2,'note_type','normal'));

  cases := jsonb_build_array(
    -- altered
    jsonb_build_object('label','forged part discovery route (via)',
      'p',jsonb_set(parts,'{0,via}','"word/_rels/forged.xml.rels"'::jsonb),'b',blocks,'n',notes),
    jsonb_build_object('label','forged note identity (note_ref)',
      'p',parts,'b',blocks,'n',jsonb_set(notes,'{2,note_ref}','99'::jsonb)),
    jsonb_build_object('label','forged note type (furniture presented as content)',
      'p',parts,'b',blocks,'n',jsonb_set(notes,'{2,note_type}','"continuationSeparator"'::jsonb)),
    jsonb_build_object('label','forged namespace on an unreadable element',
      'p',parts,'b',blocks,'n',jsonb_set(notes,'{1,ns}','"http://example.invalid/ns"'::jsonb)),
    jsonb_build_object('label','forged relationship type on an unread part',
      'p',parts,'b',blocks,'n',jsonb_set(notes,'{1,rel_type}','"http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject"'::jsonb)),
    -- omitted: the field is dropped entirely rather than changed
    jsonb_build_object('label','omitted part discovery route (via)',
      'p',(parts #- '{0,via}'),'b',blocks,'n',notes),
    jsonb_build_object('label','omitted note identity (note_ref)',
      'p',parts,'b',blocks,'n',(notes #- '{2,note_ref}')),
    jsonb_build_object('label','omitted relationship type on an unread part',
      'p',parts,'b',blocks,'n',(notes #- '{1,rel_type}')));

  for c in select * from jsonb_array_elements(cases) loop
    perform pg_temp.must_fail_with('digest',
      format('%s, claiming the true digest', c->>'label'),
      format($q$ select p3d_audit.persist_verification(jsonb_build_object(
        'document_id',%L,'transcript_id',%L,
        'inventory',jsonb_build_object('engine','audit-inv','engine_version','1',
          'package_sha256',%L,'digest',%L,'parts',%L::jsonb,'blocks',%L::jsonb,'notes',%L::jsonb),
        'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v',
          'verifier_version','1','ruleset_version','1','transcript_sha256',%L),
        'findings','[]'::jsonb)) $q$,
        (f->>'dA'), (f->>'tA'), 'pkg-'||(c->>'label'), base,
        (c->>'p'), (c->>'b'), (c->>'n'), tsha),
      'inventory digest does not match',
      'the bound field is inside the digest preimage');
  end loop;
end $$;

-- =====================================================================
-- F. ATTACK MATRIX -- persist_verification
-- =====================================================================
do $$
declare f jsonb := current_setting('p3d.fixture', true)::jsonb; dA uuid := (f->>'dA')::uuid;
        tA uuid := (f->>'tA')::uuid; tB uuid := (f->>'tB')::uuid; dB uuid := (f->>'dB')::uuid;
        cB uuid := (f->>'cB')::uuid; sha text;
begin
  select sha256 into sha from p3d_audit.source_transcripts where id=tA;

  perform pg_temp.must_fail('verification','forged inventory digest',
    format($q$ select p3d_audit.persist_verification(jsonb_build_object(
      'document_id',%L,'transcript_id',%L,
      'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256','z','digest','FORGED',
        'blocks',jsonb_build_array(jsonb_build_object('part_name','p','xml_path','p','source_block',0,'source_order',0,'text','t'))),
      'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v','verifier_version','1','ruleset_version','1','transcript_sha256',%L),
      'findings','[]'::jsonb)) $q$, dA,tA,sha), 'RPC recomputes digest from stored rows');

  perform pg_temp.must_fail('verification','forged inventory text (digest no longer matches)',
    format($q$ select p3d_audit.persist_verification(jsonb_build_object(
      'document_id',%L,'transcript_id',%L,
      'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256','z',
        'digest',p3d_audit.sha256_hex('p'||chr(31)||'0'||chr(31)||'0'||chr(31)||'original'),
        'blocks',jsonb_build_array(jsonb_build_object('part_name','p','xml_path','p','source_block',0,'source_order',0,'text','TAMPERED'))),
      'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v','verifier_version','1','ruleset_version','1','transcript_sha256',%L),
      'findings','[]'::jsonb)) $q$, dA,tA,sha), 'digest recomputation');

  perform pg_temp.must_fail('verification','omitted inventory block',
    format($q$ select p3d_audit.persist_verification(jsonb_build_object(
      'document_id',%L,'transcript_id',%L,
      'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256','z',
        'digest',p3d_audit.sha256_hex('p'||chr(31)||'0'||chr(31)||'0'||chr(31)||'a'||chr(30)||'p'||chr(31)||'1'||chr(31)||'1'||chr(31)||'b'),
        'blocks',jsonb_build_array(jsonb_build_object('part_name','p','xml_path','p','source_block',0,'source_order',0,'text','a'))),
      'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v','verifier_version','1','ruleset_version','1','transcript_sha256',%L),
      'findings','[]'::jsonb)) $q$, dA,tA,sha), 'digest recomputation');

  perform pg_temp.must_fail('verification','duplicate inventory blocks at one address',
    format($q$ select p3d_audit.persist_verification(jsonb_build_object(
      'document_id',%L,'transcript_id',%L,
      'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256','z','digest','d',
        'blocks',jsonb_build_array(
          jsonb_build_object('part_name','p','xml_path','p','source_block',0,'source_order',0,'text','a'),
          jsonb_build_object('part_name','p','xml_path','p','source_block',0,'source_order',0,'text','b'))),
      'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v','verifier_version','1','ruleset_version','1','transcript_sha256',%L),
      'findings','[]'::jsonb)) $q$, dA,tA,sha), 'unique (inventory,part,block,order)');

  perform pg_temp.must_fail('verification','malformed provenance (null block text)',
    format($q$ select p3d_audit.persist_verification(jsonb_build_object(
      'document_id',%L,'transcript_id',%L,
      'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256','z','digest','d',
        'blocks',jsonb_build_array(jsonb_build_object('part_name','p','xml_path','p','source_block',0,'source_order',0))),
      'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v','verifier_version','1','ruleset_version','1','transcript_sha256',%L),
      'findings','[]'::jsonb)) $q$, dA,tA,sha), 'NOT NULL on blocks.text');

  perform pg_temp.must_fail('verification','SUPPLEMENTABLE finding with no inventory content',
    format($q$ select p3d_audit.persist_verification(jsonb_build_object(
      'document_id',%L,'transcript_id',%L,
      'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256','z',
        'digest',current_setting('p3d.dig_noContent', true),
        'blocks',jsonb_build_array(jsonb_build_object('part_name','p','xml_path','p','source_block',0,'source_order',0,'text','a'))),
      'run',jsonb_build_object('run_status','COMPLETED','verdict','DISCREPANCY','verifier','v','verifier_version','1','ruleset_version','1','transcript_sha256',%L),
      'findings',jsonb_build_array(jsonb_build_object('category','MISSING_FROM_TRANSCRIPT','disposition','SUPPLEMENTABLE','part_name','word/nonexistent','source_block',9)))) $q$, dA,tA,sha),
    'RPC requires each SUPPLEMENTABLE finding to resolve to one block');

  perform pg_temp.must_fail('verification','SUPPLEMENTABLE on a non-MISSING category',
    format($q$ insert into p3d_audit.verification_findings(run_id,company_id,category,disposition)
      values (%L,%L,'MATCHED','SUPPLEMENTABLE') $q$, current_setting('p3d.run', true), (f->>'cA')),
    'CHECK vf_supplementable_ck');

  perform pg_temp.must_fail('verification','cross-transcript (transcript of another document)',
    format($q$ select p3d_audit.persist_verification(jsonb_build_object(
      'document_id',%L,'transcript_id',%L,
      'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256','z','digest','d','blocks','[]'::jsonb),
      'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v','verifier_version','1','ruleset_version','1','transcript_sha256','x'),
      'findings','[]'::jsonb)) $q$, dA, tB), 'RPC binds transcript to document+company');

  perform pg_temp.must_fail('verification','cross-document (document of another company)',
    format($q$ select p3d_audit.persist_verification(jsonb_build_object(
      'document_id',%L,'transcript_id',%L,
      'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256','z','digest','d','blocks','[]'::jsonb),
      'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v','verifier_version','1','ruleset_version','1','transcript_sha256','x'),
      'findings','[]'::jsonb)) $q$, dB, tB), 'can_touch_company inside the RPC');

  perform pg_temp.must_fail('verification','payload cannot choose its own tenant',
    format($q$ select p3d_audit.persist_verification(jsonb_build_object(
      'document_id',%L,'transcript_id',%L,'company_id',%L,
      'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256','z','digest','d','blocks','[]'::jsonb),
      'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v','verifier_version','1','ruleset_version','1','transcript_sha256','x'),
      'findings','[]'::jsonb)) $q$, dB, tB, (f->>'cA')), 'tenant read from the document, payload ignored');

  perform pg_temp.must_fail('verification','FAILED run carrying a verdict',
    format($q$ insert into p3d_audit.verification_runs(document_id,company_id,transcript_id,inventory_id,
      run_status,verdict,verifier,verifier_version,ruleset_version,transcript_sha256,inventory_digest)
      values (%L,%L,%L,%L,'FAILED','VERIFIED','v','1','1','x','y') $q$,
      dA,(f->>'cA'),tA,current_setting('p3d.inv', true)), 'CHECK vr_verdict_ck');
end $$;

-- =====================================================================
-- G. ATTACK MATRIX -- persist_canonical
-- =====================================================================
do $$
declare
  f jsonb := current_setting('p3d.fixture', true)::jsonb;
  run uuid := nullif(current_setting('p3d.run', true),'')::uuid;
  fn text := f->>'fn';
  -- Codepoint coordinates for the three body blocks of the fixture transcript.
  -- Block 1 sits AFTER the emoji, which is the case that exposed the offset bug.
  b0 text := 'Body one.'; b1 text := 'Grade 5 g/t ' || U&'\+01F44D' || ' then more.'; b2 text := 'Body three.';
  s0 int := 1; l0 int; s1 int; l1 int; s2 int; l2 int; canA uuid; okSpans jsonb;
begin
  l0 := length(b0); s1 := l0 + 2; l1 := length(b1); s2 := s1 + l1 + 1; l2 := length(b2);

  okSpans := jsonb_build_array(
    jsonb_build_object('canonical_order',0,'region_kind','body','origin','engine','text',b0,
      'part_name','word/document.xml','part_kind','document','source_block',0,'source_order',0,
      'transcript_start',s0,'transcript_length',l0),
    jsonb_build_object('canonical_order',1,'region_kind','body','origin','engine','text',b1,
      'part_name','word/document.xml','part_kind','document','source_block',1,'source_order',1,
      'transcript_start',s1,'transcript_length',l1),
    jsonb_build_object('canonical_order',2,'region_kind','body','origin','engine','text',b2,
      'part_name','word/document.xml','part_kind','document','source_block',2,'source_order',2,
      'transcript_start',s2,'transcript_length',l2),
    jsonb_build_object('canonical_order',3,'region_kind','footnotes','origin','supplement','text',fn,
      'part_name','word/footnotes.xml','part_kind','footnotes','source_block',3,'source_order',3,
      'composition_rule_id','supplement_footnotes','composition_rule_version','1.0.0'));
  perform set_config('p3d.spans', okSpans::text, false);

  -- HAPPY PATH (includes an engine span AFTER an emoji)
  begin
    canA := p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',run,
      'composer','audit-composer','composer_version','1','composition_ruleset','1.0.0','spans',okSpans));
    perform set_config('p3d.can', canA::text, false);
    perform pg_temp.rec('provenance','persist_canonical happy path (span after emoji)','accepted','accepted','RPC',true);
  exception when others then
    perform pg_temp.rec('provenance','persist_canonical happy path (span after emoji)','accepted',
      'REJECTED '||sqlstate||' '||left(sqlerrm,110),'RPC',false);
  end;

  -- ---- forgery attempts -------------------------------------------------
  -- The persisted text must be the RECONSTRUCTION under every circumstance.
  perform pg_temp.rec('canonical','persisted serialization equals the span reconstruction',
    'reconstruction',
    case when (select serialized from p3d_audit.canonical_sources where id=canA)
              = (select string_agg(text, E'\n' order by canonical_order)
                   from p3d_audit.canonical_spans where canonical_id=canA and region_kind='body')
              || E'\n\n' ||
              (select string_agg(text, E'\n' order by canonical_order)
                   from p3d_audit.canonical_spans where canonical_id=canA and region_kind='footnotes')
      then 'reconstruction' else 'MISMATCH' end,
    'spans -> serialized',
    (select serialized from p3d_audit.canonical_sources where id=canA)
      = (select string_agg(text, E'\n' order by canonical_order)
           from p3d_audit.canonical_spans where canonical_id=canA and region_kind='body')
        || E'\n\n' ||
        (select string_agg(text, E'\n' order by canonical_order)
           from p3d_audit.canonical_spans where canonical_id=canA and region_kind='footnotes'));

  perform pg_temp.must_fail('canonical','unrecognised payload field (composer typo)',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'compozer','typo','spans',%L::jsonb)) $q$, run, okSpans),
    'strict payload contract');

  perform pg_temp.must_fail('canonical','invented serialized content supplied by caller',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'serialized','TOTALLY INVENTED','spans',%L::jsonb)) $q$, run, okSpans),
    'serialized is reconstructed, never accepted');

  perform pg_temp.must_fail('canonical','omitted required supplement span',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'spans',jsonb_build_array(%L::jsonb->0,%L::jsonb->1,%L::jsonb->2))) $q$, run, okSpans, okSpans, okSpans),
    'reciprocal finding->span check');

  perform pg_temp.must_fail('canonical','invented extra span',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'spans',(%L::jsonb || jsonb_build_array(jsonb_build_object('canonical_order',4,'region_kind','body',
        'origin','engine','text','INVENTED','transcript_start',1,'transcript_length',8))))) $q$, run, okSpans),
    'engine span must equal its transcript slice');

  perform pg_temp.must_fail('canonical','non-dense canonical_order',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'spans',jsonb_build_array(jsonb_set(%L::jsonb->0,'{canonical_order}','5'::jsonb)))) $q$, run, okSpans),
    'RPC requires dense ordering from 0');

  perform pg_temp.must_fail('canonical','incorrect region_offsets supplied',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'region_offsets',jsonb_build_array(jsonb_build_object('kind','body','start',0,'end',9999)),
      'spans',%L::jsonb)) $q$, run, okSpans), 'offsets compared with reconstruction');

  perform pg_temp.must_fail('canonical','engine span text differing from transcript slice',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'spans',jsonb_build_array(jsonb_set(%L::jsonb->0,'{text}','"Body ONE."'::jsonb)))) $q$, run, okSpans),
    'substr(transcript,start,len) comparison');

  perform pg_temp.must_fail('canonical','engine span with wrong transcript offsets',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'spans',jsonb_build_array(jsonb_set(%L::jsonb->0,'{transcript_start}','3'::jsonb)))) $q$, run, okSpans),
    'substr comparison');

  perform pg_temp.must_fail('canonical','supplement differing by ONE character',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'spans',(jsonb_build_array(%L::jsonb->0,%L::jsonb->1,%L::jsonb->2) ||
        jsonb_build_array(jsonb_set(%L::jsonb->3,'{text}',to_jsonb(%L::text)))))) $q$,
      run, okSpans,okSpans,okSpans,okSpans, replace(fn,'recovered','recovereD')),
    'supplement text compared with inventory block');

  perform pg_temp.must_fail('canonical','supplement pointing at the wrong inventory block',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'spans',(jsonb_build_array(%L::jsonb->0,%L::jsonb->1,%L::jsonb->2) ||
        jsonb_build_array(jsonb_set(%L::jsonb->3,'{source_block}','0'::jsonb))))) $q$,
      run, okSpans,okSpans,okSpans,okSpans), 'block lookup by (inventory,part,block)');

  perform pg_temp.must_fail('canonical','supplement citing a finding that does not authorize it',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'spans',(jsonb_build_array(%L::jsonb->0,%L::jsonb->1,%L::jsonb->2) ||
        jsonb_build_array(jsonb_set(%L::jsonb->3,'{authorizing_finding_id}',to_jsonb(gen_random_uuid())))))) $q$,
      run, okSpans,okSpans,okSpans,okSpans), 'cited finding compared with the resolved one');

  perform pg_temp.must_fail('canonical','supplement citing the wrong composition rule',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'spans',(jsonb_build_array(%L::jsonb->0,%L::jsonb->1,%L::jsonb->2) ||
        jsonb_build_array(jsonb_set(%L::jsonb->3,'{composition_rule_id}','"supplement_headers"'::jsonb))))) $q$,
      run, okSpans,okSpans,okSpans,okSpans), 'rule id must match the block part kind');

  perform pg_temp.must_fail('canonical','duplicate supplementation of one finding',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'spans',(%L::jsonb || jsonb_build_array(jsonb_set(%L::jsonb->3,'{canonical_order}','4'::jsonb))))) $q$,
      run, okSpans, okSpans), 'reciprocal check: exactly once');

  perform pg_temp.must_fail('canonical','composition on an INDETERMINATE run',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0','spans',%L::jsonb)) $q$,
      current_setting('p3d.runind', true), okSpans), 'verdict eligibility');

  perform pg_temp.must_fail('canonical','composition on a FAILED run',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0','spans',%L::jsonb)) $q$,
      current_setting('p3d.runfail', true), okSpans), 'run_status eligibility');

  perform pg_temp.must_fail('canonical','unknown verification run',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0','spans',%L::jsonb)) $q$,
      gen_random_uuid(), okSpans), 'run lookup');

  perform pg_temp.must_fail('canonical','canonical with zero spans',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0','spans','[]'::jsonb)) $q$, run),
    'RPC rejects an empty canonical');
end $$;

-- cross-company: impersonate B and try to compose A's run
do $$
declare f jsonb := current_setting('p3d.fixture', true)::jsonb;
begin
  perform set_config('p3d.company', (f->>'cB'), false);
  perform pg_temp.must_fail('security','cross-company persist_canonical',
    format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
      'composer','c','composer_version','1','composition_ruleset','1.0.0','spans',%L::jsonb)) $q$,
      current_setting('p3d.run', true), current_setting('p3d.spans', true)), 'can_touch_company inside the RPC');
  perform pg_temp.must_fail('security','cross-company persist_verification',
    format($q$ select p3d_audit.persist_verification(jsonb_build_object('document_id',%L,'transcript_id',%L,
      'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256','z','digest','d','blocks','[]'::jsonb),
      'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v','verifier_version','1','ruleset_version','1','transcript_sha256','x'),
      'findings','[]'::jsonb)) $q$, (f->>'dA'), (f->>'tA')), 'can_touch_company inside the RPC');
  perform set_config('p3d.company', (f->>'cA'), false);
end $$;

-- =====================================================================
-- G2. COMPOSITION RULE CITATION
--
-- The earlier copy of persist_canonical checked a cited rule by deriving it:
--   composition_rule_id = 'supplement_' || part_kind
-- That passed every test here because every fixture used footnotes. The composer's
-- real ids are supplement_headers for part kind 'header' and supplement_footers for
-- 'footer', so the derived check would have rejected every legitimate header and
-- footer supplement in production while looking rigorous in the audit.
--
-- The FIRST test below is that regression: a header supplement, correctly cited,
-- must be ACCEPTED. The rest establish that a citation must be right about the rule,
-- its version, its ruleset, the part kind it covers and the region it authorizes.
-- =====================================================================
do $$
declare
  f jsonb := current_setting('p3d.fixture', true)::jsonb;
  dA uuid := (f->>'dA')::uuid; tA uuid := (f->>'tA')::uuid;
  tsha text := (select sha256 from p3d_audit.source_transcripts where id = (f->>'tA')::uuid);
  -- One case per rule in the ruleset that can actually be exercised end to end.
  -- Each gets its OWN run, so a case's single SUPPLEMENTABLE finding is satisfied
  -- exactly once and the reciprocal check cannot mask a rule failure.
  cases jsonb := jsonb_build_array(
    jsonb_build_object('part_kind','footnotes','part_name','word/footnotes.xml',
      'rule','supplement_footnotes','region','footnotes','digest_key','ruleFootnotes','text','Footnote recovered text.'),
    jsonb_build_object('part_kind','header','part_name','word/header1.xml',
      'rule','supplement_headers','region','headers','digest_key','ruleHeader','text','Header recovered text.'),
    jsonb_build_object('part_kind','footer','part_name','word/footer1.xml',
      'rule','supplement_footers','region','footers','digest_key','ruleFooter','text','Footer recovered text.'));
  c jsonb; runX uuid; canX uuid; spanX jsonb; got text;
begin
  for c in select * from jsonb_array_elements(cases) loop
    runX := p3d_audit.persist_verification(jsonb_build_object(
      'document_id',dA,'transcript_id',tA,
      'inventory',jsonb_build_object('engine','audit-inv','engine_version','1',
        'package_sha256',p3d_audit.sha256_hex(c->>'part_kind'),
        'digest',current_setting('p3d.dig_'||(c->>'digest_key'), true),
        'blocks',jsonb_build_array(jsonb_build_object(
          'part_name',c->>'part_name','part_kind',c->>'part_kind','xml_path','p/r/t',
          'source_block',0,'source_order',0,'text',c->>'text'))),
      'run',jsonb_build_object('run_status','COMPLETED','verdict','DISCREPANCY','verifier','audit-verifier',
        'verifier_version','1','ruleset_version','1','transcript_sha256',tsha),
      'findings',jsonb_build_array(jsonb_build_object(
        'category','MISSING_FROM_TRANSCRIPT','disposition','SUPPLEMENTABLE','severity','MATERIAL',
        'part_name',c->>'part_name','part_kind',c->>'part_kind','source_block',0,'source_order',0,
        'chars',length(c->>'text'),'reason','absent from the engine transcript'))));

    spanX := jsonb_build_object('canonical_order',0,'region_kind',c->>'region','origin','supplement',
      'text',c->>'text','part_name',c->>'part_name','part_kind',c->>'part_kind',
      'source_block',0,'source_order',0,
      'composition_rule_id',c->>'rule','composition_rule_version','1.0.0');

    -- THE REGRESSION. A derived 'supplement_' || part_kind computes
    -- supplement_header / supplement_footer and refuses the last two cases.
    canX := null;
    begin
      canX := p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',runX,
        'composer','audit-composer','composer_version','1','composition_ruleset','1.0.0',
        'spans',jsonb_build_array(spanX)));
      perform pg_temp.rec('rules',
        format('%s + %s + %s', c->>'part_kind', c->>'rule', c->>'region'),
        'accepted','accepted','rule table lookup by (rule_id, rule_version)', true);
    exception when others then
      perform pg_temp.rec('rules',
        format('%s + %s + %s', c->>'part_kind', c->>'rule', c->>'region'),
        'accepted','REJECTED '||sqlstate||' '||left(sqlerrm,110),
        'rule table lookup by (rule_id, rule_version)', false);
    end;

    -- ...and the recovered text must land in that rule's region, verbatim.
    select text into got from p3d_audit.canonical_spans
     where canonical_id = canX and region_kind = c->>'region';
    perform pg_temp.rec('rules',
      format('%s text lands in region %s, verbatim', c->>'part_kind', c->>'region'),
      c->>'text', coalesce(got,'(absent)'),
      'region taken from the rule, text from the inventory block', got = c->>'text');

    -- The header case carries the negative tests below.
    if (c->>'part_kind') = 'header' then
      perform set_config('p3d.runh', runX::text, false);
      perform set_config('p3d.hspan', spanX::text, false);
    end if;
  end loop;
end $$;

-- A rule that covers a different kind of part. supplement_footnotes is a real rule
-- at a real version -- it simply does not authorize anything about a header.
select pg_temp.must_fail('rules','rule covering a different part kind',
  format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
    'composer','c','composer_version','1','composition_ruleset','1.0.0',
    'spans',jsonb_build_array(jsonb_set(%L::jsonb,'{composition_rule_id}','"supplement_footnotes"'::jsonb)))) $q$,
    current_setting('p3d.runh', true), current_setting('p3d.hspan', true)),
  'rule.part_kind must equal the source block part kind');

select pg_temp.must_fail('rules','rule that does not exist',
  format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
    'composer','c','composer_version','1','composition_ruleset','1.0.0',
    'spans',jsonb_build_array(jsonb_set(%L::jsonb,'{composition_rule_id}','"supplement_whatever"'::jsonb)))) $q$,
    current_setting('p3d.runh', true), current_setting('p3d.hspan', true)),
  'rule lookup in composition_rules');

-- A future version of a rule may say something different. Citing a version that was
-- never published is a claim about a ruleset that does not exist.
select pg_temp.must_fail('rules','rule cited at an unpublished version',
  format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
    'composer','c','composer_version','1','composition_ruleset','1.0.0',
    'spans',jsonb_build_array(jsonb_set(%L::jsonb,'{composition_rule_version}','"9.9.9"'::jsonb)))) $q$,
    current_setting('p3d.runh', true), current_setting('p3d.hspan', true)),
  'lookup by (rule_id, rule_version)');

-- The canonical declares a ruleset; a rule from a different one cannot be cited
-- under it, or "composed under ruleset X" would not mean anything.
select pg_temp.must_fail('rules','rule from a ruleset the canonical does not claim',
  format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
    'composer','c','composer_version','1','composition_ruleset','9.9.9',
    'spans',jsonb_build_array(%L::jsonb))) $q$,
    current_setting('p3d.runh', true), current_setting('p3d.hspan', true)),
  'rule.ruleset_version must equal the canonical ruleset');

-- Right rule, right part kind, wrong destination. Header text moved into the body
-- would read as something the document said in its own voice.
select pg_temp.must_fail('rules','recovered text placed in a region the rule does not authorize',
  format($q$ select p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',%L,
    'composer','c','composer_version','1','composition_ruleset','1.0.0',
    'spans',jsonb_build_array(jsonb_set(%L::jsonb,'{region_kind}','"body"'::jsonb)))) $q$,
    current_setting('p3d.runh', true), current_setting('p3d.hspan', true)),
  'rule.region_kind must equal the span region');

-- Direct insert, bypassing the RPC: the FK still refuses an unknown rule.
select pg_temp.must_fail('rules','direct span insert citing an unknown rule',
  $q$ insert into p3d_audit.canonical_spans
        (canonical_id, company_id, canonical_order, region_kind, text, engine_extracted, origin,
         inventory_block_id, authorizing_finding_id, composition_rule_id, composition_rule_version)
      select cs.id, cs.company_id, 99, 'headers', 'x', false, 'supplement',
             b.id, vf.id, 'supplement_invented', '1.0.0'
        from p3d_audit.canonical_sources cs
        join p3d_audit.source_inventory_blocks b on b.company_id = cs.company_id
        join p3d_audit.verification_findings vf on vf.company_id = cs.company_id
       limit 1 $q$,
  'FK (composition_rule_id, composition_rule_version) -> composition_rules');

-- =====================================================================
-- H. DIRECT-WRITE BYPASS, IMMUTABILITY, ROLE BEHAVIOUR
-- =====================================================================
do $$
declare f jsonb := current_setting('p3d.fixture', true)::jsonb; can uuid := nullif(current_setting('p3d.can', true),'')::uuid;
begin
  if can is null then
    perform pg_temp.rec('security','SECTION H SKIPPED','a canonical exists',
      'no canonical was persisted; see the happy-path row','depends on section G',false);
    return;
  end if;
  perform pg_temp.must_fail('security','authenticated direct INSERT into canonical_sources',
    format($q$ set local role authenticated;
      insert into p3d_audit.canonical_sources(document_id,company_id,transcript_id,inventory_id,
        verification_run_id,composer,composer_version,composition_ruleset,serialized)
      values (%L,%L,%L,%L,%L,'x','1','1','FORGED') $q$,
      (f->>'dA'),(f->>'cA'),(f->>'tA'),current_setting('p3d.inv', true),current_setting('p3d.run', true)),
    'INSERT not granted to authenticated');
  reset role;

  perform pg_temp.must_fail('security','authenticated direct INSERT into canonical_spans',
    format($q$ set local role authenticated;
      insert into p3d_audit.canonical_spans(canonical_id,company_id,canonical_order,region_kind,text,
        engine_extracted,origin,transcript_start,transcript_length)
      values (%L,%L,99,'body','FORGED',true,'engine',1,3) $q$, can,(f->>'cA')),
    'INSERT not granted to authenticated');
  reset role;

  perform pg_temp.must_fail('security','anon direct INSERT into verification_runs',
    format($q$ set local role anon;
      insert into p3d_audit.verification_runs(document_id,company_id,transcript_id,inventory_id,
        run_status,verdict,verifier,verifier_version,ruleset_version,transcript_sha256,inventory_digest)
      values (%L,%L,%L,%L,'COMPLETED','VERIFIED','v','1','1','x','y') $q$,
      (f->>'dA'),(f->>'cA'),(f->>'tA'),current_setting('p3d.inv', true)), 'no grants to anon');
  reset role;

  perform pg_temp.must_fail('security','anon EXECUTE persist_canonical',
    $q$ set local role anon; select p3d_audit.persist_canonical('{}'::jsonb) $q$,
    'EXECUTE revoked from anon');
  reset role;

  perform pg_temp.must_fail('provenance','UPDATE a persisted canonical',
    format($q$ update p3d_audit.canonical_sources set serialized='TAMPERED' where id=%L $q$, can),
    'append-only trigger');

  perform pg_temp.must_fail('provenance','UPDATE a persisted span',
    format($q$ update p3d_audit.canonical_spans set text='TAMPERED' where canonical_id=%L $q$, can),
    'append-only trigger');

  perform pg_temp.must_fail('provenance','UPDATE a verification finding',
    format($q$ update p3d_audit.verification_findings set disposition='SUPPLEMENTABLE' where id=%L $q$,
      current_setting('p3d.find', true)), 'append-only trigger');

  perform pg_temp.must_fail('provenance','DELETE an inventory block cited by a span',
    format($q$ delete from p3d_audit.source_inventory_blocks where id=%L $q$, current_setting('p3d.blk', true)),
    'FK ON DELETE RESTRICT from canonical_spans');

  perform pg_temp.must_fail('security','cross-company span attached to another tenant canonical',
    format($q$ insert into p3d_audit.canonical_spans(canonical_id,company_id,canonical_order,region_kind,
        text,engine_extracted,origin,transcript_start,transcript_length)
      values (%L,%L,50,'body','x',true,'engine',1,1) $q$, can, (f->>'cB')),
    'composite FK (canonical_id, company_id)');

  perform pg_temp.must_fail('provenance','engine span carrying supplement provenance',
    format($q$ insert into p3d_audit.canonical_spans(canonical_id,company_id,canonical_order,region_kind,
        text,engine_extracted,origin,inventory_block_id,authorizing_finding_id,composition_rule_id,composition_rule_version)
      values (%L,%L,51,'body','x',true,'engine',%L,%L,'r','1') $q$,
      can,(f->>'cA'),current_setting('p3d.blk', true),current_setting('p3d.find', true)), 'CHECK csp_origin_ck');

  perform pg_temp.must_fail('provenance','supplement span carrying engine provenance',
    format($q$ insert into p3d_audit.canonical_spans(canonical_id,company_id,canonical_order,region_kind,
        text,engine_extracted,origin,transcript_start,transcript_length)
      values (%L,%L,52,'body','x',false,'supplement',1,1) $q$, can,(f->>'cA')), 'CHECK csp_origin_ck');

  perform pg_temp.must_fail('provenance','dictating the generated sha256',
    format($q$ insert into p3d_audit.canonical_sources(document_id,company_id,transcript_id,inventory_id,
        verification_run_id,composer,composer_version,composition_ruleset,serialized,sha256)
      values (%L,%L,%L,%L,%L,'x','1','1','t','deadbeef') $q$,
      (f->>'dA'),(f->>'cA'),(f->>'tA'),current_setting('p3d.inv', true),current_setting('p3d.run', true)),
    'GENERATED ALWAYS column');
end $$;

-- =====================================================================
-- H2. APPEND-ONLY AGAINST DELETE AS WELL AS UPDATE
--
-- RLS cannot carry this guarantee: service_role BYPASSES it, so an absent DELETE
-- policy protects nothing against anything holding the service key. Only a trigger
-- fires for every role.
--
-- service_role was granted full DML on this schema above, deliberately: without
-- that grant a refusal would come from a missing privilege and these tests would
-- pass for the wrong reason. must_fail_with therefore requires the error to say
-- 'append-only', not merely to be an error.
-- =====================================================================
do $$
declare t text; n int; bad text := '';
begin
  -- The catalogue first: every evidence table's trigger must fire on BOTH verbs.
  -- pg_trigger.tgtype bit 2 (4) is INSERT, bit 3 (8) is DELETE, bit 4 (16) is UPDATE.
  foreach t in array array['source_inventories','source_inventory_parts','source_inventory_blocks',
                           'source_inventory_notes','composition_rules','verification_runs',
                           'verification_findings','canonical_sources','canonical_spans'] loop
    select count(*) into n from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'p3d_audit' and c.relname = t and not tg.tgisinternal
       and (tg.tgtype & 8) > 0 and (tg.tgtype & 16) > 0;
    if n < 1 then bad := bad || t || ' '; end if;
  end loop;
  perform pg_temp.rec('immutability','every evidence table has a BEFORE UPDATE OR DELETE trigger',
    'all 9', case when bad = '' then 'all 9' else 'MISSING: '||bad end,
    'pg_trigger.tgtype delete+update bits', bad = '');
end $$;

-- Direct SQL as the schema owner -- the strongest caller there is, stronger than
-- service_role. If the trigger holds here it holds for everything short of
-- dropping it.
do $$
declare t text;
begin
  foreach t in array array['source_inventories','source_inventory_parts','source_inventory_blocks',
                           'source_inventory_notes','composition_rules','verification_runs',
                           'verification_findings','canonical_sources','canonical_spans'] loop
    perform pg_temp.must_fail_with('immutability',
      format('direct SQL DELETE on %s', t),
      format('delete from p3d_audit.%I', t), 'append-only',
      'BEFORE DELETE trigger, not RLS');
  end loop;
end $$;

-- ...and the same rows under service_role, which bypasses RLS entirely.
do $$
declare t text;
begin
  foreach t in array array['source_inventories','source_inventory_blocks','verification_runs',
                           'verification_findings','canonical_sources','canonical_spans'] loop
    perform pg_temp.must_fail_with('immutability',
      format('service_role DELETE on %s', t),
      format('set local role service_role; delete from p3d_audit.%I', t), 'append-only',
      'trigger fires for every role; RLS would not');
    reset role;
    perform pg_temp.must_fail_with('immutability',
      format('service_role UPDATE on %s', t),
      format('set local role service_role; update p3d_audit.%I set company_id = company_id', t), 'append-only',
      'trigger fires for every role; RLS would not');
    reset role;
  end loop;
end $$;

-- composition_rules is keyed (rule_id, rule_version) and has NO id column. The
-- guard referenced old.id and raised a type error here instead of its refusal: the
-- delete was blocked, but by the wrong mechanism and with a useless message. These
-- two prove the guard no longer assumes a table's shape.
select pg_temp.must_fail_with('immutability','direct SQL UPDATE on composition_rules (no id column)',
  $q$ update p3d_audit.composition_rules set why = 'rewritten' $q$, 'append-only',
  'guard reads the row generically, not old.id');

select pg_temp.must_fail_with('immutability','service_role DELETE on composition_rules (no id column)',
  $q$ set local role service_role; delete from p3d_audit.composition_rules $q$, 'append-only',
  'trigger fires for every role, on a composite-key table');
reset role;

-- Deleting the parent document would erase the whole evidence chain by cascade.
-- The trigger stops the cascade, which means a document carrying Phase 3 evidence
-- can no longer be deleted at all. That is the intended guarantee and a real
-- operational consequence -- see the audit report.
select pg_temp.must_fail_with('immutability','DELETE the parent document (cascade into evidence)',
  format('delete from p3d_audit.documents where id = %L',
    current_setting('p3d.fixture', true)::jsonb->>'dA'),
  'append-only', 'ON DELETE CASCADE reaches the evidence trigger and stops');

-- Nothing above removed anything.
do $$
declare n int; m int;
begin
  select count(*) into n from p3d_audit.canonical_sources;
  select count(*) into m from p3d_audit.canonical_spans;
  perform pg_temp.rec('immutability','evidence survived every deletion attempt',
    'canonicals > 0 and spans > 0', format('%s canonicals, %s spans', n, m),
    'rows still present after the DELETE matrix', n > 0 and m > 0);
end $$;

-- =====================================================================
-- I. UNICODE / COORDINATE CONTRACT
-- =====================================================================
do $$
declare
  can uuid := nullif(current_setting('p3d.can', true),'')::uuid;
  tt text; ser text; cc int; bc int; sha text;
  emoji text := U&'\+01F44D';
  b1 text := 'Grade 5 g/t ' || U&'\+01F44D' || ' then more.';
  js_start int; cp_start int;
begin
  select transcript_text into tt from p3d_audit.source_transcripts
    where id=(current_setting('p3d.fixture', true)::jsonb->>'tA')::uuid;
  select serialized, char_count, byte_count, sha256 into ser, cc, bc, sha
    from p3d_audit.canonical_sources where id=can;

  perform pg_temp.rec('unicode','emoji survives persistence byte-identically',
    'present', case when position(emoji in ser) > 0 then 'present' else 'LOST' end,
    'text column', position(emoji in ser) > 0);

  perform pg_temp.rec('unicode','char_count = PostgreSQL length() (characters)',
    length(ser)::text, cc::text, 'GENERATED length()', cc = length(ser));

  perform pg_temp.rec('unicode','byte_count = UTF-8 octet_length',
    octet_length(ser)::text, bc::text, 'GENERATED octet_length()', bc = octet_length(ser));

  perform pg_temp.rec('unicode','char_count < byte_count when astral text present',
    'true', (cc < bc)::text, 'UTF-8 encoding', cc < bc);

  perform pg_temp.rec('unicode','sha256 = sha256 of the exact UTF-8 serialization',
    left(p3d_audit.sha256_hex(ser),16), left(sha,16), 'GENERATED sha256_hex', sha = p3d_audit.sha256_hex(ser));

  -- THE CRITICAL ONE: the span AFTER the emoji.
  -- A JS UTF-16 offset would be one HIGHER than the codepoint offset.
  cp_start := position(b1 in tt);                      -- character position, 1-based
  js_start := cp_start + 1;                            -- what a UTF-16 index would give
  perform pg_temp.rec('unicode','engine span after emoji: codepoint offset selects exact text',
    b1, substr(tt, cp_start, length(b1)), 'substr() 1-based characters',
    substr(tt, cp_start, length(b1)) = b1);

  perform pg_temp.rec('unicode','a JS UTF-16 offset would select the WRONG text',
    'different from the span', substr(tt, js_start, length(b1)),
    'demonstrates why conversion is required', substr(tt, js_start, length(b1)) <> b1);

  perform pg_temp.rec('unicode','persisted span offsets are codepoints, not UTF-16',
    cp_start::text,
    (select transcript_start::text from p3d_audit.canonical_spans
      where canonical_id=can and canonical_order=1),
    'RPC validated via substr()',
    (select transcript_start from p3d_audit.canonical_spans where canonical_id=can and canonical_order=1) = cp_start);

  -- combining vs precomposed, NBSP, non-breaking hyphen, RTL
  perform pg_temp.rec('unicode','NFD and NFC are NOT conflated',
    'distinct', case when ('Cafe' || U&'\0301') = U&'Caf\00E9' then 'CONFLATED' else 'distinct' end,
    'exact text comparison', ('Cafe' || U&'\0301') <> U&'Caf\00E9');

  perform pg_temp.must_pass('unicode','NBSP / non-breaking hyphen / RTL round-trip',
    format($q$ insert into p3d_audit.source_inventory_blocks(inventory_id,company_id,part_name,xml_path,
        source_block,source_order,text)
      values (%L,%L,'unicode/probe','p',900,900, %L) $q$,
      current_setting('p3d.inv', true), (current_setting('p3d.fixture', true)::jsonb->>'cA'),
      '100' || U&'\00A0' || 'm non' || U&'\2011' || 'breaking ' || U&'\05D4\05D1\05D3\05D9\05E7\05D4'),
    'text column');

  perform pg_temp.rec('unicode','NBSP preserved exactly (not folded to space)',
    'preserved',
    case when exists (select 1 from p3d_audit.source_inventory_blocks
                       where part_name='unicode/probe' and position(U&'\00A0' in text) > 0)
      then 'preserved' else 'FOLDED' end, 'text column',
    exists (select 1 from p3d_audit.source_inventory_blocks
             where part_name='unicode/probe' and position(U&'\00A0' in text) > 0));

  perform pg_temp.rec('unicode','non-breaking hyphen preserved',
    'preserved',
    case when exists (select 1 from p3d_audit.source_inventory_blocks
                       where part_name='unicode/probe' and position(U&'\2011' in text) > 0)
      then 'preserved' else 'LOST' end, 'text column',
    exists (select 1 from p3d_audit.source_inventory_blocks
             where part_name='unicode/probe' and position(U&'\2011' in text) > 0));

  perform pg_temp.rec('unicode','RTL text preserved',
    'preserved',
    case when exists (select 1 from p3d_audit.source_inventory_blocks
                       where part_name='unicode/probe' and position(U&'\05D4' in text) > 0)
      then 'preserved' else 'LOST' end, 'text column',
    exists (select 1 from p3d_audit.source_inventory_blocks
             where part_name='unicode/probe' and position(U&'\05D4' in text) > 0));
end $$;

-- =====================================================================
-- J. TRANSACTIONALITY -- no partial authoritative artifacts
-- =====================================================================
do $$
declare
  before_c int; after_c int; before_s int; after_s int; before_i int; after_i int; before_r int; after_r int;
  f jsonb := current_setting('p3d.fixture', true)::jsonb; run uuid := nullif(current_setting('p3d.run', true),'')::uuid;
  spans jsonb := current_setting('p3d.spans', true)::jsonb;
begin
  select count(*) into before_c from p3d_audit.canonical_sources;
  select count(*) into before_s from p3d_audit.canonical_spans;
  select count(*) into before_i from p3d_audit.source_inventories;
  select count(*) into before_r from p3d_audit.verification_runs;

  -- failure while validating spans (after staging has begun)
  begin
    perform p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',run,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'spans',(jsonb_build_array(spans->0,spans->1) ||
               jsonb_build_array(jsonb_set(spans->2,'{text}','"CORRUPT"'::jsonb)))));
  exception when others then null; end;

  select count(*) into after_c from p3d_audit.canonical_sources;
  select count(*) into after_s from p3d_audit.canonical_spans;
  perform pg_temp.rec('transactionality','failure during span validation leaves no canonical',
    before_c::text, after_c::text, 'function-level transaction rollback', before_c = after_c);
  perform pg_temp.rec('transactionality','failure during span validation leaves no spans',
    before_s::text, after_s::text, 'function-level transaction rollback', before_s = after_s);

  -- failure at the reciprocal check, i.e. AFTER all spans staged successfully
  begin
    perform p3d_audit.persist_canonical(jsonb_build_object('verification_run_id',run,
      'composer','c','composer_version','1','composition_ruleset','1.0.0',
      'spans',jsonb_build_array(spans->0,spans->1,spans->2)));
  exception when others then null; end;
  select count(*) into after_c from p3d_audit.canonical_sources;
  select count(*) into after_s from p3d_audit.canonical_spans;
  perform pg_temp.rec('transactionality','failure after full staging leaves no parent',
    before_c::text, after_c::text, 'parent inserted last', before_c = after_c);
  perform pg_temp.rec('transactionality','failure after full staging leaves no orphan spans',
    before_s::text, after_s::text, 'parent inserted last', before_s = after_s);

  -- failure inside persist_verification AFTER inventory rows were inserted
  begin
    perform p3d_audit.persist_verification(jsonb_build_object(
      'document_id',(f->>'dA'),'transcript_id',(f->>'tA'),
      'inventory',jsonb_build_object('engine','x','engine_version','1','package_sha256','z','digest','WRONG',
        'blocks',jsonb_build_array(jsonb_build_object('part_name','rollback/probe','xml_path','p',
          'source_block',0,'source_order',0,'text','should not survive'))),
      'run',jsonb_build_object('run_status','COMPLETED','verdict','VERIFIED','verifier','v','verifier_version','1',
        'ruleset_version','1','transcript_sha256',(select sha256 from p3d_audit.source_transcripts where id=(f->>'tA')::uuid)),
      'findings','[]'::jsonb));
  exception when others then null; end;
  select count(*) into after_i from p3d_audit.source_inventories;
  select count(*) into after_r from p3d_audit.verification_runs;
  perform pg_temp.rec('transactionality','digest failure rolls back the inventory too',
    before_i::text, after_i::text, 'function-level rollback', before_i = after_i);
  perform pg_temp.rec('transactionality','no orphan verification run survives',
    before_r::text, after_r::text, 'function-level rollback', before_r = after_r);
  perform pg_temp.rec('transactionality','no orphan inventory blocks survive',
    '0', (select count(*)::text from p3d_audit.source_inventory_blocks where part_name='rollback/probe'),
    'function-level rollback',
    (select count(*) from p3d_audit.source_inventory_blocks where part_name='rollback/probe') = 0);
end $$;

-- =====================================================================
-- K. TRUST-BOUNDARY INSPECTION (catalogue facts, not assertions)
-- =====================================================================
do $$
declare cfg text[]; sec boolean; acl text;
begin
  select p.proconfig, p.prosecdef into cfg, sec from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='p3d_audit' and p.proname='persist_canonical';
  perform pg_temp.rec('security','persist_canonical is SECURITY DEFINER','true',coalesce(sec::text,'?'),'pg_proc.prosecdef',sec);
  perform pg_temp.rec('security','persist_canonical pins search_path','set',
    coalesce(array_to_string(cfg,','),'NOT SET'),'pg_proc.proconfig',
    cfg is not null and array_to_string(cfg,',') like 'search_path=%');

  select p.proconfig, p.prosecdef into cfg, sec from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='p3d_audit' and p.proname='persist_verification';
  perform pg_temp.rec('security','persist_verification is SECURITY DEFINER','true',coalesce(sec::text,'?'),'pg_proc.prosecdef',sec);
  perform pg_temp.rec('security','persist_verification pins search_path','set',
    coalesce(array_to_string(cfg,','),'NOT SET'),'pg_proc.proconfig',
    cfg is not null and array_to_string(cfg,',') like 'search_path=%');

  perform pg_temp.rec('security','authenticated has no INSERT on canonical_sources','false',
    has_table_privilege('authenticated','p3d_audit.canonical_sources','INSERT')::text,
    'table ACL', not has_table_privilege('authenticated','p3d_audit.canonical_sources','INSERT'));
  perform pg_temp.rec('security','authenticated has no UPDATE on canonical_spans','false',
    has_table_privilege('authenticated','p3d_audit.canonical_spans','UPDATE')::text,
    'table ACL', not has_table_privilege('authenticated','p3d_audit.canonical_spans','UPDATE'));
  perform pg_temp.rec('security','authenticated has no DELETE on verification_findings','false',
    has_table_privilege('authenticated','p3d_audit.verification_findings','DELETE')::text,
    'table ACL', not has_table_privilege('authenticated','p3d_audit.verification_findings','DELETE'));
  perform pg_temp.rec('security','anon cannot EXECUTE persist_canonical','false',
    has_function_privilege('anon','p3d_audit.persist_canonical(jsonb)','EXECUTE')::text,
    'function ACL', not has_function_privilege('anon','p3d_audit.persist_canonical(jsonb)','EXECUTE'));
  perform pg_temp.rec('security','authenticated CAN execute persist_canonical','true',
    has_function_privilege('authenticated','p3d_audit.persist_canonical(jsonb)','EXECUTE')::text,
    'function ACL', has_function_privilege('authenticated','p3d_audit.persist_canonical(jsonb)','EXECUTE'));
end $$;

-- =====================================================================
-- L. PUBLIC UNCHANGED + PHASE 3 TABLES ABSENT
-- =====================================================================
do $$
declare k text; n bigint; e bigint;
begin
  for k, e in select b.tbl, b.n from pg_temp.public_baseline b order by b.tbl loop
    execute format('select count(*) from public.%I', k) into n;
    perform pg_temp.rec('public-unchanged', format('public.%s row count unchanged by this run', k),
      e::text, n::text, 'count(*) at start of run vs at end', n = e);
  end loop;

  foreach k in array array['source_inventories','source_inventory_parts','source_inventory_blocks',
                           'source_inventory_notes','composition_rules','verification_runs',
                           'verification_findings','canonical_sources','canonical_spans'] loop
    perform pg_temp.rec('public-unchanged', format('public.%s absent', k), 'absent',
      coalesce(to_regclass('public.'||k)::text,'absent'), 'to_regclass',
      to_regclass('public.'||k) is null);
  end loop;

  foreach k in array array['persist_verification','persist_canonical','inventory_digest',
                           'idg_enc','idg_section','phase3_append_only'] loop
    perform pg_temp.rec('public-unchanged', format('public.%s() absent', k), 'absent',
      coalesce((select string_agg(p.proname,',') from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
                 where ns.nspname='public' and p.proname=k),'absent'), 'pg_proc',
      not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
                   where ns.nspname='public' and p.proname=k));
  end loop;
end $$;

-- =====================================================================
-- M. CLEANUP
-- =====================================================================
drop schema p3d_audit cascade;

do $$
begin
  perform pg_temp.rec('cleanup','p3d_audit schema dropped','absent',
    coalesce((select nspname from pg_namespace where nspname='p3d_audit'),'absent'),'pg_namespace',
    not exists (select 1 from pg_namespace where nspname='p3d_audit'));
  perform pg_temp.rec('cleanup','p3d_audit.exec/q helpers gone','absent',
    coalesce((select string_agg(p.proname,',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='p3d_audit'),'absent'),'pg_proc',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='p3d_audit'));
  perform pg_temp.rec('cleanup','no Phase 3 objects left in public','absent',
    coalesce((select string_agg(c.relname,',') from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public'
                 and c.relname in ('source_inventories','verification_runs','canonical_sources','canonical_spans')),
             'absent'),'pg_class',
    not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public'
                   and c.relname in ('source_inventories','verification_runs','canonical_sources','canonical_spans')));
end $$;

-- =====================================================================
-- FINAL REPORT  (this is the result pane you copy back)
-- =====================================================================
select category, attack, expected, actual, mechanism,
       case when pass then 'PASS' else '*** FAIL ***' end as pass
  from pg_temp.audit_results
union all
select '~~ SUMMARY ~~', 'total tests', '', count(*)::text, '', ''            from pg_temp.audit_results
union all
select '~~ SUMMARY ~~', 'passed', '', count(*)::text, '', ''                 from pg_temp.audit_results where pass is true
union all
select '~~ SUMMARY ~~', 'FAILED', '', count(*)::text, '',
       case when count(*)=0 then 'clean' else '*** INVESTIGATE ***' end      from pg_temp.audit_results where pass is not true
union all
select '~~ SUMMARY ~~', 'unicode tests', '', count(*)::text, '', ''          from pg_temp.audit_results where category='unicode'
union all
select '~~ SUMMARY ~~', 'transactionality tests', '', count(*)::text, '', '' from pg_temp.audit_results where category='transactionality'
union all
select '~~ SUMMARY ~~', 'security/role tests', '', count(*)::text, '', ''    from pg_temp.audit_results where category='security'
union all
select '~~ SUMMARY ~~', 'provenance tests', '', count(*)::text, '', ''       from pg_temp.audit_results where category='provenance'
union all
select '~~ SUMMARY ~~', 'verification RPC tests', '', count(*)::text, '', '' from pg_temp.audit_results where category='verification'
union all
select '~~ SUMMARY ~~', 'inventory-digest tests', '', count(*)::text, '', ''   from pg_temp.audit_results where category='digest'
union all
select '~~ SUMMARY ~~', 'append-only (UPDATE+DELETE) tests', '', count(*)::text, '', '' from pg_temp.audit_results where category='immutability'
union all
select '~~ SUMMARY ~~', 'composition-rule tests', '', count(*)::text, '', ''   from pg_temp.audit_results where category='rules'
union all
select '~~ SUMMARY ~~', 'inventory parts/notes tests', '', count(*)::text, '', '' from pg_temp.audit_results where category='inventory'
union all
select '~~ SUMMARY ~~', 'canonical RPC tests', '', count(*)::text, '', ''    from pg_temp.audit_results where category='canonical'
union all
select '~~ SUMMARY ~~', 'public-unchanged checks', '', count(*)::text, '', '' from pg_temp.audit_results where category='public-unchanged'
order by 1, 2;
