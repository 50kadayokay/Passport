#!/usr/bin/env node
/* ============================================================
   GUARD: no company may inherit the Kingsmen prototype's data.
   ------------------------------------------------------------
   PassportProto declares its module singletons as `_PP.KEY ?? <default>`, where the
   default is Kingsmen Resources' REAL content. That is right for the built-in prototype
   and wrong for everyone else: a company whose `pp` omits a key would render Kingsmen's
   team, cap table, ownership or press releases under its own name. This has regressed
   three times (see the comments in profileToPP.js).

   Two things must therefore hold for every such key:
     1. the `if (!DEMO)` neutraliser resets it for real companies, AND
     2. applyPP assigns it unconditionally, so swapping company A -> B cannot leave
        A's value standing where B's pp is silent.

   Keys whose default is genuinely GENERIC (no Kingsmen content) are allow-listed below.
   Adding a new Kingsmen-defaulted constant without handling it fails this check.

   Run: node scripts/check-prototype-leak.mjs
   ============================================================ */
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "src/aiBrief/PassportProto.jsx");
const src = fs.readFileSync(FILE, "utf8");

// Defaults that contain no Kingsmen-specific content, so inheriting them is harmless.
const GENERIC = new Set([
  "STAGES",        // generic lifecycle labels (Acquisition…Production)
  "CEO_NOTE",      // empty {text,name,title,photo}
  "CONTACT",       // empty {phone,email,twitter,linkedin}
  "CARD_MEDIA",    // {}
  "ACCOUNT_TIER",  // plan string
  "BRAND",         // accent colour, handled explicitly in applyPP
  "BRAND_TEXT",
]);

// 1. Every `_PP.KEY ??` declaration.
const declared = new Set();
for (const m of src.matchAll(/_PP\.([A-Z][A-Z_0-9]+)\s*\?\?/g)) declared.add(m[1]);

// 2. Keys the `if (!DEMO)` neutraliser resets, via its `u("KEY")` calls.
const neutralised = new Set();
const nBlock = src.match(/if \(!DEMO\) \{[\s\S]*?\n\}/);
if (!nBlock) {
  console.error("FAIL: the `if (!DEMO)` prototype neutraliser is missing from PassportProto.jsx.");
  process.exit(1);
}
for (const m of nBlock[0].matchAll(/u\("([A-Z][A-Z_0-9]+)"\)/g)) neutralised.add(m[1]);

// 3. Keys applyPP assigns. Unconditional `v("KEY", …)` is what we want; a surviving
//    `if (pp.KEY !== undefined)` is the old merge behaviour that caused the A->B bleed.
const aBlock = src.match(/export function applyPP\(pp\)\s*\{[\s\S]*?\n\}/);
if (!aBlock) {
  console.error("FAIL: applyPP not found in PassportProto.jsx.");
  process.exit(1);
}
//    Both `v("KEY", empty)` and a `pp.KEY !== undefined ? … : …` ternary always assign;
//    only a guarding `if` can leave the previous value in place.
const applied = new Set();
for (const m of aBlock[0].matchAll(/v\("([A-Z][A-Z_0-9]+)"/g)) applied.add(m[1]);
for (const m of aBlock[0].matchAll(/pp\.([A-Z][A-Z_0-9]+) !== undefined\s*\?/g)) applied.add(m[1]);
for (const m of aBlock[0].matchAll(/=\s*pp\.([A-Z][A-Z_0-9]+)\s*\?/g)) applied.add(m[1]);
const conditional = [...aBlock[0].matchAll(/if \(pp\.([A-Z][A-Z_0-9]+) !== undefined\)/g)].map((m) => m[1]);

const problems = [];
for (const key of [...declared].sort()) {
  if (GENERIC.has(key)) continue;
  if (!neutralised.has(key)) problems.push(`${key}: Kingsmen default is not reset by the !DEMO neutraliser`);
  if (!applied.has(key)) problems.push(`${key}: applyPP does not assign it unconditionally (company A's value would persist into company B)`);
}
for (const key of conditional) {
  if (GENERIC.has(key)) continue;
  problems.push(`${key}: applyPP still uses conditional merge semantics (\`if (pp.${key} !== undefined)\`)`);
}

if (problems.length) {
  console.error("PROTOTYPE LEAK GUARD FAILED\n");
  for (const p of problems) console.error("  - " + p);
  console.error(`\n${problems.length} problem(s). A company would render Kingsmen's (or a previously`);
  console.error("loaded company's) data. Handle the key in BOTH the !DEMO neutraliser and applyPP,");
  console.error("or add it to GENERIC in this script if its default carries no company content.");
  process.exit(1);
}

console.log(`PROTOTYPE LEAK GUARD PASSED — ${declared.size} pp-backed constants checked ` +
            `(${declared.size - GENERIC.size} company-specific, ${GENERIC.size} generic).`);
