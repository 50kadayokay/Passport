// Company Memory (Engine 1) — the permanent per-company document store.
//
// "Upload once, filed forever." Every document a company drops in is stored to
// the company-docs bucket AND recorded in the `documents` table (with its
// extracted text, a content hash for dedup, and metadata), attached to the
// company row. Nothing is ever only in browser memory again — a refresh, a
// crash, or a laptop going to sleep can no longer lose an upload.
//
// This also feeds everything downstream: re-extraction never needs a re-upload,
// and CEO Copilot / the annual-report builder read from the same store.
//
// Flow it enables: create a draft company as soon as we know its name → store the
// documents against it → extract → autosave the profile. The company row exists
// before the documents, so they always have a home.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders, getUser } from "./auth.js";

const DOC_MAX_BYTES = 60 * 1024 * 1024;   // 60MB — technical reports run large
const slugify = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const safeName = (s) => String(s || "file").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";

// SHA-256 of the file bytes, hex — the dedup key. Same file dropped twice (or in
// two folders) becomes ONE document row.
async function sha256Hex(file) {
  try {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

// Guess the document kind from its name — a hint for later filtering, not load-bearing.
function guessKind(name) {
  const n = String(name || "").toLowerCase();
  if (/press|release|news|nr-|pr-/.test(n)) return "press_release";
  if (/deck|present|corporate|investor/.test(n)) return "deck";
  if (/43-101|ni43|technical|resource|feasib|pea|pfs/.test(n)) return "technical_report";
  if (/mda|financial|annual|interim|statement|10-k|10-q/.test(n)) return "financial";
  if (/interview|podcast|transcript/.test(n)) return "interview";
  return "other";
}

// Create (or fetch) a DRAFT company for this name and return { id, slug }. This is
// what gives documents and autosave a home before the profile is finished. Owner
// is the signed-in user (the admin, during concierge). Idempotent on slug.
export async function ensureCompany(name) {
  const user = getUser();
  if (!user) throw new Error("Sign in to start onboarding.");
  const slug = slugify(name);
  if (!slug) throw new Error("Enter a company name first.");
  const h = await authHeaders();

  // Already exists and visible to me? Reuse it.
  const look = await fetch(`${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=id,slug&limit=1`, { headers: h });
  if (look.ok) {
    const rows = await look.json().catch(() => []);
    if (rows[0]) return { id: rows[0].id, slug: rows[0].slug };
  }

  // Create a minimal draft row. return=representation gives us the new id.
  const ins = await fetch(`${SUPABASE_URL}/rest/v1/companies`, {
    method: "POST",
    headers: { ...h, "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ slug, name: String(name).trim(), owner_id: user.id, status: "draft" }),
  });
  if (!ins.ok) {
    const d = await ins.text().catch(() => "");
    // A race or an existing row owned by someone else: re-read.
    const re = await fetch(`${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=id,slug&limit=1`, { headers: h });
    const rows = re.ok ? await re.json().catch(() => []) : [];
    if (rows[0]) return { id: rows[0].id, slug: rows[0].slug };
    throw new Error(`Couldn't create the company (${ins.status})${d ? `: ${d.slice(0, 120)}` : ""}`);
  }
  const [row] = await ins.json();
  return { id: row.id, slug: row.slug };
}

// Upload one file to company-docs and record it in `documents`, de-duped by hash.
// Returns { id, dupe, storagePath }. `extractedText` may be filled in later.
export async function storeDocument(companyId, file, { extractedText = "", docDate = null } = {}) {
  const user = getUser();
  if (!user) throw new Error("Sign in to upload.");
  if (file.size > DOC_MAX_BYTES) throw new Error(`${file.name} is too large (max 60MB).`);
  const h = await authHeaders();
  const sha = await sha256Hex(file);

  // Dedup: same company + same bytes → return the existing row untouched.
  if (sha) {
    const dup = await fetch(`${SUPABASE_URL}/rest/v1/documents?company_id=eq.${companyId}&sha256=eq.${sha}&select=id&limit=1`, { headers: h });
    if (dup.ok) { const rows = await dup.json().catch(() => []); if (rows[0]) return { id: rows[0].id, dupe: true, storagePath: null }; }
  }

  // Upload the bytes under the owner's folder (Storage RLS enforces ownership).
  const storagePath = `${user.id}/${companyId}/${Date.now()}-${safeName(file.name)}`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/company-docs/${encodeURI(storagePath)}`, {
    method: "POST",
    headers: { ...h, "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" },
    body: file,
  });
  if (!up.ok) { const d = await up.text().catch(() => ""); throw new Error(`Upload failed for ${file.name} (${up.status})${d ? `: ${d.slice(0, 120)}` : ""}`); }

  const ins = await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
    method: "POST",
    headers: { ...h, "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companyId, storage_path: `company-docs/${storagePath}`,
      filename: file.name, mime: file.type || "", bytes: file.size, sha256: sha,
      kind: guessKind(file.name), doc_date: docDate,
      extracted_text: extractedText || null,
      extraction_status: extractedText ? "done" : "pending",
      uploaded_by: user.id,
    }),
  });
  if (!ins.ok) { const d = await ins.text().catch(() => ""); throw new Error(`Could not record ${file.name} (${ins.status})${d ? `: ${d.slice(0, 120)}` : ""}`); }
  const [row] = await ins.json();
  return { id: row.id, dupe: false, storagePath: row.storage_path };
}

// Store a batch, reporting progress. One failure never sinks the batch — a doc
// that won't upload is reported and the rest continue.
export async function storeDocuments(companyId, files, { onProgress } = {}) {
  const list = Array.from(files || []).filter(Boolean);
  const stored = [], failed = []; let done = 0, dupes = 0;
  for (const f of list) {
    try {
      const r = await storeDocument(companyId, f);
      stored.push({ file: f, ...r });
      if (r.dupe) dupes++;
    } catch (e) { failed.push({ name: f.name, error: e.message || "failed" }); }
    done++;
    if (onProgress) { try { onProgress(done, list.length, f.name); } catch (_) {} }
  }
  return { stored, failed, dupes };
}

// Fill in a document's extracted text after the AI has read it (e.g. a PDF the
// client couldn't read as text). Best-effort — never throws.
export async function saveDocumentText(docId, text) {
  if (!docId || !text) return;
  try {
    const h = await authHeaders();
    await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${docId}`, {
      method: "PATCH",
      headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ extracted_text: String(text).slice(0, 500000), extraction_status: "done" }),
    });
  } catch (_) { /* best effort */ }
}

// How many documents a company already has in memory (for the UI).
export async function documentCount(companyId) {
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/documents?company_id=eq.${companyId}&select=id`, { headers: { ...h, Prefer: "count=exact" } });
    const cr = res.headers.get("content-range");
    if (cr && cr.includes("/")) return Number(cr.split("/")[1]) || 0;
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) ? rows.length : 0;
  } catch { return 0; }
}
