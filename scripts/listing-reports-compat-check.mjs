// Migration 0077 (listing_reports compatibility for installed app builds),
// verified against STAGING in ONE transaction that is always ROLLED BACK.
//   node scripts/listing-reports-compat-check.mjs
// The installed builds' exact insert (PassportProto.jsx at prod-v1.3.2: anon
// key, payload with company_slug, company_name, kind, message, contact,
// user_id) is run as `anon` under 0058 (refused), with 0077 (allowed), and
// after 0077's rollback (refused again, privileges and policy exactly as before).
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import { runnerBody, scanMigrationSql } from "./_db-egress.mjs";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0077_listing_reports_installed_app_compat.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0077_listing_reports_installed_app_compat.rollback.sql", "utf8");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
let sp = 0;
const probe = async (sql, args) => { const n = `p${++sp}`; await c.query(`savepoint ${n}`); try { const r = await c.query(sql, args); return { ok: true, count: r.rowCount }; } catch (e) { return { ok: false, code: e.code, e: e.message }; } finally { await c.query(`rollback to savepoint ${n}`); } };
const as = async (role, uid = null) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role } : { role })]); await c.query(`set local role ${role}`); };
const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); };
const state = async () => JSON.stringify({
  grants: (await q(`select grantee, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants where table_schema='public' and table_name in ('listing_reports','contact_submissions','demo_bookings') and grantee in ('anon','authenticated') group by table_name, grantee order by 1`)),
  policies: (await q(`select tablename, policyname, cmd, roles::text, md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) d from pg_policies where tablename in ('listing_reports','contact_submissions','demo_bookings') order by 1,2`)),
});
const appInsert = (userId, over = {}) => probe(`insert into public.listing_reports (company_slug, company_name, kind, message, contact, user_id) values ($1, $2, $3, $4, $5, $6)`,
  ["slug" in over ? over.slug : "iso-alpha", over.name ?? "Iso Alpha", over.kind ?? "error", over.message ?? "iso 0077 check", over.contact ?? "", userId]);
const investor = (await q(`select id from auth.users where email like 'iso-investor@%' limit 1`))[0]?.id || crypto.randomUUID();

console.log("\n  STATIC");
ok(scanMigrationSql(MIG).length === 0 && scanMigrationSql(RB).length === 0, "0077 and its rollback contain no database egress");
const LIVE = await state();
let S0 = LIVE;
const rows0 = (await q(`select count(*)::int n from public.listing_reports`))[0].n;
try {
  await c.query("begin");
  // 0077 is on staging since 2026-11-01: unwind it inside the transaction first, so the
  // 0058 -> 0077 -> rollback sequence below still starts from 0058. Nothing is committed.
  if ((await q(`select 1 from pg_policies where schemaname = 'public' and tablename = 'listing_reports' and policyname = 'listing_reports_insert'`)).length) {
    await q(runnerBody(RB)); S0 = await state();
  }
  console.log("\n  0058 STATE (0077 unwound if present): the installed app's report is refused");
  await as("anon");
  let r = await appInsert(null);
  ok(!r.ok && r.code === "42501", "anon insert, as installed builds send it -> refused (this is the break)", r.code);

  console.log("\n  WITH 0077");
  await asPostgres(); await q(runnerBody(MIG));
  await as("anon");
  r = await appInsert(null);
  ok(r.ok && r.count === 1, "installed build, signed out (user_id null) -> stored");
  r = await appInsert(investor);
  ok(r.ok && r.count === 1, "installed build, signed in (anon key + user_id) -> stored, exactly as production accepts it today");
  r = await appInsert(null, { kind: "claim" });
  ok(r.ok, "kind 'claim' (the sheet's other option) -> stored");
  r = await appInsert(null, { kind: "spam" });
  ok(!r.ok && r.code === "42501", "an invalid kind -> refused (new bound)", r.code);
  r = await appInsert(null, { message: "x".repeat(4001) });
  ok(!r.ok && r.code === "42501", "a message over 4000 characters -> refused (new bound, matches /api/submit)", r.code);
  r = await appInsert(null, { slug: null });
  const rEmpty = await appInsert(null, { slug: "" });
  ok(!r.ok && !rEmpty.ok, "missing or empty company slug -> refused", `${r.code}/${rEmpty.code}`);
  r = await probe(`select id from public.listing_reports limit 1`);
  ok(!r.ok && r.code === "42501", "anon still cannot READ listing_reports", r.code);
  r = await probe(`insert into public.contact_submissions (name, email, message) values ('x','x@x.invalid','x')`);
  const r2 = await probe(`insert into public.demo_bookings (name, email, company) values ('x','x@x.invalid','x')`);
  ok(!r.ok && !r2.ok, "contact_submissions and demo_bookings stay closed to anon (0058 unchanged there)", `${r.code}/${r2.code}`);
  await as("authenticated", investor);
  r = await appInsert(investor);
  ok(r.ok, "a signed-in client insert still works (authenticated)");

  console.log("\n  ROLLBACK FILE");
  await asPostgres(); await q(runnerBody(RB));
  ok((await state()) === S0, "rollback restores grants and policies exactly to the 0058 state");
  await as("anon");
  r = await appInsert(null);
  ok(!r.ok && r.code === "42501", "after rollback: anon insert refused again");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
await c.query("reset role").catch(() => {});
console.log("\n  AFTER ROLLBACK");
ok((await state()) === LIVE && (await q(`select count(*)::int n from public.listing_reports`))[0].n === rows0, "nothing persisted: privileges, policies and rows unchanged");
await c.end();
console.log(`\n  listing-reports-compat (0077, staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
