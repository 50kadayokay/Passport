// Supabase Auth (GoTrue) — email/password, dependency-free.
// Session (access + refresh tokens) is persisted in localStorage and refreshed
// on demand. authHeaders() returns the logged-in user's JWT for RLS-protected
// PostgREST calls; falls back to the anon key when signed out.
import { SUPABASE_URL, SUPABASE_ANON } from "./supabase.js";
import { isNativeApp, API_BASE } from "./platform.js";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { Capacitor } from "@capacitor/core";

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

// ---- Social sign-in (native only) --------------------------------------------
// Apple + Google via @capgo/capacitor-social-login. The native flow returns a
// provider id_token; we exchange it for a Supabase session through the GoTrue
// id_token grant, which yields the same session shape as email/password. That
// exchange (and everything after it — session shape, persistence, refresh,
// logout) is IDENTICAL on every platform. Only how the id_token is obtained, and
// which OAuth client the token is minted for, differ per platform.
//
// iOS   — native Google SDK. Audience = the iOS OAuth client ID.
// Android — Google Credential Manager. Audience = the *Web* OAuth client ID.
//           The Android OAuth client (package name + signing SHA-1) only
//           AUTHORISES the app to ask; it is never the token audience. Both IDs
//           must therefore be listed in Supabase → Auth → Google → Client IDs.
//
// Neither value is a secret: OAuth *client IDs* are public client configuration
// (the client secret is what must never ship, and we never use one). The iOS ID
// stays inline exactly as it shipped; the Android/Web ID is read from the same
// VITE_ mechanism the Supabase config already uses, so it can differ per
// environment without a code change.
const GOOGLE_IOS_CLIENT_ID = "871146667116-5n20tj4gp1ajp1ssrj1e75er7534i2q5.apps.googleusercontent.com";
const GOOGLE_WEB_CLIENT_ID = (import.meta.env && import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID) || "";

function nativePlatform() {
  try { return Capacitor.getPlatform(); } catch (_) { return "web"; }
}

// Apple sign-in is iOS-only for v1. Android would need a Services ID + a server
// redirect endpoint (web OAuth flow), which is deliberately out of scope — so the
// button is hidden there rather than shown and failing.
export function appleAvailable() { return nativePlatform() === "ios"; }

// True only when THIS platform has the client id its Google flow needs. On
// Android that is the Web client id; without it the button stays hidden instead
// of failing at tap time.
export function googleConfigured() {
  return nativePlatform() === "android" ? !!GOOGLE_WEB_CLIENT_ID : !!GOOGLE_IOS_CLIENT_ID;
}

let _socialReady = null;
function socialInit() {
  if (!_socialReady) {
    const p = nativePlatform();
    // Only initialise providers this platform can actually complete. Passing an
    // Android config on iOS (or vice versa) is what produces the classic
    // "Developer console is not set up correctly" failure.
    const google = p === "android"
      ? (GOOGLE_WEB_CLIENT_ID ? { webClientId: GOOGLE_WEB_CLIENT_ID } : null)
      : (GOOGLE_IOS_CLIENT_ID ? { iOSClientId: GOOGLE_IOS_CLIENT_ID } : null);
    _socialReady = SocialLogin.initialize({
      ...(p === "ios" ? { apple: {} } : {}),   // unchanged on iOS; omitted elsewhere
      ...(google ? { google } : {}),
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
  if (!googleConfigured()) throw new Error("Google sign-in isn't set up yet.");
  const S = await socialInit();
  // Scopes are passed on iOS only, preserving the shipped iOS call exactly.
  //
  // On Android the plugin REJECTS any custom `scopes` array unless MainActivity is
  // subclassed (ModifiedMainActivityForSocialLoginPlugin) — verified on-device:
  // "You CANNOT use scopes without modifying the main activity". It is unnecessary
  // here: the Android provider already requests
  // userinfo.email + userinfo.profile + openid by default, which is exactly what
  // ["email","profile"] asked for, and the ID token is all we need for the Supabase
  // exchange (we never call a Google API, so no access-token scope is required).
  // Omitting them keeps MainActivity stock.
  const options = nativePlatform() === "android" ? {} : { scopes: ["email", "profile"] };
  const r = await S.login({ provider: "google", options });
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
  // Detach this device's push token FIRST, while the session is still valid —
  // release_push_token needs auth.uid(). Without this the device keeps receiving
  // this user's notifications after the next account signs in. Best-effort and
  // never allowed to block signing out.
  try {
    const { unregisterPush } = await import("./push.js");
    await unregisterPush();
  } catch (_) { /* logout must always proceed */ }
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
