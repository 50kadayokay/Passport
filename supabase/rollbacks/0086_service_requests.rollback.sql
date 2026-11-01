-- ROLLBACK for 0086_service_requests.sql (a21). Additive migration: dropping
-- what it created restores the database exactly. NOTE: this also deletes every
-- service request recorded since 0086 was applied -- export them first if any
-- are real (select * from public.service_requests).
-- Verified in a rolled-back transaction by scripts/service-requests-0086-check.mjs.
begin;
drop table if exists public.service_requests;
drop function if exists public.service_requests_stamp();
commit;
