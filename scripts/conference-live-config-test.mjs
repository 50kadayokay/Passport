// a17 regression tests -- the booth's published look, offline-first.
//   node scripts/conference-live-config-test.mjs
//
// OFFLINE. Runs the real src/conference/liveConfig.js and api/conference-config.js
// with localStorage and the network stubbed. The database half (migration 0085:
// RLS, the normalising trigger, the anon read function) is proven against
// staging, rolled back, by scripts/conference-booth-0085-check.mjs.

const store = new Map();
const storage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.localStorage = storage;

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const L = await import("../src/conference/liveConfig.js");
const { CONFERENCE_COMPANIES } = await import("../src/conference/registry.js").catch(() => ({ CONFERENCE_COMPANIES: null }));

const P = (q) => new URLSearchParams(q);
const PKG = { template: "terminal", theme: "obsidian", accent: "" };
const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

console.log("\n  RESOLUTION ORDER: URL params > published > package > defaults");
{
  const r0 = L.resolveStudio({ params: P(""), record: null, compiled: PKG });
  ok(r0.template === "terminal" && r0.theme === "obsidian" && r0.accent === "" && r0.source === "package",
    "no published record -> exactly the compiled package (today's behaviour)", JSON.stringify(r0));
  const r1 = L.resolveStudio({ params: P(""), record: null, compiled: {} });
  ok(r1.template === "monolith" && r1.theme === "obsidian" && r1.source === "default", "no package look -> booth defaults");
  const rec = { slug: "kingsmen-resources", studio: { template: "vista", theme: "ivory", accent: "#2fb37a" }, version: 3 };
  const r2 = L.resolveStudio({ params: P(""), record: rec, compiled: PKG });
  ok(r2.template === "vista" && r2.theme === "ivory" && r2.accent === "#2fb37a" && r2.source === "published" && r2.version === 3,
    "published record overrides the package", JSON.stringify(r2));
  const r3 = L.resolveStudio({ params: P("t=keynote&theme=obsidian&accent=c9a86a"), record: rec, compiled: PKG });
  ok(r3.template === "keynote" && r3.theme === "obsidian" && r3.accent === "#c9a86a", "URL params still win (A/B on a device)");
  const r4 = L.resolveStudio({ params: P(""), record: { ...rec, studio: { template: "vista", theme: "ivory", accent: "" } }, compiled: { ...PKG, accent: "#ff0000" } });
  ok(r4.accent === "", "a published empty accent means the theme default, not the package's accent");
}

console.log("\n  NORMALISATION: only three short keys survive");
{
  const n = L.normaliseStudio({ template: "vista", theme: "ivory", accent: "#abc", evil: "<script>", profile: { x: 1 } });
  ok(JSON.stringify(n) === JSON.stringify({ template: "vista", theme: "ivory", accent: "#abc" }), "unknown keys dropped", JSON.stringify(n));
  ok(!("accent" in L.normaliseStudio({ accent: "red; background:url(x)" })), "a non-hex accent is dropped");
  ok(!("template" in L.normaliseStudio({ template: "x".repeat(41) })), "an over-long value is dropped");
  ok(JSON.stringify(L.normaliseStudio(null)) === "{}" && JSON.stringify(L.normaliseStudio("str")) === "{}", "garbage -> empty look");
}

console.log("\n  NETWORK: never throws, never blocks");
{
  const slug = "kingsmen-resources";
  let url = "";
  const found = await L.fetchPublished(slug, { fetchImpl: async (u) => { url = u; return json(200, { slug, studio: { template: "vista", theme: "ivory", accent: "", extra: 1 }, version: 2, publishedAt: "2026-10-31T00:00:00Z" }); } });
  ok(found.status === "found" && found.record.version === 2 && !("extra" in found.record.studio), "200 -> found, normalised");
  ok(url === "/api/conference-config?c=kingsmen-resources", "asks the booth's own API, by slug", url);
  ok((await L.fetchPublished(slug, { fetchImpl: async () => json(204, null) })).status === "none", "204 -> none");
  ok((await L.fetchPublished(slug, { fetchImpl: async () => json(503, {}) })).status === "unavailable", "503 (0085 unapplied) -> unavailable");
  ok((await L.fetchPublished(slug, { fetchImpl: async () => { throw new TypeError("offline"); } })).status === "unavailable", "network error -> unavailable");
  ok((await L.fetchPublished(slug, { fetchImpl: async () => json(200, { slug: "other-co", studio: {}, version: 1 }) })).status === "unavailable", "a record for another slug is refused");
  ok((await L.fetchPublished(slug, { fetchImpl: async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError("html"); } }) })).status === "unavailable", "non-JSON (an HTML fallback page) -> unavailable");
  const t0 = Date.now();
  const hung = await L.fetchPublished(slug, { timeoutMs: 80, fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(new Error("aborted")))) });
  ok(hung.status === "unavailable" && Date.now() - t0 < 1000, `a hung request times out (${Date.now() - t0} ms)`);
  ok((await L.fetchPublished("", {})).status === "unavailable", "no slug -> no request");
}

console.log("\n  CACHE: offline-first");
{
  store.clear();
  const slug = "kingsmen-resources";
  ok(L.readCached(slug) === null, "fresh device: no cached record -> compiled package");
  const rec = { slug, studio: { template: "vista", theme: "ivory", accent: "" }, version: 2, publishedAt: null };
  let a = L.applyFetched(slug, null, { status: "found", record: rec });
  ok(a.changed && a.record.version === 2 && L.readCached(slug)?.version === 2, "first answer is applied and cached");
  a = L.applyFetched(slug, L.readCached(slug), { status: "unavailable" });
  ok(!a.changed && a.record.version === 2, "offline next launch: cached record kept (booth renders the published look offline)");
  a = L.applyFetched(slug, L.readCached(slug), { status: "found", record: { ...rec } });
  ok(!a.changed, "same version again -> no re-render");
  a = L.applyFetched(slug, L.readCached(slug), { status: "found", record: { ...rec, version: 3, studio: { template: "keynote", theme: "obsidian", accent: "" } } });
  ok(a.changed && L.readCached(slug).studio.template === "keynote", "newer version -> applied and cached");
  a = L.applyFetched(slug, L.readCached(slug), { status: "none" });
  ok(a.changed && a.record === null && L.readCached(slug) === null, "unpublished -> cache cleared, back to the package");
  store.set("mineex.booth.studio.x", "{not json");
  ok(L.readCached("x") === null, "a corrupt cache entry is ignored");
  store.set("mineex.booth.studio.y", JSON.stringify({ ...rec, slug: "z" }));
  ok(L.readCached("y") === null, "a cache entry for another slug is ignored");
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  let threw = false;
  try { L.readCached(slug, broken); L.writeCached(rec, broken); L.clearCached(slug, broken); L.applyFetched(slug, null, { status: "found", record: rec }, broken); } catch { threw = true; }
  ok(!threw, "blocked storage (private mode) never throws");
}

console.log("\n  API ROUTE: /api/conference-config");
{
  process.env.VITE_SUPABASE_URL = "https://offline-test.supabase.co";   // never contacted: fetch is stubbed
  const realFetch = globalThis.fetch;
  let calls = [];
  let reply = () => json(200, []);
  globalThis.fetch = async (u, o) => { calls.push({ u, o }); return reply(u, o); };
  const { default: handler } = await import("../api/conference-config.js");
  const call = async (req) => {
    const res = { code: 0, body: undefined, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, setHeader(k, v) { this.headers[k] = v; } };
    await handler(req, res); return res;
  };
  let r = await call({ method: "POST", query: { c: "kingsmen-resources" } });
  ok(r.code === 405, "POST refused");
  calls = [];
  r = await call({ method: "GET", query: { c: "../../etc" } });
  ok(r.code === 400 && calls.length === 0, "a malformed slug is refused before any request");
  reply = () => json(200, [{ slug: "kingsmen-resources", studio: { template: "vista", theme: "ivory", accent: "", x: "y" }, version: 4, published_at: "2026-10-31T00:00:00Z" }]);
  calls = [];
  r = await call({ method: "GET", query: { c: "Kingsmen-Resources" } });
  ok(r.code === 200 && r.body.version === 4 && r.body.studio.template === "vista" && !("x" in r.body.studio), "published -> 200 with the normalised look", JSON.stringify(r.body));
  const sent = calls[0] || { o: { headers: {} } };
  ok(/\/rest\/v1\/rpc\/conference_booth_config$/.test(sent.u) && JSON.parse(sent.o.body).p_slug === "kingsmen-resources", "reads through conference_booth_config(slug), lower-cased");
  ok(!/service/i.test(JSON.stringify(sent.o.headers)) && sent.o.headers.apikey === sent.o.headers.Authorization.replace("Bearer ", ""), "called with the anon key only (no service role)");
  ok(!("company_id" in r.body) && !("profile" in r.body), "no company id or profile in the public answer");
  reply = () => json(200, []);
  r = await call({ method: "GET", query: { c: "nobody" } });
  ok(r.code === 204, "no published look -> 204 (booth keeps its package)");
  reply = () => json(404, { message: "function not found" });
  r = await call({ method: "GET", query: { c: "kingsmen-resources" } });
  ok(r.code === 503, "0085 unapplied -> 503 (booth keeps its package)");
  reply = () => { throw new TypeError("fetch failed"); };
  r = await call({ method: "GET", query: { c: "kingsmen-resources" } });
  ok(r.code === 503, "Supabase unreachable -> 503");
  globalThis.fetch = realFetch;
}

console.log("\n  COMPILED FALLBACK STAYS");
if (CONFERENCE_COMPANIES) {
  const k = CONFERENCE_COMPANIES["kingsmen-resources"];
  ok(!!k && k.conference && k.conference.studio && k.conference.studio.template === "terminal", "kingsmen-resources compiled package still registered with its Studio look");
} else {
  console.log("  (registry imports bundler-only assets under node; checked by the build instead)");
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
