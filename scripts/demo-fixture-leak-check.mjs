// The demo fixtures must never reach a production bundle.
//   node scripts/demo-fixture-leak-check.mjs        (run after `npm run build`)
//
// WHY THIS IS A SCRIPT AND NOT A GREP
// -----------------------------------
// Every fixture is served behind `import.meta.env.DEV && isPortalDemo()`, and
// the DEV term must LEAD: Rollup replaces it with a literal `false` and drops
// the branch, but it cannot see through the isPortalDemo() call on its own, so
// with the call first the dynamic import survives and the whole fixture file
// ships. That has happened once already.
//
// Checking by hand means grepping dist/ for a phrase, and a phrase that reads
// like fixture data often also appears in real source -- "Core from hole"
// matched MediaPage's own composer placeholder and reported a leak that was not
// there. So the needles here are taken from the FIXTURE FILE ITSELF and then
// filtered to those that appear nowhere else in src/, which makes a hit
// unambiguous.

import fs from "node:fs";
import path from "node:path";

const FIXTURE = "src/portal/__fixtures/updatesDemo.js";
const DIST = "dist/assets";

if (!fs.existsSync(DIST)) {
  console.error(`\n  CANNOT RUN — ${DIST} does not exist. Run \`npm run build\` first.\n`);
  process.exit(3);
}

const fixture = fs.readFileSync(FIXTURE, "utf8");

// Every exported name, plus every string literal long enough to be distinctive.
const names = [...fixture.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
const literals = [...fixture.matchAll(/"([^"\\\n]{14,70})"/g)].map((m) => m[1]);

// Anything that also occurs in real source is not evidence of a leak.
const srcFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.(js|jsx|ts|tsx)$/.test(e.name) && f !== FIXTURE) srcFiles.push(f);
  }
})("src");
const otherSource = srcFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");

const needles = [...new Set([...names, ...literals])].filter((n) => !otherSource.includes(n));

const bundles = fs.readdirSync(DIST).filter((f) => f.endsWith(".js"));
const blob = bundles.map((f) => fs.readFileSync(path.join(DIST, f), "utf8")).join("\n");

const hits = needles.filter((n) => blob.includes(n));

console.log(`\n  ${needles.length} fixture-only markers checked against ${bundles.length} bundles.`);
if (hits.length) {
  console.error(`\n  LEAKED — the demo fixtures are in the production build:\n`);
  for (const h of hits.slice(0, 12)) {
    const where = bundles.filter((f) => fs.readFileSync(path.join(DIST, f), "utf8").includes(h));
    console.error(`     ${JSON.stringify(h).slice(0, 60)}  →  ${where.join(", ")}`);
  }
  console.error(`\n  Check that every fixture branch reads \`import.meta.env.DEV && isPortalDemo()\`,`);
  console.error(`  with the DEV term FIRST, and that nothing imports the fixture statically.\n`);
  process.exit(1);
}
console.log("  clean — no fixture data in dist/\n");
