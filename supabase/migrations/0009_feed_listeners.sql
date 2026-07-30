-- 0009_feed_listeners.sql — CHECKPOINT 3–4 substrate (reconciliation-aware).
--
-- An earlier trigger-based feed draft had already created posts/company_follows/
-- post_events (old shape) + an auto-post TRIGGER. This migration:
--   • drops that trigger so the dispatcher is the ONLY projector,
--   • upgrades posts in place to the normalized schema (adds columns, backfills),
--   • creates notifications + notification_prefs,
--   • (re)creates the feed RPCs — feed_discover joins back to posts so it is immune
--     to any legacy columns left on the table,
--   • seeds listener subscriptions.
-- Idempotent + safe whether the old objects exist or not. Run in Supabase SQL Editor.

begin;

-- 0) Remove the abandoned trigger-based projector.
drop trigger if exists publications_project_post on public.publications;
drop function if exists public.project_publication_to_post() cascade;

-- 1) POSTS — ensure table, then bring it up to the normalized schema.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null unique references public.publications(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
alter table public.posts add column if not exists post_type text not null default 'press_release';
alter table public.posts add column if not exists category text;
alter table public.posts add column if not exists summary text;
alter table public.posts add column if not exists thumbnail_url text;
alter table public.posts add column if not exists source_url text;
alter table public.posts add column if not exists materiality_score integer;
alter table public.posts add column if not exists materiality_label text;
alter table public.posts add column if not exists project_id text;

-- Backfill new columns from legacy ones only if those legacy columns exist.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='materiality') then
    execute 'update public.posts set materiality_label = coalesce(materiality_label, materiality)';
    execute $q$update public.posts set materiality_score = coalesce(materiality_score,
      case materiality_label when 'Transformational' then 90 when 'High' then 70 when 'Moderate' then 40 when 'Low' then 15 else null end)$q$;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='media_url') then
    execute 'update public.posts set thumbnail_url = coalesce(thumbnail_url, media_url)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='kind') then
    execute 'update public.posts set post_type = coalesce(post_type, kind)';
  end if;
end $$;

create index if not exists posts_published_idx on public.posts (published_at desc) where removed_at is null;
create index if not exists posts_company_idx   on public.posts (company_id, published_at desc) where removed_at is null;
alter table public.posts enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='posts'
  loop execute format('drop policy %I on public.posts', p.policyname); end loop;
end $$;
create policy "public_read" on public.posts for select to anon, authenticated
  using (removed_at is null and exists (select 1 from public.companies c where c.id = company_id and c.status = 'published'));
create policy "admin_all" on public.posts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2) FOLLOWS (may already exist)
create table if not exists public.company_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), unique (user_id, company_id)
);
create index if not exists follows_user_idx on public.company_follows (user_id);
create index if not exists follows_company_idx on public.company_follows (company_id);
alter table public.company_follows enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='company_follows'
  loop execute format('drop policy %I on public.company_follows', p.policyname); end loop;
end $$;
create policy "own_select" on public.company_follows for select to authenticated using (user_id = auth.uid());
create policy "own_insert" on public.company_follows for insert to authenticated with check (user_id = auth.uid());
create policy "own_delete" on public.company_follows for delete to authenticated using (user_id = auth.uid());
create policy "admin_all"  on public.company_follows for all to authenticated using (public.is_admin()) with check (public.is_admin());
create or replace function public.company_follower_count(cid uuid) returns integer language sql stable security definer set search_path=public as $$ select count(*)::int from public.company_follows where company_id = cid; $$;
create or replace function public.am_following(cid uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists (select 1 from public.company_follows where company_id = cid and user_id = auth.uid()); $$;

-- 3) POST EVENTS (may already exist)
create table if not exists public.post_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('impression','open','save','unsave','dwell')),
  value integer, created_at timestamptz not null default now()
);
create index if not exists post_events_post_idx on public.post_events (post_id, kind);
alter table public.post_events enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='post_events'
  loop execute format('drop policy %I on public.post_events', p.policyname); end loop;
end $$;
create policy "own_insert" on public.post_events for insert to authenticated with check (user_id = auth.uid());
create policy "own_select" on public.post_events for select to authenticated using (user_id = auth.uid() or public.is_admin());
create or replace function public.post_engagement(pid uuid) returns integer language sql stable security definer set search_path=public as $$ select count(*)::int from public.post_events where post_id = pid and kind in ('open','save'); $$;

-- 4) NOTIFICATIONS + PREFS (fresh)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'new_release',
  company_id uuid references public.companies(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  title text not null, body text, deep_link text, read_at timestamptz,
  created_at timestamptz not null default now(), unique (user_id, post_id, kind)
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='notifications'
  loop execute format('drop policy %I on public.notifications', p.policyname); end loop;
end $$;
create policy "own_select" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "own_update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin_all"  on public.notifications for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.notification_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  channel text not null default 'in_app', min_materiality integer not null default 0,
  muted boolean not null default false, updated_at timestamptz not null default now()
);
create unique index if not exists notif_prefs_global_idx  on public.notification_prefs (user_id, channel) where company_id is null;
create unique index if not exists notif_prefs_company_idx on public.notification_prefs (user_id, company_id, channel) where company_id is not null;
alter table public.notification_prefs enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='notification_prefs'
  loop execute format('drop policy %I on public.notification_prefs', p.policyname); end loop;
end $$;
create policy "own_all" on public.notification_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5) FEED RPCs
create or replace function public.feed_following(p_limit integer default 20, p_before timestamptz default null)
returns setof public.posts language sql stable security definer set search_path=public as $$
  select po.* from public.posts po
   where po.removed_at is null
     and exists (select 1 from public.companies c where c.id = po.company_id and c.status = 'published')
     and exists (select 1 from public.company_follows f where f.company_id = po.company_id and f.user_id = auth.uid())
     and (p_before is null or po.published_at < p_before)
   order by po.published_at desc limit greatest(1, least(coalesce(p_limit,20),50));
$$;
create or replace function public.feed_latest(p_limit integer default 20, p_before timestamptz default null)
returns setof public.posts language sql stable security definer set search_path=public as $$
  select po.* from public.posts po
   where po.removed_at is null
     and exists (select 1 from public.companies c where c.id = po.company_id and c.status = 'published')
     and (p_before is null or po.published_at < p_before)
   order by po.published_at desc limit greatest(1, least(coalesce(p_limit,20),50));
$$;
-- Discover joins back to posts, so the returned rowtype always matches posts even
-- with legacy columns present. Deterministic score + per-company diversity cap that
-- relaxes when the live pool is small (low-volume fallback).
create or replace function public.feed_discover(p_limit integer default 20, p_offset integer default 0)
returns setof public.posts language sql stable security definer set search_path=public as $$
  with base as (
    select po.id, po.company_id, po.published_at,
      ( coalesce(po.materiality_score,0)*0.3
      + case when exists (select 1 from public.company_follows f where f.company_id=po.company_id and f.user_id=auth.uid()) then 8 else 0 end
      + least(public.post_engagement(po.id),20)*0.5
      - extract(epoch from (now()-po.published_at))/3600.0*0.05 ) as score
    from public.posts po
    where po.removed_at is null and exists (select 1 from public.companies c where c.id=po.company_id and c.status='published')
  ), ranked as (
    select b.*, row_number() over (partition by b.company_id order by b.score desc, b.published_at desc) as rn,
           (select count(*) from base) as total from base b
  )
  select p.* from public.posts p join ranked r on r.id = p.id
   where r.rn <= case when r.total <= 10 then 1000 else 2 end
   order by r.score desc, p.published_at desc
   limit greatest(1, least(coalesce(p_limit,20),50)) offset greatest(0, coalesce(p_offset,0));
$$;

-- 6) Listener subscriptions
insert into public.listener_subscriptions (listener, event_type) values
  ('feed_projection_v1','PUBLICATION_PUBLISHED'),
  ('feed_projection_v1','PUBLICATION_UNPUBLISHED'),
  ('in_app_notifications_v1','PUBLICATION_PUBLISHED')
on conflict (listener, event_type) do nothing;

commit;
