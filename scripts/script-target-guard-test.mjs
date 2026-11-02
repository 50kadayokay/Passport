// No script can reach production by accident (2026-10-31).
//   node scripts/script-target-guard-test.mjs
//
// OFFLINE. Static checks over every scripts/*.mjs, plus each guarded live script
// run in a CLEAN environment pointed at production (and with nothing set): it
// must exit 2 with REFUSING before doing anything. No network is involved -- the
// guards run before any request, which is exactly what is being proven.

import fs from "node:fs";
import { spawnSync } from "node:child_process";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// Scripts that may name the production URL in code, and why.
const PRODUCTION_URL_ALLOWED = {
  "conference-snapshot.mjs": "content generator; reads published (public) data with the anon key; writes nothing to the database",
  "gen-argenta-package.mjs": "content generator; reads published (public) data; writes nothing to the database",
  "import-kingsmen-media.mjs": "deliberate PRODUCTION data import; gated by requireProductionOptIn",
  "ai-guard-test.mjs": "offline test (stubbed network); the URL is a placeholder value",
  "staging-guard-test.mjs": "asserts that production is REFUSED",
  "_target-guard.mjs": "the guard itself",
};
const GUARDED_TESTS = ["listener-test", "publish-endpoint-test", "portal-smoke-test", "spine-test", "privilege-hardening-test"];

console.log("\n  STATIC: every script");
const files = fs.readdirSync("scripts").filter((f) => f.endsWith(".mjs"));
for (const f of files) {
  const code = strip(fs.readFileSync(`scripts/${f}`, "utf8"));
  if (/readFileSync\([^)]*\.env(\.import|\.local|\.vercel\.local)?["'`]/.test(code) || /\[\s*["']\.env\.import["']/.test(code)) {
    ok(false, `${f} reads a local .env file (those hold PRODUCTION credentials)`);
  }
  const defaultsToProd = /(\|\||\?\?|\|\|=|=)\s*["'`]https:\/\/rvptronniomlqumjhyrr\.supabase\.co/.test(code);
  if (defaultsToProd && !PRODUCTION_URL_ALLOWED[f]) ok(false, `${f} assigns or defaults to the PRODUCTION URL and is not an allowed production tool`);
}
ok(true, `${files.length} scripts scanned: no script reads a local .env file in code; production URLs only in ${Object.keys(PRODUCTION_URL_ALLOWED).length} reviewed files`);
for (const name of GUARDED_TESTS) {
  const code = fs.readFileSync(`scripts/${name}.mjs`, "utf8");
  ok(/requireStagingTarget\(process\.env\.VITE_SUPABASE_URL/.test(code), `${name}: its target comes from requireStagingTarget (no default)`);
}
{
  const code = fs.readFileSync("scripts/import-kingsmen-media.mjs", "utf8");
  const gate = code.indexOf('requireProductionOptIn("import-kingsmen-media")'), firstFetch = code.indexOf("fetch(");
  ok(gate > 0 && (firstFetch === -1 || gate < firstFetch), "import-kingsmen-media: the production opt-in runs before any request");
}

console.log("\n  DYNAMIC: each guarded script, clean environment");
const clean = { PATH: process.env.PATH, HOME: process.env.HOME };
const run = (name, extra) => spawnSync(process.execPath, [`scripts/${name}.mjs`], { env: { ...clean, ...extra }, encoding: "utf8", timeout: 20000 });
for (const name of GUARDED_TESTS) {
  let r = run(name, { VITE_SUPABASE_URL: "https://rvptronniomlqumjhyrr.supabase.co", VITE_SUPABASE_ANON_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", SUPABASE_SERVICE_KEY: "x" });
  ok(r.status === 2 && /REFUSING -- that is the PRODUCTION project/.test(r.stderr), `${name}: pointed at PRODUCTION -> exits 2, refusing`, `${r.status} ${r.stderr.slice(0, 160)}`);
  r = run(name, {});
  ok(r.status === 2 && /REFUSING -- VITE_SUPABASE_URL is not set/.test(r.stderr), `${name}: nothing set -> exits 2 (it used to default to production)`, `${r.status} ${r.stderr.slice(0, 160)}`);
}
{
  const r = run("import-kingsmen-media", { SUPABASE_SERVICE_KEY: "x" });
  ok(r.status === 2 && /writes to PRODUCTION/.test(r.stderr), "import-kingsmen-media without MINEEX_PRODUCTION_TOOL -> exits 2", `${r.status} ${r.stderr.slice(0, 160)}`);
  const r2 = run("import-kingsmen-media", { SUPABASE_SERVICE_KEY: "x", MINEEX_PRODUCTION_TOOL: "something-else" });
  ok(r2.status === 2, "...and opting in for a DIFFERENT tool does not unlock it");
}
{
  const r = run("mineiq-live-test", { OPENAI_API_KEY: "x" });
  ok(r.status === 2 && /MINEEX_LIVE_AI=1/.test(r.stderr), "mineiq-live-test without MINEEX_LIVE_AI=1 -> exits 2 (no real AI spend by accident)", `${r.status} ${r.stderr.slice(0, 160)}`);
}

console.log(`\n  script targets: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
