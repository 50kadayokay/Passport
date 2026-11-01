// a14 regression tests -- what a company's website pulls, and the portal calls
// that change it.   node scripts/site-selection-test.mjs
//
// OFFLINE. Runs the real src/lib/siteSelection.js, api/_siteContent.js (with a
// mocked service-role PostgREST) and src/lib/siteAdmin.js (with a mocked
// user-JWT PostgREST). RLS on company_blueprints / site_credentials is 0068/0076
// and already covered by the tenant-isolation suite; the live round trip
// (portal publish -> /api/site-content) is scripts/site-website-live-test.mjs.

process.env.VITE_SUPABASE_URL = "https://offline-test.supabase.co";   // never contacted: fetch is stubbed
process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-test-service";

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
store.set("pp.session", JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.x", refresh_token: "r", expires_at: Date.now() + 3600e3, user: { id: "u1" } }));

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const S = await import("../src/lib/siteSelection.js");

const WORKING = {
  pages: [{ key: "home", title: "Home", path: "/", sections: ["hero-1", "geo-1", "team-1"] }],
  sections: {
    "hero-1": { type: "hero", values: { heading: "Silver in Chihuahua" } },
    "geo-1": { type: "geo-map", values: {}, hidden: true },
    "team-1": { type: "team", values: {} },
  },
  include: { posts: true, media: false },
};

console.log("\n  SELECTION");
{
  const v = S.visibleOnly(S.selectCopy(WORKING, { draft: true }));
  ok(!("geo-1" in v.sections) && JSON.stringify(v.pages[0].sections) === JSON.stringify(["hero-1", "team-1"]), "a hidden section is dropped, and from the page that referenced it");
  ok(!("hidden" in v.sections["hero-1"]), "the hidden flag itself never reaches the site");
  ok(S.selectCopy({}, { draft: false }).include.posts === true && S.selectCopy({}, { draft: false }).include.media === true, "no choice made -> every feed on (unchanged for existing sites)");
  ok(S.selectCopy(WORKING, { draft: true }).include.media === false, "a feed switched off is off");
  const legacy = S.selectCopy({ pages: WORKING.pages, sections: { "hero-1": WORKING.sections["hero-1"] } }, { draft: false });
  ok(Object.keys(legacy.sections).length === 1 && legacy.publishedAt === null, "a pre-a14 blueprint (no snapshot) serves its working copy when published, as before");
  const pub = S.snapshotForPublish(WORKING, "2026-10-31T12:00:00.000Z");
  ok(pub.published.publishedAt === "2026-10-31T12:00:00.000Z" && pub.sections === WORKING.sections && !S.hasUnpublishedChanges(pub), "publish freezes the working copy; nothing left unpublished");
  const edited = { ...pub, sections: { ...pub.sections, "team-1": { ...pub.sections["team-1"], hidden: true } } };
  ok(S.hasUnpublishedChanges(edited), "hiding a section after publishing -> unpublished changes");
  const servedLive = S.visibleOnly(S.selectCopy(edited, { draft: false }));
  const servedDraft = S.visibleOnly(S.selectCopy(edited, { draft: true }));
  ok("team-1" in servedLive.sections && !("team-1" in servedDraft.sections), "the live site keeps the published copy until the next publish; previews see the change");
  ok(JSON.stringify(S.visibleOnly({ pages: [{ key: "x", sections: ["a"] }], sections: { a: { hidden: true } } }).pages[0].sections) === "[]", "a page whose sections are all hidden stays, empty (routing is the site's)");
  ok(S.selectCopy(null, { draft: true }).pages.length === 0 && S.selectCopy("junk", { draft: false }).sections, "garbage data -> empty, no throw");
}

// ---- mocked PostgREST ------------------------------------------------------
const CO = "aaaaaaaa-0000-0000-0000-000000000001";
let DBROW = null;
const seen = [];
globalThis.fetch = async (url, o = {}) => {
  const u = String(url); const m = (o.method || "GET").toUpperCase();
  seen.push(`${m} ${u.replace("https://offline-test.supabase.co", "")}`);
  const J = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.includes("/rest/v1/companies?")) return J(200, [{ id: CO, slug: "co-a", name: "Co A", status: "published", profile: { name: "Co A" }, updated_at: "2026-10-01T00:00:00Z" }]);
  if (u.includes("/rest/v1/posts?")) return J(200, [{ id: "p1", title: "Drill results", post_type: "press_release" }]);
  if (u.includes("/rest/v1/media_assets?")) return J(200, [{ id: "m1", storage_path: "x.jpg" }]);
  if (u.includes("/rest/v1/company_blueprints?") && m === "GET") {
    if (!DBROW) return J(200, []);
    if (u.includes("status=eq.approved") && DBROW.status !== "approved") return J(200, []);
    return J(200, [DBROW]);
  }
  if (u.includes("/rest/v1/company_blueprints?") && m === "PATCH") {
    const want = decodeURIComponent((u.match(/updated_at=eq\.([^&]+)/) || [])[1] || "");
    if (want !== DBROW.updated_at) return J(200, []);   // compare-and-set lost
    DBROW = { ...DBROW, ...JSON.parse(o.body) };
    return J(200, [DBROW]);
  }
  if (u.includes("/rest/v1/site_credentials?") && m === "GET") return J(200, [{ id: "k1", kind: "site", label: "prod", revoked_at: null }]);
  if (u.includes("/rest/v1/site_credentials?") && m === "PATCH") return J(200, [{ id: "k1", kind: "site", label: "prod", revoked_at: "2026-10-31T00:00:00Z" }]);
  throw new Error(`unexpected fetch ${m} ${u}`);
};

console.log("\n  API PAYLOAD (/api/site-content)");
{
  const { buildSiteContent } = await import("../api/_siteContent.js");
  let out = await buildSiteContent(CO, { draft: false });
  ok(out.ok && out.body.content.posts.length === 1 && out.body.content.media.length === 1 && out.body.site.sections && Object.keys(out.body.site.sections).length === 0,
    "no website blueprint -> canonical content only, every feed on (unchanged)");
  DBROW = { id: "bp1", template_key: "kingsmen-site", template_version: "1.4.0", status: "approved", data: { pages: WORKING.pages, sections: { "hero-1": WORKING.sections["hero-1"], "geo-1": { type: "geo-map", values: {} } } }, updated_at: "2026-10-30T00:00:00Z" };
  out = await buildSiteContent(CO, { draft: false });
  ok(out.ok && Object.keys(out.body.site.sections).length === 2 && out.body.content.media.length === 1, "pre-a14 approved blueprint -> served exactly as before");
  DBROW = { ...DBROW, data: S.snapshotForPublish(WORKING, "2026-10-31T00:00:00Z") };
  seen.length = 0;
  out = await buildSiteContent(CO, { draft: false });
  ok(out.ok && !("geo-1" in out.body.site.sections) && "hero-1" in out.body.site.sections, "published: a hidden section is not served");
  ok(out.body.content.media.length === 0 && !seen.some((s) => s.includes("media_assets")), "published: media switched off -> not served, and not even queried");
  ok(out.body.content.posts.length === 1, "published: posts still on");
  DBROW = { ...DBROW, data: { ...DBROW.data, sections: { ...DBROW.data.sections, "team-1": { type: "team", hidden: true } }, include: { posts: false, media: false } } };
  out = await buildSiteContent(CO, { draft: false });
  ok("team-1" in out.body.site.sections && out.body.content.posts.length === 1, "published: unpublished edits do not reach the live site");
  out = await buildSiteContent(CO, { draft: true });
  ok(!("team-1" in out.body.site.sections) && out.body.content.posts.length === 0, "draft token: previews the unpublished edits");
  DBROW = { ...DBROW, status: "draft" };
  out = await buildSiteContent(CO, { draft: false });
  ok(out.ok && Object.keys(out.body.site.sections).length === 0, "blueprint never approved -> published mode serves no site sections (unchanged rule)");
}

console.log("\n  PORTAL CALLS (src/lib/siteAdmin.js)");
{
  const A = await import("../src/lib/siteAdmin.js");
  DBROW = { id: "bp1", company_id: CO, status: "draft", data: { pages: WORKING.pages, sections: WORKING.sections }, manifest: null, updated_at: "2026-10-30T00:00:00Z" };
  const row = await A.loadWebsite(CO);
  ok(row && row.id === "bp1", "loads the company's website blueprint");
  seen.length = 0;
  const saved = await A.saveWebsite(row, { ...row.data, include: { posts: true, media: false } }, { publish: true });
  ok(saved.status === "approved" && saved.data.published && saved.data.published.include.media === false, "publish -> approved, snapshot frozen with the feed choice");
  ok(seen.some((s) => s.startsWith("PATCH") && s.includes("updated_at=eq.")), "the write is compare-and-set on updated_at");
  let conflict = null;
  try { await A.saveWebsite(row, row.data); } catch (e) { conflict = e; }
  ok(conflict instanceof A.ConflictError, "saving over a newer version -> ConflictError (no silent overwrite)");
  DBROW = { id: "bp2", company_id: CO, status: "approved", data: { pages: WORKING.pages, sections: { "hero-1": { type: "hero" } } }, manifest: null, updated_at: "2026-10-30T00:00:00Z" };
  const legacy = await A.loadWebsite(CO);
  const draftSaved = await A.saveWebsite(legacy, { ...legacy.data, sections: { "hero-1": { type: "hero", hidden: true } } });
  const { buildSiteContent } = await import("../api/_siteContent.js");
  const liveAfter = await buildSiteContent(CO, { draft: false });
  ok(draftSaved.data.published && "hero-1" in liveAfter.body.site.sections, "pre-a14 approved site: the first 'Save draft' freezes what is live, so it does not publish");
  const toks = await A.listSiteTokens(CO);
  ok(toks.length === 1 && seen.some((s) => s.includes("site_credentials?") && s.includes("select=id,kind,label,expires_at,revoked_at,last_used_at,created_at")), "tokens listed with explicit columns (token_hash is not readable and never asked for)");
  ok(!seen.some((s) => /token_hash/.test(s)), "token_hash is never requested");
  const rv = await A.revokeSiteToken("k1");
  ok(rv.revoked_at, "revoke returns the revoked row");
  ok(A.tokenState({ revoked_at: null, expires_at: "2000-01-01T00:00:00Z" }) === "expired" && A.tokenState({ revoked_at: "x" }) === "revoked" && A.tokenState({}) === "active", "token state labels");
  ok(A.canManageSite("owner") && A.canManageSite("admin") && !A.canManageSite("editor") && !A.canManageSite("viewer"), "owners and admins manage; others read");
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
