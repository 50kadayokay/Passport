-- ============================================================================
-- 0019_news_ai.sql — AI-processing output columns for news_items (Stage 2/3).
--
-- Additive only. Populated by /api/news-process (relevance, extraction, company
-- linking, MineEx summary, fact-check, clustering). Still REVIEW-FIRST: processed
-- items move to status='review' (relevant) or status='rejected' (noise) — NEVER
-- 'live'. Nothing becomes public. Company links use the existing
-- news_item_companies table (company_id FK).
-- ============================================================================
alter table public.news_items add column if not exists relevant         boolean;
alter table public.news_items add column if not exists reject_reason     text;
alter table public.news_items add column if not exists commodities       text[] not null default '{}';
alter table public.news_items add column if not exists jurisdictions     text[] not null default '{}';
alter table public.news_items add column if not exists event_type        text;
alter table public.news_items add column if not exists stage             text;
alter table public.news_items add column if not exists materiality_score integer;
alter table public.news_items add column if not exists materiality_label text;
alter table public.news_items add column if not exists facts             jsonb not null default '{}'::jsonb;  -- ticker/project/numbers/dates/financing/grades/resources
alter table public.news_items add column if not exists fact_check        jsonb not null default '{}'::jsonb;  -- {verdict, confidence, notes, flagged[]}
alter table public.news_items add column if not exists cluster_key       text;                                 -- same-story grouping
alter table public.news_items add column if not exists is_canonical      boolean not null default false;       -- the representative item of a cluster
alter table public.news_items add column if not exists processed_at      timestamptz;
alter table public.news_items add column if not exists ai_model          text;

create index if not exists news_items_cluster_idx    on public.news_items (cluster_key);
create index if not exists news_items_relevant_idx   on public.news_items (relevant, materiality_score desc);
