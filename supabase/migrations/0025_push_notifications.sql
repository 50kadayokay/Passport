-- ============================================================================
-- 0025_push_notifications.sql — device tokens + delivery outbox for push.
--
-- Backend half of "follow a company → get pushed its news". Additive; touches no
-- shipped behavior. The CLIENT half (Capacitor push plugin + APNs entitlement)
-- is a later app build. Fan-out logic lives in api/news-notify.js; the actual
-- APNs send drains public.notification_outbox.
--
--   push_tokens          — one row per (user, device token). User-owned (RLS).
--   notification_outbox  — one queued push per (news_item, user, token).
--                          Service-role only; idempotent via the unique key.
--   news_items.push_notified_at — set once an item has been fanned out (so the
--                          fan-out never double-enqueues).
-- ============================================================================
begin;

-- 1) DEVICE TOKENS -----------------------------------------------------------
create table if not exists public.push_tokens (
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text not null default 'ios' check (platform in ('ios','web','android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
create index if not exists idx_push_tokens_user on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon;
grant select, insert, update, delete on public.push_tokens to authenticated;
drop policy if exists push_tokens_own_select on public.push_tokens;
create policy push_tokens_own_select on public.push_tokens for select using (auth.uid() = user_id);
drop policy if exists push_tokens_own_insert on public.push_tokens;
create policy push_tokens_own_insert on public.push_tokens for insert with check (auth.uid() = user_id);
drop policy if exists push_tokens_own_update on public.push_tokens;
create policy push_tokens_own_update on public.push_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists push_tokens_own_delete on public.push_tokens;
create policy push_tokens_own_delete on public.push_tokens for delete using (auth.uid() = user_id);

drop trigger if exists trg_touch_push_tokens on public.push_tokens;
create trigger trg_touch_push_tokens before update on public.push_tokens
  for each row execute function public.touch_updated_at();

-- 2) DELIVERY OUTBOX ---------------------------------------------------------
-- Service-role only (the fan-out writes it, the sender drains it). No client
-- access at all. The unique key makes re-runs idempotent (never double-send).
create table if not exists public.notification_outbox (
  id           uuid primary key default gen_random_uuid(),
  news_item_id uuid not null references public.news_items(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  token        text not null,
  platform     text not null default 'ios',
  title        text not null,
  body         text not null,
  data         jsonb not null default '{}'::jsonb,
  status       text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts     int  not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  unique (news_item_id, user_id, token)
);
create index if not exists idx_outbox_pending on public.notification_outbox (status, created_at) where status = 'pending';

alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;   -- service role only

-- 3) FAN-OUT MARKER ----------------------------------------------------------
alter table public.news_items add column if not exists push_notified_at timestamptz;

commit;
