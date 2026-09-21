// Phase 3A — independent OOXML inventory tests.
//   node scripts/ooxml-inventory-test.mjs
//
// WHY THIS EXISTS
// ---------------
// Phase 2 proved MineEx preserves what mammoth returned. It could not prove
// mammoth returned everything. On the real Kingsmen release mammoth silently
// dropped a 390-character footnote of cautionary disclosure and warned about
// nothing. The inventory is the second, independent reading that makes such a gap
// findable -- so these tests are mostly about the ways a document can hide text.
//
// The fixtures are built in-process (see fixtures/docxFixtures.mjs) rather than
// committed as binaries, so every structure under test is readable in a diff.

import fs from "node:fs";
import { inventoryDocx, visibleTextOf, INVENTORY_ENGINE, INVENTORY_VERSION } from "../api/_ooxmlInventory.js";
import { FIXTURES } from "./fixtures/docxFixtures.mjs";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.error(`  x ${m}${x ? "\n      " + x : ""}`); } };
const eq = (g, w, m) => ok(g === w, m, `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);
const vis = (r, part) => r.items.filter((i) => i.visible === true && (!part || i.part === part));
const text = (r, part) => visibleTextOf(r, part);

// ---- baseline ---------------------------------------------------------------
{
  const r = await inventoryDocx(await FIXTURES.baseline());
  ok(r.ok, "baseline: inventory succeeds");
  eq(r.engine, INVENTORY_ENGINE, "baseline: engine identity recorded");
  eq(r.version, INVENTORY_VERSION, "baseline: version recorded");
  ok(/^[0-9a-f]{64}$/.test(r.packageSha256), "baseline: package sha256 recorded");
  ok(text(r).includes("First paragraph."), "baseline: body text inventoried");
  eq(vis(r).length, 3, "baseline: three visible runs");
  eq(r.parts.length, 1, "baseline: exactly one part discovered");
  ok(r.parts[0].sha256 && /^[0-9a-f]{64}$/.test(r.parts[0].sha256), "baseline: per-part digest computed");
  eq(r.unsupported.length, 0, "baseline: nothing unsupported");
}

// ---- THE REGRESSION: footnotes ----------------------------------------------
{
  const r = await inventoryDocx(await FIXTURES.footnotes());
  ok(r.ok, "footnotes: inventory succeeds");
  ok(r.parts.some((p) => p.kind === "footnotes"), "footnotes: the part is discovered via its relationship");
  ok(text(r, "word/footnotes.xml").includes("REAL FOOTNOTE CONTENT"),
     "footnotes: real footnote content IS inventoried");
  ok(!text(r).includes("SEPARATOR MUST NOT COUNT"), "footnotes: separator note excluded");
  ok(!text(r).includes("CONTINUATION MUST NOT COUNT"), "footnotes: continuation separator excluded");
  eq(r.notes.length, 1, "footnotes: exactly one real note recorded");
  eq(r.notes[0].id, 2, "footnotes: the real note keeps its id");
  eq(r.notes[0].type, "normal", "footnotes: the real note is typed normal");
  ok(r.ignored.filter((g) => g.kind === "note_separator").length === 2,
     "footnotes: both separators recorded as explicit ignores, not silently dropped");
  const fn = vis(r, "word/footnotes.xml")[0];
  ok(fn && fn.structures.includes("footnote"), "footnotes: item carries the footnote structure");
  ok(fn && /footnote/.test(fn.path), "footnotes: item path locates it in the XML");
}

// ---- headers / footers ------------------------------------------------------
{
  const r = await inventoryDocx(await FIXTURES.headersFooters());
  ok(text(r).includes("HEADER TEXT HERE"), "headers: header text inventoried");
  ok(text(r).includes("FOOTER TEXT HERE"), "footers: footer text inventoried");
  ok(!text(r).includes("PAGE"), "footers: PAGE field instruction is not visible text");
  ok(r.items.some((i) => i.kind === "field_code" && i.visible === false),
     "footers: the field code is recorded as an explicitly non-visible item");
  ok(vis(r, "word/header1.xml").some((i) => i.structures.includes("header")),
     "headers: items carry the header structure");
}

// ---- tables -----------------------------------------------------------------
{
  const r = await inventoryDocx(await FIXTURES.tables());
  for (const t of ["Hole", "Grade", "LC-26-014", "433 g/t"]) ok(text(r).includes(t), `tables: cell text "${t}" inventoried`);
  const cell = vis(r).find((i) => i.text === "LC-26-014");
  ok(cell && cell.structures.includes("table"), "tables: item knows it is in a table");
  ok(cell && cell.structures.includes("table_cell"), "tables: item knows its cell");
}

// ---- text boxes -------------------------------------------------------------
{
  const r = await inventoryDocx(await FIXTURES.textboxes());
  ok(text(r).includes("DRAWINGML TEXTBOX TEXT"), "textbox: DrawingML text box inventoried");
  ok(text(r).includes("VML TEXTBOX TEXT"), "textbox: VML text box inventoried");
  ok(vis(r).some((i) => i.structures.includes("textbox")), "textbox: structure recorded");
}

// ---- hyperlinks -------------------------------------------------------------
{
  const r = await inventoryDocx(await FIXTURES.hyperlinks());
  ok(text(r).includes("CLICK THIS LINK TEXT"), "hyperlink: display text inventoried");
  ok(vis(r).some((i) => i.structures.includes("hyperlink")), "hyperlink: structure recorded");
  ok(!text(r).includes("example.com"), "hyperlink: the target URL is not inventoried as visible text");
}

// ---- tracked changes --------------------------------------------------------
{
  const r = await inventoryDocx(await FIXTURES.trackedChanges());
  ok(text(r).includes("INSERTED VISIBLE TEXT"), "tracked: insertion is visible");
  ok(!text(r).includes("DELETED INVISIBLE TEXT"), "tracked: deletion is NOT visible");
  const del = r.items.find((i) => i.kind === "deleted");
  ok(del && del.visible === false, "tracked: deletion recorded explicitly as non-visible");
  ok(del && /tracked deletion/i.test(del.reason || ""), "tracked: deletion carries a reason");
  ok(vis(r).some((i) => i.structures.includes("insertion")), "tracked: insertion structure recorded");
}

// ---- mc:AlternateContent ----------------------------------------------------
{
  const r = await inventoryDocx(await FIXTURES.alternateContent());
  const hits = vis(r).filter((i) => i.text === "SHAPE TEXT ONCE").length;
  eq(hits, 1, "alternate: shape text counted exactly ONCE, not twice");
  ok(r.ignored.some((g) => g.kind === "alternate_fallback"),
     "alternate: the discarded Fallback is recorded as an explicit ignore");
}

// ---- unknown elements: the point of the whole exercise ----------------------
{
  const r = await inventoryDocx(await FIXTURES.unknownElement());
  ok(text(r).includes("Known text."), "unknown: known text still inventoried");
  const unk = r.items.find((i) => i.kind === "unknown_text");
  ok(!!unk, "unknown: text in an unrecognised element is SURFACED, not dropped");
  ok(unk && unk.visible === null, "unknown: visibility is null (undecided), never assumed");
  ok(unk && unk.text.includes("TEXT INSIDE AN UNKNOWN ELEMENT"), "unknown: the text itself is preserved");
  ok(r.unsupported.length >= 1, "unknown: an unsupported record is emitted");
  ok(r.unsupported.some((u) => u.element === "someFutureThing"), "unknown: the element name is reported");
  eq(r.stats.unknownItems, 1, "unknown: counted in stats so a verdict can refuse to ignore it");
}

// ---- Unicode is preserved exactly -------------------------------------------
{
  const r = await inventoryDocx(await FIXTURES.unicode());
  const t = text(r);
  ok(t.includes("100 m"), "unicode: U+00A0 preserved, not folded to a space");
  ok(t.includes("C$30 million"), "unicode: second U+00A0 preserved");
  ok(t.includes("‘quotes’"), "unicode: curly single quotes preserved");
  ok(t.includes("“doubles”"), "unicode: curly double quotes preserved");
  ok(t.includes("—") && t.includes("–"), "unicode: em and en dashes preserved");
  ok(t.includes("‑"), "unicode: non-breaking hyphen preserved");
  ok(t.includes("±") && t.includes("°") && t.includes("⁵"), "unicode: math symbols preserved");
  ok(t.includes("αβγ"), "unicode: Greek preserved");
  ok(t.includes("👍"), "unicode: surrogate pair preserved");
}

// ---- repeated text keeps distinct provenance --------------------------------
{
  const r = await inventoryDocx(await FIXTURES.repeated());
  const same = vis(r).filter((i) => i.text === "Identical paragraph.");
  eq(same.length, 3, "repeated: three identical paragraphs are three distinct items");
  eq(new Set(same.map((i) => i.order)).size, 3, "repeated: each has its own order index");
}

// ---- character-standing elements --------------------------------------------
{
  const r = await inventoryDocx(await FIXTURES.charElements());
  const t = text(r);
  ok(t.includes("\t"), "chars: w:tab contributes a tab");
  ok(t.includes("\n"), "chars: w:br contributes a newline");
  ok(r.items.some((i) => i.kind === "symbol"), "chars: w:sym is decoded to a character");
  ok(t.includes("µ"), "chars: w:sym char=00B5 decodes to micro sign");
}

// ---- prefix independence ----------------------------------------------------
{
  const r = await inventoryDocx(await FIXTURES.oddPrefixes());
  ok(r.ok, "prefixes: a document binding 'w' elsewhere still parses");
  ok(text(r).includes("PREFIX INDEPENDENT TEXT"),
     "prefixes: elements matched by namespace URI, not by prefix string");
}

// ---- failure modes are facts, not crashes -----------------------------------
{
  const r = await inventoryDocx(await FIXTURES.notAZip());
  eq(r.ok, false, "not-a-zip: reports failure");
  ok(/could not be opened/i.test(r.fatal || ""), "not-a-zip: fatal reason explains why");
}
{
  const r = await inventoryDocx(await FIXTURES.noContentTypes());
  eq(r.ok, false, "no content types: reports failure");
  ok(/Content_Types/i.test(r.fatal || ""), "no content types: fatal reason names the missing part");
}
{
  const r = await inventoryDocx(await FIXTURES.malformedPart());
  eq(r.ok, false, "malformed part: reports failure rather than a short inventory");
  ok(r.parts.some((p) => p.error), "malformed part: the failing part is identified");
}
{
  const r = await inventoryDocx(await FIXTURES.missingPart());
  ok(r.ok, "missing part: the rest of the package still inventories");
  const mp = r.parts.find((p) => p.name === "word/footnotes.xml");
  ok(mp && /absent from the package/i.test(mp.error || ""),
     "missing part: a referenced-but-absent part is reported, not ignored");
}

// ---- the real Kingsmen document ---------------------------------------------
const KNG = process.env.MINEEX_ACCEPTANCE_DOCX
  || "/Users/leifer/Downloads/KNG News Release - FINAL AUG 20 (2).docx";  // local only; set MINEEX_ACCEPTANCE_DOCX elsewhere. Absent -> this section skips.
if (fs.existsSync(KNG)) {
  const r = await inventoryDocx(fs.readFileSync(KNG));
  ok(r.ok, "kingsmen: inventory succeeds");
  eq(r.packageSha256, "edc17a02484facefbae3a8e985b84d6b7018420da14b34e79e096c0cbcf3b92b",
     "kingsmen: package digest matches the stored documents.sha256");
  eq(r.parts.length, 9, "kingsmen: nine parts discovered through relationships");
  eq(r.stats.unknownItems, 0, "kingsmen: no unrecognised text-bearing construct");
  eq(r.stats.unsupported, 0, "kingsmen: nothing unsupported");
  eq(r.notes.length, 1, "kingsmen: exactly one real footnote");
  const fnText = text(r, "word/footnotes.xml").trim();
  eq(fnText.length, 390, "kingsmen: the footnote is exactly 390 characters");
  ok(fnText.startsWith("The interpretation of undrilled ground"), "kingsmen: footnote text captured verbatim");
  ok(fnText.includes("inherently uncertain"), "kingsmen: the cautionary language is present");
  ok(fnText.includes("no assurance that further drilling"), "kingsmen: the no-assurance language is present");
  const doc = r.parts.find((p) => p.kind === "document");
  eq(doc.visibleChars, 10231, "kingsmen: document.xml visible characters");
  ok(r.ignored.filter((g) => g.kind === "note_separator").length === 6,
     "kingsmen: six separator notes ignored (3 footnote + 3 endnote)");
  ok(r.ignored.some((g) => g.kind === "alternate_fallback"), "kingsmen: the mc:Fallback is skipped once");
} else {
  console.warn("  (Kingsmen DOCX not present -- its assertions were skipped)");
}

// ---- the authoritative value is never normalised ----------------------------
{
  const r = await inventoryDocx(await FIXTURES.unicode());
  ok(r.items.every((i) => typeof i.text === "string"), "fidelity: every item carries raw text");
  ok(r.items.some((i) => / /.test(i.text)), "fidelity: raw text still contains U+00A0");
  ok(r.items.every((i) => i.part && typeof i.order === "number"),
     "provenance: every item carries part and order");
  ok(r.items.every((i) => typeof i.path === "string"), "provenance: every item carries an XML path");
  ok(r.items.every((i) => Array.isArray(i.structures)), "provenance: every item carries its structures");
}

console.log(`\nooxml inventory: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
