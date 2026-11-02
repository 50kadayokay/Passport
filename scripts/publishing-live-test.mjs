// D22 Phase 1 live verification -- publishing delivery against the STAGING
// database, through the real routes, the real dispatcher and real RLS.
//
//   node scripts/publishing-live-test.mjs
//
// Starts the local staging API server (MINEEX_ENV=staging; OpenAI mocked with a
// deterministic "[staging mock]" fact and a fail-the-first-attempt marker), signs
// in the seeded fixtures, and publishes, revises and unpublishes real test
// releases for company A through /api/publish, /api/revise-release and
// /api/unpublish. The routes' own best-effort nudge reaches /api/dispatch on the
// harness's trusted base (PUBLIC_BASE_URL = the harness itself), and the test
// also calls /api/dispatch directly -- staging has no scheduler (D22 Phase 3).
// Every outcome is read back from the database.
//
// WHAT IT WRITES (staging only): updates/publications whose headline starts
// "[d22-live]" (deleted at the end; their events, deliveries, posts, facts and
// ingestions cascade or are removed by publication id), two company_follows and
// one notification preference for the fixture investors (removed), and company
// A's profile timeline (snapshotted and restored). A drain also processes
// whatever else is due on staging; the test reports that.
//
// MIGRATION 0071 (applied to staging 2026-10-31): publishing records the
// release as revision 1 (append-only, so that publication can never be
// deleted). Only releases that need text get a body; the rest publish with an
// empty body and stay deletable. Cleanup deletes what it can and RETIRES the
// rest (scripts/retire-test-publications.mjs): history kept, marked retired.
//
// Refuses to run unless the target is the staging project. Prints no secrets.

import fs from "node:fs";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const readEnvFile = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
let iso = readEnvFile("supabase/staging/.isolation-env");
const apiEnv = readEnvFile("supabase/staging/.api-env");
const SB = (iso.ISOLATION_SUPABASE_URL || "").replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY, SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY, DSECRET = apiEnv.DISPATCH_SECRET;
if (!SB || /rvptronniomlqumjhyrr/.test(SB) || !/jmljfovtfxcdhjmtlnva/.test(SB)) { console.error("  refusing: not the staging project"); process.exit(2); }
if (!SERVICE || !DSECRET) { console.error("  staging service key or DISPATCH_SECRET missing from .api-env"); process.exit(3); }
{ const s = spawnSync(process.execPath, ["scripts/seed-isolation-fixtures.mjs"], { encoding: "utf8" }); if (s.status !== 0) { console.error("  seeding failed"); process.exit(1); } iso = readEnvFile("supabase/staging/.isolation-env"); }
const A = iso.ISOLATION_COMPANY_A_ID;
const MARK = "[d22-live]";
const FAIL_ONCE = "[staging-mock:ai-fail-once]";

const PORT = 8787 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ["scripts/staging-api-server.mjs", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
let serverLog = ""; server.stdout.on("data", (d) => { serverLog += d; }); server.stderr.on("data", (d) => { serverLog += d; });
process.on("exit", () => { try { server.kill(); } catch {} ; if (process.env.SHOW_SERVER_LOG) console.log(serverLog); });
const API = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 40; i++) { if (await fetch(`${API}/__staging/egress`).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 250)); }
const egressLog = async () => ((await (await fetch(`${API}/__staging/egress`)).json()).log || []);

const db = async (path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j };
};
const rows = async (path) => { const r = await db(path); if (r.status !== 200) throw new Error(`db read ${r.status}: ${path.split("?")[0]}`); return r.body; };
const signIn = async (k) => { const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: iso[`ISOLATION_${k}_EMAIL`], password: iso[`ISOLATION_${k}_PASS`] }) }); const j = r.ok ? await r.json() : null; return j ? { token: j.access_token, id: j.user.id } : null; };
const who = {}; for (const k of ["COMPANY_A", "COMPANY_B", "STAFF", "INVESTOR", "INVESTOR_B", "PUBLISHER"]) who[k] = await signIn(k);
const callApi = async (route, user, body, headers = {}) => {
  const r = await fetch(`${API}/api/${route}`, { method: "POST", headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user.token}` } : {}), ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const dispatchNow = () => callApi("dispatch", null, { trigger: "test" }, { "x-dispatch-secret": DSECRET });
const delivery = async (pubId, listener, type = "PUBLICATION_PUBLISHED") => {
  const ev = await rows(`events?publication_id=eq.${pubId}&event_type=eq.${type}&select=id&order=created_at.desc&limit=1`);
  if (!ev[0]) return null;
  return (await rows(`event_deliveries?event_id=eq.${ev[0].id}&listener=eq.${listener}&select=status,attempts,last_error,next_attempt_at`))[0] || null;
};
const settle = async (pubId, listeners, type, tries = 8) => {
  for (let i = 0; i < tries; i++) {
    const ds = await Promise.all(listeners.map((l) => delivery(pubId, l, type)));
    if (ds.every((d) => d && d.status === "succeeded")) return ds;
    // Make due-now any of THIS publication's failed deliveries (backoff would wait minutes).
    const ev = await rows(`events?publication_id=eq.${pubId}&select=id`);
    if (ev.length) await db(`event_deliveries?event_id=in.(${ev.map((e) => e.id).join(",")})&status=eq.failed`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }) });
    await dispatchNow();
  }
  return Promise.all(listeners.map((l) => delivery(pubId, l, type)));
};

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const createDraft = async (headline, body) => {
  const u = await db("updates", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: A, body, status: "draft", detected: { headline, materiality: "High", summary: `${MARK} summary`, category: "Drilling" }, published_on: "2026-10-30" }) });
  const upd = u.body[0];
  const p = await db("publications", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: A, update_id: upd.id, destination_id: "passport", status: "approved", content: { headline, body: `${MARK} body`, post_type: "press_release" } }) });
  return p.body[0];
};

const profileBefore = (await rows(`companies?id=eq.${A}&select=profile`))[0].profile;
const created = [];
const egressStart = (await egressLog()).length;
console.log(`\n  staging ${new URL(SB).host.split(".")[0]}`);
try {
  // Followers for company A: INVESTOR (notified), INVESTOR_B (muted for A).
  await db("company_follows", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify([{ user_id: who.INVESTOR.id, company_id: A }, { user_id: who.INVESTOR_B.id, company_id: A }]) });
  await db("notification_prefs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: who.INVESTOR_B.id, company_id: A, channel: "in_app", muted: true, min_materiality: 0 }) });

  // Whatever was already due on staging is drained by the first run.
  const dueBefore = await rows(`event_deliveries?or=(and(status.in.(pending,failed),next_attempt_at.lte.${encodeURIComponent(new Date().toISOString())}))&select=listener,status`);

  console.log("\n  PUBLISH -> FEED, TIMELINE, NOTIFICATIONS, MINE IQ (via the route's own nudge, F5-safe)");
  const pub = await createDraft(`${MARK} Iso Alpha drills 31 m`, `${MARK} Iso Alpha drilled 31 m of 4.8 g/t gold at Alpha.`); created.push(pub.id);
  let r = await callApi("publish", who.COMPANY_A, { publicationId: pub.id }, { "x-forwarded-host": "canary.invalid", host: "canary.invalid" });
  ok(r.status === 200 && r.body.ok, "owner of A publishes: 200", JSON.stringify(r.body));
  await new Promise((res) => setTimeout(res, 1500));
  const ds = await settle(pub.id, ["feed_projection_v1", "in_app_notifications_v1", "mineiq_facts_v1", "profile_timeline_v1"], "PUBLICATION_PUBLISHED");
  ok(ds.every((d) => d && d.status === "succeeded"), "every delivery for the release SUCCEEDED", JSON.stringify(ds));
  const post = (await rows(`posts?publication_id=eq.${pub.id}&select=id,company_id,title,removed_at`))[0];
  ok(post && post.company_id === A && post.title.startsWith(MARK) && !post.removed_at, "DATABASE: the investor feed post exists, on company A (feed projection works on staging again)");
  const notes = await rows(`notifications?post_id=eq.${post ? post.id : "00000000-0000-0000-0000-000000000000"}&select=user_id`);
  ok(notes.length === 1 && notes[0].user_id === who.INVESTOR.id, "DATABASE: exactly one in-app notification, to the follower; the muted follower got none", JSON.stringify(notes));
  const facts = await rows(`facts?publication_id=eq.${pub.id}&select=company_id,quote`);
  const ing = await rows(`mineiq_ingestions?publication_id=eq.${pub.id}&select=revision,facts_written`);
  ok(facts.length === 1 && facts[0].company_id === A && ing.length === 1 && ing[0].facts_written === 1, "DATABASE: Mine IQ stored the fact (mocked model) and finished its claim (facts_written = 1)", JSON.stringify({ facts, ing }));
  const tl = (await rows(`companies?id=eq.${A}&select=profile`))[0].profile.timeline || [];
  ok(tl.some((e) => e.key === `pub:${pub.id}`), "DATABASE: the profile timeline has the release");
  // What the investor app reads (src/main.jsx), as anon: this query names
  // media_url, which staging lacked until 0071 -- it used to fail outright.
  const app = await fetch(`${SB}/rest/v1/posts?company_id=eq.${A}&removed_at=is.null&select=post_type,title,summary,media_url,thumbnail_url,published_at&order=published_at.desc&limit=60`, { headers: { apikey: ANON } });
  const appRows = app.ok ? await app.json() : [];
  ok(app.status === 200 && appRows.some((x) => x.title === post.title), `INVESTOR APP: the anon feed query (incl. media_url) returns the new post (${app.status})`);
  const rev1 = await rows(`release_revisions?publication_id=eq.${pub.id}&select=revision,body&order=revision`);
  ok(rev1.length === 1 && rev1[0].revision === 1 && rev1[0].body.startsWith(MARK), "0071: publishing recorded the original release as revision 1");
  const eg = (await egressLog()).slice(egressStart);
  ok(!eg.some((e) => /canary/.test(e.host || "")), "F5: with Host / X-Forwarded-Host = canary.invalid, no request went to the canary (the nudge used the trusted base)");

  console.log("\n  FIRST CORRECTION: revision 2, the same feed post and timeline entry updated");
  const stamp = crypto.randomBytes(3).toString("hex");
  r = await callApi("revise-release", who.COMPANY_A, { publicationId: pub.id, body: `${MARK} Corrected ${stamp}: drilled 31.4 m.`, headline: `${MARK} Iso Alpha drills 31.4 m (corrected ${stamp})` });
  ok(r.status === 200 && r.body.ok && r.body.revision === 2, "owner's first correction -> revision 2 (revision 1 came from publish)", JSON.stringify(r.body));
  ok((await rows(`release_revisions?publication_id=eq.${pub.id}&select=revision`)).length === 2, "DATABASE: exactly two revisions (the route's baseline step did nothing: history existed)");
  const revEvent = (await rows(`events?publication_id=eq.${pub.id}&event_type=eq.PUBLICATION_REVISED&select=id,payload&order=created_at.desc&limit=1`))[0];
  ok(revEvent && Number(revEvent.payload.revision) === 2, "DATABASE: PUBLICATION_REVISED for revision 2");
  await new Promise((res) => setTimeout(res, 1500));
  // 0088 added two destination listeners; settle them too where staging subscribes
  // them, or the status read below races their delivery (seen 2026-11-01).
  const fanout = (await rows(`listener_subscriptions?event_type=eq.PUBLICATION_REVISED&listener=in.(site_content_v1,conference_content_v1)&select=listener`)).map((x) => x.listener);
  const rds = await settle(pub.id, ["feed_projection_v1", "mineiq_facts_v1", "profile_timeline_v1", ...fanout], "PUBLICATION_REVISED");
  ok(rds.every((d) => d && d.status === "succeeded"), "every REVISED delivery succeeded", JSON.stringify(rds));
  const post2 = (await rows(`posts?publication_id=eq.${pub.id}&select=id,title`))[0];
  ok(post2 && post2.id === post.id && post2.title.includes(stamp), "DATABASE: the SAME feed post carries the corrected headline");
  ok((await rows(`mineiq_ingestions?publication_id=eq.${pub.id}&revision=eq.2&select=facts_written`)).length === 1, "DATABASE: Mine IQ reconciled revision 2");
  const tlr = (await rows(`companies?id=eq.${A}&select=profile`))[0].profile.timeline || [];
  ok(tlr.some((e) => e.key === `pub:${pub.id}` && String(e.title).includes(stamp)), "DATABASE: the timeline entry carries the corrected headline");
  ok((await rows(`notifications?post_id=eq.${post.id}&select=user_id`)).length === 1, "a correction notified nobody new");

  console.log("\n  DELIVERY STATUS (0071): visible to the company, nobody else");
  const statusAs = async (user) => { const rr = await fetch(`${SB}/rest/v1/rpc/publication_delivery_status`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json", ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, body: JSON.stringify({ p_publication: pub.id }) }); return { status: rr.status, body: await rr.json().catch(() => null) }; };
  let st = await statusAs(who.COMPANY_A);
  ok(st.status === 200 && Array.isArray(st.body) && st.body.length >= 3 && st.body.every((x) => x.event_type === "PUBLICATION_REVISED" && x.state === "delivered"), "owner of A: per-listener status of the latest event, all 'delivered'", JSON.stringify(st.body));
  st = await statusAs(who.STAFF);
  ok(st.status === 200 && st.body.length >= 3, "a member of A (viewer) sees it too");
  for (const k of ["COMPANY_B", "INVESTOR"]) { st = await statusAs(who[k]); ok(st.status === 200 && Array.isArray(st.body) && st.body.length === 0, `${k}: sees nothing (empty, no existence oracle)`); }
  st = await statusAs(null);
  ok(st.status === 401 || st.status === 403, `anon: refused (${st.status})`);

  console.log("\n  HEARTBEAT AND ALERTS (0071): service role only");
  for (const [k, user] of [["owner of A", who.COMPANY_A], ["anon", null]]) {
    const H = { apikey: ANON, "content-type": "application/json", ...(user ? { Authorization: `Bearer ${user.token}` } : {}) };
    const r1 = await fetch(`${SB}/rest/v1/dispatcher_runs?select=id&limit=1`, { headers: H });
    const r2 = await fetch(`${SB}/rest/v1/ops_alerts`, { method: "POST", headers: H, body: JSON.stringify({ condition: "forged" }) });
    ok([401, 403].includes(r1.status) && [401, 403].includes(r2.status), `${k}: cannot read dispatcher_runs (${r1.status}) or write ops_alerts (${r2.status})`);
  }
  ok((await db("ops_alerts?condition=eq.forged&select=condition")).body.length === 0, "DATABASE: no forged alert row");
  const rmr = await fetch(`${SB}/rest/v1/rpc/remove_timeline_entry`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${who.COMPANY_A.token}`, "content-type": "application/json" }, body: JSON.stringify({ p_company: A, p_key: `pub:${pub.id}` }) });
  ok([401, 403, 404].includes(rmr.status), `owner of A cannot call remove_timeline_entry directly (${rmr.status})`);

  console.log("\n  UNPUBLISH: removed from the feed");
  r = await callApi("unpublish", who.COMPANY_A, { publicationId: pub.id });
  ok(r.status === 200 && r.body.ok, "owner unpublishes: 200");
  await new Promise((res) => setTimeout(res, 1500));
  const uds = await settle(pub.id, ["feed_projection_v1", "profile_timeline_v1"], "PUBLICATION_UNPUBLISHED");
  ok(uds.every((d) => d && d.status === "succeeded"), "the UNPUBLISHED deliveries (feed AND timeline) succeeded", JSON.stringify(uds));
  ok(!!(await rows(`posts?publication_id=eq.${pub.id}&select=removed_at`))[0].removed_at, "DATABASE: the post is removed from the investor feed");
  const tl2 = (await rows(`companies?id=eq.${A}&select=profile`))[0].profile.timeline || [];
  ok(!tl2.some((e) => e.key === `pub:${pub.id}`), "0071: DATABASE: the timeline entry is REMOVED on unpublish");
  const appAfter = await (await fetch(`${SB}/rest/v1/posts?company_id=eq.${A}&removed_at=is.null&select=title`, { headers: { apikey: ANON } })).json();
  ok(!appAfter.some((x) => x.title === post2.title), "INVESTOR APP: the post no longer appears in the anon feed query");
  ok((await rows(`publications?id=eq.${pub.id}&select=id,status`))[0].status === "draft", "the release record itself is kept (status draft), never deleted");

  console.log("\n  A FAILED AI EXTRACTION IS RETRIED, NOT LOST");
  const pub2 = await createDraft(`${MARK} Iso Alpha financing`, `${MARK} ${FAIL_ONCE} Iso Alpha closes a C$5M placement.`); created.push(pub2.id);
  r = await callApi("publish", who.COMPANY_A, { publicationId: pub2.id });
  await new Promise((res) => setTimeout(res, 1500));
  await dispatchNow();
  let m1 = await delivery(pub2.id, "mineiq_facts_v1");
  for (let i = 0; i < 20 && m1 && m1.status === "processing"; i++) { await new Promise((res) => setTimeout(res, 1000)); m1 = await delivery(pub2.id, "mineiq_facts_v1"); }
  ok(m1 && m1.status === "failed" && /openai HTTP 500/.test(m1.last_error || ""), "first attempt: the (mocked) AI outage -> delivery FAILED with the reason", JSON.stringify(m1));
  ok((await rows(`mineiq_ingestions?publication_id=eq.${pub2.id}&select=facts_written`)).length === 0, "DATABASE: the claim was RELEASED (before D22 it stayed and the facts were lost for good)");
  const m2 = await settle(pub2.id, ["mineiq_facts_v1"], "PUBLICATION_PUBLISHED");
  ok(m2[0] && m2[0].status === "succeeded" && (await rows(`facts?publication_id=eq.${pub2.id}&select=id`)).length === 1, "the retry extracts and stores the fact", JSON.stringify(m2));

  console.log("\n  CONCURRENT DISPATCHERS");
  const pubs = [];
  // Empty bodies: no revision 1 is recorded, so these stay deletable (and Mine IQ has nothing to extract).
  for (let i = 0; i < 4; i++) { const p = await createDraft(`${MARK} concurrent ${i}`, "   "); created.push(p.id); pubs.push(p); }
  // Publish through the RPC path with nudges racing, then four explicit dispatchers at once.
  await Promise.all(pubs.map((p) => callApi("publish", who.COMPANY_A, { publicationId: p.id })));
  await Promise.all([dispatchNow(), dispatchNow(), dispatchNow(), dispatchNow()]);
  for (const p of pubs) await settle(p.id, ["feed_projection_v1", "in_app_notifications_v1", "profile_timeline_v1", "mineiq_facts_v1"], "PUBLICATION_PUBLISHED");
  const postsC = await rows(`posts?publication_id=in.(${pubs.map((p) => p.id).join(",")})&select=id`);
  const notesC = await rows(`notifications?post_id=in.(${postsC.map((p) => p.id).join(",") || "00000000-0000-0000-0000-000000000000"})&select=user_id,post_id`);
  const factsC = await rows(`facts?publication_id=in.(${pubs.map((p) => p.id).join(",")})&select=publication_id`);
  const ingC = await rows(`mineiq_ingestions?publication_id=in.(${pubs.map((p) => p.id).join(",")})&select=publication_id,facts_written`);
  ok(postsC.length === 4 && notesC.length === 4 && new Set(notesC.map((n) => n.post_id)).size === 4 && factsC.length === 0 && ingC.length === 4 && ingC.every((i) => i.facts_written === 0), "4 releases, nudges racing + 4 concurrent dispatchers: 4 posts, 4 notifications (one each, no duplicates), each Mine IQ claim finished exactly once", JSON.stringify({ posts: postsC.length, notes: notesC.length, ing: ingC.length }));

  console.log("\n  HISTORICAL EVENT (> 72 h): projected, but no notification and no automatic AI");
  const pub3 = await createDraft(`${MARK} historical`, `${MARK} An old release.`); created.push(pub3.id);
  await db(`publications?id=eq.${pub3.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "published", published_at: new Date(Date.now() - 30 * 86400e3).toISOString() }) });
  const oldAt = new Date(Date.now() - 30 * 86400e3).toISOString();
  await db("events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ event_type: "PUBLICATION_PUBLISHED", publication_id: pub3.id, company_id: A, payload: { publication_id: pub3.id, publish_seq: 1 }, idempotency_key: `d22-live-hist:${pub3.id}`, occurred_at: oldAt, created_at: oldAt }) });
  const dr = await dispatchNow();
  await settle(pub3.id, ["feed_projection_v1", "in_app_notifications_v1", "mineiq_facts_v1", "profile_timeline_v1"], "PUBLICATION_PUBLISHED");
  const post3 = (await rows(`posts?publication_id=eq.${pub3.id}&select=id`))[0];
  ok(!!post3, "DATABASE: the 30-day-old release is projected into the feed (a record, not a notification)");
  ok(post3 && (await rows(`notifications?post_id=eq.${post3.id}&select=id`)).length === 0, "DATABASE: nobody was notified about it");
  ok((await rows(`mineiq_ingestions?publication_id=eq.${pub3.id}&select=revision`)).length === 0, "DATABASE: no AI extraction started automatically");
  const sk = (dr.body.summary || []).find((s) => s.listener === "in_app_notifications_v1");
  ok(sk && sk.skipped && sk.skipped.historical >= 1, "the dispatcher REPORTED the historical skip", JSON.stringify(sk));

  console.log("\n  AUTHORIZATION AND ISOLATION (unchanged)");
  const pub4 = await createDraft(`${MARK} authz`, "   "); created.push(pub4.id);
  for (const [k, want] of [["COMPANY_B", 403], ["STAFF", 403], ["INVESTOR", 403]]) {
    r = await callApi("publish", who[k], { publicationId: pub4.id });
    ok(r.status === want || r.status === 404, `${k} cannot publish company A's release (${r.status})`);
  }
  ok((await rows(`events?publication_id=eq.${pub4.id}&select=id`)).length === 0, "DATABASE: no event was written by any refused publish");
  r = await callApi("publish", who.PUBLISHER, { publicationId: pub4.id });
  ok(r.status === 200, "positive control: company A's publisher may publish (actor_can_publish)");
  r = await callApi("dispatch", null, { trigger: "x" });
  ok(r.status === 401, "dispatch without the secret -> 401");
  r = await callApi("dispatch", who.COMPANY_A, { action: "backfill", listener: "mineiq_facts_v1", publication_id: pub3.id });
  ok(r.status === 403, "AI backfill by a company owner (not a platform admin) -> 403");

  console.log("\n  THE PRE-EXISTING STAGING QUEUE");
  ok(true, `${dueBefore.length} deliveries were already due before this run (${[...new Set(dueBefore.map((d) => `${d.listener}:${d.status}`))].join(", ") || "none"}); the drains above processed them with the fixed listeners`);
  const deadNow = await rows(`event_deliveries?status=eq.dead&select=listener,last_error`);
  ok(true, `dead letters on staging now: ${deadNow.length} (from earlier runs, before the fix; replay needs an admin action)`);

  const eg2 = (await egressLog()).slice(egressStart);
  ok(eg2.every((e) => e.action !== "block"), "no outbound call had to be blocked");
  ok(eg2.filter((e) => e.provider === "openai").every((e) => e.action === "mock"), "every AI call was the staging mock");
} finally {
  // Stop the server FIRST: a dispatch started by a route's nudge can still be
  // running server-side and would write after the restore below.
  try { server.kill(); } catch {}
  await new Promise((res) => setTimeout(res, 2500));
  // Cleanup, release by release (one undeletable row must not block the rest).
  const ids = created;
  for (const id of ids) {
    const ps = await rows(`posts?publication_id=eq.${id}&select=id`).catch(() => []);
    for (const p of ps) { await db(`notifications?post_id=eq.${p.id}`, { method: "DELETE" }); await db(`notification_outbox?post_id=eq.${p.id}`, { method: "DELETE" }); }
    await db(`facts?publication_id=eq.${id}`, { method: "DELETE" });
    await db(`posts?publication_id=eq.${id}`, { method: "DELETE" });
    const up = (await rows(`publications?id=eq.${id}&select=update_id`).catch(() => []))[0];
    const d = await db(`publications?id=eq.${id}`, { method: "DELETE" });
    if (d.status < 300 && up && up.update_id) await db(`updates?id=eq.${up.update_id}`, { method: "DELETE" });
  }
  // Releases with revision history cannot be deleted (append-only): RETIRE them.
  const ret = spawnSync(process.execPath, ["scripts/retire-test-publications.mjs", "--apply"], { encoding: "utf8" });
  const retired = (/kept (\d+) with their history/.exec(ret.stdout || "") || [])[1] || "0";
  console.log(`  retired (history kept, append-only): ${retired} test publication(s)`);
  await db(`company_follows?company_id=eq.${A}&user_id=in.(${who.INVESTOR.id},${who.INVESTOR_B.id})`, { method: "DELETE" });
  await db(`notification_prefs?user_id=eq.${who.INVESTOR_B.id}&company_id=eq.${A}`, { method: "DELETE" });
  await db(`companies?id=eq.${A}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ profile: profileBefore }) });
  // Left behind: only RETIRED publications (unpublished, marked, history kept) -- no live post, no projection.
  const stillLive = ids.length ? (await rows(`publications?id=in.(${ids.join(",")})&status=eq.published&select=id`)).length + (await rows(`posts?publication_id=in.(${ids.join(",")})&select=id`)).length : 0;
  const unmarked = ids.length ? (await rows(`publications?id=in.(${ids.join(",")})&select=id,content`)).filter((p) => !(p.content && p.content.retired)).length : 0;
  const left = stillLive + unmarked;
  const back = JSON.stringify((await rows(`companies?id=eq.${A}&select=profile`))[0].profile) === JSON.stringify(profileBefore);
  console.log(`\n  cleanup: ${ids.length} test releases deleted or retired (${left} still live or unmarked), follows/pref removed, profile ${back ? "restored (verified identical)" : "NOT restored"}`);
  if (left || !back) fail++;
}
console.log(`  publishing-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
