// A caller's role in a company, decided server-side, as the caller.
//
// One implementation shared by the AI guard (F4) and billing (F2). Roles come
// from my_company_role(cid) (migration 0006), called with the CALLER'S OWN
// token: SECURITY DEFINER, keyed on auth.uid(), so it can only ever describe the
// caller -- there is no argument that names another user. It returns the active
// membership role, or 'owner' via companies.owner_id, or null.
//
// Platform admins (profiles.role = 'admin') are a separate question, answered
// from the caller's own profile row, which RLS lets every user read.

import { SB_URL, ANON_KEY, bearerToken, verifyBearer, supabaseConfigured } from "./_supabase.js";

// Who may start or manage a company's billing (F2, approved policy): its owners
// and company admins. Platform admins are admitted separately by
// requireCompanyRole (they run manual / invoiced billing).
export const BILLING_ROLES = ["owner", "admin"];

// Who may send company messages (a03, approved): analysts and viewers read the
// inbox but do not send. Mirrors 0076's has_company_role() message policies.
export const MESSAGING_ROLES = ["owner", "admin", "editor", "publisher"];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The caller's role in `cid`. Returns the role, null for "no role", or
 *  undefined if it could not be asked (callers must treat that as a refusal). */
export async function callerCompanyRole(token, cid) {
  if (!token) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/my_company_role`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ cid }),
    });
    if (!r.ok) return undefined;
    const v = await r.json().catch(() => undefined);
    return typeof v === "string" ? v : v === null ? null : undefined;
  } catch { return undefined; }
}

/** Is the caller a platform admin? Their own profile row, read as themselves. */
export async function callerIsPlatformAdmin(token) {
  if (!token) return false;
  try {
    const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!u.ok) return false;
    const user = await u.json().catch(() => null);
    if (!user || !user.id) return false;
    const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
    const rows = r.ok ? await r.json().catch(() => []) : [];
    return !!(rows[0] && rows[0].role === "admin");
  } catch { return false; }
}

/**
 * Guard: the caller must be signed in and hold one of `roles` in `companyId`
 * (or be a platform admin, when `allowPlatformAdmin`). Sends the error response
 * and returns null on refusal; otherwise returns { user, token, role, isAdmin }.
 *
 *   401  not signed in / session invalid
 *   400  companyId missing or not a UUID
 *   403  no qualifying role in THAT company (other companies, investors, lower roles)
 *   502  the role could not be checked (fails closed)
 */
export async function requireCompanyRole(req, res, { companyId, roles, allowPlatformAdmin = true }) {
  if (!supabaseConfigured()) { res.status(500).json({ error: "Server not configured: Supabase env is missing." }); return null; }
  const token = bearerToken(req);
  const v = await verifyBearer(token);
  if (!v.ok) { res.status(v.status).json({ error: v.error }); return null; }
  const id = String(companyId || "");
  if (!UUID.test(id)) { res.status(400).json({ error: "companyId is required." }); return null; }
  const role = await callerCompanyRole(token, id);
  if (role === undefined) { res.status(502).json({ error: "Could not check your role for this company." }); return null; }
  if (role && roles.includes(role)) return { user: v.user, token, role, isAdmin: false };
  if (allowPlatformAdmin && (await callerIsPlatformAdmin(token))) return { user: v.user, token, role: role || null, isAdmin: true };
  res.status(403).json({ error: "Your role in this company does not allow this.", code: "role_not_permitted", role: role || null, allowed: roles });
  return null;
}
