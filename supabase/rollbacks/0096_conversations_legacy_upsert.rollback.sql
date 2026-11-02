-- ROLLBACK for 0096_conversations_legacy_upsert.sql. Returns conversations to
-- the post-0063 shape: company threads store the acting user in investor_id,
-- investor_id is NOT NULL again, and the partial uq_conv_investor_thread replaces
-- the full constraint. mineex.ca/app's investor send fails again (42P10).
--
-- A company thread whose started_by is NULL (its starter's account was deleted)
-- cannot be given an investor_id; it is deleted, as 0063's shape would have
-- deleted it through the investor_id cascade.
begin;

-- Safe on a database where 0096 never ran: the column exists for the statements
-- below and is dropped again at the end.
alter table public.conversations add column if not exists started_by uuid;

delete from public.conversations
 where sender_company_id is not null and investor_id is null and started_by is null;
-- Orphaned company threads (sending company deleted) carry no person either.
delete from public.conversations
 where sender_company_id is null and investor_id is null;

alter table public.conversations drop constraint if exists conversations_company_thread_no_investor;
alter table public.conversations drop constraint if exists conversations_investor_id_company_slug_key;

update public.conversations
   set investor_id = started_by
 where sender_company_id is not null and investor_id is null;

alter table public.conversations alter column investor_id set not null;

create unique index if not exists uq_conv_investor_thread
  on public.conversations (investor_id, company_slug)
  where sender_company_id is null;

drop index if exists public.idx_conv_started_by;
alter table public.conversations drop column if exists started_by;

commit;
