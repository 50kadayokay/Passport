-- 0077_listing_reports_installed_app_compat.sql — APPLIED TO STAGING ONLY (2026-11-01, guarded runner;
-- file sha256 8c8e77321aee6aa8... at apply, this header line aside); NOT production.
-- Verified in a rolled-back staging transaction by scripts/listing-reports-compat-check.mjs.
-- ROLLBACK: supabase/rollbacks/0077_listing_reports_installed_app_compat.rollback.sql
--
-- WHY. 0058 removes anon INSERT on listing_reports. Every installed iPhone /
-- Android build (1.3.x, tag prod-v1.3.2) files "Report this listing / Claim this
-- company" by inserting into listing_reports WITH THE ANON KEY
-- (PassportProto.jsx). Those builds cannot be fixed by a web deploy, so 0058
-- alone would break that feature on every phone until users update.
--
-- WHAT. Restore anon INSERT on listing_reports ONLY (contact_submissions and
-- demo_bookings stay closed: the web forms now go through /api/submit), with a
-- policy tighter than the original `with check (true)`: the two kinds the app
-- sends, a company slug, and the same length ceilings /api/submit enforces.
-- user_id stays unconstrained because the installed builds send the signed-in
-- user's id alongside the anon key -- exactly as production behaves today.
--
-- TEMPORARY. New builds use /api/submit (with a fallback to this path while the
-- API is not deployed). When adoption of such a build is high, a later migration
-- re-applies 0058's listing_reports section and this compatibility ends.
-- Production: apply in the SAME runner session as 0058, immediately after it.
begin;

grant insert on public.listing_reports to anon;

drop policy if exists listing_reports_insert on public.listing_reports;
create policy listing_reports_insert on public.listing_reports
  for insert to anon, authenticated
  with check (
    company_slug is not null and length(company_slug) between 1 and 120
    and kind in ('error', 'claim')
    and length(coalesce(company_name, '')) <= 200
    and length(coalesce(message, ''))      <= 4000
    and length(coalesce(contact, ''))      <= 200
  );

commit;
