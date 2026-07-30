// Publish Service — the ONE way to publish.
//
// Authenticates the caller, authorizes ownership, verifies entitlement for the
// destination, then calls the atomic publish_publication() RPC as the service role
// (passing the verified actor id). The RPC flips the publication to published and
// emits a durable PUBLICATION_PUBLISHED outbox event in one transaction. Finally it
// nudges the dispatcher (best effort, short timeout) so the post normally appears
// within seconds; Supabase Cron is the guaranteed drain.
//
// This endpoint never creates posts or notifications — those are dispatcher listeners.

import { SB_URL, ANON_KEY, serviceConfigured, serviceRpc, serviceRest, bearer, verifyUser, invokeDispatchBestEffort } from "./_service.js";

function bad(res, code, msg, extra) { res.status(code).json({ error: msg, ...(extra || {}) }); }

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  if (!serviceConfigured()) return bad(res, 500, "Server not configured: Supabase service env missing.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const publicationId = body && (body.publicationId || body.publication_id);
  if (!publicationId) return bad(res, 400, "publicationId is required.");

  // 1) Who is calling?
  const token = bearer(req);
  const user = await verifyUser(token);
  if (!user) return bad(res, 401, "Sign in required.");

  // 2) Load the publication AS THE CALLER (RLS lets only owner/admin read it), so a
  //    stranger can't even learn it exists.
  let pub = null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/publications?id=eq.${publicationId}&select=id,company_id,destination_id,status`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (r.ok) { const rows = await r.json().catch(() => []); pub = rows[0] || null; }
  } catch { /* fallthrough */ }
  if (!pub) return bad(res, 404, "Publication not found.");

  // 3) Entitlement: the caller must have the feature that unlocks this destination.
  //    my_features(company) already checks ownership AND resolves admins to all
  //    features, so this one call answers "your company?" and "paid for?".
  let features = [];
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/my_features`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ cid: pub.company_id }),
    });
    if (r.ok) features = (await r.json().catch(() => [])).map((x) => (typeof x === "string" ? x : x && x.my_features)).filter(Boolean);
  } catch { /* fallthrough → empty → denied */ }
  if (!features.length) return bad(res, 403, "Not allowed for this company.");

  // Resolve the destination's required feature (passport is always allowed for a
  // company that has the base profile feature).
  let feature = null;
  try {
    const r = await serviceRest(`destinations?id=eq.${encodeURIComponent(pub.destination_id)}&select=feature_id`);
    if (r.ok) { const rows = await r.json().catch(() => []); feature = rows[0]?.feature_id || null; }
  } catch { /* fallthrough */ }
  if (feature && !features.includes(feature)) {
    return bad(res, 403, "Your plan doesn't include this destination.", { code: "feature_locked", feature });
  }

  // 4) Publish atomically as the service role, passing the verified actor.
  let result = null;
  try {
    const r = await serviceRpc("publish_publication", { p_publication_id: publicationId, p_actor: user.id });
    result = await r.json().catch(() => null);
    if (!r.ok) return bad(res, 502, "Publish failed.", { detail: result });
  } catch (e) { return bad(res, 502, `Publish failed: ${e.message || e}`); }
  if (!result || result.ok !== true) {
    const map = { forbidden: 403, not_found: 404, invalid_transition: 409 };
    return bad(res, map[result?.error] || 400, result?.error || "Publish failed.", { detail: result });
  }

  // 5) Best-effort immediate dispatch (never blocks or fails the response).
  await invokeDispatchBestEffort(req);

  return res.status(200).json({ ok: true, publicationId, published_at: result.published_at, already: !!result.already });
}
