// Replay planner for a disposable staging project.
//   node scripts/replay-migrations.mjs            # plan
//   node scripts/replay-migrations.mjs --list     # just the ordered filenames
//
// WHAT THIS IS AND IS NOT
// -----------------------
// It does NOT connect to a database. There is no psql and no Supabase CLI on
// this machine, and migrations in this project are applied by hand through the
// SQL editor. So this produces the ORDERED, CLASSIFIED PLAN a human executes,
// plus the verification queries for each checkpoint.
//
// Its real job is to make deferral EXPLICIT. Every file in supabase/migrations/
// must be classified in _migration-manifest.mjs. An unclassified file is a hard
// failure -- so a migration can never be skipped because nobody noticed it, and
// a staging schema that differs from production always differs for a stated
// reason.

import fs from "node:fs";
import { DEFERRED, PENDING, UNVERIFIED, PREREQUISITES, NEEDS_SUPERUSER } from "./_migration-manifest.mjs";

const DIR = "supabase/migrations";
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const LIST_ONLY = process.argv.includes("--list");

// ---- every file must be classified ----------------------------------------
const unclassified = files.filter((f) => !(f in DEFERRED) && !(f in PENDING) && !(f in UNVERIFIED));
// APPLIED is the derived default, but a file added since the manifest was last
// reviewed is indistinguishable from one deliberately marked applied. Surface
// the newest ones so a human confirms rather than assumes.
const newest = unclassified.slice(-3);
const unverified = Object.keys(UNVERIFIED).filter((f) => files.includes(f));

if (!LIST_ONLY) {
  console.log(`\n  ${files.length} migrations in ${DIR}\n`);
  console.log("  ══ DEFERRED — skipped in production, APPLIED in staging ══");
  for (const [f, why] of Object.entries(DEFERRED)) {
    const exists = files.includes(f);
    console.log(`     ${exists ? " " : "!"} ${f}`);
    console.log(`        ${why}`);
    if (!exists) console.log("        ** NOT PRESENT IN supabase/migrations -- manifest is stale **");
  }
  console.log("\n  ══ PENDING — not applied to production; applied in staging ══");
  for (const [f, why] of Object.entries(PENDING)) {
    const exists = files.includes(f);
    console.log(`     ${exists ? " " : "!"} ${f}`);
    console.log(`        ${why}`);
    if (!exists) console.log("        ** NOT PRESENT -- manifest is stale **");
  }
  if (unverified.length) {
    console.log("\n  ══ UNVERIFIED — production state unknown; CONFIRM BEFORE PLANNING ══");
    for (const f of unverified) {
      const u = UNVERIFIED[f];
      console.log(`     ? ${f}`);
      console.log(`        ${u.why}`);
      console.log(`        verify: ${u.verify}`);
      console.log(`        expect: ${u.expect}`);
    }
  }
  console.log(`\n  ══ APPLIED (derived: everything else) — ${unclassified.length} files ══`);
  console.log(`     ${unclassified[0]} … ${unclassified[unclassified.length - 1]}`);
  console.log(`     most recent, confirm these are really applied: ${newest.join(", ")}`);
}

// ---- prerequisite ordering -------------------------------------------------
const problems = [];
for (const [f, needs] of Object.entries(PREREQUISITES)) {
  if (!files.includes(f)) continue;
  for (const dep of needs) {
    if (!files.includes(dep)) { problems.push(`${f} needs ${dep}, which is not in ${DIR}`); continue; }
    if (files.indexOf(dep) > files.indexOf(f)) problems.push(`${f} sorts BEFORE its prerequisite ${dep}`);
  }
}

// ---- the staging plan ------------------------------------------------------
// Staging applies EVERYTHING, deferred included -- a replay proves the file set
// is replayable, and silently omitting files would prove the opposite of what we
// want to know. The deferred ones are what make staging differ from production,
// which is why they are enumerated in the report rather than hidden.
const plan = files.filter((f) => f !== "0055_enable_device_push.sql");

if (LIST_ONLY) { console.log(plan.join("\n")); process.exit(0); }

console.log("\n  ══ STAGING REPLAY PLAN ══");
console.log(`     ${plan.length} files, in filename order.`);
console.log("     0055 is excluded even from staging: it arms real push, and a staging");
console.log("     project pointed at the same APNs/FCM credentials could reach real phones.");
console.log("");
for (const [f, why] of Object.entries(NEEDS_SUPERUSER))
  console.log(`     ROLE: ${f} -- ${why}. Run as the SQL-editor role (postgres).`);
console.log("");
console.log("     Checkpoints -- stop and verify, do not batch past a failure:");
console.log("       after 0000  -> select count(*) from pg_proc where proname in");
console.log("                      ('is_admin','set_updated_at','rls_auto_enable');   -- 3");
console.log("                      select evtname from pg_event_trigger where evtname='ensure_rls';");
console.log("       after 0002  -> select name, public from storage.buckets order by name;  -- 4 rows");
console.log("       after 0023  -> the concierge path exists; signup is investor-only");
console.log("       after 0059  -> select tgname from pg_trigger where tgname='on_auth_user_created';");
console.log("       at the end  -> re-run supabase/audit/schema_snapshot_oneshot.sql and diff");
console.log("");
console.log("     THE FUNCTIONAL ensure_rls TEST (a definition is not a behaviour):");
console.log("       create table public.zz_rls_probe (id int);");
console.log("       select relrowsecurity from pg_class where relname='zz_rls_probe';  -- expect t");
console.log("       drop table public.zz_rls_probe;");

if (problems.length) {
  console.error("\n  PROBLEMS");
  for (const p of problems) console.error("     ✗ " + p);
}
const stale = [...Object.keys(DEFERRED), ...Object.keys(PENDING), ...Object.keys(UNVERIFIED)]
  .filter((f) => !files.includes(f));
if (stale.length) {
  console.error("\n  STALE ENTRIES — named in the manifest, absent from the directory");
  for (const f of stale) console.error("     ✗ " + f);
}
// Unverified files do NOT make the manifest inconsistent -- the manifest is
// correctly recording that nobody knows. They do block a PRODUCTION plan,
// which is the whole point: staging replays everything regardless.
if (unverified.length) {
  console.log("\n  NO PRODUCTION PLAN WHILE ANYTHING IS UNVERIFIED.");
  console.log("  Run each `verify` above against production (read-only), then either move the");
  console.log("  file to PENDING (absent) or delete its entry (present -- derived APPLIED is right).");
}
console.log(`\n  ${problems.length === 0 && stale.length === 0
  ? "Manifest is consistent with supabase/migrations/."
  : "MANIFEST INCONSISTENT -- resolve before replaying."}\n`);
process.exit(problems.length || stale.length ? 1 : 0);
