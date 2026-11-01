-- ROLLBACK for 0090_notification_clear_roles.sql. Restores 0064's
-- mark_notifications_cleared() exactly: any active member (owns_company) may
-- clear the company's notifications again. No data to undo -- 0090 changed only
-- the function's check.
-- Verified in a rolled-back transaction by scripts/notifications-clear-0090-check.mjs.
begin;

create or replace function public.mark_notifications_cleared(p_company uuid)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_now timestamptz;
begin
  if not public.owns_company(p_company) then
    raise exception 'not authorized for this company' using errcode = '42501';
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
