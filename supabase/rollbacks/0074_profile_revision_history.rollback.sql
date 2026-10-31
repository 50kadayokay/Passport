-- ROLLBACK for 0074_profile_revision_history.sql (a05). Restores 0072's
-- publish_profile_draft and 0013's insert policy VERBATIM, removes the history
-- functions, the retention/kind triggers, the index, the constraint and the
-- kind column. Snapshot ROWS are kept (only their kind label is dropped).
-- Verified in a rolled-back transaction by scripts/profile-history-0074-check.mjs.
begin;
drop function if exists public.restore_profile_version_to_draft(uuid, uuid, uuid, integer);
drop function if exists public.get_profile_version(uuid, uuid, uuid);
drop function if exists public.list_profile_versions(uuid, uuid, integer);

-- 0072's publish_profile_draft, verbatim:
create or replace function public.publish_profile_draft(p_company uuid, p_actor uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text; c public.companies; d public.company_profile_drafts; v_before text; v_after text;
begin
  v_role := public.profile_actor_role(p_company, p_actor);
  if v_role is null or v_role not in ('owner','admin','platform_admin') then
    return jsonb_build_object('ok', false, 'error', 'forbidden', 'role', v_role);
  end if;
  select * into c from public.companies where id = p_company for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into d from public.company_profile_drafts where company_id = p_company for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_draft'); end if;
  if p_expected_version is distinct from d.version then
    return jsonb_build_object('ok', false, 'error', 'stale_draft', 'version', d.version, 'updated_by', d.updated_by, 'updated_at', d.updated_at);
  end if;
  v_before := public.profile_editor_fingerprint(c.profile);
  if v_before <> d.base_fingerprint then
    return jsonb_build_object('ok', false, 'error', 'live_changed');
  end if;

  insert into public.company_profile_versions (company_id, slug, profile, note, created_by)
  values (c.id, c.slug, coalesce(c.profile, '{}'::jsonb), 'before profile publish', p_actor);

  update public.companies
     set profile = coalesce(profile, '{}'::jsonb) || jsonb_build_object('projects', d.draft -> 'projects', 'pp', d.draft -> 'pp')
   where id = p_company
  returning public.profile_editor_fingerprint(profile) into v_after;

  insert into public.activity_log (company_id, actor_id, actor_kind, action, entity, old_value, new_value, source)
  values (c.id, p_actor, case when v_role = 'platform_admin' then 'admin' else 'company' end,
          'profile_published', 'profile',
          jsonb_build_object('fingerprint', v_before),
          jsonb_build_object('fingerprint', v_after, 'draft_version', d.version, 'role', v_role),
          'api');

  delete from public.company_profile_drafts where company_id = p_company;
  return jsonb_build_object('ok', true, 'fingerprint', v_after, 'published_version', d.version);
end $$;

drop trigger if exists profile_versions_kind_frozen on public.company_profile_versions;
drop function if exists public.profile_versions_kind_frozen();
drop trigger if exists profile_versions_keep_publish on public.company_profile_versions;
drop function if exists public.profile_versions_keep_publish();

-- 0013's insert policy, verbatim:
drop policy if exists "profile_versions_insert" on public.company_profile_versions;
create policy "profile_versions_insert" on public.company_profile_versions
  for insert to authenticated
  with check (
    public.is_admin()
    or exists (select 1 from public.companies c
               where c.id = company_profile_versions.company_id and c.owner_id = auth.uid())
  );

drop index if exists public.company_profile_versions_company_kind_idx;
alter table public.company_profile_versions drop constraint if exists company_profile_versions_kind_ck;
alter table public.company_profile_versions drop column if exists kind;
commit;
