-- ============================================================================
-- 0088_content_fanout.sql — a15, first slice. NOT APPLIED. Prepared for review.
--
-- ONE published content record, fanned out to every destination with its own
-- delivery state and retries, on the outbox that already exists.
--
--   the record       publications (unchanged): a release or media post with its
--                    status and publish_seq; publish / revise / unpublish write
--                    a PUBLICATION_* event in the same transaction (0008/0051)
--   the fan-out      one versioned listener per destination, each with its own
--                    event_deliveries row: attempts, backoff, dead letter, replay
--                    (0008/0071, api/dispatch.js -- unchanged)
--                      investor feed  feed_projection_v1     -> posts        (exists)
--                      website        site_content_v1        -> destination_content
--                      conference     conference_content_v1  -> destination_content
--   delivery state   publication_delivery_status(pub) (0071) already reports
--                    every listener's state for a publication's newest event;
--                    the new listeners appear there with no change to it
--
-- WHAT IT ADDS
--   destination_content            the copy each new destination received:
--                                  one row per (destination, publication),
--                                  stamped with the publish_seq it reflects
--   deliver_destination_content()  the listeners' only write: an upsert that
--                                  never lets an OLDER delivery overwrite a
--                                  newer one (out-of-order retries are safe)
--   conference_booth_releases(slug, n)   the booth's read (anon), latest n live
--   listener_subscriptions rows    both listeners x published/revised/unpublished,
--                                  active_from = now(): nothing historical replays
--
-- ACCESS
--   destination_content: members read their company's rows; no client writes.
--   deliver_destination_content: service role only (the dispatcher).
--   conference_booth_releases: anon, published companies, live rows, title /
--   summary / category / image / date only.
--
-- Additive. ROLLBACK: supabase/rollbacks/0088_content_fanout.rollback.sql
-- ============================================================================

begin;

create table if not exists public.destination_content (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  destination    text not null,
  publication_id uuid not null references public.publications(id) on delete cascade,
  post_type      text not null default 'press_release',
  title          text not null,
  summary        text,
  category       text,
  image_url      text,
  source_url     text,
  published_at   timestamptz,
  removed_at     timestamptz,
  version        integer not null default 0,
  delivered_at   timestamptz not null default now(),
  constraint destination_content_destination_chk check (destination in ('website', 'conference')),
  constraint destination_content_type_chk check (post_type in ('press_release', 'media')),
  unique (destination, publication_id)
);
create index if not exists destination_content_company_idx
  on public.destination_content (company_id, destination, published_at desc);

alter table public.destination_content enable row level security;
create policy "destination_content_read" on public.destination_content for select to authenticated
  using (public.can_touch_company(company_id));
revoke all on public.destination_content from anon, authenticated;
grant select on public.destination_content to authenticated;

-- The listeners' write. p_row carries the projected fields; p_removed marks an
-- unpublish. Applied only when p_version >= the stored version, so a retried
-- PUBLISHED delivery arriving after an UNPUBLISHED one (a higher publish_seq)
-- cannot put a withdrawn release back. A correction (PUBLICATION_REVISED) keeps
-- its publish_seq and therefore applies. Returns { applied }.
create or replace function public.deliver_destination_content(
  p_destination text, p_publication uuid, p_company uuid, p_version integer, p_removed boolean, p_row jsonb default '{}'::jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  if p_removed then
    update public.destination_content
       set removed_at = coalesce(removed_at, now()), version = p_version, delivered_at = now()
     where destination = p_destination and publication_id = p_publication and version <= p_version;
    get diagnostics v_n = row_count;
    return jsonb_build_object('applied', v_n > 0);
  end if;
  insert into public.destination_content as d
    (company_id, destination, publication_id, post_type, title, summary, category, image_url, source_url, published_at, removed_at, version, delivered_at)
  values (p_company, p_destination, p_publication,
          case when p_row ->> 'post_type' = 'media' then 'media' else 'press_release' end,
          coalesce(nullif(p_row ->> 'title', ''), 'Company update'),
          p_row ->> 'summary', p_row ->> 'category', p_row ->> 'image_url', p_row ->> 'source_url',
          nullif(p_row ->> 'published_at', '')::timestamptz, null, p_version, now())
  on conflict (destination, publication_id) do update
     set post_type = excluded.post_type, title = excluded.title, summary = excluded.summary,
         category = excluded.category, image_url = excluded.image_url, source_url = excluded.source_url,
         published_at = excluded.published_at, removed_at = null, version = excluded.version, delivered_at = now()
   where d.version <= excluded.version;
  get diagnostics v_n = row_count;
  return jsonb_build_object('applied', v_n > 0);
end $$;
revoke execute on function public.deliver_destination_content(text, uuid, uuid, integer, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.deliver_destination_content(text, uuid, uuid, integer, boolean, jsonb) to service_role;

-- The booth's read: what Conference Mode received for this company, newest first.
create or replace function public.conference_booth_releases(p_slug text, p_limit integer default 5)
returns table (publication_id uuid, post_type text, title text, summary text, category text,
               image_url text, published_at timestamptz, version integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select d.publication_id, d.post_type, d.title, left(coalesce(d.summary, ''), 600), d.category,
         d.image_url, d.published_at, d.version
    from public.companies c
    join public.destination_content d on d.company_id = c.id
   where c.slug = p_slug and c.status = 'published'
     and d.destination = 'conference' and d.removed_at is null
   order by d.published_at desc nulls last
   limit greatest(1, least(coalesce(p_limit, 5), 20));
$$;
revoke all on function public.conference_booth_releases(text, integer) from public;
grant execute on function public.conference_booth_releases(text, integer) to anon, authenticated, service_role;

-- Subscribe the two destinations. active_from = now(): a first drain must not
-- replay every historical publish into a website or a booth.
insert into public.listener_subscriptions (listener, event_type, active_from)
select l, t, now()
  from unnest(array['site_content_v1', 'conference_content_v1']) l
 cross join unnest(array['PUBLICATION_PUBLISHED', 'PUBLICATION_REVISED', 'PUBLICATION_UNPUBLISHED']) t
on conflict (listener, event_type) do nothing;

commit;
