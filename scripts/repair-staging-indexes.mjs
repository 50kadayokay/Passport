// Repair the STAGING indexes the runner's old non-transactional split skipped
// (found 2026-10-31, a12): 0050b documents_fts_idx, updates_fts_idx and
// 0065c idx_post_likes_slug_key.
//   node scripts/repair-staging-indexes.mjs            # dry run: what would happen
//   node scripts/repair-staging-indexes.mjs --apply    # do it
//
// NOT a migration re-run. Each statement is taken VERBATIM from its migration
// file (bareStatements) and run on its own, CONCURRENTLY, outside a
// transaction. Idempotent and guarded:
//   * staging allowlist (production ref refused);
//   * an index that already exists AND is valid is skipped;
//   * one that exists but is INVALID stops the run (drop-and-retry is a
//     decision, not an automatic step);
//   * after each build: indisvalid must be true and the stored definition must
//     carry the migration's columns/expression; database egress is compared
//     before and after (an index cannot add any, but the check is cheap).
// Prints no secrets.

import fs from "node:fs";
import pg from "pg";
import { bareStatements, inspectDatabase, newEgress } from "./_db-egress.mjs";

const TARGETS = { documents_fts_idx: "0050b", updates_fts_idx: "0050b", idx_post_likes_slug_key: "0065c" };
const APPLY = process.argv.includes("--apply");
const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the allowlisted staging project."); process.exit(2); }

const stmts = [];
for (const f of fs.readdirSync("supabase/migrations").filter((x) => /^(0050b|0065c)_/.test(x))) {
  for (const s of bareStatements(fs.readFileSync(`supabase/migrations/${f}`, "utf8"))) {
    const m = /create\s+index\s+concurrently\s+if\s+not\s+exists\s+(\w+)\s+on\s+public\.(\w+)/i.exec(s);
    if (m && TARGETS[m[1]]) stmts.push({ name: m[1], table: m[2], file: f, sql: s });
  }
}
if (stmts.length !== Object.keys(TARGETS).length) { console.error(`  expected ${Object.keys(TARGETS).length} statements, found ${stmts.length}`); process.exit(3); }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const state = async (name) => (await c.query(`select i.indisvalid valid, pg_get_indexdef(i.indexrelid) def from pg_index i where i.indexrelid = to_regclass('public.' || $1)`, [name])).rows[0] || null;
console.log(`\n  ${APPLY ? "REPAIRING" : "DRY RUN"} on staging (${stmts.length} indexes, statements verbatim from their migrations)`);
let failed = 0;
for (const t of stmts) {
  const before = await state(t.name);
  if (before && before.valid) { console.log(`   ${t.name.padEnd(26)} exists and is valid -> skipped`); continue; }
  if (before && !before.valid) { console.log(`   ${t.name.padEnd(26)} exists but is INVALID -> stopping (decide: drop and retry)`); failed++; break; }
  if (!APPLY) { console.log(`   ${t.name.padEnd(26)} missing -> would run (${t.file}): ${t.sql.replace(/\s+/g, " ").slice(0, 110)}…`); continue; }
  const eg0 = await inspectDatabase(c);
  await c.query(t.sql);   // CONCURRENTLY: autocommit, no transaction
  const added = newEgress(eg0, await inspectDatabase(c));
  const after = await state(t.name);
  const defOk = after && (t.name.endsWith("_fts_idx") ? /usinggin\(to_tsvector\('english'/.test(after.def.replace(/\s+/g, "").toLowerCase().replace(/::regconfig|::text/g, "")) : /\(company_slug,post_key\)/.test(after.def.replace(/\s+/g, "").toLowerCase()));
  const good = after && after.valid && defOk && !added.length;
  console.log(`   ${t.name.padEnd(26)} ${good ? "CREATED, valid" : "PROBLEM"}${after ? ` -- ${after.def}` : ""}${added.length ? ` egress: ${added.join("; ")}` : ""}`);
  if (!good) failed++;
}
await c.end();
console.log(failed ? `\n  ${failed} problem(s); nothing further was attempted.\n` : "\n  done.\n");
process.exit(failed ? 1 : 0);
