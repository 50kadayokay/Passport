// 0093 (listing_reports: database-enforced client, network and global rate
// limits, one row per client statement, pruning), attacked on STAGING.
// Independent of S3's own check (written from the requirements and S3's stated
// design, not from it).
//   node scripts/listing-reports-0093-adversarial-check.mjs            phase A
//   node scripts/listing-reports-0093-adversarial-check.mjs --burst    + phase B (parallel, committed, cleaned up exactly)
//   STAGING_ANON_KEY=... node scripts/listing-reports-0093-adversarial-check.mjs --http
//                                                                       + phase C (real requests through the gateway)
//
// FOR S4 TO RUN (needs supabase/staging/.connection). Prints booleans, counts,
// SQLSTATEs and HTTP statuses only; never row contents, keys or the salt.
//
// S3'S DESIGN, AS STATED (redesign 28974b3, 2026-11-02), WHICH THIS ATTACKS
//   - limited: request role anon/authenticated (claims, else the session role);
//     not the service role, direct sessions, or is_admin()
//   - one row per INSERT statement, else PT400; 0 rows passes
//   - address = listing_report_client_ip(): cf-connecting-ip, else the LAST
//     x-forwarded-for hop, trimmed of all whitespace; x-real-ip and
//     true-client-ip never read; neither -> NULL -> client bucket 'unknown', no
//     network counter
//   - network = /24 (IPv4) or /48 (IPv6); not an inet -> no network counter
//   - counters in 0057's submission_throttle, in order: GLOBAL 600 / 60 min,
//     NETWORK 20 / 60 min, CLIENT 5 / 10 min; PT429 "right now" / "from this
//     network" / "from this device"; a refusal consumes nothing
//   - keys 'lr:' / 'ln:' + 32 hex of sha256(salt | value); no raw address stored
//   - each limited insert first prunes up to 50 of OUR forms' rows older than a
//     day (skip locked); /api/submit's forms never touched
//   - no client read of limits, salt or throttle, no EXECUTE on the 4 functions,
//     still no SELECT on listing_reports; 0077's policy and 0092's grants unchanged
//
// GATEWAY, AS MEASURED BY S4 (2026-11-02), pinned here: a client-sent
// cf-connecting-ip is refused (403); otherwise cf-connecting-ip is the real
// address; x-forwarded-for keeps client entries and appends the real address
// LAST; x-real-ip is stripped; true-client-ip passes through. Phase C re-checks.
//
// PHASE A: ONE transaction, always ROLLED BACK; 0093 is applied inside it when
// staging lacks it (holds listing_reports' lock for the run; lock_timeout 10 s).
// now() is fixed inside a transaction, so "the next window" is simulated by
// moving this design's counter rows back (newWindow), which also gives each
// section a clean slate. Requests are simulated as PostgREST runs them: set local
// role, request.jwt.claims and request.headers per statement, and its
// json_to_recordset insert shape.
//
// PHASE B (--burst; needs 0093 APPLIED on staging): separate pg clients, each
// SET ROLE anon with its own headers, in parallel, COMMITTED; with stale rows
// planted for the pruner. Cleanup is exact: this run's report rows (tagged) are
// deleted, this design's counters restored from a snapshot by primary key and
// compared, /api/submit's counters verified untouched, the limits row restored.
//
// PHASE C (--http; STAGING_ANON_KEY; 0093 applied): real reports through the
// staging gateway: a forged CF-Connecting-IP gets 403; forged x-forwarded-for
// (first hop), x-real-ip and true-client-ip do not change the bucket.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import { runnerBody } from "./_db-egress.mjs";

const DESIGN = {
  migration: "supabase/migrations/0093_listing_reports_rate_limit.sql",
  perClient: 5, clientWindowS: 600, perNetwork: 20, networkWindowS: 3600, global: 600, globalWindowS: 3600,
  tooMany: "PT429", tooMuch: "PT400",
  throttle: "public.submission_throttle",
  forms: { global: "listing_report_db_global", network: "listing_report_db_network", client: "listing_report_db_client" },
  globalKey: "lr:global", pruneBatch: 50,
  limitsTable: "public.listing_report_limits", saltTable: "public.submission_throttle_salt",
  functions: ["public.listing_report_client_ip()", "public.listing_report_network(text)", "public.listing_report_key(text, text)", "public.listing_reports_guard()"],
};
const OUR_FORMS = Object.values(DESIGN.forms);

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
if (!fs.existsSync(DESIGN.migration)) { console.error(`  ${DESIGN.migration} is not on this branch; nothing to attack.`); process.exit(3); }
const MIG = fs.readFileSync(DESIGN.migration, "utf8");
if (!/listing_report_client_ip/.test(MIG) || !/listing_report_db_network/.test(MIG)) { console.error("  this 0093 is not S3's redesign (28974b3); this check is pinned to the redesign."); process.exit(3); }
const BURST = process.argv.includes("--burst"), HTTP = process.argv.includes("--http");
const N = DESIGN.perClient, NET = DESIGN.perNetwork, G = DESIGN.global;

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const findings = [];
const finding = (m) => { findings.push(m); console.log(`  ! FINDING: ${m}`); };
const info = (m) => console.log(`  · ${m}`);

// PostgREST's SQLSTATE -> HTTP mapping (docs: "Errors"): the status a client sees.
function httpStatus(code, role) {
  if (!code) return 201;
  if (/^PT\d{3}$/.test(code)) return Number(code.slice(2));
  if (code === "42501") return role === "anon" ? 401 : 403;
  const exact = { "23503": 409, "23505": 409, "25006": 405, "42883": 404, "42P01": 404, "P0001": 400 };
  if (exact[code]) return exact[code];
  const byClass = { "08": 503, "09": 500, "0L": 403, "0P": 403, "25": 500, "28": 403, "2D": 500, "38": 500, "39": 500, "3B": 500, "40": 500, "53": 503, "54": 500, "55": 500, "57": 500, "58": 500, "F0": 500, "HV": 500, "P0": 500, "XX": 500 };
  return byClass[code.slice(0, 2)] || 400;
}

const TAG = `zz-0093adv-${Date.now().toString(36)}`;
const PRUNE = `zzp${Date.now().toString(36)}`;   // planted stale-counter keys: unique per run
const SIX = ["company_slug", "company_name", "kind", "message", "contact", "user_id"];
const COLS = SIX.join(", ");
const body = (o = {}) => ({ company_slug: TAG, company_name: "Zz 0093 adversarial", kind: o.kind ?? "error", message: "0093 adversarial check", contact: "", user_id: o.user ?? null });
// The statement PostgREST builds for POST /rest/v1/listing_reports (object or array body).
const PGRST = `insert into public.listing_reports (${COLS})
  select b.company_slug, b.company_name, b.kind, b.message, b.contact, b.user_id
  from (select $1::json as j) p,
       lateral (select case when json_typeof(p.j) = 'array' then p.j else json_build_array(p.j) end as v) u,
       lateral json_to_recordset(u.v) as b(company_slug text, company_name text, kind text, message text, contact text, user_id uuid)`;
const VALUES1 = `insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6)`;
const VALUES2 = `insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6), ($1, $2, $3, $4, $5, $6)`;
const vals = (o = {}) => { const b = body(o); return SIX.map((k) => b[k]); };

// Addresses from the benchmarking / documentation ranges only. freshIp() puts each
// new client in a different /24 first (512 of them in 198.18.0.0/15), so only the
// network tests below share a network on purpose.
let ipN = 0;
const freshIp = () => { const i = ipN++; const n = i % 512; return `198.${18 + (n >> 8)}.${n & 255}.${Math.floor(i / 512) + 1}`; };
const spoofIp = (i) => `203.0.113.${(i % 250) + 1}`;
// What the gateway hands PostgREST for a client at `real` (S4's measurement).
const gw = (real, extra = {}) => ({ "cf-connecting-ip": real, "x-forwarded-for": real, "user-agent": "MineEx/1.3.2 CFNetwork", ...extra });
const noCf = (h) => { const x = { ...h }; delete x["cf-connecting-ip"]; return x; };

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
let sp = 0;
// One request: role, claims and headers for this statement only, in a savepoint.
async function req(role, { headers = null, uid = null, claims, rawHeaders } = {}, sql, args) {
  await c.query("reset role");
  const cl = claims !== undefined ? claims : JSON.stringify(uid ? { sub: uid, role } : { role });
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [cl]);
  await c.query(`select set_config('request.headers', $1, true)`, [rawHeaders !== undefined ? rawHeaders : headers ? JSON.stringify(headers) : ""]);
  if (role !== "postgres") await c.query(`set local role ${role}`);
  const n = `a${++sp}`; await c.query(`savepoint ${n}`);
  try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, count: r.rowCount, status: 201 }; }
  catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, code: e.code, msg: e.message, hint: e.hint || "", detail: e.detail || "", status: httpStatus(e.code, role) }; }
  finally { await c.query("reset role"); await c.query(`select set_config('request.headers', '', true)`); await c.query(`select set_config('request.jwt.claims', '', true)`); }
}
const report = (role, h, o = {}, uid = null) => req(role, { headers: h, uid }, PGRST, [JSON.stringify(body(o))]);
const stored = async () => (await q(`select count(*)::int n from public.listing_reports where company_slug = $1`, [TAG]))[0].n;
const refusedBy = (r, what) => !r.ok && r.code === DESIGN.tooMany && r.msg.includes({ client: "from this device", network: "from this network", global: "right now" }[what]);
// Requests until refused (or `max`): how many were stored, and the refusal.
async function exhaust(role, h, max, o = {}, uid = null) {
  for (let i = 0; i < max; i++) {
    const r = await report(role, typeof h === "function" ? h(i) : h, typeof o === "function" ? o(i) : o, typeof uid === "function" ? uid(i) : uid);
    if (!r.ok) return { n: i, refusal: r };
  }
  return { n: max, refusal: null };
}
const OURS = `form = any($1::text[])`;
const keyOf = async (kind, v) => (await q(`select public.listing_report_key($1, $2) k`, [kind, v]))[0].k;
const netOf = async (ip) => (await q(`select public.listing_report_network($1) n`, [ip]))[0].n;
// A key's count in its form's CURRENT window (the bucket the guard writes), nothing older.
const WIN = { [DESIGN.forms.global]: DESIGN.globalWindowS, [DESIGN.forms.network]: DESIGN.networkWindowS, [DESIGN.forms.client]: DESIGN.clientWindowS };
const count = async (form, key) => (await q(`select coalesce(sum(count), 0)::int n from ${DESIGN.throttle} where form = $1 and ip_hash = $2 and window_start = to_timestamp(floor(extract(epoch from now()) / $3) * $3)`, [form, key, WIN[form]]))[0].n;
const globalCount = () => count(DESIGN.forms.global, DESIGN.globalKey);
const counterRows = async () => (await q(`select count(*)::int n from ${DESIGN.throttle} where ${OURS}`, [OUR_FORMS]))[0].n;
const otherForms = async () => JSON.stringify(await q(`select form, count(*)::int n, sum(count)::int s from ${DESIGN.throttle} where not (${OURS}) group by form order by form`, [OUR_FORMS]));
// A clean slate for a section (phase A only, inside its rolled-back transaction):
// this design's counters from the last day are removed, as if every window had
// rolled over. (Moving them back by a fixed delta instead collides with rows an
// earlier move already put there -- submission_throttle_pkey -- depending on row order.)
const newWindow = () => q(`delete from ${DESIGN.throttle} where ${OURS} and window_start > now() - interval '1 day'`, [OUR_FORMS]);
const grantsAndPolicy = async () => JSON.stringify({
  policy: await q(`select policyname, cmd, roles::text r, coalesce(qual, '') q, coalesce(with_check, '') w from pg_policies where schemaname = 'public' and tablename = 'listing_reports' order by 1`),
  table: await q(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'listing_reports' and grantee in ('anon', 'authenticated') order by 1, 2`),
  cols: await q(`select a.attname, a.attacl::text acl from pg_attribute a where a.attrelid = 'public.listing_reports'::regclass and a.attnum > 0 and not a.attisdropped and a.attacl is not null order by 1`),
});
const isApplied = async () => (await q(`select to_regprocedure('public.listing_reports_guard()') is not null and to_regprocedure('public.listing_report_client_ip()') is not null and exists (select 1 from pg_trigger where tgrelid = 'public.listing_reports'::regclass and tgname = 'listing_reports_guard') a`))[0].a;

const rowsBefore = (await q(`select count(*)::int n from public.listing_reports`))[0].n;
const wasApplied = await isApplied();
await c.query("begin");
try {
  await c.query("set local lock_timeout = '10s'");
  const GP0 = await grantsAndPolicy();
  if (!wasApplied) { await q(runnerBody(MIG)); console.log("  (0093 not on staging: applied inside the transaction)"); }
  else console.log("  (0093 already applied on staging)");
  ok(await isApplied(), "0093's statement trigger and functions are in place");
  if (!wasApplied) ok((await grantsAndPolicy()) === GP0, "0077's policy and 0092's column grants are unchanged by 0093");
  const [lim] = await q(`select per_client, client_window_minutes, per_network, network_window_minutes, global_per_window, global_window_minutes from ${DESIGN.limitsTable} where id`);
  ok(lim && lim.per_client === N && lim.client_window_minutes * 60 === DESIGN.clientWindowS && lim.per_network === NET && lim.network_window_minutes * 60 === DESIGN.networkWindowS && lim.global_per_window === G && lim.global_window_minutes * 60 === DESIGN.globalWindowS,
    `the limits row: client ${N}/${DESIGN.clientWindowS / 60} min, network ${NET}/${DESIGN.networkWindowS / 60} min, global ${G}/${DESIGN.globalWindowS / 60} min`, JSON.stringify(lim));
  await newWindow();

  console.log("\n  1. THE INSTALLED 1.3.x REPORT");
  let r = await report("anon", gw(freshIp()));
  ok(r.ok && (await stored()) === 1, "anon key, six columns, single-object body -> stored", r.msg);
  r = await report("anon", gw(freshIp()), { kind: "claim", user: crypto.randomUUID() });
  ok(r.ok, "a claim with a user_id (signed in on 1.3.x, still the anon key) -> stored", r.msg);
  const u0 = crypto.randomUUID();
  r = await report("authenticated", gw(freshIp()), { user: u0 }, u0);
  ok(r.ok, "an authenticated session, same body -> stored", r.msg);
  r = await req("anon", { headers: gw(freshIp()) }, `${PGRST} on conflict do nothing`, [JSON.stringify(body())]);
  ok(r.ok, "Prefer: resolution=ignore-duplicates (ON CONFLICT DO NOTHING) -> stored", r.msg);
  r = await report("anon", gw("2001:db8:aaaa::1"));
  ok(r.ok, "an IPv6 client -> stored", r.msg);

  console.log("\n  2. PER-CLIENT LIMIT, ITS BOUNDARY, AND WHAT A REFUSAL COSTS");
  await newWindow();
  const e1 = await exhaust("anon", gw(freshIp()), N + 5);
  ok(e1.n === N && refusedBy(e1.refusal, "client"), `one client: exactly ${N} stored, the ${N + 1}th refused "from this device"`, `${e1.n}; ${e1.refusal && e1.refusal.msg}`);
  const again = [];
  for (let k = 0; k < 3; k++) again.push((await exhaust("anon", gw(freshIp()), N + 3)).n);
  ok(again.every((x) => x === N), `three more fresh clients each get exactly ${N}`, again.join(", "));
  const k1 = freshIp();
  const g0 = await globalCount();
  await exhaust("anon", gw(k1), N);
  const net1 = await count(DESIGN.forms.network, await keyOf("network", await netOf(k1)));
  for (let i = 0; i < 10; i++) await report("anon", gw(k1));
  ok((await globalCount()) === g0 + N, `10 refused requests add nothing to the global count (+${N})`, `${g0} -> ${await globalCount()}`);
  ok((await count(DESIGN.forms.network, await keyOf("network", await netOf(k1)))) === net1, "...nor to the network count");
  ok((await count(DESIGN.forms.client, await keyOf("client", k1))) === N, `...and the client count stays ${N}`);

  console.log("\n  3. WHAT A 1.3.x CLIENT SEES WHEN REFUSED");
  const ref = e1.refusal || {};
  ok(ref.code === DESIGN.tooMany && ref.status === 429, `SQLSTATE ${ref.code} -> PostgREST HTTP ${ref.status} (expected PT429 -> 429)`);
  ok(!/198\.1[89]\.|203\.0\.113\.|2001:db8|lr:|ln:/i.test([ref.msg, ref.hint, ref.detail].join(" ")), "the error names the limit, never the client's address, network or key");
  info("1.3.x (prod-v1.3.2 ReportListingSheet): state = r.ok ? 'done' : 'error', so a 429 shows its generic error sheet; the body is not read");

  console.log("\n  4. HEADER SPOOFING AND ROTATION");
  // "hold"     = must not buy a fresh quota (FAIL otherwise)
  // "enforced" = unreachable: the gateway answers 403 (S4's measurement; phase C)
  const VARIANTS = [
    ["cf present; x-forwarded-for first hop rotated (real appended last)", (real, i) => gw(real, { "x-forwarded-for": `${spoofIp(i)}, ${real}` }), "hold"],
    ["cf present; many rotated x-forwarded-for hops", (real, i) => gw(real, { "x-forwarded-for": `${spoofIp(i)}, ${spoofIp(i + 1)}, ${spoofIp(i + 2)}, ${real}` }), "hold"],
    ["cf present; x-real-ip / true-client-ip / x-client-ip / forwarded rotated", (real, i) => gw(real, { "x-real-ip": spoofIp(i), "true-client-ip": spoofIp(i), "x-client-ip": spoofIp(i), forwarded: `for=${spoofIp(i)}` }), "hold"],
    ["cf present; user-agent rotated", (real, i) => gw(real, { "user-agent": `ua-${i}` }), "hold"],
    ["cf with spaces, tabs or newlines around the same address", (real, i) => gw(real, { "cf-connecting-ip": `${[" ", "\t", "\n"][i % 3].repeat(1 + (i % 2))}${real}${["\n", " ", "\t"][i % 3]}` }), "hold"],
    ["no cf; x-forwarded-for first hop rotated, real last", (real, i) => noCf(gw(real, { "x-forwarded-for": `${spoofIp(i)}, ${real}` })), "hold"],
    ["no cf; real last hop padded with whitespace", (real, i) => noCf(gw(real, { "x-forwarded-for": `${spoofIp(i)},${[" ", "\t", "\n"][i % 3]}${real}${[" ", "\t", ""][i % 3]}` })), "hold"],
    ["no cf, no x-forwarded-for; x-real-ip and true-client-ip rotated ('unknown')", (real, i) => ({ "x-real-ip": spoofIp(i), "true-client-ip": spoofIp(i + 7) }), "hold"],
    ["cf rotated", (real, i) => gw(real, { "cf-connecting-ip": spoofIp(i) }), "enforced"],
  ];
  const growth = [];
  for (const [label, h, kind] of VARIANTS) {
    await newWindow();
    const real = freshIp();
    const t0 = await counterRows();
    const got = (await exhaust("anon", (i) => h(real, i), N + 3)).n;
    growth.push((await counterRows()) - t0);
    if (got <= N) ok(true, `${label}: ${got} stored, no fresh quota`);
    else if (kind === "enforced") info(`${label}: ${got} stored in the simulation; unreachable in practice (a client-sent cf-connecting-ip gets 403 at the gateway)`);
    else ok(false, `${label}: rotation bought a fresh quota (${got} > ${N})`);
  }
  // Which bucket an address-shaped header lands in, by the counters it moves.
  await newWindow();
  const realX = freshIp();
  r = await report("anon", noCf(gw(realX, { "x-forwarded-for": `${spoofIp(1)}, ${realX}` })));
  ok(r.ok && (await count(DESIGN.forms.client, await keyOf("client", realX))) === 1 && (await count(DESIGN.forms.client, await keyOf("client", spoofIp(1)))) === 0, "no cf: the LAST x-forwarded-for hop is the client, the forged first hop is not");
  r = await report("anon", noCf(gw(realX, { "x-forwarded-for": `${realX},` })));
  ok(r.ok && (await count(DESIGN.forms.client, await keyOf("client", "unknown"))) >= 1, "no cf: x-forwarded-for with a trailing comma (empty last hop) lands in 'unknown'", r.code);
  info("a trailing-comma x-forwarded-for only reaches the database without cf-connecting-ip, i.e. never through the gateway");
  await newWindow();
  for (const [label, raw] of [["request.headers unset", ""], ["'{}'", "{}"], ["'null'", "null"], ["cf and x-forwarded-for empty", JSON.stringify({ "cf-connecting-ip": "", "x-forwarded-for": "" })], ["x-forwarded-for ',,,'", JSON.stringify({ "x-forwarded-for": ",,," })], ["an 8 KB x-forwarded-for", JSON.stringify({ "x-forwarded-for": "9".repeat(8192) })], ["cf not an address", JSON.stringify({ "cf-connecting-ip": "garbage" })]]) {
    r = await req("anon", { rawHeaders: raw }, PGRST, [JSON.stringify(body())]);
    ok(r.ok || (r.status >= 400 && r.status < 500), `headers ${label}: stored or a 4xx, never a 5xx`, r.ok ? "" : `${r.code} -> HTTP ${r.status}`);
  }
  await newWindow();
  const unk = (await exhaust("anon", (i) => [{}, { "x-forwarded-for": "" }, { "x-real-ip": spoofIp(i) }, { "true-client-ip": spoofIp(i) }][i % 4], N + 3)).n;
  ok(unk === N, `requests with no gateway address share ONE bucket of ${N} ('unknown'), whatever else they send`, `${unk}`);

  console.log("\n  5. POISONING");
  await newWindow();
  const victim = freshIp(), attacker = freshIp();
  await exhaust("anon", noCf(gw(attacker, { "x-forwarded-for": `${victim}, ${attacker}` })), N + 1);
  r = await report("anon", gw(victim));
  ok(r.ok, "naming a victim as the first x-forwarded-for hop does not touch the victim's quota");

  console.log("\n  6. NETWORK LIMIT (/24, /48)");
  await newWindow();
  const v4 = (i) => `198.19.200.${i + 1}`;
  const nv4 = await exhaust("anon", (i) => gw(v4(i)), NET + 5);
  ok(nv4.n === NET && refusedBy(nv4.refusal, "network"), `${NET + 5} different IPv4 clients in one /24: ${NET} stored, then "from this network"`, `${nv4.n}; ${nv4.refusal && nv4.refusal.msg}`);
  r = await report("anon", gw("198.19.201.1"));
  ok(r.ok, "the neighbouring /24 is unaffected");
  const v6 = (i) => `2001:db8:1:${(i + 1).toString(16)}::${(i + 1).toString(16)}`;
  const nv6 = await exhaust("anon", (i) => gw(v6(i)), NET + 5);
  ok(nv6.n === NET && refusedBy(nv6.refusal, "network"), `${NET + 5} different IPv6 clients in one /48: ${NET} stored, then "from this network"`, `${nv6.n}`);
  r = await report("anon", gw("2001:db8:2::1"));
  ok(r.ok, "the neighbouring /48 is unaffected");
  await newWindow();
  // S3 256ef55 unmaps ::ffff:a.b.c.d to IPv4 before taking the network (by value).
  const UNMAPS = /::ffff:0:0\/96/.test(MIG);
  const mapped = await exhaust("anon", (i) => gw(`::ffff:198.18.${(i * 7) % 256}.${(i % 200) + 1}`), NET + 5);
  if (UNMAPS) ok(mapped.n === NET + 5, `IPv4-mapped IPv6 from ${NET + 5} different IPv4 /24s are NOT lumped into one /48 (${mapped.n} stored)`);
  else if (mapped.n === NET) finding(`IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) from ${NET + 5} DIFFERENT IPv4 /24s share one network bucket (this 0093 predates S3's 256ef55)`);
  else ok(true, `IPv4-mapped addresses from different /24s are not lumped together (${mapped.n} stored)`);
  if (UNMAPS) {
    await newWindow();
    const mix = await exhaust("anon", (i) => gw(i % 2 ? `::ffff:198.19.220.${i + 1}` : `198.19.220.${i + 1}`), NET + 5);
    ok(mix.n === NET && refusedBy(mix.refusal, "network"), `plain and ::ffff:-mapped addresses in one IPv4 /24 share its network limit of ${NET}`, `${mix.n}`);
    ok((await netOf("::ffff:198.51.100.7")) === (await netOf("198.51.100.7")), "listing_report_network(::ffff:198.51.100.7) = listing_report_network(198.51.100.7)");
    info("the CLIENT key still distinguishes the mapped and plain text of one address (2 buckets); the gateway, not the client, chooses the form, so not exploitable");
  }
  r = await req("anon", { headers: gw("garbage") }, PGRST, [JSON.stringify(body())]);
  ok(r.ok && (await netOf("garbage")) === null, "an address that is not an inet: stored, no network counter (client and global only)", r.code);
  await newWindow();
  const shared = freshIp();
  const netPeer = shared.replace(/\.\d+$/, ".250");
  await exhaust("anon", gw(shared), N);
  r = await report("anon", gw(netPeer));
  ok(r.ok, "a client at its own limit does not block a neighbour in its /24 (below the network limit)");
  info(`by design ${NET} reports/hour per /24 is shared by everyone behind one carrier-grade NAT or office address block; listing reports are rare, so accepted for the pilot`);

  console.log("\n  7. IDENTITY AND ROLE");
  await newWindow();
  const rot = (await exhaust("anon", gw(freshIp()), N + 3, () => ({ user: crypto.randomUUID() }))).n;
  ok(rot === N, `anon rotating the user_id column gets no fresh quota (${rot})`);
  const ua = crypto.randomUUID();
  ok((await exhaust("authenticated", gw(freshIp()), N + 3, { user: ua }, ua)).n === N, `an authenticated session is limited the same way`);
  const realS = freshIp();
  ok((await exhaust("authenticated", gw(realS), N + 3, () => ({}), () => crypto.randomUUID())).n === N, "rotating sessions from one address gets no fresh quota");
  await newWindow();
  const directIp = freshIp();
  const direct = await (async () => { for (let i = 0; i < N + 3; i++) { const x = await req("anon", { claims: "", headers: gw(directIp) }, VALUES1, vals()); if (!x.ok) return { n: i, x }; } return { n: N + 3 }; })();
  ok(direct.n === N && direct.x && direct.x.code === DESIGN.tooMany, `role anon with NO claims (a direct anon session) is limited by the session role: ${direct.n} stored`, direct.x ? direct.x.code : "never refused");
  r = await req("anon", { claims: JSON.stringify({ role: "service_role" }), headers: gw(freshIp()) }, VALUES2, vals());
  info(`session role anon but claims role service_role (not producible through PostgREST, whose role IS the claim): ${r.ok ? "exempt" : `refused (${r.code})`}`);
  const [adm] = await q(`select id from public.profiles where role = 'admin' limit 1`);
  if (adm) {
    r = await req("authenticated", { uid: adm.id, headers: gw(freshIp()) }, VALUES2, vals());
    ok(r.ok, "a platform admin's session is exempt (a 2-row insert passes), as designed", r.code);
  } else info("no platform admin on staging: the is_admin() exemption was not exercised");
  r = await req("anon", { headers: gw(freshIp()) }, `set session_replication_role = replica`);
  ok(!r.ok && r.code === "42501", "anon cannot switch triggers off (session_replication_role)", r.code);
  info("COPY is not reachable through PostgREST; in a direct session COPY FROM fires the statement trigger too");

  console.log("\n  8. ONE ROW PER STATEMENT");
  for (const role of ["anon", "authenticated"]) {
    await newWindow();
    const uid = role === "authenticated" ? crypto.randomUUID() : null;
    const n0 = await stored(), gc0 = await globalCount();
    for (const [label, sql, args] of [
      ["a 2-row VALUES", VALUES2, vals()],
      ["a PostgREST array body of 2", PGRST, [JSON.stringify([body(), body()])]],
      ["a PostgREST array body of 200", PGRST, [JSON.stringify(Array.from({ length: 200 }, () => body()))]],
      ["a 200-row INSERT ... SELECT", `insert into public.listing_reports (${COLS}) select $1, 'Zz', 'error', 'bulk ' || g, '', null from generate_series(1, 200) g`, [TAG]],
      ["an array of 2 with ON CONFLICT DO NOTHING", `${PGRST} on conflict do nothing`, [JSON.stringify([body(), body()])]],
    ]) {
      r = await req(role, { headers: gw(freshIp()), uid }, sql, args);
      ok(!r.ok && r.code === DESIGN.tooMuch && r.status === 400 && (await stored()) === n0, `${role}: ${label} -> PT400 (HTTP 400), nothing stored`, r.ok ? `${r.count} rows stored` : r.code);
    }
    ok((await globalCount()) === gc0, `${role}: the refused bulk requests consumed no quota`);
    r = await req(role, { headers: gw(freshIp()), uid }, PGRST, [JSON.stringify([body()])]);
    ok(r.ok, `${role}: a PostgREST array of ONE -> stored`, r.code);
    r = await req(role, { headers: gw(freshIp()), uid }, `insert into public.listing_reports (${COLS}) select $1, 'Zz', 'error', 'x', '', null where false`, [TAG]);
    ok(r.ok, `${role}: a 0-row INSERT passes`, r.code);
  }
  r = await req("service_role", { headers: gw(freshIp()) }, VALUES2, vals());
  ok(r.ok, "service_role: a 2-row insert is not capped", r.code);

  console.log("\n  9. ON CONFLICT, RETURNING, READS");
  await newWindow();
  const realD = freshIp();
  let dn = 0;
  for (let i = 0; i < N + 3; i++) { const x = await req("anon", { headers: gw(realD) }, `${PGRST} on conflict do nothing`, [JSON.stringify(body())]); if (x.ok) dn++; else break; }
  ok(dn === N, `ON CONFLICT DO NOTHING counts against the quota (${dn})`);
  r = await req("anon", { headers: gw(freshIp()) }, `insert into public.listing_reports (id, ${COLS}) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6) on conflict (id) do update set message = excluded.message`, vals());
  ok(!r.ok && r.code === "42501", "ON CONFLICT (id) DO UPDATE -> refused (42501)", r.code);
  r = await req("anon", { headers: gw(freshIp()) }, `${VALUES1} returning *`, vals());
  ok(!r.ok && r.code === "42501", "RETURNING * -> refused (42501)", r.code);
  for (const role of ["anon", "authenticated"]) {
    r = await req(role, { uid: role === "authenticated" ? u0 : null }, `select * from public.listing_reports limit 1`);
    ok(!r.ok && r.code === "42501", `${role}: SELECT on listing_reports -> still refused`, r.code);
  }

  console.log("\n  10. GLOBAL CAP");
  await newWindow();
  const g = await exhaust("anon", () => gw(freshIp()), G + 5);
  ok(g.n === G && refusedBy(g.refusal, "global") && g.refusal.status === 429, `${G} reports from ${G} clients across many /24s, then "right now" (HTTP 429)`, `${g.n}; ${g.refusal && g.refusal.msg}`);
  ok(refusedBy(await report("anon", gw(freshIp())), "global"), "past it a brand-new client is refused too");
  ok(refusedBy(await report("authenticated", gw(freshIp()), { user: u0 }, u0), "global"), "...and an authenticated session");
  finding(`the global ceiling still blocks every installed app's "Report or claim" for up to an hour once filled: ${Math.ceil(G / NET)} /24s at ${NET} each fill ${G}/h. Bounded and accepted for the pilot, with S4's alert on the global PT429`);

  console.log("\n  11. SERVICE ROLE, POSTGRES (/api/submit)");
  const ns = await stored();
  let svc = 0;
  for (let i = 0; i < N + 5; i++) { const x = await req("service_role", { headers: gw("192.0.2.10") }, VALUES1, vals()); if (x.ok) svc++; }
  ok(svc === N + 5 && (await stored()) === ns + N + 5, `the service role is not limited, from one address and past the global cap (${svc}/${N + 5})`);
  ok((await req("service_role", {}, VALUES1, vals())).ok, "the service role with no request headers -> stored");
  ok((await req("postgres", {}, VALUES1, vals())).ok, "a direct postgres session -> stored");

  console.log("\n  12. WINDOWS");
  await newWindow();
  const kw = freshIp();
  await exhaust("anon", gw(kw), N);
  ok(refusedBy(await report("anon", gw(kw)), "client"), "exhausted in this window");
  await q(`update ${DESIGN.throttle} set window_start = window_start - make_interval(secs => $3) where form = $1 and ip_hash = $2 and window_start > now() - interval '1 day'`, [DESIGN.forms.client, await keyOf("client", kw), DESIGN.clientWindowS]);
  r = await report("anon", gw(kw));
  ok(r.ok, `once its window is the previous one (${DESIGN.clientWindowS / 60} min on), the client is allowed again (the network and global hours still count it)`, r.code);
  info(`fixed windows: ${2 * N} per client and ${2 * NET} per /24 can land across a boundary (accepted for the pilot)`);

  console.log("\n  13. PRUNING");
  await newWindow();
  const kp = freshIp();
  await exhaust("anon", gw(kp), N); // at its limit BEFORE any stale rows exist
  const OTHER = "zz_0093adv_other_form";
  await q(`insert into ${DESIGN.throttle} (ip_hash, form, window_start, count) select $2 || '-c' || g, $1, now() - interval '2 days' - make_interval(secs => g), 1 from generate_series(1, 120) g`, [DESIGN.forms.client, PRUNE]);
  await q(`insert into ${DESIGN.throttle} (ip_hash, form, window_start, count) select $2 || '-n' || g, $1, now() - interval '3 days', 1 from generate_series(1, 10) g`, [DESIGN.forms.network, PRUNE]);
  await q(`insert into ${DESIGN.throttle} (ip_hash, form, window_start, count) select $2 || '-o' || g, $1, now() - interval '5 days', 1 from generate_series(1, 30) g`, [OTHER, PRUNE]);
  await q(`insert into ${DESIGN.throttle} (ip_hash, form, window_start, count) select $2 || '-r' || g, $1, now() - interval '23 hours', 1 from generate_series(1, 5) g`, [DESIGN.forms.client, PRUNE]);
  const stale = async () => (await q(`select count(*)::int n from ${DESIGN.throttle} where ${OURS} and window_start < now() - interval '1 day'`, [OUR_FORMS]))[0].n;
  const otherN = async () => (await q(`select count(*)::int n from ${DESIGN.throttle} where form = $1`, [OTHER]))[0].n;
  const recentN = async () => (await q(`select count(*)::int n from ${DESIGN.throttle} where ip_hash like $1`, [`${PRUNE}-r%`]))[0].n;
  const s0 = await stale();
  await req("service_role", { headers: gw(freshIp()) }, VALUES1, vals());
  ok((await stale()) === s0, "a service-role insert prunes nothing (the guard returns before pruning)");
  await req("anon", { headers: gw(freshIp()) }, VALUES2, vals());
  ok((await stale()) === s0, "a refused 2-row insert prunes nothing (PT400 comes first)");
  r = await report("anon", gw(freshIp()));
  const s1 = await stale();
  ok(r.ok && s1 === s0 - Math.min(DESIGN.pruneBatch, s0), `one limited insert prunes exactly ${Math.min(DESIGN.pruneBatch, s0)} stale rows of our forms (${s0} -> ${s1})`);
  ok((await otherN()) === 30, "another form's day-old rows (/api/submit's kind) are untouched");
  ok((await recentN()) === 5, "our rows younger than a day are untouched");
  const s2 = await stale();
  r = await report("anon", gw(kp));
  ok(refusedBy(r, "client") && s2 > 0 && (await stale()) === s2, `a rate-limited (refused) insert's pruning rolls back with it (${s2} stale rows still there)`);
  for (let i = 0; i < 6 && (await stale()) > 0; i++) await report("anon", gw(freshIp()));
  ok((await stale()) === 0 && (await otherN()) === 30, "repeated inserts drain the backlog, 50 at a time, and still never touch the other form");
  info(`counter rows added by the rotation probes: ${growth.reduce((a, b) => a + b, 0)}; all pruned a day later`);

  console.log("\n  14. THROTTLE OBJECTS");
  for (const t of [DESIGN.throttle, DESIGN.limitsTable, DESIGN.saltTable]) {
    const held = (await q(`select p from unnest(array['anon','authenticated']) r, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p where has_table_privilege(r, $1, p)`, [t])).map((x) => x.p);
    ok(held.length === 0, `${t}: anon and authenticated hold no privilege`, held.join(","));
    const [{ rls }] = await q(`select relrowsecurity rls from pg_class where oid = $1::regclass`, [t]);
    ok(rls, `${t}: row-level security on`);
    for (const [role, sql] of [["anon", `select * from ${t} limit 1`], ["authenticated", `select * from ${t} limit 1`], ["anon", `update ${t} set ${t.endsWith("limits") ? "per_client = 1000" : t.endsWith("salt") ? "salt = 'x'" : "count = 0"}`], ["anon", `delete from ${t}`]]) {
      r = await req(role, { headers: gw(freshIp()), uid: role === "authenticated" ? u0 : null }, sql);
      ok(!r.ok && r.code === "42501", `${role}: ${sql.split(" ")[0]} on ${t} -> refused (42501)`, r.code);
    }
  }
  for (const f of [...DESIGN.functions, "public.bump_submission_throttle(text, text, timestamp with time zone)", "public.prune_submission_throttle()"]) {
    const [x] = await q(`select prosecdef sd, coalesce(array_to_string(proconfig, ','), '') cfg, has_function_privilege('anon', oid, 'EXECUTE') a, has_function_privilege('authenticated', oid, 'EXECUTE') b from pg_proc where oid = to_regprocedure($1)`, [f]);
    if (!x) { ok(!DESIGN.functions.includes(f), `${f}: present`); continue; }
    ok(!x.a && !x.b, `${f}: not executable by anon/authenticated`, `anon ${x.a} authenticated ${x.b}`);
    if (x.sd) ok(/search_path=/.test(x.cfg), `${f}: SECURITY DEFINER pins search_path`, x.cfg || "none");
  }
  for (const sql of [`select public.listing_report_client_ip()`, `select public.listing_report_key('client', '1.2.3.4')`, `select public.listing_report_network('1.2.3.4')`]) {
    r = await req("anon", { headers: gw(freshIp()) }, sql);
    ok(!r.ok && r.code === "42501", `anon: ${sql.slice(7, 40)}... -> refused (no key or address oracle)`, r.code);
  }
  ok(!(await q(`select 1 from ${DESIGN.throttle} where ${OURS} and ip_hash !~ '^(lr|ln):[0-9a-f]{32}$' and ip_hash <> $2 and ip_hash not like $3`, [OUR_FORMS, DESIGN.globalKey, `${PRUNE}-%`])).length, "every counter key is 'lr:'/'ln:' + 32 hex: no raw address or network is stored");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
ok((await q(`select count(*)::int n from public.listing_reports`))[0].n === rowsBefore, "phase A left nothing behind (rolled back)");

if (BURST) await phaseB();
if (HTTP) await phaseC();
await c.end();

if (findings.length) { console.log("\n  FINDINGS"); for (const f of findings) console.log(`  - ${f}`); }
console.log(`\n  listing-reports-0093 adversarial (staging): ${pass} passed, ${fail} failed, ${findings.length} finding(s)\n`);
process.exit(fail ? 1 : 0);

// ---- phases B and C: committed, cleaned up exactly -----------------------------
async function snapshot() {
  return new Map((await q(`select ip_hash, form, window_start::text ws, count from ${DESIGN.throttle} where ${OURS}`, [OUR_FORMS])).map((r) => [`${r.ip_hash}|${r.form}|${r.ws}`, r]));
}
async function restore(snap, label) {
  const now = await snapshot();
  for (const [k, r] of now) {
    if (!snap.has(k)) await q(`delete from ${DESIGN.throttle} where ip_hash = $1 and form = $2 and window_start = $3::timestamptz`, [r.ip_hash, r.form, r.ws]);
    else if (snap.get(k).count !== r.count) await q(`update ${DESIGN.throttle} set count = $4 where ip_hash = $1 and form = $2 and window_start = $3::timestamptz`, [r.ip_hash, r.form, r.ws, snap.get(k).count]);
  }
  for (const [k, r] of snap) if (!now.has(k)) await q(`insert into ${DESIGN.throttle} (ip_hash, form, window_start, count) values ($1, $2, $3::timestamptz, $4)`, [r.ip_hash, r.form, r.ws, r.count]);
  const after = await snapshot();
  ok(after.size === snap.size && [...snap].every(([k, r]) => after.has(k) && after.get(k).count === r.count), `${label}: this design's counters restored exactly (${snap.size} rows)`);
}
async function anonClient(headers) {
  const k = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await k.connect();
  await k.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: "anon" })]);
  await k.query(`select set_config('request.headers', $1, false)`, [JSON.stringify(headers)]);
  await k.query("set role anon");
  return k;
}
const parallel = async (headersList) => {
  const ks = await Promise.all(headersList.map((h) => anonClient(h)));
  const res = await Promise.all(ks.map((k) => k.query(PGRST, [JSON.stringify(body())]).then(() => true, (e) => e.code)));
  await Promise.all(ks.map((k) => k.end()));
  return { got: res.filter((x) => x === true).length, codes: [...new Set(res.filter((x) => x !== true))] };
};
async function phaseB() {
  console.log("\n  PHASE B: PARALLEL, COMMITTED");
  if (!(await isApplied())) { info("skipped: 0093 is not applied on staging (S4 applies it first)"); return; }
  const snap = await snapshot();
  const others0 = await otherForms();
  const before = (await q(`select count(*)::int n from public.listing_reports`))[0].n;
  const [lim0] = await q(`select per_network, global_per_window from ${DESIGN.limitsTable} where id`);
  const gStart = await globalCount();
  try {
    if (gStart + 60 > G) { info(`skipped: the live global count is ${gStart}; too close to ${G} to probe without blocking real reports`); return; }
    // Stale rows for the pruner to fight over.
    await q(`insert into ${DESIGN.throttle} (ip_hash, form, window_start, count) select $2 || '-b' || g, $1, now() - interval '2 days' - make_interval(secs => g), 1 from generate_series(1, 400) g`, [DESIGN.forms.client, PRUNE]);
    const one = freshIp();
    const a = await parallel(Array.from({ length: N + 15 }, () => gw(one)));
    ok(a.got === N, `${N + 15} parallel reports from one client: exactly ${N} stored (no overshoot)`, `${a.got}; ${a.codes.join(",")}`);
    ok(a.codes.every((x) => x === DESIGN.tooMany), "every parallel refusal is PT429: no deadlock (40P01), serialization (40001) or lock timeout (55P03), pruning included", a.codes.join(","));
    ok((await globalCount()) === gStart + N, `the global counter moved by exactly ${N}`, `${gStart} -> ${await globalCount()}`);
    const left = (await q(`select count(*)::int n from ${DESIGN.throttle} where ip_hash like $1`, [`${PRUNE}-b%`]))[0].n;
    ok(left < 400 && left >= 400 - N * DESIGN.pruneBatch, `the parallel inserts pruned stale rows without conflict (${400 - left} of 400, skip locked; only the ${N} stored inserts keep their pruning)`);
    const net = (i) => `198.19.210.${i + 1}`;
    const b = await parallel(Array.from({ length: NET + 15 }, (_, i) => gw(net(i))));
    ok(b.got === NET && b.codes.every((x) => x === DESIGN.tooMany), `${NET + 15} parallel clients in one /24: exactly ${NET} stored`, `${b.got}; ${b.codes.join(",")}`);
    await q(`update ${DESIGN.limitsTable} set global_per_window = $1 where id`, [(await globalCount()) + 10]);
    const cg = await parallel(Array.from({ length: 30 }, () => gw(freshIp())));
    ok(cg.got === 10, "30 parallel clients (separate /24s) against 10 remaining global slots: exactly 10 stored", `${cg.got}; ${cg.codes.join(",")}`);
  } finally {
    await q(`update ${DESIGN.limitsTable} set per_network = $1, global_per_window = $2 where id`, [lim0.per_network, lim0.global_per_window]);
    await q(`delete from public.listing_reports where company_slug = $1`, [TAG]);
    await restore(snap, "phase B");
    ok((await otherForms()) === others0, "phase B: /api/submit's counters untouched");
    ok((await q(`select count(*)::int n from public.listing_reports`))[0].n === before, "phase B: every report row it committed was deleted");
    const [lim1] = await q(`select per_network, global_per_window from ${DESIGN.limitsTable} where id`);
    ok(JSON.stringify(lim1) === JSON.stringify(lim0), "phase B: the limits row is back as it was");
  }
}
async function phaseC() {
  console.log("\n  PHASE C: THROUGH THE STAGING GATEWAY");
  const key = process.env.STAGING_ANON_KEY;
  if (!key) { info("skipped: STAGING_ANON_KEY not set"); return; }
  if (!(await isApplied())) { info("skipped: 0093 is not applied on staging"); return; }
  const snap = await snapshot();
  const before = (await q(`select count(*)::int n from public.listing_reports`))[0].n;
  const SPOOF = { "x-forwarded-for (first hop)": "203.0.113.78", "x-real-ip": "203.0.113.79", "true-client-ip": "203.0.113.80" };
  try {
    const send = (headers) => fetch("https://jmljfovtfxcdhjmtlnva.supabase.co/rest/v1/listing_reports", {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal", ...headers },
      body: JSON.stringify(body()),
    }).then((r) => r.status, () => 0);
    const added = async (since, form) => [...(await snapshot()).values()].filter((r) => r.form === form && !since.has(`${r.ip_hash}|${r.form}|${r.ws}`)).map((r) => r.ip_hash);
    const forged = await send({ "CF-Connecting-IP": "203.0.113.77" });
    ok(forged === 403, "a client-sent CF-Connecting-IP is refused by the gateway (403) -- the pinned assumption", `HTTP ${forged}`);
    ok((await added(snap, DESIGN.forms.client)).length === 0 && (await stored()) === 0, "...and that refused request reached nothing (no counter, no row)");
    info(`plain request: HTTP ${await send({})}`);
    const s1 = await snapshot();
    info(`request with a forged first x-forwarded-for hop, x-real-ip and true-client-ip: HTTP ${await send({ "X-Forwarded-For": SPOOF["x-forwarded-for (first hop)"], "X-Real-IP": SPOOF["x-real-ip"], "True-Client-IP": SPOOF["true-client-ip"] })}`);
    const clients = await added(snap, DESIGN.forms.client);
    ok(clients.length === 1, `both gateway requests counted against ONE client (${clients.length} client counter)`);
    ok(!clients.includes(await keyOf("client", "unknown")), "the gateway delivers a usable client address (not the shared 'unknown' bucket)");
    ok((await added(s1, DESIGN.forms.client)).length === 0, "the forged headers did not move the request to another bucket");
    for (const [h, v] of Object.entries(SPOOF)) ok(!clients.includes(await keyOf("client", v)), `the forged ${h} did not become the key`);
    const nets = await added(snap, DESIGN.forms.network);
    ok(nets.length === 1, `the gateway address produced exactly one network counter (${nets.length})`);
    const mapped = await keyOf("network", await netOf("::ffff:198.18.0.1"));
    ok(!nets.includes(mapped), "the gateway address is not IPv4-mapped IPv6 (whose /48 would lump all of IPv4 together)");
    info("staging's gateway is assumed to match production's (both Supabase-hosted); confirm once on production with one report after 0093");
  } finally {
    await q(`delete from public.listing_reports where company_slug = $1`, [TAG]);
    await restore(snap, "phase C");
    ok((await q(`select count(*)::int n from public.listing_reports`))[0].n === before, "phase C: its report rows were deleted");
  }
}
