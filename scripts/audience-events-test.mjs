// a13 regression tests -- audience events from the investor app, and the
// Analytics readers.   node scripts/audience-events-test.mjs
//
// OFFLINE. Runs the real src/lib/analytics.js and src/lib/engagement.js with
// storage, session and network stubbed. The database rules (0087: dedupe,
// published-only, anon-safe visitor, members-only reads) are proven against
// staging, rolled back, by scripts/audience-events-0087-check.mjs.

import fs from "node:fs";

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
let search = "?c=kingsmen-resources";
globalThis.window = { location: { get search() { return search; }, pathname: "/app" }, addEventListener() {} };

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const A = await import("../src/lib/analytics.js");
let sent = [], failNext = false;
A._setSender(async (evs) => { if (failNext) { failNext = false; throw new Error("offline"); } sent.push(evs.map((e) => ({ ...e }))); });

console.log("\n  PROFILE VIEWS: queued, de-duplicated, anonymous-safe");
{
  store.clear(); A._reset(); sent = [];
  ok(A.trackProfileView("kingsmen-resources") === true && A.trackProfileView("kingsmen-resources") === false, "same profile twice in a session -> queued once");
  A.trackProfileView("other-co");
  await A.flushAnalytics();
  const b = sent[0] || [];
  ok(sent.length === 1 && b.length === 2 && b.every((e) => e.k === "profile_view"), "one batch, two views");
  const vid = store.get("mineex.visitor");
  ok(/^[0-9a-f]{32}$/.test(vid) && b.every((e) => e.v === vid), "signed-out visitor: one random 32-hex device id, reused");
  ok(b.every((e) => Object.keys(e).sort().join() === "c,k,v"), "nothing else is sent (no user id, no URL, no user agent)", JSON.stringify(b));
  ok(A.trackProfileView("") === false, "no company -> nothing");
}

console.log("\n  CONTEXTS THAT ARE NOT AN INVESTOR LOOKING");
{
  for (const q of ["?c=x&embed=1", "?c=x&preview=abc", "?c=x&ipad=1", "?c=x&mode=booth"]) {
    search = q; A._reset();
    ok(A.trackProfileView("x") === false, `${q} -> not recorded`);
  }
  search = "?c=x"; store.set("mineex.mock", "1"); A._reset();
  ok(A.trackProfileView("x") === false, "mock investor mode -> not recorded");
  store.delete("mineex.mock");
  globalThis.window.location = { search: "?c=x", pathname: "/portaldemo" }; A._reset();
  ok(A.trackProfileView("x") === false, "portal demo -> not recorded");
  globalThis.window.location = { get search() { return search; }, pathname: "/app" };
}

console.log("\n  SHARES AND VIDEO PROGRESS");
{
  search = "?c=kingsmen-resources"; A._reset(); sent = [];
  A.trackShare({ company: "kingsmen-resources", method: "sheet" });
  A.trackShare({ company: "kingsmen-resources", postId: "11111111-1111-4111-8111-111111111111", method: "copy" });
  A.trackShare({ company: "kingsmen-resources", method: "weird" });
  await A.flushAnalytics();
  const s = sent[0] || [];
  ok(s.length === 3 && s[0].d === "sheet" && s[1].d === "copy" && s[1].p && s[2].d === "sheet", "shares carry method sheet|copy and an optional post", JSON.stringify(s));
  sent = [];
  const h = A.videoProgressHandler("kingsmen-resources", { mediaUrl: "https://x/video.mp4" });
  const fire = (t, d = 100) => h({ currentTarget: { currentTime: t, duration: d } });
  fire(10); fire(30); fire(55); fire(55); fire(80); fire(98); fire(5); fire(30); fire(99);
  h({ currentTarget: { currentTime: 3, duration: NaN } });
  h(null);
  await A.flushAnalytics();
  const v = (sent[0] || []).map((e) => e.n);
  ok(JSON.stringify(v) === JSON.stringify(["25", "50", "75", "100"]), "each milestone once, even as the video loops (25/50/75/100)", JSON.stringify(v));
  ok((sent[0] || []).every((e) => e.m === "https://x/video.mp4" && e.k === "video_progress"), "video matched by media URL within the company");
  ok(A.trackVideoProgress({ company: "c", mediaUrl: "u", percent: 33 }) === false, "a non-milestone percent is refused");
}

console.log("\n  NEVER THROWS, NEVER BLOCKS");
{
  A._reset(); sent = [];
  for (let i = 0; i < 45; i++) A.trackShare({ company: `co-${i}` });
  await new Promise((r) => setTimeout(r, 0));
  ok(sent.every((b) => b.length <= A.MAX_BATCH), `batches of at most ${A.MAX_BATCH} (the database refuses more)`, JSON.stringify(sent.map((b) => b.length)));
  failNext = true; A.trackProfileView("z");
  let threw = false;
  try { await A.flushAnalytics(); } catch { threw = true; }
  ok(!threw, "a failed send is swallowed");
  const realLS = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
  A._reset(); sent = [];
  let r;
  try { r = A.trackProfileView("blocked-co"); } catch { r = "threw"; }
  ok(r === false || r === true, "blocked storage (private mode) -> no throw");
  globalThis.localStorage = realLS;
  const src = fs.readFileSync("src/lib/analytics.js", "utf8");
  ok(!/\bawait\b[^;]*track/.test(fs.readFileSync("src/aiBrief/PassportProto.jsx", "utf8")), "the investor app never awaits a track call");
  ok(/catch/.test(src) && !/throw new/.test(src), "analytics.js has no throw statements");
}

console.log("\n  INVESTOR APP CHANGE IS ADDITIVE");
{
  const app = fs.readFileSync("src/aiBrief/PassportProto.jsx", "utf8");
  ok((app.match(/trackShare\(/g) || []).length === 6 && (app.match(/trackProfileView\(/g) || []).length === 1 && /onTimeUpdate=\{videoProgressHandler\(/.test(app),
    "6 share calls (3 sheets x sheet/copy), 1 profile view effect, 1 video handler");
  ok(/useEffect\(\(\) => \{ if \(inCompany\) \{ const s = curSlug\(\); if \(s\) trackProfileView\(s\); \} \}, \[inCompany, companyKey\]\)/.test(app),
    "profile view fires for signed-in and signed-out visitors, on open and on an in-app company swap");
}

console.log("\n  PORTAL READERS (engagement.js)");
{
  store.set("pp.session", JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.x", refresh_token: "r", expires_at: Date.now() + 3600e3, user: { id: "u1" } }));
  const replies = {
    company_audience_summary: [{ first_recorded_at: "2026-10-31T00:00:00Z", profile_views: "12", unique_visitors: "9", signed_in_visitors: "4", shares: "3", video_viewers: "5", video_completions: "2" }],
    company_video_progress: [{ post_id: "p1", reached_25: 5, reached_50: 4, reached_75: 3, reached_100: 2 }],
  };
  let status = 200;
  globalThis.fetch = async (u) => {
    const fn = String(u).split("/rpc/")[1];
    return { status, ok: status === 200, json: async () => replies[fn] };
  };
  const E = await import("../src/lib/engagement.js");
  const a = await E.audienceSummary("c1", 30);
  ok(a && a.profileViews === 12 && a.uniqueVisitors === 9 && a.signedInVisitors === 4 && a.shares === 3 && a.videoViewers === 5 && a.videoCompletions === 2, "audienceSummary maps every figure", JSON.stringify(a));
  const v = await E.videoProgress("c1", 30);
  ok(v && v.p1.r25 === 5 && v.p1.r100 === 2, "videoProgress keyed by post");
  status = 404;
  ok((await E.audienceSummary("c1")) === null && E.failureKind("company_audience_summary") === "missing", "0087 not applied -> null + 'needs a database update'");
  status = 500;
  ok((await E.videoProgress("c1")) === null && E.failureKind("company_video_progress") === "failed", "outage -> null + 'couldn't load'");
}

console.log("\n  CONTRACT WITH 0087");
{
  const sql = fs.readFileSync("supabase/migrations/0087_audience_events.sql", "utf8");
  ok(/jsonb_array_length\(p_events\) > 20/.test(sql) && A.MAX_BATCH === 20, "batch limit matches the database");
  ok(/\^\[A-Za-z0-9_-\]\{16,64\}\$/.test(sql), "device-id shape matches the database check");
  ok(/value in \(25, 50, 75, 100\)/.test(sql) && JSON.stringify(A.MILESTONES) === "[25,50,75,100]", "milestones match");
  ok(/'u:' \|\| v_uid::text/.test(sql), "signed-in visitor comes from auth.uid(), never from the request");
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
