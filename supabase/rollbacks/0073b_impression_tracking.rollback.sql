-- ROLLBACK for 0073b_impression_tracking.sql (a12). Additive: dropping the
-- three functions restores the database exactly. Impression rows already
-- recorded in post_events stay (they are real events).
-- Verified in a rolled-back transaction by scripts/analytics-0065-0073-check.mjs.
begin;
drop function if exists public.record_post_impressions(uuid[]);
drop function if exists public.company_impression_summary(uuid, integer);
drop function if exists public.company_post_impressions(uuid, integer);
commit;
