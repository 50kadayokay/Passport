// 0093 (listing_reports: database-enforced per-client and global rate limit, and
// one row per client statement), attacked on STAGING. Independent of S3's own
// check (written from the requirements and S3's stated design, not from it).
//   node scripts/listing-reports-0093-adversarial-check.mjs            phase A
//   node scripts/listing-reports-0093-adversarial-check.mjs --burst    + phase B (parallel, committed, cleaned up exactly)
//   STAGING_ANON_KEY=... node scripts/listing-reports-0093-adversarial-check.mjs --http
//                                                                       + phase C (real requests through the gateway)
//
// FOR S4 TO RUN (needs supabase/staging/.connection). Prints booleans, counts,
// SQLSTATEs and HTTP statuses only; never row contents, keys or the salt.
//
// S3'S DESIGN, AS STATED (2026-11-02), WHICH THIS ATTACKS
//   - limited: request role anon/authenticated (request.jwt.claims->>'role', else
//     the session's role); not the service role, direct sessions, or is_admin()
//   - one row per INSERT statement, else PT400 (whole statement); 0 rows passes
//   - AFTER INSERT ... FOR EACH STATEMENT trigger; GLOBAL 300 / fixed 60 min
//     ('lr:global', form listing_report_db_global) first, then PER CLIENT 5 /
//     fixed 10 min (form listing_report_db_client); over either PT429; counters
//     in 0057's submission_throttle; a refusal rolls its own increments back
//   - client = cf-connecting-ip, else FIRST x-forwarded-for hop, else x-real-ip,
//     else 'unknown'; stored as 'lr:' || 32 hex of sha256(salt | ip)
//   - no client access to submission_throttle, listing_report_limits,
//     submission_throttle_salt, listing_report_client_key(), the guard; still no
//     SELECT on listing_reports; 0077's policy and 0092's grants unchanged
//
// PHASE A: ONE transaction, always ROLLED BACK; 0093 is applied inside it when
// staging lacks it (that holds listing_reports' lock for the run's few seconds;
// lock_timeout 10 s). now() is fixed inside a transaction, so phase A sits in one
// window; "the next window" is simulated by moving this design's counter rows
// back a full global window (newWindow), which also gives every section a clean
// slate. Requests are simulated the way PostgREST runs them: set local role,
// request.jwt.claims and request.headers per statement, and PostgREST's
// json_to_recordset insert shape for object and array bodies.
//
// PHASE B (--burst; needs 0093 APPLIED on staging): separate pg clients, each
// SET ROLE anon with its own request.headers, in parallel, COMMITTED. Cleanup is
// exact: this run's report rows (tagged) are deleted, and this design's counter
// rows in submission_throttle are restored from a snapshot by primary key and
// compared.
//
// PHASE C (--http; STAGING_ANON_KEY; 0093 applied): real reports through the
// staging gateway with spoofed CF-Connecting-IP / X-Forwarded-For / X-Real-IP,
// then (as postgres, computing the key with the salt server-side) which spoofed
// value became the client key, and whether the gateway supplies a usable
// address at all ('unknown' would put every 1.3.x user in ONE bucket of 5).
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import { runnerBody } from "./_db-egress.mjs";

const DESIGN = {
  migration: "supabase/migrations/0093_listing_reports_rate_limit.sql",
  perClient: 5, clientWindowS: 600, global: 300, globalWindowS: 3600,
  tooMany: "PT429", tooMuch: "PT400",
  throttle: "public.submission_throttle",
  forms: ["listing_report_db_global", "listing_report_db_client"],
  globalKey: "lr:global",
  limitsTable: "public.listing_report_limits", saltTable: "public.submission_throttle_salt",
  keyFn: "public.listing_report_client_key()", guardFn: "public.listing_reports_guard()",
};

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
if (!fs.existsSync(DESIGN.migration)) { console.error(`  ${DESIGN.migration} is not on this branch; nothing to attack.`); process.exit(3); }
const MIG = fs.readFileSync(DESIGN.migration, "utf8");
const BURST = process.argv.includes("--burst"), HTTP = process.argv.includes("--http");
const N = DESIGN.perClient, G = DESIGN.global;

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
const vals = (o = {}) => { const b = body(o); return SIX.map((k) => b[k]); };

// Addresses from the benchmarking / documentation ranges only, never a real host.
let ipN = 0;
const freshIp = () => { const i = ++ipN; return `198.18.${(i >> 8) & 255}.${i & 255}`; };
const spoofIp = (i) => `203.0.113.${(i % 250) + 1}`;
// What Supabase's gateway hands PostgREST for a client at `real` (Cloudflare in
// front sets cf-connecting-ip; proxies append to x-forwarded-for).
const gw = (real, extra = {}) => ({ "cf-connecting-ip": real, "x-forwarded-for": real, "x-real-ip": real, "user-agent": "MineEx/1.3.2 CFNetwork", ...extra });
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
const isClient = (r) => !r.ok && r.code === DESIGN.tooMany && /from this device/.test(r.msg);
const isGlobal = (r) => !r.ok && r.code === DESIGN.tooMany && /too many reports right now/.test(r.msg);
// Requests until refused (or `max`): how many were stored, and the refusal.
async function exhaust(role, h, max, o = {}, uid = null) {
  for (let i = 0; i < max; i++) {
    const r = await report(role, typeof h === "function" ? h(i) : h, typeof o === "function" ? o(i) : o, typeof uid === "function" ? uid(i) : uid);
    if (!r.ok) return { n: i, refusal: r };
  }
  return { n: max, refusal: null };
}
const FORMS = `form = any($1::text[])`;
const globalCount = async () => (await q(`select coalesce(sum(count), 0)::int n from ${DESIGN.throttle} where ip_hash = $1 and form = $2 and window_start > now() - make_interval(secs => $3)`, [DESIGN.globalKey, DESIGN.forms[0], DESIGN.globalWindowS]))[0].n;
const counterRows = async () => (await q(`select count(*)::int n from ${DESIGN.throttle} where ${FORMS}`, [DESIGN.forms]))[0].n;
// "The next window": this design's counters move back one full global window.
const newWindow = () => q(`update ${DESIGN.throttle} set window_start = window_start - make_interval(secs => $2) where ${FORMS}`, [DESIGN.forms, DESIGN.globalWindowS + DESIGN.clientWindowS]);
const grantsAndPolicy = async () => JSON.stringify({
  policy: await q(`select policyname, cmd, roles::text r, coalesce(qual, '') q, coalesce(with_check, '') w from pg_policies where schemaname = 'public' and tablename = 'listing_reports' order by 1`),
  table: await q(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'listing_reports' and grantee in ('anon', 'authenticated') order by 1, 2`),
  cols: await q(`select a.attname, a.attacl::text acl from pg_attribute a where a.attrelid = 'public.listing_reports'::regclass and a.attnum > 0 and not a.attisdropped and a.attacl is not null order by 1`),
});
const isApplied = async () => (await q(`select to_regprocedure('public.listing_reports_guard()') is not null and exists (select 1 from pg_trigger where tgrelid = 'public.listing_reports'::regclass and tgname = 'listing_reports_guard') a`))[0].a;

const rowsBefore = (await q(`select count(*)::int n from public.listing_reports`))[0].n;
const wasApplied = await isApplied();
await c.query("begin");
try {
  await c.query("set local lock_timeout = '10s'");
  const GP0 = await grantsAndPolicy();
  if (!wasApplied) { await q(runnerBody(MIG)); console.log("  (0093 not on staging: applied inside the transaction)"); }
  else console.log("  (0093 already applied on staging)");
  ok(await isApplied(), "0093's statement trigger is on listing_reports");
  if (!wasApplied) ok((await grantsAndPolicy()) === GP0, "0077's policy and 0092's column grants are unchanged by 0093");
  const [lim] = await q(`select per_client, client_window_minutes, global_per_window, global_window_minutes from ${DESIGN.limitsTable} where id`);
  ok(lim && lim.per_client === N && lim.client_window_minutes * 60 === DESIGN.clientWindowS && lim.global_per_window === G && lim.global_window_minutes * 60 === DESIGN.globalWindowS,
    `the limits row says ${N} per ${DESIGN.clientWindowS / 60} min and ${G} per ${DESIGN.globalWindowS / 60} min`, JSON.stringify(lim));
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

  console.log("\n  2. PER-CLIENT LIMIT AND ITS BOUNDARY");
  await newWindow();
  const e1 = await exhaust("anon", gw(freshIp()), N + 5);
  ok(e1.n === N && isClient(e1.refusal), `one client: exactly ${N} stored, the ${N + 1}th refused by the per-client limit`, `${e1.n} stored; ${e1.refusal && e1.refusal.msg}`);
  const again = [];
  for (let k = 0; k < 3; k++) again.push((await exhaust("anon", gw(freshIp()), N + 3)).n);
  ok(again.every((x) => x === N), `three more fresh clients each get exactly ${N}`, again.join(", "));
  r = await report("anon", gw(freshIp()));
  ok(r.ok, "an exhausted client does not block another");
  const g0 = await globalCount();
  const k1 = freshIp();
  await exhaust("anon", gw(k1), N);
  for (let i = 0; i < 10; i++) await report("anon", gw(k1));
  ok((await globalCount()) === g0 + N, `10 refused requests from an exhausted client add nothing to the global count (+${N} only)`, `${g0} -> ${await globalCount()}`);
  r = await req("anon", { headers: gw(k1) }, PGRST, [JSON.stringify(body())]);
  ok(isClient(r), "...and it is still refused (a refusal does not reset anything)");

  console.log("\n  3. WHAT A 1.3.x CLIENT SEES WHEN REFUSED");
  const ref = e1.refusal || {};
  ok(ref.code === DESIGN.tooMany && ref.status === 429, `per-client refusal: SQLSTATE ${ref.code} -> PostgREST HTTP ${ref.status} (expected PT429 -> 429)`);
  ok(!/198\.18\.|203\.0\.113\.|lr:/.test([ref.msg, ref.hint, ref.detail].join(" ")), "the error names the limit, never the client's address or key");
  info("1.3.x (prod-v1.3.2 ReportListingSheet): state = r.ok ? 'done' : 'error', so a 429 shows its generic error sheet; the body is not read");
  info("older PostgREST turns an unknown PTxxx into 400; either way a 4xx, never a 5xx (the launch's stop condition)");

  console.log("\n  4. HEADER SPOOFING AND ROTATION");
  // [label, headers(real, i), expectation]: "hold" = must not buy a fresh quota;
  // "gateway" = holds only if the platform overwrites/sets that header (phase C);
  // "accepted" = S3's stated, global-bounded weakness.
  const VARIANTS = [
    ["cf present; x-forwarded-for first hop rotated", (real, i) => gw(real, { "x-forwarded-for": `${spoofIp(i)}, ${real}` }), "hold"],
    ["cf present; x-forwarded-for many hops rotated", (real, i) => gw(real, { "x-forwarded-for": `${spoofIp(i)}, ${spoofIp(i + 1)}, ${real}` }), "hold"],
    ["cf present; x-real-ip rotated", (real, i) => gw(real, { "x-real-ip": spoofIp(i) }), "hold"],
    ["cf present; true-client-ip / x-client-ip / forwarded rotated", (real, i) => gw(real, { "true-client-ip": spoofIp(i), "x-client-ip": spoofIp(i), forwarded: `for=${spoofIp(i)}` }), "hold"],
    ["cf present; user-agent rotated", (real, i) => gw(real, { "user-agent": `ua-${i}` }), "hold"],
    ["cf with spaces around the same address", (real, i) => gw(real, { "cf-connecting-ip": `${" ".repeat(i % 3)}${real}${" ".repeat(i % 2)}` }), "hold"],
    // S3 c82105d trims all whitespace (regexp_replace), so tab/newline padding is the same address.
    ["cf with tabs/newlines around the same address", (real, i) => gw(real, { "cf-connecting-ip": `${"\t".repeat(i % 3)}${real}${"\n".repeat(i % 2)}` }), "hold"],
    ["no cf; x-forwarded-for first hop padded with tabs/newlines", (real, i) => noCf(gw(real, { "x-forwarded-for": `${"\t".repeat(i % 3)}${real}${"\n".repeat(i % 2)}, 192.0.2.1` })), "hold"],
    ["cf rotated", (real, i) => gw(real, { "cf-connecting-ip": spoofIp(i) }), "gateway"],
    ["cf rotated as IPv6 case variants of one address", (real, i) => gw(real, { "cf-connecting-ip": i % 2 ? "2001:DB8::1" : "2001:db8::1".replace(/d/g, i % 3 ? "D" : "d") }), "gateway"],
    ["no cf; x-forwarded-for first hop rotated (peer appended)", (real, i) => noCf(gw(real, { "x-forwarded-for": `${spoofIp(i)}, ${real}` })), "accepted"],
    ["no cf; x-forwarded-for empty first hop", (real, i) => noCf(gw(real, { "x-forwarded-for": `${" ".repeat(i % 4)}, ${real}` })), "hold"],
    ["no cf, no x-forwarded-for; x-real-ip rotated", (real, i) => { const h = noCf(gw(real, { "x-real-ip": spoofIp(i) })); delete h["x-forwarded-for"]; return h; }, "gateway"],
  ];
  const growth = [];
  for (const [label, h, kind] of VARIANTS) {
    await newWindow();
    const real = freshIp();
    const t0 = await counterRows();
    const got = (await exhaust("anon", (i) => h(real, i), N + 3)).n;
    growth.push((await counterRows()) - t0);
    if (got <= N) ok(true, `${label}: ${got} stored, no fresh quota`);
    else if (kind === "hold") ok(false, `${label}: rotation bought a fresh quota (${got} > ${N})`);
    else if (kind === "gateway") finding(`${label}: ${got} stored (> ${N}); safe only if the gateway sets/overwrites it -- phase C`);
    else finding(`${label}: ${got} stored (> ${N}) -- the accepted weakness, bounded only by the global ${G}/h`);
  }
  await newWindow();
  for (const [label, raw] of [["request.headers unset", ""], ["'{}'", "{}"], ["'null'", "null"], ["all three address headers empty", JSON.stringify({ "cf-connecting-ip": "", "x-forwarded-for": "", "x-real-ip": "" })], ["x-forwarded-for ',,,'", JSON.stringify({ "x-forwarded-for": ",,," })], ["an 8 KB x-forwarded-for", JSON.stringify({ "x-forwarded-for": "9".repeat(8192) })]]) {
    r = await req("anon", { rawHeaders: raw }, PGRST, [JSON.stringify(body())]);
    ok(r.ok || (r.status >= 400 && r.status < 500), `headers ${label}: stored or a 4xx, never a 5xx`, r.ok ? "" : `${r.code} -> HTTP ${r.status}`);
  }
  await newWindow();
  const unk = (await exhaust("anon", (i) => (i % 2 ? {} : { "x-forwarded-for": "" }), N + 3)).n;
  ok(unk === N, `requests with no usable address share ONE bucket of ${N} ('unknown')`, `${unk}`);
  info(`if the production gateway ever delivers no address, every 1.3.x user shares that bucket of ${N} per ${DESIGN.clientWindowS / 60} min -- phase C checks staging's gateway`);

  console.log("\n  5. POISONING");
  await newWindow();
  const victim = freshIp(), attacker = freshIp();
  await exhaust("anon", gw(attacker, { "x-forwarded-for": `${victim}, ${attacker}` }), N + 1);
  r = await report("anon", gw(victim));
  ok(r.ok, "with cf present, naming a victim in x-forwarded-for does not exhaust the victim's quota");
  await newWindow();
  const v2 = freshIp();
  await exhaust("anon", noCf(gw(freshIp(), { "x-forwarded-for": `${v2}, 192.0.2.99` })), N + 1);
  r = await report("anon", noCf(gw(v2)));
  if (!r.ok) finding("without cf-connecting-ip, an attacker can lock out any address by naming it as the first x-forwarded-for hop (phase C decides whether production can reach this)");
  else info("without cf, poisoning by the first hop did not lock the victim out");

  console.log("\n  6. IDENTITY AND ROLE");
  await newWindow();
  const rot = (await exhaust("anon", gw(freshIp()), N + 3, () => ({ user: crypto.randomUUID() }))).n;
  ok(rot === N, `anon rotating the user_id column gets no fresh quota (${rot})`);
  const ua = crypto.randomUUID();
  const au = (await exhaust("authenticated", gw(freshIp()), N + 3, { user: ua }, ua)).n;
  ok(au === N, `an authenticated session is limited the same way (${au})`);
  const realS = freshIp();
  const sess = (await exhaust("authenticated", gw(realS), N + 3, () => ({}), () => crypto.randomUUID())).n;
  ok(sess === N, `rotating sessions from one address gets no fresh quota (keyed on the address, ${sess})`);
  await newWindow();
  const directIp = freshIp();
  const direct = await (async () => { for (let i = 0; i < N + 3; i++) { const x = await req("anon", { claims: "", headers: gw(directIp) }, VALUES1, vals()); if (!x.ok) return { n: i, x }; } return { n: N + 3 }; })();
  ok(direct.n === N && direct.x && direct.x.code === DESIGN.tooMany, `role anon with NO claims (a direct anon session) is limited by the session role: ${direct.n} stored`, direct.x ? direct.x.code : "never refused");
  info("role set without claims falls back to current_setting('role'), as designed");
  r = await req("anon", { claims: JSON.stringify({ role: "service_role" }), headers: gw(freshIp()) }, `insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6), ($1, $2, $3, $4, $5, $6)`, vals());
  info(`session role anon but claims role service_role (not producible through PostgREST, whose role IS the claim): ${r.ok ? "exempt" : `refused (${r.code})`}`);
  const [adm] = await q(`select id from public.profiles where role = 'admin' limit 1`);
  if (adm) {
    r = await req("authenticated", { uid: adm.id, headers: gw(freshIp()) }, `insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6), ($1, $2, $3, $4, $5, $6)`, vals());
    ok(r.ok, "a platform admin's session is exempt (a 2-row insert passes), as designed", r.code);
    r = await req("anon", { claims: JSON.stringify({ role: "anon", sub: adm.id }), headers: gw(freshIp()) }, `insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6), ($1, $2, $3, $4, $5, $6)`, vals());
    info(`claims {role: anon, sub: <an admin>} -> ${r.ok ? "exempt: is_admin() trusts sub, which only a verified JWT can carry (PostgREST's anon key has none)" : `refused (${r.code})`}`);
  } else info("no platform admin on staging: the is_admin() exemption was not exercised");
  r = await req("anon", { headers: gw(freshIp()) }, `set session_replication_role = replica`);
  ok(!r.ok && r.code === "42501", "anon cannot switch triggers off (session_replication_role)", r.code);
  info("COPY ... FROM STDIN is not reachable through PostgREST (no COPY endpoint); in a direct session COPY fires the statement trigger too");

  console.log("\n  7. ONE ROW PER STATEMENT");
  for (const role of ["anon", "authenticated"]) {
    await newWindow();
    const uid = role === "authenticated" ? crypto.randomUUID() : null;
    const n0 = await stored(), gc0 = await globalCount();
    const bulk = [
      ["a 2-row VALUES", `insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6), ($1, $2, $3, $4, $5, $6)`, vals()],
      ["a PostgREST array body of 2", PGRST, [JSON.stringify([body(), body()])]],
      ["a PostgREST array body of 200", PGRST, [JSON.stringify(Array.from({ length: 200 }, () => body()))]],
      ["a 200-row INSERT ... SELECT", `insert into public.listing_reports (${COLS}) select $1, 'Zz', 'error', 'bulk ' || g, '', null from generate_series(1, 200) g`, [TAG]],
      ["an array of 2 with ON CONFLICT DO NOTHING", `${PGRST} on conflict do nothing`, [JSON.stringify([body(), body()])]],
    ];
    for (const [label, sql, args] of bulk) {
      r = await req(role, { headers: gw(freshIp()), uid }, sql, args);
      ok(!r.ok && r.code === DESIGN.tooMuch && r.status === 400 && (await stored()) === n0, `${role}: ${label} -> PT400 (HTTP 400), nothing stored`, r.ok ? `${r.count} rows stored` : r.code);
    }
    ok((await globalCount()) === gc0, `${role}: the refused bulk requests consumed no quota`);
    r = await req(role, { headers: gw(freshIp()), uid }, `with a as (insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6)) insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6)`, vals());
    const cte = (await stored()) - n0;
    if (cte > 1) finding(`${role}: two INSERTs in one statement (a data-modifying CTE) stored ${cte} rows: the cap is per INSERT, not per statement (not reachable through PostgREST, which builds one INSERT)`);
    else ok(true, `${role}: a two-INSERT CTE stores at most one row (${cte})`);
    r = await req(role, { headers: gw(freshIp()), uid }, PGRST, [JSON.stringify([body()])]);
    ok(r.ok, `${role}: a PostgREST array of ONE -> stored`, r.code);
    r = await req(role, { headers: gw(freshIp()), uid }, `insert into public.listing_reports (${COLS}) select $1, 'Zz', 'error', 'x', '', null where false`, [TAG]);
    ok(r.ok, `${role}: a 0-row INSERT passes`, r.code);
  }
  r = await req("service_role", { headers: gw(freshIp()) }, `insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6), ($1, $2, $3, $4, $5, $6)`, vals());
  ok(r.ok, "service_role: a 2-row insert is not capped", r.code);

  console.log("\n  8. ON CONFLICT, RETURNING, READS");
  await newWindow();
  const realD = freshIp();
  let dn = 0;
  for (let i = 0; i < N + 3; i++) { const x = await req("anon", { headers: gw(realD) }, `${PGRST} on conflict do nothing`, [JSON.stringify(body())]); if (x.ok) dn++; else break; }
  ok(dn === N, `ON CONFLICT DO NOTHING counts against the quota (${dn})`);
  r = await req("anon", { headers: gw(freshIp()) }, `insert into public.listing_reports (id, ${COLS}) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6) on conflict (id) do update set message = excluded.message`, vals());
  ok(!r.ok && r.code === "42501", "ON CONFLICT (id) DO UPDATE (merge-duplicates) -> refused (42501)", r.code);
  r = await req("anon", { headers: gw(freshIp()) }, `${VALUES1} returning *`, vals());
  ok(!r.ok && r.code === "42501", "RETURNING * -> refused (42501)", r.code);
  for (const role of ["anon", "authenticated"]) {
    r = await req(role, { uid: role === "authenticated" ? u0 : null }, `select * from public.listing_reports limit 1`);
    ok(!r.ok && r.code === "42501", `${role}: SELECT on listing_reports -> still refused`, r.code);
  }

  console.log("\n  9. GLOBAL CAP");
  await newWindow();
  const g = await exhaust("anon", () => gw(freshIp()), G + 5);
  ok(g.n === G && isGlobal(g.refusal) && g.refusal.status === 429, `${G} reports from ${G} distinct clients, then the global PT429 (HTTP 429)`, `${g.n}; ${g.refusal && g.refusal.code}`);
  r = await report("anon", gw(freshIp()));
  ok(isGlobal(r), "past it a brand-new client is refused too");
  r = await report("authenticated", gw(freshIp()), { user: u0 }, u0);
  ok(isGlobal(r), "...and an authenticated session");
  finding(`the global ceiling is a cheap denial of service for the 1.3.x report path: ${Math.ceil(G / N)} addresses (or one, wherever the first x-forwarded-for hop is the key) fill ${G}/h, and every installed app's "Report or claim" then fails for up to an hour. /api/submit (newer builds) is unaffected. Accept for the pilot, or alert on it.`);

  console.log("\n  12. SERVICE ROLE, POSTGRES (/api/submit)");
  const ns = await stored();
  let svc = 0;
  for (let i = 0; i < N + 5; i++) { const x = await req("service_role", { headers: gw("192.0.2.10") }, VALUES1, vals()); if (x.ok) svc++; }
  ok(svc === N + 5 && (await stored()) === ns + N + 5, `the service role is not limited, from one address and past the global cap (${svc}/${N + 5})`);
  r = await req("service_role", {}, VALUES1, vals());
  ok(r.ok, "the service role with no request headers -> stored", r.code);
  r = await req("postgres", {}, VALUES1, vals());
  ok(r.ok, "a direct postgres session -> stored", r.code);

  console.log("\n  10. WINDOWS");
  await newWindow();
  const kw = freshIp();
  await exhaust("anon", gw(kw), N);
  ok(isClient(await report("anon", gw(kw))), "exhausted in this window");
  await q(`update ${DESIGN.throttle} set window_start = window_start - make_interval(secs => $2) where ${FORMS}`, [DESIGN.forms, DESIGN.clientWindowS]);
  r = await report("anon", gw(kw));
  ok(r.ok, `once its window is the previous one (${DESIGN.clientWindowS / 60} min on), the client is allowed again`, r.code);
  info(`fixed windows: a client can send ${2 * N} in a few seconds across a ${DESIGN.clientWindowS / 60}-minute boundary, and ${2 * G} can land across an hour boundary (accepted for the pilot)`);
  const [b] = await q(`select (select count(*)::int from ${DESIGN.throttle} where form = $1 and window_start <> to_timestamp(floor(extract(epoch from now()) / $2) * $2)) stray`, [DESIGN.forms[1], DESIGN.clientWindowS]);
  info(`client counters are keyed on the ${DESIGN.clientWindowS / 60}-minute bucket start (rows on other boundaries: ${b.stray}, all moved there by this run)`);

  console.log("\n  11. THROTTLE OBJECTS");
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
  for (const f of [DESIGN.keyFn, DESIGN.guardFn, "public.bump_submission_throttle(text, text, timestamp with time zone)", "public.prune_submission_throttle()"]) {
    const [x] = await q(`select prosecdef sd, coalesce(array_to_string(proconfig, ','), '') cfg, has_function_privilege('anon', oid, 'EXECUTE') a, has_function_privilege('authenticated', oid, 'EXECUTE') b from pg_proc where oid = to_regprocedure($1)`, [f]);
    if (!x) { info(`${f}: not present`); continue; }
    ok(!x.a && !x.b, `${f}: not executable by anon/authenticated`, `anon ${x.a} authenticated ${x.b}`);
    if (x.sd) ok(/search_path=/.test(x.cfg), `${f}: SECURITY DEFINER pins search_path`, x.cfg || "none");
  }
  r = await req("anon", { headers: gw(freshIp()) }, `select ${DESIGN.keyFn.replace("()", "")}()`);
  ok(!r.ok && r.code === "42501", "anon: calling listing_report_client_key() (would leak a key oracle) -> refused", r.code);
  const totalGrowth = growth.reduce((a, b) => a + b, 0);
  info(`counter rows added by the rotation probes: ${totalGrowth}; 0057's prune_submission_throttle() (service role) deletes rows older than a day -- check that something actually CALLS it on a schedule`);
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
  return new Map((await q(`select ip_hash, form, window_start::text ws, count from ${DESIGN.throttle} where ${FORMS}`, [DESIGN.forms])).map((r) => [`${r.ip_hash}|${r.form}|${r.ws}`, r]));
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
async function phaseB() {
  console.log("\n  PHASE B: PARALLEL, COMMITTED");
  if (!(await isApplied())) { info("skipped: 0093 is not applied on staging (S4 applies it first)"); return; }
  const snap = await snapshot();
  const before = (await q(`select count(*)::int n from public.listing_reports`))[0].n;
  const gStart = await globalCount();
  try {
    if (gStart + 40 > G) { info(`skipped: the live global count is ${gStart}; too close to ${G} to probe without blocking real reports`); return; }
    const one = freshIp();
    const P = N + 15;
    const clients = await Promise.all(Array.from({ length: P }, () => anonClient(gw(one))));
    const res = await Promise.all(clients.map((k) => k.query(PGRST, [JSON.stringify(body())]).then(() => true, (e) => e.code)));
    await Promise.all(clients.map((k) => k.end()));
    const got = res.filter((x) => x === true).length;
    const codes = [...new Set(res.filter((x) => x !== true))];
    ok(got === N, `${P} parallel reports from one client: exactly ${N} stored (no overshoot)`, `${got}; refusals ${codes.join(",")}`);
    ok(codes.every((x) => x === DESIGN.tooMany), "every parallel refusal is PT429 (no deadlock 40P01, no serialization 40001, no lock timeout)", codes.join(","));
    ok((await globalCount()) === gStart + N, `the global counter moved by exactly ${N} (refusals rolled back their increments)`, `${gStart} -> ${await globalCount()}`);
    // The global ceiling under contention, without filling the real window: lower it for the probe.
    await q(`update ${DESIGN.limitsTable} set global_per_window = $1 where id`, [gStart + N + 10]);
    const ks = await Promise.all(Array.from({ length: 30 }, () => anonClient(gw(freshIp()))));
    const rg = await Promise.all(ks.map((k) => k.query(PGRST, [JSON.stringify(body())]).then(() => true, (e) => e.code)));
    await Promise.all(ks.map((k) => k.end()));
    const gg = rg.filter((x) => x === true).length;
    ok(gg === 10, "30 parallel distinct clients against 10 remaining global slots: exactly 10 stored", `${gg}; ${[...new Set(rg.filter((x) => x !== true))].join(",")}`);
  } finally {
    await q(`update ${DESIGN.limitsTable} set global_per_window = $1 where id`, [G]);
    await q(`delete from public.listing_reports where company_slug = $1`, [TAG]);
    await restore(snap, "phase B");
    ok((await q(`select count(*)::int n from public.listing_reports`))[0].n === before, "phase B: every report row it committed was deleted");
    ok((await q(`select global_per_window g from ${DESIGN.limitsTable} where id`))[0].g === G, `phase B: the global limit is back to ${G}`);
  }
}
async function phaseC() {
  console.log("\n  PHASE C: THROUGH THE STAGING GATEWAY");
  const key = process.env.STAGING_ANON_KEY;
  if (!key) { info("skipped: STAGING_ANON_KEY not set"); return; }
  if (!(await isApplied())) { info("skipped: 0093 is not applied on staging"); return; }
  const snap = await snapshot();
  const before = (await q(`select count(*)::int n from public.listing_reports`))[0].n;
  const SPOOF = { "cf-connecting-ip": "203.0.113.77", "x-forwarded-for (first hop)": "203.0.113.78", "x-real-ip": "203.0.113.79" };
  try {
    const send = (headers) => fetch("https://jmljfovtfxcdhjmtlnva.supabase.co/rest/v1/listing_reports", {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal", ...headers },
      body: JSON.stringify(body()),
    }).then((r) => r.status, () => 0);
    info(`plain request: HTTP ${await send({})}`);
    info(`spoofed request: HTTP ${await send({ "CF-Connecting-IP": SPOOF["cf-connecting-ip"], "X-Forwarded-For": SPOOF["x-forwarded-for (first hop)"], "X-Real-IP": SPOOF["x-real-ip"] })}`);
    const added = [...(await snapshot()).values()].filter((r) => r.form === DESIGN.forms[1] && !snap.has(`${r.ip_hash}|${r.form}|${r.ws}`)).map((r) => r.ip_hash);
    const keyOf = async (ip) => (await q(`select 'lr:' || left(encode(sha256(convert_to(s.salt || '|' || $1, 'UTF8')), 'hex'), 32) k from ${DESIGN.saltTable} s where s.id`, [ip]))[0].k;
    ok(added.length >= 1, `the gateway requests created client counters (${added.length})`);
    ok(!added.includes(await keyOf("unknown")), "the gateway delivers a usable client address (neither request fell into the shared 'unknown' bucket)");
    for (const [h, v] of Object.entries(SPOOF)) {
      if (added.includes(await keyOf(v))) {
        if (h === "cf-connecting-ip") ok(false, "a client-sent CF-Connecting-IP reached the key: the gateway does NOT overwrite it, so any client can rotate its identity");
        else finding(`the spoofed ${h} became the key: the gateway sets no cf-connecting-ip here, so the first-hop weakness applies (bounded by the global ${G}/h)`);
      } else info(`spoofed ${h}: not the key`);
    }
    info("staging's gateway is assumed to match production's (both Supabase-hosted); confirm once on production with one report after 0093");
  } finally {
    await q(`delete from public.listing_reports where company_slug = $1`, [TAG]);
    await restore(snap, "phase C");
    ok((await q(`select count(*)::int n from public.listing_reports`))[0].n === before, "phase C: its report rows were deleted");
  }
}
