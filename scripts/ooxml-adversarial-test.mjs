// Phase 3C — adversarial corpus, resource limits and mutation pressure testing.
//   node scripts/ooxml-adversarial-test.mjs
//
// WHAT THIS IS FOR
// ----------------
// Not to raise a pass count. To establish where this verifier is trustworthy, and
// to force everything outside that boundary to become INDETERMINATE rather than
// quietly VERIFIED.
//
// The expected outcome of every fixture below is DECLARED BY HAND from what the
// document contains, never read back from what the implementation happens to do.
// Three declarations disagreed with the implementation when this was written; all
// three were implementation gaps (reviewer comments counted as required content,
// a diverging mc:Fallback skipped in silence, an unwalkable main part reported as
// COMPLETED with zero content) and all three were fixed at their proper layer.
//
// THE INVARIANT UNDER TEST
// ------------------------
// A meaningful change to the source must never be invisible. The mutation section
// alters one character at a time and requires that the verdict stops being
// VERIFIED -- through tokenization, whitespace handling, field handling, ignore
// rules, AlternateContent handling, ordering, or repeated-text alignment.

import fs from "node:fs";
import { inventoryDocx, LIMITS } from "../api/_ooxmlInventory.js";
import { reconcile, RUN_STATUS, VERDICT, CATEGORY } from "../api/_ooxmlReconcile.js";
import { FIXTURES } from "./fixtures/docxFixtures.mjs";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.error(`  x ${m}${x ? "\n      " + x : ""}`); } };
const eq = (g, w, m) => ok(g === w, m, `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);

/** A transcript an extraction engine would plausibly produce: blocks joined by \n. */
function engineLike(inv) {
  const b = []; let key = null, cur = null;
  for (const it of inv.items) {
    if (it.visible !== true) continue;
    const k = `${it.part}#${it.block}`;
    if (k !== key) { key = k; cur = { t: "" }; b.push(cur); }
    cur.t += it.text;
  }
  return b.map((x) => x.t).join("\n");
}
const run = async (name, opts) => {
  const inv = await inventoryDocx(await FIXTURES[name](), opts);
  return { inv, rec: reconcile({ inventory: inv, transcript: inv.ok ? engineLike(inv) : "" }) };
};

// =============================================================== A. DECLARED OUTCOMES
// Each row: fixture, expected run_status, expected verdict, why (declared from the
// document's contents, not from a previous run).
const DECLARED = [
  ["nestedTables",           RUN_STATUS.COMPLETED, VERDICT.VERIFIED,      "all four cell texts are ordinary content"],
  ["disclosureHeaderFooter", RUN_STATUS.COMPLETED, VERDICT.VERIFIED,      "header/footer disclosure is inventoried and present"],
  ["manyNotes",              RUN_STATUS.COMPLETED, VERDICT.VERIFIED,      "3 footnotes + 1 endnote, separators excluded"],
  ["hyperlinkVariants",      RUN_STATUS.COMPLETED, VERDICT.VERIFIED,      "display text is content; targets are relationships"],
  ["hiddenText",             RUN_STATUS.COMPLETED, VERDICT.VERIFIED,      "hidden text is IN the file and must be accounted for"],
  ["fieldVariants",          RUN_STATUS.COMPLETED, VERDICT.VERIFIED,      "field results are computed, not authored"],
  ["comments",               RUN_STATUS.COMPLETED, VERDICT.VERIFIED,      "reviewer comments are annotations, not disclosure"],
  ["alternateDiffering",     RUN_STATUS.COMPLETED, VERDICT.INDETERMINATE, "Choice and Fallback disagree: unknowable which renders"],
  ["chartPart",              RUN_STATUS.COMPLETED, VERDICT.INDETERMINATE, "chart text exists and is not read"],
  ["smartArt",               RUN_STATUS.COMPLETED, VERDICT.INDETERMINATE, "SmartArt node text exists and is not read"],
  ["embeddedObject",         RUN_STATUS.COMPLETED, VERDICT.INDETERMINATE, "an embedded object may contain a document"],
  ["unknownRelationship",    RUN_STATUS.COMPLETED, VERDICT.INDETERMINATE, "an unclassified relationship cannot be ruled out"],
  ["repeatedAcrossLocations",RUN_STATUS.COMPLETED, VERDICT.VERIFIED,      "four identical strings in four locations all reconcile"],
  ["emptyBoundaries",        RUN_STATUS.COMPLETED, VERDICT.VERIFIED,      "empty paragraphs carry no text"],
  ["manyRuns",               RUN_STATUS.COMPLETED, VERDICT.VERIFIED,      "one sentence split across 41 runs rejoins"],
  ["longParagraph",          RUN_STATUS.COMPLETED, VERDICT.VERIFIED,      "4000 tokens in one paragraph"],
  ["breaks",                 RUN_STATUS.COMPLETED, VERDICT.VERIFIED,      "page and line breaks are layout"],
  ["normalisationForms",     RUN_STATUS.COMPLETED, VERDICT.VERIFIED,      "NFC/NFD/RTL text round-trips byte-exactly"],
  ["misleadingContentType",  RUN_STATUS.FAILED,    null,                  "the main part cannot be walked: no inventory exists"],
  ["missingRels",            RUN_STATUS.FAILED,    null,                  "no relationships: the main part cannot be found"],
  ["deepNesting",            RUN_STATUS.FAILED,    null,                  "nesting beyond the depth limit"],
  ["encrypted",              RUN_STATUS.FAILED,    null,                  "an encrypted OOXML file is a CFB container, not a zip"],
  ["notAZip",                RUN_STATUS.FAILED,    null,                  "not a package at all"],
  ["malformedPart",          RUN_STATUS.FAILED,    null,                  "unparseable XML in a required part"],
  ["noContentTypes",         RUN_STATUS.FAILED,    null,                  "no content-type map"],
];
console.log("=== A. declared outcomes ===");
for (const [name, status, verdict, why] of DECLARED) {
  const { rec } = await run(name);
  eq(rec.run_status, status, `${name}: run_status (${why})`);
  eq(rec.verdict, verdict, `${name}: verdict (${why})`);
}

// A FAILED run must never carry a verdict, whatever the reason.
for (const [name, status] of DECLARED.filter((d) => d[1] === RUN_STATUS.FAILED)) {
  const { rec } = await run(name);
  eq(rec.verdict, null, `${name}: a FAILED run carries no verdict`);
  ok(!!rec.fatal, `${name}: a FAILED run states why`);
}

// =============================================================== B. SPECIFIC CONTENT
console.log("=== B. content-level expectations ===");
{
  const { inv } = await run("nestedTables");
  const t = inv.items.filter((i) => i.visible).map((i) => i.text).join("|");
  for (const s of ["MERGED OUTER CELL", "INNER CELL ONE", "INNER CELL TWO", "CONTINUATION CELL"])
    ok(t.includes(s), `nested tables: "${s}" inventoried`);
  ok(inv.items.some((i) => i.structures.filter((s) => s === "table").length >= 2),
     "nested tables: an inner cell records BOTH table levels");
}
{
  const { inv } = await run("manyNotes");
  eq(inv.notes.length, 4, "notes: three footnotes and one endnote recognised as content");
  const dupes = inv.items.filter((i) => i.visible && i.text === "True widths are not known.");
  eq(dupes.length, 2, "notes: two identical footnotes stay distinct items");
  ok(new Set(dupes.map((d) => d.block)).size === 2, "notes: with distinct block provenance");
}
{
  const { inv } = await run("hiddenText");
  ok(inv.items.some((i) => i.visible && /HIDDEN TEXT/.test(i.text)),
     "hidden text: counted as content -- an engine that drops it must be flagged");
}
{
  const { inv } = await run("fieldVariants");
  const results = inv.items.filter((i) => i.kind === "field_result");
  ok(results.length >= 4, `fields: every cached result classified (${results.length})`);
  ok(results.every((i) => i.visible === false), "fields: results are non-visible, with a reason");
  ok(inv.items.some((i) => i.kind === "field_result" && i.text === "NESTED RESULT"),
     "fields: a NESTED field's result is classified too");
  ok(inv.items.some((i) => i.kind === "field_code" && /TOC/.test(i.text)), "fields: TOC instruction classified");
}
{
  const { inv } = await run("comments");
  ok(inv.items.some((i) => i.kind === "comment_text" && i.visible === false),
     "comments: comment text is classified, not silently dropped");
  ok(inv.items.some((i) => i.visible && /Reviewed sentence/.test(i.text)), "comments: the body text is still content");
}
{
  const { inv } = await run("alternateDiffering");
  ok(inv.unsupported.some((u) => /Choice and mc:Fallback contain DIFFERENT/i.test(u.reason)),
     "alternate: divergent Choice/Fallback is reported as unsupported");
}
{
  const { inv } = await run("manyRuns");
  const joined = inv.items.filter((i) => i.visible).map((i) => i.text).join("");
  ok(joined.includes("Assays returned 433 g/t AgEq over 1.40 m."),
     "many runs: character-per-run text reassembles exactly");
}
{
  const { inv } = await run("normalisationForms");
  const t = inv.items.filter((i) => i.visible).map((i) => i.text).join("|");
  ok(t.includes("Café"), "unicode: NFD combining acute preserved as authored");
  ok(t.includes("Café"), "unicode: NFC precomposed preserved as authored");
  ok(t.includes("הבדיקה"), "unicode: RTL Hebrew preserved");
  ok(t.includes("العربية"), "unicode: RTL Arabic preserved");
  ok(t.includes("H₂O") && t.includes("m³"), "unicode: sub/superscripts preserved");
}

// =============================================================== C. RESOURCE LIMITS
console.log("=== C. resource limits fail closed ===");
{
  const big = await FIXTURES.baseline();
  const { inv } = { inv: await inventoryDocx(big, { maxCompressedBytes: 10 }) };
  eq(inv.ok, false, "limits: compressed size limit stops the run");
  ok(/compressed size/i.test(inv.fatal), "limits: and says so");
  eq(reconcile({ inventory: inv, transcript: "x" }).run_status, RUN_STATUS.FAILED, "limits: which FAILS the verification");
}
for (const [optName, opts, needle] of [
  ["uncompressed", { maxUncompressedBytes: 10 }, /uncompressed/i],
  ["per-part",     { maxPartBytes: 10 },         /per-part/i],
  ["entries",      { maxEntries: 1 },            /entries/i],
  ["items",        { maxItems: 1 },              /item limit/i],
  ["text chars",   { maxTextChars: 5 },          /text limit/i],
  ["xml depth",    { maxXmlDepth: 3 },           /nesting/i],
]) {
  const inv = await inventoryDocx(await FIXTURES.baseline(), opts);
  eq(inv.ok, false, `limits: ${optName} limit stops the run`);
  ok(needle.test(inv.fatal || JSON.stringify(inv.parts)), `limits: ${optName} reason is reported`);
  eq(reconcile({ inventory: inv, transcript: "x" }).run_status, RUN_STATUS.FAILED, `limits: ${optName} FAILS verification`);
}
{
  const inv = await inventoryDocx(await FIXTURES.baseline());
  eq(inv.ok, true, "limits: default limits let an ordinary document through");
  ok(typeof inv.declaredUncompressedBytes === "number", "limits: declared uncompressed size is measured before inflating");
  ok(LIMITS.maxCompressedBytes > 0 && LIMITS.maxXmlDepth > 0, "limits: the table is exported for review");
}
{
  // The alignment budget is part of the same discipline.
  const inv = await inventoryDocx(await FIXTURES.longParagraph());
  const r = reconcile({ inventory: inv, transcript: "completely different content entirely", maxEdits: 2 });
  eq(r.verdict, VERDICT.INDETERMINATE, "limits: an exhausted alignment budget is INDETERMINATE, never a guess");
}

// =============================================================== D. MUTATIONS
// One character at a time. Every one of these must stop the verdict being VERIFIED.
console.log("=== D. single-character mutations must never vanish ===");
async function mutationCheck(fixture, label, mutate, opts = {}) {
  const inv = await inventoryDocx(await FIXTURES[fixture]());
  const base = engineLike(inv);
  const clean = reconcile({ inventory: inv, transcript: base });
  if (!opts.skipBaseline) eq(clean.verdict, VERDICT.VERIFIED, `${label}: baseline reconciles first`);
  const mutated = mutate(base);
  ok(mutated !== base, `${label}: the mutation actually changed the transcript`);
  const r = reconcile({ inventory: inv, transcript: mutated });
  ok(r.verdict !== VERDICT.VERIFIED, `${label}: NOT silently VERIFIED (got ${r.verdict})`);
}

// tokenization
await mutationCheck("baseline", "mutation/drop one character", (s) => s.replace("Second", "Secnd"));
await mutationCheck("baseline", "mutation/add one character", (s) => s.replace("Second", "Seccond"));
await mutationCheck("baseline", "mutation/transpose", (s) => s.replace("Second", "Secodn"));
await mutationCheck("baseline", "mutation/change case", (s) => s.replace("Second", "second"));
await mutationCheck("baseline", "mutation/drop terminal period", (s) => s.replace("Second paragraph.", "Second paragraph"));
// numbers and units: the differences that change meaning
await mutationCheck("disclosureHeaderFooter", "mutation/decimal point", (s) => s.replace("1.40", "140"));
await mutationCheck("disclosureHeaderFooter", "mutation/digit", (s) => s.replace("433", "438"));
await mutationCheck("disclosureHeaderFooter", "mutation/unit case", (s) => s.replace("g/t", "g/T"));
await mutationCheck("disclosureHeaderFooter", "mutation/comma for decimal", (s) => s.replace("1.40", "1,40"));
// whitespace handling
await mutationCheck("baseline", "mutation/newline inside a block", (s) => s.replace("First paragraph.", "First\nparagraph."));
await mutationCheck("unicode", "mutation/NBSP to space", (s) => s.replace(/\u00a0/g, " "));
await mutationCheck("unicode", "mutation/non-breaking hyphen to hyphen", (s) => s.replace(/\u2011/g, "-"));
await mutationCheck("unicode", "mutation/curly quote straightened", (s) => s.replace(/\u2019/g, "'"));
await mutationCheck("unicode", "mutation/emoji removed", (s) => s.replace(/\ud83d\udc4d/g, ""));
// unicode
await mutationCheck("normalisationForms", "mutation/NFD to NFC", (s) => s.replace("Café", "Café"));
await mutationCheck("normalisationForms", "mutation/strip combining mark", (s) => s.replace("Café", "Cafe"));
await mutationCheck("normalisationForms", "mutation/subscript to digit", (s) => s.replace("H₂O", "H2O"));
await mutationCheck("normalisationForms", "mutation/superscript to digit", (s) => s.replace("m³", "m3"));
await mutationCheck("normalisationForms", "mutation/drop an RTL character", (s) => s.replace("הבד", "הב"));
// ignored-element rules must not become a hiding place
await mutationCheck("fieldVariants", "mutation/authored text beside fields", (s) => s.replace("Authored", "Authoredx"));
await mutationCheck("comments", "mutation/body text beside comments", (s) => s.replace("Reviewed", "Reviewedx"));
await mutationCheck("hiddenText", "mutation/hidden text altered", (s) => s.replace("HIDDEN TEXT", "HIDDEN TEXTx"));
await mutationCheck("trackedChanges", "mutation/inserted text altered", (s) => s.replace("INSERTED", "INSERTEDx"));
// structures
await mutationCheck("nestedTables", "mutation/inner cell altered", (s) => s.replace("INNER CELL ONE", "INNER CELL ON"));
await mutationCheck("manyNotes", "mutation/one footnote altered", (s) => s.replace("Grades are uncut.", "Grades are cut."));
await mutationCheck("hyperlinkVariants", "mutation/link display text altered", (s) => s.replace("Click here", "Click her"));
await mutationCheck("textboxes", "mutation/textbox text altered", (s) => s.replace("VML TEXTBOX", "VML TEXTBOXx"));
await mutationCheck("disclosureHeaderFooter", "mutation/header disclosure altered", (s) => s.replace("NOT FOR DISTRIBUTION", "FOR DISTRIBUTION"));
await mutationCheck("manyRuns", "mutation/one character of a many-run sentence", (s) => s.replace("433", "434"));

// repeated-text alignment: dropping ONE of several identical strings
{
  const inv = await inventoryDocx(await FIXTURES.repeatedAcrossLocations());
  const base = engineLike(inv);
  eq(reconcile({ inventory: inv, transcript: base }).verdict, VERDICT.VERIFIED, "repeats: baseline reconciles");
  const once = base.replace("True widths are not known.\n", "");
  const r = reconcile({ inventory: inv, transcript: once });
  ok(r.verdict !== VERDICT.VERIFIED, "repeats: dropping ONE of four identical strings is caught");
  ok(once.includes("True widths are not known."), "repeats: the string is still present (substring matching would pass)");
}
// ordering
{
  const inv = await inventoryDocx(await FIXTURES.manyNotes());
  const lines = engineLike(inv).split("\n");
  const r = reconcile({ inventory: inv, transcript: lines.slice().reverse().join("\n") });
  ok(r.verdict !== VERDICT.VERIFIED, "ordering: reversing every block is not VERIFIED");
  ok(r.counts.ORDER_DIFFERENCE > 0, "ordering: reported as ORDER_DIFFERENCE");
}
// truncation at either end
{
  const inv = await inventoryDocx(await FIXTURES.longParagraph());
  const base = engineLike(inv);
  for (const [label, t] of [["head", base.slice(20)], ["tail", base.slice(0, -20)]]) {
    const r = reconcile({ inventory: inv, transcript: t });
    ok(r.verdict !== VERDICT.VERIFIED, `truncation: losing the ${label} of a long paragraph is caught`);
  }
}
// wholesale deletion of an entire part's content
for (const [fixture, needle, label] of [
  ["disclosureHeaderFooter", "NOT FOR DISTRIBUTION", "header"],
  ["disclosureHeaderFooter", "demonstrated economic viability", "footer"],
  ["manyNotes",              "Endnote disclosure text",         "endnote"],
  ["nestedTables",           "CONTINUATION CELL",               "merged cell"],
]) {
  const inv = await inventoryDocx(await FIXTURES[fixture]());
  const t = engineLike(inv).split("\n").filter((l) => !l.includes(needle)).join("\n");
  const r = reconcile({ inventory: inv, transcript: t });
  ok(r.verdict === VERDICT.DISCREPANCY, `part loss: dropping the ${label} is a DISCREPANCY`);
  ok(r.findings.some((f) => f.category === CATEGORY.MISSING_FROM_TRANSCRIPT && f.part),
     `part loss: the ${label} omission keeps its provenance`);
}

// =============================================================== E. FUZZ
console.log("=== E. fuzz: random single-character edits ===");
{
  const inv = await inventoryDocx(await FIXTURES.disclosureHeaderFooter());
  const base = engineLike(inv);
  eq(reconcile({ inventory: inv, transcript: base }).verdict, VERDICT.VERIFIED, "fuzz: baseline reconciles");
  let checked = 0, leaked = 0;
  // Deterministic sweep, not a random seed: every non-whitespace position, one at
  // a time. A test that cannot be reproduced is not much of a guarantee.
  for (let i = 0; i < base.length; i++) {
    if (/\s/.test(base[i])) continue;
    const mutated = base.slice(0, i) + (base[i] === "X" ? "Y" : "X") + base.slice(i + 1);
    const v = reconcile({ inventory: inv, transcript: mutated }).verdict;
    checked++;
    if (v === VERDICT.VERIFIED) { leaked++; if (leaked <= 3) console.error(`      leak at ${i}: ${JSON.stringify(base.slice(Math.max(0,i-18), i+18))}`); }
  }
  eq(leaked, 0, `fuzz: ${checked} single-character substitutions, none silently VERIFIED`);
}
{
  // Deletion sweep.
  const inv = await inventoryDocx(await FIXTURES.manyNotes());
  const base = engineLike(inv);
  let checked = 0, leaked = 0;
  for (let i = 0; i < base.length; i++) {
    if (/\s/.test(base[i])) continue;
    const v = reconcile({ inventory: inv, transcript: base.slice(0, i) + base.slice(i + 1) }).verdict;
    checked++;
    if (v === VERDICT.VERIFIED) leaked++;
  }
  eq(leaked, 0, `fuzz: ${checked} single-character deletions, none silently VERIFIED`);
}

// =============================================================== F. KINGSMEN, UNCHANGED
console.log("=== F. Kingsmen acceptance, unchanged through 3C ===");
const KNG = process.env.MINEEX_ACCEPTANCE_DOCX
  || "/Users/leifer/Downloads/KNG News Release - FINAL AUG 20 (2).docx";  // local only; set MINEEX_ACCEPTANCE_DOCX elsewhere. Absent -> this section skips.
if (fs.existsSync(KNG)) {
  const buf = fs.readFileSync(KNG);
  const inv = await inventoryDocx(buf);
  const mammoth = (await import("mammoth")).default || (await import("mammoth"));
  const T = String((await mammoth.extractRawText({ buffer: buf })).value || "");
  const r = reconcile({ inventory: inv, transcript: T });
  eq(r.run_status, RUN_STATUS.COMPLETED, "kingsmen: still COMPLETED");
  eq(r.verdict, VERDICT.DISCREPANCY, "kingsmen: still DISCREPANCY");
  eq(r.counts.MISSING_FROM_TRANSCRIPT, 1, "kingsmen: still exactly one omission");
  eq(r.counts.MISSING_CHARS, 390, "kingsmen: still 390 characters");
  eq(r.counts.UNSUPPORTED_SOURCE_ELEMENT, 0, "kingsmen: still no unsupported construct");
  eq(r.indeterminateReasons.length, 0, "kingsmen: still nothing unexplained");
  ok(r.layout.every((l) => l.justified), "kingsmen: every separator still justified");
} else {
  console.warn("  (Kingsmen DOCX not present -- acceptance skipped)");
}

console.log(`\nooxml adversarial: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
