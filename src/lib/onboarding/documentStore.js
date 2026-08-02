// Onboarding Engine — Pass 0 ingestion orchestration + inventory reads.
// Reuses the existing `documents` table, company-docs bucket, SHA-256 dedup
// (memory.storeDocument) and pdf.js (pdfText.analyzePdf). Adds per-page extraction
// health, classification, duplicate detection, states, authority, and an audit trail —
// all stored in the existing `documents` row + its `meta` JSONB (no schema rebuild).

import { SUPABASE_URL } from "../supabase.js";
import { authHeaders } from "../auth.js";
import { storeDocument, signedDocUrl } from "../memory.js";
import { analyzePdf, isPdf } from "../pdfText.js";
import { classifyType, detectDate, computeState, needsReview, classifyDuplicate, authorityFor, gateRisks, summarize, DOC_TYPES } from "./classify.js";

const ISO = () => new Date().toISOString();
const ALLOWED = (file) => isPdf(file) || /^image\//.test(file.type || "") || /^text\//.test(file.type || "") || /\.(pdf|png|jpe?g|gif|webp|svg|txt|md|csv)$/i.test(file.name || "");
const firstLine = (t) => (String(t || "").split(/\r?\n/).find((l) => l.trim().length > 8) || "").trim().slice(0, 140);

async function patchDoc(id, patch) {
  const h = await authHeaders();
  await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

// Analyze a file's extraction health (client-side; free).
async function analyzeFile(file) {
  if (isPdf(file)) { const a = await analyzePdf(file); return { analysis: a, text: a.text, isImage: false, isPdfFlag: true, method: "pdfjs" }; }
  if (/^image\//.test(file.type || "") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name || "")) {
    return { analysis: { ok: true, numPages: 1, pages: [{ page: 1, chars: 0, hasText: false }], totalChars: 0, textPages: 0, imageOnlyPages: 1, readablePct: 0, text: "", error: null }, text: "", isImage: true, isPdfFlag: false, method: "image" };
  }
  let text = ""; try { text = (await file.text()).slice(0, 600000); } catch (_) {}
  const chars = text.length;
  return { analysis: { ok: chars > 0, numPages: 1, pages: [{ page: 1, chars, hasText: chars >= 25 }], totalChars: chars, textPages: chars >= 25 ? 1 : 0, imageOnlyPages: chars >= 25 ? 0 : 1, readablePct: chars >= 25 ? 100 : 0, text, error: chars ? null : "no text" }, text, isImage: false, isPdfFlag: false, method: "text" };
}

// Ingest a set of files for a company. Returns per-file results.
export async function ingestFiles(companyId, files, { onProgress } = {}) {
  const list = Array.from(files || []).filter(Boolean);
  const existing = await inventoryRows(companyId, "id,sha256,kind,title,doc_date");
  const results = [];
  let done = 0;
  for (const file of list) {
    try {
      if (!ALLOWED(file)) throw new Error("Unsupported file type");
      const sha = await sha256Hex(file);
      const { analysis, text, isImage, isPdfFlag, method } = await analyzeFile(file);
      const typeResult = classifyType({ filename: file.name, text, mime: file.type });
      const dateResult = detectDate({ text, filename: file.name });
      const title = firstLine(text) || file.name.replace(/\.[a-z0-9]+$/i, "");
      const dup = classifyDuplicate({ sha256: sha, type: typeResult.type, title, docDate: dateResult.date }, existing);
      const state = computeState({ analysis, isPdf: isPdfFlag, isImage, dup });
      const review = needsReview({ typeResult, dateResult, state });

      const stored = await storeDocument(companyId, file, { extractedText: text, docDate: dateResult.date });
      if (stored.dupe) { results.push({ name: file.name, status: "duplicate", of: dup.of }); done++; onProgress && onProgress(done, list.length, file.name); continue; }

      const meta = {
        pageCount: analysis.numPages, charCount: analysis.totalChars, readablePct: analysis.readablePct,
        textPages: analysis.textPages, imageOnlyPages: analysis.imageOnlyPages, isImageOnly: state === "image_only",
        pages: analysis.pages, extractionMethod: method, analysisError: analysis.error || null,
        typeConfidence: typeResult.confidence, typeSignals: typeResult.signals,
        dateSource: dateResult.source, dateConfidence: dateResult.confidence, dateType: dateResult.dateType, dateCandidates: dateResult.candidates,
        authority: authorityFor(typeResult.type),
        duplicateStatus: dup.status, duplicateOf: dup.of,
        needsReview: review, eligible: state !== "failed",
        ocrStatus: state === "image_only" || analysis.imageOnlyPages > 0 ? "pending" : "not_needed",
        events: [
          { at: ISO(), event: "uploaded", detail: `${file.name} (${file.size} bytes)` },
          { at: ISO(), event: "extracted", detail: `${method} · ${analysis.numPages}p · ${analysis.totalChars} chars · ${analysis.readablePct}% readable` },
          { at: ISO(), event: "classified", detail: `${typeResult.type} (${typeResult.confidence})` },
          { at: ISO(), event: "dated", detail: `${dateResult.date || "none"} (${dateResult.source})` },
        ],
      };
      await patchDoc(stored.id, { kind: typeResult.type, title, extraction_status: state, doc_date: dateResult.date, meta, extraction_error: analysis.error || null });
      existing.push({ id: stored.id, sha256: sha, kind: typeResult.type, title, doc_date: dateResult.date });
      results.push({ name: file.name, status: state, id: stored.id, type: typeResult.type, needsReview: review });
    } catch (e) {
      results.push({ name: file.name, status: "failed", error: e.message || "ingest failed" });
    }
    done++; onProgress && onProgress(done, list.length, file.name);
  }
  return results;
}

async function inventoryRows(companyId, select) {
  if (!companyId) return [];
  const h = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/documents?company_id=eq.${encodeURIComponent(companyId)}&select=${select}&order=doc_date.desc.nullslast,created_at.desc`, { headers: h });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

// Full inventory + summary + gate.
export async function listInventory(companyId) {
  const rows = await inventoryRows(companyId, "id,filename,mime,bytes,sha256,kind,doc_date,title,storage_path,extraction_status,extraction_error,meta,created_at,updated_at,extracted_text");
  const docs = (Array.isArray(rows) ? rows : []).map((r) => ({ ...r, textPreview: (r.extracted_text || "").slice(0, 400), extracted_text: undefined }));
  return { docs, summary: summarize(docs), gate: gateRisks(docs) };
}

// Manual override (type/date/exclude/gate override). Merges meta + audit event.
export async function updateDocument(docId, { kind, doc_date, meta = {}, event } = {}) {
  const h = await authHeaders();
  const cur = await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${encodeURIComponent(docId)}&select=meta,kind,doc_date&limit=1`, { headers: h });
  const [row] = (await cur.json().catch(() => [])) || [];
  const nextMeta = { ...((row && row.meta) || {}), ...meta };
  nextMeta.events = [...(((row && row.meta) || {}).events || []), { at: ISO(), event: event || "manual_override", detail: JSON.stringify({ kind, doc_date, ...meta }).slice(0, 200) }];
  const patch = { meta: nextMeta };
  if (kind !== undefined) patch.kind = kind;
  if (doc_date !== undefined) patch.doc_date = doc_date;
  await patchDoc(docId, patch);
  return true;
}

export async function previewUrl(storagePath) { try { return await signedDocUrl(storagePath); } catch { return null; } }

// SHA-256 of a file (browser crypto).
async function sha256Hex(file) {
  try {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
}

// Fetch the FULL extracted text for a company's documents (optionally a subset by id),
// so it can be pasted into ChatGPT as text. This is the reliable extraction path: ChatGPT
// reads pasted text fully, whereas attached PDFs are retrieved as truncated snippets.
export async function fetchDocsText(companyId, docIds) {
  const rows = await inventoryRows(companyId, "id,filename,kind,doc_date,meta,extracted_text");
  let docs = Array.isArray(rows) ? rows : [];
  if (Array.isArray(docIds) && docIds.length) {
    const want = new Set(docIds.map(String));
    docs = docs.filter((d) => want.has(String(d.id)));
  }
  return docs.filter((d) => !(d.meta && d.meta.manually_excluded));
}

// Format documents' extracted text into one paste-ready block with clear per-file headers.
export function buildTextBundle(docs = []) {
  return docs
    .filter((d) => d.extracted_text && d.extracted_text.trim())
    .map((d) => `━━━━━ DOCUMENT: ${d.filename}${d.doc_date ? `  (disclosed ${d.doc_date})` : ""} ━━━━━\n\n${d.extracted_text.trim()}`)
    .join("\n\n\n");
}

export { DOC_TYPES };
