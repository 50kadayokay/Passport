// a08 — what Mine IQ may treat as CURRENT company knowledge.
//
// The decision (user, via S4, 2026-11-01): "When a release is unpublished,
// remove its full text and facts from active Mine IQ retrieval. Preserve
// historical audit records, but do not present unpublished material as current
// public information."
//
// So nothing is deleted. updates, release_revisions, activity_log and facts rows
// all stay. What changes is what retrieval RETURNS: a release's text, and every
// fact learned from it, count only while its profile ("passport") publication is
// published. Taking it down hides them; publishing again brings them back,
// because the rows never went anywhere.
//
//   release  active iff a passport publication of that update is 'published'.
//            unpublish_publication flips the publication, not updates.status,
//            so updates.status = 'published' alone is not enough.
//   fact     active iff its publication (facts.publication_id) is 'published'.
//            Every fact is written by the mineiq_facts_v1 listener with a
//            publication; one whose publication was deleted has publication_id
//            null (on delete set null) and is not active either.
//
// A corrected release surfaces only its current body: the release row is synced
// on every saved correction (CreateRelease syncLiveRow) and the facts a
// correction removed are superseded by the listener.
//
// Shared by api/_mineiqSearch.js (the server retrieval path) and src/lib/mineiq.js
// (the portal's own counts), so both apply one rule. Pure: no fetch here.

/** PostgREST filter that keeps only facts whose publication is live (inner embed). */
export const ACTIVE_FACTS = "publications!inner(status)&publications.status=eq.published";

const uuidList = (ids) => [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(String(id || ""))).join(",");

/**
 * The two reads that decide which retrieved rows are active, for the ids
 * retrieval actually returned (never the whole company). Run with the caller's
 * JWT, so RLS scopes them exactly as it scopes the search itself.
 */
export function activeFilterPaths(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const releaseIds = uuidList(list.filter((r) => r.source === "release").map((r) => r.id));
  const factIds = uuidList(list.filter((r) => r.source === "fact").map((r) => r.id));
  return {
    releases: releaseIds
      ? `publications?update_id=in.(${releaseIds})&destination_id=eq.passport&status=eq.published&select=update_id`
      : null,
    facts: factIds
      ? `facts?id=in.(${factIds})&select=id,${ACTIVE_FACTS}`
      : null,
  };
}

/**
 * Keep the active rows. `live` is { updateIds, factIds } from the reads above;
 * `null` means those reads failed, and then every release and fact is dropped
 * (documents stay): when we cannot tell whether a release is still public, it
 * is not presented as if it were.
 */
export function keepActive(rows, live) {
  const list = Array.isArray(rows) ? rows : [];
  const upd = new Set((live && live.updateIds) || []);
  const fct = new Set((live && live.factIds) || []);
  return list.filter((r) => {
    if (r.source === "release") return !!live && upd.has(r.id);
    if (r.source === "fact") return !!live && fct.has(r.id);
    return true;
  });
}

/**
 * Filter retrieved rows through `select(path)` (a userSelect bound to the
 * caller's token). Returns { rows, degraded }: degraded = the liveness reads
 * failed and releases and facts were withheld.
 */
export async function filterActive(rows, select) {
  const paths = activeFilterPaths(rows);
  try {
    const [rel, fac] = await Promise.all([
      paths.releases ? select(paths.releases) : [],
      paths.facts ? select(paths.facts) : [],
    ]);
    const live = {
      updateIds: (Array.isArray(rel) ? rel : []).map((r) => r.update_id),
      factIds: (Array.isArray(fac) ? fac : []).map((r) => r.id),
    };
    return { rows: keepActive(rows, live), degraded: false };
  } catch {
    return { rows: keepActive(rows, null), degraded: true };
  }
}
