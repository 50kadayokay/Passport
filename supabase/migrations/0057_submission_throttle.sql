-- 0057_submission_throttle.sql
-- Durable fixed-window rate limiting for the three public submission forms.
--
-- ADDITIVE AND SAFE TO APPLY AT ANY TIME. It creates one table and one function
-- and changes no existing policy, so it cannot break a live page. The companion
-- migration 0058 is the one that actually closes the anon INSERT hole, and it
-- must NOT be applied until /api/submit is deployed.
--
-- WHY A TABLE AND NOT MEMORY
-- --------------------------
-- Vercel's serverless instances share no memory. An in-process counter resets on
-- every cold start and is evaded by concurrency, so the window has to live in the
-- database.
--
-- WHY THE INCREMENT IS A FUNCTION
-- -------------------------------
-- PostgREST's `resolution=merge-duplicates` compiles to ON CONFLICT DO UPDATE SET
-- <the columns you sent>. Sending count:1 therefore RESETS the counter to 1 on
-- every call and the throttle never fires. The increment must happen in SQL.
--
-- PRIVACY
-- -------
-- `ip_hash` is a salted SHA-256 prefix computed in api/_submissions.js. A raw IP
-- log would be a liability and the throttle does not need one -- it only needs to
-- recognise a repeat caller within a 10-minute window.

begin;

create table if not exists public.submission_throttle (
  ip_hash      text        not null,
  form         text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (ip_hash, form, window_start)
);

-- No client ever reads or writes this table. RLS on with ZERO policies is a
-- deny-all for every role except the table owner and the service role, which is
-- exactly the intent -- and it is stricter than any policy we could write.
alter table public.submission_throttle enable row level security;

-- Supabase's default privileges grant anon and authenticated all seven verbs on
-- every new table. That has bitten this schema repeatedly (0052, 0053, 0056), so
-- it is closed in the same migration that opens the table rather than later.
revoke all on public.submission_throttle from public, anon, authenticated;

create index if not exists submission_throttle_window_idx
  on public.submission_throttle (window_start);

-- `set search_path = public, pg_temp` names pg_temp EXPLICITLY, and last.
-- PostgreSQL searches the temporary schema implicitly when it is not named, so a
-- SECURITY DEFINER function that resolves anything unqualified can in principle
-- be shadowed by an object the caller created in their own temp schema. Every
-- reference below is schema-qualified, so that is not reachable here -- but
-- naming pg_temp last removes the implicit ordering entirely, and matches the
-- convention 0047-0051 already use.
--
-- Atomic increment. Returns the post-increment count for this caller/form/window.
-- SECURITY DEFINER so it can write a table nobody else may touch; the EXECUTE
-- grant below is what actually limits who can call it.
create or replace function public.bump_submission_throttle(
  p_ip_hash text, p_form text, p_window_start timestamptz
)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.submission_throttle as t (ip_hash, form, window_start, count)
  values (p_ip_hash, p_form, p_window_start, 1)
  on conflict (ip_hash, form, window_start)
    do update set count = t.count + 1
  returning count;
$$;

-- Callable ONLY by the service role, i.e. only from api/submit.js. A browser that
-- could call this could inflate another caller's counter, or probe whether a
-- given IP hash has submitted -- so the browser cannot call it.
revoke all on function public.bump_submission_throttle(text, text, timestamptz)
  from public, anon, authenticated;

-- Housekeeping: windows older than a day are dead weight. Service-role only, for
-- the same reason as the bump.
create or replace function public.prune_submission_throttle()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with gone as (
    delete from public.submission_throttle
     where window_start < now() - interval '1 day'
    returning 1
  ) select count(*)::integer from gone;
$$;

revoke all on function public.prune_submission_throttle() from public, anon, authenticated;


-- ============================================================================
-- AI EMERGENCY DISABLE — a switch that does not need a deployment.
--
-- WHY IT IS HERE AND NOT AN ENVIRONMENT VARIABLE
-- ----------------------------------------------
-- Vercel environment variables are bound to a DEPLOYMENT. Editing one in the
-- dashboard does not change any running deployment -- it takes effect only on
-- the next build. An env-var kill switch is therefore NOT an emergency control:
-- it is a redeploy with extra steps, and a redeploy is exactly what you cannot
-- rely on when something is actively going wrong.
--
-- This table is read by api/_aiGuard.js on every AI request, so flipping it is
-- effective on the next invocation with no build, no deploy and no cache to
-- wait out.
--
-- COST: one extra RPC per AI request (~10-30 ms). These requests take seconds
-- and cost money, so an uncached read is the right trade -- caching the flag
-- would reintroduce exactly the propagation delay this exists to remove.
--
-- It lives in 0057 rather than its own migration to keep the AI security
-- deployment to one database change.
-- ============================================================================

create table if not exists public.ai_controls (
  id         boolean primary key default true check (id),  -- single row, enforced
  enabled    boolean not null default true,
  reason     text,
  updated_at timestamptz not null default now()
);

insert into public.ai_controls (id, enabled) values (true, true)
on conflict (id) do nothing;

-- RLS on with ZERO policies: deny-all for every role except the owner and the
-- service role. Stricter than any policy we could write, and the same shape as
-- submission_throttle above.
alter table public.ai_controls enable row level security;
revoke all on public.ai_controls from public, anon, authenticated;

-- Read by the guard as the service role. STABLE, not VOLATILE, so repeated
-- reads inside one statement collapse -- but it is called once per request, so
-- that is incidental.
--
-- Defaults to TRUE when the row is missing: a dropped row must not take AI down
-- silently. The rate limiter already fails closed, so a database outage yields
-- 503 regardless; this flag is for a DELIBERATE disable, not for outages.
create or replace function public.ai_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select enabled from public.ai_controls where id), true);
$$;

revoke all on function public.ai_enabled() from public, anon, authenticated;

commit;

-- ---------------------------------------------------------------- verify ----
-- Expect: rls_enabled = true, policy_count = 0, anon_privileges = (none)
--
--   select c.relname, c.relrowsecurity as rls_enabled,
--          (select count(*) from pg_policies p
--            where p.schemaname='public' and p.tablename=c.relname) as policy_count,
--          coalesce(string_agg(distinct g.privilege_type, ', '), '(none)') as anon_privileges
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--     left join information_schema.role_table_grants g
--       on g.table_schema='public' and g.table_name=c.relname and g.grantee='anon'
--    where n.nspname='public' and c.relname='submission_throttle'
--    group by c.relname, c.relrowsecurity;
--
-- And that the increment actually increments (service role / SQL editor):
--   select public.bump_submission_throttle('test', 'contact', date_trunc('hour', now()));  -- 1
--   select public.bump_submission_throttle('test', 'contact', date_trunc('hour', now()));  -- 2
--   delete from public.submission_throttle where ip_hash = 'test';
--
-- The AI switch starts ENABLED:
--   select enabled, reason, updated_at from public.ai_controls;   -- expect true
--   select public.ai_enabled();                                   -- expect true
--
-- ------------------------------------------------- EMERGENCY DISABLE / ENABLE
-- Effective on the next request. No deployment.
--
--   update public.ai_controls
--      set enabled = false, reason = 'why, who, when', updated_at = now()
--    where id;
--
-- Re-enable:
--   update public.ai_controls
--      set enabled = true, reason = null, updated_at = now()
--    where id;
