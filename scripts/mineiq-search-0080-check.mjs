// 0080 (mineiq_search matches ANY word), verified on STAGING in ONE
// transaction that is always ROLLED BACK.
//   node scripts/mineiq-search-0080-check.mjs        (npm run check:s1-0080-staging)
//
// FOR S4 TO RUN (needs supabase/staging/.connection and .isolation-env).
// Inside the transaction, as company A's and B's owners (set local role
// authenticated + request.jwt.claims, as Supabase does):
//   - before 0080: the a07 question "What did <word> raise?" finds NOTHING for a
//     release that says "placement"/"proceeds" (the defect, as a baseline)
//   - 0080 applies; the same question finds the release and its current fact;
//     the superseded fact is absent; company B's matching release is absent;
//     B's owner asking about A gets 42501; anon cannot execute it; a question of
//     stopwords only returns nothing
//   - a08 still holds: a taken-down release still matches the SQL and is still
//     dropped by the API layer's liveness reads + keepActive()
//   - the rollback restores 0050a (the question finds nothing again)
// Fixture rows go into the isolation companies A and B as postgres inside the
// transaction. Nothing is committed; prints no secrets.
import fs from "node:fs";
import pg from "pg";
import { keepActive } from "../src/lib/mineiqActive.js";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0080_mineiq_search_any_term.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0080_mineiq_search_any_term.rollback.sql", "utf8");
const strip = (sql) => sql.replace(/^\s*begin;\s*$/gim, "").replace(/^\s*commit;\s*$/gim, "");
const rd = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const iso = rd("supabase/staging/.isolation-env");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const A = iso.ISOLATION_COMPANY_A_ID, B = iso.ISOLATION_COMPANY_B_ID;
const uid = async (k) => (await one(`select id from auth.users where email = $1`, [iso[`ISOLATION_${k}_EMAIL`]])).id;
const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); };
let sp = 0;
// One call as a role; an error is returned (code), never thrown, and undone by a savepoint.
const as = async (who, sql, args) => {
  await c.query("reset role");
  if (who === "anon") { await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]); await c.query("set local role anon"); }
  else { await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who, role: "authenticated" })]); await c.query("set local role authenticated"); }
  const n = `p${++sp}`; await c.query(`savepoint ${n}`);
  try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { rows: r.rows }; }
  catch (e) { await c.query(`rollback to savepoint ${n}`); return { code: e.code, msg: e.message, rows: [] }; }
  finally { await asPostgres(); }
};
const SEARCH = `select source, id, body from public.mineiq_search($1, $2, 50)`;
const ids = (rows, source) => rows.filter((r) => r.source === source).map((r) => r.id);

const T = `a80zq${Date.now().toString(36)}`;   // one word only this run's rows contain
const QUESTION = `What did ${T} raise?`;      // S4's a07 question: "raise" is not in the text
await c.query("begin");
try {
  const UA = await uid("COMPANY_A"), UB = await uid("COMPANY_B");
  const release = async (company, author, body, pubStatus) => {
    const u = (await one(`insert into public.updates (company_id, author_id, body, status, published_on, detected) values ($1, $2, $3, 'published', '2026-10-28', $4::jsonb) returning id`,
      [company, author, body, JSON.stringify({ headline: `${T} Closes C$2.1 Million Placement` })])).id;
    const p = (await one(`insert into public.publications (company_id, update_id, destination_id, status, published_at) values ($1, $2, 'passport', $3, now()) returning id`, [company, u, pubStatus])).id;
    return { u, p };
  };
  const fact = async (company, pub, quote, sup = null) => (await one(
    `insert into public.facts (company_id, kind, subject, data, quote, confidence, publication_id, superseded_by) values ($1, 'financing', $2, $3::jsonb, $4, 0.9, $5, $6) returning id`,
    [company, `${T} placement`, JSON.stringify({ disclosed_on: "2026-10-28" }), quote, pub, sup])).id;

  const LIVE = await release(A, UA, `${T} The Company closed a non-brokered placement for gross proceeds of C$2,100,000.`, "published");
  const F_CUR = await fact(A, LIVE.p, `${T} placement gross proceeds of C$2,100,000`);
  const F_OLD = await fact(A, LIVE.p, `${T} placement gross proceeds of C$1,900,000`, F_CUR);
  const DOWN = await release(A, UA, `${T} An earlier placement that was taken down, gross proceeds C$9,900,000.`, "draft");   // unpublish_publication's result
  const OTHER = await release(B, UB, `${T} Company B placement, gross proceeds of C$7,700,000.`, "published");

  console.log("\n  BEFORE 0080 (baseline)");
  let r = await as(UA, SEARCH, [A, QUESTION]);
  ok(!r.code && r.rows.length === 0, `0050a: "${QUESTION.replace(T, "<word>")}" finds nothing (every word required; the defect)`, r.msg || `${r.rows.length} rows`);

  console.log("\n  0080 APPLIES");
  await c.query(strip(MIG));
  ok(/plainto_tsquery/.test((await one(`select pg_get_functiondef('public.mineiq_search(uuid, text, integer)'::regprocedure) d`)).d), "mineiq_search is now the 0080 definition");
  r = await as(UA, SEARCH, [A, QUESTION]);
  ok(ids(r.rows, "release").includes(LIVE.u), "the natural question finds the release", r.msg || JSON.stringify(r.rows.map((x) => x.source)));
  ok(ids(r.rows, "fact").includes(F_CUR), "...and its current fact");
  ok(!ids(r.rows, "fact").includes(F_OLD), "a superseded fact is still absent");
  ok(!ids(r.rows, "release").includes(OTHER.u) && !r.rows.some((x) => /Company B/.test(x.body || "")), "company B's matching release is never returned to company A");
  const rb = await as(UB, SEARCH, [A, QUESTION]);
  ok(rb.code === "42501" && rb.rows.length === 0, "company B's owner asking about company A gets 42501", rb.code);
  const an = await as("anon", SEARCH, [A, QUESTION]);
  ok(an.code === "42501" && /permission denied/i.test(an.msg || ""), "anon cannot execute it (grants unchanged)", an.code);
  const sw = await as(UA, SEARCH, [A, "what did the and of it?"]);
  ok(!sw.code && sw.rows.length === 0, "a question of stopwords only returns nothing", sw.msg);
  const own = await as(UB, SEARCH, [B, QUESTION]);
  ok(ids(own.rows, "release").includes(OTHER.u) && !ids(own.rows, "release").includes(LIVE.u), "company B's own question finds only its own release");

  console.log("\n  a08 STILL HOLDS (the API layer filters)");
  ok(ids(r.rows, "release").includes(DOWN.u), "the SQL still matches a taken-down release (updates.status stays 'published')");
  const rel = ids(r.rows, "release"), fac = ids(r.rows, "fact");
  const live = await as(UA, `select
      (select coalesce(array_agg(update_id), '{}') from public.publications where update_id = any($1::uuid[]) and destination_id = 'passport' and status = 'published') u,
      (select coalesce(array_agg(f.id), '{}') from public.facts f join public.publications p on p.id = f.publication_id where f.id = any($2::uuid[]) and p.status = 'published') f`, [rel, fac]);
  const kept = keepActive(r.rows, { updateIds: live.rows[0].u, factIds: live.rows[0].f });
  ok(ids(kept, "release").includes(LIVE.u) && !ids(kept, "release").includes(DOWN.u) && ids(kept, "fact").includes(F_CUR),
     "after the liveness reads (as the user) and keepActive(): the live release and fact stay, the taken-down release is dropped");

  console.log("\n  ROLLBACK");
  await c.query(strip(RB));
  const d = (await one(`select pg_get_functiondef('public.mineiq_search(uuid, text, integer)'::regprocedure) d`)).d;
  ok(/websearch_to_tsquery/.test(d) && !/plainto_tsquery/.test(d), "the rollback restores 0050a's definition");
  r = await as(UA, SEARCH, [A, QUESTION]);
  ok(!r.code && r.rows.length === 0, "...and the natural question finds nothing again (0050a behaviour)");
  const an2 = await as("anon", SEARCH, [A, QUESTION]);
  ok(an2.code === "42501", "...with anon still unable to execute it");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
await asPostgres().catch(() => {});
const left = await one(`select (select count(*) from public.updates where body like $1)::int u, (select count(*) from public.facts where quote like $1)::int f,
  position('plainto_tsquery' in pg_get_functiondef('public.mineiq_search(uuid, text, integer)'::regprocedure)) > 0 as still0080`, [`${T}%`]);
ok(left.u === 0 && left.f === 0 && !left.still0080, "nothing persisted: no rows from this run, and staging's mineiq_search is unchanged", JSON.stringify(left));
await c.end();
console.log(`\n  mineiq-search-0080 (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
