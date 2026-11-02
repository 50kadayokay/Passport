// No accidental production traffic from a local portal (2026-11-01: a
// signed-out dev portal polled production once a minute). OFFLINE.
//   node scripts/poll-guard-test.mjs
//
//   1. src/lib/supabase.js falls back to the production project ONLY in a
//      production build served over https / capacitor (the web deploy, the
//      native apps). Dev, --mode development, a local `vite preview` on http,
//      and plain node get an unresolvable host. An explicit VITE_SUPABASE_URL
//      always wins; the staging tripwire is unchanged.
//   2. Real Vite builds (env unset): the development bundle AND a Vercel-preview
//      build (VERCEL_ENV=preview, production mode) contain neither the
//      production origin nor its publishable key as a value; the production
//      bundle still does (the control). api/_supabase.js: the production default
//      only with VERCEL_ENV=production.
//   3. Background polls of our backend -- the portal (lib/portalBadges.js,
//      Messages.jsx) and the investor app (Feed.jsx, PassportProto.jsx, through
//      lib/pollGuard.js pollEvery): no request without a session; a 401/403
//      stops them for good; a 5xx does not. Signed in, nothing else changes.
// Nothing here reaches a network: fetch answers from a stub, builds are local.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { PRODUCTION_REFS } from "./_target-guard.mjs";
import { installBrowserGlobals, installFetch, signIn, signOutLocal, loadBundle, json, reporter, STUB_SB } from "./_portal-offline.mjs";

const { ok, section, done } = reporter("poll-guard");
const PROD_URL = `https://${PRODUCTION_REFS[0]}.supabase.co`;
const SRC = fs.readFileSync("src/lib/supabase.js", "utf8");
const PROD_KEY = (/"(sb_publishable_(?!not_configured)[A-Za-z0-9_]+)"/.exec(SRC) || [])[1];

// ---------------------------------------------------------------- 1 -------
section("1. WHICH PROJECT src/lib/supabase.js RESOLVES TO");
const cache = path.join("node_modules/.cache", "poll-guard");
fs.mkdirSync(cache, { recursive: true });
let n = 0;
async function resolveIn({ productionBuild, env = {}, protocol, host = "localhost" }) {
  const define = { "import.meta.env": JSON.stringify(env) };
  if (productionBuild !== undefined) define.__MINEEX_PRODUCTION_BUILD__ = JSON.stringify(productionBuild);
  const r = await build({ entryPoints: ["src/lib/supabase.js"], bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent", define });
  const file = path.resolve(cache, `supabase-${++n}.mjs`);
  fs.writeFileSync(file, r.outputFiles[0].text);
  if (protocol) globalThis.location = { protocol, hostname: host }; else delete globalThis.location;
  const errs = [], real = console.error;
  console.error = (...a) => errs.push(a.join(" "));
  try { const m = await import(pathToFileURL(file).href); return { url: m.SUPABASE_URL, anon: m.SUPABASE_ANON, errs, text: r.outputFiles[0].text }; }
  catch (e) { return { threw: e.message, errs }; }
  finally { console.error = real; }
}
ok(!!PROD_KEY, "found the production publishable key in src/lib/supabase.js (to look for it below)");
const PROD_ENV = { PROD: true, DEV: false, MODE: "production" };
const DEV_ENV = { PROD: false, DEV: true, MODE: "development" };
const NOT_CONFIGURED = "https://supabase-url-not-configured.invalid";
for (const [label, opts, want] of [
  ["plain node / a test bundle (no define, no env)", {}, "none"],
  ["`vite` dev server (define false, DEV)", { productionBuild: false, env: DEV_ENV, protocol: "http:" }, "none"],
  ["`vite build --mode development` (define false)", { productionBuild: false, env: DEV_ENV, protocol: "https:", host: "x.example" }, "none"],
  ["production build on the web deploy (https)", { productionBuild: true, env: PROD_ENV, protocol: "https:", host: "mineex.ca" }, "prod"],
  ["production build in the iOS app (capacitor://localhost)", { productionBuild: true, env: PROD_ENV, protocol: "capacitor:" }, "prod"],
  ["production build in the Android app (https://localhost)", { productionBuild: true, env: PROD_ENV, protocol: "https:" }, "prod"],
  ["production build under `vite preview` (http://localhost)", { productionBuild: true, env: PROD_ENV, protocol: "http:" }, "none"],
  ["production build on a LAN address over http", { productionBuild: true, env: PROD_ENV, protocol: "http:", host: "192.168.1.70" }, "none"],
  ["define true but MODE is not production", { productionBuild: true, env: { ...PROD_ENV, MODE: "demo" }, protocol: "https:", host: "x.example" }, "prod"],
]) {
  const r = await resolveIn(opts);
  if (want === "prod") ok(r.url === PROD_URL && r.anon === PROD_KEY && !r.errs.length, `${label} -> the production project (unchanged)`, JSON.stringify({ url: r.url, threw: r.threw }));
  else ok(r.url === NOT_CONFIGURED && r.anon !== PROD_KEY && r.errs.some((e) => /VITE_SUPABASE_URL is not set/.test(e)), `${label} -> an unresolvable host, with a console error`, JSON.stringify({ url: r.url, threw: r.threw }));
}
{
  const mine = "https://someproject.supabase.co";
  const d = await resolveIn({ productionBuild: false, env: { ...DEV_ENV, VITE_SUPABASE_URL: mine, VITE_SUPABASE_ANON_KEY: "sb_publishable_x" }, protocol: "http:" });
  const p = await resolveIn({ productionBuild: true, env: { ...PROD_ENV, VITE_SUPABASE_URL: mine, VITE_SUPABASE_ANON_KEY: "sb_publishable_x" }, protocol: "http:" });
  ok(d.url === mine && p.url === mine && !d.errs.length, "an explicit VITE_SUPABASE_URL always wins (dev or production, http or not)");
  const st = await resolveIn({ productionBuild: true, env: { ...PROD_ENV, VITE_MINEEX_ENV: "staging" }, protocol: "https:", host: "x.example" });
  ok(/staging tripwire/.test(st.threw || ""), "a staging bundle without the staging URL still throws (tripwire unchanged)", st.threw);
  // That the production VALUES are gone from a non-production bundle is proven on
  // real Vite output in section 2 (Rollup removes the dead branch; esbuild here does not).
}
delete globalThis.location;
const vc = fs.readFileSync("vite.config.js", "utf8");
ok(/__MINEEX_PRODUCTION_BUILD__: JSON\.stringify\(productionDefault\(command, mode\)\)/.test(vc), "vite.config.js defines __MINEEX_PRODUCTION_BUILD__ from productionDefault()");
{
  const { productionDefault } = await import("../vite.config.js");
  for (const [label, args, want] of [
    ["Vercel PRODUCTION deploy (VERCEL_ENV=production)", ["build", "production", "production"], true],
    ["Vercel PREVIEW deploy (production mode, VERCEL_ENV=preview)", ["build", "production", "preview"], false],
    ["Vercel development (VERCEL_ENV=development)", ["build", "production", "development"], false],
    ["an unknown VERCEL_ENV", ["build", "production", "staging-ish"], false],
    ["local `vite build`, no VERCEL_ENV (the native apps)", ["build", "production", undefined], true],
    ["local `vite build --mode development`", ["build", "development", undefined], false],
    ["`vite` dev server", ["serve", "development", undefined], false],
    ["`vite` dev server on Vercel production env", ["serve", "production", "production"], false],
  ]) ok(productionDefault(...args) === want, `${label}: ${want ? "may" : "may NOT"} default to production`);
}

// ---------------------------------------------------------------- 2 -------
section("2. REAL VITE BUILDS, env unset");
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^VITE_SUPABASE_|^MINEEX_ENV$/.test(k)));
const out = (m) => fs.mkdtempSync(path.join(os.tmpdir(), `pg-${m}-`));
const scan = (dir) => {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(m?js|html)$/.test(e.name)) files.push(f); } };
  walk(dir);
  const text = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  // The origin as a whole string value -- not storage asset URLs under it.
  const asValue = new RegExp(`["'\`]${PROD_URL.replace(/[.]/g, "\\.")}["'\`]`).test(text);
  const assets = (text.match(new RegExp(`${PROD_URL.replace(/[.]/g, "\\.")}/storage/v1/object/public/[^"'\`\\s)]+`, "g")) || []).length;
  return { files: files.length, asValue, key: text.includes(PROD_KEY), notConfigured: text.includes(NOT_CONFIGURED), assets };
};
const runBuild = (args, dir) => spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", ...args, "--outDir", dir, "--emptyOutDir", "--logLevel", "error"], { encoding: "utf8", env, timeout: 300000 });
{
  const dir = out("dev");
  const b = runBuild(["--mode", "development"], dir);
  ok(b.status === 0, "`vite build --mode development` builds", (b.stderr || "").slice(0, 300));
  const s = b.status === 0 ? scan(dir) : {};
  ok(s.files > 5 && !s.asValue && !s.key, `the development bundle has no production project default: neither the origin as a value nor the publishable key (${s.files} files)`);
  ok(s.notConfigured, "...it carries the unresolvable host instead");
  console.log(`  (legitimate production references left in it: ${s.assets} public storage asset URLs -- demo/marketing images, plain GETs of public files)`);
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  const dir = out("preview");
  const pe = { ...env, VERCEL_ENV: "preview" };
  const b = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--outDir", dir, "--emptyOutDir", "--logLevel", "error"], { encoding: "utf8", env: pe, timeout: 300000 });
  ok(b.status === 0, "`vite build` with VERCEL_ENV=preview (what a Vercel preview runs) builds", (b.stderr || "").slice(0, 300));
  const s = b.status === 0 ? scan(dir) : {};
  ok(s.files > 5 && !s.asValue && !s.key && s.notConfigured, "the PREVIEW bundle has no production default either (production mode, but not a production deploy)");
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  const dir = out("prod");
  const b = runBuild([], dir);
  ok(b.status === 0, "`vite build` (production) builds", (b.stderr || "").slice(0, 300));
  const s = b.status === 0 ? scan(dir) : {};
  ok(s.asValue && s.key, "the production bundle still carries the fallback (the web deploy and the native apps are unchanged)");
  fs.rmSync(dir, { recursive: true, force: true });
}

section("2b. THE SERVER SIDE (api/_supabase.js), by VERCEL_ENV, no URL configured");
for (const [label, vercel, want] of [["production deploy", "production", "prod"], ["preview deploy", "preview", "none"], ["development", "development", "none"], ["no VERCEL_ENV (`vite` dev's /api routes, node)", undefined, "none"]]) {
  const e = { PATH: process.env.PATH, ...(vercel ? { VERCEL_ENV: vercel } : {}) };
  // verifyBearer with a token: on production it would call Supabase, so fetch is stubbed to answer 401 locally.
  const code = `globalThis.fetch = async () => new Response("{}", { status: 401 });
    const m = await import("./api/_supabase.js"); const v = await m.verifyBearer("tok");
    console.log(JSON.stringify({ url: m.SB_URL, key: m.ANON_KEY, configured: m.supabaseConfigured(), v: { status: v.status, error: v.error } }));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env: e, timeout: 20000 });
  const got = (() => { try { return JSON.parse(r.stdout.trim().split("\n").pop()); } catch { return {}; } })();
  if (want === "prod") ok(got.url === PROD_URL && got.key === PROD_KEY && got.configured && got.v.status === 401, `${label}: the production default (unchanged), configured`, r.stderr.slice(0, 200));
  else ok(got.url === NOT_CONFIGURED && got.key !== PROD_KEY && /no fallback/.test(r.stderr) && got.configured === false && got.v.status === 500 && /Server not configured/.test(got.v.error),
    `${label}: no production default -- fails closed (not configured; a session check answers 500 "Server not configured" without any request) and logs why`, `${JSON.stringify(got)} ${r.stderr.slice(0, 160)}`);
}
{
  const e = { PATH: process.env.PATH, VERCEL_ENV: "preview", VITE_SUPABASE_URL: "https://someproject.supabase.co", VITE_SUPABASE_ANON_KEY: "sb_publishable_someprojectkey000" };
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `const m = await import("./api/_supabase.js"); console.log(m.SB_URL);`], { encoding: "utf8", env: e, timeout: 20000 });
  ok(r.stdout.trim() === "https://someproject.supabase.co", "an explicitly configured URL still wins on a preview (so a preview with production values set still reaches production: fix that in Vercel's env scoping)");
}

// ---------------------------------------------------------------- 3 -------
section("3. THE PORTAL'S BACKGROUND POLLS");
installBrowserGlobals();
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
let mode = {};          // per-endpoint status overrides: { reads: 401, rpc: 403, convs: 500 }
const calls = installFetch(async (req) => {
  if (req.url.origin !== STUB_SB) return undefined;
  const p = req.url.pathname;
  if (p === "/auth/v1/token") return json({ error: "invalid_grant" }, 400);
  if (p === "/rest/v1/rpc/company_notifications") return mode.rpc ? json({ message: "x" }, mode.rpc) : json([{ kind: "follow", actor_name: "A", occurred_at: "2026-11-01T10:00:00Z" }, { kind: "like", actor_name: "B", occurred_at: "2026-11-01T11:00:00Z" }]);
  if (p === "/rest/v1/company_notification_reads") return mode.reads ? json({ code: "42501", message: "permission denied for table company_notification_reads" }, mode.reads) : json([{ seen_at: "2026-11-01T10:30:00Z" }]);
  if (p === "/rest/v1/conversations") return mode.convs ? json({ message: "x" }, mode.convs) : json([{ id: "c1", company_slug: "alpha", last_message_at: "2026-11-01T12:00:00Z", company_read_at: null, sender_company_id: null }]);
  return undefined;
});
const B = await loadBundle("poll-guard", `
  export { startBadgePoll, BADGE_POLL_MS } from "./src/lib/portalBadges.js";
  export { mayPoll, pollRefused } from "./src/lib/pollGuard.js";
`);
const fakeTimers = () => { const T = { set: 0, cleared: 0, fn: null }; return Object.assign(T, { setInterval(fn) { T.set++; T.fn = fn; return 1; }, clearInterval() { T.cleared++; } }); };
const flush = () => new Promise((r) => setTimeout(r, 20));
const start = () => { const T = fakeTimers(); const got = { notif: [], msg: [] };
  const poll = B.startBadgePoll({ companyId: A, slug: "alpha", onNotifications: (x) => got.notif.push(x), onMessages: (x) => got.msg.push(x), timers: T });
  return { T, got, poll }; };

{
  signOutLocal(); mode = {};
  const before = calls.length;
  const { T, poll } = start();
  await flush(); await poll.tick(); await poll.tick(); await flush();
  ok(calls.length === before && T.set === 1 && !poll.stopped, "signed out: the first tick and every later one make NO request (the poll stays armed for a later sign-in)", `${calls.length - before} requests`);
  poll.stop();
  ok(!B.mayPoll() && B.BADGE_POLL_MS === 60000, "mayPoll() is false without a session; the interval is still one minute");
}
{
  signIn({ id: "u1", email: "u1@stub.invalid" }); mode = {};
  const { T, got, poll } = start();
  await flush(); await poll.tick(); await flush();
  ok(got.notif.length === 2 && got.notif[0] === 1 && got.msg[0] === 1 && !poll.stopped && T.cleared === 0, "signed in: badges are counted (1 new notification, 1 unread thread) and the poll keeps running", JSON.stringify(got));
  poll.stop();
}
for (const [what, m] of [["notification_reads 401 (expired session)", { reads: 401 }], ["notification_reads 403 (permission denied)", { reads: 403 }], ["company_notifications 401", { rpc: 401 }], ["conversations 403", { convs: 403 }]]) {
  signIn({ id: "u1", email: "u1@stub.invalid" }); mode = m;
  const { T, poll } = start();
  await flush();
  const after = calls.length;
  await poll.tick(); await poll.tick(); await flush();
  ok(poll.stopped && T.cleared === 1 && calls.length === after, `${what}: the poll stops (interval cleared) and later ticks make no request`, `stopped ${poll.stopped}, cleared ${T.cleared}, ${calls.length - after} more requests`);
}
{
  signIn({ id: "u1", email: "u1@stub.invalid" }); mode = { rpc: 500, convs: 503 };
  const { T, poll } = start();
  await flush(); const a = calls.length; await poll.tick(); await flush();
  ok(!poll.stopped && T.cleared === 0 && calls.length > a, "a 5xx is not a refusal: the poll keeps trying (a badge recovers when the server does)");
  poll.stop();
  ok(B.pollRefused({ status: 401 }) && B.pollRefused({ status: 403 }) && !B.pollRefused({ status: 500 }) && !B.pollRefused({ ok: false }) && !B.pollRefused(null), "pollRefused: 401/403 only");
}

section("3b. pollEvery (Feed.jsx, PassportProto.jsx) AND THE INVESTOR APP'S COUNTS");
{
  mode = {};
  const P = await loadBundle("poll-every", `
    export { pollEvery } from "./src/lib/pollGuard.js";
    export { loadNewSince, countNewSince } from "./src/lib/feed.js";
    export { loadUnreadCount, unreadCount } from "./src/lib/notifications.js";
  `);
  const run = async (results) => {
    const T = fakeTimers(); let n = 0;
    const stop = P.pollEvery(1000, async () => results[Math.min(n++, results.length - 1)], T);
    return { T, stop, fire: async () => { await T.fn(); await flush(); }, calls: () => n };
  };
  signOutLocal();
  let p = await run([{ ok: true }]);
  await p.fire(); await p.fire();
  ok(p.calls() === 0 && p.T.cleared === 0, "signed out: the poll function never runs (no request), and the poll stays armed");
  signIn({ id: "u1", email: "u1@stub.invalid" });
  p = await run([5, { ok: true, count: 2 }, null, { ok: false, status: 500 }]);
  for (let i = 0; i < 4; i++) await p.fire();
  ok(p.calls() === 4 && p.T.cleared === 0, "signed in: it runs every time; numbers, null and a 5xx keep it going (investor app unchanged)");
  for (const st of [401, 403]) {
    p = await run([{ ok: true }, { ok: false, status: st }, { ok: true }]);
    await p.fire(); await p.fire(); await p.fire();
    ok(p.calls() === 2 && p.T.cleared === 1, `a ${st} stops it for good (cleared once; no later run)`, `${p.calls()} runs, cleared ${p.T.cleared}`);
  }
  p = await run([{ ok: true }]); p.stop(); p.stop();
  ok(p.T.cleared === 1, "stop() clears once and is safe to call twice (unmount, stopPolling)");
  const throwing = fakeTimers(); let th = 0;
  P.pollEvery(1000, async () => { th++; throw new Error("network"); }, throwing);
  await throwing.fn(); await throwing.fn(); await flush();
  ok(th === 2 && throwing.cleared === 0, "a poll that throws is retried next time, not stopped");

  // The new status-returning reads, against the stub (the old number-returning ones are their wrappers).
  const counted = (n, status = 200) => new Response("[]", { status, headers: { "content-range": `0-0/${n}` } });
  let postsStatus = 200, notifStatus = 200;
  installFetch(async (req) => {
    if (req.url.origin !== STUB_SB) return undefined;
    if (req.url.pathname === "/auth/v1/token") return json({ error: "invalid_grant" }, 400);
    if (req.url.pathname === "/rest/v1/posts") return counted(3, postsStatus);
    if (req.url.pathname === "/rest/v1/notifications") return counted(4, notifStatus);
    return undefined;
  });
  const since = "2026-11-01T00:00:00Z";
  let r = await P.loadNewSince(since), u = await P.loadUnreadCount();
  ok(r.ok && r.count === 3 && u.ok && u.count === 4 && (await P.countNewSince(since)) === 3 && (await P.unreadCount()) === 4, "signed in: loadNewSince / loadUnreadCount return the counts, and countNewSince / unreadCount return the same numbers as before");
  postsStatus = 401; notifStatus = 403;
  r = await P.loadNewSince(since); u = await P.loadUnreadCount();
  ok(!r.ok && r.status === 401 && !u.ok && u.status === 403, "a refusal carries its status (401 / 403), so pollEvery can stop");
  signOutLocal();
  const before = calls.length;
  u = await P.loadUnreadCount();
  ok(u.ok && u.count === 0, "signed out, loadUnreadCount answers 0 without a request (as unreadCount always did)");
}

section("THE CALL SITES");
{
  const portal = fs.readFileSync("src/portal/Portal.jsx", "utf8");
  ok(/badges\.startBadgePoll\(\{/.test(portal) && !/setInterval/.test(portal) && /if \(poll\) poll\.stop\(\)/.test(portal), "Portal.jsx polls only through startBadgePoll and stops it on unmount");
  const msgs = fs.readFileSync("src/portal/Messages.jsx", "utf8");
  const intervals = [...msgs.matchAll(/setInterval\(async \(\) => \{([\s\S]*?)\}, POLL_MS\)/g)].map((m) => m[1]);
  ok(intervals.length === 2 && intervals.every((b) => /if \(!mayPoll\(\)\) return;/.test(b) && /pollRefused\([^)]*\)[^\n]*clearInterval\(t\)/.test(b)) && (msgs.match(/setInterval\(/g) || []).length === 2,
    "Messages.jsx: both polls (inbox, open thread) skip without a session and clear themselves on a 401/403");
  const cn = fs.readFileSync("src/lib/companyNotifications.js", "utf8");
  const branch = (fn) => new RegExp(`export async function ${fn}\\([^)]*\\) \\{\\s*(//[^\\n]*\\n\\s*)*if \\(import\\.meta\\.env && import\\.meta\\.env\\.DEV && isPortalDemo\\(\\)\\)`).test(cn);
  ok(branch("loadCompanyLastSeen") && branch("markCompanyNotificationsSeen"), "the dev demo (/portaldemo) reads and marks 'seen' locally: it no longer asks the real company_notification_reads every minute");
  const feed = fs.readFileSync("src/aiBrief/Feed.jsx", "utf8");
  ok(!/setInterval\(/.test(feed) && (feed.match(/pollEvery\(20000, async \(\) => \{/g) || []).length === 2 && /loadNewSince\(sinceRef\.current/.test(feed) && /loadUnreadCount\(\)/.test(feed),
    "Feed.jsx: the new-posts count and the unread count both poll through pollEvery every 20 s (no raw setInterval)");
  const pp = fs.readFileSync("src/aiBrief/PassportProto.jsx", "utf8");
  ok(/this\.poll = pollEvery\(4000, \(\) => \(this\.activeId === id \? this\.loadMsgs\(id\) : null\)\)/.test(pp) && /stopPolling\(\) \{ if \(this\.poll\) \{ this\.poll\(\); this\.poll = null; \}/.test(pp)
    && /if \(!r\.ok\) return \{ ok: false, status: r\.status \};/.test(pp), "PassportProto.jsx: the open thread polls every 4 s through pollEvery; loadMsgs reports a refusal's status; stopPolling stops it");
  // The two 2-minute quote refreshes are deliberately NOT gated: public prices from a quote worker
  // or Yahoo relays, never our Supabase project, shown to signed-out visitors too.
  for (const f of ["src/aiBrief/PassportProto.jsx", "src/Onboarding.jsx"]) {
    const src = fs.readFileSync(f, "utf8");
    const fq = src.slice(src.indexOf("async function fetchQuote("), src.indexOf("function useQuote("));
    ok(fq.length > 100 && !/SUPABASE_URL|authHeaders|getAccessToken|API_BASE/.test(fq), `${f}: useQuote's fetchQuote never calls our backend or sends credentials (so it is outside the session rule)`);
  }
}
done();
