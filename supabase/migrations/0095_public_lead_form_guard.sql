-- 0095_public_lead_form_guard.sql
--
-- Keeps mineex.ca's LIVE lead forms working after 0058, without reopening the
-- unbounded anonymous INSERT that 0058 closes. Run IMMEDIATELY after 0058.
--
-- WHY
-- ---
-- mineex.ca (the separate mineex-site project, code 9dfafd7, not changed by this
-- rollout) posts its forms straight to PostgREST with the anon key:
--   * homepage LeadForm (src/marketing/sections/Close.jsx)  -> demo_bookings
--       {company, name, email, notes}
--   * /site/legacy demo form (src/site/Site.jsx)            -> demo_bookings
--       {company, name, email, phone, country, preferred_date, preferred_time, notes}
--   * /site/legacy contact form                             -> contact_submissions
--       {name, email, company, message}
--   * old /api/contact and /api/conference-inquiry, which fall back to the anon
--     key because mineex-site has no service-role key  -> demo_bookings
--       {name, email, company, notes}
-- 0058 revokes anon INSERT on both tables, so every one of those returns 401.
--
-- WHAT THIS ADDS (anon only; the new site uses /api/submit with the service role)
-- ----------------
--   1. INSERT on exactly the columns those forms send. id and created_at stay
--      server-set; anon still has no SELECT, UPDATE, DELETE or TRUNCATE.
--   2. An RLS policy that validates every row: a name and a well-formed email are
--      required, every field has a length cap.
--   3. A rate limit, as 0093 does for listing reports, keyed only on the address the
--      gateway sets: per device, per /24 (IPv6 /48) network and overall, plus one
--      row per request. Counters live in 0057's submission_throttle under their
--      own form names; addresses are stored only as salted hashes.
-- Limits are one row in public_form_limits (service role / SQL editor only).
--
-- Self-contained: needs only 0057 (submission_throttle, already on production)
-- and 0058. It does not use 0093's functions, so it can run before 0077-0093.

begin;

create table if not exists public.public_form_limits (
  id                     boolean primary key default true check (id),   -- one row
  per_client             integer not null default 5   check (per_client >= 1),
  client_window_minutes  integer not null default 60  check (client_window_minutes between 1 and 1440),
  per_network            integer not null default 20  check (per_network >= 1),
  network_window_minutes integer not null default 60  check (network_window_minutes between 1 and 1440),
  global_per_window      integer not null default 200 check (global_per_window >= 1),
  global_window_minutes  integer not null default 60  check (global_window_minutes between 1 and 1440),
  salt                   text    not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at             timestamptz not null default now()
);
insert into public.public_form_limits (id) values (true) on conflict (id) do nothing;
alter table public.public_form_limits enable row level security;
revoke all on public.public_form_limits from public, anon, authenticated;

-- ---- 1. column grants --------------------------------------------------------
grant insert (company, name, email, phone, country, preferred_date, preferred_time, notes)
  on public.demo_bookings to anon;
grant insert (name, email, company, message)
  on public.contact_submissions to anon;

-- ---- 2. validating policies --------------------------------------------------
drop policy if exists anon_insert_demo_guarded on public.demo_bookings;
create policy anon_insert_demo_guarded on public.demo_bookings
  for insert to anon
  with check (
    length(btrim(coalesce(name, ''))) between 1 and 200
    and length(btrim(coalesce(email, ''))) between 3 and 320
    and btrim(email) ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and coalesce(length(company), 0)        <= 200
    and coalesce(length(phone), 0)          <= 50
    and coalesce(length(country), 0)        <= 100
    and coalesce(length(preferred_date), 0) <= 50
    and coalesce(length(preferred_time), 0) <= 50
    and coalesce(length(notes), 0)          <= 5000
  );

drop policy if exists anon_insert_contact_guarded on public.contact_submissions;
create policy anon_insert_contact_guarded on public.contact_submissions
  for insert to anon
  with check (
    length(btrim(coalesce(name, ''))) between 1 and 200
    and length(btrim(coalesce(email, ''))) between 3 and 320
    and btrim(email) ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and coalesce(length(company), 0) <= 200
    and length(btrim(coalesce(message, ''))) between 1 and 5000
  );

-- ---- 3. rate limit -----------------------------------------------------------
-- The caller's address as the gateway recorded it: cf-connecting-ip, else the LAST
-- x-forwarded-for hop (the one the gateway appended; earlier hops are client-set).
-- Same rule as 0093's listing_report_client_ip(), kept separate on purpose.
create or replace function public.public_form_client_ip()
returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  j    json;
  hops text[];
  raw  text;
  v    inet;
begin
  begin
    j := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  exception when others then
    return null;
  end;
  raw := nullif(btrim(coalesce(j ->> 'cf-connecting-ip', '')), '');
  if raw is null then
    hops := string_to_array(coalesce(j ->> 'x-forwarded-for', ''), ',');
    raw := nullif(btrim(coalesce(hops[array_length(hops, 1)], '')), '');
  end if;
  if raw is null then return null; end if;
  begin v := raw::inet; exception when others then return null; end;
  if family(v) = 6 and v <<= '::ffff:0:0/96'::inet then
    v := '0.0.0.0'::inet + (v - '::ffff:0.0.0.0'::inet);
  end if;
  return host(v);
end $$;
revoke all on function public.public_form_client_ip() from public, anon, authenticated;

create or replace function public.public_form_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role  text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
                           current_setting('role', true));
  v_rows  integer;
  l       public.public_form_limits;
  v_ip    text;
  v_net   text;
  v_epoch double precision := extract(epoch from now());
  v_count integer;
  w       timestamptz;
begin
  -- Only anonymous callers are limited: the service role (/api/submit, the old
  -- API when it has the key) and the SQL editor are not.
  if v_role is distinct from 'anon' then return null; end if;
  select count(*) into v_rows from new_rows;
  if v_rows = 0 then return null; end if;
  if v_rows > 1 then
    raise exception 'form refused: one submission per request (this request had %)', v_rows
      using errcode = 'PT400';
  end if;

  delete from public.submission_throttle t
   where t.ctid in (
     select x.ctid from public.submission_throttle x
      where x.form like 'lead_form_db_%'
        and x.window_start < now() - interval '1 day'
      limit 50 for update skip locked);

  select * into l from public.public_form_limits where id;
  if not found then
    raise exception 'form refused: limits are not configured' using errcode = 'PT503';
  end if;

  v_ip := public.public_form_client_ip();
  if v_ip is not null and family(v_ip::inet) = 4 then
    v_net := host(network(set_masklen(v_ip::inet, 24))) || '/24';
  elsif v_ip is not null then
    v_net := host(network(set_masklen(v_ip::inet, 48))) || '/48';
  end if;

  -- overall (both forms together)
  w := to_timestamp(floor(v_epoch / (l.global_window_minutes * 60)) * (l.global_window_minutes * 60));
  insert into public.submission_throttle as t (ip_hash, form, window_start, count)
       values ('lf:global', 'lead_form_db_global', w, 1)
  on conflict (ip_hash, form, window_start) do update set count = t.count + 1
  returning t.count into v_count;
  if v_count > l.global_per_window then
    raise exception 'form refused: too many submissions right now, try again later' using errcode = 'PT429';
  end if;

  -- per network
  if v_net is not null then
    w := to_timestamp(floor(v_epoch / (l.network_window_minutes * 60)) * (l.network_window_minutes * 60));
    insert into public.submission_throttle as t (ip_hash, form, window_start, count)
         values ('lf:' || left(encode(sha256(convert_to(l.salt || '|net|' || v_net, 'UTF8')), 'hex'), 32),
                 'lead_form_db_network', w, 1)
    on conflict (ip_hash, form, window_start) do update set count = t.count + 1
    returning t.count into v_count;
    if v_count > l.per_network then
      raise exception 'form refused: too many submissions from this network, try again later' using errcode = 'PT429';
    end if;
  end if;

  -- per device, both forms together (an unknown address shares one bucket, so it
  -- cannot dodge the limit)
  w := to_timestamp(floor(v_epoch / (l.client_window_minutes * 60)) * (l.client_window_minutes * 60));
  insert into public.submission_throttle as t (ip_hash, form, window_start, count)
       values ('lf:' || left(encode(sha256(convert_to(l.salt || '|' || coalesce(v_ip, 'unknown'), 'UTF8')), 'hex'), 32),
               'lead_form_db_client', w, 1)
  on conflict (ip_hash, form, window_start) do update set count = t.count + 1
  returning t.count into v_count;
  if v_count > l.per_client then
    raise exception 'form refused: too many submissions from this device, try again later' using errcode = 'PT429';
  end if;
  return null;
end $$;
revoke all on function public.public_form_guard() from public, anon, authenticated;

drop trigger if exists demo_bookings_public_guard on public.demo_bookings;
create trigger demo_bookings_public_guard
  after insert on public.demo_bookings
  referencing new table as new_rows
  for each statement execute function public.public_form_guard();

drop trigger if exists contact_submissions_public_guard on public.contact_submissions;
create trigger contact_submissions_public_guard
  after insert on public.contact_submissions
  referencing new table as new_rows
  for each statement execute function public.public_form_guard();

commit;

-- ---------------------------------------------------------------- verify ----
--   select has_column_privilege('anon', 'public.demo_bookings', 'email', 'INSERT')       -- true
--      and not has_column_privilege('anon', 'public.demo_bookings', 'created_at', 'INSERT')
--      and not has_table_privilege('anon', 'public.demo_bookings', 'SELECT')
--      and has_column_privilege('anon', 'public.contact_submissions', 'message', 'INSERT');
-- Rollback: supabase/rollbacks/0095_public_lead_form_guard.rollback.sql
