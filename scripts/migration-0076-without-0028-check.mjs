// 0076 on a database WITHOUT 0028 (production: no brand_kits / story_projects),
// verified on STAGING in ONE transaction that is always ROLLED BACK.
//   node scripts/migration-0076-without-0028-check.mjs
//
// Inside the transaction: roll 0076 back with its rollback file, drop 0028's
// three tables (production's shape), then show (comparisons exclude 0028's three tables):
//   - the ORIGINAL 0076 (git HEAD) fails there (the production blocker);
//   - the guarded 0076 applies, and every policy it creates on the other tables
//     is identical to what it creates on staging with the tables present;
//   - the guarded rollback runs there and restores the pre-0076 state exactly;
//   - re-applying gives the same state again.
// The full round trip with the tables present is scripts/migration-rollback-roundtrip.mjs.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { runnerBody, scanMigrationSql } from "./_db-egress.mjs";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0076_company_roles.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0076_company_roles.rollback.sql", "utf8");
const ORIG = execFileSync("git", ["show", "HEAD:supabase/migrations/0076_company_roles.sql"], { encoding: "utf8" });
const body = (s) => (/\bbegin\s*;/i.test(s) ? runnerBody(s) : s);

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
let sp = 0;
const run = async (sql) => { const n = `s${++sp}`; await c.query(`savepoint ${n}`); try { await c.query(sql); await c.query(`release savepoint ${n}`); return null; } catch (e) { await c.query(`rollback to savepoint ${n}`); return e.message; } };
// Policies, grants, functions and triggers outside 0028's three tables.
const T28 = "('brand_kits','story_projects','story_renders')";
const state = async () => JSON.stringify({
  pol: await q(`select tablename, policyname, cmd, roles::text r, md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) d from pg_policies
                 where schemaname in ('public','storage') and tablename not in ${T28} order by 1,2`),
  acl: await q(`select relname, coalesce(array_to_string(relacl, ','), '') a from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','v') and relname not in ${T28} order by 1`),
  fn: await q(`select p.oid::regprocedure::text s, md5(pg_get_functiondef(p.oid)) d, coalesce(array_to_string(p.proacl, ','), '') a from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1`),
  trg: await q(`select tgrelid::regclass::text t, tgname, md5(pg_get_triggerdef(oid)) d from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname not in ${T28}) order by 1,2`),
});

console.log("\n  STATIC");
ok(scanMigrationSql(MIG).length === 0 && scanMigrationSql(RB).length === 0, "guarded 0076 and its rollback contain no database egress");
const before = await state();
try {
  await c.query("begin");
  await c.query("set local lock_timeout = '10s'");
  const withTables = await state();      // staging: original 0076 applied, 0028 tables present
  ok(withTables === before, "baseline captured");

  console.log("\n  PRODUCTION SHAPE (0076 rolled back, 0028 tables dropped, in this transaction)");
  let e = await run(body(RB));
  ok(!e, "guarded rollback runs with the tables present", e || "");
  const pre76 = await state();
  await q(`drop table public.story_renders, public.story_projects, public.brand_kits`);   // plain drop: fails if anything else depends on them
  ok((await q(`select to_regclass('public.brand_kits') is null and to_regclass('public.story_projects') is null and to_regclass('public.story_renders') is null x`))[0].x, "0028's tables (brand_kits, story_projects, story_renders) absent, as in production");
  const pre76NoTables = await state();

  e = await run(body(ORIG));
  ok(e && /brand_kits|story_projects/.test(e) && /does not exist/.test(e), "ORIGINAL 0076 fails here (the production blocker)", e || "it applied");

  e = await run(body(MIG));
  ok(!e, "GUARDED 0076 applies without the 0028 tables", e || "");
  const applied = await state();
  ok(applied === withTables, "every policy, grant, function and trigger it creates outside 0028's tables is identical to staging's applied 0076");

  e = await run(body(RB));
  ok(!e, "guarded rollback runs without the 0028 tables", e || "");
  ok((await state()) === pre76NoTables, "rollback restores the pre-0076 state exactly");
  ok(pre76NoTables === pre76, "and that state equals the pre-0076 state with the tables present (outside them)");

  e = await run(body(MIG));
  ok(!e && (await state()) === applied, "re-apply reproduces the applied state", e || "");
} catch (err) {
  ok(false, "unexpected error", err.stack || err.message);
} finally {
  await c.query("rollback").catch(() => {});
}
ok((await state()) === before && (await q(`select to_regclass('public.brand_kits') is not null and to_regclass('public.story_projects') is not null x`))[0].x, "nothing persisted on staging (tables and policies as before)");
await c.end();
console.log(`\n  0076-without-0028 (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
