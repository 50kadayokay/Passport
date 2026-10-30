-- BATCH 2: 0001_security_lockdown.sql .. 0002_storage.sql (2 files)

-- ======== 0001_security_lockdown.sql ========
-- 0001_security_lockdown.sql
-- Milestone 1 — Security Lockdown & RLS Hardening
--
-- Makes `companies` safe to expose publicly:
--   • anon (public) can read ONLY published companies
--   • writes require an authenticated session; owners touch only their own row
--   • admins (is_admin()) can read/write/delete anything
--   • removes the permissive prototype anon-write policies
-- Also adds indexes + an updated_at auto-touch trigger.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

-- ---------- updated_at auto-touch ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists companies_touch on public.companies;
create trigger companies_touch before update on public.companies
  for each row execute function public.touch_updated_at();

-- ---------- indexes ----------
create index if not exists companies_owner_idx  on public.companies (owner_id);
create index if not exists companies_status_idx on public.companies (status);
create unique index if not exists companies_slug_key on public.companies (slug);

-- ---------- reset ALL companies policies to the locked-down set ----------
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'companies'
  loop execute format('drop policy %I on public.companies', p.policyname); end loop;
end $$;

alter table public.companies enable row level security;

-- public / anon: read ONLY published companies
create policy "public_read_published" on public.companies
  for select to anon
  using (status = 'published');

-- authenticated: own rows (any status) + published + admin sees all
create policy "auth_read" on public.companies
  for select to authenticated
  using (owner_id = auth.uid() or status = 'published' or public.is_admin());

-- authenticated: create only a row you own (or admin)
create policy "auth_insert" on public.companies
  for insert to authenticated
  with check (owner_id = auth.uid() or public.is_admin());

-- authenticated: update only your own row (or admin)
create policy "auth_update" on public.companies
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

-- admin-only delete
create policy "admin_delete" on public.companies
  for delete to authenticated
  using (public.is_admin());


-- ======== 0002_storage.sql ========
-- 0002_storage.sql
-- Milestone 2 — Asset Storage
--
-- Buckets for company assets + RLS so authenticated users can only write into
-- their own folder (path = "${uid}/..."). Media + logos are publicly readable
-- (they render in the app); docs are private (for AI onboarding later).
--
-- Run in Supabase → SQL Editor. Idempotent.

insert into storage.buckets (id, name, public) values
  ('company-media', 'company-media', true),
  ('company-logos', 'company-logos', true),
  ('company-docs',  'company-docs',  false)
on conflict (id) do nothing;

-- reset any prior policies for these buckets
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects'
           and policyname in ('pp_public_read','pp_auth_read','pp_upload_own','pp_update_own','pp_delete_own')
  loop execute format('drop policy %I on storage.objects', p.policyname); end loop;
end $$;

-- public read for media + logos (rendered in the app)
create policy "pp_public_read" on storage.objects for select to anon
  using (bucket_id in ('company-media','company-logos'));

-- authenticated can read all three (incl. private docs)
create policy "pp_auth_read" on storage.objects for select to authenticated
  using (bucket_id in ('company-media','company-logos','company-docs'));

-- writes: only into your own top-level folder (first path segment = your uid)
create policy "pp_upload_own" on storage.objects for insert to authenticated
  with check (bucket_id in ('company-media','company-logos','company-docs')
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pp_update_own" on storage.objects for update to authenticated
  using (bucket_id in ('company-media','company-logos','company-docs')
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pp_delete_own" on storage.objects for delete to authenticated
  using (bucket_id in ('company-media','company-logos','company-docs')
         and (storage.foldername(name))[1] = auth.uid()::text);
