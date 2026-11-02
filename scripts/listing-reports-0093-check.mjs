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
//   - who is a client: cf-connecting-ip; else the LAST x-forwarded-for hop; a
//     forged FIRST hop never changes the bucket; true-client-ip and x-real-ip are
//     never read; whitespace is trimmed; no address -> one 'unknown' bucket
//   - per-network limit: /24 and /48 grouping; a network at its limit refuses a
//     NEW address in it, another network is unaffected; 'unknown' has none
//   - global ceiling: once reached, a NEW network is refused too
//   - bulk: a 2-row insert is refused whole (PT400); a 0-row insert passes
//   - authenticated (signed in on the anon key) is limited the same way; the
//     service role, a direct session and a platform admin are not
//   - pruning: expired counters go, in batches; current ones and /api/submit's stay
//   - no raw IP is stored; anon/authenticated cannot read the limits, the salt or
//     the throttle, cannot call the functions, and still cannot read reports
//   - the rollback restores exactly the pre-0093 objects, and the limit is gone
// PART 2 -- CONCURRENCY, only when 0093 is COMMITTED on staging (uncommitted DDL
// is invisible to other connections and locks the table): parallel connections
// insert for one fresh client at the same moment; exactly the limit's worth is
// stored. Its rows and counters are deleted afterwards.
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
const FORMS = "('listing_report_db_global', 'listing_report_db_network', 'listing_report_db_client')";
const COLS = "company_slug, company_name, kind, message, contact, user_id";
const APP = `insert into public.listing_reports (${COLS}) values ($1, 'Zz 0093', 'error', '0093 check', '', $2)`;
const ip = (n, net = 100) => `198.51.${net}.${n}`;   // TEST-NET-2 (198.51.100.0/24) and neighbours: never real clients
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
const cf = (n, net) => ({ headers: { "cf-connecting-ip": ip(n, net) } });
// What the guard would key on, for a given set of headers (as postgres, which may call the helpers).
const ipFor = async (headers) => { await c.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(headers)]); const r = (await q(`select public.listing_report_client_ip() a`))[0].a; await c.query(`select set_config('request.headers', '', true)`); return r; };
const keyFor = async (headers) => (await q(`select public.listing_report_key('client', coalesce($1, 'unknown')) k`, [await ipFor(headers)]))[0].k;
const netOf = async (addr) => (await q(`select public.listing_report_network($1) n`, [addr]))[0].n;
const state = async () => JSON.stringify({
  triggers: await q(`select tgname from pg_trigger where tgrelid = 'public.listing_reports'::regclass and not tgisinternal order by 1`),
  fns: await q(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('listing_reports_guard', 'listing_report_client_ip', 'listing_report_network', 'listing_report_key', 'listing_report_client_key') order by 1`),
  tables: await q(`select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('listing_report_limits', 'submission_throttle_salt') order by 1`),
  counters: (await q(`select count(*)::int n from public.submission_throttle where form in ${FORMS}`))[0].n,
  grants: await q(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'listing_reports' and grantee in ('anon','authenticated') order by 1, 2`),
  policies: await q(`select policyname, md5(coalesce(with_check,'')) w from pg_policies where tablename = 'listing_reports' order by 1`),
});
const committed = async () => (await q(`select 1 from pg_trigger where tgrelid = 'public.listing_reports'::regclass and tgname = 'listing_reports_guard'`)).length > 0;
const isCommitted = await committed();
const reportsBefore = (await q(`select count(*)::int n from public.listing_reports`))[0].n;
const throttleOthersBefore = (await q(`select count(*)::int n from public.submission_throttle where form not in ${FORMS}`))[0].n;

// =============================================================== PART 1 ==
console.log(`\n  PART 1 (rolled back) · run ${RUN}${isCommitted ? " · 0093 is committed on staging (unwound inside the transaction first)" : ""}`);
await c.query("begin");
try {
  if (isCommitted) await q(runnerBody(RB));
  const S0 = await state();
  await q(runnerBody(MIG));
  const L = (await q(`select * from public.listing_report_limits`))[0];
  ok((await committed()) && L.per_client === 5 && L.client_window_minutes === 10 && L.per_network === 20 && L.network_window_minutes === 60 && L.global_per_window === 600 && L.global_window_minutes === 60,
    "0093 applies: guard trigger present; defaults 5 per 10 min per client, 20 per hour per network, 600 per hour globally", JSON.stringify(L));
  await q(`update public.listing_report_limits set per_client = 3, per_network = 1000, global_per_window = 100000`);   // small client limit keeps the test short

  console.log("\n  THE INSTALLED 1.3.x INSERT");
  let r = await report(cf(1));
  ok(r.ok && r.count === 1 && (await stored()) === 1, "anon, one object, six columns, a gateway address -> stored");

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
  r = await report(cf(3));
  ok(r.ok, "client C is unaffected by B being at its limit (per-client separation)");

  console.log("\n  WHO IS A CLIENT (gateway-set headers only)");
  ok((await ipFor({ "cf-connecting-ip": ip(7), "x-forwarded-for": ip(6) })) === ip(7), "cf-connecting-ip is the client when present");
  ok((await ipFor({ "x-forwarded-for": `203.0.113.66, ${ip(9)}` })) === ip(9), "no cf-connecting-ip: the LAST x-forwarded-for hop (the one the gateway appends)");
  ok((await keyFor({ "x-forwarded-for": `203.0.113.1, ${ip(9)}` })) === (await keyFor({ "x-forwarded-for": `203.0.113.2, 10.9.9.9, ${ip(9)}` })), "a forged FIRST hop (or extra hops) never changes the bucket");
  ok((await keyFor({ "x-forwarded-for": `${ip(9)}` })) === (await keyFor({ "cf-connecting-ip": ip(9) })), "...and the last hop and cf-connecting-ip name the same client the same way");
  ok((await keyFor({ "cf-connecting-ip": ip(10), "true-client-ip": "203.0.113.5" })) === (await keyFor({ "cf-connecting-ip": ip(10), "true-client-ip": "203.0.113.6" }))
    && (await ipFor({ "true-client-ip": "203.0.113.5", "x-real-ip": "203.0.113.7" })) === null, "true-client-ip and x-real-ip are never read");
  ok((await keyFor({ "cf-connecting-ip": `\t ${ip(5)}\n` })) === (await keyFor({ "cf-connecting-ip": ip(5) })), "a header padded with tabs or newlines is the same client (all whitespace trimmed)");
  ok((await ipFor({})) === null && (await keyFor({})) === (await keyFor({ "user-agent": "x" })) && /^lr:[0-9a-f]{32}$/.test(await keyFor({})), "no address header (a direct, non-gateway session) -> one shared 'unknown' bucket, hashed like any other");
  for (let i = 0; i < 3; i++) await report({ headers: {} });
  r = await report({ headers: {} });
  ok(!r.ok && r.code === "PT429" && /from this device/.test(r.msg || ""), "the 'unknown' bucket is limited at the per-client limit");
  const inv = crypto.randomUUID();
  for (let i = 0; i < 3; i++) await report({ ...cf(4), role: "authenticated", uid: inv });
  r = await report({ ...cf(4), role: "authenticated", uid: inv });
  ok(!r.ok && r.code === "PT429", "authenticated (signed in on the anon key, as 1.3.x does) is limited the same way");

  console.log("\n  PER-NETWORK LIMIT (per_network = 4 for the test)");
  ok((await netOf(ip(1))) === "198.51.100.0/24" && (await netOf(ip(250))) === "198.51.100.0/24" && (await netOf(ip(1, 101))) === "198.51.101.0/24", "IPv4 is grouped by /24");
  ok((await netOf("2001:db8:aa:1::5")) === "2001:db8:aa::/48" && (await netOf("2001:db8:aa:ffff::9")) === "2001:db8:aa::/48" && (await netOf("2001:db8:ab::1")) === "2001:db8:ab::/48", "IPv6 is grouped by /48");
  ok((await netOf("not-an-address")) === null && (await netOf(null)) === null, "a non-address has no network (only the client and global limits apply)");
  await q(`update public.listing_report_limits set per_client = 1000, per_network = 4`);
  for (let i = 0; i < 4; i++) { r = await report(cf(60 + i, 102)); ok(r.ok, `network 198.51.102.0/24, address ${i + 1} -> stored`, r.msg); }
  r = await report(cf(99, 102));
  ok(!r.ok && r.code === "PT429" && /too many reports from this network/.test(r.msg || ""), "a NEW address in that /24 -> refused PT429 (rotating within one range is capped)", `${r.code} ${r.msg}`);
  r = await report(cf(60, 103));
  ok(r.ok, "an address in another /24 is unaffected");
  for (let i = 0; i < 5; i++) await report({ headers: {} });
  ok((await q(`select count(*)::int n from public.submission_throttle where form = 'listing_report_db_network' and ip_hash = public.listing_report_key('network', 'unknown')`))[0].n === 0, "'unknown' has no network counter (no network to cap)");
  await q(`update public.listing_report_limits set per_client = 3, per_network = 1000`);

  console.log("\n  NOT LIMITED");
  const counters = async () => (await q(`select coalesce(sum(count), 0)::int n from public.submission_throttle where form in ${FORMS}`))[0].n;
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
  const r1 = await report(cf(30, 110)), r2 = await report(cf(31, 111)), r3 = await report(cf(32, 112));
  ok(r1.ok && r2.ok && !r3.ok && r3.code === "PT429" && /too many reports right now/.test(r3.msg || ""), "with the ceiling 2 above the current count: two NEW networks pass, a third is refused (PT429) -- the global quota bounds everything", `${r1.ok}/${r2.ok}/${r3.code}`);
  await q(`update public.listing_report_limits set global_per_window = 100000`);

  console.log("\n  PRUNING");
  const old = `now() - interval '2 days'`;
  await q(`insert into public.submission_throttle (ip_hash, form, window_start, count)
           select 'lr:zz-old-' || g, 'listing_report_db_client', ${old} - (g || ' minutes')::interval, 1 from generate_series(1, 70) g`);
  await q(`insert into public.submission_throttle (ip_hash, form, window_start, count) values ('zz-0093-apisubmit-old', 'listing_report', ${old}, 1)`);
  const expired = async () => (await q(`select count(*)::int n from public.submission_throttle where form in ${FORMS} and window_start < now() - interval '1 day'`))[0].n;
  const e0 = await expired();
  r = await report(cf(70, 120));
  const e1 = await expired();
  ok(r.ok && e0 - e1 === Math.min(50, e0), `one limited insert prunes a batch of up to 50 expired counters (${e0} -> ${e1})`);
  await report(cf(71, 120));
  ok((await expired()) === Math.max(0, e1 - 50), "the next insert prunes the next batch");
  ok((await q(`select 1 from public.submission_throttle where ip_hash = 'zz-0093-apisubmit-old'`)).length === 1, "/api/submit's own expired counters are left for its own housekeeping (not ours to touch)");
  ok((await q(`select count(*)::int n from public.submission_throttle where form = 'listing_report_db_global' and window_start >= now() - interval '1 day'`))[0].n >= 1 && (await cntB()) >= 1, "current counters are kept");

  console.log("\n  NOTHING NEW TO READ");
  ok(!(await q(`select ip_hash from public.submission_throttle where form in ${FORMS} and ip_hash !~ '^(lr|ln):([0-9a-f]{32}|global|zz-old-[0-9]+)$'`)).length
    && !(await q(`select 1 from public.submission_throttle where ip_hash ~ '198\\.51\\.|203\\.0\\.113\\.|2001:db8'`)).length, "no raw address or network is stored: every key is 'lr:'/'ln:' + 32 hex chars of a salted hash");
  for (const role of ["anon", "authenticated"]) {
    const res = [];
    for (const s of [
      `select * from public.submission_throttle limit 1`, `select * from public.listing_report_limits`, `select * from public.submission_throttle_salt`,
      `select public.listing_report_client_ip()`, `select public.listing_report_key('client', 'x')`, `select public.listing_report_network('198.51.100.1')`, `select * from public.listing_reports limit 1`,
    ]) res.push(await attempt({ ...cf(40), role, uid: role === "authenticated" ? inv : null }, s));   // one connection: one at a time
    ok(res.every((x) => !x.ok && x.code === "42501"), `${role}: cannot read the throttle, the limits or the salt, cannot call any helper, and still cannot read reports (all 42501)`, res.map((x) => x.code).join(","));
  }
  ok((await q(`select has_function_privilege('anon', 'public.listing_reports_guard()', 'execute') a, has_function_privilege('authenticated', 'public.listing_reports_guard()', 'execute') b`)).every((x) => !x.a && !x.b), "the guard function is not executable by clients");

  console.log("\n  ROLLBACK");
  await q(runnerBody(RB));
  ok((await state()) === S0, "the rollback restores exactly the pre-0093 objects, grants, policy and counters");
  ok((await q(`select 1 from public.submission_throttle where ip_hash = 'zz-0093-apisubmit-old'`)).length === 1, "...and leaves /api/submit's counters alone");
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
ok((await q(`select count(*)::int n from public.listing_reports`))[0].n === reportsBefore && (await committed()) === isCommitted
  && (await q(`select count(*)::int n from public.submission_throttle where form not in ${FORMS}`))[0].n === throttleOthersBefore, "part 1 rolled back: reports, /api/submit's counters and staging's 0093 state unchanged");

// =============================================================== PART 2 ==
console.log("\n  PART 2 · CONCURRENCY");
if (!isCommitted) {
  console.log("  - SKIPPED: 0093 is not committed on staging. Run this again after it is applied (parallel connections cannot see uncommitted DDL).");
} else {
  const L = (await q(`select per_client from public.listing_report_limits`))[0].per_client;
  const slug = `${TAG}-par`, addr = `198.51.100.${200 + Math.floor(Math.random() * 50)}`;
  const N = L + 3;
  const clients = await Promise.all(Array.from({ length: N }, connect));
  try {
    // Each connection: its own transaction, as PostgREST runs one request.
    const res = await Promise.all(clients.map(async (cl) => {
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
    // Clean up: the committed rows, this client's and network's counters, and their share of the global counter.
    await c.query("begin");
    const n = (await q(`delete from public.listing_reports where company_slug = $1 returning 1`, [slug])).length;
    await q(`delete from public.submission_throttle where ip_hash = public.listing_report_key('client', $1) and form = 'listing_report_db_client'`, [addr]);
    if (n) {
      await q(`update public.submission_throttle set count = greatest(count - $1, 0) where form = 'listing_report_db_network' and ip_hash = public.listing_report_key('network', public.listing_report_network($2))`, [n, addr]);
      await q(`update public.submission_throttle set count = greatest(count - $1, 0) where form = 'listing_report_db_global' and window_start = (select max(window_start) from public.submission_throttle where form = 'listing_report_db_global')`, [n]);
    }
    await c.query("commit");
    await Promise.all(clients.map((cl) => cl.end().catch(() => {})));
    ok((await stored(slug)) === 0, "cleaned up: the parallel rows and their counters are removed");
  }
}
await c.end();
console.log(`\n  listing-reports-0093-check (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
