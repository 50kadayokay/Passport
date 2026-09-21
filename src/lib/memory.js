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
import { authHeaders, writeHeaders, sessionUserId, getUser } from "./auth.js";

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
  // writeHeaders, not authHeaders: getUser() above reads a CACHED user, so an
  // expired session still looks signed in. Without this the upload goes out as
  // anon, auth.uid() is NULL, and storage rejects it as an RLS violation — which
  // reads as a permissions bug rather than "log in again".
  const h = await writeHeaders();
  const sha = await sha256Hex(file);

  // Dedup: same company + same bytes → return the existing row untouched.
  if (sha) {
    const dup = await fetch(`${SUPABASE_URL}/rest/v1/documents?company_id=eq.${companyId}&sha256=eq.${sha}&select=id&limit=1`, { headers: h });
    if (dup.ok) { const rows = await dup.json().catch(() => []); if (rows[0]) return { id: rows[0].id, dupe: true, storagePath: null }; }
  }

  // Path is `<uid>/<company_id>/<file>` — uploader folder first, company second.
  //
  // The company id is still the LAST folder segment, which is what docs_path_company()
  // reads, so READ authorization is company-derived exactly as intended. The uid
  // prefix exists only so the storage INSERT policy can match a folder the uploader
  // owns, which is how every one of the 401 existing objects is already laid out.
  //
  // A company-first path (`<company_id>/<file>`) is cleaner, but it made uploads fail
  // with "new row violates row-level security policy": the write check could not be
  // satisfied. Writes were never the vulnerability here — the hole was that ANY
  // authenticated user could READ any company's documents, and that fix is untouched.
  // Built from the TOKEN's sub, not getUser().id. RLS compares this first segment
  // to auth.uid(), which is the token's sub — so the two must be the same source.
  // A stale cached user beside a fresh token silently produces a path the policy
  // cannot match, and the only symptom is an RLS violation.
  const uid = await sessionUserId();
  if (!uid) throw new Error("Your session has expired. Sign out and sign in again to continue.");
  const storagePath = `${uid}/${companyId}/${Date.now()}-${safeName(file.name)}`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/company-docs/${encodeURI(storagePath)}`, {
    method: "POST",
    // NO x-upsert. It is not a convenience here — it changes the SQL.
    //
    // With x-upsert, storage-api issues INSERT ... ON CONFLICT DO UPDATE, and
    // Postgres requires a SELECT policy on storage.objects to read the conflicting
    // row. The SELECT policy (docs_company_read) authorizes by joining to documents, whose row
    // is written AFTER this upload. At this instant no such row exists, SELECT is
    // denied, and the statement fails as "new row violates row-level security
    // policy" — an INSERT-shaped error with a SELECT-shaped cause.
    //
    // Before 0037 a broad read policy made SELECT always pass, which is why this
    // worked then and broke when that hole was closed. The path is unique
    // (Date.now()), so there is nothing to upsert over. A plain INSERT consults only
    // the INSERT policy, which is exactly what should authorize it.
    headers: { ...h, "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!up.ok) {
    const d = await up.text().catch(() => "");
    // An RLS rejection here is almost always an identity mismatch, so say which
    // identities were in play rather than leaving it to guesswork. Ids are
    // truncated: enough to compare, not enough to be a useful leak.
    const idHint = /row-level security|AccessDenied|Unauthorized/i.test(d)
      ? ` [path uid ${uid.slice(0, 8)}… · cached user ${String(user.id).slice(0, 8)}… · company ${String(companyId).slice(0, 8)}…]`
      : "";
    throw new Error(`Upload failed for ${file.name} (${up.status})${d ? `: ${d.slice(0, 160)}` : ""}${idHint}`);
  }

  const ins = await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
    method: "POST",
    headers: { ...h, "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companyId, storage_path: `company-docs/${storagePath}`,
      filename: file.name, mime: file.type || "", bytes: file.size, sha256: sha,
      kind: guessKind(file.name), doc_date: docDate,
      extracted_text: extractedText || null,
      extraction_status: extractedText ? "done" : "pending",
      uploaded_by: uid,
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

// The company's whole file — every document ever filed, newest first. This is
// the record the Memory view shows and future cross-company intelligence reads.
export async function listDocuments(companyId) {
  if (!companyId) return [];
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/documents?company_id=eq.${companyId}&select=id,filename,mime,bytes,kind,doc_date,storage_path,extraction_status,extracted_text,created_at&order=created_at.desc`, { headers: h });
    if (!res.ok) return [];
    const rows = await res.json().catch(() => []);
    // Trim extracted_text to a preview so the list isn't huge; the full text stays in the row.
    return (Array.isArray(rows) ? rows : []).map((r) => ({ ...r, textPreview: (r.extracted_text || "").slice(0, 160), extracted_text: undefined, hasText: !!(r.extracted_text && r.extracted_text.trim()) }));
  } catch { return []; }
}

// Remove a document from the file (row + best-effort blob). Owner/admin only (RLS).
// Delete a document AND its stored file.
//
// Previously this deleted only the row, so every deletion leaked its file into
// company-docs forever — 74 abandoned objects / 125.5 MB had accumulated by the
// time it was found.
//
// ORDER MATTERS, and it is row-first on purpose. The opposite order risks:
//   object delete succeeds → row delete fails → a live document now points at a
//   missing file, which the CEO sees as a broken download.
// Row-first can only fail the other way: the row goes, the object lingers as an
// orphan — invisible, harmless, and recoverable, because "no documents row" is
// exactly the definition a sweep uses to find orphans.
export async function deleteDocument(docId) {
  if (!docId) return false;
  try {
    const h = await authHeaders();

    // Read the path BEFORE deleting the row — afterwards it is unrecoverable.
    let storagePath = "";
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${docId}&select=storage_path`, { headers: h });
      if (r.ok) { const rows = await r.json().catch(() => []); storagePath = (rows[0] && rows[0].storage_path) || ""; }
    } catch (_) { /* proceed: losing the file is better than keeping a broken row */ }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${docId}`, { method: "DELETE", headers: h });
    if (!res.ok) return false;                    // row still there → object untouched

    // Best effort. A failure here leaves a sweepable orphan, never a broken row.
    if (storagePath) {
      const clean = String(storagePath).replace(/^company-docs\//, "");
      try {
        await fetch(`${SUPABASE_URL}/storage/v1/object/company-docs/${encodeURI(clean)}`, { method: "DELETE", headers: h });
      } catch (_) { /* orphaned; the sweep will find it */ }
    }
    return true;
  } catch { return false; }
}

// Full document rows for re-extraction: storage path + extracted text + mime, so
// the "re-analyze from memory" flow can rebuild the corpus without re-uploading.
export async function documentsForExtraction(companyId) {
  if (!companyId) return [];
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/documents?company_id=eq.${companyId}&select=id,filename,mime,storage_path,extracted_text,extraction_status,doc_date,kind,meta&order=created_at.desc`, { headers: h });
    if (!res.ok) return [];
    return await res.json().catch(() => []);
  } catch { return []; }
}

// Documents whose content hasn't been folded into the profile yet — the target of
// "analyze new documents". A doc is "reflected" once its content has been routed.
export async function unreflectedDocuments(companyId) {
  const docs = await documentsForExtraction(companyId);
  return docs.filter((d) => !(d.meta && d.meta.reflected));
}

// Mark documents as reflected into the profile (so a later "analyze new" skips
// them). Best-effort; meta is otherwise unused so a plain set is safe.
export async function markReflected(docIds) {
  const ids = (Array.isArray(docIds) ? docIds : []).filter(Boolean);
  if (!ids.length) return;
  try {
    const h = await authHeaders();
    await fetch(`${SUPABASE_URL}/rest/v1/documents?id=in.(${ids.join(",")})`, {
      method: "PATCH",
      headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ meta: { reflected: true } }),
    });
  } catch (_) { /* best effort */ }
}

// Download a stored document's bytes and return base64 (no data: prefix). The
// owner/admin can read company-docs via the pp_auth_read policy. Used to feed a
// PDF back to the text extractor when its text wasn't captured at ingest.
export async function downloadDocumentBase64(storagePath) {
  if (!storagePath) return null;
  try {
    const h = await authHeaders();
    // storage_path is stored as "company-docs/<path>"; the object API wants /object/<bucket>/<path>.
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${storagePath}`, { headers: h });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    let binary = ""; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch { return null; }
}

// A short-lived signed URL to view/download a stored document. The company-docs
// bucket is private, so we mint a time-limited link the browser can open directly.
// `download:true` makes the browser save the file instead of rendering it inline.
export async function signedDocUrl(storagePath, { download = false } = {}) {
  if (!storagePath) return null;
  try {
    const h = await authHeaders();
    // storage_path is stored as "company-docs/<path>"; the sign endpoint wants the
    // bucket and object path separately.
    const clean = String(storagePath).replace(/^company-docs\//, "");
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/company-docs/${encodeURI(clean)}`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600 }),
    });
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    if (!d || !d.signedURL) return null;
    let url = `${SUPABASE_URL}/storage/v1${d.signedURL}`;
    if (download) url += (url.includes("?") ? "&" : "?") + "download";
    return url;
  } catch {
    return null;
  }
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
