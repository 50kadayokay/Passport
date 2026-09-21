-- 0036_publish_timeline_phase1.sql
-- Publishing system — TIMELINE PHASE 1. Strictly additive; no behaviour changes.
--
-- WHY
-- ---
-- A press release has TWO different dates and the schema only had one:
--
--   published_at = when the company ORIGINALLY issued the release
--   created_at   = when the record entered MineEx
--
-- A release dated 2025-03-04 uploaded in September 2026 belongs in 2025 / Q1 /
-- March 4 on the investor timeline. Today `publish_publication` hardcodes
-- `published_at = now()`, so it would appear as September 2026 news.
--
-- This migration adds the columns and gives the publish RPC an explicit date.
-- It changes nothing on its own: every existing caller omits the new argument
-- and keeps the old now() behaviour exactly.
--
-- NOT in this migration (deliberately): no backfill, no reads changed, no
-- profile.timeline touched. Those are Phases 2 and 3 and are gated on review.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

begin;

-- ============================================================
-- 1) updates — the publication record
-- ============================================================

-- The ORIGINAL publication date, as a DATE and deliberately not a timestamptz.
--
-- A press release is dated "March 4, 2025" — a calendar date, not an instant. Two
-- reasons this matters:
--
--   1. extract(year from timestamptz) is STABLE, not IMMUTABLE, because the answer
--      depends on the session TimeZone. Postgres rejects it in a generated column
--      (42P17: generation expression is not immutable).
--   2. Forcing it with AT TIME ZONE 'UTC' would compile, but would mis-file real
--      releases: a Vancouver company issuing at 18:00 PST on Dec 31 is 07:00 UTC
--      on Jan 1, and would land in the wrong YEAR and QUARTER.
--
-- A date has no zone, so the year and quarter are exactly the ones on the release.
-- posts.published_at stays timestamptz for feed ordering; the publish API converts.
alter table public.updates add column if not exists published_on date;

-- Where the release came from, when the source document or its metadata says so.
alter table public.updates add column if not exists source_url text;

-- Explicit human approval. The CEO is the final approver; record who and when.
alter table public.updates add column if not exists approved_by uuid references auth.users(id);
alter table public.updates add column if not exists approved_at timestamptz;

-- Year and quarter are DERIVED, never hand-entered — a stored value would be a
-- second source of truth that could disagree with published_on. Generated
-- columns make that impossible, and extract() on a date IS immutable. Null
-- published_on → null year/quarter, which is what we want for the 28 legacy
-- entries with unusable dates: not placeable, and never to be guessed.
alter table public.updates
  add column if not exists published_year int
  generated always as (extract(year from published_on)::int) stored;

alter table public.updates
  add column if not exists published_quarter int
  generated always as (extract(quarter from published_on)::int) stored;

-- Chronological reads per company.
create index if not exists updates_published_idx
  on public.updates (company_id, published_on desc nulls last);

-- Provenance lookup for the Phase 2 backfill and the Phase 3 union read. The
-- backfill stamps meta.origin / meta.source_key; Phase 3 suppresses a legacy
-- timeline entry ONLY when it finds the post generated from that exact entry.
-- No fuzzy title matching is involved anywhere in that decision.
create index if not exists updates_origin_idx
  on public.updates ((meta->>'origin'), (meta->>'source_key'));

-- ============================================================
-- 2) publish_publication — accept the original release date
-- ============================================================
--
-- The 2-argument version is DROPPED rather than left alongside a 3-argument
-- one: PostgREST resolves RPCs by argument name, and a 2-arg call that could
-- match either signature is an ambiguous-function error. Dropping and
-- recreating with a defaulted third argument keeps every existing 2-arg caller
-- working unchanged (api/publish.js passes p_publication_id + p_actor).
--
-- Security semantics are IDENTICAL to 0008: same actor_can_publish() gate, same
-- allowed status transitions, same publish_seq, same idempotency key. The only
-- change is which timestamp is written.

drop function if exists public.publish_publication(uuid, uuid);

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

commit;

-- ============================================================
-- VERIFY (read-only — run after applying)
-- ============================================================
-- New columns present, all null, nothing rewritten:
--   select count(*) total,
--          count(published_on) with_published_on,
--          count(published_year) with_year
--     from public.updates;
--
-- Exactly one publish_publication, taking three arguments:
--   select proname, pg_get_function_identity_arguments(oid)
--     from pg_proc where proname = 'publish_publication';
--
-- Existing posts untouched:
--   select count(*) from public.posts;
