// Read-only: can the STAGING database reach the network on its own?
//   node scripts/staging-db-egress-check.mjs [--minutes 5] [--strict]
//
// Covers what the API egress guard cannot see, because it runs inside Postgres:
// pg_cron jobs, pg_net traffic and queue, Supabase database webhooks, functions
// able to make HTTP calls, the http/dblink/fdw extensions and foreign servers.
// Exit 0 = nothing can reach out. --strict also fails on a CONTAINED job (one
// that is inactive but would call out if re-activated).
//
// Runs `set default_transaction_read_only = on` before any query and refuses any
// connection that is not the allowlisted staging project.

import fs from "node:fs";
import pg from "pg";
import { inspectDatabase, evaluate } from "./_db-egress.mjs";

const STAGING_REF = "jmljfovtfxcdhjmtlnva", PRODUCTION_REF = "rvptronniomlqumjhyrr";
const dsn = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (dsn.includes(PRODUCTION_REF) || !dsn.includes(STAGING_REF)) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const minutesAt = process.argv.indexOf("--minutes");
const minutes = minutesAt > -1 ? Number(process.argv[minutesAt + 1]) : 5;
const strict = process.argv.includes("--strict");

const c = new pg.Client({ connectionString: dsn, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("set default_transaction_read_only = on");
const report = await inspectDatabase(c, { recentMinutes: minutes });
await c.end();
const { fail, contained } = evaluate(report);

console.log(`\n  staging database egress (read-only)`);
console.log(`  extensions: ${report.extensions.join(", ")}`);
for (const j of report.cronJobs) console.log(`  pg_cron ${j.jobid} ${j.jobname.padEnd(16)} active=${j.active} egress=${j.egress}${j.targets.length ? " -> " + j.targets.join(", ") : ""}`);
console.log(`  HTTP-capable functions: ${report.httpFunctions.length}   webhook triggers: ${report.webhookTriggers.length}   foreign servers: ${report.foreignServers.length}`);
if (report.pgNet) console.log(`  pg_net: ${report.pgNet.recent} response(s) in the last ${minutes} min, ${report.pgNet.queued} queued, last ever ${report.pgNet.lastResponse ? new Date(report.pgNet.lastResponse).toISOString() : "never"}`);
for (const v of contained) console.log(`  contained: ${v}`);
for (const v of fail) console.error(`  ✗ ${v}`);
const bad = fail.length || (strict && contained.length);
console.log(bad ? "\n  DATABASE CAN REACH THE NETWORK.\n" : `\n  No database egress.${contained.length ? ` (${contained.length} contained job(s); --strict fails on them)` : ""}\n`);
process.exit(bad ? 1 : 0);
