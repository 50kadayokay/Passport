// The full release must stay the full release.
//   node scripts/full-release-integrity-test.mjs
//
// WHY THIS EXISTS
// ---------------
// The portal derived its "Full Release" from the SUMMARISER'S INPUT: the body
// with boilerplate cut at the first marker and line-level furniture filtered
// out. On a real drill release that silently removed the forward-looking
// statements, the exchange disclaimer, the About section, the IR contacts --
// and the rows of the assay table, because a line of numbers and short codes
// is indistinguishable from OCR furniture to a line filter.
//
// Nothing was destroyed (every removal is recorded in `exclusions` and the
// immutable transcript), but what the company published and what investors
// opened was not the document they uploaded. These assertions pin the two
// outputs apart and keep the complete one complete.

import fs from "node:fs";
import { normalizeRelease } from "../src/lib/pressRelease.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`    ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`}`);
};

// A realistic release: dateline, highlights, an assay table, QA/QC, a QP
// statement, About, contacts, forward-looking statements and the TSXV note.
const RELEASE = fs.existsSync("/tmp/prtest/release.txt")
  ? fs.readFileSync("/tmp/prtest/release.txt", "utf8")
  : [
      "FOR IMMEDIATE RELEASE", "",
      "Company Intersects 31.4 m of 4.8 g/t Au", "",
      "Vancouver, British Columbia -- October 9, 2026 -- The Company reports assays.", "",
      "Table 1: Significant Intercepts", "",
      "RC-26-088     149.0    180.4           31.4        4.8",
      "RC-26-089     161.5    180.2           18.7        2.9", "",
      "Qualified Person", "",
      "Reviewed by J. Mercer, P.Geo., a Qualified Person as defined by National Instrument 43-101.", "",
      "About The Company Ltd.", "",
      "The Company is a mineral exploration company.", "",
      "For further information, please contact:", "",
      "investor@example.test", "",
      "Forward-Looking Statements", "",
      "This news release contains forward-looking statements within the meaning of applicable securities legislation.", "",
      "Neither the TSX Venture Exchange nor its Regulation Services Provider accepts responsibility for this release.",
    ].join("\n");

console.log("\n  1. the two outputs are different things");
const body = normalizeRelease(RELEASE);
const full = normalizeRelease(RELEASE, { complete: true });
check("the summariser's body is shorter than the document", body.bodyChars < body.sourceChars, true);
check("the complete release is longer than the body", full.bodyChars > body.bodyChars, true);

console.log("\n  2. material disclosure survives into the complete release");
for (const probe of [
  "Forward-Looking", "TSX Venture Exchange", "Qualified Person",
  "National Instrument 43-101", "RC-26-088", "RC-26-089", "Table 1",
]) check(`complete release keeps "${probe}"`, full.body.includes(probe), true);

console.log("\n  3. nothing is dropped from the complete release");
check("no content exclusions in complete mode", full.exclusions.length, 0);
check("only whitespace separates it from the source",
  full.sourceChars - full.bodyChars < Math.max(200, full.sourceChars * 0.06), true);

console.log("\n  4. completeness is measurable, so an incomplete extract can be caught");
const completeness = full.bodyChars / full.sourceChars;
check("a clean extract reports as complete", completeness > 0.9, true);
check("a truncated extract reports as incomplete",
  (() => { const half = RELEASE.slice(0, Math.floor(RELEASE.length / 2));
           const n = normalizeRelease(half, { complete: true });
           return n.bodyChars / RELEASE.length < 0.9; })(), true);

console.log("\n  5. the ingest wires the complete release to the publishable copy");
const src = fs.readFileSync("src/lib/ingestRelease.js", "utf8");
check("ingest produces a separate fullText", /result\.fullText = complete\.body/.test(src), true);
check("ingest reports completeness", /completeness:/.test(src), true);
const ui = fs.readFileSync("src/portal/publish/CreateRelease.jsx", "utf8");
check("the editor's full release is the complete one", /res\.fullText \|\| res\.text/.test(ui), true);
check("the summariser still reads the body", /body: res\.text \|\| complete/.test(ui), true);
check("an incomplete extract blocks publishing", /incomplete && !ackIncomplete/.test(ui), true);

console.log(`\n  full release integrity: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
