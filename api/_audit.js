// The company audit trail (a25): append a server-side event to activity_log.
//
// activity_log is append-only (0076): browsers may add only their own UI
// actions, as themselves, with source 'ui'; nothing may update or delete a row.
// The consequential company changes that happen through the API -- a release
// or media post published, taken down or corrected, a media file deleted --
// are recorded here, AFTER the change succeeds, by the service role with
// source 'api', the verified actor, and what changed (old_value / new_value).
//
// Best-effort by design: the change has already happened and must not be
// reported as failed because its log line could not be written. A failure is
// logged server-side and returned as false so callers can surface it.
import { serviceRest } from "./_service.js";

const CAP = 4000;
const clip = (v) => (typeof v === "string" && v.length > CAP ? v.slice(0, CAP) + "…" : v);
const clean = (o) => (o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clip(v)])) : o ?? null);

export async function recordActivity({ companyId, actorId, action, entity = null, oldValue = null, newValue = null, reason = null }) {
  try {
    if (!companyId || !actorId || !action) return false;
    // Platform admins are shown as MineEx in the trail (actor_kind 'admin').
    const p = await serviceRest(`profiles?id=eq.${encodeURIComponent(actorId)}&select=role&limit=1`);
    const role = p.ok ? ((await p.json().catch(() => []))[0] || {}).role : null;
    const r = await serviceRest("activity_log", {
      method: "POST", prefer: "return=minimal",
      body: { company_id: companyId, actor_id: actorId, actor_kind: role === "admin" ? "admin" : "company",
        action, entity, old_value: clean(oldValue), new_value: clean(newValue), reason: clip(reason), source: "api" },
    });
    if (!r.ok) { console.error(`[audit] ${action} not recorded (${r.status})`); return false; }
    return true;
  } catch (e) {
    console.error(`[audit] ${action} not recorded: ${e && e.message}`);
    return false;
  }
}

// "release" or "media" for a publication's content.
export const kindOf = (content) => (content && content.post_type === "media" ? "media" : "release");
