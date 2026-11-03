// node scripts/lead-form-0095-gateway-check.mjs  -- LIVE on staging (needs 0095 applied).
// Run when this machine has no lead-form submissions in the last hour: it first spends this
// machine's per-device quota (5/hour), then proves no forged client header earns a fresh bucket.
// Live, through staging's real gateway: can forged client headers escape 0095's limit?
import fs from "node:fs"; import { createRequire } from "node:module"; import crypto from "node:crypto";
const pg = createRequire(process.cwd() + "/package.json")("pg");
const iso = Object.fromEntries(fs.readFileSync("supabase/staging/.isolation-env","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).trim()]));
const U = iso.ISOLATION_SUPABASE_URL, K = iso.ISOLATION_ANON_KEY;
if (!U.includes("jmljfovtfxcdhjmtlnva")) process.exit(2);
const TAG = `zz-spoof95-${crypto.randomUUID().slice(0,8)}`;
const post = (h = {}) => fetch(`${U}/rest/v1/demo_bookings`, { method: "POST", headers: { apikey: K, Authorization: `Bearer ${K}`, "content-type": "application/json", Prefer: "return=minimal", ...h },
  body: JSON.stringify({ company: TAG, name: "Zz spoof", email: "zz.spoof@example.com", notes: "0095 spoof test" }) });
let pass = 0, fail = 0; const ok = (c, m, d="") => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${m}${!c && d ? "  " + d : ""}`); };
// 1. Use up this machine's per-device quota (5/hour) with honest requests.
const honest = []; for (let i = 0; i < 6; i++) honest.push((await post()).status);
const first429 = honest.indexOf(429);
ok(first429 >= 0 && first429 <= 5, `honest requests from this machine hit the device limit (statuses ${honest.join(",")})`);
// 2. Forged identities: each must still be refused.
const r = () => `${1 + crypto.randomInt(223)}.${crypto.randomInt(256)}.${crypto.randomInt(256)}.${1 + crypto.randomInt(254)}`;
const forged = [
  ["cf-connecting-ip", { "cf-connecting-ip": r() }],
  ["x-forwarded-for single", { "x-forwarded-for": r() }],
  ["x-forwarded-for chain", { "x-forwarded-for": `${r()}, ${r()}, ${r()}` }],
  ["x-real-ip", { "x-real-ip": r() }],
  ["true-client-ip + forwarded", { "true-client-ip": r(), forwarded: `for=${r()}` }],
  ["all at once", { "cf-connecting-ip": r(), "x-forwarded-for": r(), "x-real-ip": r(), "x-client-ip": r() }],
];
// 403 is Cloudflare refusing a client-supplied cf-connecting-ip at the edge: the request never reaches the database.
for (const [label, h] of forged) { const s = (await post(h)).status; ok(s === 429 || (s === 403 && "cf-connecting-ip" in h), `forged ${label}: refused (${s}; no fresh bucket)`, `got ${s}`); }
// 3. Clean up this run's rows (staging DB, service connection).
const c = new pg.Client({ connectionString: fs.readFileSync("supabase/staging/.connection","utf8").trim(), ssl: { rejectUnauthorized: false } }); await c.connect();
const n = (await c.query(`delete from public.demo_bookings where company = $1`, [TAG])).rowCount; await c.end();
console.log(`  cleanup: ${n} test rows deleted`);
console.log(`\n  0095 gateway spoofing (staging, live): ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
