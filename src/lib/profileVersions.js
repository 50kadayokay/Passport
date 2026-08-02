// Profile version history — a per-company safety net (table: company_profile_versions,
// migration 0013). The admin app snapshots the CURRENT live profile into this table
// immediately BEFORE overwriting companies.profile, and can restore any snapshot in one
// click. Admin/owner only (RLS); anon denied.
//
// Design notes:
//  • Snapshotting is BEST-EFFORT: if the table doesn't exist yet (migration not applied)
//    or the insert fails, snapshot() resolves to { ok:false, reason } instead of throwing,
//    so it never blocks a legitimate save. Callers that require durability should surface
//    the reason to the user.
//  • Restore is itself undoable: restoreVersion() snapshots the current profile first.

import { SUPABASE_URL, updateCompany } from "./supabase.js";
import { authHeaders, getUser } from "./auth.js";

const TABLE = `${SUPABASE_URL}/rest/v1/company_profile_versions`;
const COLS = "id,company_id,slug,note,created_at,created_by";  // profile omitted from lists (large)

// Append a timestamped snapshot of `profile` for a company. Best-effort.
export async function snapshotProfile(company, profile, note = "") {
  if (!company || !company.id || profile == null) return { ok: false, reason: "missing company or profile" };
  try {
    const h = await authHeaders();
    const body = {
      company_id: company.id,
      slug: company.slug,
      profile,
      note: note || null,
      created_by: getUser()?.id || null,
    };
    const res = await fetch(TABLE, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.text().catch(() => "");
      // 404 / relation-does-not-be = migration 0013 not applied yet.
      return { ok: false, reason: `snapshot failed (${res.status})${d ? `: ${d.slice(0, 140)}` : ""}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message || "snapshot failed" };
  }
}

// Newest-first list of a company's snapshots (metadata only, no profile bodies).
export async function listVersions(companyId, limit = 50) {
  if (!companyId) return [];
  const h = await authHeaders();
  const res = await fetch(
    `${TABLE}?company_id=eq.${encodeURIComponent(companyId)}&select=${COLS}&order=created_at.desc&limit=${limit}`,
    { headers: h }
  );
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

// Fetch one snapshot's full profile body.
export async function getVersionProfile(id) {
  const h = await authHeaders();
  const res = await fetch(`${TABLE}?id=eq.${encodeURIComponent(id)}&select=profile&limit=1`, { headers: h });
  if (!res.ok) throw new Error(`Could not read snapshot (${res.status}).`);
  const rows = await res.json().catch(() => []);
  if (!rows[0]) throw new Error("Snapshot not found.");
  return rows[0].profile;
}

// Restore a company's profile to a stored snapshot. Snapshots the CURRENT profile first
// (note: "before restore"), so restoring is itself undoable.
export async function restoreVersion(company, versionId) {
  const target = await getVersionProfile(versionId);
  const h = await authHeaders();
  // snapshot current before overwriting
  const cur = await fetch(`${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(company.slug)}&select=profile&limit=1`, { headers: h });
  const rows = cur.ok ? await cur.json().catch(() => []) : [];
  const current = (rows[0] && rows[0].profile) || null;
  if (current) await snapshotProfile(company, current, "before restore");
  const updated = await updateCompany(company.slug, { profile: target }, h);
  if (!updated) throw new Error("Restore returned no rows — RLS blocked the write, or it's a protected company.");
  return { ok: true };
}

// Keep only the most recent `keep` snapshots for a company; delete the rest. Best-effort.
export async function pruneVersions(companyId, keep = 20) {
  try {
    const all = await listVersions(companyId, 200);
    const stale = all.slice(keep);
    if (!stale.length) return { ok: true, pruned: 0 };
    const h = await authHeaders();
    const ids = stale.map((r) => r.id);
    // delete in one call: id=in.(...)
    const res = await fetch(`${TABLE}?id=in.(${ids.map(encodeURIComponent).join(",")})`, {
      method: "DELETE", headers: { ...h },
    });
    return { ok: res.ok, pruned: res.ok ? ids.length : 0 };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}
