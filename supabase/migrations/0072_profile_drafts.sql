-- 0072_profile_drafts.sql — company profile drafts, explicit publish, narrowed go-live
-- (a04 / d28 / d29). APPLIED TO STAGING ONLY (2026-10-31, guarded runner, no
-- egress); NOT applied to production. Verified by
-- scripts/profile-drafts-0072-check.mjs (rolled back; --pre for applied mode)
-- and scripts/profile-draft-live-test.mjs.
--
-- WHY. The portal editor PATCHed companies.profile directly, and anon can read
-- that whole column (0061b), so every save was instantly public (a04). The
-- companies UPDATE policy (0001 auth_update) admits only the owner, so every
-- other member's save matched zero rows and looked saved (d28). company_go_live
-- (0035) authorised with owns_company(), which admits ANY active member,
-- viewers included (d29).
--
-- APPROVED POLICY (2026-10-31):
--   draft    create / edit / save / preview / discard: the company's OWNER,
--            a company ADMIN or an EDITOR, and platform admins
--   publish  profile changes, and take the company live: the OWNER, a company
--            ADMIN, and platform admins
--   publishers, analysts, viewers, investors, other companies: neither
--
-- WHAT THIS ADDS
--   A. company_profile_drafts -- one draft per company, holding ONLY the fields
--      the profile editor owns ({projects, pp}). A separate table, never a key
--      inside companies.profile, so a draft can never be public. RLS on with no
--      client policies and no client grants: only the service role (api/
--      profile-draft.js, after its own role check) reaches it.
--   B. profile_actor_role(company, actor) -- the actor's effective role, with
--      'platform_admin' first. Service-role only (it describes any user).
--   C. profile_editor_fingerprint(profile) -- md5 of the editor-owned fields.
--      A draft records the live fingerprint it started from; publish refuses if
--      the live editor fields have changed since (a Company Memory rebuild, an
--      admin edit). Fields other services write -- timeline above all -- are
--      NOT in the fingerprint and are never touched by a publish.
--   D. load_ / save_ / publish_ / discard_profile_draft(...) -- SECURITY
--      DEFINER, service-role only, each re-checking the actor's role (the route
--      checks first; the database decides). Every refusal is an explicit
--      {ok:false, error}: forbidden, not_found, invalid, too_large, stale_base,
--      stale_draft, draft_missing, no_draft, live_changed.
--      publish is ONE function, so ONE transaction: snapshot the live profile
--      into company_profile_versions (0013), replace ONLY projects and pp on
--      the CURRENT live row, append to activity_log (0006), delete the draft.
--      Any failure rolls all four back.
--   E. company_go_live -- identical to 0035 except the authorisation line:
--      owner / company admin / platform admin instead of owns_company().
--
-- CHANGES NO existing table, column, policy or grant. Replaces one function
-- (company_go_live) with the same signature and grants.
-- ROLLBACK: supabase/rollbacks/0072_profile_drafts.rollback.sql

begin;

-- ---------------------------------------------------------------- A ---------
create table if not exists public.company_profile_drafts (
  company_id        uuid primary key references public.companies(id) on delete cascade,
  draft             jsonb not null,
  base_fingerprint  text not null,
  version           integer not null default 1 check (version >= 1),
  created_by        uuid references auth.users(id),
  updated_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint company_profile_drafts_shape check (
    jsonb_typeof(draft) = 'object' and draft ? 'pp' and draft ? 'projects'
    and jsonb_typeof(draft -> 'pp') = 'object'
    and jsonb_typeof(draft -> 'projects') in ('array', 'null')
  )
);
alter table public.company_profile_drafts enable row level security;
revoke all on public.company_profile_drafts from public, anon, authenticated;

-- ---------------------------------------------------------------- B ---------
create or replace function public.profile_actor_role(p_company uuid, p_actor uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_actor is null then null
    when exists (select 1 from public.profiles pr where pr.id = p_actor and pr.role = 'admin') then 'platform_admin'
    when exists (select 1 from public.companies c where c.id = p_company and c.owner_id = p_actor) then 'owner'
    else (select m.role from public.company_memberships m
           where m.company_id = p_company and m.user_id = p_actor and m.status = 'active'
           order by array_position(array['owner','admin','editor','publisher','analyst','viewer'], m.role)
           limit 1)
  end;
$$;

-- ---------------------------------------------------------------- C ---------
create or replace function public.profile_editor_fingerprint(p_profile jsonb)
returns text language sql immutable set search_path = public as $$
  select md5(coalesce(p_profile -> 'projects', 'null'::jsonb)::text || '|' || coalesce(p_profile -> 'pp', 'null'::jsonb)::text);
$$;

-- ---------------------------------------------------------------- D ---------
-- The editor's view: who you are here, the live profile, and the draft if any.
create or replace function public.load_profile_draft(p_company uuid, p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text; c public.companies; d public.company_profile_drafts;
begin
  select * into c from public.companies where id = p_company;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_role := public.profile_actor_role(p_company, p_actor);
  if v_role is null or v_role not in ('owner','admin','editor','platform_admin') then
    return jsonb_build_object('ok', false, 'error', 'forbidden', 'role', v_role);
  end if;
  select * into d from public.company_profile_drafts where company_id = p_company;
  return jsonb_build_object(
    'ok', true, 'role', v_role,
    'can_publish', v_role in ('owner','admin','platform_admin'),
    'company_status', c.status,
    'live', coalesce(c.profile, '{}'::jsonb),
    'live_fingerprint', public.profile_editor_fingerprint(c.profile),
    'live_updated_at', c.updated_at,
    'draft', case when d.company_id is null then null else jsonb_build_object(
      'draft', d.draft, 'version', d.version, 'base_fingerprint', d.base_fingerprint,
      'stale', d.base_fingerprint <> public.profile_editor_fingerprint(c.profile),
      'updated_by', d.updated_by, 'updated_at', d.updated_at, 'created_at', d.created_at) end
  );
end $$;

-- Save. Creating: p_expected_version is null and p_base_fingerprint is the
-- live fingerprint the editor loaded (it must still be current). Updating:
-- p_expected_version must equal the stored version (compare-and-set).
create or replace function public.save_profile_draft(
  p_company uuid, p_actor uuid, p_draft jsonb, p_expected_version integer, p_base_fingerprint text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text; c public.companies; d public.company_profile_drafts; v_now timestamptz := now();
begin
  select * into c from public.companies where id = p_company;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_role := public.profile_actor_role(p_company, p_actor);
  if v_role is null or v_role not in ('owner','admin','editor','platform_admin') then
    return jsonb_build_object('ok', false, 'error', 'forbidden', 'role', v_role);
  end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' or not (p_draft ? 'pp' and p_draft ? 'projects')
     or jsonb_typeof(p_draft -> 'pp') <> 'object' or jsonb_typeof(p_draft -> 'projects') not in ('array', 'null') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- Only the editor-owned keys are ever stored.
  p_draft := jsonb_build_object('projects', p_draft -> 'projects', 'pp', p_draft -> 'pp');
  if pg_column_size(p_draft) > 3 * 1024 * 1024 then return jsonb_build_object('ok', false, 'error', 'too_large'); end if;

  select * into d from public.company_profile_drafts where company_id = p_company for update;
  if not found then
    if p_expected_version is not null then
      -- The draft this editor was working on was published or discarded meanwhile.
      return jsonb_build_object('ok', false, 'error', 'draft_missing');
    end if;
    if p_base_fingerprint is distinct from public.profile_editor_fingerprint(c.profile) then
      return jsonb_build_object('ok', false, 'error', 'stale_base');
    end if;
    insert into public.company_profile_drafts (company_id, draft, base_fingerprint, version, created_by, updated_by, created_at, updated_at)
    values (p_company, p_draft, p_base_fingerprint, 1, p_actor, p_actor, v_now, v_now)
    on conflict (company_id) do nothing;
    if not found then   -- another first save won the race
      return jsonb_build_object('ok', false, 'error', 'stale_draft');
    end if;
    return jsonb_build_object('ok', true, 'version', 1, 'updated_at', v_now, 'created', true);
  end if;
  if p_expected_version is distinct from d.version then
    return jsonb_build_object('ok', false, 'error', 'stale_draft', 'version', d.version, 'updated_by', d.updated_by, 'updated_at', d.updated_at);
  end if;
  update public.company_profile_drafts
     set draft = p_draft, version = d.version + 1, updated_by = p_actor, updated_at = v_now
   where company_id = p_company;
  return jsonb_build_object('ok', true, 'version', d.version + 1, 'updated_at', v_now);
end $$;

-- Publish. ONE transaction: snapshot, live update (projects + pp only), audit,
-- draft removed. Refused unless the draft is at p_expected_version and the live
-- editor fields are still the ones the draft started from.
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

create or replace function public.discard_profile_draft(p_company uuid, p_actor uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text; d public.company_profile_drafts;
begin
  v_role := public.profile_actor_role(p_company, p_actor);
  if v_role is null or v_role not in ('owner','admin','editor','platform_admin') then
    return jsonb_build_object('ok', false, 'error', 'forbidden', 'role', v_role);
  end if;
  select * into d from public.company_profile_drafts where company_id = p_company for update;
  if not found then return jsonb_build_object('ok', true, 'already', true); end if;
  if p_expected_version is distinct from d.version then
    return jsonb_build_object('ok', false, 'error', 'stale_draft', 'version', d.version, 'updated_by', d.updated_by, 'updated_at', d.updated_at);
  end if;
  delete from public.company_profile_drafts where company_id = p_company;
  insert into public.activity_log (company_id, actor_id, actor_kind, action, entity, new_value, source)
  values (p_company, p_actor, case when v_role = 'platform_admin' then 'admin' else 'company' end,
          'profile_draft_discarded', 'profile', jsonb_build_object('draft_version', d.version, 'role', v_role), 'api');
  return jsonb_build_object('ok', true);
end $$;

-- Service role only: the route verifies the caller, then passes them as p_actor.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.profile_actor_role(uuid, uuid)',
    'public.load_profile_draft(uuid, uuid)',
    'public.save_profile_draft(uuid, uuid, jsonb, integer, text)',
    'public.publish_profile_draft(uuid, uuid, integer)',
    'public.discard_profile_draft(uuid, uuid, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- ---------------------------------------------------------------- E ---------
-- Identical to 0035 except the marked authorisation line.
create or replace function public.company_go_live(p_company_id uuid, p_version text)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare c public.companies;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  select * into c from public.companies where id = p_company_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  -- >>> 0072 (d29): owner / company admin / platform admin only. Was
  --     owns_company(), which admits every active member.
  if coalesce(public.profile_actor_role(p_company_id, auth.uid()), '') not in ('owner', 'admin', 'platform_admin') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- <<< 0072
  if c.status = 'published' then
    return jsonb_build_object('ok', true, 'status', 'published', 'already', true);  -- idempotent
  end if;
  if not public.company_has_agreement(p_company_id, p_version) then
    return jsonb_build_object('ok', false, 'error', 'agreement_required');
  end if;
  if not (public.is_admin() or public.company_has_feature(p_company_id, 'portal_access')) then
    return jsonb_build_object('ok', false, 'error', 'subscription_required');
  end if;
  -- Minimal quality gate: a public profile needs at least a company name.
  if coalesce(c.profile -> 'pp' -> 'COMPANY' ->> 'name', c.name, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'profile_incomplete');
  end if;

  perform set_config('app.provisioning', 'on', true);   -- transaction-local owner-guard bypass (see 0031)
  update public.companies set status = 'published' where id = p_company_id;

  return jsonb_build_object('ok', true, 'status', 'published');
end;
$function$;

grant execute on function public.company_go_live(uuid, text) to authenticated;

commit;
