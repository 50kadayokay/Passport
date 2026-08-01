-- 0012_company_blueprints.sql
-- Two-Blueprint draft system — Phase 1 (ADDITIVE, non-destructive).
--
-- Adds ONE new table (`company_blueprints`) holding editable REVIEW drafts that sit in
-- front of the live company profile. Phase 1 does NOT compile Blueprint data back into
-- `companies.profile` — it is a safe, versioned workspace only.
--
-- SELF-CONTAINED: defines its own updated_at trigger and an RLS predicate that depends
-- ONLY on `public.is_admin()` (already used by the live `companies` RLS) and
-- `companies.owner_id`. No dependency on can_touch_company / touch_updated_at, so it
-- applies cleanly regardless of which earlier helper migrations are present.
--
-- Changes NO existing table, policy, function, or behaviour. Idempotent: safe to re-run.
-- Rollback: `drop table if exists public.company_blueprints cascade;
--            drop function if exists public.company_blueprints_set_updated_at();`

begin;

create table if not exists public.company_blueprints (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  blueprint_type   text not null check (blueprint_type in ('passport','conference')),
  template_key     text not null,
  template_version text not null,
  status           text not null default 'draft'
                   check (status in ('draft','in_review','approved','archived')),
  data             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id),
  updated_by       uuid references auth.users(id),
  unique (company_id, blueprint_type, template_version)
);

create index if not exists company_blueprints_company_idx on public.company_blueprints (company_id);
create index if not exists company_blueprints_type_idx    on public.company_blueprints (company_id, blueprint_type);

-- Own updated_at trigger (no dependency on public.touch_updated_at).
create or replace function public.company_blueprints_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists company_blueprints_touch on public.company_blueprints;
create trigger company_blueprints_touch before update on public.company_blueprints
  for each row execute function public.company_blueprints_set_updated_at();

-- ============================================================
-- RLS — authenticated owner or platform admin only. NO anon policy → anon is
-- default-denied, so Blueprint drafts are never publicly readable and never surface
-- through the public (published-only) company read path.
-- ============================================================
alter table public.company_blueprints enable row level security;

do $$
declare p record;
begin
  for p in (select policyname from pg_policies
            where schemaname='public' and tablename='company_blueprints')
  loop execute format('drop policy %I on public.company_blueprints', p.policyname); end loop;
end $$;

-- Predicate: platform admin OR the company's owner. Reused verbatim for read + write.
create policy "blueprint_owner_admin_read" on public.company_blueprints
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.companies c
               where c.id = company_blueprints.company_id and c.owner_id = auth.uid())
  );

create policy "blueprint_owner_admin_write" on public.company_blueprints
  for all to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.companies c
               where c.id = company_blueprints.company_id and c.owner_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.companies c
               where c.id = company_blueprints.company_id and c.owner_id = auth.uid())
  );

-- Nudge PostgREST to pick up the new table immediately.
notify pgrst, 'reload schema';

commit;
