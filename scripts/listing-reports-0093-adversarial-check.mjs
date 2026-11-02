// 0093 (listing_reports: database-enforced per-client and global rate limit, and
// one row per anonymous statement), attacked on STAGING. Independent of S3's own
// check: written from the requirements, then pinned to S3's design (DESIGN below).
//   node scripts/listing-reports-0093-adversarial-check.mjs            phase A only
//   node scripts/listing-reports-0093-adversarial-check.mjs --burst    + phase B (parallel, committed, cleaned up exactly)
//   STAGING_ANON_KEY=... node scripts/listing-reports-0093-adversarial-check.mjs --http
//                                                                       + phase C (real requests through the gateway)
//
// FOR S4 TO RUN (needs supabase/staging/.connection). Prints booleans, counts,
// SQLSTATEs and HTTP statuses only; never row contents or keys.
//
// PHASE A: ONE transaction, always ROLLED BACK. 0093 is applied inside it if
// staging does not have it yet. Every request is simulated the way PostgREST runs
// it: `set local role anon|authenticated`, request.jwt.claims and request.headers
// set per statement (as the gateway would deliver them), the insert shaped like
// PostgREST's json_to_recordset body.
//   1  the installed 1.3.x report (anon key, six columns, return=minimal) is stored
//   2  per-client limit N, found by behaviour: exactly N stored, the N+1-th refused,
//      the same N for several fresh clients (off-by-one), and DESIGN's N if declared
//   3  the error a 1.3.x client gets: SQLSTATE -> PostgREST HTTP status; must be 4xx
//      (a 5xx trips the launch's "5xx rise" stop condition), ideally 429; the app
//      only checks r.ok, so it shows its generic error sheet; nothing echoes the IP
//   4  header spoofing and rotation (x-forwarded-for prepend / many hops / empty /
//      garbage / replaced, x-real-ip, cf-connecting-ip, true-client-ip,
//      x-client-ip, Forwarded, an 8 KB value, headers absent): rotating what the
//      client controls must not buy a fresh quota
//   5  poisoning: another client cannot exhaust a victim's quota by spoofing it
//   6  anon rotating the user_id column (1.3.x sends any uuid) gets no fresh quota;
//      authenticated (a real session) is limited too
//   7  one row per statement: a 2-row VALUES, a PostgREST array body, a 200-row
//      INSERT ... SELECT and a two-insert CTE are refused and store nothing; a
//      single-object body (the 1.3.x shape) still works
//   8  upsert / on_conflict: DO NOTHING still counts against the quota; DO UPDATE
//      and RETURNING are refused
//   9  global cap G, found by behaviour with a fresh client per insert; past it a
//      new client is refused too
//  10  window edge: throttle timestamps moved back by W-2 s (still refused, or a
//      fixed-window FINDING) and W+2 s (allowed again)
//  11  throttle objects: no privilege for anon/authenticated on any table or
//      sequence 0093 creates, RLS on, no non-trigger function executable by them,
//      SECURITY DEFINER functions pin search_path; direct reads/writes refused;
//      growth under header rotation (FINDING when every spoofed value adds a row
//      and nothing prunes)
//  12  the service role (/api/submit) and postgres are not limited, before and
//      after the global cap is reached
//
// PHASE B (--burst, needs 0093 APPLIED on staging): separate pg clients, each
// `set role anon` with its own request.headers, fire in parallel and COMMIT:
//   - N+10 parallel reports from one client: at most N stored (no check-then-insert race)
//   - parallel distinct clients past G (when G is small enough): at most G stored
// Cleanup is exact: every report row carries this run's tag and is deleted; every
// throttle table is snapshotted by primary key first, new rows are deleted and
// changed rows restored. The run refuses phase B if a throttle table has no
// primary key, and verifies the tables equal the snapshot afterwards.
//
// PHASE C (--http, needs STAGING_ANON_KEY, 0093 applied): two real reports through
// the staging gateway with spoofed X-Forwarded-For / X-Real-IP / CF-Connecting-IP,
// then (as postgres) which spoofed values reached the throttle key -- the one
// thing a simulation cannot know: which headers the platform overwrites. Cleaned
// up exactly as in phase B.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import { runnerBody } from "./_db-egress.mjs";

// ---- S3's design (fill from S3's message; every field optional) -------------
// Unknown values are discovered by behaviour; a declared value is also asserted.
const DESIGN = {
  migration: "supabase/migrations/0093_listing_reports_rate_limit.sql",
  perClient: num(process.env.RL_PER_CLIENT),      // reports per client per window
  global: num(process.env.RL_GLOBAL),             // reports per window, all clients
  windowSeconds: num(process.env.RL_WINDOW_SECONDS),
  clientHeader: process.env.RL_CLIENT_HEADER || null, // e.g. "x-forwarded-for (right-most hop)"
  expectSqlstate: process.env.RL_SQLSTATE || null,     // e.g. "PT429"
};
function num(v) { return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null; }
const MAXN = 1000, MAXG = num(process.env.RL_MAX_GLOBAL_PROBE) || 3000;

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
if (!fs.existsSync(DESIGN.migration)) { console.error(`  ${DESIGN.migration} does not exist yet; nothing to attack.`); process.exit(3); }
const MIG = fs.readFileSync(DESIGN.migration, "utf8");
const BURST = process.argv.includes("--burst"), HTTP = process.argv.includes("--http");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const findings = [];
const finding = (m) => { findings.push(m); console.log(`  ! FINDING: ${m}`); };
const info = (m) => console.log(`  · ${m}`);

// PostgREST's SQLSTATE -> HTTP mapping (docs: "Errors"), for the status a client sees.
function httpStatus(code, role) {
  if (!code) return 201;
  if (/^PT\d{3}$/.test(code)) return Number(code.slice(2));
  if (code === "42501") return role === "anon" ? 401 : 403;
  const exact = { "23503": 409, "23505": 409, "25006": 405, "42883": 404, "42P01": 404, "P0001": 400 };
  if (exact[code]) return exact[code];
  const cls = code.slice(0, 2);
  const byClass = { "08": 503, "09": 500, "0L": 403, "0P": 403, "25": 500, "28": 403, "2D": 500, "38": 500, "39": 500, "3B": 500, "40": 500, "53": 503, "54": 500, "55": 500, "57": 500, "58": 500, "F0": 500, "HV": 500, "P0": 500, "XX": 500 };
  return byClass[cls] || 400;
}

const TAG = `zz-0093adv-${Date.now().toString(36)}`;
const SIX = ["company_slug", "company_name", "kind", "message", "contact", "user_id"];
const COLS = SIX.join(", ");
const body = (o = {}) => ({ company_slug: o.slug ?? TAG, company_name: "Zz 0093 adversarial", kind: o.kind ?? "error", message: o.message ?? "0093 adversarial check", contact: "", user_id: o.user ?? null });
// The statement PostgREST builds for POST /rest/v1/listing_reports (object or array body).
const PGRST = `insert into public.listing_reports (${COLS})
  select b.company_slug, b.company_name, b.kind, b.message, b.contact, b.user_id
  from (select $1::json as j) p,
       lateral (select case when json_typeof(p.j) = 'array' then p.j else json_build_array(p.j) end as v) u,
       lateral json_to_recordset(u.v) as b(company_slug text, company_name text, kind text, message text, contact text, user_id uuid)`;
const VALUES1 = `insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6)`;
const vals = (o = {}) => { const b = body(o); return SIX.map((k) => b[k]); };

// Client addresses: TEST-NET / benchmarking ranges only, never a real host.
let ipN = 0;
const freshIp = () => { const i = ++ipN; return `198.18.${(i >> 8) & 255}.${i & 255}`; };
const spoofIp = (i) => `203.0.113.${i % 250 + 1}`;
// What the gateway would hand PostgREST for a client at `real`: the proxy appends
// the peer to X-Forwarded-For and sets its own headers.
const gw = (real, extra = {}) => ({ "x-forwarded-for": real, "x-real-ip": real, "cf-connecting-ip": real, "user-agent": "MineEx/1.3.2 CFNetwork", ...extra });

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
let sp = 0;
// One request: role, claims and headers set for this statement only, in a savepoint.
async function req(role, { headers = null, uid = null, rawHeaders } = {}, sql, args) {
  await c.query("reset role");
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role } : { role })]);
  await c.query(`select set_config('request.headers', $1, true)`, [rawHeaders !== undefined ? rawHeaders : headers ? JSON.stringify(headers) : ""]);
  if (role !== "postgres") await c.query(`set local role ${role}`);
  const n = `a${++sp}`; await c.query(`savepoint ${n}`);
  try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, count: r.rowCount, status: 201 }; }
  catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, code: e.code, msg: e.message, hint: e.hint || "", detail: e.detail || "", status: httpStatus(e.code, role) }; }
  finally { await c.query("reset role"); await c.query(`select set_config('request.headers', '', true)`); await c.query(`select set_config('request.jwt.claims', '', true)`); }
}
const report = (role, h, o = {}, uid = null) => req(role, { headers: h, uid }, PGRST, [JSON.stringify(body(o))]);
const stored = async () => (await q(`select count(*)::int n from public.listing_reports where company_slug like $1`, [`${TAG}%`]))[0].n;
// Reports from one client until refused (or `max`): how many were stored, and the refusal.
async function exhaust(role, h, max = MAXN, o = {}, uid = null) {
  for (let i = 0; i < max; i++) {
    const r = await report(role, typeof h === "function" ? h(i) : h, typeof o === "function" ? o(i) : o, typeof uid === "function" ? uid(i) : uid);
    if (!r.ok) return { n: i, refusal: r };
  }
  return { n: max, refusal: null };
}

// ---- 0093's objects ----------------------------------------------------------
const catalog = async () => ({
  tables: (await q(`select c.oid::regclass::text t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and c.relkind in ('r','p') order by 1`)).map((r) => r.t),
  seqs: (await q(`select c.oid::regclass::text t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and c.relkind = 'S' order by 1`)).map((r) => r.t),
  funcs: (await q(`select p.oid::regprocedure::text f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname not in ('pg_catalog','information_schema') order by 1`)).map((r) => r.f),
  triggers: (await q(`select tgname from pg_trigger where tgrelid = 'public.listing_reports'::regclass and not tgisinternal order by 1`)).map((r) => r.tgname),
});
const declared = (re) => [...MIG.replace(/--[^\n]*/g, "").matchAll(re)].map((m) => m[1].toLowerCase());
const migTables = declared(/create\s+table\s+(?:if\s+not\s+exists\s+)?((?:\w+\.)?\w+)/gi);
const migFuncs = declared(/create\s+(?:or\s+replace\s+)?function\s+((?:\w+\.)?\w+)\s*\(/gi);
const bare = (x) => x.replace(/^public\./, "");
// Applied = every table 0093 creates exists and so does every function it creates.
async function applied() {
  if (!migTables.length && !migFuncs.length) return false;
  const tabs = await Promise.all(migTables.map(async (t) => (await q(`select to_regclass($1) r`, [`public.${bare(t)}`]))[0].r));
  const fnames = new Set((await catalog()).funcs.map((f) => bare(f.replace(/\(.*$/, ""))));
  return tabs.every(Boolean) && migFuncs.every((f) => fnames.has(bare(f)));
}

const rowsBefore = (await q(`select count(*)::int n from public.listing_reports`))[0].n;
const wasApplied = await applied();
const cat0 = await catalog();
let OBJ = null, N = null, G = null, W = DESIGN.windowSeconds;
await c.query("begin");
try {
  await c.query("set local lock_timeout = '10s'");
  if (!wasApplied) { await q(runnerBody(MIG)); console.log("  (0093 not on staging: applied inside the transaction)"); }
  else console.log("  (0093 already applied on staging)");
  const cat1 = await catalog();
  OBJ = wasApplied
    ? { tables: cat1.tables.filter((t) => migTables.some((m) => bare(t) === bare(m))), seqs: cat1.seqs.filter((x) => migTables.some((m) => bare(x).startsWith(`${bare(m)}_`))), funcs: cat1.funcs.filter((f) => migFuncs.some((m) => bare(f.replace(/\(.*$/, "")) === bare(m))), triggers: cat1.triggers }
    : { tables: cat1.tables.filter((t) => !cat0.tables.includes(t)), seqs: cat1.seqs.filter((s) => !cat0.seqs.includes(s)), funcs: cat1.funcs.filter((f) => !cat0.funcs.includes(f)), triggers: cat1.triggers.filter((t) => !cat0.triggers.includes(t)) };
  info(`0093 objects: tables ${OBJ.tables.join(", ") || "-"}; sequences ${OBJ.seqs.length}; functions ${OBJ.funcs.length}; triggers on listing_reports ${OBJ.triggers.join(", ") || "-"}`);
  ok(OBJ.triggers.length > 0 || OBJ.funcs.length > 0, "0093 installs something on the insert path (a trigger or a function)");
  if (W == null) {
    const iv = [...new Set([...MIG.replace(/--[^\n]*/g, "").matchAll(/interval\s+'(\d+)\s*(second|minute|hour|day)s?'/gi)].map((m) => Number(m[1]) * { second: 1, minute: 60, hour: 3600, day: 86400 }[m[2].toLowerCase()]))];
    if (iv.length === 1) W = iv[0];
  }
  info(`window: ${W != null ? `${W} s` : "unknown (set RL_WINDOW_SECONDS)"}`);

  console.log("\n  1. THE INSTALLED 1.3.x REPORT");
  let r = await report("anon", gw(freshIp()));
  ok(r.ok && (await stored()) === 1, "anon key, six columns, single-object body -> stored", r.msg);
  r = await report("anon", gw(freshIp()), { kind: "claim", user: crypto.randomUUID() });
  ok(r.ok, "a claim with a user_id (signed in on 1.3.x, still the anon key) -> stored", r.msg);
  const u0 = crypto.randomUUID();
  r = await report("authenticated", gw(freshIp()), { user: u0 }, u0);
  ok(r.ok, "an authenticated session, same body -> stored", r.msg);
  r = await req("anon", { headers: gw(freshIp()) }, VALUES1, vals());
  ok(r.ok, "a plain one-row VALUES insert -> stored", r.msg);

  console.log("\n  2. PER-CLIENT LIMIT AND ITS BOUNDARY");
  const e1 = await exhaust("anon", gw(freshIp()));
  N = e1.n;
  ok(e1.refusal && N >= 1 && N < MAXN, `a single client is limited: ${N} stored, the ${N + 1}th refused`, e1.refusal ? "" : `no refusal within ${MAXN}`);
  if (DESIGN.perClient != null) ok(N === DESIGN.perClient, `the limit is exactly the declared ${DESIGN.perClient} (no off-by-one)`, `observed ${N}`);
  const again = [];
  for (let k = 0; k < 3; k++) again.push((await exhaust("anon", gw(freshIp()), N + 5)).n);
  ok(again.every((x) => x === N), `three more fresh clients each get exactly ${N}`, again.join(", "));
  const before = await stored();
  const e1b = await report("anon", gw(freshIp())); // a fresh client right after -- unaffected
  ok(e1b.ok && (await stored()) === before + 1, "one client's exhaustion does not block another (below the global cap)");

  console.log("\n  3. WHAT A 1.3.x CLIENT SEES WHEN REFUSED");
  const ref = e1.refusal || {};
  info(`refusal: SQLSTATE ${ref.code}, PostgREST HTTP ${ref.status}${ref.hint ? ", with a hint" : ""}`);
  ok(ref.status >= 400 && ref.status < 500, "the refusal is a 4xx (a 5xx would trip the launch's 5xx stop condition and monitoring)", `HTTP ${ref.status}`);
  if (DESIGN.expectSqlstate) ok(ref.code === DESIGN.expectSqlstate, `SQLSTATE is the declared ${DESIGN.expectSqlstate}`, ref.code);
  else if (ref.status !== 429) finding(`refusal maps to HTTP ${ref.status}, not 429 (raise with errcode 'PT429' to say "too many requests")`);
  ok(![ref.msg, ref.hint, ref.detail].join(" ").match(/198\.18\.|203\.0\.113\./), "the error text does not echo the client's address");
  info("1.3.x (prod-v1.3.2 ReportListingSheet) sets state = r.ok ? 'done' : 'error': any non-2xx shows its generic error sheet; the body is not read");

  console.log("\n  4. HEADER SPOOFING AND ROTATION");
  // `real` is what the gateway knows; the client controls only what it sends.
  const VARIANTS = [
    ["x-forwarded-for: rotated first hop, real peer appended", (real, i) => gw(real, { "x-forwarded-for": `${spoofIp(i)}, ${real}` }), true],
    ["x-forwarded-for: many rotated hops before the peer", (real, i) => gw(real, { "x-forwarded-for": `${spoofIp(i)}, ${spoofIp(i + 1)}, ${spoofIp(i + 2)}, ${real}` }), true],
    ["x-forwarded-for: empty first hop", (real, i) => gw(real, { "x-forwarded-for": `${" ".repeat(i % 3)}, ${real}` }), true],
    ["x-forwarded-for: garbage first hop", (real, i) => gw(real, { "x-forwarded-for": `not-an-ip-${i}, ${real}` }), true],
    ["x-forwarded-for: 8 KB value", (real, i) => gw(real, { "x-forwarded-for": `${"9".repeat(8000)}${i}, ${real}` }), true],
    ["true-client-ip rotated", (real, i) => gw(real, { "true-client-ip": spoofIp(i) }), true],
    ["x-client-ip rotated", (real, i) => gw(real, { "x-client-ip": spoofIp(i) }), true],
    ["forwarded: for= rotated", (real, i) => gw(real, { forwarded: `for=${spoofIp(i)}` }), true],
    ["user-agent rotated", (real, i) => gw(real, { "user-agent": `ua-${i}` }), true],
    // Below: safe only if the platform overwrites the header (phase C tells).
    ["x-forwarded-for replaced entirely (no appended peer)", (real, i) => gw(real, { "x-forwarded-for": spoofIp(i) }), false],
    ["x-real-ip rotated", (real, i) => gw(real, { "x-real-ip": spoofIp(i) }), false],
    ["cf-connecting-ip rotated", (real, i) => gw(real, { "cf-connecting-ip": spoofIp(i) }), false],
  ];
  const growth = [];
  for (const [label, h, clientControlled] of VARIANTS) {
    const real = freshIp();
    const t0 = await throttleRows();
    const got = (await exhaust("anon", (i) => h(real, i), N + 3)).n;
    growth.push((await throttleRows()) - t0);
    if (got <= N) ok(true, `${label}: ${got} stored, no fresh quota`);
    else if (clientControlled) ok(false, `${label}: rotation bought a fresh quota (${got} > ${N})`);
    else finding(`${label}: rotation bought a fresh quota (${got} > ${N}); safe only if the gateway overwrites this header -- run --http`);
  }
  for (const [label, raw] of [["request.headers absent", ""], ["request.headers '{}'", "{}"], ["request.headers 'null'", "null"], ["x-forwarded-for empty", JSON.stringify({ "x-forwarded-for": "" })], ["x-forwarded-for garbage only", JSON.stringify({ "x-forwarded-for": "garbage" })]]) {
    r = await req("anon", { rawHeaders: raw }, PGRST, [JSON.stringify(body())]);
    ok(r.ok || (r.status >= 400 && r.status < 500), `${label}: stored or a 4xx, never a 5xx`, r.ok ? "" : `${r.code} -> HTTP ${r.status}`);
    if (!r.ok) info(`${label}: refused (${r.code})`);
  }
  const noHdr = (await exhaust("anon", () => ({}), N + 3)).n;
  info(`clients with no address at all share one bucket? ${noHdr <= N ? `yes (${noHdr} stored)` : `NO: ${noHdr} stored`}`);
  if (noHdr > N) ok(false, "requests with no client headers are unlimited", `${noHdr} > ${N}`);

  console.log("\n  5. POISONING");
  const victim = freshIp(), attacker = freshIp();
  await exhaust("anon", (i) => gw(attacker, { "x-forwarded-for": `${victim}, ${attacker}` }), N + 1);
  r = await report("anon", gw(victim));
  if (r.ok) ok(true, "an attacker spoofing the victim's address in x-forwarded-for cannot exhaust the victim's quota");
  else finding("an attacker can lock out any address by naming it in x-forwarded-for (the key is a client-controlled hop)");

  console.log("\n  6. IDENTITY");
  const realU = freshIp();
  const rot = (await exhaust("anon", gw(realU), N + 3, () => ({ user: crypto.randomUUID() }))).n;
  ok(rot <= N, `anon rotating the user_id column (any uuid; 1.3.x sends it with the anon key): ${rot} stored, no fresh quota`, `${rot} > ${N}`);
  const ua = crypto.randomUUID();
  const authN = (await exhaust("authenticated", gw(freshIp()), MAXN, { user: ua }, ua)).n;
  ok(authN >= 1 && authN < MAXN, `an authenticated session is limited too (${authN})`);
  const realA = freshIp();
  const authRot = (await exhaust("authenticated", gw(realA), N + 3, () => ({}), () => crypto.randomUUID())).n;
  if (authRot > N) finding(`authenticated callers rotating sessions from one address got ${authRot} (> ${N}): keyed on the user, so each real account is its own bucket (costs a sign-up each)`);
  else ok(true, `authenticated callers rotating sessions from one address: ${authRot} stored`);

  console.log("\n  7. ONE ROW PER STATEMENT");
  for (const role of ["anon", "authenticated"]) {
    const uid = role === "authenticated" ? crypto.randomUUID() : null;
    const n0 = await stored();
    r = await req(role, { headers: gw(freshIp()), uid }, `insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6), ($1, $2, $3, $4, $5, $6)`, vals());
    ok(!r.ok && r.status < 500 && (await stored()) === n0, `${role}: a 2-row VALUES -> refused (${r.code}, HTTP ${r.status}), nothing stored`);
    r = await req(role, { headers: gw(freshIp()), uid }, PGRST, [JSON.stringify([body(), body()])]);
    ok(!r.ok && r.status < 500 && (await stored()) === n0, `${role}: a PostgREST array body of 2 -> refused (${r.code}), nothing stored`);
    r = await req(role, { headers: gw(freshIp()), uid }, `insert into public.listing_reports (${COLS}) select $1, 'Zz', 'error', 'bulk ' || g, '', null from generate_series(1, 200) g`, [TAG]);
    ok(!r.ok && (await stored()) === n0, `${role}: a 200-row INSERT ... SELECT -> refused, nothing stored`, r.ok ? `${r.count} rows` : r.code);
    r = await req(role, { headers: gw(freshIp()), uid }, `with a as (insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6)) insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6)`, vals());
    const cte = (await stored()) - n0;
    ok(cte <= 1, `${role}: two inserts in one statement (data-modifying CTE) store at most one row`, `${cte} stored`);
    r = await req(role, { headers: gw(freshIp()), uid }, PGRST, [JSON.stringify([body()])]);
    info(`${role}: a PostgREST array body of 1 -> ${r.ok ? "stored" : `refused (${r.code})`}`);
  }
  r = await req("service_role", { headers: gw(freshIp()) }, `insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6), ($1, $2, $3, $4, $5, $6)`, vals());
  info(`service_role: a 2-row insert -> ${r.ok ? "stored" : `refused (${r.code})`} (the cap is for anonymous inserts)`);

  console.log("\n  8. UPSERT, ON CONFLICT, RETURNING");
  const realD = freshIp();
  let doNothing = 0;
  for (let i = 0; i < N + 3; i++) { const x = await req("anon", { headers: gw(realD) }, `${PGRST} on conflict do nothing`, [JSON.stringify(body())]); if (x.ok) doNothing++; else break; }
  ok(doNothing <= N, `ON CONFLICT DO NOTHING (Prefer: resolution=ignore-duplicates) still counts: ${doNothing} stored`, `${doNothing} > ${N}`);
  r = await req("anon", { headers: gw(freshIp()) }, `insert into public.listing_reports (id, ${COLS}) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6) on conflict (id) do update set message = excluded.message`, vals());
  ok(!r.ok && r.code === "42501", "ON CONFLICT DO UPDATE (merge-duplicates) -> refused (42501)", r.code);
  const realR = freshIp();
  r = await req("anon", { headers: gw(realR) }, `${VALUES1} returning *`, vals());
  ok(!r.ok && r.code === "42501", "RETURNING * -> refused (42501)", r.code);
  const afterRet = (await exhaust("anon", gw(realR), N + 1)).n;
  info(`a refused RETURNING ${afterRet === N ? "did not consume" : `consumed ${N - afterRet} of`} the client's quota`);

  console.log("\n  9. GLOBAL CAP");
  const g = await exhaust("anon", () => gw(freshIp()), MAXG);
  G = g.n;
  if (!g.refusal) finding(`no global cap within ${MAXG} reports from distinct clients in one window (RL_MAX_GLOBAL_PROBE to probe further)`);
  else {
    ok(true, `a global cap: ${G} more reports from distinct clients, then refused (${g.refusal.code}, HTTP ${g.refusal.status})`);
    ok(g.refusal.status >= 400 && g.refusal.status < 500, "the global refusal is a 4xx too", `HTTP ${g.refusal.status}`);
    if (DESIGN.global != null) info(`declared global ${DESIGN.global}; this probe started after ${await stored()} test rows in the same window -- compare with S3's counting rule`);
    r = await report("anon", gw(freshIp()));
    ok(!r.ok, "past the global cap a brand-new client is refused too");
    r = await req("authenticated", { headers: gw(freshIp()), uid: u0 }, PGRST, [JSON.stringify(body({ user: u0 }))]);
    info(`past the global cap an authenticated session is ${r.ok ? "allowed" : "refused"}`);
  }

  console.log("\n  12. SERVICE ROLE AND POSTGRES (/api/submit)");
  const ns = await stored();
  let svc = 0;
  for (let i = 0; i < N + 5; i++) { const x = await req("service_role", { headers: gw("192.0.2.10") }, VALUES1, vals({ message: "via /api/submit" })); if (x.ok) svc++; }
  ok(svc === N + 5 && (await stored()) === ns + N + 5, `the service role is not limited, even from one address and past the global cap (${svc}/${N + 5})`);
  r = await req("service_role", {}, VALUES1, vals());
  ok(r.ok, "the service role with no request headers (a direct server call) -> stored", r.msg);
  r = await req("postgres", {}, VALUES1, vals());
  ok(r.ok, "postgres -> stored", r.msg);

  console.log("\n  10. WINDOW EDGE");
  // Moving time also moves this run's report rows, for a design that counts listing_reports itself.
  if (W == null) info("skipped: window unknown (set RL_WINDOW_SECONDS)");
  else {
    // Fresh state for the probe: everything so far moved out of the window.
    await shiftTime(W + 3600);
    const k = freshIp();
    const ex = (await exhaust("anon", gw(k), N + 1)).n;
    ok(ex === N, `after the earlier rows left the window, a client again gets exactly ${N}`, `${ex}`);
    await shiftTime(W - 2);
    r = await report("anon", gw(k));
    if (r.ok) finding(`${W - 2} s after its last report the client was allowed again: a fixed window (a client can send ${2 * N} across a boundary)`);
    else ok(true, `${W - 2} s later: still refused (sliding window)`);
    await shiftTime(4);
    r = await report("anon", gw(k));
    ok(r.ok, `${W + 2} s later: allowed again (the window expires)`, r.code);
  }

  console.log("\n  11. THROTTLE OBJECTS");
  for (const t of OBJ.tables) {
    const priv = await q(`select p, has_table_privilege(r, $1, p) h from unnest(array['anon','authenticated']) r, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p`, [t]);
    const held = priv.filter((x) => x.h);
    ok(held.length === 0, `${t}: anon and authenticated hold no privilege`, held.map((x) => x.p).join(","));
    const [{ rls }] = await q(`select relrowsecurity rls from pg_class where oid = $1::regclass`, [t]);
    ok(rls, `${t}: row-level security on`);
    for (const [role, sql] of [["anon", `select * from ${t} limit 1`], ["authenticated", `select * from ${t} limit 1`], ["anon", `delete from ${t}`], ["anon", `truncate ${t}`]]) {
      r = await req(role, { headers: gw(freshIp()), uid: role === "authenticated" ? u0 : null }, sql);
      ok(!r.ok && r.code === "42501", `${role}: ${sql.split(" ")[0]} on ${t} -> refused (42501)`, r.code);
    }
  }
  for (const s of OBJ.seqs) {
    const h = (await q(`select has_sequence_privilege('anon', $1, 'USAGE') a, has_sequence_privilege('authenticated', $1, 'USAGE') b`, [s]))[0];
    ok(!h.a && !h.b, `${s}: no USAGE for anon/authenticated`);
  }
  for (const f of OBJ.funcs) {
    const [x] = await q(`select prosecdef sd, coalesce(array_to_string(proconfig, ','), '') cfg, prorettype = 'trigger'::regtype trig, has_function_privilege('anon', oid, 'EXECUTE') a, has_function_privilege('authenticated', oid, 'EXECUTE') b from pg_proc where oid = $1::regprocedure`, [f]);
    if (!x.trig) ok(!x.a && !x.b, `${f}: not executable by anon/authenticated (else /rpc could read or reset the counters)`, `anon ${x.a} authenticated ${x.b}`);
    if (x.sd) ok(/search_path=/.test(x.cfg), `${f}: SECURITY DEFINER pins search_path`, x.cfg || "none");
  }
  const totalGrowth = growth.reduce((a, b) => a + b, 0);
  const prunes = /delete\s+from/i.test(MIG.replace(/--[^\n]*/g, ""));
  if (totalGrowth > VARIANTS.length * 2 && !prunes) finding(`header rotation added ${totalGrowth} throttle rows across ${VARIANTS.length} probes and 0093 never deletes old ones: an attacker can grow the table without bound`);
  else info(`throttle rows added by the rotation probes: ${totalGrowth}${prunes ? " (0093 prunes old rows)" : ""}`);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
ok((await q(`select count(*)::int n from public.listing_reports`))[0].n === rowsBefore, "phase A left nothing behind (transaction rolled back)");

// ---- phase B: parallel, committed, cleaned up exactly ------------------------
if (BURST) await phaseB();
if (HTTP) await phaseC();
await c.end();

if (findings.length) { console.log("\n  FINDINGS"); for (const f of findings) console.log(`  - ${f}`); }
console.log(`\n  listing-reports-0093 adversarial (staging): ${pass} passed, ${fail} failed, ${findings.length} finding(s)\n`);
process.exit(fail ? 1 : 0);

// ---- helpers that need the catalogue -----------------------------------------
async function throttleRows() {
  let n = 0;
  for (const t of (OBJ && OBJ.tables) || []) n += (await q(`select count(*)::int n from ${t}`))[0].n;
  return n;
}
async function throttleTimestampCols() {
  const out = [];
  for (const t of OBJ.tables) for (const { attname } of await q(`select attname from pg_attribute where attrelid = $1::regclass and attnum > 0 and not attisdropped and atttypid = 'timestamptz'::regtype`, [t])) out.push([t, attname]);
  return out;
}
// Move every throttle timestamp, and this run's report rows, `secs` into the past
// (inside the rolled-back transaction): the same as waiting `secs`.
async function shiftTime(secs) {
  for (const [t, col] of await throttleTimestampCols()) await q(`update ${t} set "${col}" = "${col}" - make_interval(secs => $1)`, [secs]);
  await q(`update public.listing_reports set created_at = created_at - make_interval(secs => $1) where company_slug like $2`, [secs, `${TAG}%`]);
}
async function pkCols(t) {
  return (await q(`select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = $1::regclass and i.indisprimary order by array_position(i.indkey, a.attnum)`, [t])).map((r) => r.attname);
}
async function snapshot() {
  const snap = {};
  for (const t of OBJ.tables) {
    const pk = await pkCols(t);
    if (!pk.length) return { error: `${t} has no primary key, so phase B could not restore it exactly` };
    snap[t] = { pk, rows: new Map((await q(`select to_jsonb(x) j from ${t} x`)).map((r) => [JSON.stringify(pk.map((k) => r.j[k])), r.j])) };
  }
  return { snap };
}
async function restore(snap) {
  for (const [t, { pk, rows }] of Object.entries(snap)) {
    const now = (await q(`select to_jsonb(x) j from ${t} x`)).map((r) => r.j);
    for (const j of now) {
      const key = JSON.stringify(pk.map((k) => j[k]));
      const where = pk.map((k, i) => `"${k}" = (jsonb_populate_record(null::${t}, $1::jsonb))."${k}"`).join(" and ");
      if (!rows.has(key)) await q(`delete from ${t} where ${where}`, [JSON.stringify(j)]);
      else if (JSON.stringify(rows.get(key)) !== JSON.stringify(j)) {
        const cols = Object.keys(j).filter((k) => !pk.includes(k));
        if (cols.length) await q(`update ${t} set ${cols.map((k) => `"${k}" = (jsonb_populate_record(null::${t}, $1::jsonb))."${k}"`).join(", ")} where ${where}`, [JSON.stringify(rows.get(key))]);
      }
    }
    for (const [key, j] of rows) {
      const present = now.some((x) => JSON.stringify(pk.map((k) => x[k])) === key);
      if (!present) await q(`insert into ${t} select * from jsonb_populate_record(null::${t}, $1::jsonb)`, [JSON.stringify(j)]);
    }
  }
  for (const [t, { rows }] of Object.entries(snap)) {
    const now = (await q(`select to_jsonb(x) j from ${t} x`)).map((r) => JSON.stringify(r.j)).sort();
    ok(JSON.stringify(now) === JSON.stringify([...rows.values()].map((j) => JSON.stringify(j)).sort()), `${t} restored exactly to its pre-run state`);
  }
}
async function anonClient(headers) {
  const k = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await k.connect();
  await k.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: "anon" })]);
  await k.query(`select set_config('request.headers', $1, false)`, [JSON.stringify(headers)]);
  await k.query("set role anon");
  return k;
}
async function phaseB() {
  console.log("\n  PHASE B: PARALLEL, COMMITTED");
  if (!(await applied())) { info("skipped: 0093 is not applied on staging (S4 applies it first)"); return; }
  if (N == null) { info("skipped: phase A did not establish the per-client limit"); return; }
  const s = await snapshot();
  if (s.error) { ok(false, s.error); return; }
  const before = (await q(`select count(*)::int n from public.listing_reports`))[0].n;
  try {
    const one = freshIp();
    const P = N + 10;
    if (P > 60) { info(`parallel per-client probe skipped (N ${N}: ${P} connections is too many)`); return; }
    const clients = await Promise.all(Array.from({ length: P }, () => anonClient(gw(one))));
    const res = await Promise.all(clients.map((k) => k.query(PGRST, [JSON.stringify(body())]).then(() => true, (e) => e.code)));
    await Promise.all(clients.map((k) => k.end()));
    const got = res.filter((x) => x === true).length;
    ok(got <= N, `${P} parallel reports from one client: ${got} stored (limit ${N}; no check-then-insert race)`, `refusals: ${[...new Set(res.filter((x) => x !== true))].join(",")}`);
    ok(!res.some((x) => x !== true && httpStatus(x, "anon") >= 500), "no parallel refusal maps to a 5xx (deadlock / serialization)", [...new Set(res.filter((x) => x !== true))].join(","));
    if (G != null && G <= 300) {
      const PG = G + 20;
      const ks = await Promise.all(Array.from({ length: PG }, () => anonClient(gw(freshIp()))));
      const rg = await Promise.all(ks.map((k) => k.query(PGRST, [JSON.stringify(body())]).then(() => true, (e) => e.code)));
      await Promise.all(ks.map((k) => k.end()));
      const gg = rg.filter((x) => x === true).length;
      ok(gg <= G, `${PG} parallel reports from distinct clients: ${gg} stored (global ${G})`);
    } else info(`parallel global probe skipped (G ${G == null ? "unknown" : `${G} > 300`}: too many connections)`);
  } finally {
    await q(`delete from public.listing_reports where company_slug like $1`, [`${TAG}%`]);
    await restore(s.snap);
    ok((await q(`select count(*)::int n from public.listing_reports`))[0].n === before, "phase B: every report row it committed was deleted");
  }
}
async function phaseC() {
  console.log("\n  PHASE C: THROUGH THE STAGING GATEWAY");
  const key = process.env.STAGING_ANON_KEY;
  if (!key) { info("skipped: STAGING_ANON_KEY not set"); return; }
  if (!(await applied())) { info("skipped: 0093 is not applied on staging"); return; }
  const s = await snapshot();
  if (s.error) { ok(false, s.error); return; }
  const SPOOF = { xff: "203.0.113.77", xri: "203.0.113.78", cf: "203.0.113.79" };
  try {
    const t0 = new Set((await throttleDump()).map((x) => x));
    for (let i = 0; i < 2; i++) {
      const r = await fetch("https://jmljfovtfxcdhjmtlnva.supabase.co/rest/v1/listing_reports", {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal", "X-Forwarded-For": SPOOF.xff, "X-Real-IP": SPOOF.xri, "CF-Connecting-IP": SPOOF.cf },
        body: JSON.stringify(body()),
      });
      info(`gateway request ${i + 1}: HTTP ${r.status}`);
    }
    const added = (await throttleDump()).filter((x) => !t0.has(x)).join(" ");
    const hashed = (v) => [v, crypto.createHash("md5").update(v).digest("hex"), crypto.createHash("sha256").update(v).digest("hex")];
    for (const [h, v] of Object.entries(SPOOF)) {
      const reached = hashed(v).some((x) => added.includes(x));
      if (reached) finding(`the spoofed ${h} value reached the throttle key through the gateway: the platform does NOT overwrite it, so rotating it rotates the client`);
      else info(`spoofed ${h}: not in the throttle key (overwritten by the gateway, or not used${added ? "" : "; no new throttle rows seen"})`);
    }
  } finally {
    await q(`delete from public.listing_reports where company_slug like $1`, [`${TAG}%`]);
    await restore(s.snap);
  }
}
async function throttleDump() {
  const out = [];
  for (const t of OBJ.tables) for (const r of await q(`select to_jsonb(x)::text j from ${t} x`)) out.push(r.j);
  return out;
}
