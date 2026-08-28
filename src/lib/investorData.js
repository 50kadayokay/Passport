// Investor account data-access layer (Stage 2).
//
// Read/write the authenticated investor's own Supabase rows (investor_profiles,
// investor_preferences, user_company_relationships, post_likes, post_saves,
// notification_preferences) over PostgREST, using the SAME JWT/auth-header pattern
// messaging already uses (authHeaders() → user JWT → RLS `auth.uid() = user_id`).
//
// Design rules:
//   • "Current user" only — callers never pass a user_id. We read the id from the
//     authenticated session and RLS is the hard security boundary.
//   • No @supabase/supabase-js, no service role — plain fetch + the user JWT.
//   • Field mapping between the existing UI shape (name, investorType, …) and the
//     DB columns (display_name, investor_type, …) lives here.
//   • Nothing in this module is wired into the UI yet (Stage 3 does that). Importing
//     it has zero effect on the app.
import { SUPABASE_URL, SUPABASE_ANON } from "./supabase.js";
import { authHeaders, getUser } from "./auth.js";

const REST = `${SUPABASE_URL}/rest/v1`;

// A typed error so callers can branch on `.code`:
//   unauthenticated | auth | http | network | parse | bad-input
export class InvestorDataError extends Error {
  constructor(code, message, cause) { super(message); this.name = "InvestorDataError"; this.code = code; this.cause = cause; }
}

// Resolve the current session's auth headers + user id, refreshing the token if
// needed (authHeaders → getSession). Throws `unauthenticated` when signed out —
// authHeaders falls back to the anon key, which we detect and reject rather than
// firing a request that RLS would deny anyway.
async function authed() {
  const headers = await authHeaders();
  const token = (headers.Authorization || "").replace(/^Bearer\s+/i, "");
  const userId = getUser()?.id || null;
  if (!token || token === SUPABASE_ANON || !userId) {
    throw new InvestorDataError("unauthenticated", "Not signed in");
  }
  return { headers, userId };
}

// One PostgREST call with consistent error handling.
async function call(path, headers, { method = "GET", body, prefer } = {}) {
  const opts = { method, headers: { ...headers } };
  if (prefer) opts.headers.Prefer = prefer;
  if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  let res;
  try {
    res = await fetch(`${REST}/${path}`, opts);
  } catch (e) {
    throw new InvestorDataError("network", "Network request failed", e);
  }
  if (res.status === 401 || res.status === 403) {
    throw new InvestorDataError("auth", `Not authorized (${res.status})`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new InvestorDataError("http", `Request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  if (res.status === 204) return null;
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { throw new InvestorDataError("parse", "Malformed response"); }
}

const one = (rows) => (Array.isArray(rows) ? rows[0] : rows) || null;
const enc = encodeURIComponent;

/* ============================ Investor Profile ============================ */
// UI shape ↔ DB columns. Only maps keys that are present so partial updates work.
function toDbProfile(ui = {}) {
  const m = { name: "display_name", website: "website", bio: "bio", company: "company", industry: "industry", role: "role", location: "location", investorType: "investor_type" };
  const out = {};
  for (const [k, col] of Object.entries(m)) if (k in ui) out[col] = ui[k];
  if ("onboarding_completed" in ui) out.onboarding_completed = !!ui.onboarding_completed;
  if ("onboarding_completed_at" in ui) out.onboarding_completed_at = ui.onboarding_completed_at;
  return out;
}
function fromDbProfile(row) {
  if (!row) return null;
  return {
    name: row.display_name || "",
    website: row.website || "",
    bio: row.bio || "",
    company: row.company || "",
    industry: row.industry || "",
    role: row.role || "",
    location: row.location || "",
    investorType: row.investor_type || "",
    onboardingCompleted: !!row.onboarding_completed,
    onboardingCompletedAt: row.onboarding_completed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

// The current investor's profile, or null if they haven't created one yet.
export async function getInvestorProfile() {
  const { headers } = await authed();
  return fromDbProfile(one(await call("investor_profiles?select=*&limit=1", headers)));
}

// Create-or-update the current investor's profile (partial update by design).
export async function upsertInvestorProfile(data = {}) {
  const { headers, userId } = await authed();
  const body = { user_id: userId, ...toDbProfile(data) };
  const rows = await call("investor_profiles?on_conflict=user_id", headers, {
    method: "POST", prefer: "resolution=merge-duplicates,return=representation", body,
  });
  return fromDbProfile(one(rows));
}

// Mark onboarding complete (optionally saving final profile fields in the same write).
export async function completeOnboarding(profileData = {}) {
  return upsertInvestorProfile({ ...profileData, onboarding_completed: true, onboarding_completed_at: new Date().toISOString() });
}

/* ============================ Investor Preferences ======================== */
function fromDbPrefs(row) {
  return {
    commodities: row?.commodities || [],
    jurisdictions: row?.jurisdictions || [],
    stages: row?.stages || [],
    interests: row?.interests || [],
  };
}

export async function getInvestorPreferences() {
  const { headers } = await authed();
  return fromDbPrefs(one(await call("investor_preferences?select=*&limit=1", headers)));
}

export async function upsertInvestorPreferences(data = {}) {
  const { headers, userId } = await authed();
  const body = { user_id: userId };
  for (const k of ["commodities", "jurisdictions", "stages", "interests"]) {
    if (k in data) body[k] = Array.isArray(data[k]) ? data[k] : [];
  }
  const rows = await call("investor_preferences?on_conflict=user_id", headers, {
    method: "POST", prefer: "resolution=merge-duplicates,return=representation", body,
  });
  return fromDbPrefs(one(rows));
}

/* ========================== Company Relationships ========================= */
function fromDbRel(row) {
  if (!row) return null;
  return {
    companySlug: row.company_slug,
    isFollowing: !!row.is_following,
    isFavourite: !!row.is_favourite,
    isWatchlist: !!row.is_watchlist,
    notificationsEnabled: row.notifications_enabled == null ? true : !!row.notifications_enabled,
  };
}
// Map partial UI intent → DB columns, preserving Favourite/Watchlist exclusivity:
// turning one on turns the other off, so the DB CHECK is never violated.
function toDbRel(data = {}) {
  if (data.isFavourite === true && data.isWatchlist === true) {
    throw new InvestorDataError("bad-input", "Favourite and Watchlist are mutually exclusive");
  }
  const out = {};
  if ("isFollowing" in data) out.is_following = !!data.isFollowing;
  if ("isFavourite" in data) { out.is_favourite = !!data.isFavourite; if (data.isFavourite) out.is_watchlist = false; }
  if ("isWatchlist" in data) { out.is_watchlist = !!data.isWatchlist; if (data.isWatchlist) out.is_favourite = false; }
  if ("notificationsEnabled" in data) out.notifications_enabled = !!data.notificationsEnabled;
  return out;
}

// All of the current investor's company relationships.
export async function getCompanyRelationships() {
  const { headers } = await authed();
  const rows = (await call("user_company_relationships?select=*", headers)) || [];
  return rows.map(fromDbRel);
}

// Create-or-update one (investor, company) relationship. Partial by design.
export async function upsertCompanyRelationship(companySlug, data = {}) {
  if (!companySlug) throw new InvestorDataError("bad-input", "companySlug is required");
  const { headers, userId } = await authed();
  const body = { user_id: userId, company_slug: companySlug, ...toDbRel(data) };
  const rows = await call("user_company_relationships?on_conflict=user_id,company_slug", headers, {
    method: "POST", prefer: "resolution=merge-duplicates,return=representation", body,
  });
  return fromDbRel(one(rows));
}

// Remove a relationship row entirely (e.g. no longer following/fav/watch).
export async function deleteCompanyRelationship(companySlug) {
  if (!companySlug) throw new InvestorDataError("bad-input", "companySlug is required");
  const { headers } = await authed();
  await call(`user_company_relationships?company_slug=eq.${enc(companySlug)}`, headers, { method: "DELETE", prefer: "return=minimal" });
  return true;
}

/* ================================ Likes ================================== */
export async function getPostLikes() {
  const { headers } = await authed();
  const rows = (await call("post_likes?select=company_slug,post_key", headers)) || [];
  return rows.map((r) => ({ companySlug: r.company_slug, postKey: r.post_key }));
}

export async function isPostLiked(companySlug, postKey) {
  const { headers } = await authed();
  const rows = (await call(`post_likes?company_slug=eq.${enc(companySlug)}&post_key=eq.${enc(postKey)}&select=post_key&limit=1`, headers)) || [];
  return rows.length > 0;
}

export async function likePost(companySlug, postKey) {
  if (!companySlug || !postKey) throw new InvestorDataError("bad-input", "companySlug and postKey are required");
  const { headers, userId } = await authed();
  await call("post_likes?on_conflict=user_id,company_slug,post_key", headers, {
    method: "POST", prefer: "resolution=ignore-duplicates,return=minimal",
    body: { user_id: userId, company_slug: companySlug, post_key: postKey },
  });
  return true;
}

export async function unlikePost(companySlug, postKey) {
  if (!companySlug || !postKey) throw new InvestorDataError("bad-input", "companySlug and postKey are required");
  const { headers } = await authed();
  await call(`post_likes?company_slug=eq.${enc(companySlug)}&post_key=eq.${enc(postKey)}`, headers, { method: "DELETE", prefer: "return=minimal" });
  return true;
}

/* ================================ Saves ================================== */
export async function getPostSaves() {
  const { headers } = await authed();
  const rows = (await call("post_saves?select=company_slug,post_key", headers)) || [];
  return rows.map((r) => ({ companySlug: r.company_slug, postKey: r.post_key }));
}

export async function isPostSaved(companySlug, postKey) {
  const { headers } = await authed();
  const rows = (await call(`post_saves?company_slug=eq.${enc(companySlug)}&post_key=eq.${enc(postKey)}&select=post_key&limit=1`, headers)) || [];
  return rows.length > 0;
}

export async function savePost(companySlug, postKey) {
  if (!companySlug || !postKey) throw new InvestorDataError("bad-input", "companySlug and postKey are required");
  const { headers, userId } = await authed();
  await call("post_saves?on_conflict=user_id,company_slug,post_key", headers, {
    method: "POST", prefer: "resolution=ignore-duplicates,return=minimal",
    body: { user_id: userId, company_slug: companySlug, post_key: postKey },
  });
  return true;
}

export async function unsavePost(companySlug, postKey) {
  if (!companySlug || !postKey) throw new InvestorDataError("bad-input", "companySlug and postKey are required");
  const { headers } = await authed();
  await call(`post_saves?company_slug=eq.${enc(companySlug)}&post_key=eq.${enc(postKey)}`, headers, { method: "DELETE", prefer: "return=minimal" });
  return true;
}

/* ========================= Notification Preferences ====================== */
// Columns are all boolean and default true in the DB, so an empty upsert creates a
// fully-defaulted row. Returned as-is (snake_case) since there's no existing UI to
// map to yet — Stage 6 (Settings) will shape these.
export async function getNotificationPreferences() {
  const { headers } = await authed();
  return one(await call("notification_preferences?select=*&limit=1", headers));
}

// Create the row with defaults if it doesn't exist; returns it.
export async function ensureNotificationPreferences() {
  return getNotificationPreferences().then((row) => row || upsertNotificationPreferences({}));
}

export async function upsertNotificationPreferences(data = {}) {
  const { headers, userId } = await authed();
  const allowed = [
    "push_enabled", "followed_company_news", "followed_company_results",
    "followed_company_financings", "followed_company_media", "favourite_priority",
    "watchlist_alerts", "mineex_recommendations", "mineex_announcements",
  ];
  const body = { user_id: userId };
  for (const k of allowed) if (k in data) body[k] = !!data[k];
  const rows = await call("notification_preferences?on_conflict=user_id", headers, {
    method: "POST", prefer: "resolution=merge-duplicates,return=representation", body,
  });
  return one(rows);
}
