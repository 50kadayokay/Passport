// Phase 3E acceptance: the whole chain, on the real document.
//
//   original upload -> transcript -> independent inventory -> reconciliation
//     -> persist_verification payload -> eligibility -> composition
//     -> persist_canonical payload
//
// WHAT THIS PROVES AND WHAT IT DOES NOT
// -------------------------------------
// It runs the REAL pipeline functions over the REAL bytes and asserts the
// evidence and the exact payloads the endpoint sends. It does NOT write to a
// database: that the database accepts these payloads, recomputes the digest,
// re-derives the serialization and refuses forgeries is proved by the
// isolated-schema audit (supabase/audit/phase3d_audit.sql, 265 attacks).
//
// The two together cover the chain. Neither covers it alone, and this file does
// not claim otherwise.
//
// The acceptance document is the real Kingsmen release. Set
// MINEEX_ACCEPTANCE_DOCX to point elsewhere; absent, the sections that need it
// are SKIPPED LOUDLY rather than silently passing.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { inventoryDocx } from "../api/_ooxmlInventory.js";
import { reconcile, CATEGORY, VERDICT, RUN_STATUS, DISPOSITION } from "../api/_ooxmlReconcile.js";
import { composeCanonical, inventoryPayload, inventoryManifest } from "../api/_canonicalSource.js";
import { inventoryDigest } from "../api/_inventoryDigest.js";

const KNG = process.env.MINEEX_ACCEPTANCE_DOCX
  || "/Users/leifer/Downloads/KNG News Release - FINAL AUG 20 (2).docx";  // local only

let pass = 0, fail = 0, skipped = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.error(`  x ${m}${x ? "\n      " + x : ""}`); } };
const eq = (a, b, m) => ok(a === b, m, a === b ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const sha = (s) => createHash("sha256").update(String(s), "utf8").digest("hex");

// The payload mappings, lifted from api/verify-source.js so the acceptance tests
// the SHAPE THAT IS ACTUALLY SENT rather than a convenient reimplementation.
// Read out of the file, so if the endpoint changes its mapping this changes too.
const endpointSrc = fs.readFileSync(new URL("../api/verify-source.js", import.meta.url), "utf8");
const liftMapper = (name) => {
  const re = new RegExp(`const ${name} = \\((\\w+)\\) => \\(\\1 \\|\\| \\[\\]\\)\\.map\\(\\(s\\) => \\(\\{([\\s\\S]*?)\\n\\}\\)\\);`);
  const m = endpointSrc.match(re);
  if (!m) throw new Error(`could not lift ${name} from api/verify-source.js`);
  return new Function("rows", `return (rows||[]).map((s)=>({${m[2].replace(/\/\/[^\n]*/g, "")}}));`);
};
const spanRows = liftMapper("spanRows");
const findingRowsSrc = endpointSrc.match(
  /const findingRows = \(findings\) => \(findings \|\| \[\]\)\.map\(\(f\) => \(\{([\s\S]*?)\n\}\)\);/);
if (!findingRowsSrc) throw new Error("could not lift findingRows from api/verify-source.js");
const findingRows = new Function("findings",
  `return (findings||[]).map((f)=>({${findingRowsSrc[1].replace(/\/\/[^\n]*/g, "")}}));`);

// ===================================================== A. THE REAL DOCUMENT
console.log("=== A. the real acceptance document ===");
if (!fs.existsSync(KNG)) {
  skipped++;
  console.warn(`  ! SKIPPED — acceptance document not present at ${KNG}`);
  console.warn("    Set MINEEX_ACCEPTANCE_DOCX to run the real end-to-end case.");
} else {
  const buf = fs.readFileSync(KNG);

  // 1) the engine transcript, exactly as the pipeline stores it
  const mammoth = (await import("mammoth")).default || (await import("mammoth"));
  const raw = await mammoth.extractRawText({ buffer: buf });
  const transcript = raw.value;                       // NOT trimmed: the stored row is not either
  const transcriptSha = sha(transcript);
  ok(transcript.length > 0, "transcript: the engine produced text");
  console.log(`    transcript: ${transcript.length} chars, sha ${transcriptSha.slice(0, 16)}`);

  // 2) the independent reading
  const inventory = await inventoryDocx(buf);
  eq(inventory.ok, true, "inventory: the independent reading completed");
  ok(inventory.parts.length > 1, "inventory: more than one part was discovered");
  ok(inventory.items.length > 0, "inventory: text items were found");
  const fnParts = inventory.parts.filter((p) => p.kind === "footnotes");
  ok(fnParts.length > 0, "inventory: a footnotes part exists in the package");
  console.log(`    inventory: ${inventory.parts.length} parts, ${inventory.items.length} items, engine ${inventory.engine}@${inventory.version}`);

  // 3) reconciliation
  const rec = reconcile({ inventory, transcript, expectedTranscriptSha256: transcriptSha });
  eq(rec.run_status, RUN_STATUS.COMPLETED, "verification: the run COMPLETED");
  eq(rec.verdict, VERDICT.DISCREPANCY, "verification: the verdict is DISCREPANCY");

  // 4) THE FINDING THIS WHOLE PHASE EXISTS FOR
  const missing = rec.findings.filter((f) => f.category === CATEGORY.MISSING_FROM_TRANSCRIPT);
  ok(missing.length > 0, "finding: content present in the package is absent from the transcript");
  const fnMissing = missing.filter((f) => f.partKind === "footnotes");
  ok(fnMissing.length > 0, "finding: the missing content is footnote content");
  ok(fnMissing.every((f) => f.disposition === DISPOSITION.SUPPLEMENTABLE),
     "finding: classified SUPPLEMENTABLE under the explicit footnotes rule");
  const fnChars = fnMissing.reduce((n, f) => n + (f.chars || 0), 0);
  console.log(`    missing footnote content: ${fnMissing.length} finding(s), ${fnChars} chars`);
  ok(fnChars > 100, "finding: the missing footnote is substantive, not a stray character");

  // it really is absent from the transcript, not merely unaligned
  for (const f of fnMissing) {
    ok(!transcript.includes(f.excerpt || "\u0000zzz"),
       "finding: the missing text is genuinely not in the transcript");
  }

  // 5) composition
  const composed = composeCanonical({
    inventory, transcript, reconciliation: rec,
    documentId: "doc-acceptance", companyId: "co-acceptance", transcriptId: "tr-acceptance",
    verificationRunId: "run-acceptance", expectedTranscriptSha256: transcriptSha,
  });
  ok(composed.ok, "canonical: composed", composed.ok ? "" : JSON.stringify(composed.refusal));

  if (composed.ok) {
    const c = composed.canonical;
    const rows = spanRows(c.spans);

    // engine-derived body stays engine-derived
    const bodyRows = rows.filter((r) => r.region_kind === "body");
    ok(bodyRows.length > 0, "canonical: the body region has spans");
    ok(bodyRows.every((r) => r.origin === "engine" && r.engine_extracted === true),
       "canonical: every body span is ENGINE-derived, never supplemented");
    ok(bodyRows.every((r) => r.transcript_start !== null && r.transcript_length !== null),
       "canonical: every engine span cites transcript offsets");

    // every engine span's text IS the transcript slice it cites (codepoints)
    const cp = [...transcript];
    const mismatched = bodyRows.filter((r) =>
      cp.slice(r.transcript_start - 1, r.transcript_start - 1 + r.transcript_length).join("") !== r.text);
    eq(mismatched.length, 0, "canonical: every engine span equals its cited transcript slice");

    // the footnote is a SEPARATE REGION, not spliced into the body
    const fnRows = rows.filter((r) => r.region_kind === "footnotes");
    ok(fnRows.length > 0, "canonical: the recovered footnote is in the FOOTNOTES region");
    ok(!bodyRows.some((r) => r.origin === "supplement"),
       "canonical: nothing was supplemented into the body");

    // recovered verbatim from the INDEPENDENT INVENTORY, not from the finding
    const blocks = inventoryManifest(inventory).blocks;
    for (const r of fnRows.filter((x) => x.origin === "supplement")) {
      const src = blocks.find((b) => b.partName === r.part_name && b.sourceBlock === r.source_block);
      ok(!!src, "canonical: the supplement resolves to an inventory block");
      if (src) eq(r.text, src.text, "canonical: the recovered footnote is VERBATIM from the inventory block");
    }

    // provenance survives the mapping into the persistence payload
    ok(rows.every((r) => r.part_name && r.xml_path),
       "payload: every span row carries part_name and xml_path");
    ok(fnRows.filter((r) => r.origin === "supplement")
          .every((r) => r.composition_rule_id === "supplement_footnotes"
                     && r.composition_rule_version === "1.0.0"),
       "payload: the supplement cites the explicit footnotes composition rule");
    ok(rows.filter((r) => r.origin === "engine")
          .every((r) => r.composition_rule_id === null),
       "payload: engine spans cite no composition rule");

    // the finding rows the RPC will record
    const fRows = findingRows(rec.findings);
    const supRows = fRows.filter((f) => f.disposition === "SUPPLEMENTABLE");
    ok(supRows.length > 0, "payload: a SUPPLEMENTABLE finding is recorded");
    ok(supRows.every((f) => f.category === "MISSING_FROM_TRANSCRIPT"),
       "payload: only MISSING_FROM_TRANSCRIPT is SUPPLEMENTABLE");
    ok(supRows.every((f) => f.part_name && f.source_block !== null),
       "payload: the finding carries the address the supplement resolves against");
    // the RPC pairs each SUPPLEMENTABLE finding with exactly one supplement span
    // by (part_name, source_block); a mismatch is rejected server-side, so it has
    // to line up here.
    for (const f of supRows) {
      const matches = rows.filter((r) => r.origin === "supplement"
        && r.part_name === f.part_name && r.source_block === f.source_block);
      eq(matches.length, 1, "payload: each authorized recovery maps to exactly one supplement span");
    }

    // hashes agree across the chain
    eq(c.transcriptSha256, transcriptSha, "chain: the canonical cites the transcript's own hash");
    eq(c.serializedSha256, sha(c.serialized), "chain: serializedSha256 is the hash of the serialization");
    const inv = inventoryPayload(inventory);
    eq(inv.digest, inventoryDigest(inventoryManifest(inventory)),
       "chain: the payload digest equals the manifest digest");
    eq(c.inventoryDigest, inv.digest,
       "chain: the canonical binds to the SAME inventory digest the payload sends");
    console.log(`    canonical: ${c.charCount} chars, ${rows.length} spans, digest ${inv.digest.slice(0, 16)}`);

    // 6) RETRY DETERMINISM: the same bytes must produce the same evidence
    const inv2 = await inventoryDocx(buf);
    const rec2 = reconcile({ inventory: inv2, transcript, expectedTranscriptSha256: transcriptSha });
    eq(inventoryPayload(inv2).digest, inv.digest, "retry: the inventory digest is identical");
    eq(rec2.verdict, rec.verdict, "retry: the verdict is identical");
    eq(rec2.findings.length, rec.findings.length, "retry: the finding count is identical");
    const composed2 = composeCanonical({
      inventory: inv2, transcript, reconciliation: rec2,
      documentId: "doc-acceptance", companyId: "co-acceptance", transcriptId: "tr-acceptance",
      verificationRunId: "run-acceptance", expectedTranscriptSha256: transcriptSha,
    });
    ok(composed2.ok, "retry: composition succeeds again");
    if (composed2.ok) {
      eq(composed2.canonical.serializedSha256, c.serializedSha256,
         "retry: the canonical serialization is byte-identical — a retry cannot contradict the first run");
    }
  }
}

// ============================================ B. FAIL-CLOSED, ON FIXTURES
// These run without the acceptance document, because refusal must be provable
// on every machine.
console.log("=== B. eligibility and fail-closed ===");
{
  const { FIXTURES } = await import("./fixtures/docxFixtures.mjs");
  const inv = await inventoryDocx(await FIXTURES.footnotes());
  const t = inv.items.filter((i) => i.visible === true && i.partKind !== "footnotes")
                     .map((i) => i.text).join("\n");
  const rec = reconcile({ inventory: inv, transcript: t });

  // INDETERMINATE must never compose: an unreadable region is an absence of
  // knowledge, not a recoverable discrepancy.
  const ind = composeCanonical({
    inventory: inv, transcript: t,
    reconciliation: { ...rec, verdict: VERDICT.INDETERMINATE },
  });
  eq(ind.ok, false, "eligibility: INDETERMINATE refuses composition");

  const failed = composeCanonical({
    inventory: inv, transcript: t,
    reconciliation: { ...rec, run_status: RUN_STATUS.FAILED, verdict: null },
  });
  eq(failed.ok, false, "eligibility: a FAILED run refuses composition");

  // a transcript that is not the one verified must refuse
  const stale = composeCanonical({
    inventory: inv, transcript: t, reconciliation: rec,
    expectedTranscriptSha256: sha("a different transcript entirely"),
  });
  eq(stale.ok, false, "eligibility: a transcript that does not match the run is refused");

  // the endpoint must never read a client-supplied judgement
  for (const forbidden of ["body.verdict", "body.findings", "body.spans", "body.inventory", "body.digest"]) {
    ok(!endpointSrc.includes(forbidden),
       `client input: the endpoint does not read ${forbidden}`);
  }
  const destructured = endpointSrc.match(/const \{\s*([\s\S]*?)\s*\} = body \|\| \{\};/);
  ok(!!destructured, "client input: the endpoint destructures a fixed set of request fields");
  if (destructured) {
    const fields = destructured[1].replace(/\/\/[^\n]*/g, "").split(",")
      .map((f) => f.split(/[:=]/)[0].trim()).filter(Boolean);
    const allowed = new Set(["docx", "documentId", "transcriptId", "companyId", "slug"]);
    const extra = fields.filter((f) => !allowed.has(f));
    eq(extra.length, 0, "client input: no judgement-shaped field is accepted from the client",
       extra.join(", "));
  }
  ok(/verification_persist_failed/.test(endpointSrc) && /canonical_persist_failed/.test(endpointSrc),
     "fail-closed: persistence failures are reported as errors, not swallowed");
}

console.log(`\npipeline: ${pass} passed, ${fail} failed${skipped ? `, ${skipped} section(s) skipped` : ""}`);
process.exit(fail ? 1 : 0);
