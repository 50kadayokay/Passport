-- BATCH 10: 0065c_analytics_indexes.sql .. 0065c_analytics_indexes.sql (1 files)

-- ======== 0065c_analytics_indexes.sql ========
-- ============================================================================
-- 0065c_analytics_indexes.sql — NOT APPLIED. Prepared for review.
--
-- RUN THIS FILE STATEMENT BY STATEMENT. There is no begin/commit, on purpose:
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, and the SQL
-- editor wraps a multi-statement submission in one. Same handling as
-- supabase/audit/replay/partX_0050b_CONCURRENTLY.sql.
--
-- WHY CONCURRENTLY. A plain CREATE INDEX takes a SHARE lock on the table, which
-- blocks every INSERT, UPDATE and DELETE for the duration. post_likes and
-- post_saves are written by investors tapping like and save in the live app, so
-- a plain build stalls user actions. These three tables are small today -- the
-- builds will finish in milliseconds -- but the cost of CONCURRENTLY at this
-- size is also nil, and the habit is the point. The trade is that a
-- CONCURRENTLY build can fail and leave an INVALID index behind; the
-- verification query at the bottom finds one, and the fix is to drop it and
-- re-run that statement.
--
-- NECESSITY, index by index. None of these is speculative: each answers a
-- filter that appears in 0065a or 0065b and currently has no index to use.
--
--   1. post_saves (company_slug, post_key)
--      post_saves' PRIMARY KEY is (user_id, company_slug, post_key) and there
--      is NO OTHER INDEX ON THE TABLE. A primary key index cannot serve a
--      filter that does not constrain its leading column, so every
--      `where company_slug = ... and post_key = ...` lookup is a SEQUENTIAL
--      SCAN -- and company_content_performance issues one PER POST, up to 500
--      per page load. This is the one that matters.
--
--   2. post_likes (company_slug, post_key)
--      Same shape. 0049 added (company_slug, created_at desc), which answers
--      "this company's likes, newest first" but cannot find one exact post
--      without scanning every like the company has. Both indexes are worth
--      keeping: 0049's serves its ORDER BY, this one serves the exact match.
--
--   3. user_company_relationships (company_slug) where is_following
--      company_follower_growth filters `company_slug = ... and is_following`.
--      The only index on that table is idx_ucr_user (user_id), so this was a
--      full scan of every investor-company relationship in the system. PARTIAL
--      because the predicate is always `is_following` -- a far smaller index
--      that the planner can still use, since the WHERE clause matches.
--
-- WHAT IS DELIBERATELY NOT ADDED. post_events already has (post_id, kind) from
-- 0009, which serves every read, dwell and save lookup here, and (created_at)
-- from 0048 for the windowed slice. Adding (post_id, kind, created_at) would
-- shave a filter step off reads_recent and is not worth a fourth index until
-- post_events is large enough to measure it.
--
-- SAFETY. Three CREATE INDEX statements. No data is read, written or moved, no
-- table is rewritten, and nothing here depends on 0065a or 0065b -- the
-- functions are correct without these indexes, merely slow. Dropping all three
-- restores the database exactly.
-- ============================================================================

create index concurrently if not exists idx_post_likes_slug_key
  on public.post_likes (company_slug, post_key);

create index concurrently if not exists idx_post_saves_slug_key
  on public.post_saves (company_slug, post_key);

create index concurrently if not exists idx_ucr_slug_following
  on public.user_company_relationships (company_slug) where is_following;

-- ---------------------------------------------------------------- VERIFY ----
-- Expect three rows, all with valid = true. A false means that build failed and
-- left an unusable index behind: drop that one by name and re-run its statement.
--   select i.indexrelid::regclass as index, i.indisvalid as valid
--     from pg_index i
--    where i.indexrelid::regclass::text in
--          ('idx_post_likes_slug_key','idx_post_saves_slug_key','idx_ucr_slug_following');

-- ============================================================================
-- ROLLBACK -- also one statement at a time.
-- ============================================================================
-- drop index concurrently if exists public.idx_post_likes_slug_key;
-- drop index concurrently if exists public.idx_post_saves_slug_key;
-- drop index concurrently if exists public.idx_ucr_slug_following;
