// What investors see of a press release published from the portal (D1, 2026-11-03).
//
// The dispatcher used to project a portal release as a headline plus the WHOLE
// release text as its "summary", with no images and no "Read Full Press
// Release": the timeline entry went to profile.timeline, which the investor app
// never reads (it reads the compiled profile.pp), and nothing published the
// images the company picked. This module builds the full entry and puts it where
// the apps read it.
//
// AUTHORITY. Everything here is read server-side from the rows the company
// saved (updates.detected: headline, the MineEx analysis, the picked image ids;
// updates.body: the release text), never from the browser's publish request.
//
// SAME AS THE PREVIEW. The entry is built by releaseEntryFromDraft and mapped by
// mapReleaseEntry: the two functions the review screen's phone preview uses. What
// the company approved on that phone is what lands on the profile.
//
// IMAGES. Picked images live in the PRIVATE bucket. Publishing one copies its
// bytes to the public bucket under releases/<company>/<asset>.<ext> and records
// that on the asset (visibility 'published', public_storage_path), as 0038
// designed: the private original is never touched. Only assets that belong to
// the publishing company are used, only real images, at most MAX_IMAGES of at
// most MAX_IMAGE_BYTES each. The path is deterministic, so a retried delivery
// overwrites the same object instead of creating another.

import { releaseEntryFromDraft } from "../src/lib/releaseEntry.js";
import { mapReleaseEntry } from "../src/lib/profileToPP.js";

export const MAX_IMAGES = 12;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_FULL_TEXT = 200_000;
const PRIVATE_BUCKET = "company-media-private";
const PUBLIC_BUCKET = "company-media";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif" };

const s = (v) => (v == null ? "" : String(v));

/** The MineEx summary for the feed card: what happened, else why it matters. Never the release body. */
export function feedSummaryFrom(detected) {
  const card = (detected && detected.analysis && detected.analysis.card) || {};
  const text = s(card.whatHappened).trim() || s(card.whyItMatters).trim() || s(detected && detected.summary).trim();
  return text ? text.slice(0, 600) : null;
}

/** The picked image ids, in the company's order: unique, well-formed, capped. */
export function pickedAssetIds(detected) {
  const raw = Array.isArray(detected && detected.selected_asset_ids) ? detected.selected_asset_ids : [];
  const out = [];
  for (const id of raw) {
    const v = s(id);
    if (UUID.test(v) && !out.includes(v)) out.push(v);
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

/**
 * Make the company's picked images public and return their URLs, in order.
 * Idempotent. A missing, foreign, oversize or non-image asset is skipped, never
 * fatal. A failed read or write of an image the company DID pick throws, so the
 * delivery is retried rather than completed without it.
 */
export async function publishReleaseImages(db, companyId, detected) {
  const ids = pickedAssetIds(detected);
  if (!ids.length || !UUID.test(s(companyId))) return [];
  const rows = await db.getRows(`media_assets?id=in.(${ids.join(",")})&company_id=eq.${companyId}&select=id,company_id,mime_type,bytes,storage_path,public_storage_path`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const urls = [];
  for (const id of ids) {
    const a = byId.get(id);
    if (!a || a.company_id !== companyId) continue;                    // not this company's
    const ext = EXT[s(a.mime_type).toLowerCase()];
    if (!ext) continue;                                                // not an image we publish
    if (a.bytes != null && Number(a.bytes) > MAX_IMAGE_BYTES) continue;
    const publicPath = `releases/${companyId}/${id}.${ext}`;
    if (s(a.public_storage_path) !== `${PUBLIC_BUCKET}/${publicPath}`) {
      const priv = s(a.storage_path).replace(new RegExp(`^${PRIVATE_BUCKET}/`), "");
      if (!priv.startsWith(`${companyId}/`)) continue;                 // stored outside the company's folder
      const got = await db.storage(`object/${PRIVATE_BUCKET}/${priv.split("/").map(encodeURIComponent).join("/")}`);
      if (!got.ok) throw new Error(`release image read failed (${got.status})`);
      const type = s(got.headers.get("content-type")).split(";")[0].trim().toLowerCase();
      if (!EXT[type]) continue;
      const bytes = Buffer.from(await got.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) continue;
      const put = await db.storage(`object/${PUBLIC_BUCKET}/${publicPath}`, { method: "POST", body: bytes, contentType: type, upsert: true });
      if (!put.ok) throw new Error(`release image publish failed (${put.status})`);
      const mark = await db.write(`media_assets?id=eq.${id}&company_id=eq.${companyId}`, {
        method: "PATCH", prefer: "return=minimal",
        body: { visibility: "published", public_storage_path: `${PUBLIC_BUCKET}/${publicPath}`, published_at: new Date().toISOString() },
      });
      if (!mark.ok) throw new Error(`release image record failed (${mark.status})`);
    }
    urls.push(db.publicUrl(PUBLIC_BUCKET, publicPath));
  }
  return urls;
}

/**
 * The profile.timeline entry for a published release: the preview's own entry,
 * plus the fields the dispatcher owns (identity key, links, images).
 */
export function releaseTimelineEntry({ pub, upd, date, postId, imageUrls }) {
  const det = (upd && upd.detected) || {};
  const content = (pub && pub.content) || {};
  // Headline and text: the PUBLICATION first. A correction (revise_publication,
  // 0051) rewrites content.headline and content.body and never touches the draft,
  // so the draft would bring back the uncorrected release. The draft supplies
  // what the publication does not carry: the MineEx analysis and the images.
  const body = s(content.body).trim() || s(content.fullText).trim() || s(upd && upd.body).trim();
  const base = releaseEntryFromDraft({
    id: pub.id,
    body: body.slice(0, MAX_FULL_TEXT),
    published_on: date,
    detected: { ...det, headline: s(content.headline).trim() || s(det.headline).trim() },
  });
  const analysis = det.analysis || {};
  const entry = {
    ...base,
    // `key` is the timeline's identity for upsert/remove (0051); the milestone flag
    // the preview carries in `key` moves to `milestoneKey` (read by mapTimeline).
    key: `pub:${pub.id}`,
    milestoneKey: !!base.key,
    publication_id: pub.id,
    post_id: postId || null,
    source: "publication",
    date,
    fullImages: Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [],
  };
  if (analysis.v2 && typeof analysis.v2 === "object" && !analysis.v2._needsReview) entry.v2 = analysis.v2;
  return entry;
}

const sameRelease = (a, b) =>
  s(a.id) === s(b.id) && s(a.headline).trim().toLowerCase() === s(b.headline).trim().toLowerCase();

/**
 * pp with this release added or replaced, through the investor app's own mapper.
 * Also drops a thin same-day, same-headline item (the older projection) so the
 * release is not listed twice. Pure: returns a new pp.
 */
export function mergeReleaseIntoPP(pp, entry) {
  const mapped = mapReleaseEntry(entry);
  const base = removeReleaseFromPP(pp, entry.key);
  if (!mapped) return base;
  const item = { ...mapped.item, pubKey: entry.key };
  const years = (Array.isArray(base.PR_YEARS) ? base.PR_YEARS : []).map((y) => ({
    ...y, items: (Array.isArray(y.items) ? y.items : []).filter((it) => !sameRelease(it, item)),
  }));
  let bucket = years.find((y) => String(y.year) === String(mapped.year));
  if (!bucket) { bucket = { year: mapped.year, items: [] }; years.push(bucket); }
  bucket.items = [...bucket.items, item].sort((a, b) => s(b.id).localeCompare(s(a.id)));
  const PR_YEARS = years.filter((y) => y.items.length).sort((a, b) => Number(b.year) - Number(a.year));
  const FULL = { ...(base.FULL && typeof base.FULL === "object" ? base.FULL : {}) };
  if (mapped.full) FULL[item.id] = { ...mapped.full, pubKey: entry.key };
  return { ...base, PR_YEARS, FULL };
}

/** pp without this release (unpublish). Leaves anything it did not put there. Pure. */
export function removeReleaseFromPP(pp, key) {
  const src = pp && typeof pp === "object" ? pp : {};
  const PR_YEARS = (Array.isArray(src.PR_YEARS) ? src.PR_YEARS : [])
    .map((y) => ({ ...y, items: (Array.isArray(y.items) ? y.items : []).filter((it) => it.pubKey !== key) }))
    .filter((y) => y.items.length);
  const FULL = { ...(src.FULL && typeof src.FULL === "object" ? src.FULL : {}) };
  for (const k of Object.keys(FULL)) if (FULL[k] && FULL[k].pubKey === key) delete FULL[k];
  return { ...src, PR_YEARS, FULL };
}

/**
 * Apply a change to the compiled profile (pp) the apps read, without losing a
 * concurrent edit: the write only lands if the row is unchanged since it was
 * read (companies.updated_at is bumped by trigger on every update). A clash
 * throws, and the delivery is retried. A company with no compiled pp is left
 * alone: the apps cannot open it, and its next editor save compiles the timeline.
 */
export async function updateCompiledProfile(db, companyId, change) {
  const rows = await db.getRows(`companies?id=eq.${companyId}&select=profile,updated_at`);
  const row = rows[0];
  if (!row) return { skipped: "company gone" };
  const profile = row.profile && typeof row.profile === "object" ? row.profile : {};
  if (!profile.pp || typeof profile.pp !== "object") return { skipped: "no compiled profile" };
  const pp = change(profile.pp);
  const r = await db.write(`companies?id=eq.${companyId}&updated_at=eq.${encodeURIComponent(row.updated_at)}&select=id`, {
    method: "PATCH", prefer: "return=representation", body: { profile: { ...profile, pp } },
  });
  if (!r.ok) throw new Error(`profile update failed (${r.status})`);
  const out = await r.json().catch(() => []);
  if (!Array.isArray(out) || out.length !== 1) throw new Error("profile changed while publishing; retrying");
  return { updated: true };
}
