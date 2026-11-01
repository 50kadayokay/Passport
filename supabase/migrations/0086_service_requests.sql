-- ============================================================================
-- 0086_service_requests.sql — a21. NOT APPLIED. Prepared for review.
--
-- Bespoke service offerings: a company asks for a quote or a consultation from
-- the portal's Services page and can see where it stands. Today every card is a
-- mailto: and nobody can tell afterwards what happened to it.
--
-- WHAT IT ADDS
--   service_requests   one row per request, with a status a MineEx admin moves:
--                      requested -> in_review -> quoted -> in_progress -> done
--                      and a short note the company sees (e.g. the quote summary)
--
-- NOT A CHECKOUT. Nothing here prices, orders or charges anything; a quote is a
-- status and a note written by a person.
--
-- ACCESS
--   read    the company's members (can_touch_company) and platform admins
--   create  owner, admin, editor, publisher of THAT company (analysts and
--           viewers read only, like every other write in 0076); a client row
--           always starts as 'requested', as the caller, with no admin note
--   update  platform admins only, and only status + admin_note
--   delete  nobody from a client; requests are history
--
-- Additive: one table, one trigger function. No existing object changes.
-- ROLLBACK: supabase/rollbacks/0086_service_requests.rollback.sql
-- ============================================================================

begin;

create table if not exists public.service_requests (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  service           text not null,
  details           text not null default '',
  status            text not null default 'requested',
  admin_note        text not null default '',
  requested_by      uuid references auth.users(id) on delete set null,
  history           jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  constraint service_requests_service_chk check (service in ('conference', 'managed', 'websites', 'presentations', 'brand', 'photography')),
  constraint service_requests_status_chk  check (status in ('requested', 'in_review', 'quoted', 'in_progress', 'done')),
  constraint service_requests_details_chk check (length(details) <= 4000),
  constraint service_requests_note_chk    check (length(admin_note) <= 2000)
);
create index if not exists service_requests_company_idx on public.service_requests (company_id, created_at desc);
create index if not exists service_requests_status_idx  on public.service_requests (status, created_at desc);

-- Client rows are stamped here, not trusted: status, author, note and history
-- come from the server. A status change appends to the history with who and
-- when, so the company sees the steps and not only the current one. A burst
-- guard (20 per company per day) keeps a stuck button from filling the queue.
create or replace function public.service_requests_stamp()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then
      new.status := 'requested';
      new.admin_note := '';
      new.requested_by := auth.uid();
    end if;
    if (select count(*) from public.service_requests r
         where r.company_id = new.company_id and r.created_at > now() - interval '1 day') >= 20 then
      raise exception 'too many service requests today for this company' using errcode = '54000';
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.status_changed_at := now();
    new.history := jsonb_build_array(jsonb_build_object('status', new.status, 'at', now(), 'by', new.requested_by));
    return new;
  end if;
  -- UPDATE
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    new.history := coalesce(old.history, '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('status', new.status, 'at', now(), 'by', auth.uid()));
  else
    new.history := old.history;
  end if;
  return new;
end $$;
revoke all on function public.service_requests_stamp() from public, anon, authenticated;

drop trigger if exists service_requests_stamp on public.service_requests;
create trigger service_requests_stamp before insert or update on public.service_requests
  for each row execute function public.service_requests_stamp();

alter table public.service_requests enable row level security;

create policy "service_requests_read" on public.service_requests for select to authenticated
  using (public.can_touch_company(company_id));
create policy "service_requests_create" on public.service_requests for insert to authenticated
  with check (public.has_company_role(company_id, array['owner', 'admin', 'editor', 'publisher']));
create policy "service_requests_admin_update" on public.service_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.service_requests from anon, authenticated;
grant select on public.service_requests to authenticated;
grant insert (company_id, service, details) on public.service_requests to authenticated;
grant update (status, admin_note) on public.service_requests to authenticated;

commit;

-- ============================================================================
-- VERIFY (scripts/service-requests-0086-check.mjs, rolled back)
-- ============================================================================
-- select policyname, cmd from pg_policies where tablename = 'service_requests';
