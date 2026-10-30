-- BATCH 9: 0060_publish_actor_hardening.sql .. 0065b_engagement_corrections.sql (8 files)

-- ======== 0060_publish_actor_hardening.sql ========
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


-- ======== 0061a_table_privilege_hardening.sql ========
-- ============================================================================
-- 0061a_table_privilege_hardening.sql — NOT APPLIED. Prepared for review.
--
-- THE FINDING
-- -----------
-- Four tables still carry Supabase's default grant of all seven privileges:
--
--   company_follows             anon + authenticated   all 7
--   post_events                 anon + authenticated   all 7
--   post_likes                  authenticated          all 7
--   user_company_relationships  authenticated          all 7
--
-- This is the SAME defect 0045 fixed for the Phase 3 evidence tables and 0052
-- fixed for messaging. Those two migrations prove the pattern; these four were
-- simply never done. Contrast the hardened neighbours, verified in production:
--   conversations -> SELECT, messages -> INSERT,SELECT, company_notification_reads -> SELECT
--
-- HOW EXPOSED IT ACTUALLY IS -- precisely, not dramatically
-- ---------------------------------------------------------
-- RLS is enabled on all four, and INSERT/UPDATE/DELETE are RLS-constrained, so
-- anon (which carries no auth.uid()) matches no policy and is already denied
-- those. The live risk today is therefore close to nil.
--
-- The exception that justifies this migration: TRUNCATE IS NOT SUBJECT TO RLS.
-- It is a table-level privilege and row policies do not apply to it. PostgREST
-- does not expose TRUNCATE, so it is unreachable with the anon key as things
-- stand -- the GRANT is the only thing between any future non-PostgREST path
-- and an empty table. REFERENCES and TRIGGER are likewise ungoverned by RLS.
--
-- MINIMUM PRIVILEGE, DERIVED FROM TRACED CALL SITES -- not from "code might".
-- Every client path on these four tables authenticates first (authed() /
-- getUser()), so ANON NEEDS NOTHING ANYWHERE HERE. The server paths that touch
-- them (api/news-notify.js) use the service role and bypass grants entirely.
-- 0048/0049's reporting functions are SECURITY DEFINER and execute as their
-- owner, so they need no caller-role grant either.
--
--   company_follows             SELECT, INSERT, DELETE
--     src/lib/feed.js: isFollowing/followingIds (SELECT), follow (INSERT),
--     unfollow (DELETE). UPDATE is required ONLY because follow() sends
--     Prefer: resolution=merge-duplicates. The accompanying patch changes that
--     to ignore-duplicates -- re-following something you already follow is a
--     no-op, so the UPDATE branch never did anything -- which removes the need
--     for the privilege rather than granting it. post_likes already does this.
--
--   post_events                 INSERT
--     src/lib/feed.js posts impressions/opens/dwell with return=minimal. No
--     client path reads it; 0048 reads it as SECURITY DEFINER. 0009's
--     own_select policy stays in place but has no grant to act on, which is
--     correct: nothing needs it.
--
--   post_likes                  SELECT, INSERT, DELETE
--     src/lib/investorData.js:198,204 (SELECT), 211 (INSERT, already
--     ignore-duplicates), 221 (DELETE).
--
--   user_company_relationships  SELECT, INSERT, UPDATE, DELETE
--     src/lib/investorData.js:172 (SELECT), 181 (upsert with
--     merge-duplicates + return=representation -- UPDATE is GENUINELY needed
--     here, the upsert really does change is_following/is_favourite), 191
--     (DELETE). This is the live follow source: api/news-notify.js reads it to
--     decide who receives push.
--
--
-- SCOPE: the four tables ONLY. The companies column grants are 0061b, split out
-- because they have a completely different risk profile -- 0061b cannot ship
-- until an App Store release lands, and bundling held this zero-risk half
-- hostage to that. NOTHING HERE REQUIRES A CODE DEPLOY, before or after.
-- ============================================================================

begin;

revoke all on public.company_follows            from anon, authenticated;
revoke all on public.post_events                from anon, authenticated;
revoke all on public.post_likes                 from anon, authenticated;
revoke all on public.user_company_relationships from anon, authenticated;

grant select, insert, delete         on public.company_follows            to authenticated;
grant insert                         on public.post_events                to authenticated;
grant select, insert, delete         on public.post_likes                 to authenticated;
grant select, insert, update, delete on public.user_company_relationships to authenticated;

-- anon is granted nothing. Every traced caller authenticates first:
-- feed.js guards on getUser() (5 sites), investorData.js on authed() (17),
-- recordPostEvent returns at `if (!u ...)`, followerCount goes through the
-- SECURITY DEFINER company_follower_count, and news-notify.js uses the
-- service role. Verified by reading each call site, not by assumption.

commit;

-- ============================================================================
-- ROLLBACK -- EMERGENCY ONLY. This restores Supabase's default all-7 grant and
-- is itself the security regression this migration exists to remove. Prefer
-- granting back ONE missing privilege over running this wholesale.
-- ============================================================================
-- begin;
-- grant all on public.company_follows            to anon, authenticated;
-- grant all on public.post_events                to anon, authenticated;
-- grant all on public.post_likes                 to anon, authenticated;
-- grant all on public.user_company_relationships to anon, authenticated;
-- commit;


-- ======== 0061b_companies_column_grants.sql ========
-- ============================================================================
-- 0061b_companies_column_grants.sql — NOT APPLIED. DEFERRED INDEFINITELY.
--
-- Withholds owner_id and preview_token from anon on public.companies.
--
-- WHY THIS IS NOT SCHEDULED
-- -------------------------
-- capacitor.config.json sets webDir: "dist" with NO server.url, so the iOS and
-- Android apps COMPILE THE WEB BUILD INTO THE BINARY. An installed build runs a
-- frozen copy of the JS. fetchCompany() -- called from PassportProto.jsx:7819,
-- :11418 and App.jsx:49, i.e. the native investor app -- sent `select=*` before
-- the accompanying patch.
--
-- Postgres cannot make a column revoke override a table-level grant, so the
-- table grant must be dropped and re-granted per column. Under column grants
-- `select=*` does not quietly omit what you may not read: IT FAILS THE WHOLE
-- REQUEST. So the moment this is applied, every already-installed build loses
-- company profiles until its user updates.
--
-- App Store adoption is NOT a mitigation. Old installs can remain active
-- indefinitely, and no waiting period makes this safe. Do not apply on the
-- assumption that "enough" users have upgraded.
--
-- WHAT WOULD MAKE IT SAFE, AND WHAT WOULD NOT
-- -------------------------------------------
--  • preview_token CAN be protected without breaking select=*: move it out of
--    companies into a side table keyed by company_id with its own RLS. Then
--    select=* simply never returns it and no client, old or new, can break.
--    Its only readers are the admin console and the preview flow -- a small,
--    self-contained change. This is the recommended route.
--  • owner_id CANNOT be moved cheaply. 0001's companies SELECT policy is
--    literally `owner_id = auth.uid() or status = 'published' or is_admin()`,
--    0006's trigger maintains memberships from it, and owns_company() reads it.
--    Relocating it means rewriting the core policy to consult another table --
--    and the obvious substitute, owns_company(), is SECURITY DEFINER and reads
--    companies, so calling it from a companies policy risks recursive policy
--    evaluation. Not a privilege migration's job.
--  • Severity supports that split: preview_token is an actual secret;
--    owner_id is an opaque UUID whose subject cannot be resolved (auth.users is
--    not exposed, and after 0061a anon reads no user-keyed table at all). All
--    5 claimed companies are currently unpublished, so nothing leaks today.
-- ============================================================================

begin;

do $$
declare col text;
begin
  revoke select on public.companies from anon;
  for col in
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'companies'
       and column_name not in ('owner_id', 'preview_token')
  loop
    execute format('grant select (%I) on public.companies to anon', col);
  end loop;
end $$;

commit;

-- MAINTENANCE COST: a column added to companies AFTER this runs gets no anon
-- grant and is invisible to the investor app until granted. Column grants have
-- no "and everything future" form. A public view would, and was ruled out.

-- ============================================================================
-- ROLLBACK -- EMERGENCY ONLY.
-- ============================================================================
-- begin;
-- do $$ declare col text; begin
--   for col in select column_name from information_schema.columns
--      where table_schema='public' and table_name='companies'
--   loop execute format('revoke select (%I) on public.companies from anon', col); end loop;
--   grant select on public.companies to anon;
-- end $$;
-- commit;


-- ======== 0062_message_attachments.sql ========
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


-- ======== 0063_company_initiated_threads.sql ========
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


-- ======== 0064_notification_clearing.sql ========
-- ============================================================================
-- 0064_notification_clearing.sql — NOT APPLIED. Prepared for review.
--
-- "Clear all" on the company's Notifications page.
--
-- WHAT CLEARING MUST NOT DO
-- -------------------------
-- It must not touch the follow or the like. Those are an INVESTOR'S acts, and
-- the company's notification list is only a view of them. A company tidying its
-- own page has no business un-following itself on someone else's behalf, and
-- the row in company_follows / post_likes is the investor's record, not ours.
-- So nothing here deletes anything.
--
-- HOW IT WORKS INSTEAD
-- --------------------
-- One nullable timestamp per company. The feed is derived and strictly ordered
-- by time, so "I have dealt with everything up to now" is a single value --
-- there is no per-item state to store, and a dismissals table with one row per
-- hidden event would be a far larger thing to maintain for the same result.
--
-- A later follow or like is NEWER than cleared_at and reappears, which is the
-- behaviour you want: clearing empties the page, it does not mute the company.
--
-- WHY NOT REUSE seen_at
-- ---------------------
-- seen_at already exists on this table and is tempting. It is set AUTOMATICALLY
-- every time the page is opened -- that is what drives the unread badge -- so
-- filtering on it would make the list empty itself on every visit. Clearing is
-- a deliberate act and needs a value only a deliberate act writes.
-- ============================================================================

begin;

alter table public.company_notification_reads
  add column if not exists cleared_at timestamptz;

comment on column public.company_notification_reads.cleared_at is
  'Set by mark_notifications_cleared(). company_notifications() hides events at or before it. NULL = never cleared. Distinct from seen_at, which is written automatically on every page view.';

-- ------------------------------------------------------------- the clear RPC
create or replace function public.mark_notifications_cleared(p_company uuid)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_now timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  v_now := now();
  insert into public.company_notification_reads (company_id, seen_at, cleared_at)
       values (p_company, v_now, v_now)
  on conflict (company_id) do update
    set cleared_at = excluded.cleared_at,
        seen_at    = excluded.seen_at;     -- clearing implies having seen them
  return v_now;
end $$;

revoke execute on function public.mark_notifications_cleared(uuid) from public, anon;
grant  execute on function public.mark_notifications_cleared(uuid) to authenticated;

-- --------------------------------------------- the feed honours cleared_at
-- Identical to 0049 except for the one WHERE clause at the end. Restated in
-- full rather than patched, because that is how CREATE OR REPLACE works and a
-- half-remembered body is how a filter gets silently dropped later.
create or replace function public.company_notifications(p_company uuid, p_limit integer default 50)
returns table (
  kind             text,
  actor_name       text,
  actor_role       text,
  actor_company    text,
  subject          text,
  occurred_at      timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text; v_cleared timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;

  select c.slug into v_slug from public.companies c where c.id = p_company;
  select r.cleared_at into v_cleared
    from public.company_notification_reads r where r.company_id = p_company;

  return query
  with follows as (
    select distinct on (u.user_id) u.user_id, u.at
      from (
        select f.user_id, f.created_at as at
          from public.company_follows f
         where f.company_id = p_company
        union all
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
  select e.kind, ip.display_name, ip.role, ip.company, e.subject, e.occurred_at
    from events e
    left join public.investor_profiles ip on ip.user_id = e.user_id
   -- THE ONLY CHANGE FROM 0049. NULL cleared_at means nothing is hidden, so an
   -- untouched company sees exactly what it saw before this migration.
   where v_cleared is null or e.occurred_at > v_cleared
   order by e.occurred_at desc
   limit greatest(least(p_limit, 200), 1);
end $$;

revoke execute on function public.company_notifications(uuid, integer) from public, anon;
grant  execute on function public.company_notifications(uuid, integer) to authenticated;

commit;

-- ============================================================================
-- ROLLBACK. Restores 0049's unfiltered feed. The column is LEFT IN PLACE: it
-- holds the only record of what each company cleared, and dropping it to undo a
-- filter would throw that away for no gain.
-- ============================================================================
-- begin;
-- drop function if exists public.mark_notifications_cleared(uuid);
-- -- then re-run 0049's company_notifications() definition verbatim.
-- commit;


-- ======== 0065a_analytics_breakdown.sql ========
-- ============================================================================
-- 0065a_analytics_breakdown.sql — NOT APPLIED. Prepared for review.
--
-- PURELY ADDITIVE. Four new read-only functions. No existing function is
-- touched, no table, column, event kind or instrumentation is added, and
-- dropping all four restores the database exactly. 0048's behaviour is
-- unchanged by this file.
--
-- The behaviour CHANGES live in 0065b, deliberately separated so the additive
-- half can be approved and applied on its own.
--
-- WHAT IT ADDS
--   company_engagement_by_type        -- engagement split press_release vs media
--   company_follower_growth           -- first-time follows per day
--   company_content_performance       -- per-item lifetime + windowed
--   company_engagement_unattributed   -- the engagement the item list CANNOT show
--
-- WHY THE FOURTH ONE EXISTS
-- -------------------------
-- The portal shows a lifetime total, a press/media split and a per-item list on
-- one screen, and a reader will add the list up. Two kinds of engagement cannot
-- appear in that list:
--   • RETIRED CONTENT. removed_at is set when a publication is unpublished
--     (api/_listeners.js:31) and cleared again on re-publish, so it is a
--     reversible hide, not a delete. Those opens really happened.
--   • ORPHANED KEYS. post_likes/post_saves key content as (company_slug,
--     post_key text) with no foreign key, so a row can name a post_key that
--     matches nothing in `posts`.
-- Everything else here counts LIVE posts only, so the list reconciles exactly.
-- This function is how the difference stays visible instead of silently
-- vanishing: the portal prints it as its own line under the lifetime figures.
--
-- CANONICAL DEFINITION OF A SAVE
-- ------------------------------
-- Two different things were being added together, and they are not the same
-- measurement:
--   • post_saves is CURRENT STATE. investorData.js savePost() inserts a row and
--     unsavePost() DELETES it, so the table answers "is this saved right now".
--   • post_events kind='save' is a HISTORICAL ACTION, append-only. PassportProto
--     writes one when an investor saves from the feed, and 'unsave' -- allowed by
--     the CHECK -- is never emitted by anything, so an event can never be undone.
-- So: `saves` means currently saved, from post_saves alone. `save_actions`
-- means save presses ever recorded, from post_events alone. They are returned
-- side by side and NEVER summed. A feed save writes only an event (the feed's
-- own saved list, savedStore, is device-local localStorage and never reaches the
-- database), so save_actions will exceed saves; that is a real difference
-- between two surfaces, not a discrepancy to reconcile away.
--
-- THE WINDOW ARGUMENT
-- -------------------
-- p_days NULL means ALL TIME -- no lower bound at all -- and is how the portal's
-- period toggle asks for a company's whole history. A number is clamped to
-- [1, 365]; that clamp deliberately does NOT apply to the null case, because
-- "all time" is not a long window, it is the absence of one. Every windowed
-- figure on the page reads the same argument, so a reader who switches the
-- toggle cannot end up comparing a 30-day chart against a 90-day column.
--
-- WINDOW BOUNDARY — EXPLICIT UTC
-- ------------------------------
-- Every window is the calendar window [today - (p_days-1), today] computed in
-- UTC: `(now() at time zone 'UTC')::date`, with the lower bound converted back
-- to a timestamptz at UTC midnight for the created_at comparison. NOT
-- `current_date`, and not a rolling p_days x 24h from the current instant.
-- 0048 mixed all three: it bucketed by `(created_at at time zone 'UTC')::date`
-- but filtered on bare `current_date`, which resolves in the database's TimeZone
-- setting -- so on any project not set to UTC its buckets and its filter
-- disagreed. Being explicit removes the dependency on a GUC entirely.
--
-- PRESS RELEASES vs MEDIA, AND WHY PHOTOS vs VIDEOS IS NOT OFFERED
-- ----------------------------------------------------------------
-- posts.post_type is 'press_release' or 'media'. Media posts travel the same
-- event path as releases, so their opens and dwell were already recorded and
-- merely blended; splitting on post_type separates them with no new collection.
-- That is the whole of what post_type can say. It CANNOT tell a photo from a
-- video: both are post_type 'media' and mediaPosts.js writes the same shape for
-- either. Guessing from a URL extension would be a guess, so nothing here
-- returns a photo/video split and the portal reports media as one group.
--
-- WHAT IS STILL NOT MEASURED
-- --------------------------
-- The app emits exactly three event kinds -- 'open', 'dwell', 'save' -- and
-- nothing else. So impressions (the CHECK allows 'impression'; nothing ever
-- writes one, which makes 0048's `views` structurally zero and read rate
-- uncomputable), profile views, unique visitors, shares, unsaves, and video
-- plays/watch time/completion are all uncollected. No function here invents
-- them; the UI marks them untracked rather than zero.
--
-- AUTHORIZATION
-- -------------
-- Each function: SECURITY DEFINER, pinned search_path, `stable`, no writes, no
-- dynamic SQL, and owns_company(p_company) checked FIRST so the exception
-- raises before a single row is read. owns_company (0006) is the company's
-- owner OR an active company_memberships row -- owner and staff, deliberately
-- not platform admins and not investors. EXECUTE revoked from public and anon,
-- granted only to authenticated. Identical posture to 0048. NO OTHER GRANT IN
-- THE SCHEMA IS TOUCHED BY THIS FILE.
-- ============================================================================

begin;

-- ------------------------------------------------- totals, split by content
-- p_days scopes the ENGAGEMENT, not the content: `posts` is always the number
-- of live posts of that type, because it is the denominator a reader needs
-- beside an open count ("1,149 opens across 6 live releases"). Counting posts
-- published inside the window instead would pair opens-in-window against a
-- different population, since an open in the last 30 days is very often on a
-- post published long before it.
--
-- A WINDOWED `saves` NEEDS SAYING OUT LOUD: post_saves is current state, so a
-- windowed count means "saved during this period AND STILL SAVED". An investor
-- who saved in the window and later unsaved leaves no row and is not counted.
-- That is the only thing the table can answer; it does not keep history.
-- `save_actions` has no such caveat -- events are append-only -- which is
-- exactly why the two are reported separately.
create or replace function public.company_engagement_by_type(p_company uuid, p_days integer default null)
returns table (
  post_type      text,
  posts          bigint,     -- live posts of this type. NOT period-scoped.
  reads          bigint,     -- 'open' events in the period. The real one.
  avg_dwell_secs numeric,    -- SECONDS, converted from the stored milliseconds.
  likes          bigint,
  saves          bigint,     -- saved in the period and still saved
  save_actions   bigint      -- save presses in the period (append-only)
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text; v_since date; v_from timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  select c.slug into v_slug from public.companies c where c.id = p_company;
  -- NULL p_days = all time, matching every other function here.
  if p_days is not null then
    v_since := (now() at time zone 'UTC')::date - (greatest(least(p_days, 365), 1) - 1);
    v_from  := v_since::timestamp at time zone 'UTC';
  end if;

  return query
  -- post_likes/post_saves key on post_key TEXT, so matching them needs
  -- posts.id::text. Written as a correlated `exists (... where p.id::text =
  -- l.post_key)` that cast makes the primary key index unusable and rescans
  -- `posts` once per like row. Materialising the cast once, over a relation the
  -- size of this company's content, makes all of it hash joins instead.
  with mine as (
    select p.id, p.id::text as key, p.post_type
      from public.posts p
     where p.company_id = p_company and p.removed_at is null
  ),
  cnt as (select m.post_type, count(*) as posts from mine m group by m.post_type),
  ev  as (
    select m.post_type,
           count(*) filter (where e.kind = 'open') as reads,
           count(*) filter (where e.kind = 'save') as save_actions,
           round(((avg(e.value) filter (where e.kind = 'dwell' and e.value is not null)) / 1000.0)::numeric, 1) as avg_dwell
      from mine m join public.post_events e on e.post_id = m.id
     where v_from is null or e.created_at >= v_from
     group by m.post_type
  ),
  lk  as (
    select m.post_type, count(*) as likes
      from mine m join public.post_likes l on l.post_key = m.key
     where l.company_slug = v_slug
       and (v_from is null or l.created_at >= v_from)
     group by m.post_type
  ),
  sv  as (
    select m.post_type, count(*) as saves
      from mine m join public.post_saves s on s.post_key = m.key
     where s.company_slug = v_slug
       and (v_from is null or s.created_at >= v_from)
     group by m.post_type
  )
  select cnt.post_type, cnt.posts,
         coalesce(ev.reads, 0), ev.avg_dwell,
         coalesce(lk.likes, 0), coalesce(sv.saves, 0), coalesce(ev.save_actions, 0)
    from cnt
    left join ev on ev.post_type = cnt.post_type
    left join lk on lk.post_type = cnt.post_type
    left join sv on sv.post_type = cnt.post_type;
end $$;

revoke execute on function public.company_engagement_by_type(uuid, integer) from public, anon;
grant  execute on function public.company_engagement_by_type(uuid, integer) to authenticated;

-- ------------------------------------------------------- follower growth
-- Both follow sources, deduplicated by user the way 0048 does it, bucketed on
-- the day of that user's FIRST follow -- so an investor who follows, unfollows
-- and follows again is one new follower, on the original date.
--
-- Two caveats the caller has to carry, because the data cannot answer them:
--   • user_company_relationships.created_at is when the ROW was created, which
--     may predate the moment is_following became true. It is the only timestamp
--     that table offers (0049 records the same caveat).
--   • is_following is current state, and an unfollow DELETES the company_follows
--     row outright, so a follow that has since ended leaves no trace. This
--     therefore counts first-time follows BY PEOPLE STILL FOLLOWING and cannot
--     be read as gross new follows. The portal labels it that way.
create or replace function public.company_follower_growth(p_company uuid, p_days integer default 30)
returns table (day date, new_followers bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text; v_since date; v_from timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  select c.slug into v_slug from public.companies c where c.id = p_company;
  -- NULL p_days = all time: no lower bound, and no clamp to apply.
  if p_days is not null then
    v_since := (now() at time zone 'UTC')::date - (greatest(least(p_days, 365), 1) - 1);
    v_from  := v_since::timestamp at time zone 'UTC';
  end if;

  return query
  with firsts as (
    select distinct on (u.user_id) u.user_id, u.at
      from (
        select f.user_id, f.created_at as at from public.company_follows f
         where f.company_id = p_company
        union all
        select r.user_id, r.created_at from public.user_company_relationships r
         where r.company_slug = v_slug and r.is_following
      ) u
     order by u.user_id, u.at asc
  )
  select (f.at at time zone 'UTC')::date, count(*)
    from firsts f
   where v_from is null or f.at >= v_from
   group by 1 order by 1;
end $$;

revoke execute on function public.company_follower_growth(uuid, integer) from public, anon;
grant  execute on function public.company_follower_growth(uuid, integer) to authenticated;

-- ------------------------------------- per-item performance, with a window
-- company_post_engagement plus post_type, saves and a p_days slice, so the
-- content list can show lifetime AND recent for the same item. `posts` rows are
-- created on publication and published_at is NOT NULL, so there are no drafts
-- to filter out here and no NULLs to order around.
create or replace function public.company_content_performance(p_company uuid, p_days integer default 30, p_limit integer default 200)
returns table (
  post_id        uuid,
  title          text,
  post_type      text,
  published_at   timestamptz,
  reads          bigint,
  reads_recent   bigint,
  avg_dwell_secs numeric,    -- SECONDS, converted from the stored milliseconds.
  likes          bigint,
  saves          bigint,     -- currently saved
  save_actions   bigint      -- save presses ever
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text; v_since date; v_from timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  select c.slug into v_slug from public.companies c where c.id = p_company;
  -- NULL p_days = all time, in which case reads_recent equals reads by
  -- definition. The portal relabels the column rather than hiding it, so the
  -- two readings stay side by side and obviously identical.
  if p_days is not null then
    v_since := (now() at time zone 'UTC')::date - (greatest(least(p_days, 365), 1) - 1);
    v_from  := v_since::timestamp at time zone 'UTC';
  end if;

  return query
  select p.id, p.title, p.post_type, p.published_at,
         (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'open'),
         (select count(*) from public.post_events e
           where e.post_id = p.id and e.kind = 'open'
             and (v_from is null or e.created_at >= v_from)),
         (select round((avg(e.value) / 1000.0)::numeric, 1) from public.post_events e
           where e.post_id = p.id and e.kind = 'dwell' and e.value is not null),
         (select count(*) from public.post_likes l
           where l.company_slug = v_slug and l.post_key = p.id::text),
         (select count(*) from public.post_saves s
           where s.company_slug = v_slug and s.post_key = p.id::text),
         (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'save')
    from public.posts p
   where p.company_id = p_company and p.removed_at is null
   order by p.published_at desc
   limit greatest(least(p_limit, 500), 1);
end $$;

revoke execute on function public.company_content_performance(uuid, integer, integer) from public, anon;
grant  execute on function public.company_content_performance(uuid, integer, integer) to authenticated;

-- --------------------------------- the engagement the item list cannot show
-- See "WHY THE FOURTH ONE EXISTS" at the top. Everything else counts live posts
-- only so the totals equal the sum of the visible list; this is how the
-- remainder stays on screen rather than disappearing.
create or replace function public.company_engagement_unattributed(p_company uuid)
returns table (
  retired_posts bigint,   -- unpublished; removed_at set, reversible
  retired_reads bigint,
  retired_likes bigint,
  retired_saves bigint,
  orphan_likes  bigint,   -- post_key matches no row in posts at all
  orphan_saves  bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_slug text;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  select c.slug into v_slug from public.companies c where c.id = p_company;

  return query
  with every as (
    select p.id, p.id::text as key, p.removed_at
      from public.posts p where p.company_id = p_company
  ),
  retired as (select e.id, e.key from every e where e.removed_at is not null)
  select
    (select count(*) from retired),
    (select count(*) from retired r join public.post_events e on e.post_id = r.id
      where e.kind = 'open'),
    (select count(*) from retired r join public.post_likes l on l.post_key = r.key
      where l.company_slug = v_slug),
    (select count(*) from retired r join public.post_saves s on s.post_key = r.key
      where s.company_slug = v_slug),
    (select count(*) from public.post_likes l
      where l.company_slug = v_slug
        and not exists (select 1 from every e where e.key = l.post_key)),
    (select count(*) from public.post_saves s
      where s.company_slug = v_slug
        and not exists (select 1 from every e where e.key = s.post_key));
end $$;

revoke execute on function public.company_engagement_unattributed(uuid) from public, anon;
grant  execute on function public.company_engagement_unattributed(uuid) to authenticated;

commit;

-- ============================================================================
-- ROLLBACK -- additive, so this restores the database exactly.
-- ============================================================================
-- begin;
-- drop function if exists public.company_engagement_by_type(uuid, integer);
-- drop function if exists public.company_follower_growth(uuid, integer);
-- drop function if exists public.company_content_performance(uuid, integer, integer);
-- drop function if exists public.company_engagement_unattributed(uuid);
-- commit;


-- ======== 0065b_engagement_corrections.sql ========
-- ============================================================================
-- 0065b_engagement_corrections.sql — NOT APPLIED. Prepared for review.
--
-- THIS FILE CHANGES NUMBERS THAT ARE ALREADY ON SCREEN IN PRODUCTION.
-- Nothing here is additive. It replaces three APPLIED 0048 functions because
-- each one reports something the portal cannot show truthfully. 0065a is the
-- additive half and can be applied without this file; this file cannot
-- sensibly be applied without 0065a, because the corrected totals are only
-- checkable against the per-item list 0065a provides.
--
-- RETURN SHAPES ARE UNCHANGED, DELIBERATELY. `create or replace function`
-- cannot alter a function's return type, and a drop-then-create would leave a
-- window where the portal's RPC 404s. So every column stays exactly as 0048
-- declared it, byte for byte, and only the bodies change. That is also why
-- `save_actions` and the retired/orphan figures live in 0065a's new functions
-- instead of being added here as extra columns.
--
-- THE FOUR CORRECTIONS
-- --------------------
-- 1. DWELL IS STORED IN MILLISECONDS, REPORTED AS SECONDS.
--    src/aiBrief/Feed.jsx:195 is the only writer of a 'dwell' event, in
--    PostDetail's effect cleanup:
--        recordPostEvent(postId, "dwell", Math.round(Date.now() - openedAt.current))
--    openedAt is `useRef(Date.now())` (line 188), so `value` is a count of
--    MILLISECONDS. 0048 returns `round(avg(e.value), 1)` and names the column
--    avg_dwell_secs; the portal prints it as seconds. A 68-second read has
--    always displayed as 68,400.
--    Every row in the column is milliseconds -- one writer, one unit, since
--    0009 created the table -- so dividing by 1000 at read time converts the
--    whole history correctly and exactly once. There is no mixed-unit era to
--    detect and no backfill to run.
--    FIXED IN SQL, NOT IN THE CLIENT, ON PURPOSE. The native app is a Capacitor
--    build with webDir "dist" and no server.url, so its web bundle is COMPILED
--    INTO THE BINARY: a client-side change reaches a phone only when that phone
--    installs a new App Store build. Changing the writer would therefore put
--    seconds and milliseconds in the same column, indistinguishable, for as
--    long as any old build survives. The writer stays as it is.
--    NATIVE APP COMPATIBILITY: unaffected. Nothing in the investor app reads
--    avg_dwell_secs, or calls company_engagement_totals,
--    company_engagement_daily or company_post_engagement at all -- they are
--    reached only by src/lib/engagement.js, which only the company portal
--    (desktop, gated at >=1024px) imports. The app keeps WRITING the same
--    millisecond values it always has.
--
-- 2. SAVES WERE TWO DIFFERENT MEASUREMENTS ADDED TOGETHER.
--    0048 computed saves as `count(post_saves rows) + count('save' events)`.
--    Those are not the same quantity:
--      • post_saves is CURRENT STATE -- investorData.js savePost() inserts,
--        unsavePost() DELETES. It answers "is this saved right now".
--      • post_events kind='save' is a HISTORICAL ACTION, append-only;
--        PassportProto writes one on a feed save and 'unsave', though the CHECK
--        allows it, is emitted by nothing, so an event is never undone.
--    Summing them double counts anyone who saved on both surfaces and mixes a
--    state with an event log. Canonical definition adopted here and in 0065a:
--    `saves` = currently saved, from post_saves ALONE. Save presses are
--    reported separately as `save_actions` by 0065a's functions, and the two
--    are never summed. A feed save writes only an event -- the feed's own saved
--    list is device-local localStorage (savedStore, PassportProto.jsx:8099) and
--    never reaches the database -- so save_actions legitimately exceeds saves.
--
-- 3. RETIRED POSTS WERE COUNTED IN THE TOTALS BUT CANNOT BE IN THE LIST.
--    0048 counted opens, dwell and saves over ALL of a company's posts while
--    counting `posts` with `removed_at is null`. The portal's item list can
--    only show posts that are live, so a retired post's opens inflated the
--    total with nothing on screen to account for them.
--    POLICY, applied consistently across 0065a and 0065b: every figure counts
--    LIVE posts only, so the lifetime total equals the press/media split equals
--    the sum of the visible list -- an identity the reader can check by adding
--    up the column. Retired engagement is not discarded: 0065a's
--    company_engagement_unattributed returns it, and the portal prints it as
--    its own labelled line directly under the lifetime figures.
--    Note that removed_at is a REVERSIBLE hide, not a delete -- set on
--    PUBLICATION_UNPUBLISHED and cleared again on re-publish
--    (api/_listeners.js:31 and :64) -- so a company that unpublishes a post
--    will see its lifetime total fall and then recover. That is why the
--    retired line is shown rather than merely subtracted.
--
-- 4. ORPHANED post_keys WERE COUNTED BUT ARE ATTRIBUTABLE TO NOTHING.
--    post_likes and post_saves key content as (company_slug, post_key text)
--    with no foreign key, so a row can name a post_key matching no row in
--    `posts`. 0048 counted every such row for the slug. No item can ever
--    account for one, so these functions count only likes and saves that
--    resolve to a live post, and company_engagement_unattributed reports the
--    remainder as orphan_likes / orphan_saves.
--
-- THE WINDOW ARGUMENT
-- -------------------
-- p_days NULL means ALL TIME, matching 0065a. For this function that means the
-- series runs from the company's first recorded event to today instead of from
-- a fixed offset; see the body. A number is still clamped to [1, 365].
--
-- WINDOW BOUNDARY — EXPLICIT UTC
-- ------------------------------
-- company_engagement_daily bucketed by `(created_at at time zone 'UTC')::date`
-- but filtered on bare `current_date`, which resolves in the database's
-- TimeZone setting. On any project not set to UTC its buckets and its filter
-- disagreed, silently. Both are now explicit UTC, matching 0065a exactly, so no
-- window on the page depends on a GUC.
--
-- SCOPE
-- -----
-- Three function bodies. No table, column, index, policy or event kind. The
-- revoke/grant pairs are re-issued verbatim from 0048 for idempotence --
-- `create or replace` preserves existing privileges, so they are no-ops that
-- keep the file self-describing. NO OTHER FUNCTION'S GRANTS ARE TOUCHED.
-- ============================================================================

begin;

-- ------------------------------------------------------------------ totals
create or replace function public.company_engagement_totals(p_company uuid)
returns table (
  views            bigint,   -- impressions. Nothing emits one: structurally 0.
  reads            bigint,   -- opens: the investor actually opened it
  avg_dwell_secs   numeric,  -- SECONDS. The column stores milliseconds.
  followers        bigint,
  likes            bigint,
  saves            bigint,   -- CURRENTLY saved (post_saves). Not save presses.
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
  with mine as (
    select p.id, p.id::text as key
      from public.posts p
     where p.company_id = p_company and p.removed_at is null
  )
  select
    (select count(*) from mine m join public.post_events e on e.post_id = m.id
      where e.kind = 'impression'),
    (select count(*) from mine m join public.post_events e on e.post_id = m.id
      where e.kind = 'open'),
    (select round((avg(e.value) / 1000.0)::numeric, 1)
       from mine m join public.post_events e on e.post_id = m.id
      where e.kind = 'dwell' and e.value is not null),
    -- Two follow sources exist and a person may appear in both, so count
    -- DISTINCT users across the union rather than summing the two tables.
    -- Unchanged from 0048; it was already right.
    (select count(*) from (
        select f.user_id from public.company_follows f where f.company_id = p_company
        union
        select r.user_id from public.user_company_relationships r
         where r.company_slug = v_slug and r.is_following
     ) u),
    (select count(*) from mine m join public.post_likes l on l.post_key = m.key
      where l.company_slug = v_slug),
    (select count(*) from mine m join public.post_saves s on s.post_key = m.key
      where s.company_slug = v_slug),
    (select count(*) from mine);
end $$;

revoke execute on function public.company_engagement_totals(uuid) from public, anon;
grant  execute on function public.company_engagement_totals(uuid) to authenticated;

-- ------------------------------------------------------------------- daily
create or replace function public.company_engagement_daily(p_company uuid, p_days integer default 30)
returns table (day date, views bigint, reads bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_today date; v_since date; v_from timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
  end if;
  v_today := (now() at time zone 'UTC')::date;

  if p_days is null then
    -- ALL TIME. The series has to start somewhere, so it starts at this
    -- company's first recorded event rather than at an arbitrary date -- a
    -- company that published last week gets a one-week chart, not a decade of
    -- empty days. Capped at five years so one company's history can never
    -- return an unbounded number of rows.
    select min((e.created_at at time zone 'UTC')::date) into v_since
      from public.post_events e
      join public.posts p on p.id = e.post_id
     where p.company_id = p_company and p.removed_at is null;
    v_since := greatest(coalesce(v_since, v_today), v_today - 1825);
  else
    v_since := v_today - (greatest(least(p_days, 365), 1) - 1);
  end if;
  v_from := v_since::timestamp at time zone 'UTC';

  return query
  with span as (
    select generate_series(v_since, v_today, interval '1 day')::date as day
  ),
  ev as (
    select (e.created_at at time zone 'UTC')::date as day, e.kind
      from public.post_events e
      join public.posts p on p.id = e.post_id
     where p.company_id = p_company and p.removed_at is null
       and e.created_at >= v_from
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

-- --------------------------------------------------------- per release list
-- Superseded for the portal by 0065a's company_content_performance, but
-- corrected rather than left behind: a function reporting the same metric in a
-- different unit is a trap for whoever reads it next.
create or replace function public.company_post_engagement(p_company uuid, p_limit integer default 20)
returns table (
  post_id uuid, title text, published_at timestamptz,
  views bigint, reads bigint, avg_dwell_secs numeric, likes bigint
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
         (select round((avg(e.value) / 1000.0)::numeric, 1) from public.post_events e
           where e.post_id = p.id and e.kind = 'dwell' and e.value is not null),
         (select count(*) from public.post_likes l
           where l.company_slug = v_slug and l.post_key = p.id::text)
    from public.posts p
   where p.company_id = p_company and p.removed_at is null
   order by p.published_at desc
   limit greatest(least(p_limit, 500), 1);
end $$;

revoke execute on function public.company_post_engagement(uuid, integer) from public, anon;
grant  execute on function public.company_post_engagement(uuid, integer) to authenticated;

commit;

-- ============================================================================
-- ROLLBACK — restores 0048's bodies verbatim.
--
-- READ THIS BEFORE RUNNING IT. Rolling back is not a neutral revert: it puts
-- dwell back into milliseconds under a column named _secs (a 1000x
-- overstatement), restores the double-counted saves, and lets retired posts and
-- orphaned keys back into the totals so the page stops adding up. Roll back
-- only if one of the new bodies is actively wrong, and expect the portal's
-- numbers to jump when you do.
-- ============================================================================
-- begin;
-- create or replace function public.company_engagement_totals(p_company uuid)
-- returns table (
--   views bigint, reads bigint, avg_dwell_secs numeric,
--   followers bigint, likes bigint, saves bigint, posts bigint
-- )
-- language plpgsql stable security definer set search_path = public, pg_temp as $$
-- declare v_slug text;
-- begin
--   if not public.owns_company(p_company) then
--     raise exception 'not authorized for this company' using errcode = '42501';
--   end if;
--   select c.slug into v_slug from public.companies c where c.id = p_company;
--   return query
--   select
--     (select count(*) from public.post_events e
--        join public.posts p on p.id = e.post_id
--       where p.company_id = p_company and e.kind = 'impression'),
--     (select count(*) from public.post_events e
--        join public.posts p on p.id = e.post_id
--       where p.company_id = p_company and e.kind = 'open'),
--     (select round(avg(e.value)::numeric, 1) from public.post_events e
--        join public.posts p on p.id = e.post_id
--       where p.company_id = p_company and e.kind = 'dwell' and e.value is not null),
--     (select count(*) from (
--         select f.user_id from public.company_follows f where f.company_id = p_company
--         union
--         select r.user_id from public.user_company_relationships r
--          where r.company_slug = v_slug and r.is_following
--      ) u),
--     (select count(*) from public.post_likes l where l.company_slug = v_slug),
--     (select
--        (select count(*) from public.post_saves s where s.company_slug = v_slug)
--      + (select count(*) from public.post_events e
--           join public.posts p on p.id = e.post_id
--          where p.company_id = p_company and e.kind = 'save')),
--     (select count(*) from public.posts p
--       where p.company_id = p_company and p.removed_at is null);
-- end $$;
--
-- create or replace function public.company_engagement_daily(p_company uuid, p_days integer default 30)
-- returns table (day date, views bigint, reads bigint)
-- language plpgsql stable security definer set search_path = public, pg_temp as $$
-- begin
--   if not public.owns_company(p_company) then
--     raise exception 'not authorized for this company' using errcode = '42501';
--   end if;
--   return query
--   with span as (
--     select generate_series(
--       (current_date - (greatest(least(p_days, 365), 1) - 1))::date,
--       current_date, interval '1 day')::date as day
--   ),
--   ev as (
--     select (e.created_at at time zone 'UTC')::date as day, e.kind
--       from public.post_events e
--       join public.posts p on p.id = e.post_id
--      where p.company_id = p_company
--        and e.created_at >= current_date - (greatest(least(p_days, 365), 1) - 1)
--   )
--   select s.day,
--          count(*) filter (where ev.kind = 'impression'),
--          count(*) filter (where ev.kind = 'open')
--     from span s left join ev on ev.day = s.day
--    group by s.day order by s.day;
-- end $$;
--
-- create or replace function public.company_post_engagement(p_company uuid, p_limit integer default 20)
-- returns table (
--   post_id uuid, title text, published_at timestamptz,
--   views bigint, reads bigint, avg_dwell_secs numeric, likes bigint
-- )
-- language plpgsql stable security definer set search_path = public, pg_temp as $$
-- declare v_slug text;
-- begin
--   if not public.owns_company(p_company) then
--     raise exception 'not authorized for this company' using errcode = '42501';
--   end if;
--   select c.slug into v_slug from public.companies c where c.id = p_company;
--   return query
--   select p.id, p.title, p.published_at,
--          (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'impression'),
--          (select count(*) from public.post_events e where e.post_id = p.id and e.kind = 'open'),
--          (select round(avg(e.value)::numeric, 1) from public.post_events e
--            where e.post_id = p.id and e.kind = 'dwell' and e.value is not null),
--          (select count(*) from public.post_likes l
--            where l.company_slug = v_slug and l.post_key = p.id::text)
--     from public.posts p
--    where p.company_id = p_company and p.removed_at is null
--    order by p.published_at desc
--    limit greatest(least(p_limit, 500), 1);
-- end $$;
-- commit;
