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
import { authHeaders } from "./auth.js";

const REST = `${SUPABASE_URL}/rest/v1`;

export async function listCompanyNotifications(companyId, limit = 50) {
  if (!companyId) return null;
  try {
    const h = await authHeaders();
    const res = await fetch(`${REST}/rpc/company_notifications`, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ p_company: companyId, p_limit: limit }),
    });
    if (!res.ok) return null;
    const rows = await res.json().catch(() => null);
    if (!Array.isArray(rows)) return null;
    return rows.map((r) => ({
      kind: r.kind,
      name: (r.actor_name || "").trim() || "An investor",
      role: (r.actor_role || "").trim(),
      company: (r.actor_company || "").trim(),
      subject: (r.subject || "").trim(),
      at: r.occurred_at,
    }));
  } catch {
    return null;
  }
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
