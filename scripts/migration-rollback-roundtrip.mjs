// Every pending migration's rollback, proven on STAGING in ONE transaction that
// is always ROLLED BACK.
//   node scripts/migration-rollback-roundtrip.mjs
//
// 1. Bring staging to "everything pending applied": apply the migrations that
//    are not on staging yet (0077).
// 2. UNWIND from 0077 down to 0053: before each rollback, fingerprint the
//    schema (S_k); run the rollback; require that it changed something.
// 3. RE-APPLY forward from 0053: after each migration the fingerprint must
//    equal S_k exactly -- the rollback undid precisely what the migration does,
//    in the presence of every other migration.
// 0055 (device push) is deliberately deferred everywhere, so it is checked as
// "apply, then roll back, returns to the same state" at its position.
//
// FINGERPRINT: public tables/columns (type, nullability, default), RLS flags,
// constraints, indexes, policies (public + storage), table and column grants,
// public function definitions and EXECUTE grants, triggers on public tables
// and auth.users, storage buckets, and the data rows migrations seed
// (listener_subscriptions, features, ai_controls). Column comments are not
// compared. CONCURRENTLY is stripped for the in-transaction run (same index).
import fs from "node:fs";
import pg from "pg";
import { runnerBody } from "./_db-egress.mjs";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }

const ORDER = ["0053_phase3_0041_privilege_hardening", "0054_phase3_0041_immutability", "0055_enable_device_push", "0056_function_execute_hardening",
  "0057_submission_throttle", "0058_close_public_insert", "0095_public_lead_form_guard", "0059_auth_user_trigger", "0060_publish_actor_hardening", "0061a_table_privilege_hardening", "0094_company_follows_upsert_grant",
  "0061b_companies_column_grants", "0062_message_attachments", "0063_company_initiated_threads", "0096_conversations_legacy_upsert", "0064_notification_clearing", "0065a_analytics_breakdown",
  "0065b_engagement_corrections", "0065c_analytics_indexes", "0066_mineiq_conversations", "0067_conference_mode_feature", "0068_site_contract",
  "0069b_stripe_events", "0071_publishing_reliability", "0072_profile_drafts", "0073a_impression_dedupe_index", "0073b_impression_tracking",
  "0073c_post_events_client_guard", "0074_profile_revision_history", "0075_profile_versions_privileges", "0076_company_roles",
  "0077_listing_reports_installed_app_compat", "0092_listing_reports_column_insert", "0093_listing_reports_rate_limit", "0078_storage_role_hardening",
  "0080_mineiq_search_any_term", "0085_conference_booth_config", "0086_service_requests", "0087_audience_events", "0088_content_fanout",
  "0090_notification_clear_roles", "0091_notification_clear_no_platform_admin"];
// 0077, 0078, 0080, 0085-0088 and 0090-0093 applied to staging (0092, 0093 and 0094 on 2026-11-02; 0095 and 0096 later that day, each placed after its partner as in production).
const NOT_ON_STAGING = new Set(["0055_enable_device_push"]);
const DEFERRED = new Set(["0055_enable_device_push"]);

const prep = (sql) => {
  const noConc = sql.replace(/\bconcurrently\s+/gi, "");
  return /^\s*(--[^\n]*\n|\s)*begin\s*;/i.test(noConc) || /\bbegin\s*;/i.test(noConc) ? runnerBody(noConc) : noConc;
};
const mig = (n) => prep(fs.readFileSync(`supabase/migrations/${n}.sql`, "utf8"));
const rb = (n) => prep(fs.readFileSync(`supabase/rollbacks/${n}.rollback.sql`, "utf8"));
for (const n of ORDER) { if (!fs.existsSync(`supabase/rollbacks/${n}.rollback.sql`)) { console.error(`  missing rollback file for ${n}`); process.exit(3); } }

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;

async function fingerprint() {
  const m = new Map();
  const put = (rows, key, val) => { for (const r of rows) m.set(key(r), val(r)); };
  put(await q(`select c.relname t, a.attname col, format_type(a.atttypid, a.atttypmod) ty, a.attnotnull nn, md5(coalesce(pg_get_expr(d.adbin, d.adrelid), '')) def
                 from pg_attribute a join pg_class c on c.oid = a.attrelid left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v') and a.attnum > 0 and not a.attisdropped`), (r) => `col ${r.t}.${r.col}`, (r) => `${r.ty}|${r.nn}|${r.def}`);
  put(await q(`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`), (r) => `rls ${r.relname}`, (r) => String(r.relrowsecurity));
  put(await q(`select conrelid::regclass::text t, conname, md5(pg_get_constraintdef(oid)) d from pg_constraint where connamespace = 'public'::regnamespace`), (r) => `con ${r.t}.${r.conname}`, (r) => r.d);
  put(await q(`select indexname, md5(indexdef) d from pg_indexes where schemaname = 'public'`), (r) => `idx ${r.indexname}`, (r) => r.d);
  put(await q(`select schemaname, tablename, policyname, md5(permissive || cmd || roles::text || coalesce(qual,'') || '|' || coalesce(with_check,'')) d from pg_policies where schemaname in ('public','storage')`), (r) => `pol ${r.schemaname}.${r.tablename}.${r.policyname}`, (r) => r.d);
  put(await q(`select c.relname, coalesce((select string_agg(x::text, ',' order by x::text) from unnest(c.relacl) x), '') acl from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v')`), (r) => `acl ${r.relname}`, (r) => r.acl);
  put(await q(`select c.relname, a.attname, (select string_agg(y::text, ',' order by y::text) from unnest(a.attacl) y) acl from pg_attribute a join pg_class c on c.oid = a.attrelid
                where c.relnamespace = 'public'::regnamespace and a.attnum > 0 and a.attacl is not null and cardinality(a.attacl) > 0`), (r) => `colacl ${r.relname}.${r.attname}`, (r) => r.acl || "");
  put(await q(`select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) d, coalesce((select string_agg(x::text, ',' order by x::text) from unnest(p.proacl) x), '(default)') acl
                 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'`), (r) => `fn ${r.sig}`, (r) => `${r.d}|${r.acl}`);
  put(await q(`select tgrelid::regclass::text t, tgname, md5(pg_get_triggerdef(oid)) d, tgenabled from pg_trigger
                where not tgisinternal and (tgrelid::regclass::text = 'auth.users' or tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace))`), (r) => `trg ${r.t}.${r.tgname}`, (r) => `${r.d}|${r.tgenabled}`);
  put(await q(`select id, public, coalesce(file_size_limit, 0) l, md5(coalesce(array_to_string(allowed_mime_types, ','), '')) t from storage.buckets`), (r) => `bucket ${r.id}`, (r) => `${r.public}|${r.l}|${r.t}`);
  put(await q(`select listener, event_type from public.listener_subscriptions`), (r) => `row listener_subscriptions ${r.listener}/${r.event_type}`, () => "1");
  put(await q(`select id, md5(label || '|' || coalesce(description, '')) d from public.features`), (r) => `row features ${r.id}`, (r) => r.d);
  if ((await q(`select to_regclass('public.ai_controls') is not null x`))[0].x) put(await q(`select id::text, enabled from public.ai_controls`), (r) => `row ai_controls ${r.id}`, (r) => String(r.enabled));
  return m;
}
const diff = (a, b) => {
  const keys = new Set([...a.keys(), ...b.keys()]), out = [];
  for (const k of keys) if (a.get(k) !== b.get(k)) out.push(`${k}: ${a.has(k) ? "changed" : "added"}${!b.has(k) ? "->removed" : ""}`);
  return out;
};
const run = async (label, sql) => { await c.query("savepoint s"); try { await c.query(sql); await c.query("release savepoint s"); return null; } catch (e) { await c.query("rollback to savepoint s"); return `${label}: ${e.message}`; } };

const before = await fingerprint();
const snapshots = new Map();
try {
  await c.query("begin");
  await c.query("set local lock_timeout = '10s'");
  console.log("\n  1. bring staging to 'every pending migration applied' (in this transaction)");
  for (const n of ORDER) if (NOT_ON_STAGING.has(n) && !DEFERRED.has(n)) {
    const e = await run(n, mig(n)); ok(!e, `apply ${n}`, e || "");
  }
  const top = await fingerprint();

  console.log("\n  2. UNWIND: roll back from the newest to 0053");
  for (const n of [...ORDER].reverse()) {
    if (DEFERRED.has(n)) {
      const s0 = await fingerprint();
      const e1 = await run(n, mig(n));
      const s1 = await fingerprint();
      const e2 = await run(`${n} rollback`, rb(n));
      const d = diff(s0, await fingerprint());
      ok(!e1 && !e2 && diff(s0, s1).length > 0 && d.length === 0, `${n} (deferred): apply then roll back returns to the same state`, (e1 || e2 || d.slice(0, 6).join("; ")));
      continue;
    }
    const s = await fingerprint();
    snapshots.set(n, s);
    const e = await run(`${n} rollback`, rb(n));
    const changed = e ? [] : diff(s, await fingerprint());
    ok(!e && changed.length > 0, `rollback ${n} runs and changes ${changed.length} object(s)`, e || "changed nothing");
    if (e) throw new Error(`stopping: ${e}`);
  }

  console.log("\n  3. RE-APPLY: each migration must reproduce the state captured before its rollback");
  for (const n of ORDER) {
    if (DEFERRED.has(n)) continue;
    const e = await run(n, mig(n));
    const d = e ? ["(did not apply)"] : diff(snapshots.get(n), await fingerprint());
    ok(!e && d.length === 0, `re-apply ${n}: state identical to before its rollback`, e || `${d.length} difference(s): ${d.slice(0, 8).join("; ")}`);
  }
  const end = diff(top, await fingerprint());
  ok(end.length === 0, "after the full unwind and re-apply, the schema is identical to the starting point", end.slice(0, 8).join("; "));
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
const after = diff(before, await fingerprint());
ok(after.length === 0, "nothing persisted on staging", after.slice(0, 6).join("; "));
await c.end();
console.log(`\n  migration-rollback-roundtrip (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
