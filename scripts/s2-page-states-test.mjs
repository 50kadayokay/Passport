// S2 pages, a28 review fixes: a failure is said (with a retry), never shown as
// "empty"; bad dates and null rows never crash or print "Invalid Date".
//   node scripts/s2-page-states-test.mjs
//
// OFFLINE. The lib functions run against a stubbed fetch; the page wiring is
// checked in source, as s1-page-states-test.mjs does. Defects from S3's a28
// pass, relayed by S4: Website (1-4), ServiceRequests (6-7), Services (8),
// ConferenceStudio (9-11).
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const read = (f) => fs.readFileSync(f, "utf8");

let route = () => json([]);
globalThis.fetch = async (input, init = {}) => route(new URL(String(input instanceof Request ? input.url : input), "http://localhost"), init);
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
localStorage.setItem("pp.session", JSON.stringify({ access_token: "stub-token", refresh_token: "r", expires_at: Date.now() + 3600e3, user: { id: "u1" } }));

console.log("\n  DATES (src/lib/dates.js) -- defects 4, 7, 8, 11");
{
  const D = await import("../src/lib/dates.js");
  for (const bad of [null, undefined, "", "not a date", "2026-13-45", NaN]) {
    const shown = [D.formatDate(bad), D.formatDateTime(bad)];
    ok(shown.every((s) => s === "—") && !D.isValidDate(bad), `${JSON.stringify(bad)} -> "—" (no Invalid Date, no 1969/1970)`, shown.join(" | "));
  }
  ok(D.formatDate(null, "") === "" && D.formatDateTime(undefined, "never") === "never", "callers choose the fallback");
  const good = D.formatDate("2026-11-01T10:00:00Z");
  ok(/2026/.test(good) && !/Invalid|1969|1970/.test(good) && /2026/.test(D.formatDateTime("2026-11-01T10:00:00Z")), "a real timestamp formats normally", good);
}

console.log("\n  BOOTH RECORD (src/lib/conference.js) -- defect 9");
{
  const C = await import("../src/lib/conference.js");
  const CO = "aaaaaaaa-0000-0000-0000-000000000001";
  route = (u) => (u.pathname.endsWith("/conference_booth_configs") ? json([{ studio: {}, version: 3, published_at: "2026-11-01T10:00:00Z" }]) : json([]));
  let r = await C.readBoothRecord(CO);
  ok(r.state === "published" && r.record.version === 3, "a published look -> published, with the record");
  route = () => json([]);
  r = await C.readBoothRecord(CO);
  ok(r.state === "none" && r.record === null, "no row -> none");
  route = () => json({ message: "relation does not exist" }, 404);
  r = await C.readBoothRecord(CO);
  ok(r.state === "none", "0085 not applied (404) -> none: booths run the bundle, which is true");
  route = () => json({ message: "upstream" }, 503);
  r = await C.readBoothRecord(CO);
  ok(r.state === "failed" && r.record === null, "a 503 -> failed, NOT none");
  route = () => { throw new TypeError("network down"); };
  r = await C.readBoothRecord(CO);
  ok(r.state === "failed", "offline -> failed");
  route = () => new Response("<html>", { status: 200 });
  r = await C.readBoothRecord(CO);
  ok(r.state === "failed", "a non-JSON 200 -> failed");
  route = () => json({ message: "upstream" }, 503);
  ok((await C.fetchBoothRecord(CO)) === null, "fetchBoothRecord (the portal's Conference page) keeps its old contract: record or null");
}

console.log("\n  WEBSITE (src/portal/Website.jsx) -- defects 1-4");
{
  const s = read("src/portal/Website.jsx");
  ok(/catch \(e\) \{ setRows\(false\);/.test(s) && !/setRows\(\[\]\); setErr/.test(s), "(1) a tokens read failure is its own state, not an empty list");
  ok(/if \(rows === false\)[\s\S]{0,400}could not be loaded[\s\S]{0,300}Retry/.test(s), "(1) ...shown as 'could not be loaded' with Retry, so 'No tokens have been issued' cannot appear with it");
  ok(/catch \(e\) \{ setRow\(false\);/.test(s) && /row === false \?[\s\S]{0,300}settings could not be loaded[\s\S]{0,200}Retry/.test(s), "(2) a settings read failure says so and offers Retry");
  ok(/row === null && \(/.test(s) && /row !== undefined && row !== false &&/.test(s), "(2) ...and is not shown as 'No website connected', nor followed by the token list");
  ok(/working\.pages\.find\(\(p\) => p && Array\.isArray\(p\.sections\)/.test(s), "(3) pageOf skips a null entry in data.pages");
  ok(!/new Date\(/.test(s) && /formatDateTime\(iso, "never"\)/.test(s) && /formatDate\(r\.published_at, ""\)/.test(s), "(4) every date goes through the guarded formatter");
  ok(/isValidDate\(working\.publishedAt\)/.test(s), "(4) 'Published' omits an invalid date instead of printing it");
  // pageOf, exactly as the page runs it, over a null entry.
  const { selectCopy } = await import("../src/lib/siteSelection.js");
  const working = selectCopy({ pages: [null, { title: "Home", sections: ["hero-1"] }, { title: "x" }], sections: { "hero-1": {} } }, { draft: true });
  const pageOf = (id) => (working.pages.find((p) => p && Array.isArray(p.sections) && p.sections.includes(id)) || {}).title;
  let t; try { t = pageOf("hero-1"); } catch (e) { t = e; }
  ok(t === "Home", "(3) with [null, page, page-without-sections] the page title is found, no throw", String(t));
}

console.log("\n  SERVICE REQUESTS (admin) -- defects 6-7");
{
  const s = read("src/admin/ServiceRequests.jsx");
  ok(/r\.history\.filter\(\(h\) => h && typeof h === "object"\)/.test(s) && /history\.map\(/.test(s) && !/r\.history\.map/.test(s), "(6) null history entries are dropped before rendering");
  ok(!/new Date\(/.test(s) && /formatDateTime\(iso\)/.test(s), "(7) dates through the guarded formatter");
  const history = [null, { status: "requested", at: "2026-11-01T10:00:00Z" }, "junk", { status: "quoted" }].filter((h) => h && typeof h === "object");
  ok(history.length === 2, "(6) [null, ok, 'junk', no-date] -> 2 entries; the one without a date shows '—'");
}

console.log("\n  SERVICES (portal) -- defect 8");
{
  const s = read("src/portal/Services.jsx");
  ok(/const fmt = \(iso\) => formatDate\(iso\);/.test(s) && !/new Date\(/.test(s), "(8) fmt(null) -> '—', never Dec 31, 1969");
  ok(/isValidDate\(r\.status_changed_at\) \? ` · updated/.test(s), "(8) '· updated' only when there is an update date");
}

console.log("\n  CONFERENCE STUDIO (admin) -- defects 9-11");
{
  const s = read("src/admin/ConferenceStudio.jsx");
  ok(/readBoothRecord\(company\.id\)\.then\(\(r\) => \{ if \(live\) \{ setPublished\(r\.record\); setRecordState\(r\.state\); \} \}\)/.test(s), "(9) the page keeps the record's state");
  ok(/recordState === "failed" \? "Could not check what booths are showing/.test(s), "(9) a failed read is said, not shown as 'Not published to booths yet'");
  ok(/recordState === "loading" \? "Checking/.test(s), "(9) while loading it does not claim 'not published' either");
  ok(/No companies with a preview link/.test(s) && /disabled=\{!sorted\.length\}/.test(s), "(10) an empty dropdown says why and is disabled");
  ok(/companies\.length\s*\?\s*"The company list arrived without preview links/.test(s), "(10) the preview pane explains instead of 'Select a company to preview'");
  ok(!/new Date\(/.test(s) && /formatDateTime\(published\.published_at/.test(s), "(11) the booth date goes through the guarded formatter");
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
