-- ROLLBACK for 0091_notification_clear_no_platform_admin.sql. Restores 0090's
-- mark_notifications_cleared() exactly: owner or admin through
-- has_company_role(), which also admits every platform admin. No data to undo --
-- 0091 changed only the function's check.
-- Verified in a rolled-back transaction by scripts/notifications-clear-0091-check.mjs.
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
