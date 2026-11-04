// D1 -- a portal press release reaches investors with the MineEx summary, the
// full release text and the images the company picked. Offline: a fake service
// database and storage; nothing leaves the process.
//   node scripts/release-projection-test.mjs
import {
  feedSummaryFrom, pickedAssetIds, publishReleaseImages, releaseTimelineEntry,
  mergeReleaseIntoPP, removeReleaseFromPP, updateCompiledProfile, MAX_IMAGES, MAX_IMAGE_BYTES,
} from "../api/_releaseProjection.js";
import { feedProjectionV1, profileTimelineV1 } from "../api/_listeners.js";
import { mapProfileToPP } from "../src/lib/profileToPP.js";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) pass++; else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const section = (t) => console.log(`\n  ${t}`);

const CO = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const A1 = "aaaaaaaa-0000-4000-8000-000000000001", A2 = "aaaaaaaa-0000-4000-8000-000000000002";
const A3 = "aaaaaaaa-0000-4000-8000-000000000003", A4 = "aaaaaaaa-0000-4000-8000-000000000004";
const A5 = "aaaaaaaa-0000-4000-8000-000000000005";
const PUB = "bbbbbbbb-0000-4000-8000-000000000001", UPD = "cccccccc-0000-4000-8000-000000000001";
const SB = "https://stub.supabase.invalid";

const card = {
  headline: "Acme drills 12 m of 5.2 g/t gold", category: "Drilling",
  whatHappened: "Acme Mining reported 5.2 g/t gold over 12 metres at Hill North.",
  whyItMatters: "Extends known mineralisation 200 m to the north.",
  whatHappensNext: "Follow-up drilling in Q1.", investorTakeaway: "A step-out hit.",
  keyNumbers: [{ value: "5.2 g/t", label: "gold over 12 m" }],
};
const BODY = "ACME MINING REPORTS DRILL RESULTS\n\nVancouver, BC, November 3, 2026 - Acme Mining reported 5.2 g/t gold over 12 metres.\n\nThe full release continues here.";
const detected = {
  headline: card.headline, document_id: "doc-1",
  analysis: { card, classification: { suggestedKey: false, suggestedImpact: "Moderate", confidence: "high" } },
  selected_asset_ids: [A2, A1, "not-a-uuid", A1, A3, A4, A5],
  asset_captions: { [A1]: "Core photo" },
};

// ---- a fake service database + storage ------------------------------------
function fakeDb({ company, assets = [], privateFiles = {}, failRead = false, clash = false } = {}) {
  const st = { company: company ? JSON.parse(JSON.stringify(company)) : null, assets: assets.map((a) => ({ ...a })),
    publicFiles: {}, posts: [], timeline: [], writes: [], reads: 0 };
  const json = (b, status = 200) => ({ ok: status < 300, status, json: async () => b, headers: { get: () => "application/json" } });
  const db = {
    st,
    async getRows(path) {
      if (path.startsWith("media_assets?")) {
        const ids = (/id=in\.\(([^)]*)\)/.exec(path) || [])[1].split(",");
        const co = (/company_id=eq\.([^&]+)/.exec(path) || [])[1];
        return st.assets.filter((a) => ids.includes(a.id) && a.company_id === co);
      }
      if (path.startsWith("companies?")) return st.company ? [{ profile: st.company.profile, updated_at: st.company.updated_at, name: "Acme", slug: "acme" }] : [];
      if (path.startsWith("publications?")) return [db.pub];
      if (path.startsWith("updates?")) return [db.upd];
      if (path.startsWith("posts?")) return st.posts.map((p) => ({ id: p.id || "post-1" }));
      return [];
    },
    async write(path, { method, body }) {
      st.writes.push({ path, method, body });
      if (path.startsWith("media_assets?") && method === "PATCH") {
        const id = (/id=eq\.([^&]+)/.exec(path) || [])[1];
        const a = st.assets.find((x) => x.id === id); Object.assign(a, body); return json(null, 204);
      }
      if (path.startsWith("posts?")) { st.posts = [{ ...body, id: "post-1" }]; return json(null, 201); }
      if (path.startsWith("companies?") && method === "PATCH") {
        const ts = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(path) || [])[1]);
        if (clash || ts !== st.company.updated_at) return json([]);
        st.company.profile = body.profile; st.company.updated_at = `${st.company.updated_at}+`;
        return json([{ id: CO }]);
      }
      return json(null, 204);
    },
    async rpc(fn, body) {
      if (fn === "upsert_timeline_entry") { st.timeline = [...st.timeline.filter((e) => e.key !== body.p_entry.key), body.p_entry]; return json({ ok: true }); }
      if (fn === "remove_timeline_entry") { st.timeline = st.timeline.filter((e) => e.key !== body.p_key); return json({ ok: true }); }
      return json({});
    },
    async storage(path, opts = {}) {
      if (!opts.method || opts.method === "GET") {
        st.reads++;
        if (failRead) return { ok: false, status: 500 };
        const key = decodeURIComponent(path.replace("object/company-media-private/", ""));
        const f = privateFiles[key];
        if (!f) return { ok: false, status: 404 };
        return { ok: true, status: 200, headers: { get: () => f.type }, arrayBuffer: async () => new Uint8Array(f.size).buffer };
      }
      st.publicFiles[path.replace("object/company-media/", "")] = { type: opts.contentType, size: opts.body.length, upsert: opts.upsert };
      return { ok: true, status: 200 };
    },
    publicUrl: (bucket, p) => `${SB}/storage/v1/object/public/${bucket}/${p}`,
  };
  return db;
}
const asset = (id, extra = {}) => ({ id, company_id: CO, mime_type: "image/png", bytes: 1000, storage_path: `company-media-private/${CO}/${id}.png`, public_storage_path: null, ...extra });
const file = (id, type = "image/png", size = 1000) => ({ [`${CO}/${id}.png`]: { type, size } });

// =============================================================================
section("FEED SUMMARY AND PICKED IMAGES");
ok(feedSummaryFrom(detected) === card.whatHappened, "the feed summary is the MineEx 'what happened', not the release");
ok(feedSummaryFrom({ analysis: { card: { whyItMatters: "Why." } } }) === "Why.", "...falling back to 'why it matters'");
ok(feedSummaryFrom({}) === null, "...and to nothing (the caller keeps its old value), never invented text");
ok(feedSummaryFrom({ analysis: { card: { whatHappened: "x".repeat(2000) } } }).length === 600, "...capped at 600 characters");
const ids = pickedAssetIds(detected);
ok(JSON.stringify(ids) === JSON.stringify([A2, A1, A3, A4, A5]), "picked ids keep the company's order, drop duplicates and malformed ids", JSON.stringify(ids));
ok(pickedAssetIds({ selected_asset_ids: Array.from({ length: 30 }, (_, i) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`) }).length === MAX_IMAGES, `at most ${MAX_IMAGES} images`);
ok(pickedAssetIds({ selected_asset_ids: "x" }).length === 0 && pickedAssetIds(null).length === 0, "a missing or malformed selection publishes nothing");

section("MAKING PICKED IMAGES PUBLIC (security)");
{
  const db = fakeDb({
    assets: [
      asset(A1), asset(A2, { mime_type: "image/jpeg", storage_path: `company-media-private/${CO}/${A2}.png` }),
      asset(A3, { company_id: OTHER, storage_path: `company-media-private/${OTHER}/${A3}.png` }),  // another company's
      asset(A4, { mime_type: "application/pdf" }),                                                 // not an image
      asset(A5, { storage_path: `company-media-private/${OTHER}/${A5}.png` }),                     // outside the folder
    ],
    privateFiles: { ...file(A1), [`${CO}/${A2}.png`]: { type: "image/jpeg", size: 2000 } },
  });
  const urls = await publishReleaseImages(db, CO, detected);
  ok(urls.length === 2 && urls[0].endsWith(`releases/${CO}/${A2}.jpg`) && urls[1].endsWith(`releases/${CO}/${A1}.png`), "only this company's real images, in the company's order", JSON.stringify(urls));
  ok(!urls.some((u) => u.includes(A3) || u.includes(A4) || u.includes(A5)), "another company's asset, a PDF and a file outside the company folder are never published");
  ok(Object.keys(db.st.publicFiles).every((p) => p.startsWith(`releases/${CO}/`)), "public copies go under releases/<company>/ only");
  ok(Object.values(db.st.publicFiles).every((f) => f.upsert), "...as an overwrite of a fixed path, so a retry never duplicates");
  const a1 = db.st.assets.find((a) => a.id === A1);
  ok(a1.visibility === "published" && a1.public_storage_path === `company-media/releases/${CO}/${A1}.png` && a1.published_at, "the asset records its public copy (0038's columns); the private original stays");
  const reads = db.st.reads;
  const again = await publishReleaseImages(db, CO, detected);
  ok(JSON.stringify(again) === JSON.stringify(urls) && db.st.reads === reads, "a second run reuses the public copies without re-reading private files");
}
{
  const db = fakeDb({ assets: [asset(A1, { bytes: MAX_IMAGE_BYTES + 1 })], privateFiles: file(A1) });
  ok((await publishReleaseImages(db, CO, { selected_asset_ids: [A1] })).length === 0, "an image over the size limit is skipped");
  const db2 = fakeDb({ assets: [asset(A1)], privateFiles: file(A1, "text/html") });
  ok((await publishReleaseImages(db2, CO, { selected_asset_ids: [A1] })).length === 0, "a file that is not actually an image (by its stored type) is skipped");
  const db3 = fakeDb({ assets: [asset(A1)], failRead: true });
  let threw = false; try { await publishReleaseImages(db3, CO, { selected_asset_ids: [A1] }); } catch { threw = true; }
  ok(threw, "a failed read of a picked image throws, so the delivery is retried rather than published without it");
  ok((await publishReleaseImages(fakeDb(), "not-a-uuid", detected)).length === 0, "a malformed company id publishes nothing");
}

section("THE INVESTOR ENTRY (same mapper as the review preview)");
const pub = { id: PUB, company_id: CO, update_id: UPD, destination_id: "passport", status: "published", content: { post_type: "press_release", headline: card.headline, body: BODY, fullText: BODY }, published_at: "2026-11-03T20:00:00Z" };
const upd = { published_on: "2026-11-03", detected, body: BODY };
const urls = [`${SB}/storage/v1/object/public/company-media/releases/${CO}/${A2}.jpg`];
const entry = releaseTimelineEntry({ pub, upd, date: "2026-11-03", postId: "post-1", imageUrls: urls });
ok(entry.key === `pub:${PUB}` && entry.milestoneKey === false, "the entry's key is its identity; the milestone flag travels separately");
ok(entry.ai.whatHappened === card.whatHappened && entry.ai.fullText === BODY && entry.fullImages.length === 1, "it carries the MineEx summary, the full text and the images");
{
  const corrected = releaseTimelineEntry({ pub: { ...pub, content: { ...pub.content, headline: "Corrected headline", body: "Corrected text." } }, upd, date: "2026-11-03", postId: null, imageUrls: [] });
  ok(corrected.title === "Corrected headline" && corrected.ai.fullText === "Corrected text." && corrected.ai.whatHappened === card.whatHappened,
     "after a correction the entry shows the corrected headline and text (the draft is never revised), keeping the MineEx analysis");
}
const pp0 = { NAME: "Acme", PR_YEARS: [{ year: 2026, items: [{ id: "2026-11-03", headline: card.headline, why: BODY, key: false, takeaways: [] }, { id: "2026-05-01", headline: "Older release", why: "x", key: false }] }], FULL: { "2026-05-01": { text: "older", images: [] } } };
const pp1 = mergeReleaseIntoPP(pp0, entry);
const items = pp1.PR_YEARS.flatMap((y) => y.items);
const it = items.find((x) => x.pubKey === entry.key);
ok(items.length === 2 && it, "the thin same-day item is replaced by the full one; other releases are kept", JSON.stringify(items.map((x) => x.headline)));
ok(it.whatHappened === card.whatHappened && it.why === card.whyItMatters && it.key === false, "the investor card shows the MineEx summary and is not wrongly marked a milestone");
ok(pp1.FULL["2026-11-03"] && pp1.FULL["2026-11-03"].text === BODY && pp1.FULL["2026-11-03"].images[0] === urls[0], "'Read Full Press Release' has the full text and the picked image");
ok(pp1.FULL["2026-05-01"].text === "older" && pp1.NAME === "Acme", "nothing else in the profile changes");
const pp2 = mergeReleaseIntoPP(pp1, entry);
ok(JSON.stringify(pp2) === JSON.stringify(pp1), "merging the same release again is a no-op (retries and revisions never duplicate)");
const pp3 = removeReleaseFromPP(pp2, entry.key);
ok(!pp3.PR_YEARS.flatMap((y) => y.items).some((x) => x.pubKey) && !pp3.FULL["2026-11-03"] && pp3.FULL["2026-05-01"], "unpublishing removes exactly this release and its full text");
{
  const compiled = mapProfileToPP({ name: "Acme", timeline: [entry, { date: "2026-01-01", title: "Hand entry", key: true }] });
  const its = compiled.PR_YEARS.flatMap((y) => y.items);
  ok(its.find((x) => x.pubKey === entry.key && x.key === false) && its.find((x) => x.headline === "Hand entry" && x.key === true), "an editor's later recompile keeps the release (with its pubKey) and hand-entered milestones still work");
}

section("WRITING THE COMPILED PROFILE SAFELY");
{
  const db = fakeDb({ company: { profile: { name: "Acme", timeline: [], pp: pp0 }, updated_at: "2026-11-03T20:00:00Z" } });
  const r = await updateCompiledProfile(db, CO, (pp) => mergeReleaseIntoPP(pp, entry));
  ok(r.updated && db.st.company.profile.pp.FULL["2026-11-03"] && db.st.company.profile.name === "Acme", "the write lands and keeps the rest of the profile");
  const w = db.st.writes.find((x) => x.path.startsWith("companies?"));
  ok(/updated_at=eq\./.test(w.path), "...only if the row is unchanged since it was read");
  const clash = fakeDb({ company: { profile: { pp: pp0 }, updated_at: "t" }, clash: true });
  let threw = false; try { await updateCompiledProfile(clash, CO, (pp) => pp); } catch { threw = true; }
  ok(threw, "a concurrent edit makes it throw (the delivery retries) instead of overwriting the edit");
  const noPP = fakeDb({ company: { profile: { name: "x" }, updated_at: "t" } });
  ok((await updateCompiledProfile(noPP, CO, (pp) => pp)).skipped === "no compiled profile" && !noPP.st.writes.length, "a company with no compiled profile is left alone");
}

section("END TO END THROUGH THE LISTENERS");
{
  const db = fakeDb({
    company: { profile: { name: "Acme", timeline: [], pp: pp0 }, updated_at: "2026-11-03T20:00:00Z" },
    assets: [asset(A1), asset(A2, { mime_type: "image/jpeg" })],
    privateFiles: { ...file(A1), [`${CO}/${A2}.png`]: { type: "image/jpeg", size: 2000 } },
  });
  db.pub = pub; db.upd = upd;
  const ev = { event_type: "PUBLICATION_PUBLISHED", publication_id: PUB, created_at: new Date().toISOString() };
  await feedProjectionV1(ev, db);
  const post = db.st.posts[0];
  ok(post.summary === card.whatHappened, "feed post: the MineEx summary, not the whole release", String(post.summary).slice(0, 80));
  ok(post.thumbnail_url && post.thumbnail_url.endsWith(`${A2}.jpg`), "feed post: the first picked image");
  await profileTimelineV1(ev, db);
  const tl = db.st.timeline.find((e) => e.key === `pub:${PUB}`);
  ok(tl && tl.ai.fullText === BODY && tl.fullImages.length === 2, "profile.timeline gets the full entry");
  const cpp = db.st.company.profile.pp;
  ok(cpp.FULL["2026-11-03"].text === BODY && cpp.FULL["2026-11-03"].images.length === 2, "the compiled profile the apps read now opens the full release with both images");
  await profileTimelineV1({ event_type: "PUBLICATION_UNPUBLISHED", publication_id: PUB }, Object.assign(db, { pub: { ...pub, status: "unpublished" } }));
  ok(!db.st.timeline.length && !db.st.company.profile.pp.FULL["2026-11-03"], "unpublish removes it from both");
}
{
  // A release with no draft (an older publication) keeps the short entry and the old feed behaviour.
  const db = fakeDb({ company: { profile: { pp: { PR_YEARS: [] } }, updated_at: "t" } });
  db.pub = { ...pub, update_id: null }; db.upd = null;
  await feedProjectionV1({ event_type: "PUBLICATION_PUBLISHED", publication_id: PUB, created_at: new Date().toISOString() }, db);
  ok(db.st.posts[0].summary === BODY, "no draft: the feed keeps the publication's own text (unchanged behaviour)");
}

console.log(`\n  release-projection: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
