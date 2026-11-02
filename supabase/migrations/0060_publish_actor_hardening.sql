-- 0060_publish_actor_hardening.sql
-- Close a forgeable-actor hole on publish_publication().
--
-- THE DEFECT
-- ----------
-- publish_publication(p_publication_id, p_actor, p_published_at) is SECURITY
-- DEFINER and authorises with:
--
--     if not public.actor_can_publish(v.company_id, p_actor) then ... forbidden
--
-- and actor_can_publish(p_company, p_actor) checks only whether **p_actor** has
-- rights. It never ties p_actor to auth.uid(). The caller names the actor.
--
-- No migration ever revoked EXECUTE, so the function carries Supabase's default
-- privileges. Live ACL:
--     =X/postgres | postgres=X | anon=X | authenticated=X | service_role=X
--
-- So `POST /rest/v1/rpc/publish_publication` with the bundled anon key, passing
-- someone else's user id as p_actor, passes the check -- and the PUBLICATION_
-- PUBLISHED event it writes records actor_user_id as the impersonated user.
--
-- This is the SAME defect class already fixed on revise_publication(), which is
-- correctly restricted to postgres and service_role today. publish_publication
-- did not get the same treatment.
--
-- HOW EXPLOITABLE, PRECISELY
-- --------------------------
-- Stated carefully, because overstating it is as unhelpful as missing it.
--
-- An attacker needs a publication UUID and an authorised actor's UUID.
--   • The actor is easy: `companies` is anon-readable where status='published'
--     with no column restriction, so owner_id is public for every live company.
--   • The publication UUID is the gate. `publications` SELECT is TO authenticated
--     with can_touch_company(), so neither anon nor another company can read
--     draft ids, and UUIDs are gen_random_uuid() -- not guessable.
--   • `posts` IS anon-readable and carries publication_id, but a post exists only
--     once a release is published, and re-publishing a published release returns
--     `already: true` and changes nothing.
--
-- The real window: on PUBLICATION_UNPUBLISHED the feed listener PATCHes
-- posts.removed_at (api/_listeners.js:31), and the post policy requires
-- `removed_at IS NULL`. The dispatcher is asynchronous, so between the unpublish
-- and the listener draining, the publication is 'draft' while its id is still
-- anon-readable. In that window anon can re-publish it, attributed to the real
-- owner.
--
-- So: NOT a confirmed cross-tenant data leak -- no draft content becomes
-- readable. It is an integrity and attribution defect with a narrow race, and a
-- missing authorisation tie that should never have been reachable from a
-- browser. Fixed by restriction, not by rewriting the predicate.
--
-- WHY THIS IS SAFE TO APPLY
-- -------------------------
-- api/publish.js:96 already calls the RPC as the service role with a VERIFIED
-- actor: `p_actor: user.id`, where user comes from verifyUser(bearer(req)). No
-- browser code calls the RPC -- src/lib/releaseRevisions.js:17 notes it cannot.
-- Revoking browser EXECUTE is a drop-in with zero application change.
--
-- NOT IN SCOPE HERE
-- -----------------
-- Several other SECURITY DEFINER functions also carry anon EXECUTE by default
-- (company_go_live, record_company_agreement, create_company_invitation,
-- accept_company_invitation). Each one re-checks authority through auth.uid()
-- internally, so anon gets a refusal rather than an action -- they are
-- unnecessary grants, not holes. Per instruction, privilege cleanup is a
-- separate, explicitly reviewed migration. This file fixes the defect only.
--
-- DO NOT revoke owns_company(), can_touch_company() or is_admin() from anon.
-- Policies on conversations, messages, mineiq_ingestions and release_revisions
-- are scoped TO public, and an RLS expression is evaluated as the QUERYING role,
-- so anon needs EXECUTE for those policies to evaluate at all. Revoking turns a
-- clean "no rows" into "permission denied for function" -- the mistake 0056
-- nearly shipped.

begin;

-- PUBLIC FIRST, AND THIS IS THE WHOLE FIX.
--
-- The live ACL is:
--     =X/postgres | postgres=X | anon=X | authenticated=X | service_role=X
--
-- That leading `=X/postgres` is the grant to **PUBLIC** -- an aclitem with an
-- empty grantee. Every role is a member of PUBLIC, so revoking from `anon,
-- authenticated` alone would leave the function callable by anyone, including
-- anon. An earlier draft of this migration did exactly that and would not have
-- closed the hole.
--
-- Compare the two functions that were already hardened:
--     unpublish_publication   postgres=X | service_role=X
--     revise_publication      postgres=X | service_role=X
-- Neither carries an `=X/` entry. That is the end state this migration reaches,
-- and it is the pattern 0047 already used for owns_company_slug.
revoke execute on function
  public.publish_publication(uuid, uuid, timestamptz) from public, anon, authenticated;

-- 0008 defined a two-argument version; 0036 added p_published_at. If the old
-- signature still exists it is independently reachable, with the same ACL.
do $$ begin
  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = 'publish_publication'
      and pg_get_function_identity_arguments(p.oid) = 'p_publication_id uuid, p_actor uuid'
  ) then
    execute 'revoke execute on function public.publish_publication(uuid, uuid) '
            'from public, anon, authenticated';
  end if;
end $$;

commit;

-- ──────────────────────────────────────────────────────────── verification ──
-- Expect acl to list ONLY postgres and service_role (plus the owner):
--
--   select proname, pg_get_function_identity_arguments(oid) as args,
--          coalesce(array_to_string(proacl, ' | '), 'NULL = PUBLIC may execute') as acl
--     from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('publish_publication','unpublish_publication','revise_publication')
--    order by proname;
--
-- unpublish_publication and revise_publication already read
-- `postgres=X/postgres | service_role=X/postgres`. publish_publication should
-- now match them.
--
-- THEN confirm the product still works (STAGING first):
--   1. sign in as a company user, create a draft release, publish it via the
--      portal -- must succeed, because /api/publish uses the service role
--   2. confirm the row: select status, published_at, publish_seq from
--      publications where id = '<id>'
--   3. confirm attribution: select actor_user_id from events
--      where publication_id = '<id>' and event_type = 'PUBLICATION_PUBLISHED'
--
-- ──────────────────────────────────────────────────────────────── rollback ──
--   grant execute on function
--     public.publish_publication(uuid, uuid, timestamptz) to anon, authenticated;
--
-- That restores a known defect. Only use it if publishing breaks in a way that
-- traces to this revoke -- which would mean some caller bypasses /api/publish,
-- and that caller is the actual bug.
