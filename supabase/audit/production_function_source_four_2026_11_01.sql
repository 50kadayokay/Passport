-- Production function source: the FOUR drifted functions only, 2026-11-01.
-- TARGET: the PRODUCTION Supabase project rvptronniomlqumjhyrr (approved by the user, 2026-11-01).
--
-- READ-ONLY. One SELECT over the system catalogue (pg_proc). pg_get_functiondef()
-- formats stored catalogue text; it does NOT execute, replace or modify a function.
-- No application table is read. Run only through scripts/production-audit-run.mjs
-- (BEGIN READ ONLY ... ROLLBACK, statement_timeout 15 s, lock_timeout 2 s).
--
-- Why these four: the digest audit (production_replaced_functions_2026_11_01.sql) showed
-- their bodies differ from the repo. Pending migrations replace them:
--   publish_publication and claim_deliveries -> 0071, company_go_live -> 0072,
--   accept_company_invitation -> 0076.
--
-- SENSITIVE OUTPUT: function SOURCE. The result goes to the gitignored
-- supabase/audit/results/ folder only. Never commit, paste or share it; display only the
-- redacted diffs from scripts/function-drift-diff.mjs.

select 'Q01' as q,
       p.oid::regprocedure::text           as signature,
       pg_get_userbyid(p.proowner)          as owner,
       p.prosecdef                          as security_definer,
       p.provolatile                        as volatility,
       coalesce(array_to_string(p.proconfig, ','), '') as config,
       coalesce((select string_agg(x::text, ',' order by x::text) from unnest(p.proacl) x), '(default)') as execute_acl,
       md5(pg_get_functiondef(p.oid))       as digest,
       pg_get_functiondef(p.oid)            as definition
  from pg_proc p
 where p.oid in ('public.publish_publication(uuid, uuid, timestamp with time zone)'::regprocedure,
                 'public.claim_deliveries(text, text, integer, integer)'::regprocedure,
                 'public.company_go_live(uuid, text)'::regprocedure,
                 'public.accept_company_invitation(text)'::regprocedure)
 order by 2;
