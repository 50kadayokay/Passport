// MineIQ ingestion — listener contract tests.
//
//   node scripts/mineiq-test.mjs
//
// Pure: a fake `db` stands in for the service-role accessor, so this needs no
// database and no API key. What it pins is the part that must not drift —
// company_id comes from the authoritative publication row, provenance survives,
// replaying an event writes nothing twice, and a release that discloses nothing
// quotable writes nothing at all.

import { mineIqFactsV1, devicePushV1, profileTimelineV1, inAppNotificationsV1 } from "../api/_listeners.js";
import { factRows, factKey, factMeasure, contentKey } from "../api/_mineiq.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };

/** Minimal stand-in for the dispatcher's db accessor. */
function fakeDb({ rows = {}, onWrite = () => {} } = {}) {
  const writes = [];
  return {
    writes,
    async getJson(path) {
      for (const [prefix, val] of Object.entries(rows)) {
        if (path.startsWith(prefix)) return typeof val === "function" ? val(path) : val;
      }
      return [];
    },
    async rpc(fn, body) {
      writes.push({ path: `rpc:${fn}`, body });
      onWrite(`rpc:${fn}`, { body });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
    async write(path, opts) {
      writes.push({ path, body: opts.body, prefer: opts.prefer });
      const r = onWrite(path, opts);
      // serviceDb().write returns the fetch Response, so listeners may call
      // .json() on it — the claim insert depends on that.
      return { ok: true, status: 201, json: async () => (r === undefined ? [] : r) };
    },
  };
}

const PUB = [{ id: "pub-1", company_id: "co-A", update_id: "upd-1", destination_id: "passport", status: "published", published_at: "2026-09-22T12:00:00Z" }];
const UPD = [{ body: "Hole LC-26-020 returned 12.4 g/t Au over 8.5 metres.", detected: { headline: "Kingsmen Intersects 12.4 g/t Au", document_id: "doc-9" }, published_on: "2026-09-22" }];
const CO = [{ name: "Kingsmen Resources Ltd." }];

// ---- A. provenance -------------------------------------------------------
console.log("\n=== A. provenance is preserved ===");
const rows = factRows(
  [{ kind: "drill_result", subject: "Las Coloradas", data: { hole: "LC-26-020", grade: "12.4 g/t Au", width: "8.5 m" },
     quote: "Hole LC-26-020 returned 12.4 g/t Au over 8.5 metres.", confidence: 0.95, current: false }],
  { companyId: "co-A", publicationId: "pub-1", documentId: "doc-9", disclosedOn: "2026-09-22" }
);
const row = rows[0];
ok(row.company_id === "co-A", "carries company_id");
ok(row.document_id === "doc-9", "carries the source document");
ok(/LC-26-020/.test(row.quote), "carries the verbatim supporting quote");
ok(row.confidence === 0.95, "carries confidence");
ok(row.data.publication_id === "pub-1", "carries the source publication");
ok(row.data.disclosed_on === "2026-09-22", "carries the disclosure date");
ok(row.data.status === "historical", "a drill result is marked historical, not current");
ok(row.data.hole === "LC-26-020" && row.data.grade === "12.4 g/t Au", "keeps the values verbatim");

console.log("\n=== A2. current vs historical ===");
const cur = factRows([{ kind: "capital", subject: "Kingsmen", data: { shares: "38.2M" }, quote: "38.2 million shares outstanding.", confidence: 0.9, current: true }],
  { companyId: "co-A", publicationId: "pub-1" })[0];
ok(cur.data.status === "current", "a share count is marked current");

// ---- B. isolation --------------------------------------------------------
console.log("\n=== B. company_id comes from the publication, not the event ===");
{
  let captured = null;
  const db = fakeDb({
    rows: { "publications?": PUB, "updates?": UPD, "companies?": CO },
    onWrite: (p, o) => {
      if (p.startsWith("facts")) { captured = o.body; return []; }
      if (p.startsWith("mineiq_ingestions")) return [{ publication_id: "pub-1" }];
      return [];
    },
  });
  // A hostile/malformed event naming a different company must not steer the write.
  await mineIqFactsV1({ event_type: "PUBLICATION_PUBLISHED", publication_id: "pub-1", company_id: "co-EVIL" }, db)
    .catch(() => {});
  // Without an API key nothing is extracted, so no write happens — which is
  // itself correct. Assert the code never consulted the event's company_id.
  const src = (await import("node:fs")).readFileSync("api/_listeners.js", "utf8");
  const fn = src.slice(src.indexOf("async function mineIqFactsV1"), src.indexOf("export const LISTENERS"));
  ok(!/event\.company_id/.test(fn), "never reads company_id off the event");
  ok(/pub\.company_id/.test(fn), "reads company_id off the publication row");
  ok(captured === null || captured.every((r) => r.company_id === "co-A"), "any write uses the publication's company");
}

// ---- C. idempotency ------------------------------------------------------
console.log("\n=== C. replaying the event writes nothing twice ===");
{
  const db = fakeDb({ rows: { "publications?": PUB, "updates?": UPD, "companies?": CO }, onWrite: () => [] });
  // The claim insert returns [] → another worker (or an earlier delivery) owns
  // this publication, so nothing further is written.
  await mineIqFactsV1({ event_type: "PUBLICATION_PUBLISHED", publication_id: "pub-1" }, db);
  const afterClaim = db.writes.filter((w) => !w.path.startsWith("mineiq_ingestions"));
  ok(afterClaim.length === 0, "a lost claim writes no facts");
  ok(db.writes[0] && db.writes[0].prefer.includes("ignore-duplicates"), "the claim uses ignore-duplicates");
}

// ---- D. scope ------------------------------------------------------------
console.log("\n=== D. only real disclosures are ingested ===");
{
  const db = fakeDb({ rows: { "publications?": [{ ...PUB[0], destination_id: "linkedin" }] } });
  await mineIqFactsV1({ event_type: "PUBLICATION_PUBLISHED", publication_id: "pub-1" }, db);
  ok(db.writes.length === 0, "a non-profile destination is not a disclosure");
}
{
  const db = fakeDb({ rows: { "publications?": PUB } });
  await mineIqFactsV1({ event_type: "PUBLICATION_UNPUBLISHED", publication_id: "pub-1" }, db);
  ok(db.writes.length === 0, "unpublishing ingests nothing");
}
{
  const db = fakeDb({ rows: { "publications?": PUB, "updates?": [{ body: "   ", detected: {} }], "companies?": CO },
                      onWrite: (p) => (p.startsWith("mineiq_ingestions") ? [{ publication_id: "pub-1" }] : []) });
  await mineIqFactsV1({ event_type: "PUBLICATION_PUBLISHED", publication_id: "pub-1" }, db);
  // The claim row is written first and is expected; no FACTS may be written.
  ok(db.writes.filter((w) => w.path.startsWith("facts")).length === 0, "an empty release body writes no facts");
}

// ---- E. quote is mandatory ----------------------------------------------
console.log("\n=== E. a fact with no quote is dropped ===");
{
  const kept = factRows([{ kind: "capital", subject: "X", data: { v: 1 }, quote: "Real sentence.", confidence: 0.5 }],
    { companyId: "co-A", publicationId: "p" });
  ok(kept.length === 1, "a quoted fact is kept");
  // extractFacts() is what drops unquoted ones; assert the filter exists.
  const src = (await import("node:fs")).readFileSync("api/_mineiq.js", "utf8");
  // Matched against whitespace-collapsed source: the filter is multi-line now,
  // and the assertion is about the RULE, not its formatting.
  const flat = src.replace(/\s+/g, " ");
  ok(/facts\.filter\(\(f\) =>[^)]*f\.quote && String\(f\.quote\)\.trim\(\)/.test(flat),
     "extractFacts drops any fact without a verbatim quote");
  ok(/KINDS\.includes\(f\.kind\)/.test(flat), "and any fact with an unrecognised kind");
  ok(/f\.subject && String\(f\.subject\)\.trim\(\)/.test(flat), "and any fact with no subject");
}

// ---- F. fact identity ----------------------------------------------------
console.log("\n=== F. the upsert key identifies the fact ===");
{
  const a = { kind: "drill_result", subject: "Las Coloradas", data: { hole: "LC-26-020", grade: "12.4 g/t Au" }, quote: "q", confidence: 0.9 };
  const b = { ...a, data: { grade: "12.4 g/t Au", hole: "LC-26-020" } };          // same values, different key order
  const c = { ...a, data: { hole: "LC-26-021", grade: "3.7 g/t Au" } };           // a different hole
  const d = { ...a, subject: "las coloradas " };                                   // same subject, different case

  ok(factKey(a, "pub-1") === factKey(b, "pub-1"), "key ignores object key order");
  ok(factKey(a, "pub-1") === factKey(d, "pub-1"), "key ignores subject case and spacing");
  ok(factKey(a, "pub-1") !== factKey(c, "pub-1"), "two holes in one release are two facts");
  ok(factKey(a, "pub-1") !== factKey(a, "pub-2"), "the same hole in a later release is a new disclosure");

  // Provenance must not perturb the identity, or a re-extraction would duplicate.
  const withProv = { ...a, data: { ...a.data, publication_id: "pub-1", disclosed_on: "2026-09-22", status: "historical" } };
  ok(factKey(a, "pub-1") === factKey(withProv, "pub-1"), "provenance fields are excluded from the key");
}

// ---- G. supersession rules ----------------------------------------------
console.log("\n=== G. only current state is superseded ===");
{
  const shares  = { kind: "capital", subject: "Kingsmen", data: { shares_outstanding: "38.2M" }, quote: "q", confidence: 0.9, current: true };
  const shares2 = { kind: "capital", subject: "Kingsmen", data: { shares_outstanding: "41.0M" }, quote: "q", confidence: 0.9, current: true };
  const role    = { kind: "person", subject: "Scott Emerson", data: { role: "CEO" }, quote: "q", confidence: 0.9, current: true };
  const drill   = { kind: "drill_result", subject: "Las Coloradas", data: { hole: "LC-26-020" }, quote: "q", confidence: 0.9, current: false };
  const fin     = { kind: "financing", subject: "Kingsmen", data: { amount: "$8.2M" }, quote: "q", confidence: 0.9, current: true };
  const vague   = { kind: "capital", subject: "Kingsmen", data: { shares_outstanding: "38.2M" }, quote: "q", confidence: 0.9 };

  ok(factMeasure(shares) === factMeasure(shares2), "two share counts share a measure → chainable");
  ok(factMeasure(shares) !== null, "a current share count has a measure");
  ok(factMeasure(role) !== null, "a current role has a measure");
  ok(factMeasure(drill) === null, "a DRILL RESULT is never superseded");
  ok(factMeasure(fin) === null, "a FINANCING event is never superseded");
  ok(factMeasure(vague) === null, "a fact not explicitly marked current is left alone");
  ok(factMeasure({ ...shares, subject: "" }) === null, "no subject → ambiguous → not chained");
  ok(factMeasure({ ...shares, data: {} }) === null, "no value shape → ambiguous → not chained");
  ok(factMeasure(shares) !== factMeasure({ ...shares, data: { cash: "$4M" } }), "different quantities are different measures");
}

// ---- H. supersession only moves forward in time --------------------------
console.log("\n=== H. an older release cannot roll knowledge backwards ===");
{
  const prior = { id: "old-1", measure: "capital|kingsmen|shares_outstanding", data: { disclosed_on: "2026-12-01" } };
  const patches = [];
  const db = fakeDb({
    rows: {
      "publications?": PUB,
      "updates?": [{ body: "38.2 million shares outstanding.", detected: { headline: "h" }, published_on: "2026-09-22" }],
      "companies?": CO,
      "facts?company_id=eq.co-A&superseded_by=is.null": [prior],
    },
    onWrite: (path, o) => {
      if (path.startsWith("mineiq_ingestions")) return [{ publication_id: "pub-1" }];
      if (path.startsWith("facts?id=eq.")) { patches.push({ path, body: o.body }); return []; }
      if (path.startsWith("facts")) {
        return [{ id: "new-1", measure: "capital|kingsmen|shares_outstanding", data: { disclosed_on: "2026-09-22" } }];
      }
      return [];
    },
  });
  await mineIqFactsV1({ event_type: "PUBLICATION_PUBLISHED", publication_id: "pub-1" }, db);
  // No API key → extraction returns [] → nothing written. Assert the RULE is in
  // the code rather than asserting on a run that cannot happen here.
  const src = (await import("node:fs")).readFileSync("api/_listeners.js", "utf8");
  const fn = src.slice(src.indexOf("async function mineIqFactsV1"), src.indexOf("async function devicePushV1"));
  ok(/newWhen <= oldWhen/.test(fn), "a fact disclosed no later than the prior one does not supersede it");
  ok(/superseded_by=is\.null/.test(fn), "the supersede patch is itself guarded against races");
  ok(/on_conflict=company_id,fact_key/.test(fn), "facts are written with a conflict-safe upsert");
  ok(/mineiq_ingestions\?on_conflict=publication_id/.test(fn), "the publication is claimed before any extraction");
  ok(fn.indexOf("mineiq_ingestions?on_conflict") < fn.indexOf("extractFacts"), "the claim happens BEFORE the model call");
}

// ---- I. device push ------------------------------------------------------
console.log("\n=== I. device push is queued, deduped and preference-aware ===");
{
  const POST = [{ id: "post-1", company_id: "co-A", title: "Kingsmen Intersects 12.4 g/t Au", materiality_score: 70, removed_at: null }];
  let queued = null;
  const db = fakeDb({
    rows: {
      "posts?": POST,
      "companies?": [{ name: "Kingsmen Resources Ltd.", slug: "kingsmen" }],
      "company_follows?": [{ user_id: "u1" }, { user_id: "u2" }, { user_id: "u3" }],
      "notification_prefs?": [
        { user_id: "u2", company_id: "co-A", muted: true, min_materiality: 0 },      // muted this company
        { user_id: "u3", company_id: null, muted: false, min_materiality: 90 },      // wants only the big ones
      ],
      "push_tokens?": [{ user_id: "u1", token: "tok-1", platform: "ios" }],
    },
    onWrite: (p, o) => { if (p.startsWith("notification_outbox")) queued = o; return []; },
  });
  await devicePushV1({ event_type: "PUBLICATION_PUBLISHED", publication_id: "pub-1" }, db);

  ok(queued !== null, "queues to the existing notification_outbox");
  ok(queued.prefer.includes("ignore-duplicates"), "replay cannot buzz a phone twice");
  ok(queued.body.length === 1 && queued.body[0].user_id === "u1", "muted and below-threshold followers are excluded");
  ok(queued.body[0].post_id === "post-1" && queued.body[0].news_item_id === null, "queued against the post, not a news item");
  ok(queued.body[0].data.deep_link === "/p/post-1", "deep-links to the published release");
  ok(/Kingsmen Resources Ltd\. published a new update/.test(queued.body[0].title), "names the company in the title");
}
{
  const db = fakeDb({ rows: { "posts?": [] } });
  await devicePushV1({ event_type: "PUBLICATION_PUBLISHED", publication_id: "pub-x" }, db);
  ok(db.writes.length === 0, "no post yet → nothing queued, retried on the next drain");
}
{
  const db = fakeDb({ rows: { "posts?": [{ id: "p", company_id: "co-A", removed_at: "2026-09-30T00:00:00Z" }] } });
  await devicePushV1({ event_type: "PUBLICATION_PUBLISHED", publication_id: "pub-1" }, db);
  ok(db.writes.length === 0, "a removed post is not pushed");
}

// ---- J. Pro Profile timeline --------------------------------------------
console.log("\n=== J. the timeline entry is correct, referential and stable ===");
{
  const PUBP = [{ id: "pub-1", company_id: "co-A", update_id: "upd-1", destination_id: "passport",
                  status: "published", content: { headline: "Kingsmen Intersects 12.4 g/t Au" },
                  published_at: "2026-09-30T12:00:00Z" }];
  let entry = null;
  const db = fakeDb({
    rows: {
      "publications?": PUBP,
      // The release's OWN date — months before it was uploaded.
      "updates?": [{ published_on: "2026-03-04", detected: { summary: "Assays from four holes.", category: "Drilling" } }],
      "posts?": [{ id: "post-1" }],
    },
    onWrite: (p, o) => { if (p === "rpc:upsert_timeline_entry") entry = o.body.p_entry; return []; },
  });
  await profileTimelineV1({ event_type: "PUBLICATION_PUBLISHED", publication_id: "pub-1" }, db);

  ok(entry !== null, "writes a timeline entry");
  ok(entry.date === "2026-03-04", "uses the release's actual date, not the upload date");
  ok(entry.key === "pub:pub-1", "keyed on the publication, so a revision updates it in place");
  ok(entry.publication_id === "pub-1" && entry.post_id === "post-1", "references the canonical ids");
  ok(!("body" in entry), "does NOT copy the release body into the profile");
  ok(entry.summary === "Assays from four holes.", "carries the MineEx summary");
  ok(db.writes.some((w) => w.path === "rpc:upsert_timeline_entry"), "goes through the atomic RPC, not a profile read-modify-write");
}
{
  // A revision must reuse the same key and keep the original date.
  const db = fakeDb({
    rows: {
      "publications?": [{ id: "pub-1", company_id: "co-A", update_id: "u", destination_id: "passport",
                          status: "published", content: { headline: "Corrected headline" }, published_at: "2026-09-30T12:00:00Z" }],
      "updates?": [{ published_on: "2026-03-04", detected: {} }],
      "posts?": [{ id: "post-1" }],
    },
    onWrite: () => [],
  });
  await profileTimelineV1({ event_type: "PUBLICATION_REVISED", publication_id: "pub-1", payload: { revision: 2 } }, db);
  const e = db.writes.find((w) => w.path === "rpc:upsert_timeline_entry").body.p_entry;
  ok(e.key === "pub:pub-1", "a revision reuses the key → updates in place, no second entry");
  ok(e.date === "2026-03-04", "a revision never moves the chronological position");
  ok(e.title === "Corrected headline", "the corrected headline is reflected");
}
{
  const db = fakeDb({ rows: { "publications?": [{ id: "p", company_id: "c", destination_id: "passport", status: "published",
                                                  content: { post_type: "media" } }] } });
  await profileTimelineV1({ event_type: "PUBLICATION_PUBLISHED", publication_id: "p" }, db);
  ok(db.writes.length === 0, "a media post is not a press release and stays out of the PR history");
}

// ---- K. a revision must never notify -------------------------------------
console.log("\n=== K. corrections do not reach the notification listeners ===");
{
  const db = fakeDb({ rows: { "posts?": [{ id: "post-1", company_id: "co-A", title: "t", materiality_score: 90 }],
                              "companies?": CO, "company_follows?": [{ user_id: "u1" }],
                              "notification_prefs?": [], "push_tokens?": [{ user_id: "u1", token: "tok" }] } });
  await devicePushV1({ event_type: "PUBLICATION_REVISED", publication_id: "pub-1" }, db);
  ok(db.writes.length === 0, "device push ignores PUBLICATION_REVISED");
}
{
  const db = fakeDb({ rows: { "posts?": [{ id: "post-1", company_id: "co-A", title: "t", post_type: "press_release" }],
                              "companies?": CO, "company_follows?": [{ user_id: "u1" }], "notification_prefs?": [] } });
  await inAppNotificationsV1({ event_type: "PUBLICATION_REVISED", publication_id: "pub-1" }, db);
  ok(db.writes.length === 0, "in-app notifications ignore PUBLICATION_REVISED");
}
{
  // Belt and braces: the DATABASE must not deliver the event to them at all.
  const sql = (await import("node:fs")).readFileSync("supabase/migrations/0051_release_revisions_and_timeline.sql", "utf8");
  const revisedSubs = sql.slice(sql.indexOf("'PUBLICATION_REVISED'"));
  const block = sql.slice(sql.indexOf("insert into public.listener_subscriptions (listener, event_type) values", sql.indexOf("events_type_chk")));
  const firstBlock = block.slice(0, block.indexOf("on conflict"));
  ok(!/in_app_notifications_v1/.test(firstBlock), "in_app_notifications_v1 is NOT subscribed to PUBLICATION_REVISED");
  ok(!/device_push_v1/.test(firstBlock), "device_push_v1 is NOT subscribed to PUBLICATION_REVISED");
  ok(/feed_projection_v1/.test(firstBlock) && /profile_timeline_v1/.test(firstBlock) && /mineiq_facts_v1/.test(firstBlock),
     "the three correcting listeners ARE subscribed");
  ok(/\('mineiq_facts_v1',\s+'PUBLICATION_PUBLISHED'\)/.test(sql), "Phase B's missing subscriptions are backfilled");
  // device_push_v1 is deliberately NOT subscribed by 0051 — see the Phase 1
  // audit. Subscribing it from a schema migration would mean applying a
  // migration starts sending real notifications. It lives in 0055, applied
  // only when push is turned on on purpose.
  ok(!/\('device_push_v1',\s+'PUBLICATION/.test(sql), "0051 does NOT subscribe device_push_v1 (0055 does, deliberately)");
}

// ---- L. revision-aware fact identity -------------------------------------
console.log("\n=== L. facts are traceable to the exact revision ===");
{
  const f = { kind: "drill_result", subject: "Las Coloradas", data: { hole: "LC-26-020" }, quote: "q", confidence: 0.9 };
  ok(factKey({ ...f, __revision: 1 }, "pub-1") !== factKey({ ...f, __revision: 2 }, "pub-1"),
     "the same fact in revision 2 is a distinct row, not an overwrite");
  ok(contentKey(f) === contentKey({ ...f, __revision: 2 }),
     "content_key ignores the revision, so revisions can be diffed");
  const r1 = factRows([f], { companyId: "co-A", publicationId: "pub-1", revision: 1, revisionId: "rev-1" })[0];
  const r2 = factRows([f], { companyId: "co-A", publicationId: "pub-1", revision: 2, revisionId: "rev-2" })[0];
  ok(r1.revision_id === "rev-1" && r2.revision_id === "rev-2", "each row points at its own revision");
  ok(r1.content_key === r2.content_key, "an unchanged claim keeps one content_key across revisions");
  ok(r1.data.revision === 1 && r2.data.revision === 2, "the revision is recorded in provenance");
}
{
  const src = (await import("node:fs")).readFileSync("api/_listeners.js", "utf8");
  const fn = src.slice(src.indexOf("async function mineIqFactsV1"), src.indexOf("async function devicePushV1"));
  ok(/on_conflict=publication_id,revision/.test(fn), "each revision is claimed separately → a correction is reconciled once");
  ok(/release_revisions\?id=eq/.test(fn), "a correction reads the REVISION's body, not the working draft");
  ok(/nowKeys\.has\(f\.content_key\)/.test(fn), "facts are diffed by content_key across revisions");
  ok(/retired/.test(fn), "claims removed by a correction are retired rather than left current");
}

console.log(`\nmineiq: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
