-- 0010_publish_lockdown.sql — CHECKPOINT 6: close the direct client publish path.
--
-- Apply ONLY after a green production smoke test through /api/publish (done), and
-- re-run the smoke test afterward. Replaces the permissive 0005 "owner_all" policy
-- on publications with granular policies whose WITH CHECK forbids clients ever
-- writing status='published'. The publish_publication() RPC is SECURITY DEFINER and
-- bypasses RLS, so /api/publish remains the ONE publish path; everything else can
-- only touch drafts. Idempotent. Run in Supabase -> SQL Editor.

begin;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='publications'
  loop execute format('drop policy %I on public.publications', p.policyname); end loop;
end $$;

create policy "pub_select" on public.publications for select to authenticated
  using (public.can_touch_company(company_id));
create policy "pub_insert" on public.publications for insert to authenticated
  with check (public.can_touch_company(company_id) and status <> 'published');
create policy "pub_update" on public.publications for update to authenticated
  using (public.can_touch_company(company_id))
  with check (public.can_touch_company(company_id) and status <> 'published');
create policy "pub_delete" on public.publications for delete to authenticated
  using (public.can_touch_company(company_id));

commit;
