-- 0058_close_public_insert.sql
--
-- ███ DO NOT APPLY THIS UNTIL /api/submit IS DEPLOYED TO PRODUCTION. ███
--
-- This migration removes `anon`'s ability to INSERT into the three public
-- submission tables. Until api/submit.js is live AND the three client call sites
-- have been repointed at it, applying this BREAKS the contact page, the demo
-- form and listing reports -- silently, with a 401 the forms do not expect.
--
-- Correct order:
--   1. apply 0057                        (additive, safe any time)
--   2. deploy api/submit.js + the client changes
--   3. verify all three forms submit successfully in production
--   4. THEN apply this migration
--   5. re-verify all three forms
--
-- WHAT WAS WRONG
-- --------------
-- Each of these tables had an INSERT policy of `with check (true)` for `anon`.
-- The anon key ships in the client bundle, so anyone who loaded mineex.ca could
-- insert unlimited rows of arbitrary content into three production tables. RLS
-- was enabled and the SELECT side was correctly closed -- the reads were never
-- exposed -- but the write side had no bound at all: no size limit, no rate
-- limit, no validation, no spam gate.
--
-- WHAT REPLACES IT
-- ----------------
-- api/submit.js, writing with the service role after validating, throttling
-- (0057) and screening. Removing the policy is the second half of that change;
-- without it the old unbounded door stays open next to the new one.

begin;

-- ---- contact_submissions ---------------------------------------------------
drop policy if exists anon_insert_contact on public.contact_submissions;
revoke insert on public.contact_submissions from anon;

-- ---- demo_bookings ---------------------------------------------------------
drop policy if exists anon_insert_demo on public.demo_bookings;
revoke insert on public.demo_bookings from anon;

-- ---- listing_reports -------------------------------------------------------
-- This one's policy named `authenticated` as well as `anon`. A signed-in investor
-- reporting a bad listing is a legitimate flow, so only `anon` is dropped and the
-- policy is recreated for `authenticated` alone, preserving it.
drop policy if exists listing_reports_insert on public.listing_reports;
create policy listing_reports_insert on public.listing_reports
  for insert to authenticated with check (true);
revoke insert on public.listing_reports from anon;

-- ---- the over-grant on these three, while we are here ----------------------
-- Supabase's default privileges had handed `anon` all seven verbs on
-- contact_submissions and demo_bookings. RLS made the other six inert, but an
-- inert grant is still a grant, and the next policy mistake is what makes it
-- live. listing_reports only ever had INSERT.
revoke all on public.contact_submissions from anon;
revoke all on public.demo_bookings       from anon;
revoke all on public.listing_reports     from anon;

commit;

-- ---------------------------------------------------------------- verify ----
-- Expect three rows, every anon_privileges = (none):
--
--   select c.relname,
--          coalesce(string_agg(distinct g.privilege_type, ', '
--                   order by g.privilege_type), '(none)') as anon_privileges,
--          (select count(*) from pg_policies p
--            where p.schemaname='public' and p.tablename=c.relname
--              and 'anon' = any (p.roles::text[])) as anon_policies
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--     left join information_schema.role_table_grants g
--       on g.table_schema='public' and g.table_name=c.relname and g.grantee='anon'
--    where n.nspname='public'
--      and c.relname in ('contact_submissions','demo_bookings','listing_reports')
--    group by c.relname order by c.relname;
--
-- ---------------------------------------------------------------- rollback --
-- If a form breaks and the cause is not immediately clear, restore the previous
-- behaviour exactly:
--
--   begin;
--   grant insert on public.contact_submissions to anon;
--   grant insert on public.demo_bookings       to anon;
--   grant insert on public.listing_reports     to anon;
--   create policy anon_insert_contact on public.contact_submissions
--     for insert to anon with check (true);
--   create policy anon_insert_demo on public.demo_bookings
--     for insert to anon with check (true);
--   drop policy if exists listing_reports_insert on public.listing_reports;
--   create policy listing_reports_insert on public.listing_reports
--     for insert to anon, authenticated with check (true);
--   commit;
--
-- That reopens a known hole, so treat it as a stopgap while the endpoint is
-- fixed, not as a resting state.
