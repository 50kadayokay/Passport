// The production runner's ROLLBACK mode, proven OFFLINE.
//   node scripts/apply-rollback-test.mjs     (part of npm run check:s1-prod-runner)
//
// No network, no credentials: production is a fake pg client; the log is in a
// temporary directory.
//   LOG       rolled_back puts a file back in the plan; open rollback runs block
//   REFUSALS  0000/0059/0067; not applied by this runner; out of order; 0071
//             while 0088 is applied; something still needs it; lossy without
//             --accept-data-loss; a missing or changed capture file
//   APPLY     marker applied -> pre-snapshot -> one transaction (rollback, then
//             the capture) -> marker NOT applied -> commit -> post-snapshot;
//             CONCURRENTLY rollbacks with no transaction
//   CLI       refusals before the DSN, nothing connects, the plan's rollback section
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Refusal, loadRecord, parseQ01Markers, buildPlan, parseArgs, checkRequest, unresolved, appliedStack, markerSelect, PRODUCTION_REFS, STAGING_REFS } from "./_production-migrations.mjs";
import { checkRollback, applyRollback, lossyReasons, formatRollbackSection, NEVER_ROLL_BACK, REVIEWED_NOT_LOSSY } from "./_production-rollback.mjs";
import { writeCaptureFile } from "./_function-capture.mjs";
import { STATE_SQL } from "./_concurrent-indexes.mjs";
import { runnerBody, sha256 } from "./_db-egress.mjs";
import { DEFERRED, PENDING, UNVERIFIED, PREREQUISITES, NEEDS_SUPERUSER } from "./_migration-manifest.mjs";
// These cases model the 0058 group, which the user HELD on 2026-11-02: plan them without the hold.
const UNHELD = { DEFERRED: Object.fromEntries(Object.entries(DEFERRED).filter(([, why]) => !/^HELD\b/.test(why))), PENDING, UNVERIFIED, PREREQUISITES, NEEDS_SUPERUSER };

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const refusal = (fn, re) => { try { fn(); return "no refusal"; } catch (e) { return e instanceof Refusal && re.test(e.message) ? true : `${e.name}: ${e.message}`; } };
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const is = (r, m) => ok(r === true, m, r === true ? "" : r);

const PROD = PRODUCTION_REFS[0], STAGING = STAGING_REFS[0];
const DIR = "supabase/migrations";
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"));
const Q01 = parseQ01Markers(fs.readFileSync("supabase/audit/production_readiness_2026_10_31.sql", "utf8"));
const RECORD = loadRecord("supabase/audit/production_applied_2026_11_01.json");
const DOC = fs.readFileSync("docs/PRODUCTION-ROLLOUT-PLAN.md", "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-test-"));
const A = (s) => parseArgs(s.split(" ").filter(Boolean));
const applied = (...files) => files.map((file, i) => ({ at: `2026-11-02T0${i}:00:00Z`, ref: PROD, file, status: "applied" }));
const rb = (args, log, extra = {}) => () => checkRollback(typeof args === "string" ? A(args) : args, { log, ref: PROD, q01Markers: Q01, manifest: UNHELD, planDoc: DOC, ...extra });
const R = (file, more = "") => `--rollback --only ${file} --ref=${PROD} --approved-by=user-in-chat-2026-11-02 ${more}`;

console.log("\n  LOG: a rollback puts the file back in the plan");
{
  const base = buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, manifest: UNHELD });
  // The order the runner applies them in: 0058, 0095 (right after it), 0077 (right after 0095).
  const log = [...applied("0058_close_public_insert.sql", "0095_public_lead_form_guard.sql", "0077_listing_reports_installed_app_compat.sql")];
  ok(buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, manifest: UNHELD, log }).items[0].file === "0092_listing_reports_column_insert.sql", "(with 0058, 0095 and 0077 applied by the runner, 0092 is next)");
  log.push({ at: "2026-11-02T05:00:00Z", ref: PROD, file: "0077_listing_reports_installed_app_compat.sql", status: "rolled_back" });
  const p = buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, manifest: UNHELD, log });
  ok(p.items[0].file === "0077_listing_reports_installed_app_compat.sql" && p.items[1].file === "0092_listing_reports_column_insert.sql" && p.items.length === base.items.length - 2
     && p.warnings.length === 1 && /^0077_listing_reports_installed_app_compat\.sql goes FIRST: 0095_public_lead_form_guard\.sql is already applied/.test(p.warnings[0]),
     "after `rolled_back`, the plan offers 0077 again as step 1, warned (0058 and 0095 stay applied)", p.warnings.join("; "));
  ok(JSON.stringify(appliedStack(log, PROD)) === JSON.stringify(["0058_close_public_insert.sql", "0095_public_lead_form_guard.sql"]), "the rollback stack drops it");
  log.push(...applied("0077_listing_reports_installed_app_compat.sql").map((e) => ({ ...e, at: "2026-11-02T06:00:00Z" })));
  ok(buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, manifest: UNHELD, log }).items[0].file === "0092_listing_reports_column_insert.sql", "re-applied after the rollback: applied again (0092 next)");
  ok(JSON.stringify(appliedStack([...applied("0058_close_public_insert.sql"), { ref: STAGING, file: "0058_close_public_insert.sql", status: "rolled_back" }], PROD)) === JSON.stringify(["0058_close_public_insert.sql"]),
     "a rollback logged for another ref does not count");
  const rec = { ...RECORD, q01: { ...RECORD.q01, "0058_close_public_insert.sql": "applied" } };
  is(refusal(() => buildPlan({ files: FILES, record: rec, q01Markers: Q01, manifest: UNHELD, log: [...applied("0058_close_public_insert.sql"), { at: "x", ref: PROD, file: "0058_close_public_insert.sql", status: "rolled_back" }] }), /audit predates the rollback/),
     "an audit that says applied, after the runner rolled the file back: planning refuses until the audit is re-run");
  ok(unresolved([{ file: "a", status: "rollback-started" }]).length === 1 && unresolved([{ file: "a", status: "rollback-failed" }]).length === 1
     && unresolved([{ file: "a", status: "rollback-started" }, { file: "a", status: "rolled_back" }]).length === 0, "an interrupted or failed rollback is an unresolved run (blocks everything until --reviewed)");
  is(refusal(() => checkRequest(A(R("0058_close_public_insert.sql")), base, [{ ref: PROD, file: "0058_close_public_insert.sql", status: "rollback-failed" }], { kind: "rollback" }), /unresolved run/), "...and checkRequest refuses a rollback while one is open");
}

console.log("\n  REFUSALS (before the DSN is read)");
{
  for (const f of Object.keys(NEVER_ROLL_BACK)) is(refusal(rb(R(f), applied(f)), /never|breaks investor sign-up|cascades Conference Mode/), `${f}: never rolled back, even if a log says it was applied`);
  is(refusal(rb(R("0058_close_public_insert.sql"), []), /not applied by this runner/), "a file this runner did not apply");
  is(refusal(rb(R("0058_close_public_insert.sql"), applied("0058_close_public_insert.sql", "0077_listing_reports_installed_app_compat.sql")), /strict reverse order: 0077.* must be rolled back first/), "not the most recent: strict reverse order");
  is(refusal(rb(R("0071_publishing_reliability.sql", '--accept-data-loss="ops tables, user-in-chat 2026-11-02"'), applied("0088_content_fanout.sql", "0071_publishing_reliability.sql")),
    /0071_publishing_reliability\.sql's rollback is refused while 0088_content_fanout\.sql is applied/), "0071 while 0088 is applied (even when 0071 is the most recent)");
  is(refusal(rb(R("0090_notification_clear_roles.sql"), applied("0091_notification_clear_no_platform_admin.sql", "0090_notification_clear_roles.sql")), /0091_notification_clear_no_platform_admin\.sql still needs 0090/),
     "a file another applied file still needs (manifest prerequisites)");
  is(refusal(rb(R("0058_close_public_insert.sql"), applied("0077_listing_reports_installed_app_compat.sql", "0058_close_public_insert.sql")), /0077.* still needs 0058/), "0058 while 0077 (its prerequisite partner) is applied");
  is(refusal(rb(R("0058_close_public_insert.sql"), applied("0095_public_lead_form_guard.sql", "0058_close_public_insert.sql")), /0095_public_lead_form_guard\.sql still needs 0058/), "0058 while 0095 (its immediate partner) is applied");
  is(refusal(rb(R("0095_public_lead_form_guard.sql"), applied("0058_close_public_insert.sql", "0077_listing_reports_installed_app_compat.sql", "0095_public_lead_form_guard.sql")), /0077_listing_reports_installed_app_compat\.sql still needs 0095/),
     "0095 while 0077 (which runs right after it) is applied");
  is(refusal(rb(R("0063_company_initiated_threads.sql"), applied("0096_conversations_legacy_upsert.sql", "0063_company_initiated_threads.sql")), /0096_conversations_legacy_upsert\.sql still needs 0063/), "0063 while 0096 (its immediate partner) is applied");
  is(refusal(rb(`--rollback --ref=${PROD} --approved-by=user-in-chat-2026-11-02`, applied("0090_notification_clear_roles.sql")), /exactly one --only/), "no --only");
  is(refusal(rb(R("0072_profile_drafts.sql"), applied("0072_profile_drafts.sql")), /loses data \(drops a table; the rollout plan marks it lossy.*--accept-data-loss=/), "LOSSY (0072, unpublished drafts) without --accept-data-loss");
  is(refusal(rb(R("0072_profile_drafts.sql", "--accept-data-loss=ok"), applied("0072_profile_drafts.sql")), /at least 8 characters/), "...or with a token one");
  const it72 = rb(R("0072_profile_drafts.sql", "--accept-data-loss=drafts-lost-ok-user-in-chat"), applied("0072_profile_drafts.sql"))();
  ok(it72.lossy.length >= 1 && it72.acceptDataLoss === "drafts-lost-ok-user-in-chat" && it72.mode === "transaction", "...with the decision given, it passes and carries the decision for the log");
  is(refusal(rb(R("0090_notification_clear_roles.sql", "--accept-data-loss=just-in-case-x"), applied("0090_notification_clear_roles.sql")), /not lossy; drop the flag/), "--accept-data-loss on a clean rollback (0090) is refused");
  is(refusal(() => checkRequest(A(`--apply --only 0058_close_public_insert.sql --ref=${PROD} --approved-by=user-in-chat --accept-data-loss=whatever-long`), buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, manifest: UNHELD }), []), /only for --rollback/),
     "--accept-data-loss with --apply");
  is(refusal(() => checkRequest(A(`--rollback --apply --only 0058_close_public_insert.sql --ref=${PROD} --approved-by=user-in-chat`), buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, manifest: UNHELD }), [], { kind: "rollback" }), /choose one/), "--rollback with --apply");
  is(refusal(() => checkRequest(A(`--rollback --only 0058_close_public_insert.sql --ref=${STAGING} --approved-by=user-in-chat`), buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, manifest: UNHELD }), [], { kind: "rollback" }), /STAGING/), "the staging ref");
  is(refusal(() => checkRequest(A(`--rollback --only 0058_close_public_insert.sql --ref=${PROD}`), buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, manifest: UNHELD }), [], { kind: "rollback" }), /approved-by/), "no --approved-by");
}

console.log("\n  LOSSY: from the rollback's own statements and the rollout table");
{
  const L = (f) => lossyReasons(fs.readFileSync(`supabase/rollbacks/${f.replace(/\.sql$/, ".rollback.sql")}`, "utf8"), f, DOC);
  const docLossy = DOC.split("\n").filter((l) => /^\| \d+ \| `0\d+[a-z]?_[^`]+\.sql`.*\|\s*lossy[^|]*\|\s*$/.test(l)).map((l) => /`([^`]+)`/.exec(l)[1]);
  ok(docLossy.length >= 8 && docLossy.every((f) => L(f).length > 0), `every rollback the rollout table marks lossy is lossy here (${docLossy.length})`);
  ok(["0071_publishing_reliability.sql", "0074_profile_revision_history.sql", "0076_company_roles.sql"].every((f) => L(f).some((r) => /drops a column|drops a table|deletes rows/.test(r))),
     "...and so are rollbacks whose SQL drops columns or tables the table calls clean (0071, 0074, 0076): fail closed");
  ok(["0058_close_public_insert.sql", "0064_notification_clearing.sql", "0065c_analytics_indexes.sql", "0090_notification_clear_roles.sql", "0091_notification_clear_no_platform_admin.sql"].every((f) => L(f).length === 0),
     "clean rollbacks are not flagged (0064 keeps cleared_at; GRANT TRUNCATE is a privilege, not a TRUNCATE)");
  ok(lossyReasons("create or replace function public.f() returns void language sql as $$ delete from public.t $$;\ngrant truncate on public.t to anon;", "x.sql").length === 0
     && lossyReasons("do $$ begin delete from public.t; end $$;", "x.sql").join() === "deletes rows", "a function body does not count (it does not run); a DO block does");
}

console.log("\n  THE CAPTURE FILE of the apply being undone");
const F71 = "0071_publishing_reliability.sql";
const AT = "2026-11-02T03:00:00.000Z";
const captured = [{ sig: "public.claim_deliveries(text, text, integer, integer)", ident: "public.claim_deliveries(text,text,integer,integer)", existed: true, reasons: ["create or replace"],
  def: "CREATE OR REPLACE FUNCTION public.claim_deliveries(p_listener text, p_worker text, p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 120)\n RETURNS SETOF events\n LANGUAGE plpgsql\nAS $function$\nbegin\n  -- PRODUCTION-ONLY-71\n  return;\nend\n$function$\n",
  owner: "postgres", aclDefault: false, acl: [{ grantee: "service_role", privilege: "EXECUTE", grantable: false }], overloads: [] }];
captured[0].defMd5 = (await import("node:crypto")).createHash("md5").update(captured[0].def).digest("hex");
captured[0].aclKey = ["service_role:EXECUTE:-"];
const cap = writeCaptureFile(captured, { file: F71, sha256: "abc", ref: PROD, at: AT }, { dir: tmp, isIgnored: () => true });
const LOG71 = [{ ref: PROD, file: F71, status: "started" }, { ref: PROD, file: F71, status: "captured", capture: cap.path, capture_sha256: cap.sha256 }, { at: AT, ref: PROD, file: F71, status: "applied" }];
{
  const item = checkRollback(parseArgs([...R(F71).split(" ").filter(Boolean), "--accept-data-loss=ops tables lost, user-in-chat"]), { log: LOG71, ref: PROD, q01Markers: Q01, manifest: UNHELD, planDoc: DOC });
  ok(item.capture && item.capture.path === cap.path && item.capture.functions === 1 && item.rollback === "supabase/rollbacks/0071_publishing_reliability.rollback.sql",
     "the capture logged for that apply is found, checked against its sha256 and parsed");
  ok(checkRollback(parseArgs([...R(F71).split(" ").filter(Boolean), "--accept-data-loss=ops tables lost, user-in-chat"]),
     { log: [...LOG71, { ref: PROD, file: F71, status: "rolled_back" }, { ref: PROD, file: F71, status: "started" }, { ref: PROD, file: F71, status: "applied" }], ref: PROD, q01Markers: Q01, manifest: UNHELD, planDoc: DOC }).capture === null,
     "a later apply that captured nothing: no capture file (an older capture is never reused)");
  const args = parseArgs([...R(F71).split(" ").filter(Boolean), "--accept-data-loss=ops tables lost, user-in-chat"]);
  const original = fs.readFileSync(cap.path, "utf8");
  fs.writeFileSync(cap.path, original + "\n-- edited");
  is(refusal(() => checkRollback(args, { log: LOG71, ref: PROD, q01Markers: Q01, manifest: UNHELD, planDoc: DOC }), /changed after it was written/), "a capture file edited since: refused");
  fs.writeFileSync(cap.path, original);
  is(refusal(() => checkRollback(args, { log: LOG71.map((e) => (e.capture ? { ...e, capture: path.join(tmp, "gone.sql") } : e)), ref: PROD, q01Markers: Q01, manifest: UNHELD, planDoc: DOC }), /is gone/), "a capture file that is gone: refused");
}

console.log("\n  APPLY: one transaction, then the marker must read NOT applied (fake client)");
const ITEM71 = checkRollback(parseArgs([...R(F71).split(" ").filter(Boolean), "--accept-data-loss=ops tables lost, user-in-chat"]), { log: LOG71, ref: PROD, q01Markers: Q01, manifest: UNHELD, planDoc: DOC });
function fakeClient(item, { appliedBefore = true, noEffect = false, throwOn = null } = {}) {
  const st = { applied: appliedBefore, queries: [], idx: {} };
  if (item.steps) for (const s of item.steps) st.idx[s.index] = true;
  return {
    st,
    async query(sql, params = []) {
      st.queries.push(sql);
      if (/current_user::text u/.test(sql)) return { rows: [{ u: "postgres", su: false, v: "15.8" }] };
      if (sql === markerSelect(item.marker)) return { rows: [{ applied: st.applied }] };
      if (sql === STATE_SQL) return { rows: [{ present: !!st.idx[params[0]], valid: !!st.idx[params[0]] }] };
      if (item.steps) { const s = item.steps.find((x) => x.sql === sql); if (s) { delete st.idx[s.index]; if (!Object.keys(st.idx).length && !noEffect) st.applied = false; return { rows: [] }; } }
      if (sql === runnerBody(item.rollbackSql)) { if (throwOn === "rollback") throw Object.assign(new Error("0071 rollback refused: 0088_content_fanout is still applied"), { code: "P0001" }); if (!noEffect) st.applied = false; return { rows: [] }; }
      if (item.capture && sql === runnerBody(item.capture.sql)) { if (throwOn === "capture") throw new Error("capture rollback: public.claim_deliveries(text,text,integer,integer) does not match the capture"); return { rows: [] }; }
      if (/select extname from pg_extension/.test(sql)) return { rows: [{ extname: "plpgsql" }] };
      return { rows: [] };
    },
  };
}
{
  const c = fakeClient(ITEM71);
  const r = await applyRollback(c, ITEM71);
  const q = c.st.queries;
  const iM = q.indexOf(markerSelect(ITEM71.marker)), iPre = q.indexOf("begin read only"), iB = q.indexOf("begin"), iR = q.indexOf(runnerBody(ITEM71.rollbackSql)), iC = q.indexOf(runnerBody(ITEM71.capture.sql));
  const iM2 = q.indexOf(markerSelect(ITEM71.marker), iC), iCommit = q.indexOf("commit"), iPost = q.lastIndexOf("begin read only");
  ok(iM < iPre && iPre < iB && iB < iR && iR < iC && iC < iM2 && iM2 < iCommit && iCommit < iPost,
     "marker (applied) -> pre-snapshot -> begin -> committed rollback -> capture file -> marker (NOT applied) -> commit -> post-snapshot");
  ok(q.slice(iB, iR).some((x) => /lock_timeout/.test(x)) && q.slice(iB, iR).some((x) => /statement_timeout/.test(x)), "lock and statement timeouts are set for the transaction");
  ok(r.checkpoint === true && r.diff && r.pre && r.post, "the result says the marker reads not applied, with the snapshots and diff (logged as rolled_back)");
  let e = await rejects(() => applyRollback(fakeClient(ITEM71, { noEffect: true }), ITEM71));
  ok(e && /marker still reads applied; rolled back/.test(e.message) && e.pre, "the rollback ran but the marker still reads applied: rolled back, an error");
  let c2 = fakeClient(ITEM71, { throwOn: "rollback" });
  e = await rejects(() => applyRollback(c2, ITEM71));
  ok(e && /0088_content_fanout is still applied/.test(e.message) && !c2.st.queries.includes("commit") && !c2.st.queries.includes(runnerBody(ITEM71.capture.sql)), "the SQL's own guard (0071 while 0088) refuses: rolled back, the capture never ran");
  c2 = fakeClient(ITEM71, { throwOn: "capture" });
  e = await rejects(() => applyRollback(c2, ITEM71));
  ok(e && /does not match the capture/.test(e.message) && !c2.st.queries.includes("commit"), "the capture file's own check fails: the whole rollback is rolled back with it");
  c2 = fakeClient(ITEM71, { appliedBefore: false });
  e = await rejects(() => applyRollback(c2, ITEM71));
  ok(e instanceof Refusal && /already reads NOT applied/.test(e.message) && !c2.st.queries.includes("begin"), "production does not look applied: refused before anything");
}
{
  const F65 = "0065c_analytics_indexes.sql";
  const item = rb(R(F65), applied(F65))();
  ok(item.mode === "concurrently" && item.steps.length === 3 && item.steps.every((s) => s.kind === "drop") && item.capture === null, "0065c's rollback: three DROP INDEX CONCURRENTLY, no capture");
  const c = fakeClient(item);
  const r = await applyRollback(c, item);
  const q = c.st.queries;
  ok(!q.includes("begin") && !q.includes("commit") && item.steps.every((s, i) => q.indexOf(s.sql) > 0 && (i === 0 || q.indexOf(s.sql) > q.indexOf(item.steps[i - 1].sql)) && q[q.indexOf(s.sql) - 1] === "set lock_timeout = '3s'"),
     "CONCURRENTLY rollback: no transaction, one statement at a time, each with the short lock timeout");
  ok(r.checkpoint === true, "...and the marker reads not applied afterwards");
  ok(/\/\* concurrent:index-state \*\//.test(q[q.indexOf(item.steps[0].sql) + 1]), "...each drop is checked (the index must be gone)");
}

console.log("\n  0092 (grant-only, right after 0077) on every path");
{
  const F92 = "0092_listing_reports_column_insert.sql", F77 = "0077_listing_reports_installed_app_compat.sql";
  const it = buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, manifest: UNHELD, log: applied("0058_close_public_insert.sql", "0095_public_lead_form_guard.sql", F77) }).items[0];
  ok(it.file === F92 && it.after === F77 && it.mode === "transaction" && it.concurrent === null && !it.concurrentError, "planned right after 0077, as a transaction file (not the no-transaction path)");
  ok(Array.isArray(it.captures) && it.captures.length === 0 && !it.captureError, "capture-on-apply: no function to capture");
  ok(/has_column_privilege\('anon', 'public\.listing_reports', 'company_slug', 'INSERT'\) and not has_column_privilege\('anon', 'public\.listing_reports', 'created_at', 'INSERT'\)/.test(it.checkpoint),
     "its checkpoint: company_slug insertable and created_at NOT (a table-wide grant reads false)");
  ok(lossyReasons(fs.readFileSync("supabase/rollbacks/0092_listing_reports_column_insert.rollback.sql", "utf8"), F92, DOC).length === 0, "its rollback is not lossy");
  const r92 = rb(R(F92), applied("0058_close_public_insert.sql", "0095_public_lead_form_guard.sql", F77, F92))();
  ok(r92.file === F92 && r92.mode === "transaction" && r92.capture === null && r92.lossy.length === 0 && r92.acceptDataLoss === null, "--rollback 0092: allowed with no --accept-data-loss, no capture file");
  is(refusal(rb(R(F92, "--accept-data-loss=just-in-case-x"), applied("0058_close_public_insert.sql", "0095_public_lead_form_guard.sql", F77, F92)), /not lossy; drop the flag/), "...and refuses a needless --accept-data-loss");
  is(refusal(rb(R(F77), applied("0058_close_public_insert.sql", "0095_public_lead_form_guard.sql", F77, F92)), /strict reverse order: 0092.* must be rolled back first/), "0077 cannot be rolled back while 0092 is applied");
  is(refusal(rb(R(F77), [...applied("0058_close_public_insert.sql", "0095_public_lead_form_guard.sql", F92), ...applied(F77).map((e) => ({ ...e, at: "z" }))]), /0092_listing_reports_column_insert\.sql still needs 0077/),
     "...even when the log's order is odd: 0092 still needs 0077");
}

console.log("\n  0093 (rate limit, right after 0092) on every path");
{
  const F92 = "0092_listing_reports_column_insert.sql", F93 = "0093_listing_reports_rate_limit.sql", F77 = "0077_listing_reports_installed_app_compat.sql";
  const it = buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, manifest: UNHELD, log: applied("0058_close_public_insert.sql", "0095_public_lead_form_guard.sql", F77, F92) }).items[0];
  ok(it.file === F93 && it.after === F92 && it.mode === "transaction" && it.concurrent === null, "planned right after 0092, as a transaction file");
  ok(!it.captureError && it.captures.map((c) => c.sig).join() === "public.listing_report_client_ip(),public.listing_report_canonical_ip(text),public.listing_report_network(text),public.listing_report_key(text, text),public.listing_reports_guard()",
     "capture-on-apply pins its five functions (both new in production: listed in the capture, not restored)", it.captureError || it.captures.map((c) => c.sig).join());
  ok(/to_regclass\('public\.listing_report_limits'\) is not null and exists \(select 1 from pg_trigger where tgrelid = 'public\.listing_reports'::regclass and tgname = 'listing_reports_guard'/.test(it.checkpoint), "its checkpoint: the limits table and the guard trigger exist");
  const rbSql = fs.readFileSync("supabase/rollbacks/0093_listing_reports_rate_limit.rollback.sql", "utf8");
  ok(lossyReasons(rbSql, F93, DOC).join() === "deletes rows,drops a table" && REVIEWED_NOT_LOSSY[F93].sha256 === sha256(rbSql),
     "the scan flags its rollback (drops its tables, deletes its counters); a review pinned to this file's sha256 clears it");
  const r93 = rb(R(F93), applied("0058_close_public_insert.sql", "0095_public_lead_form_guard.sql", F77, F92, F93))();
  ok(r93.lossy.length === 0 && r93.acceptDataLoss === null && r93.mode === "transaction", "--rollback 0093: no --accept-data-loss needed (reviewed: no user data lost)");
  const edited = path.join(tmp, "rb93"); fs.mkdirSync(edited);
  for (const f of fs.readdirSync("supabase/rollbacks")) fs.copyFileSync(path.join("supabase/rollbacks", f), path.join(edited, f));
  fs.appendFileSync(path.join(edited, "0093_listing_reports_rate_limit.rollback.sql"), "\ndelete from public.listing_reports;\n");
  is(refusal(rb(R(F93), applied("0058_close_public_insert.sql", "0095_public_lead_form_guard.sql", F77, F92, F93), { rollbacksDir: edited }), /loses data \(deletes rows; drops a table\)/),
     "an EDITED 0093 rollback is lossy again until re-reviewed (the sha256 no longer matches)");
  is(refusal(rb(R(F92), applied("0058_close_public_insert.sql", "0095_public_lead_form_guard.sql", F77, F92, F93)), /strict reverse order: 0093.* must be rolled back first/), "0092 cannot be rolled back while 0093 is applied");
  ok(/next: 0093_listing_reports_rate_limit\.sql(?!.*LOSSY)/.test(formatRollbackSection(applied("0058_close_public_insert.sql", "0095_public_lead_form_guard.sql", F77, F92, F93), PROD, { planDoc: DOC })), "the plan's rollback section does not mark it LOSSY");
}

console.log("\n  CLI and the plan");
{
  const text = formatRollbackSection([...applied("0058_close_public_insert.sql", "0077_listing_reports_installed_app_compat.sql", "0062_message_attachments.sql")], PROD, { planDoc: DOC });
  ok(/next: 0062_message_attachments\.sql\s+LOSSY: drops a table/.test(text) && /then: 0077_listing/.test(text) && /then: 0058_close/.test(text), "the plan lists what the runner applied, newest first, with LOSSY marks");
  ok(/rule: 0071_publishing_reliability\.sql is never rolled back while 0088_content_fanout\.sql is applied/.test(text) && /never: 0000_baseline\.sql, 0059_auth_user_trigger\.sql, 0067_conference_mode_feature\.sql/.test(text),
     "...the 0071/0088 rule and the never-roll-back files");
  ok(/\(refused while 0088_content_fanout\.sql is applied\)/.test(formatRollbackSection(applied("0088_content_fanout.sql", "0071_publishing_reliability.sql"), PROD, { planDoc: DOC })), "...and marks 0071 refused while 0088 is applied");

  const LOGDIR = path.join(tmp, "log"); fs.mkdirSync(LOGDIR);
  const cli = (args, env = {}) => spawnSync(process.execPath, ["--import", "./scripts/fixtures/no-network-preload.mjs", "scripts/apply-migrations-production.mjs", ...args],
    { env: { PATH: process.env.PATH, HOME: process.env.HOME, PRODUCTION_LOG_DIR: LOGDIR, ...env }, encoding: "utf8", input: "", timeout: 20000 });
  let r = cli([]);
  ok(r.status === 0 && /ROLLBACK \(only the most recently applied file/.test(r.stdout) && /nothing applied by this runner yet/.test(r.stdout), "the printed plan ends with the rollback section");
  r = cli(["--rollback", "--only", "0059_auth_user_trigger.sql", `--ref=${PROD}`, "--approved-by=user-in-chat"]);
  ok(r.status === 2 && /breaks investor sign-up/.test(r.stderr), "CLI: --rollback 0059 -> exit 2", r.stderr.slice(0, 200));
  fs.writeFileSync(path.join(LOGDIR, "apply-log.jsonl"), applied("0058_close_public_insert.sql").map((e) => JSON.stringify(e)).join("\n") + "\n");
  r = cli(["--rollback", "--only", "0058_close_public_insert.sql", `--ref=${PROD}`, "--approved-by=user-in-chat"]);
  ok(r.status === 2 && /set PRODUCTION_DSN_FILE/.test(r.stderr), "CLI: a valid rollback request without a DSN file -> exit 2 (all checks passed up to the DSN)", r.stderr.slice(0, 200));
  const dsn = path.join(tmp, "dsn"); fs.writeFileSync(dsn, `postgresql://postgres:Pw-not-real-77@db.${PROD}.supabase.co:5432/postgres`); fs.chmodSync(dsn, 0o600);
  r = cli(["--rollback", "--only", "0058_close_public_insert.sql", `--ref=${PROD}`, "--approved-by=user-in-chat"], { PRODUCTION_DSN_FILE: dsn });
  ok(r.status === 2 && /interactive terminal/.test(r.stderr) && !/NETWORK BLOCKED/.test(r.stderr) && !(r.stdout + r.stderr).includes("Pw-not-real-77"), "CLI: everything valid but no TTY -> exit 2 before connecting, no password in the output");
  ok(fs.readFileSync(path.join(LOGDIR, "apply-log.jsonl"), "utf8").trim().split("\n").length === 1, "...nothing was logged");
  r = cli([]);
  ok(/next: 0058_close_public_insert\.sql/.test(r.stdout), "the CLI plan shows the logged apply as the next rollback");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  rollback mode (offline): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
