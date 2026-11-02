// Static dependency-order check over supabase/migrations/.
//   node scripts/migration-deps-check.mjs
//
// WHY THIS EXISTS
// ---------------
// The migration set cannot be replayed onto an empty Supabase project. Nobody
// noticed because it is never replayed -- it is only ever applied forward, one
// file at a time, against a database that already carried the prototype's
// hand-made tables. The drift becomes visible the moment you try to build a
// staging environment, which is the worst moment to discover it.
//
// For each referenced object this asks: does anything create it, and if so, does
// that happen EARLIER? Never created at all is a baseline gap. Created later is
// an ordering fault. The fixes differ, so they are reported separately.
//
// Deliberately a TEXT analysis. The point is to answer the question without
// needing a database to test against.
//
// TWO PASSES, because a single pass cannot tell a table from a function:
// `insert into public.facts (a, b)` and `public.owns_company(x)` are the same
// shape. Pass 1 learns every object the set creates; pass 2 judges references
// against that knowledge.

import fs from "node:fs";

const DIR = "supabase/migrations";
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const read = (f) => fs.readFileSync(`${DIR}/${f}`, "utf8");

// Provided by Postgres or Supabase. Referencing these is not a gap.
const BUILTIN_SCHEMAS = new Set(["auth", "storage", "extensions", "vault", "pg_catalog", "information_schema"]);
const BUILTIN_FUNCS = new Set([
  "now", "gen_random_uuid", "uuid_generate_v4", "coalesce", "count", "format",
  "jsonb_build_object", "jsonb_agg", "to_jsonb", "set_config", "current_setting",
  "string_agg", "array_agg", "lower", "upper", "trim", "concat", "digest",
  "encode", "convert_to", "md5", "nullif", "greatest", "least", "date_trunc",
  "extract", "random", "sha256", "crypt", "gen_salt", "to_tsvector", "websearch_to_tsquery",
]);
const SQL_NOISE = new Set(["exists", "table", "only", "select", "public", "on", "from", "if", "not"]);

const strip = (sql) => sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
// Function bodies must be excluded when hunting TABLE references (a body's
// `insert into public.x` is runtime, not creation-time) but INCLUDED when
// hunting function calls, since a policy body referencing a missing function
// fails at creation.
const noBodies = (sql) => strip(sql).replace(/\$\$[\s\S]*?\$\$/g, " $BODY$ ");

// ─────────────────────────────────── pass 1: what does the set create? ──────
const tables = new Map();    // name -> index of the file that first creates it
const funcs  = new Map();
files.forEach((f, i) => {
  const s = noBodies(read(f)), raw = strip(read(f));
  for (const m of s.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi))
    if (!tables.has(m[1])) tables.set(m[1], i);
  for (const m of s.matchAll(/\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:public\.)?([a-z0-9_]+)/gi))
    if (!tables.has(m[1])) tables.set(m[1], i);
  for (const m of raw.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi))
    if (!funcs.has(m[1])) funcs.set(m[1], i);
});

// ─────────────────────────────────── pass 2: judge every reference ──────────
const missingTables = new Map();   // name -> [files]
const missingFuncs  = new Map();
const outOfOrder    = [];

const note = (map, name, file) => { if (!map.has(name)) map.set(name, []); map.get(name).push(file); };

files.forEach((f, i) => {
  const s = noBodies(read(f)), raw = strip(read(f));
  const tRefs = new Set(), fRefs = new Set();

  const addTable = (qualified) => {
    const parts = qualified.split(".");
    if (parts.length > 1 && BUILTIN_SCHEMAS.has(parts[0])) return;   // auth.users etc.
    const name = parts[parts.length - 1];
    if (!SQL_NOISE.has(name)) tRefs.add(name);
  };

  const Q = "((?:[a-z0-9_]+\\.)?[a-z0-9_]+)";
  for (const m of s.matchAll(new RegExp(`\\breferences\\s+${Q}`, "gi"))) addTable(m[1]);
  for (const m of s.matchAll(new RegExp(`\\balter\\s+table\\s+(?:if\\s+exists\\s+)?${Q}`, "gi"))) addTable(m[1]);
  for (const m of s.matchAll(new RegExp(`\\bcreate\\s+(?:unique\\s+)?index\\s+(?:concurrently\\s+)?(?:if\\s+not\\s+exists\\s+)?[a-z0-9_]+\\s+on\\s+${Q}`, "gi"))) addTable(m[1]);
  for (const m of s.matchAll(new RegExp(`\\b(?:create|drop)\\s+policy\\s+"?[a-z0-9_]+"?\\s+on\\s+${Q}`, "gi"))) addTable(m[1]);
  for (const m of s.matchAll(new RegExp(`\\b(?:create|drop)\\s+trigger\\s+(?:if\\s+exists\\s+)?[a-z0-9_]+\\s+(?:[a-z\\s]*?)\\bon\\s+${Q}`, "gi"))) addTable(m[1]);
  for (const m of s.matchAll(new RegExp(`\\b(?:revoke|grant)\\b[^;]*?\\son\\s+(?:table\\s+)?${Q}\\s+(?:from|to)\\b`, "gi"))) addTable(m[1]);

  // Function calls -- bodies INCLUDED, because a policy or trigger referencing a
  // missing function fails at CREATION time, not when it is first called.
  //
  // Two exclusions matter:
  //   • a name pass 1 saw created as a TABLE is `insert into public.x (...)`,
  //     not a call -- this is the ambiguity pass 1 exists to resolve;
  //   • `drop function if exists public.x() cascade` is CLEANUP of a superseded
  //     function. It is not a dependency and is a no-op on a fresh database, so
  //     counting it would report a replay blocker that does not exist.
  const dropped = new Set(
    [...raw.matchAll(/\bdrop\s+function\s+if\s+exists\s+(?:public\.)?([a-z0-9_]+)/gi)].map((m) => m[1]));
  for (const m of raw.matchAll(/\bpublic\.([a-z0-9_]+)\s*\(/gi))
    if (!tables.has(m[1]) && !SQL_NOISE.has(m[1]) && !dropped.has(m[1])) fRefs.add(m[1]);

  for (const t of tRefs) {
    if (!tables.has(t)) note(missingTables, t, f);
    else if (tables.get(t) > i) outOfOrder.push({ kind: "table", name: t, usedIn: f, createdIn: files[tables.get(t)] });
  }
  for (const fn of fRefs) {
    if (BUILTIN_FUNCS.has(fn)) continue;
    if (!funcs.has(fn)) note(missingFuncs, fn, f);
    else if (funcs.get(fn) > i) outOfOrder.push({ kind: "function", name: fn, usedIn: f, createdIn: files[funcs.get(fn)] });
  }
});

// A name reported as a missing TABLE is not also a missing FUNCTION: the
// `public.x (` that looked like a call was `insert into public.x (col, ...)`.
// Tables win, because pass 2 only ever reaches the function branch for names
// pass 1 never saw created at all.
for (const name of missingTables.keys()) missingFuncs.delete(name);

// ─────────────────────────────────── report ─────────────────────────────────
console.log(`\n  ${files.length} migrations · ${tables.size} tables/views · ${funcs.size} functions created\n`);

console.log("  ══ NEVER CREATED — the baseline must supply these ══");
const all = [...[...missingTables].map(([n, f]) => ["TABLE", n, f]),
             ...[...missingFuncs ].map(([n, f]) => ["FUNCTION", n, f])]
  .sort((a, b) => b[2].length - a[2].length || a[1].localeCompare(b[1]));
if (!all.length) console.log("     none");
for (const [kind, name, where] of all)
  console.log(`     ${kind.padEnd(9)} ${name.padEnd(22)} referenced by ${String(where.length).padStart(2)} migration${where.length === 1 ? " " : "s"}, first ${where[0].slice(0, 4)}`);

console.log("\n  ══ CREATED LATER THAN FIRST USE — replay fails here ══");
const seen = new Set();
const ooo = outOfOrder.filter((p) => { const k = `${p.kind}:${p.name}:${p.usedIn}`; if (seen.has(k)) return false; seen.add(k); return true; });
if (!ooo.length) console.log("     none");
for (const p of ooo)
  console.log(`     ${p.kind.padEnd(9)} ${p.name.padEnd(22)} used in ${p.usedIn.slice(0, 4)}, created in ${p.createdIn.slice(0, 4)}`);

// ─────────────────────────────── what this cannot see ──────────────────────
// Printed every run, not buried in a doc. A green result here means "no
// TEXT-VISIBLE dependency is unresolved" -- it is not a proof of
// reproducibility, and reading it as one is the mistake this block exists to
// prevent. Only a real replay plus a schema diff proves that.
const dynamic = files.filter((f) => /execute\s+format\(/i.test(read(f)));
console.log("\n  ══ LIMITATIONS — what a text analysis cannot detect ══");
console.log(`     • DYNAMIC SQL: ${dynamic.length} of ${files.length} migrations build statements with`);
console.log("       execute format(...). Objects they create or reference are invisible here.");
console.log(`       (${dynamic.slice(0, 4).map((f) => f.slice(0, 4)).join(", ")}, ... )`);
console.log("     • COLUMN drift: a column production has that no migration adds.");
console.log("     • CONSTRAINT drift: a hand-added check or foreign key.");
console.log("     • FUNCTION SIGNATURES: matching is by NAME only, so owns_company(uuid)");
console.log("       resolves against a definition of owns_company(text).");
console.log("     • EXTENSIONS: digest/crypt/to_tsvector are treated as built in, so a");
console.log("       missing pgcrypto or pg_trgm is NOT reported.");
console.log("     • GRANTS, RLS policy correctness, trigger argument mismatches.");
console.log("     • SUPABASE-MANAGED config: auth settings, JWT config, vault secrets,");
console.log("       edge functions, storage bucket configuration.");
console.log("     • SEED DATA: 8 migrations insert reference rows (plans, features,");
console.log("       listener_subscriptions, news_sources). Replay covers them; this does not check them.");

const fatal = all.length + ooo.length;
console.log(`\n  ${fatal === 0
  ? "No unresolved TEXT-VISIBLE references. NOT a proof of reproducibility — see limitations."
  : `NOT REPLAYABLE — ${all.length} missing object${all.length === 1 ? "" : "s"}, ${ooo.length} ordering fault${ooo.length === 1 ? "" : "s"}.`}\n`);
process.exit(fatal ? 1 : 0);
