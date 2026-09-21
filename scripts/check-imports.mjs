#!/usr/bin/env node
/**
 * check:imports — catch a helper used but never imported.
 *
 * WHY THIS EXISTS
 * ---------------
 * `writeHeaders()` was added to src/lib/auth.js and called from src/lib/memory.js,
 * but the import line was never updated. `vite build` passed, because to Rollup an
 * un-imported identifier is just a global that might exist at runtime. The bug only
 * surfaced in the browser, as `writeHeaders is not defined`, after a real upload.
 *
 * WHAT IT CHECKS
 * --------------
 * Every name exported by a module under src/lib/. If a file in src/ references one
 * of those names, it must either import it, define it, or import that module
 * namespace-style. Anything else is the mistake above.
 *
 * Deliberately narrow: only src/lib exports. A general no-undef pass needs a real
 * linter and a real config; this needs neither and covers the shared helpers that
 * every portal write path depends on.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const LIB = path.join(SRC, "lib");

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
};

// Strip comments and string/template literals so a name mentioned in prose or in a
// SQL string is not mistaken for a reference.
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ")
   .replace(/^\s*\/\/.*$/gm, " ")
   .replace(/`(?:\\.|[^`\\])*`/g, "``")
   .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
   .replace(/"(?:\\.|[^"\\\n])*"/g, '""');

// 1. Collect exported function/const names from src/lib.
const exported = new Map(); // name -> lib file
for (const f of walk(LIB)) {
  const src = strip(fs.readFileSync(f, "utf8"));
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    exported.set(m[1], path.relative(ROOT, f));
  }
}

// 2. For each source file, find references to those names that are not bound.
const problems = [];
for (const f of walk(SRC)) {
  const raw = fs.readFileSync(f, "utf8");
  const src = strip(raw);
  const rel = path.relative(ROOT, f);

  // Names bound in this file: any import specifier, any local declaration,
  // any function parameter-ish binding, plus namespace imports (which make
  // `ns.foo` legal and unresolvable by name alone).
  const bound = new Set();
  let namespaced = false;
  for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s*["'']/g)) {
    const clause = m[1];
    if (/\*\s+as\s+/.test(clause)) namespaced = true;
    for (const n of clause.matchAll(/([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?/g)) {
      bound.add(n[2] || n[1]);
    }
  }
  for (const m of src.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) bound.add(m[1]);
  // Destructured bindings: `const { a, b: c } = deps`, `const { pdfToText } = await
  // import(...)`, and destructured function parameters. structureReleases.js takes its
  // memory helpers this way on purpose, to avoid a circular import.
  for (const m of src.matchAll(/\{([^{}]*)\}\s*=/g)) {
    for (const n of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?/g)) {
      bound.add(n[2] || n[1]);
    }
  }
  if (namespaced) continue;

  for (const [name, origin] of exported) {
    if (bound.has(name)) continue;
    // A bare reference: the name not preceded by `.` (property access) or `:`.
    const re = new RegExp(`(^|[^.\\w$])${name}\\s*\\(`, "m");
    if (re.test(src)) problems.push({ file: rel, name, origin });
  }
}

if (problems.length) {
  console.error("\n  Used but not imported:\n");
  for (const p of problems) console.error(`    ${p.file}  calls  ${p.name}()  — exported by ${p.origin}`);
  console.error(`\n  ${problems.length} problem(s). Add the import.\n`);
  process.exit(1);
}
console.log(`check:imports — ok (${exported.size} src/lib exports checked)`);
