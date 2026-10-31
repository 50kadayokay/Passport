// D22 Phase 3 live check -- the scheduler path of /api/dispatch against the
// STAGING database (migration 0071 applied there), through the local staging
// server. No schedule is created anywhere: this test plays the scheduler by
// sending exactly what Vercel Cron sends (GET + Authorization: Bearer <secret>),
// with the staging-only STAGING_CRON_SECRET (CRON_SECRET is forbidden on staging).
//
//   node scripts/dispatch-scheduler-live-test.mjs
//
// WRITES (staging only): one "[d22-live] scheduler" release (empty body, so no
// append-only revision: deleted at the end), dispatcher_runs rows for this
// test's runs (deleted at the end), and ops_alerts state (restored to what it
// was). Prints no secrets.

import fs from "node:fs";
import { spawn } from "node:child_process";

const readEnvFile = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const iso = readEnvFile("supabase/staging/.isolation-env"), apiEnv = readEnvFile("supabase/staging/.api-env");
const SB = (iso.ISOLATION_SUPABASE_URL || "").replace(/\/+$/, ""), SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const CRON = apiEnv.STAGING_CRON_SECRET, HEALTH = apiEnv.DISPATCH_HEALTH_TOKEN;
if (!SB || /rvptronniomlqumjhyrr/.test(SB) || !/jmljfovtfxcdhjmtlnva/.test(SB)) { console.error("  refusing: not the staging project"); process.exit(2); }
if (!SERVICE || !CRON || !HEALTH) { console.error("  STAGING_CRON_SECRET / DISPATCH_HEALTH_TOKEN missing from supabase/staging/.api-env"); process.exit(3); }
const A = iso.ISOLATION_COMPANY_A_ID;

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
const get = async (headers = {}, qs = "") => { const r = await fetch(`${API}/api/dispatch${qs}`, { headers }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const cron = (secret = CRON) => get({ authorization: `Bearer ${secret}`, "user-agent": "vercel-cron/1.0" });

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const alertsBefore = (await db("ops_alerts?select=*")).body;
const workers = [];
let pubId = null, updId = null;
const egressStart = (await egress()).length;
console.log(`\n  staging ${new URL(SB).host.split(".")[0]} · the scheduler path (no schedule created)`);
try {
  console.log("\n  AUTHENTICATION");
  let r = await get();
  ok(r.status === 401, "GET with no credential -> 401");
  r = await cron(CRON.slice(0, -2) + "xx");
  ok(r.status === 401, "a wrong cron bearer -> 401");
  r = await get({ "user-agent": "vercel-cron/1.0", "x-vercel-cron-schedule": "* * * * *" });
  ok(r.status === 401, "Vercel's user agent and schedule header without the bearer -> 401");
  r = await get({ authorization: `Bearer ${HEALTH}` });
  ok(r.status === 401, "the health token cannot trigger a run");

  console.log("\n  A MISSED NUDGE IS DELIVERED BY THE SCHEDULED RUN ALONE");
  const u = await db("updates", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: A, body: "   ", status: "draft", detected: { headline: "[d22-live] scheduler" } }) });
  updId = u.body[0].id;
  const p = await db("publications", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: A, update_id: updId, destination_id: "passport", status: "approved", content: { headline: "[d22-live] scheduler", post_type: "press_release" } }) });
  pubId = p.body[0].id;
  const owner = (await db(`companies?id=eq.${A}&select=owner_id`)).body[0].owner_id;
  // Straight to the RPC, as the service role: the route's nudge never happens.
  const pr = await db("rpc/publish_publication", { method: "POST", body: JSON.stringify({ p_publication_id: pubId, p_actor: owner }) });
  ok(pr.status === 200 && pr.body.ok, "published through the RPC with NO nudge (a missed trigger)");
  ok((await db(`posts?publication_id=eq.${pubId}&select=id`)).body.length === 0, "nothing projected yet -- without a scheduler it would wait");
  r = await cron();
  workers.push(r.body.worker);
  ok(r.status === 200 && r.body.trigger === "cron" && r.body.heartbeat === true, "a scheduled run (GET + Bearer) -> 200, trigger 'cron', heartbeat recorded", JSON.stringify({ s: r.status, t: r.body.trigger }));
  ok((await db(`posts?publication_id=eq.${pubId}&select=id,removed_at`)).body.length === 1, "DATABASE: the scheduled run projected the release into the feed");
  const run = (await db(`dispatcher_runs?worker=eq.${r.body.worker}&select=trigger,started_at,finished_at,summary`)).body[0];
  ok(run && run.trigger === "cron" && run.finished_at && run.summary && run.summary.summary, "DATABASE: dispatcher_runs has this run (trigger, start, finish, per-listener summary)");

  console.log("\n  ALERTS (staging has dead letters from before the fix)");
  const dead = (await db("event_deliveries?status=eq.dead&select=id")).body.length;
  const row = (await db("ops_alerts?condition=eq.dead_deliveries&select=*")).body[0];
  ok(dead > 0 ? (row && !row.resolved_at && row.detail.dead === dead) : true, `dead_deliveries recorded in ops_alerts (${dead} dead) -- ${r.body.alerts.dead_deliveries}`, JSON.stringify(r.body.alerts));
  const mails1 = (await egress()).slice(egressStart).filter((e) => e.provider === "postmark");
  ok(mails1.length <= 1 && mails1.every((m) => m.action === "mock" && /\.invalid$/.test(m.to || "")), `alert email: ${mails1.length} sent, mocked, to a .invalid ops address`);
  const r2 = await cron(); workers.push(r2.body.worker);
  const mails2 = (await egress()).slice(egressStart).filter((e) => e.provider === "postmark");
  ok(r2.body.alerts.dead_deliveries === "held" && mails2.length === mails1.length, "the next scheduled run: held, no second email");

  console.log("\n  HEALTH");
  r = await get({}, "?health=1");
  ok(r.status === 401, "health with no token -> 401");
  r = await get({ authorization: `Bearer ${CRON}` }, "?health=1");
  ok(r.status === 401, "the cron secret does not read health");
  r = await get({ authorization: `Bearer ${HEALTH}` }, "?health=1");
  ok(r.status === 200 && r.body.ok && r.body.last_trigger === "cron" && r.body.last_run_age_seconds <= 30 && r.body.open_alerts.includes("dead_deliveries"), "health token -> 200: last run seconds ago, open alerts listed", JSON.stringify(r.body));

  console.log("\n  OVERLAPPING SCHEDULED RUNS");
  const rs = await Promise.all([cron(), cron(), cron()]);
  rs.forEach((x) => workers.push(x.body.worker));
  ok(rs.every((x) => x.status === 200 && x.body.heartbeat), "3 overlapping runs all complete with heartbeats");
  ok((await db(`posts?publication_id=eq.${pubId}&select=id`)).body.length === 1, "DATABASE: still exactly one feed post (no duplicate projection)");

  const eg = (await egress()).slice(egressStart);
  ok(eg.every((e) => e.action !== "block"), "no outbound call had to be blocked");
} finally {
  try { server.kill(); } catch {}
  await new Promise((res) => setTimeout(res, 1500));
  if (pubId) {
    await db(`posts?publication_id=eq.${pubId}`, { method: "DELETE" });
    await db(`publications?id=eq.${pubId}`, { method: "DELETE" });
    if (updId) await db(`updates?id=eq.${updId}`, { method: "DELETE" });
  }
  for (const w of workers.filter(Boolean)) await db(`dispatcher_runs?worker=eq.${w}`, { method: "DELETE" });
  // Restore ops_alerts exactly.
  await db("ops_alerts?condition=neq.__none__", { method: "DELETE" });
  if (alertsBefore.length) await db("ops_alerts", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(alertsBefore) });
  const runsLeft = workers.length ? (await db(`dispatcher_runs?worker=in.(${workers.filter(Boolean).join(",")})&select=id`)).body.length : 0;
  const pubLeft = pubId ? (await db(`publications?id=eq.${pubId}&select=id`)).body.length : 0;
  const alertsNow = (await db("ops_alerts?select=*")).body;
  const restored = JSON.stringify(alertsNow) === JSON.stringify(alertsBefore);
  console.log(`\n  cleanup: test release ${pubLeft ? "LEFT" : "deleted"}; ${runsLeft} test heartbeat rows left; ops_alerts ${restored ? "restored (verified identical)" : "NOT identical"}`);
  if (runsLeft || pubLeft || !restored) fail++;
}
console.log(`  dispatch-scheduler-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
