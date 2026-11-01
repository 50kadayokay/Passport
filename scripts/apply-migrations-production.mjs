// PRODUCTION migration runner (launch gate g06). BUILT, NOT RUN.
//
//   node scripts/apply-migrations-production.mjs
//       The PLAN: what production still needs, in order, with each file's
//       prerequisites, rollback and checkpoint. Connects to NOTHING. Production's
//       state comes from the recorded read-only audit, not a live call.
//
//   PRODUCTION_DSN_FILE=/path/outside/repo/prod.dsn \
//   node scripts/apply-migrations-production.mjs --apply --only <file> \
//       --ref=<production ref> --approved-by="<who approved, and where>"
//       Applies ONE file. Every one of these is required, and the ref must also
//       be TYPED at an interactive prompt.
//
//   --record-manual <file>   a CONCURRENTLY file was run by hand anyway; log it (no connection)
//   --reviewed <file>        a failed or interrupted run was inspected; log it (no connection)
//   --audit <record.json>    a newer audit record (default: the 2026-11-01 one)
//   PRODUCTION_DB_CA_FILE    Supabase's CA certificate, to verify the server
//
// WHY A SEPARATE FILE
// -------------------
// apply-migrations.mjs is the STAGING runner and refuses production by ref with
// no override. That stays exactly as it is: loosening its allowlist would make
// one typo the difference between staging and production. This file is the
// reverse -- production only, and refuses the staging ref.
//
// REFUSES (before the DSN is read or anything connects)
//   no --apply / --approved-by / --ref; a ref that is not PRODUCTION_REFS
//   exactly; the staging ref; zero or several files; a file that is not the
//   next step; a CONCURRENTLY file holding anything but CREATE/DROP INDEX
//   CONCURRENTLY and ANALYZE; a file without a rollback or a checkpoint
//   marker; a file that disables triggers or adds database egress; an
//   unresolved earlier run; a non-interactive confirmation or a mistyped ref.
// AND (before connecting): the DSN file inside the repo, readable by others,
// naming staging or another host, or connecting as anything but `postgres`.
//
// CAPTURE FIRST: before the file's transaction, every function it creates,
// replaces, alters, drops or re-grants is read from production (definition,
// owner, ACL) and written to supabase/audit/results/apply-capture-<file>-<time>.sql
// (gitignored, mode 600): a rollback that restores PRODUCTION's text, which
// can differ from the repo's. A file whose functions cannot be pinned exactly
// is refused; if the capture fails, nothing is applied. Bodies are never printed.
//
// CONCURRENTLY FILES (0065c, 0073a) run with NO transaction: statement by
// statement, each with its own statement_timeout and a 3s lock_timeout (so it
// fails rather than queue in front of the investor app), and after each CREATE
// pg_index must read the index valid. An INVALID index stops the run and the
// recovery is printed: DROP INDEX CONCURRENTLY IF EXISTS <name>, then retry.
// Their checkpoint includes "every index valid". See _concurrent-indexes.mjs.
//
// EACH APPLY: the marker must read NOT applied; capture; pre-snapshot (functions,
// policies, tables, triggers, indexes, row counts); one transaction holding the
// file; inside it the marker must read applied and no egress may appear; commit;
// post-snapshot and diff. Any error rolls back and stops. Everything -- who
// approved it, the file's sha256, the diff -- goes to supabase/production-log/.
// The DSN is never printed or logged.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import pg from "pg";
import {
  DEFAULT_LOG_DIR, Refusal, redact, applyConcurrent, loadRecord, parseQ01Markers, readLog, buildPlan, formatPlan,
  parseArgs, checkRequest, readDsn, confirmRef, applyOne, formatDiff, appendLog,
} from "./_production-migrations.mjs";
import { CAPTURE_DIR, gitIgnores, writeCaptureFile } from "./_function-capture.mjs";

const DIR = process.env.MIGRATIONS_DIR || "supabase/migrations";
const LOG_DIR = process.env.PRODUCTION_LOG_DIR || DEFAULT_LOG_DIR;
const LOG = path.join(LOG_DIR, "apply-log.jsonl");
const secrets = [];
const fail = (code, msg) => { console.error(`\n  REFUSING: ${redact(msg, secrets)}\n`); process.exit(code); };
process.on("unhandledRejection", (e) => fail(1, (e && e.message) || String(e)));
process.on("uncaughtException", (e) => fail(1, (e && e.message) || String(e)));

const args = parseArgs(process.argv.slice(2));
let record, plan, log;
try {
  record = loadRecord(args.audit);
  log = readLog(LOG);
  const q01Markers = parseQ01Markers(fs.readFileSync(record.query.split(" ")[0], "utf8"));
  plan = buildPlan({ files: fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")), record, log, q01Markers, dir: DIR });
} catch (e) { fail(2, e.message); }

const wantsAction = args.apply || args.recordManual || args.reviewed || args.only.length || args.approvedBy != null || args.ref != null;
if (!wantsAction) {
  if (args.unknown.length) fail(2, `unknown argument(s): ${args.unknown.join(" ")}`);
  console.log(formatPlan(plan, record));
  process.exit(0);
}

const kind = args.reviewed ? "reviewed" : args.recordManual ? "record-manual" : "apply";
let item;
try { item = checkRequest(args, plan, log, { kind, read: (f) => fs.readFileSync(path.join(DIR, f), "utf8") }); }
catch (e) { fail(2, e.message); }

const ask = (q) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); resolve(a); });
});
const base = { ref: args.ref, approved_by: args.approvedBy.trim(), file: item.file, sha256: item.sha256 || null, audit: args.audit };

if (kind !== "apply") {
  try { await confirmRef(args.ref, item.file, ask, { isTTY: !!process.stdin.isTTY }); } catch (e) { fail(2, e.message); }
  appendLog(LOG, { ...base, status: kind === "reviewed" ? "reviewed" : "applied-manually" });
  console.log(`\n  Logged ${item.file} as ${kind === "reviewed" ? "reviewed" : "applied by hand"} (approved by: ${base.approved_by}). Nothing was connected to.\n`);
  process.exit(0);
}

if (item.captures.length && !gitIgnores(path.join(CAPTURE_DIR, "apply-capture-probe.sql"))) fail(2, `${CAPTURE_DIR} is not gitignored; the capture of production's functions must never be committable`);

let conn;
try { conn = readDsn(process.env, args.ref); } catch (e) { fail(2, e.message); }
secrets.push(conn.dsn, conn.password);
try { await confirmRef(args.ref, item.file, ask, { isTTY: !!process.stdin.isTTY }); } catch (e) { fail(2, e.message); }

const sql = fs.readFileSync(path.join(DIR, item.file), "utf8");
// Supabase's server certificate is signed by Supabase's own CA. Give its file in
// PRODUCTION_DB_CA_FILE to verify it; without it the link is encrypted but the
// server is not authenticated (as every staging script here), and it says so.
const caFile = (process.env.PRODUCTION_DB_CA_FILE || "").trim();
if (!caFile) console.log("  note: PRODUCTION_DB_CA_FILE not set; TLS is not verifying the server certificate");
const ssl = caFile ? { ca: fs.readFileSync(caFile, "utf8"), rejectUnauthorized: true } : { rejectUnauthorized: false };
const client = new pg.Client({ connectionString: conn.dsn, ssl, application_name: "mineex-production-migration" });
try { await client.connect(); }
catch (e) { fail(1, `could not connect (${e.code || "error"}): ${e.message}`); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const snapBase = path.join(LOG_DIR, `${stamp}_${item.file.replace(/\.sql$/, "")}`);
appendLog(LOG, { ...base, status: "started", role: "postgres" });
console.log(`\n  Applying ${item.file} (step 1 of ${plan.items.length}); approved by: ${base.approved_by}`);
try {
  let capture = null;
  const writeCapture = (captured) => {
    capture = writeCaptureFile(captured, { file: item.file, sha256: item.sha256, ref: args.ref, at: new Date().toISOString() }, { say: (m) => console.log(m) });
    appendLog(LOG, { ...base, status: "captured", capture: capture.path, capture_sha256: capture.sha256, functions: captured.length });
    return capture.path;
  };
  const r = item.mode === "concurrently"
    ? await applyConcurrent(client, item, sql, { say: (m) => console.log(m) })
    : await applyOne(client, item, sql, { say: (m) => console.log(m), writeCapture });
  fs.writeFileSync(`${snapBase}.pre.json`, JSON.stringify(r.pre, null, 1));
  fs.writeFileSync(`${snapBase}.post.json`, JSON.stringify(r.post, null, 1));
  appendLog(LOG, { ...base, status: "applied", checkpoint: r.checkpoint, server_version: r.serverVersion, diff: r.diff, snapshots: `${snapBase}.{pre,post}.json` });
  console.log(`\n  APPLIED ${item.file}. Checkpoint (${item.marker.from}): ${r.checkpoint ? "true" : "FALSE"}`);
  console.log("  What changed:");
  console.log(formatDiff(r.diff));
  console.log(`\n  Compare that with the step's intended change, then re-run the read-only audit.`);
  console.log(`  Rollback if needed: ${item.rollback}${item.mode === "concurrently" ? " -- statement by statement, OUTSIDE a transaction" : ""}${r.capturePath ? `\n  then, for production's own function text and grants: ${r.capturePath}` : ""}\n`);
} catch (e) {
  if (e.pre) fs.writeFileSync(`${snapBase}.pre.json`, JSON.stringify(e.pre, null, 1));
  appendLog(LOG, { ...base, status: "failed", error: redact(e.message, secrets), code: e.code || null });
  console.error(item.mode === "concurrently" ? `\n  FAILED: ${item.file} -- stopped; no statement after it ran (no transaction: what ran before it stays).` : `\n  FAILED: ${item.file} -- rolled back, nothing after it ran.`);
  if (e.recovery) console.error(`  RECOVER: ${e.recovery}   (then record --reviewed and retry)`);
  if (e.capturePath) console.error(`  The capture taken before it is kept: ${e.capturePath}`);
  console.error(`  ${e.severity || "ERROR"}: ${redact(e.message, secrets)}`);
  if (e.detail) console.error(`  detail: ${redact(e.detail, secrets)}`);
  if (e.hint) console.error(`  hint:   ${redact(e.hint, secrets)}`);
  console.error(`\n  Inspect production, then: node scripts/apply-migrations-production.mjs --reviewed ${item.file} --ref=... --approved-by=...\n`);
  await client.end().catch(() => {});
  process.exit(1);
}
await client.end();
