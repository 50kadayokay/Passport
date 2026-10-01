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

  // PUBLICATION_REVISED lands here too (0051). The upsert below is keyed on
  // publication_id, so a correction UPDATES the existing post -- same id, same
  // published_at, same place in the feed -- rather than adding a second one.
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
  // The composer states what it published. Anything that isn't an explicit media
  // post stays a press release — the historical default, and the only type that
  // notifies followers (see inAppNotificationsV1 below).
  const postType = String(content.post_type || "") === "media" ? "media" : "press_release";
  const row = {
    publication_id: pub.id,
    company_id: pub.company_id,
    post_type: postType,
    category: content.category ? String(content.category) : null,
    title: (content.headline && String(content.headline).trim()) || "Company update",
    summary: content.body || null,
    // The actual media source (photo or video). Without this, a video post has nothing
    // to play. Photos set thumbnail_url = the image; videos set media_url = the video and
    // thumbnail_url = a poster frame.
    media_url: content.media_url || null,
    // A media post's media_url is the video itself, so prefer an explicit thumbnail.
    thumbnail_url: content.thumbnail_url || content.media_url || null,
    source_url: content.source_url || pub.external_url || null,
    materiality_label: postType === "media" ? null : materialityLabel,
    materiality_score: postType === "media" ? null : scoreFor(materialityLabel),
    published_at: pub.published_at || new Date().toISOString(),
    removed_at: null, // re-publish makes it visible again
  };
  const r = await db.write(`posts?on_conflict=publication_id`, {
    method: "POST", body: row, prefer: "resolution=merge-duplicates,return=minimal",
  });
  if (!r.ok) throw new Error(`feed_projection upsert failed (${r.status})`);
}

async function inAppNotificationsV1(event, db) {
  // Belt and braces. 0051 does not subscribe this listener to
  // PUBLICATION_REVISED, so a correction should never arrive here -- but a
  // notification is the one side effect that cannot be taken back, so it is
  // guarded in code as well as in the subscription table.
  if (event.event_type !== "PUBLICATION_PUBLISHED") return;
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

/**
 * mineiq_facts_v1 — PUBLICATION_PUBLISHED → extract facts into public.facts.
 *
 * A SEPARATE LISTENER, ON PURPOSE. Extraction calls a model, so it is slow and
 * can fail for reasons that have nothing to do with the release. Running it
 * inline with the publish transaction would mean an Anthropic outage could stop
 * a company publishing a valid disclosure. Here, a failure retries on the next
 * drain and the release is live regardless.
 *
 * IDEMPOTENCY. `facts` has no unique constraint to upsert on, so this checks for
 * rows already carrying this publication_id and returns early if any exist.
 * That is a read-then-write rather than an atomic upsert: two dispatcher workers
 * racing the same event could double-insert. The dispatcher claims events with a
 * lease, so that race is not expected -- but it is a real limitation, and the
 * clean fix is a unique index, which is Phase B.
 *
 * COMPANY ISOLATION. company_id is read from the authoritative publication row,
 * never from the event or any user input, so a fact cannot land on another
 * company even if an event were malformed.
 */
async function mineIqFactsV1(event, db) {
  // Both the original publication and a correction reconcile knowledge.
  if (event.event_type !== "PUBLICATION_PUBLISHED" && event.event_type !== "PUBLICATION_REVISED") return;

  const pubs = await db.getJson(`publications?id=eq.${event.publication_id}&select=id,company_id,update_id,destination_id,status,published_at`);
  const pub = pubs && pubs[0];
  if (!pub) return;
  if (pub.destination_id !== "passport") return;   // only the profile publication is a disclosure

  // CLAIM FIRST. Two workers racing this event would each run their own
  // extraction, and two model runs do not produce byte-identical facts -- so a
  // unique key on the rows cannot prevent duplicates on its own. Whoever wins
  // this insert does the work; the loser gets no row back and returns.
  // Replaying the event later loses the same way, which is the idempotency.
  // Which revision are we ingesting? A correction (PUBLICATION_REVISED) carries
  // it; an original publication is revision 1.
  const revision = Number(event.payload && event.payload.revision) || 1;
  const revisionId = (event.payload && event.payload.revision_id) || null;

  const claim = await db.write(`mineiq_ingestions?on_conflict=publication_id,revision`, {
    method: "POST",
    body: [{ publication_id: pub.id, company_id: pub.company_id, revision }],
    prefer: "resolution=ignore-duplicates,return=representation",
  });
  if (!claim.ok) throw new Error(`mineiq claim failed (${claim.status})`);
  const claimed = await claim.json().catch(() => []);
  if (!Array.isArray(claimed) || claimed.length === 0) return;   // someone else has it

  if (!pub.update_id) return;
  const upds = await db.getJson(`updates?id=eq.${pub.update_id}&select=body,detected,published_on`);
  const upd = upds && upds[0];
  if (!upd) return;

  const det = upd.detected || {};
  // The FULL release is the authoritative text, not the MineEx summary: the
  // summary is MineEx's rendering, the release is what the company disclosed.
  // For a correction, read the REVISION that was published, not the working draft.
  let body = upd.body || "";
  if (revisionId) {
    const revs = await db.getJson(`release_revisions?id=eq.${revisionId}&select=body`);
    if (revs && revs[0] && String(revs[0].body || "").trim()) body = revs[0].body;
  }
  if (!String(body).trim()) return;

  const cos = await db.getJson(`companies?id=eq.${pub.company_id}&select=name`);
  const companyName = (cos && cos[0] && cos[0].name) || "";

  const { extractFacts, factRows } = await import("./_mineiq.js");
  const facts = await extractFacts({ title: det.headline || "", body, companyName });
  if (!facts.length) return;

  const rows = factRows(facts, {
    companyId: pub.company_id,
    publicationId: pub.id,
    documentId: det.document_id || null,
    disclosedOn: upd.published_on || (pub.published_at ? String(pub.published_at).slice(0, 10) : null),
    revision,
    revisionId,
  });
  if (!rows.length) return;

  // RECONCILIATION against the previous revision of THIS publication.
  //
  //   in both      → the claim survived the correction. Nothing is written for
  //                  it beyond the new revision's row; the old row is left
  //                  exactly as it is, so unchanged facts do not churn.
  //   only in old  → the correction removed the claim. It is no longer current,
  //                  but it WAS disclosed, so it is superseded rather than
  //                  deleted — the record of what was published stands.
  //   only in new  → genuinely new, inserted below.
  let retired = [];
  if (revision > 1) {
    const priorRows = await db.getJson(
      `facts?company_id=eq.${pub.company_id}&publication_id=eq.${pub.id}&superseded_by=is.null&select=id,content_key`) || [];
    const nowKeys = new Set(rows.map((r) => r.content_key));
    retired = priorRows.filter((f) => !nowKeys.has(f.content_key));
  }

  // Which current facts might these replace? Read BEFORE inserting, so the new
  // rows are not candidates to supersede themselves.
  const measures = [...new Set(rows.map((r) => r.measure).filter(Boolean))];
  let priorByMeasure = new Map();
  if (measures.length) {
    const inList = measures.map((m) => `"${encodeURIComponent(m).replace(/"/g, "")}"`).join(",");
    const prior = await db.getJson(
      `facts?company_id=eq.${pub.company_id}&superseded_by=is.null&measure=in.(${inList})&select=id,measure,data`);
    (Array.isArray(prior) ? prior : []).forEach((f) => {
      const cur = priorByMeasure.get(f.measure);
      const when = (f.data && f.data.disclosed_on) || "";
      // Keep the most recently disclosed prior fact per measure.
      if (!cur || String(when) > String((cur.data && cur.data.disclosed_on) || "")) priorByMeasure.set(f.measure, f);
    });
  }

  // CONFLICT-SAFE UPSERT on (company_id, fact_key). A replay that somehow got
  // past the claim still cannot double-insert.
  const ins = await db.write(`facts?on_conflict=company_id,fact_key`, {
    method: "POST", body: rows,
    prefer: "resolution=merge-duplicates,return=representation",
  });
  if (!ins.ok) throw new Error(`facts upsert failed (${ins.status})`);
  const written = await ins.json().catch(() => []);

  // Claims the correction removed: point them at the revision that replaced
  // them where one exists, so the chain stays readable, and otherwise mark them
  // superseded by the first row of this revision.
  const anchorId = (Array.isArray(written) && written[0] && written[0].id) || null;
  for (const gone of retired) {
    if (!anchorId) break;
    const replacement = (Array.isArray(written) ? written : []).find((w) => w.content_key === gone.content_key);
    await db.write(`facts?id=eq.${gone.id}&superseded_by=is.null`, {
      method: "PATCH", body: { superseded_by: (replacement && replacement.id) || anchorId }, prefer: "return=minimal",
    }).catch(() => {});
  }

  // SUPERSESSION. Only where a new CURRENT fact shares a measure with an older
  // current one -- factMeasure() returns null for drill results, financings and
  // other historical events, so those are never chained and both stay true.
  for (const row of Array.isArray(written) ? written : []) {
    if (!row.measure) continue;
    const old = priorByMeasure.get(row.measure);
    if (!old || old.id === row.id) continue;
    const oldWhen = String((old.data && old.data.disclosed_on) || "");
    const newWhen = String((row.data && row.data.disclosed_on) || "");
    // Only supersede with something genuinely NEWER. Publishing an older
    // release after a newer one must not roll current knowledge backwards.
    if (oldWhen && newWhen && newWhen <= oldWhen) continue;
    await db.write(`facts?id=eq.${old.id}&superseded_by=is.null`, {
      method: "PATCH", body: { superseded_by: row.id }, prefer: "return=minimal",
    }).catch(() => {});
  }

  await db.write(`mineiq_ingestions?publication_id=eq.${pub.id}&revision=eq.${revision}`, {
    method: "PATCH", body: { facts_written: (written || []).length }, prefer: "return=minimal",
  }).catch(() => {});
}

/**
 * device_push_v1 — PUBLICATION_PUBLISHED → queue APNs pushes for followers.
 *
 * Queues only. The existing sender (api/news-push-send.js) drains the outbox
 * and talks to Apple, so nothing is sent inline with publishing and an APNs
 * outage cannot affect a publication.
 *
 * DUPLICATE PROTECTION is the unique index on (post_id, user_id, token) from
 * 0050 plus resolution=ignore-duplicates: replaying the event inserts nothing,
 * so a device is never buzzed twice for one release.
 *
 * Runs AFTER feed_projection_v1 has created the post — it looks the post up and
 * returns quietly if it is not there yet, and the next drain picks it up.
 */
async function devicePushV1(event, db) {
  if (event.event_type !== "PUBLICATION_PUBLISHED") return;

  const posts = await db.getJson(`posts?publication_id=eq.${event.publication_id}&select=id,company_id,title,materiality_score,removed_at`);
  const post = posts && posts[0];
  if (!post || post.removed_at) return;          // no projection yet → next drain

  const cos = await db.getJson(`companies?id=eq.${post.company_id}&select=name,slug`);
  const co = (cos && cos[0]) || {};

  const follows = await db.getJson(`company_follows?company_id=eq.${post.company_id}&select=user_id`);
  const userIds = [...new Set((follows || []).map((f) => f.user_id))];
  if (!userIds.length) return;

  // Same preference model the in-app listener uses: a company-specific pref
  // overrides the global one, muted means silent, and a release below the
  // reader's materiality threshold is not pushed.
  const prefs = await db.getJson(
    `notification_prefs?user_id=in.(${userIds.join(",")})&channel=eq.push&select=user_id,company_id,muted,min_materiality`) || [];
  const score = post.materiality_score == null ? 0 : post.materiality_score;

  const eligible = userIds.filter((uid) => {
    const cPref = prefs.find((p) => p.user_id === uid && p.company_id === post.company_id);
    const gPref = prefs.find((p) => p.user_id === uid && !p.company_id);
    const pref = cPref || gPref;
    if (pref && pref.muted) return false;
    const minMat = pref && pref.min_materiality != null ? pref.min_materiality : 0;
    return score >= minMat;
  });
  if (!eligible.length) return;

  const tokens = await db.getJson(
    `push_tokens?user_id=in.(${eligible.join(",")})&select=user_id,token,platform`) || [];
  if (!tokens.length) return;

  const rows = tokens.map((t) => ({
    news_item_id: null,
    post_id: post.id,
    user_id: t.user_id,
    token: t.token,
    platform: t.platform || "ios",
    title: `${co.name || "A company you follow"} published a new update`,
    body: post.title || "",
    // The app already routes /p/<id>; the in-app notification uses the same
    // deep link, so both surfaces open the same screen.
    data: { deep_link: `/p/${post.id}`, post_id: post.id, company_slug: co.slug || null, kind: "new_release" },
  }));

  const r = await db.write(`notification_outbox?on_conflict=post_id,user_id,token`, {
    method: "POST", body: rows, prefer: "resolution=ignore-duplicates,return=minimal",
  });
  if (!r.ok) throw new Error(`push outbox insert failed (${r.status})`);
}

/**
 * profile_timeline_v1 — PUBLICATION_PUBLISHED | PUBLICATION_REVISED
 *                        → the company's Pro Profile timeline.
 *
 * THE GAP THIS CLOSES. Publishing has never written companies.profile.timeline;
 * migration 0036 recorded that as deliberate and deferred ("no profile.timeline
 * touched. Those are Phases 2 and 3"). Until now a published release reached the
 * feed but never the profile's press-release history.
 *
 * The entry REFERENCES the publication rather than copying the release into the
 * profile. The body already lives in publications.content and release_revisions;
 * a third copy would be a third thing to keep correct.
 *
 * CHRONOLOGY is the release's own date (updates.published_on), matching what
 * api/publish.js already does for posts.published_at. A September upload of a
 * March release sorts to March.
 *
 * A REVISION updates the same `key` in place: the title and summary change, the
 * date does not, and no second entry appears.
 *
 * Idempotent by `key`, and atomic: upsert_timeline_entry() merges inside one
 * statement so it cannot clobber a profile edit made in the portal meanwhile.
 */
async function profileTimelineV1(event, db) {
  if (event.event_type !== "PUBLICATION_PUBLISHED" && event.event_type !== "PUBLICATION_REVISED") return;

  const pubs = await db.getJson(`publications?id=eq.${event.publication_id}&select=id,company_id,update_id,destination_id,status,content,published_at`);
  const pub = pubs && pubs[0];
  if (!pub) return;
  if (pub.destination_id !== "passport") return;     // only the profile publication is on the profile
  if (pub.status !== "published") return;

  const content = pub.content || {};
  // Media posts are not press releases and do not belong in the PR history.
  if (content.post_type && content.post_type !== "press_release") return;

  let publishedOn = null;
  let summary = "";
  let category = null;
  if (pub.update_id) {
    const upds = await db.getJson(`updates?id=eq.${pub.update_id}&select=published_on,detected`);
    const upd = upds && upds[0];
    if (upd) {
      publishedOn = upd.published_on || null;
      const det = upd.detected || {};
      summary = det.summary || (det.analysis && det.analysis.card && det.analysis.card.whatHappened) || "";
      category = det.category || null;
    }
  }
  // Fall back to the publication timestamp's DATE, never to today.
  const date = publishedOn || (pub.published_at ? String(pub.published_at).slice(0, 10) : null);
  if (!date) return;

  const posts = await db.getJson(`posts?publication_id=eq.${pub.id}&select=id`);
  const postId = (posts && posts[0] && posts[0].id) || null;

  const entry = {
    key: `pub:${pub.id}`,
    publication_id: pub.id,
    post_id: postId,
    id: pub.id,
    title: (content.headline && String(content.headline).trim()) || "Company update",
    date,
    category: category || content.category || null,
    summary: summary || null,
    source: "publication",
  };

  const r = await db.rpc("upsert_timeline_entry", { p_company: pub.company_id, p_entry: entry });
  if (!r.ok) throw new Error(`timeline upsert failed (${r.status})`);
}

export const LISTENERS = [
  { name: "feed_projection_v1", handle: feedProjectionV1 },
  { name: "in_app_notifications_v1", handle: inAppNotificationsV1 },
  { name: "mineiq_facts_v1", handle: mineIqFactsV1 },
  { name: "device_push_v1", handle: devicePushV1 },
  { name: "profile_timeline_v1", handle: profileTimelineV1 },
];

// Exported for direct unit testing.
export { feedProjectionV1, inAppNotificationsV1, mineIqFactsV1, devicePushV1, profileTimelineV1, scoreFor };
