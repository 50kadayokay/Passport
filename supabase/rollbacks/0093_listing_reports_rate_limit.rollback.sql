-- ROLLBACK for 0093_listing_reports_rate_limit.sql. Removes the guard trigger, its
-- five functions and its two tables, and the counters it kept in
-- submission_throttle (forms listing_report_db_global / _network / _client;
-- /api/submit's own rows are untouched). Listing reports go back to 0092's
-- behaviour: bounded by 0077's policy, not rate limited.
-- Verified in a rolled-back transaction by scripts/listing-reports-0093-check.mjs.
begin;

drop trigger if exists listing_reports_guard on public.listing_reports;
drop function if exists public.listing_reports_guard();
drop function if exists public.listing_report_key(text, text);
drop function if exists public.listing_report_network(text);
drop function if exists public.listing_report_canonical_ip(text);
drop function if exists public.listing_report_client_ip();
drop function if exists public.listing_report_client_key();   -- the first draft's name, in case it was ever applied
delete from public.submission_throttle where form in ('listing_report_db_global', 'listing_report_db_network', 'listing_report_db_client');
drop table if exists public.submission_throttle_salt;
drop table if exists public.listing_report_limits;

commit;
