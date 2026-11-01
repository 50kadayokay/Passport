// 0085 (a17 booth config), verified on STAGING in ONE transaction that is
// always ROLLED BACK.   node scripts/conference-booth-0085-check.mjs
//
// FOR S4 TO RUN (needs supabase/staging/.connection and .isolation-env).
// Applies 0085 inside the transaction, then, as each fixture actor (emulated as
// Supabase does: set local role + request.jwt.claims):
//   - only a platform admin can publish a look; owners, staff, another company
//     and investors are refused
//   - members read their own company's row; another company / investor read nothing
//   - the trigger keeps only template/theme/accent, bumps the version only on a
//     real change, stamps published_by
//   - anon can call conference_booth_config(slug) and gets ONLY slug/studio/
//     version/published_at; an unknown slug returns no row
//   - the rollback file removes everything (functions, table) it created
import fs from "node:fs";
import pg from "pg";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0085_conference_booth_config.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0085_conference_booth_config.rollback.sql", "utf8");
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
  for (const k of ["COMPANY_A", "STAFF", "COMPANY_B", "INVESTOR", "ADMIN"]) U[k] = await uid(k);
  const A = iso.ISOLATION_COMPANY_A_ID;
  const slugA = (await q(`select slug from public.companies where id = $1`, [A]))[0].slug;

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

  const before = await q(`select to_regclass('public.conference_booth_configs') t`);
  ok(before[0].t === null, "0085 not present before the check (nothing to clean up)");

  await c.query(strip(MIG));
  ok(true, "0085 applies inside the transaction");

  const INS = `insert into public.conference_booth_configs (company_id, studio) values ($1, $2::jsonb) returning version, studio, published_by`;
  for (const who of ["COMPANY_A", "STAFF", "COMPANY_B", "INVESTOR"]) {
    const r = await attempt(who, INS, [A, JSON.stringify({ template: "vista" })]);
    ok(!r.ok && r.code === "42501", `${who} cannot publish a booth look`, JSON.stringify(r));
  }
  const anonIns = await attempt("anon", INS, [A, JSON.stringify({ template: "vista" })]);
  ok(!anonIns.ok, "anon cannot publish a booth look");

  const adm = await attempt("ADMIN", INS, [A, JSON.stringify({ template: "vista", theme: "ivory", accent: "#2fb37a", payload: "x".repeat(100), nested: { a: 1 } })]);
  ok(adm.ok && adm.rows[0].version === 1, "platform admin publishes (version 1)", JSON.stringify(adm));
  ok(adm.ok && JSON.stringify(Object.keys(adm.rows[0].studio).sort()) === JSON.stringify(["accent", "template", "theme"]), "trigger keeps only template/theme/accent", JSON.stringify(adm.rows?.[0]?.studio));
  ok(adm.ok && adm.rows[0].published_by === U.ADMIN, "published_by is the admin");

  const UPD = `update public.conference_booth_configs set studio = $2::jsonb where company_id = $1 returning version`;
  const same = await attempt("ADMIN", UPD, [A, JSON.stringify({ template: "vista", theme: "ivory", accent: "#2fb37a" })]);
  ok(same.ok && same.rows[0].version === 1, "saving the same look does not bump the version");
  const chg = await attempt("ADMIN", UPD, [A, JSON.stringify({ template: "keynote", theme: "ivory", accent: "" })]);
  ok(chg.ok && chg.rows[0].version === 2, "a real change bumps the version to 2");
  const ownerUpd = await attempt("COMPANY_A", UPD, [A, JSON.stringify({ template: "vein" })]);
  ok(ownerUpd.ok && ownerUpd.count === 0, "owner update touches no row (RLS: admins only)", JSON.stringify(ownerUpd));
  const verUpd = await attempt("ADMIN", `update public.conference_booth_configs set version = 99 where company_id = $1`, [A]);
  ok(!verUpd.ok && verUpd.code === "42501", "version cannot be written directly (column privilege)");

  const SEL = `select company_id, version from public.conference_booth_configs where company_id = $1`;
  for (const [who, n] of [["COMPANY_A", 1], ["STAFF", 1], ["ADMIN", 1], ["COMPANY_B", 0], ["INVESTOR", 0]]) {
    const r = await attempt(who, SEL, [A]);
    ok(r.ok && r.rows.length === n, `${who} reads ${n} row(s) of company A's booth config`, JSON.stringify(r));
  }
  const anonSel = await attempt("anon", SEL, [A]);
  ok(!anonSel.ok, "anon cannot read the table directly");

  const fn = await attempt("anon", `select * from public.conference_booth_config($1)`, [slugA]);
  ok(fn.ok && fn.rows.length === 1 && fn.rows[0].version === 2 && fn.rows[0].studio.template === "keynote", "anon reads the published look by slug", JSON.stringify(fn));
  ok(fn.ok && JSON.stringify(Object.keys(fn.rows[0]).sort()) === JSON.stringify(["published_at", "slug", "studio", "version"]), "the public read returns only slug/studio/version/published_at");
  const none = await attempt("anon", `select * from public.conference_booth_config($1)`, ["no-such-company-0085"]);
  ok(none.ok && none.rows.length === 0, "unknown slug -> no row");

  await c.query(strip(RB));
  const after = await q(`select to_regclass('public.conference_booth_configs') t,
    (select count(*)::int from pg_proc where proname in ('conference_booth_config','conference_booth_configs_normalise') and pronamespace = 'public'::regnamespace) f`);
  ok(after[0].t === null && after[0].f === 0, "rollback removes the table and both functions");
} catch (e) {
  fail++; console.error(`  ✗ unexpected: ${e.message}`);
} finally {
  await c.query("rollback");
  await c.end();
}
console.log(`\n  ${pass} passed, ${fail} failed (transaction ROLLED BACK)\n`);
process.exit(fail ? 1 : 0);
