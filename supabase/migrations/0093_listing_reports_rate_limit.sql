-- ============================================================================
-- 0093_listing_reports_rate_limit.sql — NOT APPLIED. Prepared for review (S3).
--
-- listing_reports: a DATABASE-enforced rate limit and a one-row-per-request cap
-- for direct client inserts (anon / authenticated), so the path 0077 keeps open
-- for installed 1.3.x apps is bounded the way /api/submit is.
--
-- DECISION (user, 2026-11-01, Option B). Found by
-- scripts/listing-reports-0077-security-check.mjs: 20 of 20 back-to-back anon
-- reports stored, and a 200-row JSON array stored in one request.
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
--   3. Global ceiling first, then the per-client limit, each a fixed window in
--      0057's submission_throttle (form 'listing_report_db_global' / '_client').
--      Over either: PT429, nothing stored. A refused insert rolls its own counter
--      increments back with it, so refusals do not consume the window.
--
-- WHO IS "A CLIENT". PostgREST exposes the request headers as request.headers.
-- Order: cf-connecting-ip (set by Cloudflare in front of Supabase; a client
-- cannot forge it through Cloudflare), then the FIRST hop of x-forwarded-for,
-- then x-real-ip, then 'unknown' (one shared, strict bucket). The first XFF hop
-- CAN be client-supplied where a proxy appends rather than overwrites; that is
-- why the global ceiling exists: a rotating-IP or forged-header flood is still
-- bounded per hour.
-- Stored is a salted SHA-256 (first 32 hex chars) of the address, never the
-- address: 'lr:' || left(sha256(salt || '|' || ip), 32). The salt is generated
-- here, in a table nobody but the owner can read.
--
-- NUMBERS (pilot), in public.listing_report_limits: change with one UPDATE in
-- the SQL editor, no migration:
--   per_client 5 per 10 minutes -- the same policy as /api/submit (0057:
--     MAX_PER_WINDOW 5, WINDOW_MINUTES 10). A person filing "report an error /
--     claim this company" sends one; five covers retries and a second listing.
--   global 300 per 60 minutes -- far above any real pilot volume (listing
--     reports are rare, human acts), and caps the worst case at 7,200 rows a
--     day instead of unbounded. If it ever binds for real users, raise it.
--
-- CONCURRENCY. Each counter is one row, incremented with INSERT ... ON CONFLICT
-- DO UPDATE ... RETURNING count: concurrent inserts for the same key serialize
-- on that row's lock, and each sees the count the one before it committed (or
-- rolled back). No overshoot. Locks are always taken global-then-client, so two
-- inserts cannot deadlock.
--
-- REFUSALS. RAISE with SQLSTATE PT429 / PT400: PostgREST turns PTxxx into HTTP
-- xxx (older PostgREST: 400). The 1.3.x sheet treats any non-2xx as failure
-- (setState(r.ok ? "done" : "error")) and shows its error state. Never a silent
-- drop. The message names the limit, never row data.
--
-- NO NEW READ EXPOSURE. listing_report_limits and submission_throttle_salt are
-- RLS-on with no policy and no grant to anon/authenticated (like 0057's
-- submission_throttle, which they can't read either). The helper and trigger
-- functions are not executable by clients. 0077's policy and 0092's grants are
-- unchanged.
--
-- HOUSEKEEPING. These counters live in submission_throttle beside /api/submit's,
-- so 0057's prune_submission_throttle() (service role) clears them too.
--
-- Needs: 0057 (submission_throttle), 0092 (run right after it, same session).
-- ROLLBACK: supabase/rollbacks/0093_listing_reports_rate_limit.rollback.sql
-- Verified in a rolled-back transaction by scripts/listing-reports-0093-check.mjs.
-- ============================================================================

begin;

-- ---- the numbers -------------------------------------------------------------
create table if not exists public.listing_report_limits (
  id                    boolean primary key default true check (id),   -- one row
  per_client            integer not null default 5   check (per_client >= 1),
  client_window_minutes integer not null default 10  check (client_window_minutes between 1 and 1440),
  global_per_window     integer not null default 300 check (global_per_window >= 1),
  global_window_minutes integer not null default 60  check (global_window_minutes between 1 and 1440),
  updated_at            timestamptz not null default now()
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
-- Each candidate is trimmed of ALL surrounding whitespace (tabs and newlines too,
-- not just spaces), so a padded header cannot make a second bucket.
create or replace function public.listing_report_client_key()
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  with h as (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as j),
  ip as (
    select coalesce(
      nullif(regexp_replace(coalesce(j ->> 'cf-connecting-ip', ''), '^\s+|\s+$', '', 'g'), ''),
      nullif(regexp_replace(split_part(coalesce(j ->> 'x-forwarded-for', ''), ',', 1), '^\s+|\s+$', '', 'g'), ''),
      nullif(regexp_replace(coalesce(j ->> 'x-real-ip', ''), '^\s+|\s+$', '', 'g'), ''),
      'unknown') as a
    from h
  )
  select 'lr:' || left(encode(sha256(convert_to(s.salt || '|' || ip.a, 'UTF8')), 'hex'), 32)
    from ip, public.submission_throttle_salt s
   where s.id;
$$;
revoke all on function public.listing_report_client_key() from public, anon, authenticated;

-- ---- the guard -----------------------------------------------------------------
create or replace function public.listing_reports_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role   text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
                            current_setting('role', true));
  v_rows   integer;
  l        public.listing_report_limits;
  v_key    text;
  v_epoch  double precision := extract(epoch from now());
  v_cwin   timestamptz;
  v_gwin   timestamptz;
  v_count  integer;
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

  -- 3. Global ceiling, then the per-client limit (always in this order: no deadlock).
  select * into l from public.listing_report_limits where id;
  if not found then
    l.per_client := 5; l.client_window_minutes := 10; l.global_per_window := 300; l.global_window_minutes := 60;
  end if;
  v_gwin := to_timestamp(floor(v_epoch / (l.global_window_minutes * 60)) * (l.global_window_minutes * 60));
  v_cwin := to_timestamp(floor(v_epoch / (l.client_window_minutes * 60)) * (l.client_window_minutes * 60));

  insert into public.submission_throttle as t (ip_hash, form, window_start, count)
       values ('lr:global', 'listing_report_db_global', v_gwin, 1)
  on conflict (ip_hash, form, window_start) do update set count = t.count + 1
  returning t.count into v_count;
  if v_count > l.global_per_window then
    raise exception 'listing report refused: too many reports right now, try again later'
      using errcode = 'PT429', hint = format('global limit %s per %s minutes', l.global_per_window, l.global_window_minutes);
  end if;

  v_key := public.listing_report_client_key();
  insert into public.submission_throttle as t (ip_hash, form, window_start, count)
       values (v_key, 'listing_report_db_client', v_cwin, 1)
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
