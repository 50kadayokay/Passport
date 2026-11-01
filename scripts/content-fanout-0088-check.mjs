// 0088 (a15 content fan-out), verified on STAGING in ONE transaction that is
// always ROLLED BACK.   node scripts/content-fanout-0088-check.mjs
//
// FOR S4 TO RUN (needs supabase/staging/.connection and .isolation-env).
// Applies 0088 inside the transaction (company A marked published, one of its
// publications used as the record; all rolled back), then:
//   - deliver_destination_content: insert, idempotent replay, correction at the
//     same version, removal at a higher version, an OLDER publish refused, a
//     re-publish at a newer version restores; service role only
//   - destination_content: members of A read, another company / investor / anon
//     do not; no client writes
//   - conference_booth_releases(slug): anon, live rows only, published company only
//   - subscriptions: 6 rows, active_from now; claim_deliveries creates no
//     deliveries for events older than the subscription (no historical replay)
//   - the rollback removes everything it added
import fs from "node:fs";
import pg from "pg";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0088_content_fanout.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0088_content_fanout.rollback.sql", "utf8");
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
  for (const k of ["COMPANY_A", "STAFF", "COMPANY_B", "INVESTOR"]) U[k] = await uid(k);
  const A = iso.ISOLATION_COMPANY_A_ID;
  const slugA = (await q(`select slug from public.companies where id = $1`, [A]))[0].slug;
  const asUser = async (id) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: "authenticated" })]); await c.query("set local role authenticated"); };
  const asRole = async (role) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role })]); await c.query(`set local role ${role}`); };
  const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); };
  let sp = 0;
  const attempt = async (who, sql, args) => {
    if (who === "anon" || who === "service_role") await asRole(who); else await asUser(U[who]);
    const n = `p${++sp}`; await c.query(`savepoint ${n}`);
    try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, rows: r.rows }; }
    catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, code: e.code, msg: e.message }; }
    finally { await asPostgres(); }
  };

  ok((await q(`select to_regclass('public.destination_content') t`))[0].t === null, "0088 not present before the check");
  const evBefore = (await q(`select count(*)::int n from public.events`))[0].n;
  await c.query(strip(MIG));
  ok(true, "0088 applies inside the transaction");
  await q(`update public.companies set status = 'published' where id = $1`, [A]);
  const pub = (await q(`select id from public.publications where company_id = $1 limit 1`, [A]))[0];
  if (!pub) throw new Error("company A has no publication to use as the record");

  const DEL = `select public.deliver_destination_content($1, $2, $3, $4, $5, $6::jsonb) r`;
  const row = (title) => JSON.stringify({ title, summary: "s", category: "Drilling", published_at: "2026-10-31T10:00:00Z" });
  const deliver = async (ver, removed, title = "v") => (await attempt("service_role", DEL, ["conference", pub.id, A, ver, removed, row(title)]));
  const cur = async () => (await q(`select title, version, removed_at from public.destination_content where destination = 'conference' and publication_id = $1`, [pub.id]))[0];

  let r = await deliver(1, false, "First");
  ok(r.ok && r.rows[0].r.applied === true && (await cur()).title === "First", "service role delivers version 1");
  r = await deliver(1, false, "First");
  ok(r.ok && (await q(`select count(*)::int n from public.destination_content where publication_id = $1`, [pub.id]))[0].n === 1, "replay -> still one row");
  r = await deliver(1, false, "Corrected");
  ok((await cur()).title === "Corrected", "a correction at the same version applies");
  r = await deliver(2, true);
  ok(r.rows[0].r.applied === true && (await cur()).removed_at && (await cur()).version === 2, "removal at version 2");
  r = await deliver(1, false, "Stale");
  ok(r.rows[0].r.applied === false && (await cur()).removed_at && (await cur()).title === "Corrected", "an OLDER publish is refused: the withdrawn release stays withdrawn");
  r = await deliver(3, false, "Again");
  ok(r.rows[0].r.applied === true && !(await cur()).removed_at && (await cur()).title === "Again", "re-publish at version 3 restores it");
  await attempt("service_role", DEL, ["website", pub.id, A, 3, false, row("Site copy")]);

  for (const who of ["anon", "COMPANY_A", "INVESTOR"]) {
    const x = await attempt(who, DEL, ["conference", pub.id, A, 99, true, "{}"]);
    ok(!x.ok && x.code === "42501", `${who} cannot call deliver_destination_content`);
  }
  for (const who of ["COMPANY_A", "INVESTOR"]) {
    const x = await attempt(who, `insert into public.destination_content (company_id, destination, publication_id, title) values ($1, 'website', $2, 'forged')`, [A, pub.id]);
    ok(!x.ok, `${who} cannot write destination_content directly`);
  }
  const SEL = `select destination from public.destination_content where company_id = $1`;
  for (const [who, n] of [["COMPANY_A", 2], ["STAFF", 2], ["COMPANY_B", 0], ["INVESTOR", 0]]) {
    const x = await attempt(who, SEL, [A]);
    ok(x.ok && x.rows.length === n, `${who} reads ${n} delivered copies of company A`, JSON.stringify(x));
  }
  ok(!(await attempt("anon", SEL, [A])).ok, "anon cannot read the table");

  const BR = `select * from public.conference_booth_releases($1, 5)`;
  let b = await attempt("anon", BR, [slugA]);
  ok(b.ok && b.rows.length === 1 && b.rows[0].title === "Again" && !("company_id" in b.rows[0]), "anon booth read: the live conference copy, no company id");
  await deliver(4, true);
  b = await attempt("anon", BR, [slugA]);
  ok(b.ok && b.rows.length === 0, "removed -> not served to the booth");
  await deliver(5, false, "Live");
  await q(`update public.companies set status = 'draft' where id = $1`, [A]);
  b = await attempt("anon", BR, [slugA]);
  ok(b.ok && b.rows.length === 0, "an unpublished company serves nothing to the booth");
  await q(`update public.companies set status = 'published' where id = $1`, [A]);

  const subs = await q(`select listener, event_type, active_from from public.listener_subscriptions where listener in ('site_content_v1','conference_content_v1')`);
  ok(subs.length === 6 && subs.every((s) => s.active_from), "6 subscriptions, each with active_from");
  const claimed = await attempt("service_role", `select count(*)::int n from public.claim_deliveries('site_content_v1', 'check-0088', 100, 5)`);
  const created = (await q(`select count(*)::int n from public.event_deliveries where listener = 'site_content_v1'`))[0].n;
  ok(claimed.ok && claimed.rows[0].n === 0 && created === 0, `no historical replay: ${evBefore} existing events, 0 deliveries created for the new listener`);

  await c.query(strip(RB));
  const after = await q(`select to_regclass('public.destination_content') t,
    (select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and proname in ('deliver_destination_content','conference_booth_releases')) f,
    (select count(*)::int from public.listener_subscriptions where listener in ('site_content_v1','conference_content_v1')) s`);
  ok(after[0].t === null && after[0].f === 0 && after[0].s === 0, "rollback removes the table, both functions and the subscriptions");
} catch (e) {
  fail++; console.error(`  ✗ unexpected: ${e.message}`);
} finally {
  await c.query("rollback");
  await c.end();
}
console.log(`\n  ${pass} passed, ${fail} failed (transaction ROLLED BACK)\n`);
process.exit(fail ? 1 : 0);
