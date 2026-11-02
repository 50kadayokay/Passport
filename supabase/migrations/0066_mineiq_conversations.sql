-- ============================================================================
-- 0066_mineiq_conversations.sql — NOT APPLIED. Prepared for review.
--
-- Server-side history for MineIQ chat. Until this is applied, threads live in
-- the browser (src/lib/mineiqChat.js) and therefore do not follow a user to
-- another device or to a colleague. The portal says so in the history panel
-- rather than implying a sync that is not happening.
--
-- WHY NOT REUSE `conversations` / `messages`
-- ------------------------------------------
-- Those are the INVESTOR↔COMPANY inbox (0014, 0047). Their rows carry an
-- investor_id and a company_slug, and their policies are written so that an
-- investor can read their own side of a thread. Putting a company's private AI
-- prompts in that table would place them one policy mistake away from the
-- investor who is allowed to read the other rows -- and would need `investor_id`
-- to become nullable, weakening the constraint the inbox depends on. Separate
-- tables, separate policies.
--
-- WHO CAN READ A THREAD
-- ---------------------
-- The author, always. Other members of the company ONLY if the author shares it.
-- An earlier draft of this file gated on owns_company() alone, which would have
-- made every employee's chat history readable by every colleague the moment it
-- was applied -- a CEO drafting a financing question, visible to the whole
-- team. Company scope is necessary but not sufficient: both conditions are
-- checked, so leaving the company also ends access to anything shared.
--
-- Writes are the author's alone. `shared_with_company` lets someone publish a
-- thread to colleagues; it does not let colleagues edit, delete, or continue it,
-- because a shared conversation that anyone can append to is no longer a record
-- of who asked what.
--
-- WHAT IT IS NOT. Not a knowledge store. Nothing written here is a company
-- fact, is retrieved by mineiq_search, or reaches an investor: a chat message
-- is a record of a question asked, and the rule that chat cannot overwrite
-- trusted company facts is preserved by these tables holding no facts at all.
-- ============================================================================

begin;

create table if not exists public.mineiq_threads (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  -- Private by default. Sharing is an explicit act, never a side effect of
  -- belonging to the same company.
  shared_with_company boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.mineiq_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.mineiq_threads(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  body        text not null default '',
  -- The sources the answer cited, as returned. Stored so reopening a thread
  -- shows the same provenance the reader saw at the time; re-deriving them
  -- later would show today's record, not the one that was answered from.
  sources     jsonb not null default '[]'::jsonb,
  grounded    boolean,
  created_at  timestamptz not null default now()
);

-- The listing query is always (company, me, newest first).
create index if not exists idx_mineiq_threads_mine on public.mineiq_threads (company_id, user_id, updated_at desc);
create index if not exists idx_mineiq_messages_thread on public.mineiq_messages (thread_id, created_at);

alter table public.mineiq_threads  enable row level security;
alter table public.mineiq_messages enable row level security;

-- owns_company() is the company's owner or an active membership (0006), the same
-- gate the portal itself uses. Platform admins are deliberately NOT included: a
-- company's private questions to its own assistant are not support material.
--
-- READ: mine, or shared with a company I belong to.
create policy "mineiq_threads_select" on public.mineiq_threads for select to authenticated
  using (public.owns_company(company_id) and (user_id = auth.uid() or shared_with_company));

-- WRITE: mine only, and the row must name me. `user_id = auth.uid()` in the
-- CHECK is what stops a caller inserting a thread under a colleague's name.
create policy "mineiq_threads_insert" on public.mineiq_threads for insert to authenticated
  with check (public.owns_company(company_id) and user_id = auth.uid());
create policy "mineiq_threads_update" on public.mineiq_threads for update to authenticated
  using (public.owns_company(company_id) and user_id = auth.uid())
  with check (public.owns_company(company_id) and user_id = auth.uid());
create policy "mineiq_threads_delete" on public.mineiq_threads for delete to authenticated
  using (public.owns_company(company_id) and user_id = auth.uid());

-- Messages inherit their thread's visibility rather than carrying their own
-- copy of the rule: one place to get it right, and a thread that stops being
-- shared takes its messages with it.
create policy "mineiq_messages_select" on public.mineiq_messages for select to authenticated
  using (exists (
    select 1 from public.mineiq_threads t
     where t.id = thread_id
       and public.owns_company(t.company_id)
       and (t.user_id = auth.uid() or t.shared_with_company)
  ));
create policy "mineiq_messages_insert" on public.mineiq_messages for insert to authenticated
  with check (exists (
    select 1 from public.mineiq_threads t
     where t.id = thread_id and t.user_id = auth.uid() and public.owns_company(t.company_id)
  ));
create policy "mineiq_messages_delete" on public.mineiq_messages for delete to authenticated
  using (exists (
    select 1 from public.mineiq_threads t
     where t.id = thread_id and t.user_id = auth.uid() and public.owns_company(t.company_id)
  ));

-- Column-level grants, matching 0061a's posture: anon gets nothing at all, and
-- `authenticated` gets only what the policies above then filter.
revoke all on public.mineiq_threads  from anon;
revoke all on public.mineiq_messages from anon;
grant select, insert, update, delete on public.mineiq_threads  to authenticated;
grant select, insert, delete        on public.mineiq_messages to authenticated;

commit;

-- ============================================================================
-- ROLLBACK -- additive, so this restores the database exactly.
-- ============================================================================
-- begin;
-- drop table if exists public.mineiq_messages;
-- drop table if exists public.mineiq_threads;
-- commit;
