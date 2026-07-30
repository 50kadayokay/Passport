-- 0006_portal_foundation.sql
-- Company Portal — access-architecture foundation.
--
-- Adds four things and changes NO existing behaviour:
--
--   1. A `portal_access` entitlement, seeded into every plan, so any company with
--      an active subscription can reach the desktop Company Portal. Access is an
--      ENTITLEMENT, never a client flag (see 0005 SECURITY NOTE 1).
--
--   2. `company_memberships` — the future authorization spine. Single-owner TODAY:
--      every company with an owner_id gets exactly one backfilled 'owner' row. But
--      the table already carries `role` (owner/admin/editor/publisher/analyst/
--      viewer) and `status`, so adding a teammate later is an INSERT, not a schema
--      rewrite. `owns_company()` is widened to accept owner_id OR an active
--      membership, so every existing RLS policy keeps working untouched.
--
--   3. `activity_log` — an append-only audit trail. Company users may INSERT and
--      SELECT their own company's rows but cannot UPDATE or DELETE them; only a
--      platform admin can. This is what makes admin edits attributable and
--      publishing actions non-erasable.
--
--   4. `portal_readiness(cid)` — proves, per company, that a working portal exists
--      (company row + active owner membership + active entitlement). The Admin
--      console renders this so you can see at a glance that every company is Ready.
--
-- Depends on 0001 (is_admin), 0005 (owns_company/can_touch_company/features/plans/
-- company_subscriptions). Run in Supabase -> SQL Editor. Idempotent: safe to re-run.

begin;

-- ============================================================
-- 1) PORTAL ACCESS ENTITLEMENT
-- ============================================================

insert into public.features (id, label, description) values
  ('portal_access', 'Company Portal', 'Access the desktop Company Portal to manage the company.')
on conflict (id) do update set label = excluded.label, description = excluded.description;

-- Every plan includes portal access — paying for Passport at any tier means you
-- get the portal. (Per-company DENY is still possible via company_features.)
insert into public.plan_features (plan_id, feature_id)
select p.id, 'portal_access' from public.plans p
on conflict do nothing;

-- ============================================================
-- 2) COMPANY MEMBERSHIPS — the authorization spine
-- ============================================================

create table if not exists public.company_memberships (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id)       on delete cascade,
  -- Roles exist now so later expansion is data, not DDL. Launch only creates 'owner'.
  role        text not null default 'owner'
              check (role in ('owner','admin','editor','publisher','analyst','viewer')),
  status      text not null default 'active'
              check (status in ('active','invited','suspended','removed')),
  invited_by  uuid references auth.users(id),
  joined_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, user_id)
);
create index if not exists memberships_company_idx on public.company_memberships (company_id);
create index if not exists memberships_user_idx    on public.company_memberships (user_id);

-- Backfill: every currently-owned company gets one active 'owner' membership.
insert into public.company_memberships (company_id, user_id, role, status)
select c.id, c.owner_id, 'owner', 'active'
  from public.companies c
 where c.owner_id is not null
on conflict (company_id, user_id) do nothing;

-- Auto-provision the owner membership on company create / owner assignment, so
-- the membership spine is ALWAYS authoritative — a company created after this
-- migration (concierge or self-serve) gets its owner membership automatically,
-- with no app change and no manual step. Idempotent. (Ownership transfer is an
-- admin flow; we reactivate the new owner but leave prior rows for the audit
-- trail rather than silently revoking here.)
create or replace function public.sync_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null then
    insert into public.company_memberships (company_id, user_id, role, status)
    values (new.id, new.owner_id, 'owner', 'active')
    on conflict (company_id, user_id) do update set status = 'active';
  end if;
  return new;
end $$;

drop trigger if exists companies_sync_owner on public.companies;
create trigger companies_sync_owner
  after insert or update of owner_id on public.companies
  for each row execute function public.sync_owner_membership();

-- Widen ownership to accept owner_id OR an active membership. SECURITY DEFINER
-- (unchanged from 0005) means this does NOT recurse through the memberships RLS
-- policy below. Every policy that calls owns_company()/can_touch_company() now
-- transparently honours memberships too.
create or replace function public.owns_company(cid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies c
     where c.id = cid and c.owner_id = auth.uid()
  ) or exists (
    select 1 from public.company_memberships m
     where m.company_id = cid and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

-- The caller's effective role for a company (highest privilege wins). Used by the
-- portal to decide what to render; the DB still enforces via RLS. Returns null if
-- the caller has no relationship to the company.
create or replace function public.my_company_role(cid uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.role
       from public.company_memberships m
      where m.company_id = cid and m.user_id = auth.uid() and m.status = 'active'
      order by case m.role
                 when 'owner' then 0 when 'admin' then 1 when 'publisher' then 2
                 when 'editor' then 3 when 'analyst' then 4 else 5 end
      limit 1),
    (select 'owner' from public.companies c where c.id = cid and c.owner_id = auth.uid())
  );
$$;

-- RLS: a user may read their OWN memberships (needed to resolve which companies
-- they belong to) or any membership of a company they can touch (to see the team).
-- Writes are admin-only for launch — owners cannot yet self-manage a team, which
-- keeps the single-owner model tight. can_touch_company() is SECURITY DEFINER so
-- referencing it here does not recurse.
alter table public.company_memberships enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='company_memberships'
  loop execute format('drop policy %I on public.company_memberships', p.policyname); end loop;
end $$;
create policy "read_own_or_touchable" on public.company_memberships for select to authenticated
  using (user_id = auth.uid() or public.can_touch_company(company_id));
create policy "admin_write" on public.company_memberships for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 3) ACTIVITY LOG — append-only audit trail
-- ============================================================

create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  actor_id    uuid references auth.users(id),
  actor_kind  text not null default 'company'
              check (actor_kind in ('company','admin','system')),
  action      text not null,          -- profile_updated | broadcast_published | media_uploaded | ...
  entity      text,                   -- what was affected (e.g. 'profile.capital')
  old_value   jsonb,
  new_value   jsonb,
  reason      text,
  source      text,                   -- ui | api | admin_edit | smoke_test
  created_at  timestamptz not null default now()
);
create index if not exists activity_company_idx on public.activity_log (company_id, created_at desc);

-- Append-only for company users: SELECT + INSERT only, no UPDATE/DELETE policy for
-- them, so history cannot be rewritten. Admins get full control for corrections.
alter table public.activity_log enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='activity_log'
  loop execute format('drop policy %I on public.activity_log', p.policyname); end loop;
end $$;
create policy "read_touchable"   on public.activity_log for select to authenticated
  using (public.can_touch_company(company_id));
create policy "insert_touchable" on public.activity_log for insert to authenticated
  with check (public.can_touch_company(company_id));
create policy "admin_all"        on public.activity_log for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 4) PORTAL READINESS — provable, per company
-- ============================================================

-- Returns { ready: bool, missing: text[] }. A company is portal-ready when it has
-- a row, an active owner membership, and an active subscription (which now grants
-- portal_access). SECURITY DEFINER + an internal can_touch_company() gate so the
-- Admin console can call it for any company while a stranger gets 'not_authorized'.
create or replace function public.portal_readiness(cid uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  missing text[] := array[]::text[];
  has_company boolean;
  has_owner   boolean;
  has_sub     boolean;
begin
  if not public.can_touch_company(cid) then
    return jsonb_build_object('ready', false, 'missing', array['not_authorized']);
  end if;

  select exists(select 1 from public.companies where id = cid) into has_company;
  if not has_company then
    return jsonb_build_object('ready', false, 'missing', array['company']);
  end if;

  select exists(select 1 from public.company_memberships m
                 where m.company_id = cid and m.role = 'owner' and m.status = 'active')
    into has_owner;
  if not has_owner then missing := array_append(missing, 'owner'); end if;

  select exists(select 1 from public.company_subscriptions s
                 where s.company_id = cid and s.status = 'active')
    into has_sub;
  if not has_sub then missing := array_append(missing, 'entitlement'); end if;

  return jsonb_build_object('ready', array_length(missing, 1) is null, 'missing', missing);
end $$;

-- ---------- updated_at auto-touch (reuses 0001's function) ----------
drop trigger if exists company_memberships_touch on public.company_memberships;
create trigger company_memberships_touch before update on public.company_memberships
  for each row execute function public.touch_updated_at();

commit;
