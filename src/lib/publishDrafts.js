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
import { isPortalDemo } from "./demoMode.js";

// DEMO HARNESS ONLY. /portaldemo has no session, so both list calls below threw
// and the library rendered an expired-session banner over an empty grid --
// hiding the card design and the milestone/year/quarter tabs, which is the one
// thing the demo exists to show. import.meta.env.DEV is a literal false in a
// production build and MUST lead the condition: Rollup cannot see through the
// isPortalDemo() call on its own, and with the call first the branch survives
// and the fixtures ship as a real chunk.
//
// The `import.meta.env &&` in front of it is for plain node: several of these
// modules are imported directly by the test scripts, where import.meta.env is
// undefined and reading .DEV off it throws. Vite still substitutes the literal
// `import.meta.env.DEV`, so the branch is pruned from the bundle as before.
const demo = () => import("../portal/__fixtures/updatesDemo.js");

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
// Media posts are `updates` too (detected.post_type = 'media', created with
// status 'review' and never moved on), so without this every photo and video
// also appeared in the press-release library as a "Draft · Date needed".
const NOT_MEDIA = "&or=(detected.is.null,detected->>post_type.is.null,detected->>post_type.neq.media)";

export async function createDraft(companyId, {
  headline = "", text = "", releaseDate = null, documentId = null,
  ingestStatus = null, assetIds = [], warnings = [], blocks = [],
} = {}) {
  // `body` is editable from the moment the draft exists, so by the time anyone
  // asks "what did the document actually say?" the answer is gone. The source
  // FILE is preserved, but rendering it needs a signed URL and a viewer; this
  // keeps the extracted text as it arrived, written once at creation and never
  // patched afterwards (saveDraft merges `detected` and never touches this key),
  // so the review screen can show an unedited original beside the edited one.
  if (!companyId) throw new Error("companyId is required");
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) {
    const { demoCreateDraft } = await import("./demoPublish.js");
    return demoCreateDraft(companyId, { headline, text, releaseDate, documentId, ingestStatus, assetIds, warnings, blocks });
  }
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
        // The extracted text, exactly as ingestion produced it. Write-once.
        source_text: text || "",
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

/**
 * Patch a draft. `detected` is merged, never replaced, so nothing is silently
 * dropped -- which is also what keeps `source_text` intact: callers patch
 * headline/analysis/selection, and a merge leaves every key they do not name.
 */
export async function saveDraft(updateId, { headline, text, releaseDate, status, detectedPatch } = {}) {
  if (!updateId) return null;
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) {
    const { demoSaveDraft } = await import("./demoPublish.js");
    // The demo company id is not passed here, so it is recovered from the id's
    // own namespace -- demo drafts are the only ones with this prefix.
    const cid = (typeof window !== "undefined" && window.__mineexDemoCompanyId) || "demo";
    return demoSaveDraft(cid, updateId, { headline, text, releaseDate, status, detectedPatch });
  }
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
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) {
    const { demoGetDraft } = await import("./demoPublish.js");
    const cid = (typeof window !== "undefined" && window.__mineexDemoCompanyId) || "demo";
    return demoGetDraft(cid, updateId);
  }
  // Demo harness: without this, clicking any card in the library opens the
  // review screen and immediately reports "that draft could not be opened".
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) {
    const d = await demo();
    return [...d.RELEASE_PUBLISHED, ...d.RELEASE_DRAFTS].find((r) => r.id === updateId) || null;
  }
  const h = await writeHeaders();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/updates?id=eq.${updateId}&select=*`, { headers: h });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows[0] || null;
}

/** Everything not yet published, newest first. */
export async function listDrafts(companyId) {
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) {
    // Fixture drafts PLUS anything drafted in this session, so a release left
    // half-finished is still there after a reload.
    const { demoListDrafts } = await import("./demoPublish.js");
    return [...demoListDrafts(companyId), ...(await demo()).RELEASE_DRAFTS];
  }
  if (!companyId) return [];
  const h = await writeHeaders();
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/updates?company_id=eq.${companyId}&status=in.(draft,review,failed)${NOT_MEDIA}&select=*&order=updated_at.desc`,
    { headers: h }
  );
  return r.ok ? await r.json().catch(() => []) : [];
}

/**
 * Published releases, ordered by ORIGINAL publication date — the order investors
 * see, not the order they were uploaded.
 */
export async function listPublished(companyId) {
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return (await demo()).RELEASE_PUBLISHED;
  if (!companyId) return [];
  const h = await writeHeaders();
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/updates?company_id=eq.${companyId}&status=eq.published${NOT_MEDIA}&select=*,publications(id,destination_id,status,published_at,external_url,created_at)&order=published_on.desc.nullslast`,
    { headers: h }
  );
  return r.ok ? await r.json().catch(() => []) : [];
}

/**
 * Releases that already used this source document.
 *
 * `documents` deduplicates on sha256 (memory.js), so re-uploading the same bytes
 * returns the SAME document row rather than a new one. That makes "has this
 * release been published before?" answerable without hashing anything here:
 * look for other updates linked to that document.
 *
 * Deliberately a WARNING, not a block — a corrected or revised release is a
 * legitimate second publication of the same source.
 */
export async function releasesForDocument(companyId, documentId, exceptUpdateId = null) {
  if (!companyId || !documentId) return [];
  try {
    const h = await writeHeaders();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/update_documents?document_id=eq.${documentId}` +
      `&select=update_id,update:updates(id,company_id,status,published_on,detected)`,
      { headers: h }
    );
    if (!r.ok) return [];
    const rows = await r.json().catch(() => []);
    return (Array.isArray(rows) ? rows : [])
      .map((x) => x.update)
      .filter((u) => u && u.company_id === companyId && u.id !== exceptUpdateId)
      .map((u) => ({
        id: u.id,
        status: u.status,
        publishedOn: u.published_on,
        headline: (u.detected && u.detected.headline) || "Untitled release",
      }));
  } catch {
    return [];
  }
}

export async function deleteDraft(updateId) {
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) {
    const { demoDeleteDraft } = await import("./demoPublish.js");
    const cid = (typeof window !== "undefined" && window.__mineexDemoCompanyId) || "demo";
    demoDeleteDraft(cid, updateId); return true;
  }
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
  // DEMO. The real path emits an outbox event that five listeners act on: a
  // feed post, follower notifications, device pushes, MineIQ fact extraction
  // and the profile timeline. Only the last of those belongs in a demo, so the
  // demo publisher writes the timeline entry locally and stops there. A demo
  // that queued a push would wake somebody's phone.
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) {
    const { publishToDemo, demoMarkPublished, demoGetDraft } = await import("./demoPublish.js");
    // Publish what was SAVED, not what the caller happens to be holding. The
    // real path does the same for the same reason: the API reads the updates
    // row server-side rather than trusting a browser object, and the browser's
    // copy of `detected` is stale by construction -- the AI analysis is written
    // by autosave and never read back into the editor's draft state.
    const stored = (draft && draft.id && demoGetDraft(companyId, draft.id)) || null;
    const merged = stored
      ? {
          ...stored, ...draft,
          detected: {
            ...(stored.detected || {}),
            ...((draft && draft.detected) || {}),
            // Autosave owns the analysis and publish() has just flushed it, so
            // the stored copy is never behind the client's.
            ...(stored.detected && stored.detected.analysis
              ? { analysis: stored.detected.analysis }
              : null),
          },
        }
      : draft;
    const entry = publishToDemo(companyId, merged);
    if (draft && draft.id) demoMarkPublished(companyId, draft.id);
    return { ok: true, demo: true, publicationId: `demo-pub-${entry.id}`, entry };
  }
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
