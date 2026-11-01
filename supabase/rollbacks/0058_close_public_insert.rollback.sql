-- ROLLBACK for 0058. Restores the state 0058 describes as before it: anon held
-- all privileges on contact_submissions and demo_bookings (Supabase default)
-- and INSERT only on listing_reports, with an anon INSERT policy of
-- `with check (true)` on each. RE-OPENS the unbounded public insert hole:
-- emergency only. (0058's own notes restored INSERT only; this is exact.)
-- If 0077 is applied, roll it back first.
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
grant all on public.contact_submissions to anon;
grant all on public.demo_bookings       to anon;
grant insert on public.listing_reports  to anon;
create policy anon_insert_contact on public.contact_submissions for insert to anon with check (true);
create policy anon_insert_demo    on public.demo_bookings       for insert to anon with check (true);
drop policy if exists listing_reports_insert on public.listing_reports;
create policy listing_reports_insert on public.listing_reports for insert to anon, authenticated with check (true);
commit;
