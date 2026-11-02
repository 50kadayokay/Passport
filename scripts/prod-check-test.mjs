// scripts/prod-check.mjs, OFFLINE: fetch and pg are mocked (a stub app, a stub
// Supabase and a stub catalog answering the runner's own markers).
//   node scripts/prod-check-test.mjs
//
// Covers: argument refusals (stage, staging without --app, production with another
// app, staging with the production app, unknown flags); per-stage expectations
// (markers up to the stage read applied, later ones NOT YET; a later phase already
// applied FAILs on production and is INFO on staging); a smoke check that needs a
// later migration is NOT YET before it and FAIL after; the listing-report guard
// and the pg_cron check; every catalog statement inside BEGIN READ ONLY ...
// ROLLBACK and refused when the server says it is not read-only; no HTTP write
// beyond sign-in/sign-out (never a listing report); /api/ops for a guest and an
// admin (capHit FAILs); passwords asked hidden and never printed; the DSN rules.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCheck, parseArgs, phasesFromPlan, STAGES } from "./prod-check.mjs";
import { DEFAULT_AUDIT, loadRecord, parseQ01Markers, buildPlan, PRODUCTION_REFS, STAGING_REFS } from "./_production-migrations.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

// Built from the refs (no production URL literal: scripts/script-target-guard-test.mjs).
const PROD_SB = `https://${PRODUCTION_REFS[0]}.supabase.co`, STG_SB = `https://${STAGING_REFS[0]}.supabase.co`;
const PROD_APP = "https://mineex.ca", STG_APP = "https://staging-app.example.com";
const KEY = "sb_publishable_offline_stub_key_0123456789abcdef";
const PW = { investor: "pw-investor-SECRET-1", owner: "pw-owner-SECRET-2", admin: "pw-admin-SECRET-3" };

// ---- the stub world -----------------------------------------------------------
let W;
function world({ sb, app, hasRoles = true, hasThreads = true, capHit = false, lrAvailable = true } = {}) {
  W = { sb, app, hasRoles, hasThreads, capHit, lrAvailable, calls: [] };
}
const res = (body, status = 200, headers = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": typeof body === "string" ? "text/html" : "application/json", ...headers } });
const PAGE_H = { "strict-transport-security": "max-age=63072000", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "content-security-policy": "frame-ancestors 'self' capacitor://localhost", "x-frame-options": "SAMEORIGIN", "content-security-policy-report-only": "default-src 'self'; script-src 'self'" };
const API_H = { "strict-transport-security": "max-age=63072000", "x-content-type-options": "nosniff" };
const fetchImpl = async (input, init = {}) => {
  const u = new URL(String(input)), method = (init.method || "GET").toUpperCase(), h = init.headers || {};
  W.calls.push({ method, url: u.href, body: init.body || null });
  const tok = String(h.Authorization || "").replace(/^Bearer /, "");
  if (u.origin === W.app) {
    if (u.pathname === "/") return res(`<html><div id="root"></div><script type="module" crossorigin src="/assets/index-abc.js"></script></html>`, 200, PAGE_H);
    if (u.pathname === "/assets/index-abc.js") return res(`const a="${W.sb}";const k="${KEY}";${"x".repeat(2000)}`, 200, { "content-type": "text/javascript" });
    if (u.pathname === "/api/messages") return res({ error: "Method not allowed" }, 405, API_H);
    if (u.pathname === "/api/ops") {
      if (tok !== "tok-admin") return res({ error: "Sign in" }, 401, API_H);
      return res({ listingReports: W.lrAvailable ? { available: true, globalCount: W.capHit ? 600 : 12, globalLimit: 600, ratio: W.capHit ? 1 : 0.02, capHit: W.capHit, warn: false } : { available: false, reason: "Listing-report limits need migration 0093." } }, 200, API_H);
    }
    return res("not found", 404);
  }
  if (u.origin !== W.sb) throw new Error(`egress to ${u.origin}`);
  if (u.pathname === "/auth/v1/token") {
    const b = JSON.parse(init.body);
    const who = Object.keys(PW).find((k) => b.email === `${k}@test.invalid` && b.password === PW[k]);
    return who ? res({ access_token: `tok-${who}`, refresh_token: `rt-${who}-0123456789`, user: { id: `u-${who}` } }) : res({ error: "invalid_grant" }, 400);
  }
  if (u.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
  const m = u.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z0-9_]+)$/);
  const [, rpc, name] = m;
  if (rpc) {
    if (name === "my_features") return res(tok === "tok-owner" ? ["portal_access"] : []);
    if (name === "has_company_role") return W.hasRoles ? res(tok === "tok-owner") : res({ code: "PGRST202", message: "function not found" }, 404);
    if (name === "company_notifications" || name === "mineiq_search") return tok === "tok-owner" ? res([]) : res({ code: "42501" }, 401);
    if (name === "company_follower_count") return res(3);
    return res({ message: "no rpc" }, 404);
  }
  if (name === "mineiq_threads" && !W.hasThreads) return res({ code: "42P01", message: "relation does not exist" }, 404);
  if (name === "companies") return res(/owner_id/.test(u.search) ? [] : [{ id: "c1", slug: "acme", name: "Acme", primary_ticker: "ACM", tier: "pro" }]);
  if (name === "company_memberships") return res(tok === "tok-owner" && /user_id=eq/.test(u.search) ? [{ role: "owner", company: { id: "c1", slug: "acme", name: "Acme", status: "published" } }] : []);
  if (name === "profiles") return res(tok === "tok-investor" ? [{ role: "investor" }] : []);
  return res([]);
};

// ---- the stub catalog -----------------------------------------------------------
const record = loadRecord(DEFAULT_AUDIT);
const items = buildPlan({ files: fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")), record, log: [], q01Markers: parseQ01Markers(fs.readFileSync(record.query.split(" ")[0], "utf8")) }).items;
const fileOfCheckpoint = new Map(items.map((i) => [i.checkpoint, i.file]));
const PHASES = phasesFromPlan(fs.readFileSync("docs/PRODUCTION-ROLLOUT-PLAN.md", "utf8"));
const rank = { deploy: 2, phase3: 3, phase4: 4, phase5: 5, phase5b: 6, final: 6 };
let DB;
function db({ upTo = 2, extra = [], readOnlyOff = false, guard = {}, cron = false } = {}) {
  DB = { applied: new Set([...Object.keys(PHASES).filter((f) => PHASES[f] <= upTo), ...extra]), readOnlyOff, guard: { trig: true, exec: false, tbl: false, sel: false, tableins: false, six: 6, at: false, lim: { per_client: 5, client_window_minutes: 10, per_network: 20, network_window_minutes: 60, global_per_window: 600, global_window_minutes: 60 }, ...guard }, cron, log: [], dsn: null, inTx: false, ended: false };
}
const pgConnect = async (dsn) => {
  DB.dsn = dsn;
  return {
    async query(sql) {
      DB.log.push({ sql, inTx: DB.inTx });
      if (sql === "begin read only") { DB.inTx = true; return { rows: [] }; }
      if (sql === "rollback") { DB.inTx = false; return { rows: [] }; }
      if (/^set local /.test(sql)) return { rows: [] };
      if (sql === "show transaction_read_only") return { rows: [{ transaction_read_only: DB.readOnlyOff ? "off" : "on" }] };
      if (fileOfCheckpoint.has(sql)) return { rows: [{ applied: DB.applied.has(fileOfCheckpoint.get(sql)) }] };
      if (/listing_reports_guard/.test(sql) && /row_to_json/.test(sql)) return { rows: [DB.guard] };
      if (/to_regclass\('cron\.job'\)/.test(sql)) return { rows: [{ has_cron: DB.cron }] };
      if (/from cron\.job/.test(sql)) return { rows: [{ active: DB.cronActive || 0, inactive: DB.cronInactive || 0 }] };
      throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
    },
    async end() { DB.ended = true; },
  };
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prodcheck-"));
const dsnFile = path.join(tmp, "prod.dsn");
fs.writeFileSync(dsnFile, "postgres://postgres:dsn-SECRET-pw@db.rvptronniomlqumjhyrr.supabase.co:5432/postgres", { mode: 0o600 });
const READS = { "supabase/staging/.connection": "postgres://postgres:stg@db.jmljfovtfxcdhjmtlnva.supabase.co:5432/postgres" };
const read = (f) => (f in READS ? READS[f] : fs.readFileSync(f, "utf8"));

const asked = [];
const askWith = (answers) => async (q, opts = {}) => { asked.push({ q, hidden: !!opts.hidden }); return answers.shift() ?? ""; };
const ALL = () => ["investor@test.invalid", PW.investor, "owner@test.invalid", PW.owner, "", "admin@test.invalid", PW.admin, ""];
async function run(argv, { answers = null, env = { PRODUCTION_DSN_FILE: dsnFile } } = {}) {
  const lines = [];
  const r = await runCheck({ argv, env, fetchImpl, pgConnect, ask: answers ? askWith(answers) : null, out: (s) => lines.push(String(s)), err: (s) => lines.push(String(s)), read });
  const text = lines.join("\n");
  const kinds = (k) => text.split("\n").filter((l) => l.startsWith(`  ${k.padEnd(10)}`));
  return { ...r, text, kinds };
}

console.log("\n  ARGUMENTS");
for (const [argv, why] of [[["--stage=bogus"], /--stage must be/], [["--stage=deploy", "--staging"], /needs --app/], [["--stage=deploy", "--app", "https://evil.example"], /production checks run against/], [["--stage=deploy", "--staging", "--app", PROD_APP], /production web app/], [["--stage=deploy", "--frobnicate"], /unknown argument/]]) {
  const a = parseArgs(argv);
  ok(a.refuse && why.test(a.refuse), `refuses ${argv.join(" ")}`, a.refuse);
}
ok(parseArgs(["--stage=phase3"]).target.production === true && parseArgs(["--stage", "final", "--staging", "--app", STG_APP]).target.production === false, "production by default; --staging targets staging");
ok(STAGES.join() === "deploy,phase3,phase4,phase5,phase5b,final", "the six stages");
ok(Object.keys(PHASES).length === items.length && items.every((i) => PHASES[i.file]), `every pending migration has a phase in the plan (${items.length})`);
const r0 = await run(["--stage=bogus"]);
ok(r0.code === 2 && W === undefined, "a refusal exits 2 before any request");

console.log("\n  DEPLOY (production, nothing migrated)");
world({ sb: PROD_SB, app: PROD_APP, hasRoles: false, hasThreads: false, lrAvailable: false });
db({ upTo: 2 });
asked.length = 0;
let r = await run(["--stage=deploy"], { answers: ALL() });
ok(r.kinds("NOT YET").filter((l) => /\.sql: not applied yet/.test(l)).length === items.length && !r.kinds("FAIL").length, `all ${items.length} migrations NOT YET, nothing failed`, r.kinds("FAIL").join("\n"));
ok(r.kinds("NOT YET").some((l) => /the server counts them as a manager.*0076_company_roles/.test(l)) && r.kinds("NOT YET").some((l) => /Mine IQ conversations load.*0066/.test(l)), "smoke checks that need 0076 / 0066 are NOT YET before their phase");
ok(r.kinds("PASS").some((l) => /refuses an investor/.test(l)) && r.kinds("PASS").some((l) => /follower count/.test(l)) && r.kinds("PASS").some((l) => /CSP Report-Only/.test(l)), "smoke ran: Mine IQ refused to an investor, follower count, CSP Report-Only");
ok(r.kinds("PASS").some((l) => /\/api\/ops refuses a guest/.test(l)) && r.kinds("PASS").some((l) => /\/api\/ops answers a platform admin/.test(l)), "/api/ops: guest 401, admin reaches it (limit not yet)");
ok(r.kinds("NOT YET").some((l) => /listing-report guard/.test(l)) && r.kinds("PASS").some((l) => /no pg_cron/.test(l)), "the listing-report guard is NOT YET; no pg_cron drain");
ok(r.verdict === "PASS" && r.code === 0, `verdict PASS (${r.verdict})`, [...r.kinds("INCOMPLETE"), ...r.kinds("FAIL")].join("\n"));
ok(asked.filter((a) => /password/.test(a.q)).every((a) => a.hidden) && asked.filter((a) => /email/.test(a.q)).every((a) => !a.hidden), "passwords are asked hidden");
ok(!Object.values(PW).some((p) => r.text.includes(p)) && !r.text.includes("dsn-SECRET-pw") && !/\b(tok|rt)-(investor|owner|admin)/.test(r.text), "no password, token or DSN in the output", r.text.split("\n").filter((l) => /SECRET|\b(tok|rt)-(investor|owner|admin)/.test(l)).join("\n"));
const writes = W.calls.filter((c) => !["GET", "HEAD"].includes(c.method));
ok(writes.every((c) => /\/auth\/v1\/(token\?grant_type=password|logout)$|\/rest\/v1\/rpc\/(company_follower_count|my_features|company_notifications|has_company_role|mineiq_search)$/.test(c.url)), `the only non-GET requests are sign-in, sign-out and read-only RPCs (${writes.length})`);
ok(!W.calls.some((c) => /listing_reports/.test(c.url)), "no request touches listing_reports");
ok(DB.log.filter((x) => !["begin read only", "rollback"].includes(x.sql)).every((x) => x.inTx) && DB.ended && DB.dsn.includes("rvptronniomlqumjhyrr"), "every catalog statement ran inside BEGIN READ ONLY ... ROLLBACK, on the production DSN, and the client closed");
ok(DB.log.every((x) => /^(begin read only|rollback|set local (statement|lock)_timeout|show transaction_read_only|select )/.test(x.sql.trim())), "the catalog only ever SELECTs");

const src = fs.readFileSync("scripts/prod-check.mjs", "utf8");
const sendFn = src.slice(src.indexOf("const send = async (method, url"), src.indexOf("};", src.indexOf("const send = async (method, url")));
ok(/const why = refuseRequest\(method, url, target\);\s*if \(why\) throw/.test(sendFn) && sendFn.indexOf("refuseRequest") < sendFn.indexOf("fetchImpl"), "prod-check's own requests pass production-smoke's read-only guard before fetch");
ok(!/fetchImpl\(/.test(src.replace(sendFn, "").replace(/runSmoke\(\{[^}]*fetchImpl[^}]*\}\)/, "")), "...and it makes no request any other way");

console.log("\n  PHASE 3");
world({ sb: PROD_SB, app: PROD_APP, hasRoles: false, hasThreads: false });
db({ upTo: 3 });
r = await run(["--stage=phase3"], { answers: ALL() });
ok(r.kinds("PASS").filter((l) => /\.sql: applied/.test(l)).length === Object.values(PHASES).filter((p) => p === 3).length && !r.kinds("FAIL").length, "phase 3's migrations applied, the rest NOT YET, nothing failed", r.kinds("FAIL").join("\n"));
ok(r.kinds("PASS").some((l) => /listing_reports_guard trigger/.test(l)) && r.kinds("PASS").some((l) => /six report columns only/.test(l)) && r.kinds("PASS").some((l) => /global 600\/60/.test(l)), "the listing-report guard: trigger, six-column grant, limits row");
ok(r.kinds("PASS").some((l) => /listing-report limit: 12 of 600/.test(l)), "/api/ops reports the limit for the admin");
db({ upTo: 3, extra: ["0062_message_attachments.sql"] });
r = await run(["--stage=phase3"], { answers: ALL() });
ok(r.kinds("FAIL").some((l) => /0062_message_attachments\.sql: not applied before its phase/.test(l)) && r.code === 1, "production: a phase-4 migration already applied FAILs (ahead of the plan)");
db({ upTo: 2 });
r = await run(["--stage=phase3"], { answers: ALL() });
ok(r.kinds("FAIL").some((l) => /0093_listing_reports_rate_limit\.sql: applied \(this stage is past its phase\)/.test(l)), "a phase-3 migration missing at phase3 FAILs");
db({ upTo: 3, guard: { exec: true } });
r = await run(["--stage=phase3"], { answers: ALL() });
ok(r.kinds("FAIL").some((l) => /cannot execute 0093's functions/.test(l)), "a client able to execute 0093's functions FAILs");
world({ sb: PROD_SB, app: PROD_APP, hasRoles: false, hasThreads: false, capHit: true });
db({ upTo: 3 });
r = await run(["--stage=phase3"], { answers: ALL() });
ok(r.kinds("FAIL").some((l) => /global cap is NOT full/.test(l)), "a full listing-report cap FAILs the stage");

console.log("\n  PHASE 5 AND FINAL");
world({ sb: PROD_SB, app: PROD_APP, hasRoles: false, hasThreads: true });
db({ upTo: 5 });
r = await run(["--stage=phase5"], { answers: ALL() });
ok(r.kinds("FAIL").some((l) => /the server counts them as a manager/.test(l)), "after phase 5 a missing has_company_role (0076) is a FAIL, not NOT YET");
world({ sb: PROD_SB, app: PROD_APP });
db({ upTo: 6 });
r = await run(["--stage=final"], { answers: ALL() });
ok(r.verdict === "PASS" && r.kinds("PASS").filter((l) => /\.sql: applied/.test(l)).length === items.length && !r.kinds("NOT YET").some((l) => /\.sql/.test(l)), `final: all ${items.length} applied, PASS`, r.kinds("FAIL").join("\n"));

console.log("\n  STAGING DRY RUN");
world({ sb: STG_SB, app: STG_APP });
db({ upTo: 6 });
r = await run(["--stage=deploy", "--staging", "--app", STG_APP], { answers: ALL(), env: {} });
ok(r.kinds("INFO").filter((l) => /ahead of this stage/.test(l)).length === items.length && !r.kinds("FAIL").length && DB.dsn.includes("jmljfovtfxcdhjmtlnva"), "staging has everything: INFO, not FAIL; the staging connection is used");
ok(!W.calls.some((c) => c.url.includes("rvptronniomlqumjhyrr") || c.url.includes("mineex.ca")), "a staging run never contacts production");

console.log("\n  SCHEDULED DRAIN (pg_cron)");
world({ sb: PROD_SB, app: PROD_APP });
for (const [label, cron, active, inactive, want] of [["absent", false, 0, 0, "absent"], ["present, one INACTIVE outbox-drain job", true, 0, 1, "inactive"], ["present, one ACTIVE job", true, 1, 0, "active"]]) {
  db({ upTo: 6, cron }); DB.cronActive = active; DB.cronInactive = inactive;
  r = await run(["--stage=final"], { answers: ALL() });
  if (want === "absent") ok(r.kinds("PASS").some((l) => /no pg_cron/.test(l)) && r.verdict === "PASS", `pg_cron ${label}: PASS`);
  if (want === "inactive") ok(r.kinds("PASS").some((l) => /no active scheduled outbox drain/.test(l)) && r.kinds("INFO").some((l) => /INACTIVE/.test(l)) && r.verdict === "PASS", `pg_cron ${label}: PASS, reported as INFO`);
  if (want === "active") ok(r.kinds("FAIL").some((l) => /no ACTIVE scheduled outbox drain/.test(l)) && r.code === 1, `pg_cron ${label}: FAIL`);
}

console.log("\n  READ-ONLY, ACCOUNTS AND DSN");
world({ sb: PROD_SB, app: PROD_APP });
db({ upTo: 6, readOnlyOff: true });
r = await run(["--stage=final"], { answers: ALL() });
ok(r.kinds("FAIL").some((l) => /not read-only/.test(l)) && !r.kinds("PASS").some((l) => /\.sql: applied/.test(l)), "a transaction the server does not report read-only stops every catalog check");
db({ upTo: 6 });
r = await run(["--stage=final", "--no-accounts"]);
ok(r.verdict === "INCOMPLETE" && r.code === 3 && r.kinds("INCOMPLETE").some((l) => /accounts/.test(l)), "without accounts: INCOMPLETE (exit 3)");
r = await run(["--stage=final"], { answers: ALL(), env: {} });
ok(r.kinds("INCOMPLETE").some((l) => /PRODUCTION_DSN_FILE/.test(l)) && r.verdict === "INCOMPLETE", "no PRODUCTION_DSN_FILE: catalog INCOMPLETE, never a guess");
const inRepo = path.join(process.cwd(), "supabase", "zz-prodcheck.dsn");
fs.writeFileSync(inRepo, fs.readFileSync(dsnFile, "utf8"), { mode: 0o600 });
try { r = await run(["--stage=final"], { answers: ALL(), env: { PRODUCTION_DSN_FILE: inRepo } }); } finally { fs.rmSync(inRepo, { force: true }); }
ok(r.kinds("INCOMPLETE").some((l) => /inside the repository/.test(l)), "a DSN file inside the repo is refused (the runner's rule)");

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
