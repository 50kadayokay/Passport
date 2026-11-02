-- ============================================================================
-- 0093_listing_reports_rate_limit.sql — NOT APPLIED. Prepared for review (S3).
--
-- listing_reports: a DATABASE-enforced rate limit and a one-row-per-request cap
-- for direct client inserts (anon / authenticated), so the path 0077 keeps open
-- for installed 1.3.x apps is bounded the way /api/submit is.
--
-- DECISION (user, 2026-11-01, Option B; rule: "never trust a client-controlled
-- header"). Found by scripts/listing-reports-0077-security-check.mjs: 20 of 20
-- back-to-back anon reports stored, and a 200-row JSON array stored in one request.
--
-- WHAT
-- ----
-- One AFTER INSERT ... FOR EACH STATEMENT trigger, with the statement's new rows
-- as a transition table, runs listing_reports_guard() once per INSERT:
--   1. Only CLIENT inserts are limited: request role anon or authenticated
--      (PostgREST's request.jwt.claims, else the session's role). The service
--      role (/api/submit, which keeps its own 0057 throttle), direct database
--      sessions and MineEx platform admins (is_admin()) pass untouched.
--   2. Per-request cap: more than ONE row in the statement is refused, PT400.
--      1.3.x sends a single JSON object; an array or INSERT ... SELECT of 2+ is
--      refused whole (nothing stored). Zero rows passes.
--   3. Three fixed-window counters in 0057's submission_throttle, always taken in
--      this order (no lock-order deadlock): GLOBAL, then the client's NETWORK,
--      then the CLIENT. Over any: PT429, nothing stored. A refused insert rolls
--      its own counter increments back with it, so refusals consume nothing.
--   4. Housekeeping: expired listing_report_* counters (older than a day) are
--      deleted in small batches by the same trigger.
--
-- WHO IS "A CLIENT" -- only what the gateway itself sets (measured on staging,
-- 2026-11-01, with a temporary header echo):
--   cf-connecting-ip  ALWAYS set by the gateway to the real address; a request
--                     that sends its own is rejected whole (403). Used first.
--   x-forwarded-for   client entries are KEPT and the real address APPENDED, so
--                     the FIRST hop is forgeable and the LAST is real. Fallback:
--                     the LAST hop, never the first.
--   x-real-ip         stripped by the gateway; never read.
--   true-client-ip    passed through unchanged (forgeable); never read.
-- Neither present (a direct, non-gateway session): one shared 'unknown' bucket,
-- at the per-client limit, with no network limit (there is no network).
-- NETWORK = the address's /24 (IPv4) or /48 (IPv6), so rotating through one
-- provider's range is capped together. An IPv4-mapped IPv6 address counts as its
-- IPv4 address (/24), not as part of ::ffff:0:0/96.
-- Stored are salted SHA-256 prefixes, never an address:
--   client  'lr:' || left(sha256(salt || '|' || ip), 32)
--   network 'ln:' || left(sha256(salt || '|net|' || network), 32)
-- The salt is generated here, in a table nobody but the owner can read.
--
-- NUMBERS (pilot), in public.listing_report_limits -- one UPDATE in the SQL
-- editor changes them, no migration:
--   per_client   5 per 10 minutes  -- /api/submit's own policy (0057: 5 / 10 min).
--                                     A person files one report; five covers
--                                     retries and a second listing.
--   per_network 20 per 60 minutes  -- a whole /24 or /48 (an office, a carrier
--                                     NAT pool) gets four people's worth an hour.
--   global     600 per 60 minutes  -- far above real pilot volume; caps the worst
--                                     case at 14,400 a day instead of unbounded.
-- RESIDUAL RISK, accepted for the pilot: the global ceiling is still a shared
-- quota. Filling it needs 600 / 20 = 30+ distinct networks within one hour; when
-- that happens, every client's reports are refused (PT429, the sheet's error
-- state) only until the hour window rolls over. Alert on the global refusal
-- (message "too many reports right now"; hint "global limit ...").
--
-- CONCURRENCY. Each counter is one row, incremented with INSERT ... ON CONFLICT
-- DO UPDATE ... RETURNING count: concurrent inserts for the same key serialize
-- on that row's lock and each sees the count the one before it committed (or
-- rolled back). No overshoot.
--
-- STORAGE. One global row per hour, at most 24 per network and 144 per client a
-- day, and anything older than a day is pruned (50 rows per insert, skipping
-- rows another insert holds), so the counters stay bounded (the global ones at
-- ~25 rows) without a scheduled job.
--
-- REFUSALS. RAISE with SQLSTATE PT429 / PT400: PostgREST turns PTxxx into HTTP
-- xxx (older PostgREST: 400). The 1.3.x sheet treats any non-2xx as failure
-- (setState(r.ok ? "done" : "error")) and shows its error state. Never a silent
-- drop. The message names the limit, never row data or an address.
--
-- NO NEW READ EXPOSURE. listing_report_limits and submission_throttle_salt are
-- RLS-on with no policy and no grant to anon/authenticated (like 0057's
-- submission_throttle, which they can't read either). The helper and trigger
-- functions are not executable by clients. 0077's policy and 0092's grants are
-- unchanged.
--
-- Needs: 0057 (submission_throttle), 0092 (run right after it, same session).
-- ROLLBACK: supabase/rollbacks/0093_listing_reports_rate_limit.rollback.sql
-- Verified in a rolled-back transaction by scripts/listing-reports-0093-check.mjs.
-- ============================================================================

begin;

-- ---- the numbers -------------------------------------------------------------
create table if not exists public.listing_report_limits (
  id                     boolean primary key default true check (id),   -- one row
  per_client             integer not null default 5   check (per_client >= 1),
  client_window_minutes  integer not null default 10  check (client_window_minutes between 1 and 1440),
  per_network            integer not null default 20  check (per_network >= 1),
  network_window_minutes integer not null default 60  check (network_window_minutes between 1 and 1440),
  global_per_window      integer not null default 600 check (global_per_window >= 1),
  global_window_minutes  integer not null default 60  check (global_window_minutes between 1 and 1440),
  updated_at             timestamptz not null default now()
);
insert into public.listing_report_limits (id) values (true) on conflict (id) do nothing;
alter table public.listing_report_limits enable row level security;
revoke all on public.listing_report_limits from public, anon, authenticated;

-- ---- the salt ------------------------------------------------------------------
-- Two v4 UUIDs (strong randomness, core PostgreSQL, no extension): 244 random bits.
create table if not exists public.submission_throttle_salt (
  id   boolean primary key default true check (id),
  salt text not null
);
insert into public.submission_throttle_salt (id, salt)
  values (true, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (id) do nothing;
alter table public.submission_throttle_salt enable row level security;
revoke all on public.submission_throttle_salt from public, anon, authenticated;

-- ---- who is calling ---------------------------------------------------------
-- The client's address, from gateway-set headers ONLY: cf-connecting-ip, else the
-- LAST x-forwarded-for hop. Never x-real-ip or true-client-ip. NULL when neither
-- (a direct, non-gateway session). Trimmed of all surrounding whitespace.
create or replace function public.listing_report_client_ip()
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  with h as (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as j),
  xff as (select string_to_array(coalesce(j ->> 'x-forwarded-for', ''), ',') as hops, j from h)
  select coalesce(
    nullif(regexp_replace(coalesce(j ->> 'cf-connecting-ip', ''), '^\s+|\s+$', '', 'g'), ''),
    nullif(regexp_replace(coalesce(hops[array_length(hops, 1)], ''), '^\s+|\s+$', '', 'g'), ''))
  from xff;
$$;
revoke all on function public.listing_report_client_ip() from public, anon, authenticated;

-- The address's network: /24 for IPv4, /48 for IPv6, as text. NULL when the value
-- is not an address at all (then only the client and global limits apply).
create or replace function public.listing_report_network(p_ip text)
returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare v inet;
begin
  if p_ip is null then return null; end if;
  begin v := p_ip::inet; exception when others then return null; end;
  -- An IPv4-mapped IPv6 address (::ffff:a.b.c.d) is that IPv4 address: as IPv6
  -- its /48 would be ALL of IPv4, one bucket for every such client.
  if family(v) = 6 and v <<= '::ffff:0:0/96'::inet then
    v := '0.0.0.0'::inet + (v - '::ffff:0.0.0.0'::inet);
  end if;
  return host(network(set_masklen(v, case when family(v) = 4 then 24 else 48 end)))
      || case when family(v) = 4 then '/24' else '/48' end;
end $$;
revoke all on function public.listing_report_network(text) from public, anon, authenticated;

-- Salted hash of a value, as stored. Kind: 'client' or 'network'.
create or replace function public.listing_report_key(p_kind text, p_value text)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_kind when 'network' then 'ln:' else 'lr:' end
      || left(encode(sha256(convert_to(s.salt || case p_kind when 'network' then '|net|' else '|' end || p_value, 'UTF8')), 'hex'), 32)
    from public.submission_throttle_salt s
   where s.id;
$$;
revoke all on function public.listing_report_key(text, text) from public, anon, authenticated;

-- ---- the guard -----------------------------------------------------------------
create or replace function public.listing_reports_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role  text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
                           current_setting('role', true));
  v_rows  integer;
  l       public.listing_report_limits;
  v_ip    text;
  v_net   text;
  v_epoch double precision := extract(epoch from now());
  v_count integer;
  w       timestamptz;
begin
  -- 1. Clients only. The service role, direct sessions and platform admins pass.
  if v_role is null or v_role not in ('anon', 'authenticated') then return null; end if;
  if public.is_admin() then return null; end if;

  -- 2. One report per request.
  select count(*) into v_rows from new_rows;
  if v_rows = 0 then return null; end if;
  if v_rows > 1 then
    raise exception 'listing report refused: one report per request (this request had %)', v_rows
      using errcode = 'PT400', hint = 'Send a single report as one JSON object.';
  end if;

  -- 4 (first, cheaply): prune expired counters, 50 at a time, skipping rows
  -- another insert holds. Rolls back with the statement if this one is refused.
  delete from public.submission_throttle t
   where t.ctid in (
     select x.ctid from public.submission_throttle x
      where x.form in ('listing_report_db_global', 'listing_report_db_network', 'listing_report_db_client')
        and x.window_start < now() - interval '1 day'
      limit 50 for update skip locked);

  select * into l from public.listing_report_limits where id;
  if not found then
    l.per_client := 5;  l.client_window_minutes := 10;
    l.per_network := 20; l.network_window_minutes := 60;
    l.global_per_window := 600; l.global_window_minutes := 60;
  end if;
  v_ip  := public.listing_report_client_ip();
  v_net := public.listing_report_network(v_ip);

  -- 3a. Global (always first).
  w := to_timestamp(floor(v_epoch / (l.global_window_minutes * 60)) * (l.global_window_minutes * 60));
  insert into public.submission_throttle as t (ip_hash, form, window_start, count)
       values ('lr:global', 'listing_report_db_global', w, 1)
  on conflict (ip_hash, form, window_start) do update set count = t.count + 1
  returning t.count into v_count;
  if v_count > l.global_per_window then
    raise exception 'listing report refused: too many reports right now, try again later'
      using errcode = 'PT429', hint = format('global limit %s per %s minutes', l.global_per_window, l.global_window_minutes);
  end if;

  -- 3b. The client's network (only when there is an address).
  if v_net is not null then
    w := to_timestamp(floor(v_epoch / (l.network_window_minutes * 60)) * (l.network_window_minutes * 60));
    insert into public.submission_throttle as t (ip_hash, form, window_start, count)
         values (public.listing_report_key('network', v_net), 'listing_report_db_network', w, 1)
    on conflict (ip_hash, form, window_start) do update set count = t.count + 1
    returning t.count into v_count;
    if v_count > l.per_network then
      raise exception 'listing report refused: too many reports from this network, try again later'
        using errcode = 'PT429', hint = format('network limit %s per %s minutes', l.per_network, l.network_window_minutes);
    end if;
  end if;

  -- 3c. The client ('unknown' when no gateway address: one shared bucket).
  w := to_timestamp(floor(v_epoch / (l.client_window_minutes * 60)) * (l.client_window_minutes * 60));
  insert into public.submission_throttle as t (ip_hash, form, window_start, count)
       values (public.listing_report_key('client', coalesce(v_ip, 'unknown')), 'listing_report_db_client', w, 1)
  on conflict (ip_hash, form, window_start) do update set count = t.count + 1
  returning t.count into v_count;
  if v_count > l.per_client then
    raise exception 'listing report refused: too many reports from this device, try again later'
      using errcode = 'PT429', hint = format('limit %s per %s minutes', l.per_client, l.client_window_minutes);
  end if;

  return null;
end $$;
revoke all on function public.listing_reports_guard() from public, anon, authenticated;

drop trigger if exists listing_reports_guard on public.listing_reports;
create trigger listing_reports_guard
  after insert on public.listing_reports
  referencing new table as new_rows
  for each statement execute function public.listing_reports_guard();

commit;
