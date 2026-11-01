-- ============================================================================
-- 0090_notification_clear_roles.sql — NOT APPLIED. Prepared for review (S3).
--
-- "Clear all" on the company's Notifications page, restricted by role.
--
-- DECISION (user, 2026-11-01): "Read-only viewers must not be able to clear
-- notifications company-wide. Restrict that action to authorized roles."
--
-- WHAT CHANGES
-- ------------
-- 0064's mark_notifications_cleared() checked owns_company(), which admits ANY
-- active member -- analyst and viewer included. cleared_at is ONE value per
-- company (company_notification_reads is keyed by company_id; there is no
-- per-user state), so a viewer's clear emptied the page for everybody.
--
-- It now requires the a03 "manage" set: owner, admin (and platform admins, which
-- has_company_role() always admits). Clearing is a company-wide setting on a
-- shared page, not content work, so it follows manageBilling / manageTeam rather
-- than the drafting set. Everyone else -- editor, publisher, analyst, viewer,
-- another company, an investor -- gets 42501 and nothing is written.
--
-- WHAT DOES NOT CHANGE
-- --------------------
--   * Every member still READS the list (company_notifications(), 0064).
--   * mark_notifications_seen() (0049) is untouched: it is the unread badge,
--     written automatically when anyone opens the page. It hides nothing.
--   * The body below is 0064's verbatim apart from the one check.
--   * No table or grant changes; company_notification_reads stays SELECT-only
--     for clients (0049, 0061a), so the RPC is the only write path.
--
-- Needs: 0064 (cleared_at, the function), 0076 (has_company_role).
-- ROLLBACK: supabase/rollbacks/0090_notification_clear_roles.rollback.sql
-- Verified in a rolled-back transaction by scripts/notifications-clear-0090-check.mjs.
-- ============================================================================

begin;

create or replace function public.mark_notifications_cleared(p_company uuid)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_now timestamptz;
begin
  -- THE ONLY CHANGE FROM 0064 (was: owns_company(p_company)).
  if not public.has_company_role(p_company, array['owner','admin']) then
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
