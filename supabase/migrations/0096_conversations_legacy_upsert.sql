-- 0096_conversations_legacy_upsert.sql
--
-- Keeps investor messaging on mineex.ca/app working after 0063. Run IMMEDIATELY
-- after 0063.
--
-- WHY
-- ---
-- mineex.ca (the separate mineex-site project, code 9dfafd7, not changed by this
-- rollout) creates an investor's thread with
--   POST /rest/v1/conversations?on_conflict=investor_id,company_slug  (merge-duplicates)
-- 0063 replaced the unique constraint on (investor_id, company_slug) with two PARTIAL
-- unique indexes, and ON CONFLICT cannot infer a partial index: every send from the
-- old app fails (42P10 -> 500 "conversation-failed").
--
-- WHAT THIS CHANGES
-- -----------------
-- A thread a COMPANY starts (sender_company_id set) no longer stores the acting
-- user in investor_id. It stores them in the new started_by column, and
-- investor_id is NULL. That lets the full unique constraint come back: NULLs never
-- collide, so it constrains investor threads exactly as 0063's partial index did,
-- and the old upsert can never merge into a company thread.
--
-- It also fixes two problems with storing the acting user in investor_id:
--   * investor_id is ON DELETE CASCADE: deleting that person's account (or
--     delete_own_account) deleted their COMPANY's thread;
--   * company_conversation_senders() and conv_select treated the acting user as
--     the investor: the recipient company saw that person's investor profile, and
--     the thread appeared in that person's own investor inbox.
--
-- Unchanged: 0063's uq_conv_company_thread (one thread per sending company and
-- recipient), every RLS policy (a company thread is reached through
-- sender_company_id, never through investor_id), and the browser's grants
-- (authenticated users have SELECT only on conversations; threads are created by
-- /api/messages with the service role). 0063's / 0076's conv_insert_company policy
-- mentions investor_id = auth.uid(); it is unreachable (no INSERT grant) and is
-- left as it is.
--
-- The API (api/messages.js handleStart) writes started_by when the column exists
-- and falls back to the 0063 shape when it does not, so code and migration can
-- land in either order.

begin;

alter table public.conversations
  add column if not exists started_by uuid references auth.users(id) on delete set null;
comment on column public.conversations.started_by is
  'Company-started threads (sender_company_id set): the user who started it. NULL on investor threads, whose person is investor_id.';

alter table public.conversations alter column investor_id drop not null;

-- Existing company threads (none on production; 0063 is not applied there).
update public.conversations
   set started_by = investor_id, investor_id = null
 where sender_company_id is not null and investor_id is not null;

-- A company thread never names an investor. (A company thread whose sending
-- company is deleted ends with sender_company_id and investor_id both NULL, which
-- this allows; under 0063's shape it silently became the starter's investor thread.)
alter table public.conversations drop constraint if exists conversations_company_thread_no_investor;
alter table public.conversations add constraint conversations_company_thread_no_investor
  check (sender_company_id is null or investor_id is null);

drop index if exists public.uq_conv_investor_thread;
alter table public.conversations drop constraint if exists conversations_investor_id_company_slug_key;
alter table public.conversations
  add constraint conversations_investor_id_company_slug_key unique (investor_id, company_slug);

create index if not exists idx_conv_started_by
  on public.conversations (started_by) where started_by is not null;

commit;

-- ---------------------------------------------------------------- verify ----
--   select exists (select 1 from pg_constraint
--                   where conrelid = 'public.conversations'::regclass
--                     and conname = 'conversations_investor_id_company_slug_key')
--      and to_regclass('public.uq_conv_investor_thread') is null
--      and to_regclass('public.uq_conv_company_thread') is not null;
-- Rollback: supabase/rollbacks/0096_conversations_legacy_upsert.rollback.sql
