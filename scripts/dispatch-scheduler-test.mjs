// D22 Phase 3 regression tests -- the scheduler path of /api/dispatch.
//   node scripts/dispatch-scheduler-test.mjs
//
// OFFLINE. The real handler runs against a stub database holding the outbox
// counters, dispatcher_runs and ops_alerts, and a stub Postmark. Covers: cron
// authentication (fail closed), the heartbeat, the health endpoint and its
// separate token, alert raise / hold / remind / resolve with one email per hour,
// recording without an ops address, overlapping runs, and a monitoring failure
// that must not stop delivery.

const SB = "https://stub-project.supabase.invalid";
Object.assign(process.env, {
  VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_stub", SUPABASE_SERVICE_ROLE_KEY: "stub-service-key",
  DISPATCH_SECRET: "stub-dispatch-secret-0123456789", CRON_SECRET: "cron-secret-0123456789abcdef",
  DISPATCH_HEALTH_TOKEN: "health-token-0123456789abcdef", POSTMARK_SERVER_TOKEN: "stub-postmark",
  MESSAGES_FROM_EMAIL: "noreply@stub.invalid", OPS_ALERT_TO: "ops@stub.invalid",
});
delete process.env.MINEEX_ENV;

let T, failRunsInsert = false, mails = [], claims = 0;
const reset = () => { T = { event_deliveries: [], dispatcher_runs: [], ops_alerts: [] }; failRunsInsert = false; mails = []; claims = 0; };
const json = (o, s = 200, extra = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...extra } });
const yieldRandom = async () => { for (let i = Math.floor(Math.random() * 3); i >= 0; i--) await new Promise((r) => setImmediate(r)); };
function filt(rows, sp) {
  return rows.filter((r) => {
    for (const [k, v] of sp) {
      if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
      const i = v.indexOf("."); const op = v.slice(0, i), val = v.slice(i + 1);
      if (op === "eq" && String(r[k]) !== val) return false;
      if (op === "is" && val === "null" && r[k] != null) return false;
      if (op === "not" && val === "is.null" && r[k] == null) return false;
      if (op === "in" && !val.replace(/[()]/g, "").split(",").includes(String(r[k]))) return false;
      if (op === "lt" && !(Date.parse(r[k]) < Date.parse(val))) return false;
      if (op === "lte" && !(Date.parse(r[k]) <= Date.parse(val))) return false;
    }
    return true;
  });
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  if (url.host === "api.postmarkapp.com") { mails.push(JSON.parse(init.body)); return json({ MessageID: "m" }); }
  if (url.origin !== SB) throw new Error(`unexpected egress to ${url.host}`);
  await yieldRandom();
  const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : null;
  const sp = url.searchParams, p = url.pathname.replace("/rest/v1/", "");
  if (p === "rpc/claim_deliveries") { claims++; return json([]); }
  if (p === "rpc/complete_delivery") return json(true);
  const t = T[p]; if (!t) return json({ message: "no table" }, 404);
  if (p === "dispatcher_runs" && method === "POST" && failRunsInsert) return json({ message: "down" }, 500);
  if (method === "GET") {
    let out = filt(t, sp);
    const ord = sp.get("order"); if (ord) { const [c, d] = ord.split("."); out = out.slice().sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (d === "desc" ? -1 : 1)); }
    const lim = sp.get("limit"); const total = out.length; if (lim) out = out.slice(0, +lim);
    return json(out, 200, String((init.headers || {}).Prefer || "").includes("count=exact") ? { "content-range": `0-0/${total}` } : {});
  }
  if (method === "POST") {
    const prefer = String((init.headers || {}).Prefer || "");
    if (p === "ops_alerts" && prefer.includes("merge-duplicates")) {
      const ex = t.find((r) => r.condition === body.condition);
      if (ex) Object.assign(ex, body); else t.push({ first_seen: new Date().toISOString(), last_sent: null, resolved_at: null, ...body });
      return new Response(null, { status: 201 });
    }
    const row = { id: crypto.randomUUID(), started_at: new Date().toISOString(), finished_at: null, ...body }; t.push(row);
    return json([row], 201);
  }
  if (method === "PATCH") { filt(t, sp).forEach((r) => Object.assign(r, body)); return new Response(null, { status: 204 }); }
  return json({}, 400);
};

const dispatch = (await import("../api/dispatch.js")).default;
async function call(method, headers = {}, { query = {}, body = undefined } = {}) {
  const res = { statusCode: 200, body: null }; res.status = (c) => { res.statusCode = c; return res; }; res.json = (b) => { res.body = b; return res; };
  await dispatch({ method, headers, query, body }, res);
  return res;
}
const cron = (secret = process.env.CRON_SECRET) => call("GET", { authorization: `Bearer ${secret}` });

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

console.log("\n  CRON AUTHENTICATION (fail closed)");
reset();
{
  let r = await call("GET");
  ok(r.statusCode === 401 && claims === 0, "GET with no credential -> 401, nothing claimed");
  r = await cron("cron-secret-WRONG-0123456789ab");
  ok(r.statusCode === 401 && claims === 0, "wrong bearer (same length) -> 401");
  r = await cron("short");
  ok(r.statusCode === 401, "wrong bearer (other length) -> 401");
  r = await call("GET", { "x-dispatch-secret": process.env.DISPATCH_SECRET });
  ok(r.statusCode === 401, "GET with only the nudge secret -> 401 (a GET is a cron run; only the cron bearer authenticates it)");
  r = await call("GET", { "user-agent": "vercel-cron/1.0", "x-vercel-cron-schedule": "* * * * *" });
  ok(r.statusCode === 401, "Vercel's user agent / schedule header alone -> 401 (client-settable, never trusted)");
  r = await call("POST", { authorization: `Bearer ${process.env.CRON_SECRET}` }, { body: {} });
  ok(r.statusCode === 401, "POST with the cron bearer but no nudge secret -> 401");
  r = await cron();
  ok(r.statusCode === 200 && r.body.trigger === "cron" && claims > 0, "the correct cron bearer -> 200, trigger 'cron', listeners claimed");
  const saved = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  r = await call("GET", { authorization: "Bearer " });
  ok(r.statusCode === 401, "CRON_SECRET unset -> every GET refused (never open)");
  process.env.CRON_SECRET = "too-short";
  r = await cron("too-short");
  ok(r.statusCode === 401, `a CRON_SECRET shorter than 16 characters is treated as unset`);
  process.env.CRON_SECRET = saved;
  r = await call("POST", { "x-dispatch-secret": process.env.DISPATCH_SECRET }, { body: { trigger: "immediate" } });
  ok(r.statusCode === 200 && r.body.trigger === "nudge", "the nudge path (POST + x-dispatch-secret) still works, recorded as 'nudge'");
  r = await call("PUT");
  ok(r.statusCode === 405, "other methods -> 405");
}

console.log("\n  HEARTBEAT");
reset();
{
  const r = await cron();
  const run = T.dispatcher_runs[0];
  ok(r.body.heartbeat === true && T.dispatcher_runs.length === 1 && run.trigger === "cron" && run.finished_at && run.summary && Array.isArray(run.summary.summary), "every run writes a heartbeat row: trigger, finished_at, summary");
  failRunsInsert = true;
  const r2 = await cron();
  ok(r2.statusCode === 200 && r2.body.heartbeat === false && claims > 0, "the heartbeat table failing does NOT stop delivery (run completes, heartbeat:false)");
}

console.log("\n  HEALTH (separate token, for an external monitor)");
reset();
{
  let r = await call("GET", {}, { query: { health: "1" } });
  ok(r.statusCode === 401, "health with no token -> 401");
  r = await call("GET", { authorization: `Bearer ${process.env.CRON_SECRET}` }, { query: { health: "1" } });
  ok(r.statusCode === 401, "the CRON secret does not read health (separate credentials)");
  r = await call("GET", { authorization: `Bearer ${process.env.DISPATCH_HEALTH_TOKEN}` });
  ok(r.statusCode === 401 && claims === 0, "the HEALTH token cannot trigger a dispatch run");
  const health = () => call("GET", { authorization: `Bearer ${process.env.DISPATCH_HEALTH_TOKEN}` }, { query: { health: "1" } });
  r = await health();
  ok(r.statusCode === 503 && r.body.ok === false, "no run recorded yet -> 503");
  await cron();
  r = await health();
  ok(r.statusCode === 200 && r.body.ok && r.body.last_trigger === "cron" && r.body.last_run_age_seconds <= 5, "a run finished just now -> 200", JSON.stringify(r.body));
  T.dispatcher_runs.forEach((x) => { x.finished_at = new Date(Date.now() - 4 * 60 * 1000).toISOString(); });
  r = await health();
  ok(r.statusCode === 503 && r.body.last_run_age_seconds >= 230, "the last run finished 4 minutes ago -> 503 (a per-minute schedule has stopped)");
}

console.log("\n  ALERTS: raise, hold, remind, resolve -- one email per condition per hour");
reset();
{
  T.event_deliveries.push({ id: "d1", status: "dead", next_attempt_at: new Date().toISOString() });
  let r = await cron();
  const row = () => T.ops_alerts.find((a) => a.condition === "dead_deliveries");
  ok(r.body.alerts.dead_deliveries === "raised" && row() && !row().resolved_at && mails.length === 1 && /dead_deliveries/.test(mails[0].Subject) && mails[0].To === "ops@stub.invalid", "a dead delivery -> alert RAISED, recorded, one email to OPS_ALERT_TO", JSON.stringify(r.body.alerts));
  r = await cron();
  ok(r.body.alerts.dead_deliveries === "held" && mails.length === 1, "the next run while it holds -> no second email (held)");
  row().last_sent = new Date(Date.now() - 61 * 60 * 1000).toISOString();
  r = await cron();
  ok(r.body.alerts.dead_deliveries === "reminded" && mails.length === 2, "after an hour -> one reminder email");
  T.event_deliveries = [];
  r = await cron();
  ok(r.body.alerts.dead_deliveries === "resolved" && row().resolved_at && mails.length === 3 && /resolved/.test(mails[2].Subject), "condition clears -> RESOLVED, one resolution email");
  r = await cron();
  ok(r.body.alerts.dead_deliveries === "clear" && mails.length === 3, "afterwards -> clear, silent");
  T.event_deliveries.push({ id: "d2", status: "processing", lease_expires_at: new Date(Date.now() - 60_000).toISOString(), next_attempt_at: new Date().toISOString() });
  T.event_deliveries.push({ id: "d3", status: "failed", next_attempt_at: new Date(Date.now() - 10 * 60_000).toISOString() });
  r = await cron();
  ok(r.body.alerts.stuck_leases === "raised" && r.body.alerts.backlog_age === "raised", "an expired lease -> stuck_leases; a delivery due 10 min ago -> backlog_age", JSON.stringify(r.body.alerts));
}
{
  reset();
  const saved = process.env.OPS_ALERT_TO; delete process.env.OPS_ALERT_TO;
  T.event_deliveries.push({ id: "d1", status: "dead", next_attempt_at: new Date().toISOString() });
  const r = await cron();
  process.env.OPS_ALERT_TO = saved;
  ok(r.body.alerts.dead_deliveries === "raised" && T.ops_alerts.length >= 1 && mails.length === 0 && /not configured/.test(r.body.alerts.dead_deliveries_email), "without OPS_ALERT_TO: the alert is RECORDED, no email, and the run says why");
}

console.log("\n  OVERLAPPING RUNS");
reset();
{
  const rs = await Promise.all([cron(), cron(), cron()]);
  ok(rs.every((r) => r.statusCode === 200) && T.dispatcher_runs.length === 3 && T.dispatcher_runs.every((x) => x.finished_at), "3 overlapping scheduled runs: all complete, each with its own heartbeat (claims are leased with SKIP LOCKED in the database)");
}

console.log("\n  SOURCE PINS");
{
  const fs = await import("node:fs");
  const d = fs.readFileSync(new URL("../api/dispatch.js", import.meta.url), "utf8");
  const a = fs.readFileSync(new URL("../api/_cronAuth.js", import.meta.url), "utf8");
  ok(/if \(!isTrustedCron\(req\)\) return res\.status\(401\)/.test(d) && /timingSafeEqual/.test(a) && /CRON_SECRET_MIN/.test(a), "GET runs require isTrustedCron (constant-time, minimum length)");
  ok(/IS_STAGING \? process\.env\.STAGING_CRON_SECRET : process\.env\.CRON_SECRET/.test(a), "staging uses STAGING_CRON_SECRET (CRON_SECRET is forbidden on staging)");
  const v = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  ok(!(v.crons || []).some((c) => /\/api\/dispatch/.test(c.path)), "vercel.json has NO dispatch cron (not activated without approval)");
}

console.log(`\n  dispatch-scheduler: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
