// Staging tripwire + egress allowlist — regression tests.
//   node scripts/staging-guard-test.mjs            # offline: no network at all
//   node scripts/staging-guard-test.mjs --network  # + one allowed call to STAGING
//
// Every scenario runs in a FRESH child process with an environment built here
// from nothing (only PATH is inherited), because the tripwire fires at import
// and a module can only be imported once per process. No credential is read
// except, with --network, the staging publishable key, which is passed to the
// child and never printed.
//
// What must hold:
//   • Production behaviour is unchanged when MINEEX_ENV is unset.
//   • On staging, every configuration that could reach production, or arm a
//     live channel, stops the process at import.
//   • On staging, no request can leave for a host that is not allowed: not by
//     fetch, a Request object, a redirect, node:https, node:http2 or a raw
//     socket -- and nothing is sent for a mocked provider.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const NETWORK = process.argv.includes("--network");
const STAGING_URL = "https://jmljfovtfxcdhjmtlnva.supabase.co";
const PROD_URL = "https://rvptronniomlqumjhyrr.supabase.co";
const FAKE_ANON = "sb_publishable_stagingFixtureKey_00000000";   // shape-valid, not a real key

let pass = 0, fail = 0;
const ok = (c, m, extra = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${extra ? `\n      ${extra}` : ""}`); } };

/** Run `code` as an ES module in a clean child. Returns { code, out, err }. */
function child(env, code) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: ROOT, env: { PATH: process.env.PATH, ...env }, encoding: "utf8", timeout: 20000,
  });
  return { status: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
const STAGING_ENV = { MINEEX_ENV: "staging", VITE_SUPABASE_URL: STAGING_URL, VITE_SUPABASE_ANON_KEY: FAKE_ANON };
const IMPORT = `const m = await import("./api/_supabase.js"); console.log(JSON.stringify({ url: m.SB_URL }));`;
const refused = (r) => r.status !== 0 && /staging tripwire/.test(r.err);
const leaks = (r, ...secrets) => secrets.some((s) => s && (r.out.includes(s) || r.err.includes(s)));

// =================================================================== tripwire ==
console.log("\n  TRIPWIRE");
{
  const r = child({}, IMPORT);
  ok(r.status === 0 && JSON.parse(r.out || "{}").url === PROD_URL,
     "production behaviour unchanged: MINEEX_ENV unset, no URL -> production fallback still applies", r.err);
}
{
  const r = child(STAGING_ENV, IMPORT);
  ok(r.status === 0 && JSON.parse(r.out || "{}").url === STAGING_URL, "valid staging config imports and resolves to staging", r.err.slice(0, 300));
}
const cases = [
  ["staging, URL missing (no fallback)",              { ...STAGING_ENV, VITE_SUPABASE_URL: "" }],
  ["staging, URL is production",                       { ...STAGING_ENV, VITE_SUPABASE_URL: PROD_URL }],
  ["staging, URL is garbage",                          { ...STAGING_ENV, VITE_SUPABASE_URL: "[SENSITIVE]" }],
  ["staging, URL is a look-alike host",                { ...STAGING_ENV, VITE_SUPABASE_URL: "https://jmljfovtfxcdhjmtlnva.supabase.co.evil.example" }],
  ["staging, anon key missing (no fallback)",          { ...STAGING_ENV, VITE_SUPABASE_ANON_KEY: "" }],
  ["staging, anon key is production's",                { ...STAGING_ENV, VITE_SUPABASE_ANON_KEY: "sb_publishable_NNxikHZSGZ0CYnzN7jckLg_vPvrRCTl" }],
  ["staging, production-named service key present",    { ...STAGING_ENV, SUPABASE_SERVICE_KEY: "sb_secret_notarealkey000000" }],
  ["staging, SUPABASE_SERVICE_ROLE_KEY present",       { ...STAGING_ENV, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_notarealkey000000" }],
  ["staging, a real-looking Anthropic key",            { ...STAGING_ENV, ANTHROPIC_API_KEY: "sk-ant-notarealkey" }],
  ["staging, a real-looking OpenAI key",               { ...STAGING_ENV, OPENAI_API_KEY: "sk-proj-notarealkey" }],
  ["staging, a real-looking Postmark token",           { ...STAGING_ENV, POSTMARK_SERVER_TOKEN: "00000000-0000-0000-0000-000000000000" }],
  ["staging, a LIVE Stripe key",                       { ...STAGING_ENV, STRIPE_SECRET_KEY: "sk_live_notarealkey" }],
  ["staging, PUSH_ENABLED=true",                       { ...STAGING_ENV, PUSH_ENABLED: "true" }],
  ["staging, APNs credentials present",                { ...STAGING_ENV, APNS_P8: "-----BEGIN PRIVATE KEY-----x" }],
  ["staging, FCM credentials present",                 { ...STAGING_ENV, FCM_PRIVATE_KEY: "x" }],
  ["staging, CRON_SECRET present",                     { ...STAGING_ENV, CRON_SECRET: "x" }],
  ["staging, news auto-create armed",                  { ...STAGING_ENV, NEWS_AUTOCREATE_ENABLED: "true" }],
  ["staging, any other var names production",          { ...STAGING_ENV, PUBLIC_BASE_URL: PROD_URL }],
  ["MINEEX_ENV misspelled ('Staging')",                { ...STAGING_ENV, MINEEX_ENV: "Staging" }],
  ["staging URL WITHOUT MINEEX_ENV (no egress guard)", { VITE_SUPABASE_URL: STAGING_URL, VITE_SUPABASE_ANON_KEY: FAKE_ANON }],
  ["staging service key WITHOUT MINEEX_ENV",           { STAGING_SUPABASE_SERVICE_ROLE_KEY: "sb_secret_notarealkey000000" }],
];
for (const [name, env] of cases) {
  const r = child(env, IMPORT);
  ok(refused(r), `refused at import: ${name}`, `exit ${r.status}; ${r.err.split("\n")[0].slice(0, 200)}`);
  ok(!leaks(r, "notarealkey", "sk-ant-notarealkey", "00000000-0000-0000-0000-000000000000"),
     `  ...and the refusal names the variable, never its value`);
}
{
  // Every routable handler reaches _supabase.js, so the tripwire covers all of
  // them: importing a handler under a bad config must fail too.
  const r = child({ ...STAGING_ENV, VITE_SUPABASE_URL: PROD_URL }, `await import("./api/stripe-webhook.js");`);
  ok(refused(r), "importing a HANDLER (stripe-webhook) under a production URL fails at import");
}

// ============================================================ browser build ==
console.log("\n  BROWSER BUILD (vite.config.js decides the bundle's project)");
const VITE_CFG = `const m = await import("./vite.config.js"); m.default({ mode: "production", command: "build" });
  console.log(JSON.stringify({ flag: process.env.VITE_MINEEX_ENV || null }));`;
{
  const r = child({ HOME: process.env.HOME }, VITE_CFG);
  ok(r.status === 0, "production build config unchanged (no MINEEX_ENV)", r.err.slice(0, 300));
}
{
  const r = child({ HOME: process.env.HOME, ...STAGING_ENV }, VITE_CFG);
  let j = {}; try { j = JSON.parse(r.out.split("\n").pop()); } catch {}
  ok(r.status === 0 && j.flag === "staging", "staging build config passes VITE_MINEEX_ENV=staging to the client", r.err.slice(0, 300));
}
for (const [name, env] of [
  ["staging build with no URL (would have shipped a production bundle)", { MINEEX_ENV: "staging", VITE_SUPABASE_ANON_KEY: FAKE_ANON }],
  ["staging build aimed at production",                                  { ...STAGING_ENV, VITE_SUPABASE_URL: PROD_URL }],
  ["staging build with no anon key",                                     { MINEEX_ENV: "staging", VITE_SUPABASE_URL: STAGING_URL }],
  ["a bundle aimed at staging without the flag",                         { VITE_SUPABASE_URL: STAGING_URL, VITE_SUPABASE_ANON_KEY: FAKE_ANON }],
]) {
  const r = child({ HOME: process.env.HOME, ...env }, VITE_CFG);
  ok(refused(r), `build refused: ${name}`, `exit ${r.status}; ${r.err.split("\n")[0].slice(0, 200)}`);
}
{
  // The dev API's env loader must not read the production env files on staging.
  const r = child({ HOME: process.env.HOME, ...STAGING_ENV }, `
    const src = (await import("node:fs")).readFileSync("vite.config.js", "utf8");
    const fn = src.slice(src.indexOf("function loadServerEnv"), src.indexOf("function devApiRoutes"));
    console.log(JSON.stringify({ guarded: /MINEEX_ENV === "staging"\\) return;/.test(fn.slice(0, fn.indexOf("for (const f of"))) }));`);
  let j = {}; try { j = JSON.parse(r.out); } catch {}
  ok(j.guarded === true, "vite dev API loads no .env files on staging (returns before the file loop)");
}
{
  const src = fs.readFileSync("src/lib/supabase.js", "utf8");
  ok(/IS_STAGING && \(String\(ENV\.VITE_SUPABASE_URL/.test(src) && /throw new Error\("\[staging tripwire\]/.test(src),
     "src/lib/supabase.js throws on a misconfigured staging bundle (runtime check; static assertion)");
}

// ===================================================================== egress ==
console.log("\n  EGRESS (staging process; no request below leaves this machine)");
const EGRESS_PROBE = `
  import http from "node:http";
  import https from "node:https";
  import http2 from "node:http2";
  import net from "node:net";
  const eg = await import("./api/_stagingEgress.js");
  await import("./api/_supabase.js");
  const out = { installed: eg.EGRESS_INSTALLED };
  const tryIt = async (k, fn) => { try { const v = await fn(); out[k] = { ok: true, v }; } catch (e) { out[k] = { ok: false, code: e.code || e.name, msg: String(e.message).slice(0, 160) }; } };

  await tryIt("prodRest",   () => fetch("${PROD_URL}/rest/v1/companies?select=id").then((r) => r.status));
  await tryIt("prodRequest",() => fetch(new Request("${PROD_URL}/auth/v1/user")).then((r) => r.status));
  await tryIt("prodStorage",() => fetch("${PROD_URL}/storage/v1/object/company-docs/x").then((r) => r.status));
  await tryIt("lookalike",  () => fetch("https://jmljfovtfxcdhjmtlnva.supabase.co.evil.example/").then((r) => r.status));
  await tryIt("altPort",    () => fetch("https://jmljfovtfxcdhjmtlnva.supabase.co:8443/").then((r) => r.status));
  await tryIt("metadata",   () => fetch("http://169.254.169.254/latest/meta-data/").then((r) => r.status));
  await tryIt("liveSite",   () => fetch("https://mineex.ca/").then((r) => r.status));
  await tryIt("anthropic",  () => fetch("https://api.anthropic.com/v1/messages?key=SHOULD_NOT_BE_LOGGED", { method: "POST", body: JSON.stringify({ model: "x", tools: [{ name: "extract" }] }) }).then(async (r) => ({ s: r.status, j: await r.json() })));
  await tryIt("openai",     () => fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body: "{}" }).then((r) => r.status));
  await tryIt("postmark",   () => fetch("https://api.postmarkapp.com/email", { method: "POST", body: JSON.stringify({ To: "ceo@iso-alpha.invalid" }) }).then((r) => r.status));
  await tryIt("stripe",     () => fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", body: "mode=subscription" }).then(async (r) => (await r.json()).url));
  await tryIt("jina",       () => fetch("https://r.jina.ai/https://example-mining-co.com").then((r) => r.status));
  await tryIt("fcm",        () => fetch("https://fcm.googleapis.com/v1/projects/x/messages:send", { method: "POST" }).then((r) => r.status));
  await tryIt("googleAuth", () => fetch("https://oauth2.googleapis.com/token", { method: "POST" }).then((r) => r.status));

  // Alternate clients: node:https, node:http, node:http2 (APNs), raw sockets.
  await tryIt("httpsGet",   () => new Promise((res, rej) => { const q = https.get("https://example.com/", (r) => res(r.statusCode)); q.on("error", rej); }));
  await tryIt("httpGet",    () => new Promise((res, rej) => { const q = http.get("http://example.com/", (r) => res(r.statusCode)); q.on("error", rej); }));
  await tryIt("apnsHttp2",  () => new Promise((res, rej) => { const s = http2.connect("https://api.push.apple.com"); s.on("connect", () => { s.close(); res("connected"); }); s.on("error", rej); }));
  await tryIt("apnsSandbox",() => new Promise((res, rej) => { const s = http2.connect("https://api.sandbox.push.apple.com"); s.on("connect", () => { s.close(); res("connected"); }); s.on("error", rej); }));
  await tryIt("rawSocket",  () => new Promise((res, rej) => { const s = net.connect(443, "rvptronniomlqumjhyrr.supabase.co", () => { s.end(); res("connected"); }); s.on("error", rej); }));
  await tryIt("rawSocketOpts", () => new Promise((res, rej) => { const s = net.connect({ host: "api.stripe.com", port: 443 }, () => { s.end(); res("connected"); }); s.on("error", rej); }));

  // An ALLOWED host that redirects to production: the hop must be re-checked.
  const srv = http.createServer((q, r) => { r.writeHead(302, { location: "${PROD_URL}/rest/v1/" }); r.end(); });
  await new Promise((r) => srv.listen(Number(process.env.SELF_PORT), "127.0.0.1", r));
  await tryIt("redirectToProd", () => fetch("http://127.0.0.1:" + process.env.SELF_PORT + "/bounce").then((r) => r.status));
  await tryIt("redirectManual", () => fetch("http://127.0.0.1:" + process.env.SELF_PORT + "/bounce", { redirect: "manual" }).then((r) => r.status));
  srv.close();

  out.log = eg.egressLog();
  console.log(JSON.stringify(out));
`;
const SELF_PORT = String(40000 + Math.floor(Math.random() * 20000));
const e = child({ ...STAGING_ENV, STAGING_SELF_HOSTS: `127.0.0.1:${SELF_PORT}`, SELF_PORT }, EGRESS_PROBE);
let R = {};
try { R = JSON.parse(e.out.split("\n").pop()); } catch { ok(false, "egress probe produced a result", e.err.slice(0, 400)); }
const blocked = (k) => R[k] && R[k].ok === false && R[k].code === "ESTAGINGEGRESS";
ok(R.installed === true, "egress guard installed on staging");
for (const [k, label] of [
  ["prodRest", "fetch to PRODUCTION REST"], ["prodRequest", "fetch(new Request(production))"],
  ["prodStorage", "fetch to PRODUCTION storage"], ["lookalike", "look-alike host (staging ref as a subdomain)"],
  ["altPort", "staging host on a non-HTTPS port"], ["metadata", "cloud metadata address"],
  ["liveSite", "a live company website"], ["fcm", "FCM push"], ["googleAuth", "Google OAuth (FCM token mint)"],
  ["httpsGet", "node:https to an arbitrary host"], ["httpGet", "node:http to an arbitrary host"],
  ["apnsHttp2", "node:http2 to APNs production"], ["apnsSandbox", "node:http2 to APNs sandbox"],
  ["rawSocket", "raw socket to production"], ["rawSocketOpts", "raw socket to Stripe (mock mode)"],
  ["redirectToProd", "an allowed host redirecting to production (hop re-checked)"],
]) ok(blocked(k), `blocked: ${label}`, JSON.stringify(R[k]));
ok(R.redirectManual && R.redirectManual.ok && R.redirectManual.v === 302, "redirect: 'manual' returns the 3xx without following it", JSON.stringify(R.redirectManual));
ok(R.anthropic?.ok && R.anthropic.v.s === 200 && R.anthropic.v.j.content?.[0]?.type === "tool_use", "Anthropic answered by the mock (tool_use shape), not sent");
ok(R.openai?.ok && R.openai.v === 200, "OpenAI answered by the mock, not sent");
ok(R.postmark?.ok && R.postmark.v === 200, "Postmark answered by the mock, not sent");
ok(R.stripe?.ok && /stripe\.invalid/.test(R.stripe.v), "Stripe answered by the mock (mock mode is the default)");
ok(R.jina?.ok && R.jina.v === 200, "Jina reader answered by the mock: no live website fetched");
const log = R.log || [];
ok(log.some((x) => x.action === "mock" && x.provider === "postmark" && x.to === "ceo@iso-alpha.invalid"), "the log records a mocked email's recipient");
ok(!JSON.stringify(log).includes("SHOULD_NOT_BE_LOGGED"), "the log never records a query string");
ok(log.every((x) => !("headers" in x) && !("body" in x)), "the log never records headers or bodies");
ok(log.filter((x) => x.action === "allow" && /rvptronniomlqumjhyrr/.test(x.host)).length === 0, "zero production hosts were ALLOWED");
ok(log.filter((x) => x.action === "allow").every((x) => x.reason === "self"), "the only allowed connections were to the local self host");

// ================================================================ static ==
console.log("\n  STATIC (every route is covered)");
const API = path.join(ROOT, "api");
const routes = fs.readdirSync(API).filter((f) => f.endsWith(".js") && !f.startsWith("_"));
const importsOf = (file) => [...fs.readFileSync(file, "utf8").matchAll(/^\s*import\s+(?:[^"']*\sfrom\s+)?["']([^"']+)["']/gm)].map((m) => m[1]);
function reaches(file, target, seen = new Set()) {
  if (seen.has(file)) return false; seen.add(file);
  for (const spec of importsOf(file)) {
    if (!spec.startsWith(".")) continue;
    const next = path.resolve(path.dirname(file), spec);
    if (next === target) return true;
    if (fs.existsSync(next) && reaches(next, target, seen)) return true;
  }
  return false;
}
const SUPA = path.join(API, "_supabase.js");
const uncovered = routes.filter((f) => !reaches(path.join(API, f), SUPA));
ok(uncovered.length === 0, `all ${routes.length} routable handlers import _supabase.js (tripwire + egress)`, `uncovered: ${uncovered.join(", ")}`);
ok(importsOf(SUPA)[0] === "./_stagingEgress.js", "_stagingEgress.js is the FIRST import of _supabase.js");
const spawners = fs.readdirSync(API).filter((f) => f.endsWith(".js"))
  .filter((f) => /child_process|worker_threads|\bnode:cluster\b/.test(fs.readFileSync(path.join(API, f), "utf8")));
ok(spawners.length === 0, "no api/ module can spawn a process or worker (would escape the socket guard)", spawners.join(", "));
const svcReaders = fs.readdirSync(API).filter((f) => f.endsWith(".js") && f !== "_service.js" && f !== "_stagingEnv.js")
  .filter((f) => /SUPABASE_SERVICE_(ROLE_)?KEY/.test(fs.readFileSync(path.join(API, f), "utf8").replace(/^\s*\/\/.*$/gm, "")));
ok(svcReaders.length === 0, "only _service.js reads a service key (staging reads only its own name)", svcReaders.join(", "));

// ====================================================== edge runtime safety ==
// og-news runs on Vercel's EDGE runtime and imports _supabase.js, which imports
// the staging modules. A static node:* import (or Buffer) anywhere in that graph
// breaks og-news in PRODUCTION, where the staging code is inert. Found by the
// local emulator on 2026-10-30, before it shipped.
console.log("\n  EDGE RUNTIME SAFETY");
{
  const edgeRoutes = routes.filter((f) => /runtime:\s*["']edge["']/.test(fs.readFileSync(path.join(API, f), "utf8")));
  const graph = (file, seen = new Set()) => {
    if (seen.has(file)) return seen; seen.add(file);
    for (const spec of importsOf(file)) if (spec.startsWith(".")) {
      const next = path.resolve(path.dirname(file), spec);
      if (fs.existsSync(next)) graph(next, seen);
    }
    return seen;
  };
  for (const r of edgeRoutes) {
    const files = [...graph(path.join(API, r))];
    const nodeImports = files.filter((f) => importsOf(f).some((s) => /^node:|^(fs|net|http2?|https|crypto|child_process)$/.test(s)));
    ok(nodeImports.length === 0, `edge route ${r}: no static Node built-in import in its module graph (${files.length} files)`,
       nodeImports.map((f) => path.relative(ROOT, f)).join(", "));
    const staging = files.filter((f) => /_staging(Env|Egress)\.js$/.test(f));
    const bufferUse = staging.filter((f) => /\bBuffer\./.test(fs.readFileSync(f, "utf8").replace(/^\s*\/\/.*$/gm, "")));
    ok(bufferUse.length === 0, `edge route ${r}: the staging modules it loads do not use Buffer`, bufferUse.join(", "));
  }
  // Simulated Edge, on staging: fetch layer installed, socket layer correctly absent.
  const r = child({ ...STAGING_ENV }, `
    globalThis.EdgeRuntime = "edge-runtime";
    const eg = await import("./api/_stagingEgress.js");
    let blocked = false; try { await fetch("${PROD_URL}/rest/v1/"); } catch (e) { blocked = e.code === "ESTAGINGEGRESS"; }
    console.log(JSON.stringify({ g: globalThis.__mineexStagingEgress, blocked }));`);
  let j = {}; try { j = JSON.parse(r.out.split("\n").pop()); } catch {}
  ok(j.g && j.g.installed === true && j.g.sockets === false && j.blocked === true,
     "simulated Edge on staging: fetch guard installed and blocking, no socket layer needed", r.err.slice(0, 200));
}
{
  // JWT-shaped keys are checked by their `ref` claim (decoded with atob, not Buffer).
  const jwt = (ref) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ ref, role: "anon" })).toString("base64url") + ".sig";
  const good = child({ ...STAGING_ENV, VITE_SUPABASE_ANON_KEY: jwt("jmljfovtfxcdhjmtlnva") }, IMPORT);
  ok(good.status === 0, "a JWT anon key whose ref is staging is accepted", good.err.slice(0, 200));
  ok(refused(child({ ...STAGING_ENV, VITE_SUPABASE_ANON_KEY: jwt("rvptronniomlqumjhyrr") }, IMPORT)), "a JWT anon key for PRODUCTION is refused");
  ok(refused(child({ ...STAGING_ENV, STAGING_SUPABASE_SERVICE_ROLE_KEY: jwt("rvptronniomlqumjhyrr").replace("anon", "service_role") }, IMPORT)),
     "a JWT service key for PRODUCTION under the staging name is refused");
}

// =========================================================== network (opt) ==
if (NETWORK) {
  console.log("\n  NETWORK (one allowed request, to STAGING only)");
  const envFile = "supabase/staging/.isolation-env";
  const kv = fs.existsSync(envFile) ? Object.fromEntries(fs.readFileSync(envFile, "utf8").split("\n").filter(Boolean)
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })) : {};
  if (!kv.ISOLATION_ANON_KEY) ok(false, "staging anon key available for the network check");
  else {
    const r = child({ ...STAGING_ENV, VITE_SUPABASE_ANON_KEY: kv.ISOLATION_ANON_KEY }, `
      const eg = await import("./api/_stagingEgress.js");
      const m = await import("./api/_supabase.js");
      const r = await fetch(m.SB_URL + "/auth/v1/settings", { headers: { apikey: m.ANON_KEY } });
      console.log(JSON.stringify({ status: r.status, log: eg.egressLog() }));`);
    let j = {}; try { j = JSON.parse(r.out.split("\n").pop()); } catch {}
    ok(j.status === 200, "an allowed request to STAGING still works through both layers", r.err.slice(0, 200));
    ok((j.log || []).every((x) => x.host === "jmljfovtfxcdhjmtlnva.supabase.co"), "and it went to the staging host only");
    ok(!leaks(r, kv.ISOLATION_ANON_KEY), "the key never appears in output");
  }
}

console.log(`\nstaging guard: ${pass} passed, ${fail} failed${NETWORK ? "" : " (offline; add --network for the staging round trip)"}`);
process.exit(fail ? 1 : 0);
