// ROLLBACK mode of the production migration runner:
//   node scripts/apply-migrations-production.mjs --rollback --only <file> \
//       --ref=<production ref> --approved-by="<who, where>" [--accept-data-loss="<the decision>"]
//
// Before this, the runbook had the operator run the rollback with psql and then
// edit the runner's log by hand so the plan offered the file again. Now the
// runner does it and logs `rolled_back`, which puts the file back in the plan.
//
// WHAT MAY BE ROLLED BACK: only the file this runner applied MOST RECENTLY
// (strict reverse order, from the log), and never
//   0000_baseline (never run), 0059 (drops on_auth_user_created: investor
//   sign-up breaks), 0067 (cascades Conference Mode removal); none of these is
//   one this runner applied anyway;
//   a file another applied file still needs (manifest PREREQUISITES), and
//   0071 while 0088 is applied (ROLLBACK_BLOCKED_WHILE; the SQL also refuses).
// A LOSSY rollback (it drops tables or columns, deletes or truncates rows, or
// the rollout plan's table marks it lossy) needs --accept-data-loss="<text>".
//
// HOW IT RUNS
//   transaction files: marker must read applied -> pre-snapshot -> ONE
//     transaction: the committed rollback (its own begin/commit stripped), then
//     the capture file this runner wrote for that apply, if any (production's
//     own function text) -> marker must read NOT applied -> commit -> post-snapshot.
//   CONCURRENTLY files (0065c, 0073a): the rollback's DROP INDEX CONCURRENTLY
//     statements one at a time, no transaction (_concurrent-indexes.mjs).
// Nothing here connects; the CLI hands in the client after every check passed.

import fs from "node:fs";
import path from "node:path";
import {
  Refusal, markerFor, markerSelect, snapshot, diffSnapshots, appliedStack, isConcurrently, IMMEDIATELY_AFTER,
} from "./_production-migrations.mjs";
import { PREREQUISITES } from "./_migration-manifest.mjs";
import { stripSqlComments, scanMigrationSql, runnerBody, sha256, inspectDatabase, newEgress } from "./_db-egress.mjs";
import { topLevelStatements, readCapture, CAPTURE_DIR } from "./_function-capture.mjs";
import { parseConcurrentFile, validitySql, runConcurrentSteps } from "./_concurrent-indexes.mjs";

const refuse = (m) => { throw new Refusal(m); };

export const NEVER_ROLL_BACK = {
  "0000_baseline.sql": "0000_baseline is never run against production and has no rollback",
  "0059_auth_user_trigger.sql": "0059's rollback drops on_auth_user_created; in production that breaks investor sign-up. Never run it there",
  "0067_conference_mode_feature.sql": "0067's rollback cascades Conference Mode removal; it is already applied and not part of this rollout",
};
/** Rollbacks that must wait for another file's rollback (mirrors the SQL guard). */
export const ROLLBACK_BLOCKED_WHILE = {
  "0071_publishing_reliability.sql": ["0088_content_fanout.sql"],
};

// ---- lossy ------------------------------------------------------------------------
// Rollbacks a reviewer read and found to lose no user data, although the scan
// flags them. Pinned to the rollback file's sha256: any edit to the file makes
// it lossy again until it is re-reviewed.
export const REVIEWED_NOT_LOSSY = {
  "0093_listing_reports_rate_limit.sql": {
    sha256: "2c510dcea214dc84abe9d55f3cb002c23a28b75ee272ede475dc733a46c9ed7d",
    why: "drops only 0093's own config tables (listing_report_limits, submission_throttle_salt), its five functions, and only its own rate-limit counters (forms listing_report_db_global/_network/_client); /api/submit's counters and every listing report are kept (S1 review of 28974b3 + 47cc68c, 2026-11-02)",
  },
};

const LOSSY = [
  ["drops a table", /\bdrop table\b/i],
  ["drops a column", /\balter table\b[^;]*?\bdrop (column )?(if exists )?(?!constraint\b|default\b|not null\b|expression\b|identity\b)[a-z_]/i],
  ["deletes rows", /\bdelete from\b/i],
  ["truncates", /\btruncate\b/i],
  ["drops a schema", /\bdrop schema\b/i],
  ["drops with CASCADE", /\bdrop\b[^;]*?\bcascade\b/i],
];
/** Why a rollback loses data: from its top-level statements (function bodies are
 *  not run by it) and from the rollout plan's table. [] means not lossy. */
export function lossyReasons(rollbackSql, file, planDoc = "") {
  const out = [];
  for (const raw of topLevelStatements(rollbackSql)) {
    const st = raw.replace(/\s+/g, " ").trim();
    if (/^create (or replace )?function\b/i.test(st) || /^(grant|revoke|comment)\b/i.test(st)) continue;   // bodies do not run; privileges are not data
    // A DO block's body runs, so it is scanned too (it is part of `st`).
    for (const [why, re] of LOSSY) if (re.test(st) && !out.includes(why)) out.push(why);
  }
  const row = planDoc.split("\n").find((l) => l.includes(`\`${file}\``));
  if (row && /\|\s*lossy[^|]*\|\s*$/i.test(row)) out.push(`the rollout plan marks it lossy (${row.split("|").at(-2).trim()})`);
  return out;
}

// ---- the capture file of the apply being undone --------------------------------------
/** The capture logged for the LAST apply of `file`, checked against its sha256
 *  and parsed. null when that apply captured nothing. Refuses when the log
 *  names a capture that is missing, changed or unparsable. */
export function captureForRollback(log, ref, file, { read = (p) => fs.readFileSync(p, "utf8"), exists = fs.existsSync } = {}) {
  let cap = null;
  for (const e of log.filter((x) => x.ref === ref && x.file === file)) {
    if (e.status === "started") cap = null;
    if (e.status === "captured") cap = e;
  }
  if (!cap) return null;
  if (!exists(cap.capture)) refuse(`the apply of ${file} wrote a capture (${cap.capture}) and it is gone. Restore it, or decide with S4 how to roll back without production's own function text`);
  const text = read(cap.capture);
  if (sha256(text) !== cap.capture_sha256) refuse(`${cap.capture} changed after it was written (sha256 differs from the log); refused`);
  let parsed;
  try { parsed = readCapture(text); } catch (e) { refuse(`${cap.capture}: ${e.message}`); }
  if (parsed.manifest.file !== file || parsed.manifest.ref !== ref) refuse(`${cap.capture} is for ${parsed.manifest.file} on ${parsed.manifest.ref}, not ${file} on ${ref}`);
  return { path: cap.capture, sql: text, sha256: cap.capture_sha256, functions: parsed.manifest.functions.filter((f) => f.existed).length };
}

// ---- the request ------------------------------------------------------------------
/**
 * Every check a rollback must pass BEFORE the DSN is read. Returns the rollback
 * item: { file, rollback, rollbackSql, rollbackSha256, mode, marker, steps?,
 * lossy, capture }. Refuses otherwise.
 */
export function checkRollback(args, { log, ref, q01Markers, dir = "supabase/migrations", rollbacksDir = "supabase/rollbacks",
  planDoc = fs.existsSync("docs/PRODUCTION-ROLLOUT-PLAN.md") ? fs.readFileSync("docs/PRODUCTION-ROLLOUT-PLAN.md", "utf8") : "",
  read = (p) => fs.readFileSync(p, "utf8"), exists = fs.existsSync, prerequisites = PREREQUISITES } = {}) {
  if (args.only.length !== 1) refuse(`a rollback needs exactly one --only <file>; got ${args.only.length}`);
  const file = path.basename(args.only[0]);
  if (NEVER_ROLL_BACK[file]) refuse(`${file}: ${NEVER_ROLL_BACK[file]}`);

  const stack = appliedStack(log, ref);
  if (!stack.includes(file)) refuse(`${file} is not applied by this runner (per its log), so this runner does not roll it back`);
  const top = stack.at(-1);
  if (file !== top) refuse(`rollbacks go in strict reverse order: ${top} was applied after ${file} and must be rolled back first`);
  for (const blocker of ROLLBACK_BLOCKED_WHILE[file] || []) if (stack.includes(blocker)) refuse(`${file}'s rollback is refused while ${blocker} is applied; roll back ${blocker} first`);
  const needing = stack.filter((f) => (prerequisites[f] || []).includes(file) || IMMEDIATELY_AFTER[f] === file);
  if (needing.length) refuse(`${needing.join(", ")} still needs ${file}; roll ${needing.length > 1 ? "them" : "it"} back first`);

  const rb = path.join(rollbacksDir, file.replace(/\.sql$/, ".rollback.sql"));
  if (!exists(rb)) refuse(`${file} has no rollback file (${rb})`);
  const rollbackSql = read(rb);
  if (/\bdisable\s+trigger\b|\bsession_replication_role\b/i.test(stripSqlComments(rollbackSql))) refuse(`${rb} disables triggers; refused`);
  const egress = scanMigrationSql(rollbackSql);
  if (egress.length) refuse(`${rb} contains database egress (${[...new Set(egress.map((h) => h.kind))].join(", ")})`);

  let marker = markerFor(file, q01Markers);
  if (!marker) refuse(`${file} has no marker, so "rolled back" could not be checked`);
  const migrationSql = read(path.join(dir, file));
  const mode = isConcurrently(migrationSql) ? "concurrently" : "transaction";
  let steps = null;
  if (mode === "concurrently") {
    try { steps = parseConcurrentFile(rollbackSql); } catch (e) { refuse(`${rb}: ${e.message}`); }
    if (steps.some((s) => s.kind === "create")) refuse(`${rb} builds an index; a rollback only drops`);
    marker = { ...marker, sql: `(${marker.sql}) and ${validitySql(parseConcurrentFile(migrationSql))}` };
  } else {
    if (isConcurrently(rollbackSql)) refuse(`${rb} uses CONCURRENTLY but ${file} is a transaction file`);
    try { runnerBody(rollbackSql); } catch (e) { refuse(`${rb}: ${e.message}`); }
  }

  const reviewed = REVIEWED_NOT_LOSSY[file];
  const lossy = reviewed && reviewed.sha256 === sha256(rollbackSql) ? [] : lossyReasons(rollbackSql, file, planDoc);
  const accepted = String(args.acceptDataLoss ?? "").trim();
  if (lossy.length && accepted.length < 8) refuse(`${file}'s rollback loses data (${lossy.join("; ")}). Decide with S4 first, then pass --accept-data-loss="<the decision, and who made it>" (at least 8 characters); it is logged`);
  if (!lossy.length && args.acceptDataLoss != null) refuse(`--accept-data-loss was given but ${file}'s rollback is not lossy; drop the flag`);

  const capture = mode === "transaction" ? captureForRollback(log, ref, file, { read, exists }) : null;
  return { file, rollback: rb, rollbackSql, rollbackSha256: sha256(rollbackSql), mode, marker, steps, lossy, acceptDataLoss: accepted || null, capture };
}

// ---- running it --------------------------------------------------------------------
/** Undo ONE file over an open client (role check is the caller's applyOne-style
 *  preamble here too). Returns { pre, post, diff, checkpoint }. */
export async function applyRollback(client, rb, { say = () => {} } = {}) {
  const who = (await client.query(`select current_user::text u, (select rolsuper from pg_roles where rolname = current_user) su, current_setting('server_version') v`)).rows[0];
  if (who.u !== "postgres") throw new Refusal(`connected as '${who.u}', not postgres`);
  if (who.su) throw new Refusal("the connected role is a superuser; use the project's postgres role (least privilege)");
  const isApplied = async () => (await client.query(markerSelect(rb.marker))).rows[0].applied === true;
  if (!(await isApplied())) throw new Refusal(`${rb.file}: its marker already reads NOT applied on production; nothing to roll back (inspect, then record --reviewed if the log is wrong)`);

  say("   pre-snapshot ...");
  const pre = await snapshot(client);
  try {
    if (rb.mode === "concurrently") {
      await runConcurrentSteps(client, rb.steps, { say });
      if (await isApplied()) throw new Error(`${rb.file}'s rollback ran, but its marker still reads applied`);
    } else {
      const egressBefore = await inspectDatabase(client);
      await client.query("begin");
      try {
        await client.query("set local statement_timeout = '120s'");
        await client.query("set local lock_timeout = '5s'");
        say(`   ${rb.rollback} ...`);
        await client.query(runnerBody(rb.rollbackSql));
        if (rb.capture) { say(`   ${rb.capture.path} (production's own text for ${rb.capture.functions} function(s)) ...`); await client.query(runnerBody(rb.capture.sql)); }
        if (await isApplied()) throw new Error(`${rb.file}'s rollback ran, but its marker still reads applied; rolled back, nothing changed`);
        const added = newEgress(egressBefore, await inspectDatabase(client, { inTransaction: true }));
        if (added.length) throw new Error(`the rollback added database egress, rolled back: ${added.join("; ")}`);
        await client.query("commit");
      } catch (e) {
        try { await client.query("rollback"); } catch { /* already aborted */ }
        throw e;
      }
    }
  } catch (e) {
    e.pre = pre;
    throw e;
  }
  say("   post-snapshot ...");
  const post = await snapshot(client);
  return { pre, post, diff: diffSnapshots(pre, post), checkpoint: !(await isApplied()), serverVersion: who.v };
}

// ---- in the plan --------------------------------------------------------------------
/** The rollback section of the printed plan: what this runner applied, newest
 *  first, and whether each could be rolled back next. */
export function formatRollbackSection(log, ref, { planDoc = "", rollbacksDir = "supabase/rollbacks", read = (p) => fs.readFileSync(p, "utf8") } = {}) {
  const stack = appliedStack(log, ref);
  const L = ["  ROLLBACK (only the most recently applied file; strictly reverse order):"];
  if (!stack.length) L.push("    nothing applied by this runner yet");
  [...stack].reverse().forEach((f, i) => {
    let lossy = [];
    try {
      const sql = read(path.join(rollbacksDir, f.replace(/\.sql$/, ".rollback.sql")));
      lossy = REVIEWED_NOT_LOSSY[f]?.sha256 === sha256(sql) ? [] : lossyReasons(sql, f, planDoc);
    } catch { /* no rollback file: the request refuses */ }
    const blocked = (ROLLBACK_BLOCKED_WHILE[f] || []).filter((b) => stack.includes(b));
    L.push(`    ${i === 0 ? "next:" : "then:"} ${f}${blocked.length ? `   (refused while ${blocked.join(", ")} is applied)` : ""}${lossy.length ? `   LOSSY: ${lossy.join("; ")} -- needs --accept-data-loss` : ""}`);
  });
  for (const [f, blockers] of Object.entries(ROLLBACK_BLOCKED_WHILE)) L.push(`    rule: ${f} is never rolled back while ${blockers.join(", ")} is applied`);
  L.push(`    never: ${Object.keys(NEVER_ROLL_BACK).join(", ")}`);
  L.push(`  Roll back:  ... --rollback --only <file> --ref=<project ref> --approved-by="<who, where>" [--accept-data-loss="<decision>"]\n`);
  return L.join("\n");
}

export { CAPTURE_DIR };
