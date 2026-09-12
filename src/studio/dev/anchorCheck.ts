// Dev check — every fixture anchor must resolve against its own release text.
//
// A fixture whose quotes don't match its release would make the fact-check screen
// look broken during development and would hide real anchor-resolution bugs.
// Run with: npm run check:anchors
//
// DEV ONLY: it imports src/studio/mock, which no production module touches.

import { FIXTURES } from "../mock/fixtures";
import { anchorCoverage, resolveAllAnchors } from "../lib/anchors";
import type { SourceAnchor } from "../types";

function unresolvedQuotes(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) { node.forEach((n) => unresolvedQuotes(n, out)); return out; }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "anchor" && v && typeof v === "object" && "quote" in (v as object)) {
        const a = v as SourceAnchor;
        if (!a.resolved) out.push(a.quote);
      } else unresolvedQuotes(v, out);
    }
  }
  return out;
}

let failures = 0;
for (const fixture of FIXTURES) {
  const resolved = resolveAllAnchors(fixture.extraction, fixture.releaseText);
  const cov = anchorCoverage(resolved);
  const misses = unresolvedQuotes(resolved);
  failures += misses.length;
  console.log(`${fixture.id}: ${cov.resolved}/${cov.total} anchors resolved`);
  misses.forEach((m) => console.log(`   UNRESOLVED: ${m}`));
}

// Throwing (rather than process.exit) keeps this file free of Node globals, so it
// type-checks under the same browser-targeted tsconfig as the rest of the studio.
// An uncaught throw still exits non-zero, which is what the npm script needs.
if (failures) throw new Error(`${failures} fixture anchor(s) do not appear in their release text.`);
console.log("\nAll fixture anchors resolve.");
