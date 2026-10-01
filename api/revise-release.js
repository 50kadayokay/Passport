// POST /api/revise-release — correct an already-published release.
//
// The counterpart to /api/publish, and deliberately its twin: authenticate the
// caller, then call a SECURITY DEFINER RPC as the service role passing the
// VERIFIED actor. revise_publication() is not callable from the browser for the
// same reason publish_publication() is not -- it takes an actor id, and a client
// that could call it could name someone else's.
//
// What it does NOT do: publish, notify, or push. A correction emits
// PUBLICATION_REVISED, which only the three correcting listeners subscribe to
// (0051). Followers are not told, by construction.
//
// Presentation edits -- summary, media, captions, order -- never come here. They
// are ordinary patches to the draft/publication content and create no revision.

import { serviceConfigured, serviceRpc, serviceRest, bearer, verifyUser, invokeDispatchBestEffort } from "./_service.js";

function bad(res, code, msg) { res.status(code).json({ ok: false, error: msg }); }

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "POST only");
  if (!serviceConfigured()) return bad(res, 500, "Server not configured.");

  const token = bearer(req);
  const user = await verifyUser(token);
  if (!user) return bad(res, 401, "Sign in required.");

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const publicationId = String(body.publicationId || "");
  const headline = body.headline == null ? null : String(body.headline);
  const text = String(body.body || "");
  const reason = body.reason == null ? null : String(body.reason).slice(0, 500);

  if (!publicationId) return bad(res, 400, "publicationId is required.");
  if (!text.trim()) return bad(res, 400, "A release cannot be corrected to nothing.");

  // Ownership is re-checked inside the RPC via actor_can_publish(); this read is
  // only so the caller gets 403 rather than a generic failure.
  const pubRes = await serviceRest(`publications?id=eq.${publicationId}&select=company_id,status`);
  if (!pubRes.ok) return bad(res, 502, "Could not load the publication.");
  const [pub] = await pubRes.json().catch(() => []);
  if (!pub) return bad(res, 404, "That publication does not exist.");

  const out = await serviceRpc("revise_publication", {
    p_publication_id: publicationId,
    p_headline: headline,
    p_body: text,
    p_reason: reason,
    p_actor: user.id,
  });
  if (!out.ok) {
    const detail = await out.text().catch(() => "");
    return bad(res, 502, `Could not save the correction. ${detail.slice(0, 200)}`);
  }
  const result = await out.json().catch(() => null);
  if (!result || result.ok === false) {
    const why = (result && result.error) || "unknown";
    if (why === "forbidden") return bad(res, 403, "You cannot correct this release.");
    if (why === "not_published") return bad(res, 409, "That release is not published yet.");
    return bad(res, 400, `Could not save the correction (${why}).`);
  }

  // Nudge the dispatcher so the feed, timeline and MineIQ catch up in seconds.
  // Best effort: cron is the guaranteed drain, exactly as with publishing.
  if (!result.unchanged) invokeDispatchBestEffort();

  return res.status(200).json(result);
}
