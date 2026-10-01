-- ============================================================================
-- 0052_messaging_privilege_hardening.sql — remedial, narrow.
--
-- THE FINDING
-- -----------
-- Post-deploy verification of 0047 showed `anon` and `authenticated` holding
-- ALL SEVEN privileges on public.conversations and public.messages:
--
--   DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- This is Supabase's default grant on newly created tables. Migration 0014
-- created both tables and never revoked it, so it has been the case since
-- messaging shipped. 0047 did not cause it; 0047's verification found it.
--
-- This is the SAME defect 0045 corrected for the Phase 3 evidence tables.
--
-- HOW EXPOSED IT ACTUALLY WAS
-- ---------------------------
-- Limited, and worth stating precisely rather than dramatically. RLS is enabled
-- on both tables and no UPDATE or DELETE policy exists, so with RLS on those
-- commands were denied for every role regardless of grant. `anon` carries no
-- auth.uid() and therefore matched no SELECT policy either. Through PostgREST --
-- the only surface the anon key reaches -- nothing was readable or writable.
--
-- The exception is TRUNCATE, which this codebase established during Phase 3 is
-- restricted by NEITHER RLS nor row-level triggers. TRUNCATE is not exposed by
-- PostgREST, so it was not reachable in practice; it is nonetheless a privilege
-- neither role should ever have held.
--
-- WHAT STILL HAS TO WORK AFTERWARDS (checked against the code before writing)
-- --------------------------------------------------------------------------
--   investor app  reads conversations + messages as `authenticated`   -> SELECT kept
--   investor send POST /api/messages, service role                    -> unaffected
--   CEO reply     Postmark webhook, service role                      -> unaffected
--   portal inbox  reads both as `authenticated`                       -> SELECT kept
--   portal reply  inserts into messages as `authenticated`            -> INSERT kept
--   mark read     mark_conversation_read(), SECURITY DEFINER          -> needs no UPDATE grant
--
-- Nothing in src/ or api/ issues an UPDATE or DELETE against either table, so
-- revoking those breaks no current path.
--
-- service_role is deliberately untouched: the messaging bridge depends on it.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- anon: none
-- The anon key ships in the browser bundle. It has no business holding any
-- privilege on private correspondence.
revoke all on public.conversations from anon;
revoke all on public.messages      from anon;

-- ------------------------------------------- authenticated: least privilege
-- Named verbs rather than ALL, then re-grant, so the intent is legible and a
-- future reader can see exactly what each role is meant to do.
revoke insert, update, delete, truncate, trigger, references
  on public.conversations from authenticated;
revoke update, delete, truncate, trigger, references
  on public.messages from authenticated;

-- A company and an investor both READ their own conversations (RLS decides
-- which). Neither may create or alter one -- conversations are upserted by the
-- server when an investor first writes.
grant select on public.conversations to authenticated;

-- Reading a thread, and the company posting a reply (0047's msg_insert_company
-- pins sender='company'; the investor's own sends go through /api/messages).
grant select, insert on public.messages to authenticated;

commit;
