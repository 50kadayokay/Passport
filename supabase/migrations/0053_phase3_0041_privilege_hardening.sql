-- ============================================================================
-- 0053_phase3_0041_privilege_hardening.sql — finish what 0045 started.
--
-- THE GAP
-- -------
-- 0045 hardened the Phase 3 evidence tables, but only the ones 0042 created:
--
--     source_inventories, source_inventory_parts,
--     source_inventory_blocks, source_inventory_notes
--
-- 0041's two tables were never covered:
--
--     source_transcripts, extraction_attempts
--
-- A grant sweep found both still carrying Supabase's default: anon and
-- authenticated holding all seven privileges, including DELETE and TRUNCATE.
--
-- WHY IT MATTERS HERE PARTICULARLY
-- --------------------------------
-- These are evidence tables. The whole point of Phase 3 was that a stored
-- transcript is proof of what a document said, which means it must not be
-- alterable after the fact. The append-only triggers refuse UPDATE and DELETE
-- -- but TRUNCATE is restricted by NEITHER RLS NOR ROW-LEVEL TRIGGERS, which is
-- the exact finding that made 0043 add statement-level TRUNCATE guards to the
-- inventory tables. Those guards were never added here, and neither was the
-- revoke. anon has held TRUNCATE on the transcript chain since 0041 shipped.
--
-- Not reachable through PostgREST, which does not expose TRUNCATE. Wrong
-- regardless, and the cheapest possible thing to close.
--
-- WHAT MUST KEEP WORKING (checked against the code before writing)
-- ---------------------------------------------------------------
-- Unlike the inventory tables, which are written server-side, these two are
-- written FROM THE BROWSER by the signed-in user -- src/lib/sourceTranscript.js
-- POSTs to both and SELECTs from both (Phase 2 persists the transcript with the
-- user's own JWT so RLS can attribute it). So `authenticated` keeps SELECT and
-- INSERT. Only the destructive verbs go.
--
--   storeTranscript()        POST   source_transcripts     -> INSERT kept
--   transcriptsForDocument() SELECT source_transcripts     -> SELECT kept
--   recordExtractionAttempt()POST   extraction_attempts    -> INSERT kept
--   attemptsForDocument()    SELECT extraction_attempts    -> SELECT kept
--
-- Nothing in src/ or api/ issues an UPDATE or DELETE against either table.
-- service_role is untouched.
-- ============================================================================

begin;

do $$
declare t text;
begin
  foreach t in array array['source_transcripts', 'extraction_attempts']
  loop
    -- The public gets nothing. These are a company's private source evidence;
    -- no logged-out surface reads them.
    execute format('revoke all on public.%I from anon', t);

    -- Signed-in users may add evidence and read it back. They may never alter
    -- or remove it -- that is what makes it evidence. The append-only triggers
    -- already refuse UPDATE and DELETE; this removes the privilege as well, so
    -- the guarantee does not rest on the trigger alone.
    execute format(
      'revoke update, delete, truncate, trigger, references on public.%I from authenticated', t);
    execute format('grant select, insert on public.%I to authenticated', t);
  end loop;
end $$;

commit;
