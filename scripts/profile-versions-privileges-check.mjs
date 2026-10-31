// Verify migration 0075 (company_profile_versions table privileges) against
// STAGING inside ONE transaction that is always ROLLED BACK.
//   node scripts/profile-versions-privileges-check.mjs
// Checks the grants after; that every legitimate path still works (admin tools
// read/insert/prune through RLS, the owner's reads, the 0074 history functions,
// publish snapshots, company deletion); that removed privileges are refused
// (anon anything; authenticated UPDATE and TRUNCATE); and that the rollback
// restores the previous grants exactly. Staging only. Prints no secrets.

import fs from "node:fs";
import pg from "pg";
import { runnerBody, scanMigrationSql } from "./_db-egress.mjs";

const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the allowlisted staging project."); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync("supabase/staging/.isolation-env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const MIG = fs.readFileSync("supabase/migrations/0075_profile_versions_privileges.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0075_profile_versions_privileges.rollback.sql", "utf8");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
let sp = 0;
const tryq = async (sql, args) => { const n = `s${++sp}`; await c.query(`savepoint ${n}`); try { const r = await q(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, r }; } catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, e: e.message, code: e.code }; } };
const asPostgres = async () => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)`); };
const asUser = async (uid) => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: uid, role: "authenticated" }), uid]); await c.query(`set local role authenticated`); };
const asAnon = async () => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true)`); await c.query(`set local role anon`); };
const asService = async () => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('request.jwt.claim.sub', '', true)`); await c.query(`set local role service_role`); };
const grants = async () => (await q(`select grantee, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants where table_schema='public' and table_name='company_profile_versions' group by 1 order by 1`)).map((r) => `${r.grantee}:${r.p}`).join(" | ");
const uid = async (k) => (await one(`select id from auth.users where email = $1`, [env[`ISOLATION_${k}_EMAIL`]]))?.id;
const U = { owner: (await one(`select owner_id from public.companies where id = $1`, [env.ISOLATION_COMPANY_A_ID])).owner_id, admin: await uid("ADMIN"), editor: await uid("EDITOR") };

console.log("\n  STATIC");
ok(scanMigrationSql(MIG).length === 0 && scanMigrationSql(RB).length === 0, "no database egress");
{
  const stmts = MIG.replace(/--[^\n]*/g, "").split(";").map((x) => x.trim()).filter(Boolean);
  ok(stmts.every((x) => /^(begin|commit|revoke\s|grant\s)/i.test(x)), `0075 is only begin / revoke / grant / commit (${stmts.length} statements)`);
}
const G0 = await grants();
console.log(`    before: ${G0}`);
// APPLIED MODE: once 0075 is on staging, the rollback is compared with the
// pre-0075 grants from a snapshot (--pre <grants.json>).
const APPLIED = !/anon:/.test(G0);
const preArg = process.argv.indexOf("--pre");
const PRE = preArg > 0 ? JSON.parse(fs.readFileSync(process.argv[preArg + 1], "utf8")).map((r) => `${r.grantee}:${r.p}`).join(" | ") : null;
if (APPLIED && !PRE) { console.error("  0075 is applied: pass --pre <pre-0075 grants snapshot>"); process.exit(4); }
const A = env.ISOLATION_COMPANY_A_ID;
const rowsBefore = (await one(`select count(*)::int n from public.company_profile_versions`)).n;

try {
  await c.query("begin");
  await asPostgres();
  if (!APPLIED) await q(runnerBody(MIG));
  const G1 = await grants();
  console.log(`    after:  ${G1}`);
  ok(!/anon:/.test(G1), "anon: no privileges at all");
  ok(/authenticated:DELETE,INSERT,SELECT( |$)/.test(G1), "authenticated: exactly SELECT, INSERT, DELETE");
  ok(G1.includes("service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"), "service_role unchanged");

  console.log("\n  LEGITIMATE PATHS STILL WORK");
  await asUser(U.admin);
  let t = await tryq(`insert into public.company_profile_versions (company_id, slug, profile, note, created_by) values ($1, 'x', '{}', '[0075] admin snapshot', $2) returning id`, [A, U.admin]);
  ok(t.ok, "platform admin: insert a manual snapshot (snapshotProfile)");
  const mid = t.ok ? t.r[0].id : null;
  t = await tryq(`select id from public.company_profile_versions where company_id = $1`, [A]);
  ok(t.ok && t.r.length >= 1, "platform admin: list snapshots (listVersions)");
  t = await tryq(`delete from public.company_profile_versions where id = $1`, [mid]);
  ok(t.ok, "platform admin: prune a manual snapshot (pruneVersions)");
  await asUser(U.owner);
  t = await tryq(`select id from public.company_profile_versions where company_id = $1`, [A]);
  ok(t.ok, "owner: read own company's snapshots (RLS)");
  await asService();
  const hist = (await one(`select public.list_profile_versions($1, $2) j`, [A, U.editor])).j;
  ok(hist.ok === true, "0074 history function (service role) still works for the editor");
  if (hist.versions[0]) {
    const restore = (await one(`select public.restore_profile_version_to_draft($1, $2, $3, null) j`, [A, U.editor, hist.versions[0].id])).j;
    ok(restore.ok === true || restore.error === "stale_draft", `restore-into-draft still works (${restore.ok ? "restored" : restore.error})`);
  }
  await asPostgres();
  const zc = (await one(`insert into public.companies (slug, name, owner_id, status) values ('zz-0075', 'Z', $1, 'draft') returning id`, [U.owner])).id;
  await q(`insert into public.company_profile_versions (company_id, slug, profile, note, kind) values ($1, 'zz-0075', '{}', 'before profile publish', 'publish')`, [zc]);
  t = await tryq(`delete from public.companies where id = $1`, [zc]);
  ok(t.ok && (await one(`select count(*)::int n from public.company_profile_versions where company_id = $1`, [zc])).n === 0, "company deletion still cascades its history");

  console.log("\n  REMOVED PRIVILEGES ARE REFUSED");
  await asAnon();
  t = await tryq(`select 1 from public.company_profile_versions limit 1`);
  ok(!t.ok && /permission denied/.test(t.e), "anon: SELECT -> permission denied (was: allowed, RLS returned nothing)");
  t = await tryq(`truncate public.company_profile_versions`);
  ok(!t.ok && /permission denied/.test(t.e), "anon: TRUNCATE -> permission denied");
  await asUser(U.owner);
  t = await tryq(`truncate public.company_profile_versions`);
  ok(!t.ok && /permission denied/.test(t.e), "authenticated (owner): TRUNCATE -> permission denied (it would bypass RLS and the retention trigger)");
  t = await tryq(`update public.company_profile_versions set note = 'x' where company_id = $1`, [A]);
  ok(!t.ok && /permission denied/.test(t.e), "authenticated: UPDATE -> permission denied");

  console.log("\n  ROLLBACK FILE");
  await asPostgres();
  await q(`savepoint rb`);
  await q(runnerBody(RB));
  ok((await grants()) === (APPLIED ? PRE : G0), "rollback restores the previous (pre-0075) grants exactly");
  await q(`rollback to savepoint rb`);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
await c.query("reset role").catch(() => {});
console.log("\n  AFTER ROLLBACK");
ok((await grants()) === G0, "grants on staging unchanged");
ok((await one(`select count(*)::int n from public.company_profile_versions`)).n === rowsBefore, `version rows unchanged (${rowsBefore}, incl. the 9 protected company A snapshots)`);
await c.end();
console.log(`\n  profile-versions-privileges (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
