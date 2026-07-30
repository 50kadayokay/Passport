// Unpublish Service — the ONE way to take a publication off public surfaces.
//
// Visibility changes flow through the outbox too: this emits PUBLICATION_UNPUBLISHED
// so the feed projection (and later notifications/website/etc.) react uniformly.
// Same auth/authorization/entitlement guards as /api/publish.

import { SB_URL, ANON_KEY, serviceConfigured, serviceRpc, bearer, verifyUser, invokeDispatchBestEffort } from "./_service.js";

function bad(res, code, msg, extra) { res.status(code).json({ error: msg, ...(extra || {}) }); }

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  if (!serviceConfigured()) return bad(res, 500, "Server not configured: Supabase service env missing.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const publicationId = body && (body.publicationId || body.publication_id);
  if (!publicationId) return bad(res, 400, "publicationId is required.");

  const token = bearer(req);
  const user = await verifyUser(token);
  if (!user) return bad(res, 401, "Sign in required.");

  // Confirm the caller can see (and therefore touch) this publication.
  let pub = null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/publications?id=eq.${publicationId}&select=id,company_id,status`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (r.ok) { const rows = await r.json().catch(() => []); pub = rows[0] || null; }
  } catch { /* fallthrough */ }
  if (!pub) return bad(res, 404, "Publication not found.");

  let result = null;
  try {
    const r = await serviceRpc("unpublish_publication", { p_publication_id: publicationId, p_actor: user.id });
    result = await r.json().catch(() => null);
    if (!r.ok) return bad(res, 502, "Unpublish failed.", { detail: result });
  } catch (e) { return bad(res, 502, `Unpublish failed: ${e.message || e}`); }
  if (!result || result.ok !== true) {
    const map = { forbidden: 403, not_found: 404 };
    return bad(res, map[result?.error] || 400, result?.error || "Unpublish failed.", { detail: result });
  }

  await invokeDispatchBestEffort(req);
  return res.status(200).json({ ok: true, publicationId, already: !!result.already });
}
