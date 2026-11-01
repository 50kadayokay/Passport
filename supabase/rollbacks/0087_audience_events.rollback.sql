-- ROLLBACK for 0087_audience_events.sql (a13). Additive migration: dropping
-- what it created restores the database exactly. NOTE: recorded profile views,
-- shares and video progress are deleted with the table. Installed apps keep
-- calling record_company_events; with the function gone the call 404s and the
-- client drops it silently (src/lib/analytics.js never surfaces a failure).
-- Verified in a rolled-back transaction by scripts/audience-events-0087-check.mjs.
begin;
drop function if exists public.company_video_progress(uuid, integer);
drop function if exists public.company_audience_summary(uuid, integer);
drop function if exists public.record_company_events(jsonb);
drop table if exists public.company_events;
commit;
