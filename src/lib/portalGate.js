// What PortalGate needs to decide which screen a signed-in person sees.
//
// WHY THIS IS NOT lib/portal.js's myPortalCompanies() / lib/features.js's
// fetchFeatures(). Both return [] for every failure, which is right for the
// places that use them (a missing list renders as empty, a failed feature
// lookup denies) but wrong for a GATE: an investor with no company, a company
// member whose request timed out and a member whose token the server refused
// all came back as [], so the latter two were told "No company portal on this
// account" or "Subscription needed" -- a confident, false statement about
// their account. Each function here answers { ok: true, ... } only when the
// server actually answered, and otherwise says why it could not.
//
// Still UX only. RLS (owns_company + portal_access) is the boundary; nothing
// here grants anything.

import { SUPABASE_URL, SUPABASE_ANON } from "./supabase.js";
import { getSession, getUser } from "./auth.js";
import { ROLES } from "./companyRoles.js";

const REST = `${SUPABASE_URL}/rest/v1`;

// failure reasons: "signed_out" (no session at all), "session_expired" (the
// server refused the token), "unavailable" (network, 5xx, unreadable body).
async function call(path, init = {}) {
  let s = null;
  try { s = await getSession(); } catch { return { ok: false, reason: "unavailable" }; }
  if (!s || !s.access_token) return { ok: false, reason: "signed_out" };
  let res;
  try {
    res = await fetch(`${REST}${path}`, {
      ...init,
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${s.access_token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    });
  } catch { return { ok: false, reason: "unavailable" }; }
  if (res.status === 401) return { ok: false, reason: "session_expired" };
  if (!res.ok) return { ok: false, reason: "unavailable", status: res.status };
  const body = await res.json().catch(() => undefined);
  if (body === undefined) return { ok: false, reason: "unavailable" };
  return { ok: true, body };
}

// A membership row's role, or the least-privileged one. 0076 constrains the
// column to ROLES, so this only matters for a malformed or truncated answer --
// and then the portal should show less, not more (several surfaces read
// `company.role || "owner"`).
export function normaliseRole(role) {
  return ROLES.includes(role) ? role : "viewer";
}

/** The companies this person is an active member of. */
export async function loadMemberships() {
  const u = getUser();
  if (!u || !u.id) return { ok: false, reason: "signed_out" };
  const r = await call(
    `/company_memberships?user_id=eq.${encodeURIComponent(u.id)}&status=eq.active` +
      `&select=role,joined_at,company:companies(id,slug,name,status)&order=joined_at.desc`
  );
  if (!r.ok) return r;
  if (!Array.isArray(r.body)) return { ok: false, reason: "unavailable" };
  const companies = r.body
    .filter((m) => m && m.company && m.company.id)
    .map((m) => ({ ...m.company, role: normaliseRole(m.role) }));
  return { ok: true, companies };
}

/** profiles.role ('admin' | 'company' | 'investor' ...), or null when unknown. */
export async function loadPlatformRole() {
  const u = getUser();
  if (!u || !u.id) return { ok: false, reason: "signed_out" };
  const r = await call(`/profiles?id=eq.${encodeURIComponent(u.id)}&select=role`);
  if (!r.ok) return r;
  return { ok: true, role: (Array.isArray(r.body) && r.body[0] && r.body[0].role) || null };
}

/** Does my_features(cid) include portal_access? (Platform admins get everything.) */
export async function loadPortalAccess(companyId) {
  if (!companyId) return { ok: false, reason: "unavailable" };
  const r = await call(`/rpc/my_features`, { method: "POST", body: JSON.stringify({ cid: companyId }) });
  if (!r.ok) return r;
  if (!Array.isArray(r.body)) return { ok: false, reason: "unavailable" };
  const ids = r.body.map((x) => (typeof x === "string" ? x : x && x.my_features)).filter(Boolean);
  return { ok: true, entitled: ids.includes("portal_access") };
}

/** One company by slug, for a platform admin's ?company=<slug>. */
export async function loadCompanyBySlug(slug) {
  if (!slug) return { ok: true, company: null };
  const r = await call(`/companies?slug=eq.${encodeURIComponent(slug)}&select=id,slug,name,status,owner_id,tier,profile,updated_at&limit=1`);
  if (!r.ok) return r;
  return { ok: true, company: (Array.isArray(r.body) && r.body[0]) || null };
}
