// Phase 3B — deterministic reconciliation tests.
//   node scripts/ooxml-reconcile-test.mjs
//
// WHY THIS EXISTS
// ---------------
// The verifier's whole job is to say, without a score or a guess, whether the
// immutable transcript accounts for the package. These tests are about the ways
// that judgement can go wrong: text that is present twice satisfying one source
// occurrence, whitespace differences swallowing a missing character, a moved
// paragraph counted as both lost and invented, an unknown construct waved through.
//
// Most transcripts here are synthesised from the inventory (blocks joined by "\n",
// which is how an engine like mammoth emits paragraphs) and then deliberately
// damaged. That makes the categories testable in isolation. The REAL mammoth
// transcript is used for the Kingsmen acceptance test, where nothing is synthetic.

import fs from "node:fs";
import { inventoryDocx } from "../api/_ooxmlInventory.js";
import {
  reconcile, sourceTokens, RUN_STATUS, VERDICT, CATEGORY, DISPOSITION,
  RECONCILER, RECONCILER_VERSION, RULESET_VERSION,
} from "../api/_ooxmlReconcile.js";
import { FIXTURES } from "./fixtures/docxFixtures.mjs";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.error(`  x ${m}${x ? "\n      " + x : ""}`); } };
const eq = (g, w, m) => ok(g === w, m, `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);
const cat = (r, c) => r.findings.filter((f) => f.category === c);

/** An engine-like transcript: visible blocks in order, joined by newlines. */
function engineLike(inv) {
  const blocks = [];
  let key = null, cur = null;
  for (const it of inv.items) {
    if (it.visible !== true) continue;
    const k = `${it.part}#${it.block}`;
    if (k !== key) { key = k; cur = { text: "" }; blocks.push(cur); }
    cur.text += it.text;
  }
  return blocks.map((b) => b.text).join("\n");
}
const inv = async (name) => inventoryDocx(await FIXTURES[name]());

// ---- exact reconciliation ---------------------------------------------------
{
  const i = await inv("baseline");
  const r = reconcile({ inventory: i, transcript: engineLike(i) });
  eq(r.run_status, RUN_STATUS.COMPLETED, "exact: run completes");
  eq(r.verdict, VERDICT.VERIFIED, "exact: verdict is VERIFIED");
  eq(r.counts.MISSING_FROM_TRANSCRIPT, 0, "exact: nothing missing");
  eq(r.counts.UNEXPECTED_IN_TRANSCRIPT, 0, "exact: nothing unexpected");
  eq(r.counts.ORDER_DIFFERENCE, 0, "exact: nothing reordered");
  ok(r.counts.MATCHED > 0, "exact: tokens matched");
  eq(r.reconciler, RECONCILER, "exact: reconciler identity recorded");
  eq(r.reconcilerVersion, RECONCILER_VERSION, "exact: reconciler version recorded");
  eq(r.rulesetVersion, RULESET_VERSION, "exact: ruleset version recorded");
  ok(/^[0-9a-f]{64}$/.test(r.transcriptSha256), "exact: transcript hash recorded");
}

// ---- engine paragraph separators are LAYOUT, proven structurally ------------
{
  const i = await inv("baseline");
  const r = reconcile({ inventory: i, transcript: engineLike(i) });
  eq(r.verdict, VERDICT.VERIFIED, "separators: newlines between paragraphs do not block VERIFIED");
  ok(r.layout.length >= 2, `separators: recorded as layout (${r.layout.length})`);
  ok(r.layout.every((l) => l.justified), "separators: every one is justified");
  ok(r.layout.every((l) => l.fromBlock !== l.toBlock), "separators: each sits between DIFFERENT source blocks");
  eq(r.counts.UNEXPECTED_IN_TRANSCRIPT, 0, "separators: never counted as invented content");
}
{
  // A newline INSIDE a block, with no break element to explain it, must not pass.
  const i = await inv("baseline");
  const t = engineLike(i).replace("First paragraph.", "First\nparagraph.");
  const r = reconcile({ inventory: i, transcript: t });
  ok(r.layout.some((l) => !l.justified), "separators: an unexplained in-block newline is flagged unjustified");
  eq(r.verdict, VERDICT.INDETERMINATE, "separators: an unexplained separator yields INDETERMINATE, not VERIFIED");
}
{
  // The same difference IS justified when a break element produced it.
  const i = await inv("charElements");
  const t = engineLike(i).replace(/\t/g, " ").replace(/Before \n?After/, "Before After");
  const r = reconcile({ inventory: i, transcript: t });
  ok(r.layout.some((l) => l.justified && /break|tab/.test(l.reason || "")),
     "separators: a tab/break element structurally justifies a whitespace difference");
}

// ---- missing text -----------------------------------------------------------
{
  const i = await inv("baseline");
  const r = reconcile({ inventory: i, transcript: engineLike(i).replace("Second paragraph.\n", "") });
  eq(r.run_status, RUN_STATUS.COMPLETED, "missing: run still completes");
  eq(r.verdict, VERDICT.DISCREPANCY, "missing: verdict is DISCREPANCY");
  const m = cat(r, CATEGORY.MISSING_FROM_TRANSCRIPT);
  eq(m.length, 1, "missing: one contiguous run reported");
  ok(m[0].excerpt.includes("Second paragraph."), "missing: the excerpt names the lost text");
  ok(m[0].part && m[0].path, "missing: provenance retained (part + path)");
  ok(typeof m[0].block === "number", "missing: block index retained");
  ok(m[0].disposition, "missing: a disposition is assigned");
}

// ---- unexpected transcript text ---------------------------------------------
{
  const i = await inv("baseline");
  const r = reconcile({ inventory: i, transcript: engineLike(i) + "\nINVENTED SENTENCE NOT IN THE PACKAGE." });
  eq(r.verdict, VERDICT.DISCREPANCY, "unexpected: verdict is DISCREPANCY");
  const u = cat(r, CATEGORY.UNEXPECTED_IN_TRANSCRIPT);
  eq(u.length, 1, "unexpected: one run reported");
  ok(u[0].excerpt.includes("INVENTED"), "unexpected: the excerpt shows the untraceable text");
  ok(typeof u[0].transcriptOffset === "number", "unexpected: transcript offset retained");
  eq(u[0].disposition, DISPOSITION.NON_SUPPLEMENTABLE, "unexpected: never supplementable");
}

// ---- repeated identical paragraphs: the substring trap ----------------------
{
  const i = await inv("repeated");
  const full = engineLike(i);
  const r0 = reconcile({ inventory: i, transcript: full });
  eq(r0.verdict, VERDICT.VERIFIED, "repeated: all three occurrences reconcile");

  // Drop ONE of three identical paragraphs. A substring check would still find the
  // text and call it present; one-to-one alignment must report it missing.
  const dropped = full.replace("Identical paragraph.\n", "");
  const r1 = reconcile({ inventory: i, transcript: dropped });
  eq(r1.verdict, VERDICT.DISCREPANCY, "repeated: dropping ONE of three identical paragraphs is detected");
  const missing = cat(r1, CATEGORY.MISSING_FROM_TRANSCRIPT);
  ok(missing.length >= 1, "repeated: the missing occurrence is reported");
  ok(dropped.includes("Identical paragraph."), "repeated: the text IS still present elsewhere (substring would pass)");
  const srcCount = sourceTokens(i).filter((t) => t.text === "paragraph.").length;
  eq(srcCount, 3, "repeated: three distinct source occurrences exist");
}

// ---- reordered content ------------------------------------------------------
{
  const i = await inv("baseline");
  const blocks = engineLike(i).split("\n");
  const r = reconcile({ inventory: i, transcript: [blocks[2], blocks[1], blocks[0]].join("\n") });
  eq(r.run_status, RUN_STATUS.COMPLETED, "reorder: run completes");
  ok(r.counts.ORDER_DIFFERENCE > 0, `reorder: ORDER_DIFFERENCE reported (${r.counts.ORDER_DIFFERENCE})`);
  eq(r.counts.MISSING_FROM_TRANSCRIPT, 0, "reorder: moved text is NOT also counted as missing");
  eq(r.counts.UNEXPECTED_IN_TRANSCRIPT, 0, "reorder: moved text is NOT also counted as invented");
  eq(r.verdict, VERDICT.DISCREPANCY, "reorder: verdict is DISCREPANCY");
  const o = cat(r, CATEGORY.ORDER_DIFFERENCE)[0];
  ok(typeof o.sourceIndex === "number" && typeof o.transcriptIndex === "number",
     "reorder: both positions retained");
}

// ---- unsupported / unknown OOXML dominates ----------------------------------
{
  const i = await inv("unknownElement");
  const r = reconcile({ inventory: i, transcript: engineLike(i) });
  eq(r.run_status, RUN_STATUS.COMPLETED, "unknown: run completes");
  eq(r.verdict, VERDICT.INDETERMINATE, "unknown: an unrecognised construct yields INDETERMINATE");
  ok(cat(r, CATEGORY.UNSUPPORTED_SOURCE_ELEMENT).length >= 1, "unknown: reported as UNSUPPORTED_SOURCE_ELEMENT");
  ok(cat(r, CATEGORY.UNSUPPORTED_SOURCE_ELEMENT).every((f) => f.disposition === DISPOSITION.NON_SUPPLEMENTABLE),
     "unknown: never supplementable");
}
{
  // INDETERMINATE dominates DISCREPANCY: an incomplete picture must not be
  // reported as a complete list of known differences.
  const i = await inv("unknownElement");
  // This fixture's only visible block IS "Known text.", so dropping it means an
  // empty transcript -- a real omission alongside the unrecognised construct.
  const r = reconcile({ inventory: i, transcript: "" });
  ok(r.counts.MISSING_FROM_TRANSCRIPT > 0, "precedence: a real omission is present too");
  eq(r.verdict, VERDICT.INDETERMINATE, "precedence: INDETERMINATE outranks DISCREPANCY");
}

// ---- Unicode-sensitive differences ------------------------------------------
{
  const i = await inv("unicode");
  const good = engineLike(i);
  eq(reconcile({ inventory: i, transcript: good }).verdict, VERDICT.VERIFIED, "unicode: exact text reconciles");

  const cases = [
    ["U+00A0 folded to a space",      (s) => s.replace(/ /g, " ")],
    ["curly quotes straightened",     (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')],
    ["em dash to hyphen",             (s) => s.replace(/—/g, "-")],
    ["non-breaking hyphen to hyphen", (s) => s.replace(/‑/g, "-")],
    ["superscript to digit",          (s) => s.replace(/⁵/g, "5")],
    ["degree sign dropped",           (s) => s.replace(/°/g, "")],
    ["plus-minus to plus",            (s) => s.replace(/±/g, "+")],
    ["Greek transliterated",          (s) => s.replace(/αβγ/g, "abg")],
    ["emoji dropped",                 (s) => s.replace(/👍/g, "")],
  ];
  for (const [label, mangle] of cases) {
    const r = reconcile({ inventory: i, transcript: mangle(good) });
    ok(r.verdict !== VERDICT.VERIFIED, `unicode: ${label} is NOT silently accepted`);
  }
}

// ---- structures: tables, headers/footers, notes, text boxes, hyperlinks -----
for (const [name, needle, label] of [
  ["tables",          "LC-26-014",              "tables"],
  ["headersFooters",  "HEADER TEXT HERE",       "headers"],
  ["headersFooters",  "FOOTER TEXT HERE",       "footers"],
  ["footnotes",       "REAL FOOTNOTE CONTENT",  "footnotes"],
  ["textboxes",       "DRAWINGML TEXTBOX TEXT", "text boxes"],
  ["hyperlinks",      "CLICK THIS LINK TEXT",   "hyperlinks"],
]) {
  const i = await inv(name);
  const full = engineLike(i);
  eq(reconcile({ inventory: i, transcript: full }).verdict, VERDICT.VERIFIED, `${label}: complete transcript reconciles`);
  const r = reconcile({ inventory: i, transcript: full.split("\n").filter((l) => !l.includes(needle)).join("\n") });
  eq(r.verdict, VERDICT.DISCREPANCY, `${label}: omitting this content is detected`);
  const m = cat(r, CATEGORY.MISSING_FROM_TRANSCRIPT);
  ok(m.some((f) => f.excerpt.includes(needle.split(" ")[0])), `${label}: the omission names the content`);
  ok(m.every((f) => f.part), `${label}: provenance retained`);
}

// ---- footnotes/headers/footers are labelled SUPPLEMENTABLE ------------------
{
  const i = await inv("footnotes");
  const r = reconcile({ inventory: i, transcript: engineLike(i).split("\n").filter((l) => !l.includes("REAL FOOTNOTE")).join("\n") });
  const m = cat(r, CATEGORY.MISSING_FROM_TRANSCRIPT).find((f) => f.partKind === "footnotes");
  ok(m, "disposition: the missing footnote is found");
  eq(m.disposition, DISPOSITION.SUPPLEMENTABLE, "disposition: footnote text is labelled SUPPLEMENTABLE");
  ok(m.excerpt && m.chars > 0, "disposition: the exact source text is held, which is what makes it supplementable");
}
{
  const i = await inv("baseline");
  const r = reconcile({ inventory: i, transcript: engineLike(i).replace("Second paragraph.\n", "") });
  eq(cat(r, CATEGORY.MISSING_FROM_TRANSCRIPT)[0].disposition, DISPOSITION.NON_SUPPLEMENTABLE,
     "disposition: missing BODY text is NOT supplementable under ruleset " + RULESET_VERSION);
}

// ---- intentional ignores must cite a versioned rule -------------------------
{
  const i = await inv("trackedChanges");
  const r = reconcile({ inventory: i, transcript: engineLike(i) });
  const ig = cat(r, CATEGORY.INTENTIONALLY_IGNORED);
  ok(ig.length >= 1, "ignores: recorded");
  ok(ig.every((f) => f.ruleId && f.reason), "ignores: every one cites a rule id and a reason");
  ok(ig.some((f) => f.ruleId === "tracked_deletion"), "ignores: the tracked deletion is ignored by rule");
  eq(r.verdict, VERDICT.VERIFIED, "ignores: a rule-covered ignore does not block VERIFIED");
}

// ---- FAILED: verification could not execute ---------------------------------
{
  const i = await inventoryDocx(await FIXTURES.notAZip());
  const r = reconcile({ inventory: i, transcript: "anything" });
  eq(r.run_status, RUN_STATUS.FAILED, "failed: an unusable package fails the RUN");
  eq(r.verdict, null, "failed: a failed run earns NO verdict");
  ok(/inventory unusable/i.test(r.fatal || ""), "failed: the reason is reported");
}
{
  const i = await inventoryDocx(await FIXTURES.malformedPart());
  const r = reconcile({ inventory: i, transcript: "anything" });
  eq(r.run_status, RUN_STATUS.FAILED, "failed: a malformed part fails the RUN");
  eq(r.verdict, null, "failed: still no verdict");
}
{
  const i = await inv("baseline");
  const r = reconcile({ inventory: i, transcript: engineLike(i), expectedTranscriptSha256: "0".repeat(64) });
  eq(r.run_status, RUN_STATUS.FAILED, "failed: transcript hash mismatch fails the RUN");
  eq(r.verdict, null, "failed: hash mismatch earns no verdict");
  ok(/hash mismatch/i.test(r.fatal || ""), "failed: the mismatch is named");
}
{
  const i = await inv("baseline");
  const t = engineLike(i);
  const { createHash } = await import("node:crypto");
  const real = createHash("sha256").update(Buffer.from(t, "utf8")).digest("hex");
  const r = reconcile({ inventory: i, transcript: t, expectedTranscriptSha256: real });
  eq(r.run_status, RUN_STATUS.COMPLETED, "hash: the correct hash lets the run proceed");
  eq(r.verdict, VERDICT.VERIFIED, "hash: and reconciles");
}
{
  const i = await inv("baseline");
  eq(reconcile({ inventory: i, transcript: null }).run_status, RUN_STATUS.FAILED, "failed: a missing transcript fails the run");
  eq(reconcile({ inventory: null, transcript: "x" }).run_status, RUN_STATUS.FAILED, "failed: a missing inventory fails the run");
}
{
  // An alignment that cannot finish within budget must say so, not guess.
  const i = await inv("baseline");
  const r = reconcile({ inventory: i, transcript: "totally unrelated words here entirely", maxEdits: 1 });
  eq(r.run_status, RUN_STATUS.COMPLETED, "budget: the run completes");
  eq(r.verdict, VERDICT.INDETERMINATE, "budget: exceeding the edit budget yields INDETERMINATE, never a guess");
}

// ---- inputs are never modified ----------------------------------------------
{
  const i = await inv("unicode");
  const before = JSON.stringify(i.items);
  const t = engineLike(i);
  const tBefore = t;
  reconcile({ inventory: i, transcript: t });
  eq(JSON.stringify(i.items), before, "purity: the inventory is not modified by reconciliation");
  eq(t, tBefore, "purity: the transcript is not modified by reconciliation");
}

// ---- KINGSMEN ACCEPTANCE: real package, real mammoth transcript -------------
const KNG = process.env.MINEEX_ACCEPTANCE_DOCX
  || "/Users/leifer/Downloads/KNG News Release - FINAL AUG 20 (2).docx";  // local only; set MINEEX_ACCEPTANCE_DOCX elsewhere. Absent -> this section skips.
if (fs.existsSync(KNG)) {
  const buf = fs.readFileSync(KNG);
  const i = await inventoryDocx(buf);
  const mammoth = (await import("mammoth")).default || (await import("mammoth"));
  const T = String((await mammoth.extractRawText({ buffer: buf })).value || "");
  const r = reconcile({ inventory: i, transcript: T });

  eq(r.run_status, RUN_STATUS.COMPLETED, "kingsmen: run completes");
  eq(r.verdict, VERDICT.DISCREPANCY, "kingsmen: verdict is DISCREPANCY");
  eq(r.counts.UNEXPECTED_IN_TRANSCRIPT, 0, "kingsmen: nothing invented by the engine");
  eq(r.counts.ORDER_DIFFERENCE, 0, "kingsmen: nothing reordered");
  eq(r.counts.UNSUPPORTED_SOURCE_ELEMENT, 0, "kingsmen: no unrecognised construct");
  eq(r.indeterminateReasons.length, 0, "kingsmen: nothing left unexplained");
  ok(r.layout.length > 0 && r.layout.every((l) => l.justified),
     `kingsmen: all ${r.layout.length} separators structurally justified as layout`);

  const m = cat(r, CATEGORY.MISSING_FROM_TRANSCRIPT);
  eq(m.length, 1, "kingsmen: exactly ONE omission discovered");
  // Discovered, not asserted: the verifier is given no hint about footnotes.
  eq(m[0].partKind, "footnotes", "kingsmen: the omission is in the footnotes part");
  eq(m[0].chars, 390, "kingsmen: the omission is 390 characters");
  ok(/footnote/.test(m[0].path), "kingsmen: its XML path locates the footnote");
  eq(m[0].disposition, DISPOSITION.SUPPLEMENTABLE, "kingsmen: labelled SUPPLEMENTABLE");
  ok(m[0].excerpt.length > 0, "kingsmen: the exact source text is retained");
} else {
  console.warn("  (Kingsmen DOCX not present -- acceptance assertions skipped)");
}

console.log(`\nooxml reconcile: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
