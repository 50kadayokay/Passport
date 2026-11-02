// The NO-TRANSACTION path of the production migration runner, for files that
// build or drop indexes CONCURRENTLY (0065c, 0073a). CREATE INDEX CONCURRENTLY
// cannot run inside a transaction, so these files used to be a "by hand" step.
//
// Only these statements are accepted, one at a time, in file order:
//   CREATE [UNIQUE] INDEX CONCURRENTLY [IF NOT EXISTS] <name> ON [ONLY] <schema>.<table> ...
//   DROP INDEX CONCURRENTLY [IF EXISTS] <schema>.<name>          (one index, no CASCADE)
//   ANALYZE [<schema>.<table>]
// Anything else in the file refuses the whole file (parseConcurrentFile).
//
// Each statement gets its own statement_timeout and a SHORT lock_timeout:
// CONCURRENTLY still waits for every transaction that touches the table, and
// waiting must end in a clean failure, never in a queue the investor app sits
// behind. After each CREATE, pg_index must read the index valid and ready; an
// INVALID index (a failed or timed-out build leaves one) stops the run and
// prints the exact recovery: DROP INDEX CONCURRENTLY IF EXISTS <name>, then retry.

import { topLevelStatements } from "./_function-capture.mjs";
import { inspectDatabase, newEgress } from "./_db-egress.mjs";

export class ConcurrentRefused extends Error {
  constructor(message) { super(message); this.name = "ConcurrentRefused"; }
}
const no = (m) => { throw new ConcurrentRefused(m); };

// Per statement. Building an index on a large table can take minutes; waiting
// for a lock may take seconds, no more.
export const TIMEOUTS = { create: "20min", drop: "2min", analyze: "5min", lock: "3s" };

const ID = "[a-z_][a-z0-9_]*";
const CREATE = new RegExp(`^create (unique )?index concurrently (if not exists )?(${ID}) on (only )?(${ID})\\.(${ID})\\s*(\\(|using )`, "i");
const DROP = new RegExp(`^drop index concurrently (if exists )?(${ID})\\.(${ID})$`, "i");
const ANALYZE = new RegExp(`^analyze( (${ID})\\.(${ID}))?$`, "i");

/**
 * The file as a list of steps:
 *   [{ kind: "create" | "drop" | "analyze", sql, index?: "schema.name", table?: "schema.table" }]
 * Refuses on anything else, on quoted identifiers, on an unnamed index, on a
 * name used twice, and on a file with no index statement at all.
 */
export function parseConcurrentFile(sql) {
  let statements;
  try { statements = topLevelStatements(sql); } catch (e) { no(`cannot split the file: ${e.message}`); }
  const steps = [], seen = new Set();
  for (const raw of statements) {
    const st = raw.replace(/\s+/g, " ").trim();
    if (/"/.test(st)) no(`'${st.slice(0, 60)}': quoted identifiers are not accepted in a no-transaction file`);
    let m;
    if ((m = CREATE.exec(st))) {
      const index = `${m[5]}.${m[3]}`.toLowerCase();
      if (seen.has(index)) no(`${index} appears twice`);
      seen.add(index);
      steps.push({ kind: "create", sql: raw, index, table: `${m[5]}.${m[6]}`.toLowerCase(), unique: !!m[1], ifNotExists: !!m[2] });
    } else if ((m = DROP.exec(st))) {
      const index = `${m[2]}.${m[3]}`.toLowerCase();
      if (seen.has(index)) no(`${index} appears twice`);
      seen.add(index);
      steps.push({ kind: "drop", sql: raw, index, ifExists: !!m[1] });
    } else if ((m = ANALYZE.exec(st))) {
      steps.push({ kind: "analyze", sql: raw, table: m[1] ? `${m[2]}.${m[3]}`.toLowerCase() : null });
    } else {
      no(`'${st.slice(0, 70)}${st.length > 70 ? "..." : ""}' is not CREATE/DROP INDEX CONCURRENTLY or ANALYZE; a no-transaction file may hold nothing else`);
    }
  }
  if (!steps.some((s) => s.kind !== "analyze")) no("the file holds no CREATE or DROP INDEX CONCURRENTLY");
  return steps;
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
/** Every created index exists, valid and ready; every dropped one is gone. */
export function validitySql(steps) {
  const created = steps.filter((s) => s.kind === "create"), dropped = steps.filter((s) => s.kind === "drop");
  const parts = [];
  if (created.length) parts.push(`(select count(*) from pg_index i where i.indexrelid in (${created.map((s) => `to_regclass(${lit(s.index)})`).join(", ")}) and i.indisvalid and i.indisready) = ${created.length}`);
  for (const s of dropped) parts.push(`to_regclass(${lit(s.index)}) is null`);
  return parts.join(" and ");
}
export const recoveryFor = (index) => `DROP INDEX CONCURRENTLY IF EXISTS ${index};`;

export const STATE_SQL = `/* concurrent:index-state */ select to_regclass($1) is not null present, coalesce((select i.indisvalid and i.indisready from pg_index i where i.indexrelid = to_regclass($1)), false) valid`;
const state = async (client, index) => (await client.query(STATE_SQL, [index])).rows[0] || { present: false, valid: false };

/** Thrown when the run stops on an index that is left INVALID (or missing). */
export class InvalidIndex extends Error {
  constructor(index, why) {
    super(`${index} is INVALID after ${why}. Recover: ${recoveryFor(index)} then retry this file`);
    this.name = "InvalidIndex"; this.index = index; this.recovery = recoveryFor(index);
  }
}

/**
 * Run the steps one by one, OUTSIDE any transaction (never BEGIN). The caller
 * (applyOne-like order in _production-migrations.mjs) has checked the role,
 * the marker and taken the pre-snapshot.
 *  - before anything: an index of this file that already exists INVALID
 *    refuses, with its recovery (IF NOT EXISTS would skip it and leave it so)
 *  - per statement: SET statement_timeout and a short lock_timeout, run it
 *  - after a CREATE: pg_index must read valid and ready, or stop (InvalidIndex)
 *  - after a DROP: the index must be gone
 *  - a failing statement: stop; if it left its index behind, say how to drop it
 * Returns the list of what ran.
 */
export async function runConcurrentSteps(client, steps, { say = () => {} } = {}) {
  for (const s of steps.filter((x) => x.kind === "create")) {
    const st = await state(client, s.index);
    if (st.present && !st.valid) throw new InvalidIndex(s.index, "an earlier run (it exists but is not valid; IF NOT EXISTS would skip it)");
  }
  const egressBefore = await inspectDatabase(client);
  const ran = [];
  try {
    for (const [i, s] of steps.entries()) {
      say(`   ${i + 1}/${steps.length} ${s.kind}${s.index ? ` ${s.index}` : s.table ? ` ${s.table}` : ""} ...`);
      await client.query(`set statement_timeout = '${TIMEOUTS[s.kind]}'`);
      await client.query(`set lock_timeout = '${TIMEOUTS.lock}'`);
      try {
        await client.query(s.sql);
      } catch (e) {
        if (s.kind === "create" && (await state(client, s.index)).present) {
          const err = new InvalidIndex(s.index, `its build failed (${e.message})`);
          err.code = e.code; err.ran = ran; throw err;
        }
        e.ran = ran; throw e;
      }
      if (s.kind === "create") {
        const st = await state(client, s.index);
        if (!st.valid) { const err = new InvalidIndex(s.index, st.present ? "its build" : "its build (the index is missing)"); err.ran = ran; throw err; }
      }
      if (s.kind === "drop" && (await state(client, s.index)).present) { const err = new Error(`${s.index} still exists after DROP INDEX CONCURRENTLY`); err.ran = ran; throw err; }
      ran.push(s.index || s.table || "analyze");
    }
  } finally {
    await client.query("reset statement_timeout").catch(() => {});
    await client.query("reset lock_timeout").catch(() => {});
  }
  const added = newEgress(egressBefore, await inspectDatabase(client));
  if (added.length) throw new Error(`database egress appeared during the run: ${added.join("; ")}`);
  return ran;
}
