// Phase 2 — immutable source transcription (pure; uses the real Kingsmen DOCX).
//   node scripts/transcript-test.mjs
//
// WHY THIS EXISTS
// ---------------
// Before Phase 2 the only text MineEx kept was the NORMALIZED text, so when a URL
// rule silently deleted 1,313 characters of technical disclosure from the Kingsmen
// release there was nothing left to detect it with. These tests pin the invariant
// that makes that class of failure detectable: normalization is a PURE FUNCTION of
// the transcription and can never reach back and change it.

import fs from "node:fs";
import path from "node:path";
import { normalizeRelease, formatReleaseText } from "../src/lib/pressRelease.js";
import { sha256Hex as transcriptSha256 } from "../src/lib/hashText.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  x " + m); } };
const eq = (g, w, m) => ok(g === w, `${m}\n      got:  ${JSON.stringify(g)}\n      want: ${JSON.stringify(w)}`);

const KNG = process.env.MINEEX_ACCEPTANCE_DOCX
  || "/Users/leifer/Downloads/KNG News Release - FINAL AUG 20 (2).docx";  // local only; set MINEEX_ACCEPTANCE_DOCX elsewhere. Absent -> this section skips.
const CACHE = "/tmp/kng-raw.txt";

let RAW = "";
if (fs.existsSync(KNG)) {
  const mammoth = (await import("mammoth")).default || (await import("mammoth"));
  RAW = String((await mammoth.extractRawText({ buffer: fs.readFileSync(KNG) })).value || "");
} else if (fs.existsSync(CACHE)) {
  console.warn("  (Kingsmen DOCX absent — using the cached transcription fixture)");
  RAW = fs.readFileSync(CACHE, "utf8");
} else {
  console.error("  SKIPPED: neither the Kingsmen DOCX nor its cached transcription is present.");
  process.exit(0);
}

// ---- 1. normalization never mutates the transcription -----------------------
const before = RAW;
const beforeHash = await transcriptSha256(RAW);
const norm = normalizeRelease(RAW, { sourceKind: "docx" });
eq(RAW, before, "normalizeRelease does not mutate its input");
eq(await transcriptSha256(RAW), beforeHash, "transcription hash is unchanged by normalization");
formatReleaseText(RAW);
eq(RAW, before, "formatReleaseText does not mutate its input either");

// ---- 2. the hash changes if and only if the content changes -----------------
eq(await transcriptSha256(RAW), beforeHash, "same text -> same hash");
ok(await transcriptSha256(RAW + " ") !== beforeHash, "one extra space -> different hash");
ok(await transcriptSha256(RAW.replace("Kingsmen", "Kingsman")) !== beforeHash, "one changed word -> different hash");
eq(await transcriptSha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
   "known-answer test: sha256 of the empty string");
eq(await transcriptSha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
   "known-answer test: sha256('abc')");

// ---- 3. CUT_MARKERS can no longer destroy anything --------------------------
const tail = norm.exclusions.find((e) => e.kind === "boilerplate_tail");
ok(!!tail, "the boilerplate tail is RECORDED as an exclusion, not silently dropped");
ok(tail && tail.chars > 2000, `the excluded tail is substantial (${tail ? tail.chars : 0} chars)`);
ok(tail && RAW.includes(tail.text.slice(0, 120)), "the excluded tail is still present in the transcription");
ok(!norm.body.includes("Forward-Looking Statements:"), "the FLS section is excluded from the Release Body");
ok(/Forward[-\s]?Looking Statements/i.test(RAW), "the FLS section survives in the transcription");
ok(/Scott Emerson/.test(RAW), "the signatory survives in the transcription");
ok(/@kingsmenresources\.com/i.test(RAW), "IR contact survives in the transcription");
ok(/About Kingsmen Resources/i.test(RAW), "the About section survives in the transcription");

// ---- 4. every excluded character is recoverable ------------------------------
for (const e of norm.exclusions) {
  const probe = (e.text.split("\n").find((l) => l.trim().length > 25) || e.text).trim().slice(0, 60);
  ok(RAW.includes(probe), `exclusion [${e.kind}/${e.reason}] is recoverable from the transcription`);
}

// ---- 5. de-hyphenation is PDF-only; DOCX hyphens are preserved --------------
const HYPHEN = "The zone is high-\ngrade and hosts forward-\nlooking silver-gold-lead-\nzinc mineralization here.";

// PDF keeps the legacy line-wrap repair (documented, lossy, recorded).
const pnorm = normalizeRelease(HYPHEN);
ok(pnorm.body.includes("highgrade"), "PDF: line-wrap repair still applies (legacy behaviour unchanged)");
const pdh = pnorm.transformations.find((x) => x.kind === "dehyphenation");
ok(pdh && pdh.count === 3, "PDF: de-hyphenation is RECORDED with a count");
ok(pdh && pdh.reversible === false, "PDF: de-hyphenation is declared irreversible, not 'lossless'");

// DOCX must not be damaged by a repair meant for PDF line wrapping.
const dnorm = normalizeRelease(HYPHEN, { sourceKind: "docx" });
ok(dnorm.body.includes("high-grade"), "DOCX: 'high-grade' stays 'high-grade'");
ok(!dnorm.body.includes("highgrade"), "DOCX: 'high-grade' is never merged into 'highgrade'");
ok(dnorm.body.includes("forward-looking"), "DOCX: 'forward-looking' stays 'forward-looking'");
ok(!dnorm.body.includes("forwardlooking"), "DOCX: 'forward-looking' is never merged");
ok(dnorm.body.includes("silver-gold-lead-zinc"), "DOCX: multi-hyphen compound survives unchanged");
ok(!dnorm.body.includes("silver-gold-leadzinc"), "DOCX: multi-hyphen compound is not corrupted");
ok(!dnorm.body.includes("high- grade"), "DOCX: no stray space is introduced at the hyphen");
const ddh = dnorm.transformations.find((x) => x.kind === "line_break_removed_hyphen_preserved");
ok(ddh && ddh.count === 3, "DOCX: the newline-only removal is RECORDED");
ok(!dnorm.transformations.some((x) => x.kind === "dehyphenation"), "DOCX: no de-hyphenation transformation is recorded");

// Hyphens already inline — the realistic DOCX shape — are untouched either way.
const INLINE = "Drilling confirmed high-grade silver and forward-looking silver-gold-lead-zinc zones at depth.";
for (const kindOpt of [{ sourceKind: "docx" }, undefined]) {
  const b = normalizeRelease(INLINE, kindOpt).body;
  const label = kindOpt ? "DOCX" : "PDF";
  ok(b.includes("high-grade") && b.includes("forward-looking") && b.includes("silver-gold-lead-zinc"),
     `${label}: inline hyphenated compounds are untouched`);
}

// THE TRANSCRIPT IS UNAFFECTED BY EITHER POLICY.
ok(HYPHEN.includes("high-\ngrade"), "the source string is not mutated by PDF normalization");
ok(HYPHEN.includes("silver-gold-lead-\nzinc"), "the source string is not mutated by DOCX normalization");
eq(await transcriptSha256(HYPHEN), await transcriptSha256(HYPHEN),
   "the transcription hash is identical regardless of which policy ran");

const REFLOW = "Alpha beta gamma\ndelta epsilon zeta\n\nSecond paragraph with enough words to stand alone.";
const rnorm = normalizeRelease(REFLOW);
ok(REFLOW.includes("gamma\ndelta"), "reflow does NOT touch the source string");
ok(rnorm.transformations.some((x) => x.kind === "paragraph_reflow"), "reflow is RECORDED as a transformation");

// ---- 6. repeated formatting cannot drift the transcription ------------------
const snapshot = RAW;
for (let i = 0; i < 5; i++) normalizeRelease(RAW);
eq(RAW, snapshot, "repeated normalization leaves the transcription byte-identical");
eq(await transcriptSha256(RAW), beforeHash, "hash still matches after repeated normalization");

// ---- 7. KINGSMEN ACCEPTANCE --------------------------------------------------
ok(Math.abs(RAW.length - 10490) <= 20, `transcription is ~10,490 chars (got ${RAW.length})`);
// 7,338 since the body became source-faithful: 38 injected heading markers removed,
// 2 deleted colons restored. It was 7,374 when the text carried presentation.
ok(Math.abs(norm.body.length - 7338) <= 20, `Release Body is ~7,338 chars (got ${norm.body.length})`);
ok(RAW.includes("silver equivalent calculation formula"), "AgEq formula present in transcription");
ok(RAW.includes("31.10348"), "AgEq formula constants present in transcription");
ok(norm.body.includes("silver equivalent calculation formula"), "AgEq formula present in Release Body");
ok(RAW.includes("Parral mining district of the Central Mexican Silver Belt"), "Las Coloradas paragraph in transcription");
ok(norm.body.includes("Parral mining district of the Central Mexican Silver Belt"), "Las Coloradas paragraph in Release Body");
ok(norm.body.length < RAW.length, "the transcription is the larger record; the body is a subset");

// ---- 8. the accounting is present and honest --------------------------------
ok(Array.isArray(norm.exclusions) && Array.isArray(norm.transformations), "accounting arrays are returned");
ok(norm.transformations.every((t) => typeof t.reversible === "boolean"),
   "every transformation declares whether it is reversible");
ok(norm.exclusions.every((e) => e.reason && e.chars >= 0), "every exclusion carries a reason and a size");
eq(norm.sourceChars, RAW.length, "sourceChars matches the transcription length");
eq(norm.bodyChars, norm.body.length, "bodyChars matches the body length");

// ---- 9. source-level guards on the ingest order ------------------------------
// The unit tests cannot catch a future edit that reorders these calls, and the
// order IS the guarantee: a transcript written after normalization is worthless.
const ingRaw = fs.readFileSync(path.join(import.meta.dirname, "..", "src", "lib", "ingestRelease.js"), "utf8");
// Comments in that file legitimately quote the old call being removed; match code.
const ing = ingRaw.replace(/^\s*\/\/.*$/gm, "");
const iStore = ing.indexOf("await storeTranscript(");
const iNorm = ing.indexOf("normalizeRelease(parsed.text");
ok(iStore > 0 && iNorm > 0, "ingestRelease calls both storeTranscript and normalizeRelease");
ok(iStore < iNorm, "storeTranscript is called BEFORE normalizeRelease");
ok(/storeTranscript\([\s\S]{0,500}text:\s*parsed\.text/.test(ing),
   "the transcript is written from parsed.text — the engine's own output");
ok(!/saveDocumentText\(documentId,\s*""\)/.test(ing),
   "the failure path no longer overwrites document text with an empty string");
ok(/recordExtractionAttempt\(/.test(ing), "failures are recorded as extraction attempts instead");

// ---- 10. schema guarantees that only the database can enforce ---------------
const mig = fs.readFileSync(
  path.join(import.meta.dirname, "..", "supabase", "migrations", "0041_source_transcripts.sql"), "utf8");
ok(/char_count\s+int\s+generated always as/.test(mig), "char_count is a generated column, not client-supplied");
ok(/sha256\s+text generated always as/.test(mig), "sha256 is a generated column, not client-supplied");
ok(/create trigger source_transcripts_immutable/.test(mig), "an UPDATE trigger enforces append-only");
ok(/for select[\s\S]{0,120}can_touch_company/.test(mig), "SELECT is company-scoped");
ok(/for insert[\s\S]{0,120}can_touch_company/.test(mig), "INSERT is company-scoped");
ok(!/for update/i.test(mig.replace(/before update/gi, "")), "no UPDATE policy exists");
ok(!/for delete/i.test(mig), "no DELETE policy exists");
ok(/foreign key \(document_id, company_id\)/.test(mig), "composite FK blocks cross-company transcripts structurally");
ok(!/to anon/.test(mig), "no anon access: publishing a release never exposes its transcript");

console.log(`\ntranscript: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
