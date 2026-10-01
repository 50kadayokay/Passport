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
