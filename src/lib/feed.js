// Investor feed — client access to the canonical post pipeline (migration 0008).
//
// Everything reads from ONE source: public.posts, the projection of a successfully
// published 'passport' publication. Follows, the three feeds, the company page,
// realtime and analytics all go through here so nothing drifts.

import { SUPABASE_URL, SUPABASE_ANON } from "./supabase.js";
import { authHeaders, getUser } from "./auth.js";

const anon = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };

/* ---------------- follows ---------------- */

export async function follow(companyId) {
  const u = getUser();
  if (!u || !companyId) return false;
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/company_follows`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: u.id, company_id: companyId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function unfollow(companyId) {
  const u = getUser();
  if (!u || !companyId) return false;
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/company_follows?user_id=eq.${u.id}&company_id=eq.${companyId}`, { method: "DELETE", headers: h });
    return res.ok;
  } catch { return false; }
}

export async function isFollowing(companyId) {
  const u = getUser();
  if (!u || !companyId) return false;
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/company_follows?user_id=eq.${u.id}&company_id=eq.${companyId}&select=id&limit=1`, { headers: h });
    if (!res.ok) return false;
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

export async function followerCount(companyId) {
  if (!companyId) return 0;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/company_follower_count`, {
      method: "POST", headers: { ...anon, "content-type": "application/json" },
      body: JSON.stringify({ cid: companyId }),
    });
    if (!res.ok) return 0;
    return Number(await res.json().catch(() => 0)) || 0;
  } catch { return 0; }
}

// The company ids the signed-in investor follows (to render Follow state in lists).
export async function myFollowedIds() {
  const u = getUser();
  if (!u) return [];
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/company_follows?user_id=eq.${u.id}&select=company_id`, { headers: h });
    if (!res.ok) return [];
    const rows = await res.json().catch(() => []);
    return (Array.isArray(rows) ? rows : []).map((r) => r.company_id);
  } catch { return []; }
}

/* ---------------- feeds ---------------- */

async function callFeed(fn, body) {
  try {
    const h = await authHeaders();   // signed-in for Following/personalised Discover; anon still works for Latest/Discover
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

// Reverse-chronological inbox of followed companies. Keyset: pass the last post's
// published_at as `before` for the next page.
export const feedFollowing = ({ limit = 20, before = null } = {}) => callFeed("feed_following", { p_limit: limit, p_before: before });
export const feedLatest    = ({ limit = 20, before = null } = {}) => callFeed("feed_latest",    { p_limit: limit, p_before: before });
export const feedDiscover  = ({ limit = 20, offset = 0 } = {})   => callFeed("feed_discover",  { p_limit: limit, p_offset: offset });

// Posts for one company (company page) — same canonical source, newest first.
export async function companyPosts(companyId, { limit = 20 } = {}) {
  if (!companyId) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?company_id=eq.${companyId}&removed_at=is.null&select=*&order=published_at.desc&limit=${limit}`,
      { headers: anon }
    );
    if (!res.ok) return [];
    return await res.json().catch(() => []);
  } catch { return []; }
}

// Display info for a set of companies (name/slug/ticker/brand) to render feed
// cards. Public read — only published companies (whose posts appear) come back.
export async function companiesInfo(ids) {
  const list = Array.from(new Set((ids || []).filter(Boolean)));
  if (!list.length) return {};
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/companies?id=in.(${list.join(",")})&select=id,slug,name,primary_ticker,brand:profile->brand`,
      { headers: anon }
    );
    if (!res.ok) return {};
    const rows = await res.json().catch(() => []);
    const map = {};
    for (const r of rows) map[r.id] = r;
    return map;
  } catch { return {}; }
}

// One post by id (post detail / deep link). Public read via RLS.
export async function getPost(postId) {
  if (!postId) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${postId}&select=*&limit=1`, { headers: anon });
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    return rows[0] || null;
  } catch { return null; }
}

/* ---------------- realtime "new posts" signal (poll, no auto-move) ---------------- */

// How many live posts exist newer than `since` — powers a "N new posts" pill
// WITHOUT moving the feed under the reader. Cheap exact-count head request.
export async function countNewSince(since, { followedOnly = false } = {}) {
  if (!since) return 0;
  try {
    const h = await authHeaders();
    let url = `${SUPABASE_URL}/rest/v1/posts?removed_at=is.null&published_at=gt.${encodeURIComponent(since)}&select=id`;
    if (followedOnly) {
      const ids = await myFollowedIds();
      if (!ids.length) return 0;
      url += `&company_id=in.(${ids.join(",")})`;
    }
    const res = await fetch(url, { headers: { ...h, Prefer: "count=exact", Range: "0-0" } });
    const cr = res.headers.get("content-range");
    if (cr && cr.includes("/")) return Number(cr.split("/")[1]) || 0;
    return 0;
  } catch { return 0; }
}

/* ---------------- analytics events ---------------- */

export async function recordPostEvent(postId, kind, value = null) {
  const u = getUser();
  if (!u || !postId || !kind) return;
  try {
    const h = await authHeaders();
    await fetch(`${SUPABASE_URL}/rest/v1/post_events`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ post_id: postId, user_id: u.id, kind, value }),
    });
  } catch { /* best effort */ }
}
