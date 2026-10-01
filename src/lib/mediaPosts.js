// Media posts — the photos and videos a company has put on its investor profile.
//
// A media post is an `updates` row with detected.post_type = 'media', published
// through the same spine as a press release (update -> publication -> post).
// The image or video itself lives on the publication's `content.media_url`,
// with `thumbnail_url` carrying the poster frame for video.
//
// The company owns these rows, so ordinary RLS already allows the read -- unlike
// messaging and engagement, this needed no migration.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";

/** Every media post for a company, newest first. */
export async function listMediaPosts(companyId) {
  if (!companyId) return [];
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/updates` +
        `?company_id=eq.${companyId}` +
        `&detected->>post_type=eq.media` +
        `&select=id,body,status,created_at,published_on,publications(id,status,content,published_at)` +
        `&order=created_at.desc&limit=200`,
      { headers: h }
    );
    if (!res.ok) return [];
    const rows = await res.json().catch(() => []);
    return (Array.isArray(rows) ? rows : []).map(shape);
  } catch {
    return [];
  }
}

function shape(row) {
  const pubs = Array.isArray(row.publications) ? row.publications : [];
  // The MineEx publication is the one that carries the media; fall back to any
  // publication so a post is never invisible just because routing changed.
  const pub = pubs.find((p) => p && p.content && p.content.media_url) || pubs[0] || null;
  const content = (pub && pub.content) || {};
  const url = content.media_url || "";
  return {
    id: row.id,
    caption: (content.headline || row.body || "").trim(),
    mediaUrl: url,
    thumbnailUrl: content.thumbnail_url || "",
    isVideo: /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || !!content.thumbnail_url,
    status: row.status,
    live: !!(pub && pub.status === "published"),
    createdAt: row.created_at,
    publishedAt: (pub && pub.published_at) || row.published_on || row.created_at,
  };
}

/**
 * Publish a photo or video to the media feed.
 *
 * Lifted verbatim from MediaComposer's post() so the new Media page uses the
 * SAME spine rather than a second implementation that could drift: upload the
 * file, upload a poster frame for video, create the update, create an approved
 * `passport` publication carrying media_url, then let /api/publish project it.
 *
 * `posterFile` is captured from the <video> element by the caller (only the DOM
 * can grab a frame), so this stays free of browser-only assumptions beyond the
 * upload itself.
 */
export async function publishMediaPost({ companyId, file, caption = "", posterFile = null, onStage = () => {} }) {
  if (!companyId) throw new Error("No company.");
  if (!file) throw new Error("Choose a photo or video first.");

  const { uploadCompanyMedia } = await import("./storage.js");
  const { publishViaApi } = await import("./publishClient.js");

  onStage("Uploading…");
  const mediaUrl = await uploadCompanyMedia(file);
  if (!mediaUrl) throw new Error("Upload failed — try a smaller file.");

  let thumbnailUrl = mediaUrl;
  if (posterFile) {
    onStage("Preparing thumbnail…");
    const pu = await uploadCompanyMedia(posterFile).catch(() => null);
    if (pu) thumbnailUrl = pu;
  }

  onStage("Publishing…");
  const h = await authHeaders();
  const jsonHeaders = { ...h, "content-type": "application/json", Prefer: "return=representation" };

  const uRes = await fetch(`${SUPABASE_URL}/rest/v1/updates`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      company_id: companyId,
      body: caption || "Media post",
      status: "review",
      detected: { post_type: "media" },
    }),
  });
  if (!uRes.ok) throw new Error(`Couldn't save (${uRes.status}).`);
  const update = (await uRes.json())[0];

  const content = {
    post_type: "media", media_url: mediaUrl, thumbnail_url: thumbnailUrl,
    headline: caption || "", body: caption || "",
  };
  const pRes = await fetch(`${SUPABASE_URL}/rest/v1/publications`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify([{
      company_id: companyId, update_id: update.id,
      destination_id: "passport", content, status: "approved",
    }]),
  });
  if (!pRes.ok) throw new Error(`Couldn't create the post (${pRes.status}).`);
  const pub = (await pRes.json())[0];

  await publishViaApi(pub.id);
  return { updateId: update.id, publicationId: pub.id, mediaUrl };
}
