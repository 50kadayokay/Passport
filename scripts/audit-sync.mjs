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
    fs.writeFileSync(AUDIT, src.replace(actual, expected), "utf8");
    console.log(`  WROTE ${r.name} — audit regenerated from the migration`);
  } else {
    console.error(`  DRIFT ${r.name} — audit does NOT match the migration`);
    console.error(`        run: node scripts/audit-sync.mjs --write`);
  }
}

if (write && drift) { console.log("\naudit-sync: regenerated; re-run the audit SQL"); process.exit(0); }
console.log(`\naudit-sync: ${REGIONS.length - drift}/${REGIONS.length} regions identical to the migrations`);
process.exit(drift ? 1 : 0);
