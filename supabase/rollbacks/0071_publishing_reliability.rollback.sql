-- 0071_publishing_reliability.rollback.sql — undo migration 0071.
--
-- NOT A MIGRATION (it lives outside supabase/migrations/ so no runner applies
-- it). Run by hand, in one transaction, only to back 0071 out.
-- Verified in a rolled-back transaction on staging by
-- scripts/publishing-0071-check.mjs (applies 0071, then this, then checks the
-- functions match their pre-0071 definitions).
--
-- ORDER MATTERS: claim_deliveries reads listener_subscriptions.active_from, so
-- it is restored BEFORE that column is dropped.
-- LEFT IN PLACE: posts.media_url (production relies on it; dropping a column
-- that holds data is not a rollback). release_revisions rows written by the
-- 0071 publish_publication are KEPT: they are append-only disclosure history,
-- and the Phase 1 route treats an existing revision 1 correctly.
-- AFTER ROLLING BACK: redeploy listener code without the UNPUBLISHED branch, or
-- keep it -- with the subscription gone it receives no unpublish events.

begin;

-- 0008's claim_deliveries, verbatim
create or replace function public.claim_deliveries(p_listener text, p_worker text, p_limit integer default 10, p_lease_seconds integer default 120)
returns setof public.events language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  insert into public.event_deliveries (event_id, listener)
  select e.id, p_listener from public.events e
  join public.listener_subscriptions ls on ls.listener = p_listener and ls.event_type = e.event_type
  where not exists (select 1 from public.event_deliveries d where d.event_id = e.id and d.listener = p_listener)
  on conflict (event_id, listener) do nothing;

  select array_agg(id) into v_ids from (
    select d.id from public.event_deliveries d
    where d.listener = p_listener
      and (
        (d.status in ('pending','failed') and d.next_attempt_at <= now())
        or (d.status = 'processing' and d.lease_expires_at is not null and d.lease_expires_at < now())
      )
    order by d.next_attempt_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 100))
  ) s;

  if v_ids is null then return; end if;

  update public.event_deliveries
     set status = 'processing', attempts = attempts + 1,
         locked_at = now(),
         lease_expires_at = now() + (greatest(5, coalesce(p_lease_seconds, 120)) * interval '1 second'),
         locked_by = p_worker, updated_at = now()
   where id = any(v_ids);

  return query select e.* from public.events e join public.event_deliveries d on d.event_id = e.id where d.id = any(v_ids);
end $$;

-- 0036's publish_publication, verbatim
create or replace function public.publish_publication(
  p_publication_id uuid,
  p_actor          uuid,
  p_published_at   timestamptz default null   -- null → now(), i.e. today's behaviour
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.publications; v_seq integer; v_key text; v_event_id uuid; v_at timestamptz;
begin
  select * into v from public.publications where id = p_publication_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.actor_can_publish(v.company_id, p_actor) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v.status = 'published' then return jsonb_build_object('ok', true, 'already', true, 'publication_id', v.id, 'published_at', v.published_at); end if;
  if v.status not in ('draft', 'review', 'approved') then return jsonb_build_object('ok', false, 'error', 'invalid_transition', 'status', v.status); end if;

  -- The caller may supply the original release date. Omitted → now(), unchanged.
  v_at := coalesce(p_published_at, now());

  v_seq := coalesce(v.publish_seq, 0) + 1;
  update public.publications
     set status = 'published', published_at = v_at, publish_seq = v_seq, error = null
   where id = v.id;

  v_key := 'publish:' || v.id::text || ':' || v_seq::text;
  insert into public.events (event_type, event_version, publication_id, company_id, actor_user_id, payload, idempotency_key)
  values ('PUBLICATION_PUBLISHED', 1, v.id, v.company_id, p_actor,
          jsonb_build_object('publication_id', v.id, 'company_id', v.company_id, 'publish_seq', v_seq), v_key)
  on conflict (idempotency_key) do nothing returning id into v_event_id;

  return jsonb_build_object('ok', true, 'publication_id', v.id, 'published_at', v_at,
                            'event_id', v_event_id, 'idempotency_key', v_key);
end $$;
revoke execute on function public.publish_publication(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.publish_publication(uuid, uuid, timestamptz) to service_role;

drop function if exists public.publication_delivery_status(uuid);
drop table if exists public.ops_alerts;
drop table if exists public.dispatcher_runs;
delete from public.listener_subscriptions where listener = 'profile_timeline_v1' and event_type = 'PUBLICATION_UNPUBLISHED';
drop function if exists public.remove_timeline_entry(uuid, text);
alter table public.listener_subscriptions drop column if exists active_from;

commit;
