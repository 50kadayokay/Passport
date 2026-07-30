// Company Portal — client resolution helpers.
//
// The portal is ONE app that renders whichever company the signed-in user belongs
// to. "Every company has its own portal" is structural, not a per-company deploy:
// a company row + an active owner membership + an active entitlement === a working
// portal. These helpers resolve that context. RLS is the real boundary — a user
// only ever sees rows for companies they can touch (owner_id or active membership,
// per migration 0006). Nothing here is a security check; it decides what to render.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders, getUser } from "./auth.js";

// The companies the signed-in user belongs to, newest-membership first. Resolved
// through company_memberships (backfilled for every owner in 0006), so this keeps
// working unchanged when non-owner roles are added later. Returns [] when signed
// out or when the user has no company (an investor) — the portal denies on empty.
export async function myPortalCompanies() {
  const u = getUser();
  if (!u) return [];
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/company_memberships` +
        `?user_id=eq.${u.id}&status=eq.active` +
        `&select=role,joined_at,company:companies(id,slug,name,status)` +
        `&order=joined_at.desc`,
      { headers: h }
    );
    if (!res.ok) return [];
    const rows = await res.json().catch(() => []);
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => r && r.company)
      .map((r) => ({ ...r.company, role: r.role }));
  } catch {
    return [];
  }
}

// A single company's full record for the portal (includes the profile JSON).
export async function loadPortalCompany(companyId) {
  if (!companyId) return null;
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/companies?id=eq.${companyId}&select=id,slug,name,status,owner_id,profile,updated_at&limit=1`,
      { headers: h }
    );
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    return rows[0] || null;
  } catch {
    return null;
  }
}

// A company by slug (for admin "open this company's dashboard"). RLS still applies:
// only a platform admin (or the owner) gets a row back, so this can't leak.
export async function loadPortalCompanyBySlug(slug) {
  if (!slug) return null;
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=id,slug,name,status,owner_id,profile,updated_at&limit=1`,
      { headers: h }
    );
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    return rows[0] || null;
  } catch {
    return null;
  }
}

// { ready, missing[] } for a company — the same check the Admin console shows.
export async function portalReadiness(companyId) {
  if (!companyId) return { ready: false, missing: ["company"] };
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/portal_readiness`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify({ cid: companyId }),
    });
    if (!res.ok) return { ready: false, missing: ["error"] };
    const out = await res.json().catch(() => null);
    return out && typeof out === "object" ? out : { ready: false, missing: ["error"] };
  } catch {
    return { ready: false, missing: ["error"] };
  }
}

// Append one row to the audit trail. Best-effort — a logging failure must never
// block the action it records. `actor_kind` defaults to 'company'; admin-edit
// flows pass 'admin'.
export async function logActivity(companyId, entry = {}) {
  if (!companyId || !entry.action) return;
  try {
    const h = await authHeaders();
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        company_id: companyId,
        actor_id: getUser()?.id || null,
        actor_kind: entry.actorKind || "company",
        action: entry.action,
        entity: entry.entity || null,
        old_value: entry.oldValue ?? null,
        new_value: entry.newValue ?? null,
        reason: entry.reason || null,
        source: entry.source || "ui",
      }),
    });
  } catch (_) {
    /* best effort */
  }
}

// Merge a patch into companies.profile (read-modify-write the JSON column). Used
// by pages that own a slice of the profile (e.g. Calendar → profile.catalysts)
// without going through the full onboarding builder. Returns the saved profile or
// null. Logs nothing itself — the caller decides what to record.
export async function updateCompanyProfile(companyId, nextProfile) {
  if (!companyId) return null;
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${companyId}`, {
      method: "PATCH",
      headers: { ...h, "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ profile: nextProfile }),
    });
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    return rows[0]?.profile ?? nextProfile;
  } catch {
    return null;
  }
}

// Lightweight counts for the Home health score and Analytics — the real numbers we
// already have (documents filed, updates written, things published), fetched with
// PostgREST's exact-count header so we never pull the rows themselves.
export async function companyStats(companyId) {
  const out = { documents: 0, updates: 0, publications: 0, published: 0 };
  if (!companyId) return out;
  const count = async (path) => {
    try {
      const h = await authHeaders();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { ...h, Prefer: "count=exact", Range: "0-0" } });
      const cr = res.headers.get("content-range");
      if (cr && cr.includes("/")) return Number(cr.split("/")[1]) || 0;
      return 0;
    } catch { return 0; }
  };
  const [documents, updates, publications, published] = await Promise.all([
    count(`documents?company_id=eq.${companyId}&select=id`),
    count(`updates?company_id=eq.${companyId}&select=id`),
    count(`publications?company_id=eq.${companyId}&select=id`),
    count(`publications?company_id=eq.${companyId}&status=eq.published&select=id`),
  ]);
  return { documents, updates, publications, published };
}

// Create an invitation for a company owner (admin only — enforced server-side).
// Returns { id, token } or null. The console turns the token into a link.
export async function createInvitation(companyId, email, role = "owner") {
  if (!companyId || !email) return null;
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_company_invitation`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify({ p_company_id: companyId, p_email: email, p_role: role }),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

// Accept an invitation as the signed-in user. The DB enforces the email match.
// Returns { ok, company_id } or { ok:false, error }.
export async function acceptInvitation(token) {
  if (!token) return { ok: false, error: "invalid" };
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/accept_company_invitation`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) return { ok: false, error: "request_failed" };
    const out = await res.json().catch(() => null);
    return out && typeof out === "object" ? out : { ok: false, error: "request_failed" };
  } catch {
    return { ok: false, error: "request_failed" };
  }
}

// Recent audit-trail rows for a company (newest first).
export async function listActivity(companyId, limit = 50) {
  if (!companyId) return [];
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/activity_log?company_id=eq.${companyId}&select=id,actor_kind,action,entity,reason,source,created_at&order=created_at.desc&limit=${limit}`,
      { headers: h }
    );
    if (!res.ok) return [];
    return await res.json().catch(() => []);
  } catch {
    return [];
  }
}
