-- ============================================================================
-- 0074_profile_revision_history.sql — a05. APPLIED TO STAGING ONLY (2026-10-31); NOT production.
-- Verified in rolled-back staging transactions by
-- scripts/profile-history-0074-check.mjs. Requires 0072.
--
-- APPROVED POLICY (2026-10-31):
--   view history + restore a version INTO A DRAFT: the company's OWNER, a
--     company ADMIN or an EDITOR, and platform admins (= the draft roles)
--   publish the restored draft: OWNER, company ADMIN, platform admin -- the
--     ordinary 0072 publish, unchanged
--   publishers, analysts, viewers, investors, other companies: no access
--   RETENTION: every snapshot created by publishing is kept, never pruned.
--
-- WHY A COLUMN AND A TRIGGER. Inspection (2026-10-31) found publish history
-- could be silently deleted: src/lib/profileSafety.js saveProfileSafely() (the
-- admin Account Management save) calls pruneVersions(company, 20), which
-- deletes a company's OLDEST snapshots whatever made them; and 0013's delete
-- policy lets an owner delete snapshots directly. A free-text note cannot
-- protect anything (an owner can write the same note), so:
--   A. company_profile_versions.kind: 'manual' (default: admin/conference
--      tooling snapshots, as today) or 'publish' (written only by
--      publish_profile_draft). Existing rows noted 'before profile publish'
--      are back-filled to 'publish'.
--   B. clients may insert only kind = 'manual' (0013 insert policy + check).
--   C. a BEFORE DELETE trigger refuses to delete a 'publish' snapshot while
--      its company exists -- for every role, the service role included.
--      Deleting the company itself still cascades (the company row is gone
--      by the time the cascade reaches the snapshot).
--   D. publish_profile_draft: 0072's body verbatim except kind = 'publish'.
--   E. list / get / restore functions: SECURITY DEFINER, service-role only,
--      each re-checking profile_actor_role (0072). Restore writes ONLY the
--      editor-owned fields ({projects, pp}) from the snapshot into the DRAFT
--      -- compare-and-set like a save; a new draft's base fingerprint is the
--      CURRENT live one, so publishing still refuses if live changes first --
--      and records it in activity_log, in one transaction. The live profile is
--      never touched; making it live is the ordinary reviewed publish.
--
-- RLS on company_profile_versions is otherwise unchanged (still owner /
-- platform admin for direct access, as the admin tools need); company admins
-- and editors read history only through these functions.
-- ROLLBACK: supabase/rollbacks/0074_profile_revision_history.rollback.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------- A ---------
alter table public.company_profile_versions
  add column if not exists kind text not null default 'manual';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'company_profile_versions_kind_ck') then
    alter table public.company_profile_versions
      add constraint company_profile_versions_kind_ck check (kind in ('manual', 'publish'));
  end if;
end $$;
update public.company_profile_versions set kind = 'publish'
 where note = 'before profile publish' and kind <> 'publish';
create index if not exists company_profile_versions_company_kind_idx
  on public.company_profile_versions (company_id, kind, created_at desc);

-- ---------------------------------------------------------------- B ---------
drop policy if exists "profile_versions_insert" on public.company_profile_versions;
create policy "profile_versions_insert" on public.company_profile_versions
  for insert to authenticated
  with check (
    kind = 'manual'
    and (public.is_admin()
         or exists (select 1 from public.companies c
                    where c.id = company_profile_versions.company_id and c.owner_id = auth.uid()))
  );

-- ---------------------------------------------------------------- C ---------
create or replace function public.profile_versions_keep_publish()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.kind = 'publish' and exists (select 1 from public.companies c where c.id = old.company_id) then
    raise exception 'publish history is retained: snapshot % cannot be deleted', old.id using errcode = '42501';
  end if;
  return old;
end $$;
drop trigger if exists profile_versions_keep_publish on public.company_profile_versions;
create trigger profile_versions_keep_publish
  before delete on public.company_profile_versions
  for each row execute function public.profile_versions_keep_publish();

-- Kind cannot be changed after the fact either (no UPDATE policy exists for
-- clients; this covers the service role and admins).
create or replace function public.profile_versions_kind_frozen()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'a snapshot''s kind cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists profile_versions_kind_frozen on public.company_profile_versions;
create trigger profile_versions_kind_frozen
  before update of kind on public.company_profile_versions
  for each row execute function public.profile_versions_kind_frozen();

-- ---------------------------------------------------------------- D ---------
-- 0072's publish_profile_draft, verbatim except the marked insert.
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

  -- >>> 0074: the snapshot is marked kind = 'publish' (retained; never pruned).
  insert into public.company_profile_versions (company_id, slug, profile, note, created_by, kind)
  values (c.id, c.slug, coalesce(c.profile, '{}'::jsonb), 'before profile publish', p_actor, 'publish');
  -- <<< 0074

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

-- ---------------------------------------------------------------- E ---------
-- History for the editor: newest first. Metadata only (the snapshot body is
-- fetched one version at a time). by_label: the actor's email, or 'MineEx'
-- for a platform admin.
create or replace function public.list_profile_versions(p_company uuid, p_actor uuid, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text;
begin
  v_role := public.profile_actor_role(p_company, p_actor);
  if v_role is null or v_role not in ('owner','admin','editor','platform_admin') then
    return jsonb_build_object('ok', false, 'error', 'forbidden', 'role', v_role);
  end if;
  if not exists (select 1 from public.companies where id = p_company) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'versions', coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object(
               'id', v.id, 'created_at', v.created_at, 'kind', v.kind, 'note', v.note,
               'by_label', case when pr.role = 'admin' then 'MineEx' else coalesce(pr.email, 'Unknown') end) x
        from public.company_profile_versions v
        left join public.profiles pr on pr.id = v.created_by
       where v.company_id = p_company
       order by v.created_at desc
       limit greatest(least(coalesce(p_limit, 50), 200), 1)
    ) t), '[]'::jsonb));
end $$;

-- One version's editor-owned fields, for preview. Never the whole profile:
-- the editor shows only what a restore would bring back.
create or replace function public.get_profile_version(p_company uuid, p_actor uuid, p_version uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text; v public.company_profile_versions;
begin
  v_role := public.profile_actor_role(p_company, p_actor);
  if v_role is null or v_role not in ('owner','admin','editor','platform_admin') then
    return jsonb_build_object('ok', false, 'error', 'forbidden', 'role', v_role);
  end if;
  select * into v from public.company_profile_versions where id = p_version and company_id = p_company;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'id', v.id, 'created_at', v.created_at, 'kind', v.kind,
    'fields', jsonb_build_object('projects', case when jsonb_typeof(v.profile -> 'projects') = 'array' then v.profile -> 'projects' else 'null'::jsonb end,
                                 'pp', case when jsonb_typeof(v.profile -> 'pp') = 'object' then v.profile -> 'pp' else '{}'::jsonb end));
end $$;

-- Restore = put that version's editor-owned fields into the DRAFT.
-- p_expected_version: the draft version the editor is looking at, or null when
-- there is no draft (then a new draft is based on the CURRENT live fields).
create or replace function public.restore_profile_version_to_draft(
  p_company uuid, p_actor uuid, p_version uuid, p_expected_version integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text; c public.companies; v public.company_profile_versions; d public.company_profile_drafts;
        v_fields jsonb; v_now timestamptz := now(); v_new integer;
begin
  v_role := public.profile_actor_role(p_company, p_actor);
  if v_role is null or v_role not in ('owner','admin','editor','platform_admin') then
    return jsonb_build_object('ok', false, 'error', 'forbidden', 'role', v_role);
  end if;
  select * into c from public.companies where id = p_company;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v from public.company_profile_versions where id = p_version and company_id = p_company;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_fields := jsonb_build_object(
    'projects', case when jsonb_typeof(v.profile -> 'projects') = 'array' then v.profile -> 'projects' else 'null'::jsonb end,
    'pp',       case when jsonb_typeof(v.profile -> 'pp') = 'object' then v.profile -> 'pp' else '{}'::jsonb end);

  select * into d from public.company_profile_drafts where company_id = p_company for update;
  if not found then
    if p_expected_version is not null then
      return jsonb_build_object('ok', false, 'error', 'draft_missing');
    end if;
    insert into public.company_profile_drafts (company_id, draft, base_fingerprint, version, created_by, updated_by, created_at, updated_at)
    values (p_company, v_fields, public.profile_editor_fingerprint(c.profile), 1, p_actor, p_actor, v_now, v_now)
    on conflict (company_id) do nothing;
    if not found then return jsonb_build_object('ok', false, 'error', 'stale_draft'); end if;
    v_new := 1;
  else
    if p_expected_version is distinct from d.version then
      return jsonb_build_object('ok', false, 'error', 'stale_draft', 'version', d.version, 'updated_by', d.updated_by, 'updated_at', d.updated_at);
    end if;
    update public.company_profile_drafts
       set draft = v_fields, version = d.version + 1, updated_by = p_actor, updated_at = v_now
     where company_id = p_company;
    v_new := d.version + 1;
  end if;

  insert into public.activity_log (company_id, actor_id, actor_kind, action, entity, new_value, source)
  values (p_company, p_actor, case when v_role = 'platform_admin' then 'admin' else 'company' end,
          'profile_version_restored_to_draft', 'profile',
          jsonb_build_object('version_id', v.id, 'version_created_at', v.created_at, 'draft_version', v_new, 'role', v_role), 'api');
  return jsonb_build_object('ok', true, 'version', v_new, 'restored_from', v.id, 'restored_from_at', v.created_at);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.list_profile_versions(uuid, uuid, integer)',
    'public.get_profile_version(uuid, uuid, uuid)',
    'public.restore_profile_version_to_draft(uuid, uuid, uuid, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

commit;
