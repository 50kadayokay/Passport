-- Replaced-function and storage-policy digests, 2026-11-01 (S2 production-shape
-- review, findings R3 and R4 in docs/PRODUCTION-ROLLOUT-PLAN.md). NOT RUN.
-- TARGET: production rvptronniomlqumjhyrr, and staging for the reference values.
--
-- READ-ONLY. Catalogue reads only; md5 digests, never function source, so the
-- output holds nothing secret. Run only through scripts/production-audit-run.mjs
-- (BEGIN READ ONLY ... ROLLBACK), with approval, alongside
-- production_function_source_2026_11_01.sql.
--
-- WHAT IT DECIDES
--   Q01  Every pre-existing function a pending migration replaces with
--        create-or-replace. Its rollback restores the repo version; a digest that
--        differs from staging's PRE-migration digest means that rollback would not
--        restore production (R1 already known for publish_publication,
--        accept_company_invitation; R3 for the other three).
--        Staging reference: run against a staging snapshot taken BEFORE 0071/0072/
--        0076/0080, or the replay of the repo up to 0069b (scripts/replay-migrations.mjs).
--   Q02  storage.objects policies (name, command, digest). 0078 drops and
--        recreates six by name; any other permissive INSERT/UPDATE/DELETE policy
--        would keep the hole open (R4).
--   Q03  The buckets 0078's policies name, and posts.media_url (0071 A, read by 0087).

select 'Q01' as q, p.oid::regprocedure::text as signature, md5(pg_get_functiondef(p.oid)) as digest,
       p.prosecdef as security_definer,
       coalesce((select string_agg(x::text, ',' order by x::text) from unnest(p.proacl) x), '(default)') as execute_acl
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('publish_publication', 'claim_deliveries', 'company_go_live', 'accept_company_invitation',
                     'mineiq_search')
 order by 2;

select 'Q02' as q, policyname, cmd, permissive, roles::text as roles,
       md5(cmd || coalesce(qual, '') || '|' || coalesce(with_check, '') || roles::text) as digest
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by policyname;

select 'Q03' as q, b.name as item, (s.id is not null) as present
  from (values ('company-media'), ('company-logos'), ('company-docs'), ('company-media-private'), ('message-attachments')) as b(name)
  left join storage.buckets s on s.id = b.name
union all
select 'Q03', 'posts.media_url',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'posts' and column_name = 'media_url')
 order by 1, 2;
