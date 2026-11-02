-- ROLLBACK for 0088_content_fanout.sql (a15). Removes the two destinations'
-- subscriptions and deliveries, their projection table and functions. The
-- investor feed (feed_projection_v1 -> posts) is untouched. The listener code
-- in api/_listeners.js is harmless without this: with no subscriptions,
-- claim_deliveries returns nothing for them.
-- Verified in a rolled-back transaction by scripts/content-fanout-0088-check.mjs.
begin;
delete from public.event_deliveries where listener in ('site_content_v1', 'conference_content_v1');
delete from public.listener_subscriptions where listener in ('site_content_v1', 'conference_content_v1');
drop function if exists public.conference_booth_releases(text, integer);
drop function if exists public.deliver_destination_content(text, uuid, uuid, integer, boolean, jsonb);
drop table if exists public.destination_content;
commit;
