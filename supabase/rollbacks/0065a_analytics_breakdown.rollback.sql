-- ROLLBACK for 0065a_analytics_breakdown.sql (a12). 0065a is purely additive,
-- so dropping its four functions restores the database exactly.
-- Apply 0065b's rollback FIRST if 0065b is applied (the portal reads both).
-- Verified in a rolled-back transaction by scripts/analytics-0065-0073-check.mjs.
begin;
drop function if exists public.company_engagement_by_type(uuid, integer);
drop function if exists public.company_follower_growth(uuid, integer);
drop function if exists public.company_content_performance(uuid, integer, integer);
drop function if exists public.company_engagement_unattributed(uuid);
commit;
