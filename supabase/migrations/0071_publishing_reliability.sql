-- 0071_publishing_reliability.sql — D22 Phase 2 (PROPOSAL).
--
-- STATUS: APPLIED TO STAGING ONLY (jmljfovtfxcdhjmtlnva, 2026-10-31, approved,
-- through scripts/apply-migrations.mjs). NOT applied to production; production
-- needs its own approval. See docs/REMEDIATION-PLAN.md §19-§20.
--
-- WHAT IT DOES, AND WHY EACH PART NEEDS SQL
--   A. posts.media_url -- the column feed_projection_v1 writes for media posts
--      and the investor app reads. It exists in production as a legacy column
--      (to be confirmed by the read-only audit, query 9) but in NO migration, so
--      a database built from migrations (staging) refused media projections.
--      `add column if not exists`: a no-op where it already exists.
--   B. Revision 1 at publish time -- publish_publication() records the original
--      release as revision 1, so the FIRST correction is revision 2 and emits
--      PUBLICATION_REVISED. (Phase 1 records the baseline in /api/revise-release;
--      this moves it to where it belongs. The two are compatible: once revision 1
--      exists, the route's baseline step does nothing.)
--   C. Unpublish removes the profile timeline entry -- a service-role
--      remove_timeline_entry() and the PUBLICATION_UNPUBLISHED subscription for
--      profile_timeline_v1. The release record itself is never deleted.
--      ORDER: deploy the listener code that handles UNPUBLISHED BEFORE applying
--      this part, or the first unpublish events reach a listener that ignores them.
--   D. Backfill guard -- listener_subscriptions.active_from: a listener only gets
--      deliveries for events that occurred after it was enabled, so enabling a
--      listener (or the first scheduled drain) cannot fan out over months of
--      history. Existing subscriptions keep NULL (= all events, as today).
--   E. Observability -- dispatcher_runs (heartbeat) and ops_alerts (deduplicated
--      alert state), service-role only.
--   F. Company-visible delivery status -- publication_delivery_status(), which
--      returns per-destination delivery state ONLY to callers who can see that
--      company (can_touch_company) or platform admins.
--
-- ROLLBACK: supabase/rollbacks/0071_publishing_reliability.rollback.sql
--   (a separate, tested file: it restores 0008's claim_deliveries and 0036's
--   publish_publication, then removes everything below except posts.media_url,
--   which production already relies on). Verified in a rolled-back transaction
--   by scripts/publishing-0071-check.mjs.

begin;

-- ---------------------------------------------------------------- A ---------
alter table public.posts add column if not exists media_url text;

-- ---------------------------------------------------------------- B ---------
-- Identical to 0036's publish_publication(uuid, uuid, timestamptz) -- the one
-- /api/publish calls, with the optional original release date -- except the
-- marked block. Grants as hardened by 0060 (service_role only).
create or replace function public.publish_publication(
  p_publication_id uuid,
  p_actor          uuid,
  p_published_at   timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.publications; v_seq integer; v_key text; v_event_id uuid; v_at timestamptz; v_body text;
begin
  select * into v from public.publications where id = p_publication_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.actor_can_publish(v.company_id, p_actor) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v.status = 'published' then return jsonb_build_object('ok', true, 'already', true, 'publication_id', v.id, 'published_at', v.published_at); end if;
  if v.status not in ('draft', 'review', 'approved') then return jsonb_build_object('ok', false, 'error', 'invalid_transition', 'status', v.status); end if;

  v_at := coalesce(p_published_at, now());
  v_seq := coalesce(v.publish_seq, 0) + 1;
  update public.publications
     set status = 'published', published_at = v_at, publish_seq = v_seq, error = null
   where id = v.id;

  -- >>> 0071: record the original release as revision 1, once, so the first
  --     correction is revision 2 and emits PUBLICATION_REVISED.
  if not exists (select 1 from public.release_revisions where publication_id = v.id) then
    select u.body into v_body from public.updates u where u.id = v.update_id;
    if coalesce(btrim(v_body), '') <> '' then
      insert into public.release_revisions (publication_id, company_id, revision, headline, body, reason, edited_by)
      values (v.id, v.company_id, 1, v.content ->> 'headline', v_body, 'original publication', p_actor)
      on conflict (publication_id, revision) do nothing;
    end if;
  end if;
  -- <<< 0071

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

-- ---------------------------------------------------------------- D ---------
alter table public.listener_subscriptions add column if not exists active_from timestamptz;

-- claim_deliveries: identical to 0008 except deliveries are only CREATED for
-- events that occurred on/after the subscription's active_from (NULL = all).
create or replace function public.claim_deliveries(p_listener text, p_worker text, p_limit integer default 10, p_lease_seconds integer default 120)
returns setof public.events language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  insert into public.event_deliveries (event_id, listener)
  select e.id, p_listener from public.events e
  join public.listener_subscriptions ls on ls.listener = p_listener and ls.event_type = e.event_type
  where (ls.active_from is null or e.occurred_at >= ls.active_from)
    and not exists (select 1 from public.event_deliveries d where d.event_id = e.id and d.listener = p_listener)
  on conflict (event_id, listener) do nothing;

  select array_agg(id) into v_ids from (
    select d.id from public.event_deliveries d
    where d.listener = p_listener
      and ((d.status in ('pending','failed') and d.next_attempt_at <= now())
           or (d.status = 'processing' and d.lease_expires_at is not null and d.lease_expires_at < now()))
    order by d.next_attempt_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 100))
  ) s;
  if v_ids is null then return; end if;

  update public.event_deliveries
     set status = 'processing', attempts = attempts + 1, locked_at = now(),
         lease_expires_at = now() + (greatest(5, coalesce(p_lease_seconds, 120)) * interval '1 second'),
         locked_by = p_worker, updated_at = now()
   where id = any(v_ids);
  return query select e.* from public.events e join public.event_deliveries d on d.event_id = e.id where d.id = any(v_ids);
end $$;

-- ---------------------------------------------------------------- C ---------
create or replace function public.remove_timeline_entry(p_company uuid, p_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before int; v_after int;
begin
  if coalesce(p_key, '') = '' then raise exception 'timeline key required' using errcode = '22023'; end if;
  update public.companies c
     set profile = jsonb_set(coalesce(c.profile, '{}'::jsonb), '{timeline}',
           coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(c.profile -> 'timeline', '[]'::jsonb)) e
                      where e ->> 'key' is distinct from p_key), '[]'::jsonb), true)
   where c.id = p_company
   returning jsonb_array_length(coalesce(c.profile -> 'timeline', '[]'::jsonb)) into v_after;
  return jsonb_build_object('ok', true, 'remaining', v_after);
end $$;
revoke execute on function public.remove_timeline_entry(uuid, text) from public, anon, authenticated;
grant execute on function public.remove_timeline_entry(uuid, text) to service_role;

-- active_from = now(): ONLY unpublish events from here on. Without it, the first
-- claim would replay EVERY historical unpublish event, in arbitrary order -- and
-- removing the entry of a release that was unpublished long ago and published
-- again since would delete a LIVE timeline entry. (The listener also re-checks
-- the publication's current status before removing anything.)
insert into public.listener_subscriptions (listener, event_type, active_from)
values ('profile_timeline_v1', 'PUBLICATION_UNPUBLISHED', now())
on conflict (listener, event_type) do nothing;

-- ---------------------------------------------------------------- E ---------
create table if not exists public.dispatcher_runs (
  id          uuid primary key default gen_random_uuid(),
  worker      text not null,
  trigger     text,                 -- 'cron' | 'nudge' | 'manual'
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  summary     jsonb not null default '{}'::jsonb
);
create index if not exists dispatcher_runs_started_idx on public.dispatcher_runs (started_at desc);
alter table public.dispatcher_runs enable row level security;
revoke all on public.dispatcher_runs from public, anon, authenticated;

create table if not exists public.ops_alerts (
  condition   text primary key,     -- e.g. 'dead_deliveries', 'stale_heartbeat'
  first_seen  timestamptz not null default now(),
  last_sent   timestamptz,
  resolved_at timestamptz,
  detail      jsonb not null default '{}'::jsonb
);
alter table public.ops_alerts enable row level security;
revoke all on public.ops_alerts from public, anon, authenticated;

-- ---------------------------------------------------------------- F ---------
-- Per-listener delivery state for ONE publication, for the company that owns it.
-- 'delivered' (succeeded), 'retrying' (pending/failed/processing), 'failed' (dead).
create or replace function public.publication_delivery_status(p_publication uuid)
returns table (event_type text, listener text, state text, attempts integer, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_company uuid; v_event uuid; v_type text;
begin
  select company_id into v_company from public.publications where id = p_publication;
  if v_company is null then return; end if;
  if not (public.can_touch_company(v_company) or public.is_admin()) then return; end if;   -- isolation: nothing for others
  -- Exactly ONE event: the newest (ties on created_at broken by id), so the
  -- answer never mixes deliveries of a publish, a revision and an unpublish.
  select e.id, e.event_type into v_event, v_type from public.events e
   where e.publication_id = p_publication order by e.created_at desc, e.id desc limit 1;
  if v_event is null then return; end if;
  return query
    select v_type, d.listener,
           case d.status when 'succeeded' then 'delivered' when 'dead' then 'failed' else 'retrying' end,
           d.attempts, d.updated_at
      from public.event_deliveries d
     where d.event_id = v_event
     order by d.listener;
end $$;
revoke execute on function public.publication_delivery_status(uuid) from public, anon;
grant execute on function public.publication_delivery_status(uuid) to authenticated, service_role;

commit;
