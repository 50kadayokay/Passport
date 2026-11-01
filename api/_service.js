// Server-only Supabase service-role helpers + dispatcher-secret guard.
//
// SECURITY: SUPABASE_SERVICE_ROLE_KEY bypasses RLS. It is read from the server
// environment and NEVER sent to the browser (no VITE_ prefix, never returned in a
// response). Only trusted server code (the publish service, the dispatcher) uses it.
// Files prefixed with _ are not routed by Vercel.

// URL + publishable key come from the shared resolver, so service-role calls and
// user-token calls always target the same project as the browser. Only the
// service-role key is read here, because only this file may ever see it.
import { SB_URL as SB, ANON_KEY as ANON, supabaseConfigured, verifyBearer } from "./_supabase.js";
import { IS_STAGING, STAGING } from "./_stagingEnv.js";
// Accept the canonical name; fall back to the older local name for dev parity.
// Staging reads ONLY its own name: the production names are refused outright by
// _stagingEnv.js, so a production key loaded by mistake can never be used here.
const SERVICE = IS_STAGING ? (STAGING.service || "")
  : (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

export const SB_URL = SB;
export const ANON_KEY = ANON;

export function serviceConfigured() {
  return !!(supabaseConfigured() && SERVICE);
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

// A service-role Storage call (e.g. DELETE an object). Returns the raw fetch Response.
export async function serviceStorage(path, { method = "GET" } = {}) {
  // No content-type: Storage refuses a JSON content-type with an empty body (400).
  const { "content-type": _ct, ...headers } = serviceHeaders();
  return fetch(`${SB}/storage/v1/${path}`, { method, headers });
}

// The service-role data accessor injected into dispatcher listeners.
export function serviceDb() {
  return {
    async getJson(path) { const r = await serviceRest(path); if (!r.ok) return null; return r.json().catch(() => null); },
    // STRICT read for listeners (D22): an HTTP error THROWS, so the delivery
    // is retried instead of being completed as "nothing to do". 200 with no
    // rows is a real answer and returns [].
    async getRows(path) {
      const r = await serviceRest(path);
      if (!r.ok) throw new Error(`read failed (${r.status}) ${path.split("?")[0]}`);
      const j = await r.json().catch(() => { throw new Error(`read returned no JSON ${path.split("?")[0]}`); });
      return Array.isArray(j) ? j : [];
    },
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
// Verify a caller's token. Returns the user, or null.
//
// Kept null-returning because its callers branch on null, but it no longer hides
// WHY: a transport failure (bad URL, network) used to be indistinguishable from a
// rejected token, so a misconfigured server reported "Sign in required." Now the
// reason is logged, scrubbed of any credential.
export async function verifyUser(token) {
  const v = await verifyBearer(token);
  if (!v.ok && v.status === 502) console.error(`[auth] verifyUser could not reach Supabase — ${v.detail}`);
  return v.ok ? v.user : null;
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

// WHERE INTERNAL CALLS GO (F5). Internal chaining carries secrets
// (DISPATCH_SECRET, NEWS_PULL_SECRET), so its target must come from trusted
// configuration only -- never from Host, X-Forwarded-Host, Forwarded or any
// other request header, which a client controls wherever a proxy passes them
// through (measured: Vercel overwrites them; other hosts and local emulation may
// not). Order:
//   1. PUBLIC_BASE_URL -- set per deployment (https; http only for loopback,
//      which the local staging harness uses for itself);
//   2. https://VERCEL_URL -- set by the platform, never by a request;
//   3. none: the caller SKIPS the call. Every internal chain is an accelerator
//      with a guaranteed path behind it, so skipping is the safe failure.
export function selfBaseUrl() {
  const raw = String(process.env.PUBLIC_BASE_URL || "").trim();
  if (raw) {
    try {
      const u = new URL(raw);
      const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
      if ((u.protocol === "https:" || (u.protocol === "http:" && loopback)) && !u.username && !u.password) {
        return `${u.protocol}//${u.host}`;
      }
    } catch { /* fall through */ }
    console.error("[service] PUBLIC_BASE_URL is not a usable https origin; internal calls fall back or are skipped");
  }
  const vercel = String(process.env.VERCEL_URL || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (vercel && /^[a-z0-9.-]+(:\d+)?$/i.test(vercel)) return `https://${vercel}`;
  return null;
}

// Fire the dispatcher immediately (best effort). Short timeout; NEVER throws, so a
// committed publish can never fail because acceleration failed. The guaranteed
// drain is a scheduler (D22 Phase 3); until one exists, a skipped or failed
// nudge leaves the work queued, not lost. Takes no request: the target is
// selfBaseUrl(), never a header (F5). Returns what happened, for logs and tests.
export async function invokeDispatchBestEffort() {
  try {
    const base = selfBaseUrl();
    const secret = process.env.DISPATCH_SECRET;
    if (!base) return { dispatched: false, reason: "no trusted base url (PUBLIC_BASE_URL / VERCEL_URL)" };
    if (!secret) return { dispatched: false, reason: "DISPATCH_SECRET not set" };
    const r = await fetch(`${base}/api/dispatch`, {
      method: "POST",
      headers: { "x-dispatch-secret": secret, "content-type": "application/json" },
      body: JSON.stringify({ trigger: "immediate" }),
      signal: AbortSignal.timeout(1500),
    }).catch(() => null);
    return { dispatched: !!r, status: r ? r.status : 0 };
  } catch { return { dispatched: false, reason: "error" }; /* never affects the response */ }
}
