-- READ-ONLY. Query 14 — EVENT TRIGGERS.
--
-- The gap in schema_snapshot_oneshot.sql: event triggers live in
-- pg_event_trigger, not pg_trigger, so the trigger query did not return them.
--
-- This matters more than its size suggests. public.rls_auto_enable() turned up
-- in the unversioned-function list: it is an EVENT TRIGGER function that enables
-- row-level security automatically on every CREATE TABLE in `public`. It is why
-- all 62 live tables have RLS on -- the safety net nobody wrote down.
--
-- Section 7 of 0000_baseline.sql has the function but not the wiring. Without
-- the wiring a fresh project creates tables with RLS OFF, and the isolation
-- suite would be testing a database materially less safe than production.
--
-- Catalog metadata only; selects no table data. No credential can appear here.

select
  evtname                        as name,
  evtevent                       as event,
  pg_get_userbyid(evtowner)      as owner,
  evtenabled                     as enabled,       -- O=on, D=disabled, R/A=replica/always
  p.proname::text                as function_name,
  evttags                        as command_tags   -- null = fires for every tag
from pg_event_trigger e
join pg_proc p on p.oid = e.evtfoid
order by evtname;
