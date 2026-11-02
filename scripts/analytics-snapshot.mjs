// Read-only snapshot of the analytics surface on STAGING (READ ONLY transaction).
//   node scripts/analytics-snapshot.mjs > before.json
//   node scripts/analytics-snapshot.mjs --compare before.json
// Functions (definition digest + ACL), indexes (with validity) on the
// analytics tables, policies and grants on them, and row counts: post_events by
// kind, post_likes, post_saves, company_follows, relationships. Digests and
// counts only; no row content, no credentials.

import fs from "node:fs";
import pg from "pg";

const ALLOWED_REFS = ["jmljfovtfxcdhjmtlnva"], PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];
const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (PRODUCTION_REFS.some((r) => url.includes(r)) || !ALLOWED_REFS.some((r) => url.includes(r))) { console.error("  REFUSING: not the allowlisted staging project."); process.exit(2); }
const TABLES = ["post_events", "post_likes", "post_saves", "company_follows", "user_company_relationships", "posts"];
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("begin read only");
const q = async (s, a) => (await c.query(s, a)).rows;
const snap = {
  target: ALLOWED_REFS.find((r) => url.includes(r)), taken_at: new Date().toISOString(),
  functions: await q(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' f, md5(pg_get_functiondef(p.oid)) d, coalesce(array_to_string(p.proacl, ' '), '') acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'company_engagement%' or p.proname in ('company_follower_growth','company_content_performance','company_post_engagement','record_post_impressions','company_impression_summary','company_post_impressions'))
    order by 1`),
  indexes: await q(`select c2.relname tbl, i.indexrelid::regclass::text idx, i.indisvalid valid, md5(pg_get_indexdef(i.indexrelid)) d
    from pg_index i join pg_class c2 on c2.oid = i.indrelid join pg_namespace n on n.oid = c2.relnamespace
    where n.nspname = 'public' and c2.relname = any($1) order by 1, 2`, [TABLES]),
  policies: await q(`select tablename, policyname, cmd, md5(coalesce(qual,'') || '|' || coalesce(with_check,'')) d from pg_policies where schemaname = 'public' and tablename = any($1) order by 1, 2`, [TABLES]),
  grants: await q(`select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs from information_schema.role_table_grants
    where table_schema = 'public' and table_name = any($1) and grantee in ('anon','authenticated','service_role') group by 1, 2 order by 1, 2`, [TABLES]),
  counts: {
    events: Object.fromEntries((await q(`select kind, count(*)::int n from public.post_events group by kind order by kind`)).map((r) => [r.kind, r.n])),
    events_md5: (await q(`select md5(coalesce(string_agg(id::text || kind || coalesce(value::text,''), ',' order by id), '')) m from public.post_events`))[0].m,
    likes: (await q(`select count(*)::int n from public.post_likes`))[0].n, saves: (await q(`select count(*)::int n from public.post_saves`))[0].n,
    follows: (await q(`select count(*)::int n from public.company_follows`))[0].n, relationships: (await q(`select count(*)::int n from public.user_company_relationships`))[0].n,
    posts: (await q(`select count(*)::int n from public.posts`))[0].n,
  },
  impression_duplicates: (await q(`select count(*)::int n from (select 1 from public.post_events where kind = 'impression' group by post_id, user_id, (created_at at time zone 'UTC')::date having count(*) > 1) d`))[0].n,
};
await c.query("rollback");
await c.end();

const cmp = process.argv.indexOf("--compare");
if (cmp < 0) { process.stdout.write(JSON.stringify(snap, null, 1)); process.exit(0); }
const before = JSON.parse(fs.readFileSync(process.argv[cmp + 1], "utf8"));
const out = [];
const diffBy = (name, key, a, b) => {
  const A = Object.fromEntries(a.map((x) => [key(x), JSON.stringify(x)])), B = Object.fromEntries(b.map((x) => [key(x), JSON.stringify(x)]));
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (!A[k]) out.push(`${name} ADDED ${k} ${B[k]}`); else if (!B[k]) out.push(`${name} REMOVED ${k}`); else if (A[k] !== B[k]) out.push(`${name} CHANGED ${k}: ${A[k]} -> ${B[k]}`);
  }
};
diffBy("function", (x) => x.f, before.functions, snap.functions);
diffBy("index", (x) => x.idx, before.indexes, snap.indexes);
diffBy("policy", (x) => `${x.tablename}/${x.policyname}`, before.policies, snap.policies);
diffBy("grant", (x) => `${x.table_name}/${x.grantee}`, before.grants, snap.grants);
if (JSON.stringify(before.counts) !== JSON.stringify(snap.counts)) out.push(`counts CHANGED: ${JSON.stringify(before.counts)} -> ${JSON.stringify(snap.counts)}`);
console.log(out.length ? out.map((l) => `  ${l}`).join("\n") : "  no differences");
