-- =====================================================================
-- READ-ONLY PRODUCTION PROBE: the actual Phase 3 trust boundary
--
-- Establishes, from production rather than from the repo, which identity is
-- permitted to invoke the persistence RPCs, which identity the RPCs' own tenant
-- gate accepts, and which identity's PostgreSQL privileges perform the writes.
-- Those are three different things and they are routinely conflated.
--
-- WRITES NOTHING. Every role change is `set local` inside a function and is
-- discarded; every call that could raise is caught and recorded.
--
-- NOTE ON FIDELITY: the SQL Editor connects as `postgres`, and auth.uid() reads
-- JWT claims out of session settings that the editor does not set. So a bare
-- call here would test `postgres with no JWT`, not `service_role with no JWT`.
-- Section 6 therefore does `set local role service_role` explicitly, which
-- reproduces the real condition: the server authenticates to PostgREST with the
-- service key, PostgREST does `set role service_role`, and no end-user `sub`
-- claim is present.
-- =====================================================================

drop table if exists pg_temp.probe;
create temp table pg_temp.probe (seq serial, section text, item text, detail text);
create or replace function pg_temp.p(s text, i text, d text) returns void
language sql as $$ insert into pg_temp.probe(section,item,detail) values (s,i,d) $$;

-- ---------------------------------------------------------------------
-- 1 + 2) the authorization functions, as they actually exist
-- ---------------------------------------------------------------------
do $$
declare fn text; src text;
begin
  foreach fn in array array['is_admin','can_touch_company','owns_company','company_role']
  loop
    select pg_get_functiondef(p.oid) into src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname=fn
     limit 1;
    perform pg_temp.p('1-2 auth function', 'public.'||fn||'()',
                      coalesce(src, 'NOT DEFINED IN THIS DATABASE'));
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3) the two persistence RPCs
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid, p.proname, p.prosecdef, pg_get_userbyid(p.proowner) as owner,
           coalesce(array_to_string(p.proconfig, ', '), 'NOT PINNED') as cfg,
           p.proacl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname in ('persist_verification','persist_canonical')
  loop
    perform pg_temp.p('3 rpc', r.proname||' prosecdef',
      case when r.prosecdef then 'true (SECURITY DEFINER)' else 'FALSE (SECURITY INVOKER)' end);
    perform pg_temp.p('3 rpc', r.proname||' proowner', r.owner);
    perform pg_temp.p('3 rpc', r.proname||' search_path', r.cfg);
    perform pg_temp.p('3 rpc', r.proname||' raw acl', coalesce(r.proacl::text, '(null = default: PUBLIC EXECUTE)'));
    perform pg_temp.p('3 rpc', r.proname||' EXECUTE: anon',
      has_function_privilege('anon', r.oid, 'EXECUTE')::text);
    perform pg_temp.p('3 rpc', r.proname||' EXECUTE: authenticated',
      has_function_privilege('authenticated', r.oid, 'EXECUTE')::text);
    perform pg_temp.p('3 rpc', r.proname||' EXECUTE: service_role',
      has_function_privilege('service_role', r.oid, 'EXECUTE')::text);
    perform pg_temp.p('3 rpc', r.proname||' EXECUTE: PUBLIC',
      (exists (select 1 from aclexplode(coalesce(r.proacl, acldefault('f', (select proowner from pg_proc where oid=r.oid)))) a
                where a.grantee = 0 and a.privilege_type='EXECUTE'))::text);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4) ownership: TABLES vs FUNCTIONS. A SECURITY DEFINER function runs with its
--    OWNER's privileges, so if the RPC owner also owns the tables, the RPC can
--    write them regardless of what the calling role holds.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.relname, pg_get_userbyid(c.relowner) as owner
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r'
       and c.relname in ('source_inventories','source_inventory_parts','source_inventory_blocks',
                         'source_inventory_notes','composition_rules','verification_runs',
                         'verification_findings','canonical_sources','canonical_spans',
                         'source_transcripts','documents')
     order by c.relname
  loop
    perform pg_temp.p('4 table owner', r.relname, r.owner);
  end loop;

  perform pg_temp.p('4 comparison', 'RPC owner vs table owner',
    (select string_agg(distinct pg_get_userbyid(p.proowner), ',')
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('persist_verification','persist_canonical'))
    || '  vs  ' ||
    (select string_agg(distinct pg_get_userbyid(c.relowner), ',')
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('source_inventories','verification_runs','canonical_sources')));
end $$;

-- ---------------------------------------------------------------------
-- 5) effective TABLE privileges per role
-- ---------------------------------------------------------------------
do $$
declare t text; rl text;
begin
  foreach t in array array['source_inventories','source_inventory_parts','source_inventory_blocks',
                           'source_inventory_notes','composition_rules','verification_runs',
                           'verification_findings','canonical_sources','canonical_spans']
  loop
    foreach rl in array array['anon','authenticated','service_role']
    loop
      perform pg_temp.p('5 table privs', rl||' on '||t,
        coalesce((select string_agg(distinct privilege_type, ',' order by privilege_type)
                    from information_schema.role_table_grants
                   where table_schema='public' and table_name=t and grantee=rl), 'none'));
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6) THE DECIDING TEST -- measured, not inferred.
--    service_role, no end-user JWT, against a real company id.
-- ---------------------------------------------------------------------
do $$
declare cid uuid; v text; uid text; adm text;
begin
  select id into cid from public.companies order by created_at limit 1;
  perform pg_temp.p('6 deciding test', 'company id used', coalesce(cid::text,'NO COMPANIES'));

  -- as the session is now (postgres, no JWT) for comparison
  begin
    select public.can_touch_company(cid)::text into v;
  exception when others then v := sqlstate||' '||left(sqlerrm,80); end;
  perform pg_temp.p('6 deciding test', 'can_touch_company as '||current_role||' (no JWT)', coalesce(v,'NULL'));

  begin select coalesce(auth.uid()::text,'NULL') into uid; exception when others then uid := sqlstate; end;
  perform pg_temp.p('6 deciding test', 'auth.uid() with no JWT', uid);

  begin select public.is_admin()::text into adm; exception when others then adm := sqlstate||' '||left(sqlerrm,60); end;
  perform pg_temp.p('6 deciding test', 'is_admin() with no JWT', coalesce(adm,'NULL'));
end $$;

-- the same three, but actually AS service_role. `set local` is reverted when the
-- surrounding transaction ends, and this function writes nothing.
do $$
declare cid uuid; v text; uid text; adm text; own text;
begin
  select id into cid from public.companies order by created_at limit 1;
  set local role service_role;

  begin select public.can_touch_company(cid)::text into v;
  exception when others then v := sqlstate||' '||left(sqlerrm,80); end;

  begin select coalesce(auth.uid()::text,'NULL') into uid;
  exception when others then uid := sqlstate; end;

  begin select public.is_admin()::text into adm;
  exception when others then adm := sqlstate||' '||left(sqlerrm,60); end;

  begin select public.owns_company(cid)::text into own;
  exception when others then own := sqlstate||' '||left(sqlerrm,60); end;

  reset role;
  perform pg_temp.p('6 AS SERVICE_ROLE', 'can_touch_company(company)', coalesce(v,'NULL'));
  perform pg_temp.p('6 AS SERVICE_ROLE', 'owns_company(company)', coalesce(own,'NULL'));
  perform pg_temp.p('6 AS SERVICE_ROLE', 'is_admin()', coalesce(adm,'NULL'));
  perform pg_temp.p('6 AS SERVICE_ROLE', 'auth.uid()', uid);
exception when others then
  reset role;
  perform pg_temp.p('6 AS SERVICE_ROLE', 'PROBE FAILED', sqlstate||' '||left(sqlerrm,120));
end $$;

-- ---------------------------------------------------------------------
-- 7) can the CURRENT server implementation actually call the RPCs?
--    api/_service.js sends the service key as the PostgREST bearer, so PostgREST
--    does `set role service_role` with no end-user `sub` claim. Call the real
--    RPC in exactly that identity. A tenant refusal and a payload refusal are
--    DIFFERENT answers, and the message distinguishes them. Nothing is written:
--    the payload is deliberately invalid, and the exception is caught.
-- ---------------------------------------------------------------------
do $$
declare cid uuid; did uuid; v text;
begin
  select id into cid from public.companies order by created_at limit 1;
  select id into did from public.documents where company_id = cid order by created_at limit 1;
  perform pg_temp.p('7 server path', 'document id used', coalesce(did::text,'NO DOCUMENT FOR THAT COMPANY'));

  set local role service_role;
  begin
    perform public.persist_verification(jsonb_build_object(
      'document_id', coalesce(did, '00000000-0000-0000-0000-000000000000'::uuid),
      'transcript_id', '00000000-0000-0000-0000-000000000000'::uuid));
    v := 'NO ERROR (unexpected)';
  exception when others then
    v := sqlstate || ' ' || left(sqlerrm, 110);
  end;
  reset role;

  perform pg_temp.p('7 server path', 'persist_verification as service_role', v);
  perform pg_temp.p('7 server path', 'how to read this',
    case
      when v like '42501%not authorized%' then 'TENANT GATE REFUSED service_role -- the server cannot use the service key alone'
      when v like '42501%permission denied%' then 'EXECUTE denied to service_role'
      when v like '23503%' then 'tenant gate PASSED; refused later on the fake ids (document/transcript lookup)'
      when v like '22023%' then 'tenant gate PASSED; refused later on the payload contract'
      else 'see message'
    end);
exception when others then
  reset role;
  perform pg_temp.p('7 server path', 'PROBE FAILED', sqlstate||' '||left(sqlerrm,120));
end $$;

-- ---------------------------------------------------------------------
-- 8) the three layers, side by side
-- ---------------------------------------------------------------------
do $$
begin
  perform pg_temp.p('8 layer', 'A. API caller (who may INVOKE the RPC)',
    'anon EXECUTE=' || has_function_privilege('anon', 'public.persist_verification(jsonb)', 'EXECUTE')::text ||
    ', authenticated=' || has_function_privilege('authenticated', 'public.persist_verification(jsonb)', 'EXECUTE')::text ||
    ', service_role=' || has_function_privilege('service_role', 'public.persist_verification(jsonb)', 'EXECUTE')::text);
  perform pg_temp.p('8 layer', 'B. RPC authorization (can_touch_company)',
    'see section 6 -- depends on auth.uid(), i.e. on an end-user JWT, NOT on the database role');
  perform pg_temp.p('8 layer', 'C. SECURITY DEFINER execution identity (whose privileges write)',
    (select pg_get_userbyid(p.proowner) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='persist_verification' limit 1)
    || ' -- the RPC owner, regardless of who called it');
end $$;

select section, item, detail from pg_temp.probe order by seq;
