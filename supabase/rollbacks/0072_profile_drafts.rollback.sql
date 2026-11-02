-- ROLLBACK for 0072_profile_drafts.sql. Restores company_go_live exactly as 0035
-- defined it (owns_company), then removes everything 0072 added.
-- WARNING: dropping company_profile_drafts discards any unpublished drafts.
-- Verified in a rolled-back transaction by scripts/profile-drafts-0072-check.mjs.

begin;

-- company_go_live, verbatim from 0035_company_agreements_golive.sql:
create or replace function public.company_go_live(p_company_id uuid, p_version text)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare c public.companies;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  select * into c from public.companies where id = p_company_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if not (public.owns_company(p_company_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
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

drop function if exists public.discard_profile_draft(uuid, uuid, integer);
drop function if exists public.publish_profile_draft(uuid, uuid, integer);
drop function if exists public.save_profile_draft(uuid, uuid, jsonb, integer, text);
drop function if exists public.load_profile_draft(uuid, uuid);
drop function if exists public.profile_editor_fingerprint(jsonb);
drop function if exists public.profile_actor_role(uuid, uuid);
drop table if exists public.company_profile_drafts;

commit;
