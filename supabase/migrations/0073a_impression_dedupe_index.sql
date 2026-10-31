-- ============================================================================
-- 0073a_impression_dedupe_index.sql — a12. APPLIED TO STAGING ONLY (2026-10-31); NOT production.
--
-- RUN OUTSIDE A TRANSACTION (CREATE INDEX CONCURRENTLY). The guarded runner
-- detects CONCURRENTLY outside comments and runs this file on its own, like
-- 0050b and 0065c. Must be applied BEFORE 0073b, whose ON CONFLICT clause
-- infers this index.
--
-- WHAT. One impression per investor, per post, per UTC calendar day, enforced
-- by the DATABASE -- not by the client -- so every path that writes an
-- 'impression' event (record_post_impressions() in 0073b, an old app build, a
-- hand-made REST insert) is held to the same rule. A second impression of the
-- same post by the same investor on the same day is a conflict, not a row.
--
-- DEFINITION OF AN IMPRESSION (a12). A company post was visible in an
-- investor's feed (at least half of it, for at least one second; see
-- src/lib/impressions.js), counted at most once per investor per post per UTC
-- day. post_events.user_id is NOT NULL in practice: the insert policy (0009
-- own_insert) requires user_id = auth.uid(), and anon has no grant (0061a).
--
-- PRE-CHECK (must return zero rows, or the build fails and leaves an INVALID
-- index -- drop it by name and re-run after deciding what to do with the rows):
--   select post_id, user_id, (created_at at time zone 'UTC')::date d, count(*)
--     from public.post_events where kind = 'impression'
--    group by 1, 2, 3 having count(*) > 1;
-- Production: nothing has ever emitted 'impression' (a12 audit), so this is
-- expected to be empty; it is part of the read-only production audit.
--
-- WHY (created_at at time zone 'UTC')::date. timezone(text, timestamptz) and
-- the timestamp->date cast are both immutable, so the expression is indexable,
-- and the day boundary is explicit UTC -- the same boundary 0065a/0065b use for
-- every window, so a "day" means the same thing everywhere on the page.
--
-- ROLLBACK: supabase/rollbacks/0073a_impression_dedupe_index.rollback.sql
-- (drop 0073b's functions first: record_post_impressions infers this index).
-- ============================================================================

create unique index concurrently if not exists post_events_impression_once
  on public.post_events (post_id, user_id, ((created_at at time zone 'UTC')::date))
  where kind = 'impression';

-- ---------------------------------------------------------------- VERIFY ----
-- Expect one row with valid = true:
--   select indexrelid::regclass, indisvalid from pg_index
--    where indexrelid = 'public.post_events_impression_once'::regclass;
