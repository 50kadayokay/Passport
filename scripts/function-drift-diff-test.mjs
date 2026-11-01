// scripts/function-drift-diff.mjs diffs every drifted function, including the
// four that pending migrations replace. OFFLINE: a synthetic results file built
// from the repo's own bodies (no database, no production output).
//   node scripts/function-drift-diff-test.mjs
//
// Checks:
//   - the four-function source query (S4's production_function_source_four_*,
//     when present) reads exactly the drifted functions a PENDING migration
//     replaces with create-or-replace
//   - the diff script's REPLACED_BY map names the pending migration that
//     overwrites each body (derived here from supabase/migrations + the manifest)
//   - the script skips rows without source (the runner's self-test row, Q02), accepts "public."-qualified signatures, reports
//     an unchanged body as identical, a changed one by its differing lines, and
//     redacts a secret-shaped value before printing or saving anything, and
//     keeps source off the terminal unless --show is passed
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { PENDING } from "./_migration-manifest.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const SCRIPT = fs.readFileSync("scripts/function-drift-diff.mjs", "utf8");
const FIVE = {
  accept_company_invitation: "public.accept_company_invitation(text)",
  publish_publication: "public.publish_publication(uuid, uuid, timestamp with time zone)",
  revise_publication: "public.revise_publication(uuid, text, text, text, uuid)",
  claim_deliveries: "public.claim_deliveries(text, text, integer, integer)",
  company_go_live: "public.company_go_live(uuid, text)",
};

const migs = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
const replacedByPending = {};
for (const f of migs.filter((f) => f in PENDING)) {
  const sql = fs.readFileSync(`supabase/migrations/${f}`, "utf8").replace(/--[^\n]*/g, "");
  for (const name of Object.keys(FIVE)) if (new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, "i").test(sql)) replacedByPending[name] = f.slice(0, 4);
}
console.log("\n  THE QUERY");
ok(Object.keys(replacedByPending).length === 4 && !("revise_publication" in replacedByPending), `four drifted functions are replaced by a pending migration (${JSON.stringify(replacedByPending)})`);
const FOUR = fs.readdirSync("supabase/audit").find((f) => /^production_function_source_four_.*\.sql$/.test(f));
if (FOUR) {
  const read = [...fs.readFileSync(`supabase/audit/${FOUR}`, "utf8").matchAll(/'(public\.[a-z_]+\([^)]*\))'/g)].map((m) => m[1]);
  ok(read.length === 4 && Object.keys(replacedByPending).every((n) => read.includes(FIVE[n])), `${FOUR} reads exactly those four`, read.join(" | "));
} else console.log("  - production_function_source_four_*.sql not on this branch yet (S4's file); query check skipped");

console.log("\n  THE DIFF SCRIPT (scripts/function-drift-diff.mjs)");
const map = JSON.parse((/const REPLACED_BY = (\{[^}]*\})/.exec(SCRIPT) || [, "{}"])[1].replace(/(\w+):/g, '"$1":'));
ok(JSON.stringify(Object.entries(map).sort()) === JSON.stringify(Object.entries(replacedByPending).sort()), "its REPLACED_BY map matches the pending migrations", JSON.stringify(map));

// The newest repo body applied BEFORE any pending migration: what production should hold.
function preBody(name) {
  let body = null;
  for (const f of migs.filter((f) => !(f in PENDING) || f === "0000_baseline.sql")) {
    const sql = fs.readFileSync(`supabase/migrations/${f}`, "utf8");
    const m = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, "gi").exec(sql);
    if (!m) continue;
    const rest = sql.slice(m.index), tag = (rest.match(/\bas\s+(\$[A-Za-z_]*\$)/i) || [])[1];
    const a = rest.indexOf(tag); body = rest.slice(a + tag.length, rest.indexOf(tag, a + tag.length));
  }
  return body;
}
const SECRET = "sk_live_" + "Q".repeat(24);
const rows = Object.entries(FIVE).map(([name, sig], i) => {
  let body = preBody(name);
  if (name === "company_go_live") body = body.replace(/\bbegin\b/i, "begin\n  perform 1; -- drift\n  perform 'x';");
  if (name === "claim_deliveries") body = body.replace(/\bbegin\b/i, `begin\n  perform '${SECRET}';`);
  return { q: "Q01", signature: i % 2 ? sig : sig.replace(/^public\./, ""), owner: "postgres", security_definer: true, config: "search_path=public", digest: "d", definition: `CREATE OR REPLACE FUNCTION ${sig}\n LANGUAGE plpgsql\nAS $function$${body}$function$\n` };
});
fs.mkdirSync("supabase/audit/results", { recursive: true });
const fixture = `supabase/audit/results/function-drift-diff-test-${process.pid}.json`;
fs.writeFileSync(fixture, JSON.stringify({ target: "fixture", results: [{ label: "self-test", rows: [{ write_refused_by_server: true }] }, { label: "Q01", rows }, { label: "Q02", rows: [{ q: "Q02", table_name: "posts", exists_in_db: true }] }] }));
const run = spawnSync(process.execPath, ["scripts/function-drift-diff.mjs", fixture], { encoding: "utf8" });
const out = run.stdout + run.stderr;
const report = fs.existsSync(fixture.replace(/\.json$/, ".drift.txt")) ? fs.readFileSync(fixture.replace(/\.json$/, ".drift.txt"), "utf8") : "";

ok(run.status === 0 && /5 function\(s\) compared/.test(out), "it compares all five and skips the self-test and Q02 rows", out.slice(-300));
const section = (name) => (new RegExp(`=== (?:public\\.)?${name}\\([\\s\\S]*?(?=\\n=== |\\n  \\d+ function)`).exec(out) || [""])[0];
for (const name of ["accept_company_invitation", "publish_publication", "revise_publication"]) ok(/identical in substance to /.test(section(name)), `${name}: an unchanged body is reported identical`);
ok(/nearest: 0035_company_agreements_golive\.sql; differences:/.test(section("company_go_live")) && /\+perform 'x';/.test(report), "company_go_live: the drifted line is diffed against its nearest repo version, in the saved report");
ok(!/^\s*[+-](?![+-])/m.test(out) && !/perform 'x'/.test(out), "by default the terminal shows no source: no diff line reaches stdout");
const shown = spawnSync(process.execPath, ["scripts/function-drift-diff.mjs", fixture, "--show"], { encoding: "utf8" }).stdout;
ok(/\+perform 'x';/.test(shown) && !shown.includes(SECRET), "--show prints the redacted diffs");
for (const [name, mig] of Object.entries(replacedByPending)) ok(section(name).includes(`pending ${mig} replaces this body`), `${name}: names ${mig} as the migration that would overwrite it`);
ok(/no pending migration replaces it/.test(section("revise_publication")), "revise_publication: no pending migration replaces it");
ok(!out.includes(SECRET) && !report.includes(SECRET) && /\[REDACTED-stripe\]/.test(report) && /1 secret-shaped value\(s\) redacted/.test(out), "a secret-shaped value is redacted from the printout and the saved report");

for (const f of [fixture, fixture.replace(/\.json$/, ".drift.txt")]) fs.rmSync(f, { force: true });
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
