// Capture-on-apply for the production migration runner, proven OFFLINE.
//   node scripts/apply-capture-test.mjs      (part of npm run check:s1-prod-runner)
//
// No network, no credentials: production is a fake pg client holding made-up
// "drifted" function definitions.
//   PARSER     every pending file pins exactly the functions it touches; the
//              four drifted ones are among them; anything ambiguous refuses
//   PLAN       says which steps capture; an ambiguous step cannot be applied
//   ORDER      capture (read only) -> file written -> pre-snapshot -> begin ->
//              captured functions unchanged -> the file -> commit
//   REFUSALS   no writer, a failed capture, an unknown type, drift between
//              capture and apply: nothing applied
//   ROUND TRIP the rollback file parses back to exactly what was captured
//   NO LEAK    bodies and secret-like strings never reach the output
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Refusal, loadRecord, parseQ01Markers, buildPlan, formatPlan, parseArgs, checkRequest, applyOne, markerSelect, PRODUCTION_REFS,
} from "./_production-migrations.mjs";
import {
  CaptureAmbiguous, functionTargets, topLevelStatements, formatCaptureRollback, readCapture, writeCaptureFile, secretFindings,
  gitIgnores, CAPTURE_DIR, CAPTURE_QUERIES as Q, captureFileName,
} from "./_function-capture.mjs";
import { PENDING } from "./_migration-manifest.mjs";
import { runnerBody } from "./_db-egress.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const throwsLike = (fn, Type, re) => { try { fn(); return "no error"; } catch (e) { return e instanceof Type && re.test(e.message) ? true : `${e.name}: ${e.message}`; } };
const rejectsLike = async (fn, Type, re) => { try { await fn(); return "no error"; } catch (e) { return e instanceof Type && re.test(e.message) ? true : `${e.name}: ${e.message}`; } };
const is = (r, m) => ok(r === true, m, r === true ? "" : r);

const DIR = "supabase/migrations";
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"));
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const Q01 = parseQ01Markers(fs.readFileSync("supabase/audit/production_readiness_2026_10_31.sql", "utf8"));
const RECORD = loadRecord("supabase/audit/production_applied_2026_11_01.json");
const PROD = PRODUCTION_REFS[0];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-test-"));

console.log("\n  PARSER: the pending files");
{
  const counts = {};
  let all = true;
  for (const f of Object.keys(PENDING).filter((x) => FILES.includes(x))) {
    let t;
    try { t = functionTargets(read(f)); } catch (e) { all = false; ok(false, `${f} parses`, e.message); continue; }
    const creates = (read(f).match(/^\s*create\s+(or\s+replace\s+)?function\s/gim) || []).length;
    counts[f] = t.length;
    if (t.filter((x) => x.reasons.some((r) => /^create/.test(r))).length !== creates) { all = false; ok(false, `${f}: every CREATE FUNCTION is a capture target`, `${creates} in the file`); }
  }
  ok(all, `every pending file parses, and every CREATE FUNCTION in it is a capture target (${Object.values(counts).reduce((a, b) => a + b, 0)} functions in all)`);
  const sigs = (f) => functionTargets(read(f)).map((t) => t.sig);
  const DRIFTED = {
    "0071_publishing_reliability.sql": ["public.publish_publication(uuid, uuid, timestamptz)", "public.claim_deliveries(text, text, integer, integer)"],
    "0072_profile_drafts.sql": ["public.company_go_live(uuid, text)"],
    "0076_company_roles.sql": ["public.accept_company_invitation(text)"],
    "0080_mineiq_search_any_term.sql": ["public.mineiq_search(uuid, text, integer)"],
    "0090_notification_clear_roles.sql": ["public.mark_notifications_cleared(uuid)"],
    "0091_notification_clear_no_platform_admin.sql": ["public.mark_notifications_cleared(uuid)"],
  };
  for (const [f, want] of Object.entries(DRIFTED)) ok(want.every((s) => sigs(f).includes(s)), `${f} captures ${want.map((s) => s.replace(/\(.*/, "")).join(", ")}`, sigs(f).join("; "));
  const t76 = functionTargets(read("0076_company_roles.sql"));
  ok(t76.find((t) => t.sig === "public.list_members(uuid)")?.reasons.includes("dynamic grant") && t76.find((t) => t.sig === "public.has_company_role(uuid, text[])")?.reasons.join() === "create or replace,revoke,grant",
     "grants are tied to their function, including the ones a DO block issues for literally named signatures");
  ok(functionTargets(read("0058_close_public_insert.sql")).length === 0, "a file that touches no function captures nothing (0058)");
}

console.log("\n  PARSER: anything ambiguous refuses");
{
  const A = (sql, re, m) => is(throwsLike(() => functionTargets(sql), CaptureAmbiguous, re), m);
  A("create or replace function f() returns int language sql as $$ select 1 $$;", /unqualified/, "an unqualified function name");
  A(`create function public."F"() returns int language sql as $$ select 1 $$;`, /unqualified or quoted/, "a quoted function name");
  A("create function public.f(out x int) returns int language sql as $$ select 1 $$;", /OUT arguments/, "an OUT argument");
  A("create function public.f(variadic xs int[]) returns int language sql as $$ select 1 $$;", /VARIADIC/, "a VARIADIC argument");
  A("create function public.f(x public.t.c%type) returns int language sql as $$ select 1 $$;", /%TYPE/, "a %TYPE argument");
  A("create or replace procedure public.p() language sql as $$ select 1 $$;", /procedures/, "a procedure");
  A("drop function if exists public.f(uuid) cascade;", /CASCADE/, "DROP FUNCTION ... CASCADE");
  A("drop function public.f;", /schema\.name\(arguments\)/, "DROP FUNCTION without an argument list");
  A("revoke execute on all functions in schema public from anon;", /only ON FUNCTION/, "ON ALL FUNCTIONS IN SCHEMA");
  A("do $$ begin execute 'create or replace function public.f() returns int language sql as ''select 1'''; end $$;", /dynamically/, "a DO block that creates a function");
  A("do $$ declare fn text; begin for fn in select oid::regprocedure::text from pg_proc loop execute format('revoke all on function %s from anon', fn); end loop; end $$;",
    /does not name literally/, "a DO block that grants on functions it does not name");
  A("create function public.f() returns int language sql as $body$ select 1;", /unterminated dollar quote/, "an unterminated dollar quote");
  A("create function public.f(a b c d) returns int language sql as $$ select 1 $$;", /cannot tell its name from its type/, "an argument whose name and type cannot be told apart");
  const t = functionTargets(`-- create function public.commented() ...
    /* drop function public.also_commented(uuid) cascade; */
    create or replace function public.f(p_a uuid, p_at timestamp with time zone default now(), p_tags text[] = '{}', integer, double precision)
      returns int language plpgsql as $fn$ begin perform 1; raise notice 'create function public.inside() ; drop function x cascade'; return 1; end $fn$;
    grant execute on function public.f(uuid, timestamp with time zone, text[], integer, double precision), public.g() to authenticated;
    comment on function public.f(uuid, timestamptz, text[], integer, double precision) is 'create function public.no()';
    create trigger t after insert on public.x for each row execute function public.trg();`);
  ok(t.map((x) => `${x.sig} [${x.reasons}]`).join(" | ") === "public.f(uuid, timestamp with time zone, text[], integer, double precision) [create or replace,grant] | public.g() [grant]",
     "comments, dollar-quoted bodies, strings, COMMENT ON and CREATE TRIGGER are not mistaken for targets; names, defaults and multi-word types are handled", t.map((x) => x.sig).join(" | "));
  ok(topLevelStatements("select 1; create function public.f() returns int language sql as $$ select 1; select 2 $$; select ';'").length === 3, "a ; inside a dollar quote or string does not split a statement");
}

console.log("\n  PLAN: which steps capture");
const PLAN = buildPlan({ files: FILES, record: RECORD, q01Markers: Q01 });
const TEXT = formatPlan(PLAN, RECORD);
{
  const step = (f) => PLAN.items.find((i) => i.file === f);
  ok(step("0071_publishing_reliability.sql").captures.length === 4 && step("0072_profile_drafts.sql").captures.length === 7 && step("0076_company_roles.sql").captures.length === 11,
     "plan items carry their capture lists (0071: 4, 0072: 7, 0076: 11)");
  ok(/0071_publishing_reliability\.sql[\s\S]*?capture: 4 function\(s\) read from production first[^\n]*publish_publication, claim_deliveries/.test(TEXT)
     && /0072_profile_drafts\.sql[\s\S]*?capture: 7 function\(s\)[^\n]*company_go_live/.test(TEXT) && /0076_company_roles\.sql[\s\S]*?capture: 11 function\(s\)[^\n]*accept_company_invitation/.test(TEXT),
     "the printed plan says which files capture, and names the drifted functions");
  ok(/0061a_table_privilege_hardening\.sql[\s\S]*?capture: none \(the file touches no function\)/.test(TEXT), "...and says when a step captures nothing");
  ok(PLAN.items.filter((i) => i.mode !== "concurrently").every((i) => Array.isArray(i.captures) && !i.captureError), "no step of the real plan is ambiguous");

  const AMBIG = "create or replace function f() returns int language sql as $$ select 1 $$;\n";
  const first = PLAN.items[0].file;
  const rd = (f) => (f === first ? AMBIG : read(f));
  const p2 = buildPlan({ files: FILES, record: RECORD, q01Markers: Q01, read: rd });
  ok(/capture: AMBIGUOUS -- this step cannot be applied/.test(formatPlan(p2, RECORD)), "an ambiguous step is printed as AMBIGUOUS, not hidden");
  const args = parseArgs(["--apply", "--only", first, `--ref=${PROD}`, "--approved-by=user-in-chat 2026-11-01"]);
  is(throwsLike(() => checkRequest(args, p2, [], { read: rd }), Refusal, /cannot tell exactly which functions it replaces/), "checkRequest refuses an ambiguous step before the DSN is read");
}

console.log("\n  APPLY: capture before the migration's transaction (fake client)");
const F71 = "0071_publishing_reliability.sql", SQL71 = read(F71);
const ITEM = PLAN.items.find((i) => i.file === F71);
// Made-up production state: two of the four drifted from the repo, one absent.
const SECRET = ["sk", "live", "Zq81not0a0real0key0x7"].join("_");
const defOf = (name, body) => `CREATE OR REPLACE FUNCTION public.${name}\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n  ${body}\nend\n$function$\n`;
const PRODUCTION = () => ({
  "public.publish_publication(uuid, uuid, timestamptz)": { oid: 101, ident: "publish_publication(uuid,uuid,timestamp with time zone)", owner: "postgres",
    def: defOf("publish_publication(p_company uuid, p_actor uuid, p_at timestamp with time zone)", `-- PRODUCTION-ONLY-BODY-71a; perform 1; return '{}'::jsonb;`),
    acl: [{ grantee: "postgres", privilege: "EXECUTE", grantable: false }, { grantee: "service_role", privilege: "EXECUTE", grantable: false }] },
  "public.claim_deliveries(text, text, integer, integer)": { oid: 102, ident: "claim_deliveries(text,text,integer,integer)", owner: "postgres",
    def: defOf("claim_deliveries(p_listener text, p_worker text, p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 120)", `-- PRODUCTION-ONLY-BODY-71b; perform '${SECRET}'; return null;`),
    acl: [{ grantee: "PUBLIC", privilege: "EXECUTE", grantable: false }, { grantee: "postgres", privilege: "EXECUTE", grantable: true }] },
  "public.remove_timeline_entry(uuid, text)": { oid: 103, ident: "remove_timeline_entry(uuid,text)", owner: "postgres",
    def: defOf("remove_timeline_entry(p_company uuid, p_key text)", `-- PRODUCTION-ONLY-BODY-71c; return null;`), acl: [{ grantee: "postgres", privilege: "EXECUTE", grantable: false }] },
});
function fakeClient({ unknownType = false, driftAfterCapture = false } = {}) {
  const st = { applied: false, queries: [], prod: PRODUCTION(), captured: false };
  for (const v of Object.values(st.prod)) v.ident = v.ident.startsWith("public.") ? v.ident : `public.${v.ident}`;
  const byOid = (o) => Object.values(st.prod).find((v) => v.oid === Number(o));
  return {
    st,
    async query(sql, params = []) {
      st.queries.push(sql);
      if (/current_user::text u/.test(sql)) return { rows: [{ u: "postgres", su: false, v: "15.8" }] };
      if (sql === markerSelect(ITEM.marker)) return { rows: [{ applied: st.applied }] };
      if (sql === Q.types) return { rows: params[0].map((t) => ({ t, ok: !(unknownType && t === "uuid") })) };
      if (sql === Q.resolve) return { rows: [{ oid: st.prod[params[0]]?.oid ?? null }] };
      if (sql === Q.fn) { const v = byOid(params[0]); return { rows: v ? [{ ident: v.ident, def: v.def, owner: v.owner, kind: "f", acl_default: false }] : [] }; }
      if (sql === Q.acl) return { rows: byOid(params[0])?.acl || [] };
      if (sql === Q.overloads) return { rows: Object.entries(st.prod).filter(([k]) => k.startsWith(`${params[0]}.${params[1]}(`)).map(([, v]) => ({ ident: v.ident })) };
      if (sql === "begin" && driftAfterCapture && st.captured) st.prod["public.claim_deliveries(text, text, integer, integer)"].def += "-- someone edited it\n";
      if (sql === runnerBody(SQL71)) { st.applied = true; return { rows: [] }; }
      if (/from pg_proc p where p\.pronamespace in/.test(sql)) return { rows: [] };
      if (/query_to_xml/.test(sql)) return { rows: [] };
      if (/select extname from pg_extension/.test(sql)) return { rows: [{ extname: "plpgsql" }] };
      return { rows: [] };
    },
  };
}
const out = [];
const say = (m) => out.push(String(m));
let written = null;
{
  const c = fakeClient();
  const writeCapture = (captured) => {
    c.st.queries.push("<<capture written>>"); c.st.captured = true;
    written = writeCaptureFile(captured, { file: F71, sha256: ITEM.sha256, ref: PROD, at: "2026-11-01T12:00:00.000Z" }, { dir: tmp, say, isIgnored: () => true });
    return written.path;
  };
  const r = await applyOne(c, ITEM, SQL71, { say, writeCapture });
  const q = c.st.queries;
  const iCapBegin = q.indexOf("begin read only"), iFirstResolve = q.indexOf(Q.resolve), iWritten = q.indexOf("<<capture written>>");
  const iPre = q.indexOf("begin read only", iWritten), iBegin = q.indexOf("begin"), iBody = q.indexOf(runnerBody(SQL71)), iCommit = q.indexOf("commit");
  ok(iCapBegin >= 0 && iCapBegin < iFirstResolve && iFirstResolve < q.indexOf("rollback") && q.indexOf("rollback") < iWritten,
     "the capture reads production in its own READ ONLY transaction");
  ok(iWritten > 0 && iWritten < iPre && iPre < iBegin && iBegin < iBody && iBody < iCommit, "capture -> file written -> pre-snapshot -> begin -> the file -> commit");
  ok(q.slice(iBegin, iBody).filter((x) => x === Q.fn).length === 3, "inside the transaction, before the file, the captured functions are re-read to prove they did not change");
  ok(r.capturePath === written.path && r.captured === 4 && fs.existsSync(written.path), "applyOne reports the capture file", JSON.stringify({ p: r.capturePath, n: r.captured }));
  ok(path.basename(written.path) === captureFileName(F71, "2026-11-01T12:00:00.000Z") && /^apply-capture-0071_publishing_reliability-2026-11-01T12-00-00-000Z\.sql$/.test(path.basename(written.path)),
     "named apply-capture-<file>-<timestamp>.sql");
}

console.log("\n  APPLY: when the capture cannot be trusted, nothing is applied");
{
  const noBegin = (c) => !c.st.queries.includes("begin") && !c.st.queries.includes(runnerBody(SQL71));
  let c = fakeClient();
  is(await rejectsLike(() => applyOne(c, ITEM, SQL71, { say }), Refusal, /no capture writer was given/), "no capture writer: refused");
  ok(noBegin(c) && !c.st.queries.includes(Q.resolve), "...before reading anything or opening a transaction");
  c = fakeClient();
  is(await rejectsLike(() => applyOne(c, ITEM, SQL71, { say, writeCapture: () => { throw new Error("ENOSPC: no space left on device"); } }), Refusal, /capture .* failed, so nothing was applied \(ENOSPC/),
     "the capture file cannot be written: refused");
  ok(noBegin(c), "...and the migration's transaction never opened");
  c = fakeClient();
  is(await rejectsLike(() => applyOne(c, ITEM, SQL71, { say, writeCapture: () => "" }), Refusal, /returned no path/), "a writer that reports no file: refused");
  c = fakeClient({ unknownType: true });
  is(await rejectsLike(() => applyOne(c, ITEM, SQL71, { say, writeCapture: () => "x" }), Refusal, /does not know the type\(s\) uuid/), "production does not know an argument type (absent vs misparsed is unclear): refused");
  ok(noBegin(c), "...nothing applied");
  is(await rejectsLike(() => applyOne(fakeClient(), { ...ITEM, captures: null, captureError: "a DO block creates a function" }, SQL71, { say, writeCapture: () => "x" }), Refusal, /no exact list/),
     "an ambiguous item that reached applyOne anyway: refused");
  c = fakeClient({ driftAfterCapture: true });
  const d = path.join(tmp, "drift");
  let err; try { await applyOne(c, ITEM, SQL71, { say, writeCapture: (cap) => { c.st.captured = true; return writeCaptureFile(cap, { file: F71, sha256: ITEM.sha256, ref: PROD, at: "2026-11-01T12:30:00.000Z" }, { dir: d, say, isIgnored: () => true }).path; } }); } catch (e) { err = e; }
  ok(err && /changed between the capture and the apply; rolled back/.test(err.message) && !c.st.queries.includes(runnerBody(SQL71)) && !c.st.queries.includes("commit") && err.capturePath,
     "a captured function changes between capture and apply: rolled back before the file runs, the capture is kept", err && err.message);
}

console.log("\n  ROUND TRIP: the rollback file");
{
  const text = fs.readFileSync(written.path, "utf8");
  const { manifest, defs } = readCapture(text);
  const prod = Object.values(PRODUCTION()).map((v) => ({ ...v, ident: `public.${v.ident}` }));
  ok(manifest.file === F71 && manifest.sha256 === ITEM.sha256 && manifest.ref === PROD && manifest.functions.length === 4, "the manifest names the file, its sha256, the ref and all four targets");
  ok(prod.every((v) => defs[v.ident] === v.def.replace(/\s+$/, "")), "every captured definition parses back byte for byte (bodies are not redacted)");
  ok(text.includes(SECRET), "...a secret-like string in a body is kept in the file (redact nothing)");
  const absent = manifest.functions.filter((f) => !f.existed);
  ok(absent.length === 1 && absent[0].sig === "public.publication_delivery_status(uuid)" && /did not exist before 0071[^\n]*publication_delivery_status/.test(text) && !/\bdrop\s+function\b/i.test(text),
     "a function that did not exist is listed, not dropped (the repo rollback removes it)");
  ok(/grant execute on function public\.publish_publication\(uuid,uuid,timestamp with time zone\) to service_role;/.test(text)
     && /grant execute on function public\.claim_deliveries\(text,text,integer,integer\) to public;/.test(text)
     && /grant execute on function public\.claim_deliveries\(text,text,integer,integer\) to postgres with grant option;/.test(text),
     "the captured grants are restored after every current grant is revoked");
  ok(text.indexOf("$capture_acl$") > text.lastIndexOf("<<< end of captured definition") && /revoke all on function %s from %s/.test(text), "...definitions first, then the revoke-all, then the grants");
  ok(prod.every((v) => text.includes(`'${manifest.functions.find((f) => f.ident === v.ident).def_md5}'`)) && /raise exception 'capture rollback: % does not match the capture'/.test(text),
     "the file ends by checking every restored function against the captured md5, ACL and owner");
  const stmts = topLevelStatements(text);
  // A fake client cannot run SQL, so the staging check (scripts/capture-rollback-staging-check.mjs)
  // is what executes this file; these catch the class of bug it found offline.
  const generated = text.replace(/-- >>> captured definition[\s\S]*?-- <<< end of captured definition \d+/g, "");
  ok(!/\border\s+by\s+\d+\b/i.test(generated), "the generated SQL never orders by a position number (inside an aggregate that is the integer itself; with collate it fails)",
     (generated.match(/order\s+by\s+\d+[^\n]*/i) || [""])[0]);
  ok(!/\b\d+\s+collate\b/i.test(generated) && (generated.match(/\bcollate "C"/g) || []).length === manifest.functions.filter((f) => f.existed).length,
     "...and collate is applied only to a text key, once per restored function's ACL check");
  ok(stmts[0] === "begin" && stmts.at(-1) === "commit" && stmts.filter((s) => /^CREATE OR REPLACE FUNCTION/.test(s)).length === 3, "it is one transaction holding the three definitions as whole statements");
  const mode = fs.statSync(written.path).mode & 0o777;
  ok(mode === 0o600, `the file is mode 600 (got ${mode.toString(8)})`);
  is(throwsLike(() => writeCaptureFile([], { file: F71, sha256: "x", ref: PROD, at: "2026-11-01T12:00:00.000Z" }, { dir: tmp, isIgnored: () => true }), Error, /EEXIST/), "an existing capture file is never overwritten");
  const nd = path.join(tmp, "not-ignored");
  is(throwsLike(() => writeCaptureFile([], { file: F71, sha256: "x", ref: PROD, at: "t" }, { dir: nd, isIgnored: () => false }), Error, /not gitignored/), "a directory git does not ignore: refused");
  ok(!fs.existsSync(nd), "...and nothing was written there");
  ok(gitIgnores(path.join(CAPTURE_DIR, captureFileName(F71, "2026-11-01T12:00:00.000Z"))), `${CAPTURE_DIR}/ is gitignored in this repo`);
  is(throwsLike(() => readCapture(text.replace("PRODUCTION-ONLY-BODY-71c", "PRODUCTION-ONLY-BODY-71X")), Error, /does not match its md5/), "a capture file edited afterwards no longer parses");
}

console.log("\n  NO LEAK: bodies and secrets stay out of the output");
{
  const all = out.join("\n");
  ok(!/PRODUCTION-ONLY-BODY|\$function\$|LANGUAGE plpgsql/.test(all), "no function body reaches the output");
  ok(!all.includes(SECRET) && /claim_deliveries\(text,text,integer,integer\) holds secret-like string\(s\) \(stripe key x1\); kept in the file, not shown here/.test(all),
     "a secret-like string is reported by kind and count only", all.split("\n").filter((l) => /secret/.test(l)).join(" | "));
  ok(/capture: 3 existing, 1 new -> /.test(all), "the output gives counts and the file path");
  const jwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJyb2xlIjoic2VydmljZV9yb2xlIn0", "c2lnbmF0dXJlLW5vdC1yZWFs"].join(".");
  ok(secretFindings(`token := '${jwt}'; y := 'postgres://u:pw@h/db'`).map((f) => f.kind).join() === "jwt,connection string with password,assigned secret" && secretFindings("select 1").length === 0,
     "the scan recognises JWTs, connection strings and assigned secrets, and is quiet otherwise");
  const cli = fs.readFileSync("scripts/apply-migrations-production.mjs", "utf8");
  ok(!/console\.(log|error)\([^)]*\.def\b/.test(cli + fs.readFileSync("scripts/_production-migrations.mjs", "utf8")), "the runner never prints a captured .def");
  ok(cli.indexOf("gitIgnores(path.join(CAPTURE_DIR") > 0 && cli.indexOf("gitIgnores(path.join(CAPTURE_DIR") < cli.lastIndexOf("readDsn(process.env"), "the CLI checks the capture directory is gitignored before reading the DSN");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  capture-on-apply (offline): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
