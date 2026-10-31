-- ROLLBACK for 0073a_impression_dedupe_index.sql (a12). Roll back 0073b FIRST
-- (record_post_impressions' ON CONFLICT infers this index). RUN OUTSIDE A
-- TRANSACTION (DROP INDEX CONCURRENTLY). Impression rows already recorded stay.
drop index concurrently if exists public.post_events_impression_once;
