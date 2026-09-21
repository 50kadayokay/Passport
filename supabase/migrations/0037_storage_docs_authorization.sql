-- 0037_storage_docs_authorization.sql
-- SECURITY CORRECTION — private company documents.
--
-- THE PROBLEM
-- -----------
-- 0002 granted every authenticated user SELECT on all three buckets:
--
--   create policy "pp_auth_read" on storage.objects for select to authenticated
--     using (bucket_id in ('company-media','company-logos','company-docs'));
--
-- No company predicate. Any signed-in user — including any investor — could read
-- any object in `company-docs` for any company, given the path. That bucket holds
-- 327 recorded documents: technical reports, financials, MD&A, financing papers.
-- Unpredictable UUID paths are obscurity, not authorization.
--
-- THE GOVERNING PRINCIPLE
-- -----------------------
--   COMPANY OWNS THE RESOURCE.  USER PERFORMS THE ACTION.
--
-- Read access derives from:
--   storage object → documents record → company_id → can_touch_company()
--
-- Uploader identity is NOT an authorization mechanism anywhere below. "Uploaded
-- this once" must never imply "may read this forever", and a user who leaves a
-- company must lose access to its documents immediately.
--
-- WHY BOTH OLD SELECT POLICIES ARE DROPPED
-- ----------------------------------------
-- Permissive RLS policies OR together. Adding a narrow policy while leaving
-- pp_auth_read in place would leave the broad path completely intact. The old
-- SELECT policies are REPLACED, never supplemented.
--
-- WHY WRITE POLICIES ARE SPLIT PER BUCKET
-- ---------------------------------------
-- The two public buckets are written as `<uid>/<file>` by uploadToBucket() — one
-- folder segment, and it is a USER id. company-docs is written as a company path.
-- A single "folder is the company" rule would therefore break every logo and
-- media upload, so the buckets get separate write rules and the public ones keep
-- their existing uid behaviour byte-for-byte.
--
-- EFFECT ON ORPHANS
-- -----------------
-- 74 objects (125.5 MB) have no documents row — files left behind because
-- deleteDocument() removed the row and not the object. They become unreadable
-- except to the service role. Intended: they are abandoned, and nothing
-- references them. They are NOT deleted here.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

begin;

-- ============================================================
-- 0) helpers
-- ============================================================

-- Cast that yields null instead of raising. A policy that throws is a broken
-- query, not a denied one, so every cast of untrusted path text goes through this.
create or replace function public.safe_uuid(t text)
returns uuid language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

-- The company that owns a company-docs object, read from its path.
--
--   new     <company_id>/<uuid>.ext              folders = {company_id}
--   legacy  <uid>/<company_id>/<ts>-<name>.ext   folders = {uid, company_id}
--
-- In BOTH conventions the company is the LAST folder segment, so one expression
-- covers old and new objects and no existing file has to be moved.
-- Returns null for anything unparseable; can_touch_company(null) is false.
create or replace function public.docs_path_company(objname text)
returns uuid language sql stable as $$
  select public.safe_uuid(
    (storage.foldername(objname))[array_length(storage.foldername(objname), 1)]
  );
$$;

-- The SELECT policy joins documents on storage_path for every object read.
create index if not exists documents_storage_path_idx
  on public.documents (storage_path);

-- ============================================================
-- 1) remove the broad reads and the all-bucket write rules
-- ============================================================
drop policy if exists "pp_public_read" on storage.objects;
drop policy if exists "pp_auth_read"   on storage.objects;
drop policy if exists "pp_upload_own"  on storage.objects;
drop policy if exists "pp_update_own"  on storage.objects;
drop policy if exists "pp_delete_own"  on storage.objects;

-- ============================================================
-- 2) public buckets — behaviour unchanged
-- ============================================================
-- The investor app renders logos and media directly; they stay world-readable.
create policy "media_public_read" on storage.objects for select
  to anon, authenticated
  using (bucket_id in ('company-media', 'company-logos'));

-- Writes stay exactly as they were: your own uid folder.
create policy "media_write_own" on storage.objects for insert
  to authenticated
  with check (bucket_id in ('company-media', 'company-logos')
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "media_update_own" on storage.objects for update
  to authenticated
  using (bucket_id in ('company-media', 'company-logos')
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "media_delete_own" on storage.objects for delete
  to authenticated
  using (bucket_id in ('company-media', 'company-logos')
         and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 3) company-docs — private, company-derived
-- ============================================================

-- READ: through the document record only. No path shortcut, no uploader clause.
create policy "docs_company_read" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'company-docs'
    and exists (
      select 1
        from public.documents d
       where d.storage_path = 'company-docs/' || storage.objects.name
         and public.can_touch_company(d.company_id)   -- owner or admin, evaluated NOW
    )
  );

-- WRITE: into a company you are authorized for. Deliberately NOT the documents
-- join — the row does not exist yet when the bytes are uploaded, and making the
-- write depend on it would force either a permanent uploader exception or a
-- fragile two-phase insert. The path carries the company, so authorization is
-- still "company owns the resource", never "who uploaded it".
create policy "docs_company_insert" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-docs'
              and public.can_touch_company(public.docs_path_company(name)));

create policy "docs_company_update" on storage.objects for update
  to authenticated
  using (bucket_id = 'company-docs'
         and public.can_touch_company(public.docs_path_company(name)));

-- DELETE is path-derived on purpose. deleteDocument() removes the row FIRST (so a
-- failure can only orphan a file, never leave a live row pointing at a missing
-- one), which means the documents row is already gone when the object delete
-- runs. It also fixes a real gap: under the old uid rule a company owner could
-- not delete a document an admin had uploaded on their behalf.
create policy "docs_company_delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'company-docs'
         and public.can_touch_company(public.docs_path_company(name)));

commit;

-- ============================================================
-- VERIFY (read-only — run after applying)
-- ============================================================
-- Expect exactly these 8, and NO pp_* rows:
--   select policyname, roles, cmd from pg_policies
--    where schemaname='storage' and tablename='objects' order by policyname;
--   -- docs_company_delete, docs_company_insert, docs_company_read,
--   -- docs_company_update, media_delete_own, media_public_read,
--   -- media_update_own, media_write_own
--
-- Path helper handles both conventions (expect the same company uuid twice):
--   select public.docs_path_company('11111111-1111-1111-1111-111111111111/a.pdf'),
--          public.docs_path_company('99999999-9999-9999-9999-999999999999/11111111-1111-1111-1111-111111111111/b.pdf'),
--          public.docs_path_company('not-a-uuid/x.pdf');   -- expect null
--
-- Index present:
--   select indexname from pg_indexes
--    where tablename='documents' and indexname='documents_storage_path_idx';
