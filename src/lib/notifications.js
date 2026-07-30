// In-app Notification Center — reads the notifications the dispatcher wrote, plus
// per-user preferences. Even if a (future) push is dismissed, the update waits here.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders, getUser } from "./auth.js";

export async function listNotifications(limit = 50) {
  if (!getUser()) return [];
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications?select=id,kind,company_id,post_id,title,body,deep_link,read_at,created_at&order=created_at.desc&limit=${limit}`, { headers: h });
    if (!res.ok) return [];
    return await res.json().catch(() => []);
  } catch { return []; }
}

export async function unreadCount() {
  if (!getUser()) return 0;
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications?read_at=is.null&select=id`, { headers: { ...h, Prefer: "count=exact", Range: "0-0" } });
    const cr = res.headers.get("content-range");
    return cr && cr.includes("/") ? Number(cr.split("/")[1]) || 0 : 0;
  } catch { return 0; }
}

export async function markRead(id) {
  try {
    const h = await authHeaders();
    await fetch(`${SUPABASE_URL}/rest/v1/notifications?id=eq.${id}`, { method: "PATCH", headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ read_at: new Date().toISOString() }) });
  } catch {}
}

export async function markAllRead() {
  try {
    const h = await authHeaders();
    await fetch(`${SUPABASE_URL}/rest/v1/notifications?read_at=is.null`, { method: "PATCH", headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ read_at: new Date().toISOString() }) });
  } catch {}
}

// Global preference row (company_id null). Returns { muted, min_materiality } or defaults.
export async function getGlobalPref() {
  const u = getUser();
  if (!u) return { muted: false, min_materiality: 0 };
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_prefs?user_id=eq.${u.id}&company_id=is.null&channel=eq.in_app&select=muted,min_materiality&limit=1`, { headers: h });
    const rows = res.ok ? await res.json().catch(() => []) : [];
    return rows[0] || { muted: false, min_materiality: 0 };
  } catch { return { muted: false, min_materiality: 0 }; }
}

export async function setGlobalPref({ muted, min_materiality }) {
  const u = getUser();
  if (!u) return false;
  try {
    const h = await authHeaders();
    // Upsert the global pref (unique on user_id+channel where company_id is null).
    const existing = await fetch(`${SUPABASE_URL}/rest/v1/notification_prefs?user_id=eq.${u.id}&company_id=is.null&channel=eq.in_app&select=id&limit=1`, { headers: h });
    const rows = existing.ok ? await existing.json().catch(() => []) : [];
    const body = JSON.stringify({ user_id: u.id, company_id: null, channel: "in_app", muted, min_materiality });
    if (rows[0]) {
      await fetch(`${SUPABASE_URL}/rest/v1/notification_prefs?id=eq.${rows[0].id}`, { method: "PATCH", headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ muted, min_materiality, updated_at: new Date().toISOString() }) });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/notification_prefs`, { method: "POST", headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" }, body });
    }
    return true;
  } catch { return false; }
}
