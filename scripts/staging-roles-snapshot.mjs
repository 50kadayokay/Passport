// a03: READ-ONLY snapshot of everything 0076 touches on STAGING (policies,
// table+column grants, functions, triggers, invitations, memberships,
// subscriptions, owners, profile roles, row counts), for before/after diffs.
//   node scripts/staging-roles-snapshot.mjs <out.json>
// One read-only transaction; refuses any target but staging. Prints counts only.
import fs from "node:fs"; import pg from "pg";
const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (!url.includes("jmljfovtfxcdhjmtlnva") || url.includes("rvptronniomlqumjhyrr")) process.exit(2);
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } }); await c.connect();
await c.query("set default_transaction_read_only = on"); await c.query("begin read only");
const q = async (s, a) => (await c.query(s, a)).rows;
const T = ["updates","update_documents","publications","publication_media","documents","media_assets","media_asset_sources","facts","brand_kits","company_destinations","company_blueprints","story_projects","site_credentials","activity_log","conversations","messages","companies","company_invitations","company_memberships"];
const out = {
  at: new Date().toISOString(), target: "jmljfovtfxcdhjmtlnva",
  policies: await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname='public' and tablename = any($1) order by 1,2`, [T]),
  acl: await q(`select c.relname, (select array_agg(x::text order by x::text) from unnest(c.relacl) x) relacl, (select json_object_agg(a.attname, (select array_agg(y::text order by y::text) from unnest(a.attacl) y)) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and a.attacl is not null and cardinality(a.attacl)>0) attacl from pg_class c where c.relnamespace='public'::regnamespace and c.relname = any($1) order by 1`, [T]),
  functions: await q(`select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) def, array_to_string(p.proacl, ',') acl from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`),
  triggers: await q(`select tgrelid::regclass::text t, tgname, md5(pg_get_triggerdef(oid)) d from pg_trigger where not tgisinternal and tgrelid::regclass::text = any($1) order by 1,2`, [T]),
  invitations: await q(`select id, company_id, lower(email) email, role, status, expires_at::text, accepted_at::text, created_at::text from public.company_invitations order by created_at`),
  memberships: await q(`select id, company_id, user_id, role, status, updated_at::text from public.company_memberships order by id`),
  subscriptions: await q(`select company_id, plan_id, status, updated_at::text from public.company_subscriptions order by 1`),
  owners: await q(`select id, slug, owner_id, status from public.companies order by id`),
  profileRoles: await q(`select role, count(*)::int n from public.profiles group by 1 order by 1`),
  counts: (await q(`select (select count(*) from public.activity_log)::int activity, (select count(*) from public.site_credentials)::int site_creds, (select count(*) from public.company_profile_versions where company_id = $1)::int protected_a, (select count(*) from public.company_profile_versions)::int versions, (select count(*) from public.updates)::int updates, (select count(*) from public.publications)::int publications, (select count(*) from public.messages)::int messages`, [fs.readFileSync("supabase/staging/.isolation-env","utf8").match(/ISOLATION_COMPANY_A_ID=(.*)/)[1].trim()]))[0],
};
await c.query("rollback"); await c.end();
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(JSON.stringify({ policies: out.policies.length, tables: out.acl.length, functions: out.functions.length, triggers: out.triggers.length, invitations: out.invitations.length, invStatus: out.invitations.reduce((a, i) => (a[i.status] = (a[i.status] || 0) + 1, a), {}), pendingInv: out.invitations.filter(i => i.status === "pending").map(i => ({ role: i.role, expired: i.expires_at && new Date(i.expires_at) < new Date() })), memberships: out.memberships.length, memStatus: out.memberships.reduce((a, m) => (a[m.role + "/" + m.status] = (a[m.role + "/" + m.status] || 0) + 1, a), {}), subscriptions: out.subscriptions.length, counts: out.counts }, null, 1));
