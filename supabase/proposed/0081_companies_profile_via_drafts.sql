-- ============================================================================
-- 0081_companies_profile_via_drafts.sql — PROPOSED, NOT APPLIED. Drafted by S1
-- (2026-11-02) for review. It lives in supabase/proposed/ so the production
-- runner and the manifest do not see it until S4 adopts it: move it to
-- supabase/migrations/ with its rollback, add it to the manifest's PENDING,
-- give the runner a marker, and apply it to staging only after approval.
--
-- WHAT: the draft-and-publish workflow becomes the ONLY way a company user
-- changes a company's PUBLIC profile. A company user's direct PostgREST write
-- of companies.profile on a PUBLISHED company is refused (42501, which
-- PostgREST returns as 403) instead of landing.
--
-- WHY A TRIGGER, NOT A COLUMN REVOKE. Platform admins write companies.profile
-- through PostgREST as `authenticated` too (the admin console's updateCompany,
-- profileSafety, blueprint publish/revert, version restore). Revoking
-- UPDATE(profile) from authenticated would break all of them. The trigger
-- separates the callers exactly:
--   * current_user is the SQL role running the statement. A PostgREST request
--     with a user's JWT runs as `authenticated`. Inside a SECURITY DEFINER
--     function it is the function's owner, so every definer RPC that writes
--     companies (publish_profile_draft, upsert_timeline_entry,
--     remove_timeline_entry, company_go_live, accept_company_invitation,
--     admin_provision_company, admin_set_billing, stripe_apply_event) passes.
--     So do service-role routes (memory-save, build-from-website,
--     stripe-webhook, news-process) and migrations.
--   * public.is_admin() admits platform admins (profiles.role = 'admin'), as
--     the 0001 policies do.
--   * Only rows that are ALREADY published are guarded: a company still in
--     onboarding (draft / ready) has no public profile, and the self-serve
--     builder keeps saving it directly.
--
-- PART 2 closes the matching INSERT gap: 0001's auth_insert lets any signed-in
-- account insert a row it owns with ANY status, so a direct POST could create
-- a company that is published (and public) at once. No client does that: the
-- builder inserts draft/ready, ensureCompany inserts draft, and the admin
-- console runs as a platform admin.
--
-- WHAT THIS BREAKS (company users on PUBLISHED companies, all via
-- src/lib/portal.js updateCompanyProfile or a direct upsert):
--   * native ?manage= editor: PassportProto.jsx saveCompany (S3 is moving it
--     to drafts);
--   * portal CalendarView save (catalysts), QRShareView logo pick/clear, and
--     BriefReview save;
--   * the builder (Onboarding.jsx sbSaveProfile) re-saving a published
--     company. That already fails today unless the status sent equals the
--     stored one: company_owner_guard (0030) refuses status changes.
-- These are exactly the paths that should go through save_profile_draft /
-- publish_profile_draft. Nothing a platform admin, a definer RPC or the
-- service role does is affected.
--
-- Rollback: supabase/proposed/0081_companies_profile_via_drafts.rollback.sql
-- ============================================================================

begin;

-- SECURITY INVOKER on purpose: current_user must be the caller's role. As a
-- definer function it would always read as its owner and admit everyone.
create or replace function public.companies_profile_via_drafts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Definer RPCs (their owner), service_role, migrations: not a company user's direct write.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'published' and new.profile is distinct from old.profile then
      raise exception 'companies.profile of a published company changes only through the draft workflow'
        using errcode = '42501',
              hint = 'Save a draft and publish it (save_profile_draft, then publish_profile_draft).';
    end if;
  elsif tg_op = 'INSERT' then
    if new.status = 'published' then
      raise exception 'a company is published by MineEx (company_go_live or a platform admin), not on insert'
        using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.companies_profile_via_drafts() from public, anon, authenticated;

drop trigger if exists trg_companies_profile_via_drafts on public.companies;
create trigger trg_companies_profile_via_drafts
  before insert or update of profile on public.companies
  for each row execute function public.companies_profile_via_drafts();

commit;
