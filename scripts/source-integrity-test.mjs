// Source integrity — Phase 1 regression tests (no I/O beyond the real fixture).
//   node scripts/source-integrity-test.mjs
//
// WHY THIS EXISTS
// ---------------
// formatReleaseText() silently deleted substantive disclosure from a real release.
// isGarbageLine() dropped any line matching /https?:\/\//, a rule written for PDF
// extraction where a "line" is a visual line. Mammoth emits one line per PARAGRAPH,
// so a paragraph that merely CITED a URL was deleted whole. On the real Kingsmen
// release that removed the NI 43-101 silver-equivalent calculation formula (842
// chars) and the project location description (471 chars), and it affected 14 of
// 144 releases in the regression corpus.
//
// The governing rule: MineEx must never silently alter, omit or invent source
// content. False rejection is acceptable; silent corruption is not. So these tests
// assert retention, not tidiness — a retained caption is noise, a deleted
// disclosure is corruption.

import { isLinkFurniture, formatReleaseText } from "../src/lib/pressRelease.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const keeps = (line, m) => ok(!isLinkFurniture(line), `KEEPS ${m}\n      line: ${JSON.stringify(line.slice(0, 96))}`);
const drops = (line, m) => ok(isLinkFurniture(line), `DROPS ${m}\n      line: ${JSON.stringify(line.slice(0, 96))}`);

// ---- 1. standalone URL garbage ---------------------------------------------
drops("https://www.kingsmenresources.com/post/kingsmen-announces-private-placement", "a bare href");
drops("http://example.com/a/b/c", "a bare http link");
drops("www.kingsmenresources.com", "a bare www host");
drops("https://images.newsfilecorp.com/files/9640/216612_cd1da4c0.jpg", "a bare image link");

// ---- 2. tracking / navigation URLs -----------------------------------------
drops("c212.net/c/link/?t=0&l=en&o=123456-1&h=987", "a PR Newswire tracking redirect");
drops("https://www.prnewswire.com/c/link/?t=0&l=en", "a /c/link tracking URL");
drops("visit:https://images.newsfilecorp.com/files/9640/242961_f37fbee.jpg", "a 'visit:' link fragment");
drops("more about the SDMIA here: https://sdmineralindustries.org/", "a short link label");
drops("EST. Please register at: https://attendee.gotowebinar.com/register/57085361", "a registration link line");

// ---- 3. legitimate prose containing one URL --------------------------------
keeps(
  "Las Coloradas is in the Parral mining district of the Central Mexican Silver Belt, approximately 30 kilometres from the La Cigarra deposit (https://kootenaysilver.com/projects/la-cigarra), a deposit with similar style mineralization.",
  "prose with a single cited URL");
keeps(
  "The Company has filed its annual information form on SEDAR+ at https://www.sedarplus.ca and shareholders may obtain a copy without charge upon request.",
  "prose citing a regulatory filing URL");

// ---- 4. THE REGRESSION: technical disclosure containing a URL ---------------
const AGEQ = "The silver equivalent calculation formula is AgEq(g/t) = ((Ag grade (g/t) x (Ag price per ounce/31.10348) x Ag recovery) + (Pb grade (%) x (Pb price per tonne/100) x Pb recovery) + (Zn grade (%) x (Zn price per tonne/100) x Zn recovery)) and is comparable to the La Cigarra deposit, Chihuahua, Mexico, a deposit with similar style mineralization (https://kootenaysilver.com/news/kootenay/2024/kootenay-silver-announces-results).";
keeps(AGEQ, "the NI 43-101 AgEq formula paragraph");
ok(formatReleaseText(AGEQ).includes("AgEq(g/t)"), "the AgEq formula survives formatReleaseText intact");
ok(formatReleaseText(AGEQ).includes("31.10348"), "the numeric constant inside the formula survives");
ok(formatReleaseText(AGEQ).includes("Zn recovery"), "the end of the formula survives");

// ---- 5. multiple URLs inside legitimate prose ------------------------------
keeps(
  "Further detail appears in the Company's technical report (https://a.example.com/tr.pdf) and in the accompanying figures (https://b.example.com/fig.jpg), both filed under the Company's profile.",
  "prose citing two URLs");
keeps(
  "See https://one.example.com and https://two.example.com and https://three.example.com for the complete assay tables referenced throughout this release.",
  "prose citing three URLs");

// ---- 6. URL at the beginning / end of substantive prose --------------------
keeps(
  "https://encoreuranium.com/investors/annual-report/. enCore has made solid progress toward becoming a domestic uranium producer during the period under review.",
  "URL at the START of substantive prose");
keeps(
  "Drilling has now intersected the Mine zone across a minimum strike length of 106 metres, in three fences spaced 50 metres apart, to a vertical depth of 155 metres. https://kingsmenresources.com/figures",
  "URL at the END of substantive prose");

// ---- 7. footnote citations are content, not furniture ----------------------
keeps("¹ Queenston Mining Inc. news release July 8, 2005. ² http://pdf.secdatabase.com/241/0001137171.pdf",
      "a footnote citation carrying a URL");

// ---- 8. non-URL lines are unaffected by this rule ---------------------------
for (const l of ["KINGSMEN DRILLS 1.40 METRES OF 433 G/T AgEq AT LAS COLORADAS",
                 "Vancouver, British Columbia--(August 20, 2026) - Kingsmen Resources Ltd.",
                 "About Kingsmen Resources", ""])
  ok(!isLinkFurniture(l), `unaffected (no URL): ${JSON.stringify(l.slice(0, 60))}`);

// ---- 9. THE REAL FAILURE SHAPE, end to end ---------------------------------
// A paragraph-per-line document, exactly how mammoth emits DOCX. Before the fix,
// paragraph 3 vanished entirely because of the URL inside it.
const REAL_SHAPE = [
  "TSX-V: KNG OTCQB: KNGRF",
  "KINGSMEN DRILLS 1.40 METRES OF 433 G/T AgEq AT LAS COLORADAS",
  "Vancouver, British Columbia--(August 20, 2026) - Kingsmen Resources Ltd. reported assay results from two diamond drill holes.",
  AGEQ,
  "Las Coloradas is in the Parral mining district of the Central Mexican Silver Belt, and is located approximately 30 kilometres from La Cigarra (https://kootenaysilver.com).",
  "https://www.kingsmenresources.com/post/kingsmen-drills",
].join("\n");
const formatted = formatReleaseText(REAL_SHAPE);
ok(formatted.includes("AgEq(g/t)"), "real shape: the formula paragraph survives");
ok(formatted.includes("Parral mining district"), "real shape: the location paragraph survives");
ok(formatted.includes("31.10348"), "real shape: formula constants survive");
ok(!formatted.includes("post/kingsmen-drills"), "real shape: the bare trailing link is still dropped");

// A paragraph must survive WHOLE, not partially.
const para = formatted.split("\n").find((l) => l.includes("AgEq(g/t)")) || "";
ok(para.includes("Zn recovery"), "real shape: the formula paragraph is not truncated mid-way");

// ---- 10. RETAINED TEXT IS SOURCE-FAITHFUL ----------------------------------
// The Release Body used to encode presentation into the text: "# "/"## " prefixes
// were injected onto heading lines, their trailing colon was deleted, and /\s+/
// rewrote every U+00A0 to a plain space. Investors never saw the markers (the
// renderer stripped them again), but the STORED text was no longer the document's
// text, which makes every later fidelity check argue with itself.
import { normalizeRelease } from "../src/lib/pressRelease.js";
const NBSP = "\u00a0";

const HEADINGS = [
  "Highlights:",
  "QAQC",
  "About Las Coloradas",
  "Table 1 Collars",
].join("\n\n") + "\n\nBody sentence that is long enough to read as ordinary prose rather than a heading.";
const hn = normalizeRelease(HEADINGS, { sourceKind: "docx" });

ok(!/(^|\n)#{1,2} /.test(hn.body), "no '#' or '##' is injected into the Release Body");
ok(hn.body.includes("Highlights:"), "a heading keeps its trailing colon");
ok(!hn.body.includes("Highlights\n"), "the colon is not silently deleted");
ok(hn.blocks.length >= 3, `headings are reported as presentation metadata (${hn.blocks.length})`);
ok(hn.blocks.every((b) => b.kind === "heading" && Number.isInteger(b.line) && b.text),
   "each block carries a line index and its verbatim text");
ok(hn.blocks.every((b) => hn.body.split("\n")[b.line] === b.text),
   "every block's line index points at that exact line of the body");
for (const h of ["QAQC", "About Las Coloradas"])
  ok(hn.blocks.some((b) => b.text === h), `'${h}' is marked as a heading WITHOUT altering its text`);
ok(hn.blocks.every((b) => !/^#/.test(b.text)), "block text carries no formatting characters");

// U+00A0 must survive everywhere a character survives.
const NB_SRC = `Assays returned 100${NBSP}m of C$30${NBSP}million grade over the${NBSP}zone tested here.`;
const nb = normalizeRelease(NB_SRC, { sourceKind: "docx" });
ok(nb.body.includes(NBSP), "U+00A0 is preserved in the body");
ok((nb.body.match(new RegExp(NBSP, "g")) || []).length === 3, "every U+00A0 survives, not just the first");
ok(nb.body.includes(`100${NBSP}m`), "a non-breaking space inside a measurement is preserved");
// Leading/trailing NBSP: String.prototype.trim() strips it, so the narrow trim matters.
const edge = normalizeRelease(`${NBSP}Leading and trailing nbsp on this line${NBSP}`, { sourceKind: "docx" });
ok((edge.body.match(new RegExp(NBSP, "g")) || []).length === 2, "line-edge U+00A0 is not trimmed away");

// Plain spaces and tabs still collapse -- that is layout, not identity.
const sp = normalizeRelease("Word    spaced\tby   tabs and spaces in one line here.", { sourceKind: "docx" });
ok(!/  /.test(sp.body) && !/\t/.test(sp.body), "runs of spaces and tabs still collapse");

// ---- 11. ACCOUNTING IS SPLIT THREE WAYS ------------------------------------
ok(Array.isArray(hn.exclusions) && Array.isArray(hn.layout) && Array.isArray(hn.mutations),
   "accounting separates exclusions, layout-only changes and textual mutations");
ok(hn.transformations.every((x) => typeof x.class === "string"),
   "every transformation declares its class");
ok(hn.layout.every((x) => x.class === "layout"), "layout bucket holds only layout changes");
ok(hn.mutations.every((x) => x.class === "mutation"), "mutation bucket holds only textual mutations");
ok(typeof hn.mutationCount === "number", "a mutation count is reported");

// A DOCX with no hyphen-wrapping and no control characters should mutate NOTHING.
ok(normalizeRelease(HEADINGS, { sourceKind: "docx" }).mutationCount === 0,
   "a clean DOCX produces ZERO textual mutations");

console.log(`\nsource integrity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
