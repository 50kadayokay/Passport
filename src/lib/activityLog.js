// Settings → Activity log, read so that a failure is not an empty log.
//
// lib/portal.js listActivity() answers [] for every failure (and passes a
// non-array body straight through), so the audit trail said "No activity yet"
// whenever it could not be read -- the one page whose job is to show that
// changes happened. Same query; { ok: false } when it was not answered.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";

export async function loadActivity(companyId, limit = 50) {
  if (!companyId) return { ok: true, rows: [] };
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/activity_log?company_id=eq.${encodeURIComponent(companyId)}` +
        `&select=id,actor_id,actor_kind,action,entity,old_value,new_value,reason,source,created_at&order=created_at.desc&limit=${limit}`,
      { headers: h }
    );
    if (!res.ok) return { ok: false, status: res.status };
    const rows = await res.json().catch(() => null);
    if (!Array.isArray(rows)) return { ok: false };
    return { ok: true, rows: rows.filter((r) => r && r.id) };
  } catch {
    return { ok: false };
  }
}
