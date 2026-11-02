-- ============================================================================
-- 0061a_table_privilege_hardening.sql — NOT APPLIED. Prepared for review.
--
-- THE FINDING
-- -----------
-- Four tables still carry Supabase's default grant of all seven privileges:
--
--   company_follows             anon + authenticated   all 7
--   post_events                 anon + authenticated   all 7
--   post_likes                  authenticated          all 7
--   user_company_relationships  authenticated          all 7
--
-- This is the SAME defect 0045 fixed for the Phase 3 evidence tables and 0052
-- fixed for messaging. Those two migrations prove the pattern; these four were
-- simply never done. Contrast the hardened neighbours, verified in production:
--   conversations -> SELECT, messages -> INSERT,SELECT, company_notification_reads -> SELECT
--
-- HOW EXPOSED IT ACTUALLY IS -- precisely, not dramatically
-- ---------------------------------------------------------
-- RLS is enabled on all four, and INSERT/UPDATE/DELETE are RLS-constrained, so
-- anon (which carries no auth.uid()) matches no policy and is already denied
-- those. The live risk today is therefore close to nil.
--
-- The exception that justifies this migration: TRUNCATE IS NOT SUBJECT TO RLS.
-- It is a table-level privilege and row policies do not apply to it. PostgREST
-- does not expose TRUNCATE, so it is unreachable with the anon key as things
-- stand -- the GRANT is the only thing between any future non-PostgREST path
-- and an empty table. REFERENCES and TRIGGER are likewise ungoverned by RLS.
--
-- MINIMUM PRIVILEGE, DERIVED FROM TRACED CALL SITES -- not from "code might".
-- Every client path on these four tables authenticates first (authed() /
-- getUser()), so ANON NEEDS NOTHING ANYWHERE HERE. The server paths that touch
-- them (api/news-notify.js) use the service role and bypass grants entirely.
-- 0048/0049's reporting functions are SECURITY DEFINER and execute as their
-- owner, so they need no caller-role grant either.
--
--   company_follows             SELECT, INSERT, DELETE
--     src/lib/feed.js: isFollowing/followingIds (SELECT), follow (INSERT),
--     unfollow (DELETE). UPDATE is required ONLY because follow() sends
--     Prefer: resolution=merge-duplicates. The accompanying patch changes that
--     to ignore-duplicates -- re-following something you already follow is a
--     no-op, so the UPDATE branch never did anything -- which removes the need
--     for the privilege rather than granting it. post_likes already does this.
--
--   post_events                 INSERT
--     src/lib/feed.js posts impressions/opens/dwell with return=minimal. No
--     client path reads it; 0048 reads it as SECURITY DEFINER. 0009's
--     own_select policy stays in place but has no grant to act on, which is
--     correct: nothing needs it.
--
--   post_likes                  SELECT, INSERT, DELETE
--     src/lib/investorData.js:198,204 (SELECT), 211 (INSERT, already
--     ignore-duplicates), 221 (DELETE).
--
--   user_company_relationships  SELECT, INSERT, UPDATE, DELETE
--     src/lib/investorData.js:172 (SELECT), 181 (upsert with
--     merge-duplicates + return=representation -- UPDATE is GENUINELY needed
--     here, the upsert really does change is_following/is_favourite), 191
--     (DELETE). This is the live follow source: api/news-notify.js reads it to
--     decide who receives push.
--
--
-- SCOPE: the four tables ONLY. The companies column grants are 0061b, split out
-- because they have a completely different risk profile -- 0061b cannot ship
-- until an App Store release lands, and bundling held this zero-risk half
-- hostage to that. NOTHING HERE REQUIRES A CODE DEPLOY, before or after.
-- ============================================================================

begin;

revoke all on public.company_follows            from anon, authenticated;
revoke all on public.post_events                from anon, authenticated;
revoke all on public.post_likes                 from anon, authenticated;
revoke all on public.user_company_relationships from anon, authenticated;

grant select, insert, delete         on public.company_follows            to authenticated;
grant insert                         on public.post_events                to authenticated;
grant select, insert, delete         on public.post_likes                 to authenticated;
grant select, insert, update, delete on public.user_company_relationships to authenticated;

-- anon is granted nothing. Every traced caller authenticates first:
-- feed.js guards on getUser() (5 sites), investorData.js on authed() (17),
-- recordPostEvent returns at `if (!u ...)`, followerCount goes through the
-- SECURITY DEFINER company_follower_count, and news-notify.js uses the
-- service role. Verified by reading each call site, not by assumption.

commit;

-- ============================================================================
-- ROLLBACK -- EMERGENCY ONLY. This restores Supabase's default all-7 grant and
-- is itself the security regression this migration exists to remove. Prefer
-- granting back ONE missing privilege over running this wholesale.
-- ============================================================================
-- begin;
-- grant all on public.company_follows            to anon, authenticated;
-- grant all on public.post_events                to anon, authenticated;
-- grant all on public.post_likes                 to anon, authenticated;
-- grant all on public.user_company_relationships to anon, authenticated;
-- commit;
