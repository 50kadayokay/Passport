// The logic behind scripts/apply-migrations-production.mjs (launch gate g06),
// kept free of I/O side effects so scripts/apply-migrations-production-test.mjs
// can prove every refusal OFFLINE.
//
// WHAT PRODUCTION STILL NEEDS comes from the recorded read-only audit
// (supabase/audit/production_applied_*.json) plus this runner's own apply log --
// never from a live call. The manifest (scripts/_migration-manifest.mjs) says
// what is deferred and why each pending file exists; where the audit and the
// manifest disagree in the dangerous direction, nothing is planned.
//
// Nothing here connects to anything. The functions that take a `client` are
// handed one by the CLI, after every check below has passed.

import fs from "node:fs";
import path from "node:path";
import { DEFERRED, PENDING, UNVERIFIED, PREREQUISITES, NEEDS_SUPERUSER } from "./_migration-manifest.mjs";
import { stripSqlComments, scanMigrationSql, runnerBody, sha256, inspectDatabase, newEgress } from "./_db-egress.mjs";
import { functionTargets, captureFunctions, verifyCaptureUnchanged } from "./_function-capture.mjs";
import { parseConcurrentFile, validitySql, runConcurrentSteps, TIMEOUTS } from "./_concurrent-indexes.mjs";

// The same ref apply-migrations.mjs refuses. Exactly one; a typed --ref must
// equal it character for character.
export const PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];
export const STAGING_REFS = ["jmljfovtfxcdhjmtlnva"];
export const DEFAULT_AUDIT = "supabase/audit/production_applied_2026_11_01.json";
export const DEFAULT_LOG_DIR = "supabase/production-log";
export const DSN_ENV = "PRODUCTION_DSN_FILE";

// Ordering the filename sort gets wrong. 0077 keeps installed 1.3.x apps able
// to report a listing; 0058 closes that path. They go out back to back, with
// nothing in between (the manifest: "in the SAME session as 0058, right after").
export const IMMEDIATELY_AFTER = {
  "0077_listing_reports_installed_app_compat.sql": "0058_close_public_insert.sql",
};

// Read-only markers for the files the 2026-11-01 audit predates. Each is TRUE
// only once that file has run. Q01's own markers (parsed from the audit SQL)
// cover everything the audit tested.
export const POST_AUDIT_MARKERS = {
  "0077_listing_reports_installed_app_compat.sql":
    `has_table_privilege('anon', 'public.listing_reports', 'INSERT') and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'listing_reports' and policyname = 'listing_reports_insert' and 'anon' = any(roles) and with_check ~* 'coalesce\\(contact')`,
  "0078_storage_role_hardening.sql":
    `to_regprocedure('public.can_upload_company_assets()') is not null`,
  "0080_mineiq_search_any_term.sql":
    `coalesce((select pg_get_functiondef(p.oid) ~ 'plainto_tsquery' from pg_proc p where p.oid = to_regprocedure('public.mineiq_search(uuid, text, integer)')), false)`,
  "0085_conference_booth_config.sql":
    `to_regclass('public.conference_booth_configs') is not null`,
  "0086_service_requests.sql":
    `to_regclass('public.service_requests') is not null`,
  "0087_audience_events.sql":
    `to_regclass('public.company_events') is not null and to_regprocedure('public.record_company_events(jsonb)') is not null`,
  "0088_content_fanout.sql":
    `to_regclass('public.destination_content') is not null`,
  // 0090 and 0091 both replace mark_notifications_cleared, and pg_get_functiondef
  // keeps comments, so each marker matches CODE only that version (or a later
  // one) has. 0090's reads true under 0091 too: otherwise the runner, which
  // only requires "marker false", could re-apply 0090 over 0091 (S3's finding).
  "0090_notification_clear_roles.sql":
    `coalesce((select pg_get_functiondef(p.oid) ~ 'has_company_role\\(p_company|m\\.role in \\(''owner'',''admin''\\)' from pg_proc p where p.oid = to_regprocedure('public.mark_notifications_cleared(uuid)')), false)`,
  "0091_notification_clear_no_platform_admin.sql":
    `coalesce((select pg_get_functiondef(p.oid) ~ 'm\\.role in \\(''owner'',''admin''\\)' from pg_proc p where p.oid = to_regprocedure('public.mark_notifications_cleared(uuid)')), false)`,
};

// Q01 markers the audit itself got wrong. 0061a's tested a table that never had
// an anon grant, so it read "applied" while anon still held every privilege on
// company_follows and post_events (the record's `corrections`). Its checkpoint
// tests those two tables instead.
const ANY_PRIVILEGE = "SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER";
export const CORRECTED_MARKERS = {
  "0061a_table_privilege_hardening.sql":
    `not has_table_privilege('anon', 'public.company_follows', '${ANY_PRIVILEGE}') and not has_table_privilege('anon', 'public.post_events', '${ANY_PRIVILEGE}')`,
};

export class Refusal extends Error {
  constructor(message) { super(message); this.name = "Refusal"; }
}
const refuse = (m) => { throw new Refusal(m); };

// ---- redaction ------------------------------------------------------------------
// A DSN (or its password) must never reach the terminal or the log, including
// inside a driver error. Known secrets are removed literally first, then any
// connection-string shape that is left.
export function redact(text, secrets = []) {
  let s = String(text ?? "");
  for (const x of secrets.filter((v) => v && String(v).length >= 4).sort((a, b) => String(b).length - String(a).length)) {
    s = s.split(String(x)).join("[redacted]");
    try { const enc = encodeURIComponent(String(x)); if (enc !== x) s = s.split(enc).join("[redacted]"); } catch { /* not encodable */ }
  }
  return s
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgres://[redacted]")
    .replace(/\b(password|pwd|sslpassword)\s*=\s*[^\s&;]+/gi, "$1=[redacted]");
}

// ---- the audit record and the manifest ---------------------------------------------
export function loadRecord(file) {
  let rec;
  try { rec = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { refuse(`cannot read the audit record ${file}: ${e.code || e.message}`); }
  if (!PRODUCTION_REFS.includes(rec.project_ref)) refuse(`the audit record ${file} is not for the production project (project_ref ${rec.project_ref || "missing"})`);
  if (!rec.q01 || typeof rec.q01 !== "object") refuse(`the audit record ${file} has no q01 results`);
  for (const [f, st] of Object.entries(rec.q01)) {
    if (!["applied", "pending", "deferred"].includes(st)) refuse(`audit record: ${f} has state '${st}' (expected applied | pending | deferred)`);
  }
  return rec;
}

/** Q01's per-migration markers, taken from the audit SQL itself so the runner's
 *  checkpoints and the audit can never test different things. */
export function parseQ01Markers(sql) {
  const start = sql.indexOf("with m(migration, present, evidence) as (");
  const end = sql.indexOf("\n)\nselect 'Q01'", start);
  if (start < 0 || end < 0) refuse("could not find Q01 in the audit SQL");
  const body = sql.slice(sql.indexOf("(", start + "with m(migration, present, evidence) as ".length) + 1, end).trim().replace(/^select\s+/i, "");
  const out = {};
  for (const entry of body.split(/\n\s*union all select\s+/i)) {
    const m = entry.trim().match(/^'([^']+)',\s*([\s\S]+?),\s*('(?:[^']|'')*')\s*$/);
    if (!m) refuse(`could not parse a Q01 row: ${entry.slice(0, 60)}`);
    const file = m[1].replace(/\s*\(.*\)\s*$/, "") + ".sql";
    out[file] = { sql: m[2].trim(), evidence: m[3].slice(1, -1).replace(/''/g, "'") };
  }
  return out;
}

export function markerFor(file, q01Markers) {
  if (CORRECTED_MARKERS[file]) return { sql: CORRECTED_MARKERS[file], evidence: "corrected: Q01's marker was wrong (see the audit record)", from: "runner (Q01 corrected)" };
  if (q01Markers[file]) return { sql: q01Markers[file].sql, evidence: q01Markers[file].evidence, from: "audit Q01" };
  if (POST_AUDIT_MARKERS[file]) return { sql: POST_AUDIT_MARKERS[file], evidence: "written after the audit; this runner's marker", from: "runner" };
  return null;
}
/** The checkpoint statement: one boolean, read-only. NULL (a prerequisite
 *  object is missing) reads as not applied. */
export const markerSelect = (m) => `select coalesce((${m.sql}), false) as applied`;

const num = (f) => f.slice(0, 4);
const isConcurrently = (sql) => /\b(create|drop|reindex)\b[\s\S]{0,120}?\bconcurrently\b/i.test(stripSqlComments(sql));
// Never disable triggers -- not with ALTER TABLE, not with the replica role
// that silences every one of them at once.
const DISABLES_TRIGGERS = /\bdisable\s+trigger\b|\bsession_replication_role\b/i;

export function readLog(logFile) {
  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, "utf8").split("\n").filter((l) => l.trim()).map((l, i) => {
    try { return JSON.parse(l); } catch { refuse(`apply log ${logFile} line ${i + 1} is not JSON; fix it by hand before anything runs`); }
  });
}
/** A run that started and never finished, or failed and was not reviewed, stops
 *  everything: production's state is unknown until a person has looked. */
export function unresolved(log) {
  const open = new Map();
  for (const e of log) {
    if (e.status === "started" || e.status === "failed") open.set(e.file, e);
    else if (["applied", "applied-manually", "reviewed"].includes(e.status)) open.delete(e.file);
  }
  return [...open.values()];
}

/**
 * The ordered list of migrations production still needs.
 *   files     every *.sql in the migrations directory
 *   record    the audit record (loadRecord)
 *   log       this runner's apply log (readLog)
 * Returns { items, applied, deferred, skipped, warnings }; refuses outright on
 * anything whose production state is unknown.
 */
export function buildPlan({ files, record, log = [], q01Markers, dir = "supabase/migrations", rollbacksDir = "supabase/rollbacks",
  manifest = { DEFERRED, PENDING, UNVERIFIED, PREREQUISITES, NEEDS_SUPERUSER }, read = (f) => fs.readFileSync(path.join(dir, f), "utf8") }) {
  const warnings = [];
  if (Object.keys(manifest.UNVERIFIED || {}).length) refuse(`the manifest has UNVERIFIED migrations (${Object.keys(manifest.UNVERIFIED).join(", ")}): no production plan until they are checked`);
  for (const f of Object.keys(record.q01)) if (!files.includes(f)) refuse(`the audit record names ${f}, which is not in ${dir}`);

  const doneByLog = new Set(log.filter((e) => e.ref === record.project_ref && (e.status === "applied" || e.status === "applied-manually")).map((e) => e.file));
  const firstQ01 = Object.keys(record.q01).map(num).sort()[0] || "9999";
  const applied = [], deferred = [], skipped = [], pending = [];
  for (const f of [...files].sort()) {
    const st = record.q01[f], why = manifest.PENDING[f];
    if (record.not_for_production?.[f]) { skipped.push({ file: f, why: record.not_for_production[f] }); continue; }
    if (f in manifest.DEFERRED) {
      if (st === "applied") refuse(`${f} is DEFERRED in the manifest but the audit says production has it: resolve that before planning`);
      deferred.push({ file: f, why: manifest.DEFERRED[f] }); continue;
    }
    if (st === "deferred") refuse(`the audit treats ${f} as deferred but the manifest does not defer it`);
    if (st === "applied") {
      if (why) warnings.push(`${f}: the audit says production has it; the manifest still lists it PENDING (move it out)`);
      applied.push(f); continue;
    }
    if (st === "pending") {
      if (!why) refuse(`the audit says ${f} is pending but the manifest classifies it as applied: resolve that before planning`);
      if (doneByLog.has(f)) { applied.push(f); continue; }
      pending.push({ file: f, why, source: "audit Q01" }); continue;
    }
    // Not tested by the audit.
    if (num(f) < firstQ01) {
      if (why) refuse(`${f} predates the audit, was not tested by it, and the manifest lists it PENDING: its production state is unknown`);
      applied.push(f); continue;
    }
    if (!why) refuse(`${f} was written after the audit and is not in the manifest's PENDING list: its production state is unknown`);
    if (doneByLog.has(f)) { applied.push(f); continue; }
    pending.push({ file: f, why, source: "written after the audit" });
  }
  for (const f of doneByLog) if (!files.includes(f)) refuse(`the apply log names ${f}, which is not in ${dir}`);

  // Order: filename sort, then the back-to-back pairs.
  let order = pending.map((p) => p.file);
  for (const [f, anchor] of Object.entries(IMMEDIATELY_AFTER)) {
    if (!order.includes(f)) continue;
    order = order.filter((x) => x !== f);
    const at = order.indexOf(anchor);
    if (at >= 0) order.splice(at + 1, 0, f);
    else { order.unshift(f); warnings.push(`${f} goes FIRST: ${anchor} is already applied without it`); }
  }

  const items = order.map((f, i) => {
    const p = pending.find((x) => x.file === f);
    const sql = read(f);
    const prereqs = (manifest.PREREQUISITES[f] || []).map((r) => {
      if (applied.includes(r)) return { file: r, status: "applied" };
      const k = order.indexOf(r);
      if (k >= 0 && k < i) return { file: r, status: `step ${k + 1}` };
      refuse(`${f} needs ${r}, which is neither applied nor earlier in the plan`);
    });
    const rb = f.replace(/\.sql$/, ".rollback.sql");
    const mode = isConcurrently(sql) ? "concurrently" : "transaction";
    let marker = markerFor(f, q01Markers);
    let captures = null, captureError = null;
    try { captures = functionTargets(sql); } catch (e) { captureError = e.message; }
    // A CONCURRENTLY file runs statement by statement with no transaction. Its
    // checkpoint adds "every index it builds is valid and ready", and its
    // rollback must be no-transaction too (DROP INDEX CONCURRENTLY only).
    let concurrent = null, concurrentError = null;
    if (mode === "concurrently") {
      try {
        concurrent = parseConcurrentFile(sql);
        if (marker) marker = { ...marker, sql: `(${marker.sql}) and ${validitySql(concurrent)}`, from: `${marker.from} + every index valid` };
        const rbPath = path.join(rollbacksDir, rb);
        if (fs.existsSync(rbPath)) {
          const back = parseConcurrentFile(fs.readFileSync(rbPath, "utf8"));
          if (back.some((x) => x.kind === "create")) throw new Error(`its rollback ${rbPath} builds an index; a rollback here only drops`);
          const dropped = new Set(back.filter((x) => x.kind === "drop").map((x) => x.index));
          const missing = concurrent.filter((x) => x.kind === "create" && !dropped.has(x.index)).map((x) => x.index);
          if (missing.length) throw new Error(`its rollback does not drop ${missing.join(", ")}`);
        }
      } catch (e) { concurrent = null; concurrentError = e.message; }
    }
    return {
      step: i + 1, file: f, sha256: sha256(sql), why: p.why, source: p.source,
      after: IMMEDIATELY_AFTER[f] || null,
      prerequisites: prereqs,
      rollback: fs.existsSync(path.join(rollbacksDir, rb)) ? path.join(rollbacksDir, rb) : null,
      mode, concurrent, concurrentError,
      needsSuperuser: manifest.NEEDS_SUPERUSER[f] || null,
      marker, checkpoint: marker ? markerSelect(marker) : null,
      captures, captureError,
    };
  });
  return { items, applied, deferred, skipped, warnings };
}

export function formatPlan(plan, record) {
  const L = [];
  L.push(`\n  PRODUCTION MIGRATION PLAN (${record.project_ref}) -- nothing was connected to`);
  L.push(`  From the read-only audit of ${record.audited_at} (${record.query}) and this runner's apply log.`);
  L.push(`  ${plan.applied.length} applied, ${plan.deferred.length} deferred, ${plan.skipped.length} not for production, ${plan.items.length} to apply.\n`);
  for (const w of plan.warnings) L.push(`  ! ${w}`);
  if (plan.warnings.length) L.push("");
  for (const it of plan.items) {
    L.push(`  ${String(it.step).padStart(2)}. ${it.file}${it.mode === "concurrently" ? "   [CONCURRENTLY: runner, no transaction]" : ""}`);
    L.push(`      sha256 ${it.sha256.slice(0, 16)}  (${it.source})`);
    L.push(`      why: ${it.why}`);
    if (it.after) L.push(`      run IMMEDIATELY after ${it.after}; nothing in between`);
    L.push(`      needs: ${it.prerequisites.length ? it.prerequisites.map((p) => `${p.file} (${p.status})`).join(", ") : "nothing beyond the files before it"}`);
    L.push(`      rollback: ${it.rollback || "MISSING -- this step cannot be applied"}`);
    if (it.mode === "concurrently") {
      L.push(it.concurrentError ? `      no-transaction run: REFUSED -- this step cannot be applied (${it.concurrentError})`
        : `      no-transaction run: ${it.concurrent.length} statement(s) one at a time (${it.concurrent.map((x) => `${x.kind}${x.index ? ` ${x.index}` : ""}`).join(", ")}); lock_timeout ${TIMEOUTS.lock}; each index must read valid`);
      L.push(`      rollback runs the same way: DROP INDEX CONCURRENTLY, outside a transaction`);
    } else {
      L.push(it.captureError ? `      capture: AMBIGUOUS -- this step cannot be applied (${it.captureError})`
        : it.captures.length ? `      capture: ${it.captures.length} function(s) read from production first, for a production-exact rollback: ${it.captures.map((c) => c.name).join(", ")}`
        : "      capture: none (the file touches no function)");
    }
    L.push(`      checkpoint: ${it.checkpoint || "NO MARKER -- this step cannot be applied"}   -- must return true`);
    L.push(`                  then re-run the read-only audit and diff it against the expected change`);
  }
  if (!plan.items.length) L.push("  Nothing left to apply.");
  for (const d of plan.deferred) L.push(`  deferred: ${d.file}`);
  L.push(`\n  Apply ONE step:  ${DSN_ENV}=<path to a file holding the DSN> node scripts/apply-migrations-production.mjs \\`);
  L.push(`                     --apply --only <file> --ref=<project ref> --approved-by="<who approved, and where>"\n`);
  return L.join("\n");
}

// ---- the apply request ------------------------------------------------------------
export function parseArgs(argv) {
  const a = { apply: false, only: [], ref: null, approvedBy: null, audit: DEFAULT_AUDIT, recordManual: null, reviewed: null, unknown: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    const val = (name) => (x.startsWith(`${name}=`) ? x.slice(name.length + 1) : argv[++i]);
    if (x === "--apply") a.apply = true;
    else if (x === "--only" || x.startsWith("--only=")) a.only.push(...String(val("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    else if (x === "--ref" || x.startsWith("--ref=")) a.ref = val("--ref") ?? "";
    else if (x === "--approved-by" || x.startsWith("--approved-by=")) a.approvedBy = val("--approved-by") ?? "";
    else if (x === "--audit" || x.startsWith("--audit=")) a.audit = val("--audit");
    else if (x === "--record-manual" || x.startsWith("--record-manual=")) a.recordManual = val("--record-manual");
    else if (x === "--reviewed" || x.startsWith("--reviewed=")) a.reviewed = val("--reviewed");
    else a.unknown.push(x);
  }
  return a;
}

/**
 * Every check an apply (or a log-only record) must pass BEFORE the DSN is read
 * or anything connects. Returns the plan item; throws Refusal otherwise.
 *   kind: "apply" | "record-manual" | "reviewed"
 */
export function checkRequest(args, plan, log, { kind = "apply", read } = {}) {
  if (args.unknown.length) refuse(`unknown argument(s): ${args.unknown.join(" ")}`);
  const modes = [args.apply, !!args.recordManual, !!args.reviewed].filter(Boolean).length;
  if (modes > 1) refuse("choose one of --apply, --record-manual, --reviewed");
  if (kind === "apply" && !args.apply) refuse("applying needs --apply (without it this prints the plan)");
  const approved = String(args.approvedBy ?? "").trim();
  if (approved.length < 8) refuse('applying needs --approved-by="<who approved it, and where>" (at least 8 characters); it is written to the log');
  if (args.ref == null || args.ref === "") refuse("applying needs --ref=<the production project ref>, typed out");
  if (STAGING_REFS.includes(args.ref)) refuse("--ref names the STAGING project. Staging migrations go through scripts/apply-migrations.mjs; this runner is production only");
  if (!PRODUCTION_REFS.includes(args.ref)) refuse(`--ref '${args.ref}' is not the production project ref (exact match required)`);

  const pending = unresolved(log);
  if (kind !== "reviewed" && pending.length) refuse(`the apply log has an unresolved run: ${pending.map((e) => `${e.file} (${e.status})`).join(", ")}. Inspect production, then record it with --reviewed <file>`);

  if (kind === "reviewed") {
    const target = args.reviewed;
    if (!pending.some((e) => e.file === target)) refuse(`--reviewed ${target}: the log has no unresolved run of that file`);
    return { file: target };
  }

  const files = kind === "record-manual" ? [args.recordManual] : args.only;
  if (files.length === 0) refuse("applying needs --only <file>: one migration per invocation");
  if (files.length > 1) refuse(`one migration per invocation; got ${files.length} (${files.join(", ")})`);
  const file = path.basename(files[0]);
  const item = plan.items.find((x) => x.file === file);
  if (!item) refuse(`${file} is not in the plan (already applied, deferred, not for production, or not a migration)`);
  if (item.step !== 1) refuse(`${file} is step ${item.step}; step 1 is ${plan.items[0].file}. Steps run in order`);
  if (!item.rollback) refuse(`${file} has no rollback file in supabase/rollbacks/`);
  if (!item.marker) refuse(`${file} has no checkpoint marker; add one before it can be applied`);
  if (item.mode !== "concurrently" && item.captureError) refuse(`${file}: cannot tell exactly which functions it replaces, so production's current definitions cannot be captured first (${item.captureError})`);
  if (item.needsSuperuser) refuse(`${file} needs a superuser role (${item.needsSuperuser}); this runner connects as postgres only`);

  if (kind === "record-manual") {
    if (item.mode !== "concurrently") refuse(`--record-manual is only for CONCURRENTLY files; ${file} is applied with --apply`);
    return item;
  }
  if (item.mode === "concurrently" && (item.concurrentError || !item.concurrent)) refuse(`${file} runs without a transaction, and only CREATE/DROP INDEX CONCURRENTLY and ANALYZE may do that: ${item.concurrentError || "not parsed"}`);

  const sql = (read || ((f) => fs.readFileSync(path.join("supabase/migrations", f), "utf8")))(file);
  if (sha256(sql) !== item.sha256) refuse(`${file} changed after the plan was built`);
  if (DISABLES_TRIGGERS.test(stripSqlComments(sql))) refuse(`${file} disables triggers (DISABLE TRIGGER / session_replication_role); refused, never run that way`);
  const egress = scanMigrationSql(sql);
  if (egress.length) refuse(`${file} contains database egress (${[...new Set(egress.map((h) => h.kind))].join(", ")}); not by this runner`);
  if (item.mode !== "concurrently") { try { runnerBody(sql); } catch (e) { refuse(`${file}: ${e.message}`); } }
  return item;
}

/**
 * The DSN file. Must be named by $PRODUCTION_DSN_FILE, live outside the repo,
 * be readable by its owner only, name the production project and nothing else,
 * and connect as `postgres` -- the owner of public's objects and the least
 * privileged role these migrations can run as (they create security-definer
 * functions and storage policies). supabase_admin, service_role and any
 * superuser are refused. Returns { dsn, user, host }; the DSN is never printed.
 */
export function readDsn(env, ref, { repoRoot = process.cwd() } = {}) {
  const file = String(env[DSN_ENV] || "").trim();
  if (!file) refuse(`set ${DSN_ENV} to the path of a file holding the production DSN (the DSN itself is never passed on the command line or in the environment)`);
  const abs = path.resolve(file);
  const rel = path.relative(path.resolve(repoRoot), abs);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) refuse(`${DSN_ENV} points inside the repository; keep the DSN file outside it so it can never be committed`);
  let st;
  try { st = fs.statSync(abs); } catch (e) { refuse(`${DSN_ENV}: cannot read that file (${e.code || "error"})`); }
  if (!st.isFile()) refuse(`${DSN_ENV} is not a regular file`);
  if (st.mode & 0o077) refuse(`${DSN_ENV}: the file is readable by others (mode ${(st.mode & 0o777).toString(8)}); chmod 600 it`);
  const dsn = fs.readFileSync(abs, "utf8").trim();
  let u;
  try { u = new URL(dsn); } catch { refuse(`${DSN_ENV}: the file does not hold a postgres:// connection string`); }
  if (!/^postgres(ql)?:$/.test(u.protocol)) refuse(`${DSN_ENV}: the file does not hold a postgres:// connection string`);
  if (STAGING_REFS.some((r) => dsn.includes(r))) refuse(`${DSN_ENV}: the DSN names the STAGING project`);
  const user = decodeURIComponent(u.username), host = u.hostname.toLowerCase();
  const direct = host === `db.${ref}.supabase.co`;
  const pooler = /\.pooler\.supabase\.com$/.test(host);
  if (!direct && !pooler) refuse(`${DSN_ENV}: the host is not the production project's database (db.<ref>.supabase.co or its session pooler)`);
  const role = pooler ? (user.endsWith(`.${ref}`) ? user.slice(0, -(ref.length + 1)) : null) : user;
  if (pooler && role === null) refuse(`${DSN_ENV}: the pooler user does not name project ${ref}`);
  if (pooler && u.port === "6543") refuse(`${DSN_ENV}: that is the TRANSACTION pooler (6543); use the session pooler (5432) or the direct host`);
  if (role !== "postgres") refuse(`${DSN_ENV}: connects as '${role}'. Use 'postgres', the least-privileged role these migrations need (not supabase_admin, service_role or a superuser)`);
  return { dsn, user, host, password: decodeURIComponent(u.password || "") };
}

/** The typed confirmation. `ask` returns what the operator typed. */
export async function confirmRef(ref, file, ask, { isTTY }) {
  if (!isTTY) refuse("the typed confirmation needs an interactive terminal (stdin is not a TTY); it cannot be piped or scripted");
  const typed = String(await ask(`\n  About to apply ${file} to PRODUCTION.\n  Type the project ref to continue: `) ?? "").trim();
  if (typed !== ref) refuse("the typed ref did not match; nothing was applied");
}

// ---- snapshots ------------------------------------------------------------------
// What a step can change, digested (names, md5s, counts -- no row data), read in
// a READ ONLY transaction before and after. The diff is what a person compares
// with the step's intended change.
const SNAP = {
  functions: `select p.oid::regprocedure::text k, md5(pg_get_functiondef(p.oid)) def, p.prosecdef secdef, coalesce(array_to_string(p.proacl, ','), '') acl, pg_get_userbyid(p.proowner) owner
                from pg_proc p where p.pronamespace in ('public'::regnamespace, 'storage'::regnamespace) and p.prokind = 'f' order by 1`,
  policies: `select schemaname || '.' || tablename || '.' || policyname k, cmd, permissive, roles::text roles, md5(coalesce(qual, '')) qual, md5(coalesce(with_check, '')) chk
               from pg_policies where schemaname in ('public', 'storage') order by 1`,
  tables: `select n.nspname || '.' || c.relname k, c.relkind::text kind, c.relrowsecurity rls, c.relforcerowsecurity force_rls, coalesce(array_to_string(c.relacl, ','), '') acl,
                  md5(coalesce((select string_agg(a.attname || ':' || array_to_string(a.attacl, ','), ';' order by a.attname) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and a.attacl is not null), '')) column_acl,
                  md5(coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ';' order by a.attnum) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), '')) columns
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname in ('public', 'storage') and c.relkind in ('r', 'p', 'v', 'm') order by 1`,
  triggers: `select t.tgrelid::regclass::text || '.' || t.tgname k, t.tgenabled::text enabled, md5(pg_get_triggerdef(t.oid)) def
               from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
              where not t.tgisinternal and n.nspname in ('public', 'storage', 'auth') order by 1`,
  indexes: `select schemaname || '.' || indexname k, md5(indexdef) def from pg_indexes where schemaname in ('public', 'storage') order by 1`,
  counts: `select 'public.' || c.relname k, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint n
             from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
           union all select 'auth.users', (select count(*) from auth.users)
           union all select 'storage.objects', (select count(*) from storage.objects) order by 1`,
};

export async function snapshot(client) {
  await client.query("begin read only");
  try {
    await client.query("set local statement_timeout = '60s'");
    const out = { at: new Date().toISOString() };
    for (const [name, sql] of Object.entries(SNAP)) {
      out[name] = Object.fromEntries((await client.query(sql)).rows.map(({ k, ...v }) => [k, name === "counts" ? Number(v.n) : v]));
    }
    return out;
  } finally {
    await client.query("rollback");
  }
}

export function diffSnapshots(pre, post) {
  const d = {};
  for (const name of Object.keys(SNAP)) {
    const a = pre[name] || {}, b = post[name] || {};
    const added = Object.keys(b).filter((k) => !(k in a)).sort();
    const removed = Object.keys(a).filter((k) => !(k in b)).sort();
    const changed = Object.keys(b).filter((k) => k in a && JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort()
      .map((k) => (name === "counts" ? `${k}: ${a[k]} -> ${b[k]}` : `${k}: ${Object.keys(b[k]).filter((f) => JSON.stringify(a[k][f]) !== JSON.stringify(b[k][f])).join(", ")}`));
    if (added.length || removed.length || changed.length) d[name] = { added, removed, changed };
  }
  return d;
}

export function formatDiff(d) {
  const L = [];
  for (const [name, { added, removed, changed }] of Object.entries(d)) {
    L.push(`   ${name}:`);
    for (const k of added) L.push(`     + ${k}`);
    for (const k of removed) L.push(`     - ${k}`);
    for (const k of changed) L.push(`     ~ ${k}`);
  }
  return L.length ? L.join("\n") : "   no change in functions, policies, tables, triggers, indexes or row counts";
}

// ---- applying one file ------------------------------------------------------------
/**
 * Apply ONE plan item over an open client. The caller has already passed
 * checkRequest, readDsn and confirmRef. Order: role check -> marker must be
 * false -> CAPTURE (read-only; every function the file touches) -> the capture
 * file is written, or nothing runs -> pre-snapshot -> one transaction (the
 * captured functions must be unchanged, body, egress check, marker must be
 * true) -> commit -> post-snapshot and diff. Any error rolls back and throws;
 * nothing after it runs. Triggers are never disabled.
 *   writeCapture(captured) -> the path it wrote; required when the file touches
 *   any function. It must not print bodies (they never reach `say`).
 */
export async function applyOne(client, item, sql, { say = () => {}, writeCapture = null } = {}) {
  const who = (await client.query(`select current_user::text u, (select rolsuper from pg_roles where rolname = current_user) su, current_setting('server_version') v`)).rows[0];
  if (who.u !== "postgres") throw new Refusal(`connected as '${who.u}', not postgres`);
  if (who.su) throw new Refusal("the connected role is a superuser; use the project's postgres role (least privilege)");

  const isApplied = async () => (await client.query(markerSelect(item.marker))).rows[0].applied === true;
  if (await isApplied()) throw new Refusal(`${item.file}: its marker already reads applied on production. The audit record or log is out of date; nothing was run`);

  if (item.captureError || !Array.isArray(item.captures)) throw new Refusal(`${item.file}: no exact list of the functions it touches (${item.captureError || "not parsed"}); nothing was run`);
  let captured = [], capturePath = null;
  if (item.captures.length) {
    if (typeof writeCapture !== "function") throw new Refusal(`${item.file} touches ${item.captures.length} function(s) and no capture writer was given; nothing was run`);
    say(`   capture: reading ${item.captures.length} function(s) from production ...`);
    try {
      captured = await captureFunctions(client, item.captures);
      capturePath = await writeCapture(captured);
      if (!capturePath) throw new Error("the capture writer returned no path");
    } catch (e) {
      throw new Refusal(`${item.file}: the capture of production's current functions failed, so nothing was applied (${e.message})`);
    }
    say(`   capture: ${captured.filter((c) => c.existed).length} existing, ${captured.filter((c) => !c.existed).length} new -> ${capturePath}`);
  }

  say("   pre-snapshot ...");
  const pre = await snapshot(client);
  const egressBefore = await inspectDatabase(client);

  await client.query("begin");
  try {
    await client.query("set local statement_timeout = '120s'");
    await client.query("set local lock_timeout = '5s'");
    if (captured.length) await verifyCaptureUnchanged(client, captured);
    await client.query(runnerBody(sql));
    if (!(await isApplied())) throw new Error(`${item.file} ran, but its checkpoint marker still reads not applied; rolled back`);
    const added = newEgress(egressBefore, await inspectDatabase(client, { inTransaction: true }));
    if (added.length) throw new Error(`${item.file} added database egress, rolled back: ${added.join("; ")}`);
    await client.query("commit");
  } catch (e) {
    try { await client.query("rollback"); } catch { /* already aborted */ }
    e.pre = pre;
    e.capturePath = capturePath;
    throw e;
  }
  say("   post-snapshot ...");
  const post = await snapshot(client);
  const checkpoint = await isApplied();
  return { pre, post, diff: diffSnapshots(pre, post), checkpoint, serverVersion: who.v, capturePath, captured: captured.length };
}

/**
 * Apply ONE CONCURRENTLY plan item: no transaction, statement by statement
 * (_concurrent-indexes.mjs). Same order and checks as applyOne otherwise:
 * role check -> marker must be false -> pre-snapshot -> the statements, each
 * with its own timeouts and an index-validity check -> marker (which includes
 * "every index valid") must be true -> post-snapshot and diff. There is
 * nothing to roll back automatically: a stop names the index to drop.
 */
export async function applyConcurrent(client, item, sql, { say = () => {} } = {}) {
  if (item.mode !== "concurrently" || !item.concurrent) throw new Refusal(`${item.file} is not a parsed no-transaction file`);
  const who = (await client.query(`select current_user::text u, (select rolsuper from pg_roles where rolname = current_user) su, current_setting('server_version') v`)).rows[0];
  if (who.u !== "postgres") throw new Refusal(`connected as '${who.u}', not postgres`);
  if (who.su) throw new Refusal("the connected role is a superuser; use the project's postgres role (least privilege)");
  const isApplied = async () => (await client.query(markerSelect(item.marker))).rows[0].applied === true;
  if (await isApplied()) throw new Refusal(`${item.file}: its marker already reads applied on production. The audit record or log is out of date; nothing was run`);
  if (sha256(sql) !== item.sha256) throw new Refusal(`${item.file} changed after the plan was built`);

  say("   pre-snapshot ...");
  const pre = await snapshot(client);
  try {
    await runConcurrentSteps(client, item.concurrent, { say });
    if (!(await isApplied())) throw new Error(`${item.file} ran, but its checkpoint (every index present and valid) still reads not applied`);
  } catch (e) {
    e.pre = pre;
    throw e;
  }
  say("   post-snapshot ...");
  const post = await snapshot(client);
  return { pre, post, diff: diffSnapshots(pre, post), checkpoint: await isApplied(), serverVersion: who.v, capturePath: null, captured: 0 };
}

export function appendLog(logFile, entry) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}
