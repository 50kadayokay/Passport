-- ============================================================================
-- 0092_listing_reports_column_insert.sql — NOT APPLIED. Prepared for review (S3).
--
-- listing_reports: INSERT on the six columns the installed app sends, instead
-- of on the whole table.
--
-- WHY. 0077 keeps anon INSERT open for installed 1.3.x builds, which file
-- "Report this listing / Claim this company" straight into this table with the
-- anon key. The grant is table-wide (0017's), so a guest could also set `id`
-- and `created_at`: backdate a report, choose its id, and probe whether an id
-- exists (23505). Found by scripts/listing-reports-0077-security-check.mjs.
--
-- WHAT. INSERT is revoked at table level from anon and authenticated, and
-- granted on (company_slug, company_name, kind, message, contact, user_id), the
-- exact body 1.3.x sends (prod-v1.3.2 PassportProto.jsx, Prefer:
-- return=minimal). `id` and `created_at` take their defaults. REVOKE on a table
-- also removes column grants, so the two statements leave exactly the six.
--
-- WHAT DOES NOT CHANGE. 0077's policy and bounds; no SELECT, UPDATE or DELETE
-- for anyone (there never was); service_role; /api/submit (service role).
-- Not changed either, and still open (reported, not fixed here): no rate limit
-- on this path, and a JSON array still inserts many rows per request.
--
-- Needs: 0077. Production: run it right after 0077, in the same runner session.
-- ROLLBACK: supabase/rollbacks/0092_listing_reports_column_insert.rollback.sql
-- Verified in a rolled-back transaction by scripts/listing-reports-0092-check.mjs.
-- ============================================================================

begin;

revoke insert on public.listing_reports from anon, authenticated;
grant insert (company_slug, company_name, kind, message, contact, user_id)
  on public.listing_reports to anon, authenticated;

commit;
