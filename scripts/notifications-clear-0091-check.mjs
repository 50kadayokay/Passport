// 0091 (Clear all: no platform-admin bypass), verified on STAGING in ONE
// transaction that is always ROLLED BACK.   node scripts/notifications-clear-0091-check.mjs
//
// FOR S4 TO RUN (needs supabase/staging/.connection and .isolation-env).
// Inside the transaction: a throwaway company (owner = company A's owner; the
// admin, editor, analyst and viewer fixtures as members), then:
//   - before 0091 (0090 on staging): a platform admin with no membership CAN
//     clear, recorded as the baseline
//   - 0091 applies; owner and admin clear; editor, analyst, viewer, another
//     company, an investor, anon and a platform admin with no membership (or an
//     editor, or a suspended admin, membership) are refused (42501) and
//     cleared_at is unchanged
//   - a platform admin with an active admin membership of their own clears
//   - the rollback restores 0090's definition exactly (the platform admin with
//     no membership can clear again)
// Nothing is committed; prints no secrets.
import fs from "node:fs";
import pg from "pg";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0091_notification_clear_no_platform_admin.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0091_notification_clear_no_platform_admin.rollback.sql", "utf8");
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
  for (const k of ["COMPANY_A", "COADMIN", "EDITOR", "ANALYST", "STAFF", "COMPANY_B", "INVESTOR", "ADMIN"]) U[k] = await uid(k);
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
  const reset = () => q(`delete from public.company_notification_reads where company_id = $1`, [X]);
  const CLEAR = `select public.mark_notifications_cleared($1) at`;

  // If 0091 is ever on staging, unwind it inside the transaction first (nothing is committed).
  // Match code, not text: pg_get_functiondef keeps comments, and 0091's names 0090's check.
  const is0091 = (d) => /m\.role in \('owner','admin'\)/.test(d);
  if (is0091(await def())) await c.query(strip(RB));
  ok((await q(`select role from public.profiles where id = $1`, [U.ADMIN]))[0]?.role === "admin", "ISOLATION_ADMIN is a platform admin (profiles.role = 'admin')");
  const X = (await q(`insert into public.companies (slug, name, owner_id, status, tier) values ($1, 'A0091 Notifications', $2, 'published', 'pro') returning id`, [`zz-0091-${Date.now().toString(36)}`, U.COMPANY_A]))[0].id;
  for (const [k, role] of [["COADMIN", "admin"], ["EDITOR", "editor"], ["ANALYST", "analyst"], ["STAFF", "viewer"]]) await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, $3, 'active')`, [X, U[k], role]);
  ok(!(await q(`select 1 from public.company_memberships where company_id = $1 and user_id = $2`, [X, U.ADMIN])).length, "throwaway company with owner, admin, editor, analyst, viewer; the platform admin holds nothing in it");

  const before = await def();
  ok(/if not public\.has_company_role\(p_company, array\['owner','admin'\]\) then/.test(before) && !is0091(before), "before 0091: mark_notifications_cleared checks has_company_role owner/admin (0090)");
  let r = await attempt("ADMIN", CLEAR, [X]);
  ok(r.ok, "baseline: under 0090 a platform admin with no membership CAN clear (has_company_role adds platform_admin)", r.msg);
  await reset();

  await c.query(strip(MIG));
  const after = await def();
  ok(is0091(after) && !/if not public\.has_company_role/.test(after), "0091 applies inside the transaction");
  const meta = await q(`select p.prosecdef, p.proconfig, pg_get_function_result(p.oid) res, has_function_privilege('anon', p.oid, 'execute') anon_x, has_function_privilege('authenticated', p.oid, 'execute') auth_x
                          from pg_proc p where p.oid = 'public.mark_notifications_cleared(uuid)'::regprocedure`);
  ok(meta[0].prosecdef && String(meta[0].proconfig) === "search_path=public, pg_temp" && meta[0].res === "timestamp with time zone" && !meta[0].anon_x && meta[0].auth_x,
    "signature, security definer, search_path and grants unchanged (authenticated only)", JSON.stringify(meta[0]));

  console.log("\n  REFUSED (nothing written)");
  const refused = async (who, label) => {
    r = await attempt(who, CLEAR, [X]);
    ok(!r.ok && r.code === "42501" && (await clearedAt()) === null, `${label}: refused (42501), cleared_at unchanged`, r.ok ? "was allowed" : `${r.code} ${r.msg}`);
  };
  await refused("ADMIN", "platform admin with no membership");
  for (const [who, label] of [["STAFF", "viewer"], ["ANALYST", "analyst"], ["EDITOR", "editor"], ["COMPANY_B", "another company's owner"], ["INVESTOR", "an investor"], ["anon", "anon"]]) await refused(who, label);
  await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, 'editor', 'active')`, [X, U.ADMIN]);
  await refused("ADMIN", "platform admin with an editor membership");
  await q(`update public.company_memberships set role = 'admin', status = 'suspended' where company_id = $1 and user_id = $2`, [X, U.ADMIN]);
  await refused("ADMIN", "platform admin with a suspended admin membership");

  console.log("\n  ALLOWED");
  r = await attempt("COMPANY_A", CLEAR, [X]);
  ok(r.ok && r.rows[0].at && (await clearedAt()), "owner (owner_id): clears (returns the clear time, cleared_at set)", r.msg);
  await reset();
  r = await attempt("COADMIN", CLEAR, [X]);
  ok(r.ok && (await clearedAt()), "admin: clears", r.msg);
  await reset();
  await q(`update public.company_memberships set status = 'active' where company_id = $1 and user_id = $2`, [X, U.ADMIN]);
  r = await attempt("ADMIN", CLEAR, [X]);
  ok(r.ok && (await clearedAt()), "platform admin with an active admin membership of their own: clears", r.msg);
  await q(`delete from public.company_memberships where company_id = $1 and user_id = $2`, [X, U.ADMIN]);
  const t = await clearedAt();
  r = await attempt("ADMIN", CLEAR, [X]);
  ok(!r.ok && r.code === "42501" && String(await clearedAt()) === String(t), "membership removed: the platform admin is refused again; the earlier clear stands");

  console.log("\n  UNCHANGED");
  // Reading is 0064's owns_company() rule, untouched by 0091: members read, a platform admin
  // with no membership never could (unchanged).
  const pa = await attempt("ADMIN", `select count(*)::int n from public.company_notifications($1, 50)`, [X]);
  ok(!pa.ok, "platform admin without membership: still cannot read the list (owns_company, unchanged)", pa.ok ? "read allowed" : "");
  for (const [who, label] of [["STAFF", "viewer"]]) {
    const l = await attempt(who, `select count(*)::int n from public.company_notifications($1, 50)`, [X]);
    ok(l.ok, `${label}: still reads the list`, l.msg || "");
  }
  ok(String(await clearedAt()) === String(t), "reading never moves cleared_at");

  console.log("\n  ROLLBACK");
  await c.query(strip(RB));
  ok((await def()) === before, "the rollback restores 0090's definition exactly");
  await reset();
  r = await attempt("ADMIN", CLEAR, [X]);
  ok(r.ok, "after the rollback a platform admin with no membership can clear again (0090 behaviour)", r.msg);
  r = await attempt("STAFF", CLEAR, [X]);
  ok(!r.ok && r.code === "42501", "...and a viewer is still refused (0090 stays in force)", r.ok ? "was allowed" : "");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback");
}
ok(!(await q(`select 1 from public.companies where slug like 'zz-0091-%'`)).length, "transaction rolled back: no throwaway company left");
await c.end();
console.log(`\n  notifications-clear-0091-check (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
