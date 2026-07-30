-- 0008_publish_spine.sql  — CHECKPOINT 1: publish spine & dispatcher plumbing.
-- See docs/adr/0001-publish-event-architecture.md and the phase deployment plan.
--
-- Spine only: durable outbox + versioned publish/unpublish RPCs + LEASE-BASED
-- delivery claiming. No listener tables (posts/follows/notifications = CP2), no
-- publish lockdown (= 0009, applied only after a green prod smoke test).
--
-- Hardening in this revision:
--   • Lease-based claiming (locked_at/lease_expires_at/locked_by): a crashed
--     dispatcher's 'processing' row is reclaimed after its lease expires, never
--     stranded. complete_delivery is lease-guarded, so a revived stale worker
--     cannot clobber a reclaimed delivery.
--   • Publish authorization restricted to publish-capable roles only
--     (owner/admin/publisher + platform admin) — an editor/analyst/viewer cannot
--     publish or unpublish.
--   • Recognized-event-type + positive-version constraints.
--   • listener_subscriptions: deliveries are created ONLY for event types a
--     listener declares support for.
--   • EXECUTE revoked from PUBLIC (not just anon/authenticated — role-specific
--     revokes leave the default PUBLIC grant intact) and granted only to
--     service_role, for every spine SECURITY DEFINER function incl. replay.
--
-- Depends on 0001 (is_admin), 0005 (publications/companies), 0006
-- (company_memberships). Idempotent. Run in Supabase -> SQL Editor.

begin;

alter table public.publications add column if not exists publish_seq integer not null default 0;

-- ============================================================
-- OUTBOX  (with recognized-type + positive-version constraints)
-- ============================================================
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  event_type      text not null,
  event_version   integer not null default 1,
  publication_id  uuid references public.publications(id) on delete cascade,
  company_id      uuid references public.companies(id) on delete cascade,
  actor_user_id   uuid,
  payload         jsonb not null default '{}'::jsonb,   -- ids + context only, never content
  idempotency_key text not null unique,
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  constraint events_type_chk    check (event_type in ('PUBLICATION_PUBLISHED','PUBLICATION_UNPUBLISHED')),
  constraint events_version_chk check (event_version >= 1)
);
create index if not exists events_type_idx on public.events (event_type, created_at desc);

create table if not exists public.event_deliveries (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  listener        text not null,                        -- versioned, e.g. 'feed_projection_v1'
  status          text not null default 'pending' check (status in ('pending','processing','succeeded','failed','dead')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at       timestamptz,
  lease_expires_at timestamptz,
  locked_by       text,
  last_error      text,
  processed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (event_id, listener)
);
create index if not exists deliveries_claim_idx on public.event_deliveries (listener, status, next_attempt_at);
create index if not exists deliveries_lease_idx on public.event_deliveries (listener, status, lease_expires_at);

-- Which event types each versioned listener supports. Deliveries are only created
-- for supported (listener, event_type) pairs. Seeded per listener in checkpoint 2.
create table if not exists public.listener_subscriptions (
  listener   text not null,
  event_type text not null,
  primary key (listener, event_type)
);

alter table public.events                 enable row level security;
alter table public.event_deliveries       enable row level security;
alter table public.listener_subscriptions enable row level security;
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies
           where schemaname='public' and tablename in ('events','event_deliveries','listener_subscriptions')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;
create policy "admin_read" on public.events                 for select to authenticated using (public.is_admin());
create policy "admin_read" on public.event_deliveries       for select to authenticated using (public.is_admin());
create policy "admin_read" on public.listener_subscriptions for select to authenticated using (public.is_admin());

-- ============================================================
-- AUTHORIZATION  (publish-capable roles only)
-- ============================================================
create or replace function public.actor_can_publish(p_company uuid, p_actor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.companies c where c.id = p_company and c.owner_id = p_actor)
      or exists (select 1 from public.company_memberships m
                  where m.company_id = p_company and m.user_id = p_actor and m.status = 'active'
                    and m.role in ('owner','admin','publisher'))
      or exists (select 1 from public.profiles pr where pr.id = p_actor and pr.role = 'admin');
$$;

-- ============================================================
-- PUBLISH / UNPUBLISH  (service-role only)
-- ============================================================
create or replace function public.publish_publication(p_publication_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.publications; v_seq integer; v_key text; v_event_id uuid;
begin
  select * into v from public.publications where id = p_publication_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.actor_can_publish(v.company_id, p_actor) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v.status = 'published' then return jsonb_build_object('ok', true, 'already', true, 'publication_id', v.id, 'published_at', v.published_at); end if;
  if v.status not in ('draft', 'review', 'approved') then return jsonb_build_object('ok', false, 'error', 'invalid_transition', 'status', v.status); end if;

  v_seq := coalesce(v.publish_seq, 0) + 1;
  update public.publications set status = 'published', published_at = now(), publish_seq = v_seq, error = null where id = v.id;
  v_key := 'publish:' || v.id::text || ':' || v_seq::text;
  insert into public.events (event_type, event_version, publication_id, company_id, actor_user_id, payload, idempotency_key)
  values ('PUBLICATION_PUBLISHED', 1, v.id, v.company_id, p_actor,
          jsonb_build_object('publication_id', v.id, 'company_id', v.company_id, 'publish_seq', v_seq), v_key)
  on conflict (idempotency_key) do nothing returning id into v_event_id;
  return jsonb_build_object('ok', true, 'publication_id', v.id, 'published_at', now(), 'event_id', v_event_id, 'idempotency_key', v_key);
end $$;

create or replace function public.unpublish_publication(p_publication_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.publications; v_seq integer; v_key text; v_event_id uuid;
begin
  select * into v from public.publications where id = p_publication_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.actor_can_publish(v.company_id, p_actor) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v.status <> 'published' then return jsonb_build_object('ok', true, 'already', true, 'status', v.status); end if;

  v_seq := coalesce(v.publish_seq, 0) + 1;
  update public.publications set status = 'draft', publish_seq = v_seq where id = v.id;
  v_key := 'unpublish:' || v.id::text || ':' || v_seq::text;
  insert into public.events (event_type, event_version, publication_id, company_id, actor_user_id, payload, idempotency_key)
  values ('PUBLICATION_UNPUBLISHED', 1, v.id, v.company_id, p_actor,
          jsonb_build_object('publication_id', v.id, 'company_id', v.company_id, 'publish_seq', v_seq), v_key)
  on conflict (idempotency_key) do nothing returning id into v_event_id;
  return jsonb_build_object('ok', true, 'publication_id', v.id, 'event_id', v_event_id, 'idempotency_key', v_key);
end $$;

-- ============================================================
-- DISPATCHER  (lease-based; service-role only)
-- ============================================================

-- Claim a batch for one listener: due pending/failed rows OR expired-lease
-- 'processing' rows (reclaim after a crashed worker). Only creates deliveries for
-- SUPPORTED event types. Sets a fresh lease + worker. FOR UPDATE SKIP LOCKED so
-- concurrent dispatchers never grab the same row.
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

-- Finalize — ONLY if this worker still holds the lease (locked_by match + still
-- processing). Returns true if it applied; false means the lease was stolen/expired
-- and a reclaiming worker owns it now, so this stale result is ignored.
create or replace function public.complete_delivery(p_event_id uuid, p_listener text, p_worker text, p_ok boolean, p_error text default null, p_max_attempts integer default 6)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rows integer;
begin
  if p_ok then
    update public.event_deliveries
       set status = 'succeeded', processed_at = now(), last_error = null,
           locked_at = null, lease_expires_at = null, locked_by = null, updated_at = now()
     where event_id = p_event_id and listener = p_listener and locked_by = p_worker and status = 'processing';
  else
    update public.event_deliveries d
       set status = case when d.attempts >= p_max_attempts then 'dead' else 'failed' end,
           last_error = p_error,
           next_attempt_at = now() + (interval '30 seconds' * power(2, least(d.attempts, 8))),
           locked_at = null, lease_expires_at = null, locked_by = null, updated_at = now()
     where d.event_id = p_event_id and d.listener = p_listener and d.locked_by = p_worker and d.status = 'processing';
  end if;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

create or replace function public.replay_delivery(p_event_id uuid, p_listener text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.event_deliveries
     set status = 'pending', next_attempt_at = now(), last_error = null,
         locked_at = null, lease_expires_at = null, locked_by = null, updated_at = now()
   where event_id = p_event_id and listener = p_listener;
end $$;

-- Lock EVERY spine SECURITY DEFINER function to the service role. Revoking from
-- PUBLIC is mandatory — PUBLIC covers anon + authenticated, and a role-specific
-- revoke leaves the default PUBLIC grant intact.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.publish_publication(uuid, uuid)',
    'public.unpublish_publication(uuid, uuid)',
    'public.claim_deliveries(text, text, integer, integer)',
    'public.complete_delivery(uuid, text, text, boolean, text, integer)',
    'public.replay_delivery(uuid, text)',
    'public.actor_can_publish(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

commit;

-- ============================================================
-- PROOF: final EXECUTE grants on the spine functions. Expect only 'service_role'
-- (plus the function owner implicitly). anon/authenticated/PUBLIC must NOT appear.
-- ============================================================
select routine_name, grantee, privilege_type
  from information_schema.routine_privileges
 where routine_schema = 'public'
   and routine_name in ('publish_publication','unpublish_publication','claim_deliveries',
                        'complete_delivery','replay_delivery','actor_can_publish')
 order by routine_name, grantee;
