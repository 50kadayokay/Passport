-- ROLLBACK for 0063 (from its own notes). Restores 0047's policies and the
-- full unique (investor_id, company_slug) constraint. sender_company_id is
-- KEPT (dropping it deletes company-started threads). If 0076 is applied, roll
-- it back first. Fails (unique violation) if an investor has more than one
-- thread with a company -- resolve those rows first.
-- Beyond 0063's own notes (gaps found by the round-trip test): 0063 also
-- rewrote msg_select_company (restored to 0047 verbatim) and replaced
-- can_touch_conversation (restored to 0062 verbatim).
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
drop policy if exists conv_insert_company        on public.conversations;
drop policy if exists msg_insert_sender_company  on public.messages;
drop policy if exists conv_select_company        on public.conversations;
create policy conv_select_company on public.conversations
  for select using (public.owns_company_slug(company_slug));
drop index if exists uq_conv_investor_thread;
drop index if exists uq_conv_company_thread;
alter table public.conversations
  add constraint conversations_investor_id_company_slug_key unique (investor_id, company_slug);
drop policy if exists msg_select_company on public.messages;
create policy msg_select_company on public.messages
  for select using (
    exists (select 1 from public.conversations c
             where c.id = conversation_id
               and public.owns_company_slug(c.company_slug))
  );
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
commit;
