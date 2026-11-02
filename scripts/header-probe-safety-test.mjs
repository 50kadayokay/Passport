// tools/header-probe: is it safe to deploy, and does the diagnostic read the
// answers correctly? Offline; nothing is deployed.
//   node scripts/header-probe-safety-test.mjs
//
// SAFETY (static): the probe holds no secret, reads no environment, makes no
// outbound call, imports nothing from MineEx, and can never become part of the
// MineEx deployment.
// CORRECTNESS (local): a simulated proxy in front of the probe overwrites some
// headers and appends to others, the way a platform edge might; the diagnostic
// must classify each one correctly and pick the platform-set client-IP header.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const DIR = "tools/header-probe";
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(p); } })(DIR);
const code = files.filter((f) => f.endsWith(".js"));
const src = (f) => fs.readFileSync(f, "utf8").replace(/^\s*\/\/.*$/gm, "");

console.log("\n  SAFETY (static)");
ok(code.every((f) => !/process\s*\.\s*env/.test(src(f))), "reads no environment variable");
ok(code.every((f) => !/\bfetch\s*\(|node:(http|https|http2|net|tls|dgram|child_process)|from\s+["'](http|https|net)["']|XMLHttpRequest|WebSocket/.test(src(f))), "makes no outbound call and opens no socket");
const imports = code.flatMap((f) => [...src(f).matchAll(/import\s+[^"']*["']([^"']+)["']/g)].map((m) => [f, m[1]]));
ok(imports.every(([f, s]) => s.startsWith(".") && path.resolve(path.dirname(f), s).startsWith(path.resolve(DIR))), "imports nothing outside tools/header-probe (no MineEx code, no packages)", JSON.stringify(imports));
const vj = JSON.parse(fs.readFileSync(path.join(DIR, "vercel.json"), "utf8"));
ok(!vj.crons && !vj.env && !vj.build?.env && !vj.rewrites, "vercel.json declares no crons, env or rewrites");
ok(Object.keys(JSON.parse(fs.readFileSync(path.join(DIR, "package.json"), "utf8"))).every((k) => !/dependencies/i.test(k)), "package.json has no dependencies");
ok(!fs.existsSync(path.join(DIR, ".env")) && !files.some((f) => /\.env/.test(f)), "no env file in the probe");
const rootRefs = ["api", "src"].flatMap((d) => { const out = []; (function w(x) { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) w(p); else if (/\.(js|jsx|ts|tsx|mjs)$/.test(p) && /(import\s[^;]*?["'][^"']*tools\/header-probe|import\(\s*["'][^"']*tools\/header-probe|require\(\s*["'][^"']*tools\/header-probe)/.test(fs.readFileSync(p, "utf8"))) out.push(p); } })(d); return out; });
ok(rootRefs.length === 0, "nothing in api/ or src/ IMPORTS the probe (it is never part of the MineEx build; a citation in a comment is fine)", rootRefs.join(", "));
ok(!fs.existsSync("api/node.js") && !fs.existsSync("api/edge.js"), "the probe's functions are not in the root api/ that Vercel deploys for MineEx");

console.log("\n  NEVER ECHOES A CREDENTIAL");
const { describe } = await import(pathToFileURL(path.resolve(DIR, "_echo.js")).href);
const out = JSON.stringify(describe("node", { cookie: "sess=SECRET1", authorization: "Bearer SECRET2", "x-vercel-protection-bypass": "SECRET3", "x-vercel-set-bypass-cookie": "SECRET4", "x-forwarded-for": "198.51.100.7" }));
ok(!/SECRET[1-4]/.test(out), "cookie, authorization and protection-bypass values are never returned");
ok(/"withheld":\["authorization","cookie","x-vercel-protection-bypass","x-vercel-set-bypass-cookie"\]/.test(out), "their NAMES are listed as withheld, so the result shows they arrived");

console.log("\n  DIAGNOSTIC READS A PROXY CORRECTLY (simulated platform)");
const nodeFn = (await import(pathToFileURL(path.resolve(DIR, "api/node.js")).href)).default;
const edgeFn = (await import(pathToFileURL(path.resolve(DIR, "api/edge.js")).href)).default;
// Behaves like a well-run edge: overwrites host/IP headers it owns, APPENDS the
// real peer to x-forwarded-for (client value first), passes the rest through.
const PLATFORM_IP = "203.0.113.50";
const proxy = http.createServer(async (req, res) => {
  const h = { ...req.headers };
  h["x-forwarded-host"] = "probe.example.invalid";
  h["x-real-ip"] = PLATFORM_IP;
  h["x-vercel-forwarded-for"] = PLATFORM_IP;
  h["x-forwarded-for"] = req.headers["x-forwarded-for"] ? `${req.headers["x-forwarded-for"]}, ${PLATFORM_IP}` : PLATFORM_IP;
  h.forwarded = `for=${PLATFORM_IP};host=probe.example.invalid;proto=https;sig=c2VjcmV0LXNpZ25hdHVyZQ==;exp=1`;
  h["x-forwarded-proto"] = "https";
  h["x-client-ip"] = req.headers["x-client-ip"];
  req.headers = h;
  if (req.url.startsWith("/api/node")) return nodeFn(req, res);
  const r = await edgeFn(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: h }));
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text());
});
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const resultsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "probe-")), "r.json");
const run = await new Promise((resolve) => {
  const p = spawn(process.execPath, ["scripts/header-probe-test.mjs"], { env: { PATH: process.env.PATH, PROBE_BASE: `http://127.0.0.1:${proxy.address().port}`, PROBE_ALLOW_LOOPBACK: "1", PROBE_RESULTS: resultsFile } });
  let o = ""; p.stdout.on("data", (d) => (o += d)); p.stderr.on("data", (d) => (o += d)); p.on("exit", (code) => resolve({ code, o }));
});
proxy.close();
ok(run.code === 0 && fs.existsSync(resultsFile), "the diagnostic ran against the simulated proxy", run.o.slice(-300));
if (fs.existsSync(resultsFile)) {
  const R = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
  for (const rt of ["node", "edge"]) {
    const t = R.runtimes[rt].table;
    ok(/overwritten/.test(t["x-forwarded-host"].verdict), `${rt}: an overwritten x-forwarded-host is read as overwritten`);
    ok(/APPENDED \(client value first\)/.test(t["x-forwarded-for"].verdict), `${rt}: an appended x-forwarded-for is read as client-first (still spoofable)`);
    ok(/overwritten/.test(t["forwarded"].verdict) && /sig=<redacted>/.test(t["forwarded"].received) && !/c2VjcmV0/.test(JSON.stringify(R)), `${rt}: a platform-signed forwarded header is read as overwritten, its sig REDACTED`);
    ok(/overwritten/.test(t["x-forwarded-proto"].verdict), `${rt}: "https" replacing "http" is read as overwritten, not appended (regression)`);
    ok(!JSON.stringify(R).includes(PLATFORM_IP), `${rt}: the caller's real public address is redacted from the results`);
    ok(/SURVIVED/.test(t["x-client-ip"].verdict), `${rt}: a passed-through header is read as client-controlled`);
    ok(R.conclusions[rt].F5_x_forwarded_host_spoofable === false, `${rt}: F5 conclusion -- x-forwarded-host NOT spoofable behind this proxy`);
    ok(R.conclusions[rt].F12_trusted_client_ip_header === "x-real-ip", `${rt}: F12 conclusion -- trust the platform-set header (x-real-ip), never x-forwarded-for`);
  }
}

console.log(`\nheader probe: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
