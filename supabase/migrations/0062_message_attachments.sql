-- ============================================================================
-- 0062_message_attachments.sql — NOT APPLIED. Prepared for review.
--
-- Files on investor<->company messages.
--
-- WHY A TABLE AND NOT A COLUMN
-- ----------------------------
-- A message may carry several files, and each needs its own name, type, size
-- and storage path. A jsonb column would make the storage policy -- which has
-- to resolve a storage object back to a conversation -- read inside an array,
-- and a policy you cannot read is a policy nobody can audit.
--
-- AUTHORIZATION: ONE PREDICATE, BOTH SIDES
-- ----------------------------------------
-- A conversation has exactly two parties. 0014 built the investor side
-- (auth.uid() = investor_id) and 0047 added the company side by resolving
-- conversations.company_slug -> companies.id -> owns_company(id), which already
-- covers the owner AND active staff. can_touch_conversation() is those two
-- clauses in one place, so the row policy and the storage policy cannot drift
-- apart -- the failure mode where a file is unreachable through the API but
-- readable through a storage URL, or vice versa.
--
-- THE BUCKET IS PRIVATE. Reads go through a signed URL minted for a caller the
-- policy has already accepted. There is no public path, and no policy anywhere
-- matches on the object name's shape: a path is not a permission. This follows
-- 0037 and 0038 exactly.
--
-- UPLOADS ARE CONSTRAINED AT THE BUCKET, NOT IN THE CLIENT. A size cap and a
-- MIME allow-list enforced in JavaScript is a suggestion. These are set on
-- storage.buckets so the limit holds for a caller who never runs our code.
-- Executables, archives and anything scriptable are deliberately absent: this
-- is a channel between strangers, and a company opening an investor's file
-- should not be how malware arrives.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- -------------------------------
-- It does not scan uploads for malware. Nothing in this stack does. Files are
-- served from a private bucket by signed URL and are never executed, but a
-- recipient still downloads bytes a stranger chose. If that is unacceptable,
-- the answer is a scanning step before the row becomes visible, not a tighter
-- MIME list -- and that is a separate decision with a cost attached.
-- ============================================================================

begin;

-- ------------------------------------------------- the participant predicate
create or replace function public.can_touch_conversation(conv uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.conversations c
     where c.id = conv
       and (
         c.investor_id = auth.uid()
         or exists (
           select 1 from public.companies co
            where lower(co.slug) = lower(c.company_slug)
              and public.owns_company(co.id)
         )
       )
  );
$$;

revoke execute on function public.can_touch_conversation(uuid) from public, anon;
grant  execute on function public.can_touch_conversation(uuid) to authenticated;

-- ------------------------------------------------------------- the metadata
create table if not exists public.message_attachments (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.messages(id)      on delete cascade,
  -- Denormalised deliberately: every policy below asks "which conversation is
  -- this?", and making the storage policy join messages to answer it would put
  -- a second table in the hot path of every file read.
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  storage_path    text not null unique,
  filename        text not null,
  mime_type       text not null,
  size_bytes      bigint not null check (size_bytes > 0),
  uploaded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_msg_attach_message on public.message_attachments (message_id);
create index if not exists idx_msg_attach_conv    on public.message_attachments (conversation_id);

alter table public.message_attachments enable row level security;

-- LEAST PRIVILEGE, EXPLICITLY. Supabase grants anon and authenticated all seven
-- privileges on a new table. 0014 left that default in place on the messaging
-- tables and it survived until 0052 removed it. Revoked here in the same breath
-- so the defect cannot be reintroduced by this migration.
revoke all on public.message_attachments from anon, authenticated;
grant select, insert on public.message_attachments to authenticated;

drop policy if exists msg_attach_select on public.message_attachments;
create policy msg_attach_select on public.message_attachments
  for select to authenticated
  using (public.can_touch_conversation(conversation_id));

-- No UPDATE and no DELETE policy, on purpose. An attachment is part of a
-- correspondence record: neither party gets to alter or quietly remove what
-- was sent. Deletion happens by cascade when the message or conversation goes.
drop policy if exists msg_attach_insert on public.message_attachments;
create policy msg_attach_insert on public.message_attachments
  for insert to authenticated
  with check (
    public.can_touch_conversation(conversation_id)
    and uploaded_by = auth.uid()
    -- The row must describe a message in the conversation it claims. Without
    -- this a participant could staple a file to another conversation's message.
    and exists (
      select 1 from public.messages m
       where m.id = message_id and m.conversation_id = message_attachments.conversation_id
    )
  );

-- --------------------------------------------------------- private bucket
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

-- 10 MB, and a deliberately narrow list. Set as an UPDATE so the migration is
-- re-runnable and so an existing bucket is corrected rather than skipped.
-- 50 MB. Investors send PHOTOS AND VIDEO, and video is the constraint: 10 MB
-- would have rejected almost every clip a phone produces. 50 MB holds roughly a
-- 30-45 second 1080p capture. Longer than that still fails, and the honest fix
-- for that is client-side compression or a transcoding step -- not a bigger
-- number here, which only moves where the failure happens.
--
-- The list is wider than the investor UI offers on purpose. Investors are given
-- images and video only; the COMPANY replying from the portal can also send a
-- PDF or a spreadsheet, which is the useful direction for documents. That split
-- is enforced in the UI, NOT here -- see the note below.
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array[
         -- media (both directions)
         'image/png','image/jpeg','image/gif','image/webp','image/heic','image/heif',
         'video/mp4','video/quicktime','video/webm',
         -- documents (company replies)
         'application/pdf','text/plain','text/csv',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
       ]
 where id = 'message-attachments';

-- NOT ENFORCED HERE: that investors may send only media. A storage policy sees
-- the object and the path, not the MIME type the client declared, so "investors
-- cannot upload a PDF" is a UI rule, not a database one. It is the right
-- default and the wrong thing to call a security boundary. Making it one means
-- checking the sender against conversations.investor_id and the content type at
-- insert time -- say the word and it becomes a constraint rather than a habit.

do $$ declare p record; begin
  for p in select policyname from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and policyname like 'msgattach_%'
  loop execute format('drop policy %I on storage.objects', p.policyname); end loop;
end $$;

-- READ: resolve the object back to its attachment row, then to the
-- conversation, then to the same predicate the table uses. The storage path is
-- matched as DATA, never parsed for meaning.
create policy "msgattach_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.message_attachments a
       where a.storage_path = 'message-attachments/' || storage.objects.name
         and public.can_touch_conversation(a.conversation_id)
    )
  );

-- WRITE: a participant may upload only beneath their own conversation's prefix.
-- This is the ONE place the path is constrained, and it is a containment rule,
-- not an authorization rule -- can_touch_conversation() is what authorizes.
-- Both must pass, so a forged prefix fails the predicate and a legitimate
-- caller writing outside their prefix fails the containment.
create policy "msgattach_write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and public.can_touch_conversation(((storage.foldername(name))[1])::uuid)
  );

commit;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- begin;
-- drop policy if exists "msgattach_read"  on storage.objects;
-- drop policy if exists "msgattach_write" on storage.objects;
-- drop table if exists public.message_attachments;
-- drop function if exists public.can_touch_conversation(uuid);
-- delete from storage.buckets where id = 'message-attachments';  -- only if empty
-- commit;
