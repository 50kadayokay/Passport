// a12 regression tests -- impression recording (client) and the Analytics
// page's honesty rules for impressions.
//   node scripts/impressions-test.mjs
//
// OFFLINE. Runs the real src/lib/impressions.js and src/lib/engagement.js with
// localStorage, the session and the network stubbed. The database's own rules
// (one impression per investor/post/UTC day, members-only reads, expected
// numbers) are proven against staging by scripts/analytics-0065-0073-check.mjs.

import fs from "node:fs";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
};
const signIn = (id) => store.set("pp.session", JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.x", refresh_token: "r", expires_at: Date.now() + 3600e3, user: { id } }));

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

// A controllable IntersectionObserver: the test decides what is visible, when.
let fakeIO = null;
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.els = new Set(); fakeIO = this; } observe(el) { this.els.add(el); } unobserve(el) { this.els.delete(el); } };
const show = (el, ratio) => fakeIO.cb([{ target: el, isIntersecting: ratio > 0, intersectionRatio: ratio }]);
const card = (id) => ({ getAttribute: (k) => (k === "data-impression-post" ? id : null) });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const I = await import("../src/lib/impressions.js");
let sent = [], failNext = false;
I._setSender(async (ids) => { if (failNext) { failNext = false; throw new Error("offline"); } sent.push([...ids]); });

console.log("\n  CLIENT: queue, de-duplicate, batch");
store.clear();
ok(I.noteImpression("p1") === false && I._pending().length === 0, "signed out: nothing is recorded");
signIn("u1");
ok(I.noteImpression("p1") === true && I.noteImpression("p1") === false, "the same post twice before sending -> queued once");
I.noteImpression("p2");
await I.flushImpressions();
ok(sent.length === 1 && JSON.stringify(sent[0]) === JSON.stringify(["p1", "p2"]), "flush sends one batch with both posts", JSON.stringify(sent));
ok(I.noteImpression("p1") === false, "already sent today on this device -> not queued again (the database would ignore it anyway)");
signIn("u2");
ok(I.noteImpression("p1") === true, "a different investor on the same device -> a new impression");
await I.flushImpressions();
signIn("u1");
const tomorrow = Date.now() + 86400e3;
ok(I.noteImpression("p1", tomorrow) === true, "the next UTC day -> the same post counts again (one per investor per post per day)");
await I.flushImpressions();
sent = [];
for (let i = 0; i < 120; i++) I.noteImpression(`bulk-${i}`);
await I.flushImpressions();
ok(sent.every((b) => b.length <= I.MAX_BATCH) && sent.flat().length === 120, `120 posts -> ${sent.length} batches of at most ${I.MAX_BATCH} (the database refuses more)`, JSON.stringify(sent.map((b) => b.length)));
sent = [];
I.noteImpression("p-fail"); failNext = true;
await I.flushImpressions();
ok(sent.length === 0 && I.noteImpression("p-fail") === true, "a failed send is not remembered as sent, so the post can be recorded later");
ok(I.utcDay(Date.UTC(2026, 9, 31, 23, 59, 59)) === "2026-10-31" && I.utcDay(Date.UTC(2026, 10, 1, 0, 0, 1)) === "2026-11-01", "day boundary is UTC, matching the database's index");
ok(I.VISIBLE_RATIO === 0.5 && I.VISIBLE_MS === 1000, "definition: at least half on screen for at least one second");

console.log("\n  VISIBILITY RULE: at least half on screen for one continuous second");
{
  store.clear(); signIn("u-vis"); sent = [];
  const a = card("vis-40"), b = card("vis-60-short"), c = card("vis-60-long"), d = card("vis-flicker");
  for (const el of [a, b, c, d]) I.trackElement(el);
  show(a, 0.4); show(b, 0.6); show(c, 0.6); show(d, 0.6);
  await wait(500); show(d, 0.2); await wait(100); show(d, 0.6);   // d drops below half mid-way: the clock restarts
  await wait(300); show(b, 0.1);                                    // b leaves at 0.9 s
  await wait(350);                                                  // c has now been visible 1.25 s; d only 0.65 s since it came back
  ok(I._pending().includes("vis-60-long"), "60% visible for more than one second -> an impression");
  ok(!I._pending().includes("vis-60-short"), "60% visible for 0.9 s, then scrolled away -> no impression");
  ok(!I._pending().includes("vis-40"), "only 40% visible, however long -> no impression");
  ok(!I._pending().includes("vis-flicker"), "dipping below half restarts the one-second clock (no impression yet)");
  await wait(500);
  ok(I._pending().includes("vis-flicker"), "  ...and counts once it has been continuously visible for a full second");
  await I.flushImpressions();
}

console.log("\n  DASHBOARD DATA: no invented impressions or rates");
const E = await import("../src/lib/engagement.js");
const reply = (rows, status = 200) => { globalThis.fetch = async () => new Response(JSON.stringify(rows), { status, headers: { "content-type": "application/json" } }); };
reply([{ first_recorded_at: null, impressions: 0, viewers: 0, opens_since: 0 }]);
let s = await E.impressionSummary("co");
ok(s && s.firstRecordedAt === null && s.readRate === null, "nothing recorded -> firstRecordedAt null and NO read rate (not 0%)");
reply([{ first_recorded_at: "2026-10-30T10:00:00Z", impressions: 4, viewers: 2, opens_since: 3 }]);
s = await E.impressionSummary("co");
ok(s.readRate === 0.75 && s.firstRecordedAt === "2026-10-30T10:00:00Z", "read rate = opens since recording began / impressions (3/4)");
reply([{ first_recorded_at: "2026-10-30T10:00:00Z", impressions: 0, viewers: 0, opens_since: 5 }]);
ok((await E.impressionSummary("co")).readRate === null, "recorded before but none in this period -> no rate for the period (never divide by zero)");
reply({ message: "Could not find the function" }, 404);
ok((await E.impressionSummary("co")) === null && (await E.postImpressions("co")) === null, "function missing (0073 not applied) -> null: the page says 'needs a database update'");
ok(E.failureKind("company_impression_summary") === "missing", "a 404 is recorded as 'missing' -> the page says a database update is needed");
reply({ message: "outage" }, 500);
await E.impressionSummary("co");
ok(E.failureKind("company_impression_summary") === "failed", "a 500 is recorded as 'failed' -> the page says it couldn't load, NOT that an update is needed");
reply([{ post_id: "p1", impressions: 3, impressions_recent: 2 }]);
ok(JSON.stringify(await E.postImpressions("co")) === JSON.stringify({ p1: { impressions: 3, impressionsRecent: 2 } }), "per-post impressions mapped by post id");

console.log("\n  STATIC");
const page = fs.readFileSync("src/portal/Analytics.jsx", "utf8");
ok(!/Nothing in the app records one today/.test(page) && /impressionSummary\(/.test(page) && /postImpressions\(/.test(page), "the Analytics page reads impressions (the 'nothing records one' text is gone)");
ok(/Impressions have been recorded since/.test(page) && /nothing earlier was recorded/.test(page), "the page states when impressions began and that earlier ones were never recorded");
ok(/Earlier opens are left out/.test(page), "the read rate explains why earlier opens are excluded");
ok(/Analytics could not be loaded just now/.test(page) && /Try again/.test(page) && /missingNote\(/.test(page), "an outage gets its own message and a retry, distinct from 'needs a database update'");
ok(/label="Shares"[^>]*untracked/.test(page) && /label="Profile views"[^>]*untracked/.test(page), "still-uncollected metrics (shares, profile views) stay untracked, not zero");
const app = fs.readFileSync("src/aiBrief/PassportProto.jsx", "utf8");
ok((app.match(/<Seen /g) || []).length >= 4 && /import \{ Seen \} from "\.\.\/lib\/impressions\.js"/.test(app), "the investor feed wraps company-post cards in <Seen> (lead, top stories, For You, press releases)");
const mig = fs.readFileSync("supabase/migrations/0073a_impression_dedupe_index.sql", "utf8");
ok(/\(post_id, user_id, \(\(created_at at time zone 'UTC'\)::date\)\)\s*where kind = 'impression'/.test(mig), "the database index enforces the same one-per-investor-per-post-per-UTC-day rule");

console.log(`\n  impressions: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
