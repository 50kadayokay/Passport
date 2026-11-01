// The production migration runner (g06), proven OFFLINE.
//   node scripts/apply-migrations-production-test.mjs     (npm run check:s1-prod-runner)
//
// No network: every CLI run here is under scripts/fixtures/no-network-preload.mjs,
// which makes any socket, DNS lookup or fetch throw. Nothing has a credential;
// the DSNs below are made up, in temporary files outside the repo.
//   PLAN      the real 2026-11-01 audit record -> the exact order (its length
//             derived from the manifest);
//             a fixture audit -> the plan that follows from it; the apply log
//             subtracts; unknown production state refuses
//   REFUSALS  missing flags, wrong / staging ref, several files, out of order,
//             a mixed CONCURRENTLY file, triggers disabled, egress, unresolved run, the DSN
//             file (inside the repo, world-readable, staging, wrong host, wrong
//             role, transaction pooler), no TTY, a mistyped ref
//   APPLY     applyOne over a fake client: the order of operations, the marker
//             before and after, rollback on any error, no trigger disabling
//   REDACTION the DSN and its password never reach output or the log
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  PRODUCTION_REFS, STAGING_REFS, CORRECTED_MARKERS, POST_AUDIT_MARKERS, Refusal, redact, loadRecord, parseQ01Markers,
  markerFor, markerSelect, buildPlan, parseArgs, checkRequest, readDsn, confirmRef, unresolved, applyOne, diffSnapshots,
} from "./_production-migrations.mjs";
import { runnerBody } from "./_db-egress.mjs";
import { PENDING } from "./_migration-manifest.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const refusal = (fn, re) => { try { fn(); return `no refusal`; } catch (e) { return e instanceof Refusal && re.test(e.message) ? true : `${e.name}: ${e.message}`; } };
const refusalAsync = async (fn, re) => { try { await fn(); return "no refusal"; } catch (e) { return e instanceof Refusal && re.test(e.message) ? true : `${e.name}: ${e.message}`; } };
const is = (r, m) => ok(r === true, m, r === true ? "" : r);

const PROD = PRODUCTION_REFS[0], STAGING = STAGING_REFS[0];
const DIR = "supabase/migrations";
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"));
const AUDIT_SQL = fs.readFileSync("supabase/audit/production_readiness_2026_10_31.sql", "utf8");
const Q01 = parseQ01Markers(AUDIT_SQL);
const RECORD = loadRecord("supabase/audit/production_applied_2026_11_01.json");
const FIXTURE = loadRecord("scripts/fixtures/production-audit-fixture.json");
const plan = (record = RECORD, extra = {}) => buildPlan({ files: FILES, record, q01Markers: Q01, ...extra });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prod-runner-test-"));
const PW = "Xq7-not-a-real-pw-93kd";
const dsnFile = (dsn, mode = 0o600, name = `dsn-${Math.random().toString(36).slice(2)}`) => {
  const f = path.join(tmp, name); fs.writeFileSync(f, dsn); fs.chmodSync(f, mode); return f;
};
const GOOD_DSN = `postgresql://postgres:${PW}@db.${PROD}.supabase.co:5432/postgres`;

console.log("\n  THE AUDIT RECORD AND ITS MARKERS");
ok(Object.keys(Q01).length === 28 && Object.keys(Q01).every((f) => FILES.includes(f)), "Q01's 28 markers parse from the audit SQL, each naming a real migration file");
ok(JSON.stringify(Object.keys(Q01).sort()) === JSON.stringify(Object.keys(RECORD.q01).sort()), "the record holds a result for exactly the migrations Q01 tested");
ok(markerFor("0061a_table_privilege_hardening.sql", Q01).sql === CORRECTED_MARKERS["0061a_table_privilege_hardening.sql"] && /company_follows/.test(markerSelect(markerFor("0061a_table_privilege_hardening.sql", Q01))),
   "0061a's checkpoint is the CORRECTED marker (company_follows/post_events), not Q01's faulty one");
ok(Object.keys(POST_AUDIT_MARKERS).every((f) => FILES.includes(f)), "every post-audit marker names a real migration file");
is(refusal(() => loadRecord(path.join(tmp, "missing.json")), /cannot read the audit record/), "a missing audit record refuses");
{
  const f = path.join(tmp, "staging-record.json");
  fs.writeFileSync(f, JSON.stringify({ ...RECORD, project_ref: STAGING }));
  is(refusal(() => loadRecord(f), /not for the production project/), "an audit record for the staging project refuses");
  fs.writeFileSync(f, JSON.stringify({ ...RECORD, q01: { ...RECORD.q01, "0058_close_public_insert.sql": "maybe" } }));
  is(refusal(() => loadRecord(f), /state 'maybe'/), "an audit record with an unknown state refuses");
}

console.log("\n  PLAN: the recorded 2026-11-01 audit");
const P = plan();
const EXPECTED = ["0058_close_public_insert", "0077_listing_reports_installed_app_compat", "0061a_table_privilege_hardening", "0062_message_attachments",
  "0063_company_initiated_threads", "0064_notification_clearing", "0065a_analytics_breakdown", "0065b_engagement_corrections", "0065c_analytics_indexes",
  "0066_mineiq_conversations", "0068_site_contract", "0069b_stripe_events", "0071_publishing_reliability", "0072_profile_drafts",
  "0073a_impression_dedupe_index", "0073b_impression_tracking", "0073c_post_events_client_guard", "0074_profile_revision_history",
  "0075_profile_versions_privileges", "0076_company_roles", "0078_storage_role_hardening", "0080_mineiq_search_any_term",
  "0085_conference_booth_config", "0086_service_requests", "0087_audience_events", "0088_content_fanout", "0090_notification_clear_roles", "0091_notification_clear_no_platform_admin"].map((f) => `${f}.sql`);
// What the manifest says production needs, given an audit record: its PENDING
// files, minus what is not for production and what that audit found applied.
const needs = (record) => Object.keys(PENDING).filter((f) => !record.not_for_production?.[f] && record.q01[f] !== "applied");
const N = needs(RECORD).length, N_AFTER = needs(RECORD).filter((f) => !(f in RECORD.q01)).length, N_FIXTURE = needs(FIXTURE).length;
ok(JSON.stringify([...EXPECTED].sort()) === JSON.stringify(needs(RECORD).sort()), `the expected order holds exactly the ${N} files the manifest says production needs`);
ok(JSON.stringify(P.items.map((i) => i.file)) === JSON.stringify(EXPECTED), `${N} steps in the rollout plan's order (0058, then 0077 immediately, then 0061a, ...)`, P.items.map((i) => i.file).join(" "));
ok(P.items.every((i) => i.rollback && fs.existsSync(i.rollback)), "every step names an existing rollback file");
ok(P.items.every((i) => i.marker && /^select coalesce\(\(/.test(i.checkpoint)), "every step has a read-only checkpoint");
ok(P.items.filter((i) => i.mode === "concurrently").map((i) => i.file).join() === "0065c_analytics_indexes.sql,0073a_impression_dedupe_index.sql", "0065c and 0073a are marked CONCURRENTLY (the runner's no-transaction path)");
ok(["0053", "0054", "0056", "0057", "0059", "0060", "0067"].every((n) => !P.items.some((i) => i.file.startsWith(n))), "what the audit found applied (0053/54/56/57/59/60/67) is not planned; 0059's rollback is never offered");
ok(["0011", "0027", "0028", "0029", "0055", "0061b"].every((n) => P.deferred.some((d) => d.file.startsWith(n))) && !P.items.some((i) => /^(0011|0027|0028|0029|0055|0061b)/.test(i.file)), "deferred files (0011, 0027, 0028, 0029, 0055, 0061b) are never planned");
ok(P.skipped.some((s) => s.file === "0000_baseline.sql") && !P.items.some((i) => i.file === "0000_baseline.sql"), "0000_baseline is not for production (its objects exist there)");
ok(P.items.find((i) => i.file === "0090_notification_clear_roles.sql").prerequisites.map((p) => `${p.file}:${p.status}`).join() === "0064_notification_clearing.sql:step 6,0076_company_roles.sql:step 20",
   "prerequisites are shown with where they are satisfied (0090: 0064 step 6, 0076 step 20)");
ok(P.items.find((i) => i.file === "0080_mineiq_search_any_term.sql").prerequisites[0].status === "applied", "...or that production already has them (0080 needs 0050a: applied)");
ok(P.items.filter((i) => i.source === "written after the audit").length === N_AFTER, `the ${N_AFTER} files written after the audit are planned and labelled so`);
ok(P.items.find((i) => i.file === "0091_notification_clear_no_platform_admin.sql").prerequisites.map((p) => `${p.file}:${p.status}`).join() === `0090_notification_clear_roles.sql:step ${EXPECTED.indexOf("0090_notification_clear_roles.sql") + 1}`,
   "0091 runs after 0090, its prerequisite");
{
  // The 0090 / 0091 markers against each version's body, with and without its
  // comments (pg_get_functiondef keeps them, so a marker must match code).
  const pattern = (f) => { const m = /~ '((?:[^']|'')*)' from pg_proc/.exec(POST_AUDIT_MARKERS[f]); return new RegExp(m[1].replace(/''/g, "'")); };
  const body = (f) => { const s = fs.readFileSync(path.join(DIR, f), "utf8"); const st = s.slice(s.search(/create or replace function public\.mark_notifications_cleared/i));
    const q = /\bas\s+(\$[a-z_]*\$)/i.exec(st); return st.slice(q.index + q[0].length, st.indexOf(q[1], q.index + q[0].length)); };
  const V = ["0064_notification_clearing.sql", "0090_notification_clear_roles.sql", "0091_notification_clear_no_platform_admin.sql"];
  const table = (f) => V.map((v) => [body(v), body(v).replace(/--[^\n]*/g, "")].map((b) => (pattern(f).test(b) ? 1 : 0)).join("")).join(" ");
  ok(table("0090_notification_clear_roles.sql") === "00 11 11", "0090's marker: false under 0064, true under 0090 AND 0091, comments or not (0090 is never re-applied over 0091)", table("0090_notification_clear_roles.sql"));
  ok(table("0091_notification_clear_no_platform_admin.sql") === "00 00 11", "0091's marker: true only under 0091, comments or not", table("0091_notification_clear_no_platform_admin.sql"));
}
ok(P.warnings.length === 0, "no warnings against the real record", P.warnings.join("; "));

console.log("\n  PLAN: a fixture audit (0058, 0061a, 0062 applied; 0077 not)");
const PF = plan(FIXTURE);
ok(PF.items.length === N_FIXTURE && PF.items[0].file === "0077_listing_reports_installed_app_compat.sql" && PF.items[1].file === "0063_company_initiated_threads.sql",
   `${N_FIXTURE} steps; 0077 goes FIRST because its partner 0058 is already applied`, PF.items.slice(0, 3).map((i) => i.file).join(" "));
ok(PF.warnings.some((w) => /0077.*FIRST/.test(w)) && PF.warnings.filter((w) => /manifest still lists it PENDING/.test(w)).length === 3, "it warns about that, and that the manifest still lists 0058/0061a/0062 as pending");
ok(PF.items.find((i) => i.file === "0077_listing_reports_installed_app_compat.sql").prerequisites[0].status === "applied", "0077's prerequisite (0058) reads applied");
{
  const log = [{ ref: PROD, file: "0077_listing_reports_installed_app_compat.sql", status: "applied" }, { ref: PROD, file: "0063_company_initiated_threads.sql", status: "applied" },
               { ref: STAGING, file: "0064_notification_clearing.sql", status: "applied" }];
  const PL = plan(FIXTURE, { log });
  ok(PL.items[0].file === "0064_notification_clearing.sql" && PL.items.length === N_FIXTURE - 2, "the apply log subtracts what this runner applied (and ignores entries for another ref)");
}
ok(JSON.stringify(plan(RECORD).items.map((i) => i.file)) === JSON.stringify(EXPECTED), "planning has no side effects (same plan twice)");

console.log("\n  PLAN: unknown production state refuses");
is(refusal(() => plan(RECORD, { manifest: { DEFERRED: {}, PENDING: {}, UNVERIFIED: { "0062_message_attachments.sql": "?" }, PREREQUISITES: {}, NEEDS_SUPERUSER: {} } }), /UNVERIFIED/), "anything UNVERIFIED in the manifest");
is(refusal(() => plan({ ...RECORD, q01: { ...RECORD.q01, "0999_ghost.sql": "pending" } }), /not in supabase\/migrations/), "the record names a file that does not exist");
is(refusal(() => plan({ ...RECORD, q01: { ...RECORD.q01, "0052_messaging_privilege_hardening.sql": "pending" } }), /manifest classifies it as applied/), "the audit says pending, the manifest says applied");
is(refusal(() => plan({ ...RECORD, q01: { ...RECORD.q01, "0055_enable_device_push.sql": "applied" } }), /DEFERRED in the manifest/), "the audit says a deferred file is applied");
is(refusal(() => buildPlan({ files: [...FILES, "0099_new_thing.sql"], record: RECORD, q01Markers: Q01, read: (f) => (f === "0099_new_thing.sql" ? "select 1;" : fs.readFileSync(path.join(DIR, f), "utf8")) }), /not in the manifest's PENDING/),
   "a file newer than the audit that the manifest does not list");
is(refusal(() => plan(RECORD, { log: [{ ref: PROD, file: "0999_ghost.sql", status: "applied" }] }), /apply log names 0999_ghost/), "the apply log names a file that does not exist");

console.log("\n  REFUSALS: the request (before the DSN is read)");
const A = (s) => parseArgs(s.split(" ").filter(Boolean));
const OK_ARGS = `--apply --only 0058_close_public_insert.sql --ref=${PROD} --approved-by=user-in-chat-2026-11-02`;
const check = (s, log = [], p = P, opts = {}) => () => checkRequest(typeof s === "string" ? A(s) : s, p, log, opts);
ok(checkRequest(A(OK_ARGS), P, []).file === "0058_close_public_insert.sql", "a complete request for step 1 passes the request checks");
is(refusal(check(`--only 0058_close_public_insert.sql --ref=${PROD} --approved-by=user-in-chat`), /needs --apply/), "no --apply");
is(refusal(check(`--apply --only 0058_close_public_insert.sql --ref=${PROD}`), /--approved-by/), "no --approved-by");
is(refusal(check(`--apply --only 0058_close_public_insert.sql --ref=${PROD} --approved-by=me`), /at least 8/), "an --approved-by too short to mean anything");
is(refusal(check(`--apply --only 0058_close_public_insert.sql --approved-by=user-in-chat`), /--ref/), "no --ref");
is(refusal(check(`--apply --only 0058_close_public_insert.sql --ref=${STAGING} --approved-by=user-in-chat`), /STAGING/), "the staging ref");
for (const bad of ["rvptronniomlqumjhyrx", "RVPTRONNIOMLQUMJHYRR", "rvptronniomlqumjhyrr.supabase.co", "rvptronniomlqumjhyr"]) {
  is(refusal(check(`--apply --only 0058_close_public_insert.sql --ref=${bad} --approved-by=user-in-chat`), /exact match/), `a ref that is not PRODUCTION_REFS exactly (${bad})`);
}
is(refusal(() => checkRequest({ ...A(OK_ARGS), ref: ` ${PROD}` }, P, []), /exact match/), "...or the right ref with a stray space");
is(refusal(check(`--apply --ref=${PROD} --approved-by=user-in-chat`), /--only <file>/), "no file");
is(refusal(check(`--apply --only 0058_close_public_insert.sql --only 0077_listing_reports_installed_app_compat.sql --ref=${PROD} --approved-by=user-in-chat`), /one migration per invocation; got 2/), "two --only files");
is(refusal(check(`--apply --only 0058_close_public_insert.sql,0077_listing_reports_installed_app_compat.sql --ref=${PROD} --approved-by=user-in-chat`), /got 2/), "a comma-separated list");
is(refusal(check(`--apply --only 0062_message_attachments.sql --ref=${PROD} --approved-by=user-in-chat`), /step 4; step 1 is 0058/), "a file that is not the next step");
is(refusal(check(`--apply --only 0057_submission_throttle.sql --ref=${PROD} --approved-by=user-in-chat`), /not in the plan/), "a file production already has");
is(refusal(check(`--apply --only 0055_enable_device_push.sql --ref=${PROD} --approved-by=user-in-chat`), /not in the plan/), "a deferred file");
is(refusal(check(`--apply --only 0000_baseline.sql --ref=${PROD} --approved-by=user-in-chat`), /not in the plan/), "0000_baseline");
is(refusal(check(`--apply --record-manual 0058_close_public_insert.sql --ref=${PROD} --approved-by=user-in-chat`), /choose one/), "--apply with --record-manual");
is(refusal(check(`${OK_ARGS} --force`), /unknown argument/), "an unknown flag (no --force exists)");
{
  // A plan in which 0065c is next: the first 8 steps logged as applied.
  const log = EXPECTED.slice(0, 8).map((file) => ({ ref: PROD, file, status: "applied" }));
  const P9 = plan(RECORD, { log });
  ok(P9.items[0].file === "0065c_analytics_indexes.sql", "(with steps 1-8 logged, 0065c is step 1)");
  const it = checkRequest(A(`--apply --only 0065c_analytics_indexes.sql --ref=${PROD} --approved-by=user-in-chat`), P9, log);
  ok(it.file === "0065c_analytics_indexes.sql" && it.mode === "concurrently" && it.concurrent.length === 3, "a CONCURRENTLY file that is next passes the request checks (it runs with no transaction)");
  ok(checkRequest(A(`--record-manual 0065c_analytics_indexes.sql --ref=${PROD} --approved-by=user-in-chat`), P9, log, { kind: "record-manual" }).file === "0065c_analytics_indexes.sql",
     "...and --record-manual stays for one run by hand anyway (no connection)");
  is(refusal(check(`--record-manual 0058_close_public_insert.sql --ref=${PROD} --approved-by=user-in-chat`, [], P, { kind: "record-manual" }), /only for CONCURRENTLY/), "--record-manual for an ordinary file");
}
{
  const log = [{ ref: PROD, file: "0058_close_public_insert.sql", status: "started" }];
  is(refusal(check(OK_ARGS, log), /unresolved run: 0058_close_public_insert.sql \(started\)/), "an earlier run that started and never finished");
  is(refusal(check(OK_ARGS, [{ ref: PROD, file: "0058_close_public_insert.sql", status: "failed" }]), /unresolved/), "an earlier run that failed");
  ok(checkRequest(A(`--reviewed 0058_close_public_insert.sql --ref=${PROD} --approved-by=user-in-chat`), P, log, { kind: "reviewed" }).file === "0058_close_public_insert.sql",
     "...until a person records it with --reviewed");
  ok(unresolved([...log, { file: "0058_close_public_insert.sql", status: "reviewed" }]).length === 0, "...after which nothing is unresolved");
  is(refusal(check(`--reviewed 0062_message_attachments.sql --ref=${PROD} --approved-by=user-in-chat`, log, P, { kind: "reviewed" }), /no unresolved run/), "--reviewed for a file with nothing unresolved");
}
{
  // The file's own contents. The plan is built from the same text, so the
  // sha256 check passes and the content check is what refuses.
  const real = fs.readFileSync(path.join(DIR, "0058_close_public_insert.sql"), "utf8");
  const variant = (extra) => {
    const read = (f) => (f === "0058_close_public_insert.sql" ? real.replace("commit;", `${extra}\ncommit;`) : fs.readFileSync(path.join(DIR, f), "utf8"));
    return { p: buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, read }), read };
  };
  for (const [extra, what] of [["alter table public.listing_reports disable trigger all;", "DISABLE TRIGGER"], ["set session_replication_role = replica;", "session_replication_role"]]) {
    const v = variant(extra);
    is(refusal(() => checkRequest(A(OK_ARGS), v.p, [], { read: v.read }), /disables triggers/), `a file that disables triggers (${what})`);
  }
  const e = variant("select net.http_post('https://example.invalid');");
  is(refusal(() => checkRequest(A(OK_ARGS), e.p, [], { read: e.read }), /database egress/), "a file that adds database egress (pg_net)");
  const tx = variant("commit;\nbegin;");
  is(refusal(() => checkRequest(A(OK_ARGS), tx.p, [], { read: tx.read }), /transaction control/), "a file with its own extra transaction control");
  is(refusal(() => checkRequest(A(OK_ARGS), P, [], { read: () => real + "\n-- edited" }), /changed after the plan/), "a file edited after the plan was built");
}

console.log("\n  REFUSALS: the DSN file (before connecting)");
const D = (dsn, mode, env = {}) => () => readDsn({ PRODUCTION_DSN_FILE: dsnFile(dsn, mode), ...env }, PROD);
is(refusal(() => readDsn({}, PROD), /set PRODUCTION_DSN_FILE/), "PRODUCTION_DSN_FILE unset");
is(refusal(() => readDsn({ PRODUCTION_DSN_FILE: path.join(tmp, "nope") }, PROD), /cannot read that file/), "a path that does not exist");
is(refusal(() => readDsn({ PRODUCTION_DSN_FILE: "supabase/migrations/README.md" }, PROD), /inside the repository/), "a file inside the repository");
is(refusal(D(GOOD_DSN, 0o644), /readable by others/), "a file readable by group/others (644)");
is(refusal(D(`postgresql://postgres:${PW}@db.${STAGING}.supabase.co:5432/postgres`), /STAGING/), "a DSN naming the staging project");
is(refusal(D(`postgresql://postgres:${PW}@db.otherprojectref0000.supabase.co:5432/postgres`), /not the production project/), "another Supabase project");
is(refusal(D(`postgresql://postgres:${PW}@localhost:5432/postgres`), /not the production project/), "localhost");
is(refusal(D(`postgresql://supabase_admin:${PW}@db.${PROD}.supabase.co:5432/postgres`), /'supabase_admin'.*least-privileged/), "supabase_admin (more privilege than needed)");
is(refusal(D(`postgresql://service_role:${PW}@db.${PROD}.supabase.co:5432/postgres`), /'service_role'/), "service_role");
is(refusal(D(`postgresql://postgres.otherref:${PW}@aws-0-ca-central-1.pooler.supabase.com:5432/postgres`), /does not name project/), "a pooler user for another project");
is(refusal(D(`postgresql://postgres.${PROD}:${PW}@aws-0-ca-central-1.pooler.supabase.com:6543/postgres`), /TRANSACTION pooler/), "the transaction pooler (6543)");
is(refusal(D(`https://db.${PROD}.supabase.co`), /postgres:\/\/ connection string/), "not a postgres:// string");
ok(readDsn({ PRODUCTION_DSN_FILE: dsnFile(GOOD_DSN) }, PROD).user === "postgres", "the direct host as postgres, mode 600, outside the repo: accepted");
ok(readDsn({ PRODUCTION_DSN_FILE: dsnFile(`postgresql://postgres.${PROD}:${PW}@aws-0-ca-central-1.pooler.supabase.com:5432/postgres`) }, PROD).host.endsWith("pooler.supabase.com"), "the session pooler (5432) as postgres.<ref>: accepted");
for (const [, msg] of [[0, (() => { try { D(`postgresql://supabase_admin:${PW}@db.${PROD}.supabase.co:5432/postgres`)(); } catch (e) { return e.message; } })()]]) {
  ok(!msg.includes(PW) && !/postgres(ql)?:\/\//.test(msg), "a DSN refusal names the problem, never the DSN or its password");
}

console.log("\n  REFUSALS: the typed confirmation");
is(await refusalAsync(() => confirmRef(PROD, "0058_close_public_insert.sql", async () => PROD, { isTTY: false }), /interactive terminal/), "stdin is not a TTY (cannot be piped or scripted)");
is(await refusalAsync(() => confirmRef(PROD, "0058_close_public_insert.sql", async () => "rvptronniomlqumjhyrx", { isTTY: true }), /did not match/), "a mistyped ref");
is(await refusalAsync(() => confirmRef(PROD, "0058_close_public_insert.sql", async () => "yes", { isTTY: true }), /did not match/), "'yes' instead of the ref");
{
  let prompt = "";
  await confirmRef(PROD, "0058_close_public_insert.sql", async (q) => { prompt = q; return `${PROD}\n`; }, { isTTY: true });
  ok(/0058_close_public_insert\.sql to PRODUCTION/.test(prompt), "the ref typed exactly passes; the prompt names the file and PRODUCTION");
}

console.log("\n  CLI (no network: every socket, lookup and fetch throws)");
const LOGDIR = path.join(tmp, "log");
const cli = (args, env = {}) => spawnSync(process.execPath, ["--import", "./scripts/fixtures/no-network-preload.mjs", "scripts/apply-migrations-production.mjs", ...args],
  { env: { PATH: process.env.PATH, HOME: process.env.HOME, PRODUCTION_LOG_DIR: LOGDIR, ...env }, encoding: "utf8", input: "", timeout: 20000 });
{
  const r = cli([]);
  ok(r.status === 0 && /nothing was connected to/.test(r.stdout) && new RegExp(`${N} to apply`).test(r.stdout) && /0077_listing_reports_installed_app_compat\.sql\n\s+sha256/.test(r.stdout),
     `no arguments: prints the ${N}-step plan and exits 0`, `${r.status} ${r.stderr.slice(0, 200)}`);
  const f = cli(["--audit", "scripts/fixtures/production-audit-fixture.json"]);
  ok(f.status === 0 && new RegExp(`${N_FIXTURE} to apply`).test(f.stdout) && /! 0077_listing_reports_installed_app_compat\.sql goes FIRST/.test(f.stdout), "--audit <fixture>: that audit's plan, with its warnings");
}
const cliRefuses = (args, env, re, m) => { const r = cli(args, env); ok(r.status === 2 && re.test(r.stderr) && !fs.existsSync(path.join(LOGDIR, "apply-log.jsonl")), m, `${r.status} ${r.stderr.slice(0, 220)}`); return r; };
cliRefuses([...OK_ARGS.split(" ").filter((x) => x !== "--apply")], {}, /needs --apply/, "CLI: missing --apply -> exit 2, nothing logged");
cliRefuses(["--apply", "--only", "0058_close_public_insert.sql", `--ref=${STAGING}`, "--approved-by=user-in-chat"], {}, /STAGING/, "CLI: the staging ref -> exit 2");
cliRefuses(["--apply", "--only", "0058_close_public_insert.sql", "--only", "0077_listing_reports_installed_app_compat.sql", `--ref=${PROD}`, "--approved-by=user-in-chat"], {}, /one migration per invocation/, "CLI: two files -> exit 2");
cliRefuses(["--apply", "--only", "0058_close_public_insert.sql", `--ref=${PROD}`, "--approved-by=user-in-chat"], {}, /set PRODUCTION_DSN_FILE/, "CLI: a complete request without a DSN file -> exit 2");
{
  const stagingDsn = dsnFile(`postgresql://postgres:${PW}@db.${STAGING}.supabase.co:5432/postgres`);
  const r = cliRefuses(["--apply", "--only", "0058_close_public_insert.sql", `--ref=${PROD}`, "--approved-by=user-in-chat"], { PRODUCTION_DSN_FILE: stagingDsn }, /names the STAGING project/, "CLI: a staging DSN behind a production ref -> exit 2");
  ok(!(r.stdout + r.stderr).includes(PW) && !(r.stdout + r.stderr).includes(STAGING + ".supabase.co"), "...and the output holds neither the password nor the DSN");
}
{
  const r = cliRefuses(["--apply", "--only", "0058_close_public_insert.sql", `--ref=${PROD}`, "--approved-by=user-in-chat"], { PRODUCTION_DSN_FILE: dsnFile(GOOD_DSN) }, /interactive terminal/,
    "CLI: EVERYTHING valid, but stdin is not a TTY -> exit 2 before connecting (the preload would have thrown on any socket)");
  ok(!(r.stdout + r.stderr).includes(PW) && !/postgres(ql)?:\/\//.test(r.stdout + r.stderr) && !/NETWORK BLOCKED/.test(r.stderr), "...no password, no DSN, and no connection was attempted");
}
cliRefuses(["--record-manual", "0065c_analytics_indexes.sql", `--ref=${PROD}`, "--approved-by=user-in-chat"], {}, /step 9; step 1 is 0058/, "CLI: --record-manual out of order -> exit 2");
{
  const src = fs.readFileSync("scripts/apply-migrations-production.mjs", "utf8") + fs.readFileSync("scripts/_production-migrations.mjs", "utf8");
  const staging = fs.readFileSync("scripts/apply-migrations.mjs", "utf8");
  ok(!/supabase\/staging|STAGING_DATABASE_URL|PRODUCTION_DATABASE_URL/.test(src), "the production runner never reads staging's files or a DSN from the environment (only a file path)");
  ok(/const ALLOWED_REFS = \["jmljfovtfxcdhjmtlnva"\];/.test(staging) && new RegExp(`const PRODUCTION_REFS = \\["${PROD}"\\];`).test(staging), "apply-migrations.mjs is unchanged: staging-only allowlist, production refused by the same ref");
  ok(!/\.query\(\s*[`'"][^`'"]*(disable\s+trigger|session_replication_role)/i.test(src), "the runner itself never sends DISABLE TRIGGER or session_replication_role to the database");
}

console.log("\n  APPLY: applyOne over a fake client (order of operations)");
const SQL0058 = fs.readFileSync(path.join(DIR, "0058_close_public_insert.sql"), "utf8");
const ITEM = P.items[0];
function fakeClient({ role = "postgres", su = false, appliedBefore = false, bodyThrows = null, bodyNoEffect = false } = {}) {
  const st = { applied: appliedBefore, queries: [] };
  const fn = () => ({ "public.f()": { def: "a", secdef: false, acl: "", owner: "postgres" }, ...(st.applied ? { "public.g()": { def: "b", secdef: true, acl: "", owner: "postgres" } } : {}) });
  return {
    st,
    async query(sql) {
      st.queries.push(sql);
      if (/current_user::text u/.test(sql)) return { rows: [{ u: role, su, v: "15.8" }] };
      if (sql === markerSelect(ITEM.marker)) return { rows: [{ applied: st.applied }] };
      if (sql === runnerBody(SQL0058)) { if (bodyThrows) throw Object.assign(new Error(bodyThrows), { code: "42P01" }); if (!bodyNoEffect) st.applied = true; return { rows: [] }; }
      if (/from pg_proc p where p\.pronamespace in/.test(sql)) return { rows: Object.entries(fn()).map(([k, v]) => ({ k, ...v })) };
      if (/query_to_xml/.test(sql)) return { rows: [{ k: "public.contact_submissions", n: "6" }] };
      if (/select extname from pg_extension/.test(sql)) return { rows: [{ extname: "plpgsql" }] };
      return { rows: [] };
    },
  };
}
{
  const c = fakeClient();
  const r = await applyOne(c, ITEM, SQL0058);
  const q = c.st.queries;
  const at = (s) => q.findIndex((x) => x === s || (typeof s === "object" && s.test(x)));
  const iMarker = at(markerSelect(ITEM.marker)), iPre = at("begin read only"), iBegin = q.indexOf("begin"), iBody = q.indexOf(runnerBody(SQL0058)), iCommit = q.indexOf("commit");
  ok(iMarker < iPre && iPre < iBegin && iBegin < iBody && iBody < iCommit, "marker (not applied) -> read-only pre-snapshot -> begin -> the file -> commit");
  ok(q.slice(iBody + 1, iCommit).includes(markerSelect(ITEM.marker)), "the marker is re-checked INSIDE the transaction, before commit");
  ok(q.slice(iBegin, iBody).some((x) => /lock_timeout/.test(x)) && q.slice(iBegin, iBody).some((x) => /statement_timeout/.test(x)), "lock and statement timeouts are set for the transaction");
  ok(q.lastIndexOf("begin read only") > iCommit, "a post-snapshot is taken after commit");
  ok(r.checkpoint === true && r.diff.functions?.added?.includes("public.g()"), "the result carries the checkpoint (true) and the diff (+ public.g())");
  ok(!q.some((x) => /disable\s+trigger|session_replication_role/i.test(x.replace(/--[^\n]*/g, ""))), "no query disables a trigger");
  ok(!q.some((x) => /^rollback$/.test(x) && q.indexOf(x) > iBegin && q.indexOf(x) < iCommit), "no rollback between begin and commit on success");
}
{
  const c = fakeClient({ bodyThrows: "relation \"public.x\" does not exist" });
  let err; try { await applyOne(c, ITEM, SQL0058); } catch (e) { err = e; }
  const q = c.st.queries;
  ok(err && /does not exist/.test(err.message) && err.pre && !q.includes("commit") && q.lastIndexOf("rollback") > q.indexOf("begin"), "an error in the file: rolled back, never committed, rethrown with the pre-snapshot");
  ok(q.filter((x) => x === "begin read only").length === 1, "...and nothing after it ran (no post-snapshot)");
}
{
  const c = fakeClient({ bodyNoEffect: true });
  let err; try { await applyOne(c, ITEM, SQL0058); } catch (e) { err = e; }
  ok(err && /marker still reads not applied; rolled back/.test(err.message) && !c.st.queries.includes("commit"), "the file ran but the marker did not flip: rolled back");
}
{
  const c = fakeClient({ appliedBefore: true });
  is(await refusalAsync(() => applyOne(c, ITEM, SQL0058), /already reads applied/), "the marker already reads applied: refused before anything runs");
  ok(!c.st.queries.includes("begin"), "...no transaction was opened");
}
is(await refusalAsync(() => applyOne(fakeClient({ role: "supabase_admin" }), ITEM, SQL0058), /not postgres/), "connected as a role other than postgres: refused");
is(await refusalAsync(() => applyOne(fakeClient({ su: true }), ITEM, SQL0058), /superuser/), "connected as a superuser: refused (least privilege)");
ok(JSON.stringify(diffSnapshots({ counts: { "public.a": 1 }, policies: { p: { cmd: "r" } } }, { counts: { "public.a": 2 }, policies: { p: { cmd: "w" } } })) ===
   JSON.stringify({ policies: { added: [], removed: [], changed: ["p: cmd"] }, counts: { added: [], removed: [], changed: ["public.a: 1 -> 2"] } }), "the diff names changed fields and count deltas");

console.log("\n  REDACTION");
{
  const msg = `connect failed for ${GOOD_DSN} (password=${PW}) user postgres pw ${encodeURIComponent(PW)}`;
  const out = redact(msg, [GOOD_DSN, PW]);
  ok(!out.includes(PW) && !out.includes(GOOD_DSN) && /postgres:\/\/\[redacted\]|\[redacted\]/.test(out), "the DSN, the password and its URL-encoded form are removed", out);
  const bare = redact(`error at postgresql://postgres:${PW}@db.${PROD}.supabase.co:5432/postgres; sslpassword=abc`);
  ok(!bare.includes(PW) && !/sslpassword=abc/.test(bare), "an unknown DSN or password= is still removed by shape");
  ok(redact("relation \"public.x\" does not exist") === "relation \"public.x\" does not exist", "ordinary errors are left readable");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  production migration runner (offline): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
