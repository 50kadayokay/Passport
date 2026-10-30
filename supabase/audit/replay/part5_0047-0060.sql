-- STAGING REPLAY part 5 of 5 — migrations 0047 to 0060
-- Run against the STAGING project only. Never production.
-- Stop at the first error and report it; do not skip ahead.


-- ==================== 0047_company_messaging_access.sql ====================
-- ============================================================================
-- 0047_company_messaging_access.sql — let a company read and answer its own
-- investor messages from the Company Portal.
--
-- 0014 built the investor side only: `conv_select` and `msg_select` both require
-- auth.uid() = investor_id, and the company side existed solely as the Postmark
-- inbound webhook writing with the service role. The consequence is that a
-- signed-in company user cannot read a single one of their own conversations
-- from the browser. The portal's Messages inbox needs exactly that, so this
-- migration adds the company side of the same two tables.
--
-- Design notes:
--   • `conversations.company_slug` is text with no foreign key (0014's choice),
--     so authorization resolves slug -> companies.id -> owns_company(id).
--     owns_company() already covers the owner AND active memberships, so a
--     company's staff see the inbox without a second rule to keep in sync.
--   • Company replies may only ever be inserted as sender='company'. The WITH
--     CHECK enforces that, so a company cannot forge a message attributed to
--     the investor in their own thread.
--   • Read state is per CONVERSATION, not per message: the inbox marks a thread
--     read, which is all a Gmail-style unread dot needs, and it avoids opening
--     an UPDATE surface on `messages` (where it would also expose `body`).
--   • Marking read therefore goes through a SECURITY DEFINER RPC rather than an
--     UPDATE policy, so the only writable column is the one we intend.
-- ============================================================================

-- ---------------------------------------------------------------- read state
alter table public.conversations
  add column if not exists company_read_at timestamptz;

comment on column public.conversations.company_read_at is
  'When the company last opened this thread. NULL = never opened. Set only by mark_conversation_read().';

-- ------------------------------------------------------------- authorization
-- Slug -> company -> ownership, in one place. SECURITY DEFINER because the
-- policy must resolve the company row even though the caller may not be able to
-- select it directly; STABLE so the planner can hoist it out of the row loop.
create or replace function public.owns_company_slug(p_slug text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies c
     where c.slug = p_slug
       and public.owns_company(c.id)
  );
$$;

revoke execute on function public.owns_company_slug(text) from public;
grant  execute on function public.owns_company_slug(text) to authenticated;

-- ------------------------------------------------------------------ policies
-- Investor policies from 0014 stay exactly as they are; these are additive, and
-- PostgreSQL ORs multiple permissive policies together.
drop policy if exists conv_select_company on public.conversations;
create policy conv_select_company on public.conversations
  for select using (public.owns_company_slug(company_slug));

drop policy if exists msg_select_company on public.messages;
create policy msg_select_company on public.messages
  for select using (
    exists (select 1 from public.conversations c
             where c.id = conversation_id
               and public.owns_company_slug(c.company_slug))
  );

-- A company may add messages to its own threads, and only as itself.
drop policy if exists msg_insert_company on public.messages;
create policy msg_insert_company on public.messages
  for insert with check (
    sender = 'company'
    and exists (select 1 from public.conversations c
                 where c.id = conversation_id
                   and public.owns_company_slug(c.company_slug))
  );

-- --------------------------------------------------------------- mark as read
create or replace function public.mark_conversation_read(p_conversation uuid)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_slug text; v_now timestamptz;
begin
  select c.company_slug into v_slug
    from public.conversations c where c.id = p_conversation;

  if v_slug is null then
    raise exception 'conversation not found' using errcode = '22023';
  end if;

  if not public.owns_company_slug(v_slug) then
    raise exception 'not authorized for this conversation' using errcode = '42501';
  end if;

  v_now := now();
  update public.conversations set company_read_at = v_now where id = p_conversation;
  return v_now;
end $$;

revoke execute on function public.mark_conversation_read(uuid) from public;
grant  execute on function public.mark_conversation_read(uuid) to authenticated;

-- -------------------------------------------------------------------- grants
grant select         on public.conversations to authenticated;
grant select, insert on public.messages      to authenticated;

-- Sorting the inbox by recency, scoped to one company.
create index if not exists idx_conv_slug_recent
  on public.conversations (company_slug, last_message_at desc);

-- --------------------------------------------------------- who is writing to us
-- An inbox that lists UUIDs is useless, but `investor_profiles` is self-only
-- (0016: auth.uid() = user_id) and the company cannot read auth.users at all.
--
-- Rather than open `investor_profiles` with a policy -- which would disclose
-- every column, bio included, and could not be narrowed per column without also
-- restricting investors reading their own row -- this returns the four display
-- fields the inbox actually needs, and only for people who have already chosen
-- to write to this company. No email address is exposed: the company never had
-- the investor's address (0014 routes replies through Postmark), and this does
-- not change that.
create or replace function public.company_conversation_senders(p_slug text)
returns table (investor_id uuid, display_name text, investor_company text, investor_role text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.user_id, p.display_name, p.company, p.role
    from public.investor_profiles p
   where public.owns_company_slug(p_slug)
     and exists (
       select 1 from public.conversations c
        where c.company_slug = p_slug
          and c.investor_id = p.user_id
     );
$$;

revoke execute on function public.company_conversation_senders(text) from public;
grant  execute on function public.company_conversation_senders(text) to authenticated;

-- ==================== 0048_company_engagement_analytics.sql ====================
-- ============================================================================
-- 0048_company_engagement_analytics.sql — let a company see its own numbers.
--
-- Engagement HAS been recorded all along; the company just could never read it:
--   post_events           (0009)  impression | open | save | unsave | dwell
--   company_follows       (0009)  follows, keyed by company_id
--   user_company_rel.     (0016)  follows, keyed by company_slug  <- second source
--   post_likes/post_saves (0016)  keyed by company_slug + post_key
-- Every one of those is RLS'd to `user_id = auth.uid()`, so the Analytics page
-- had nothing to show and said "coming soon" instead.
--
-- These functions return AGGREGATES ONLY. That is deliberate and not merely
-- convenient: a company has a legitimate interest in how many investors read a
-- release, and no interest in WHICH investor read it. Nothing here can return
-- a user_id, and no policy is added to the underlying tables, so the per-row
-- privacy of 0009/0016 is left exactly as it was.
--
-- NOT INCLUDED: shares. Nothing in this database records a share -- post_events'
-- CHECK constraint allows impression/open/save/unsave/dwell and nothing else.
-- Reporting a share count would mean inventing one, so the page shows shares as
-- not yet tracked. Adding it means adding the event at the point of sharing
-- first; that is an app change, not a reporting change.
-- ============================================================================

-- ------------------------------------------------------------------- totals
create or replace function public.company_engagement_totals(p_company uuid)
returns table (
  views            bigint,   -- impressions: the post appeared in a feed
  reads            bigint,   -- opens: the investor actually opened it
  avg_dwell_secs   numeric,  -- mean of recorded dwell values
  followers        bigint,
  likes            bigint,
  saves            bigint,
  posts            bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  select c.slug into v_slug from public.companies c where c.id = p_company;

  return query
  select
    (select count(*) from public.post_events e
       join public.posts p on p.id = e.post_id
      where p.company_id = p_company and e.kind = 'impression'),
    (select count(*) from public.post_events e
       join public.posts p on p.id = e.post_id
      where p.company_id = p_company and e.kind = 'open'),
    (select round(avg(e.value)::numeric, 1) from public.post_events e
       join public.posts p on p.id = e.post_id
      where p.company_id = p_company and e.kind = 'dwell' and e.value is not null),
    -- Two follow sources exist and a person may appear in both, so count
    -- DISTINCT users across the union rather than summing the two tables.
    (select count(*) from (
        select f.user_id from public.company_follows f where f.company_id = p_company
        union
        select r.user_id from public.user_company_relationships r
         where r.company_slug = v_slug and r.is_following
     ) u),
    (select count(*) from public.post_likes l where l.company_slug = v_slug),
    -- Saves live in both models too (post_saves rows and 'save' post_events).
    (select
       (select count(*) from public.post_saves s where s.company_slug = v_slug)
     + (select count(*) from public.post_events e
          join public.posts p on p.id = e.post_id
         where p.company_id = p_company and e.kind = 'save')),
    (select count(*) from public.posts p
      where p.company_id = p_company and p.removed_at is null);
end $$;

revoke execute on function public.company_engagement_totals(uuid) from public, anon;
grant  execute on function public.company_engagement_totals(uuid) to authenticated;

-- -------------------------------------------------------------------- daily
-- One row per day for the trend line. Days with no activity are returned as
-- zeroes rather than omitted, so a chart does not silently close the gaps and
-- imply activity that did not happen.
create or replace function public.company_engagement_daily(p_company uuid, p_days integer default 30)
returns table (day date, views bigint, reads bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  return query
  with span as (
    select generate_series(
      (current_date - (greatest(least(p_days, 365), 1) - 1))::date,
      current_date,
      interval '1 day'
    )::date as day
  ),
  ev as (
    select (e.created_at at time zone 'UTC')::date as day, e.kind
      from public.post_events e
      join public.posts p on p.id = e.post_id
     where p.company_id = p_company
       and e.created_at >= current_date - (greatest(least(p_days, 365), 1) - 1)
  )
  select s.day,
         count(*) filter (where ev.kind = 'impression'),
         count(*) filter (where ev.kind = 'open')
    from span s left join ev on ev.day = s.day
   group by s.day
   order by s.day;
end $$;

revoke execute on function public.company_engagement_daily(uuid, integer) from public, anon;
grant  execute on function public.company_engagement_daily(uuid, integer) to authenticated;

-- ---------------------------------------------------------------- per post
-- Which releases actually landed. Aggregates per post, no user identities.
create or replace function public.company_post_engagement(p_company uuid, p_limit integer default 20)
returns table (
  post_id uuid, title text, published_at timestamptz,
  views bigint, reads bigint, likes bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  select c.slug into v_slug from public.companies c where c.id = p_company;

  return query
  select p.id, p.title, p.published_at,
         (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'impression'),
         (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'open'),
         (select count(*) from public.post_likes l
           where l.company_slug = v_slug and l.post_key = p.id::text)
    from public.posts p
   where p.company_id = p_company and p.removed_at is null
   order by p.published_at desc
   limit greatest(least(p_limit, 100), 1);
end $$;

revoke execute on function public.company_post_engagement(uuid, integer) from public, anon;
grant  execute on function public.company_post_engagement(uuid, integer) to authenticated;

-- Supports the daily rollup's date filter.
create index if not exists idx_post_events_created on public.post_events (created_at);

-- ==================== 0049_company_notifications.sql ====================
-- ============================================================================
-- 0049_company_notifications.sql — who followed you, who liked a release.
--
-- WHERE THE PRIVACY LINE SITS
-- ---------------------------
-- 0048 exposes engagement as AGGREGATES ONLY and says so explicitly: a company
-- has an interest in how many investors read a release and none in which one.
-- This migration names individuals, so it needs to say why that is not a
-- reversal.
--
-- The distinction is deliberate vs passive:
--   • A FOLLOW or a LIKE is an act the investor chose and expects to be seen,
--     the way following a company on LinkedIn is. Naming them is the point of
--     the act.
--   • A VIEW, an OPEN or a DWELL time is passive. The investor did not signal
--     anything to anybody; reporting who did those would be surveillance.
-- So follows and likes carry a name here; views and reads stay aggregate in
-- 0048 and are not exposed per-person anywhere.
--
-- Only display fields are returned -- the same four 0047 uses for messaging --
-- and never an email address.
-- ============================================================================

-- ------------------------------------------------------- the unread marker
create table if not exists public.company_notification_reads (
  company_id uuid primary key references public.companies(id) on delete cascade,
  seen_at    timestamptz not null default now()
);

alter table public.company_notification_reads enable row level security;

drop policy if exists cnr_select on public.company_notification_reads;
create policy cnr_select on public.company_notification_reads
  for select using (public.owns_company(company_id));

-- LEAST PRIVILEGE, EXPLICITLY. Supabase grants anon and authenticated all seven
-- privileges on every newly created table. 0014 left that default in place on
-- the messaging tables and it survived two years until 0047's verification
-- caught it (fixed by 0052). Every table this migration creates revokes it in
-- the same breath, so the defect cannot be reintroduced.
revoke all on public.company_notification_reads from anon, authenticated;
grant select on public.company_notification_reads to authenticated;

-- ------------------------------------------------------------------ the feed
create or replace function public.company_notifications(p_company uuid, p_limit integer default 50)
returns table (
  kind             text,        -- 'follow' | 'like'
  actor_name       text,
  actor_role       text,
  actor_company    text,
  subject          text,        -- the release title, for a like
  occurred_at      timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  select c.slug into v_slug from public.companies c where c.id = p_company;

  return query
  with follows as (
    -- Two follow sources, as in 0048. DISTINCT ON keeps the earliest record per
    -- person so someone present in both tables appears once.
    select distinct on (u.user_id) u.user_id, u.at
      from (
        select f.user_id, f.created_at as at
          from public.company_follows f
         where f.company_id = p_company
        union all
        -- NOTE: user_company_relationships.created_at is when the ROW was
        -- created, which may predate the moment is_following became true.
        -- It is the only timestamp the table offers.
        select r.user_id, r.created_at
          from public.user_company_relationships r
         where r.company_slug = v_slug and r.is_following
      ) u
     order by u.user_id, u.at asc
  ),
  events as (
    select 'follow'::text as kind, f.user_id, null::text as subject, f.at as occurred_at
      from follows f
    union all
    select 'like'::text, l.user_id, coalesce(p.title, 'a release'), l.created_at
      from public.post_likes l
      left join public.posts p on p.id::text = l.post_key
     where l.company_slug = v_slug
  )
  select e.kind,
         ip.display_name,
         ip.role,
         ip.company,
         e.subject,
         e.occurred_at
    from events e
    left join public.investor_profiles ip on ip.user_id = e.user_id
   order by e.occurred_at desc
   limit greatest(least(p_limit, 200), 1);
end $$;

revoke execute on function public.company_notifications(uuid, integer) from public, anon;
grant  execute on function public.company_notifications(uuid, integer) to authenticated;

-- ------------------------------------------------------------- mark as seen
create or replace function public.mark_notifications_seen(p_company uuid)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_now timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  v_now := now();
  insert into public.company_notification_reads (company_id, seen_at)
       values (p_company, v_now)
  on conflict (company_id) do update set seen_at = excluded.seen_at;
  return v_now;
end $$;

revoke execute on function public.mark_notifications_seen(uuid) from public, anon;
grant  execute on function public.mark_notifications_seen(uuid) to authenticated;

create index if not exists idx_post_likes_slug_created
  on public.post_likes (company_slug, created_at desc);

-- ==================== 0050a_mineiq_and_publication_push.sql ====================
-- ============================================================================
-- 0050_mineiq_and_publication_push.sql — Phase B, items 1-4.
--
--   1. MineIQ ingestion idempotency   (claim table + unique key on facts)
--   2. MineIQ supersession            (a `measure` identity to chain on)
--   3. MineIQ retrieval               (full-text indexes + a scoped RPC)
--   4. Device push for publications   (reuse the existing outbox + sender)
--
-- Nothing unrelated is touched. `facts` has existed since 0005 and has never
-- had a writer, so widening it now carries no data-migration risk.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) IDEMPOTENCY
-- ---------------------------------------------------------------------------
-- Provenance moves out of jsonb and into real columns: a foreign key can be
-- indexed and cannot be typo'd, and PostgREST can only upsert on real columns.
alter table public.facts
  add column if not exists publication_id uuid references public.publications(id) on delete set null;

-- The upsert target. Computed by the writer as a stable digest of
-- (publication_id, kind, subject, the fact's own identifying values), so the
-- SAME fact extracted twice collapses to one row while two genuinely different
-- drill holes from one release stay separate.
alter table public.facts
  add column if not exists fact_key text;

-- The supersession identity — see (2).
alter table public.facts
  add column if not exists measure text;

-- NOT partial. A partial unique index cannot serve as an ON CONFLICT arbiter
-- unless the statement repeats the predicate, and PostgREST's `on_conflict=`
-- cannot express one -- the upsert would fail at runtime. A plain unique index
-- is correct anyway: NULLs never conflict in a unique index, so the rows that
-- predate this column (fact_key null) coexist freely.
create unique index if not exists facts_company_factkey_uk
  on public.facts (company_id, fact_key);

create index if not exists facts_company_publication_idx
  on public.facts (company_id, publication_id);

comment on column public.facts.fact_key is
  'Stable digest of the fact''s identity. Unique per company; the upsert target.';
comment on column public.facts.measure is
  'What this fact MEASURES (kind|subject|value-shape). Two facts sharing a measure describe the same quantity at different times.';

-- The claim table. Two dispatcher workers racing the same event would each run
-- their own extraction, and two LLM runs do not produce byte-identical facts --
-- so a unique key on the rows alone cannot prevent duplicates. Claiming the
-- PUBLICATION first does: the loser's insert conflicts and it returns without
-- extracting anything.
create table if not exists public.mineiq_ingestions (
  publication_id uuid primary key references public.publications(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  ingested_at    timestamptz not null default now(),
  facts_written  integer not null default 0
);

alter table public.mineiq_ingestions enable row level security;

drop policy if exists mineiq_ing_select on public.mineiq_ingestions;
create policy mineiq_ing_select on public.mineiq_ingestions
  for select using (public.can_touch_company(company_id));

-- LEAST PRIVILEGE, EXPLICITLY. Supabase grants anon and authenticated all seven
-- privileges on every newly created table. 0014 left that default in place on
-- the messaging tables and it survived two years until 0047's verification
-- caught it (fixed by 0052). Every table this migration creates revokes it in
-- the same breath, so the defect cannot be reintroduced.
revoke all on public.mineiq_ingestions from anon, authenticated;
grant select on public.mineiq_ingestions to authenticated;

-- ---------------------------------------------------------------------------
-- 2) SUPERSESSION
-- ---------------------------------------------------------------------------
-- `superseded_by` already exists (0005). What was missing is a way to find the
-- fact being superseded. `measure` supplies it: a share count and a later share
-- count share a measure; two drill holes do not.
--
-- Only CURRENT facts are ever chained. A drill result is a historical event and
-- is never superseded by a later one -- both remain true.
create index if not exists facts_current_measure_idx
  on public.facts (company_id, measure)
  where measure is not null and superseded_by is null;

-- ---------------------------------------------------------------------------
-- 3) RETRIEVAL
-- ---------------------------------------------------------------------------
-- Postgres full-text, not embeddings: no external call, no per-query cost, and
-- it degrades honestly (a miss returns nothing rather than something wrong).
-- 'english' is passed explicitly so the expression is IMMUTABLE and the column
-- can be GENERATED ... STORED.
alter table public.facts
  add column if not exists fts tsvector
  generated always as (
    to_tsvector('english',
      coalesce(subject, '') || ' ' || coalesce(quote, '') || ' ' || coalesce(data::text, ''))
  ) stored;

-- documents and updates do NOT get a stored column.
--
-- `GENERATED ... STORED` rewrites the entire table and holds ACCESS EXCLUSIVE
-- for the duration -- every read and write blocks. On `facts` that is free
-- because the table is empty. On `documents` and `updates`, which carry live
-- data and are written during ingestion, it is an outage.
--
-- They use EXPRESSION indexes instead, created CONCURRENTLY in 0050b. Same
-- query plan, no rewrite, no exclusive lock.
--
-- mineiq_search() below must use the IDENTICAL expression, or the planner will
-- ignore the index and sequentially scan every document on every question.

-- Safe here: facts is empty, so this is instant.
create index if not exists facts_fts_idx on public.facts using gin (fts);

-- The ONE retrieval path for MineIQ. SECURITY DEFINER so it can read across the
-- three tables consistently, but gated on owns_company() FIRST: a caller who
-- does not belong to the company gets an exception, not rows. company_id is a
-- parameter that is checked, never a filter that could be forgotten.
create or replace function public.mineiq_search(
  p_company uuid,
  p_query   text,
  p_limit   integer default 12
)
returns table (
  source      text,        -- 'fact' | 'document' | 'release'
  id          uuid,
  label       text,
  body        text,
  occurred_on date,
  rank        real
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q tsquery; lim integer;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  lim := greatest(least(coalesce(p_limit, 12), 50), 1);

  -- websearch_to_tsquery accepts what a person actually types ("las coloradas
  -- drilling") without throwing on punctuation, unlike to_tsquery.
  q := websearch_to_tsquery('english', coalesce(p_query, ''));
  if q is null or q = ''::tsquery then
    return;
  end if;

  return query
  (
    select 'fact'::text, f.id,
           coalesce(f.subject, f.kind),
           coalesce(f.quote, f.data::text),
           (f.data ->> 'disclosed_on')::date,
           ts_rank(f.fts, q)
      from public.facts f
     where f.company_id = p_company
       and f.superseded_by is null          -- current knowledge wins
       and f.fts @@ q
     order by ts_rank(f.fts, q) desc
     limit lim
  )
  union all
  (
    select 'release'::text, u.id,
           coalesce(u.detected ->> 'headline', 'Press release'),
           left(coalesce(u.body, ''), 4000),
           u.published_on,
           ts_rank(to_tsvector('english', coalesce(u.detected ->> 'headline', '') || ' ' || coalesce(u.body, '')), q)
      from public.updates u
     where u.company_id = p_company
       and u.status = 'published'
       and to_tsvector('english', coalesce(u.detected ->> 'headline', '') || ' ' || coalesce(u.body, '')) @@ q
     order by ts_rank(to_tsvector('english', coalesce(u.detected ->> 'headline', '') || ' ' || coalesce(u.body, '')), q) desc
     limit lim
  )
  union all
  (
    select 'document'::text, d.id,
           coalesce(d.title, d.filename, 'Document'),
           left(coalesce(d.extracted_text, ''), 6000),
           d.doc_date,
           ts_rank(to_tsvector('english', coalesce(d.filename, '') || ' ' || coalesce(d.title, '') || ' ' || coalesce(d.extracted_text, '')), q)
      from public.documents d
     where d.company_id = p_company
       and to_tsvector('english', coalesce(d.filename, '') || ' ' || coalesce(d.title, '') || ' ' || coalesce(d.extracted_text, '')) @@ q
     order by ts_rank(to_tsvector('english', coalesce(d.filename, '') || ' ' || coalesce(d.title, '') || ' ' || coalesce(d.extracted_text, '')), q) desc
     limit lim
  );
end $$;

revoke execute on function public.mineiq_search(uuid, text, integer) from public, anon;
grant  execute on function public.mineiq_search(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) DEVICE PUSH FOR PUBLICATIONS
-- ---------------------------------------------------------------------------
-- The outbox and the APNs sender already exist (0025, api/news-push-send.js),
-- but the outbox was built for the NEWS pipeline: news_item_id is NOT NULL, so
-- a company publication could not be queued at all.
--
-- The sender selects only (id, token, title, body, data) and never joins
-- news_items, so widening the table lets company publications reuse the exact
-- same delivery path with no change to the sender.
alter table public.notification_outbox
  alter column news_item_id drop not null;

alter table public.notification_outbox
  add column if not exists post_id uuid references public.posts(id) on delete cascade;

-- A row belongs to exactly one source. Existing rows all carry news_item_id and
-- a null post_id, so this validates without a backfill.
alter table public.notification_outbox
  drop constraint if exists notification_outbox_one_source;
alter table public.notification_outbox
  add constraint notification_outbox_one_source
  check ((news_item_id is not null) <> (post_id is not null));

-- DUPLICATE PUSH PROTECTION. One device, one post, one notification -- for ever.
-- Replaying PUBLICATION_PUBLISHED conflicts here and writes nothing, so a
-- retried or re-delivered event cannot buzz a phone twice.
-- Also NOT partial, for the same ON CONFLICT reason. News rows carry a null
-- post_id and so never conflict with each other here.
create unique index if not exists notification_outbox_post_token_uk
  on public.notification_outbox (post_id, user_id, token);

create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (status, created_at) where status = 'pending';

commit;

-- ==================== 0051_release_revisions_and_timeline.sql ====================
-- ============================================================================
-- 0051_release_revisions_and_timeline.sql
--
--   A. FIX: Phase B's listeners were never subscribed, so they got no events.
--   B. PUBLICATION_REVISED — the explicit event for a disclosure correction.
--   C. release_revisions — append-only history of the published full release.
--   D. profile.timeline — publishing finally reaches the Pro Profile.
--   E. MineIQ — facts traceable to the exact revision, reconcilable.
--
-- The immutable source-integrity records (source_transcripts, inventories,
-- verification_runs, canonical_*) are NOT touched by this migration and are not
-- touched by any revision: a revision records what MineEx PUBLISHED, never what
-- the company originally uploaded.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A. LISTENER SUBSCRIPTIONS — a real bug, fixed
-- ---------------------------------------------------------------------------
-- event_deliveries rows are created by JOINing listener_subscriptions (0008).
-- mineiq_facts_v1 and device_push_v1 were added to the JS registry in Phase B
-- but never inserted here, so the join matched nothing and they would have sat
-- idle for ever while appearing healthy in the dispatcher's output.
insert into public.listener_subscriptions (listener, event_type) values
  ('mineiq_facts_v1',     'PUBLICATION_PUBLISHED'),
  ('profile_timeline_v1', 'PUBLICATION_PUBLISHED')
on conflict (listener, event_type) do nothing;

-- device_push_v1 IS DELIBERATELY ABSENT.
--
-- Subscribing it here would mean that applying a SCHEMA MIGRATION starts sending
-- real notifications to real investors' phones. Those are different decisions and
-- must be different actions, so the subscription lives in its own migration
-- (0055_enable_device_push.sql) which is applied only when push is deliberately
-- turned on. Until then the listener exists, is tested, and receives no events.

-- ---------------------------------------------------------------------------
-- B. PUBLICATION_REVISED
-- ---------------------------------------------------------------------------
alter table public.events drop constraint if exists events_type_chk;
alter table public.events add constraint events_type_chk
  check (event_type in ('PUBLICATION_PUBLISHED','PUBLICATION_UNPUBLISHED','PUBLICATION_REVISED'));

-- Only the three listeners that CORRECT things subscribe. The notification
-- listeners are deliberately absent: a correction cannot notify anyone because
-- it is never delivered to them -- not because a dedupe key happened to catch
-- it. Safety by construction rather than by coincidence.
insert into public.listener_subscriptions (listener, event_type) values
  ('feed_projection_v1',  'PUBLICATION_REVISED'),
  ('profile_timeline_v1', 'PUBLICATION_REVISED'),
  ('mineiq_facts_v1',     'PUBLICATION_REVISED')
on conflict (listener, event_type) do nothing;

-- ---------------------------------------------------------------------------
-- C. RELEASE REVISIONS
-- ---------------------------------------------------------------------------
create table if not exists public.release_revisions (
  id                   uuid primary key default gen_random_uuid(),
  publication_id       uuid not null references public.publications(id) on delete cascade,
  company_id           uuid not null references public.companies(id) on delete cascade,
  revision             integer not null check (revision >= 1),
  previous_revision_id uuid references public.release_revisions(id) on delete restrict,
  headline             text,
  body                 text not null,
  reason               text,
  edited_by            uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  unique (publication_id, revision)
);

create index if not exists release_revisions_pub_idx
  on public.release_revisions (publication_id, revision desc);

-- APPEND-ONLY. The same guarantee the Phase 3 evidence tables carry: a published
-- disclosure is a historical fact about what investors were shown, so it can be
-- superseded by a later revision but never rewritten or deleted.
create or replace function public.release_revisions_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'release_revisions is append-only; revision % of publication % cannot be %',
    coalesce(old.revision::text, '?'), coalesce(old.publication_id::text, '?'),
    case when tg_op = 'DELETE' then 'deleted' else 'modified' end
    using errcode = '42501',
          hint = 'Correcting a release appends a new revision. Restoring one appends a copy.';
end $$;

drop trigger if exists trg_release_revisions_append_only on public.release_revisions;
create trigger trg_release_revisions_append_only
  before update or delete on public.release_revisions
  for each row execute function public.release_revisions_append_only();

alter table public.release_revisions enable row level security;

drop policy if exists release_revisions_read on public.release_revisions;
create policy release_revisions_read on public.release_revisions
  for select using (public.can_touch_company(company_id));

-- No INSERT policy: revisions are written only by revise_publication(), which is
-- SECURITY DEFINER and does its own authorization. A company cannot forge one.
-- LEAST PRIVILEGE, EXPLICITLY. This previously revoked only the write verbs,
-- which left anon holding SELECT, TRUNCATE, TRIGGER and REFERENCES from
-- Supabase's default grant -- the same gap 0052 had to clean up on the
-- messaging tables. Revoke everything, then grant back only the read.
revoke all on public.release_revisions from anon, authenticated;
grant select on public.release_revisions to authenticated;

-- Which revision is live.
alter table public.publications
  add column if not exists current_revision_id uuid references public.release_revisions(id) on delete set null;

-- ---------------------------------------------------------------------------
-- D. PROFILE TIMELINE — atomic entry upsert
-- ---------------------------------------------------------------------------
-- companies.profile is one jsonb blob. A listener doing read-modify-write would
-- race a company editing their profile in the portal and silently discard their
-- edit. This does the whole merge in ONE statement, so there is no window.
--
-- Matching is by `key`; an existing entry is REPLACED IN PLACE and the array is
-- re-sorted by date. A revision therefore updates its entry and never adds a
-- second one or moves its position.
create or replace function public.upsert_timeline_entry(p_company uuid, p_entry jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_key text; v_result jsonb;
begin
  v_key := p_entry ->> 'key';
  if v_key is null or v_key = '' then
    raise exception 'timeline entry needs a key' using errcode = '22023';
  end if;

  update public.companies c
     set profile = jsonb_set(
           coalesce(c.profile, '{}'::jsonb),
           '{timeline}',
           (
             select coalesce(jsonb_agg(e order by (e ->> 'date') desc nulls last), '[]'::jsonb)
               from (
                 -- everything except this key, plus this key's new value
                 select e from jsonb_array_elements(
                          coalesce(c.profile -> 'timeline', '[]'::jsonb)) e
                  where e ->> 'key' is distinct from v_key
                 union all
                 select p_entry
               ) merged(e)
           ),
           true
         )
   where c.id = p_company
   returning jsonb_build_object(
     'ok', true,
     'entries', jsonb_array_length(coalesce(profile -> 'timeline', '[]'::jsonb))
   ) into v_result;

  if v_result is null then
    raise exception 'company not found' using errcode = '22023';
  end if;
  return v_result;
end $$;

-- Called only by the dispatcher (service role). Not exposed to the browser: a
-- company edits its timeline through the profile editor, not through this.
revoke execute on function public.upsert_timeline_entry(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- E. MINEIQ — revision-level provenance
-- ---------------------------------------------------------------------------
alter table public.facts
  add column if not exists revision_id uuid references public.release_revisions(id) on delete set null;

-- Publication-independent digest of (kind, subject, data). Used ONLY to diff one
-- revision against the next: fact_key includes the publication, so it cannot
-- tell whether a claim survived a correction. This can.
alter table public.facts
  add column if not exists content_key text;

create index if not exists facts_company_contentkey_idx
  on public.facts (company_id, content_key);

-- One ingestion per REVISION, not per publication, so a corrected release is
-- reconciled exactly once.
alter table public.mineiq_ingestions
  add column if not exists revision integer not null default 1;

alter table public.mineiq_ingestions drop constraint if exists mineiq_ingestions_pkey;
alter table public.mineiq_ingestions
  add constraint mineiq_ingestions_pkey primary key (publication_id, revision);

-- ---------------------------------------------------------------------------
-- F. revise_publication() — append a revision and emit the event, atomically
-- ---------------------------------------------------------------------------
create or replace function public.revise_publication(
  p_publication_id uuid,
  p_headline       text,
  p_body           text,
  p_reason         text,
  p_actor          uuid
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.publications;
  v_prev public.release_revisions;
  v_next integer;
  v_rev public.release_revisions;
  v_key text;
begin
  select * into v from public.publications where id = p_publication_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if not public.actor_can_publish(v.company_id, p_actor) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v.status <> 'published' then
    return jsonb_build_object('ok', false, 'error', 'not_published', 'status', v.status);
  end if;
  if coalesce(btrim(p_body), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'empty_body');
  end if;

  select * into v_prev from public.release_revisions
   where publication_id = v.id order by revision desc limit 1;

  -- Nothing changed → no revision. Editing and saving an unchanged release must
  -- not manufacture a correction.
  if v_prev.id is not null
     and coalesce(v_prev.body, '') = coalesce(p_body, '')
     and coalesce(v_prev.headline, '') = coalesce(p_headline, '') then
    return jsonb_build_object('ok', true, 'unchanged', true,
                              'revision', v_prev.revision, 'revision_id', v_prev.id);
  end if;

  v_next := coalesce(v_prev.revision, 0) + 1;

  insert into public.release_revisions
    (publication_id, company_id, revision, previous_revision_id, headline, body, reason, edited_by)
  values (v.id, v.company_id, v_next, v_prev.id, p_headline, p_body, p_reason, p_actor)
  returning * into v_rev;

  -- The canonical publication now carries the new text, so the portal and the
  -- investor-facing projection stop diverging.
  update public.publications
     set current_revision_id = v_rev.id,
         content = coalesce(content, '{}'::jsonb)
                   || jsonb_build_object('headline', p_headline, 'body', p_body),
         updated_at = now()
   where id = v.id;

  -- Revision 1 is the original publication, so the FIRST correction is
  -- revision 2 and is the first thing that emits this event.
  if v_next > 1 then
    v_key := 'revise:' || v.id::text || ':' || v_next::text;
    insert into public.events
      (event_type, event_version, publication_id, company_id, actor_user_id, payload, idempotency_key)
    values ('PUBLICATION_REVISED', 1, v.id, v.company_id, p_actor,
            jsonb_build_object('publication_id', v.id, 'company_id', v.company_id,
                               'revision', v_next, 'revision_id', v_rev.id), v_key)
    on conflict (idempotency_key) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'revision', v_next, 'revision_id', v_rev.id,
                            'publication_id', v.id);
end $$;

-- NOT callable by the browser. `p_actor` is a parameter, so a client that could
-- call this could name any actor and borrow their publishing rights. It is
-- invoked exactly like publish_publication(): from a trusted server endpoint,
-- as the service role, passing the actor the endpoint has VERIFIED from the
-- bearer token. Same rule as the rest of the publish spine.
revoke execute on function public.revise_publication(uuid, text, text, text, uuid)
  from public, anon, authenticated;

commit;

-- ==================== 0052_messaging_privilege_hardening.sql ====================
-- ============================================================================
-- 0052_messaging_privilege_hardening.sql — remedial, narrow.
--
-- THE FINDING
-- -----------
-- Post-deploy verification of 0047 showed `anon` and `authenticated` holding
-- ALL SEVEN privileges on public.conversations and public.messages:
--
--   DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- This is Supabase's default grant on newly created tables. Migration 0014
-- created both tables and never revoked it, so it has been the case since
-- messaging shipped. 0047 did not cause it; 0047's verification found it.
--
-- This is the SAME defect 0045 corrected for the Phase 3 evidence tables.
--
-- HOW EXPOSED IT ACTUALLY WAS
-- ---------------------------
-- Limited, and worth stating precisely rather than dramatically. RLS is enabled
-- on both tables and no UPDATE or DELETE policy exists, so with RLS on those
-- commands were denied for every role regardless of grant. `anon` carries no
-- auth.uid() and therefore matched no SELECT policy either. Through PostgREST --
-- the only surface the anon key reaches -- nothing was readable or writable.
--
-- The exception is TRUNCATE, which this codebase established during Phase 3 is
-- restricted by NEITHER RLS nor row-level triggers. TRUNCATE is not exposed by
-- PostgREST, so it was not reachable in practice; it is nonetheless a privilege
-- neither role should ever have held.
--
-- WHAT STILL HAS TO WORK AFTERWARDS (checked against the code before writing)
-- --------------------------------------------------------------------------
--   investor app  reads conversations + messages as `authenticated`   -> SELECT kept
--   investor send POST /api/messages, service role                    -> unaffected
--   CEO reply     Postmark webhook, service role                      -> unaffected
--   portal inbox  reads both as `authenticated`                       -> SELECT kept
--   portal reply  inserts into messages as `authenticated`            -> INSERT kept
--   mark read     mark_conversation_read(), SECURITY DEFINER          -> needs no UPDATE grant
--
-- Nothing in src/ or api/ issues an UPDATE or DELETE against either table, so
-- revoking those breaks no current path.
--
-- service_role is deliberately untouched: the messaging bridge depends on it.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- anon: none
-- The anon key ships in the browser bundle. It has no business holding any
-- privilege on private correspondence.
revoke all on public.conversations from anon;
revoke all on public.messages      from anon;

-- ------------------------------------------- authenticated: least privilege
-- Named verbs rather than ALL, then re-grant, so the intent is legible and a
-- future reader can see exactly what each role is meant to do.
revoke insert, update, delete, truncate, trigger, references
  on public.conversations from authenticated;
revoke update, delete, truncate, trigger, references
  on public.messages from authenticated;

-- A company and an investor both READ their own conversations (RLS decides
-- which). Neither may create or alter one -- conversations are upserted by the
-- server when an investor first writes.
grant select on public.conversations to authenticated;

-- Reading a thread, and the company posting a reply (0047's msg_insert_company
-- pins sender='company'; the investor's own sends go through /api/messages).
grant select, insert on public.messages to authenticated;

commit;

-- ==================== 0053_phase3_0041_privilege_hardening.sql ====================
-- ============================================================================
-- 0053_phase3_0041_privilege_hardening.sql — finish what 0045 started.
--
-- THE GAP
-- -------
-- 0045 hardened the Phase 3 evidence tables, but only the ones 0042 created:
--
--     source_inventories, source_inventory_parts,
--     source_inventory_blocks, source_inventory_notes
--
-- 0041's two tables were never covered:
--
--     source_transcripts, extraction_attempts
--
-- A grant sweep found both still carrying Supabase's default: anon and
-- authenticated holding all seven privileges, including DELETE and TRUNCATE.
--
-- WHY IT MATTERS HERE PARTICULARLY
-- --------------------------------
-- These are evidence tables. The whole point of Phase 3 was that a stored
-- transcript is proof of what a document said, which means it must not be
-- alterable after the fact. The append-only triggers refuse UPDATE and DELETE
-- -- but TRUNCATE is restricted by NEITHER RLS NOR ROW-LEVEL TRIGGERS, which is
-- the exact finding that made 0043 add statement-level TRUNCATE guards to the
-- inventory tables. Those guards were never added here, and neither was the
-- revoke. anon has held TRUNCATE on the transcript chain since 0041 shipped.
--
-- Not reachable through PostgREST, which does not expose TRUNCATE. Wrong
-- regardless, and the cheapest possible thing to close.
--
-- WHAT MUST KEEP WORKING (checked against the code before writing)
-- ---------------------------------------------------------------
-- Unlike the inventory tables, which are written server-side, these two are
-- written FROM THE BROWSER by the signed-in user -- src/lib/sourceTranscript.js
-- POSTs to both and SELECTs from both (Phase 2 persists the transcript with the
-- user's own JWT so RLS can attribute it). So `authenticated` keeps SELECT and
-- INSERT. Only the destructive verbs go.
--
--   storeTranscript()        POST   source_transcripts     -> INSERT kept
--   transcriptsForDocument() SELECT source_transcripts     -> SELECT kept
--   recordExtractionAttempt()POST   extraction_attempts    -> INSERT kept
--   attemptsForDocument()    SELECT extraction_attempts    -> SELECT kept
--
-- Nothing in src/ or api/ issues an UPDATE or DELETE against either table.
-- service_role is untouched.
-- ============================================================================

begin;

do $$
declare t text;
begin
  foreach t in array array['source_transcripts', 'extraction_attempts']
  loop
    -- The public gets nothing. These are a company's private source evidence;
    -- no logged-out surface reads them.
    execute format('revoke all on public.%I from anon', t);

    -- Signed-in users may add evidence and read it back. They may never alter
    -- or remove it -- that is what makes it evidence. The append-only triggers
    -- already refuse UPDATE and DELETE; this removes the privilege as well, so
    -- the guarantee does not rest on the trigger alone.
    execute format(
      'revoke update, delete, truncate, trigger, references on public.%I from authenticated', t);
    execute format('grant select, insert on public.%I to authenticated', t);
  end loop;
end $$;

commit;

-- ==================== 0054_phase3_0041_immutability.sql ====================
-- ============================================================================
-- 0054_phase3_0041_immutability.sql — complete the evidence guarantee on 0041.
--
-- 0053 closed the GRANT gap on source_transcripts and extraction_attempts.
-- This closes the TRIGGER gap, which is the half that does not depend on the
-- grants being right.
--
-- WHAT WAS MISSING
-- ----------------
-- 0041 shipped before the conventions 0042/0043 established, so:
--
--   source_transcripts   has `before update` only -- a row could be DELETED
--   extraction_attempts  has no trigger at all
--   neither              has a statement-level TRUNCATE guard
--
-- TRUNCATE matters specifically because it is restricted by NEITHER RLS NOR
-- row-level triggers. That finding is why 0043 added phase3_no_truncate() to
-- the inventory tables. 0041's pair never got it.
--
-- WHY extraction_attempts NEEDS THIS
-- ----------------------------------
-- Its own comment states the purpose: "Every extraction attempt for a document,
-- successful or not, so a later failure can never be mistaken for 'there was
-- never any text'." A record that can be deleted cannot do that job. The
-- absence of a trigger was an oversight, not a decision -- every other table in
-- the evidence chain has one.
--
-- NOTHING LEGITIMATE BREAKS: no code path updates or deletes either table.
-- Inserts and reads are untouched.
-- ============================================================================

begin;

-- Shared guard. Mirrors 0042's wording: it does not assume an `id` column, so
-- it is safe on any evidence table.
create or replace function public.phase3_0041_append_only()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only; row % cannot be %',
    tg_table_name,
    coalesce(to_jsonb(old) ->> 'id', left(to_jsonb(old)::text, 120)),
    case when tg_op = 'DELETE' then 'deleted' else 'modified' end
    using errcode = '42501',
          hint = 'This is source evidence. Insert a new row; never rewrite the old one.';
end $$;

-- source_transcripts: widen UPDATE-only to UPDATE OR DELETE.
-- The original trigger and its function are replaced, not left alongside, so
-- there is exactly one guard to reason about.
drop trigger if exists source_transcripts_immutable on public.source_transcripts;
create trigger source_transcripts_immutable
  before update or delete on public.source_transcripts
  for each row execute function public.phase3_0041_append_only();

-- extraction_attempts: its first guard.
drop trigger if exists extraction_attempts_immutable on public.extraction_attempts;
create trigger extraction_attempts_immutable
  before update or delete on public.extraction_attempts
  for each row execute function public.phase3_0041_append_only();

-- TRUNCATE is restricted by neither RLS nor row triggers, so it needs a
-- STATEMENT-level trigger. phase3_no_truncate() already exists (0043/0045);
-- this only attaches it to the two tables that never had it.
drop trigger if exists source_transcripts_no_truncate on public.source_transcripts;
create trigger source_transcripts_no_truncate
  before truncate on public.source_transcripts
  for each statement execute function public.phase3_no_truncate();

drop trigger if exists extraction_attempts_no_truncate on public.extraction_attempts;
create trigger extraction_attempts_no_truncate
  before truncate on public.extraction_attempts
  for each statement execute function public.phase3_no_truncate();

commit;

-- ==================== 0056_function_execute_hardening.sql ====================
-- ============================================================================
-- 0056_function_execute_hardening.sql — remedial, narrow.
--
-- THE FINDING
-- -----------
-- 0050a's verification showed `anon` holding EXECUTE on mineiq_search() despite
-- the migration saying:
--
--     revoke execute on function public.mineiq_search(...) from public;
--
-- That revokes the implicit PUBLIC grant Postgres puts on every new function.
-- It does NOT remove Supabase's DEFAULT PRIVILEGES, which separately grant
-- EXECUTE on new functions to `anon` and `authenticated`. Two different grants;
-- revoking one leaves the other.
--
-- This is the function-level twin of the table-level defect 0052 and 0053
-- fixed, and I repeated it in every migration I wrote: 9 of 12 functions.
--
-- HOW EXPOSED
-- -----------
-- Not exploitable, and worth stating precisely. Every one of these is SECURITY
-- DEFINER and gates on owns_company()/can_touch_company(), which resolve through
-- auth.uid(). The anon role carries no auth.uid(), so each raises 42501 before
-- touching data. The grant was useless to an attacker -- and should still never
-- have been there, because the gate inside the function is then the ONLY thing
-- standing between the public key and company data.
--
-- APPLIED FUNCTIONS ONLY. 0048, 0049 and 0051 are not yet applied and have been
-- corrected at source, so they will never carry the defect.
-- ============================================================================

begin;

do $$
declare sig text;
begin
  foreach sig in array array[
    -- 0047 — messaging
    'public.owns_company_slug(text)',
    'public.mark_conversation_read(uuid)',
    'public.company_conversation_senders(text)',
    -- 0050a — MineIQ retrieval
    'public.mineiq_search(uuid, text, integer)'
  ]
  loop
    execute format('revoke execute on function %s from anon', sig);
    -- public is revoked again for idempotence: re-running this must converge on
    -- the same state whatever order anything else ran in.
    execute format('revoke execute on function %s from public', sig);
  end loop;
end $$;

-- NOT REVOKED FROM `authenticated`: owns_company_slug(text).
--
-- I nearly did, reasoning that it is only a helper. That would have broken
-- Messages in production. RLS policy expressions are evaluated as the QUERYING
-- role, not as the policy or table owner, so a role needs EXECUTE on every
-- function a policy calls. 0047's conv_select_company and msg_select_company
-- both call owns_company_slug(), so revoking it from authenticated would make
-- every company's inbox return nothing -- silently, since an RLS denial looks
-- exactly like having no messages.
--
-- Keeping the grant costs nothing: the function is SECURITY DEFINER and answers
-- only "may this caller touch this company", which they could determine anyway.

commit;

-- ==================== 0057_submission_throttle.sql ====================
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

-- ==================== 0058_close_public_insert.sql ====================
-- 0058_close_public_insert.sql
--
-- ███ DO NOT APPLY THIS UNTIL /api/submit IS DEPLOYED TO PRODUCTION. ███
--
-- This migration removes `anon`'s ability to INSERT into the three public
-- submission tables. Until api/submit.js is live AND the three client call sites
-- have been repointed at it, applying this BREAKS the contact page, the demo
-- form and listing reports -- silently, with a 401 the forms do not expect.
--
-- Correct order:
--   1. apply 0057                        (additive, safe any time)
--   2. deploy api/submit.js + the client changes
--   3. verify all three forms submit successfully in production
--   4. THEN apply this migration
--   5. re-verify all three forms
--
-- WHAT WAS WRONG
-- --------------
-- Each of these tables had an INSERT policy of `with check (true)` for `anon`.
-- The anon key ships in the client bundle, so anyone who loaded mineex.ca could
-- insert unlimited rows of arbitrary content into three production tables. RLS
-- was enabled and the SELECT side was correctly closed -- the reads were never
-- exposed -- but the write side had no bound at all: no size limit, no rate
-- limit, no validation, no spam gate.
--
-- WHAT REPLACES IT
-- ----------------
-- api/submit.js, writing with the service role after validating, throttling
-- (0057) and screening. Removing the policy is the second half of that change;
-- without it the old unbounded door stays open next to the new one.

begin;

-- ---- contact_submissions ---------------------------------------------------
drop policy if exists anon_insert_contact on public.contact_submissions;
revoke insert on public.contact_submissions from anon;

-- ---- demo_bookings ---------------------------------------------------------
drop policy if exists anon_insert_demo on public.demo_bookings;
revoke insert on public.demo_bookings from anon;

-- ---- listing_reports -------------------------------------------------------
-- This one's policy named `authenticated` as well as `anon`. A signed-in investor
-- reporting a bad listing is a legitimate flow, so only `anon` is dropped and the
-- policy is recreated for `authenticated` alone, preserving it.
drop policy if exists listing_reports_insert on public.listing_reports;
create policy listing_reports_insert on public.listing_reports
  for insert to authenticated with check (true);
revoke insert on public.listing_reports from anon;

-- ---- the over-grant on these three, while we are here ----------------------
-- Supabase's default privileges had handed `anon` all seven verbs on
-- contact_submissions and demo_bookings. RLS made the other six inert, but an
-- inert grant is still a grant, and the next policy mistake is what makes it
-- live. listing_reports only ever had INSERT.
revoke all on public.contact_submissions from anon;
revoke all on public.demo_bookings       from anon;
revoke all on public.listing_reports     from anon;

commit;

-- ---------------------------------------------------------------- verify ----
-- Expect three rows, every anon_privileges = (none):
--
--   select c.relname,
--          coalesce(string_agg(distinct g.privilege_type, ', '
--                   order by g.privilege_type), '(none)') as anon_privileges,
--          (select count(*) from pg_policies p
--            where p.schemaname='public' and p.tablename=c.relname
--              and 'anon' = any (p.roles::text[])) as anon_policies
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--     left join information_schema.role_table_grants g
--       on g.table_schema='public' and g.table_name=c.relname and g.grantee='anon'
--    where n.nspname='public'
--      and c.relname in ('contact_submissions','demo_bookings','listing_reports')
--    group by c.relname order by c.relname;
--
-- ---------------------------------------------------------------- rollback --
-- If a form breaks and the cause is not immediately clear, restore the previous
-- behaviour exactly:
--
--   begin;
--   grant insert on public.contact_submissions to anon;
--   grant insert on public.demo_bookings       to anon;
--   grant insert on public.listing_reports     to anon;
--   create policy anon_insert_contact on public.contact_submissions
--     for insert to anon with check (true);
--   create policy anon_insert_demo on public.demo_bookings
--     for insert to anon with check (true);
--   drop policy if exists listing_reports_insert on public.listing_reports;
--   create policy listing_reports_insert on public.listing_reports
--     for insert to anon, authenticated with check (true);
--   commit;
--
-- That reopens a known hole, so treat it as a stopgap while the endpoint is
-- fixed, not as a resting state.

-- ==================== 0059_auth_user_trigger.sql ====================
-- 0059_auth_user_trigger.sql — capture the trigger that creates profiles rows.
--
-- WHY THIS IS A SEPARATE MIGRATION
-- --------------------------------
-- `on_auth_user_created` fires public.handle_new_user() after every insert into
-- auth.users. It exists in production and in NO migration. It could not be
-- captured in 0000_baseline.sql because handle_new_user() is defined by 0004 and
-- redefined by 0023 -- a trigger created at 0000 would reference a function that
-- does not exist yet.
--
-- So it goes here, after 0023. (Not 0024 -- that number is taken by
-- news_automation; the set is applied in filename order and any number after
-- 0023 is correct.)
--
-- WHY IT MATTERS
-- --------------
-- It sits on auth.users, OUTSIDE the public schema, so no public-schema audit
-- returns it -- which is why it went unnoticed through every previous privilege
-- and policy review.
--
-- Without it, a fresh project creates auth users with NO profiles row. Then:
--   • is_admin()        -> false for everyone, forever
--   • owns_company()    -> false (no profile, and nothing links user to company)
--   • every portal page -> empty
-- and the tenant-isolation suite's positive controls fail for a reason that has
-- nothing to do with isolation, which is the most expensive kind of red test.
--
-- PRODUCTION: a no-op. The trigger already exists; this is drop-and-recreate
-- with the live definition, recorded for provenance.

begin;

-- Live definition, from pg_get_triggerdef:
--   CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION handle_new_user()
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;

-- ──────────────────────────────────────────────────────────── verification ──
--   select tgname, pg_get_triggerdef(oid) from pg_trigger
--    where tgname = 'on_auth_user_created';
--
-- And end-to-end, on STAGING only -- create a user through the Auth panel and
-- confirm a profiles row appears with role='investor':
--   select id, email, role from public.profiles order by created_at desc limit 1;

-- ==================== 0060_publish_actor_hardening.sql ====================
-- 0060_publish_actor_hardening.sql
-- Close a forgeable-actor hole on publish_publication().
--
-- THE DEFECT
-- ----------
-- publish_publication(p_publication_id, p_actor, p_published_at) is SECURITY
-- DEFINER and authorises with:
--
--     if not public.actor_can_publish(v.company_id, p_actor) then ... forbidden
--
-- and actor_can_publish(p_company, p_actor) checks only whether **p_actor** has
-- rights. It never ties p_actor to auth.uid(). The caller names the actor.
--
-- No migration ever revoked EXECUTE, so the function carries Supabase's default
-- privileges. Live ACL:
--     =X/postgres | postgres=X | anon=X | authenticated=X | service_role=X
--
-- So `POST /rest/v1/rpc/publish_publication` with the bundled anon key, passing
-- someone else's user id as p_actor, passes the check -- and the PUBLICATION_
-- PUBLISHED event it writes records actor_user_id as the impersonated user.
--
-- This is the SAME defect class already fixed on revise_publication(), which is
-- correctly restricted to postgres and service_role today. publish_publication
-- did not get the same treatment.
--
-- HOW EXPLOITABLE, PRECISELY
-- --------------------------
-- Stated carefully, because overstating it is as unhelpful as missing it.
--
-- An attacker needs a publication UUID and an authorised actor's UUID.
--   • The actor is easy: `companies` is anon-readable where status='published'
--     with no column restriction, so owner_id is public for every live company.
--   • The publication UUID is the gate. `publications` SELECT is TO authenticated
--     with can_touch_company(), so neither anon nor another company can read
--     draft ids, and UUIDs are gen_random_uuid() -- not guessable.
--   • `posts` IS anon-readable and carries publication_id, but a post exists only
--     once a release is published, and re-publishing a published release returns
--     `already: true` and changes nothing.
--
-- The real window: on PUBLICATION_UNPUBLISHED the feed listener PATCHes
-- posts.removed_at (api/_listeners.js:31), and the post policy requires
-- `removed_at IS NULL`. The dispatcher is asynchronous, so between the unpublish
-- and the listener draining, the publication is 'draft' while its id is still
-- anon-readable. In that window anon can re-publish it, attributed to the real
-- owner.
--
-- So: NOT a confirmed cross-tenant data leak -- no draft content becomes
-- readable. It is an integrity and attribution defect with a narrow race, and a
-- missing authorisation tie that should never have been reachable from a
-- browser. Fixed by restriction, not by rewriting the predicate.
--
-- WHY THIS IS SAFE TO APPLY
-- -------------------------
-- api/publish.js:96 already calls the RPC as the service role with a VERIFIED
-- actor: `p_actor: user.id`, where user comes from verifyUser(bearer(req)). No
-- browser code calls the RPC -- src/lib/releaseRevisions.js:17 notes it cannot.
-- Revoking browser EXECUTE is a drop-in with zero application change.
--
-- NOT IN SCOPE HERE
-- -----------------
-- Several other SECURITY DEFINER functions also carry anon EXECUTE by default
-- (company_go_live, record_company_agreement, create_company_invitation,
-- accept_company_invitation). Each one re-checks authority through auth.uid()
-- internally, so anon gets a refusal rather than an action -- they are
-- unnecessary grants, not holes. Per instruction, privilege cleanup is a
-- separate, explicitly reviewed migration. This file fixes the defect only.
--
-- DO NOT revoke owns_company(), can_touch_company() or is_admin() from anon.
-- Policies on conversations, messages, mineiq_ingestions and release_revisions
-- are scoped TO public, and an RLS expression is evaluated as the QUERYING role,
-- so anon needs EXECUTE for those policies to evaluate at all. Revoking turns a
-- clean "no rows" into "permission denied for function" -- the mistake 0056
-- nearly shipped.

begin;

-- PUBLIC FIRST, AND THIS IS THE WHOLE FIX.
--
-- The live ACL is:
--     =X/postgres | postgres=X | anon=X | authenticated=X | service_role=X
--
-- That leading `=X/postgres` is the grant to **PUBLIC** -- an aclitem with an
-- empty grantee. Every role is a member of PUBLIC, so revoking from `anon,
-- authenticated` alone would leave the function callable by anyone, including
-- anon. An earlier draft of this migration did exactly that and would not have
-- closed the hole.
--
-- Compare the two functions that were already hardened:
--     unpublish_publication   postgres=X | service_role=X
--     revise_publication      postgres=X | service_role=X
-- Neither carries an `=X/` entry. That is the end state this migration reaches,
-- and it is the pattern 0047 already used for owns_company_slug.
revoke execute on function
  public.publish_publication(uuid, uuid, timestamptz) from public, anon, authenticated;

-- 0008 defined a two-argument version; 0036 added p_published_at. If the old
-- signature still exists it is independently reachable, with the same ACL.
do $$ begin
  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = 'publish_publication'
      and pg_get_function_identity_arguments(p.oid) = 'p_publication_id uuid, p_actor uuid'
  ) then
    execute 'revoke execute on function public.publish_publication(uuid, uuid) '
            'from public, anon, authenticated';
  end if;
end $$;

commit;

-- ──────────────────────────────────────────────────────────── verification ──
-- Expect acl to list ONLY postgres and service_role (plus the owner):
--
--   select proname, pg_get_function_identity_arguments(oid) as args,
--          coalesce(array_to_string(proacl, ' | '), 'NULL = PUBLIC may execute') as acl
--     from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('publish_publication','unpublish_publication','revise_publication')
--    order by proname;
--
-- unpublish_publication and revise_publication already read
-- `postgres=X/postgres | service_role=X/postgres`. publish_publication should
-- now match them.
--
-- THEN confirm the product still works (STAGING first):
--   1. sign in as a company user, create a draft release, publish it via the
--      portal -- must succeed, because /api/publish uses the service role
--   2. confirm the row: select status, published_at, publish_seq from
--      publications where id = '<id>'
--   3. confirm attribution: select actor_user_id from events
--      where publication_id = '<id>' and event_type = 'PUBLICATION_PUBLISHED'
--
-- ──────────────────────────────────────────────────────────────── rollback ──
--   grant execute on function
--     public.publish_publication(uuid, uuid, timestamptz) to anon, authenticated;
--
-- That restores a known defect. Only use it if publishing breaks in a way that
-- traces to this revoke -- which would mean some caller bypasses /api/publish,
-- and that caller is the actual bug.
