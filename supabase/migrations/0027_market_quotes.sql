-- ============================================================================
-- 0027_market_quotes.sql — delayed market quotes for the watchlist / "your
-- companies today" / price alerts. Provider-agnostic: a daily cron writes one
-- row per tracked symbol; the app reads the public view.
--
-- DELAYED / END-OF-DAY data only (avoids real-time exchange redistribution
-- licensing). Show a "delayed" label in the UI. Market data (last price, EOD
-- OHLC) is factual public data; we store the latest snapshot, not a redistributed
-- real-time feed.
-- ============================================================================
begin;

-- Optional per-company override of the data-provider symbol, for the microcaps
-- where auto-mapping (primary_ticker → SYM.V) is wrong. Null = derive in code.
alter table public.companies add column if not exists market_symbol text;

create table if not exists public.quotes (
  symbol       text primary key,              -- provider symbol, e.g. 'AGAG.V'
  company_id   uuid references public.companies(id) on delete set null,
  exchange     text,                          -- TSXV | TSX | CSE
  price        numeric,
  currency     text,
  change       numeric,                       -- absolute day change
  change_pct   numeric,                        -- percent day change
  prev_close   numeric,
  open         numeric,
  high         numeric,
  low          numeric,
  volume       bigint,
  as_of        date,                           -- the trading day this reflects
  is_delayed   boolean not null default true,
  provider     text,                           -- which source produced it
  updated_at   timestamptz not null default now()
);
create index if not exists quotes_company_idx on public.quotes (company_id);

-- RLS: quotes are public (delayed) market data → readable by everyone; only the
-- service role writes (the cron), which bypasses RLS.
alter table public.quotes enable row level security;
revoke all on public.quotes from anon, authenticated;
grant select on public.quotes to anon, authenticated;
drop policy if exists quotes_public_read on public.quotes;
create policy quotes_public_read on public.quotes for select to anon, authenticated using (true);

commit;
