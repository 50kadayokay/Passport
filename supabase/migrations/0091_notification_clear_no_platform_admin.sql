-- ============================================================================
-- 0091_notification_clear_no_platform_admin.sql — NOT APPLIED. Prepared for review (S3).
--
-- "Clear all" on the company's Notifications page: platform admins no longer
-- clear a company's notifications by being platform admins.
--
-- DECISION (user, 2026-11-01): "preserve the pre-existing restriction: platform
-- admins should not be able to clear a company's notifications unless
-- explicitly authorized within that company."
--
-- WHAT CHANGES
-- ------------
-- 0090 checked has_company_role(p_company, array['owner','admin']), and
-- has_company_role() appends 'platform_admin' to every role list (0076), so a
-- platform admin could clear any company's page. 0064's owns_company() never
-- admitted them; that is the restriction being kept.
--
-- The check is now spelled out: the company's owner_id, or an ACTIVE owner or
-- admin membership of p_company. A platform admin passes only through one of
-- those, held themselves. profile_actor_role() is not used either: it answers
-- 'platform_admin' before looking at memberships (0072), so it would hide a
-- platform admin's own admin membership.
--
-- Everyone else -- editor, publisher, analyst, viewer, another company, an
-- investor, a platform admin without that membership, anon -- gets 42501 and
-- nothing is written.
--
-- WHAT DOES NOT CHANGE
-- --------------------
--   * The body below is 0090's verbatim apart from the one check.
--   * Signature, security definer, search_path, the 42501 refusal and grants.
--   * Every member still reads the list; mark_notifications_seen() is untouched.
--   * Platform admins keep every other power has_company_role() gives them.
--
-- Needs: 0090 (and so 0064, 0076).
-- ROLLBACK: supabase/rollbacks/0091_notification_clear_no_platform_admin.rollback.sql
-- Verified in a rolled-back transaction by scripts/notifications-clear-0091-check.mjs.
-- ============================================================================

begin;

create or replace function public.mark_notifications_cleared(p_company uuid)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_now timestamptz;
begin
  -- THE ONLY CHANGE FROM 0090 (was: has_company_role(p_company, array['owner','admin']),
  -- which also admits every platform admin).
  if not (exists (select 1 from public.companies c
                   where c.id = p_company and c.owner_id = auth.uid())
          or exists (select 1 from public.company_memberships m
                      where m.company_id = p_company and m.user_id = auth.uid()
                        and m.status = 'active' and m.role in ('owner','admin'))) then
    raise exception 'not authorized to clear this company''s notifications' using errcode = '42501';
  end if;

  v_now := now();
  insert into public.company_notification_reads (company_id, seen_at, cleared_at)
       values (p_company, v_now, v_now)
  on conflict (company_id) do update
    set cleared_at = excluded.cleared_at,
        seen_at    = excluded.seen_at;     -- clearing implies having seen them
  return v_now;
end $$;

revoke execute on function public.mark_notifications_cleared(uuid) from public, anon;
grant  execute on function public.mark_notifications_cleared(uuid) to authenticated;

commit;
