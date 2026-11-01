// The production rollout plan's migration list cannot drift from the manifest.
//   node scripts/rollout-plan-manifest-test.mjs
//
// OFFLINE. Reads docs/PRODUCTION-ROLLOUT-PLAN.md (the table between the
// migration-order markers) and scripts/_migration-manifest.mjs, and checks:
//   - the plan lists exactly the manifest's PENDING files, once each, in a
//     numbered order, and nothing DEFERRED or already applied
//   - every row comes after what it needs (manifest PREREQUISITES, plus the
//     dependencies the plan's review found that the manifest does not yet record)
//   - every file exists; every row that runs has a rollback file; a CONCURRENTLY
//     file is marked to run outside a transaction, and no other file is
//   - phases never go backwards down the list
//   - every environment variable the plan names is one the API actually reads,
//     and SITE_REVALIDATE_SECRET is among those set before Phase 1 ends
import fs from "node:fs";
import { PENDING, DEFERRED, PREREQUISITES } from "./_migration-manifest.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const PLAN = "docs/PRODUCTION-ROLLOUT-PLAN.md";
const plan = fs.readFileSync(PLAN, "utf8");
const block = (/<!-- migration-order:start -->([\s\S]*?)<!-- migration-order:end -->/.exec(plan) || [])[1] || "";
const rows = block.split("\n").filter((l) => /^\|\s*\d+\s*\|/.test(l)).map((l) => {
  const c = l.split("|").slice(1, -1).map((s) => s.trim());
  return { n: Number(c[0]), file: (/`([^`]+\.sql)`/.exec(c[1]) || [])[1], phase: c[2], runs: c[3], needs: c[4], rollback: c[5] };
});
const files = rows.map((r) => r.file);
const pending = Object.keys(PENDING);
const migrations = new Set(fs.readdirSync("supabase/migrations"));

// Found by the production-shape review (plan, R2/R5); move to the manifest's
// PREREQUISITES when S4 registers them, and delete from here.
const REVIEW_PREREQUISITES = {
  "0088_content_fanout.sql": ["0071_publishing_reliability.sql"],
  "0087_audience_events.sql": ["0071_publishing_reliability.sql"],
};

console.log("\n  PLAN vs MANIFEST");
ok(rows.length > 0 && rows.every((r) => r.file), `the plan's migration table parses (${rows.length} rows)`);
ok(rows.every((r, i) => r.n === i), "rows are numbered 0..n in order");
ok(new Set(files).size === files.length, "no migration is listed twice", files.filter((f, i) => files.indexOf(f) !== i).join(", "));
const missing = pending.filter((f) => !files.includes(f));
const extra = files.filter((f) => !pending.includes(f));
ok(missing.length === 0, `every PENDING migration is in the plan (${pending.length})`, `missing: ${missing.join(", ")}`);
ok(extra.length === 0, "the plan lists nothing that is not PENDING (no deferred or applied file)", `extra: ${extra.join(", ")}`);
ok(!files.some((f) => f in DEFERRED), "no DEFERRED migration is in the plan");
ok(files.every((f) => migrations.has(f)), "every listed file exists in supabase/migrations", files.filter((f) => !migrations.has(f)).join(", "));

console.log("\n  ORDER");
const pos = Object.fromEntries(files.map((f, i) => [f, i]));
const prereq = (f) => [...(PREREQUISITES[f] || []), ...(REVIEW_PREREQUISITES[f] || [])];
const late = [];
for (const f of files) for (const p of prereq(f)) {
  if (p in DEFERRED) late.push(`${f} needs deferred ${p}`);
  else if (p in pos && pos[p] > pos[f]) late.push(`${f} before ${p}`);
}
ok(late.length === 0, "every row comes after what it needs (manifest + review prerequisites)", late.join("; "));
const shortName = (f) => f.replace(/_.*$/, "");
const needsCol = [];
for (const r of rows) for (const p of prereq(r.file).filter((p) => p in pos)) if (!r.needs.includes(shortName(p))) needsCol.push(`${shortName(r.file)} omits ${shortName(p)}`);
ok(needsCol.length === 0, "each row's Needs column names its pending prerequisites", needsCol.join("; "));
const PHASES = ["—", "3", "4", "5", "5b"];
const phaseIdx = rows.map((r) => PHASES.indexOf(r.phase));
ok(phaseIdx.every((p) => p >= 0) && phaseIdx.every((p, i) => i === 0 || p >= phaseIdx[i - 1]), "phases never go backwards", rows.map((r) => r.phase).join(" "));
const i58 = pos["0058_close_public_insert.sql"], i77 = pos["0077_listing_reports_installed_app_compat.sql"];
ok(i77 === i58 + 1, "0077 runs immediately after 0058 (same session)");

console.log("\n  HOW EACH RUNS, AND ITS ROLLBACK");
const strip = (s) => s.replace(/--[^\n]*/g, "");
const runs = rows.filter((r) => !/do not run/i.test(r.runs));
ok(rows.filter((r) => /do not run/i.test(r.runs)).every((r) => r.file === "0000_baseline.sql"), "only the baseline is marked 'do not run'");
const concurrent = runs.filter((r) => migrations.has(r.file) && /create\s+(unique\s+)?index\s+concurrently/i.test(strip(fs.readFileSync(`supabase/migrations/${r.file}`, "utf8"))));
ok(concurrent.length > 0 && concurrent.every((r) => /outside a transaction/i.test(r.runs)), `CONCURRENTLY files are marked outside a transaction (${concurrent.map((r) => shortName(r.file)).join(", ")})`);
ok(runs.filter((r) => /outside a transaction/i.test(r.runs)).every((r) => concurrent.includes(r)), "no other file is marked outside a transaction");
const noRollback = runs.filter((r) => !fs.existsSync(`supabase/rollbacks/${r.file.replace(/\.sql$/, ".rollback.sql")}`));
ok(noRollback.length === 0, `every migration that runs has a rollback file (${runs.length})`, noRollback.map((r) => r.file).join(", "));

console.log("\n  ENVIRONMENT (names only)");
const apiSrc = fs.readdirSync("api").filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(`api/${f}`, "utf8")).join("\n");
const envSection = (/## Environment variables[\s\S]*?(?=\n## )/.exec(plan) || [""])[0];
const named = [...new Set([...envSection.matchAll(/`([A-Z][A-Z0-9_]{2,})(?:=[^`]*)?`/g)].map((m) => m[1]))].filter((n) => !/^VITE_/.test(n));
const unread = named.filter((n) => !new RegExp(`process\\.env\\.${n}\\b`).test(apiSrc) && !/^MINEEX_BRIEF_/.test(n));
ok(named.length > 10 && unread.length === 0, `every variable the plan names is read by api/ (${named.length})`, `not read: ${unread.join(", ")}`);
const before = (/Set before or with Phase 1:([\s\S]*?)Set for Phase 6/.exec(envSection) || [, ""])[1];
ok(/`SITE_REVALIDATE_SECRET`/.test(before) && /before any company configures a `revalidate_url`/i.test(envSection), "SITE_REVALIDATE_SECRET is set before Phase 1 ends, before any revalidate_url");
ok(/Must NOT be set in production[\s\S]{0,400}`MINEEX_ENV`/.test(envSection), "MINEEX_ENV is listed as must-not-set in production");
ok(/outbox-drain[\s\S]{0,200}stays inactive until it is explicitly approved/i.test(plan), "the cron section keeps outbox-drain inactive until approved");

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
