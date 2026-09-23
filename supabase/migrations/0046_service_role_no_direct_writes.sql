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
