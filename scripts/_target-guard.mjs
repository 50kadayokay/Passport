// Where a script may point (2026-10-31, D22 Phase 2 hardening).
//
// Several legacy live tests defaulted to the PRODUCTION Supabase project when
// VITE_SUPABASE_URL was unset, and read a production service key from
// .env.import -- so running one by mistake created users, companies and
// publications in production. This module makes that impossible by default:
//
//   requireStagingTarget(url, script)  a live TEST may only target the
//       allowlisted staging project, named explicitly. Unset, production, or
//       any other project -> the script exits 2 before any network call.
//   requireProductionOptIn(script)      a deliberate PRODUCTION TOOL (a data
//       import) runs only when MINEEX_PRODUCTION_TOOL names that exact script,
//       so it cannot run as a side effect of anything else.
//   requireLiveAiOptIn(script)          a test that spends real AI credit runs
//       only with MINEEX_LIVE_AI=1 and a key already in the environment.
//
// scripts/script-target-guard-test.mjs (in npm test) checks every script.

export const STAGING_REFS = ["jmljfovtfxcdhjmtlnva"];
export const PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];

function refuse(script, why) {
  console.error(`\n  ${script}: REFUSING -- ${why}\n`);
  process.exit(2);
}

export function requireStagingTarget(url, script) {
  const u = String(url || "").trim();
  if (!u) refuse(script, "VITE_SUPABASE_URL is not set. Live tests never default to a project; point it at staging explicitly.");
  if (PRODUCTION_REFS.some((r) => u.includes(r))) refuse(script, "that is the PRODUCTION project. Live tests run against staging only.");
  if (!STAGING_REFS.some((r) => u.includes(r))) refuse(script, "not the allowlisted staging project.");
  return u.replace(/\/+$/, "");
}

export function requireProductionOptIn(script) {
  if (process.env.MINEEX_PRODUCTION_TOOL !== script) {
    refuse(script, `this tool writes to PRODUCTION. To run it on purpose: MINEEX_PRODUCTION_TOOL=${script} node scripts/${script}.mjs`);
  }
}

export function requireLiveAiOptIn(script) {
  if (process.env.MINEEX_LIVE_AI !== "1") refuse(script, "this test calls the real AI provider and spends credit. Opt in with MINEEX_LIVE_AI=1 (and a key already in the environment).");
}
