-- BATCH 8: 0051_release_revisions_and_timeline.sql .. 0059_auth_user_trigger.sql (8 files)

-- ======== 0051_release_revisions_and_timeline.sql ========
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


-- ======== 0052_messaging_privilege_hardening.sql ========
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


-- ======== 0053_phase3_0041_privilege_hardening.sql ========
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


-- ======== 0054_phase3_0041_immutability.sql ========
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


-- ======== 0056_function_execute_hardening.sql ========
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


-- ======== 0057_submission_throttle.sql ========
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


-- ======== 0058_close_public_insert.sql ========
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


-- ======== 0059_auth_user_trigger.sql ========
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
