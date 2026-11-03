-- ROLLBACK for 0095_public_lead_form_guard.sql. Returns both tables to their
-- post-0058 state: no anon access at all. REVOKE on the table removes the
-- column-level grants too. mineex.ca's legacy forms stop working again (401);
-- the passport site's /api/submit is unaffected.
begin;

drop trigger if exists demo_bookings_public_guard on public.demo_bookings;
drop trigger if exists contact_submissions_public_guard on public.contact_submissions;
drop function if exists public.public_form_guard();
drop function if exists public.public_form_client_ip();

drop policy if exists anon_insert_demo_guarded on public.demo_bookings;
drop policy if exists anon_insert_contact_guarded on public.contact_submissions;
revoke insert on public.demo_bookings from anon;
revoke insert on public.contact_submissions from anon;

delete from public.submission_throttle where form like 'lead_form_db_%';
drop table if exists public.public_form_limits;

commit;
