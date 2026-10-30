-- ============================================================================
-- 0063_company_initiated_threads.sql — NOT APPLIED. Prepared for review.
--
-- Lets a company start a thread with ANOTHER company from the portal, and lets
-- the recipient see who it is from -- a COMPANY, not a person.
--
-- THE PROBLEM THIS SOLVES
-- -----------------------
-- 0014 modelled one direction: an investor writes to a company.
-- `conversations` is (investor_id -> auth.users, company_slug -> the recipient).
-- Start a company-to-company thread on that shape and it still works, but the
-- sending company's USER lands in investor_id, so the recipient's inbox shows a
-- person's name with no hint which company they speak for. Kingsmen writing to
-- Argenta arrives as "Marcus Webb". That is the bug this migration prevents,
-- and it is why the portal had no compose button rather than a half-built one.
--
-- THE SHAPE
-- ---------
-- One nullable column. `sender_company_id is null` means exactly what every
-- existing row means -- an investor wrote this -- so no row changes meaning and
-- nothing needs back-filling.
--
-- ON THE WORD "sender"
-- --------------------
-- messages.sender stays 'investor' | 'company'. Those labels are now positional
-- rather than literal:
--   'investor' = the INITIATING side (investor_id, optionally acting as
--                sender_company_id)
--   'company'  = the RECIPIENT company (company_slug)
-- Renaming them would rewrite every row and every caller to gain a better word.
-- Documented instead -- and the UI reads sender_company_id, never the label, to
-- decide what to display.
--
-- UNIQUENESS, AND WHY TWO PARTIAL INDEXES
-- ---------------------------------------
-- 0014 had `unique (investor_id, company_slug)` -- one thread per investor per
-- company. Adding sender_company_id to that tuple would DESTROY the rule,
-- because Postgres treats NULLs as distinct: (u, slug, NULL) could then be
-- inserted twice. Two partial indexes keep the original invariant intact for
-- investor threads and add the matching one for company threads.
-- ============================================================================

begin;

alter table public.conversations
  add column if not exists sender_company_id uuid references public.companies(id) on delete set null;

comment on column public.conversations.sender_company_id is
  'Set when a COMPANY started this thread (portal compose). NULL means an investor did, which is every pre-0063 row.';

-- Replace the single unique constraint with the two partial rules.
alter table public.conversations drop constraint if exists conversations_investor_id_company_slug_key;

create unique index if not exists uq_conv_investor_thread
  on public.conversations (investor_id, company_slug)
  where sender_company_id is null;

create unique index if not exists uq_conv_company_thread
  on public.conversations (sender_company_id, company_slug)
  where sender_company_id is not null;

create index if not exists idx_conv_sender_company
  on public.conversations (sender_company_id) where sender_company_id is not null;

-- ------------------------------------------------- the participant predicate
-- Redefines 0062's function to add the third way of being in a thread: you own
-- the company that STARTED it. Kept as one function so the row policies, the
-- storage policies for attachments, and this all agree by construction.
create or replace function public.can_touch_conversation(conv uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.conversations c
     where c.id = conv
       and (
         c.investor_id = auth.uid()                                   -- the investor
         or public.owns_company_slug(c.company_slug)                  -- the recipient company
         or (c.sender_company_id is not null                          -- the sending company
             and public.owns_company(c.sender_company_id))
       )
  );
$$;

revoke execute on function public.can_touch_conversation(uuid) from public, anon;
grant  execute on function public.can_touch_conversation(uuid) to authenticated;

-- ----------------------------------------------------------------- policies
-- SELECT: the recipient company kept its 0047 rule; the sending company is new.
drop policy if exists conv_select_company on public.conversations;
create policy conv_select_company on public.conversations
  for select using (
    public.owns_company_slug(company_slug)
    or (sender_company_id is not null and public.owns_company(sender_company_id))
  );

-- INSERT: a company may open a thread, and only AS ITSELF, and only with
-- itself as the initiator. investor_id must still be the acting user, so every
-- row remains attributable to a human even when it speaks for a company.
drop policy if exists conv_insert_company on public.conversations;
create policy conv_insert_company on public.conversations
  for insert to authenticated
  with check (
    sender_company_id is not null
    and public.owns_company(sender_company_id)
    and investor_id = auth.uid()
    -- A company cannot open a thread with itself.
    and lower(company_slug) <> lower(coalesce(
          (select c.slug from public.companies c where c.id = sender_company_id), ''))
  );

drop policy if exists msg_select_company on public.messages;
create policy msg_select_company on public.messages
  for select using (public.can_touch_conversation(conversation_id));

-- The RECIPIENT writes as 'company'. Unchanged from 0047 except that it now
-- routes through the shared predicate.
drop policy if exists msg_insert_company on public.messages;
create policy msg_insert_company on public.messages
  for insert with check (
    sender = 'company'
    and exists (select 1 from public.conversations c
                 where c.id = conversation_id
                   and public.owns_company_slug(c.company_slug))
  );

-- The INITIATING company writes as 'investor' (positional -- see the note at
-- the top). Scoped to threads it actually started, so this grants nothing on
-- an investor's thread.
drop policy if exists msg_insert_sender_company on public.messages;
create policy msg_insert_sender_company on public.messages
  for insert to authenticated with check (
    sender = 'investor'
    and exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and c.sender_company_id is not null
         and public.owns_company(c.sender_company_id)
    )
  );

commit;

-- ============================================================================
-- ROLLBACK. Restores 0047 exactly. Company-started threads become invisible to
-- their sender but are NOT deleted -- the column is dropped last, and dropping
-- it is what removes them, so stop before that line if any exist.
-- ============================================================================
-- begin;
-- drop policy if exists conv_insert_company        on public.conversations;
-- drop policy if exists msg_insert_sender_company  on public.messages;
-- drop policy if exists conv_select_company        on public.conversations;
-- create policy conv_select_company on public.conversations
--   for select using (public.owns_company_slug(company_slug));
-- drop index if exists uq_conv_investor_thread;
-- drop index if exists uq_conv_company_thread;
-- alter table public.conversations
--   add constraint conversations_investor_id_company_slug_key unique (investor_id, company_slug);
-- -- alter table public.conversations drop column sender_company_id;   -- DESTRUCTIVE
-- commit;
