// Calling the database AS THE END USER, from the trusted server.
//
// WHY NOT THE SERVICE KEY
// -----------------------
// The Phase 3 persistence RPCs gate on public.can_touch_company(), which is
// owns_company() or is_admin(). Both resolve through auth.uid(). A service-key
// call carries no end-user `sub` claim, so auth.uid() is NULL and the gate is
// false: measured in production, persist_verification as service_role returns
//
//     42501 not authorized for this company
//
// The database role is not the authorization identity. The end user's JWT is.
// Forwarding it is therefore not a workaround -- it is the only way the tenant
// check can mean anything, and it makes the check validate the actual person who
// uploaded the document rather than possession of a key.
//
// WHAT THIS DOES NOT CHANGE
// -------------------------
// The user's token authorizes; it does not compute. Everything the RPCs receive
// is built by the server from the original bytes. Nothing a browser sends is
// treated as a verdict, a finding, an inventory, a span, a digest or an
// eligibility decision -- see api/verify-source.js.
//
// The RPCs remain SECURITY DEFINER owned by postgres, so the WRITES happen with
// postgres's privileges. `authenticated` holds no write privilege on any evidence
// table (migration 0046); it holds EXECUTE and nothing else.

import { SB_URL, ANON_KEY } from "./_supabase.js";

export class UserDbError extends Error {
  constructor(message, { status = 0, code = null, detail = null } = {}) {
    super(message);
    this.name = "UserDbError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

const headers = (token) => ({
  apikey: ANON_KEY,
  Authorization: `Bearer ${token}`,
  "content-type": "application/json",
});

/**
 * Invoke a database function as the end user.
 *
 * Postgres error codes travel through PostgREST in `code`, so a caller can tell
 * a tenant refusal (42501) from a contract refusal (22023) from a missing
 * reference (23503) without string-matching a message.
 */
export async function userRpc(token, fn, body) {
  if (!token) throw new UserDbError("No user token supplied.", { code: "no_token" });
  let res;
  try {
    res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: headers(token), body: JSON.stringify(body || {}),
    });
  } catch (e) {
    throw new UserDbError(`Could not reach the database to call ${fn}.`, { detail: String(e && e.message) });
  }

  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }

  if (!res.ok) {
    const code = (parsed && parsed.code) || null;
    const msg = (parsed && (parsed.message || parsed.hint)) || text.slice(0, 300);
    throw new UserDbError(msg || `${fn} failed.`, { status: res.status, code, detail: (parsed && parsed.details) || null });
  }
  return parsed;
}

/** Read as the end user, so RLS scopes the result exactly as it would in the browser. */
export async function userSelect(token, path) {
  if (!token) throw new UserDbError("No user token supplied.", { code: "no_token" });
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: headers(token) });
  const text = await res.text();
  if (!res.ok) {
    let parsed = null; try { parsed = JSON.parse(text); } catch {}
    throw new UserDbError((parsed && parsed.message) || text.slice(0, 300),
      { status: res.status, code: parsed && parsed.code });
  }
  try { return JSON.parse(text); } catch { return null; }
}
