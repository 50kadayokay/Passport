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
 *
 * It also checks JSX COMPONENT NAMES, which are the same bug wearing a different
 * hat: `<X size={13} />` with no `X` in scope builds clean and throws
 * `X is not defined` the moment React renders that branch -- and because it is a
 * branch, the crash can hide behind a conditional until a user reaches it. That is
 * exactly how an unimported lucide icon reached the review screen.
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

// 3. JSX component names: every `<Capitalised ...>` must be bound in its file.
//    Lowercase tags are HTML; dotted tags are checked on their root object.
const jsxProblems = [];
for (const f of walk(SRC)) {
  if (!f.endsWith(".jsx")) continue;
  const rel = path.relative(ROOT, f);

  // BINDINGS COME FROM THE RAW SOURCE, usages from the stripped source.
  // strip() is a regex approximation: an apostrophe in a trailing comment
  // ("the company's") opens a phantom string literal that swallows whatever
  // follows, so a declaration inside a swallowed region would look missing.
  // Over-binding only costs a detection; under-binding invents a failure, so
  // every asymmetry here leans toward silence.
  const raw = fs.readFileSync(f, "utf8");
  const src = strip(raw);

  const bound = new Set(["React", "Fragment"]);
  for (const m of raw.matchAll(/import\s+([\s\S]*?)\s+from\s*["']/g)) {
    for (const n of m[1].matchAll(/([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?/g)) {
      bound.add(n[2] || n[1]);
    }
  }
  for (const m of raw.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) bound.add(m[1]);
  // Destructured bindings, including component props: `({ Icon, Row })`.
  for (const m of raw.matchAll(/\{([^{}]*)\}/g)) {
    for (const n of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?/g)) {
      bound.add(n[2] || n[1]);
    }
  }
  // Array destructuring: `const [App, setApp] = useState(null)` binds a
  // component just as legitimately as an import does.
  for (const m of raw.matchAll(/\[([^\[\]]*)\]\s*=/g)) {
    for (const n of m[1].matchAll(/([A-Za-z_$][\w$]*)/g)) bound.add(n[1]);
  }
  // Arrow parameters: `PANELS.map((P, k) => <P ... />)` binds the component
  // for the length of the callback.
  for (const m of raw.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const n of m[1].matchAll(/([A-Za-z_$][\w$]*)/g)) bound.add(n[1]);
  }

  const seen = new Set();
  for (const m of src.matchAll(/<([A-Z][\w$]*)\b/g)) {
    const name = m[1];
    if (bound.has(name) || seen.has(name)) continue;
    seen.add(name);
    jsxProblems.push({ file: rel, name });
  }
}

if (jsxProblems.length) {
  console.error("\n  JSX component used but not in scope:\n");
  for (const p of jsxProblems) console.error(`    ${p.file}  renders  <${p.name} />  — not imported or declared`);
  console.error(`\n  ${jsxProblems.length} problem(s). This builds clean and throws at render.\n`);
  process.exit(1);
}

if (problems.length) {
  console.error("\n  Used but not imported:\n");
  for (const p of problems) console.error(`    ${p.file}  calls  ${p.name}()  — exported by ${p.origin}`);
  console.error(`\n  ${problems.length} problem(s). Add the import.\n`);
  process.exit(1);
}
console.log(`check:imports — ok (${exported.size} src/lib exports, plus JSX component names)`);
