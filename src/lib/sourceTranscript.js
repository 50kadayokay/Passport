// Immutable source transcriptions.
//
// A transcript is EXACTLY what an extraction engine returned for a document,
// before formatReleaseText(), CUT_MARKERS, de-hyphenation, reflow or headline
// detection touch it. It is written once and never updated.
//
// WHY IT EXISTS
// -------------
// Before Phase 2 the only text kept was the normalized text: saveDocumentText()
// wrote the OUTPUT of formatReleaseText() into documents.extracted_text. So when
// a URL rule silently deleted 1,313 characters of technical disclosure from the
// Kingsmen release, there was nothing left to notice it with — the one surviving
// copy was the edited one. Keeping the engine's own output makes every later
// transformation checkable instead of merely trusted.
//
// WHAT THIS MODULE DOES NOT DO
// ----------------------------
// No verification, no reconciliation, no VERIFIED/REVIEW_REQUIRED state. Storage
// and retrieval only — Phase 3 owns the verifier.

import { SUPABASE_URL } from "./supabase.js";
import { writeHeaders } from "./auth.js";

// Re-exported so callers that already import this module do not need a second
// import. The implementation lives in hashText.js, which has no Supabase or Vite
// dependency and therefore runs in a plain Node test as well as the browser.
export { sha256Hex as transcriptSha256 } from "./hashText.js";

/**
 * Raised when a transcript could not be persisted.
 *
 * Distinct from a parse failure on purpose: the engine DID produce text, we simply
 * could not store it. The source file is already preserved, so the correct response
 * is retry, not re-upload.
 */
export class TranscriptPersistenceError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "TranscriptPersistenceError";
    this.code = "transcript_persist_failed";
    this.detail = detail || null;
  }
}

/**
 * Persist the raw engine output for a document. FAILS CLOSED.
 *
 * `text` MUST be the engine's own return value. Passing normalized text here would
 * defeat the entire point, so callers take it straight from the parser.
 *
 * THROWS rather than returning null when the write does not land. The invariant is
 * "no persisted source transcription, no successful ingestion": an ingest that
 * proceeds to Review without a transcript produces editable, publishable content
 * with nothing to check it against — exactly the state Phase 2 exists to prevent.
 * Returning null let that happen quietly, so it now cannot.
 *
 * An empty transcript is never manufactured: empty text is rejected before any
 * request, because a zero-length transcript would assert "the engine found nothing"
 * when the truth is "we were not given anything to store".
 *
 * Idempotent: a unique index on (document_id, sha256) means re-extracting a
 * document that yields identical text returns the existing row rather than
 * duplicating it. Text that DIFFERS always creates a new row — a transcript is
 * never replaced, so a failed or worse retry cannot erase an earlier success.
 *
 * char_count and sha256 are NOT sent: the database generates them from the stored
 * text, so they cannot drift from it.
 */
export async function storeTranscript(companyId, documentId, {
  engine, engineVersion = null, sourceKind = null, text, meta = {},
} = {}) {
  if (!companyId || !documentId) {
    throw new TranscriptPersistenceError("Could not record the source text for this document.", "missing company or document id");
  }
  const body = String(text ?? "");
  if (!body.length) {
    throw new TranscriptPersistenceError("There was no text to record for this document.", "empty transcript refused");
  }

  let res;
  try {
    const h = await writeHeaders();
    res = await fetch(`${SUPABASE_URL}/rest/v1/source_transcripts`, {
      method: "POST",
      headers: {
        ...h, "content-type": "application/json",
        // merge-duplicates + the unique index makes a repeat extraction a no-op.
        Prefer: "return=representation,resolution=merge-duplicates",
      },
      body: JSON.stringify({
        document_id: documentId,
        company_id: companyId,
        engine: engine || "unknown",
        engine_version: engineVersion,
        source_kind: sourceKind,
        transcript_text: body,
        meta: meta || {},
      }),
    });
  } catch (e) {
    throw new TranscriptPersistenceError(
      "Could not save the source text. Your file is safe — try again.",
      `network: ${(e && e.message) || e}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new TranscriptPersistenceError(
      "Could not save the source text. Your file is safe — try again.",
      `http ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }

  const rows = await res.json().catch(() => []);
  const row = (Array.isArray(rows) && rows[0]) || null;
  if (!row || !row.id) {
    throw new TranscriptPersistenceError(
      "Could not confirm the source text was saved. Your file is safe — try again.",
      "write returned no row");
  }
  return row;
}

/** Every transcript for a document, newest first. Append-only, so this is a history. */
export async function listTranscripts(documentId) {
  if (!documentId) return [];
  try {
    const h = await writeHeaders();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/source_transcripts?document_id=eq.${documentId}&select=*&order=created_at.desc`,
      { headers: h },
    );
    return r.ok ? await r.json().catch(() => []) : [];
  } catch (_) { return []; }
}

/** The most recent transcript for a document, or null. */
export async function latestTranscript(documentId) {
  const rows = await listTranscripts(documentId);
  return rows[0] || null;
}

/**
 * Record one extraction attempt, successful or not.
 *
 * This is what replaces the old failure path. Previously a failed retry called
 * saveDocumentText(documentId, "") and overwrote whatever a previous successful
 * extraction had found — destroying evidence to record a failure. Attempts are
 * now additive: the transcript from the good run stays exactly where it was.
 *
 * `errorMessage` is the operator-facing string we already show in the UI. Never
 * put a token, a payload or a stack trace here.
 */
export async function recordExtractionAttempt(companyId, documentId, {
  engine = null, status, errorCode = null, errorMessage = null, transcriptId = null,
} = {}) {
  if (!companyId || !documentId || !status) return null;
  try {
    const h = await writeHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/extraction_attempts`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        document_id: documentId,
        company_id: companyId,
        engine,
        status,
        error_code: errorCode,
        error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
        transcript_id: transcriptId,
      }),
    });
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    return (Array.isArray(rows) && rows[0]) || null;
  } catch (_) { return null; }
}

/** Attempts for a document, newest first. */
export async function listExtractionAttempts(documentId) {
  if (!documentId) return [];
  try {
    const h = await writeHeaders();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/extraction_attempts?document_id=eq.${documentId}&select=*&order=created_at.desc`,
      { headers: h },
    );
    return r.ok ? await r.json().catch(() => []) : [];
  } catch (_) { return []; }
}
