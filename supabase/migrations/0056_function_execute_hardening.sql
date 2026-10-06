-- ============================================================================
-- 0056_function_execute_hardening.sql — remedial, narrow.
--
-- THE FINDING
-- -----------
-- 0050a's verification showed `anon` holding EXECUTE on mineiq_search() despite
-- the migration saying:
--
--     revoke execute on function public.mineiq_search(...) from public;
--
-- That revokes the implicit PUBLIC grant Postgres puts on every new function.
-- It does NOT remove Supabase's DEFAULT PRIVILEGES, which separately grant
-- EXECUTE on new functions to `anon` and `authenticated`. Two different grants;
-- revoking one leaves the other.
--
-- This is the function-level twin of the table-level defect 0052 and 0053
-- fixed, and I repeated it in every migration I wrote: 9 of 12 functions.
--
-- HOW EXPOSED
-- -----------
-- Not exploitable, and worth stating precisely. Every one of these is SECURITY
-- DEFINER and gates on owns_company()/can_touch_company(), which resolve through
-- auth.uid(). The anon role carries no auth.uid(), so each raises 42501 before
-- touching data. The grant was useless to an attacker -- and should still never
-- have been there, because the gate inside the function is then the ONLY thing
-- standing between the public key and company data.
--
-- APPLIED FUNCTIONS ONLY. 0048, 0049 and 0051 are not yet applied and have been
-- corrected at source, so they will never carry the defect.
-- ============================================================================

begin;

do $$
declare sig text;
begin
  foreach sig in array array[
    -- 0047 — messaging
    'public.owns_company_slug(text)',
    'public.mark_conversation_read(uuid)',
    'public.company_conversation_senders(text)',
    -- 0050a — MineIQ retrieval
    'public.mineiq_search(uuid, text, integer)'
  ]
  loop
    execute format('revoke execute on function %s from anon', sig);
    -- public is revoked again for idempotence: re-running this must converge on
    -- the same state whatever order anything else ran in.
    execute format('revoke execute on function %s from public', sig);
  end loop;
end $$;

-- NOT REVOKED FROM `authenticated`: owns_company_slug(text).
--
-- I nearly did, reasoning that it is only a helper. That would have broken
-- Messages in production. RLS policy expressions are evaluated as the QUERYING
-- role, not as the policy or table owner, so a role needs EXECUTE on every
-- function a policy calls. 0047's conv_select_company and msg_select_company
-- both call owns_company_slug(), so revoking it from authenticated would make
-- every company's inbox return nothing -- silently, since an RLS denial looks
-- exactly like having no messages.
--
-- Keeping the grant costs nothing: the function is SECURITY DEFINER and answers
-- only "may this caller touch this company", which they could determine anyway.

commit;
