// Company notifications — who followed this company, who liked a release.
//
// NOT to be confused with lib/notifications.js, which is the INVESTOR's
// notification feed in the app (a different audience, different tables, and it
// already owns that filename). This is the company side, backed by 0049.
//
// Follows and likes carry a name because they are deliberate acts the investor
// chose to make; views and reads never do (see 0048's aggregate-only design).
// If that distinction ever needs revisiting, revisit it in the migration.
//
// Fails soft to null so the page can say "not switched on yet" instead of
// showing an empty bell that reads as "nobody has followed you".

import { SUPABASE_URL } from "./supabase.js";
import { isPortalDemo } from "./demoMode.js";
import { authHeaders } from "./auth.js";

const REST = `${SUPABASE_URL}/rest/v1`;

// Demo harness: /portaldemo has no company UUID, so the real queries below
// cannot resolve and every page shows its "not switched on yet" state --
// correct, but it leaves the finished design invisible. These branches serve
// synthetic fixtures instead. import.meta.env.DEV is a literal false in a
// production build. It must be the LEADING term of the condition: Rollup cannot
// see through the isPortalDemo() call on its own, and with the call first the
// branch survives and the fixtures ship as a real chunk. Verified by grepping
// dist/ for a fixture string after building.
// The demo has no database, so it keeps its own cleared_at in sessionStorage.
// Without it the fixtures came back on every Refresh, which is NOT what
// production does -- there 0064's RPC filters server-side. A demo that behaves
// differently from the thing it demonstrates is worse than no demo.
const DEMO_CLEARED_KEY = "mineex-demo-notifications-cleared-at";
const demoCleared = () => { try { return sessionStorage.getItem(DEMO_CLEARED_KEY); } catch { return null; } };

/**
 * The feed, with WHY it is missing when it is: { ok: true, rows } |
 * { ok: false, missing: true } (0049 not applied: PostgREST answers 404 for
 * an unknown function) | { ok: false } (anything else -- network, 5xx, junk).
 * The page used to say "needs a database update" for all three.
 */
export async function loadCompanyNotifications(companyId, limit = 50) {
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) {
    const { NOTIFICATIONS } = await import("../portal/__fixtures/updatesDemo.js");
    const at = demoCleared();
    return { ok: true, rows: at ? NOTIFICATIONS.filter((n) => new Date(n.at).getTime() > new Date(at).getTime()) : NOTIFICATIONS };
  }
  if (!companyId) return { ok: false };
  try {
    const h = await authHeaders();
    const res = await fetch(`${REST}/rpc/company_notifications`, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ p_company: companyId, p_limit: limit }),
    });
    if (res.status === 404) return { ok: false, missing: true };
    if (!res.ok) return { ok: false, status: res.status };
    const rows = await res.json().catch(() => null);
    if (!Array.isArray(rows)) return { ok: false };
    return {
      ok: true,
      rows: rows.filter((r) => r && typeof r === "object").map((r) => ({
        kind: r.kind,
        name: String(r.actor_name || "").trim() || "An investor",
        role: String(r.actor_role || "").trim(),
        company: String(r.actor_company || "").trim(),
        subject: String(r.subject || "").trim(),
        at: r.occurred_at,
      })),
    };
  } catch {
    return { ok: false };
  }
}

/** Rows, or null when they could not be read (the shell's badge: no badge). */
export async function listCompanyNotifications(companyId, limit = 50) {
  const r = await loadCompanyNotifications(companyId, limit);
  return r.ok ? r.rows : null;
}

/** When this company last opened its notifications. Null = never. */
export async function companyLastSeenAt(companyId) {
  if (!companyId) return null;
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${REST}/company_notification_reads?company_id=eq.${companyId}&select=seen_at`,
      { headers: h }
    );
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    return (Array.isArray(rows) && rows[0] && rows[0].seen_at) || null;
  } catch {
    return null;
  }
}

/** Best-effort: a failed read receipt must not stop someone reading the list. */
export async function markCompanyNotificationsSeen(companyId) {
  if (!companyId) return null;
  try {
    const h = await authHeaders();
    const res = await fetch(`${REST}/rpc/mark_notifications_seen`, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ p_company: companyId }),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/** How many arrived since the company last looked. */
export function companyUnreadCount(items, seenAt) {
  if (!Array.isArray(items)) return 0;
  if (!seenAt) return items.length;
  const t = new Date(seenAt).getTime();
  return items.filter((i) => i.at && new Date(i.at).getTime() > t).length;
}

/**
 * Clear the company's notification page.
 *
 * Hides everything up to now. It does NOT delete a follow or a like -- those are
 * the investor's acts and the company's list is only a view of them (0064).
 * Anything new after this reappears, so clearing empties the page without
 * muting the company.
 *
 * Returns the cleared-at timestamp; null when 0064 is not applied, so the caller
 * can fall back to simply dismissing the unread state; { failed: true } when
 * the request itself failed, so the caller can say it did not clear;
 * { failed: true, denied: true } when the caller's role may not clear (0090:
 * owner and admin only -- the page is shared, so one clear empties it for all).
 */
export async function clearCompanyNotifications(companyId) {
  if (!companyId) return null;
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) {
    const now = new Date().toISOString();
    try { sessionStorage.setItem(DEMO_CLEARED_KEY, now); } catch (_) {}
    return now;
  }
  try {
    const h = await authHeaders();
    const res = await fetch(`${REST}/rpc/mark_notifications_cleared`, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ p_company: companyId }),
    });
    if (res.status === 404) return null;
    if (res.status === 403) return { failed: true, denied: true };
    if (!res.ok) return { failed: true };
    return (await res.json().catch(() => null)) || { failed: true };
  } catch {
    return { failed: true };
  }
}
