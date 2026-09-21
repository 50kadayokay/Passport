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
