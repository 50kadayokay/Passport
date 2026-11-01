// a19: mineiq_search() supersession and isolation, verified on STAGING in ONE
// transaction that is always ROLLED BACK.   node scripts/mineiq-search-supersession-check.mjs
//
// The offline harness (mineiq-grounding-eval.mjs) stubs mineiq_search with the
// 0050a contract. This proves the SQL holds that contract: as company A's owner
// (set local role authenticated + request.jwt.claims, as Supabase does),
//   - a superseded fact is NOT returned, the fact that superseded it IS;
//   - a historical fact (no measure, never superseded) is returned;
//   - company B's fact with the same words is NOT returned;
//   - company B's owner asking about A gets 42501, not rows.
// Fixture rows are inserted as postgres inside the transaction and vanish with it.
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
const A = iso.ISOLATION_COMPANY_A_ID, B = iso.ISOLATION_COMPANY_B_ID;
const uid = async (k) => (await q(`select id from auth.users where email = $1`, [iso[`ISOLATION_${k}_EMAIL`]]))[0].id;
const asUser = async (id) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: "authenticated" })]); await c.query("set local role authenticated"); };
const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); };

const T = `a19${Date.now().toString(36)}`;   // a unique word so only these rows match
const before = (await q(`select count(*)::int n from public.facts`))[0].n;
try {
  const UA = await uid("COMPANY_A"), UB = await uid("COMPANY_B");
  await c.query("begin");
  const ins = async (company, quote, extra = {}) => (await q(
    `insert into public.facts (company_id, kind, subject, data, quote, confidence, measure, superseded_by)
     values ($1, $2, $3, $4::jsonb, $5, 0.9, $6, $7) returning id`,
    [company, extra.kind || "capital", `${T} subject`, JSON.stringify({ disclosed_on: extra.on || "2026-10-05" }), quote, extra.measure || null, extra.sup || null]))[0].id;
  const cur = await ins(A, `${T} 48,900,000 common shares outstanding.`, { measure: `capital|${T}|shares` });
  const old = await ins(A, `${T} 41,250,000 common shares outstanding.`, { measure: `capital|${T}|shares`, on: "2026-06-30", sup: cur });
  const hist = await ins(A, `${T} hole HR-26-014 returned 14.2 g/t Au over 6.0 metres.`, { kind: "drill_result" });
  const other = await ins(B, `${T} 120,000,000 common shares outstanding.`);

  await asUser(UA);
  const rows = await q(`select source, id, body, occurred_on::text occurred_on from public.mineiq_search($1, $2, 50)`, [A, `${T} shares outstanding`]);
  const ids = rows.filter((r) => r.source === "fact").map((r) => r.id);
  ok(ids.includes(cur), "the current fact is returned");
  ok(!ids.includes(old), "the superseded fact is NOT returned");
  ok(!ids.includes(other), "company B's fact is NOT returned to company A");
  const h = await q(`select id from public.mineiq_search($1, $2, 50) where source = 'fact'`, [A, `${T} HR-26-014`]);
  ok(h.some((r) => r.id === hist), "a historical drill result (never superseded) is returned");
  ok(rows.find((r) => r.id === cur)?.occurred_on === "2026-10-05", "the disclosure date comes back for citation");
  await asPostgres();

  await asUser(UB);
  await c.query("savepoint s1");
  let code = null;
  try { await q(`select * from public.mineiq_search($1, $2, 50)`, [A, `${T} shares`]); }
  catch (e) { code = e.code; }
  await c.query("rollback to savepoint s1");
  ok(code === "42501", "company B's owner asking about company A gets 42501", `code=${code}`);
  await asPostgres();
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
await asPostgres().catch(() => {});
ok((await q(`select count(*)::int n from public.facts`))[0].n === before && (await q(`select count(*)::int n from public.facts where quote like $1`, [`${T}%`]))[0].n === 0, "nothing persisted on staging");
await c.end();
console.log(`\n  mineiq-search-supersession (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
