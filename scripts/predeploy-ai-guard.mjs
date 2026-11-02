// Refuse to deploy a build whose AI endpoints are unguarded.
//   node scripts/predeploy-ai-guard.mjs        (exit 0 = safe to deploy)
//
// WHY THIS EXISTS
// ---------------
// mineex.ca is deployed with `npx vercel --prod`, which uploads whatever is on
// disk in the directory you run it from. THREE directories are linked to the
// `passport` project:
//
//     Passport V1          <- production is deployed from here
//     Passport-Reconcile
//     Passport-TrafficV0
//
// So a `--prod` run from a folder that predates this fix silently reopens
// api/structure-release.js, api/synthesize-profile.js and api/audience-card.js
// to the whole internet. No error, no warning -- the endpoints just start
// answering again, billing ANTHROPIC_API_KEY.
//
// That is not a hypothetical: the fix was built against 12b7fc2 and main moved
// to 6d89796 during the same session. The working tree moves faster than any
// one deployment.
//
// Run this immediately before `vercel --prod`, from the directory you are about
// to deploy. It is a structural check, not a test -- it asks only "is the gate
// wired?", which is the one question a deploy can get wrong by accident.

import fs from "node:fs";

const ENDPOINTS = ["structure-release", "synthesize-profile", "audience-card"];
let bad = 0;
const fail = (m) => { console.error("  ✗ " + m); bad++; };

console.log("\n  Pre-deploy check: AI endpoint guard\n");

// 1. the guard itself must be present
if (!fs.existsSync("api/_aiGuard.js")) {
  fail("api/_aiGuard.js is MISSING — this tree predates the AI endpoint lockdown.");
} else {
  const g = fs.readFileSync("api/_aiGuard.js", "utf8");
  if (!/export async function requireAiCaller/.test(g))
    fail("api/_aiGuard.js does not export requireAiCaller.");
  // On this lineage api/_supabase.js does not exist; importing it would throw at
  // runtime and every AI request would 500 instead of being guarded.
  if (/^import[^\n]*from\s+["']\.\/_supabase\.js["']/m.test(g) && !fs.existsSync("api/_supabase.js"))
    fail("api/_aiGuard.js imports ./_supabase.js, which does not exist in this tree.");
  if (!/ai_enabled/.test(g))
    fail("api/_aiGuard.js does not read the ai_enabled() kill switch.");
}

// 2. every endpoint must import AND call it, before anything else
for (const name of ENDPOINTS) {
  const p = `api/${name}.js`;
  if (!fs.existsSync(p)) { fail(`${p} is missing.`); continue; }
  const s = fs.readFileSync(p, "utf8");
  if (!/from\s+["']\.\/_aiGuard\.js["']/.test(s)) { fail(`${p} does not import the guard.`); continue; }
  if (!/await requireAiCaller\(req, res,/.test(s)) { fail(`${p} never calls requireAiCaller.`); continue; }

  // The guard must come BEFORE the provider call, or it guards nothing.
  const guardAt = s.indexOf("await requireAiCaller(");
  const callAt  = s.search(/fetch\(\s*ANTHROPIC_URL/);
  if (callAt !== -1 && guardAt > callAt)
    fail(`${p} calls Anthropic BEFORE the guard.`);
  if (!/if \(!caller\) return;/.test(s))
    fail(`${p} does not bail out when the guard refuses.`);
}

// 3. the test must exist, so `npm run check:aiguard` is not a silent no-op
if (!fs.existsSync("scripts/ai-guard-test.mjs"))
  fail("scripts/ai-guard-test.mjs is missing — the guard has no test in this tree.");

if (bad === 0) {
  console.log("  Guard present and wired on all three endpoints.");
  console.log("  Safe to deploy.\n");
  process.exit(0);
}
console.error(`\n  ${bad} problem(s). DO NOT DEPLOY THIS TREE.`);
console.error("  Deploying it would reopen the unauthenticated AI endpoints.\n");
process.exit(1);
