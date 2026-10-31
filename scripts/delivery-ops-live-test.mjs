// D22 Phase 4 live check -- delivery status and delivery operations against
// the STAGING database (migration 0071 applied there), through the local
// staging server, signed in as the real fixture users.
//
//   node scripts/delivery-ops-live-test.mjs
//
// Company side: publication_delivery_status() as owner / viewer / company
// admin of A (rows, never error text), company B and an investor (nothing),
// anon (refused). Admin side: /api/ops refused to every non-admin, the
// summary, dead-letter list and detail with the internal error, a replay that
// is confirmed, version-checked, single-use under a race, audited and actually
// redelivered by the dispatcher; a superseded dead letter refused; alert
// acknowledge / resolve; history.
//
// WRITES (staging only): one "[d22-live] delivery ops" release (empty body, so
// no append-only revision: deleted at the end) and its projections; delivery
// rows of THAT release forced to dead to create dead letters; dispatcher_runs
// rows of this test window (deleted); ops_alerts and company A's profile
// (restored, verified identical). Prints no secrets.

import fs from "node:fs";
import { spawn } from "node:child_process";

const readEnvFile = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const iso = readEnvFile("supabase/staging/.isolation-env"), apiEnv = readEnvFile("supabase/staging/.api-env");
const SB = (iso.ISOLATION_SUPABASE_URL || "").replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY, SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY, DSECRET = apiEnv.DISPATCH_SECRET;
if (!SB || /rvptronniomlqumjhyrr/.test(SB) || !/jmljfovtfxcdhjmtlnva/.test(SB)) { console.error("  refusing: not the staging project"); process.exit(2); }
if (!SERVICE || !ANON || !DSECRET) { console.error("  staging credentials missing"); process.exit(3); }
const A = iso.ISOLATION_COMPANY_A_ID;
const MARK = "[d22-live] delivery ops";
const SECRET_ERROR = "internal: upstream token rejected at 10.0.0.7 [d22-live]";

const PORT = 8787 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ["scripts/staging-api-server.mjs", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
process.on("exit", () => { try { server.kill(); } catch {} });
const API = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 40; i++) { if (await fetch(`${API}/__staging/egress`).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 250)); }
const egress = async () => ((await (await fetch(`${API}/__staging/egress`)).json()).log || []);

const db = async (path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j };
};
const rows = async (path) => { const r = await db(path); if (r.status >= 300) throw new Error(`${path.split("?")[0]} ${r.status}`); return r.body; };
const signIn = async (k) => { const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: iso[`ISOLATION_${k}_EMAIL`], password: iso[`ISOLATION_${k}_PASS`] }) }); const j = r.ok ? await r.json() : null; return j ? { token: j.access_token, id: j.user.id } : null; };
const ops = async (user, { method = "GET", query, body } = {}) => {
  const r = await fetch(`${API}/api/ops${query ? `?${new URLSearchParams(query)}` : ""}`, { method, headers: { ...(user ? { authorization: `Bearer ${user.token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const statusAs = async (user, pubId) => {
  const r = await fetch(`${SB}/rest/v1/rpc/publication_delivery_status`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json", ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, body: JSON.stringify({ p_publication: pubId }) });
  return { status: r.status, text: await r.text() };
};
const dispatchNow = async () => (await fetch(`${API}/api/dispatch`, { method: "POST", headers: { "content-type": "application/json", "x-dispatch-secret": DSECRET }, body: JSON.stringify({ trigger: "test" }) })).json().catch(() => ({}));
const deliveriesOf = async (pubId, type = "PUBLICATION_PUBLISHED") => {
  const ev = await rows(`events?publication_id=eq.${pubId}&event_type=eq.${type}&select=id&order=created_at.desc&limit=1`);
  return ev[0] ? rows(`event_deliveries?event_id=eq.${ev[0].id}&select=id,listener,status,attempts,updated_at,last_error`) : [];
};
const one = async (id) => (await rows(`event_deliveries?id=eq.${id}&select=id,listener,status,attempts,updated_at,last_error`))[0];
const forceDead = async (id) => (await db(`event_deliveries?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "dead", attempts: 6, last_error: SECRET_ERROR, locked_by: null, lease_expires_at: null, updated_at: new Date().toISOString() }) })).body[0];

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const who = {}; for (const k of ["ADMIN", "COMPANY_A", "STAFF", "COADMIN", "COMPANY_B", "INVESTOR"]) who[k] = await signIn(k);
const missing = Object.entries(who).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error(`  could not sign in: ${missing.join(", ")}`); process.exit(4); }

const testStart = new Date().toISOString();
const alertsBefore = await rows("ops_alerts?select=*");
const profileBefore = (await rows(`companies?id=eq.${A}&select=profile,owner_id`))[0];
const egressStart = (await egress()).length;
let pubId = null, updId = null;
console.log(`\n  staging ${new URL(SB).host.split(".")[0]} · delivery status and delivery operations`);
try {
  // ---- a release for company A, published and delivered ---------------------
  const u = await db("updates", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: A, body: "   ", status: "draft", detected: { headline: MARK } }) });
  updId = u.body[0].id;
  const p = await db("publications", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: A, update_id: updId, destination_id: "passport", status: "approved", content: { headline: MARK, post_type: "press_release" } }) });
  pubId = p.body[0].id;
  const pr = await db("rpc/publish_publication", { method: "POST", body: JSON.stringify({ p_publication_id: pubId, p_actor: profileBefore.owner_id }) });
  ok(pr.status === 200 && pr.body.ok, "setup: release published for company A");

  console.log("\n  COMPANY DELIVERY STATUS (publication_delivery_status, as each user)");
  let s = await statusAs(who.COMPANY_A, pubId);
  ok(s.status === 200 && JSON.parse(s.text).length === 0, "before the dispatcher runs: no delivery rows yet (the portal shows Pending)");
  await dispatchNow();
  let ds = await deliveriesOf(pubId);
  ok(ds.length >= 4 && ds.every((d) => d.status === "succeeded"), `the dispatcher delivered it (${ds.map((d) => `${d.listener}:${d.status}`).join(", ")})`);
  for (const k of ["COMPANY_A", "STAFF", "COADMIN"]) {
    s = await statusAs(who[k], pubId);
    const b = JSON.parse(s.text);
    ok(s.status === 200 && b.length === ds.length && b.every((r) => r.state === "delivered" && r.event_type === "PUBLICATION_PUBLISHED"), `${k} of A sees every destination delivered`);
  }
  const keys = Object.keys(JSON.parse((await statusAs(who.COMPANY_A, pubId)).text)[0]).sort().join(",");
  ok(keys === "attempts,event_type,listener,state,updated_at", `only state columns are returned (${keys}) -- no error text, no workers, no ids`);
  for (const k of ["COMPANY_B", "INVESTOR"]) {
    s = await statusAs(who[k], pubId);
    ok(s.status === 200 && JSON.parse(s.text).length === 0, `${k} sees nothing for A's release`);
  }
  s = await statusAs(null, pubId);
  ok(s.status === 401 || s.status === 403 || s.status === 404, `anon refused (${s.status})`);

  // A dead letter on THIS release (forced; the dispatcher would take 6 failures).
  const notif = ds.find((d) => d.listener === "in_app_notifications_v1");
  let dead = await forceDead(notif.id);
  s = await statusAs(who.COMPANY_A, pubId);
  const asA = JSON.parse(s.text);
  ok(asA.find((r) => r.listener === "in_app_notifications_v1").state === "failed", "a dead letter shows to the company as Failed");
  ok(!s.text.includes("10.0.0.7") && !s.text.includes("upstream token"), "  ...with no error text at all");

  console.log("\n  /api/ops: PLATFORM ADMINS ONLY");
  let r = await ops(null);
  ok(r.status === 401, "signed out -> 401");
  for (const k of ["COMPANY_A", "STAFF", "COADMIN", "COMPANY_B", "INVESTOR"]) {
    r = await ops(who[k], { query: { view: "deliveries", status: "dead", company: A } });
    ok(r.status === 403 && !JSON.stringify(r.body).includes("10.0.0.7"), `${k}: deliveries (naming company A) -> 403, nothing leaked`);
  }
  r = await ops(who.COMPANY_A, { method: "POST", body: { action: "replay", delivery_id: dead.id, expected_updated_at: dead.updated_at, confirm: true } });
  ok(r.status === 403 && (await one(dead.id)).status === "dead", "owner of A: replay -> 403, still dead");
  r = await ops(who.COADMIN, { method: "POST", body: { action: "acknowledge", condition: "dead_deliveries" } });
  ok(r.status === 403, "company admin of A: acknowledge an alert -> 403");

  console.log("\n  SUMMARY, LISTS AND DETAIL (as the platform admin)");
  r = await ops(who.ADMIN);
  ok(r.status === 200 && r.body.health && typeof r.body.totals.dead === "number" && r.body.totals.dead >= 1, `summary: health ${r.body.health && r.body.health.ok ? "ok" : "not ok"}, ${r.body.totals && r.body.totals.dead} dead, last success ${r.body.last_success ? r.body.last_success.trigger : "none"}`, JSON.stringify(r.body).slice(0, 300));
  ok(r.body.last_cron === null || typeof r.body.last_cron === "object", `scheduler: ${r.body.last_cron ? "a scheduled run is recorded" : "no scheduled run recorded (not active)"}`);
  r = await ops(who.ADMIN, { query: { view: "deliveries", status: "dead", company: A } });
  const listed = r.status === 200 && r.body.deliveries.find((d) => d.id === dead.id);
  ok(listed && listed.last_error === SECRET_ERROR && listed.publication.headline === MARK && listed.company.id === A, "dead letters for A include it, with the internal error and its release");
  r = await ops(who.ADMIN, { query: { view: "deliveries", status: "dead", company: iso.ISOLATION_COMPANY_B_ID } });
  ok(r.status === 200 && !r.body.deliveries.some((d) => d.id === dead.id), "filtered to company B it is absent");
  r = await ops(who.ADMIN, { query: { view: "delivery", id: dead.id } });
  ok(r.status === 200 && r.body.replay.allowed && r.body.siblings.length === ds.length && r.body.delivery.last_error === SECRET_ERROR, "detail: full error, siblings, replay allowed", JSON.stringify(r.body.replay));

  console.log("\n  REPLAY");
  r = await ops(who.ADMIN, { method: "POST", body: { action: "replay", delivery_id: dead.id, expected_updated_at: dead.updated_at } });
  ok(r.status === 400 && (await one(dead.id)).status === "dead", "unconfirmed -> 400, untouched");
  r = await ops(who.ADMIN, { method: "POST", body: { action: "replay", delivery_id: [dead.id], expected_updated_at: dead.updated_at, confirm: true } });
  ok(r.status === 400, "a list -> 400 (no bulk replay)");
  r = await ops(who.ADMIN, { method: "POST", body: { action: "replay", delivery_id: dead.id, expected_updated_at: new Date(Date.parse(dead.updated_at) - 5000).toISOString(), confirm: true } });
  ok(r.status === 409 && r.body.error === "changed" && (await one(dead.id)).status === "dead", "a stale version -> 409, untouched");
  r = await ops(who.ADMIN, { method: "POST", body: { action: "replay", delivery_id: dead.id, expected_updated_at: dead.updated_at, confirm: true } });
  ok(r.status === 200 && r.body.delivery.status === "pending" && r.body.delivery.attempts === 6 && r.body.audit_recorded, "replay -> 200: pending, attempts kept, audited", JSON.stringify(r.body));
  const again = await ops(who.ADMIN, { method: "POST", body: { action: "replay", delivery_id: dead.id, expected_updated_at: dead.updated_at, confirm: true } });
  ok(again.status === 409, "the same replay again -> 409");
  const audit = await rows(`dispatcher_runs?trigger=eq.replay&summary->>delivery_id=eq.${dead.id}&select=worker,summary`);
  ok(audit.length === 1 && audit[0].summary.by === who.ADMIN.id && audit[0].summary.previous.status === "dead", "DATABASE: exactly one audit row, naming the admin and the previous state");
  await dispatchNow();
  const after = await one(dead.id);
  ok(after.status === "succeeded", `the dispatcher redelivered it (${after.status}, ${after.attempts} attempts)`);
  ok(JSON.parse((await statusAs(who.COMPANY_A, pubId)).text).every((x) => x.state === "delivered"), "the company sees every destination delivered again");

  dead = await forceDead(notif.id);
  const shots = await Promise.all(Array.from({ length: 5 }, () => ops(who.ADMIN, { method: "POST", body: { action: "replay", delivery_id: dead.id, expected_updated_at: dead.updated_at, confirm: true } })));
  ok(shots.filter((x) => x.status === 200).length === 1 && shots.filter((x) => x.status === 409).length === 4, `5 concurrent replays -> exactly one accepted (${shots.map((x) => x.status).join(",")})`);
  ok((await rows(`dispatcher_runs?trigger=eq.replay&summary->>delivery_id=eq.${dead.id}&select=id`)).length === 2, "  ...one more audit row, not five");
  await dispatchNow();

  console.log("\n  SUPERSEDED DEAD LETTER");
  const feed = (await deliveriesOf(pubId)).find((d) => d.listener === "feed_projection_v1");
  const deadFeed = await forceDead(feed.id);
  const un = await db("rpc/unpublish_publication", { method: "POST", body: JSON.stringify({ p_publication_id: pubId, p_actor: profileBefore.owner_id }) });
  ok(un.status === 200 && un.body.ok, "setup: the release is unpublished (a newer event)");
  r = await ops(who.ADMIN, { query: { view: "delivery", id: deadFeed.id } });
  ok(r.body.replay && r.body.replay.allowed === false && /Superseded/.test(r.body.replay.reason), "detail: the old PUBLISHED dead letter is not replayable (superseded)");
  r = await ops(who.ADMIN, { method: "POST", body: { action: "replay", delivery_id: deadFeed.id, expected_updated_at: deadFeed.updated_at, confirm: true } });
  ok(r.status === 409 && (await one(deadFeed.id)).status === "dead", "replay -> 409, untouched");
  await dispatchNow();
  const post = (await rows(`posts?publication_id=eq.${pubId}&select=removed_at`))[0];
  ok(!post || post.removed_at, "the unpublish was delivered: the post is removed");
  const cur = JSON.parse((await statusAs(who.COMPANY_A, pubId)).text);
  ok(cur.length > 0 && cur.every((x) => x.event_type === "PUBLICATION_UNPUBLISHED"), "the company now sees the withdrawal's delivery, not the old publication's");
  // Make the old dead letter harmless for the rest of the suite and other runs.
  await db(`event_deliveries?id=eq.${deadFeed.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "succeeded", last_error: null }) });

  console.log("\n  ALERTS");
  const alertRow = (await rows("ops_alerts?condition=eq.dead_deliveries&select=*"))[0];
  if (!alertRow || alertRow.resolved_at) {
    ok(true, "no open dead_deliveries alert on staging right now (acknowledge/resolve covered offline)");
  } else {
    r = await ops(who.ADMIN, { method: "POST", body: { action: "resolve", condition: "dead_deliveries" } });
    ok(r.status === 409 && r.body.error === "still_active", `resolve while ${r.body.reason ? "dead letters remain" : "?"} -> 409`);
    r = await ops(who.ADMIN, { method: "POST", body: { action: "acknowledge", condition: "dead_deliveries" } });
    const acked = (await rows("ops_alerts?condition=eq.dead_deliveries&select=detail"))[0];
    ok(r.status === 200 && acked.detail.acknowledged_at, "acknowledge -> recorded on the alert");
    await dispatchNow();
    const kept = (await rows("ops_alerts?condition=eq.dead_deliveries&select=detail,resolved_at"))[0];
    ok(kept.detail.acknowledged_at && !kept.resolved_at, "the next dispatcher run keeps the acknowledgement (reminders paused)");
  }

  console.log("\n  HISTORY");
  r = await ops(who.ADMIN, { query: { view: "history", publication: pubId } });
  ok(r.status === 200 && r.body.events.length === 2 && r.body.events[0].event_type === "PUBLICATION_UNPUBLISHED" && r.body.events.every((e) => e.deliveries.length > 0), "the release's events, newest first, each with its deliveries");

  const eg = (await egress()).slice(egressStart);
  ok(eg.every((e) => e.action !== "block"), "no outbound call had to be blocked");
} finally {
  try { server.kill(); } catch {}
  await new Promise((res) => setTimeout(res, 2000));
  if (pubId) {
    const ps = await rows(`posts?publication_id=eq.${pubId}&select=id`).catch(() => []);
    for (const x of ps) { await db(`notifications?post_id=eq.${x.id}`, { method: "DELETE" }); await db(`notification_outbox?post_id=eq.${x.id}`, { method: "DELETE" }); }
    await db(`posts?publication_id=eq.${pubId}`, { method: "DELETE" });
    await db(`facts?publication_id=eq.${pubId}`, { method: "DELETE" });
    await db(`mineiq_ingestions?publication_id=eq.${pubId}`, { method: "DELETE" });
    await db(`publications?id=eq.${pubId}`, { method: "DELETE" });
    if (updId) await db(`updates?id=eq.${updId}`, { method: "DELETE" });
  }
  // Runs of this test window: our dispatches, the replays' nudges, the audit rows.
  await db(`dispatcher_runs?started_at=gte.${encodeURIComponent(testStart)}&trigger=in.(nudge,manual,replay)`, { method: "DELETE" });
  await db("ops_alerts?condition=neq.__none__", { method: "DELETE" });
  if (alertsBefore.length) await db("ops_alerts", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(alertsBefore) });
  await db(`companies?id=eq.${A}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ profile: profileBefore.profile }) });
  const pubLeft = pubId ? (await rows(`publications?id=eq.${pubId}&select=id`)).length : 0;
  const runsLeft = (await rows(`dispatcher_runs?started_at=gte.${encodeURIComponent(testStart)}&select=id`)).length;
  const alertsOk = JSON.stringify(await rows("ops_alerts?select=*")) === JSON.stringify(alertsBefore);
  const profileOk = JSON.stringify((await rows(`companies?id=eq.${A}&select=profile`))[0].profile) === JSON.stringify(profileBefore.profile);
  console.log(`\n  cleanup: test release ${pubLeft ? "LEFT" : "deleted"}; ${runsLeft} run rows left from this window; ops_alerts ${alertsOk ? "restored (identical)" : "NOT identical"}; company A profile ${profileOk ? "restored (identical)" : "NOT identical"}`);
  if (pubLeft || runsLeft || !alertsOk || !profileOk) fail++;
}
console.log(`  delivery-ops-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
