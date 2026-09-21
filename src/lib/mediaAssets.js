// Company media assets — the canonical, reusable, PRIVATE media record.
//
//   documents ──► extraction ──► media_assets ──► publication_media ──► publications
//
// Two rules this module exists to enforce:
//
//   1. PRIVATE BY DEFAULT. Extracting an image from an unpublished release must
//      never make it public. Bytes go to `company-media-private` (a private
//      bucket), never to the public `company-media`. There is deliberately no
//      function here that returns a public URL for a private asset — reads go
//      through a short-lived signed URL.
//
//   2. IDENTICAL BYTES ARE ONE ASSET. A logo embedded in forty releases is one
//      row and one file, not forty. Dedup is on sha256 for the same company —
//      exact bytes only. Nothing is ever merged on filename, caption or size.
//
// Authorization mirrors 0037/0038: read derives from the asset row → company →
// can_touch_company(); write derives from the company id in the path. Uploader
// identity is never an authorization mechanism.

import { SUPABASE_URL } from "./supabase.js";
import { writeHeaders } from "./auth.js";
import { annotateAssets } from "./imageSupport.js";

const BUCKET = "company-media-private";
const MAX_BYTES = 25 * 1024 * 1024;

const safeExt = (name, mime) => {
  const fromName = String(name || "").toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  if (fromName) return fromName[1];
  const m = String(mime || "").match(/^image\/([a-z0-9.+-]+)$/);
  return m ? m[1].replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") : "bin";
};

/** SHA-256 of the bytes, hex. The dedup key — exact content, nothing fuzzy. */
export async function sha256Hex(blobOrBuffer) {
  const buf = blobOrBuffer instanceof ArrayBuffer ? blobOrBuffer : await blobOrBuffer.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Intrinsic pixel dimensions, or nulls when they can't be read (SVG, unusual codecs). */
export async function imageDimensions(blob) {
  try {
    const url = URL.createObjectURL(blob);
    try {
      const d = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null });
        img.onerror = () => reject(new Error("not an image"));
        img.src = url;
      });
      return d;
    } finally { URL.revokeObjectURL(url); }
  } catch (_) { return { width: null, height: null }; }
}

/** The company's existing asset for these exact bytes, or null. */
export async function findBySha(companyId, sha) {
  if (!companyId || !sha) return null;
  try {
    const h = await writeHeaders();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/media_assets?company_id=eq.${companyId}&sha256=eq.${sha}&select=*&limit=1`,
      { headers: h }
    );
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return rows[0] || null;
  } catch (_) { return null; }
}

/**
 * Store one media asset, privately.
 *
 * Returns { asset, reused }. `reused: true` means these exact bytes already
 * existed for this company and nothing new was uploaded — the caller gets the
 * canonical row back so it can be selected for a publication as normal.
 *
 * Order is upload-then-insert, matching storeDocument(). A failed insert leaves
 * an unreferenced object (invisible, sweepable); the reverse order would leave a
 * live row pointing at bytes that were never written, which is worse.
 */
export async function storeMediaAsset(companyId, blob, {
  filename = "", caption = "", sourceDocumentId = null, sourceUpdateId = null, extracted = false,
  extractionMeta = null,
} = {}) {
  if (!companyId) throw new Error("companyId is required");
  if (!blob) throw new Error("no media supplied");
  if (blob.size > MAX_BYTES) throw new Error(`Media is too large (max ${Math.round(MAX_BYTES / 1048576)}MB)`);

  const sha = await sha256Hex(blob);

  // Identical bytes for this company → reuse. One file, one row, provenance of
  // the first occurrence preserved.
  const existing = await findBySha(companyId, sha);
  if (existing) {
    // Deduplicate the ASSET, never its HISTORY. This is the third release to
    // contain the same logo: reuse the one canonical file, but record that we saw
    // it here too. The first occurrence's provenance is untouched.
    const source = await recordMediaSource({
      companyId, mediaAssetId: existing.id, sourceDocumentId, sourceUpdateId,
      filename, caption, extractionMeta,
    });
    return { asset: existing, reused: true, source };
  }

  const mime = blob.type || "application/octet-stream";
  const { width, height } = await imageDimensions(blob);

  // COMPANY-ORIENTED PATH: the company owns the asset; the user performs the
  // upload. Storage RLS reads the company id out of this path.
  const ext = safeExt(filename, mime);
  const storagePath = `${companyId}/${crypto.randomUUID()}.${ext}`;
  const h = await writeHeaders();

  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(storagePath)}`, {
    method: "POST",
    // NO x-upsert. It is not a convenience here — it changes the SQL.
    //
    // With x-upsert, storage-api issues INSERT ... ON CONFLICT DO UPDATE, and
    // Postgres requires a SELECT policy on storage.objects to read the conflicting
    // row. The SELECT policy (privmedia_company_read) authorizes by joining to media_assets, whose row
    // is written AFTER this upload. At this instant no such row exists, SELECT is
    // denied, and the statement fails as "new row violates row-level security
    // policy" — an INSERT-shaped error with a SELECT-shaped cause.
    //
    // Before 0037 a broad read policy made SELECT always pass, which is why this
    // worked then and broke when that hole was closed. The path is unique
    // (crypto.randomUUID()), so there is nothing to upsert over. A plain INSERT consults only
    // the INSERT policy, which is exactly what should authorize it.
    headers: { ...h, "Content-Type": mime },
    body: blob,
  });
  if (!up.ok) {
    const d = await up.text().catch(() => "");
    throw new Error(`Media upload failed (${up.status})${d ? `: ${d.slice(0, 120)}` : ""}`);
  }

  const ins = await fetch(`${SUPABASE_URL}/rest/v1/media_assets`, {
    method: "POST",
    headers: { ...h, "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companyId,
      source_document_id: sourceDocumentId || null,
      source_update_id: sourceUpdateId || null,
      extracted_at: extracted ? new Date().toISOString() : null,
      mime_type: mime, width, height, bytes: blob.size, sha256: sha,
      storage_path: `${BUCKET}/${storagePath}`,
      visibility: "private",          // the ONLY state extraction may produce
    }),
  });
  if (!ins.ok) {
    const d = await ins.text().catch(() => "");
    throw new Error(`Could not record media (${ins.status})${d ? `: ${d.slice(0, 120)}` : ""}`);
  }
  const [asset] = await ins.json();
  const source = await recordMediaSource({
    companyId, mediaAssetId: asset.id, sourceDocumentId, sourceUpdateId,
    filename, caption, extractionMeta,
  });
  return { asset, reused: false, source };
}

/**
 * Record that MineEx encountered this asset somewhere.
 *
 * An OBSERVATION, not an approval — nothing here implies the asset may be
 * published. That decision lives only in publication_media.
 *
 * Upserts on (asset, document) so re-running extraction over the same document
 * refreshes the sighting instead of stacking duplicates. Cross-company
 * associations are rejected by composite foreign keys in the database, so a
 * mismatched company fails here rather than being silently written.
 */
export async function recordMediaSource({
  companyId, mediaAssetId, sourceDocumentId = null, sourceUpdateId = null,
  filename = "", caption = "", extractionMeta = null,
} = {}) {
  if (!companyId || !mediaAssetId) return null;
  try {
    const h = await writeHeaders();
    // Only conflict-target a column that is actually present; the unique indexes
    // are partial (document / update), so an asset with neither is always new.
    const onConflict = sourceDocumentId
      ? "?on_conflict=media_asset_id,source_document_id"
      : sourceUpdateId
        ? "?on_conflict=media_asset_id,source_update_id"
        : "";
    const prefer = onConflict
      ? "resolution=merge-duplicates,return=representation"
      : "return=representation";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/media_asset_sources${onConflict}`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json", Prefer: prefer },
      body: JSON.stringify({
        company_id: companyId,
        media_asset_id: mediaAssetId,
        source_document_id: sourceDocumentId || null,
        source_update_id: sourceUpdateId || null,
        original_filename: filename || null,
        original_caption: caption || null,
        extraction_meta: extractionMeta || {},
        seen_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return rows[0] || null;
  } catch (_) { return null; }
}

/** Every place MineEx has encountered this asset, newest sighting first. */
export async function listMediaSources(mediaAssetId) {
  if (!mediaAssetId) return [];
  try {
    const h = await writeHeaders();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/media_asset_sources?media_asset_id=eq.${mediaAssetId}&select=*,documents(id,filename,doc_date,kind)&order=seen_at.desc`,
      { headers: h }
    );
    return r.ok ? await r.json().catch(() => []) : [];
  } catch (_) { return []; }
}

/** Remove one sighting. The canonical asset and its other sightings are untouched. */
export async function removeMediaSource(sourceId) {
  if (!sourceId) return false;
  try {
    const h = await writeHeaders();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/media_asset_sources?id=eq.${sourceId}`, { method: "DELETE", headers: h });
    return r.ok;
  } catch (_) { return false; }
}

/**
 * Short-lived signed URL to view a PRIVATE asset. This is the only way to read
 * one — private assets have no public URL, by design.
 */
export async function signedMediaUrl(storagePath, { expiresIn = 3600 } = {}) {
  if (!storagePath) return "";
  try {
    const h = await writeHeaders();
    const clean = String(storagePath).replace(new RegExp(`^${BUCKET}/`), "");
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${encodeURI(clean)}`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) return "";
    const j = await res.json().catch(() => null);
    return j && j.signedURL ? `${SUPABASE_URL}/storage/v1${j.signedURL}` : "";
  } catch (_) { return ""; }
}

/** Every asset for a company — the data behind a future Media Library. */
export async function listMediaAssets(companyId, { sourceDocumentId = null } = {}) {
  if (!companyId) return [];
  try {
    const h = await writeHeaders();
    const filter = sourceDocumentId ? `&source_document_id=eq.${sourceDocumentId}` : "";
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/media_assets?company_id=eq.${companyId}${filter}&select=*&order=created_at.desc`,
      { headers: h }
    );
    // Annotated here rather than in the UI, so every surface that lists assets
    // gets the same verdict on what can be displayed. `previewable` is derived
    // from the stored mime_type — no extra column, no migration.
    return r.ok ? annotateAssets(await r.json().catch(() => [])) : [];
  } catch (_) { return []; }
}

/**
 * Delete an asset and its file. ROW FIRST, deliberately — see deleteDocument().
 * A failure here can only orphan bytes (invisible, sweepable); the reverse order
 * could leave a live row pointing at a file that no longer exists.
 */
export async function deleteMediaAsset(assetId) {
  if (!assetId) return false;
  try {
    const h = await writeHeaders();
    let storagePath = "";
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/media_assets?id=eq.${assetId}&select=storage_path`, { headers: h });
      if (r.ok) { const rows = await r.json().catch(() => []); storagePath = (rows[0] && rows[0].storage_path) || ""; }
    } catch (_) { /* proceed */ }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/media_assets?id=eq.${assetId}`, { method: "DELETE", headers: h });
    if (!res.ok) return false;

    if (storagePath) {
      const clean = String(storagePath).replace(new RegExp(`^${BUCKET}/`), "");
      try {
        await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(clean)}`, { method: "DELETE", headers: h });
      } catch (_) { /* orphaned; a sweep will find it */ }
    }
    return true;
  } catch (_) { return false; }
}

/* ---------------------------------------------------------------- selection */

/** Assets attached to a publication, with the asset rows embedded. */
export async function listPublicationMedia(publicationId) {
  if (!publicationId) return [];
  try {
    const h = await writeHeaders();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/publication_media?publication_id=eq.${publicationId}&select=*,media_assets(*)&order=sort_order.asc`,
      { headers: h }
    );
    return r.ok ? await r.json().catch(() => []) : [];
  } catch (_) { return []; }
}

/**
 * Attach an asset to a publication, or update that selection.
 *
 * `included` defaults to FALSE: attaching an extracted image to a draft is not
 * a decision to publish it. The CEO opts each one in, per destination — and
 * because `publications` is already one row per destination, the same asset can
 * be included for MineEx and excluded for X with no duplication.
 */
export async function setPublicationMedia(publicationId, mediaAssetId, {
  included = false, sortOrder = 0, captionOverride = null,
} = {}) {
  if (!publicationId || !mediaAssetId) return null;
  try {
    const h = await writeHeaders();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/publication_media?on_conflict=publication_id,media_asset_id`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        publication_id: publicationId, media_asset_id: mediaAssetId,
        included: !!included, sort_order: sortOrder,
        caption_override: captionOverride, updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return rows[0] || null;
  } catch (_) { return null; }
}

/** Detach an asset from a publication. The asset itself is untouched. */
export async function removePublicationMedia(publicationId, mediaAssetId) {
  if (!publicationId || !mediaAssetId) return false;
  try {
    const h = await writeHeaders();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/publication_media?publication_id=eq.${publicationId}&media_asset_id=eq.${mediaAssetId}`,
      { method: "DELETE", headers: h }
    );
    return r.ok;
  } catch (_) { return false; }
}
