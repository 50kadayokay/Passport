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
