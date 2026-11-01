-- ROLLBACK for 0092_listing_reports_column_insert.sql. Restores the post-0077
-- grants exactly: table-level INSERT on listing_reports for anon and
-- authenticated, and no column-level grants (REVOKE on the table removes them).
-- 0077's policy is untouched by both files.
-- Verified in a rolled-back transaction by scripts/listing-reports-0092-check.mjs.
begin;

revoke insert on public.listing_reports from anon, authenticated;
grant insert on public.listing_reports to anon, authenticated;

commit;
