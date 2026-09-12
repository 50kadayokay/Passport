-- 0035_company_agreements_golive.sql — Phase 6B
--
-- Adds three things, all ADDITIVE (no existing table/column/policy is altered):
--   1. company_agreement_acceptances — a versioned record of who accepted the MineEx
--      company agreement, for which company, when. Gates onboarding Go-Live (not portal read).
--   2. RPCs: record_company_agreement / company_has_agreement / peek_company_invitation.
--   3. company_go_live — lets a company OWNER publish their own profile the first time,
--      gated server-side on: ownership + agreement accepted + active portal entitlement +
--      a minimally-complete profile. Reuses the exact owner-guard bypass 0031 established
--      (set_config('app.provisioning','on', true)) so the status flip is allowed for the
--      duration of this SECURITY DEFINER call only.
--
-- Backward compatibility: a grandfather backfill inserts an acceptance for every company that
-- already has an owner OR is already published, so no existing company is ever gated or forced
-- through onboarding. Run in Supabase → SQL Editor. Idempotent.

-- ---------------------------------------------------------------------------
-- 1) Acceptance table
-- ---------------------------------------------------------------------------
create table if not exists public.company_agreement_acceptances (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  user_id           uuid references auth.users(id) on delete set null,  -- signatory; null only for grandfather backfill rows
  agreement_version text not null,
  accepted_at       timestamptz not null default now(),
  ip                text,
  user_agent        text,
  unique (company_id, agreement_version)   -- one acceptance per company per version (idempotent)
);
create index if not exists agreement_acceptances_company_idx
  on public.company_agreement_acceptances (company_id);

alter table public.company_agreement_acceptances enable row level security;

-- Owners/members (and admins) may READ their company's acceptances. Writes go only through
-- the SECURITY DEFINER RPC below — never a direct client insert (mirrors the paywall pattern).
drop policy if exists "agreement_read" on public.company_agreement_acceptances;
create policy "agreement_read" on public.company_agreement_acceptances
  for select to authenticated
  using (public.can_touch_company(company_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- 2) Record acceptance (owner/member of the company; captures signatory + version + audit)
-- ---------------------------------------------------------------------------
create or replace function public.record_company_agreement(p_company_id uuid, p_version text)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare v_hdr json; v_at timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  -- Only someone who can touch this company (owner/active member) or an admin may sign.
  if not (public.can_touch_company(p_company_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(trim(p_version), '') = '' then return jsonb_build_object('ok', false, 'error', 'version_required'); end if;

  begin v_hdr := current_setting('request.headers', true)::json; exception when others then v_hdr := null; end;

  insert into public.company_agreement_acceptances (company_id, user_id, agreement_version, ip, user_agent)
  values (p_company_id, auth.uid(), p_version,
          coalesce(v_hdr ->> 'x-forwarded-for', ''),
          coalesce(v_hdr ->> 'user-agent', ''))
  on conflict (company_id, agreement_version) do update set agreement_version = excluded.agreement_version
  returning accepted_at into v_at;

  return jsonb_build_object('ok', true, 'accepted_at', v_at, 'version', p_version);
end;
$function$;

-- Has this company accepted the current agreement (or been grandfathered)? SECURITY DEFINER so
-- the gate resolves regardless of the caller's row-visibility. Grandfather rows (version
-- 'grandfathered%') satisfy the gate so pre-6B companies are never blocked.
create or replace function public.company_has_agreement(p_company_id uuid, p_version text)
returns boolean
language sql stable security definer set search_path = public
as $function$
  select exists (
    select 1 from public.company_agreement_acceptances a
    where a.company_id = p_company_id
      and (a.agreement_version = p_version or a.agreement_version like 'grandfathered%')
  );
$function$;

-- ---------------------------------------------------------------------------
-- 3) Read-only invitation peek — powers a branded invite landing without accepting.
--    Token-gated; returns only display fields (email is masked). No auth required.
-- ---------------------------------------------------------------------------
create or replace function public.peek_company_invitation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare v public.company_invitations; c public.companies;
begin
  select * into v from public.company_invitations where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if v.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'used'); end if;
  if v.expires_at is not null and v.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  select * into c from public.companies where id = v.company_id;
  -- The token is the bearer secret and the invited email is the recipient's own address, so
  -- returning it to the token holder is safe and lets the sign-in email be prefilled + locked.
  return jsonb_build_object(
    'ok', true,
    'company_name', coalesce(c.name, c.slug),
    'company_slug', c.slug,
    'logo', coalesce(c.profile -> 'pp' ->> 'LOGO', c.profile -> 'pp' ->> 'AVATAR', ''),
    'tier', coalesce(c.tier, 'free'),
    'email', v.email
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Owner self-serve Go-Live — the intentional first publication.
--    Gates (all server-enforced): caller owns/administers the company + agreement accepted +
--    active portal entitlement + a minimally-complete profile (a name). Only flips draft→published.
-- ---------------------------------------------------------------------------
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

grant execute on function public.record_company_agreement(uuid, text) to authenticated;
grant execute on function public.company_has_agreement(uuid, text)     to authenticated;
grant execute on function public.peek_company_invitation(text)         to anon, authenticated;
grant execute on function public.company_go_live(uuid, text)           to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Grandfather backfill — never gate an existing company. Any company that already has an
--    owner OR is already published is treated as having accepted, so onboarding/agreement/
--    go-live gates are transparent to them.
-- ---------------------------------------------------------------------------
insert into public.company_agreement_acceptances (company_id, user_id, agreement_version, accepted_at)
select c.id, c.owner_id, 'grandfathered-pre-6b', now()
from public.companies c
where (c.owner_id is not null or c.status = 'published')
on conflict (company_id, agreement_version) do nothing;
