// Read-only snapshot of everything migration 0072 touches or must not touch,
// on STAGING, inside a READ ONLY transaction.
//   node scripts/profile-drafts-snapshot.mjs > before.json
//   node scripts/profile-drafts-snapshot.mjs --compare before.json
//
// Captures: every company's status, updated_at, profile digest, timeline length
// and pp/projects fingerprint; company_profile_versions and activity_log (count,
// digest of ids); the definitions of company_go_live and the helpers it uses;
// grants and policies on companies, company_profile_versions, activity_log;
// and whether 0072's objects exist. Prints digests, never profile content or
// credentials.

import fs from "node:fs";
import pg from "pg";

const ALLOWED_REFS = ["jmljfovtfxcdhjmtlnva"], PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];
const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (PRODUCTION_REFS.some((r) => url.includes(r)) || !ALLOWED_REFS.some((r) => url.includes(r))) { console.error("  REFUSING: not the allowlisted staging project."); process.exit(2); }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("begin read only");
const q = async (s, a) => (await c.query(s, a)).rows;
const snap = {
  target: ALLOWED_REFS.find((r) => url.includes(r)),
  taken_at: new Date().toISOString(),
  companies: await q(`select id, status, updated_at, md5(coalesce(profile,'{}'::jsonb)::text) profile_md5,
      jsonb_array_length(coalesce(profile->'timeline','[]'::jsonb)) timeline_len,
      md5(coalesce(profile->'projects','null'::jsonb)::text || '|' || coalesce(profile->'pp','null'::jsonb)::text) editor_fp
    from public.companies order by id`),
  profile_versions: (await q(`select count(*)::int n, md5(coalesce(string_agg(id::text, ',' order by id), '')) ids from public.company_profile_versions`))[0],
  activity_log: (await q(`select count(*)::int n, md5(coalesce(string_agg(id::text, ',' order by id), '')) ids from public.activity_log`))[0],
  functions: await q(`select p.proname, pg_get_function_identity_arguments(p.oid) args, md5(pg_get_functiondef(p.oid)) d, array_to_string(p.proacl, ' ') acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('company_go_live','owns_company','my_company_role','is_admin','company_has_agreement','company_has_feature',
      'profile_actor_role','profile_editor_fingerprint','load_profile_draft','save_profile_draft','publish_profile_draft','discard_profile_draft','upsert_timeline_entry')
    order by 1, 2`),
  grants: await q(`select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('companies','company_profile_versions','activity_log','company_profile_drafts') and grantee in ('anon','authenticated','service_role')
    group by 1, 2 order by 1, 2`),
  column_grants_anon_companies: (await q(`select string_agg(column_name, ',' order by column_name) cols from information_schema.column_privileges
    where table_schema='public' and table_name='companies' and grantee='anon' and privilege_type='SELECT'`))[0].cols,
  policies: await q(`select tablename, policyname, cmd, md5(coalesce(qual,'') || '|' || coalesce(with_check,'')) d from pg_policies
    where schemaname='public' and tablename in ('companies','company_profile_versions','activity_log','company_profile_drafts') order by 1, 2`),
  drafts_table: (await q(`select count(*)::int n from pg_tables where schemaname='public' and tablename='company_profile_drafts'`))[0].n === 1,
};
await c.query("rollback");
await c.end();

const cmpArg = process.argv.indexOf("--compare");
if (cmpArg < 0) { process.stdout.write(JSON.stringify(snap, null, 1)); process.exit(0); }

// COMPARE: what changed since the given snapshot.
const before = JSON.parse(fs.readFileSync(process.argv[cmpArg + 1], "utf8"));
const out = [];
const byId = (a) => Object.fromEntries(a.map((x) => [x.id, x]));
const B = byId(before.companies), A = byId(snap.companies);
for (const id of new Set([...Object.keys(B), ...Object.keys(A)])) {
  const b = B[id], a = A[id];
  if (!b || !a) { out.push(`company ${id.slice(0, 8)} ${!b ? "ADDED" : "REMOVED"}`); continue; }
  // Timestamps: a loaded snapshot holds ISO strings, a fresh one Date objects -- compare instants.
  const norm = (k, v) => (k === "updated_at" ? new Date(v).toISOString() : String(v));
  for (const k of ["status", "updated_at", "profile_md5", "timeline_len", "editor_fp"]) if (norm(k, b[k]) !== norm(k, a[k])) out.push(`company ${id.slice(0, 8)} ${k} changed`);
}
for (const k of ["profile_versions", "activity_log"]) if (JSON.stringify(before[k]) !== JSON.stringify(snap[k])) out.push(`${k} changed (${before[k].n} -> ${snap[k].n})`);
const fkey = (f) => `${f.proname}(${f.args})`;
const FB = Object.fromEntries(before.functions.map((f) => [fkey(f), f])), FA = Object.fromEntries(snap.functions.map((f) => [fkey(f), f]));
for (const k of new Set([...Object.keys(FB), ...Object.keys(FA)])) {
  if (!FB[k]) out.push(`function ADDED ${k} acl=${FA[k].acl}`);
  else if (!FA[k]) out.push(`function REMOVED ${k}`);
  else { if (FB[k].d !== FA[k].d) out.push(`function DEFINITION changed ${k}`); if (FB[k].acl !== FA[k].acl) out.push(`function ACL changed ${k}: ${FB[k].acl} -> ${FA[k].acl}`); }
}
const gkey = (g) => `${g.table_name}/${g.grantee}`;
const GB = Object.fromEntries(before.grants.map((g) => [gkey(g), g.privs])), GA = Object.fromEntries(snap.grants.map((g) => [gkey(g), g.privs]));
for (const k of new Set([...Object.keys(GB), ...Object.keys(GA)])) if (GB[k] !== GA[k]) out.push(`grant ${k}: ${GB[k] || "-"} -> ${GA[k] || "-"}`);
if (before.column_grants_anon_companies !== snap.column_grants_anon_companies) out.push("anon column grants on companies changed");
const PB = JSON.stringify(before.policies), PA = JSON.stringify(snap.policies);
if (PB !== PA) out.push("policies changed: " + JSON.stringify(snap.policies.filter((p) => !before.policies.some((x) => JSON.stringify(x) === JSON.stringify(p)))));
if (before.drafts_table !== snap.drafts_table) out.push(`company_profile_drafts table: ${before.drafts_table} -> ${snap.drafts_table}`);
console.log(out.length ? out.map((l) => `  ${l}`).join("\n") : "  no differences");
