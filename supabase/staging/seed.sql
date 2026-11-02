-- ============================================================================
-- supabase/staging/seed.sql — synthetic fixtures for a STAGING project.
--
-- NEVER run against production. Every slug is prefixed `zz-staging-` so an
-- accidental run is obvious and trivially reversible (see TEARDOWN).
--
-- NO PRODUCTION DATA IS COPIED. Real company slugs and names identify real
-- businesses, and real investor rows identify real people; neither belongs in
-- a scratch project. Everything below is invented.
--
-- PREREQUISITE — create four users in the staging project first:
--   Authentication -> Users -> Add user (email + password, auto-confirm)
--     owner@staging.test      staff@staging.test
--     investor@staging.test   admin@staging.test
--   Then paste their UUIDs below. Users cannot be created from SQL safely:
--   auth.users has triggers and an identities table that the Auth API owns.
-- ============================================================================

\set owner_id    '00000000-0000-0000-0000-000000000000'
\set staff_id    '00000000-0000-0000-0000-000000000000'
\set investor_id '00000000-0000-0000-0000-000000000000'

begin;

-- Two companies: one published+claimed (the case production does NOT yet have
-- and therefore the case 0061b's owner_id exposure actually turns on), and one
-- unpublished draft.
insert into public.companies (slug, name, status, tier, owner_id, profile)
values
  ('zz-staging-alpha', 'ZZ Staging Alpha Minerals', 'published', 'pro',  :'owner_id'::uuid, '{}'::jsonb),
  ('zz-staging-draft', 'ZZ Staging Draft Mining',  'draft',     'basic', :'owner_id'::uuid, '{}'::jsonb)
on conflict (slug) do nothing;

-- Staff: an ACTIVE membership WITHOUT ownership. owns_company() must accept
-- this path, and the whole point of testing staff separately is that a bug
-- which only checks owner_id would still pass an owner-only test.
insert into public.company_memberships (company_id, user_id, role, status)
select c.id, :'staff_id'::uuid, 'editor', 'active'
  from public.companies c where c.slug = 'zz-staging-alpha'
on conflict do nothing;

-- Follows in BOTH sources, so the 0048 union is exercised on real shapes:
--   company_follows            -> keyed by company_id (empty in production)
--   user_company_relationships -> keyed by slug, carries is_following
insert into public.company_follows (user_id, company_id)
select :'investor_id'::uuid, c.id from public.companies c where c.slug = 'zz-staging-alpha'
on conflict do nothing;

insert into public.user_company_relationships (user_id, company_slug, is_following)
values (:'investor_id'::uuid, 'zz-staging-alpha', true)
on conflict (user_id, company_slug) do update set is_following = excluded.is_following;

-- An unfollow recorded the OTHER way, so a naive union can be caught resurrecting it.
insert into public.user_company_relationships (user_id, company_slug, is_following)
values (:'investor_id'::uuid, 'zz-staging-draft', false)
on conflict (user_id, company_slug) do update set is_following = excluded.is_following;

-- One conversation + one message each way, so Messages has something to render
-- and company_read_at (the unread marker) can be exercised.
insert into public.conversations (investor_id, company_slug, company_name)
values (:'investor_id'::uuid, 'zz-staging-alpha', 'ZZ Staging Alpha Minerals')
on conflict (investor_id, company_slug) do nothing;

insert into public.messages (conversation_id, sender, body)
select v.id, 'investor', 'Synthetic staging message. Not real correspondence.'
  from public.conversations v where v.company_slug = 'zz-staging-alpha';

commit;

-- ============================================================================
-- TEARDOWN
-- ============================================================================
-- begin;
-- delete from public.user_company_relationships where company_slug like 'zz-staging-%';
-- delete from public.messages where conversation_id in
--   (select id from public.conversations where company_slug like 'zz-staging-%');
-- delete from public.conversations where company_slug like 'zz-staging-%';
-- delete from public.company_follows where company_id in
--   (select id from public.companies where slug like 'zz-staging-%');
-- delete from public.company_memberships where company_id in
--   (select id from public.companies where slug like 'zz-staging-%');
-- delete from public.companies where slug like 'zz-staging-%';
-- commit;
