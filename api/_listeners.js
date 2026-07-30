// Dispatcher listeners — versioned, idempotent handlers for outbox events.
//
// Each handler receives (event, db) where db is a service-role data accessor
// (injected, so the handlers are unit-testable against a live DB without importing
// server env). event carries ids only; handlers load the AUTHORITATIVE rows.
//
// CHECKPOINT 3–4 listeners:
//   feed_projection_v1      — PUBLICATION_PUBLISHED → upsert post; UNPUBLISHED → soft-remove.
//   in_app_notifications_v1 — PUBLICATION_PUBLISHED → notify eligible followers.
//
// Idempotency: feed_projection upserts on posts.publication_id; notifications upsert
// on (user_id, post_id, kind). Replaying an event creates no duplicates.

const LABEL_TO_SCORE = { Transformational: 90, High: 70, Moderate: 40, Low: 15 };
const scoreFor = (label) => (label && LABEL_TO_SCORE[label] != null ? LABEL_TO_SCORE[label] : null);

async function feedProjectionV1(event, db) {
  const pubs = await db.getJson(`publications?id=eq.${event.publication_id}&select=id,company_id,update_id,destination_id,status,content,external_url,published_at`);
  const pub = pubs && pubs[0];
  if (!pub) return; // publication gone → nothing to project

  // The feed post represents the Passport-profile publication only. LinkedIn/X/etc.
  // publications flow through the same outbox but do not become feed posts.
  if (pub.destination_id !== "passport") return;

  if (event.event_type === "PUBLICATION_UNPUBLISHED") {
    await db.write(`posts?publication_id=eq.${event.publication_id}`, {
      method: "PATCH", body: { removed_at: new Date().toISOString() }, prefer: "return=minimal",
    });
    return;
  }

  // PUBLICATION_PUBLISHED → build the projection from authoritative data.
  let materialityLabel = null;
  if (pub.update_id) {
    const upd = await db.getJson(`updates?id=eq.${pub.update_id}&select=detected`);
    materialityLabel = (upd && upd[0] && upd[0].detected && upd[0].detected.materiality) || null;
  }
  const content = pub.content || {};
  const row = {
    publication_id: pub.id,
    company_id: pub.company_id,
    post_type: "press_release",
    category: null,
    title: (content.headline && String(content.headline).trim()) || "Company update",
    summary: content.body || null,
    thumbnail_url: content.media_url || null,
    source_url: pub.external_url || null,
    materiality_label: materialityLabel,
    materiality_score: scoreFor(materialityLabel),
    published_at: pub.published_at || new Date().toISOString(),
    removed_at: null, // re-publish makes it visible again
  };
  const r = await db.write(`posts?on_conflict=publication_id`, {
    method: "POST", body: row, prefer: "resolution=merge-duplicates,return=minimal",
  });
  if (!r.ok) throw new Error(`feed_projection upsert failed (${r.status})`);
}

async function inAppNotificationsV1(event, db) {
  const posts = await db.getJson(`posts?publication_id=eq.${event.publication_id}&select=id,company_id,title,post_type,materiality_score`);
  const post = posts && posts[0];
  if (!post) throw new Error("post not yet projected"); // retry until feed_projection has run

  // Eligibility: only official releases notify — never every media upload.
  if (post.post_type !== "press_release") return;

  const cos = await db.getJson(`companies?id=eq.${post.company_id}&select=name,slug`);
  const co = (cos && cos[0]) || {};
  const follows = await db.getJson(`company_follows?company_id=eq.${post.company_id}&select=user_id`);
  if (!follows || !follows.length) return;

  const userIds = follows.map((f) => f.user_id);
  const prefs = await db.getJson(`notification_prefs?user_id=in.(${userIds.join(",")})&channel=eq.in_app&select=user_id,company_id,muted,min_materiality`) || [];
  const score = post.materiality_score == null ? 0 : post.materiality_score;

  const rows = [];
  for (const uid of userIds) {
    const cPref = prefs.find((p) => p.user_id === uid && p.company_id === post.company_id);
    const gPref = prefs.find((p) => p.user_id === uid && p.company_id == null);
    const pref = cPref || gPref;
    if (pref && pref.muted) continue;
    const minMat = pref && pref.min_materiality != null ? pref.min_materiality : 0;
    if (score < minMat) continue;
    rows.push({
      user_id: uid, kind: "new_release", company_id: post.company_id, post_id: post.id,
      title: `${co.name || "A company you follow"} posted an update`,
      body: post.title, deep_link: `/p/${post.id}`,
    });
  }
  if (rows.length) {
    const r = await db.write(`notifications?on_conflict=user_id,post_id,kind`, {
      method: "POST", body: rows, prefer: "resolution=merge-duplicates,return=minimal",
    });
    if (!r.ok) throw new Error(`notifications upsert failed (${r.status})`);
  }
}

export const LISTENERS = [
  { name: "feed_projection_v1", handle: feedProjectionV1 },
  { name: "in_app_notifications_v1", handle: inAppNotificationsV1 },
];

// Exported for direct unit testing.
export { feedProjectionV1, inAppNotificationsV1, scoreFor };
