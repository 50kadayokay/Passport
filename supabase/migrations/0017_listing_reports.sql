-- ============================================================================
-- 0017_listing_reports.sql — corrections & claim requests for basic company listings.
--
-- Auto-generated "community listing" pages carry legal risk if a fact is wrong. This
-- table is the correction/takedown + claim-lead mechanism: anyone (signed in or not)
-- can SUBMIT a report ("this is wrong") or a claim ("this is my company"). Nobody can
-- READ the table via the client — the operator reviews rows with the service role in
-- the Supabase dashboard. Insert-only-for-the-public is the safe shape.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.listing_reports (
  company_slug text not null,
  company_name text,
  kind         text not null default 'error',   -- 'error' (correction) | 'claim'
  message      text,
  contact      text,                              -- optional email/phone the submitter leaves
  user_id      uuid,                              -- set when a signed-in investor submits
  created_at   timestamptz not null default now(),
  id           uuid primary key default gen_random_uuid()
);
create index if not exists idx_listing_reports_slug on public.listing_reports (company_slug);

alter table public.listing_reports enable row level security;

-- The public may INSERT (submit) but never SELECT/UPDATE/DELETE. No select policy exists,
-- so RLS denies all reads to anon/authenticated; only the service role (dashboard) reads.
revoke all on public.listing_reports from anon, authenticated;
grant insert on public.listing_reports to anon, authenticated;

drop policy if exists listing_reports_insert on public.listing_reports;
create policy listing_reports_insert on public.listing_reports
  for insert to anon, authenticated with check (true);
