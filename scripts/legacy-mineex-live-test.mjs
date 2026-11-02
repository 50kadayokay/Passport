// LEGACY mineex.ca compatibility, LIVE against the STAGING database.
//
//   node scripts/legacy-mineex-live-test.mjs [--fixed] [--no-service] [--publish-live] [--inventory] [--verbose]
//
// WHAT THIS PROVES
// ----------------
// mineex.ca is a separate Vercel project that still runs git commit 9dfafd7
// (prod-v1.3.2 + 3 cosmetic commits): the marketing site, /site/legacy, the old
// web investor app at /app, the old company console / onboarding / portal / admin,
// and its OWN old /api/* functions. Its environment holds only VITE_SUPABASE_URL
// and VITE_SUPABASE_ANON_KEY -- no service-role key, no CRON / AI / Stripe /
// Postmark secrets. Staging has every pending production migration applied.
// This suite replays every database call that code makes -- same method, path,
// headers, body shape and role -- against staging, and classifies each:
//
//   PASS     works as on production today
//   CHANGED  works, but behaves differently (the line says how, and which migration)
//   BREAK    refused / 5xx -- the line names the responsible migration
//   PREEXIST refused on staging AND on production today: the rule predates every pending
//            migration (the line names where it comes from) -- not a regression
//   KNOWN    a break on the explicit KNOWN list below (fixes are being written)
//   DEFERRED a break caused ONLY by a migration production deliberately defers
//            (0061b) -- a staging-only divergence, reported, not counted as failure
//
// CALL INVENTORY. The call sites are enumerated at run time with `git grep` on
// 9dfafd7 (src/ and api/): every /rest/v1/, /storage/v1/object (not public URLs),
// /api/<route>, serviceRest/serviceRpc/db.* line. Every site must be covered by a
// check or by an explicit rule; an uncovered site fails the run. --inventory
// prints the table (file:line -> check, role, call).
//
// OLD /api HARNESS (set up and torn down by this script):
//   git worktree add --detach <tmp>/old-site 9dfafd7, node_modules symlinked in;
//   scripts/staging-api-server.mjs copied to <tmp>/old-api-server.mjs with the API
//   dir taken from OLD_API_DIR and the handler env cut down to what mineex.ca has
//   (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY of staging). The egress guard and
//   tripwire are the CURRENT repo's (api/_stagingEgress.js, api/_stagingEnv.js),
//   so nothing leaves staging: AI / Postmark / Stripe are mocked or blocked.
//   SECONDARY mode (default on, --no-service to skip): a second old-API server
//   that also gets the STAGING service key (aliased to SUPABASE_SERVICE_ROLE_KEY
//   after the tripwire has validated it as a staging key). mineex.ca does not
//   have that key; this mode shows what the service-role paths would do.
//   Teardown removes the worktree and the temp dir in every exit path.
//
// KNOWN BREAKS (fixes in progress elsewhere). Without --fixed they must still
// break (a known break that passes fails the run: flip the flag). With --fixed
// every one of them must PASS.
//
// WRITES (staging only): rows tagged "[legacy-live <run>]" / legacy-live+<run>@
// staging.invalid, throwaway companies zz-legacy-*-<run> (all their dependants
// cascade), storage objects under the test users' own folders, a push token
// "legacy-live-<run>". Fixture rows are never deleted: fixture writes are
// identical-value PATCHes (verified unchanged afterwards) or are restored from a
// snapshot taken first. Cleanup runs with the staging service key in a finally.
// --publish-live additionally publishes and unpublishes one tagged draft of fixture
// company A through the old handlers: that leaves permanent, tagged history
// (release_revisions is append-only and its retention trigger is never bypassed).
//
// Refuses to run unless every target is the staging project. Prints no secrets.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import pg from "pg";
import { requireStagingTarget, STAGING_REFS, PRODUCTION_REFS } from "./_target-guard.mjs";

const SCRIPT = "legacy-mineex-live-test";
const OLD_COMMIT = "9dfafd7";
const ARGV = process.argv.slice(2);
const FIXED = ARGV.includes("--fixed");
const SERVICE_MODE = !ARGV.includes("--no-service");
const SHOW_INVENTORY = ARGV.includes("--inventory");
const VERBOSE = ARGV.includes("--verbose");
const ROOT = process.cwd();

// ------------------------------------------------------------------ targets --
const readEnvFile = (f) => fs.existsSync(f)
  ? Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }))
  : {};
const iso = readEnvFile("supabase/staging/.isolation-env");
const apiEnv = readEnvFile("supabase/staging/.api-env");
const SB = requireStagingTarget(iso.ISOLATION_SUPABASE_URL, SCRIPT);
const refuse = (why) => { console.error(`\n  ${SCRIPT}: REFUSING -- ${why}\n`); process.exit(2); };
if (String(apiEnv.VITE_SUPABASE_URL || "").replace(/\/+$/, "") !== SB) refuse("supabase/staging/.api-env does not name the same staging project");
const ANON = iso.ISOLATION_ANON_KEY;
const SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY;
if (!ANON || !SERVICE) refuse("staging anon key or STAGING_SUPABASE_SERVICE_ROLE_KEY missing");
const DSN = fs.existsSync("supabase/staging/.connection") ? fs.readFileSync("supabase/staging/.connection", "utf8").trim() : "";
if (!DSN || !STAGING_REFS.some((r) => DSN.includes(r)) || PRODUCTION_REFS.some((r) => DSN.includes(r))) refuse("supabase/staging/.connection is not the staging database");

const RUN = crypto.randomUUID().slice(0, 8);
const MARK = `[legacy-live ${RUN}]`;
const T = (s) => `${MARK} ${s}`;
const LEAD_EMAIL = `legacy-live+${RUN}@staging.invalid`;
const enc = encodeURIComponent;
const A = { id: iso.ISOLATION_COMPANY_A_ID, slug: iso.ISOLATION_COMPANY_A_SLUG };
const B = { id: iso.ISOLATION_COMPANY_B_ID, slug: iso.ISOLATION_COMPANY_B_SLUG };
const CONV_A = iso.ISOLATION_CONVERSATION_A;

// ------------------------------------------------------------ known breaks --
const KNOWN = {
  K1: "anon INSERT into demo_bookings / contact_submissions refused -- 0058_close_public_insert (held for production)",
  K2: "old /api/messages investor send: conversations?on_conflict=investor_id,company_slug -> 42P10 -- 0063_company_initiated_threads",
};
// Deferred for production (scripts/_migration-manifest.mjs DEFERRED): a break that
// only this migration causes is a staging-only divergence.
const DEFERRED_MIGRATIONS = { "0061b": "0061b_companies_column_grants (deferred: anon gets column grants on companies without owner_id / preview_token, so select=* and owner_id fail for anon)" };

// ------------------------------------------------------------------ http ----
const short = (b) => (typeof b === "string" ? b : JSON.stringify(b ?? "")).replace(/\s+/g, " ").slice(0, 170);
async function http(url, { method = "GET", headers = {}, body } = {}) {
  const init = { method, headers };
  if (body !== undefined) init.body = (typeof body === "string" || body instanceof Uint8Array) ? body : JSON.stringify(body);
  const r = await fetch(url, init);
  const text = await r.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: r.status, body: json, headers: r.headers, text };
}
const H = (who) => (who ? { apikey: ANON, Authorization: `Bearer ${who.token}` } : { apikey: ANON, Authorization: `Bearer ${ANON}` });
const rest = (who, method, p, body, extra = {}) =>
  http(`${SB}/rest/v1/${p}`, { method, headers: { ...H(who), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...extra }, body });
const rpc = (who, fn, body) => rest(who, "POST", `rpc/${fn}`, body ?? {});
const svc = (method, p, body, extra = {}) =>
  http(`${SB}/rest/v1/${p}`, { method, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...extra }, body });
const svcRows = async (p) => { const r = await svc("GET", p); if (r.status !== 200) throw new Error(`service read ${p.split("?")[0]} ${r.status} ${short(r.body)}`); return r.body; };
const storage = (who, method, p, body, extra = {}) =>
  http(`${SB}/storage/v1/${p}`, { method, headers: { ...H(who), ...extra }, body });
const svcStorageDelete = (bucket, names) =>
  http(`${SB}/storage/v1/object/${bucket}`, { method: "DELETE", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: { prefixes: names } });
const ok2 = (r) => r && r.status >= 200 && r.status < 300;
const d = (r) => `${r.status} ${short(r.body)}`;
const code = (r) => (r && r.body && typeof r.body === "object" && !Array.isArray(r.body) ? r.body.code || r.body.error || "" : "");
// jsonb reorders object keys, so compare canonically.
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
// Is a database function / policy rule defined by ANY migration file? (pre-existing vs pending)
const MIGRATIONS = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
const definedIn = (re) => MIGRATIONS.filter((f) => re.test(fs.readFileSync(path.join("supabase/migrations", f), "utf8")));
const PENDING = /^(0058|006\d|007\d|008\d|009[0-3])/;   // not yet on production (0059, 0061a and 0094 are)
const pendingFiles = (files) => files.filter((f) => PENDING.test(f) && !/^0061a/.test(f));

// ------------------------------------------------------------- database ----
let pgc = null;
async function sql(q, params = []) {
  if (!pgc) {
    pgc = new pg.Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
    await pgc.connect();
    await pgc.query("set default_transaction_read_only = on");   // catalog probes only; writes go through PostgREST
  }
  return (await pgc.query(q, params)).rows;
}

// ---------------------------------------------------------------- results ---
const results = [];
const cover = new Map();        // site -> [check ids]
const counts = { pass: 0, changed: 0, preexist: 0, fail: 0, known: 0, deferred: 0 };
const ICON = { PASS: "✓", CHANGED: "~", PREEXIST: "=", BREAK: "✗", KNOWN: "!", DEFERRED: "-", UNEXPECTED: "?" };
function addCover(site, id) { if (!cover.has(site)) cover.set(site, []); cover.get(site).push(id); }

/**
 * def: { id, area, at: [file:line], role, call, known?: "K1", }
 * fn returns { ok, detail, changed?: "how", migration?: "00xx", deferred?: "0061b",
 *              preexisting?: "why" }   -- a refusal that production gives today too
 *                                         (the rule predates every pending migration)
 */
async function check(def, fn) {
  for (const s of def.at || []) addCover(s, def.id);
  let r;
  try { r = await fn(); } catch (e) { r = { ok: false, detail: `threw: ${String(e && e.message).slice(0, 200)}` }; }
  if (!r.ok && r.preexisting) r.ok = true;
  let outcome = r.ok ? (r.preexisting ? "PREEXIST" : r.changed ? "CHANGED" : "PASS") : "BREAK";
  let counted;
  if (def.known) {
    if (FIXED) counted = r.ok ? (r.changed ? "changed" : "pass") : "fail";
    else if (!r.ok) { outcome = "KNOWN"; counted = "known"; }
    else { outcome = "UNEXPECTED"; counted = "fail"; r.detail = `${r.detail || ""} -- known break ${def.known} no longer reproduces; if the fix is on staging run with --fixed`; }
  } else if (!r.ok && r.deferred) { outcome = "DEFERRED"; counted = "deferred"; }
  else counted = r.ok ? (r.preexisting ? "preexist" : r.changed ? "changed" : "pass") : "fail";
  if (counted === "changed" || counted === "preexist") counts.pass++;
  counts[counted]++;
  const where = (def.at && def.at[0]) ? def.at[0].replace(/^src\//, "") + (def.at.length > 1 ? ` +${def.at.length - 1}` : "") : "";
  const note = [
    r.preexisting ? `same on production (not a pending migration): ${r.preexisting}` : "",
    r.changed ? `CHANGED: ${r.changed}` : "",
    r.migration ? `migration ${r.migration}` : "",
    r.deferred ? `staging-only: ${DEFERRED_MIGRATIONS[r.deferred] || r.deferred}` : "",
    def.known ? `known ${def.known}: ${KNOWN[def.known]}` : "",
  ].filter(Boolean).join(" · ");
  const line = `  ${ICON[outcome]} ${outcome.padEnd(8)} ${def.id.padEnd(5)} ${def.role.padEnd(10)} ${def.call}  [${where}]`;
  const tail = `      ${r.detail || ""}${note ? `${r.detail ? " | " : ""}${note}` : ""}`;
  const bad = counted === "fail";
  (bad ? console.error : console.log)(line);
  if (bad || VERBOSE || outcome !== "PASS") (bad ? console.error : console.log)(tail);
  results.push({ ...def, outcome, counted, ...r });
}
const section = (s) => console.log(`\n  ${s}`);

// --------------------------------------------------------------- cleanup ----
const cleanups = [];
const onCleanup = (label, fn) => cleanups.push({ label, fn });
let harness = null;
async function runCleanups() {
  const problems = [];
  for (const c of cleanups.reverse()) {
    try {
      const out = await c.fn();
      for (const r of [].concat(out || [])) if (r && r.status && r.status >= 300) problems.push(`${c.label}: ${d(r)}`);
    } catch (e) { problems.push(`${c.label}: ${e.message}`); }
  }
  cleanups.length = 0;
  return problems;
}

// --------------------------------------------------------- old-API harness ---
function setupHarness() {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-mineex-"));
  const OLD = path.join(TMP, "old-site");
  const h = { TMP, OLD, servers: [] };
  harness = h;
  execFileSync("git", ["worktree", "add", "--detach", OLD, OLD_COMMIT], { stdio: "ignore" });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(OLD, "node_modules"));
  let src = fs.readFileSync(path.join(ROOT, "scripts/staging-api-server.mjs"), "utf8");
  const sub = (a, b) => {
    const n = src.split(a).length - 1;
    if (n !== 1) throw new Error(`harness transform: expected exactly 1 match for ${JSON.stringify(a.slice(0, 60))}, found ${n} (scripts/staging-api-server.mjs changed?)`);
    src = src.replace(a, () => b);
  };
  sub(`const ROOT = process.cwd();`,
    `const ROOT = process.cwd();\n` +
    `// legacy harness: only what mineex.ca's Vercel project has (+ the staging service key in LEGACY_SERVICE mode)\n` +
    `const legacyVars = (fv) => ({ VITE_SUPABASE_URL: fv.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: fv.VITE_SUPABASE_ANON_KEY, OLD_API_DIR: process.env.OLD_API_DIR,\n` +
    `  ...(process.env.LEGACY_SERVICE === "1" ? { LEGACY_SERVICE: "1", STAGING_SUPABASE_SERVICE_ROLE_KEY: fv.STAGING_SUPABASE_SERVICE_ROLE_KEY } : {}) });`);
  sub(`    ...fileVars,\n`, `    ...legacyVars(fileVars),\n`);
  sub(`STAGING_EGRESS_LOG: fileVars.STAGING_EGRESS_LOG || "",`, `STAGING_EGRESS_LOG: "",`);
  sub(`const API = path.join(ROOT, "api");`, `const API = process.env.OLD_API_DIR;`);
  sub(`if (!IS_STAGING || !egress.EGRESS_INSTALLED) { console.error("  refusing: not a guarded staging process"); process.exit(2); }`,
    `if (!IS_STAGING || !egress.EGRESS_INSTALLED) { console.error("  refusing: not a guarded staging process"); process.exit(2); }\n` +
    `  // The tripwire has validated STAGING_SUPABASE_SERVICE_ROLE_KEY as a staging key; the OLD _service.js reads the old name.\n` +
    `  if (process.env.LEGACY_SERVICE === "1") process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;`);
  fs.writeFileSync(path.join(TMP, "old-api-server.mjs"), src);
  return h;
}
async function startOldApi(service) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const child = spawn(process.execPath, [path.join(harness.TMP, "old-api-server.mjs"), "--port", String(port)], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || "/tmp", OLD_API_DIR: path.join(harness.OLD, "api"), LEGACY_SERVICE: service ? "1" : "0" },
  });
  const srv = { url: `http://127.0.0.1:${port}`, child, log: "" , service };
  child.stdout.on("data", (x) => { srv.log += x; });
  child.stderr.on("data", (x) => { srv.log += x; });
  harness.servers.push(srv);
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${srv.url}/__staging/egress`).then((r) => r.ok).catch(() => false)) return srv;
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`old API server (${service ? "service" : "prod-faithful"}) did not start: ${srv.log.slice(0, 400)}`);
}
function teardownHarness() {
  if (!harness) return;
  for (const s of harness.servers) { try { s.child.kill("SIGTERM"); } catch {} }
  try { fs.unlinkSync(path.join(harness.OLD, "node_modules")); } catch {}
  try { execFileSync("git", ["worktree", "remove", "--force", harness.OLD], { cwd: ROOT, stdio: "ignore" }); } catch {}
  try { fs.rmSync(harness.TMP, { recursive: true, force: true }); } catch {}
  harness = null;
}
process.on("exit", teardownHarness);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { teardownHarness(); process.exit(130); });

/** Call an old /api route; returns the response plus how many staging-DB requests it made. */
async function oldApi(srv, route, { who = null, body, method = "POST", query = "" } = {}) {
  await http(`${srv.url}/__staging/egress`, { method: "POST" });
  const headers = { "content-type": "application/json" };
  if (who) headers.authorization = `Bearer ${who.token}`;
  const r = await http(`${srv.url}/api/${route}${query}`, { method, headers, body: method === "GET" ? undefined : (body ?? {}) });
  const log = ((await http(`${srv.url}/__staging/egress`)).body || {}).log || [];
  r.dbCalls = log.filter((e) => String(e.host || "").startsWith(STAGING_REFS[0])).length;
  r.outside = log.filter((e) => !String(e.host || "").startsWith(STAGING_REFS[0]) && e.reason !== "self");
  return r;
}

// git grep over the old commit; [] when nothing matches (git exits 1).
function grepOld(fixed) {
  try { return execFileSync("git", ["grep", "-n", "-F", fixed, OLD_COMMIT, "--", "src", "api"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean); }
  catch (e) { if (e.status === 1) return []; throw e; }
}

// ------------------------------------------------------------- inventory ----
// The call-site enumeration. Same regex the report used; comments, function
// declarations and hard-coded public image URLs are not calls.
function enumerateSites() {
  const out = execFileSync("git", ["grep", "-n", "-P",
    "/rest/v1/|/storage/v1/object/(?!public/)|/storage/v1/object/sign|[\"'`(]\\s*/api/[a-z-]+|\\$\\{API_BASE\\}/api/|serviceRest\\(|serviceRpc\\(|db\\.(getJson|write|rpc)\\(",
    OLD_COMMIT, "--", "src", "api"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\n").filter(Boolean)
    .map((l) => l.replace(`${OLD_COMMIT}:`, ""))
    .filter((l) => !/^[^:]+:\d+:\s*(\/\/|\*|\/\*)/.test(l) && !/export (async )?function|https:\/\/rvptronniomlqumjhyrr/.test(l))
    .map((l) => { const [f, n, ...rest] = l.split(":"); return { site: `${f}:${n}`, text: rest.join(":").trim() }; });
}
// Sites covered by a RULE rather than a live call, with the reason.
const RULES = [
  { re: /^api\/.*(serviceRest|serviceRpc|db\.(getJson|write|rpc))\(/, id: "R-SVC",
    why: "service-role call: mineex.ca has no SUPABASE_SERVICE_ROLE_KEY, so every route using it returns 500 before reaching the database (route sweep X-*). On-conflict targets are checked against the staging catalog (X-OC); messages/contact/conference/publish/unpublish run live in --service mode (S-*)." },
  { re: /^api\/_service\.js:(26|32):/, id: "R-SVC", why: "service-role REST/RPC transport (see R-SVC)" },
];

// =============================================================== main ======
const who = {};
let failedSetup = null;
try {
  console.log(`\n  legacy mineex.ca (${OLD_COMMIT}) against staging ${new URL(SB).host.split(".")[0]} · run ${RUN}${FIXED ? " · --fixed" : ""}${SERVICE_MODE ? "" : " · --no-service"}`);

  // ------------------------------------------------------------ identities --
  const signIn = async (key) => {
    const r = await http(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
      body: { email: iso[`ISOLATION_${key}_EMAIL`], password: iso[`ISOLATION_${key}_PASS`] } });
    return r.status === 200 ? { token: r.body.access_token, id: r.body.user.id, key } : null;
  };
  for (const k of ["INVESTOR", "INVESTOR_B", "COMPANY_A", "COMPANY_B", "STAFF", "EDITOR", "ADMIN", "PUBLISHER"]) who[k] = await signIn(k);
  const missing = Object.entries(who).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`could not sign in: ${missing.join(", ")} -- run scripts/seed-isolation-fixtures.mjs`);

  // ----------------------------------------------------------- old /api -----
  setupHarness();
  const OLDAPI = await startOldApi(false);
  const OLDSVC = SERVICE_MODE ? await startOldApi(true) : null;
  console.log(`  old /api harness: ${OLD_COMMIT} worktree, prod-faithful env${OLDSVC ? " + service-key server" : ""}`);

  // ------------------------------------------------------------- fixtures ---
  const pubPost = (await rest(null, "GET", "posts?removed_at=is.null&select=id,company_id,published_at&order=published_at.desc&limit=1")).body?.[0] || null;
  const newsRow = (await rest(null, "GET", "news_public?select=id,title&order=published_at.desc&limit=1")).body?.[0] || null;
  const A_ROW = (await svcRows(`companies?id=eq.${A.id}&select=id,slug,name,status,owner_id,tier,profile,preview_token,updated_at`))[0];
  if (!A_ROW) throw new Error("fixture company A not found");
  const fixtureProfileA = A_ROW.profile;
  // Every fixture write below re-sends A's own profile; this proves it is unchanged at the end.
  onCleanup("company A profile unchanged", async () => {
    const now = (await svcRows(`companies?id=eq.${A.id}&select=profile,status,owner_id`))[0];
    if (!same(now.profile, fixtureProfileA) || now.status !== A_ROW.status || now.owner_id !== A_ROW.owner_id) {
      const r = await svc("PATCH", `companies?id=eq.${A.id}`, { profile: fixtureProfileA, status: A_ROW.status }, { Prefer: "return=minimal" });
      return { status: 599, body: `company A drifted during the run and was restored (${r.status})` };
    }
  });

  // ======================================================== MARKETING =====
  section("MARKETING FORMS (anon, mineex.ca / and /site/legacy)");
  onCleanup("demo_bookings test rows", () => svc("DELETE", `demo_bookings?email=eq.${enc(LEAD_EMAIL)}`));
  onCleanup("contact_submissions test rows", () => svc("DELETE", `contact_submissions?email=eq.${enc(LEAD_EMAIL)}`));
  const leadIns = async (table, row) => {
    const r = await rest(null, "POST", table, row, { Prefer: "return=minimal" });
    return ok2(r) ? { ok: true, detail: `${r.status}` } : { ok: false, detail: d(r), migration: "0058_close_public_insert" };
  };
  await check({ id: "M1", area: "marketing", at: ["src/marketing/sections/Close.jsx:229"], role: "anon", call: "homepage LeadForm: POST demo_bookings {company,name,email,notes}", known: "K1" },
    () => leadIns("demo_bookings", { company: `Legacy Live ${RUN}`, name: "Legacy Live", email: LEAD_EMAIL, notes: T("homepage lead form") }));
  await check({ id: "M2", area: "marketing", at: ["src/site/Site.jsx:11"], role: "anon", call: "/site/legacy Book a demo: POST demo_bookings {company,name,email,phone,country,preferred_date,preferred_time,notes}", known: "K1" },
    () => leadIns("demo_bookings", { company: `Legacy Live ${RUN}`, name: "Legacy Live", email: LEAD_EMAIL, phone: "+1 555 0100", country: "Canada", preferred_date: "2026-12-01", preferred_time: "10:00", notes: T("site demo") }));
  await check({ id: "M3", area: "marketing", at: ["src/site/Site.jsx:11"], role: "anon", call: "/site/legacy Contact: POST contact_submissions {name,email,company,message}", known: "K1" },
    () => leadIns("contact_submissions", { name: "Legacy Live", email: LEAD_EMAIL, company: `Legacy Live ${RUN}`, message: T("site contact") }));
  const apiLead = async (srv, route, extra) => {
    const r = await oldApi(srv, route, { body: { name: "Legacy Live", email: LEAD_EMAIL, company: `Legacy Live ${RUN}`, message: T(route), ...extra } });
    if (r.status === 200 && r.body && r.body.ok && r.body.stored) return { ok: true, detail: `200 stored=${r.body.stored} emailed=${r.body.emailed}` };
    return { ok: false, detail: `${d(r)} (anon fallback insert into demo_bookings refused -> stored:false; no Postmark on mineex.ca -> 502)`, migration: "0058_close_public_insert" };
  };
  await check({ id: "M4", area: "marketing", at: ["src/marketing/home2/ContactPage.jsx:77", "api/contact.js:74"], role: "anon", call: "Contact page -> old /api/contact (anon fallback insert demo_bookings)", known: "K1" },
    () => apiLead(OLDAPI, "contact", { plan: "pro", phone: "", ticker: "" }));
  await check({ id: "M5", area: "marketing", at: ["src/marketing/home2/ConferenceInquiry.jsx:48", "api/conference-inquiry.js:70"], role: "anon", call: "Conference inquiry -> old /api/conference-inquiry (anon fallback insert demo_bookings)", known: "K1" },
    () => apiLead(OLDAPI, "conference-inquiry", { conference: "PDAC", timeframe: "2027", interest: "standard" }));

  // ===================================================== INVESTOR APP =====
  section("INVESTOR WEB APP (/app: src/main.jsx, src/aiBrief, src/lib/feed|news|notifications|push|auth)");
  const DIR_COLS = "slug,name,primary_ticker,updated_at,co:profile->pp->COMPANY,brand:profile->brand,cap:profile->capital,tier:profile->pp->TIER,brief:profile->pp->LISTING_BRIEF,ctier:tier";
  await check({ id: "I1", area: "investor", at: ["src/main.jsx:821"], role: "anon", call: "directory: GET companies?status=eq.published&select=<DIR_COLS>,pr:...&order=name" }, async () => {
    const a = await rest(null, "GET", `companies?status=eq.published&select=${DIR_COLS.replace(",ctier:tier", "")},pr:profile->pp->PR_YEARS,ctier:tier&order=name`);
    const b = await rest(null, "GET", `companies?status=eq.published&select=${DIR_COLS}&order=name`);
    return ok2(a) && ok2(b) && Array.isArray(a.body) && a.body.length > 0 ? { ok: true, detail: `200 ${a.body.length} companies (both column sets)` } : { ok: false, detail: `${d(a)} / ${d(b)}` };
  });
  await check({ id: "I2", area: "investor", at: ["src/main.jsx:843", "src/lib/supabase.js:33", "src/portal/EditorDemo.jsx:24", "src/portal/PortalDemo.jsx:16"], role: "anon", call: "rpc get_preview_company {p_slug,p_token} (preview link)" }, async () => {
    const good = await rpc(null, "get_preview_company", { p_slug: A.slug, p_token: A_ROW.preview_token });
    const bad = await rpc(null, "get_preview_company", { p_slug: A.slug, p_token: crypto.randomUUID() });   // p_token is uuid-typed (a non-uuid answers 400 on production too)
    const okGood = ok2(good) && good.body && good.body.slug === A.slug && good.body.profile;
    return okGood && ok2(bad) && !(bad.body && bad.body.slug) ? { ok: true, detail: "200 row with the right token, none with a wrong one" } : { ok: false, detail: `${d(good)} / ${d(bad)}` };
  });
  await check({ id: "I3", area: "investor", at: ["src/main.jsx:860"], role: "anon", call: "company page signed OUT: GET companies?slug&select=id,tier,owner_id,pp:profile->pp,projects:profile->projects" }, async () => {
    const r = await rest(null, "GET", `companies?slug=eq.${enc(A.slug)}&select=id,tier,owner_id,pp:profile->pp,projects:profile->projects`);
    if (ok2(r) && r.body[0]) return { ok: true, detail: "200" };
    return { ok: false, detail: d(r), deferred: r.status === 401 || code(r) === "42501" ? "0061b" : undefined };
  });
  await check({ id: "I4", area: "investor", at: ["src/main.jsx:860"], role: "investor", call: "company page signed IN: same select with the user token" }, async () => {
    const r = await rest(who.INVESTOR, "GET", `companies?slug=eq.${enc(A.slug)}&select=id,tier,owner_id,pp:profile->pp,projects:profile->projects`);
    return ok2(r) && r.body[0] && r.body[0].id === A.id ? { ok: true, detail: "200" } : { ok: false, detail: d(r) };
  });
  await check({ id: "I5", area: "investor", at: ["src/main.jsx:883"], role: "editor A", call: "GET company_memberships?company_id&user_id&status=eq.active&select=role" }, async () => {
    const r = await rest(who.EDITOR, "GET", `company_memberships?company_id=eq.${A.id}&user_id=eq.${who.EDITOR.id}&status=eq.active&select=role&limit=1`);
    return ok2(r) && r.body[0] && r.body[0].role ? { ok: true, detail: `200 role=${r.body[0].role}` } : { ok: false, detail: d(r) };
  });
  await check({ id: "I6", area: "investor", at: ["src/main.jsx:729", "src/lib/feed.js:104"], role: "anon", call: "GET posts?company_id&removed_at=is.null&select=...&order=published_at.desc" }, async () => {
    const cid = pubPost ? pubPost.company_id : A.id;
    const a = await rest(null, "GET", `posts?company_id=eq.${cid}&removed_at=is.null&select=post_type,title,summary,media_url,thumbnail_url,published_at&order=published_at.desc&limit=60`);
    const b = await rest(null, "GET", `posts?company_id=eq.${cid}&removed_at=is.null&select=*&order=published_at.desc&limit=20`);
    return ok2(a) && ok2(b) ? { ok: true, detail: `200 (${a.body.length} posts)` } : { ok: false, detail: `${d(a)} / ${d(b)}` };
  });
  await check({ id: "I7", area: "investor", at: ["src/lib/supabase.js:17"], role: "anon", call: "fetchCompany: GET companies?slug&select=*&limit=1 (PassportProto.jsx:8380/12541, aiBrief/App.jsx:49)" }, async () => {
    const r = await rest(null, "GET", `companies?slug=eq.${enc(A.slug)}&select=*&limit=1`);
    if (ok2(r) && r.body[0]) return { ok: true, detail: "200" };
    return { ok: false, detail: d(r), deferred: r.status === 401 || code(r) === "42501" ? "0061b" : undefined };
  });
  await check({ id: "I8", area: "investor", at: ["src/lib/feed.js:119"], role: "anon", call: "companiesInfo: GET companies?id=in.(...)&select=...,brand:profile->brand,commodity:...->>commodity" }, async () => {
    const r = await rest(null, "GET", `companies?id=in.(${A.id},${B.id})&select=id,slug,name,primary_ticker,tier,brand:profile->brand,commodity:profile->pp->COMPANY->>commodity,jurisdiction:profile->pp->COMPANY->>jurisdiction`);
    return ok2(r) ? { ok: true, detail: `200 (${r.body.length})` } : { ok: false, detail: d(r) };
  });
  await check({ id: "I9", area: "investor", at: ["src/lib/feed.js:149"], role: "anon", call: "getPost: GET posts?id=eq&select=*" }, async () => {
    if (!pubPost) return { ok: true, detail: "no live post on staging; query shape only", changed: undefined };
    const r = await rest(null, "GET", `posts?id=eq.${pubPost.id}&select=*&limit=1`);
    return ok2(r) && r.body[0] ? { ok: true, detail: "200" } : { ok: false, detail: d(r) };
  });
  await check({ id: "I10", area: "investor", at: ["src/lib/feed.js:164"], role: "investor", call: "countNewSince: GET posts?removed_at=is.null&published_at=gt...&select=id (count=exact, Range 0-0)" }, async () => {
    const r = await rest(who.INVESTOR, "GET", `posts?removed_at=is.null&published_at=gt.${enc("2000-01-01T00:00:00Z")}&select=id&company_id=in.(${A.id},${B.id})`, undefined, { Prefer: "count=exact", Range: "0-0" });
    const cr = r.headers.get("content-range");
    return ok2(r) && cr && cr.includes("/") ? { ok: true, detail: `${r.status} content-range ${cr}` } : { ok: false, detail: d(r) };
  });
  for (const [fn, body, anonToo] of [["feed_following", { p_limit: 5, p_before: null }, false], ["feed_latest", { p_limit: 5, p_before: null }, true], ["feed_discover", { p_limit: 5, p_offset: 0 }, true]]) {
    await check({ id: `I11${fn.slice(5, 6)}`, area: "investor", at: ["src/lib/feed.js:84"], role: anonToo ? "inv+anon" : "investor", call: `rpc ${fn} ${JSON.stringify(body)}` }, async () => {
      const a = await rpc(who.INVESTOR, fn, body);
      const b = anonToo ? await rpc(null, fn, body) : { status: 200, body: [] };
      return ok2(a) && Array.isArray(a.body) && ok2(b) ? { ok: true, detail: `200 (${a.body.length} rows)` } : { ok: false, detail: `${d(a)} / ${d(b)}` };
    });
  }
  await check({ id: "I12", area: "investor", at: ["src/lib/feed.js:57", "src/lib/portal.js:46", "src/lib/portal.js:208"], role: "anon+owner", call: "rpc company_follower_count {cid}" }, async () => {
    const a = await rpc(null, "company_follower_count", { cid: A.id });
    const b = await rpc(who.COMPANY_A, "company_follower_count", { cid: A.id });
    return ok2(a) && ok2(b) && typeof b.body === "number" ? { ok: true, detail: `200 ${b.body}` } : { ok: false, detail: `${d(a)} / ${d(b)}` };
  });
  await check({ id: "I13", area: "investor", at: ["src/lib/news.js:29"], role: "anon", call: "GET news_public?select=*&published_at=gte...&order=published_at.desc" }, async () => {
    const r = await rest(null, "GET", `news_public?select=*&published_at=gte.${enc(new Date(Date.now() - 30 * 86400000).toISOString())}&order=published_at.desc&limit=20`);
    return ok2(r) ? { ok: true, detail: `200 (${r.body.length})` } : { ok: false, detail: d(r) };
  });
  await check({ id: "I14", area: "investor", at: ["src/lib/auth.js:214"], role: "investor", call: "getMyRole: GET profiles?id=eq.<me>&select=role" }, async () => {
    const r = await rest(who.INVESTOR, "GET", `profiles?id=eq.${who.INVESTOR.id}&select=role`);
    return ok2(r) && r.body[0] && r.body[0].role ? { ok: true, detail: `200 role=${r.body[0].role}` } : { ok: false, detail: d(r) };
  });

  // follow / unfollow on a pair with NO existing row, so no fixture row is touched
  {
    let pair = null;
    for (const u of [who.INVESTOR_B, who.INVESTOR]) for (const c of [B, A]) {
      if (pair) break;
      const ex = await svcRows(`company_follows?user_id=eq.${u.id}&company_id=eq.${c.id}&select=id`);
      if (!ex.length) pair = { u, c };
    }
    if (pair) onCleanup("company_follows test pair", () => svc("DELETE", `company_follows?user_id=eq.${pair.u.id}&company_id=eq.${pair.c.id}`));
    await check({ id: "I15", area: "investor", at: ["src/lib/feed.js:23", "src/lib/feed.js:47", "src/lib/feed.js:72", "src/lib/feed.js:37"], role: "investor", call: "follow (POST company_follows merge-duplicates) -> isFollowing -> myFollowedIds -> unfollow (DELETE)" }, async () => {
      if (!pair) return { ok: false, detail: "no free (investor, company) pair to test on without touching a fixture row" };
      const { u, c } = pair;
      const f1 = await rest(u, "POST", "company_follows", { user_id: u.id, company_id: c.id }, { Prefer: "resolution=merge-duplicates,return=minimal" });
      const f2 = await rest(u, "POST", "company_follows", { user_id: u.id, company_id: c.id }, { Prefer: "resolution=merge-duplicates,return=minimal" });
      const is = await rest(u, "GET", `company_follows?user_id=eq.${u.id}&company_id=eq.${c.id}&select=id&limit=1`);
      const mine = await rest(u, "GET", `company_follows?user_id=eq.${u.id}&select=company_id`);
      const un = await rest(u, "DELETE", `company_follows?user_id=eq.${u.id}&company_id=eq.${c.id}`);
      const left = await svcRows(`company_follows?user_id=eq.${u.id}&company_id=eq.${c.id}&select=id`);
      const detail = `follow ${f1.status}, re-follow ${f2.status}${ok2(f2) ? "" : ` ${code(f2)}`}, isFollowing ${is.body && is.body.length}, ids ${mine.status}, unfollow ${un.status}, rows left ${left.length}`;
      if (!(ok2(f1) && ok2(is) && is.body.length === 1 && ok2(mine) && mine.body.some((x) => x.company_id === c.id) && ok2(un) && left.length === 0)) return { ok: false, detail };
      // A re-follow of an existing row: PK is id, so merge-duplicates without on_conflict resolves on id and the
      // (user_id, company_id) unique key answers 409. Same schema on production (0061a + 0094 applied there).
      return { ok: true, detail: `${detail}${ok2(f2) ? "" : " (re-follow of an already-followed company answers 409 -- same on production, old follow() then reports false)"}` };
    });
  }

  // post_events
  await check({ id: "I16", area: "investor", at: ["src/lib/feed.js:184"], role: "investor", call: "recordPostEvent: POST post_events {post_id,user_id,kind:'open'|'dwell',value}" }, async () => {
    if (!pubPost) return { ok: false, detail: "no live post on staging to record an event against" };
    const since = new Date(Date.now() - 5000).toISOString();
    onCleanup("post_events test rows", () => svc("DELETE", `post_events?user_id=eq.${who.INVESTOR.id}&post_id=eq.${pubPost.id}&created_at=gte.${enc(since)}&kind=in.(open,dwell)`));
    const a = await rest(who.INVESTOR, "POST", "post_events", { post_id: pubPost.id, user_id: who.INVESTOR.id, kind: "open", value: null }, { Prefer: "return=minimal" });
    const b = await rest(who.INVESTOR, "POST", "post_events", { post_id: pubPost.id, user_id: who.INVESTOR.id, kind: "dwell", value: 4200 }, { Prefer: "return=minimal" });
    return ok2(a) && ok2(b) ? { ok: true, detail: `${a.status}/${b.status}` } : { ok: false, detail: `${d(a)} / ${d(b)}` };
  });

  // notifications (fixture rows: snapshot read_at, restore afterwards)
  {
    const before = await svcRows(`notifications?user_id=eq.${who.INVESTOR.id}&select=id,read_at`);
    onCleanup("notifications read_at restored", async () => {
      for (const n of before) await svc("PATCH", `notifications?id=eq.${n.id}`, { read_at: n.read_at }, { Prefer: "return=minimal" });
      const now = await svcRows(`notifications?user_id=eq.${who.INVESTOR.id}&select=id,read_at`);
      if (!before.every((b) => now.some((n) => n.id === b.id && n.read_at === b.read_at))) return { status: 599, body: "notifications read_at not restored" };
    });
    await check({ id: "I17", area: "investor", at: ["src/lib/notifications.js:11", "src/lib/notifications.js:21"], role: "investor", call: "GET notifications?select=...&order=created_at.desc; unread count (count=exact)" }, async () => {
      const a = await rest(who.INVESTOR, "GET", "notifications?select=id,kind,company_id,post_id,title,body,deep_link,read_at,created_at&order=created_at.desc&limit=30");
      const b = await rest(who.INVESTOR, "GET", "notifications?read_at=is.null&select=id", undefined, { Prefer: "count=exact", Range: "0-0" });
      return ok2(a) && ok2(b) && (b.headers.get("content-range") || "").includes("/") ? { ok: true, detail: `200 (${a.body.length} rows, ${b.headers.get("content-range")})` } : { ok: false, detail: `${d(a)} / ${d(b)}` };
    });
    await check({ id: "I18", area: "investor", at: ["src/lib/notifications.js:30", "src/lib/notifications.js:37"], role: "investor", call: "markRead / markAllRead: PATCH notifications {read_at}" }, async () => {
      const one = before[0];
      const a = one ? await rest(who.INVESTOR, "PATCH", `notifications?id=eq.${one.id}`, { read_at: new Date().toISOString() }, { Prefer: "return=minimal" }) : { status: 204 };
      const b = await rest(who.INVESTOR, "PATCH", "notifications?read_at=is.null", { read_at: new Date().toISOString() }, { Prefer: "return=minimal" });
      const unread = await svcRows(`notifications?user_id=eq.${who.INVESTOR.id}&read_at=is.null&select=id`);
      return ok2(a) && ok2(b) && unread.length === 0 ? { ok: true, detail: `${a.status}/${b.status}, ${before.length} fixture notifications (restored afterwards)` } : { ok: false, detail: `${d(a)} / ${d(b)} unread left ${unread.length}` };
    });
  }
  {
    const prefQ = `notification_prefs?user_id=eq.${who.INVESTOR.id}&company_id=is.null&channel=eq.in_app`;
    const before = await svcRows(`${prefQ}&select=*`);
    onCleanup("notification_prefs restored", async () => {
      if (before[0]) return svc("PATCH", `notification_prefs?id=eq.${before[0].id}`, { muted: before[0].muted, min_materiality: before[0].min_materiality, updated_at: before[0].updated_at }, { Prefer: "return=minimal" });
      return svc("DELETE", prefQ);
    });
    await check({ id: "I19", area: "investor", at: ["src/lib/notifications.js:47", "src/lib/notifications.js:59", "src/lib/notifications.js:63", "src/lib/notifications.js:65"], role: "investor", call: "get/setGlobalPref: GET notification_prefs; POST (first time) and PATCH (existing)" }, async () => {
      const g = await rest(who.INVESTOR, "GET", `${prefQ}&select=muted,min_materiality&limit=1`);
      const ex = await rest(who.INVESTOR, "GET", `${prefQ}&select=id&limit=1`);
      let w1, w2;
      if (ex.body && ex.body[0]) {
        w1 = await rest(who.INVESTOR, "PATCH", `notification_prefs?id=eq.${ex.body[0].id}`, { muted: true, min_materiality: 50, updated_at: new Date().toISOString() }, { Prefer: "return=minimal" });
        w2 = { status: 204 };
      } else {
        w1 = await rest(who.INVESTOR, "POST", "notification_prefs", { user_id: who.INVESTOR.id, company_id: null, channel: "in_app", muted: true, min_materiality: 50 }, { Prefer: "return=minimal" });
        const id = (await svcRows(`${prefQ}&select=id`))[0]?.id;
        w2 = id ? await rest(who.INVESTOR, "PATCH", `notification_prefs?id=eq.${id}`, { muted: false, min_materiality: 0, updated_at: new Date().toISOString() }, { Prefer: "return=minimal" }) : { status: 500, body: "no row after POST" };
      }
      return ok2(g) && ok2(ex) && ok2(w1) && ok2(w2) ? { ok: true, detail: `${g.status}/${w1.status}/${w2.status}` } : { ok: false, detail: `${d(g)} / ${d(w1)} / ${d(w2)}` };
    });
  }
  await check({ id: "I20", area: "investor", at: ["src/lib/push.js:57", "src/lib/push.js:38"], role: "investor", call: "rpc claim_push_token {p_token,p_platform} then release_push_token {p_token}" }, async () => {
    const tok = `legacy-live-${RUN}`;
    onCleanup("push token", () => svc("DELETE", `push_tokens?token=eq.${enc(tok)}`));
    const a = await rpc(who.INVESTOR, "claim_push_token", { p_token: tok, p_platform: "web" });
    const mid = await svcRows(`push_tokens?token=eq.${enc(tok)}&select=user_id`);
    const b = await rpc(who.INVESTOR, "release_push_token", { p_token: tok });
    const after = await svcRows(`push_tokens?token=eq.${enc(tok)}&select=user_id`);
    return ok2(a) && ok2(b) && mid.length === 1 && after.length === 0 ? { ok: true, detail: `${a.status}/${b.status} (stored, then released)` } : { ok: false, detail: `${d(a)} / ${d(b)} rows ${mid.length}->${after.length}` };
  });
  await check({ id: "I21", area: "investor", at: ["src/aiBrief/PassportProto.jsx:8829"], role: "investor", call: "inbox: GET conversations?select=id,company_slug,company_name,last_message_at" }, async () => {
    const r = await rest(who.INVESTOR, "GET", "conversations?select=id,company_slug,company_name,last_message_at&order=last_message_at.desc");
    return ok2(r) && r.body.some((c) => c.id === CONV_A) ? { ok: true, detail: `200 (${r.body.length} threads, seeded thread present)` } : { ok: false, detail: d(r) };
  });
  await check({ id: "I21c", area: "investor", at: ["src/aiBrief/PassportProto.jsx:8829"], role: "owner A", call: "same inbox query by a COMPANY account opening /app" }, async () => {
    const r = await rest(who.COMPANY_A, "GET", "conversations?select=id,company_slug,company_name,last_message_at&order=last_message_at.desc");
    if (!ok2(r)) return { ok: false, detail: d(r) };
    const all = await svcRows(`conversations?id=in.(${r.body.map((c) => c.id).join(",") || "00000000-0000-0000-0000-000000000000"})&select=id,investor_id,sender_company_id,company_slug`);
    const companyThreads = all.filter((c) => c.sender_company_id);
    const notMine = all.filter((c) => c.investor_id !== who.COMPANY_A.id);
    if (!companyThreads.length) return { ok: true, detail: `200 (${r.body.length} rows, no company-initiated threads visible)` };
    return { ok: true, detail: `200 (${r.body.length} rows: ${companyThreads.length} company-to-company, ${notMine.length} where A is the recipient)`,
      changed: "0063 adds company-initiated threads and conv_select_company; the old /app inbox lists them as if the user were the investor (titled by company_slug, own messages shown as 'me' when sender='investor'). Pre-0063 a company account saw only investor threads to its own slug.",
      migration: "0063_company_initiated_threads" };
  });
  await check({ id: "I22", area: "investor", at: ["src/aiBrief/PassportProto.jsx:8849"], role: "investor", call: "thread: GET messages?conversation_id=eq&select=id,sender,body,created_at" }, async () => {
    const r = await rest(who.INVESTOR, "GET", `messages?conversation_id=eq.${CONV_A}&select=id,sender,body,created_at&order=created_at.asc`);
    return ok2(r) && Array.isArray(r.body) ? { ok: true, detail: `200 (${r.body.length} messages)` } : { ok: false, detail: d(r) };
  });
  await check({ id: "I23", area: "investor", at: ["src/aiBrief/PassportProto.jsx:8871"], role: "investor", call: "send: POST old /api/messages {companySlug,body} -- mineex.ca env (no service key)" }, async () => {
    const r = await oldApi(OLDAPI, "messages", { who: who.INVESTOR, body: { companySlug: A.slug, body: T("prod-faithful send") } });
    // On mineex.ca today this already answers 500 service-not-configured before any database call.
    return r.status === 500 && r.body && r.body.error === "service-not-configured" && r.dbCalls === 0
      ? { ok: true, detail: "500 service-not-configured, 0 DB calls -- identical on production today (mineex.ca has no service key, so its old in-app send is already dead; schema-independent)" }
      : { ok: false, detail: `${d(r)} dbCalls=${r.dbCalls}` };
  });
  await check({ id: "I24", area: "investor", at: ["src/aiBrief/PassportProto.jsx:9775"], role: "owner A", call: "owner profile edit: GET companies?id=eq&select=profile" }, async () => {
    const r = await rest(who.COMPANY_A, "GET", `companies?id=eq.${A.id}&select=profile`);
    return ok2(r) && r.body[0] && r.body[0].profile ? { ok: true, detail: "200" } : { ok: false, detail: d(r) };
  });
  await check({ id: "I25", area: "investor", at: ["src/lib/portal.js:165"], role: "owner A", call: "updateCompanyProfile: PATCH companies?id=eq {profile} return=representation (identical profile)" }, async () => {
    const r = await rest(who.COMPANY_A, "PATCH", `companies?id=eq.${A.id}`, { profile: fixtureProfileA }, { Prefer: "return=representation" });
    return ok2(r) && r.body[0] && same(r.body[0].profile, fixtureProfileA) ? { ok: true, detail: `${r.status}` } : { ok: false, detail: d(r) };
  });
  await check({ id: "I26", area: "investor", at: ["src/aiBrief/PassportProto.jsx:9870"], role: "investor", call: "rpc delete_own_account {} (catalog probe only -- destructive)" }, async () => {
    const rows = await sql(`select p.oid::regprocedure::text sig, has_function_privilege('authenticated', p.oid, 'execute') auth_exec
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'delete_own_account'`);
    const zeroArg = rows.find((r) => r.sig === "delete_own_account()");
    return zeroArg && zeroArg.auth_exec ? { ok: true, detail: "public.delete_own_account() exists, EXECUTE granted to authenticated (not called)" } : { ok: false, detail: JSON.stringify(rows) };
  });
  {
    onCleanup("listing_reports test rows", () => svc("DELETE", `listing_reports?message=like.${enc(`${MARK}*`)}`));
    // 0093 rate-limits anon reports per client (5 / 10 min). Each run files 2, so back-to-back runs
    // can hit it: that is the new behaviour, reported as CHANGED (rerun after 10 minutes to see the insert).
    const limited = (r) => (r.status === 429 && code(r) === "PT429" ? { ok: true, detail: d(r),
      changed: "0093 rate-limits anon listing reports (per client 5 / 10 min, per network 20, global 600); past the limit the old sheet shows its error state. Hit here by earlier runs from this machine -- rerun after 10 minutes to see the insert itself.",
      migration: "0093_listing_reports_rate_limit" } : null);
    const lr = (uid) => rest(null, "POST", "listing_reports", { company_slug: A.slug, company_name: "Iso Alpha", kind: "error", message: T(`listing report uid=${uid ? "set" : "null"}`), contact: LEAD_EMAIL, user_id: uid }, { Prefer: "return=minimal" });
    await check({ id: "I27", area: "investor", at: ["src/aiBrief/PassportProto.jsx:10249"], role: "anon", call: "Report/claim listing: POST listing_reports {company_slug,company_name,kind,message,contact,user_id:null}" }, async () => {
      const r = await lr(null);
      return ok2(r) ? { ok: true, detail: `${r.status} (0077 + 0092 + 0093 re-open the anon insert after 0058)` } : limited(r) || { ok: false, detail: d(r), migration: "0058/0092/0093" };
    });
    await check({ id: "I27u", area: "investor", at: ["src/aiBrief/PassportProto.jsx:10249"], role: "anon", call: "same, signed-in investor (old code sends the ANON key with user_id = their uid)" }, async () => {
      const r = await lr(who.INVESTOR.id);
      return ok2(r) ? { ok: true, detail: `${r.status}` } : limited(r) || { ok: false, detail: d(r), migration: "0058/0092/0093" };
    });
  }
  // storage: investor-app owner avatar / contact photo, onboarding asset flush, logos
  {
    const objs = [];
    onCleanup("company-media / company-logos test objects", async () => {
      for (const [bucket, name] of objs) await svcStorageDelete(bucket, [name]);
    });
    const up = async (u, bucket) => {
      const name = `${u.id}/${Date.now()}-legacy-live-${RUN}.png`;
      objs.push([bucket, name]);
      const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
      return storage(u, "POST", `object/${bucket}/${encodeURI(name)}`, png, { "Content-Type": "image/png", "x-upsert": "true" });
    };
    await check({ id: "I28", area: "investor", at: ["src/lib/storage.js:17"], role: "owner A", call: "uploadCompanyMedia / uploadCompanyLogo: POST storage company-media|company-logos/<uid>/<ts>-name (x-upsert)" }, async () => {
      const a = await up(who.COMPANY_A, "company-media");
      const b = await up(who.COMPANY_A, "company-logos");
      return ok2(a) && ok2(b) ? { ok: true, detail: `${a.status}/${b.status}` } : { ok: false, detail: `${d(a)} / ${d(b)}`, migration: "0078_storage_role_hardening" };
    });
    await check({ id: "I28e", area: "investor", at: ["src/lib/storage.js:17"], role: "editor A", call: "same upload by a company editor (membership, not owner_id)" }, async () => {
      const a = await up(who.EDITOR, "company-media");
      return ok2(a) ? { ok: true, detail: `${a.status}` } : { ok: false, detail: d(a), migration: "0078_storage_role_hardening" };
    });
    await check({ id: "I28n", area: "investor", at: ["src/lib/storage.js:17"], role: "investor", call: "same upload by a user with NO company (e.g. an investor, or anyone before their company row exists)" }, async () => {
      const a = await up(who.INVESTOR, "company-media");
      if (ok2(a)) return { ok: true, detail: `${a.status}` };
      // Pre-0078 media_write_own only required the caller's own folder. Old onboarding creates the company
      // row (ensureCompany) before any upload, so the old UI does not reach this as a company-less user.
      return { ok: true, detail: d(a), changed: "0078 requires can_upload_company_assets() (owner / admin / editor / publisher, or platform admin); a user without a company can no longer upload to company-media|company-logos. Old UI paths upload only after the company exists (Onboarding.jsx:6383 ensureCompany first), and flushProfileAssets swallows failures.", migration: "0078_storage_role_hardening" };
    });
  }
  // og-news / share-news (anon reads in old api, work without the service key)
  await check({ id: "I29", area: "old-api", at: ["api/og-news.js:38", "api/share-news.js:61"], role: "anon", call: "news_public?id=eq&select=<og cols> / <share cols> (replica + live old handlers)" }, async () => {
    // Staging has no published news; PostgREST still validates every selected column, so an id that
    // matches nothing proves the query shape. The handlers then render their generic card.
    const id = newsRow ? newsRow.id : crypto.randomUUID();
    const a = await rest(null, "GET", `news_public?id=eq.${enc(id)}&select=title,category,commodity,source_name&limit=1`);
    const b = await rest(null, "GET", `news_public?id=eq.${enc(id)}&select=title,source_name,published_at,category,commodity,canonical_url,mineex_summary,plain_english_explanation,context,key_numbers,is_press_release&limit=1`);
    const s = await oldApi(OLDAPI, "share-news", { method: "GET", query: `?id=${enc(id)}` });
    const o = await oldApi(OLDAPI, "og-news", { method: "GET", query: `?id=${enc(id)}` });
    const rows = ok2(a) && ok2(b) && (newsRow ? a.body[0] && b.body[0] : Array.isArray(a.body) && Array.isArray(b.body));
    // og-news renders a PNG with fonts fetched from cdn.jsdelivr.net, which the staging egress guard
    // blocks; its database read happens first and is what this suite is about.
    const ogFontBlocked = o.status === 500 && o.dbCalls > 0 && o.outside.some((e) => e.action === "block" && /jsdelivr/.test(e.host || ""));
    return rows && s.status === 200 && s.dbCalls > 0 && (o.status === 200 || ogFontBlocked)
      ? { ok: true, detail: `replicas ${a.status}/${b.status}${newsRow ? "" : " (no news on staging: shape check, 0 rows)"}; share-news ${s.status} (${s.dbCalls} DB call); og-news ${o.status}${ogFontBlocked ? " after its DB read (font fetch to cdn.jsdelivr.net blocked by the staging egress guard -- harness limit, not schema)" : ""}` }
      : { ok: false, detail: `${d(a)} / ${d(b)} / share ${s.status} db=${s.dbCalls} / og ${o.status} db=${o.dbCalls} blocked=${o.outside.map((e) => e.host).join(",")}` };
  });

  // ================================================ COMPANY / ONBOARDING ===
  section("COMPANY CONSOLE · ONBOARDING · PORTAL (src/Onboarding.jsx, src/console, src/portal, src/lib/portal|memory|features|publish|profileVersions)");
  const ONB = { slug: `zz-legacy-onb-${RUN}`, name: `ZZ Legacy Onboarding ${RUN}` };
  onCleanup(`throwaway company ${ONB.slug}`, () => svc("DELETE", `companies?slug=eq.${ONB.slug}`));
  await check({ id: "C1", area: "company", at: ["src/lib/memory.js:55", "src/lib/memory.js:62", "src/lib/memory.js:70"], role: "new user", call: "ensureCompany: GET companies?slug -> POST companies {slug,name,owner_id,status:'draft'} return=representation" }, async () => {
    const look = await rest(who.INVESTOR_B, "GET", `companies?slug=eq.${enc(ONB.slug)}&select=id,slug&limit=1`);
    const ins = await rest(who.INVESTOR_B, "POST", "companies", { slug: ONB.slug, name: ONB.name, owner_id: who.INVESTOR_B.id, status: "draft" }, { Prefer: "return=representation" });
    if (ok2(ins) && ins.body[0]) ONB.id = ins.body[0].id;
    const re = await rest(who.INVESTOR_B, "GET", `companies?slug=eq.${enc(ONB.slug)}&select=id,slug&limit=1`);
    return ok2(look) && ok2(ins) && ONB.id && ok2(re) && re.body[0] ? { ok: true, detail: `${look.status}/${ins.status}/${re.status}` } : { ok: false, detail: `${d(look)} / ${d(ins)} / ${d(re)}` };
  });
  const onbProfile = { company: { name: ONB.name, website: "https://example.invalid" }, brand: {}, timeline: [], pp: { COMPANY: { name: ONB.name } }, note: T("onboarding") };
  await check({ id: "C2", area: "company", at: ["src/Onboarding.jsx:86"], role: "new user", call: "saveCompany: POST companies?on_conflict=slug {slug,name,profile,owner_id[,status]} merge-duplicates (update of own draft)" }, async () => {
    const r = await rest(who.INVESTOR_B, "POST", "companies?on_conflict=slug", { slug: ONB.slug, name: ONB.name, profile: onbProfile, owner_id: who.INVESTOR_B.id, status: "draft" }, { Prefer: "resolution=merge-duplicates,return=minimal" });
    const now = await svcRows(`companies?slug=eq.${ONB.slug}&select=profile,owner_id`);
    return ok2(r) && now[0] && same(now[0].profile, onbProfile) ? { ok: true, detail: `${r.status}, profile stored` } : { ok: false, detail: d(r) };
  });
  await check({ id: "C2b", area: "company", at: ["src/Onboarding.jsx:86"], role: "new user", call: "saveCompany first-time path: POST companies?on_conflict=slug for a NEW slug" }, async () => {
    const slug = `zz-legacy-onb2-${RUN}`;
    onCleanup(`throwaway company ${slug}`, () => svc("DELETE", `companies?slug=eq.${slug}`));
    const r = await rest(who.INVESTOR_B, "POST", "companies?on_conflict=slug", { slug, name: `ZZ Legacy Onb2 ${RUN}`, profile: onbProfile, owner_id: who.INVESTOR_B.id }, { Prefer: "resolution=merge-duplicates,return=minimal" });
    const now = await svcRows(`companies?slug=eq.${slug}&select=id,status`);
    return ok2(r) && now[0] ? { ok: true, detail: `${r.status} (status ${now[0].status})` } : { ok: false, detail: d(r) };
  });
  await check({ id: "C2x", area: "company", at: ["src/Onboarding.jsx:86"], role: "owner B", call: "saveCompany on a slug owned by ANOTHER account (expected refusal: 'name is taken')" }, async () => {
    const r = await rest(who.COMPANY_B, "POST", "companies?on_conflict=slug", { slug: A.slug, name: "hijack", profile: { x: 1 }, owner_id: who.COMPANY_B.id }, { Prefer: "resolution=merge-duplicates,return=minimal" });
    const now = await svcRows(`companies?id=eq.${A.id}&select=profile,owner_id`);
    const untouched = same(now[0].profile, fixtureProfileA) && now[0].owner_id === A_ROW.owner_id;
    return !ok2(r) && untouched ? { ok: true, detail: `${r.status} ${code(r)} refused, company A untouched (UI shows 'name is taken')` } : { ok: false, detail: `${d(r)} untouched=${untouched}` };
  });
  await check({ id: "C3", area: "company", at: ["src/Onboarding.jsx:106"], role: "new user", call: "fetchMyCompany: GET companies?owner_id=eq.<me>&select=*&limit=1" }, async () => {
    const r = await rest(who.INVESTOR_B, "GET", `companies?owner_id=eq.${who.INVESTOR_B.id}&select=*&limit=1`);
    return ok2(r) && r.body[0] ? { ok: true, detail: "200" } : { ok: false, detail: d(r) };
  });
  await check({ id: "C4", area: "company", at: ["src/Onboarding.jsx:6303"], role: "owner A", call: "edit mode: GET companies?slug&select=*&limit=1 (user token)" }, async () => {
    const r = await rest(who.COMPANY_A, "GET", `companies?slug=eq.${enc(A.slug)}&select=*&limit=1`);
    return ok2(r) && r.body[0] ? { ok: true, detail: "200" } : { ok: false, detail: d(r) };
  });

  // documents + company-docs storage (onboarding filing as the new user, portal Documents as owner A)
  {
    const docObjs = [];
    onCleanup("company-docs test objects", async () => { for (const n of docObjs) await svcStorageDelete("company-docs", [n]); });
    onCleanup("documents test rows", () => svc("DELETE", `documents?filename=like.${enc(`*legacy-live-${RUN}*`)}`));
    // memory.js:96 uploads with x-upsert: true. If that is refused, two controls isolate the cause:
    //   (1) the same path WITHOUT x-upsert (the INSERT policy alone), which also lets the
    //       documents-row checks below run; and
    //   (2) x-upsert to a fresh path AFTER a documents row already points at it -- which makes the
    //       docs_company_read SELECT policy (0037, on production) true for the new row.
    const fileDoc = async (u, companyId) => {
      const name = `${u.id}/${companyId}/${Date.now()}-legacy-live-${RUN}.txt`;
      docObjs.push(name);
      const up = await storage(u, "POST", `object/company-docs/${encodeURI(name)}`, T("document body"), { "Content-Type": "text/plain", "x-upsert": "true" });
      let control = null, preRow = null;
      if (!ok2(up)) {
        control = await storage(u, "POST", `object/company-docs/${encodeURI(name)}`, T("document body"), { "Content-Type": "text/plain" });
        const name2 = `${u.id}/${companyId}/${Date.now()}-pre-legacy-live-${RUN}.txt`;
        docObjs.push(name2);
        const row = await rest(u, "POST", "documents", { company_id: companyId, storage_path: `company-docs/${name2}`, filename: `pre-legacy-live-${RUN}.txt`, mime: "text/plain", bytes: 5, kind: "other", extraction_status: "pending", uploaded_by: u.id }, { Prefer: "return=minimal" });
        preRow = ok2(row) ? await storage(u, "POST", `object/company-docs/${encodeURI(name2)}`, "probe", { "Content-Type": "text/plain", "x-upsert": "true" }) : row;
      }
      const sha = crypto.createHash("sha256").update(name).digest("hex");
      const dup = await rest(u, "GET", `documents?company_id=eq.${companyId}&sha256=eq.${sha}&select=id&limit=1`);
      const stored = ok2(up) || ok2(control);
      const ins = stored ? await rest(u, "POST", "documents", {
        company_id: companyId, storage_path: `company-docs/${name}`, filename: `legacy-live-${RUN}.txt`, mime: "text/plain", bytes: 40, sha256: sha,
        kind: "other", doc_date: null, extracted_text: null, extraction_status: "pending", uploaded_by: u.id }, { Prefer: "return=representation" }) : { status: 0, body: "upload failed" };
      return { up, control, preRow, dup, ins, name, id: ok2(ins) && ins.body[0] ? ins.body[0].id : null };
    };
    const docVerdict = (f) => {
      if (ok2(f.up) && ok2(f.dup) && f.id) return { ok: true, detail: `${f.up.status}/${f.dup.status}/${f.ins.status}` };
      if (!ok2(f.up) && ok2(f.control) && ok2(f.preRow)) return { ok: false,
        detail: `x-upsert upload ${d(f.up)} | controls: same path WITHOUT x-upsert ${f.control.status} (0078's INSERT check passes); x-upsert once a documents row already points at the path ${f.preRow.status}. ` +
          "So the refusal is the docs_company_read SELECT policy (0037, already on production: an object is readable only through a documents row) being applied to the upsert's new row by this Storage API version. memory.js files the object first and the documents row second, always with x-upsert:true, so onboarding filing and portal Documents uploads fail here. NOT caused by a pending migration; whether production refuses too depends on its Storage version -- unverified (check one real document upload on mineex.ca).",
        migration: "none pending (0037 docs_company_read x Storage upsert)",
        // 0037 is on production (applied 2026-10, outside this rollout), so the refusal is production's today too
        // for the same Storage version. The current src/lib/memory.js uploads WITHOUT x-upsert for exactly this reason.
        preexisting: "0037 docs_company_read (on production) refuses Storage's x-upsert of a new company-docs object; the new portal's memory.js no longer sends x-upsert" };
      return { ok: false, detail: `${d(f.up)} / control ${f.control ? d(f.control) : "-"} / pre-row upsert ${f.preRow ? d(f.preRow) : "-"} / ${d(f.dup)} / ${d(f.ins)}`, migration: "0078_storage_role_hardening?" };
    };
    await check({ id: "C5", area: "company", at: ["src/lib/memory.js:90", "src/lib/memory.js:96", "src/lib/memory.js:103"], role: "new user", call: "onboarding storeDocument: dup check, POST storage company-docs/<uid>/<company>/... (x-upsert), POST documents" }, async () => {
      if (!ONB.id) return { ok: false, detail: "no onboarding company (C1 failed)" };
      return docVerdict(await fileDoc(who.INVESTOR_B, ONB.id));
    });
    let docA = null;
    await check({ id: "C6", area: "company", at: ["src/lib/memory.js:90", "src/lib/memory.js:96", "src/lib/memory.js:103"], role: "owner A", call: "portal Documents upload: same flow on company A" }, async () => {
      docA = await fileDoc(who.COMPANY_A, A.id);
      return docVerdict(docA);
    });
    await check({ id: "C7", area: "company", at: ["src/lib/memory.js:143", "src/lib/memory.js:157", "src/lib/memory.js:181", "src/lib/memory.js:201", "src/lib/memory.js:256", "src/lib/onboarding/documentStore.js:19", "src/lib/onboarding/documentStore.js:88", "src/lib/onboarding/documentStore.js:103"], role: "owner A", call: "documents: PATCH text, list, forExtraction, markReflected (id=in.()), count, inventory select, updateDocument" }, async () => {
      if (!docA || !docA.id) return { ok: false, detail: "no document (C6 failed)" };
      const id = docA.id, h = who.COMPANY_A, rs = [];
      rs.push(await rest(h, "PATCH", `documents?id=eq.${id}`, { extracted_text: T("text"), extraction_status: "done" }, { Prefer: "return=minimal" }));
      rs.push(await rest(h, "GET", `documents?company_id=eq.${A.id}&select=id,filename,mime,bytes,kind,doc_date,storage_path,extraction_status,extracted_text,created_at&order=created_at.desc`));
      rs.push(await rest(h, "GET", `documents?company_id=eq.${A.id}&select=id,filename,mime,storage_path,extracted_text,extraction_status,doc_date,kind,meta&order=created_at.desc`));
      rs.push(await rest(h, "PATCH", `documents?id=in.(${id})`, { meta: { reflected: true } }, { Prefer: "return=minimal" }));
      rs.push(await rest(h, "GET", `documents?company_id=eq.${A.id}&select=id`, undefined, { Prefer: "count=exact" }));
      rs.push(await rest(h, "GET", `documents?company_id=eq.${A.id}&select=id,filename,mime,bytes,sha256,kind,doc_date,title,storage_path,extraction_status,extraction_error,meta,created_at,updated_at,extracted_text&order=doc_date.desc.nullslast,created_at.desc`));
      rs.push(await rest(h, "GET", `documents?id=eq.${id}&select=meta,kind,doc_date&limit=1`));
      rs.push(await rest(h, "PATCH", `documents?id=eq.${id}`, { meta: { reflected: true, events: [{ at: new Date().toISOString(), event: "manual_override" }] }, kind: "presentation" }, { Prefer: "return=minimal" }));
      const row = (await svcRows(`documents?id=eq.${id}&select=extraction_status,meta,kind`))[0];
      const allOk = rs.every(ok2) && row && row.extraction_status === "done" && row.kind === "presentation" && row.meta && row.meta.reflected;
      return allOk ? { ok: true, detail: rs.map((r) => r.status).join("/") } : { ok: false, detail: rs.map((r) => (ok2(r) ? r.status : d(r))).join(" / ") };
    });
    await check({ id: "C8", area: "company", at: ["src/lib/memory.js:217", "src/lib/memory.js:236"], role: "owner A", call: "download object (authed GET storage/object/company-docs/...) and sign URL (POST object/sign/company-docs/... {expiresIn})" }, async () => {
      if (!docA || !docA.id) return { ok: false, detail: "no document (C6 failed)" };
      const g = await storage(who.COMPANY_A, "GET", `object/company-docs/${docA.name}`);
      const s = await storage(who.COMPANY_A, "POST", `object/sign/company-docs/${encodeURI(docA.name)}`, JSON.stringify({ expiresIn: 3600 }), { "content-type": "application/json" });
      return ok2(g) && ok2(s) && s.body && s.body.signedURL ? { ok: true, detail: `${g.status}/${s.status}` } : { ok: false, detail: `${d(g)} / ${d(s)}` };
    });
    await check({ id: "C8v", area: "company", at: ["src/lib/memory.js:217", "src/lib/memory.js:157"], role: "viewer A", call: "a VIEWER of company A reads the document list and downloads (portal read paths)" }, async () => {
      if (!docA || !docA.id) return { ok: false, detail: "no document (C6 failed)" };
      const l = await rest(who.STAFF, "GET", `documents?company_id=eq.${A.id}&select=id`);
      const g = await storage(who.STAFF, "GET", `object/company-docs/${docA.name}`);
      return ok2(l) && l.body.some((x) => x.id === docA.id) && ok2(g) ? { ok: true, detail: `${l.status}/${g.status}` } : { ok: false, detail: `${d(l)} / ${d(g)}`, migration: "0076_company_roles" };
    });
    await check({ id: "C9", area: "company", at: ["src/lib/memory.js:170"], role: "owner A", call: "deleteDocument: DELETE documents?id=eq" }, async () => {
      if (!docA || !docA.id) return { ok: false, detail: "no document (C6 failed)" };
      const r = await rest(who.COMPANY_A, "DELETE", `documents?id=eq.${docA.id}`);
      const left = await svcRows(`documents?id=eq.${docA.id}&select=id`);
      return ok2(r) && left.length === 0 ? { ok: true, detail: `${r.status}` } : { ok: false, detail: `${d(r)} left=${left.length}` };
    });
  }

  // portal.js
  await check({ id: "C10", area: "company", at: ["src/lib/portal.js:23"], role: "owner A", call: "myPortalCompanies: GET company_memberships?user_id&status=eq.active&select=role,joined_at,company:companies(id,slug,name,status)" }, async () => {
    const r = await rest(who.COMPANY_A, "GET", `company_memberships?user_id=eq.${who.COMPANY_A.id}&status=eq.active&select=role,joined_at,company:companies(id,slug,name,status)&order=joined_at.desc`);
    return ok2(r) && r.body.some((m) => m.company && m.company.id === A.id) ? { ok: true, detail: `200 (${r.body.length})` } : { ok: false, detail: d(r) };
  });
  await check({ id: "C10v", area: "company", at: ["src/lib/portal.js:23", "src/lib/portal.js:83"], role: "viewer A", call: "a viewer's portal company list + loadPortalCompany (embedded companies join)" }, async () => {
    const r = await rest(who.STAFF, "GET", `company_memberships?user_id=eq.${who.STAFF.id}&status=eq.active&select=role,joined_at,company:companies(id,slug,name,status)&order=joined_at.desc`);
    const c = await rest(who.STAFF, "GET", `companies?id=eq.${A.id}&select=id,slug,name,status,owner_id,tier,profile,updated_at&limit=1`);
    return ok2(r) && r.body.some((m) => m.company && m.company.id === A.id) && ok2(c) && c.body[0] ? { ok: true, detail: `${r.status}/${c.status}` } : { ok: false, detail: `${d(r)} / ${d(c)}` };
  });
  await check({ id: "C11", area: "company", at: ["src/lib/portal.js:66"], role: "owner A", call: "rpc company_followers_list {cid}" }, async () => {
    const r = await rpc(who.COMPANY_A, "company_followers_list", { cid: A.id });
    if (ok2(r) && Array.isArray(r.body)) return { ok: true, detail: `200 (${r.body.length})` };
    const defs = definedIn(/function\s+public\.company_followers_list\b/i);
    if (r.status === 404 && !defs.length) return { ok: false, detail: `${d(r)} -- old portal falls back to []`, preexisting: "no migration (0001-0094) ever defines public.company_followers_list; nothing pending drops it" };
    return { ok: false, detail: `${d(r)} defined in ${defs.join(",")}`, migration: pendingFiles(defs).join(",") || undefined };
  });
  await check({ id: "C12", area: "company", at: ["src/lib/portal.js:83", "src/lib/portal.js:101"], role: "owner A", call: "loadPortalCompany(BySlug): GET companies?id|slug&select=id,slug,name,status,owner_id,tier,profile,updated_at" }, async () => {
    const a = await rest(who.COMPANY_A, "GET", `companies?id=eq.${A.id}&select=id,slug,name,status,owner_id,tier,profile,updated_at&limit=1`);
    const b = await rest(who.COMPANY_A, "GET", `companies?slug=eq.${enc(A.slug)}&select=id,slug,name,status,owner_id,tier,profile,updated_at&limit=1`);
    return ok2(a) && ok2(b) && a.body[0] && b.body[0] ? { ok: true, detail: "200/200" } : { ok: false, detail: `${d(a)} / ${d(b)}` };
  });
  await check({ id: "C13", area: "company", at: ["src/lib/portal.js:117"], role: "owner A", call: "rpc portal_readiness {cid}" }, async () => {
    const r = await rpc(who.COMPANY_A, "portal_readiness", { cid: A.id });
    return ok2(r) && r.body && typeof r.body === "object" ? { ok: true, detail: `200 ${short(r.body).slice(0, 60)}` } : { ok: false, detail: d(r) };
  });
  await check({ id: "C14", area: "company", at: ["src/lib/portal.js:137", "src/lib/portal.js:355"], role: "owner A", call: "logActivity: POST activity_log {company_id,actor_id,actor_kind:'company',action,entity,source:'ui',...}; listActivity GET" }, async () => {
    const since = new Date(Date.now() - 5000).toISOString();
    onCleanup("activity_log test rows", () => svc("DELETE", `activity_log?company_id=eq.${A.id}&reason=like.${enc(`${MARK}*`)}`));
    const rs = [];
    for (const [action, entity] of [["profile_updated", "profile.catalysts"], ["media_uploaded", "documents"], ["media_deleted", "documents"]]) {
      rs.push(await rest(who.COMPANY_A, "POST", "activity_log", { company_id: A.id, actor_id: who.COMPANY_A.id, actor_kind: "company", action, entity, old_value: null, new_value: null, reason: T(action), source: "ui" }, { Prefer: "return=minimal" }));
    }
    const l = await rest(who.COMPANY_A, "GET", `activity_log?company_id=eq.${A.id}&select=id,actor_kind,action,entity,reason,source,created_at&order=created_at.desc&limit=50`);
    const mine = l.body && Array.isArray(l.body) ? l.body.filter((x) => String(x.reason || "").startsWith(MARK)).length : 0;
    void since;
    return rs.every(ok2) && ok2(l) && mine === 3 ? { ok: true, detail: `${rs.map((r) => r.status).join("/")} list ${l.status} (${mine} test rows visible)` } : { ok: false, detail: `${rs.map((r) => (ok2(r) ? r.status : d(r))).join(" / ")} list ${d(l)} mine=${mine}`, migration: "0076_company_roles" };
  });
  await check({ id: "C15", area: "company", at: ["src/lib/portal.js:187", "src/lib/portal.js:227"], role: "owner A", call: "companyStats (4x count=exact on documents/updates/publications) + fetchRecentContent (publications passport)" }, async () => {
    const paths = [`documents?company_id=eq.${A.id}&select=id`, `updates?company_id=eq.${A.id}&select=id`, `publications?company_id=eq.${A.id}&select=id`, `publications?company_id=eq.${A.id}&status=eq.published&select=id`];
    const rs = [];
    for (const p of paths) rs.push(await rest(who.COMPANY_A, "GET", p, undefined, { Prefer: "count=exact", Range: "0-0" }));
    const rc = await rest(who.COMPANY_A, "GET", `publications?company_id=eq.${A.id}&destination_id=eq.passport&select=id,status,created_at,content&order=created_at.desc&limit=6`);
    return rs.every((r) => ok2(r) && (r.headers.get("content-range") || "").includes("/")) && ok2(rc) ? { ok: true, detail: rs.map((r) => r.headers.get("content-range")).join(" ") } : { ok: false, detail: rs.concat([rc]).map((r) => (ok2(r) ? r.status : d(r))).join(" / ") };
  });
  await check({ id: "C16", area: "company", at: ["src/lib/portal.js:254"], role: "owner A", call: "createInvitation: rpc create_company_invitation {p_company_id,p_email,p_role:'owner'} (old default role)" }, async () => {
    onCleanup("company_invitations test rows", () => svc("DELETE", `company_invitations?email=eq.${enc(LEAD_EMAIL)}`));
    const r = await rpc(who.COMPANY_A, "create_company_invitation", { p_company_id: A.id, p_email: LEAD_EMAIL, p_role: "owner" });
    const adm = await rpc(who.ADMIN, "create_company_invitation", { p_company_id: A.id, p_email: LEAD_EMAIL, p_role: "owner" });
    const rows = await svcRows(`company_invitations?email=eq.${enc(LEAD_EMAIL)}&select=role,kind,status`);
    const detail = `owner ${r.status} ${short(r.body).slice(0, 60)} | platform admin ${adm.status} ${ok2(adm) ? "(invitation created)" : short(adm.body)} | rows ${rows.length}`;
    if (ok2(r) && r.body) return { ok: true, detail };
    const defs = definedIn(/function\s+public\.create_company_invitation\b/i);
    if (/admin only/.test(short(r.body)) && ok2(adm) && !pendingFiles(defs).length)
      return { ok: false, detail, preexisting: `create_company_invitation is admin-only in its only definition (${defs.join(",")}); the old portal's owner invite already fails on production` };
    return { ok: false, detail, migration: pendingFiles(defs).join(",") || undefined };
  });
  await check({ id: "C17", area: "company", at: ["src/lib/portal.js:272", "src/lib/portal.js:293"], role: "inv+anon", call: "accept / peek invitation with an unknown token -> {ok:false} (RPC shape)" }, async () => {
    const a = await rpc(who.INVESTOR, "accept_company_invitation", { p_token: `legacy-live-${RUN}` });
    const p = await rpc(null, "peek_company_invitation", { p_token: `legacy-live-${RUN}` });
    return ok2(a) && ok2(p) && a.body && a.body.ok === false && p.body && p.body.ok === false ? { ok: true, detail: `${a.status} ${short(a.body)} / ${p.status} ${short(p.body)}` } : { ok: false, detail: `${d(a)} / ${d(p)}` };
  });
  await check({ id: "C18", area: "company", at: ["src/lib/portal.js:309", "src/lib/portal.js:324", "src/lib/portal.js:339"], role: "new user", call: "agreement + go-live on the onboarding company: rpc record_company_agreement, company_has_agreement, company_go_live {p_company_id,p_version}" }, async () => {
    if (!ONB.id) return { ok: false, detail: "no onboarding company (C1 failed)" };
    const v = "2026-01";
    const rec = await rpc(who.INVESTOR_B, "record_company_agreement", { p_company_id: ONB.id, p_version: v });
    const has = await rpc(who.INVESTOR_B, "company_has_agreement", { p_company_id: ONB.id, p_version: v });
    const go1 = await rpc(who.INVESTOR_B, "company_go_live", { p_company_id: ONB.id, p_version: v });
    // go-live needs an active subscription (0035 and 0072 alike); the platform admin grants one the
    // way old AccountManagement does, then the owner goes live.
    const bill = await rpc(who.ADMIN, "admin_set_billing", { p_company: ONB.id, p_tier: "pro", p_status: "active", p_renews_at: "2027-12-31T23:59:59Z" });
    const go2 = await rpc(who.INVESTOR_B, "company_go_live", { p_company_id: ONB.id, p_version: v });
    const st = (await svcRows(`companies?id=eq.${ONB.id}&select=status`))[0];
    const detail = `record ${rec.status} | has ${has.status} ${short(has.body)} | go_live w/o plan ${go1.status} ${short(go1.body)} | billing ${bill.status} | go_live ${go2.status} ${short(go2.body).slice(0, 70)} | status ${st && st.status}`;
    return [rec, has, go1, bill, go2].every(ok2) && has.body === true && go1.body && go1.body.error === "subscription_required" && go2.body && go2.body.ok && st.status === "published"
      ? { ok: true, detail } : { ok: false, detail, migration: "0072_profile_drafts" };
  });
  await check({ id: "C19", area: "company", at: ["src/lib/features.js:42", "api/_entitlement.js:74", "api/publish.js:46"], role: "owner A", call: "rpc my_features {cid}" }, async () => {
    const r = await rpc(who.COMPANY_A, "my_features", { cid: A.id });
    return ok2(r) && Array.isArray(r.body) ? { ok: true, detail: `200 (${r.body.length} features)` } : { ok: false, detail: d(r) };
  });
  await check({ id: "C20", area: "company", at: ["src/lib/features.js:61"], role: "owner A", call: "fetchPlan: GET company_subscriptions?company_id&select=plan_id,status,renews_at,plans(label,rank)" }, async () => {
    const r = await rest(who.COMPANY_A, "GET", `company_subscriptions?company_id=eq.${A.id}&select=plan_id,status,renews_at,plans(label,rank)&limit=1`);
    return ok2(r) ? { ok: true, detail: `200 (${r.body.length})` } : { ok: false, detail: d(r) };
  });
  await check({ id: "C21", area: "company", at: ["src/console/CompanyConsole.jsx:27", "src/console/CompanyConsole.jsx:42"], role: "owner A", call: "console: GET companies?owner_id=eq.<me> / ?slug &select=id,slug,name,status,profile" }, async () => {
    const a = await rest(who.COMPANY_A, "GET", `companies?owner_id=eq.${who.COMPANY_A.id}&select=id,slug,name,status,profile&limit=1`);
    const b = await rest(who.COMPANY_A, "GET", `companies?slug=eq.${enc(A.slug)}&select=id,slug,name,status,profile&limit=1`);
    return ok2(a) && ok2(b) && a.body[0] && b.body[0] ? { ok: true, detail: "200/200" } : { ok: false, detail: `${d(a)} / ${d(b)}` };
  });
  await check({ id: "C22", area: "company", at: ["src/console/CompanyMemory.jsx:64", "src/console/CompanyMemory.jsx:81", "src/console/CompanyMemory.jsx:139", "src/console/CompanyMemory.jsx:86", "src/console/CompanyMemory.jsx:144", "src/portal/ProfileEditor.jsx:454", "src/portal/ProfileEditor.jsx:642", "src/lib/publish.js:62", "src/lib/publish.js:72", "src/lib/profileVersions.js:75", "src/lib/blueprints/blueprintStorage.js:42", "src/lib/blueprints/blueprintStorage.js:95", "src/lib/blueprints/blueprintStorage.js:132"], role: "owner A", call: "read profile by slug (select=profile / profile,tier / id,profile) and PATCH companies?slug=eq {profile} return=minimal (identical)" }, async () => {
    const a = await rest(who.COMPANY_A, "GET", `companies?slug=eq.${enc(A.slug)}&select=profile&limit=1`);
    const b = await rest(who.COMPANY_A, "GET", `companies?slug=eq.${enc(A.slug)}&select=profile,tier`);
    const c = await rest(who.COMPANY_A, "GET", `companies?slug=eq.${enc(A.slug)}&select=id,profile&limit=1`);
    const p = await rest(who.COMPANY_A, "PATCH", `companies?slug=eq.${enc(A.slug)}`, { profile: fixtureProfileA }, { Prefer: "return=minimal" });
    const now = (await svcRows(`companies?id=eq.${A.id}&select=profile`))[0];
    return [a, b, c, p].every(ok2) && a.body[0] && same(now.profile, fixtureProfileA) ? { ok: true, detail: `${a.status}/${b.status}/${c.status}/${p.status}` } : { ok: false, detail: [a, b, c, p].map((r) => (ok2(r) ? r.status : d(r))).join(" / ") };
  });
  await check({ id: "C22e", area: "company", at: ["src/portal/ProfileEditor.jsx:642", "src/console/CompanyMemory.jsx:86"], role: "editor A", call: "same profile PATCH by a company editor" }, async () => {
    const p = await rest(who.EDITOR, "PATCH", `companies?slug=eq.${enc(A.slug)}`, { profile: fixtureProfileA }, { Prefer: "return=representation" });
    if (ok2(p) && Array.isArray(p.body) && p.body.length === 1) return { ok: true, detail: `${p.status} (1 row)` };
    // companies UPDATE is auth_update (owner_id = auth.uid() or is_admin()) from 0001; no pending migration touches it.
    const pol = await sql(`select coalesce(qual,'') q from pg_policies where schemaname='public' and tablename='companies' and cmd='UPDATE'`);
    const touches = pendingFiles(definedIn(/on\s+public\.companies\s+for\s+(update|all)/i));
    if (ok2(p) && pol.length === 1 && /owner_id = auth\.uid\(\)/.test(pol[0].q) && !touches.length)
      return { ok: false, detail: `${p.status} 0 rows (RLS no-op)`, preexisting: "only the owner_id account or a platform admin may update companies (auth_update, 0001); a non-owner member's profile save is a silent no-op on production too" };
    return { ok: false, detail: d(p), migration: touches.join(",") || "0076_company_roles" };
  });
  await check({ id: "C22s", area: "company", at: ["src/lib/supabase.js:96"], role: "owner A", call: "updateCompany: PATCH companies?slug=eq {profile} return=representation (restore / profileSafety / revert)" }, async () => {
    const p = await rest(who.COMPANY_A, "PATCH", `companies?slug=eq.${enc(A.slug)}`, { profile: fixtureProfileA }, { Prefer: "return=representation" });
    return ok2(p) && p.body[0] ? { ok: true, detail: `${p.status}` } : { ok: false, detail: d(p) };
  });

  // updates + publications (CommsCenter, MediaComposer) and the old client-side publish
  const pubIds = [], updIds = [];
  // One row at a time: a publication that was ever published has append-only release_revisions
  // (0051 retention trigger, never bypassed here) and cannot be deleted -- that is reported, not hidden.
  onCleanup("publications/updates test rows", async () => {
    const out = [];
    for (const id of pubIds) { const r = await svc("DELETE", `publications?id=eq.${id}`); if (!ok2(r)) out.push({ status: r.status, body: `publication ${id} kept (${short(r.body).slice(0, 90)})` }); }
    for (const id of updIds) { const r = await svc("DELETE", `updates?id=eq.${id}`); if (!ok2(r)) out.push({ status: r.status, body: `update ${id} kept (${short(r.body).slice(0, 90)})` }); }
    return out;
  });
  let draftPub = null, approvedPub = null;
  const mkUpdatePubs = async (u, cid, upd, pubs) => {
    const ur = await rest(u, "POST", "updates", { company_id: cid, ...upd }, { Prefer: "return=representation" });
    const uid = ok2(ur) && ur.body[0] ? ur.body[0].id : null;
    if (uid) updIds.push(uid);
    const pr = uid ? await rest(u, "POST", "publications", pubs.map((p) => ({ company_id: cid, update_id: uid, ...p })), { Prefer: "return=representation" }) : { status: 0, body: "no update" };
    const rows = ok2(pr) && Array.isArray(pr.body) ? pr.body : [];
    for (const r of rows) pubIds.push(r.id);
    return { ur, pr, rows };
  };
  await check({ id: "C23", area: "company", at: ["src/console/CommsCenter.jsx:142", "src/console/CommsCenter.jsx:158"], role: "owner A", call: "CommsCenter saveDrafts: POST updates {body,occurred_on,status:'review',detected} + POST publications [array, draft|approved]" }, async () => {
    const r = await mkUpdatePubs(who.COMPANY_A, A.id, { body: T("comms update"), occurred_on: null, status: "review", detected: { summary: "x", category: "Corporate", profileTouches: [] } },
      [{ destination_id: "passport", content: { headline: T("draft"), body: "b" }, status: "draft" }, { destination_id: "linkedin", content: { body: T("li") }, status: "approved" }]);
    draftPub = r.rows.find((x) => x.status === "draft") || null;
    return ok2(r.ur) && ok2(r.pr) && r.rows.length === 2 ? { ok: true, detail: `${r.ur.status}/${r.pr.status}` } : { ok: false, detail: `${d(r.ur)} / ${d(r.pr)}`, migration: "0076_company_roles" };
  });
  await check({ id: "C24", area: "company", at: ["src/portal/MediaComposer.jsx:61", "src/portal/MediaComposer.jsx:68"], role: "owner A", call: "MediaComposer: POST updates {body,status:'review',detected:{post_type:'media'}} + POST publications [{passport, media content, approved}]" }, async () => {
    const r = await mkUpdatePubs(who.COMPANY_A, A.id, { body: T("media post"), status: "review", detected: { post_type: "media" } },
      [{ destination_id: "passport", content: { post_type: "media", media_url: "https://example.invalid/x.png", thumbnail_url: "https://example.invalid/x.png", headline: T("media"), body: "" }, status: "approved" }]);
    approvedPub = r.rows[0] || null;
    return ok2(r.ur) && ok2(r.pr) && r.rows.length === 1 ? { ok: true, detail: `${r.ur.status}/${r.pr.status}` } : { ok: false, detail: `${d(r.ur)} / ${d(r.pr)}`, migration: "0076_company_roles" };
  });
  await check({ id: "C24v", area: "company", at: ["src/portal/MediaComposer.jsx:61"], role: "viewer A", call: "same insert by a VIEWER of company A" }, async () => {
    const r = await mkUpdatePubs(who.STAFF, A.id, { body: T("viewer media post"), status: "review", detected: { post_type: "media" } }, [{ destination_id: "passport", content: { post_type: "media" }, status: "approved" }]);
    if (ok2(r.ur) && ok2(r.pr)) return { ok: true, detail: `${r.ur.status}/${r.pr.status} (viewer may still draft)` };
    return { ok: true, detail: `${d(r.ur)}`, changed: "a 'viewer' membership can no longer create updates/publications (0076 draft_insert / pub_insert need owner|admin|editor|publisher); before 0076 any member could. The old portal shows 'Couldn't save'.", migration: "0076_company_roles" };
  });
  await check({ id: "C25", area: "company", at: ["src/lib/publish.js:115"], role: "owner A", call: "old client publishPublication: PATCH publications?id=eq {status:'published',published_at,external_url,error:null}" }, async () => {
    if (!approvedPub) return { ok: false, detail: "no approved publication (C24 failed)" };
    const r = await rest(who.COMPANY_A, "PATCH", `publications?id=eq.${approvedPub.id}`, { status: "published", published_at: new Date().toISOString(), external_url: `/app?c=${A.slug}`, error: null }, { Prefer: "return=minimal" });
    const row = (await svcRows(`publications?id=eq.${approvedPub.id}&select=status`))[0];
    if (ok2(r) && row && row.status === "published") return { ok: true, detail: `${r.status} (status published by the client, as before)` };
    // pub_update's WITH CHECK has said status <> 'published' since 0010 (0076 keeps it). And nothing in
    // 9dfafd7 calls publishPublication (CommsCenter imports only connectorIsLive) -- dead code.
    const callers = grepOld("publishPublication(").filter((l) => !/export async function/.test(l));
    if (r.status === 403 && definedIn(/status\s*<>\s*'published'/).some((f) => /^0010/.test(f)) && !callers.length)
      return { ok: false, detail: `${d(r)} -- publishPublication has no caller in ${OLD_COMMIT}`, preexisting: "pub_update forbids status='published' from clients since 0010_publish_lockdown" };
    return { ok: false, detail: d(r) };
  });
  await check({ id: "C26", area: "company", at: ["src/lib/publishClient.js:23", "src/lib/publishClient.js:24", "api/publish.js:34", "api/unpublish.js:27"], role: "owner A", call: "publishViaApi / unpublishViaApi -> old /api/publish, /api/unpublish (mineex.ca env)" }, async () => {
    const p = await oldApi(OLDAPI, "publish", { who: who.COMPANY_A, body: { publicationId: draftPub ? draftPub.id : crypto.randomUUID() } });
    const u = await oldApi(OLDAPI, "unpublish", { who: who.COMPANY_A, body: { publicationId: draftPub ? draftPub.id : crypto.randomUUID() } });
    return p.status === 500 && u.status === 500 && p.dbCalls === 0 && u.dbCalls === 0
      ? { ok: true, detail: "500/500 'Supabase service env missing', 0 DB calls -- identical on production today (no service key on mineex.ca)" }
      : { ok: false, detail: `${d(p)} / ${d(u)}` };
  });
  await check({ id: "C26r", area: "company", at: ["api/publish.js:34", "api/unpublish.js:27", "api/stripe-checkout.js:42", "api/extract-company.js:138", "api/extract-projects.js:215", "api/_entitlement.js:130", "api/_entitlement.js:144", "api/_aiGuard.js:349", "api/_aiGuard.js:363"], role: "owner A", call: "user-token reads the old API makes before its service/AI steps (replicas: publications, companies, profiles, memberships)" }, async () => {
      const pid = draftPub ? draftPub.id : crypto.randomUUID();
      const rs = [
        await rest(who.COMPANY_A, "GET", `publications?id=eq.${pid}&select=id,company_id,destination_id,status`),
        await rest(who.COMPANY_A, "GET", `publications?id=eq.${pid}&select=id,company_id,status`),
        await rest(who.COMPANY_A, "GET", `companies?id=eq.${A.id}&select=id,name,slug&limit=1`),
        await rest(who.COMPANY_A, "GET", `companies?slug=eq.${enc(A.slug)}&select=name,profile`),
        await rest(who.ADMIN, "GET", `profiles?id=eq.${who.ADMIN.id}&select=role&limit=1`),
        await rest(who.COMPANY_A, "GET", `companies?slug=eq.${enc(A.slug)}&select=id&limit=1`),
        await rest(who.COMPANY_A, "GET", `company_memberships?status=eq.active&select=company_id&limit=1`),
        await rest(who.COMPANY_A, "GET", `companies?owner_id=eq.${who.COMPANY_A.id}&select=id&limit=1`),
      ];
      const good = rs.every(ok2) && rs[0].body.length === (draftPub ? 1 : 0) && rs[4].body[0] && rs[4].body[0].role === "admin";
      return good ? { ok: true, detail: rs.map((r) => r.status).join("/") } : { ok: false, detail: rs.map((r) => (ok2(r) ? `${r.status}:${r.body.length}` : d(r))).join(" / ") };
  });
  {
    const verIds = [];
    onCleanup("company_profile_versions test rows", async () => { if (verIds.length) return svc("DELETE", `company_profile_versions?id=in.(${verIds.join(",")})`); });
    await check({ id: "C27", area: "company", at: ["src/lib/profileVersions.js:16"], role: "owner A", call: "snapshotProfile POST company_profile_versions {company_id,slug,profile,note,created_by}; listVersions; getVersionProfile; pruneVersions DELETE id=in.(own)" }, async () => {
      const ins = await rest(who.COMPANY_A, "POST", "company_profile_versions", { company_id: A.id, slug: A.slug, profile: { note: T("snapshot") }, note: T("before restore"), created_by: who.COMPANY_A.id }, { Prefer: "return=minimal" });
      const mine = await svcRows(`company_profile_versions?company_id=eq.${A.id}&note=eq.${enc(T("before restore"))}&select=id,kind`);
      for (const m of mine) verIds.push(m.id);
      const list = await rest(who.COMPANY_A, "GET", `company_profile_versions?company_id=eq.${A.id}&select=id,company_id,slug,note,created_at,created_by&order=created_at.desc&limit=50`);
      const get = mine[0] ? await rest(who.COMPANY_A, "GET", `company_profile_versions?id=eq.${mine[0].id}&select=profile&limit=1`) : { status: 0, body: "none" };
      const del = mine[0] ? await rest(who.COMPANY_A, "DELETE", `company_profile_versions?id=in.(${mine[0].id})`) : { status: 0, body: "none" };
      const left = mine[0] ? await svcRows(`company_profile_versions?id=eq.${mine[0].id}&select=id`) : [1];
      const detail = `insert ${ins.status} kind=${mine[0] && mine[0].kind} | list ${list.status} | get ${get.status} | prune ${del.status} left ${left.length}`;
      return ok2(ins) && mine.length === 1 && ok2(list) && ok2(get) && ok2(del) && left.length === 0 ? { ok: true, detail } : { ok: false, detail, migration: "0074/0075" };
    });
  }

  // ============================================================ ADMIN =====
  section("ADMIN (src/admin/*, src/lib/supabase.js, src/lib/blueprints) as platform admin");
  const ADM = { slug: `zz-legacy-adm-${RUN}`, name: `ZZ Legacy Admin ${RUN}` };
  onCleanup(`throwaway company ${ADM.slug}`, () => svc("DELETE", `companies?slug=eq.${ADM.slug}`));
  await check({ id: "A1", area: "admin", at: ["src/lib/supabase.js:50"], role: "admin", call: "fetchCompanies: GET companies?select=id,slug,name,primary_ticker,status,profile,preview_token,created_at,updated_at,owner_id&order=updated_at.desc.nullslast" }, async () => {
    const r = await rest(who.ADMIN, "GET", "companies?select=id,slug,name,primary_ticker,status,profile,preview_token,created_at,updated_at,owner_id&order=updated_at.desc.nullslast");
    return ok2(r) && r.body.some((c) => c.id === A.id && c.preview_token) ? { ok: true, detail: `200 (${r.body.length} incl. drafts)` } : { ok: false, detail: d(r) };
  });
  await check({ id: "A2", area: "admin", at: ["src/lib/supabase.js:80"], role: "admin", call: "createCompany: POST companies {status:'draft',slug,name,primary_ticker|profile} return=representation" }, async () => {
    const r = await rest(who.ADMIN, "POST", "companies", { status: "draft", slug: ADM.slug, name: ADM.name, primary_ticker: null, profile: { listing: true, seededName: ADM.name } }, { Prefer: "return=representation" });
    if (ok2(r) && r.body[0]) ADM.id = r.body[0].id;
    return ADM.id ? { ok: true, detail: `${r.status}` } : { ok: false, detail: d(r) };
  });
  await check({ id: "A3", area: "admin", at: ["src/lib/supabase.js:96"], role: "admin", call: "updateCompany: PATCH companies?slug {status:'published'} / {profile} / {status:'draft'}" }, async () => {
    const a = await rest(who.ADMIN, "PATCH", `companies?slug=eq.${ADM.slug}`, { status: "published" }, { Prefer: "return=representation" });
    const b = await rest(who.ADMIN, "PATCH", `companies?slug=eq.${ADM.slug}`, { profile: { company: { name: ADM.name }, pp: { COMPANY: { name: ADM.name } } } }, { Prefer: "return=representation" });
    const c = await rest(who.ADMIN, "PATCH", `companies?slug=eq.${ADM.slug}`, { status: "draft" }, { Prefer: "return=representation" });
    return [a, b, c].every((r) => ok2(r) && r.body[0]) ? { ok: true, detail: `${a.status}/${b.status}/${c.status}` } : { ok: false, detail: [a, b, c].map(d).join(" / ") };
  });
  await check({ id: "A4", area: "admin", at: ["src/admin/MissionControl.jsx:82"], role: "admin", call: "GET profiles?select=id,email,role,created_at&order=created_at.desc" }, async () => {
    const r = await rest(who.ADMIN, "GET", "profiles?select=id,email,role,created_at&order=created_at.desc");
    return ok2(r) && r.body.length > 1 ? { ok: true, detail: `200 (${r.body.length})` } : { ok: false, detail: d(r) };
  });
  await check({ id: "A5", area: "admin", at: ["src/admin/MissionControl.jsx:481"], role: "admin", call: "GET news_public?select=...&company_slug=not.is.null&order=published_at.desc&limit=40" }, async () => {
    const r = await rest(who.ADMIN, "GET", "news_public?select=id,title,company_slug,source_name,published_at&company_slug=not.is.null&order=published_at.desc&limit=40");
    return ok2(r) ? { ok: true, detail: `200 (${r.body.length})` } : { ok: false, detail: d(r) };
  });
  await check({ id: "A6", area: "admin", at: ["src/admin/NewsReview.jsx:27"], role: "admin", call: "GET news_items?status=eq.review&select=<SELECT with source:news_sources, links:news_item_companies>" }, async () => {
    const SELECT = "id,title,url,event_type,commodities,jurisdictions,materiality_score,materiality_label,mineex_summary,plain_english_explanation,context,key_numbers,provenance,fact_check,cluster_key,is_canonical,published_at,facts,source:news_sources(key,name),links:news_item_companies(company_slug,method,confidence)";
    const r = await rest(who.ADMIN, "GET", `news_items?status=eq.review&select=${enc(SELECT)}&order=materiality_score.desc.nullslast&limit=150`);
    return ok2(r) ? { ok: true, detail: `200 (${r.body.length})` } : { ok: false, detail: d(r) };
  });
  await check({ id: "A7", area: "admin", at: ["src/admin/AccountManagement.jsx:63"], role: "admin", call: "GET company_subscriptions?select=company_id,plan_id,status,renews_at,plans(label,rank)" }, async () => {
    const r = await rest(who.ADMIN, "GET", "company_subscriptions?select=company_id,plan_id,status,renews_at,plans(label,rank)");
    return ok2(r) ? { ok: true, detail: `200 (${r.body.length})` } : { ok: false, detail: d(r) };
  });
  await check({ id: "A8", area: "admin", at: ["src/admin/AccountManagement.jsx:213"], role: "admin", call: "rpc admin_set_billing {p_company,p_tier,p_status,p_renews_at} on the throwaway company" }, async () => {
    if (!ADM.id) return { ok: false, detail: "no throwaway company (A2 failed)" };
    const r = await rpc(who.ADMIN, "admin_set_billing", { p_company: ADM.id, p_tier: "pro", p_status: "active", p_renews_at: "2027-12-31T23:59:59Z" });
    return ok2(r) && r.body && r.body.ok ? { ok: true, detail: `${r.status} ${short(r.body).slice(0, 80)}` } : { ok: false, detail: d(r) };
  });
  await check({ id: "A9", area: "admin", at: ["src/admin/PublishPanel.jsx:44"], role: "admin", call: "PublishPanel createAndPublish: POST updates {status:'approved',detected,meta} + POST publications {passport, approved} (single objects)" }, async () => {
    if (!ADM.id) return { ok: false, detail: "no throwaway company (A2 failed)" };
    const u = await rest(who.ADMIN, "POST", "updates", { company_id: ADM.id, body: T("admin pr"), occurred_on: "2026-11-01", status: "approved", detected: { materiality: "Moderate" }, meta: { source: "admin:account-management", post_type: "press_release" } }, { Prefer: "return=representation" });
    const uid = ok2(u) && u.body[0] ? u.body[0].id : null;
    if (uid) updIds.push(uid);
    const p = uid ? await rest(who.ADMIN, "POST", "publications", { company_id: ADM.id, update_id: uid, destination_id: "passport", status: "approved", content: { post_type: "press_release", headline: T("admin pr"), body: "", category: "Corporate", media_url: "", thumbnail_url: "", source_url: "" } }, { Prefer: "return=representation" }) : { status: 0, body: "no update" };
    const row = ok2(p) ? (Array.isArray(p.body) ? p.body[0] : p.body) : null;
    if (row && row.id) pubIds.push(row.id);
    return row && row.id ? { ok: true, detail: `${u.status}/${p.status}` } : { ok: false, detail: `${d(u)} / ${d(p)}`, migration: "0076_company_roles" };
  });
  {
    let bp = null;
    await check({ id: "A10", area: "admin", at: ["src/lib/blueprints/blueprintStorage.js:13"], role: "admin", call: "company_blueprints: GET all, GET for company, POST {company_id,blueprint_type,template_key,template_version,status,data,created_by,updated_by}, PATCH {data,updated_by}, PATCH {status}" }, async () => {
      if (!ADM.id) return { ok: false, detail: "no throwaway company (A2 failed)" };
      const COLS = "id,company_id,blueprint_type,template_key,template_version,status,data,created_at,updated_at,created_by,updated_by";
      const all = await rest(who.ADMIN, "GET", `company_blueprints?select=${COLS}&order=updated_at.desc.nullslast`);
      const one = await rest(who.ADMIN, "GET", `company_blueprints?company_id=eq.${ADM.id}&blueprint_type=eq.conference&template_version=eq.v1&select=${COLS}&limit=1`);
      const ins = await rest(who.ADMIN, "POST", "company_blueprints", { company_id: ADM.id, blueprint_type: "conference", template_key: "conference-default", template_version: "v1", status: "draft", data: { templateKey: "conference-default", note: T("bp") }, created_by: who.ADMIN.id, updated_by: who.ADMIN.id }, { Prefer: "return=representation" });
      bp = ok2(ins) && ins.body[0] ? ins.body[0] : null;
      const sv = bp ? await rest(who.ADMIN, "PATCH", `company_blueprints?id=eq.${bp.id}`, { data: { templateKey: "conference-default", meta: { publishedAt: new Date().toISOString() } }, updated_by: who.ADMIN.id }, { Prefer: "return=representation" }) : { status: 0, body: "" };
      const st = bp ? await rest(who.ADMIN, "PATCH", `company_blueprints?id=eq.${bp.id}`, { status: "approved" }, { Prefer: "return=representation" }) : { status: 0, body: "" };
      const rs = [all, one, ins, sv, st];
      return rs.every(ok2) && bp && st.body[0] && st.body[0].status === "approved" ? { ok: true, detail: rs.map((r) => r.status).join("/") } : { ok: false, detail: rs.map((r) => (ok2(r) ? r.status : d(r))).join(" / ") };
    });
  }
  await check({ id: "A11", area: "admin", at: ["src/lib/profileVersions.js:16", "src/lib/supabase.js:96"], role: "admin", call: "publishCompiledProfile / profileSafety: snapshot POST company_profile_versions + updateCompany PATCH profile on the throwaway company" }, async () => {
    if (!ADM.id) return { ok: false, detail: "no throwaway company (A2 failed)" };
    const s = await rest(who.ADMIN, "POST", "company_profile_versions", { company_id: ADM.id, slug: ADM.slug, profile: { company: { name: ADM.name } }, note: "before conference publish", created_by: who.ADMIN.id }, { Prefer: "return=minimal" });
    const u = await rest(who.ADMIN, "PATCH", `companies?slug=eq.${ADM.slug}`, { profile: { company: { name: ADM.name }, conference: { on: true } } }, { Prefer: "return=representation" });
    return ok2(s) && ok2(u) && u.body[0] ? { ok: true, detail: `${s.status}/${u.status}` } : { ok: false, detail: `${d(s)} / ${d(u)}`, migration: "0074/0075" };
  });
  await check({ id: "A12", area: "admin", at: ["src/lib/supabase.js:64"], role: "admin", call: "deleteCompany: DELETE companies?slug=eq return=representation (throwaway company, with its subscription, blueprint, versions, publications)" }, async () => {
    if (!ADM.id) return { ok: false, detail: "no throwaway company (A2 failed)" };
    const r = await rest(who.ADMIN, "DELETE", `companies?slug=eq.${ADM.slug}`, undefined, { Prefer: "return=representation" });
    const left = await svcRows(`companies?slug=eq.${ADM.slug}&select=id`);
    return ok2(r) && Array.isArray(r.body) && r.body.length === 1 && left.length === 0 ? { ok: true, detail: `${r.status} (1 row; dependants cascaded)` } : { ok: false, detail: `${d(r)} left=${left.length}` };
  });

  // ========================================================= OLD /api =====
  section("OLD /api FUNCTIONS (9dfafd7 handlers, mineex.ca env: VITE_SUPABASE_URL + anon key only)");
  // Route sweep: what every old route does with mineex.ca's env. A route that answers before any
  // database request cannot be affected by a migration. Bodies are minimal and carry no secrets, so
  // no route reaches an AI provider, Stripe or Postmark (and the egress guard would refuse/mock it).
  const ROUTE_CALLERS = {
    "audience-card": ["src/admin/AudienceCard.jsx:812"], "brief-generate": ["src/portal/BriefReview.jsx:134"],
    "build-from-website": ["src/admin/Admin.jsx:112", "src/admin/onboarding/OnboardingWorkspace.jsx:142"], "comms-generate": ["src/console/CommsCenter.jsx:119"],
    "extract-company": ["src/lib/structureReleases.js:405"], "extract-projects": ["src/lib/structureReleases.js:339"], "extract-text": ["src/lib/structureReleases.js:437"],
    "news-broadcast": ["src/admin/MissionControl.jsx:491"], "news-review": ["src/admin/NewsReview.jsx:38"], "story-extract": ["src/studio/services/extraction/anthropic.ts:44"],
    "story-fetch": ["src/studio/lib/ingest.ts:85"], "stripe-checkout": ["src/portal/Portal.jsx:783"], "stripe-portal": ["src/portal/Portal.jsx:797"],
    "structure-batch": ["src/lib/structureReleases.js:81"], "structure-release": ["src/lib/ai.js:21", "src/lib/structureReleases.js:16"], "synthesize-profile": ["src/lib/structureReleases.js:308"],
  };
  const routes = execFileSync("git", ["ls-tree", "--name-only", `${OLD_COMMIT}:api`], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f.endsWith(".js") && !f.startsWith("_")).map((f) => f.slice(0, -3));
  const DB_ROUTES = new Set(["contact", "conference-inquiry", "og-news", "share-news"]);   // covered above (M4, M5, I29)
  for (const route of routes) {
    if (DB_ROUTES.has(route)) continue;
    const callers = ROUTE_CALLERS[route] || [];
    await check({ id: `X-${route}`.slice(0, 22), area: "old-api", at: callers, role: "owner A", call: `old /api/${route} (POST {}${["messages", "publish", "unpublish"].includes(route) ? "" : ""})` }, async () => {
      const r = await oldApi(OLDAPI, route, { who: who.COMPANY_A, body: {} });
      const blocked = r.outside.filter((e) => e.action === "block");
      if (r.status >= 500 && r.dbCalls === 0 && !blocked.length) return { ok: true, detail: `${r.status} ${short(r.body).slice(0, 90)} -- fails closed on mineex.ca's env before any DB call (same on production, schema-independent)` };
      if (r.status < 500 && r.dbCalls === 0 && !blocked.length) return { ok: true, detail: `${r.status} ${short(r.body).slice(0, 90)} -- answered before any DB call (schema-independent)` };
      if (r.dbCalls > 0 && r.status < 500) return { ok: true, detail: `${r.status} ${short(r.body).slice(0, 90)} (${r.dbCalls} DB calls)` };
      return { ok: false, detail: `${d(r)} dbCalls=${r.dbCalls} blocked=${blocked.map((e) => e.host).join(",")}` };
    });
  }

  // On-conflict targets: every upsert in the old code needs a NON-partial unique index on exactly
  // those columns, or PostgREST answers 42P10 (the 0063 failure mode). Catalog check, all of them.
  {
    const ocSites = enumerateSites().filter((s) => /on_conflict=/.test(s.text));
    const targets = [...new Map(ocSites.map((s) => { const m = /([a-z_]+)\?on_conflict=([a-z_,]+)/.exec(s.text); return [`${m[1]}(${m[2]})`, { table: m[1], cols: m[2].split(","), sites: ocSites.filter((x) => x.text.includes(`${m[1]}?on_conflict=${m[2]}`)).map((x) => x.site) }]; })).values()];
    const idx = await sql(`select c.relname tbl, x.indpred is not null partial,
        (select array_agg(a.attname::text order by k.ord) from unnest(x.indkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum) cols
      from pg_index x join pg_class c on c.oid = x.indrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and x.indisunique`);
    for (const t of targets) {
      const isConv = t.table === "conversations";
      await check({ id: `X-OC-${t.table}`.slice(0, 22), area: "old-api", at: t.sites, role: t.sites.some((s) => s.startsWith("src/")) ? "client" : "service", call: `upsert target ${t.table}(${t.cols.join(",")}) has a non-partial unique index`, known: isConv ? "K2" : undefined }, async () => {
        const want = [...t.cols].sort().join(",");
        const hits = idx.filter((i) => i.tbl === t.table && [...i.cols].sort().join(",") === want);
        if (hits.some((h) => !h.partial)) return { ok: true, detail: "unique index present" };
        return { ok: false, detail: hits.length ? "only a PARTIAL unique index matches -> 42P10 for on_conflict" : "no unique index on those columns -> 42P10", migration: isConv ? "0063_company_initiated_threads" : undefined };
      });
    }
  }

  // ------------------------------------------------- service-key mode ------
  if (OLDSVC) {
    section("OLD /api WITH A SERVICE KEY (hypothetical: mineex.ca does not have one)");
    await check({ id: "S1", area: "old-api-svc", at: ["api/messages.js:75"], role: "investor", call: "old /api/messages send with the service key: upsert conversations?on_conflict=investor_id,company_slug", known: "K2" }, async () => {
      const before = await svcRows(`messages?conversation_id=eq.${CONV_A}&select=id`);
      onCleanup("messages written by S1", async () => {
        const mine = await svcRows(`messages?body=like.${enc(`${MARK}*`)}&select=id,conversation_id`);
        if (mine.length) await svc("DELETE", `messages?id=in.(${mine.map((m) => m.id).join(",")})`);
      });
      const r = await oldApi(OLDSVC, "messages", { who: who.INVESTOR, body: { companySlug: A.slug, body: T("service-mode send") } });
      const after = await svcRows(`messages?conversation_id=eq.${CONV_A}&select=id`);
      if (r.status === 200 && r.body.ok && r.body.conversationId === CONV_A && after.length === before.length + 1) return { ok: true, detail: "200, stored in the existing thread" };
      return { ok: false, detail: `${d(r)} (stored ${after.length - before.length})`, migration: "0063_company_initiated_threads" };
    });
    await check({ id: "S1d", area: "old-api-svc", at: ["api/messages.js:75"], role: "service", call: "the exact upsert, directly (PostgREST, service role)", known: "K2" }, async () => {
      const r = await svc("POST", "conversations?on_conflict=investor_id,company_slug", { investor_id: who.INVESTOR.id, company_slug: A.slug, company_name: "Iso Alpha", ceo_email: null }, { Prefer: "resolution=merge-duplicates,return=representation" });
      return ok2(r) && r.body[0] && r.body[0].id === CONV_A ? { ok: true, detail: `${r.status} -> seeded thread` } : { ok: false, detail: d(r), migration: "0063_company_initiated_threads" };
    });
    for (const [id, route, at] of [["S2", "contact", "api/contact.js:70"], ["S3", "conference-inquiry", "api/conference-inquiry.js:66"]]) {
      await check({ id, area: "old-api-svc", at: [at], role: "anon", call: `old /api/${route} with the service key (service insert demo_bookings)` }, async () => {
        const r = await oldApi(OLDSVC, route, { body: { name: "Legacy Live", email: LEAD_EMAIL, company: `Legacy Live ${RUN}`, message: T(`${route} service`) } });
        return r.status === 200 && r.body.stored ? { ok: true, detail: `200 stored=${r.body.stored}` } : { ok: false, detail: d(r) };
      });
    }
    // A live publish leaves permanent history (release_revisions is append-only, 0051), so by default
    // publish_publication / unpublish_publication are checked in the catalog: the old handler's
    // two-argument named call must resolve and the service role must be allowed to execute it.
    // --publish-live runs the real publish + unpublish on a fixture-company draft (verified once,
    // 2026-11-02 run 97ecba04: 200 published, then unpublished) and leaves that tagged history behind.
    const rpcProbe = async (fn) => {
      const rows = await sql(`select p.oid::regprocedure::text sig, p.pronargs, p.pronargdefaults, p.proargnames,
          has_function_privilege('service_role', p.oid, 'execute') svc
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn]);
      const fit = rows.find((r) => r.svc && r.proargnames && r.proargnames[0] === "p_publication_id" && r.proargnames[1] === "p_actor" && r.pronargs - r.pronargdefaults <= 2);
      return fit ? { ok: true, detail: `${fit.sig}: callable as {p_publication_id,p_actor} (${fit.pronargdefaults} defaulted), service_role EXECUTE` } : { ok: false, detail: JSON.stringify(rows), migration: "0060/0071" };
    };
    await check({ id: "S4", area: "old-api-svc", at: ["api/publish.js:59", "api/publish.js:69"], role: "owner A", call: `old /api/publish with the service key -> publish_publication(p_publication_id,p_actor)${ARGV.includes("--publish-live") ? " (LIVE)" : " (catalog)"}` }, async () => {
      if (!ARGV.includes("--publish-live")) return rpcProbe("publish_publication");
      if (!draftPub) return { ok: false, detail: "no draft publication (C23 failed)" };
      const r = await oldApi(OLDSVC, "publish", { who: who.COMPANY_A, body: { publicationId: draftPub.id } });
      const row = (await svcRows(`publications?id=eq.${draftPub.id}&select=status`))[0];
      return r.status === 200 && r.body.ok && row.status === "published" ? { ok: true, detail: `200 published (history kept: publication ${draftPub.id})` } : { ok: false, detail: `${d(r)} status=${row && row.status}`, migration: "0060/0071" };
    });
    await check({ id: "S5", area: "old-api-svc", at: ["api/unpublish.js:36"], role: "owner A", call: `old /api/unpublish with the service key -> unpublish_publication(p_publication_id,p_actor)${ARGV.includes("--publish-live") ? " (LIVE)" : " (catalog)"}` }, async () => {
      if (!ARGV.includes("--publish-live")) return rpcProbe("unpublish_publication");
      const r = await oldApi(OLDSVC, "unpublish", { who: who.COMPANY_A, body: { publicationId: draftPub.id } });
      return r.status === 200 && r.body.ok ? { ok: true, detail: "200 unpublished" } : { ok: false, detail: d(r), migration: "0060/0071" };
    });
  }

  // ======================================================== coverage =====
  section("CALL INVENTORY COVERAGE");
  {
    const sites = enumerateSites();
    const rows = sites.map((s) => {
      const ids = cover.get(s.site) || [];
      const rule = !ids.length ? RULES.find((r) => r.re.test(`${s.site}:${s.text}`)) : null;
      return { ...s, ids, rule };
    });
    const uncovered = rows.filter((r) => !r.ids.length && !r.rule);
    const unknownCover = [...cover.keys()].filter((k) => !sites.some((s) => s.site === k));
    if (SHOW_INVENTORY) {
      console.log("\n  file:line                                          checks / rule");
      for (const r of rows) console.log(`  ${r.site.padEnd(50)} ${r.ids.length ? r.ids.join(",") : r.rule ? r.rule.id : "UNCOVERED"}   ${r.text.slice(0, 90)}`);
    }
    await check({ id: "INV", area: "inventory", at: [], role: "-", call: `every call site in ${OLD_COMMIT} src/ + api/ is exercised or ruled (${sites.length} sites)` }, async () => {
      const byCheck = rows.filter((r) => r.ids.length).length, byRule = rows.filter((r) => r.rule).length;
      if (uncovered.length || unknownCover.length) return { ok: false, detail: `uncovered: ${uncovered.map((u) => u.site).join(", ")}${unknownCover.length ? ` | checks name sites that are not call sites: ${unknownCover.join(", ")}` : ""}` };
      return { ok: true, detail: `${sites.length} sites: ${byCheck} exercised live, ${byRule} service-role sites by rule R-SVC` };
    });
  }
} catch (e) {
  failedSetup = e;
  console.error(`\n  ✗ run aborted: ${e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e}`);
} finally {
  const problems = await runCleanups().catch((e) => [String(e)]);
  if (problems.length) { counts.fail++; console.error(`\n  ✗ cleanup problems:\n      ${problems.join("\n      ")}`); }
  else console.log("\n  cleanup: every test row / object / throwaway company removed; fixture writes verified unchanged or restored");
  if (pgc) await pgc.end().catch(() => {});
  teardownHarness();
  const leftover = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).includes("legacy-mineex-");
  if (leftover) { counts.fail++; console.error("  ✗ the old-site worktree is still registered"); }
  if (failedSetup) counts.fail++;
}

const changed = results.filter((r) => r.outcome === "CHANGED");
const preex = results.filter((r) => r.outcome === "PREEXIST");
const deferred = results.filter((r) => r.outcome === "DEFERRED");
if (changed.length || deferred.length || preex.length) {
  console.log("\n  NOTES");
  for (const r of preex) console.log(`    PREEXIST ${r.id}: ${r.preexisting}`);
  for (const r of changed) console.log(`    CHANGED  ${r.id}: ${r.changed}`);
  for (const r of deferred) console.log(`    DEFERRED ${r.id}: ${r.call} -- ${DEFERRED_MIGRATIONS[r.deferred]}`);
}
console.log(`\n  legacy-mineex-live (staging): ${counts.pass} passed, ${counts.fail} failed, ${counts.known} known-break` +
  `   (${counts.changed} changed, ${counts.preexist} pre-existing, ${counts.deferred} staging-only via deferred 0061b${FIXED ? ", --fixed" : ""})\n`);
process.exit(counts.fail ? 1 : 0);
