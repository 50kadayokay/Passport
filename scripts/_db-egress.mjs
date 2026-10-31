// Database-side egress: what a Postgres database can reach on its own, and the
// rules that keep a STAGING database from reaching anything.
//
// WHY THIS EXISTS (S1, 2026-10-30)
// --------------------------------
// The API egress guard (api/_stagingEgress.js) lives in the Node process. A
// database has its own ways out that no Node code can see: pg_cron schedules,
// pg_net HTTP calls, Supabase database webhooks (triggers calling
// supabase_functions.http_request), the `http` extension, dblink and foreign
// servers. Migration 0011 scheduled a pg_cron job POSTing to the PRODUCTION app
// every minute, and the staging replay applied it: 741 requests, all refused
// 401, none of them visible to anything Phase A tested.
//
// THREE LAYERS, used by scripts/apply-migrations.mjs, the seeder and the checker:
//   1. scanMigrationSql   -- static: which statements in a migration can make the
//                            database talk to the network.
//   2. prepareForStaging  -- a staging replay may apply such a migration only
//                            through a TRANSFORM pinned to the file's exact
//                            sha256. Anything else is refused. The migration
//                            file itself is never edited: production applies
//                            the original, byte for byte.
//   3. inspectDatabase /  -- live: what the database can actually do right now,
//      evaluate             and whether it has recently done it. The runner uses
//                            it INSIDE each migration's transaction, so a job
//                            built dynamically (EXECUTE format(...)) that the
//                            static scan cannot see is still rolled back.

import crypto from "node:crypto";

// ---- 1. static scan -----------------------------------------------------------
// Comments stripped first: prose that MENTIONS cron.schedule is not a call.
export const stripSqlComments = (sql) => String(sql).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

export const EGRESS_PATTERNS = [
  ["pg_cron schedule",            /\bcron\s*\.\s*schedule(_in_database)?\s*\(/i],
  ["pg_cron job re-activation",   /\bcron\s*\.\s*alter_job\s*\([^)]*active\s*:?=\s*true/i],
  ["pg_net HTTP call",            /\bnet\s*\.\s*http_(get|post|delete|request)\b/i],
  ["database webhook",            /\bsupabase_functions\s*\.\s*http_request\b/i],
  ["http extension call",         /\b(extensions\s*\.\s*)?http_(get|post|put|patch|delete|head)\s*\(/i],
  ["http / dblink / fdw extension", /\bcreate\s+extension\b[^;]*\b(http|dblink|postgres_fdw|mysql_fdw|oracle_fdw)\b/i],
  ["dblink call",                 /\bdblink(_connect(_u)?|_exec|_open|_send_query)?\s*\(/i],
  ["foreign server",              /\bcreate\s+(foreign\s+data\s+wrapper|server)\b/i],
];

/** Every egress-capable construct in a migration's executable SQL. */
export function scanMigrationSql(sql) {
  const code = stripSqlComments(sql);
  const hits = [];
  for (const [kind, re] of EGRESS_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m; while ((m = g.exec(code))) hits.push({ kind, at: m.index, text: code.slice(m.index, m.index + 80).replace(/\s+/g, " ") });
  }
  return hits;
}

export const sha256 = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");

// ---- 2. staging transforms, pinned to exact file contents -----------------------
// A transform removes the egress and nothing else. Pinned by sha256: if the file
// changes, the transform no longer applies and the replay is REFUSED until a
// person re-reads the file and re-pins it. A transform that silently stopped
// matching would be how a second S1 happened.
export const STAGING_TRANSFORMS = {
  "0011_outbox_ops.sql": {
    sha256: "41a8bd33c156067a6bc7b7684a984440f84a2dec09f2e77ddf6d64710cdac98d",
    why: "schedules a pg_cron job POSTing to the PRODUCTION app every minute (S1). Staging keeps every other object 0011 creates (pg_cron, pg_net, app_secrets, outbox_health, reconcile_outbox); only the schedule is removed.",
    apply(sql) {
      const start = sql.indexOf("select cron.schedule('outbox-drain'");
      const endMarker = "$job$);";
      const end = start < 0 ? -1 : sql.indexOf(endMarker, start);
      if (start < 0 || end < 0) throw new Error("0011 transform: the cron.schedule block was not found");
      return sql.slice(0, start)
        + "-- [staging replay] cron.schedule('outbox-drain', ...) removed by scripts/_db-egress.mjs:\n"
        + "-- it POSTs to the production app. See docs/REMEDIATION-PLAN.md, S1.\n"
        + "select 1;"
        + sql.slice(end + endMarker.length);
    },
  },
};

export class MigrationEgressError extends Error {
  constructor(file, message) { super(`${file}: ${message}`); this.name = "MigrationEgressError"; }
}

/**
 * The SQL a staging replay may run for this file. Returns { sql, transformed, why }
 * or throws MigrationEgressError. Production never runs this function: it applies
 * migrations from the files themselves.
 */
export function prepareForStaging(file, sql) {
  const t = STAGING_TRANSFORMS[file];
  if (t) {
    const digest = sha256(sql);
    if (digest !== t.sha256) {
      throw new MigrationEgressError(file, `contents changed (sha256 ${digest.slice(0, 12)}…, transform pinned to ${t.sha256.slice(0, 12)}…). Re-read the file, then re-pin the transform in scripts/_db-egress.mjs.`);
    }
    const out = t.apply(sql);
    const left = scanMigrationSql(out);
    if (left.length) throw new MigrationEgressError(file, `transform left egress behind: ${left.map((h) => h.kind).join(", ")}`);
    return { sql: out, transformed: true, why: t.why };
  }
  const hits = scanMigrationSql(sql);
  if (hits.length) {
    throw new MigrationEgressError(file,
      `contains database egress (${[...new Set(hits.map((h) => h.kind))].join(", ")}) and has no reviewed staging transform. ` +
      `A staging database must not be able to reach the network on its own. Add a pinned transform to scripts/_db-egress.mjs, or exclude the file.`);
  }
  return { sql, transformed: false, why: "" };
}

// ---- 3. live inspection ------------------------------------------------------------
const HTTP_SRC = /net\s*\.\s*http_|supabase_functions\s*\.\s*http_request|\bhttp_(get|post|put|patch|delete|head)\s*\(|\bdblink/i;
const URL_RE = /https?:\/\/[^\s'"$)]+/gi;
const SYSTEM_SCHEMAS = ["pg_catalog", "information_schema", "net", "cron", "extensions", "supabase_functions",
  "graphql", "graphql_public", "pgsodium", "pgsodium_masks", "vault", "realtime", "storage", "auth", "pgbouncer", "_realtime"];

// One probe query. Inside a transaction a failed query would abort the whole
// migration, so each probe runs under a savepoint and a failure is undone.
async function has(client, sql, args) {
  if (!client.__egressInTx) { try { return (await client.query(sql, args)).rows; } catch { return null; } }
  await client.query("savepoint egress_probe");
  try { const r = (await client.query(sql, args)).rows; await client.query("release savepoint egress_probe"); return r; }
  catch { await client.query("rollback to savepoint egress_probe"); await client.query("release savepoint egress_probe"); return null; }
}

/** What this database can reach on its own, and what it recently did. Read-only.
 *  Pass { inTransaction: true } when called inside an open transaction. */
export async function inspectDatabase(client, { recentMinutes = 5, inTransaction = false } = {}) {
  client.__egressInTx = inTransaction;
  const ext = ((await has(client, "select extname from pg_extension")) || []).map((r) => r.extname);
  const report = { extensions: ext, cronJobs: [], httpFunctions: [], webhookTriggers: [], foreignServers: [], pgNet: null, recentMinutes };

  if (ext.includes("pg_cron")) {
    const jobs = (await has(client, "select jobid::text, jobname, active, schedule, command from cron.job order by jobid")) || [];
    report.cronJobs = jobs.map((j) => ({
      jobid: j.jobid, jobname: j.jobname, active: j.active, schedule: j.schedule,
      egress: HTTP_SRC.test(j.command), targets: [...new Set((j.command.match(URL_RE) || []).map((u) => { try { return new URL(u).host; } catch { return u; } }))],
    }));
  }

  report.httpFunctions = ((await has(client,
    `select n.nspname || '.' || p.proname as fn, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname <> all($1::text[])`, [SYSTEM_SCHEMAS])) || [])
    .filter((r) => HTTP_SRC.test(r.prosrc || "")).map((r) => r.fn);
  // A cron job may call one of these by name rather than containing the call.
  for (const j of report.cronJobs) {
    const cmd = (await has(client, "select command from cron.job where jobid = $1::bigint", [j.jobid]))?.[0]?.command || "";
    if (report.httpFunctions.some((fn) => cmd.includes(fn.split(".").pop()))) j.egress = true;
  }

  report.webhookTriggers = ((await has(client,
    `select c.relname || '.' || t.tgname as trg, pn.nspname || '.' || p.proname as fn, p.prosrc
       from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
       join pg_namespace pn on pn.oid = p.pronamespace where not t.tgisinternal`)) || [])
    .filter((r) => r.fn === "supabase_functions.http_request" || HTTP_SRC.test(r.prosrc || "")).map((r) => `${r.trg} -> ${r.fn}`);

  report.foreignServers = ((await has(client, "select srvname from pg_foreign_server")) || []).map((r) => r.srvname);

  if (ext.includes("pg_net")) {
    const recent = await has(client, `select count(*)::int n, max(created) last from net._http_response where created > now() - ($1 || ' minutes')::interval`, [String(recentMinutes)]);
    const lastEver = await has(client, "select max(created) last from net._http_response");
    const queued = await has(client, "select count(*)::int n from net.http_request_queue");
    report.pgNet = { recent: recent?.[0]?.n ?? null, lastResponse: lastEver?.[0]?.last ?? null, queued: queued?.[0]?.n ?? null };
  }
  client.__egressInTx = false;
  return report;
}

/**
 * Judge a staging database. Returns { fail: [...], contained: [...] }.
 *   fail       anything that can (or recently did) reach the network
 *   contained  an INACTIVE job that would egress if re-activated -- reported,
 *              so it is not forgotten, but not able to send anything as it stands
 */
export function evaluate(report) {
  const fail = [], contained = [];
  for (const j of report.cronJobs) {
    if (!j.egress) continue;
    const line = `pg_cron job ${j.jobid} '${j.jobname}' calls ${j.targets.join(", ") || "an HTTP-capable function"}`;
    (j.active ? fail : contained).push(j.active ? `${line} and is ACTIVE` : `${line} (inactive)`);
  }
  for (const f of report.httpFunctions) fail.push(`function ${f} can make HTTP calls`);
  for (const t of report.webhookTriggers) fail.push(`database webhook trigger ${t}`);
  for (const s of report.foreignServers) fail.push(`foreign server ${s}`);
  for (const e of ["http", "dblink", "postgres_fdw"]) if (report.extensions.includes(e)) fail.push(`extension ${e} is installed`);
  if (report.pgNet) {
    if (report.pgNet.recent) fail.push(`pg_net recorded ${report.pgNet.recent} HTTP response(s) in the last ${report.recentMinutes} minutes`);
    if (report.pgNet.queued) fail.push(`pg_net has ${report.pgNet.queued} queued request(s)`);
  }
  return { fail, contained };
}

/** What a migration ADDED that can egress: compares two inspections. */
// A migration file that manages its OWN transaction (56 of them: a top-level
// `begin;` ... `commit;`) defeats the runner's in-transaction check: the file's
// commit ends the runner's transaction, so the egress inspection that was meant
// to run BEFORE commit runs after it (and its savepoint fails). Found applying
// 0069b, 2026-10-30. The runner now strips the file's own single begin/commit,
// so the runner's transaction -- and its pre-commit check -- governs. Any other
// transaction control in a file is refused rather than guessed at.
// Dollar-quoted bodies ($$ ... $$, $fn$ ... $fn$) and comments are masked out
// first (same length, newlines kept), so plpgsql's own BEGIN / END; inside a
// function is never mistaken for transaction control.
function maskSql(sql) {
  const keepNl = (m) => m.replace(/[^\n]/g, " ");
  return String(sql)
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, keepNl)
    .replace(/\/\*[\s\S]*?\*\//g, keepNl)
    .replace(/--[^\n]*/g, keepNl);
}
const TX_LINE = /^[ \t]*(begin|start[ \t]+transaction|commit|end|rollback|abort)(?:[ \t]+(?:work|transaction))?[ \t]*;[ \t]*$/gim;
export function runnerBody(sql) {
  const src = String(sql), masked = maskSql(src);
  const hits = [...masked.matchAll(TX_LINE)].map((m) => ({ at: m.index, len: m[0].length, kw: m[1].toLowerCase().replace(/\s+/g, " ") }));
  const begins = hits.filter((h) => h.kw === "begin" || h.kw === "start transaction").length;
  const commits = hits.filter((h) => h.kw === "commit").length;
  const other = hits.filter((h) => !["begin", "start transaction", "commit"].includes(h.kw));
  if (begins > 1 || commits > 1 || other.length) {
    throw new Error(`unexpected transaction control in migration (begin x${begins}, commit x${commits}${other.length ? `, ${other.map((h) => h.kw).join("/")}` : ""}); apply it by hand`);
  }
  let out = src;
  for (const h of hits.sort((x, y) => y.at - x.at)) {
    const line = src.slice(h.at, h.at + h.len);
    out = out.slice(0, h.at) + `-- [runner] ${line.trim()} (the runner's transaction governs)` + out.slice(h.at + h.len);
  }
  return out;
}

export function newEgress(before, after) {
  const was = new Map(before.cronJobs.map((j) => [j.jobid, j]));
  const added = [];
  for (const j of after.cronJobs) {
    const prev = was.get(j.jobid);
    if (j.egress && j.active && (!prev || !prev.active || !prev.egress)) added.push(`pg_cron job '${j.jobname}' ${prev ? "re-activated" : "scheduled"} -> ${j.targets.join(", ") || "HTTP function"}`);
  }
  for (const f of after.httpFunctions) if (!before.httpFunctions.includes(f)) added.push(`HTTP-capable function ${f}`);
  for (const t of after.webhookTriggers) if (!before.webhookTriggers.includes(t)) added.push(`webhook trigger ${t}`);
  for (const s of after.foreignServers) if (!before.foreignServers.includes(s)) added.push(`foreign server ${s}`);
  for (const e of ["http", "dblink", "postgres_fdw"]) if (after.extensions.includes(e) && !before.extensions.includes(e)) added.push(`extension ${e}`);
  return added;
}
