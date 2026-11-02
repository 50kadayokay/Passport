// 0093 (listing_reports: database rate limit + one row per request), verified on
// STAGING.   node scripts/listing-reports-0093-check.mjs
//
// FOR S4 TO RUN (needs supabase/staging/.connection; the isolation env is
// optional, for the platform-admin case). Prints no secrets, no row contents and
// no hashes.
//
// PART 1 -- ONE TRANSACTION, ALWAYS ROLLED BACK. 0093 is applied inside it (any
// committed copy is unwound first), with small limits set in its own table, then:
//   - the installed 1.3.x insert (anon, six columns, one object) is stored
//   - boundary: the Nth report from a client is stored, the N+1th refused (PT429)
//     and not stored; a refusal does not consume the window
//   - window reset: moving that client's counter into the previous window (the
//     same as time passing) admits them again
//   - per-client separation; cf-connecting-ip over x-forwarded-for; the first
//     XFF hop is the key; no header -> one shared 'unknown' bucket
//   - global ceiling: once reached, a NEW client is refused too
//   - bulk: a 2-row insert is refused whole (PT400); a 0-row insert passes
//   - authenticated (signed in on the anon key) is limited the same way; the
//     service role, a direct session and a platform admin are not
//   - no raw IP is stored; anon/authenticated cannot read the limits, the salt or
//     the throttle, cannot call the functions, and still cannot read reports
//   - the rollback restores exactly the pre-0093 objects, and the limit is gone
// PART 2 -- CONCURRENCY, only when 0093 is COMMITTED on staging (uncommitted DDL
// is invisible to other connections and locks the table): 8 parallel
// connections insert for one fresh client at the same moment; exactly the
// limit's worth is stored. Its rows and counters are deleted afterwards.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import { runnerBody } from "./_db-egress.mjs";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0093_listing_reports_rate_limit.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0093_listing_reports_rate_limit.rollback.sql", "utf8");
const iso = (() => { try { return Object.fromEntries(fs.readFileSync("supabase/staging/.isolation-env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])); } catch { return {}; } })();

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const connect = async () => { const x = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } }); await x.connect(); return x; };
const c = await connect();
const q = async (s, a) => (await c.query(s, a)).rows;

const RUN = crypto.randomUUID().slice(0, 8);
const TAG = `zz-0093-${RUN}`;
const COLS = "company_slug, company_name, kind, message, contact, user_id";
const APP = `insert into public.listing_reports (${COLS}) values ($1, 'Zz 0093', 'error', '0093 check', '', $2)`;
const ip = (n) => `198.51.100.${n}`;                    // TEST-NET-2: never a real client
const asClient = async (cl, { headers = {}, role = "anon", uid = null } = {}) => {
  await cl.query("reset role");
  await cl.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role } : { role })]);
  await cl.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(headers)]);
  await cl.query(`set local role ${role}`);
};
const asPostgres = async (cl = c) => { await cl.query("reset role"); await cl.query(`select set_config('request.jwt.claims', '', true)`); await cl.query(`select set_config('request.headers', '', true)`); };
let sp = 0;
const attempt = async (who, sql, args) => {
  await asClient(c, who);
  const n = `p${++sp}`; await c.query(`savepoint ${n}`);
  try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, count: r.rowCount }; }
  catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, code: e.code, msg: e.message }; }
  finally { await asPostgres(); }
};
const stored = async (slug = TAG) => (await q(`select count(*)::int n from public.listing_reports where company_slug = $1`, [slug]))[0].n;
const report = (who, slug = TAG) => attempt(who, APP, [slug, who.uid || null]);
const cf = (n) => ({ headers: { "cf-connecting-ip": ip(n) } });
const keyFor = async (headers) => { await c.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(headers)]); const k = (await q(`select public.listing_report_client_key() k`))[0].k; await c.query(`select set_config('request.headers', '', true)`); return k; };
const state = async () => JSON.stringify({
  triggers: await q(`select tgname from pg_trigger where tgrelid = 'public.listing_reports'::regclass and not tgisinternal order by 1`),
  fns: await q(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('listing_reports_guard', 'listing_report_client_key') order by 1`),
  tables: await q(`select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('listing_report_limits', 'submission_throttle_salt') order by 1`),
  counters: (await q(`select count(*)::int n from public.submission_throttle where form in ('listing_report_db_global', 'listing_report_db_client')`))[0].n,
  grants: await q(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'listing_reports' and grantee in ('anon','authenticated') order by 1, 2`),
  policies: await q(`select policyname, md5(coalesce(with_check,'')) w from pg_policies where tablename = 'listing_reports' order by 1`),
});
const committed = async () => (await q(`select 1 from pg_trigger where tgrelid = 'public.listing_reports'::regclass and tgname = 'listing_reports_guard'`)).length > 0;
const isCommitted = await committed();
const reportsBefore = (await q(`select count(*)::int n from public.listing_reports`))[0].n;

// =============================================================== PART 1 ==
console.log(`\n  PART 1 (rolled back) · run ${RUN}${isCommitted ? " · 0093 is committed on staging (unwound inside the transaction first)" : ""}`);
await c.query("begin");
try {
  if (isCommitted) await q(runnerBody(RB));
  const S0 = await state();
  await q(runnerBody(MIG));
  ok((await committed()) && (await q(`select per_client, client_window_minutes, global_per_window, global_window_minutes from public.listing_report_limits`))[0].per_client === 5, "0093 applies: guard trigger present, limits default to 5 per 10 min per client, 300 per hour global");
  const L = (await q(`select * from public.listing_report_limits`))[0];
  ok(L.client_window_minutes === 10 && L.global_per_window === 300 && L.global_window_minutes === 60, "defaults: 10-minute client window, 300 per 60 minutes globally");
  await q(`update public.listing_report_limits set per_client = 3, global_per_window = 1000`);   // small numbers keep the test short

  console.log("\n  THE INSTALLED 1.3.x INSERT");
  let r = await report(cf(1));
  ok(r.ok && r.count === 1 && (await stored()) === 1, "anon, one object, six columns, a client address -> stored");

  console.log("\n  BOUNDARY AND WINDOW (per_client = 3 for the test)");
  const before = await stored();
  for (let i = 1; i <= 3; i++) { r = await report(cf(2)); ok(r.ok, `client B, report ${i} of 3 -> stored`, r.msg); }
  r = await report(cf(2));
  ok(!r.ok && r.code === "PT429" && (await stored()) === before + 3, "client B, report 4 -> refused PT429, not stored", `${r.code} ${r.msg}`);
  ok(/too many reports from this device/.test(r.msg || "") && !(r.msg || "").includes(ip(2)) && !(r.msg || "").includes(TAG), "the refusal names the limit, not the address or the row");
  const kB = await keyFor(cf(2).headers);
  const cntB = async () => (await q(`select coalesce(sum(count), 0)::int n from public.submission_throttle where ip_hash = $1 and form = 'listing_report_db_client'`, [kB]))[0].n;
  r = await report(cf(2));
  ok(!r.ok && (await cntB()) === 3, "a refused report does not consume the window (counter stays at 3)");
  await q(`update public.submission_throttle set window_start = window_start - interval '10 minutes' where ip_hash = $1 and form = 'listing_report_db_client'`, [kB]);
  r = await report(cf(2));
  ok(r.ok, "window reset: with the counter moved into the previous window (time passing), client B is admitted again", r.msg);

  console.log("\n  WHO IS A CLIENT");
  r = await report(cf(3));
  ok(r.ok, "client C is unaffected by B being at its limit (per-client separation)");
  const kX1 = await keyFor({ "x-forwarded-for": `${ip(9)}, 10.0.0.1` }), kX2 = await keyFor({ "x-forwarded-for": `${ip(9)}, 10.0.0.2` });
  ok(kX1 === kX2 && kX1 !== (await keyFor({ "x-forwarded-for": `${ip(8)}, 10.0.0.1` })), "x-forwarded-for: the FIRST hop is the client (later proxy hops ignored)");
  ok((await keyFor({ "cf-connecting-ip": ip(7), "x-forwarded-for": ip(6) })) === (await keyFor({ "cf-connecting-ip": ip(7) })), "cf-connecting-ip wins over x-forwarded-for (Cloudflare sets it; a client cannot forge it through Cloudflare)");
  ok((await keyFor({})) === (await keyFor({ "user-agent": "x" })) && /^lr:[0-9a-f]{32}$/.test(await keyFor({})), "no address header -> one shared 'unknown' bucket, hashed like any other");
  ok((await keyFor({ "cf-connecting-ip": `\t ${ip(5)}\n` })) === (await keyFor({ "cf-connecting-ip": ip(5) })), "a header padded with tabs or newlines is the same client (all whitespace trimmed)");
  for (let i = 0; i < 3; i++) await report({ headers: {} });
  r = await report({ headers: {} });
  ok(!r.ok && r.code === "PT429", "the 'unknown' bucket is limited like a client");
  const inv = crypto.randomUUID();
  for (let i = 0; i < 3; i++) await report({ ...cf(4), role: "authenticated", uid: inv });
  r = await report({ ...cf(4), role: "authenticated", uid: inv });
  ok(!r.ok && r.code === "PT429", "authenticated (signed in on the anon key, as 1.3.x does) is limited the same way");

  console.log("\n  NOT LIMITED");
  const counters = async () => (await q(`select coalesce(sum(count), 0)::int n from public.submission_throttle where form in ('listing_report_db_global', 'listing_report_db_client')`))[0].n;
  let c0 = await counters();
  let all = true;
  for (let i = 0; i < 8; i++) { const x = await attempt({ ...cf(2), role: "service_role" }, `insert into public.listing_reports (company_slug, company_name, kind, message, contact) values ($1, 'Zz', 'error', 'via /api/submit', '')`, [TAG]); all = all && x.ok; }
  ok(all && (await counters()) === c0, "service role (/api/submit): 8 inserts from a limited client's address, all stored, no counter touched");
  c0 = await counters(); all = true;
  for (let i = 0; i < 8; i++) { const x = await c.query(APP, [TAG, null]).then(() => true, () => false); all = all && x; }
  ok(all && (await counters()) === c0, "a direct database session: not limited");
  const padmin = iso.ISOLATION_ADMIN_EMAIL ? (await q(`select id from auth.users where email = $1`, [iso.ISOLATION_ADMIN_EMAIL]))[0]?.id : null;
  if (padmin && (await q(`select role from public.profiles where id = $1`, [padmin]))[0]?.role === "admin") {
    all = true;
    for (let i = 0; i < 6; i++) { const x = await report({ ...cf(2), role: "authenticated", uid: padmin }); all = all && x.ok; }
    ok(all, "a MineEx platform admin (is_admin()): not limited");
  } else console.log("  - platform-admin case skipped (no ISOLATION_ADMIN in supabase/staging/.isolation-env)");

  console.log("\n  ONE REPORT PER REQUEST");
  const nb = await stored();
  r = await attempt(cf(20), `insert into public.listing_reports (${COLS}) select $1, 'Zz', 'error', 'bulk ' || g, '', null from generate_series(1, 2) g`, [TAG]);
  ok(!r.ok && r.code === "PT400" && (await stored()) === nb, "a 2-row insert (a JSON array) -> refused whole, PT400, nothing stored", `${r.code} ${r.msg}`);
  r = await attempt(cf(21), `insert into public.listing_reports (${COLS}) select $1, 'Zz', 'error', 'bulk ' || g, '', null from generate_series(1, 200) g`, [TAG]);
  ok(!r.ok && r.code === "PT400" && (await stored()) === nb, "a 200-row insert -> refused whole");
  r = await attempt(cf(22), `insert into public.listing_reports (${COLS}) select $1, 'Zz', 'error', 'none', '', null where false`, [TAG]);
  ok(r.ok && r.count === 0, "a 0-row insert passes (nothing to limit)");
  r = await report(cf(20));
  ok(r.ok, "and the client whose bulk insert was refused still has its full allowance (the refusal consumed nothing)");

  console.log("\n  GLOBAL CEILING");
  const g = (await q(`select coalesce(sum(count), 0)::int n from public.submission_throttle where form = 'listing_report_db_global' and window_start = (select max(window_start) from public.submission_throttle where form = 'listing_report_db_global')`))[0].n;
  await q(`update public.listing_report_limits set global_per_window = $1`, [g + 2]);
  const r1 = await report(cf(30)), r2 = await report(cf(31)), r3 = await report(cf(32));
  ok(r1.ok && r2.ok && !r3.ok && r3.code === "PT429" && /too many reports right now/.test(r3.msg || ""), "with the ceiling 2 above the current count: two NEW clients pass, a third NEW client is refused (PT429) -- a rotating-address flood is bounded", `${r1.ok}/${r2.ok}/${r3.code}`);
  await q(`update public.listing_report_limits set global_per_window = 1000`);

  console.log("\n  NOTHING NEW TO READ");
  ok(!(await q(`select ip_hash from public.submission_throttle where form in ('listing_report_db_global', 'listing_report_db_client') and ip_hash !~ '^lr:([0-9a-f]{32}|global)$'`)).length
    && !(await q(`select 1 from public.submission_throttle where ip_hash like '%198.51.100.%'`)).length, "no raw address is stored: every key is 'lr:' + 32 hex chars of a salted hash");
  for (const role of ["anon", "authenticated"]) {
    const res = [];
    for (const s of [
      `select * from public.submission_throttle limit 1`, `select * from public.listing_report_limits`, `select * from public.submission_throttle_salt`,
      `select public.listing_report_client_key()`, `select * from public.listing_reports limit 1`,
    ]) res.push(await attempt({ ...cf(40), role, uid: role === "authenticated" ? inv : null }, s));   // one connection: one at a time
    ok(res.every((x) => !x.ok && x.code === "42501"), `${role}: cannot read the throttle, the limits or the salt, cannot call the key function, and still cannot read reports (all 42501)`, res.map((x) => x.code).join(","));
  }
  ok((await q(`select has_function_privilege('anon', 'public.listing_reports_guard()', 'execute') a, has_function_privilege('authenticated', 'public.listing_reports_guard()', 'execute') b`)).every((x) => !x.a && !x.b), "the guard function is not executable by clients");

  console.log("\n  ROLLBACK");
  await q(runnerBody(RB));
  ok((await state()) === S0, "the rollback restores exactly the pre-0093 objects, grants, policy and counters");
  all = true;
  for (let i = 0; i < 6; i++) { const x = await report(cf(2)); all = all && x.ok; }
  const bulk = await attempt(cf(2), `insert into public.listing_reports (${COLS}) select $1, 'Zz', 'error', 'b', '', null from generate_series(1, 2) g`, [TAG]);
  ok(all && bulk.ok, "after the rollback: no limit and no bulk cap (0092 behaviour)");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
await asPostgres().catch(() => {});
ok((await q(`select count(*)::int n from public.listing_reports`))[0].n === reportsBefore && (await committed()) === isCommitted, "part 1 rolled back: report count and staging's 0093 state unchanged");

// =============================================================== PART 2 ==
console.log("\n  PART 2 · CONCURRENCY");
if (!isCommitted) {
  console.log("  - SKIPPED: 0093 is not committed on staging. Run this again after it is applied (parallel connections cannot see uncommitted DDL).");
} else {
  const L = (await q(`select per_client from public.listing_report_limits`))[0].per_client;
  const slug = `${TAG}-par`, addr = `198.51.100.${200 + Math.floor(Math.random() * 50)}`;
  const N = L + 3;
  const clients = await Promise.all(Array.from({ length: N }, connect));
  let res;
  try {
    // Each connection: its own transaction, as PostgREST runs one request.
    res = await Promise.all(clients.map(async (cl) => {
      try {
        await cl.query("begin");
        await asClient(cl, { headers: { "cf-connecting-ip": addr } });
        await cl.query(APP, [slug, null]);
        await cl.query("commit");
        return { ok: true };
      } catch (e) { await cl.query("rollback").catch(() => {}); return { ok: false, code: e.code }; }
    }));
    const okN = res.filter((x) => x.ok).length, refused = res.filter((x) => !x.ok && x.code === "PT429").length;
    ok(okN === L && refused === N - L && (await stored(slug)) === L, `${N} parallel inserts for one fresh client: exactly ${L} stored, ${N - L} refused PT429 (no overshoot)`, `${okN} ok, ${refused} refused, ${await stored(slug)} stored`);
  } finally {
    // Clean up: the committed rows, this client's counter, and its share of the global counter.
    await c.query("begin");
    const n = (await q(`delete from public.listing_reports where company_slug = $1 returning 1`, [slug])).length;
    const k = await keyFor({ "cf-connecting-ip": addr });
    await q(`delete from public.submission_throttle where ip_hash = $1 and form = 'listing_report_db_client'`, [k]);
    if (n) await q(`update public.submission_throttle set count = greatest(count - $1, 0) where form = 'listing_report_db_global' and window_start = (select max(window_start) from public.submission_throttle where form = 'listing_report_db_global')`, [n]);
    await c.query("commit");
    await Promise.all(clients.map((cl) => cl.end().catch(() => {})));
    ok((await stored(slug)) === 0, "cleaned up: the parallel rows and their counters are removed");
  }
}
await c.end();
console.log(`\n  listing-reports-0093-check (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
