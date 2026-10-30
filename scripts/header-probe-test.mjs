// Run the F5 / F12 header diagnostic against tools/header-probe.
//
//   node scripts/header-probe-test.mjs --local
//       Serves the two probe functions on 127.0.0.1 with NO proxy in front, and
//       checks this script's own logic: with nothing in between, every spoofed
//       header must arrive unchanged. Proves the harness, says nothing about Vercel.
//
//   PROBE_BASE=https://<probe>.vercel.app [PROBE_BYPASS=<secret>] node scripts/header-probe-test.mjs
//       Against the deployed throwaway probe (deploy needs approval). Reports, per
//       runtime, whether each forwarding header a CLIENT sends survives, is
//       overwritten or is appended to by Vercel. Writes the raw results to
//       docs/header-probe-results.json and prints the F5/F12 conclusions.
//
// Sends only sentinel values from documentation ranges (198.51.100.0/24,
// *.invalid). Never sends a MineEx credential; the probe holds none.

import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";

const LOCAL = process.argv.includes("--local");
let BASE = (process.env.PROBE_BASE || "").replace(/\/+$/, "");
const BYPASS = process.env.PROBE_BYPASS || "";
// PROBE_ALLOW_LOOPBACK is for scripts/header-probe-safety-test.mjs only, which puts
// a simulated proxy on 127.0.0.1 in front of the probe to exercise every verdict.
const loopbackOk = process.env.PROBE_ALLOW_LOOPBACK === "1" && /^http:\/\/127\.0\.0\.1:\d+$/.test(BASE);
if (!LOCAL && !loopbackOk && !/^https:\/\/[a-z0-9.-]+$/i.test(BASE)) { console.error("  set PROBE_BASE=https://<probe host>, or pass --local"); process.exit(3); }
if (/mineex\.ca|passport-xi-five|rvptronniomlqumjhyrr/i.test(BASE)) { console.error("  REFUSING: that is a MineEx production host, not the throwaway probe."); process.exit(2); }

// ---- local harness: the probe functions with nothing in front of them -------------
let server = null;
if (LOCAL) {
  const dir = path.resolve("tools/header-probe/api");
  const nodeFn = (await import(pathToFileURL(path.join(dir, "node.js")).href)).default;
  const edgeFn = (await import(pathToFileURL(path.join(dir, "edge.js")).href)).default;
  server = http.createServer(async (req, res) => {
    if (req.url.startsWith("/api/node")) return nodeFn(req, res);
    if (req.url.startsWith("/api/edge")) {
      const r = await edgeFn(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers }));
      res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(await r.text());
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${server.address().port}`;
}

// ---- the sentinels ------------------------------------------------------------------
const nonce = crypto.randomBytes(4).toString("hex");
const SENT = {
  "x-forwarded-host": `canary-${nonce}.invalid`,
  "x-forwarded-for": "198.51.100.7",
  "x-forwarded-proto": "http",
  "x-real-ip": "198.51.100.8",
  "x-vercel-forwarded-for": "198.51.100.9",
  "forwarded": `for=198.51.100.10;host=canary-${nonce}.invalid;proto=http`,
  "x-client-ip": "198.51.100.11",
  "true-client-ip": "198.51.100.12",
  "x-vercel-ip-country": "ZZ",
};

function send(url, headers) {
  const u = new URL(url);
  const lib = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(u, { method: "GET", headers: { ...headers, ...(BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {}) } }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(b) }); } catch { resolve({ status: res.statusCode, body: b.slice(0, 200) }); } });
    });
    req.on("error", reject); req.setTimeout(15000, () => req.destroy(new Error("timeout"))); req.end();
  });
}

/** For one header: what the function saw compared with what the client sent. */
// Compared as whole comma-separated values: a substring test once read "https"
// as "http" with something appended (2026-10-30, first live run).
function classify(sent, got) {
  if (got === undefined) return "absent";
  if (got === sent) return "SURVIVED (client-controlled)";
  const parts = String(got).split(",").map((x) => x.trim());
  if (parts.length > 1 && parts.includes(sent)) return parts[0] === sent ? "APPENDED (client value first)" : "APPENDED (client value last)";
  return "overwritten by platform";
}

// Results are meant to be committed, so platform-issued values that could be
// sensitive are redacted: Vercel's signed `forwarded` token, and the caller's
// real public address (any IPv4 outside the documentation ranges we send).
const SENT_IPS = new Set(["198.51.100.7", "198.51.100.8", "198.51.100.9", "198.51.100.10", "198.51.100.11", "198.51.100.12"]);
function redact(v) {
  if (v == null) return v;
  return String(v)
    .replace(/sig=[^;,\s]+/g, "sig=<redacted>")
    .replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g, (ip) => (SENT_IPS.has(ip) || ip.startsWith("127.") ? ip : "<client-public-ip>"));
}

const results = { probedAt: new Date().toISOString(), base: LOCAL ? "local (no proxy)" : BASE, runtimes: {} };
let harnessFail = 0;
for (const runtime of ["node", "edge"]) {
  const control = await send(`${BASE}/api/${runtime}`, {});
  const spoofed = await send(`${BASE}/api/${runtime}`, SENT);
  if (spoofed.status !== 200 || spoofed.body?.probe !== "mineex-header-probe") {
    console.error(`  ${runtime}: probe not reached (HTTP ${spoofed.status}). Protection wall without a valid PROBE_BYPASS?`);
    harnessFail++; continue;
  }
  const seen = spoofed.body.forwarding || {};
  const table = {};
  for (const [h, v] of Object.entries(SENT)) table[h] = { sent: v, received: redact(seen[h]) ?? null, verdict: classify(v, seen[h]) };
  table.host = { sent: "(not overridable from fetch)", received: seen.host ?? null, verdict: "reported" };
  // Was the platform-set client address the SAME across headers? (compared before redaction)
  table._clientIpConsistent = ["x-forwarded-for", "x-real-ip", "x-vercel-forwarded-for"].map((h) => seen[h]).filter(Boolean).every((x, _, a) => x === a[0]);
  results.runtimes[runtime] = {
    table,
    control: Object.fromEntries(Object.entries(control.body?.forwarding || {}).map(([k, v]) => [k, redact(v)])),
    socketRemoteAddress: spoofed.body.socketRemoteAddress ?? null,
    withheld: spoofed.body.withheld || [],
  };
  if (spoofed.body.withheld?.length && !BYPASS) harnessFail++;
}
if (server) server.close();

// ---- report -------------------------------------------------------------------------
for (const [rt, r] of Object.entries(results.runtimes)) {
  console.log(`\n  ${rt.toUpperCase()} runtime`);
  for (const [h, x] of Object.entries(r.table)) if (!h.startsWith("_")) console.log(`   ${h.padEnd(24)} ${String(x.verdict).padEnd(32)} ${x.received ?? "-"}`);
  if (r.socketRemoteAddress) console.log(`   socket remote address    ${r.socketRemoteAddress}`);
}

// Conclusions the fixes need.
const spoofable = (rt, h) => /SURVIVED|client value first/.test(results.runtimes[rt]?.table[h]?.verdict || "");
const conclusions = {};
for (const rt of Object.keys(results.runtimes)) {
  conclusions[rt] = {
    F5_x_forwarded_host_spoofable: spoofable(rt, "x-forwarded-host"),
    F5_forwarded_host_spoofable: spoofable(rt, "forwarded"),
    F12_trusted_client_ip_header: ["x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"].find((h) => {
      const v = results.runtimes[rt].table[h]; return v && v.received && !spoofable(rt, h);
    }) || null,
  };
}
results.conclusions = conclusions;
console.log("\n  CONCLUSIONS");
for (const [rt, c] of Object.entries(conclusions)) {
  console.log(`   ${rt}: x-forwarded-host spoofable=${c.F5_x_forwarded_host_spoofable}  forwarded spoofable=${c.F5_forwarded_host_spoofable}  platform client-IP header=${c.F12_trusted_client_ip_header || "NONE FOUND"}`);
}

if (LOCAL) {
  // With no proxy, EVERY sentinel must survive -- otherwise the classifier is wrong.
  const allSurvive = Object.values(results.runtimes).every((r) => Object.entries(SENT).every(([h]) => /SURVIVED/.test(r.table[h].verdict)));
  const noTrusted = Object.values(conclusions).every((c) => c.F12_trusted_client_ip_header === null && c.F5_x_forwarded_host_spoofable);
  const ok = harnessFail === 0 && Object.keys(results.runtimes).length === 2 && allSurvive && noTrusted;
  console.log(`\n  local harness check: ${ok ? "PASS" : "FAIL"} -- with no proxy every spoofed header arrives, and no header is judged platform-set`);
  process.exit(ok ? 0 : 1);
} else {
  const out = process.env.PROBE_RESULTS || "docs/header-probe-results.json";
  fs.writeFileSync(out, JSON.stringify(results, null, 2) + "\n");
  console.log(`\n  wrote ${out}`);
  process.exit(harnessFail ? 1 : 0);
}
