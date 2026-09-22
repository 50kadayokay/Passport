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
