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

// D22 PHASE 1 -- a delivery is completed only when its work is done.
//
//   * READS use db.getRows(), which THROWS on an HTTP error. A failed read used
//     to return null, which every listener read as "nothing to do", so the
//     delivery was completed and the work silently lost.
//   * MISSING DEPENDENCIES throw (the post a notification or push needs), so the
//     claim/complete RPCs retry with backoff instead of completing.
//   * WRITES are checked; a failed write throws.
//   * FOLLOWERS are read in pages and processed in chunks, so a large audience
//     neither overflows a URL (which used to drop preferences: muted users were
//     notified) nor gets truncated at PostgREST's row cap.
//   * HISTORICAL events (older than HISTORICAL_CUTOFF_HOURS when processed) do
//     not notify investors or start AI extraction. A first drain over months of
//     never-delivered events must not buzz phones or spend on AI. Retries of a
//     CURRENT release finish within ~30 minutes, far inside the cutoff.
//     Skipping is returned as { skipped: "historical" } and counted by the
//     dispatcher; it is never silent. AI backfill is an explicit admin action
//     (api/dispatch.js, action "backfill").

import { revalidateSite } from "./_siteRevalidate.js";

export const HISTORICAL_CUTOFF_HOURS = 72;
export const FOLLOWER_CHUNK = 100;
const PAGE = 1000;

/**
 * Is this event too old to notify about or extract automatically?
 *
 * DELIVERY_EPOCH (optional, ISO timestamp, D22 Phase 2): the moment reliable,
 * scheduled delivery went live. An event that occurred AFTER it is never
 * historical -- if the dispatcher is down for days, those releases are
 * notified late rather than not at all (the 72 h rule exists to stop a backfill
 * over events from BEFORE delivery was reliable, not to drop current ones).
 * Unset: the plain 72 h rule (Phase 1 behaviour).
 */
export function isHistorical(event, now = Date.now()) {
  const at = Date.parse((event && (event.occurred_at || event.created_at)) || "");
  if (!Number.isFinite(at)) return false;
  const epoch = Date.parse(process.env.DELIVERY_EPOCH || "");
  if (Number.isFinite(epoch) && at >= epoch) return false;
  return now - at > HISTORICAL_CUTOFF_HOURS * 3600 * 1000;
}

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

/** Every follower of a company, paged (PostgREST caps a response at ~1000 rows). */
async function allFollowers(db, companyId) {
  const ids = new Set();
  for (let offset = 0; ; offset += PAGE) {
    const rows = await db.getRows(`company_follows?company_id=eq.${companyId}&select=user_id&order=user_id&limit=${PAGE}&offset=${offset}`);
    rows.forEach((r) => r && r.user_id && ids.add(r.user_id));
    if (rows.length < PAGE) break;
  }
  return [...ids];
}

/** Preferences for a set of users on one channel, read in safe chunks. */
async function prefsFor(db, userIds, channel) {
  const out = [];
  for (const part of chunk(userIds, FOLLOWER_CHUNK)) {
    out.push(...await db.getRows(`notification_prefs?user_id=in.(${part.join(",")})&channel=eq.${channel}&select=user_id,company_id,muted,min_materiality`));
  }
  return out;
}

/** The followers a release should reach: company pref beats global; muted and below-threshold excluded. */
function eligibleFollowers(userIds, prefs, companyId, score) {
  return userIds.filter((uid) => {
    const cPref = prefs.find((p) => p.user_id === uid && p.company_id === companyId);
    const gPref = prefs.find((p) => p.user_id === uid && p.company_id == null);
    const pref = cPref || gPref;
    if (pref && pref.muted) return false;
    const minMat = pref && pref.min_materiality != null ? pref.min_materiality : 0;
    return score >= minMat;
  });
}

/** A write that must succeed, or the delivery retries. */
async function mustWrite(db, path, opts, what) {
  const r = await db.write(path, opts);
  if (!r || !r.ok) throw new Error(`${what} failed (${r ? r.status : "no response"})`);
  return r;
}

const LABEL_TO_SCORE = { Transformational: 90, High: 70, Moderate: 40, Low: 15 };
const scoreFor = (label) => (label && LABEL_TO_SCORE[label] != null ? LABEL_TO_SCORE[label] : null);

async function feedProjectionV1(event, db) {
  const pubs = await db.getRows(`publications?id=eq.${event.publication_id}&select=id,company_id,update_id,destination_id,status,content,external_url,published_at`);
  const pub = pubs[0];
  if (!pub) return; // publication genuinely gone (deleted) → nothing to project

  // The feed post represents the Passport-profile publication only. LinkedIn/X/etc.
  // publications flow through the same outbox but do not become feed posts.
  if (pub.destination_id !== "passport") return;

  // PUBLICATION_REVISED lands here too (0051). The upsert below is keyed on
  // publication_id, so a correction UPDATES the existing post -- same id, same
  // published_at, same place in the feed -- rather than adding a second one.
  // Re-checked against the publication's CURRENT status (D22 Phase 4), as the
  // timeline listener does: deliveries can run out of order -- a retried or
  // replayed PUBLISHED delivery after an unpublish used to put the withdrawn
  // release back in the feed (removed_at: null below), and a late UNPUBLISHED
  // delivery after a re-publish would hide a live post.
  if (event.event_type === "PUBLICATION_UNPUBLISHED") {
    if (pub.status === "published") return { skipped: "published again" };
    // Checked: a failed soft-remove used to be ignored, leaving an unpublished
    // release in the investor feed with its delivery marked done.
    await mustWrite(db, `posts?publication_id=eq.${event.publication_id}`, {
      method: "PATCH", body: { removed_at: new Date().toISOString() }, prefer: "return=minimal",
    }, "feed soft-remove");
    return;
  }
  if (pub.status !== "published") return { skipped: "not published" };

  // PUBLICATION_PUBLISHED → build the projection from authoritative data.
  let materialityLabel = null;
  if (pub.update_id) {
    const upd = await db.getRows(`updates?id=eq.${pub.update_id}&select=detected`);
    materialityLabel = (upd[0] && upd[0].detected && upd[0].detected.materiality) || null;
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
    // A media post's media_url is the video itself, so prefer an explicit thumbnail.
    thumbnail_url: content.thumbnail_url || content.media_url || null,
    source_url: content.source_url || pub.external_url || null,
    materiality_label: postType === "media" ? null : materialityLabel,
    materiality_score: postType === "media" ? null : scoreFor(materialityLabel),
    published_at: pub.published_at || new Date().toISOString(),
    removed_at: null, // re-publish makes it visible again
  };
  // The actual media source (photo or video). Without this, a video post has
  // nothing to play. Sent ONLY when there is one: posts.media_url is a legacy
  // column that no migration creates (0071 adds it), so a database built from
  // migrations -- staging -- refused EVERY projection with PGRST204 while
  // media_url was always sent, even as null. Press releases never set it.
  if (content.media_url) row.media_url = content.media_url;
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
  if (isHistorical(event)) return { skipped: "historical" };   // no surprise notifications for old releases
  const posts = await db.getRows(`posts?publication_id=eq.${event.publication_id}&select=id,company_id,title,post_type,materiality_score,removed_at`);
  const post = posts[0];
  if (!post) throw new Error("post not yet projected"); // retry until feed_projection has run
  if (post.removed_at) return { skipped: "unpublished" };   // withdrawn before we got to it

  // Eligibility: only official releases notify — never every media upload.
  if (post.post_type !== "press_release") return;

  const cos = await db.getRows(`companies?id=eq.${post.company_id}&select=name,slug`);
  const co = cos[0] || {};
  const userIds = await allFollowers(db, post.company_id);
  if (!userIds.length) return;

  const prefs = await prefsFor(db, userIds, "in_app");
  const score = post.materiality_score == null ? 0 : post.materiality_score;
  const rows = eligibleFollowers(userIds, prefs, post.company_id, score).map((uid) => ({
    user_id: uid, kind: "new_release", company_id: post.company_id, post_id: post.id,
    title: `${co.name || "A company you follow"} posted an update`,
    body: post.title, deep_link: `/p/${post.id}`,
  }));
  // Upsert on (user_id, post_id, kind): a retry or a second dispatcher writes
  // nothing twice. Chunked so a large audience is not one enormous request.
  for (const part of chunk(rows, 500)) {
    await mustWrite(db, `notifications?on_conflict=user_id,post_id,kind`, {
      method: "POST", body: part, prefer: "resolution=merge-duplicates,return=minimal",
    }, "notifications upsert");
  }
  return { notified: rows.length };
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
// THE CLAIM LIFECYCLE (D22). mineiq_ingestions.facts_written = -1 means "claimed,
// extraction running"; >= 0 means "done" (rows written before D22 hold 0 or
// more, so they read as done). Previously the claim was simply inserted first,
// so an AI failure -- or the function being killed at its time limit -- left a
// claim behind and every retry returned early: that release's facts were lost
// for good. Now a failure RELEASES the claim, and a claim left "running" for
// longer than CLAIM_STALE_MINUTES (a killed run) is taken over by the retry.
export const CLAIM_STALE_MINUTES = 15;

async function claimIngestion(db, pub, revision) {
  const key = `publication_id=eq.${pub.id}&revision=eq.${revision}`;
  const tryClaim = async () => {
    const r = await mustWrite(db, `mineiq_ingestions?on_conflict=publication_id,revision`, {
      method: "POST",
      body: [{ publication_id: pub.id, company_id: pub.company_id, revision, facts_written: -1 }],
      prefer: "resolution=ignore-duplicates,return=representation",
    }, "mineiq claim");
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  };
  if (await tryClaim()) return "claimed";
  const cur = (await db.getRows(`mineiq_ingestions?${key}&select=facts_written,ingested_at`))[0];
  if (!cur) return (await tryClaim()) ? "claimed" : "busy";          // vanished between calls
  if (Number(cur.facts_written) >= 0) return "done";                 // finished earlier: idempotent
  const age = Date.now() - Date.parse(cur.ingested_at || 0);
  if (age > CLAIM_STALE_MINUTES * 60 * 1000) {
    // A run that died mid-extraction. Remove exactly that stale claim (the
    // filter on ingested_at stops two retries both removing a fresh one), then race to re-claim.
    await mustWrite(db, `mineiq_ingestions?${key}&facts_written=eq.-1&ingested_at=eq.${encodeURIComponent(cur.ingested_at)}`,
      { method: "DELETE", prefer: "return=minimal" }, "stale mineiq claim removal");
    return (await tryClaim()) ? "claimed" : "busy";
  }
  return "busy";                                                     // another worker is extracting now
}

async function mineIqFactsV1(event, db, opts = {}) {
  // Both the original publication and a correction reconcile knowledge.
  if (event.event_type !== "PUBLICATION_PUBLISHED" && event.event_type !== "PUBLICATION_REVISED") return;
  // Old events are not extracted automatically: AI backfill is an explicit
  // admin action (opts.force, from api/dispatch.js action "backfill").
  if (!opts.force && isHistorical(event)) return { skipped: "historical" };

  const pubs = await db.getRows(`publications?id=eq.${event.publication_id}&select=id,company_id,update_id,destination_id,status,published_at`);
  const pub = pubs[0];
  if (!pub) return;
  if (pub.destination_id !== "passport") return;   // only the profile publication is a disclosure
  if (pub.status !== "published") return { skipped: "not published" };   // withdrawn before we got to it

  // CLAIM FIRST. Two workers racing this event would each run their own
  // extraction, and two model runs do not produce byte-identical facts -- so a
  // unique key on the rows cannot prevent duplicates on its own. Whoever wins
  // this insert does the work; the loser gets no row back and returns.
  // Replaying the event later loses the same way, which is the idempotency.
  // Which revision are we ingesting? A correction (PUBLICATION_REVISED) carries
  // it; an original publication is revision 1.
  const revision = Number(event.payload && event.payload.revision) || 1;
  const revisionId = (event.payload && event.payload.revision_id) || null;

  const state = await claimIngestion(db, pub, revision);
  if (state === "done") return { skipped: "already extracted" };
  // Busy: another worker holds a fresh claim. Retry later (backoff) rather than
  // completing -- if that worker dies, its claim goes stale and this one takes over.
  if (state === "busy") throw new Error("mineiq extraction in progress elsewhere; retrying");

  const ingestionKey = `mineiq_ingestions?publication_id=eq.${pub.id}&revision=eq.${revision}`;
  const finish = async (n) => {
    await mustWrite(db, ingestionKey, { method: "PATCH", body: { facts_written: n }, prefer: "return=minimal" }, "mineiq finish");
    return { facts: n };
  };
  try {
    return await extractAndStore();
  } catch (e) {
    // Release the claim so the retry extracts instead of returning early.
    await db.write(`${ingestionKey}&facts_written=eq.-1`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
    throw e;
  }

  async function extractAndStore() {
  if (!pub.update_id) return finish(0);
  const upds = await db.getRows(`updates?id=eq.${pub.update_id}&select=body,detected,published_on`);
  const upd = upds[0];
  if (!upd) return finish(0);

  const det = upd.detected || {};
  // The FULL release is the authoritative text, not the MineEx summary: the
  // summary is MineEx's rendering, the release is what the company disclosed.
  // For a correction, read the REVISION that was published, not the working draft.
  let body = upd.body || "";
  if (revisionId) {
    const revs = await db.getRows(`release_revisions?id=eq.${revisionId}&select=body`);
    if (revs[0] && String(revs[0].body || "").trim()) body = revs[0].body;
  }
  if (!String(body).trim()) return finish(0);

  const cos = await db.getRows(`companies?id=eq.${pub.company_id}&select=name`);
  const companyName = (cos[0] && cos[0].name) || "";

  const { extractFacts, factRows } = await (opts.mineiq ? Promise.resolve(opts.mineiq) : import("./_mineiq.js"));
  const facts = await extractFacts({ title: det.headline || "", body, companyName });
  if (!facts.length) return finish(0);

  const rows = factRows(facts, {
    companyId: pub.company_id,
    publicationId: pub.id,
    documentId: det.document_id || null,
    disclosedOn: upd.published_on || (pub.published_at ? String(pub.published_at).slice(0, 10) : null),
    revision,
    revisionId,
  });
  if (!rows.length) return finish(0);

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
    const priorRows = await db.getRows(
      `facts?company_id=eq.${pub.company_id}&publication_id=eq.${pub.id}&superseded_by=is.null&select=id,content_key`);
    const nowKeys = new Set(rows.map((r) => r.content_key));
    retired = priorRows.filter((f) => !nowKeys.has(f.content_key));
  }

  // Which current facts might these replace? Read BEFORE inserting, so the new
  // rows are not candidates to supersede themselves.
  const measures = [...new Set(rows.map((r) => r.measure).filter(Boolean))];
  let priorByMeasure = new Map();
  if (measures.length) {
    const inList = measures.map((m) => `"${encodeURIComponent(m).replace(/"/g, "")}"`).join(",");
    const prior = await db.getRows(
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
    await mustWrite(db, `facts?id=eq.${gone.id}&superseded_by=is.null`, {
      method: "PATCH", body: { superseded_by: (replacement && replacement.id) || anchorId }, prefer: "return=minimal",
    }, "fact retirement");
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
    await mustWrite(db, `facts?id=eq.${old.id}&superseded_by=is.null`, {
      method: "PATCH", body: { superseded_by: row.id }, prefer: "return=minimal",
    }, "fact supersession");
  }

  return finish((written || []).length);
  }
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
  if (isHistorical(event)) return { skipped: "historical" };   // never buzz phones about old releases

  const posts = await db.getRows(`posts?publication_id=eq.${event.publication_id}&select=id,company_id,title,materiality_score,removed_at`);
  const post = posts[0];
  // No projection yet: RETRY. This used to return, which completed the delivery
  // and dropped the push for good (the comment promised "the next drain").
  if (!post) throw new Error("post not yet projected");
  if (post.removed_at) return { skipped: "unpublished" };

  const cos = await db.getRows(`companies?id=eq.${post.company_id}&select=name,slug`);
  const co = cos[0] || {};

  const userIds = await allFollowers(db, post.company_id);
  if (!userIds.length) return;

  // Same preference model the in-app listener uses: a company-specific pref
  // overrides the global one, muted means silent, and a release below the
  // reader's materiality threshold is not pushed.
  const prefs = await prefsFor(db, userIds, "push");
  const score = post.materiality_score == null ? 0 : post.materiality_score;
  const eligible = eligibleFollowers(userIds, prefs, post.company_id, score);
  if (!eligible.length) return;

  const tokens = [];
  for (const part of chunk(eligible, FOLLOWER_CHUNK)) {
    tokens.push(...await db.getRows(`push_tokens?user_id=in.(${part.join(",")})&select=user_id,token,platform`));
  }
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

  for (const part of chunk(rows, 500)) {
    await mustWrite(db, `notification_outbox?on_conflict=post_id,user_id,token`, {
      method: "POST", body: part, prefer: "resolution=ignore-duplicates,return=minimal",
    }, "push outbox insert");
  }
  return { queued: rows.length };
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
  // UNPUBLISHED (subscribed by migration 0071, from its active_from on): remove
  // the timeline entry -- never the release record. Re-checked against the
  // publication's CURRENT status, so an unpublish delivered after the release
  // was published again cannot remove a live entry.
  if (event.event_type === "PUBLICATION_UNPUBLISHED") {
    const cur = (await db.getRows(`publications?id=eq.${event.publication_id}&select=id,company_id,status,destination_id`))[0];
    if (!cur) return { skipped: "publication gone" };
    if (cur.status === "published") return { skipped: "published again" };
    if (cur.destination_id !== "passport") return;
    const r = await db.rpc("remove_timeline_entry", { p_company: cur.company_id, p_key: `pub:${cur.id}` });
    if (!r.ok) throw new Error(`timeline removal failed (${r.status})`);
    return { removed: true };
  }
  if (event.event_type !== "PUBLICATION_PUBLISHED" && event.event_type !== "PUBLICATION_REVISED") return;

  const pubs = await db.getRows(`publications?id=eq.${event.publication_id}&select=id,company_id,update_id,destination_id,status,content,published_at`);
  const pub = pubs[0];
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
    const upds = await db.getRows(`updates?id=eq.${pub.update_id}&select=published_on,detected`);
    const upd = upds[0];
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

  const posts = await db.getRows(`posts?publication_id=eq.${pub.id}&select=id`);
  const postId = (posts[0] && posts[0].id) || null;

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

// a15 -- CONTENT FAN-OUT. One published record (the publication), one listener
// per destination, each with its own delivery state, retries and dead letter
// (event_deliveries). The investor feed is feed_projection_v1 above; these two
// deliver the same record to the company's website and its Conference booth,
// into destination_content (migration 0088), read by /api/site-content and
// /api/conference-config. Subscribed only from 0088's active_from, so nothing
// historical is replayed. Without 0088 they are never claimed (no subscription).
//
// Same rules as the feed: the PUBLICATION is re-read and its CURRENT status
// wins over the event type (deliveries can run out of order), and the write
// carries publish_seq so the database refuses to let an older delivery
// overwrite a newer one. A failed read or write throws -> retried with backoff.
export const FANOUT_EVENTS = ["PUBLICATION_PUBLISHED", "PUBLICATION_REVISED", "PUBLICATION_UNPUBLISHED"];

/** The destination copy of a publication: the record's own fields, nothing derived. */
export function destinationRow(pub) {
  const content = pub.content || {};
  const media = String(content.post_type || "") === "media";
  return {
    post_type: media ? "media" : "press_release",
    title: (content.headline && String(content.headline).trim()) || "Company update",
    summary: content.body || null,
    category: content.category ? String(content.category) : null,
    image_url: content.thumbnail_url || (media ? null : content.media_url) || null,
    source_url: content.source_url || pub.external_url || null,
    published_at: pub.published_at || null,
  };
}

// The website listener also asks the company's site to refetch once its copy is
// delivered (api/_siteRevalidate.js). A refused or failed hook throws, so the
// delivery retries -- the copy is re-applied at the same version (idempotent)
// and the hook called again. A newer version already delivered calls nothing:
// that delivery revalidates for itself.
function destinationListener(destination, { revalidate } = {}) {
  return async function deliver(event, db) {
    if (!FANOUT_EVENTS.includes(event.event_type)) return { skipped: "event type" };
    const pubs = await db.getRows(`publications?id=eq.${event.publication_id}&select=id,company_id,destination_id,status,content,external_url,published_at,publish_seq`);
    const pub = pubs[0];
    if (!pub) return { skipped: "publication gone" };
    if (pub.destination_id !== "passport") return { skipped: "not a profile publication" };
    const payloadSeq = event.payload && Number.isFinite(Number(event.payload.publish_seq)) ? Number(event.payload.publish_seq) : null;
    const version = payloadSeq != null ? payloadSeq : Number(pub.publish_seq || 0);

    const removing = event.event_type === "PUBLICATION_UNPUBLISHED";
    if (removing && pub.status === "published") return { skipped: "published again" };
    if (!removing && pub.status !== "published") return { skipped: "not published" };

    const r = await db.rpc("deliver_destination_content", {
      p_destination: destination, p_publication: pub.id, p_company: pub.company_id,
      p_version: version, p_removed: removing, p_row: removing ? {} : destinationRow(pub),
    });
    if (!r || !r.ok) throw new Error(`${destination} delivery failed (${r ? r.status : "no response"})`);
    const out = await r.json().catch(() => null);
    if (out && out.applied === false) return { skipped: removing ? "nothing to remove" : "newer version already delivered" };
    // The copy was delivered: a company with no hook is done, not skipped.
    if (revalidate) await revalidate(db, { event, pub, version });
  };
}
const siteContentV1 = destinationListener("website", { revalidate: revalidateSite });
const conferenceContentV1 = destinationListener("conference");

export const LISTENERS = [
  { name: "feed_projection_v1", handle: feedProjectionV1 },
  { name: "in_app_notifications_v1", handle: inAppNotificationsV1 },
  { name: "mineiq_facts_v1", handle: mineIqFactsV1 },
  { name: "device_push_v1", handle: devicePushV1 },
  { name: "profile_timeline_v1", handle: profileTimelineV1 },
  { name: "site_content_v1", handle: siteContentV1 },
  { name: "conference_content_v1", handle: conferenceContentV1 },
];

// Exported for direct unit testing.
export { feedProjectionV1, inAppNotificationsV1, mineIqFactsV1, devicePushV1, profileTimelineV1, scoreFor, siteContentV1, conferenceContentV1, destinationListener };
