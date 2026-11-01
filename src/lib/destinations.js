// What the content fan-out (a15, migration 0088) delivered to a destination --
// the company's website or its Conference booth -- read back for the portal.
//
// destination_content is RLS-scoped to the company's members; nothing here
// writes. Returns null when it cannot be read (0088 not applied, outage), so a
// page can say "not available" instead of "nothing delivered".

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";

export const DESTINATIONS = ["website", "conference"];

/** Live delivered copies, newest first, or null. */
export async function listDelivered(companyId, destination, { limit = 10 } = {}) {
  if (!companyId || !DESTINATIONS.includes(destination)) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/destination_content?company_id=eq.${companyId}` +
      `&destination=eq.${destination}&removed_at=is.null` +
      `&select=publication_id,post_type,title,published_at,delivered_at,version` +
      `&order=published_at.desc.nullslast&limit=${Math.max(1, Math.min(limit, 50))}`, { headers: await authHeaders() });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) ? rows : null;
  } catch { return null; }
}

/** The booth's rule (src/conference/liveConfig.js withReleases): which of these it shows. */
export function onBooth(rows, { now = Date.now(), max = 2, days = 180 } = {}) {
  const cutoff = now - days * 86400e3;
  return (rows || []).filter((r) => r && Number.isFinite(Date.parse(r.published_at || "")) && Date.parse(r.published_at) >= cutoff).slice(0, max);
}
