// Every checkpoint the PRODUCTION runner will check, read on STAGING, where
// every pending migration is applied: each must read true. READ ONLY.
//   node scripts/production-markers-staging-check.mjs
//
// The runner refuses a file whose marker already reads applied and rolls back
// one whose marker does not read applied after it. A marker that a LATER file
// turns false (0077's under 0092, before S1's fix) passes each step in order
// but lets the runner re-apply the file over its successor once the apply log
// is gone. Staging holds the end state, so it shows exactly that case.
import fs from "node:fs";
import pg from "pg";
import { DEFAULT_AUDIT, loadRecord, parseQ01Markers, buildPlan } from "./_production-migrations.mjs";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }

const record = loadRecord(DEFAULT_AUDIT);
const plan = buildPlan({ files: fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")), record, log: [],
  q01Markers: parseQ01Markers(fs.readFileSync(record.query.split(" ")[0], "utf8")) });

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: "production-markers-staging-check" });
await c.connect();
try {
  await c.query("begin read only");
  await c.query("set local statement_timeout = '30s'");
  console.log(`\n  ${plan.items.length} runner checkpoints on staging (every pending migration applied there)`);
  for (const it of plan.items) {
    if (!it.checkpoint) { ok(false, `${it.step}. ${it.file}: no checkpoint`); continue; }
    try { const v = (await c.query(it.checkpoint)).rows[0].applied; ok(v === true, `${it.step}. ${it.file} reads applied`, `read ${v}`); }
    catch (e) { ok(false, `${it.step}. ${it.file}`, e.message); }
  }
} finally {
  await c.query("rollback").catch(() => {});
  await c.end();
}
console.log(`\n  production-markers-staging-check (staging, read only): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
