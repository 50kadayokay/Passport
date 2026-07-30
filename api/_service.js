// Server-only Supabase service-role helpers + dispatcher-secret guard.
//
// SECURITY: SUPABASE_SERVICE_ROLE_KEY bypasses RLS. It is read from the server
// environment and NEVER sent to the browser (no VITE_ prefix, never returned in a
// response). Only trusted server code (the publish service, the dispatcher) uses it.
// Files prefixed with _ are not routed by Vercel.

const SB = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
// Accept the canonical name; fall back to the older local name for dev parity.
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

export const SB_URL = SB;
export const ANON_KEY = ANON;

export function serviceConfigured() {
  return !!(SB && SERVICE);
}

function serviceHeaders(extra = {}) {
  return { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...extra };
}

// Call a Postgres function as the service role. Returns the raw fetch Response.
export async function serviceRpc(fn, body) {
  return fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: serviceHeaders(), body: JSON.stringify(body || {}) });
}

// A service-role REST query (GET by default). Returns the raw fetch Response.
export async function serviceRest(path, { method = "GET", body, prefer } = {}) {
  const headers = serviceHeaders(prefer ? { Prefer: prefer } : {});
  return fetch(`${SB}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

// The service-role data accessor injected into dispatcher listeners.
export function serviceDb() {
  return {
    async getJson(path) { const r = await serviceRest(path); if (!r.ok) return null; return r.json().catch(() => null); },
    write(path, opts) { return serviceRest(path, opts); },
    rpc(fn, body) { return serviceRpc(fn, body); },
  };
}

// Extract a bearer token from the request.
export function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1] : "";
}

// Verify the caller's Supabase session and return the user, or null.
export async function verifyUser(token) {
  if (!token) return null;
  try {
    const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Constant-time-ish comparison for the dispatcher secret. Rejects when the secret
// is unset (fail closed) or mismatched. The dispatcher must never run unauthenticated.
export function checkDispatchSecret(req) {
  const want = process.env.DISPATCH_SECRET;
  if (!want) return false;
  const got = String(req.headers["x-dispatch-secret"] || req.headers["X-Dispatch-Secret"] || "");
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

// Fire the dispatcher immediately (best effort). Short timeout; NEVER throws, so a
// committed publish can never fail because acceleration failed. Cron is the safety net.
export async function invokeDispatchBestEffort(req) {
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const proto = req.headers["x-forwarded-proto"] || "https";
    const secret = process.env.DISPATCH_SECRET;
    if (!host || !secret) return;
    await fetch(`${proto}://${host}/api/dispatch`, {
      method: "POST",
      headers: { "x-dispatch-secret": secret, "content-type": "application/json" },
      body: JSON.stringify({ trigger: "immediate" }),
      signal: AbortSignal.timeout(1500),
    }).catch(() => {});
  } catch { /* never affects the publish response */ }
}
