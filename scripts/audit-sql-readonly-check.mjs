// Prove that the files in supabase/audit/ are read-only before anyone runs them
// against production.
//   node scripts/audit-sql-readonly-check.mjs
//
// WHY THIS EXISTS
// ---------------
// An audit script is handed to a human and pasted into a production SQL editor.
// "It's read-only, trust me" is not a control -- a single stray UPDATE in a file
// of catalog queries would be both easy to miss on review and irreversible in
// effect. This asserts it mechanically instead.
//
// Two independent checks per statement:
//   1. it must OPEN with select or with (a CTE) -- nothing else is permitted;
//   2. it must contain no mutating keyword at statement level, even if the
//      statement also happens to start with select. `select ... ; delete ...`
//      only looks like one statement if you split naively, so splitting is done
//      on semicolons OUTSIDE string literals, dollar-quotes and comments.
//
// It also flags catalog columns that can carry a SECRET -- function bodies,
// column defaults, policy expressions -- so the file's own header has to warn
// about each one it uses. The point is not that those columns are forbidden;
// it is that a reader must be told to skim them before pasting output back.

import fs from "node:fs";

const DIR = "supabase/audit";
const MARKER = /^--\s*READ-ONLY\./mi;

// The check enforces a DECLARED contract rather than imposing one. A file states
// `-- READ-ONLY.` in its header to opt in; this then holds it to that claim.
//
// That distinction matters here, because supabase/audit/ legitimately contains
// scripts that mutate on purpose -- phase3d_audit.sql and
// probe_service_role_path.sql create and tear down rows to probe behaviour, and
// 0000_baseline.scaffold.sql is a migration scaffold. Flagging those as unsafe
// would be wrong, and would make `npm test` permanently red for files that are
// doing exactly what they say.
const explicit = process.argv.slice(2);
const all = explicit.length
  ? explicit
  : fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).map((f) => `${DIR}/${f}`);
const files = all.filter((f) => explicit.length || MARKER.test(fs.readFileSync(f, "utf8")));
const skipped = all.filter((f) => !files.includes(f));

// Anything that writes, changes structure, or grants. `set` is included because
// `set role` and `set session_replication_role` both change behaviour.
const MUTATING = [
  "insert", "update", "delete", "truncate", "drop", "alter", "create",
  "grant", "revoke", "comment", "refresh", "reindex", "vacuum", "analyze",
  "cluster", "copy", "call", "do", "set", "reset", "lock", "notify",
  "commit", "rollback", "begin", "savepoint", "security label", "import",
];

// Catalog functions/columns whose output can contain a literal credential.
const SECRET_BEARING = {
  "pg_get_functiondef": "function source (a SECURITY DEFINER body may hold a key)",
  "pg_get_expr": "column defaults (a default may hold a literal)",
  "qual": "policy USING expressions",
  "with_check": "policy WITH CHECK expressions",
  "proconfig": "per-function settings",
  "allowed_mime_types": "bucket config (not sensitive, listed for completeness)",
};

// Strip comments and string/dollar-quoted literals so keyword and semicolon
// detection cannot be fooled by text inside a quoted string.
function blank(sql) {
  let out = "", i = 0;
  while (i < sql.length) {
    if (sql.startsWith("--", i)) { const n = sql.indexOf("\n", i); const end = n === -1 ? sql.length : n; out += " ".repeat(end - i); i = end; continue; }
    if (sql.startsWith("/*", i)) { const n = sql.indexOf("*/", i); const end = n === -1 ? sql.length : n + 2; out += " ".repeat(end - i); i = end; continue; }
    if (sql[i] === "'") { let j = i + 1; while (j < sql.length) { if (sql[j] === "'" && sql[j + 1] === "'") j += 2; else if (sql[j] === "'") { j++; break; } else j++; } out += " ".repeat(j - i); i = j; continue; }
    if (sql[i] === '"') { let j = i + 1; while (j < sql.length && sql[j] !== '"') j++; j++; out += sql.slice(i, Math.min(j, sql.length)); i = j; continue; }
    const dq = /^\$([a-z0-9_]*)\$/i.exec(sql.slice(i));
    if (dq) { const tag = dq[0]; const n = sql.indexOf(tag, i + tag.length); const end = n === -1 ? sql.length : n + tag.length; out += " ".repeat(end - i); i = end; continue; }
    out += sql[i]; i++;
  }
  return out;
}

let pass = 0, fail = 0;
const problems = [];

for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  const masked = blank(raw);

  // Split on semicolons that survive masking, carrying positions so we can
  // report against the real text.
  const stmts = [];
  let start = 0;
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === ";") { stmts.push([start, i]); start = i + 1; }
  }
  if (masked.slice(start).trim()) stmts.push([start, masked.length]);

  let checked = 0;
  for (const [a, b] of stmts) {
    const m = masked.slice(a, b);
    if (!m.trim()) continue;
    checked++;
    const line = raw.slice(0, a).split("\n").length;
    const firstWord = (m.trim().split(/\s+/)[0] || "").toLowerCase();

    if (firstWord !== "select" && firstWord !== "with") {
      problems.push(`${file}:${line}  statement starts with "${firstWord}", not select/with`);
      fail++; continue;
    }
    const hit = MUTATING.find((kw) => new RegExp(`(^|[^a-z_])${kw}([^a-z_]|$)`, "i").test(m));
    if (hit) {
      problems.push(`${file}:${line}  contains mutating keyword "${hit}"`);
      fail++; continue;
    }
    pass++;
  }

  // Every secret-bearing column used must be warned about in the file header.
  const header = raw.slice(0, raw.indexOf("\n-- ═") === -1 ? 4000 : raw.indexOf("\n-- ═")).toLowerCase();
  for (const [needle, why] of Object.entries(SECRET_BEARING)) {
    if (!masked.toLowerCase().includes(needle)) continue;
    const warned = /redact|credential|secret|skim|sensitive/.test(header);
    if (!warned) {
      problems.push(`${file}  uses ${needle} (${why}) but the header does not warn the reader to skim for credentials`);
      fail++;
    }
  }

  console.log(`  ${file}`);
  console.log(`     ${checked} statements, all read-only: ${problems.some((p) => p.startsWith(file)) ? "NO" : "yes"}`);
}

for (const f of skipped)
  console.log(`  ${f}\n     skipped — does not declare "-- READ-ONLY." (mutating by design)`);

if (problems.length) {
  console.error("\n  PROBLEMS");
  for (const p of problems) console.error("     ✗ " + p);
}
console.log(`\n  ${pass} statements verified read-only across ${files.length} declared file${files.length === 1 ? "" : "s"}` +
            `, ${fail} problem${fail === 1 ? "" : "s"}` +
            (skipped.length ? `, ${skipped.length} undeclared file${skipped.length === 1 ? "" : "s"} skipped` : ""));
console.log(fail === 0
  ? "  SAFE TO RUN AGAINST PRODUCTION — catalog reads only, reader warned about secret-bearing columns.\n"
  : "  DO NOT RUN until the problems above are resolved.\n");
process.exit(fail ? 1 : 0);
