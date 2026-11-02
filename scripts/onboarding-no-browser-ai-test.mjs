// No AI provider is called from the browser (S3's CSP finding, 2026-11-01).
//   node scripts/onboarding-no-browser-ai-test.mjs     (npm run check:s1-no-browser-ai)
//
// OFFLINE, no AI. src/Onboarding.jsx's callModel() POSTed to the provider's API
// from the browser with no key, so it could only fail. Its four callers were all
// unreachable: an `Editor` component nothing rendered, and two autofills only a
// window debug hook could start. They are removed; the builder's AI proposals
// come from /api/synthesize-profile and /api/structure-release, behind
// requireAiCaller (proved, with the model mocked, by scripts/ai-guard-test.mjs).
// This checks:
//   - no client code names a provider API, key header or provider key variable
//   - Onboarding.jsx has no unbound identifier beyond standard browser globals
//     (a removal that left a caller behind would be a runtime ReferenceError)
//   - the builder still reaches the server path, with the user's token
//   - the bundled builder holds no provider origin
//   - the investor app never imports the builder
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default || _traverse;

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const read = (f) => fs.readFileSync(f, "utf8");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const SRC = walk("src").filter((f) => /\.(jsx?|tsx?|mjs)$/.test(f));
const ONB = read("src/Onboarding.jsx");

console.log("\n  NO PROVIDER CALLS IN CLIENT CODE (src/)");
const PROVIDER = /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.cohere\.(ai|com)|anthropic-dangerous-direct-browser-access|["']x-api-key["']|\bVITE_[A-Z_]*(ANTHROPIC|OPENAI)[A-Z_]*/i;
const hits = SRC.filter((f) => PROVIDER.test(read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")));
ok(hits.length === 0, `${SRC.length} client files: none calls an AI provider or names a provider key`, hits.join(", "));
ok(!/async function callModel|function Editor\(\{ field|extractCompanyStatus|extractCompanyBrief|COMPANY_(STATUS|BRIEF)_EXTRACTION_SYSTEM/.test(ONB), "callModel, the unrendered Editor and the two browser autofills are gone");
ok(/window\.__ppStatusAI = \{ normalizeCompanyStatus, normalizeCompanyStatusReview, apply:/.test(ONB) && /window\.__ppBriefAI = \{ normalizeCompanyBrief, normalizeCompanyBriefReview, apply:/.test(ONB),
   "the debug hooks keep their normalizers and apply(), without a way to start a browser model call");

console.log("\n  NOTHING LEFT DANGLING (src/Onboarding.jsx)");
{
  const ast = parse(ONB, { sourceType: "module", plugins: ["jsx"] });
  const unbound = new Set();
  traverse(ast, { ReferencedIdentifier(p) {
    const n = p.node.name;
    if (p.isJSXIdentifier() && /^[a-z]/.test(n)) return;   // intrinsic elements: <div>, <span>
    if (!p.scope.hasBinding(n, true)) unbound.add(n);
  } });
  const GLOBALS = new Set(("Array Boolean Date Error FileReader Image IntersectionObserver JSON Math Number Object Promise ResizeObserver Set String URLSearchParams " +
    "cancelAnimationFrame clearInterval clearTimeout document encodeURIComponent fetch isFinite isNaN navigator parseFloat parseInt performance requestAnimationFrame setInterval setTimeout undefined window").split(" "));
  const strange = [...unbound].filter((n) => !GLOBALS.has(n));
  ok(strange.length === 0, `every identifier is defined or a standard browser global (${unbound.size} globals)`, strange.join(", "));
  ok(/const fileToBase64 = \(file\)/.test(ONB) && /pdf: await fileToBase64\(file\)/.test(ONB), "fileToBase64 stays: the real submit flow sends scanned PDFs with it");
}

console.log("\n  THE SERVER PATH IS STILL THE ONE IN USE");
{
  const sr = read("src/lib/structureReleases.js");
  ok(/fetch\("\/api\/synthesize-profile"/.test(sr) && /fetch\("\/api\/structure-release"|\/api\/structure-release/.test(sr) && /Authorization: `Bearer \$\{token\}`/.test(sr),
     "the builder asks /api/synthesize-profile and /api/structure-release, with the user's token");
  const sp = read("api/synthesize-profile.js");
  const guard = sp.indexOf("await requireAiCaller("), key = sp.indexOf("process.env.ANTHROPIC_API_KEY"), call = sp.indexOf("await fetch(ANTHROPIC_URL");
  ok(guard > 0 && guard < key && key < call, "synthesize-profile: requireAiCaller runs first, the key is read server-side, then the model is called");
  ok(/"synthesize-profile"/.test(read("scripts/ai-guard-test.mjs")), "...and scripts/ai-guard-test.mjs proves that guard with the model mocked");
}

console.log("\n  THE BUNDLED BUILDER");
{
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onb-bundle-")), "onb.js");
  const r = spawnSync("node_modules/.bin/esbuild", ["src/Onboarding.jsx", "--bundle", "--format=esm", "--platform=browser", "--jsx=automatic",
    "--packages=external", `--outfile=${out}`, "--log-level=error"], { encoding: "utf8" });
  const js = r.status === 0 ? read(out) : "";
  ok(r.status === 0 && js.length > 100000, "Onboarding.jsx and its local imports bundle", r.stderr.slice(0, 300));
  ok(js.length > 0 && !PROVIDER.test(js), "the bundle holds no provider origin or key header");
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
}

console.log("\n  THE INVESTOR APP DOES NOT LOAD IT");
{
  const main = read("src/main.jsx");
  const staticImports = SRC.filter((f) => /^\s*import\s[^;]*["'][./]*[^"']*(Onboarding\.jsx|CompanyConsole\.jsx)["']/m.test(read(f))).map((f) => path.relative("src", f));
  ok(staticImports.join() === "console/CompanyConsole.jsx", "only CompanyConsole imports the builder statically", staticImports.join(", "));
  ok(/React\.lazy\(\(\) => import\("\.\/console\/CompanyConsole\.jsx"\)\)/.test(main) && /React\.lazy\(\(\) => import\("\.\.\/Onboarding\.jsx"\)\)/.test(read("src/portal/Portal.jsx")),
     "main.jsx (/onboarding) and the portal load it lazily: a separate chunk the investor app (/app, native) never fetches");
  ok(!walk("src/aiBrief").some((f) => /Onboarding\.jsx|CompanyConsole/.test(read(f))), "nothing in the investor app (src/aiBrief) references it");
}

console.log(`\n  no browser AI calls: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
