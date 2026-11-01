-- 0078_storage_role_hardening.sql — APPLIED TO STAGING ONLY (2026-11-01, guarded runner;
-- file sha256 d107871bd6f114a0... at apply, this header line aside); NOT production.
-- Requires 0076 (has_company_role). Verified in a rolled-back staging transaction
-- by scripts/storage-role-0078-check.mjs; live behaviour by
-- scripts/storage-write-isolation-test.mjs (run with --strict after applying).
-- ROLLBACK: supabase/rollbacks/0078_storage_role_hardening.rollback.sql
--
-- WHY (a24, found by storage-write-isolation-test on staging 2026-11-01).
-- 0076 brought the TABLE policies to the approved a03 role matrix, but the
-- storage.objects policies still use can_touch_company(), which admits ANY active
-- member. So a read-only analyst or viewer could DELETE company documents and
-- private media, and an analyst could WRITE private media. Separately, the public
-- buckets (company-media, company-logos) and company-docs accepted uploads from
-- ANY signed-in account into its own folder -- every free investor account could
-- put files in the public bucket. Cross-company isolation was already intact.
--
-- WHAT. Writes and deletes follow the a03 drafting roles (owner, admin, editor,
-- publisher; platform admins via has_company_role):
--   company-media / company-logos  INSERT: own folder, AND company staff
--                                  (drafting role in any company) or platform admin.
--   company-docs                   INSERT: own folder AND drafting role in the
--                                  company named by the path. DELETE: own upload,
--                                  or drafting role in that company.
--   company-media-private          INSERT / UPDATE / DELETE: drafting role in the
--                                  path's company.
-- Reads, the uploader-folder UPDATE/DELETE on public buckets, and
-- message-attachments are unchanged. The investor app never writes to storage.
begin;

create or replace function public.can_upload_company_assets()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.company_memberships m
                  where m.user_id = auth.uid() and m.status = 'active'
                    and m.role in ('owner','admin','editor','publisher'))
      or exists (select 1 from public.companies c where c.owner_id = auth.uid());
$$;
revoke all on function public.can_upload_company_assets() from public, anon;
grant execute on function public.can_upload_company_assets() to authenticated, service_role;

drop policy if exists "media_write_own" on storage.objects;
create policy "media_write_own" on storage.objects for insert
  to authenticated
  with check (bucket_id in ('company-media', 'company-logos')
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.can_upload_company_assets());

drop policy if exists "docs_upload_own" on storage.objects;
create policy "docs_upload_own" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-docs'
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.has_company_role(public.docs_path_company(name), array['owner','admin','editor','publisher']));

drop policy if exists "docs_delete_authorized" on storage.objects;
create policy "docs_delete_authorized" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'company-docs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.has_company_role(public.docs_path_company(name), array['owner','admin','editor','publisher'])
    )
  );

drop policy if exists "privmedia_write" on storage.objects;
create policy "privmedia_write" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-media-private'
              and public.has_company_role(public.docs_path_company(name), array['owner','admin','editor','publisher']));

drop policy if exists "privmedia_update" on storage.objects;
create policy "privmedia_update" on storage.objects for update
  to authenticated
  using (bucket_id = 'company-media-private'
         and public.has_company_role(public.docs_path_company(name), array['owner','admin','editor','publisher']));

drop policy if exists "privmedia_company_delete" on storage.objects;
create policy "privmedia_company_delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'company-media-private'
         and public.has_company_role(public.docs_path_company(name), array['owner','admin','editor','publisher']));

commit;
