// node scripts/mineiq-search-0080-live-check.mjs -- staging, S4. After 0080 is applied: the LIVE
// mineiq_search answers natural questions and keeps its tenant guard. One transaction, always rolled back.
import fs from "node:fs"; import pg from "pg";
const env = Object.fromEntries(fs.readFileSync("supabase/staging/.isolation-env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim(); if (!url.includes("jmljfovtfxcdhjmtlnva")) process.exit(2);
const A = env.ISOLATION_COMPANY_A_ID;
let pass = 0, fail = 0; const ok = (c, m, d = "") => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${m}${!c && d ? "  " + d : ""}`); };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } }); await c.connect();
const one = async (s, a) => (await c.query(s, a)).rows[0];
const uid = async (k) => (await one(`select id from auth.users where email=$1`, [env[`ISOLATION_${k}_EMAIL`]])).id;
let sp = 0;
const as = async (who, q) => { await c.query("reset role");
  await c.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify(who ? { sub: who, role: "authenticated" } : { role: "anon" })]);
  await c.query(who ? "set local role authenticated" : "set local role anon"); const n = `s${++sp}`; await c.query(`savepoint ${n}`);
  try { const r = await c.query(`select source, id from public.mineiq_search($1,$2,20)`, [A, q]); await c.query(`release savepoint ${n}`); return { rows: r.rows }; }
  catch (e) { await c.query(`rollback to savepoint ${n}`); return { code: e.code, rows: [] }; } finally { await c.query("reset role"); } };
const T = `zq${Date.now().toString(36)}`;
await c.query("begin");
try {
  ok((await one(`select position('plainto_tsquery' in pg_get_functiondef('public.mineiq_search(uuid,text,integer)'::regprocedure)) > 0 as x`)).x, "the live function is 0080 (not unwound or re-applied here)");
  const UA = await uid("COMPANY_A"), UB = await uid("COMPANY_B"), UI = await uid("INVESTOR"), US = await uid("STAFF");
  const u = (await one(`insert into public.updates (company_id, author_id, body, status, published_on) values ($1,$2,$3,'published','2026-10-30') returning id`, [A, UA, `${T} Iso Alpha closed a non-brokered placement for gross proceeds of C$2,100,000.`])).id;
  await c.query(`insert into public.publications (company_id, update_id, destination_id, status, published_at) values ($1,$2,'passport','published',now())`, [A, u]);
  const Q = `What did ${T} raise?`;
  let r = await as(UA, Q); ok(!r.code && r.rows.some((x) => x.id === u), `owner: "What did <name> raise?" finds the release ("raise" is not in the text)`, JSON.stringify(r));
  r = await as(UA, `How much money did ${T} bring in from the placement?`); ok(r.rows.some((x) => x.id === u), "owner: a differently worded question also finds it");
  r = await as(UB, Q); ok(r.code === "42501" && !r.rows.length, "another company's owner: 42501", r.code);
  r = await as(UI, Q); ok(r.code === "42501" && !r.rows.length, "an investor: 42501", r.code);
  r = await as(null, Q); ok(r.code === "42501" && !r.rows.length, "anon: 42501", r.code);
  r = await as(UA, "what did the and of it?"); ok(!r.code && r.rows.length === 0, "stopwords only: nothing");
} catch (e) { ok(false, "unexpected", e.message); } finally { await c.query("rollback"); }
ok(!(await one(`select count(*)::int n from public.updates where body like $1`, [`${T}%`])).n, "nothing persisted");
await c.end(); console.log(`\n  mineiq-search live probe (staging, rolled back): ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
