-- 0011_outbox_ops.sql — CHECKPOINT 12–13: scheduled drain + observability + reconciliation.
--
-- • Enables pg_cron + pg_net and schedules a once-per-minute POST to the protected
--   /api/dispatch (the guaranteed drain; best-effort invocation from /api/publish is
--   the accelerator). The dispatch secret is read at runtime from a locked table so
--   it never appears in the cron definition.
-- • outbox_health() — admin snapshot of queued/processing/dead + oldest pending.
-- • reconcile_outbox() — admin repair: reclaim stuck (expired-lease) deliveries,
--   replay dead ones, and report published-but-unprojected publications.
--
-- Run in Supabase -> SQL Editor. Idempotent. After running, the dispatch secret is
-- inserted separately (server-side) so it is never pasted here.

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Locked secret store: RLS on with NO policies → no client (anon/authenticated) can
-- read it; the service role and superuser (cron) bypass RLS.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='app_secrets'
  loop execute format('drop policy %I on public.app_secrets', p.policyname); end loop;
end $$;
-- (no policies → deny all to anon/authenticated)

-- ---- observability ----
create or replace function public.outbox_health()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('error', 'admin only'); end if;
  return jsonb_build_object(
    'events', (select count(*) from public.events),
    'deliveries_by_status', (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (select status, count(*) c from public.event_deliveries group by status) a),
    'by_listener', (select coalesce(jsonb_agg(jsonb_build_object('listener', listener, 'status', status, 'count', c) order by listener, status), '[]'::jsonb) from (select listener, status, count(*) c from public.event_deliveries group by listener, status) b),
    'dead', (select count(*) from public.event_deliveries where status = 'dead'),
    'stuck_processing', (select count(*) from public.event_deliveries where status = 'processing' and lease_expires_at < now()),
    'oldest_pending_seconds', (select coalesce(extract(epoch from (now() - min(next_attempt_at)))::int, 0) from public.event_deliveries where status in ('pending','failed')),
    'orphan_publications', (select count(*) from public.publications p where p.destination_id = 'passport' and p.status = 'published'
                             and not exists (select 1 from public.posts po where po.publication_id = p.id and po.removed_at is null))
  );
end $$;

-- ---- reconciliation (repair) ----
create or replace function public.reconcile_outbox()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_stuck int; v_dead int; v_orphans int;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  update public.event_deliveries
     set status = 'pending', locked_by = null, locked_at = null, lease_expires_at = null, next_attempt_at = now()
   where status = 'processing' and lease_expires_at < now();
  get diagnostics v_stuck = row_count;

  update public.event_deliveries
     set status = 'pending', next_attempt_at = now(), last_error = null
   where status = 'dead';
  get diagnostics v_dead = row_count;

  select count(*) into v_orphans from public.publications p
   where p.destination_id = 'passport' and p.status = 'published'
     and not exists (select 1 from public.posts po where po.publication_id = p.id and po.removed_at is null);

  return jsonb_build_object('reclaimed_stuck', v_stuck, 'replayed_dead', v_dead, 'orphan_publications', v_orphans);
end $$;

revoke execute on function public.outbox_health()    from public, anon;
revoke execute on function public.reconcile_outbox() from public, anon;

-- ---- scheduled drain (Supabase Cron → protected /api/dispatch) ----
-- Unschedule any prior job of the same name, then schedule every minute. The secret
-- is read from app_secrets at run time, so it is not stored in the job definition.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'outbox-drain') then
    perform cron.unschedule('outbox-drain');
  end if;
exception when others then null;
end $$;

select cron.schedule('outbox-drain', '* * * * *', $job$
  select net.http_post(
    url := 'https://passport-xi-five.vercel.app/api/dispatch',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-dispatch-secret', coalesce((select value from public.app_secrets where key = 'dispatch_secret'), '')
    )
  );
$job$);

commit;
