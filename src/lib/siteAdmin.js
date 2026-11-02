// The portal's side of the Site Contract (a14): what the company's website
// pulls, and the tokens it pulls with.
//
// Everything here is a plain RLS-scoped PostgREST call as the signed-in user:
//   company_blueprints (website)  read: members; write: owner/admin/editor/publisher (0076)
//   site_credentials              read + revoke: owner/admin only (0068/0076); a client
//                                 can never read token_hash, mint, extend or un-revoke
// The portal UI narrows writes to owners and admins; the database is the boundary.
//
// Selection semantics (hidden sections, feeds, the published snapshot) live in
// siteSelection.js, shared with the API that serves the site.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";
import { guardDemoWrite } from "./demoMode.js";
import { snapshotForPublish } from "./siteSelection.js";

export const MANAGE_ROLES = ["owner", "admin"];
export const canManageSite = (role) => MANAGE_ROLES.includes(role);

export class ConflictError extends Error {}

const BP_COLS = "id,company_id,template_key,template_version,status,data,manifest,updated_at";

/** The company's website blueprint, or null when no site has been connected. */
export async function loadWebsite(companyId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/company_blueprints?company_id=eq.${companyId}` +
    `&blueprint_type=eq.website&select=${BP_COLS}&order=updated_at.desc&limit=1`, { headers: await authHeaders() });
  if (!r.ok) throw new Error(`Your website settings could not be loaded (${r.status}).`);
  return (await r.json().catch(() => []))[0] || null;
}

/**
 * Save the working copy; with `publish`, also freeze it as what the site serves
 * and mark the blueprint approved. Compare-and-set on updated_at, so two people
 * editing at once cannot silently overwrite each other (or a manifest upload
 * that landed in between).
 */
export async function saveWebsite(row, data, { publish = false } = {}) {
  guardDemoWrite(publish ? "Publishing website content" : "Saving website settings");
  let next = publish ? snapshotForPublish(data) : data;
  // A blueprint approved before a14 has no snapshot, so its working copy IS
  // live. Freeze what is live now before the first draft save, or "Save draft"
  // would publish.
  if (!publish && row.status === "approved" && !(row.data && row.data.published)) {
    next = { ...data, published: snapshotForPublish(row.data || {}, (row.data && row.data.publishedAt) || null).published };
  }
  const body = { data: next, updated_at: new Date().toISOString(), ...(publish ? { status: "approved" } : {}) };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/company_blueprints?id=eq.${row.id}` +
    `&updated_at=eq.${encodeURIComponent(row.updated_at)}&select=${BP_COLS}`, {
    method: "PATCH",
    headers: { ...(await authHeaders()), "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (r.status === 401 || r.status === 403) throw new Error("Your role cannot change the website.");
  if (!r.ok) throw new Error(`The website could not be saved (${r.status}).`);
  const saved = (await r.json().catch(() => []))[0];
  if (!saved) throw new ConflictError("Someone else changed the website settings. Reload to see their version.");
  return saved;
}

const CRED_COLS = "id,kind,label,expires_at,revoked_at,last_used_at,created_at";

/** Site and draft tokens (never their values -- those are shown once, at issue). */
export async function listSiteTokens(companyId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/site_credentials?company_id=eq.${companyId}` +
    `&select=${CRED_COLS}&order=created_at.desc&limit=200`, { headers: await authHeaders() });
  if (!r.ok) throw new Error(`Website tokens could not be loaded (${r.status}).`);
  return r.json();
}

/** One-way: the database stamps its own clock and refuses to un-revoke. */
export async function revokeSiteToken(id) {
  guardDemoWrite("Revoking a website token");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/site_credentials?id=eq.${id}&select=${CRED_COLS}`, {
    method: "PATCH",
    headers: { ...(await authHeaders()), "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`The token could not be revoked (${r.status}).`);
  const row = (await r.json().catch(() => []))[0];
  if (!row) throw new Error("Only an owner or admin can revoke website tokens.");
  return row;
}

/** active | revoked | expired -- for display only; the API decides on every request. */
export function tokenState(t, now = Date.now()) {
  if (t.revoked_at) return "revoked";
  if (t.expires_at && Date.parse(t.expires_at) <= now) return "expired";
  return "active";
}
