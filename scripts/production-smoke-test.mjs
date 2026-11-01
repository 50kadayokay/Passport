// production-smoke (g11) offline: the real scripts/production-smoke.mjs against
// a mocked web app and Supabase.   node scripts/production-smoke-test.mjs
//
// OFFLINE. fetch is a function in this file; nothing leaves the process. Proves:
// a healthy target PASSES; each regression the smoke exists for FAILS it; missing
// accounts or --api-only make it INCOMPLETE (never PASS); every request it makes
// is one of the read-only kinds; no token, key or password reaches the output;
// and the target is never implied.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { parseTarget, refuseRequest, runSmoke, makeRedactor, anonKeyFromBundle, READ_RPCS, PAGE_HEADERS } from "./production-smoke.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const APP = "https://app.example.test", SB = "https://stubref0000000000000.supabase.co";
const jwt = (p) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(p)).toString("base64url")}.c2lnbmF0dXJlLXN0dWI`;
const ANON = jwt({ role: "anon", ref: "stubref0000000000000" });
const SERVICE = jwt({ role: "service_role", ref: "stubref0000000000000" });
const CO = "aaaaaaaa-0000-4000-8000-00000000000a";
const PW = { investor: "inv-pass-Zq81x", owner: "own-pass-Kp27y", viewer: "vw-pass-Lm93z" };
const TOK = { investor: "tok-investor-0123456789", owner: "tok-owner-0123456789", viewer: "tok-viewer-0123456789" };
const UID = { investor: "u-investor", owner: "u-owner", viewer: "u-viewer" };
const ENV = {
  SMOKE_INVESTOR_EMAIL: "inv@stub.invalid", SMOKE_INVESTOR_PASSWORD: PW.investor,
  SMOKE_OWNER_EMAIL: "own@stub.invalid", SMOKE_OWNER_PASSWORD: PW.owner,
  SMOKE_VIEWER_EMAIL: "vw@stub.invalid", SMOKE_VIEWER_PASSWORD: PW.viewer,
};
const TARGET = { app: APP, supabase: SB, ref: "stubref0000000000000", production: false, apiOnly: false };
const SAFE_HEADERS = { "strict-transport-security": "max-age=63072000", ...PAGE_HEADERS };
const API_HEADERS = { "strict-transport-security": "max-age=63072000", "x-content-type-options": "nosniff" };

/** A healthy deployment; `bug` names one regression to introduce. */
function world(bug = null) {
  const calls = [];
  const res = (status, body, headers = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  const who = (h) => Object.keys(TOK).find((k) => (h.authorization || h.Authorization) === `Bearer ${TOK[k]}`) || "anon";
  const roleIn = { owner: "owner", viewer: bug === "viewer-is-admin" ? "admin" : "viewer" };
  const fetchImpl = async (href, init = {}) => {
    const u = new URL(href), method = init.method || "GET", h = init.headers || {};
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, href, body });
    const pageHeaders = bug === "no-nosniff" ? { ...SAFE_HEADERS, "x-content-type-options": "" }
      : bug === "xfo-deny" ? { ...SAFE_HEADERS, "x-frame-options": "DENY" }
      : bug === "referrer-unsafe" ? { ...SAFE_HEADERS, "referrer-policy": "unsafe-url" } : SAFE_HEADERS;
    if (u.origin === APP) {
      if (u.pathname === "/") return res(200, `<!doctype html><div id="root"></div><script type="module" crossorigin src="/assets/index-abc.js"></script>`, { ...pageHeaders, "content-type": "text/html" });
      if (u.pathname === "/assets/index-abc.js") return res(200, `const u="${bug === "bundle-elsewhere" ? "https://other.supabase.co" : SB}",k="${ANON}",s="${SERVICE}";` + "x".repeat(2000), { "content-type": "text/javascript" });
      if (u.pathname === "/api/messages") return res(method === "GET" ? 405 : 401, { ok: false }, bug === "no-nosniff" ? { ...API_HEADERS, "x-content-type-options": "" } : bug === "api-framing-headers" ? pageHeaders : API_HEADERS);
      return res(404, {});
    }
    if (h.apikey !== ANON) return res(401, { message: "no api key" });
    const as = who(h);
    if (u.pathname === "/auth/v1/token") {
      const k = Object.keys(PW).find((x) => ENV[`SMOKE_${x.toUpperCase()}_EMAIL`] === body.email && PW[x] === body.password);
      return k ? res(200, { access_token: TOK[k], refresh_token: `refresh-${TOK[k]}`, user: { id: UID[k] } }) : res(400, { error: "invalid_grant" });
    }
    if (u.pathname === "/auth/v1/logout") return res(204, "");
    const p = u.pathname.replace("/rest/v1/", ""), q = u.searchParams;
    if (p === "news_public") return bug === "feed-500" ? res(500, { message: "boom" }) : res(200, [{ id: "n1" }]);
    if (p === "companies") {
      if ((q.get("select") || "").includes("owner_id") && as === "anon") return bug === "owner-id-leak" ? res(200, [{ owner_id: UID.owner }]) : res(401, { code: "42501" });
      return res(200, [{ id: CO, slug: "alpha-gold", name: "Alpha Gold" }]);
    }
    if (p === "posts") return res(200, []);
    if (p === "company_memberships") {
      if (as === "owner") return res(200, [{ role: "owner", company: { id: CO, slug: "alpha-gold", name: "Alpha Gold", status: "published" } }]);
      if (as === "viewer") return res(200, [{ role: roleIn.viewer }]);
      return res(as === "anon" ? 401 : 200, as === "anon" ? { code: "42501" } : []);
    }
    if (p === "profiles") return as === "investor" ? res(200, [{ role: "investor" }]) : res(as === "anon" ? 401 : 200, as === "anon" ? {} : []);
    if (p === "mineiq_threads" || p === "company_subscriptions") {
      if (as === "anon") return p === "mineiq_threads" && bug === "anon-reads-private" ? res(200, [{ id: "t1" }]) : res(401, {});
      return res(200, []);
    }
    if (["investor_profiles", "company_notification_reads", "mineiq_messages", "facts", "conversations", "push_tokens"].includes(p)) return res(401, {});
    const rpc = p.match(/^rpc\/(.+)$/);
    if (rpc) {
      const role = roleIn[as] || null;
      if (rpc[1] === "has_company_role") return res(200, body.p_roles.includes(role));
      if (rpc[1] === "my_features") return res(200, role ? ["portal_access"] : []);
      if (rpc[1] === "company_follower_count") return res(200, 3);
      if (rpc[1] === "company_notifications" || rpc[1] === "mineiq_search") {
        if (!role) return res(as === "anon" ? 401 : 403, { code: "42501" });
        return res(200, []);
      }
    }
    return res(404, { message: `unmocked ${method} ${p}` });
  };
  return { fetchImpl, calls };
}

async function run(opts = {}) {
  const w = world(opts.bug);
  const lines = [];
  const r = await runSmoke({ target: { ...TARGET, ...(opts.target || {}) }, env: opts.env || ENV, fetchImpl: w.fetchImpl, out: (m) => lines.push(m), err: (m) => lines.push(m) });
  return { ...r, calls: w.calls, text: lines.join("\n") };
}

console.log("\n  HEALTHY TARGET");
const good = await run();
ok(good.verdict === "PASS" && good.fail === 0 && good.skip === 0, `every check passes (${good.pass}), nothing skipped -> PASS`, good.text.split("\n").filter((l) => /✗|SKIP/.test(l)).join("\n"));
for (const m of ["the page loads", "the bundle names the Supabase project given", "Strict-Transport-Security", "page: CSP frame-ancestors 'self' capacitor://localhost", "page: X-Frame-Options SAMEORIGIN", "page: Referrer-Policy strict-origin-when-cross-origin", "API: no page-only framing headers", "a guest reads nothing from facts", "sees their company as owner (alpha-gold)", "Mine IQ search answers", "a company profile loads (alpha-gold)", "Mine IQ, the company's own knowledge, refuses an investor", "the server refuses a viewer Clear all (0090)", "the server refuses a viewer profile edits (0072)", "no 5xx in"]) {
  ok(good.text.includes(m), `checked: ${m}`);
}

console.log("\n  READ-ONLY");
ok(good.calls.every((c) => !refuseRequest(c.method, c.href, TARGET)), `all ${good.calls.length} requests are read-only kinds`);
const posts = good.calls.filter((c) => c.method === "POST").map((c) => new URL(c.href).pathname);
ok(posts.every((p) => p === "/auth/v1/token" || p === "/auth/v1/logout" || READ_RPCS.includes(p.replace("/rest/v1/rpc/", ""))), "POSTs are only sign-in, sign-out and the read-only RPCs");
ok(posts.filter((p) => p === "/auth/v1/logout").length === 3, "each of the three sessions is signed out at the end");
ok(!good.calls.some((c) => /mark_notifications_(cleared|seen)|save_profile_draft/.test(c.href)), "never calls Clear all, mark seen or a draft save (refusals are asked of has_company_role)");
ok(refuseRequest("POST", `${SB}/rest/v1/rpc/mark_notifications_cleared`, TARGET), "the guard refuses the Clear all RPC");
ok(refuseRequest("PATCH", `${SB}/rest/v1/companies?id=eq.${CO}`, TARGET) && refuseRequest("DELETE", `${SB}/rest/v1/posts`, TARGET) && refuseRequest("POST", `${SB}/rest/v1/posts`, TARGET), "...and PATCH, DELETE and table inserts");
ok(refuseRequest("POST", `${SB}/auth/v1/signup`, TARGET) && refuseRequest("POST", `${SB}/auth/v1/token?grant_type=refresh_token`, TARGET) && refuseRequest("POST", `${APP}/api/messages`, TARGET), "...and sign-up, token refresh and any API POST");
ok(refuseRequest("GET", "https://elsewhere.example/", TARGET) && refuseRequest("GET", "https://rvptronniomlqumjhyrr.supabase.co/rest/v1/news_public", TARGET), "...and any origin that is not the target");
ok((fs.readFileSync("scripts/production-smoke.mjs", "utf8").match(/fetchImpl\(/g) || []).length === 1, "send() is the only place the script calls fetch");
{
  const errs = [];
  const r = await runSmoke({ target: TARGET, env: {}, fetchImpl: async () => { throw new Error("network down"); }, out: () => {}, err: (m) => errs.push(m) });
  ok(r.verdict === "FAIL" && errs.some((m) => /the run completed[\s\S]*network down/.test(m)), "a network error is reported as a failure, not a pass", `${r.verdict}`);
}

console.log("\n  SECRETS NEVER PRINTED");
const leaks = [ANON, SERVICE, ...Object.values(PW), ...Object.values(TOK), "refresh-tok"].filter((s) => good.text.includes(s));
ok(leaks.length === 0, "no anon key, service key, password or token in the output", leaks.join(", "));
{
  const red = makeRedactor(["pw-123456"]);
  const s = red(`pw-123456 ${ANON} sb_publishable_abcdefghijklmnop {"access_token":"x","refresh_token":"y"}`);
  ok(!/pw-123456|eyJ|sb_publishable_abc|"x"|"y"/.test(s), "the redactor removes passwords, JWTs, sb_ keys and token fields");
}
ok(anonKeyFromBundle(`a="${SERVICE}";b="${ANON}"`, "stubref0000000000000") === ANON, "the key read from the bundle is the anon one, never a service_role key");
ok(anonKeyFromBundle(`a="${jwt({ role: "anon", ref: "otherref" })}"`, "stubref0000000000000") === null, "...and only one for the project given");

console.log("\n  EACH REGRESSION FAILS THE RUN");
for (const [bug, expect] of [
  ["viewer-is-admin", "the server refuses a viewer Clear all"],
  ["feed-500", "no 5xx in"],
  ["no-nosniff", "page: X-Content-Type-Options nosniff"],
  ["anon-reads-private", "a guest reads nothing from mineiq_threads"],
  ["owner-id-leak", "a guest cannot read owner_id"],
  ["xfo-deny", "page: X-Frame-Options SAMEORIGIN"],
  ["referrer-unsafe", "page: Referrer-Policy"],
  ["api-framing-headers", "API: no page-only framing headers"],
  ["bundle-elsewhere", "the bundle names the Supabase project given"],
]) {
  const r = await run({ bug });
  ok(r.verdict === "FAIL" && new RegExp(`✗ ${expect.replace(/[()]/g, "\\$&")}`).test(r.text), `${bug}: FAIL at "${expect}"`, r.text.split("\n").filter((l) => l.includes("✗")).join(" | "));
}

console.log("\n  NEVER A PASS WITHOUT EVERY CHECK");
{
  const r = await run({ env: {} });
  ok(r.verdict === "INCOMPLETE" && r.fail === 0 && /SKIP OWNER/.test(r.text) && /SKIP INVESTOR/.test(r.text), "no accounts (g07 pending): INCOMPLETE, anon and headers still checked", `${r.verdict} ${r.fail}`);
  ok(!r.calls.some((c) => c.href.includes("/auth/v1/token")), "...and no sign-in is attempted");
  const a = await run({ target: { apiOnly: true }, env: { ...ENV, SMOKE_ANON_KEY: ANON } });
  ok(a.verdict === "INCOMPLETE" && a.fail === 0 && !a.calls.some((c) => new URL(c.href).pathname === "/"), "--api-only: page and headers SKIPPED, never PASS", `${a.verdict} ${a.fail}`);
  const n = await run({ target: { apiOnly: true }, env: ENV });
  ok(n.verdict === "FAIL" && /a publishable key/.test(n.text), "--api-only without SMOKE_ANON_KEY: FAIL, nothing runs");
}

console.log("\n  TARGET IS NEVER IMPLIED");
const t = (s) => parseTarget(s.split(" ").filter(Boolean));
ok(t("").refuse && t(`--app ${APP}`).refuse && t(`--supabase ${SB}`).refuse, "--app and --supabase are both required");
ok(/PRODUCTION/.test(t(`--app ${APP} --supabase https://rvptronniomlqumjhyrr.supabase.co`).refuse || ""), "the production project without --production: refused");
ok(t(`--app ${APP} --supabase https://rvptronniomlqumjhyrr.supabase.co --production`).production === true, "...with --production: allowed, marked production");
ok(/not the production project/.test(t(`--app ${APP} --supabase https://jmljfovtfxcdhjmtlnva.supabase.co --production`).refuse || ""), "--production on staging: refused (a mistyped URL is not taken for the one meant)");
ok(t(`--app http://app.example.test --supabase ${SB}`).refuse && t(`--app ${APP} --supabase http://x.supabase.co`).refuse, "plain http is refused off loopback");
ok(!t("--app http://127.0.0.1:8913 --supabase https://jmljfovtfxcdhjmtlnva.supabase.co --api-only").refuse, "loopback http (the staging API emulator) is allowed");
ok(t(`--app https://u:p@app.example.test --supabase ${SB}`).refuse, "a URL carrying credentials is refused");
{
  const clean = { PATH: process.env.PATH, HOME: process.env.HOME };
  const r1 = spawnSync(process.execPath, ["scripts/production-smoke.mjs"], { env: clean, encoding: "utf8", timeout: 20000 });
  ok(r1.status === 2 && /REFUSING -- pass the target explicitly/.test(r1.stderr), "the CLI with nothing set exits 2 before any request", `${r1.status}`);
  const r2 = spawnSync(process.execPath, ["scripts/production-smoke.mjs", "--app", APP, "--supabase", "https://rvptronniomlqumjhyrr.supabase.co"], { env: clean, encoding: "utf8", timeout: 20000 });
  ok(r2.status === 2 && /PRODUCTION/.test(r2.stderr), "the CLI pointed at production without --production exits 2", `${r2.status}`);
}

console.log(`\n  production-smoke offline: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
