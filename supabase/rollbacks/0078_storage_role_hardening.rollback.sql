-- Rollback for 0078_storage_role_hardening.sql: restores the policies exactly as
-- 0037 (media_write_own), 0038 (privmedia_company_delete) and 0040
-- (docs_upload_own, docs_delete_authorized, privmedia_write, privmedia_update)
-- left them, and drops can_upload_company_assets(). Re-opens the a24 gaps.
begin;

drop policy if exists "media_write_own" on storage.objects;
create policy "media_write_own" on storage.objects for insert
  to authenticated
  with check (bucket_id in ('company-media', 'company-logos')
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "docs_upload_own" on storage.objects;
create policy "docs_upload_own" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-docs'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "docs_delete_authorized" on storage.objects;
create policy "docs_delete_authorized" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'company-docs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_touch_company(public.docs_path_company(name))
    )
  );

drop policy if exists "privmedia_write" on storage.objects;
create policy "privmedia_write" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-media-private'
              and ((storage.foldername(name))[1] = auth.uid()::text
                   or public.can_touch_company(public.docs_path_company(name))));

drop policy if exists "privmedia_update" on storage.objects;
create policy "privmedia_update" on storage.objects for update
  to authenticated
  using (bucket_id = 'company-media-private'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or public.can_touch_company(public.docs_path_company(name))));

drop policy if exists "privmedia_company_delete" on storage.objects;
create policy "privmedia_company_delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'company-media-private'
         and public.can_touch_company(public.docs_path_company(name)));

drop function if exists public.can_upload_company_assets();

commit;
