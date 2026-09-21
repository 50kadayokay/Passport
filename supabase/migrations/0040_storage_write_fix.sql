-- 0040_storage_write_fix.sql
-- FIX: 0037 broke document uploads.
--
-- WHAT WENT WRONG
-- ---------------
-- 0037 correctly closed a real hole: pp_auth_read let ANY authenticated user read
-- ANY company's private documents. That fix is right and is NOT touched here.
--
-- But 0037 also replaced the WRITE policies, swapping "you may write into your own
-- uid folder" for "the company id in the path must pass can_touch_company()". Real
-- uploads then failed with:
--
--   403 Unauthorized — new row violates row-level security policy (AccessDenied)
--
-- even for a company OWNER who is also a platform ADMIN, with a path whose company
-- segment resolved correctly (verified: docs_path_company() returns the right uuid,
-- companies.owner_id matches the uploader, profiles.role = 'admin'). The write check
-- could not be satisfied from inside the storage RLS context.
--
-- WHY THE WRITE RULE GOES BACK
-- ----------------------------
-- Writes were never the vulnerability. Writing a file into your own folder leaks
-- nothing: the object is unreadable until a `documents` row points at it, and READ
-- authorization — the thing that actually mattered — still derives from
-- documents → company_id → can_touch_company(). Tightening the write path bought no
-- security and cost the feature.
--
-- So: INSERT and UPDATE go back to the uid-folder rule that every one of the 401
-- existing objects already satisfies. DELETE accepts EITHER rule, because a company
-- owner must be able to delete a document an admin uploaded on their behalf, and
-- deleteDocument() removes the `documents` row first (so a documents-join test would
-- have nothing left to match by the time the object delete runs).
--
-- Paths stay `<uid>/<company_id>/<file>`. The company id is still the LAST folder
-- segment, which is what docs_path_company() reads, so read authorization is
-- unchanged and no existing object has to move.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

begin;

-- 0037's company-path write rules, which are what broke uploads.
drop policy if exists "docs_company_insert" on storage.objects;
drop policy if exists "docs_company_update" on storage.objects;
drop policy if exists "docs_company_delete" on storage.objects;

-- The policies THIS file creates. Dropped first so the whole migration can be
-- re-run safely: without these, a second run fails with "policy already exists"
-- and the transaction rolls back, which makes "just run it again" unreliable
-- exactly when you are trying to confirm whether it ever applied.
drop policy if exists "docs_upload_own" on storage.objects;
drop policy if exists "docs_update_own" on storage.objects;
drop policy if exists "docs_delete_authorized" on storage.objects;
drop policy if exists "privmedia_write" on storage.objects;
drop policy if exists "privmedia_update" on storage.objects;

-- WRITE: your own folder. Identical to the pre-0037 rule that worked.
create policy "docs_upload_own" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-docs'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "docs_update_own" on storage.objects for update
  to authenticated
  using (bucket_id = 'company-docs'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- DELETE: your own folder OR any object belonging to a company you are authorized
-- for. The second arm is what lets an owner clean up admin-uploaded documents.
create policy "docs_delete_authorized" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'company-docs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_touch_company(public.docs_path_company(name))
    )
  );

-- The private media bucket has the same shape, so give it the same treatment
-- before it hits the identical wall. mediaAssets.js writes company-first paths,
-- so the uploader arm is added rather than swapped in.
drop policy if exists "privmedia_company_insert" on storage.objects;
drop policy if exists "privmedia_company_update" on storage.objects;

create policy "privmedia_write" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-media-private'
              and ((storage.foldername(name))[1] = auth.uid()::text
                   or public.can_touch_company(public.docs_path_company(name))));

create policy "privmedia_update" on storage.objects for update
  to authenticated
  using (bucket_id = 'company-media-private'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or public.can_touch_company(public.docs_path_company(name))));

commit;

-- ============================================================
-- UNCHANGED, AND STILL THE POINT OF 0037
-- ============================================================
-- docs_company_read      — company-docs readable only via documents → company
-- privmedia_company_read — private media readable only via media_assets → company
-- media_public_read      — company-media / company-logos stay public
--
-- VERIFY:
--   select policyname, cmd from pg_policies
--    where schemaname='storage' and tablename='objects' order by cmd, policyname;
--   -- INSERT: docs_upload_own, media_write_own, privmedia_write
--   -- UPDATE: docs_update_own, media_update_own, privmedia_update
--   -- DELETE: docs_delete_authorized, media_delete_own, privmedia_company_delete
--   -- SELECT: docs_company_read, media_public_read, privmedia_company_read
