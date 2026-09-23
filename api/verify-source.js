// Phase 3E: connect ingestion to the deployed verification/canonical layer.
//
// THE FLOW
// --------
//   original upload
//     -> immutable source transcript      (already persisted by the client)
//     -> independent OOXML inventory      HERE, from the original bytes
//     -> reconciliation                   HERE
//     -> persist_verification             HERE, as the END USER
//     -> compose canonical WHEN ELIGIBLE  HERE
//     -> persist_canonical                HERE, as the END USER
//     -> Review
//
// THE THREE IDENTITIES, KEPT SEPARATE
// -----------------------------------
//   the browser/user  is the AUTHORIZATION identity. Its JWT is forwarded, and
//                     can_touch_company() validates that specific person.
//   this server       is the EVIDENCE-COMPUTATION authority. The inventory, the
//                     reconciliation, the verdict, the findings and the spans are
//                     all derived here from the uploaded bytes.
//   the database      is the final tenant and persistence boundary. It recomputes
//                     the digest, re-derives the serialization from spans, and
//                     refuses anything it cannot verify for itself.
//
// NOTHING THE CLIENT SENDS IS AUTHORITATIVE. The request carries the document
// bytes and three ids; every judgement is made here. A client cannot submit a
// verdict, a finding, an inventory, a span, a digest or an eligibility decision,
// because this endpoint does not read any such field.
//
// FAIL CLOSED
// -----------
// If verification cannot be persisted, this returns an error and the caller must
// treat ingestion as unsuccessful. A document whose evidence was not recorded has
// not been verified, and saying otherwise is the failure this whole phase exists
// to prevent.

import { requireFeature, companyIdFromSlug } from "./_entitlement.js";
import { inventoryDocx } from "./_ooxmlInventory.js";
import { reconcile, VERDICT, RUN_STATUS } from "./_ooxmlReconcile.js";
import { composeCanonical, inventoryPayload } from "./_canonicalSource.js";
import { userRpc, userSelect, UserDbError } from "./_userDb.js";

export const config = { maxDuration: 60 };

const MAX_COMPRESSED_BYTES = 25 * 1024 * 1024;
const bad = (res, code, msg, extra) => res.status(code).json({ error: msg, ...(extra || {}) });
const looksLikeZip = (b) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;

/** reconcile() findings -> the rows persist_verification records. */
const findingRows = (findings) => (findings || []).map((f) => ({
  category: f.category,
  disposition: f.disposition || null,
  severity: f.severity || null,
  part_name: f.part || null,
  part_kind: f.partKind || null,
  xml_path: f.path || null,
  source_block: f.block ?? null,
  source_order: f.sourceIndex ?? null,
  chars: f.chars ?? 0,
  rule_id: f.ruleId || null,
  reason: f.reason || null,
  // DIAGNOSTIC ONLY. A supplement copies from source_inventory_blocks, never
  // from here -- an excerpt is truncated by definition and cannot be a source.
  excerpt: f.excerpt || null,
}));

/** composeCanonical() spans -> the rows persist_canonical records. */
const spanRows = (spans) => (spans || []).map((s) => ({
  canonical_order: s.canonicalOrder,
  region_kind: s.regionKind,
  text: s.text,
  // The composer names these `part`, `path` and `block`. Mapping them as
  // partName/xmlPath/sourceBlock reads fine and yields undefined -> NULL, which
  // would persist a span with no provenance and no error. Asserted in
  // scripts/pipeline-test.mjs so the names cannot drift apart silently.
  part_name: s.part || null,
  part_kind: s.partKind || null,
  xml_path: s.path || null,
  source_block: s.block ?? null,
  source_order: s.sourceOrder ?? null,
  structures: s.structures || [],
  engine_extracted: !!s.engineExtracted,
  origin: s.origin,
  // Codepoint offsets, 1-based -- the units substr() counts in. The composer
  // converted from JavaScript's UTF-16 indices; sending the JS index would
  // select the wrong slice on any document containing an emoji.
  transcript_start: s.transcriptStart ?? null,
  transcript_length: s.transcriptLength ?? null,
  composition_rule_id: s.compositionRuleId || null,
  composition_rule_version: s.compositionRuleVersion || null,
}));

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const {
    docx = "", documentId = "", transcriptId = "",
    companyId: bodyCompanyId = "", slug = "",
  } = body || {};

  if (!docx) return bad(res, 400, "Provide `docx` (base64).");
  if (!documentId) return bad(res, 400, "documentId is required.");
  if (!transcriptId) return bad(res, 400, "transcriptId is required.");

  const companyId = bodyCompanyId || (slug ? await companyIdFromSlug(slug) : "");
  if (!companyId) return bad(res, 400, "companyId or slug is required.");

  // Same gate as extraction: a real user, for a company they may manage. This
  // also yields the token that will authorize the persistence calls below.
  const auth = await requireFeature(req, res, { companyId, feature: "company_memory" });
  if (!auth) return;

  let buf;
  try { buf = Buffer.from(String(docx), "base64"); } catch { return bad(res, 400, "Could not decode `docx`."); }
  if (!buf.length) return bad(res, 400, "Empty file.");
  if (buf.length > MAX_COMPRESSED_BYTES) return bad(res, 413, "File is too large.");
  if (!looksLikeZip(buf)) return bad(res, 415, "That file is not a DOCX.");

  // ---- the transcript is read from the DATABASE, not from the request -------
  // Verification compares the engine's stored transcript against an independent
  // reading of the package. Accepting the text from the caller would let the
  // thing under test supply its own answer.
  let transcriptRow;
  try {
    const rows = await userSelect(auth.token,
      `source_transcripts?id=eq.${encodeURIComponent(transcriptId)}` +
      `&document_id=eq.${encodeURIComponent(documentId)}&select=id,transcript_text,sha256,engine&limit=1`);
    transcriptRow = Array.isArray(rows) && rows[0];
  } catch (e) {
    return bad(res, 502, "Could not read the stored source text.", { detail: e.message });
  }
  if (!transcriptRow) {
    return bad(res, 404, "That transcript does not belong to this document.", { code: "transcript_mismatch" });
  }

  // ---- 1) independent reading of the package -------------------------------
  let inventory;
  try {
    inventory = await inventoryDocx(buf);
  } catch (e) {
    return bad(res, 422, "Could not read the document package independently.", {
      code: "inventory_failed", detail: String(e && e.message).slice(0, 300),
    });
  }
  if (!inventory || inventory.ok !== true) {
    return bad(res, 422, "The independent reading of this document did not complete.", {
      code: "inventory_incomplete", detail: (inventory && inventory.fatal) || null,
    });
  }

  // ---- 2) reconcile engine transcript against that reading ------------------
  const reconciliation = reconcile({
    inventory,
    transcript: transcriptRow.transcript_text || "",
    expectedTranscriptSha256: transcriptRow.sha256 || null,
  });

  // ---- 3) persist the verification, AS THE USER -----------------------------
  const inv = inventoryPayload(inventory);
  let runId;
  try {
    runId = await userRpc(auth.token, "persist_verification", {
      payload: {
        document_id: documentId,
        transcript_id: transcriptId,
        inventory: {
          engine: inventory.engine,
          engine_version: inventory.version,
          package_sha256: inventory.packageSha256,
          digest: inv.digest,
          parts: inv.parts, blocks: inv.blocks, notes: inv.notes,
        },
        run: {
          run_status: reconciliation.run_status,
          verdict: reconciliation.verdict,
          verifier: reconciliation.reconciler,
          verifier_version: reconciliation.reconcilerVersion,
          ruleset_version: reconciliation.rulesetVersion,
          transcript_sha256: transcriptRow.sha256,
          counts: reconciliation.counts || {},
          fatal: reconciliation.fatal || null,
        },
        findings: findingRows(reconciliation.findings),
      },
    });
  } catch (e) {
    // FAIL CLOSED. No verification row means the document is not verified, and
    // the caller must not present it as ingested successfully.
    const tenant = e instanceof UserDbError && e.code === "42501";
    return bad(res, tenant ? 403 : 502,
      tenant ? "You are not authorized to record verification for this company."
             : "Could not record the verification result.",
      { code: "verification_persist_failed", pgcode: (e && e.code) || null, detail: (e && e.message || "").slice(0, 300) });
  }

  const out = {
    ok: true,
    verificationRunId: runId,
    runStatus: reconciliation.run_status,
    verdict: reconciliation.verdict,
    counts: reconciliation.counts || {},
    inventoryDigest: inv.digest,
    transcriptSha256: transcriptRow.sha256,
    canonicalId: null,
    canonicalRefusal: null,
  };

  // ---- 4) compose ONLY when eligible ---------------------------------------
  // INDETERMINATE never composes: an unreadable region is not a discrepancy that
  // can be recovered, it is an absence of knowledge. A FAILED run has no verdict
  // at all. Both are recorded above and simply produce no canonical.
  if (reconciliation.run_status !== RUN_STATUS.COMPLETED ||
      reconciliation.verdict === VERDICT.INDETERMINATE) {
    out.canonicalRefusal = { code: "NOT_ELIGIBLE", detail: `run ${reconciliation.run_status} / verdict ${reconciliation.verdict}` };
    return res.status(200).json(out);
  }

  const composed = composeCanonical({
    inventory,
    transcript: transcriptRow.transcript_text || "",
    reconciliation,
    documentId, companyId, transcriptId,
    verificationRunId: runId,
    expectedTranscriptSha256: transcriptRow.sha256 || null,
  });

  if (!composed.ok) {
    // A refusal is a FIRST-CLASS OUTCOME, not an error. The verification is
    // recorded; there is simply no canonical, and the reason is reported.
    out.canonicalRefusal = composed.refusal;
    return res.status(200).json(out);
  }

  // ---- 5) persist the canonical, AS THE USER -------------------------------
  try {
    out.canonicalId = await userRpc(auth.token, "persist_canonical", {
      payload: {
        verification_run_id: runId,
        composer: composed.canonical.composer,
        composer_version: composed.canonical.composerVersion,
        composition_ruleset: composed.canonical.compositionRulesetVersion,
        region_offsets: composed.canonical.regionOffsets,
        spans: spanRows(composed.canonical.spans),
      },
    });
  } catch (e) {
    const tenant = e instanceof UserDbError && e.code === "42501";
    return bad(res, tenant ? 403 : 502,
      tenant ? "You are not authorized to record a canonical source for this company."
             : "Could not record the canonical source.",
      {
        code: "canonical_persist_failed",
        pgcode: (e && e.code) || null,
        detail: (e && e.message || "").slice(0, 300),
        // The verification DID persist. Reporting its id keeps the evidence chain
        // traceable even though this request failed.
        verificationRunId: runId,
      });
  }

  out.serializedSha256 = composed.canonical.serializedSha256;
  out.charCount = composed.canonical.charCount;
  out.regions = (composed.canonical.regions || []).map((r) => r.kind);
  return res.status(200).json(out);
}
