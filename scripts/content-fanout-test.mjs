// a15 regression tests -- one published record, fanned out to the website and
// Conference Mode with per-destination delivery.   node scripts/content-fanout-test.mjs
//
// OFFLINE. Runs the real site_content_v1 / conference_content_v1 listeners from
// api/_listeners.js against an in-memory model of 0088's
// deliver_destination_content (same version rule), then the two readers
// (api/_siteContent.js, api/conference-config.js) with PostgREST mocked. The
// SQL itself (version guard, RLS, anon booth read, subscriptions) is proven on
// staging, rolled back, by scripts/content-fanout-0088-check.mjs; a live
// publish -> dispatch -> website + booth run is scripts/content-fanout-live-test.mjs.

import fs from "node:fs";

process.env.VITE_SUPABASE_URL = "https://offline-test.supabase.co";   // never contacted: fetch is stubbed
process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-test-service";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const L = await import("../api/_listeners.js");
const CO = "aaaaaaaa-0000-0000-0000-000000000001";
const PUB = "bbbbbbbb-0000-0000-0000-000000000002";

// In-memory database: publications + destination_content with 0088's rule.
function makeDb() {
  const st = { pubs: {}, dest: {}, rpcFail: false, readFail: false, calls: [] };
  const db = {
    st,
    async getRows(path) {
      if (st.readFail) throw new Error("read failed (503) publications");
      const id = (path.match(/id=eq\.([^&]+)/) || [])[1];
      return st.pubs[id] ? [{ ...st.pubs[id] }] : [];
    },
    async write() { throw new Error("fan-out listeners never write tables directly"); },
    async rpc(fn, body) {
      st.calls.push({ fn, body });
      if (st.rpcFail) return { ok: false, status: 503, json: async () => null };
      if (fn !== "deliver_destination_content") throw new Error(fn);
      const k = `${body.p_destination}|${body.p_publication}`;
      const cur = st.dest[k];
      let applied = false;
      if (body.p_removed) {
        if (cur && cur.version <= body.p_version) { cur.removed_at = cur.removed_at || "now"; cur.version = body.p_version; applied = true; }
      } else if (!cur || cur.version <= body.p_version) {
        st.dest[k] = { ...body.p_row, company_id: body.p_company, version: body.p_version, removed_at: null };
        applied = true;
      }
      return { ok: true, status: 200, json: async () => ({ applied }) };
    },
  };
  return db;
}
const ev = (type, seq) => ({ id: `e-${type}-${seq}`, event_type: type, publication_id: PUB, company_id: CO, payload: seq == null ? {} : { publish_seq: seq }, occurred_at: new Date().toISOString() });
const PUBROW = (over = {}) => ({ id: PUB, company_id: CO, destination_id: "passport", status: "published", publish_seq: 1, published_at: "2026-10-31T10:00:00Z",
  content: { headline: "Drill hole KR-12 hits 410 g/t Ag", body: "Assays…", category: "Drilling", thumbnail_url: "https://x/t.jpg", source_url: "https://x/pr" }, ...over });

console.log("\n  REGISTRATION");
{
  const names = L.LISTENERS.map((l) => l.name);
  ok(names.includes("site_content_v1") && names.includes("conference_content_v1"), "website and conference listeners registered with the dispatcher");
  ok(names.slice(0, 5).join() === "feed_projection_v1,in_app_notifications_v1,mineiq_facts_v1,device_push_v1,profile_timeline_v1", "existing listeners unchanged, in the same order");
  const sql = fs.readFileSync("supabase/migrations/0088_content_fanout.sql", "utf8");
  ok(["site_content_v1", "conference_content_v1"].every((n) => sql.includes(`'${n}'`)) && L.FANOUT_EVENTS.every((t) => sql.includes(`'${t}'`)), "0088 subscribes exactly these listeners to these events");
  ok(/active_from\)[\s\S]*now\(\)/.test(sql), "subscriptions start now (no historical replay)");
}

for (const [name, handle, dest] of [["site_content_v1", L.siteContentV1, "website"], ["conference_content_v1", L.conferenceContentV1, "conference"]]) {
  console.log(`\n  ${name} -> ${dest}`);
  const db = makeDb(); const k = `${dest}|${PUB}`;
  db.st.pubs[PUB] = PUBROW();
  let r = await handle(ev("PUBLICATION_PUBLISHED", 1), db);
  ok(r === undefined && db.st.dest[k] && db.st.dest[k].title.startsWith("Drill hole") && db.st.dest[k].version === 1 && db.st.calls[0].body.p_destination === dest,
    "publish -> delivered (title, version 1)", JSON.stringify(db.st.dest[k]));
  ok(db.st.dest[k].image_url === "https://x/t.jpg" && db.st.dest[k].category === "Drilling" && db.st.dest[k].source_url === "https://x/pr", "the record's own fields, nothing derived");
  await handle(ev("PUBLICATION_PUBLISHED", 1), db);
  ok(Object.keys(db.st.dest).length === 1, "replaying the same event -> still one row (idempotent)");
  db.st.pubs[PUB] = PUBROW({ content: { ...PUBROW().content, headline: "Corrected: KR-12 hits 401 g/t Ag" } });
  await handle(ev("PUBLICATION_REVISED", null), db);
  ok(db.st.dest[k].title.startsWith("Corrected") && db.st.dest[k].version === 1, "a correction (same publish_seq) overwrites the delivered copy");
  db.st.pubs[PUB] = PUBROW({ status: "draft", publish_seq: 2 });
  await handle(ev("PUBLICATION_UNPUBLISHED", 2), db);
  ok(db.st.dest[k].removed_at && db.st.dest[k].version === 2, "unpublish -> removed (version 2)");
  db.st.pubs[PUB] = PUBROW({ status: "published", publish_seq: 1 });
  r = await handle(ev("PUBLICATION_PUBLISHED", 1), db);
  ok(db.st.dest[k].removed_at && r && r.skipped === "newer version already delivered", "a late retry of the OLD publish cannot resurrect it (version guard)", JSON.stringify(r));
  db.st.pubs[PUB] = PUBROW({ status: "published", publish_seq: 3 });
  r = await handle(ev("PUBLICATION_UNPUBLISHED", 2), db);
  ok(r && r.skipped === "published again", "a late unpublish after a re-publish -> skipped (current status wins)");
  await handle(ev("PUBLICATION_PUBLISHED", 3), db);
  ok(!db.st.dest[k].removed_at && db.st.dest[k].version === 3, "re-publish (version 3) -> visible again");
  db.st.pubs[PUB] = PUBROW({ status: "draft", publish_seq: 3 });
  r = await handle(ev("PUBLICATION_PUBLISHED", 3), db);
  ok(r && r.skipped === "not published", "a publish event for a publication no longer published -> skipped");
  db.st.pubs[PUB] = PUBROW({ destination_id: "linkedin" });
  r = await handle(ev("PUBLICATION_PUBLISHED", 4), db);
  ok(r && r.skipped === "not a profile publication", "a LinkedIn/X publication is not fanned out");
  delete db.st.pubs[PUB];
  r = await handle(ev("PUBLICATION_PUBLISHED", 4), db);
  ok(r && r.skipped === "publication gone", "publication deleted -> skipped, completed");
  db.st.pubs[PUB] = PUBROW({ publish_seq: 5 });
  db.st.rpcFail = true;
  let threw = null; try { await handle(ev("PUBLICATION_PUBLISHED", 5), db); } catch (e) { threw = e; }
  ok(threw && /delivery failed \(503\)/.test(threw.message), "a failed write THROWS -> the dispatcher retries with backoff (not silently completed)");
  db.st.rpcFail = false; db.st.readFail = true; threw = null;
  try { await handle(ev("PUBLICATION_PUBLISHED", 5), db); } catch (e) { threw = e; }
  ok(!!threw, "a failed read THROWS -> retried");
}

console.log("\n  INDEPENDENT DESTINATIONS");
{
  const db = makeDb(); db.st.pubs[PUB] = PUBROW();
  db.st.rpcFail = true;
  let siteFailed = false; try { await L.siteContentV1(ev("PUBLICATION_PUBLISHED", 1), db); } catch { siteFailed = true; }
  db.st.rpcFail = false;
  await L.conferenceContentV1(ev("PUBLICATION_PUBLISHED", 1), db);
  ok(siteFailed && db.st.dest[`conference|${PUB}`] && !db.st.dest[`website|${PUB}`], "one destination failing does not hold up another (each has its own delivery row)");
  const src = fs.readFileSync("api/_listeners.js", "utf8");
  ok(!/db\.getJson\(/.test(src.split("export const LISTENERS")[0]), "fan-out listeners use the strict reader");
}

console.log("\n  READERS");
{
  const DEST = [{ publication_id: PUB, post_type: "press_release", title: "KR-12", summary: "s", category: "Drilling", image_url: null, source_url: null, published_at: "2026-10-31T10:00:00Z", version: 3, delivered_at: "2026-10-31T10:00:05Z" }];
  let destStatus = 200;
  globalThis.fetch = async (url, o = {}) => {
    const u = String(url);
    const J = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) });
    if (u.includes("/rest/v1/companies?")) return J(200, [{ id: CO, slug: "co-a", name: "Co A", status: "published", profile: {}, updated_at: "2026-10-01T00:00:00Z" }]);
    if (u.includes("/rest/v1/posts?")) return J(200, []);
    if (u.includes("/rest/v1/media_assets?")) return J(200, []);
    if (u.includes("/rest/v1/company_blueprints?")) return J(200, []);
    if (u.includes("/rest/v1/destination_content?")) return J(destStatus, destStatus === 200 ? DEST : { message: "x" });
    if (u.endsWith("/rpc/conference_booth_config")) return J(200, [{ slug: "co-a", studio: { template: "vista" }, version: 2, published_at: null }]);
    if (u.endsWith("/rpc/conference_booth_releases")) return J(destStatus, destStatus === 200 ? DEST : { message: "x" });
    throw new Error(`unexpected ${u}`);
  };
  const { buildSiteContent } = await import("../api/_siteContent.js");
  let out = await buildSiteContent(CO, { draft: false });
  ok(out.ok && out.body.content.releases.length === 1 && out.body.content.releases[0].id === PUB && out.body.content.releases[0].version === 3, "website reads its delivered copy (content.releases)");
  ok(out.body.version.releases === "2026-10-31T10:00:05Z", "version.releases = last delivery, so a site can tell something changed");
  const { default: handler } = await import("../api/conference-config.js");
  const call = async () => { const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, setHeader() {} }; await handler({ method: "GET", query: { c: "co-a" } }, res); return res; };
  let r = await call();
  ok(r.code === 200 && r.body.releases.length === 1 && r.body.releases[0].title === "KR-12" && r.body.studio.template === "vista", "booth config carries the delivered releases with the look");
  const Lc = await import("../src/conference/liveConfig.js");
  const store = new Map(); const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const rec = { slug: "co-a", studio: { template: "vista" }, version: 2, publishedAt: null, releases: Lc.normaliseReleases(r.body.releases) };
  let a = Lc.applyFetched("co-a", null, { status: "found", record: rec }, storage);
  ok(a.changed && Lc.readCached("co-a", storage).releases.length === 1, "the booth caches releases with the look (available offline)");
  a = Lc.applyFetched("co-a", Lc.readCached("co-a", storage), { status: "found", record: { ...rec, releases: [] } }, storage);
  ok(a.changed && Lc.readCached("co-a", storage).releases.length === 0, "a release removed from the booth -> the cache follows, even with the same look version");
  destStatus = 404;
  out = await buildSiteContent(CO, { draft: false });
  r = await call();
  ok(out.ok && out.body.content.releases === null && r.code === 200 && r.body.releases === null, "0088 not applied -> releases null; site content and booth look still served");
}

console.log("\n  BOOTH RENDERING (liveConfig.withReleases -> the templates' milestones band)");
{
  const Lc = await import("../src/conference/liveConfig.js");
  const NOW = Date.parse("2026-10-31T12:00:00Z");
  const profile = { name: "Co A", timeline: [{ date: "2025", headline: "Option to acquire 100% of Almoloya", status: "COMPLETE" }, { date: "2026", headline: "Phase 2 drilling", status: "PLANNED" }] };
  const rel = (title, publishedAt, summary = "") => ({ id: title, title, summary, publishedAt });
  const R = [rel("Old news", "2025-01-01T00:00:00Z"), rel("KR-12 hits 410 g/t Ag", "2026-10-30T00:00:00Z", "Assays from hole KR-12."), rel("Financing closed", "2026-10-01T00:00:00Z"), rel("Third", "2026-09-01T00:00:00Z"), rel("Option to acquire 100% of Almoloya", "2026-10-29T00:00:00Z")];
  const out = Lc.withReleases(profile, R, { now: NOW });
  ok(out.timeline.length === 4 && out.timeline[0].headline === "KR-12 hits 410 g/t Ag" && out.timeline[1].headline === "Financing closed",
    "the 2 newest recent releases lead the milestones band, newest first", JSON.stringify(out.timeline.map((t) => t.headline)));
  ok(out.timeline[0].status === "NEWS" && out.timeline[0].date === "2026-10-30" && out.timeline[0].whyItMatters === "Assays from hole KR-12.", "shaped as a timeline entry: date, headline, summary, NEWS");
  ok(out.timeline.slice(2).map((t) => t.headline).join("|") === profile.timeline.map((t) => t.headline).join("|"), "the package's milestones follow, untouched and in order");
  ok(!out.timeline.slice(0, 2).some((t) => t.headline === "Old news" || t.headline.startsWith("Option")), "older than 180 days, or already a milestone -> not added");
  ok(profile.timeline.length === 2, "the compiled package object is not mutated");
  ok(Lc.withReleases(profile, null) === profile && Lc.withReleases(profile, []) === profile, "no releases (0088 unapplied, offline, none delivered) -> the SAME profile: renders as before");
  ok(Lc.withReleases(profile, R, { now: NOW, params: new URLSearchParams("news=0") }) === profile, "&news=0 turns it off");
  ok(Lc.withReleases(null, R) === null && Lc.withReleases({ name: "x" }, R, { now: NOW }).timeline.length === 2, "no profile -> null; a profile without a timeline gets one");
  ok(Lc.withReleases(profile, [{ title: 5 }, null, { title: "x", publishedAt: "not a date" }], { now: NOW }) === profile, "malformed releases are ignored, never thrown");
  const booth = fs.readFileSync("src/aiBrief/conferenceV3/ConferenceV3Booth.jsx", "utf8");
  ok(/profile=\{shownProfile\}/.test(booth) && /useMemo\(\(\) => withReleases\(profile, published && published\.releases/.test(booth), "the booth renders the merged profile, memoised on the record");
}

console.log("\n  PORTAL READ-BACK (src/lib/destinations.js)");
{
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  store.set("pp.session", JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.x", refresh_token: "r", expires_at: Date.now() + 3600e3, user: { id: "u1" } }));
  const ROWS = [{ publication_id: "p2", title: "Newest", published_at: "2026-10-30T00:00:00Z" }, { publication_id: "p1", title: "Older", published_at: "2026-10-01T00:00:00Z" }, { publication_id: "p0", title: "Ancient", published_at: "2025-01-01T00:00:00Z" }];
  let mode = "ok", seenUrl = "";
  globalThis.fetch = async (u) => {
    seenUrl = String(u);
    if (mode === "throw") throw new TypeError("network");
    return { status: mode === "ok" ? 200 : 404, ok: mode === "ok", json: async () => ROWS };
  };
  const D = await import("../src/lib/destinations.js");
  const rows = await D.listDelivered(CO, "conference");
  ok(rows && rows.length === 3 && /destination=eq\.conference/.test(seenUrl) && /removed_at=is\.null/.test(seenUrl) && /company_id=eq\./.test(seenUrl), "reads the company's live conference copies (RLS-scoped, read only)");
  ok((await D.listDelivered(CO, "linkedin")) === null && (await D.listDelivered(null, "website")) === null, "unknown destination / no company -> no request, null");
  mode = "404"; ok((await D.listDelivered(CO, "website")) === null, "0088 not applied -> null (the page hides the section)");
  mode = "throw"; ok((await D.listDelivered(CO, "website")) === null, "network error -> null, no throw");
  const NOW = Date.parse("2026-10-31T12:00:00Z");
  const portal = D.onBooth(rows, { now: NOW }).map((r) => r.publication_id);
  const Lc = await import("../src/conference/liveConfig.js");
  const booth = Lc.withReleases({ timeline: [] }, rows.map((r) => ({ id: r.publication_id, title: r.title, publishedAt: r.published_at })), { now: NOW }).timeline.map((t) => t.headline);
  ok(JSON.stringify(portal) === JSON.stringify(["p2", "p1"]) && JSON.stringify(booth) === JSON.stringify(["Newest", "Older"]), "the portal's 'On screen' marks exactly what the booth shows (same rule)");
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
