// 0086 (a21 service requests), verified on STAGING in ONE transaction that is
// always ROLLED BACK.   node scripts/service-requests-0086-check.mjs
//
// FOR S4 TO RUN (needs supabase/staging/.connection and .isolation-env).
// Applies 0086 inside the transaction, then as each fixture actor:
//   - owner / editor / publisher create; analyst / viewer / another company /
//     investor / anon are refused
//   - a client row is stamped: status 'requested', author = caller, no note,
//     history of one step, whatever the client sent
//   - only a platform admin changes status / note; history grows per change;
//     details / company / author cannot be rewritten by anyone from a client
//   - members read their company's requests; another company / investor see none
//   - no client can delete; the burst guard refuses the 21st in a day
//   - the rollback removes the table and function
import fs from "node:fs";
import pg from "pg";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0086_service_requests.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0086_service_requests.rollback.sql", "utf8");
const strip = (sql) => sql.replace(/^\s*begin;\s*$/gim, "").replace(/^\s*commit;\s*$/gim, "");
const rd = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const iso = rd("supabase/staging/.isolation-env");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;

await c.query("begin");
try {
  const uid = async (k) => (await q(`select id from auth.users where email = $1`, [iso[`ISOLATION_${k}_EMAIL`]]))[0].id;
  const U = {};
  for (const k of ["COMPANY_A", "EDITOR", "PUBLISHER", "ANALYST", "STAFF", "COMPANY_B", "INVESTOR", "ADMIN"]) U[k] = await uid(k);
  const A = iso.ISOLATION_COMPANY_A_ID;

  const asUser = async (id) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: "authenticated" })]); await c.query("set local role authenticated"); };
  const asAnon = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]); await c.query("set local role anon"); };
  const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); };
  let sp = 0;
  const attempt = async (who, sql, args) => {
    if (who === "anon") await asAnon(); else await asUser(U[who]);
    const n = `p${++sp}`; await c.query(`savepoint ${n}`);
    try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, rows: r.rows, count: r.rowCount }; }
    catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, code: e.code, msg: e.message }; }
    finally { await asPostgres(); }
  };

  ok((await q(`select to_regclass('public.service_requests') t`))[0].t === null, "0086 not present before the check");
  await c.query(strip(MIG));
  ok(true, "0086 applies inside the transaction");

  const INS = `insert into public.service_requests (company_id, service, details) values ($1, $2, $3) returning id, status, requested_by, admin_note, history`;
  const made = {};
  for (const who of ["COMPANY_A", "EDITOR", "PUBLISHER"]) {
    const r = await attempt(who, INS, [A, "websites", `from ${who}`]);
    ok(r.ok && r.rows[0].status === "requested" && r.rows[0].requested_by === U[who] && r.rows[0].history.length === 1, `${who} creates a request (stamped requested, as themselves)`, JSON.stringify(r));
    if (r.ok) made[who] = r.rows[0].id;
  }
  for (const who of ["ANALYST", "STAFF", "COMPANY_B", "INVESTOR"]) {
    const r = await attempt(who, INS, [A, "websites", "x"]);
    ok(!r.ok && r.code === "42501", `${who} cannot create a request for company A`, JSON.stringify(r));
  }
  ok(!(await attempt("anon", INS, [A, "websites", "x"])).ok, "anon cannot create a request");
  const forged = await attempt("COMPANY_A", `insert into public.service_requests (company_id, service, details, status) values ($1, 'brand', 'x', 'done')`, [A]);
  ok(!forged.ok && forged.code === "42501", "a client cannot choose the status (column privilege)");
  const bad = await attempt("COMPANY_A", INS, [A, "yachts", "x"]);
  ok(!bad.ok && bad.code === "23514", "an unknown service is refused (check constraint)");

  const id = made.COMPANY_A;
  const UPD = `update public.service_requests set status = $2, admin_note = $3 where id = $1 returning status, admin_note, history`;
  for (const who of ["COMPANY_A", "EDITOR", "STAFF", "COMPANY_B"]) {
    const r = await attempt(who, UPD, [id, "done", "self-approved"]);
    ok(r.ok ? r.count === 0 : r.code === "42501", `${who} cannot change status (no row updated)`, JSON.stringify(r));
  }
  let r = await attempt("ADMIN", UPD, [id, "in_review", ""]);
  ok(r.ok && r.rows[0].status === "in_review" && r.rows[0].history.length === 2, "platform admin moves it to in_review (history 2 steps)", JSON.stringify(r));
  r = await attempt("ADMIN", UPD, [id, "quoted", "Quote sent by email: 3 pages, 2 weeks."]);
  ok(r.ok && r.rows[0].history.length === 3 && r.rows[0].admin_note.startsWith("Quote"), "quoted with a note (history 3 steps)");
  r = await attempt("ADMIN", UPD, [id, "quoted", "Quote revised."]);
  ok(r.ok && r.rows[0].history.length === 3, "a note-only change adds no history step");
  r = await attempt("ADMIN", UPD, [id, "shipped", ""]);
  ok(!r.ok && r.code === "23514", "an unknown status is refused");
  r = await attempt("ADMIN", `update public.service_requests set details = 'rewritten' where id = $1`, [id]);
  ok(!r.ok && r.code === "42501", "details cannot be rewritten from a client, even by an admin");

  const SEL = `select id from public.service_requests where company_id = $1`;
  for (const [who, n] of [["COMPANY_A", 3], ["ANALYST", 3], ["STAFF", 3], ["ADMIN", 3], ["COMPANY_B", 0], ["INVESTOR", 0]]) {
    r = await attempt(who, SEL, [A]);
    ok(r.ok && r.rows.length === n, `${who} sees ${n} of company A's requests`, JSON.stringify(r));
  }
  r = await attempt("COMPANY_A", `delete from public.service_requests where id = $1`, [id]);
  ok(!r.ok && r.code === "42501", "no client can delete a request");

  await asPostgres();
  await c.query(`savepoint burst`);
  for (let i = 0; i < 17; i++) await c.query(`insert into public.service_requests (company_id, service) values ($1, 'brand')`, [A]);
  r = await attempt("COMPANY_A", INS, [A, "brand", "21st"]);
  ok(!r.ok && /too many service requests/.test(r.msg), "the 21st request in a day is refused", JSON.stringify(r));
  await c.query(`rollback to savepoint burst`);

  await c.query(strip(RB));
  const after = await q(`select to_regclass('public.service_requests') t, (select count(*)::int from pg_proc where proname = 'service_requests_stamp') f`);
  ok(after[0].t === null && after[0].f === 0, "rollback removes the table and the trigger function");
} catch (e) {
  fail++; console.error(`  ✗ unexpected: ${e.message}`);
} finally {
  await c.query("rollback");
  await c.end();
}
console.log(`\n  ${pass} passed, ${fail} failed (transaction ROLLED BACK)\n`);
process.exit(fail ? 1 : 0);
