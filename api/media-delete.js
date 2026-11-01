// Media delete — permanently remove a media post that has already been taken
// down: its stored photo/video (and poster frame) in the public company-media
// bucket, and the post's place in the portal's media library.
//
// Taking a post down (/api/unpublish) stays reversible and keeps the file; this
// is the separate, deliberate second step (requirement a09: upload, organise,
// publish, DELETE). Without it a file stays publicly reachable at its URL
// forever after "removal", and nobody but the uploader could ever delete it:
// company-media objects live under the UPLOADER's folder (0037
// media_delete_own), so a co-admin could not.
//
// Rules, all enforced here, server-side:
//   - caller: owner, admin or publisher of the post's company, or a platform
//     admin (a03: who may delete publications), via requireCompanyRole;
//   - the post must not be live (take it down first; 409 otherwise);
//   - only objects in THIS project's company-media bucket, named by the
//     publication's own content.media_url / thumbnail_url;
//   - only objects uploaded by a member of the post's company (folder = their
//     user id), so a URL pointing at another company's file is never deleted;
//   - an object still referenced anywhere else (another publication, a live
//     post, the company's profile) is kept, and reported as kept; so is one
//     whose references could not be checked.
// The publication and update rows are history and are not deleted; the update
// is marked status 'deleted' so the library stops listing it.

import { SB_URL, serviceConfigured, serviceRest, serviceStorage } from "./_service.js";
import { requireCompanyRole, UUID } from "./_roles.js";
import { recordActivity } from "./_audit.js";
import { bearerToken, ANON_KEY } from "./_supabase.js";

const BUCKET = "company-media";
const DELETE_ROLES = ["owner", "admin", "publisher"];
function bad(res, code, msg, extra) { res.status(code).json({ error: msg, ...(extra || {}) }); }

// "https://<project>.supabase.co/storage/v1/object/public/company-media/<uid>/<file>" -> "<uid>/<file>"
export function objectPathFromUrl(url, base = SB_URL) {
  const prefix = `${String(base || "").replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET}/`;
  if (typeof url !== "string" || !url.startsWith(prefix)) return null;
  let p;
  try { p = decodeURI(url.slice(prefix.length).split(/[?#]/)[0]); } catch { return null; }
  if (!p || p.includes("..") || p.startsWith("/") || !/^[0-9a-f-]{36}\/[^/]+$/i.test(p)) return null;
  return p;
}

async function rows(path) {
  const r = await serviceRest(path);
  if (!r.ok) throw new Error(`read failed (${r.status})`);
  return r.json();
}
// For the "still in use?" checks: a read that fails (e.g. posts.media_url is
// absent before 0071) answers null, and the file is KEPT rather than guessed at.
async function rowsOrNull(path) {
  try { return await rows(path); } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  if (!serviceConfigured()) return bad(res, 500, "Server not configured: Supabase service env missing.");
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const publicationId = String((body && (body.publicationId || body.publication_id)) || "");
  if (!UUID.test(publicationId)) return bad(res, 400, "publicationId is required.");
  if (!bearerToken(req)) return bad(res, 401, "Sign in required.");

  // Read the publication AS THE CALLER first: a publication of another company
  // is simply not found (no existence disclosure, as /api/unpublish).
  let pub = null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/publications?id=eq.${publicationId}&select=id,company_id,update_id,status,content`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${bearerToken(req)}` },
    });
    if (r.status === 401) return bad(res, 401, "Sign in required.");
    if (r.ok) pub = (await r.json().catch(() => []))[0] || null;
  } catch { /* fallthrough */ }
  if (!pub) return bad(res, 404, "Post not found.");

  const auth = await requireCompanyRole(req, res, { companyId: pub.company_id, roles: DELETE_ROLES });
  if (!auth) return;

  const content = pub.content || {};
  if (content.post_type !== "media") return bad(res, 400, "Only media posts can be deleted here.");
  if (pub.status === "published") return bad(res, 409, "Take the post down before deleting it.", { code: "still_live" });

  try {
    const members = new Set((await rows(`company_memberships?company_id=eq.${pub.company_id}&select=user_id`)).map((m) => m.user_id));
    const co = (await rows(`companies?id=eq.${pub.company_id}&select=owner_id,profile`))[0] || {};
    if (co.owner_id) members.add(co.owner_id);
    const profileText = JSON.stringify(co.profile || {});

    const urls = [...new Set([content.media_url, content.thumbnail_url].filter(Boolean))];
    const deleted = [], kept = [];
    for (const url of urls) {
      const path = objectPathFromUrl(url);
      if (!path) { kept.push({ reason: "not_company_media" }); continue; }
      if (!members.has(path.split("/")[0])) { kept.push({ reason: "not_uploaded_by_this_company" }); continue; }
      const enc = encodeURIComponent(url);
      const [otherPubs, livePosts] = await Promise.all([
        rowsOrNull(`publications?id=neq.${publicationId}&or=(content->>media_url.eq.${enc},content->>thumbnail_url.eq.${enc})&select=id,update:updates(status)&limit=200`),
        rowsOrNull(`posts?removed_at=is.null&or=(media_url.eq.${enc},thumbnail_url.eq.${enc})&select=id&limit=1`),
      ]);
      if (!otherPubs || !livePosts) { kept.push({ reason: "could_not_verify" }); continue; }
      // A post the company already deleted no longer holds its file.
      const inUse = otherPubs.filter((p) => !(p.update && p.update.status === "deleted"));
      if (inUse.length || livePosts.length || profileText.includes(path)) { kept.push({ reason: "still_in_use" }); continue; }
      const d = await serviceStorage(`object/${BUCKET}/${encodeURI(path)}`, { method: "DELETE" });
      // "not found" (404, or Storage's 400 carrying not_found) means it is
      // already gone: the goal state. Anything else is a real failure.
      const detail = d.ok ? "" : await d.text().catch(() => "");
      if (d.ok || d.status === 404 || (d.status === 400 && /not.?found/i.test(detail))) deleted.push(path.split("/").pop());
      else return bad(res, 502, "Could not delete the file.", { status: d.status });
    }

    if (pub.update_id) {
      const u = await serviceRest(`updates?id=eq.${pub.update_id}&company_id=eq.${pub.company_id}`, { method: "PATCH", body: { status: "deleted" }, prefer: "return=minimal" });
      if (!u.ok) return bad(res, 502, "Files handled, but the post could not be removed from the library.");
    }
    await recordActivity({ companyId: pub.company_id, actorId: auth.user.id, action: "media_post_deleted", entity: "publication",
      oldValue: { publication_id: publicationId, caption: content.headline || null, files: urls.length },
      newValue: { files_deleted: deleted.length, files_kept: kept.map((k) => k.reason) } });
    return res.status(200).json({ ok: true, publicationId, deleted: deleted.length, kept });
  } catch (e) {
    return bad(res, 502, `Delete failed: ${e.message || e}`);
  }
}
