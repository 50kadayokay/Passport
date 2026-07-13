// Supabase Auth (GoTrue) — email/password, dependency-free.
// Session (access + refresh tokens) is persisted in localStorage and refreshed
// on demand. authHeaders() returns the logged-in user's JWT for RLS-protected
// PostgREST calls; falls back to the anon key when signed out.
import { SUPABASE_URL, SUPABASE_ANON } from "./supabase.js";

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
  const redirectTo = `${window.location.origin}/reset`;
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
