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
