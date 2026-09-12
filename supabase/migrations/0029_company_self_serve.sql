-- 0029: Company self-serve foundation (Phase 1)
--
-- Turns the managed service into self-serve for FREE profiles. The heavy lifting is
-- already in place: companies.owner_id + owner/admin RLS (0001), and
-- admin_provision_company() to assign ownership+role+tier (0023). This migration adds
-- only the two missing pieces:
--
--   (1) company_claims — a signed-in company user asserts ownership of a listing. An
--       admin reviews and approves by calling admin_provision_company() (0023). RLS:
--       a user sees/creates only their OWN claims; admins see all.
--
--   (2) owner-guard trigger — RLS already lets an owner UPDATE their own company row,
--       but that is too broad: it would let them flip their own tier, rename their
--       slug, or move ownership. Postgres RLS can't restrict columns, so a BEFORE
--       UPDATE trigger blocks a non-admin from changing the money/identity/trust
--       fields (tier, status, slug, owner_id, primary_ticker, managed_by_admin), and
--       makes the protected demo companies admin-only. Service-role (backend pipeline,
--       backfills) and admins bypass. Owners keep full control of their profile CONTENT.

begin;

-- ============================ 1) company_claims ============================
create table if not exists public.company_claims (
  id            uuid primary key default gen_random_uuid(),
  company_slug  text not null,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_email text,                                    -- IR/company email to reach them
  evidence      text,                                    -- link / note supporting the claim
  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid
);
create index if not exists company_claims_user_idx   on public.company_claims (user_id);
create index if not exists company_claims_status_idx on public.company_claims (status);
create index if not exists company_claims_slug_idx   on public.company_claims (company_slug);
-- at most one OPEN claim per (user, company) — a resubmit after a decision is allowed
create unique index if not exists company_claims_open_uniq
  on public.company_claims (user_id, company_slug) where status = 'pending';

alter table public.company_claims enable row level security;

drop policy if exists company_claims_insert on public.company_claims;
create policy company_claims_insert on public.company_claims
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists company_claims_select on public.company_claims;
create policy company_claims_select on public.company_claims
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Admins review claims: read all + move status (approve/reject). A normal user has NO
-- update/delete path, so a claim can only be decided by an admin.
drop policy if exists company_claims_admin_all on public.company_claims;
create policy company_claims_admin_all on public.company_claims
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ========================= 2) owner-guard trigger =========================
create or replace function public.company_owner_guard()
returns trigger
language plpgsql
as $function$
begin
  -- Admins and the service role (backend pipeline, enrichment, backfills) bypass.
  if public.is_admin() or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  -- A non-admin owner edits CONTENT freely (RLS already restricts WHICH row they can
  -- touch to their own company), but never these money/identity/trust fields.
  if new.tier             is distinct from old.tier             then raise exception 'company_owner_guard: tier is admin-managed'; end if;
  if new.status           is distinct from old.status           then raise exception 'company_owner_guard: status is admin-managed'; end if;
  if new.slug             is distinct from old.slug             then raise exception 'company_owner_guard: slug is immutable'; end if;
  if new.owner_id         is distinct from old.owner_id         then raise exception 'company_owner_guard: owner_id is admin-managed'; end if;
  if new.primary_ticker   is distinct from old.primary_ticker   then raise exception 'company_owner_guard: ticker is admin-managed'; end if;
  if new.managed_by_admin is distinct from old.managed_by_admin then raise exception 'company_owner_guard: managed flag is admin-managed'; end if;
  return new;
end
$function$;

drop trigger if exists trg_company_owner_guard on public.companies;
create trigger trg_company_owner_guard
  before update on public.companies
  for each row execute function public.company_owner_guard();

commit;
