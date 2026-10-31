// Apply the migration set to a NON-PRODUCTION Postgres, in order, over a real
// connection.
//
//   node scripts/apply-migrations.mjs            # apply, stop at the first failure
//   node scripts/apply-migrations.mjs --dry      # list the plan, connect to nothing
//   node scripts/apply-migrations.mjs --from 0042_source_inventories.sql
//
// WHY THIS EXISTS
// ---------------
// Until now the only way to build an environment from this repo was to paste 74
// files into the SQL editor by hand. That is not a reproducibility story, it is
// a ritual: it cannot be repeated identically, a failure halfway leaves no
// record of where, and nobody will do it twice.
//
// CREDENTIALS
// -----------
// The connection string is read from supabase/staging/.connection (gitignored)
// or $STAGING_DATABASE_URL. It is never printed, never logged, and never echoed
// into an error message -- every message here names the FILE, not the DSN.
//
// SAFETY
// ------
// It refuses the production project by ref, like the isolation suite, and no
// flag overrides that. It also refuses any DSN that is not obviously a staging
// or local host unless --i-know is passed.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { prepareForStaging, MigrationEgressError, inspectDatabase, newEgress, evaluate, runnerBody } from "./_db-egress.mjs";

// MIGRATIONS_DIR exists for tests only (scripts/staging-db-guard-test.mjs points
// the runner at a temporary copy to prove it refuses). Every safety check below
// applies to whatever directory is used.
const DIR = process.env.MIGRATIONS_DIR || "supabase/migrations";
// FAIL CLOSED, NOT OPEN.
// A denylist of production refs only stops the project someone remembered to
// name. `supabase.co` satisfies the "looks like staging" test, so ANY other
// Supabase project -- a second production environment, a customer's -- would
// sail through. The allowlist inverts that: a ref nobody has vouched for is
// refused, and adding one is a deliberate edit to this line.
const ALLOWED_REFS = ["jmljfovtfxcdhjmtlnva"];   // mineex-staging, created 2026-10-29
const PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];
const EXCLUDED = {
  "0055_enable_device_push.sql":
    "arms real push; a staging project pointed at the same APNs/FCM credentials could reach real phones",
};
// CREATE INDEX CONCURRENTLY cannot run inside a transaction block, so a file
// containing one is applied statement-by-statement with no wrapping BEGIN.
//
// DETECTED, NOT LISTED. This was a hand-kept set holding the one file somebody
// remembered, and 0050b -- which has six such statements -- was not in it. A
// curated list of files with a property is a list that goes stale; reading the
// property off the file does not.
//
// Comments have to come out first: 0050a mentions CONCURRENTLY only in prose
// and must stay transactional, and 0050b's first three matches are comments
// too, so a naive search is wrong in both directions.
const stripSql = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const needsNoTransaction = (sql) =>
  /\b(create|drop|reindex)\b[\s\S]{0,120}?\bconcurrently\b/i.test(stripSql(sql));

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
// indexOf returns -1 when absent, and argv[-1 + 1] is argv[0] -- which made
// `--dry` read as the starting filename.
const fromAt = argv.indexOf("--from");
const FROM = fromAt >= 0 ? (argv[fromAt + 1] || "").trim() : "";
const FORCE = argv.includes("--i-know");

function dsn() {
  const f = "supabase/staging/.connection";
  if (process.env.STAGING_DATABASE_URL) return process.env.STAGING_DATABASE_URL.trim();
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
  return "";
}

function assertNotProduction(url) {
  let host = "";
  try { host = new URL(url).host; } catch { host = url; }
  for (const ref of PRODUCTION_REFS) {
    if (url.includes(ref)) {
      console.error("\n  REFUSING TO RUN.");
      console.error(`  The connection string points at the production project (${ref}).`);
      console.error("  This applies DDL. Point it at staging. There is no override, by design.\n");
      process.exit(2);
    }
  }
  const isLocal = /localhost|127\.0\.0\.1/i.test(host);
  const vouched = ALLOWED_REFS.some((ref) => url.includes(ref));
  if (!isLocal && !vouched && !FORCE) {
    console.error("\n  REFUSING TO RUN.");
    console.error("  This host is not localhost and names no project ref from ALLOWED_REFS.");
    console.error("  Add the ref to ALLOWED_REFS in this file if it is genuinely a throwaway");
    console.error("  environment, or pass --i-know. It is refused by default on purpose.\n");
    process.exit(2);
  }
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
  .filter((f) => !(f in EXCLUDED))
  .filter((f) => !FROM || f >= FROM);

// DATABASE EGRESS (S1). This runner only ever targets a non-production database
// (see assertNotProduction), so every replay is held to the staging rule: the
// database must not be able to reach the network on its own. A migration that
// schedules an outbound job, calls pg_net, adds a webhook or a foreign server is
// applied only through a transform pinned to its exact contents, and refused
// otherwise -- BEFORE anything connects. Migration files are never edited.
const prepared = new Map();
const refused = [];
for (const f of files) {
  try { prepared.set(f, prepareForStaging(f, fs.readFileSync(path.join(DIR, f), "utf8"))); }
  catch (e) { if (e instanceof MigrationEgressError) refused.push(e.message); else throw e; }
}

console.log(`\n  ${files.length} files to apply${FROM ? `, from ${FROM}` : ""}`);
for (const [f, why] of Object.entries(EXCLUDED)) console.log(`  excluded: ${f} -- ${why}`);
for (const [f, p] of prepared) if (p.transformed) console.log(`  transformed for staging: ${f} -- ${p.why}`);
if (refused.length) {
  console.error("\n  REFUSING TO RUN: database egress without a reviewed staging transform.");
  for (const r of refused) console.error(`   ${r}`);
  console.error("");
  process.exit(2);
}

if (DRY) { files.forEach((f) => console.log("   " + f)); process.exit(0); }

const url = dsn();
if (!url) {
  console.error("\n  No connection string.");
  console.error("  Put it in supabase/staging/.connection (gitignored), or set STAGING_DATABASE_URL.\n");
  process.exit(2);
}
assertNotProduction(url);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
// A failure to connect must not print the DSN: pg puts the host in the message,
// which is fine, but the password lives in the same string.
try { await client.connect(); }
catch (e) { console.error(`\n  Could not connect: ${e.code || e.message}\n`); process.exit(2); }

let applied = 0;
for (const f of files) {
  const sql = prepared.get(f).sql;
  const bare = needsNoTransaction(sql);
  process.stdout.write(`   ${f.padEnd(46)}`);
  try {
    if (bare) {
      // Split on semicolons at end of line, outside dollar-quoting. These files
      // are plain CREATE INDEX statements, so the simple split is sound.
      const stmts = sql.split(/;\s*$/m).map((s) => s.trim()).filter((s) => s && !/^--/.test(s));
      const before = await inspectDatabase(client);
      for (const s of stmts) await client.query(s);
      const added = newEgress(before, await inspectDatabase(client));
      // No transaction to roll back here; these files are bare CREATE INDEX
      // statements, so this can only fire if one is something else entirely.
      if (added.length) throw Object.assign(new Error(`added database egress: ${added.join("; ")}`), { egress: true });
      console.log("ok (no transaction)");
    } else {
      const before = await inspectDatabase(client);
      await client.query("begin");
      // The file's own begin/commit is stripped: otherwise its commit would end
      // this transaction before the egress check below (runnerBody, _db-egress).
      await client.query(runnerBody(sql));
      // Checked INSIDE the transaction, before commit: a job built at runtime
      // (EXECUTE format(...)) escapes the static scan but not this. Rolled back.
      const added = newEgress(before, await inspectDatabase(client, { inTransaction: true }));
      if (added.length) throw Object.assign(new Error(`added database egress, rolled back: ${added.join("; ")}`), { egress: true });
      await client.query("commit");
      console.log(prepared.get(f).transformed ? "ok (staging transform)" : "ok");
    }
    applied++;
  } catch (e) {
    if (!bare) { try { await client.query("rollback"); } catch { /* already aborted */ } }
    console.log("FAILED");
    console.error(`\n  ${f}`);
    console.error(`  ${e.severity || "ERROR"}: ${e.message}`);
    if (e.detail)   console.error(`  detail: ${e.detail}`);
    if (e.hint)     console.error(`  hint:   ${e.hint}`);
    if (e.position) console.error(`  position: ${e.position}`);
    if (e.where)    console.error(`  where:  ${String(e.where).split("\n")[0]}`);
    console.error(`\n  ${applied} file(s) applied before this one. Nothing after it ran.`);
    console.error(`  Fix the file, then: node scripts/apply-migrations.mjs --from ${f}\n`);
    await client.end();
    process.exit(1);
  }
}

// Final state: nothing may be able to reach the network, transform or not.
const verdict = evaluate(await inspectDatabase(client));
await client.end();
if (verdict.fail.length) {
  console.error("\n  APPLIED, BUT THE DATABASE CAN REACH THE NETWORK:");
  for (const v of verdict.fail) console.error(`   ✗ ${v}`);
  process.exit(1);
}
for (const v of verdict.contained) console.log(`  contained (inactive): ${v}`);
console.log(`\n  ALL ${applied} APPLIED. Database egress: none.\n`);
