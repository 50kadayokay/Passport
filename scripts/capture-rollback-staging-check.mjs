// node scripts/capture-rollback-staging-check.mjs -- S4, staging. Proves capture-on-apply rollbacks are production-exact:
// plants production's bodies (from the LOCAL gitignored source audit), applies 0071/0072/0076 in order, runs each
// captured rollback, compares digests. One transaction, always ROLLBACK. Prints booleans and md5s only.
// Needs supabase/audit/results/production-function-source-four-2026-11-01.json; stop the staging API server first (lock contention).
import fs from "node:fs"; import crypto from "node:crypto"; import pg from "pg"; import { runnerBody } from "./_db-egress.mjs";
import { functionTargets, captureFunctions, formatCaptureRollback, secretFindings } from "./_function-capture.mjs";
const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (!url.includes("jmljfovtfxcdhjmtlnva") || url.includes("rvptronniomlqumjhyrr")) process.exit(2);
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const prod = JSON.parse(fs.readFileSync("supabase/audit/results/production-function-source-four-2026-11-01.json", "utf8")).results.find((r) => r.label === "Q01").rows;
const ref = JSON.parse(fs.readFileSync("supabase/audit/results/staging-repo-reference-pre-pending-2026-11-01.json", "utf8"));
const ORDER = JSON.parse(fs.readFileSync("scripts/migration-rollback-roundtrip.mjs", "utf8").match(/const ORDER = (\[[\s\S]*?\]);/)[1]);
const PENDING = ref.unwound.slice().reverse();          // forward order
const prep = (s) => { s = s.replace(/\bconcurrently\s+/gi, ""); return /\bbegin\s*;/i.test(s) ? runnerBody(s) : s; };
const TEST = new Set(["0071_publishing_reliability", "0072_profile_drafts", "0076_company_roles"]);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${m}`); };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } }); await c.connect();
// capture's own begin/rollback become a savepoint inside our transaction
const inner = { query: (s, a) => s === "begin read only" ? c.query("savepoint cap") : s === "rollback" ? c.query("rollback to savepoint cap") : c.query(s, a) };
const digest = async (sig) => (await c.query(`select md5(pg_get_functiondef(to_regprocedure('public.' || $1))) d`, [sig])).rows[0].d;
await c.query("begin");
try {
  for (const n of [...ORDER].reverse()) if (ref.unwound.includes(n)) await c.query(prep(fs.readFileSync(`supabase/rollbacks/${n}.rollback.sql`, "utf8")));
  for (const p of prod) await c.query(p.definition);                     // production's exact text, planted
  for (const p of prod) ok((await digest(p.signature)) === p.digest, `planted ${p.signature}: digest = production's`);
  for (const n of PENDING) {
    const sql = fs.readFileSync(`supabase/migrations/${n}.sql`, "utf8");
    if (!TEST.has(n)) { await c.query(prep(sql)); continue; }
    const targets = functionTargets(sql);
    const captured = await captureFunctions(inner, targets);
    const text = formatCaptureRollback(captured, { file: `${n}.sql`, sha256: crypto.createHash("sha256").update(sql).digest("hex"), ref: "staging-test", at: new Date().toISOString() });
    ok(secretFindings(text).length === 0, `${n}: captured ${captured.filter((x) => x.existed).length} function(s), no secret-like text`);
    const watched = prod.filter((p) => captured.some((x) => x.existed && x.ident === p.signature));
    await c.query(prep(sql));
    for (const p of watched) ok((await digest(p.signature)) !== p.digest, `${n} applied: ${p.signature} replaced`);
    await c.query("savepoint rb");
    await c.query(runnerBody(text));
    for (const p of watched) ok((await digest(p.signature)) === p.digest, `${n} captured rollback: ${p.signature} digest back to production's EXACTLY`);
    await c.query("rollback to savepoint rb");                           // continue forward with the migration applied
  }
} catch (e) { ok(false, `unexpected: ${e.message.slice(0, 160)}`); } finally { await c.query("rollback"); await c.end(); }
console.log(`\n  capture-on-apply staging round trip (rolled back): ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
