// Release revisions — the history of what was actually published.
//
// THREE SEPARATE THINGS, and this file only touches the middle one:
//
//   ORIGINAL SOURCE      the uploaded document, its extracted text, its images
//                        and the Phase 3 evidence chain. Immutable, already
//                        enforced by append-only triggers. Nothing here writes it.
//   PUBLISHED RELEASE    headline + body as investors saw them. Versioned here.
//                        Revision 1 is what originally went live.
//   MINEEX PRESENTATION  summary, media selection, order, captions, category.
//                        Edited in place through the ordinary draft save; it
//                        creates no revision, because MineEx's rendering of a
//                        disclosure is not the disclosure.
//
// Corrections go through /api/revise-release, which calls a SECURITY DEFINER RPC
// as the service role with a verified actor -- the browser cannot call the RPC,
// for the same reason it cannot call publish_publication().

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";

/** Every revision of a publication, newest first. Read-only. */
export async function listRevisions(publicationId) {
  if (!publicationId) return [];
  try {
    const h = await authHeaders();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/release_revisions?publication_id=eq.${publicationId}` +
      `&select=id,revision,previous_revision_id,headline,body,reason,edited_by,created_at` +
      `&order=revision.desc`,
      { headers: h }
    );
    if (!r.ok) return [];
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * Correct a published release. Appends a revision and emits PUBLICATION_REVISED,
 * which updates the feed post, the profile timeline entry and MineIQ in place.
 *
 * Returns `{ unchanged: true }` when nothing actually differs, so saving an
 * untouched release does not manufacture a correction.
 */
export async function reviseRelease({ publicationId, headline, body, reason }) {
  const h = await authHeaders();
  const res = await fetch("/api/revise-release", {
    method: "POST",
    headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({ publicationId, headline, body, reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Could not save the correction (${res.status}).`);
  }
  return data;
}

/**
 * Restore an earlier revision.
 *
 * Deliberately NOT a rewind: it publishes the old content as a NEW revision, so
 * the history remains a truthful record of what investors were shown and when.
 * Revision 3 containing revision 1's text is the honest representation of
 * "we went back" -- deleting revision 2 would not be.
 */
export async function restoreRevision({ publicationId, revision }) {
  if (!revision) throw new Error("Nothing to restore.");
  return reviseRelease({
    publicationId,
    headline: revision.headline,
    body: revision.body,
    reason: `Restored revision ${revision.revision}`,
  });
}
