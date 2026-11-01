// The production runner's NO-TRANSACTION path (0065c, 0073a), proven OFFLINE.
//   node scripts/apply-concurrent-test.mjs     (part of npm run check:s1-prod-runner)
//
// No network, no credentials: production is a fake pg client holding index state.
//   PARSER    only CREATE/DROP INDEX CONCURRENTLY and ANALYZE; anything mixed in refuses
//   PLAN      "runner, no transaction"; checkpoint includes "every index valid";
//             the rollback must be DROP INDEX CONCURRENTLY of every index built
//   ORDER     never BEGIN; per statement: timeouts, the statement, a validity check
//   STOPS     an INVALID index stops the run and prints the exact recovery
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Refusal, loadRecord, parseQ01Markers, buildPlan, formatPlan, parseArgs, checkRequest, applyConcurrent, markerSelect, PRODUCTION_REFS } from "./_production-migrations.mjs";
import { ConcurrentRefused, InvalidIndex, parseConcurrentFile, STATE_SQL, TIMEOUTS, recoveryFor } from "./_concurrent-indexes.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const throwsLike = (fn, Type, re) => { try { fn(); return "no error"; } catch (e) { return e instanceof Type && re.test(e.message) ? true : `${e.name}: ${e.message}`; } };
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const is = (r, m) => ok(r === true, m, r === true ? "" : r);

const DIR = "supabase/migrations";
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"));
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const Q01 = parseQ01Markers(fs.readFileSync("supabase/audit/production_readiness_2026_10_31.sql", "utf8"));
const RECORD = loadRecord("supabase/audit/production_applied_2026_11_01.json");
const PROD = PRODUCTION_REFS[0];
const F65 = "0065c_analytics_indexes.sql", F73 = "0073a_impression_dedupe_index.sql";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "concurrent-test-"));

console.log("\n  PARSER: what a no-transaction file may hold");
{
  const s65 = parseConcurrentFile(read(F65)), s73 = parseConcurrentFile(read(F73));
  ok(s65.map((s) => `${s.kind}:${s.index}`).join() === "create:public.idx_post_likes_slug_key,create:public.idx_post_saves_slug_key,create:public.idx_ucr_slug_following",
     "0065c: three CREATE INDEX CONCURRENTLY, in file order");
  ok(s73.length === 1 && s73[0].unique && s73[0].index === "public.post_events_impression_once" && s73[0].table === "public.post_events", "0073a: one UNIQUE index on public.post_events");
  for (const f of [F65, F73]) {
    const rb = parseConcurrentFile(fs.readFileSync(`supabase/rollbacks/${f.replace(/\.sql$/, ".rollback.sql")}`, "utf8"));
    ok(rb.every((s) => s.kind === "drop" && s.ifExists), `${f}'s rollback is DROP INDEX CONCURRENTLY IF EXISTS only`);
  }
  ok(parseConcurrentFile("-- c\ncreate index concurrently i1 on only public.t (a);\nanalyze public.t;\ndrop index concurrently public.i0;\nanalyze;").map((s) => s.kind).join() === "create,analyze,drop,analyze",
     "accepted: CREATE without IF NOT EXISTS, ON ONLY, ANALYZE (with or without a table), DROP without IF EXISTS, comments");
  const R = (sql, re, m) => is(throwsLike(() => parseConcurrentFile(sql), ConcurrentRefused, re), m);
  R("create index concurrently if not exists i on public.t (a);\ncreate table public.x (id int);", /create table public\.x .* is not CREATE\/DROP INDEX CONCURRENTLY or ANALYZE/, "MIXED: a CREATE TABLE beside the index");
  R("update public.t set a = 1;\ncreate index concurrently i on public.t (a);", /update public\.t/, "MIXED: an UPDATE");
  R("create index concurrently i on public.t (a);\ncreate index j on public.t (b);", /create index j/, "MIXED: an ordinary (locking) CREATE INDEX");
  R("create index concurrently i on public.t (a);\nbegin;", /'begin'/, "MIXED: a BEGIN");
  R("reindex index concurrently public.i;", /reindex/, "REINDEX CONCURRENTLY is not accepted");
  R("drop index concurrently if exists public.i cascade;", /cascade/, "DROP ... CASCADE");
  R("drop index concurrently public.i, public.j;", /public\.i, public\.j/, "DROP of two indexes at once");
  R("create index concurrently on public.t (a);", /is not CREATE\/DROP/, "an unnamed index (its validity could not be checked)");
  R("create index concurrently i on t (a);", /is not CREATE\/DROP/, "an unqualified table");
  R(`create index concurrently "I" on public.t (a);`, /quoted identifiers/, "a quoted name");
  R("create index concurrently i on public.t (a);\ncreate index concurrently i on public.t (b);", /appears twice/, "one index name twice");
  R("analyze public.t;", /holds no CREATE or DROP/, "a file with no index statement");
  R("create index concurrently i on public.t (a) where b = 'x;", /cannot split/, "an unterminated string");
}

console.log("\n  PLAN");
const LOG8 = (exp) => exp.slice(0, exp.indexOf(F65)).map((file) => ({ ref: PROD, file, status: "applied" }));
const BASE = buildPlan({ files: FILES, record: RECORD, q01Markers: Q01 });
const log = LOG8(BASE.items.map((i) => i.file));
const P9 = buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, log });
const ITEM = P9.items[0];
{
  const text = formatPlan(BASE, RECORD);
  ok((text.match(/\[CONCURRENTLY: runner, no transaction\]/g) || []).length === 2 && !/by hand/.test(text), "the plan shows 0065c and 0073a as 'runner, no transaction', and nothing 'by hand'");
  ok(/0065c_analytics_indexes\.sql[\s\S]*?no-transaction run: 3 statement\(s\) one at a time[^\n]*lock_timeout 3s; each index must read valid/.test(text)
     && /0073a_impression_dedupe_index\.sql[\s\S]*?rollback runs the same way: DROP INDEX CONCURRENTLY, outside a transaction/.test(text), "...with the statements, the lock timeout and how the rollback runs");
  ok(ITEM.file === F65 && /indisvalid and i\.indisready\) = 3/.test(ITEM.checkpoint) && /pg_indexes where indexname in/.test(ITEM.checkpoint) && /every index valid/.test(ITEM.marker.from),
     "the checkpoint is the audit's marker AND every index present, valid and ready");
  const A = (s) => parseArgs(s.split(" "));
  const MIXED = read(F65) + "\nalter table public.post_likes add column x int;\n";
  const rd = (f) => (f === F65 ? MIXED : read(f));
  const PM = buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, log, read: rd });
  ok(/no-transaction run: REFUSED -- this step cannot be applied/.test(formatPlan(PM, RECORD)), "a mixed file is printed as REFUSED in the plan");
  is(throwsLike(() => checkRequest(A(`--apply --only ${F65} --ref=${PROD} --approved-by=user-in-chat`), PM, log, { read: rd }), Refusal, /only CREATE\/DROP INDEX CONCURRENTLY and ANALYZE may do that: 'alter table public\.post_likes/),
     "checkRequest refuses a mixed file before the DSN is read");
  // Rollbacks that are not no-transaction drops of every index.
  const rbDir = path.join(tmp, "rollbacks"); fs.mkdirSync(rbDir);
  for (const f of fs.readdirSync("supabase/rollbacks")) fs.copyFileSync(path.join("supabase/rollbacks", f), path.join(rbDir, f));
  const rb65 = path.join(rbDir, F65.replace(/\.sql$/, ".rollback.sql"));
  fs.writeFileSync(rb65, "drop index concurrently if exists public.idx_post_likes_slug_key;\ndrop index concurrently if exists public.idx_post_saves_slug_key;\n");
  let it = buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, log, rollbacksDir: rbDir }).items[0];
  ok(/does not drop public\.idx_ucr_slug_following/.test(it.concurrentError || ""), "a rollback that misses an index: refused", it.concurrentError);
  fs.writeFileSync(rb65, "begin;\ndrop index public.idx_post_likes_slug_key;\ncommit;\n");
  it = buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, log, rollbacksDir: rbDir }).items[0];
  ok(/'begin' is not CREATE\/DROP INDEX CONCURRENTLY/.test(it.concurrentError || ""), "a rollback in a transaction (or without CONCURRENTLY): refused", it.concurrentError);
}

console.log("\n  APPLY: no transaction, statement by statement (fake client)");
const SQL65 = read(F65);
const NAMES = ITEM.concurrent.map((s) => s.index);
function fakeClient({ invalidAfter = null, throwOn = null, leaveBehind = true, preInvalid = null, appliedBefore = false, markerLies = false } = {}) {
  const st = { idx: {}, queries: [] };
  if (preInvalid) st.idx[preInvalid] = { valid: false };
  if (appliedBefore) for (const n of NAMES) st.idx[n] = { valid: true };
  return {
    st,
    async query(sql, params = []) {
      st.queries.push(sql);
      if (/current_user::text u/.test(sql)) return { rows: [{ u: "postgres", su: false, v: "15.8" }] };
      if (sql === markerSelect(ITEM.marker)) return { rows: [{ applied: !markerLies && NAMES.every((n) => st.idx[n]?.valid) }] };
      if (sql === STATE_SQL) { const x = st.idx[params[0]]; return { rows: [{ present: !!x, valid: !!x?.valid }] }; }
      const step = ITEM.concurrent.find((s) => s.sql === sql);
      if (step) {
        if (throwOn === step.index) { if (leaveBehind) st.idx[step.index] = { valid: false }; throw Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" }); }
        st.idx[step.index] = { valid: invalidAfter !== step.index };
        return { rows: [] };
      }
      if (/select extname from pg_extension/.test(sql)) return { rows: [{ extname: "plpgsql" }] };
      return { rows: [] };
    },
  };
}
const said = [];
{
  const c = fakeClient();
  const r = await applyConcurrent(c, ITEM, SQL65, { say: (m) => said.push(m) });
  const q = c.st.queries;
  ok(!q.includes("begin") && !q.includes("commit") && !q.some((x) => /^\s*(begin|start transaction)\b/i.test(x) && x !== "begin read only"), "no BEGIN or COMMIT is ever sent (snapshots are their own read-only transactions)");
  const iStmts = ITEM.concurrent.map((s) => q.indexOf(s.sql));
  ok(iStmts.every((v, i) => v > 0 && (i === 0 || v > iStmts[i - 1])), "the statements run one at a time, in file order");
  ok(ITEM.concurrent.every((s, i) => q[iStmts[i] - 2] === `set statement_timeout = '${TIMEOUTS.create}'` && q[iStmts[i] - 1] === `set lock_timeout = '${TIMEOUTS.lock}'` && q[iStmts[i] + 1] === STATE_SQL),
     `each statement: SET statement_timeout '${TIMEOUTS.create}' and lock_timeout '${TIMEOUTS.lock}' just before it, then pg_index validity just after`);
  ok(parseInt(TIMEOUTS.lock, 10) <= 5 && /^\d+s$/.test(TIMEOUTS.lock), "the lock timeout is a few seconds, so a wait fails rather than queues in front of the investor app");
  const iMarker = q.indexOf(markerSelect(ITEM.marker)), iPre = q.indexOf("begin read only"), iLast = q.indexOf(markerSelect(ITEM.marker), iMarker + 1), iPost = q.lastIndexOf("begin read only");
  ok(iMarker < iPre && iPre < iStmts[0] && iStmts.at(-1) < q.indexOf("reset lock_timeout") && q.indexOf("reset lock_timeout") < iLast && iLast < iPost,
     "marker (not applied) -> pre-snapshot -> statements -> timeouts reset -> marker (every index valid) -> post-snapshot");
  ok(r.checkpoint === true && r.diff && r.pre && r.post, "the result carries the checkpoint, snapshots and diff");
}

console.log("\n  STOPS: an INVALID index ends the run with its recovery");
{
  let c = fakeClient({ invalidAfter: "public.idx_post_saves_slug_key" });
  let e = await rejects(() => applyConcurrent(c, ITEM, SQL65));
  ok(e instanceof InvalidIndex && e.recovery === "DROP INDEX CONCURRENTLY IF EXISTS public.idx_post_saves_slug_key;" && /then retry this file/.test(e.message) && e.pre,
     "a build that leaves the index INVALID stops with: DROP INDEX CONCURRENTLY IF EXISTS public.idx_post_saves_slug_key; then retry", e && e.message);
  ok(!c.st.queries.includes(ITEM.concurrent[2].sql) && c.st.queries.includes("reset lock_timeout"), "...the next statement never runs, and the session's timeouts are reset");
  c = fakeClient({ throwOn: "public.idx_post_likes_slug_key" });
  e = await rejects(() => applyConcurrent(c, ITEM, SQL65));
  ok(e instanceof InvalidIndex && /its build failed \(canceling statement due to lock timeout\)/.test(e.message) && e.recovery === recoveryFor("public.idx_post_likes_slug_key") && e.code === "55P03",
     "a lock timeout that leaves a half-built index: the same stop and recovery", e && e.message);
  c = fakeClient({ throwOn: "public.idx_post_likes_slug_key", leaveBehind: false });
  e = await rejects(() => applyConcurrent(c, ITEM, SQL65));
  ok(e && !(e instanceof InvalidIndex) && !e.recovery && /lock timeout/.test(e.message), "a failure that left nothing behind: stops, with nothing to drop");
  c = fakeClient({ preInvalid: "public.idx_ucr_slug_following" });
  e = await rejects(() => applyConcurrent(c, ITEM, SQL65));
  ok(e instanceof InvalidIndex && /an earlier run .*IF NOT EXISTS would skip it/.test(e.message) && !ITEM.concurrent.some((s) => c.st.queries.includes(s.sql)) && !c.st.queries.some((x) => /^set (statement|lock)_timeout =/.test(x)),
     "an INVALID index left by an earlier run refuses before any statement (IF NOT EXISTS would skip it and keep it invalid)", e && e.message);
  c = fakeClient({ appliedBefore: true });
  e = await rejects(() => applyConcurrent(c, ITEM, SQL65));
  ok(e instanceof Refusal && /already reads applied/.test(e.message) && !c.st.queries.includes("begin read only"), "the checkpoint already reads applied: refused before anything");
  c = fakeClient({ markerLies: true });
  e = await rejects(() => applyConcurrent(c, ITEM, SQL65));
  ok(e && /checkpoint \(every index present and valid\) still reads not applied/.test(e.message), "every statement ran but the checkpoint is not satisfied: an error, not a success");
  e = await rejects(() => applyConcurrent(fakeClient(), ITEM, SQL65 + "\n-- edited"));
  ok(e instanceof Refusal && /changed after the plan was built/.test(e.message), "the file changed after planning: refused");
  e = await rejects(() => applyConcurrent(fakeClient(), BASE.items[0], read(BASE.items[0].file)));
  ok(e instanceof Refusal && /not a parsed no-transaction file/.test(e.message), "an ordinary file can never take this path");
}

console.log("\n  CLI");
{
  const cli = fs.readFileSync("scripts/apply-migrations-production.mjs", "utf8");
  ok(/item\.mode === "concurrently"\s*\?\s*await applyConcurrent\(/.test(cli), "--apply sends a CONCURRENTLY file down the no-transaction path (same flags, ref, typed confirmation, DSN checks before it)");
  ok(/RECOVER: \$\{e\.recovery\}/.test(cli), "a stop prints the RECOVER line");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  no-transaction (CONCURRENTLY) path (offline): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
