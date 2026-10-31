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

import { SB_URL, ANON_KEY, serviceConfigured, serviceRpc, serviceRest, bearer, verifyUser, invokeDispatchBestEffort } from "./_service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  // Shape only -- the same answer for every caller, whether or not it exists.
  if (!UUID.test(publicationId)) return bad(res, 400, "publicationId must be a UUID.");
  if (!text.trim()) return bad(res, 400, "A release cannot be corrected to nothing.");

  // Load the publication AS THE CALLER, exactly as /api/publish and
  // /api/unpublish do (F8). RLS lets only members of the owning company (and
  // platform admins) see it, so for anyone else a real id and a made-up one
  // are the same empty result and the same 404 -- this route can no longer be
  // used to test whether a publication exists. This used to be a SERVICE-role
  // read: strangers got 404 for a fake id but 403 for a real one. Members who
  // can see it but may not correct it still get an honest 403 from the RPC
  // (actor_can_publish), which tells them nothing they cannot already read.
  let pub = null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/publications?id=eq.${publicationId}&select=company_id,status,update_id,content`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (r.ok) { const rows = await r.json().catch(() => []); pub = rows[0] || null; }
  } catch { /* fallthrough: not visible */ }
  if (!pub) return bad(res, 404, "That publication does not exist.");

  // THE FIRST CORRECTION (D22). revise_publication() treats revision 1 as the
  // ORIGINAL publication and emits PUBLICATION_REVISED only from revision 2 --
  // but nothing records revision 1 at publish time. So every release's first
  // correction became "revision 1" with NO event: the portal said "the feed and
  // your profile timeline update in place" and nothing updated until a second
  // correction. Until migration 0071 records the original at publish, the
  // original release is recorded here as revision 1 first, through the same
  // RPC and the same authorization (actor_can_publish), so the correction
  // becomes revision 2 and is delivered. Two concurrent first corrections are
  // safe: the RPC locks the publication, and the second baseline is "unchanged".
  const revRes = await serviceRest(`release_revisions?publication_id=eq.${publicationId}&select=id&limit=1`);
  if (!revRes.ok) return bad(res, 502, "Could not load the publication's history.");
  const hasHistory = (await revRes.json().catch(() => [])).length > 0;
  if (!hasHistory && pub.status === "published" && pub.update_id) {
    const updRes = await serviceRest(`updates?id=eq.${pub.update_id}&select=body`);
    const original = updRes.ok ? ((await updRes.json().catch(() => []))[0] || {}).body : null;
    if (original && String(original).trim()) {
      const base = await serviceRpc("revise_publication", {
        p_publication_id: publicationId,
        p_headline: (pub.content && pub.content.headline) || null,
        p_body: String(original),
        p_reason: "original publication (recorded before the first correction)",
        p_actor: user.id,
      });
      const b = base.ok ? await base.json().catch(() => null) : null;
      if (b && b.ok === false && b.error === "forbidden") return bad(res, 403, "You cannot correct this release.");
      if (!b || b.ok === false) return bad(res, 502, "Could not record the original before correcting it.");
    }
  }

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
    if (why === "not_found") return bad(res, 404, "That publication does not exist.");
    if (why === "not_published") return bad(res, 409, "That release is not published yet.");
    return bad(res, 400, `Could not save the correction (${why}).`);
  }

  // Nudge the dispatcher so the feed, timeline and MineIQ pick up the
  // PUBLICATION_REVISED event revise_publication() just wrote (F11: this used to
  // be called without the request it then read, threw inside its own try, and
  // never dispatched). Awaited, like publish: an un-awaited fetch is not
  // guaranteed to run once a serverless function has responded.
  if (!result.unchanged) await invokeDispatchBestEffort();

  return res.status(200).json(result);
}
