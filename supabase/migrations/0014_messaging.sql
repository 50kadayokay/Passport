-- ============================================================================
-- 0014_messaging.sql — Investor ↔ Company messaging (CEO email bridge).
--
-- The investor sees a normal in-app chat with "the company". Under the hood:
--   • investor sends  → row in `messages` (sender='investor') + an email to the
--                       company's CEO (done by /api/messages-send).
--   • CEO replies to that email → the inbound webhook (/api/messages-inbound)
--     inserts a row (sender='company') via the SERVICE ROLE, so it appears in
--     the investor's thread.
--
-- An investor may only ever hold a conversation with a COMPANY (one per company).
-- `ceo_email` is resolved server-side from the company's profile — never trusted
-- from the client — so the app can't be used to email arbitrary addresses.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  investor_id     uuid not null references auth.users(id) on delete cascade,
  company_slug    text not null,
  company_name    text,
  ceo_email       text,                                   -- delivery target (server-set)
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (investor_id, company_slug)                      -- one thread per (investor, company)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender          text not null check (sender in ('investor','company')),
  body            text not null,
  email_id        text,                                   -- provider msg id (inbound dedupe)
  created_at      timestamptz not null default now()
);

create index if not exists idx_messages_conv     on public.messages(conversation_id, created_at);
create index if not exists idx_conv_investor      on public.conversations(investor_id, last_message_at desc);
create unique index if not exists uq_messages_email on public.messages(email_id) where email_id is not null;

alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- Investors see & create only their own conversations. (Company-side inserts and
-- ceo_email are done by the service role in the serverless functions, which
-- bypasses RLS — so nothing sensitive is writable from the browser.)
drop policy if exists conv_select on public.conversations;
create policy conv_select on public.conversations for select using (auth.uid() = investor_id);

drop policy if exists msg_select on public.messages;
create policy msg_select on public.messages for select using (
  exists (select 1 from public.conversations c
          where c.id = conversation_id and c.investor_id = auth.uid())
);

-- Keep last_message_at fresh so the conversation list sorts by recency.
create or replace function public.bump_conversation() returns trigger
language plpgsql security definer as $$
begin
  update public.conversations set last_message_at = now() where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists trg_bump_conversation on public.messages;
create trigger trg_bump_conversation after insert on public.messages
  for each row execute function public.bump_conversation();

-- (The investor's open thread refreshes by short-interval polling — no realtime
-- publication needed, so this migration stays safely re-runnable.)
