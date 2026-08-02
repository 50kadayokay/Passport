// Profile write safety — the single choke point for overwriting companies.profile from
// the admin/extraction/conference tooling. Two guarantees:
//
//   1. PROTECTED flagship rows (the built-in Kingsmen demo) are never overwritten by
//      tooling. Kingsmen renders from PassportProto's built-in prototype (no `pp`), so
//      ANY compiled profile written to its live row breaks the app. Conference/extraction
//      work for a protected company must happen on a DRAFT CLONE, never the live row.
//
//   2. Every write is preceded by a version snapshot (profileVersions.snapshotProfile),
//      so any change is recoverable in one click, and old snapshots are pruned.
//
// The ONLY sanctioned way to overwrite a protected row is an explicit, human-initiated
// RESTORE (allowProtected:true) — used by the emergency "restore live Kingsmen" action.

import { updateCompany } from "./supabase.js";
import { authHeaders } from "./auth.js";
import { snapshotProfile, pruneVersions } from "./profileVersions.js";

// Flagship demo rows whose LIVE profile must never be overwritten by tooling.
export const PROTECTED_SLUGS = ["kingsmen-resources"];
export function isProtectedSlug(slug) { return PROTECTED_SLUGS.includes(String(slug || "")); }

// Overwrite companies.profile safely: guard protected rows, snapshot-before-write, prune.
// Pass allowProtected:true ONLY for an explicit human restore of a protected row.
// Returns { ok, snapshot } — snapshot.ok=false means history wasn't captured (surface it).
export async function saveProfileSafely(company, nextProfile, { note = "", allowProtected = false, keep = 20 } = {}) {
  if (!company || !company.slug) throw new Error("saveProfileSafely: missing company.");
  if (isProtectedSlug(company.slug) && !allowProtected) {
    throw new Error(
      `Refused: "${company.slug}" is the protected flagship profile and must never be overwritten by conference/extraction tooling. ` +
      `Do this work on a draft clone instead.`
    );
  }
  const h = await authHeaders();
  // Snapshot the CURRENT live profile before we overwrite it.
  const snap = await snapshotProfile(company, company.profile ?? null, note);
  const updated = await updateCompany(company.slug, { profile: nextProfile }, h);
  if (!updated) throw new Error("Save returned no rows — RLS blocked the write (owner/admin only), or a protected template company.");
  if (company.id) pruneVersions(company.id, keep).catch(() => {});
  return { ok: true, snapshot: snap };
}
