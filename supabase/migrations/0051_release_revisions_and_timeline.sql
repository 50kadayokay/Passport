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
  ('device_push_v1',      'PUBLICATION_PUBLISHED'),
  ('profile_timeline_v1', 'PUBLICATION_PUBLISHED')
on conflict (listener, event_type) do nothing;

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
