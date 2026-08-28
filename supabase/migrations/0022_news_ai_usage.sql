-- ============================================================================
-- 0022_news_ai_usage.sql — AI cost safeguards: usage ledger + reprocess guards.
--
-- Adds:
--   1) news_ai_usage — one row per Anthropic call, recording ACTUAL token usage
--      returned by the API (input/output/cache) plus computed cost. This is the
--      source of truth for the daily spend ceiling and the admin usage panel.
--   2) news_items.processing_version — the prompt/pipeline version that last
--      SUCCESSFULLY processed the item. Used to skip already-completed items so
--      we never silently re-bill for regenerating them.
--   3) news_items.retry_count / last_error — bounded retries: a failing item is
--      counted and skipped once it hits the cap, so no loop can keep paying to
--      retry the same broken item.
-- Admin-read via the existing public.is_admin(); writes are service-role only.
-- ============================================================================

alter table public.news_items
  add column if not exists processing_version text,
  add column if not exists retry_count        integer not null default 0,
  add column if not exists last_error          text;

create table if not exists public.news_ai_usage (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  news_item_id       uuid references public.news_items(id) on delete set null,
  operation          text not null,            -- e.g. 'news-process', 'news-reprocess'
  model              text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd           numeric(12,6) not null default 0,
  cost_is_actual     boolean not null default false,  -- true = derived from API-returned usage
  processing_version text
);

create index if not exists news_ai_usage_created_idx on public.news_ai_usage (created_at desc);
create index if not exists news_ai_usage_item_idx    on public.news_ai_usage (news_item_id);

alter table public.news_ai_usage enable row level security;

-- Admins can read the ledger; nobody else can. Service role bypasses RLS for writes.
drop policy if exists news_ai_usage_admin_read on public.news_ai_usage;
create policy news_ai_usage_admin_read on public.news_ai_usage
  for select to authenticated using (public.is_admin());

grant select on public.news_ai_usage to authenticated;  -- gated to admins by policy
