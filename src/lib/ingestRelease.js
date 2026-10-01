// Release ingestion — the first milestone of the publishing pipeline.
//
//   source file → safe parse → structured text + candidate images
//               → SHA dedup → media_asset → provenance → PRIVATE storage
//
// WHAT THIS DOES NOT DO, ON PURPOSE
//   * does not publish anything
//   * does not make any asset public
//   * does not call an AI model
//   * does not touch profile.timeline or posts
// It produces a private, reviewable draft record and stops.
//
// FAILURE IS NON-DESTRUCTIVE. The source document is stored FIRST and is never
// rolled back. If parsing or image extraction fails the document still exists,
// the failure is recorded on it, and the user can retry — a failed AI summary or
// a corrupt image must never cost the company its uploaded release.

import { storeDocument, saveDocumentText } from "./memory.js";
import { storeTranscript, recordExtractionAttempt, TranscriptPersistenceError } from "./sourceTranscript.js";
import { pdfToText, pdfToLinedText, isPdf, analyzePdf } from "./pdfText.js";
import { pdfImages, pdfPageRenders } from "./pdfImages.js";
import { storeMediaAsset } from "./mediaAssets.js";
import { parseReleaseDate, normalizeRelease, firstMeaningfulLine, looksLikePressRelease } from "./pressRelease.js";
import { apiFetch } from "./auth.js";

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Explicit ingestion outcomes. Deliberately NOT collapsed into ok/error: the
 * review screen has to tell a CEO which of these happened, and "something went
 * wrong" is useless when the real answer is "your PDF is a scan".
 */
export const INGEST_STATUS = {
  OK:                        "ok",                          // text + any media extracted
  PARTIAL:                   "partial",                     // succeeded, but media were skipped/truncated
  TEXT_EXTRACTION_UNAVAILABLE:"text_extraction_unavailable", // scanned PDF — no text layer
  UNSUPPORTED_FORMAT:        "unsupported_format",           // refused before anything was stored
  REJECTED:                  "rejected",                     // failed validation / security check
  TIMEOUT:                   "timeout",                      // parser exceeded its budget
  FAILED:                    "failed",                       // corrupt, encrypted, unreadable
  SIGNED_OUT:                "signed_out",                   // no/expired session at the API
  NOT_ENTITLED:              "not_entitled",                 // authenticated, but the plan or company says no
  TRANSCRIPT_UNAVAILABLE:    "transcript_unavailable",       // parsed fine, but the source text could not be persisted
  VERIFICATION_UNAVAILABLE:  "verification_unavailable",     // transcript stored, but its verification could not be recorded
};

/**
 * Statuses that must NOT produce a Review screen.
 *
 * Every other failure still opens Review, on purpose: the operator can type or
 * paste the release by hand and carry on. TRANSCRIPT_UNAVAILABLE is different.
 * There, extraction SUCCEEDED and the storage of its output did not — so any
 * content shown would be editable and publishable with no persisted source behind
 * it. That is the precise state Phase 2 exists to prevent, so it fails closed.
 *
 * The original upload is already preserved, so the honest action is retry, not
 * re-upload.
 */
//
// VERIFICATION_UNAVAILABLE blocks for the same reason one step further along.
// The transcript IS stored, so the text is real -- but nothing has established
// that it faithfully represents the uploaded document, and no record exists
// saying so either way. Opening Review would present unverified content as
// though it had passed. Phase 3 exists to make that state impossible, so it
// fails closed and the honest action is retry.
const REVIEW_BLOCKING = new Set([
  INGEST_STATUS.TRANSCRIPT_UNAVAILABLE,
  INGEST_STATUS.VERIFICATION_UNAVAILABLE,
]);
export function blocksReview(status) { return REVIEW_BLOCKING.has(status); }

/** How a media candidate was obtained. Recorded per SIGHTING, never on the asset. */
export const EXTRACTION_METHOD = {
  PDF_EMBEDDED:   "pdf_embedded",     // raster XObject inside the PDF
  PDF_PAGE_RENDER:"pdf_page_render",  // whole page rasterised (vector figure fallback)
  DOCX_EMBEDDED:  "docx_embedded",    // image part inside the .docx
  MANUAL_UPLOAD:  "manual_upload",    // the company uploaded it directly
};

// A page with almost no text is a scan, not prose. Mirrors analyzePdf's own rule.
const READABLE_PCT_MIN = 15;

const isDocx = (file) =>
  !!file && (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(file.name || "")
  );

/**
 * Why did ingestion fail? HTTP status decides where we have one — it is
 * authoritative and stable, unlike the human-readable message. String matching is
 * only a fallback for client-side failures that never reached the server.
 */
function classifyFailure(err, msg) {
  const status = err && err.httpStatus;
  // Authorization failures are NOT document failures. Folding a 403 into FAILED
  // told the user their file was "corrupt or password-protected" when the file was
  // fine and the real answer was that the plan doesn't include this feature —
  // a message that sends them hunting for a problem that does not exist.
  if (status === 401) return INGEST_STATUS.SIGNED_OUT;
  if (status === 402 || status === 403) return INGEST_STATUS.NOT_ENTITLED;
  if (status === 504) return INGEST_STATUS.TIMEOUT;
  if (status === 413 || status === 415) return INGEST_STATUS.REJECTED;
  if (status === 422) return INGEST_STATUS.FAILED;
  if (/timed out|timeout|took too long/i.test(msg)) return INGEST_STATUS.TIMEOUT;
  if (/not a DOCX|too large|expands to far more/i.test(msg)) return INGEST_STATUS.REJECTED;
  return INGEST_STATUS.FAILED;
}

const isTxt = (f) =>
  /^text\/plain$/i.test(f && f.type || "") || /\.txt$/i.test(f && f.name || "");

/** Formats we can actually parse. Anything else is refused up front, not half-processed. */
export function supportedKind(file) {
  if (isPdf(file)) return "pdf";
  if (isDocx(file)) return "docx";
  if (isTxt(file)) return "txt";
  return null;
}

/**
 * Plain text, read in the browser.
 *
 * No server round trip and no parser: the bytes ARE the text, so there is
 * nothing to extract and nothing that can be silently mis-extracted. That also
 * means a .txt release carries no embedded images -- the company attaches those
 * separately, which the media step already supports.
 *
 * Decoded as UTF-8 with a BOM stripped; a release exported from Word as "plain
 * text" very often carries one, and a leading U+FEFF otherwise lands in the
 * headline.
 */
async function parseTxt(file) {
  const raw = await file.text();
  const text = String(raw || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) {
    const e = new Error("That file is empty.");
    e.emptyText = true;
    throw e;
  }
  return { text, images: [], truncated: false, warnings: [] };
}

const b64 = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result || "").split(",")[1] || "");
  fr.onerror = () => reject(new Error("Could not read that file."));
  fr.readAsDataURL(file);
});

/** DOCX text + images, parsed SERVER SIDE. Never parsed in the browser. */
async function parseDocx(file, companyId) {
  // apiFetch attaches the session (refreshing it first if the access token has
  // aged out) and throws `session_expired` if there is genuinely no session —
  // rather than sending "Bearer null" and letting the server call it a bad login.
  // Computed once and carried forward: verification re-reads the SAME bytes the
  // engine parsed. Re-encoding the File later would risk verifying a different
  // artefact than the one the transcript came from.
  const docxB64 = await b64(file);
  const res = await apiFetch("/api/extract-docx", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ docx: docxB64, companyId, withImages: true }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Carry the HTTP status through. Classifying on prose is fragile — the server
    // says "took too long" for a 504, which no reasonable /timed out/ regex
    // matches, and a timeout misreported as a generic failure is exactly the
    // collapsed error state we are trying to avoid.
    const err = new Error(j.error || `Could not read that DOCX (${res.status}).`);
    err.httpStatus = res.status;
    err.serverCode = j.code || null;
    throw err;
  }

  // base64 → Blob, so images take the same path as PDF ones from here on.
  const images = (j.images || []).map((im, i) => {
    const bin = atob(im.base64);
    const arr = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    return {
      blob: new Blob([arr], { type: im.contentType }),
      width: null, height: null, page: null,
      method: EXTRACTION_METHOD.DOCX_EMBEDDED,
      name: `docx-image-${i + 1}.${(im.contentType.split("/")[1] || "bin").replace("jpeg", "jpg")}`,
      caption: im.altText || "",
    };
  });
  // Engine identity travels with the text so the immutable transcript records WHICH
  // parser produced it. A transcript whose engine is unknown cannot be re-verified
  // later, because you cannot re-run an extraction you cannot identify.
  return {
    text: String(j.text || ""),
    engine: j.engine || "mammoth",
    engineVersion: j.engineVersion || null,
    images, truncated: !!j.truncated, warnings: j.warnings || [],
    docxB64,
  };
}

/**
 * PDF text (free, client-side) + embedded images + a page-render fallback for
 * vector figures. Also reports whether the file is really a scan.
 */
async function parsePdf(file) {
  const health = await analyzePdf(file).catch(() => null);
  // Line-aware text: analyzePdf and pdfToText both collapse newlines, which makes
  // "the first line" the whole release and leaves the full-release view as one
  // unreadable block. Fall back to the flat extractors only if this yields nothing.
  const text = (await pdfToLinedText(file).catch(() => ""))
            || (health && health.ok ? health.text : "")
            || (await pdfToText(file).catch(() => ""))
            || "";

  // A PDF with pages but effectively no text layer is a scan. Say so explicitly
  // instead of returning empty text and looking successful.
  const scanned = !!(health && health.ok && health.numPages > 0 && health.readablePct < READABLE_PCT_MIN);

  const images = await pdfImages(file).catch(() => []);
  images.forEach((i) => { i.method = EXTRACTION_METHOD.PDF_EMBEDDED; });

  // Vector figures — maps, sections, drill plans — are invisible to pdfImages.
  // Render those pages whole, skipping pages that already yielded a raster so the
  // same figure is not offered twice.
  let renders = [];
  try {
    renders = await pdfPageRenders(file, { skipPages: images.map((i) => i.page).filter(Boolean) });
    renders.forEach((r) => { r.method = EXTRACTION_METHOD.PDF_PAGE_RENDER; });
  } catch (_) { /* fallback is best-effort */ }

  return {
    text, scanned, pageCount: health ? health.numPages : null,
    readablePct: health ? health.readablePct : null,
    images: [...images, ...renders], truncated: false, warnings: [],
  };
}

/**
 * Ingest one release file.
 *
 * onProgress(stage) fires with: 'uploading' | 'parsing' | 'extracting-media' |
 * 'storing-media' | 'done'.
 *
 * Returns:
 *   { ok, document, text, headline, releaseDate, assets[], reused, skipped,
 *     warnings[], looksLikeRelease, error }
 */
export async function ingestRelease(companyId, file, { onProgress = () => {} } = {}) {
  if (!companyId) throw new Error("companyId is required");
  if (!file) throw new Error("No file supplied");
  if (file.size > MAX_BYTES) throw new Error(`File is too large (max ${Math.round(MAX_BYTES / 1048576)}MB).`);

  const kind = supportedKind(file);
  // Refused BEFORE anything is stored, so we never claim support we don't have.
  if (!kind) {
    return { ok: false, status: INGEST_STATUS.UNSUPPORTED_FORMAT, document: null,
             text: "", headline: "", releaseDate: null, assets: [], reused: 0, skipped: 0,
             warnings: [], looksLikeRelease: false,
             error: "Upload a PDF, DOCX or TXT file. Other formats aren't supported yet." };
  }

  // 1) SOURCE FIRST. From here on the release is safe: every later failure is
  //    recorded against this document rather than losing the upload.
  onProgress("uploading");
  const stored = await storeDocument(companyId, file, { docDate: null });
  const documentId = stored && stored.id;
  if (!documentId) throw new Error("Could not store the source document.");

  const result = {
    ok: false, status: null, document: stored, text: "", headline: "", releaseDate: null,
    assets: [], reused: 0, skipped: 0, warnings: [], looksLikeRelease: false, error: null,
    pageCount: null, readablePct: null, scanned: false, mediaByMethod: {},
  };

  // 2) PARSE
  let parsed = { text: "", images: [], truncated: false, warnings: [] };
  try {
    onProgress("parsing");
    parsed = kind === "docx" ? await parseDocx(file, companyId)
           : kind === "txt"  ? await parseTxt(file)
           : await parsePdf(file);
  } catch (e) {
    // The source survives. Classify WHY so the review screen can say something
    // useful instead of "an error occurred".
    const msg = String(e && e.message || e);
    result.error = msg || "Could not read that file.";
    result.status = classifyFailure(e, msg);
    // Record the failure; do NOT write anything over the document's text.
    //
    // This used to call saveDocumentText(documentId, ""), destroying the evidence
    // from any earlier successful extraction in order to record that a later one
    // failed. A failure is a new fact about an attempt, not a reason to forget what
    // a previous attempt found.
    try {
      await recordExtractionAttempt(companyId, documentId, {
        engine: kind === "docx" ? "mammoth" : kind === "txt" ? "text" : "pdfjs",
        status: result.status,
        errorCode: (e && e.serverCode) || null,
        errorMessage: msg,
      });
    } catch (_) { /* recording a failure must not itself fail the ingest */ }
    return result;
  }

  // 2a) TRANSCRIPT FIRST — before any cleanup, truncation, de-hyphenation, reflow
  //     or headline detection runs. What is stored is exactly what the engine
  //     returned; everything below is a derived view of it.
  //
  //     Append-only: if this document was extracted before, a different result
  //     creates a NEW row rather than replacing the old one, so a worse
  //     re-extraction can never erase a better one.
  // An engine that returned nothing is not a persistence failure — it is a scanned
  // or empty document, classified further down. Never manufacture an empty
  // transcript to satisfy the invariant.
  const engineName = parsed.engine || (kind === "docx" ? "mammoth" : kind === "txt" ? "text" : "pdfjs");
  let transcript = null;
  if (String(parsed.text || "").length) {
    try {
      transcript = await storeTranscript(companyId, documentId, {
        engine: engineName,
        engineVersion: parsed.engineVersion || null,
        sourceKind: kind,
        text: parsed.text || "",
        meta: {
          page_count: parsed.pageCount ?? null,
          image_count: (parsed.images || []).length,
          truncated: !!parsed.truncated,
          warnings: (parsed.warnings || []).slice(0, 25),
          scanned: !!parsed.scanned,
          readable_pct: parsed.readablePct ?? null,
        },
      });
    } catch (e) {
      // FAIL CLOSED. Stop before normalization: no body, no headline, no draft, no
      // Review. The uploaded file is already stored and untouched, and any previous
      // successful transcript is untouched too — this path writes nothing.
      const isPersist = e instanceof TranscriptPersistenceError || (e && e.code === "transcript_persist_failed");
      result.status = INGEST_STATUS.TRANSCRIPT_UNAVAILABLE;
      result.ok = false;
      result.error = isPersist
        ? (e.message || "Could not save the source text. Your file is safe — try again.")
        : "Could not save the source text. Your file is safe — try again.";
      try {
        await recordExtractionAttempt(companyId, documentId, {
          engine: engineName,
          status: INGEST_STATUS.TRANSCRIPT_UNAVAILABLE,
          errorCode: (e && e.code) || null,
          errorMessage: (e && e.detail) || (e && e.message) || null,
        });
      } catch (_) { /* best effort: the attempt row is evidence, not a gate */ }
      return result;
    }
  }
  result.transcriptId = transcript ? transcript.id : null;
  result.transcriptSha256 = transcript ? transcript.sha256 : null;
  result.transcriptChars = transcript ? transcript.char_count : (parsed.text || "").length;

  // ---- VERIFY THE SOURCE (Phase 3E) ----------------------------------------
  // The transcript records what the ENGINE produced. It does not establish that
  // the engine saw everything. That takes a second, independent reading of the
  // package, compared one-to-one against the transcript -- which is what the
  // real footnote omission that started this work would have caught.
  //
  // The SERVER does that work, from the ORIGINAL bytes, and persists the result
  // through the validated RPCs while forwarding this user's token. Nothing here
  // computes or submits a verdict: this call sends the document and three ids,
  // and the answer comes back.
  //
  // DOCX only for now. A PDF has no OOXML package to read independently, so
  // there is nothing to verify against and claiming otherwise would be worse
  // than not claiming it.
  if (kind === "docx" && transcript && parsed.docxB64) {
    onProgress("verifying-source");
    try {
      const vres = await apiFetch("/api/verify-source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          docx: parsed.docxB64,
          companyId,
          documentId,
          transcriptId: transcript.id,
        }),
      });
      const vj = await vres.json().catch(() => ({}));
      if (!vres.ok) {
        const e = new Error(vj.error || `Could not verify the source (${vres.status}).`);
        e.serverCode = vj.code || null;
        throw e;
      }
      result.verification = {
        runId: vj.verificationRunId || null,
        runStatus: vj.runStatus || null,
        verdict: vj.verdict || null,
        counts: vj.counts || {},
        inventoryDigest: vj.inventoryDigest || null,
        canonicalId: vj.canonicalId || null,
        // A refusal is an OUTCOME, not an error: the verification is recorded and
        // there is simply no canonical. Carried so Review can say which.
        canonicalRefusal: vj.canonicalRefusal || null,
      };
    } catch (e) {
      // FAIL CLOSED. The transcript is stored, so the text is real -- but nothing
      // has established that it represents the document faithfully, and no record
      // exists saying so either way. Showing it in Review would present unverified
      // content as verified.
      result.status = INGEST_STATUS.VERIFICATION_UNAVAILABLE;
      result.ok = false;
      result.error = e && e.message
        ? e.message
        : "Could not verify the source document. Your file and its text are safe — try again.";
      try {
        await recordExtractionAttempt(companyId, documentId, {
          engine: engineName,
          status: INGEST_STATUS.VERIFICATION_UNAVAILABLE,
          errorCode: (e && e.serverCode) || (e && e.code) || null,
          errorMessage: (e && e.message) || null,
        });
      } catch (_) { /* best effort: the attempt row is evidence, not a gate */ }
      return result;
    }
  }
  try {
    await recordExtractionAttempt(companyId, documentId, {
      engine: engineName,
      status: INGEST_STATUS.OK,
      transcriptId: transcript ? transcript.id : null,
    });
  } catch (_) { /* never fail an ingest for bookkeeping */ }

  // 2b) NORMALIZE — derived, lossy, and now accounted for. `exclusions` records what
  //     left the Release Body and why; none of it is destroyed, because the
  //     transcript above holds the original.
  const normalization = normalizeRelease(parsed.text || "", { sourceKind: kind });
  const text = normalization.body;
  // Presentation metadata travels BESIDE the text, never inside it. The Review
  // screen and the investor renderer both style headings from this; neither needs
  // the body to carry formatting characters.
  result.blocks = normalization.blocks;
  result.normalization = {
    exclusions: normalization.exclusions.map((e) => ({
      kind: e.kind, reason: e.reason, chars: e.chars, line: e.line,
    })),
    transformations: normalization.transformations,
    layout: normalization.layout,
    mutations: normalization.mutations,
    mutationCount: normalization.mutationCount,
    sourceChars: normalization.sourceChars,
    bodyChars: normalization.bodyChars,
    excludedChars: normalization.excludedChars,
  };
  result.text = text;
  result.warnings = parsed.warnings || [];
  result.pageCount = parsed.pageCount ?? null;
  result.readablePct = parsed.readablePct ?? null;
  result.scanned = !!parsed.scanned;
  result.looksLikeRelease = looksLikePressRelease(text);

  // Facts read from the document, never invented. Null when absent — the review
  // screen asks the human rather than guessing a date.
  result.releaseDate = parseReleaseDate(text) || null;
  result.headline = firstMeaningfulLine(text) || "";

  // DEPRECATED WRITE (migration 0041). documents.extracted_text holds the NORMALIZED
  // body — which is what it has always held, despite its name. Kept only so the
  // onboarding and AI paths that still read it keep working. The authoritative
  // extraction is the transcript above; never read this column as source.
  if (text) { try { await saveDocumentText(documentId, text); } catch (_) {} }

  // 3) MEDIA → hash, dedup, store PRIVATELY, record provenance
  onProgress("extracting-media");
  const images = parsed.images || [];
  if (images.length) {
    onProgress("storing-media");
    for (const img of images) {
      try {
        const { asset, reused } = await storeMediaAsset(companyId, img.blob, {
          filename: img.name,
          caption: img.caption || "",
          sourceDocumentId: documentId,
          extracted: true,
          // Occurrence-specific provenance. Lives on the SIGHTING, never on the
          // canonical asset — the same bytes can arrive by different routes.
          extractionMeta: {
            method: img.method || (kind === "docx" ? EXTRACTION_METHOD.DOCX_EMBEDDED : EXTRACTION_METHOD.PDF_EMBEDDED),
            page: img.page ?? null,
            width: img.width ?? null,
            height: img.height ?? null,
            vector_ops: img.vectorOps ?? null,   // why a page render was offered
            extractor: kind === "docx" ? "mammoth" : "pdfjs",
          },
        });
        result.assets.push(asset);
        const m = img.method || "unknown";
        result.mediaByMethod[m] = (result.mediaByMethod[m] || 0) + 1;
        if (reused) result.reused++;
      } catch (_) {
        // One unstorable image must not fail the release.
        result.skipped++;
      }
    }
  }
  if (parsed.truncated) result.warnings.push("Some images were skipped — the document contained more than we process.");

  onProgress("done");

  // FINAL CLASSIFICATION. A scanned PDF is NOT a success with empty text — it is
  // its own state, so the UI can say "this looks like a scan" rather than
  // presenting a blank release as though extraction worked.
  if (!text && result.scanned) {
    result.status = INGEST_STATUS.TEXT_EXTRACTION_UNAVAILABLE;
    result.ok = false;
    result.warnings.push("This PDF appears to contain scanned pages. MineEx couldn't extract the release text.");
  } else if (!text) {
    result.status = INGEST_STATUS.TEXT_EXTRACTION_UNAVAILABLE;
    result.ok = false;
  } else if (result.skipped || parsed.truncated) {
    result.status = INGEST_STATUS.PARTIAL;
    result.ok = true;
  } else {
    result.status = INGEST_STATUS.OK;
    result.ok = true;
  }
  return result;
}
