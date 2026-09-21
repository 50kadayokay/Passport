// Publish drafts — persistence for the Publish workflow.
//
// Deliberately built ON the existing spine rather than beside it:
//
//   updates            one prepared release   (the draft)
//   publications       one row per DESTINATION (MineEx today; more later)
//   /api/publish       the ONLY publish path — authenticates, authorizes,
//                      verifies entitlement, then the atomic RPC + outbox event
//   posts              projected by the dispatcher, investor-facing
//
// No second publishing system. The one thing this layer adds is that a release
// carries its ORIGINAL publication date, and that date — not now() — is what
// reaches the timeline.

import { SUPABASE_URL } from "./supabase.js";
import { writeHeaders } from "./auth.js";
import { publishViaApi } from "./publishClient.js";

export const MINEEX_DESTINATION = "passport";   // the destination id in the DB

/** Draft lifecycle, mapped onto updates.status (draft | review | published | failed). */
export const DRAFT_STATUS = { DRAFT: "draft", REVIEW: "review", PUBLISHED: "published", FAILED: "failed" };

const j = (h) => ({ ...h, "content-type": "application/json" });

/**
 * Create a draft from an ingestion result.
 *
 * `body` holds the full original release text — the source of truth for the
 * eventual "Read Full Press Release" view. The source DOCUMENT is also kept, so
 * the original file remains available; the text is a convenience, not a
 * replacement.
 */
export async function createDraft(companyId, {
  headline = "", text = "", releaseDate = null, documentId = null,
  ingestStatus = null, assetIds = [], warnings = [], blocks = [],
} = {}) {
  if (!companyId) throw new Error("companyId is required");
  const h = await writeHeaders();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/updates`, {
    method: "POST",
    headers: { ...j(h), Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companyId,
      body: text || "",
      // The ORIGINAL release date. Null when the document did not state one —
      // never guessed; the review screen makes the CEO supply it.
      published_on: releaseDate || null,
      status: DRAFT_STATUS.DRAFT,
      detected: {
        kind: "press_release",
        headline: headline || "",
        document_id: documentId || null,
        ingest_status: ingestStatus || null,
        asset_ids: assetIds,
        warnings,
        // Presentation metadata: which body lines are headings, and at what level.
        // Stored beside the text so styling never requires altering it.
        blocks: Array.isArray(blocks) ? blocks : [],
      },
    }),
  });
  if (!res.ok) throw new Error(`Could not save the draft (${res.status}).`);
  const [row] = await res.json();

  // Link the draft to its source document so provenance survives.
  if (documentId && row) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/update_documents`, {
        method: "POST", headers: j(h),
        body: JSON.stringify({ update_id: row.id, document_id: documentId }),
      });
    } catch (_) { /* non-fatal */ }
  }
  return row;
}

/** Patch a draft. `detected` is merged, never replaced, so nothing is silently dropped. */
export async function saveDraft(updateId, { headline, text, releaseDate, status, detectedPatch } = {}) {
  if (!updateId) return null;
  const h = await writeHeaders();

  let detected = null;
  if (headline !== undefined || detectedPatch) {
    const cur = await fetch(`${SUPABASE_URL}/rest/v1/updates?id=eq.${updateId}&select=detected`, { headers: h });
    const rows = cur.ok ? await cur.json().catch(() => []) : [];
    detected = { ...((rows[0] && rows[0].detected) || {}) };
    if (headline !== undefined) detected.headline = headline;
    if (detectedPatch) Object.assign(detected, detectedPatch);
  }

  const patch = { updated_at: new Date().toISOString() };
  if (text !== undefined) patch.body = text;
  if (releaseDate !== undefined) patch.published_on = releaseDate || null;
  if (status !== undefined) patch.status = status;
  if (detected) patch.detected = detected;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/updates?id=eq.${updateId}`, {
    method: "PATCH", headers: { ...j(h), Prefer: "return=representation" }, body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return rows[0] || null;
}

export async function getDraft(updateId) {
  if (!updateId) return null;
  const h = await writeHeaders();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/updates?id=eq.${updateId}&select=*`, { headers: h });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows[0] || null;
}

/** Everything not yet published, newest first. */
export async function listDrafts(companyId) {
  if (!companyId) return [];
  const h = await writeHeaders();
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/updates?company_id=eq.${companyId}&status=in.(draft,review,failed)&select=*&order=updated_at.desc`,
    { headers: h }
  );
  return r.ok ? await r.json().catch(() => []) : [];
}

/**
 * Published releases, ordered by ORIGINAL publication date — the order investors
 * see, not the order they were uploaded.
 */
export async function listPublished(companyId) {
  if (!companyId) return [];
  const h = await writeHeaders();
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/updates?company_id=eq.${companyId}&status=eq.published&select=*,publications(id,destination_id,status,published_at,external_url)&order=published_on.desc.nullslast`,
    { headers: h }
  );
  return r.ok ? await r.json().catch(() => []) : [];
}

export async function deleteDraft(updateId) {
  if (!updateId) return false;
  const h = await writeHeaders();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/updates?id=eq.${updateId}`, { method: "DELETE", headers: h });
  return r.ok;
}

/** What still has to be true before this draft can go out. */
export function validateForPublish(draft) {
  const problems = [];
  const d = (draft && draft.detected) || {};
  if (!String(d.headline || "").trim()) problems.push("Add a headline.");
  // The date drives published_at, year, quarter and timeline placement, so it is
  // required rather than defaulted — a wrong date mis-files the release forever.
  if (!draft || !draft.published_on) problems.push("Confirm the original publication date.");
  if (!String((draft && draft.body) || "").trim()) problems.push("The release text is empty.");
  return problems;
}

/**
 * Publish to MineEx.
 *
 * Creates (or reuses) the destination publication, then hands off to /api/publish
 * — the same authenticated, entitlement-checked, atomic path everything else
 * uses. The original release date rides on updates.published_on, which the API
 * reads and passes to the RPC, so a 2025 release lands in 2025.
 */
export async function publishDraftToMineEx(companyId, draft) {
  const problems = validateForPublish(draft);
  if (problems.length) throw new Error(problems[0]);

  const h = await writeHeaders();
  const d = draft.detected || {};
  const content = {
    post_type: "press_release",
    headline: String(d.headline || "").trim(),
    body: String(draft.body || "").trim(),
    // Keeps "Read Full Press Release" working from the published record itself.
    fullText: String(draft.body || "").trim(),
    source_document_id: d.document_id || null,
    original_published_on: draft.published_on || null,
  };

  // One publication per (update, destination) — the table enforces it, so a
  // double-click reuses the row instead of creating a second one.
  let publicationId = null;
  const existing = await fetch(
    `${SUPABASE_URL}/rest/v1/publications?update_id=eq.${draft.id}&destination_id=eq.${MINEEX_DESTINATION}&select=id,status`,
    { headers: h }
  );
  if (existing.ok) {
    const rows = await existing.json().catch(() => []);
    if (rows[0]) publicationId = rows[0].id;
  }

  if (publicationId) {
    await fetch(`${SUPABASE_URL}/rest/v1/publications?id=eq.${publicationId}`, {
      method: "PATCH", headers: j(h),
      body: JSON.stringify({ content, status: "approved", updated_at: new Date().toISOString() }),
    });
  } else {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/publications`, {
      method: "POST", headers: { ...j(h), Prefer: "return=representation" },
      body: JSON.stringify({
        company_id: companyId, update_id: draft.id,
        destination_id: MINEEX_DESTINATION, content, status: "approved",
      }),
    });
    if (!res.ok) throw new Error(`Could not prepare the publication (${res.status}).`);
    const [row] = await res.json();
    publicationId = row.id;
  }

  // The ONLY publish path.
  const out = await publishViaApi(publicationId);
  await saveDraft(draft.id, { status: DRAFT_STATUS.PUBLISHED });
  return { ok: true, publicationId, published_at: out && out.published_at };
}
