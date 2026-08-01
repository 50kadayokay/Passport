-- 0012_company_blueprints.sql
-- Two-Blueprint draft system — Phase 1 (ADDITIVE, non-destructive).
--
-- Adds ONE new table (`company_blueprints`) that holds editable REVIEW drafts which
-- sit in front of the live company profile. Phase 1 does NOT compile Blueprint data
-- back into `companies.profile` — it is a safe, versioned workspace only.
--
-- Changes NO existing table, policy, function, or behaviour. Depends on 0001
-- (touch_updated_at, is_admin) and 0005 (can_touch_company = owns_company OR is_admin).
-- Run in Supabase -> SQL Editor. Idempotent: safe to re-run.
--
-- Rollback: `drop table if exists public.company_blueprints cascade;`

begin;

create table if not exists public.company_blueprints (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  -- Which of the two Blueprints this row is.
  blueprint_type   text not null check (blueprint_type in ('passport','conference')),
  -- The template family + version this draft was projected from. Older versions are
  -- never mutated when a new version is introduced (unique key below enforces this).
  template_key     text not null,
  template_version text not null,
  status           text not null default 'draft'
                   check (status in ('draft','in_review','approved','archived')),
  -- The whole Blueprint projection: { fields:{}, pools:{}, pageOrder:[], meta:{} }.
  -- No base64 media is stored here — only references/URLs already flushed to Storage.
  data             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id),
  updated_by       uuid references auth.users(id),
  -- One draft per (company, type, template version) — supports future versions
  -- side-by-side without overwriting an older one.
  unique (company_id, blueprint_type, template_version)
);

create index if not exists company_blueprints_company_idx on public.company_blueprints (company_id);
create index if not exists company_blueprints_type_idx    on public.company_blueprints (company_id, blueprint_type);

-- ============================================================
-- RLS — authenticated owner/admin only. NO anon policy → anon is default-denied,
-- so Blueprint drafts are never publicly readable and never surface through the
-- public (published-only) company read path.
-- ============================================================
alter table public.company_blueprints enable row level security;

do $$
declare p record;
begin
  for p in (select policyname from pg_policies
            where schemaname='public' and tablename='company_blueprints')
  loop execute format('drop policy %I on public.company_blueprints', p.policyname); end loop;
end $$;

-- can_touch_company(cid) = owns_company(cid) OR is_admin()  (defined in 0005).
create policy "blueprint_touchable_read" on public.company_blueprints
  for select to authenticated
  using (public.can_touch_company(company_id));

create policy "blueprint_touchable_write" on public.company_blueprints
  for all to authenticated
  using (public.can_touch_company(company_id))
  with check (public.can_touch_company(company_id));

drop trigger if exists company_blueprints_touch on public.company_blueprints;
create trigger company_blueprints_touch before update on public.company_blueprints
  for each row execute function public.touch_updated_at();

commit;
