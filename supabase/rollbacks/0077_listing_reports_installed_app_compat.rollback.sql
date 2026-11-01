-- ROLLBACK for 0077: back to exactly 0058's listing_reports state (signed-in
-- inserts only; anon has no privileges). Verified by
-- scripts/listing-reports-compat-check.mjs (rolled back).
begin;
drop policy if exists listing_reports_insert on public.listing_reports;
create policy listing_reports_insert on public.listing_reports
  for insert to authenticated with check (true);
revoke all on public.listing_reports from anon;
commit;
