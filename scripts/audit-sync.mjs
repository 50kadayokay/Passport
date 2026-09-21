// Proves the isolated-schema audit tests the SAME code the migrations deploy.
//
// WHY THIS EXISTS
// ---------------
// supabase/audit/phase3d_audit.sql installs the Phase 3 write boundary and digest
// functions into an isolated schema so ~173 attacks can run against them. For that
// to mean anything, those installed definitions must be the ones 0042/0044 actually
// deploy -- not a hand-kept copy that resembles them.
//
// They were a hand-kept copy once. Diffing revealed three defects the audit was
// structurally incapable of finding, because the audited code did not contain them:
// a missing pg_temp in search_path, an entire untested write surface (inventory
// parts and notes), and two absent supplement validations. Every one of those was a
// real hole in the migration that 95/95 had certified as clean.
//
// So the audit's copies are GENERATED from the migrations by schema substitution,
// and this check asserts token-identity on every run. Drift becomes a failing test
// rather than a silent gap in the thing that is supposed to catch gaps.
//
//   node scripts/audit-sync.mjs           verify (exit 1 on drift)
//   node scripts/audit-sync.mjs --write   regenerate the audit from the migrations
import fs from "node:fs";

const MIG_RPC = "supabase/migrations/0044_persist_rpcs.sql";
const MIG_DIG = "supabase/migrations/0042_source_inventories.sql";
const AUDIT   = "supabase/audit/phase3d_audit.sql";
const SCHEMA  = "p3d_audit";

const read = (p) => fs.readFileSync(p, "utf8");

/** Text between the line matching `from` and the last `end $$;`/`end $fn$;` before `until`. */
const slice = (src, from, until, terminator) => {
  const L = src.split("\n");
  const a = L.findIndex((l) => from.test(l));
  const z = L.findIndex((l) => until.test(l));
  if (a < 0 || z < 0) throw new Error(`markers not found in source (${a}, ${z})`);
  let e = -1;
  for (let i = a; i < z; i++) if (L[i].trim() === terminator) e = i;
  if (e < 0) throw new Error(`terminator ${terminator} not found`);
  return L.slice(a, e + 1).join("\n");
};

/** public.* -> p3d_audit.*, and $$ -> $fn$ so the block nests safely in the audit file. */
const toAudit = (block) =>
  block
    .replace(/public\./g, `${SCHEMA}.`)
    .replace(/set search_path = public, pg_temp as \$\$/g, `set search_path = ${SCHEMA}, pg_temp as $fn$`)
    .replace(/^end \$\$;$/gm, "end $fn$;");

/** Collapse the cosmetic differences so only SEMANTIC drift can fail the check. */
const canon = (t) =>
  t.replace(new RegExp(`${SCHEMA}\\.`, "g"), "X.")
   .replace(/public\./g, "X.")
   .replace(/\$fn\$/g, "$$$$")
   .replace(new RegExp(`search_path = ${SCHEMA}, pg_temp`, "g"), "search_path = public, pg_temp");

/**
 * Column parity for the tables the generated RPCs read and write.
 *
 * The RPC bodies are generated, but the table definitions are not -- the audit
 * builds synthetic fixtures and uses shorter constraint names, so generating its
 * DDL wholesale would fight two legitimately different styles. What must not
 * differ is the COLUMN SET: a column the migration has and the audit lacks means
 * the generated RPC writes a column the audit cannot store, and a column the audit
 * has alone means the audit tests something that will not exist in production.
 */
const TABLE_COLUMNS = ["source_inventory_parts", "source_inventory_blocks", "source_inventory_notes"];

const columnsOf = (src, table, schema) => {
  // Scan by balancing parentheses rather than matching a terminator: 0042 closes on
  // its own line, the audit closes with `));` on the last column line.
  const head = new RegExp(`create table (?:if not exists )?${schema}\\.${table}\\s*\\(`, "m");
  const m = src.match(head);
  if (!m) throw new Error(`table ${schema}.${table} not found`);
  let i = m.index + m[0].length, depth = 1;
  const start = i;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    i++;
  }
  const body = src.slice(start, i - 1);

  const cols = new Set();
  // Strip comments FIRST. Column comments contain commas, and splitting before
  // removing them turns prose into phantom column names.
  const clean = body.replace(/--[^\n]*/g, "");
  // Then split on commas that are not inside parentheses, so check(...) and
  // unique(a, b) stay whole.
  let buf = "", d = 0;
  const parts = [];
  for (const c of clean) {
    if (c === "(") d++;
    if (c === ")") d--;
    if (c === "," && d === 0) { parts.push(buf); buf = ""; continue; }
    buf += c;
  }
  parts.push(buf);

  for (let decl of parts) {
    decl = decl.trim();
    if (!decl) continue;
    if (/^(constraint|primary key|unique|check|foreign key)\b/i.test(decl)) continue;
    const name = decl.match(/^([a-z_][a-z0-9_]*)\s+\S/i);
    if (name) cols.add(name[1]);
  }
  return cols;
};

const parityRegion = {
  name: "inventory table column parity",
  check() {
    const mig = read(MIG_DIG), aud = read(AUDIT);
    const problems = [];
    for (const t of TABLE_COLUMNS) {
      const m = columnsOf(mig, t, "public");
      const a = columnsOf(aud, t, SCHEMA);
      const missing = [...m].filter((c) => !a.has(c));
      const extra = [...a].filter((c) => !m.has(c));
      if (missing.length) problems.push(`${t}: audit is MISSING ${missing.join(", ")}`);
      if (extra.length) problems.push(`${t}: audit has EXTRA ${extra.join(", ")}`);
    }
    return problems;
  },
};

const REGIONS = [
  {
    name: "persist_verification + persist_canonical",
    mig:   () => slice(read(MIG_RPC), /^create or replace function public\.persist_verification/,
                       /^revoke all on public\.source_inventories/, "end $$;"),
    audit: () => slice(read(AUDIT), /^create or replace function p3d_audit\.persist_verification/,
                       /^revoke all on function p3d_audit\.persist_verification/, "end $fn$;"),
  },
  {
    name: "inventory-digest-v1 helpers",
    mig: () => {
      const m = read(MIG_DIG);
      return m.slice(m.indexOf("create or replace function public.idg_enc(v text)"),
                     m.indexOf("comment on function public.inventory_digest(uuid) is")).trimEnd();
    },
    audit: () => {
      const a = read(AUDIT);
      const start = a.indexOf(`create or replace function ${SCHEMA}.idg_enc(v text)`);
      const end   = a.indexOf("-- =====================================================================\n-- C. THE 0043 EQUIVALENT");
      return a.slice(start, end).trimEnd();
    },
  },
];

const write = process.argv.includes("--write");
let drift = 0;

for (const r of REGIONS) {
  const expected = toAudit(r.mig()).trimEnd();
  const actual = r.audit().trimEnd();
  if (canon(expected) === canon(actual)) {
    console.log(`  ok    ${r.name} — audit matches the migration`);
    continue;
  }
  drift++;
  if (write) {
    const src = read(AUDIT);
    const at = src.indexOf(actual);
    if (at < 0) { console.error(`  ERROR ${r.name} — could not locate the region to replace`); process.exit(2); }
    fs.writeFileSync(AUDIT, src.slice(0, at) + expected + src.slice(at + actual.length), "utf8");
    console.log(`  WROTE ${r.name} — audit regenerated from the migration`);
  } else {
    console.error(`  DRIFT ${r.name} — audit does NOT match the migration`);
    console.error(`        run: node scripts/audit-sync.mjs --write`);
  }
}

const parityProblems = parityRegion.check();
if (parityProblems.length === 0) {
  console.log(`  ok    ${parityRegion.name} — ${TABLE_COLUMNS.length} tables, same columns`);
} else {
  drift++;
  console.error(`  DRIFT ${parityRegion.name}`);
  for (const p of parityProblems) console.error(`        ${p}`);
}

if (write && drift) { console.log("\naudit-sync: regenerated; re-run the audit SQL"); process.exit(0); }
console.log(`\naudit-sync: ${REGIONS.length + 1 - drift}/${REGIONS.length + 1} regions identical to the migrations`);
process.exit(drift ? 1 : 0);
