// Run a READ-ONLY audit file and save the results as JSON.
//
//   STAGING dry run (validates the queries, safe):
//     node scripts/production-audit-run.mjs --target staging  <file.sql> <out.json>
//   PRODUCTION (only after explicit approval; the operator supplies the DSN; set
//   PRODUCTION_DB_CA_FILE to Supabase's CA certificate to verify the server):
//     PRODUCTION_DATABASE_URL=... node scripts/production-audit-run.mjs --target production <file.sql> <out.json>
//
// Two independent safety layers:
//   1. CONTENT: refuses to run a file that scripts/audit-sql-readonly-check.mjs
//      does not pass (every statement SELECT/WITH, no mutating keyword).
//   2. SERVER: the whole run is one READ ONLY transaction
//      (default_transaction_read_only + BEGIN READ ONLY), ended by ROLLBACK, with
//      statement_timeout 15 s and lock_timeout 2 s. PostgreSQL itself refuses any
//      write inside it -- even one that slipped past review.
// Targets are kept apart: production mode reads ONLY PRODUCTION_DATABASE_URL,
// requires its host to name the production project and refuses anything
// naming staging; it never opens supabase/staging/*. Staging mode is the
// reverse. The DSN is never printed. Output: per statement, its label, column
// names and rows (the audit returns counts, booleans, names and md5 digests).
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import pg from "pg";

const PROD = "rvptronniomlqumjhyrr", STAGING = "jmljfovtfxcdhjmtlnva";
const args = process.argv.slice(2);
const target = args[args.indexOf("--target") + 1];
const [file, out] = args.filter((a, i) => a !== "--target" && args[i - 1] !== "--target");
if (!["staging", "production"].includes(target) || !file || !out) {
  console.error("usage: --target staging|production <file.sql> <out.json>"); process.exit(2);
}

let url;
if (target === "production") {
  url = (process.env.PRODUCTION_DATABASE_URL || "").trim();
  if (!url) { console.error("  PRODUCTION_DATABASE_URL is not set."); process.exit(2); }
  if (!url.includes(PROD) || url.includes(STAGING)) { console.error("  REFUSING: the DSN does not name the production project only."); process.exit(2); }
} else {
  url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
  if (!url.includes(STAGING) || url.includes(PROD)) { console.error("  REFUSING: not the staging project."); process.exit(2); }
}

// Never let a connection string reach the terminal, even inside an error.
const scrub = (msg) => String(msg || "").replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://[redacted]").replace(/(password|pwd)=[^\s&]+/gi, "$1=[redacted]");
process.on("unhandledRejection", (e) => { console.error("  failed:", scrub(e && e.message)); process.exit(1); });
process.on("uncaughtException", (e) => { console.error("  failed:", scrub(e && e.message)); process.exit(1); });

// Layer 1: the content check.
const chk = spawnSync(process.execPath, ["scripts/audit-sql-readonly-check.mjs", file], { encoding: "utf8" });
if (chk.status !== 0 || !/0 problems/.test(chk.stdout)) { console.error("  REFUSING: the file did not pass the read-only check.\n" + chk.stdout + chk.stderr); process.exit(3); }
const approved = Number((chk.stdout.match(/(\d+) statements verified read-only/) || [])[1] || -1);

// Statements: split on semicolons at line ends (the audit files keep one
// statement per block and no semicolons inside literals; the checker above
// already proved each piece is a SELECT/WITH).
const pieces = fs.readFileSync(file, "utf8")
  .split(/;\s*\n/).map((s) => s.replace(/^\s*(--[^\n]*\n\s*)*/g, "").trim()).filter(Boolean);
const statements = pieces.filter((s) => /^(select|with)\b/i.test(s));
// Run EXACTLY what the checker approved: nothing dropped silently, nothing extra.
if (statements.length !== pieces.length || statements.length !== approved) {
  console.error(`  REFUSING: ${pieces.length} statements found, ${statements.length} are SELECT/WITH, the checker approved ${approved}.`); process.exit(3);
}

// PRODUCTION_DB_CA_FILE (Supabase's CA) verifies the production server, as in the migration runner.
const caFile = target === "production" ? (process.env.PRODUCTION_DB_CA_FILE || "").trim() : "";
if (target === "production" && !caFile) console.log("  note: PRODUCTION_DB_CA_FILE not set; TLS is not verifying the server certificate");
const ssl = caFile ? { ca: fs.readFileSync(caFile, "utf8"), rejectUnauthorized: true } : { rejectUnauthorized: false };
const c = new pg.Client({ connectionString: url, ssl, application_name: "mineex-readonly-audit" });
try { await c.connect(); }
catch (e) { console.error(`  could not connect (${e.code || "error"}): ${scrub(e.message)}`); process.exit(1); }
const results = [];
try {
  await c.query("set session characteristics as transaction read only");
  await c.query("set statement_timeout = '15s'");
  await c.query("set lock_timeout = '2s'");
  await c.query("begin read only");
  const ro = (await c.query("show transaction_read_only")).rows[0].transaction_read_only;
  if (ro !== "on") throw new Error("transaction is not read-only; aborting before any audit query");
  if (target === "staging" && args.includes("--prove-readonly")) {
    // Staging only: show the server refuses a write inside this transaction.
    await c.query("savepoint probe");
    let refused = false;
    try { await c.query("update public.companies set name = name where false"); } catch (e) { refused = /read-only transaction/.test(e.message); }
    await c.query("rollback to savepoint probe");
    results.push({ label: "self-test", rows: [{ write_refused_by_server: refused }] });
  }
  for (const sql of statements) {
    const label = (sql.match(/'(Q\d+b?)'/) || [])[1] || "?";
    await c.query("savepoint s");
    try {
      const r = await c.query(sql);
      results.push({ label, columns: r.fields.map((f) => f.name), rows: r.rows });
      await c.query("release savepoint s");
    } catch (e) {
      await c.query("rollback to savepoint s");
      results.push({ label, error: e.message.slice(0, 200) });
    }
  }
} finally {
  await c.query("rollback").catch(() => {});
  await c.end();
}
// Sanitise before anything is written: the audit returns counts, names and md5
// digests, so an email / token / URL / DSN-shaped value means something is
// wrong. Redact it and say so rather than save it.
let text = JSON.stringify({ target, file, at: new Date().toISOString(), read_only_transaction: true, ended_with: "ROLLBACK", results }, null, 1);
const patterns = { email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, jwt: /eyJ[A-Za-z0-9_-]{20,}/g, url: /https?:\/\/[^\s"]+/g, dsn: /postgres(?:ql)?:\/\/[^\s"]+/gi };
const found = {};
for (const [k, re] of Object.entries(patterns)) { const n = (text.match(re) || []).length; if (n) { found[k] = n; text = text.replace(re, `[redacted-${k}]`); } }
fs.writeFileSync(out, text);
console.log(Object.keys(found).length ? `  WARNING: redacted ${JSON.stringify(found)} from the output -- review before sharing.` : "  output scan: no emails, tokens, URLs or connection strings.");
console.log(`  ${target}: ${results.filter((r) => !r.error).length} statements answered, ${results.filter((r) => r.error).length} errors -> ${out}`);
for (const r of results.filter((r) => r.error)) console.log(`    ${r.label}: ${r.error}`);
