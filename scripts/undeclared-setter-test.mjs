// D25 regression check: a React state setter called but never declared.
//   node scripts/undeclared-setter-test.mjs
//
// OFFLINE, static. Vite builds a file that calls an undeclared identifier
// without complaint -- the ReferenceError only fires when the code path runs.
// That is how Publish.jsx shipped `setHandoff(...)` with no useState: leaving
// the release review screen threw, and a file dropped on the library never
// reached the upload. The repo has no ESLint (no-undef), so this checks the
// one pattern that bit: every `setX(` called in a src/ .jsx/.js file must be
// declared in that file (useState destructuring, a const/let/function, a
// parameter or destructured prop, or an import).
//
// Plus the D25 behaviour itself: Publish.jsx declares the handoff state and
// passes the dropped file to CreateRelease, which ingests it.

import fs from "node:fs";
import path from "node:path";

const ROOT = "src";
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx|js)$/.test(e.name)) files.push(p);
  }
})(ROOT);

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

// Strip comments and string/template literals so prose never counts.
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:\\])\/\/.*$/gm, "$1")
  .replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``")
  .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
  .replace(/'(?:\\.|[^'\\\n])*'/g, "''");

const GLOBALS = new Set(["setTimeout", "setInterval", "setImmediate"]);
const undeclared = [];
for (const f of files) {
  const raw = fs.readFileSync(f, "utf8"), src = strip(raw);
  // Calls are found in the stripped text (no prose); declarations are looked
  // for in the raw text, so a stripping slip can only hide a call, never invent one.
  const called = new Set([...src.matchAll(/(?<![.\w$])(set[A-Z]\w*)\s*\(/g)].map((m) => m[1]));
  for (const name of called) {
    if (GLOBALS.has(name)) continue;
    const declared = new RegExp(
      `\\[\\s*\\w*\\s*,\\s*${name}\\s*\\]` +                 // const [x, setX] = useState
      `|(?:const|let|var|function)\\s+${name}\\b` +          // const setX = / function setX
      `|[{,(]\\s*${name}\\s*[,})=:]` +                       // ({ setX }) / (a, setX) / { setX: ... }
      `|\\b${name}\\s*:\\s*` +                               // object key passed down
      `|import[^;]*\\b${name}\\b` +                          // import { setX }
      `|^\\s*(?:async\\s+)?${name}\\s*\\([^)]*\\)\\s*\\{`              // method shorthand: setX(a, b) { ... }
    , "m").test(raw);
    if (!declared) undeclared.push(`${f}: ${name}`);
  }
}
console.log(`\n  UNDECLARED STATE SETTERS (${files.length} files)`);
ok(undeclared.length === 0, "every setX(...) called is declared in its file", undeclared.join("\n      "));

console.log("\n  D25: the library hands a dropped file to the upload");
const pub = fs.readFileSync("src/portal/publish/Publish.jsx", "utf8");
const cr = fs.readFileSync("src/portal/publish/CreateRelease.jsx", "utf8");
ok(/const \[handoff, setHandoff\] = useState\(null\)/.test(pub), "Publish.jsx declares the handoff state");
ok(/initialFile=\{editing \? null : handoff\}/.test(pub), "Publish.jsx passes the dropped file to CreateRelease (never when reopening a draft)");
ok(/function CreateRelease\(\{[^}]*initialFile = null[^}]*\}\)/.test(cr) && /if \(initialFile && !draftId\) handleFile\(initialFile\)/.test(cr), "CreateRelease ingests it through handleFile (one upload path, guarded against a second ingest)");

console.log(`\n  undeclared-setter: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
