-- ============================================================================
-- 0085_conference_booth_config.sql — a17. NOT APPLIED. Prepared for review.
--
-- Conference Mode content sync, step one: the booth's LOOK (template, theme,
-- accent -- the `conference.studio` block) becomes a published database record
-- the booth fetches and caches, so a Studio change reaches an iPad without a
-- redeploy. The compiled per-company module stays the fallback: a booth that
-- never reaches the network keeps rendering exactly what it renders today.
--
-- WHAT IT ADDS
--   conference_booth_configs        one row per company: the published look,
--                                   a version that only moves when it changes
--   conference_booth_config(slug)   the booth's read path (anon-callable):
--                                   template/theme/accent + version, nothing else
--
-- ACCESS
--   read   company members (can_touch_company) and platform admins
--   write  platform admins only -- Conference Studio is an admin tool and the
--          company's route is the existing change request, unchanged
--   booth  conference_booth_config(slug): SECURITY DEFINER, three whitelisted
--          keys, so the public surface is a look and a version number
--
-- Additive: one table, one trigger, two functions. No existing table, policy or
-- function changes. The investor app does not read any of it.
--
-- ROLLBACK: supabase/rollbacks/0085_conference_booth_config.rollback.sql
-- ============================================================================

begin;

create table if not exists public.conference_booth_configs (
  company_id   uuid primary key references public.companies(id) on delete cascade,
  studio       jsonb not null default '{}'::jsonb,
  version      integer not null default 1,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint conference_booth_configs_studio_chk check (jsonb_typeof(studio) = 'object'),
  constraint conference_booth_configs_version_chk check (version >= 1)
);

-- Only the three keys the booth understands survive, each a short string. A
-- record is a look, not a place to park content: anything else is dropped here
-- rather than trusted downstream. The version moves only when the look does, so
-- a booth comparing versions never re-renders for a no-op save.
create or replace function public.conference_booth_configs_normalise()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v jsonb := '{}'::jsonb; k text;
begin
  foreach k in array array['template', 'theme', 'accent'] loop
    if jsonb_typeof(new.studio -> k) = 'string' and length(new.studio ->> k) <= 40 then
      v := v || jsonb_build_object(k, new.studio ->> k);
    end if;
  end loop;
  new.studio := v;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.version := 1;
    new.published_at := now();
    new.published_by := coalesce(auth.uid(), new.published_by);
  elsif new.studio is distinct from old.studio then
    new.version := old.version + 1;
    new.published_at := now();
    new.published_by := coalesce(auth.uid(), new.published_by);
  else
    new.version := old.version;
    new.published_at := old.published_at;
    new.published_by := old.published_by;
  end if;
  return new;
end $$;
revoke all on function public.conference_booth_configs_normalise() from public, anon, authenticated;

drop trigger if exists conference_booth_configs_normalise on public.conference_booth_configs;
create trigger conference_booth_configs_normalise before insert or update on public.conference_booth_configs
  for each row execute function public.conference_booth_configs_normalise();

alter table public.conference_booth_configs enable row level security;

create policy "booth_config_read" on public.conference_booth_configs for select to authenticated
  using (public.can_touch_company(company_id));
create policy "booth_config_admin_insert" on public.conference_booth_configs for insert to authenticated
  with check (public.is_admin());
create policy "booth_config_admin_update" on public.conference_booth_configs for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.conference_booth_configs from anon, authenticated;
grant select on public.conference_booth_configs to authenticated;
-- update(company_id) only because PostgREST's upsert (on conflict do update) names
-- every posted column; the policy still limits it to platform admins.
grant insert (company_id, studio), update (company_id, studio) on public.conference_booth_configs to authenticated;

-- The booth's read path. By slug, because that is all a booth knows. Returns no
-- row for an unknown slug or a company without a published look, and the booth
-- then keeps its compiled module. Never returns the company id or the profile.
create or replace function public.conference_booth_config(p_slug text)
returns table (slug text, studio jsonb, version integer, published_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.slug, b.studio, b.version, b.published_at
    from public.companies c
    join public.conference_booth_configs b on b.company_id = c.id
   where c.slug = p_slug
   limit 1;
$$;
revoke all on function public.conference_booth_config(text) from public;
grant execute on function public.conference_booth_config(text) to anon, authenticated, service_role;

commit;

-- ============================================================================
-- VERIFY (scripts/conference-booth-0085-check.mjs, rolled back)
-- ============================================================================
-- select policyname, cmd from pg_policies where tablename = 'conference_booth_configs';
-- select * from public.conference_booth_config('kingsmen-resources');
