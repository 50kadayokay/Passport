-- ROLLBACK for 0065c_analytics_indexes.sql (a12). RUN OUTSIDE A TRANSACTION,
-- one statement at a time (DROP INDEX CONCURRENTLY). Indexes only: no data.
drop index concurrently if exists public.idx_post_likes_slug_key;
drop index concurrently if exists public.idx_post_saves_slug_key;
drop index concurrently if exists public.idx_ucr_slug_following;
