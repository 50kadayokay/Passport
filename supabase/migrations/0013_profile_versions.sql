-- 0013_profile_versions.sql
-- Profile version history — a per-company safety net so any profile change is
-- recoverable (the "go back to how it was N hours/days ago" guarantee).
--
-- ADDITIVE / non-destructive: adds ONE new table (`company_profile_versions`) that
-- stores immutable timestamped snapshots of `companies.profile`. Nothing writes here
-- automatically at the DB level — the admin app snapshots the CURRENT profile into this
-- table immediately BEFORE it overwrites `companies.profile` (see src/lib/profileVersions.js),
-- and can restore any snapshot in one click.
--
-- Changes NO existing table, policy, function, or behaviour. Idempotent: safe to re-run.
-- RLS depends ONLY on public.is_admin() and companies.owner_id (same predicate shape as
-- 0012), so it applies cleanly regardless of which helper migrations are present.
--
-- Rollback: drop table if exists public.company_profile_versions cascade;
--           drop function if exists public.company_profile_versions_no_update();

begin;

create table if not exists public.company_profile_versions (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  slug         text not null,
  profile      jsonb not null,
  note         text,                       -- e.g. "before conference publish", "before restore"
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);

create index if not exists company_profile_versions_company_idx
  on public.company_profile_versions (company_id, created_at desc);

-- ============================================================
-- RLS — authenticated owner or platform admin only. NO anon policy → anon is
-- default-denied, so snapshots (which contain the full profile) are never public.
-- Snapshots are append-only history: INSERT + SELECT + DELETE (for pruning) are
-- allowed to owner/admin; UPDATE is denied so a snapshot can never be silently rewritten.
-- ============================================================
alter table public.company_profile_versions enable row level security;

do $$
declare p record;
begin
  for p in (select policyname from pg_policies
            where schemaname='public' and tablename='company_profile_versions')
  loop execute format('drop policy %I on public.company_profile_versions', p.policyname); end loop;
end $$;

-- Shared predicate: platform admin OR the company's owner.
create policy "profile_versions_read" on public.company_profile_versions
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.companies c
               where c.id = company_profile_versions.company_id and c.owner_id = auth.uid())
  );

create policy "profile_versions_insert" on public.company_profile_versions
  for insert to authenticated
  with check (
    public.is_admin()
    or exists (select 1 from public.companies c
               where c.id = company_profile_versions.company_id and c.owner_id = auth.uid())
  );

-- Pruning old snapshots (keep the most recent N) is a DELETE, allowed to owner/admin.
create policy "profile_versions_delete" on public.company_profile_versions
  for delete to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.companies c
               where c.id = company_profile_versions.company_id and c.owner_id = auth.uid())
  );

-- No UPDATE policy → snapshots are immutable once written.

commit;
