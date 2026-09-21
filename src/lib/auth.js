// Supabase Auth (GoTrue) — email/password, dependency-free.
// Session (access + refresh tokens) is persisted in localStorage and refreshed
// on demand. authHeaders() returns the logged-in user's JWT for RLS-protected
// PostgREST calls; falls back to the anon key when signed out.
import { SUPABASE_URL, SUPABASE_ANON } from "./supabase.js";
import { isNativeApp, API_BASE } from "./platform.js";
import { SocialLogin } from "@capgo/capacitor-social-login";

const AUTH = `${SUPABASE_URL}/auth/v1`;
const KEY = "pp.session";
const base = { apikey: SUPABASE_ANON, "Content-Type": "application/json" };

const listeners = new Set();
function emit() { const u = getUser(); listeners.forEach((fn) => { try { fn(u); } catch {} }); }
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function save(raw) {
  if (!raw || !raw.access_token) { localStorage.removeItem(KEY); emit(); return null; }
  const session = {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    // refresh a minute before actual expiry to avoid edge-of-expiry failures
    expires_at: Date.now() + ((raw.expires_in || 3600) * 1000) - 60000,
    user: raw.user || null,
  };
  localStorage.setItem(KEY, JSON.stringify(session));
  emit();
  return session;
}
function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }

}
function errText(d) { return d?.msg || d?.error_description || d?.error || d?.message || "Something went wrong"; }

export function getUser() { return load()?.user || null; }
export function isSignedIn() { return !!load()?.access_token; }

// Public signup is investor-only. Companies are provisioned by a platform admin
// (concierge model), not via self-serve signup. Any other requested role falls
// back to 'investor'. The DB trigger (handle_new_user, migration 0004) is the
// authoritative guard; this clamp keeps the client honest.
const PUBLIC_SIGNUP_ROLES = ["investor"];

export async function signUp(email, password, meta) {
  // `data` becomes user_metadata. Only ever send a safe, whitelisted role;
  // anything else falls back to the least-privileged 'investor'.
  const requested = meta && typeof meta.role === "string" ? meta.role : null;
  const role = PUBLIC_SIGNUP_ROLES.includes(requested) ? requested : "investor";
  const body = { email, password, data: { role } };
  const res = await fetch(`${AUTH}/signup`, { method: "POST", headers: base, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errText(data));
  if (data.access_token) return { session: save(data), needsConfirmation: false };
  // Email-confirmation flow is on: no session until the user confirms.
  return { session: null, needsConfirmation: true, user: data.user || data };
}

export async function signIn(email, password) {
  const res = await fetch(`${AUTH}/token?grant_type=password`, { method: "POST", headers: base, body: JSON.stringify({ email, password }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errText(data));
  return save(data);
}

// ---- Social sign-in (native iOS only) ----------------------------------------
// Apple + Google via @capgo/capacitor-social-login. The native flow returns a
// provider id_token; we exchange it for a Supabase session through the GoTrue
// id_token grant, which yields the same session shape as email/password.
// GOOGLE_IOS_CLIENT_ID is the *iOS OAuth client ID* from Google Cloud (public, not
// a secret). Apple needs no client id here — native audience = the app bundle id.
const GOOGLE_IOS_CLIENT_ID = "871146667116-5n20tj4gp1ajp1ssrj1e75er7534i2q5.apps.googleusercontent.com";
export function googleConfigured() { return !!GOOGLE_IOS_CLIENT_ID; }

let _socialReady = null;
function socialInit() {
  if (!_socialReady) {
    _socialReady = SocialLogin.initialize({
      apple: {},
      ...(GOOGLE_IOS_CLIENT_ID ? { google: { iOSClientId: GOOGLE_IOS_CLIENT_ID } } : {}),
    }).then(() => SocialLogin).catch((e) => { _socialReady = null; throw e; });
  }
  return _socialReady;
}

async function exchangeIdToken(provider, id_token) {
  const res = await fetch(`${AUTH}/token?grant_type=id_token`, { method: "POST", headers: base, body: JSON.stringify({ provider, id_token }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errText(data));
  return save(data);
}

export async function signInWithApple() {
  const S = await socialInit();
  const r = await S.login({ provider: "apple", options: { scopes: ["email", "name"] } });
  const res = (r && r.result) || {};
  const token = res.idToken || (res.accessToken && res.accessToken.token);
  if (!token) throw new Error("Apple sign-in was cancelled.");
  return exchangeIdToken("apple", token);
}

export async function signInWithGoogle() {
  if (!GOOGLE_IOS_CLIENT_ID) throw new Error("Google sign-in isn't set up yet.");
  const S = await socialInit();
  const r = await S.login({ provider: "google", options: { scopes: ["email", "profile"] } });
  const res = (r && r.result) || {};
  if (!res.idToken) throw new Error("Google sign-in was cancelled.");
  return exchangeIdToken("google", res.idToken);
}

async function refresh() {
  const s = load();
  if (!s?.refresh_token) return null;
  const res = await fetch(`${AUTH}/token?grant_type=refresh_token`, { method: "POST", headers: base, body: JSON.stringify({ refresh_token: s.refresh_token }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return save(null);
  return save(data);
}

// Current session, refreshed if expired. Null when signed out.
export async function getSession() {
  let s = load();
  if (!s) return null;
  if (Date.now() > s.expires_at) s = await refresh();
  return s;
}

export async function signOut() {
  const s = load();
  // Clear the local session SYNCHRONOUSLY first so callers that reload immediately
  // (without awaiting) are already signed out; then best-effort revoke server-side.
  save(null);
  if (s?.access_token) {
    try { await fetch(`${AUTH}/logout`, { method: "POST", headers: { ...base, Authorization: `Bearer ${s.access_token}` } }); } catch {}
  }
}

// Headers for authenticated PostgREST requests. Uses the user JWT so RLS sees
// auth.uid(); falls back to anon for public reads.
export async function authHeaders() {
  const s = await getSession();
  const token = s?.access_token || SUPABASE_ANON;
  return { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` };
}

// The current (refreshed) user access token, for calling our own /api routes that
// enforce entitlements server-side. Null when signed out — the caller should not
// fall back to anon here, since these endpoints require a real user.
/**
 * Headers for a WRITE, with no anonymous fallback.
 *
 * authHeaders() falls back to the anon key when there is no session. That is fine
 * for reads — you simply see public data — but silently poisonous for writes: the
 * request reaches Postgres as anon, auth.uid() is NULL, and every RLS policy fails
 * with "new row violates row-level security policy". The user sees a security
 * error when the truth is that their session expired, and because getUser() reads
 * a CACHED user from localStorage the UI still looks signed in.
 *
 * Throwing here turns that into an honest, actionable message.
 */
export async function writeHeaders() {
  const s = await getSession();
  const token = s && s.access_token;
  if (!token) {
    const e = new Error("Your session has expired. Sign out and sign in again to continue.");
    e.code = "session_expired";
    throw e;
  }
  return { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` };
}

/**
 * The user id the SERVER will see: the `sub` claim of the access token actually
 * being sent, NOT the `user` object cached in localStorage.
 *
 * These can diverge. `save()` writes `user: raw.user || null`, so any token grant
 * that omits a user (some refresh responses do) leaves the PREVIOUS account's user
 * object sitting beside a brand-new token. Signing out and back in as a different
 * account can do the same. getUser() then reports the stale id while the JWT
 * carries the real one.
 *
 * That matters because storage RLS compares the object's first folder segment to
 * auth.uid(), which comes from the token. A path built from the cached id fails
 * with "new row violates row-level security policy" — a permissions error whose
 * real cause is a stale cache. So paths get built from here.
 */
export async function sessionUserId() {
  const s = await getSession();
  const token = s && s.access_token;
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const claims = JSON.parse(decodeURIComponent(escape(atob(b64))));
    return claims && claims.sub ? String(claims.sub) : null;
  } catch (_) {
    // Never guess. A token we cannot read is a token we cannot build a path from.
    return null;
  }
}

/**
 * Headers for calling OUR OWN /api/* routes. The canonical client-side mechanism.
 *
 * Four different patterns had grown up for this — `Bearer ${token}` with no null
 * check, a conditional spread that silently sent no credential, reusing the
 * Supabase PostgREST headers, and sending none at all. The first is the worst: when
 * the session had gone, `token` was null and the request went out as the literal
 * string "Bearer null", which the server could only report as a rejected login.
 *
 * getSession() refreshes an expired access token first, so an ordinary expiry is
 * invisible here. Only a refresh that FAILS — revoked, or offline — throws, and it
 * throws something a person can act on instead of producing a 401 three layers
 * down. Callers should let it propagate; the UI already renders `session_expired`.
 *
 * Deliberately no `apikey`: that header is for Supabase's own endpoints. Our routes
 * take the user's bearer token and nothing else.
 */
export async function apiHeaders(extra = {}) {
  const s = await getSession();
  const token = s && s.access_token;
  if (!token) {
    const e = new Error("Your session has expired. Sign out and sign in again to continue.");
    e.code = "session_expired";
    throw e;
  }
  return { Authorization: `Bearer ${token}`, ...extra };
}

/**
 * fetch() against one of our own /api routes, with the caller's session attached.
 * Use this rather than building the Authorization header by hand.
 */
export async function apiFetch(path, { headers, ...init } = {}) {
  return fetch(path, { ...init, headers: await apiHeaders(headers || {}) });
}

export async function getAccessToken() {
  const s = await getSession();
  return s?.access_token || null;
}

// The current user's role from the profiles table ('company' | 'admin'), or null.
export async function getMyRole() {
  const u = getUser();
  if (!u) return null;
  const headers = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${u.id}&select=role`, { headers });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return (Array.isArray(rows) && rows[0]?.role) || null;
}

/* ---------- password reset ---------- */
// Email a reset link that returns to /reset. (Delivery uses Supabase's email
// service — reliable delivery needs SMTP configured in the dashboard.)
export async function requestPasswordReset(email) {
  // In the native shell window.location.origin is capacitor://localhost, which the
  // emailed link can't reopen — point recovery at the deployed web /reset instead,
  // so the user completes the reset in Safari and returns to the app to sign in.
  const origin = isNativeApp ? API_BASE : window.location.origin;
  const redirectTo = `${origin}/reset`;
  const res = await fetch(`${AUTH}/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST", headers: base, body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errText(data));
  return true;
}

// The reset email link lands on /reset with the token in the URL hash. Adopt it
// as a session so updatePassword() can run. Returns { type } or null.
export function consumeHashSession() {
  if (typeof window === "undefined") return null;
  // Supabase delivers the recovery token in the URL hash (implicit flow) or,
  // in some configs, the query string — check both. Also surface any error.
  const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search || "");
  const pick = (k) => hash.get(k) || query.get(k);
  const access_token = pick("access_token");
  const error = pick("error_description") || pick("error");
  if (!access_token) return error ? { type: null, error } : null;
  save({ access_token, refresh_token: pick("refresh_token"), expires_in: Number(pick("expires_in")) || 3600, user: null });
  history.replaceState(null, "", window.location.pathname);
  return { type: pick("type") };
}

export async function updatePassword(newPassword) {
  const s = await getSession();
  if (!s?.access_token) throw new Error("Reset link expired — request a new one.");
  const res = await fetch(`${AUTH}/user`, {
    method: "PUT", headers: { ...base, Authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify({ password: newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errText(data));
  return true;
}

// Change the signed-in user's email. GoTrue sends a confirmation link to the NEW address; the
// change only takes effect once that link is clicked. Requires a live session.
export async function updateEmail(newEmail) {
  const s = await getSession();
  if (!s?.access_token) throw new Error("Sign in required.");
  const res = await fetch(`${AUTH}/user`, {
    method: "PUT", headers: { ...base, Authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify({ email: String(newEmail || "").trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errText(data));
  return true;
}
