-- =====================================================================
-- READ-ONLY INSPECTION of what migration 0042 actually left in production.
--
-- The table-grant finding may not be the whole story: PostgreSQL grants
-- EXECUTE on new functions to PUBLIC by default, and Supabase configures
-- default privileges on schema public that reach more than tables. This
-- looks at every object class 0042 created, and reports service_role
-- separately so nothing the trusted persistence path needs is removed by
-- accident.
--
-- Writes nothing. Paste into the SQL Editor and return the whole result.
-- =====================================================================
with p3 as (
  select unnest(array['source_inventories','source_inventory_parts',
                      'source_inventory_blocks','source_inventory_notes']) as tbl
),
p3fn as (
  select unnest(array['idg_enc','idg_arr','idg_bool','idg_part','idg_block',
                      'idg_note','idg_section','inventory_digest',
                      'phase3_append_only']) as fn
)

-- 1) TABLE privileges, per grantee
select '1-table-grant' as section, g.grantee as who, g.table_name as object,
       string_agg(distinct g.privilege_type, ',' order by g.privilege_type) as detail
  from information_schema.role_table_grants g
  join p3 on p3.tbl = g.table_name
 where g.table_schema = 'public'
 group by 1,2,3

union all
-- 2) FUNCTION privileges. PUBLIC here means every role, including anon.
select '2-function-acl', coalesce(a.grantee::regrole::text,'(none)'), p.proname,
       coalesce(a.privilege_type,'(no explicit acl = PUBLIC EXECUTE)')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join p3fn on p3fn.fn = p.proname
  left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a on true
 where n.nspname = 'public'

union all
-- 3) SEQUENCES owned by these tables (expected: none -- all keys are uuid)
select '3-sequence', coalesce(g.grantee,'(none)'), c.relname,
       coalesce(g.privilege_type,'-')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join information_schema.role_usage_grants g on g.object_name = c.relname
 where n.nspname='public' and c.relkind='S'
   and exists (select 1 from pg_depend d join pg_class t on t.oid=d.refobjid
                join p3 on p3.tbl=t.relname where d.objid=c.oid)

union all
-- 4) The DEFAULT PRIVILEGES that caused this. What else will they reach?
select '4-default-privilege', coalesce(a.grantee::regrole::text,'(none)'),
       case d.defaclobjtype when 'r' then 'tables' when 'f' then 'functions'
            when 'S' then 'sequences' when 'T' then 'types' else d.defaclobjtype::text end,
       coalesce(a.privilege_type,'-')
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
  left join lateral aclexplode(d.defaclacl) a on true
 where n.nspname = 'public'

union all
-- 5) Can these roles even connect? A privilege only matters if it is reachable.
--    TRUNCATE is not exposed by PostgREST, so a NOLOGIN role cannot reach it.
select '5-role-can-login', rolname,
       case when rolcanlogin then 'LOGIN' else 'nologin' end,
       case when rolbypassrls then 'BYPASSRLS' else '-' end
  from pg_roles where rolname in ('anon','authenticated','service_role','postgres')

union all
-- 6) Does anything already protect these tables from TRUNCATE?
select '6-truncate-trigger', p3.tbl,
       coalesce((select string_agg(tg.tgname, ',') from pg_trigger tg
                   join pg_class c on c.oid = tg.tgrelid
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname='public' and c.relname = p3.tbl
                    and not tg.tgisinternal and (tg.tgtype & 32) > 0), 'NONE'),
       'tgtype bit 5 = TRUNCATE'
  from p3

order by 1, 2, 3;
