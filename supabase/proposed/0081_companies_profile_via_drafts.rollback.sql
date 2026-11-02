-- ROLLBACK for 0081_companies_profile_via_drafts.sql (PROPOSED, not applied).
-- Removes the trigger and its function; companies is back to the 0001 policies
-- and the 0030 owner guard. Clean: no data is touched.

begin;

drop trigger if exists trg_companies_profile_via_drafts on public.companies;
drop function if exists public.companies_profile_via_drafts();

commit;
