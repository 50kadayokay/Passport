-- 0007_company_invitations.sql
-- Company handoff — invite a real company owner, securely, with no service key.
--
-- The concierge builds a company (owner_id = admin). To hand it to the real
-- company, an admin issues an invitation for their email; the company signs in
-- with THAT email and is made an owner of THAT company — the email match is
-- enforced in the database (auth.jwt() email must equal the invite email), so a
-- leaked link is useless to anyone else.
--
-- Two SECURITY DEFINER RPCs carry the flow so the table itself stays admin-only:
--   • create_company_invitation(company, email, role) -> { id, token }  (admin only)
--   • accept_company_invitation(token)                -> { ok, company_id | error }
--
-- Acceptance inserts a company_membership (the 0006 spine), so the invited user
-- immediately resolves the portal. Idempotent. Run in Supabase -> SQL Editor.

begin;

create table if not exists public.company_invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  email       text not null,
  role        text not null default 'owner'
              check (role in ('owner','admin','editor','publisher','analyst','viewer')),
  token       text not null unique,
  status      text not null default 'pending'
              check (status in ('pending','accepted','revoked','expired')),
  invited_by  uuid references auth.users(id),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists invitations_company_idx on public.company_invitations (company_id);
create index if not exists invitations_email_idx    on public.company_invitations (lower(email));

-- Table is admin-only for direct access; the accept path goes through the RPC
-- below (SECURITY DEFINER), so the invited user never needs a row-level grant.
alter table public.company_invitations enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='company_invitations'
  loop execute format('drop policy %I on public.company_invitations', p.policyname); end loop;
end $$;
create policy "admin_all" on public.company_invitations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Create an invitation. Admin-only (checked inside). Returns the token so the
-- console can build a link to hand to the company.
create or replace function public.create_company_invitation(p_company_id uuid, p_email text, p_role text default 'owner')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_token text; v_id uuid; v_role text;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  v_role := case when p_role in ('owner','admin','editor','publisher','analyst','viewer') then p_role else 'owner' end;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.company_invitations (company_id, email, role, token, invited_by, status, expires_at)
  values (p_company_id, lower(trim(p_email)), v_role, v_token, auth.uid(), 'pending', now() + interval '14 days')
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

-- Accept an invitation as the signed-in user. Enforces that the caller's own
-- verified email matches the invite. On success, inserts/reactivates the caller's
-- company membership and marks the invite accepted.
create or replace function public.accept_company_invitation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.company_invitations; v_email text;
begin
  select * into v from public.company_invitations where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if v.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'used'); end if;
  if v.expires_at is not null and v.expires_at < now() then
    update public.company_invitations set status = 'expired' where id = v.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  if v_email <> lower(v.email) then return jsonb_build_object('ok', false, 'error', 'email_mismatch'); end if;

  insert into public.company_memberships (company_id, user_id, role, status)
  values (v.company_id, auth.uid(), v.role, 'active')
  on conflict (company_id, user_id) do update set status = 'active', role = excluded.role;

  update public.company_invitations
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v.id;

  return jsonb_build_object('ok', true, 'company_id', v.company_id);
end $$;

commit;
