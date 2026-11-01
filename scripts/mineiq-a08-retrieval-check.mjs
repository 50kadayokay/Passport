// a08 on STAGING: a taken-down release leaves Mine IQ retrieval, in ONE
// transaction that is always ROLLED BACK.
//   node scripts/mineiq-a08-retrieval-check.mjs        (npm run check:s1-a08-staging)
//
// Retrieval is mineiq_search() followed by the a08 liveness reads
// (src/lib/mineiqActive.js), both made AS THE CALLER. This runs both the same
// way on the real schema and RLS -- set local role authenticated +
// request.jwt.claims, as Supabase does -- with keepActive() deciding, so the
// rule that ships is the rule that is checked:
//   published    → the release text and its fact are retrievable
//   taken down   → (the real unpublish_publication) neither text nor fact
//   republished  → both back: nothing was deleted
//   revised      → only the current body and the current fact
//   deleted pub  → neither text nor fact
//   company B    → its matching content is never returned to A; B's owner
//                  asking about A gets 42501
// Fixture rows go into the isolation companies A and B as postgres inside the
// transaction and vanish with it. No API, no model, nothing committed.
import fs from "node:fs";
import pg from "pg";
import { keepActive } from "../src/lib/mineiqActive.js";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
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
const asUser = async (id) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: "authenticated" })]); await c.query("set local role authenticated"); };
const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); };

// What _mineiqSearch.js does, as that user: the search, then the two liveness
// reads activeFilterPaths() builds (publications by update, facts inner-joined
// to their publication), then keepActive().
async function retrieve(user, company, query) {
  await asUser(user);
  const rows = await q(`select source, id, body from public.mineiq_search($1, $2, 50)`, [company, query]);
  const rel = rows.filter((r) => r.source === "release").map((r) => r.id);
  const fac = rows.filter((r) => r.source === "fact").map((r) => r.id);
  const updateIds = rel.length ? (await q(`select update_id from public.publications where update_id = any($1::uuid[]) and destination_id = 'passport' and status = 'published'`, [rel])).map((r) => r.update_id) : [];
  const factIds = fac.length ? (await q(`select f.id from public.facts f join public.publications p on p.id = f.publication_id where f.id = any($1::uuid[]) and p.status = 'published'`, [fac])).map((r) => r.id) : [];
  await asPostgres();
  return { raw: rows, kept: keepActive(rows, { updateIds, factIds }) };
}
const ids = (rows, source) => rows.filter((r) => r.source === source).map((r) => r.id);

const T = `a08${Date.now().toString(36)}`;   // a unique word so only these rows match
let P1 = null;
try {
  const UA = await uid("COMPANY_A"), UB = await uid("COMPANY_B");
  await c.query("begin");
  const release = async (company, author, body) => (await one(
    `insert into public.updates (company_id, author_id, body, status, published_on, detected) values ($1, $2, $3, 'published', '2026-10-05', $4::jsonb) returning id`,
    [company, author, body, JSON.stringify({ headline: `${T} release` })])).id;
  const publication = async (company, update) => (await one(
    `insert into public.publications (company_id, update_id, destination_id, status, published_at) values ($1, $2, 'passport', 'published', now()) returning id`, [company, update])).id;
  const fact = async (company, pub, quote) => (await one(
    `insert into public.facts (company_id, kind, subject, data, quote, confidence, publication_id) values ($1, 'financing', $2, $3::jsonb, $4, 0.9, $5) returning id`,
    [company, `${T} placement`, JSON.stringify({ disclosed_on: "2026-10-05" }), quote, pub])).id;

  const U1 = await release(A, UA, `${T} The Company closed a placement of C$4.2 million.`);
  P1 = await publication(A, U1);
  const F1 = await fact(A, P1, `${T} closed a placement of C$4.2 million`);
  const UBr = await release(B, UB, `${T} Company B closed a placement of C$7.7 million.`);
  const PB = await publication(B, UBr);
  const FB = await fact(B, PB, `${T} Company B placement of C$7.7 million`);

  console.log("\n  PUBLISHED");
  let r = await retrieve(UA, A, `${T} placement`);
  ok(ids(r.kept, "release").includes(U1) && ids(r.kept, "fact").includes(F1), "the release text and its fact are retrievable");
  ok(!ids(r.raw, "release").includes(UBr) && !ids(r.raw, "fact").includes(FB), "company B's matching release and fact are never returned to company A");

  console.log("\n  TAKEN DOWN (unpublish_publication)");
  const un = (await one(`select public.unpublish_publication($1, $2) j`, [P1, UA])).j;
  ok(un && un.ok && (await one(`select status from public.publications where id = $1`, [P1])).status === "draft"
     && (await one(`select status from public.updates where id = $1`, [U1])).status === "published",
     "the real take-down flips the publication and leaves updates.status 'published'", JSON.stringify(un));
  r = await retrieve(UA, A, `${T} placement`);
  ok(ids(r.raw, "release").includes(U1), "mineiq_search alone still matches it (why the a08 filter is needed)");
  ok(!ids(r.kept, "release").includes(U1) && !ids(r.kept, "fact").includes(F1), "neither its text nor its fact is returned");
  ok(!!(await one(`select 1 x from public.facts where id = $1`, [F1])) && !!(await one(`select 1 x from public.updates where id = $1`, [U1])), "the fact and the release are still there (audit record)");

  console.log("\n  REPUBLISHED");
  await q(`update public.publications set status = 'published', published_at = now() where id = $1`, [P1]);
  r = await retrieve(UA, A, `${T} placement`);
  ok(ids(r.kept, "release").includes(U1) && ids(r.kept, "fact").includes(F1), "its text and its fact are back");

  console.log("\n  REVISED");
  await q(`update public.updates set body = $2 where id = $1`, [U1, `${T} The Company closed a placement of C$4.6 million (corrected).`]);
  const F1b = await fact(A, P1, `${T} closed a placement of C$4.6 million`);
  await q(`update public.facts set superseded_by = $2 where id = $1`, [F1, F1b]);   // what mineiq_facts_v1 does for a claim a correction changed
  r = await retrieve(UA, A, `${T} placement`);
  const relBody = (r.kept.find((x) => x.id === U1) || {}).body || "";
  ok(/C\$4\.6 million \(corrected\)/.test(relBody) && !/4\.2/.test(relBody), "only the release's current body is returned");
  ok(ids(r.kept, "fact").includes(F1b) && !ids(r.kept, "fact").includes(F1), "only the current fact is returned");

  console.log("\n  DELETED PUBLICATION");
  await q(`delete from public.publications where id = $1`, [P1]);
  ok((await one(`select publication_id from public.facts where id = $1`, [F1b])).publication_id === null, "the fact survives with publication_id null (on delete set null)");
  r = await retrieve(UA, A, `${T} placement`);
  ok(!ids(r.kept, "release").includes(U1) && !ids(r.kept, "fact").includes(F1b), "neither its text nor its fact is returned");

  console.log("\n  OTHER COMPANY");
  r = await retrieve(UB, B, `${T} placement`);
  ok(ids(r.kept, "release").includes(UBr) && ids(r.kept, "fact").includes(FB) && !ids(r.raw, "release").includes(U1), "company B sees only its own live release and fact");
  await asUser(UB);
  await c.query("savepoint s1");
  let code = null;
  try { await q(`select * from public.mineiq_search($1, $2, 50)`, [A, `${T} placement`]); } catch (e) { code = e.code; }
  await c.query("rollback to savepoint s1");
  await asPostgres();
  ok(code === "42501", "company B's owner asking about company A gets 42501", `code=${code}`);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
await asPostgres().catch(() => {});
// Checked by this run's own marks, not table counts: other sessions write to staging.
const left = await one(`select (select count(*) from public.updates where body like $1)::int u, (select count(*) from public.facts where quote like $1)::int f,
  (select count(*) from public.events where publication_id = $2)::int e`, [`${T}%`, P1]);
ok(left && left.u === 0 && left.f === 0 && left.e === 0, "nothing persisted on staging (no release, fact or take-down event from this run)", JSON.stringify(left));
await c.end();
console.log(`\n  mineiq-a08-retrieval (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
