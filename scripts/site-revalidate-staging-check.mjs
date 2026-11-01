// a15 website revalidation, verified on STAGING in ONE transaction that is
// always ROLLED BACK.   node scripts/site-revalidate-staging-check.mjs
//
// FOR S4 TO RUN (needs supabase/staging/.connection and .isolation-env).
// No migration: the hook URL is company_destinations.config.revalidate_url
// (destination 'website', Site Contract §5) and the signing key is derived
// from a server env secret, so nothing new is stored. This proves the rules
// the listener relies on:
//   - company A's drafting roles can set its revalidate_url; another company,
//     an investor and anon can neither set nor read it
//   - the service role (the dispatcher) reads it and can record the outcome
//     (status, last_error), exactly as api/_siteRevalidate.js writes it
//   - no column anywhere in public holds a revalidate secret
// It makes no outbound call; the hook itself is never contacted.
import fs from "node:fs";
import pg from "pg";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
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
  for (const k of ["COMPANY_A", "STAFF", "COMPANY_B", "INVESTOR"]) U[k] = await uid(k);
  const A = iso.ISOLATION_COMPANY_A_ID;
  const asUser = async (id) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: "authenticated" })]); await c.query("set local role authenticated"); };
  const asRole = async (role) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role })]); await c.query(`set local role ${role}`); };
  const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); };
  let sp = 0;
  const attempt = async (who, sql, args) => {
    if (who === "anon" || who === "service_role") await asRole(who); else await asUser(U[who]);
    const n = `p${++sp}`; await c.query(`savepoint ${n}`);
    try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, rows: r.rows, n: r.rowCount }; }
    catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, code: e.code, msg: e.message }; }
    finally { await asPostgres(); }
  };

  ok((await q(`select count(*)::int n from public.destinations where id = 'website'`))[0].n === 1, "the 'website' destination exists");
  await q(`delete from public.company_destinations where company_id = $1 and destination_id = 'website'`, [A]);   // rolled back
  const HOOK = "https://ir.example-mining.invalid/api/revalidate";
  const UPSERT = `insert into public.company_destinations (company_id, destination_id, enabled, config)
                  values ($1, 'website', true, jsonb_build_object('revalidate_url', $2::text))
                  on conflict (company_id, destination_id) do update set config = excluded.config returning company_id`;
  let r = await attempt("COMPANY_A", UPSERT, [A, HOOK]);
  ok(r.ok && r.n === 1, "company A sets its website revalidate_url", r.msg);
  for (const who of ["COMPANY_B", "INVESTOR"]) {
    const w = await attempt(who, `update public.company_destinations set config = jsonb_build_object('revalidate_url', 'https://attacker.invalid/') where company_id = $1 and destination_id = 'website'`, [A]);
    ok((w.ok && w.n === 0) || !w.ok, `${who} cannot repoint company A's hook`);
    const i = await attempt(who, UPSERT, [A, "https://attacker.invalid/"]);
    ok(!i.ok, `${who} cannot insert a hook for company A`);
  }
  const anonW = await attempt("anon", UPSERT, [A, "https://attacker.invalid/"]);
  ok(!anonW.ok, "anon cannot set a hook");

  const READ = `select config->>'revalidate_url' u from public.company_destinations where company_id = $1 and destination_id = 'website'`;
  for (const [who, n] of [["COMPANY_A", 1], ["STAFF", 1], ["COMPANY_B", 0], ["INVESTOR", 0]]) {
    const x = await attempt(who, READ, [A]);
    ok(x.ok && x.rows.length === n, `${who} ${n ? "reads" : "does not read"} company A's hook`, JSON.stringify(x));
  }
  const anonR = await attempt("anon", READ, [A]);
  ok(!anonR.ok || anonR.rows.length === 0, "anon does not read it");
  ok((await q(READ, [A]))[0].u === HOOK, "the stored URL is exactly what company A set");

  const svc = await attempt("service_role", `select enabled, config from public.company_destinations where company_id = $1 and destination_id = 'website'`, [A]);
  ok(svc.ok && svc.rows[0] && svc.rows[0].config.revalidate_url === HOOK && svc.rows[0].enabled === true, "the service role (dispatcher) reads enabled + config");
  const note = await attempt("service_role", `update public.company_destinations set status = 'error', last_error = 'website revalidate failed: revalidate hook answered 500', updated_at = now()
                                             where company_id = $1 and destination_id = 'website'`, [A]);
  ok(note.ok && note.n === 1, "the service role records the outcome (status, last_error)", note.msg);
  const seen = await attempt("COMPANY_A", `select status, last_error from public.company_destinations where company_id = $1 and destination_id = 'website'`, [A]);
  ok(seen.ok && seen.rows[0].status === "error" && /500/.test(seen.rows[0].last_error), "company A sees the hook's last error");

  const cols = await q(`select table_name, column_name from information_schema.columns
                        where table_schema = 'public' and (column_name ilike '%revalidat%' or column_name ilike '%hmac%' or column_name ilike '%signing%')`);
  ok(cols.length === 0, "no column in public is a revalidate/signing secret (the key is derived server-side)", JSON.stringify(cols));
} catch (e) {
  fail++; console.error(`  ✗ unexpected: ${e.message}`);
} finally {
  await c.query("rollback");
  await c.end();
}
console.log(`\n  ${pass} passed, ${fail} failed (transaction ROLLED BACK)\n`);
process.exit(fail ? 1 : 0);
