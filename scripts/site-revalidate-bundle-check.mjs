// a15: the website revalidate secret never reaches the browser bundle.
//   node scripts/site-revalidate-bundle-check.mjs
//
// OFFLINE. Builds the app with Vite into a temporary folder while
// SITE_REVALIDATE_SECRET is set to a sentinel, then searches every emitted file
// for the sentinel, a company key derived from it, and the signing code's
// markers. Vite inlines VITE_* variables only (some chunks inline the whole
// import.meta.env), so a VITE_-prefixed copy of the secret must never exist:
// the last check refuses one in the environment or any .env file.
// The temporary folder is removed afterwards; dist/ is not touched.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SENTINEL = `bundle-sentinel-${process.pid}-${Date.now()}`;
const CO = "aaaaaaaa-0000-0000-0000-000000000001";
const out = fs.mkdtempSync(path.join(os.tmpdir(), "s2-revalidate-bundle-"));

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

try {
  const env = { ...process.env, SITE_REVALIDATE_SECRET: SENTINEL };
  delete env.MINEEX_ENV;   // a production-shaped build
  const b = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "error"], { env, encoding: "utf8", timeout: 300_000 });
  ok(b.status === 0, "the app builds", (b.stderr || "").slice(-600));

  const { companyKey } = await import("../api/_siteRevalidate.js");
  const derived = companyKey(CO, SENTINEL);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const files = b.status === 0 ? walk(out) : [];
  ok(files.some((f) => f.endsWith(".js")), `searched ${files.length} emitted files`);
  const hits = (needle) => files.filter((f) => fs.readFileSync(f).includes(needle)).map((f) => path.relative(out, f));
  for (const [needle, what] of [
    [SENTINEL, "the master secret's value"],
    [derived, "a company key derived from it"],
    ["SITE_REVALIDATE_SECRET", "the variable's name"],
    ["site-revalidate:", "the key-derivation label"],
    ["X-MineEx-Signature", "the signing header"],
  ]) { const h = hits(needle); ok(h.length === 0, `not in the bundle: ${what}`, h.join(", ")); }
  const envFiles = fs.readdirSync(".").filter((f) => f.startsWith(".env"));
  const viteCopies = [...Object.keys(process.env), ...envFiles.flatMap((f) => fs.readFileSync(f, "utf8").split("\n").map((l) => l.split("=")[0].trim()))]
    .filter((k) => /^VITE_.*REVALIDATE/i.test(k));
  ok(viteCopies.length === 0, "no VITE_* copy of the revalidate secret in the environment or .env files (names only checked)", viteCopies.join(", "));
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
