// 0090 (Clear all by role), verified on STAGING in ONE transaction that is
// always ROLLED BACK.   node scripts/notifications-clear-0090-check.mjs
//
// FOR S4 TO RUN (needs supabase/staging/.connection and .isolation-env).
// Inside the transaction: a throwaway company (owner = company A's owner; the
// admin, editor, analyst and viewer fixtures as members), then:
//   - before 0090: a viewer CAN clear (0064's owns_company), recorded as the baseline
//   - 0090 applies; owner and admin clear; editor, analyst, viewer, another
//     company, an investor and anon are refused (42501) and cleared_at is unchanged
//   - every member still reads the list and still marks it seen (the badge)
//   - the rollback restores 0064's definition exactly (viewer can clear again)
// Nothing is committed; prints no secrets.
import fs from "node:fs";
import pg from "pg";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0090_notification_clear_roles.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0090_notification_clear_roles.rollback.sql", "utf8");
const strip = (sql) => sql.replace(/^\s*begin;\s*$/gim, "").replace(/^\s*commit;\s*$/gim, "");
const rd = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const iso = rd("supabase/staging/.isolation-env");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;

await c.query("begin");
await c.query("select set_config('app.provisioning', 'on', true)");
try {
  const uid = async (k) => (await q(`select id from auth.users where email = $1`, [iso[`ISOLATION_${k}_EMAIL`]]))[0].id;
  const U = {};
  for (const k of ["COMPANY_A", "COADMIN", "EDITOR", "ANALYST", "STAFF", "COMPANY_B", "INVESTOR"]) U[k] = await uid(k);
  const asUser = async (id) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: "authenticated" })]); await c.query("set local role authenticated"); };
  const asAnon = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]); await c.query("set local role anon"); };
  const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); };
  let sp = 0;
  const attempt = async (who, sql, args) => {
    if (who === "anon") await asAnon(); else await asUser(U[who]);
    const n = `p${++sp}`; await c.query(`savepoint ${n}`);
    try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, rows: r.rows }; }
    catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, code: e.code, msg: e.message }; }
    finally { await asPostgres(); }
  };
  const def = async () => (await q(`select pg_get_functiondef('public.mark_notifications_cleared(uuid)'::regprocedure) d`))[0].d;
  const clearedAt = async () => (await q(`select cleared_at from public.company_notification_reads where company_id = $1`, [X]))[0]?.cleared_at ?? null;
  const CLEAR = `select public.mark_notifications_cleared($1) at`;

  const X = (await q(`insert into public.companies (slug, name, owner_id, status, tier) values ($1, 'A0090 Notifications', $2, 'published', 'pro') returning id`, [`zz-0090-${Date.now().toString(36)}`, U.COMPANY_A]))[0].id;
  for (const [k, role] of [["COADMIN", "admin"], ["EDITOR", "editor"], ["ANALYST", "analyst"], ["STAFF", "viewer"]]) await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, $3, 'active')`, [X, U[k], role]);
  ok(true, "throwaway company with owner, admin, editor, analyst, viewer (inside the transaction)");

  const before = await def();
  ok(/owns_company\(p_company\)/.test(before), "before 0090: mark_notifications_cleared checks owns_company (0064)");
  let r = await attempt("STAFF", CLEAR, [X]);
  ok(r.ok, "baseline: under 0064 a viewer CAN clear the whole company's page (the defect)", r.msg);
  await q(`delete from public.company_notification_reads where company_id = $1`, [X]);

  await c.query(strip(MIG));
  ok(/has_company_role\(p_company, array\['owner','admin'\]\)/.test(await def()), "0090 applies inside the transaction");

  console.log("\n  REFUSED (nothing written)");
  for (const [who, label] of [["STAFF", "viewer"], ["ANALYST", "analyst"], ["EDITOR", "editor"], ["COMPANY_B", "another company's owner"], ["INVESTOR", "an investor"], ["anon", "anon"]]) {
    r = await attempt(who, CLEAR, [X]);
    ok(!r.ok && r.code === "42501" && (await clearedAt()) === null, `${label}: refused (42501), cleared_at unchanged`, r.ok ? "was allowed" : `${r.code} ${r.msg}`);
  }

  console.log("\n  ALLOWED");
  r = await attempt("COMPANY_A", CLEAR, [X]);
  const t1 = await clearedAt();
  ok(r.ok && r.rows[0].at && t1, "owner: clears (returns the clear time, cleared_at set)", r.msg);
  r = await attempt("COADMIN", CLEAR, [X]);
  ok(r.ok && (await clearedAt()), "admin: clears", r.msg);
  const t2 = await clearedAt();
  r = await attempt("STAFF", CLEAR, [X]);
  ok(!r.ok && String(await clearedAt()) === String(t2), "viewer still refused after an owner cleared; the owner's clear stands");

  console.log("\n  UNCHANGED FOR EVERY MEMBER");
  for (const [who, label] of [["STAFF", "viewer"], ["ANALYST", "analyst"], ["EDITOR", "editor"]]) {
    const l = await attempt(who, `select count(*)::int n from public.company_notifications($1, 50)`, [X]);
    const s = await attempt(who, `select public.mark_notifications_seen($1) at`, [X]);
    ok(l.ok && s.ok, `${label}: still reads the list and marks it seen (badge only)`, `${l.msg || ""} ${s.msg || ""}`);
  }
  ok(String(await clearedAt()) === String(t2), "marking seen never moves cleared_at");
  r = await attempt("STAFF", `update public.company_notification_reads set cleared_at = now() where company_id = $1`, [X]);
  ok(!r.ok, "no direct write to company_notification_reads (the RPC is the only path)", r.ok ? "update allowed" : "");

  console.log("\n  ROLLBACK");
  await c.query(strip(RB));
  ok((await def()) === before, "the rollback restores 0064's definition exactly");
  r = await attempt("STAFF", CLEAR, [X]);
  ok(r.ok, "after the rollback a viewer can clear again (0064 behaviour)", r.msg);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback");
}
ok(!(await q(`select 1 from public.companies where slug like 'zz-0090-%'`)).length, "transaction rolled back: no throwaway company left");
await c.end();
console.log(`\n  notifications-clear-0090-check (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
