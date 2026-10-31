// D22 Phase 4 regression tests -- /api/ops, platform-admin delivery operations.
//   node scripts/delivery-ops-test.mjs
//
// OFFLINE. The real handler runs against a stub Supabase (auth, profiles and
// the outbox tables with PostgREST-style filters, embedding and counts).
// Covers: the admin-only gate (anon 401, company users 403 whatever they ask),
// the summary (health, last successful run, counts, alerts; replay audit rows
// never count as a heartbeat), delivery lists and detail (admin-only error
// text), replay safety (dead letters only, never superseded, confirm +
// expected version, compare-and-set so double clicks and races redispatch
// once, attempts kept, audited, rate-limited, no bulk form), and alert
// acknowledge / resolve (reminders stop; resolve refused while it holds).

const SB = "https://stub-project.supabase.invalid";
Object.assign(process.env, {
  VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_offline_stub_key", SUPABASE_SERVICE_ROLE_KEY: "stub-service-key",
  DISPATCH_SECRET: "stub-dispatch-secret-0123456789", PUBLIC_BASE_URL: "http://127.0.0.1:9",
  POSTMARK_SERVER_TOKEN: "stub-postmark", MESSAGES_FROM_EMAIL: "noreply@stub.invalid", OPS_ALERT_TO: "ops@stub.invalid",
});
delete process.env.MINEEX_ENV;

const USERS = { "tok-admin": { id: "u-admin", email: "admin@stub.invalid", role: "admin" }, "tok-owner": { id: "u-owner", email: "owner@stub.invalid", role: "company" }, "tok-investor": { id: "u-inv", email: "inv@stub.invalid", role: "investor" } };
const CO_A = "aaaaaaaa-0000-4000-8000-00000000000a", CO_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const uuid = () => crypto.randomUUID();
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();

let T, mails, nudges;
function reset() {
  T = { event_deliveries: [], events: [], dispatcher_runs: [], ops_alerts: [], publications: [], companies: [{ id: CO_A, name: "Iso Alpha", slug: "iso-alpha" }, { id: CO_B, name: "Iso Beta", slug: "iso-beta" }] };
  mails = []; nudges = 0;
}
const json = (o, s = 200, extra = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...extra } });
const yieldRandom = async () => { for (let i = Math.floor(Math.random() * 3); i >= 0; i--) await new Promise((r) => setImmediate(r)); };
const val = (r, k) => k.split(".").reduce((o, x) => (o == null ? o : o[x]), r);
function filt(rows, sp) {
  return rows.filter((r) => {
    for (const [k, v] of sp) {
      if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
      const i = v.indexOf("."); const op = v.slice(0, i), x = v.slice(i + 1), cur = val(r, k);
      if (op === "eq" && String(cur) !== x) return false;
      if (op === "neq" && String(cur) === x) return false;
      if (op === "is" && x === "null" && cur != null) return false;
      if (op === "not" && x === "is.null" && cur == null) return false;
      if (op === "in" && !x.replace(/[()]/g, "").split(",").includes(String(cur))) return false;
      if (op === "lt" && !(Date.parse(cur) < Date.parse(x))) return false;
      if (op === "lte" && !(Date.parse(cur) <= Date.parse(x))) return false;
      if (op === "gte" && !(Date.parse(cur) >= Date.parse(x))) return false;
    }
    return true;
  });
}
function embed(table, rows, select) {
  return rows.map((r) => {
    const o = { ...r };
    if (table === "event_deliveries" && /event:events/.test(select)) o.event = T.events.find((e) => e.id === r.event_id) || null;
    if (table === "events" && /deliveries:event_deliveries/.test(select)) o.deliveries = T.event_deliveries.filter((d) => d.event_id === r.id);
    if (table === "publications" && /headline:content->>headline/.test(select)) o.headline = (r.content || {}).headline || null;
    return o;
  });
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  const h = init.headers || {};
  if (url.host === "api.postmarkapp.com") { mails.push(JSON.parse(init.body)); return json({ MessageID: "m" }); }
  if (url.origin === "http://127.0.0.1:9") { nudges++; return json({ ok: true }); }
  if (url.origin !== SB) throw new Error(`unexpected egress to ${url.host}`);
  await yieldRandom();
  const token = String(h.Authorization || "").replace(/^Bearer /, "");
  if (url.pathname === "/auth/v1/user") return USERS[token] ? json({ id: USERS[token].id, email: USERS[token].email }) : json({ msg: "bad jwt" }, 401);
  const sp = url.searchParams, p = url.pathname.replace("/rest/v1/", "");
  if (p === "profiles") { const u = Object.values(USERS).find((x) => `eq.${x.id}` === sp.get("id")); return json(u && USERS[token] && USERS[token].id === u.id ? [{ role: u.role }] : []); }
  if (token !== "stub-service-key") return json({ message: "permission denied" }, 401);   // outbox tables: service role only
  const t = T[p]; if (!t) return json({ message: "no table" }, 404);
  const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : null;
  const prefer = String(h.Prefer || "");
  if (method === "GET") {
    let out = filt(embed(p, t, sp.get("select") || ""), sp);
    const ord = sp.get("order"); if (ord) { const [c, d] = ord.split(",")[0].split("."); out = out.slice().sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (d === "desc" ? -1 : 1)); }
    const total = out.length; const lim = sp.get("limit"); if (lim) out = out.slice(0, +lim);
    return json(out, 200, prefer.includes("count=exact") ? { "content-range": `0-0/${total}` } : {});
  }
  if (method === "POST") {
    if (p === "ops_alerts" && prefer.includes("merge-duplicates")) {
      const ex = t.find((r) => r.condition === body.condition);
      if (ex) Object.assign(ex, body); else t.push({ first_seen: new Date().toISOString(), last_sent: null, resolved_at: null, ...body });
      return new Response(null, { status: 201 });
    }
    const row = { id: uuid(), started_at: new Date().toISOString(), finished_at: null, ...body }; t.push(row);
    return json([row], 201);
  }
  if (method === "PATCH") {
    const hit = filt(t, sp);
    hit.forEach((r) => Object.assign(r, body));
    return prefer.includes("return=representation") ? json(hit.map((r) => ({ ...r }))) : new Response(null, { status: 204 });
  }
  return json({}, 400);
};

const ops = (await import("../api/ops.js")).default;
const { dispatcherHealth, evaluateAlerts } = await import("../api/_dispatchOps.js");
async function call(method, token, { query = {}, body } = {}) {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; }; res.json = (b) => { res.body = b; return res; }; res.setHeader = (k, v) => { res.headers[k] = v; };
  await ops({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, query, body }, res);
  return res;
}
const admin = (m, o) => call(m, "tok-admin", o);

// Fixture: one release per company; deliveries in every state.
function seed() {
  reset();
  const mk = (co, headline, status = "published") => { const p = { id: uuid(), company_id: co, status, published_at: ago(3600), content: { headline } }; T.publications.push(p); return p; };
  const ev = (pub, type = "PUBLICATION_PUBLISHED", ageS = 600) => { const e = { id: uuid(), event_type: type, event_version: 1, publication_id: pub.id, company_id: pub.company_id, actor_user_id: "u-owner", payload: {}, occurred_at: ago(ageS), created_at: ago(ageS) }; T.events.push(e); return e; };
  const dl = (e, listener, status, extra = {}) => { const d = { id: uuid(), event_id: e.id, listener, status, attempts: status === "dead" ? 6 : status === "failed" ? 2 : status === "succeeded" ? 1 : 0, next_attempt_at: ago(-120), lease_expires_at: null, locked_by: null, last_error: null, processed_at: null, created_at: ago(500), updated_at: `${ago(400).slice(0, -1)}123+00:00`, ...extra }; T.event_deliveries.push(d); return d; };
  const pa = mk(CO_A, "Iso Alpha drills 31 m"), pb = mk(CO_B, "Iso Beta raises $4M");
  const ea = ev(pa), eb = ev(pb);
  const F = {
    pa, pb, ea, eb,
    deadA: dl(ea, "in_app_notifications_v1", "dead", { last_error: `followers read failed (503) ${"x".repeat(600)}` }),
    failedA: dl(ea, "mineiq_facts_v1", "failed", { last_error: "openai 500" }),
    okA: dl(ea, "feed_projection_v1", "succeeded"),
    deadB: dl(eb, "feed_projection_v1", "dead", { last_error: "feed_projection upsert failed (500)" }),
    pendingB: dl(eb, "profile_timeline_v1", "pending"),
  };
  // A superseded dead letter: the release was unpublished afterwards.
  const pc = mk(CO_A, "Iso Alpha withdrawn note", "draft");
  const ec1 = ev(pc, "PUBLICATION_PUBLISHED", 900), ec2 = ev(pc, "PUBLICATION_UNPUBLISHED", 300);
  F.superseded = dl(ec1, "feed_projection_v1", "dead", { last_error: "boom" });
  dl(ec2, "feed_projection_v1", "succeeded");
  T.dispatcher_runs.push(
    { id: uuid(), worker: "w1", trigger: "cron", started_at: ago(50), finished_at: ago(49), summary: { ms: 900, summary: [{ listener: "feed_projection_v1", error: "claim failed (503)" }] } },
    { id: uuid(), worker: "w2", trigger: "nudge", started_at: ago(120), finished_at: ago(119), summary: { ms: 400, summary: [{ listener: "feed_projection_v1", claimed: 1 }] } },
  );
  T.ops_alerts.push({ condition: "dead_deliveries", first_seen: ago(3000), last_sent: ago(3000), resolved_at: null, detail: { dead: 3 } });
  return F;
}

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

console.log("\n  ACCESS: PLATFORM ADMINS ONLY");
{
  const F = seed();
  let r = await call("GET", null);
  ok(r.statusCode === 401, "signed out -> 401");
  r = await call("GET", "tok-bogus");
  ok(r.statusCode === 401, "an invalid session -> 401");
  for (const [who, tok] of [["a company owner", "tok-owner"], ["an investor", "tok-investor"]]) {
    for (const view of ["summary", "deliveries", "history"]) {
      r = await call("GET", tok, { query: { view, company: CO_A } });
      ok(r.statusCode === 403 && !JSON.stringify(r.body).includes("followers read failed"), `${who}: view=${view} (even naming their own company) -> 403, no delivery data`);
    }
    r = await call("POST", tok, { body: { action: "replay", delivery_id: F.deadA.id, expected_updated_at: F.deadA.updated_at, confirm: true } });
    ok(r.statusCode === 403 && F.deadA.status === "dead", `${who}: replay -> 403, the delivery is untouched`);
    r = await call("POST", tok, { body: { action: "resolve", condition: "dead_deliveries" } });
    ok(r.statusCode === 403 && !T.ops_alerts[0].resolved_at, `${who}: resolve an alert -> 403`);
  }
  r = await call("PUT", "tok-admin");
  ok(r.statusCode === 405, "other methods -> 405");
  r = await admin("GET", { query: { view: "summary" } });
  ok(r.statusCode === 200 && r.headers["Cache-Control"] === "no-store", "a platform admin -> 200, not cacheable");
}

console.log("\n  SUMMARY");
{
  seed();
  const r = await admin("GET", { query: { view: "summary" } });
  const b = r.body;
  ok(b.health && b.health.ok === true && b.health.last_trigger === "cron", "dispatcher health: last run seconds ago -> ok", JSON.stringify(b.health));
  ok(b.last_success && b.last_success.trigger === "nudge", "last SUCCESSFUL run skips the newer run whose listener errored", JSON.stringify(b.last_success));
  ok(b.last_cron && b.last_cron.trigger === "cron" && b.last_cron.ok === false, "last scheduled run shown separately, marked not ok");
  ok(b.totals.dead === 3 && b.totals.failed === 1 && b.totals.pending === 1 && b.totals.succeeded === 2, "totals by status", JSON.stringify(b.totals));
  ok(b.by_listener.in_app_notifications_v1.dead === 1 && b.by_listener.mineiq_facts_v1.failed === 1 && b.by_listener.feed_projection_v1.dead === 2, "counts by listener and status", JSON.stringify(b.by_listener));
  ok(b.alerts.length === 1 && b.alerts[0].condition === "dead_deliveries", "open alerts listed");
}
{
  // A replay audit row must never look like a heartbeat.
  seed();
  T.dispatcher_runs.length = 0;
  T.dispatcher_runs.push({ id: uuid(), worker: "replay:u-admin", trigger: "replay", started_at: ago(5), finished_at: ago(5), summary: {} });
  const h = await dispatcherHealth();
  ok(h.status === 503 && h.body.last_run_age_seconds === null, "health: a recent replay audit row does not count as a dispatcher run (503, no run)", JSON.stringify(h.body));
  const r = await admin("GET", { query: { view: "summary" } });
  ok(r.body.runs.length === 0 && r.body.replays.length === 1 && r.body.health.ok === false, "summary: replays listed apart from runs; health not ok");
}

console.log("\n  DELIVERY LISTS AND DETAIL");
{
  const F = seed();
  let r = await admin("GET", { query: { view: "deliveries", status: "dead" } });
  ok(r.statusCode === 200 && r.body.deliveries.length === 3 && r.body.deliveries.every((d) => d.status === "dead"), "dead letters listed (all companies)");
  const a = r.body.deliveries.find((d) => d.id === F.deadA.id);
  ok(a && a.company.name === "Iso Alpha" && a.publication.headline === "Iso Alpha drills 31 m" && a.event.event_type === "PUBLICATION_PUBLISHED", "each row names its company, release and event");
  ok(a && a.last_error.length === 300, "error text shown to admins, truncated to 300 characters in lists");
  r = await admin("GET", { query: { view: "deliveries", status: "dead", company: CO_B } });
  ok(r.body.deliveries.length === 1 && r.body.deliveries[0].id === F.deadB.id, "filter by company");
  r = await admin("GET", { query: { view: "deliveries", status: "pending,processing,failed" } });
  ok(r.body.deliveries.length === 2, "pending + retrying together");
  r = await admin("GET", { query: { view: "deliveries", status: "dead", limit: "1" } });
  ok(r.body.deliveries.length === 1 && r.body.next_before, "paged, with a cursor");
  r = await admin("GET", { query: { view: "deliveries", status: "dead);drop" } });
  ok(r.statusCode === 400, "an unknown status -> 400 (never interpolated)");
  r = await admin("GET", { query: { view: "deliveries", company: "not-a-uuid" } });
  ok(r.statusCode === 400, "a malformed company -> 400");
  r = await admin("GET", { query: { view: "delivery", id: F.deadA.id } });
  ok(r.statusCode === 200 && r.body.delivery.last_error.length > 300 && r.body.siblings.length === 3 && r.body.replay.allowed === true, "detail: full error, sibling deliveries, replay allowed", JSON.stringify(r.body.replay));
  r = await admin("GET", { query: { view: "delivery", id: F.superseded.id } });
  ok(r.body.replay.allowed === false && /Superseded/.test(r.body.replay.reason), "detail: a superseded dead letter is NOT replayable, and says why");
  r = await admin("GET", { query: { view: "delivery", id: F.failedA.id } });
  ok(r.body.replay.allowed === false && /retrying automatically/.test(r.body.replay.reason), "detail: a failed delivery already retrying is not replayable");
  r = await admin("GET", { query: { view: "delivery", id: uuid() } });
  ok(r.statusCode === 404, "unknown delivery -> 404");
  r = await admin("GET", { query: { view: "history", publication: F.pa.id } });
  ok(r.statusCode === 200 && r.body.events.length === 1 && r.body.events[0].deliveries.length === 3, "history: a release's events with every delivery");
  r = await admin("GET", { query: { view: "history", company: CO_A } });
  ok(r.body.events.length === 3 && r.body.events.every((e) => e.company_id === CO_A), "history: by company");
}

console.log("\n  REPLAY SAFETY");
{
  let F = seed();
  const base = (d, extra = {}) => ({ action: "replay", delivery_id: d.id, expected_updated_at: d.updated_at, confirm: true, ...extra });
  let r = await admin("POST", { body: base(F.deadA, { confirm: undefined }) });
  ok(r.statusCode === 400 && F.deadA.status === "dead", "without confirm: true -> 400");
  r = await admin("POST", { body: base(F.deadA, { expected_updated_at: undefined }) });
  ok(r.statusCode === 400, "without the version the admin saw -> 400");
  r = await admin("POST", { body: { action: "replay", delivery_id: [F.deadA.id, F.deadB.id], confirm: true, expected_updated_at: F.deadA.updated_at } });
  ok(r.statusCode === 400 && F.deadA.status === "dead" && F.deadB.status === "dead", "a list of deliveries -> 400: no bulk replay");
  r = await admin("POST", { body: { action: "replay", all: true, confirm: true } });
  ok(r.statusCode === 400, "{ all: true } -> 400");
  r = await admin("POST", { body: base(F.failedA) });
  ok(r.statusCode === 409 && F.failedA.status === "failed", "a failed (retrying) delivery -> 409, untouched");
  r = await admin("POST", { body: base(F.okA) });
  ok(r.statusCode === 409 && F.okA.status === "succeeded", "a delivered one -> 409, untouched");
  r = await admin("POST", { body: base(F.superseded) });
  ok(r.statusCode === 409 && F.superseded.status === "dead", "a superseded dead letter -> 409, untouched");
  r = await admin("POST", { body: base(F.deadA, { expected_updated_at: ago(1) }) });
  ok(r.statusCode === 409 && r.body.error === "changed" && F.deadA.status === "dead", "a stale version (changed since loaded) -> 409");
  nudges = 0;
  r = await admin("POST", { body: base(F.deadA) });
  ok(r.statusCode === 200 && F.deadA.status === "pending" && F.deadA.attempts === 6, "a dead letter -> pending, attempts KEPT (one more try)", JSON.stringify(r.body));
  ok(r.body.audit_recorded && T.dispatcher_runs.some((x) => x.trigger === "replay" && x.summary.delivery_id === F.deadA.id && x.summary.by === "u-admin" && x.summary.previous.status === "dead"), "audited: who, which delivery, what it was");
  ok(nudges === 1 && r.body.nudged, "the dispatcher is nudged once");
  ok(r.body.warnings.some((w) => /ONE more attempt/.test(w)), "the response repeats the warnings");
  r = await admin("POST", { body: base({ ...F.deadA, updated_at: r.body.delivery.updated_at }) });
  ok(r.statusCode === 409, "the same replay again (double click) -> 409, nothing redispatched twice");
  ok(T.dispatcher_runs.filter((x) => x.trigger === "replay").length === 1, "  ...one audit row");

  F = seed();
  const shots = await Promise.all(Array.from({ length: 6 }, () => admin("POST", { body: base(F.deadB) })));
  const wins = shots.filter((x) => x.statusCode === 200).length;
  ok(wins === 1 && shots.filter((x) => x.statusCode === 409).length === 5, `6 concurrent replays of one delivery -> exactly one succeeds (${wins}), five 409`);

  F = seed();
  for (let i = 0; i < 10; i++) T.dispatcher_runs.push({ id: uuid(), worker: "replay:u-admin", trigger: "replay", started_at: ago(10), finished_at: ago(10), summary: {} });
  r = await admin("POST", { body: base(F.deadA) });
  ok(r.statusCode === 429 && F.deadA.status === "dead", "the 11th replay in a minute -> 429, untouched");
}

console.log("\n  ALERTS: ACKNOWLEDGE AND RESOLVE");
{
  seed();
  let r = await admin("POST", { body: { action: "resolve", condition: "dead_deliveries" } });
  ok(r.statusCode === 409 && r.body.error === "still_active" && !T.ops_alerts[0].resolved_at, "resolve while dead letters remain -> 409, stays open");
  r = await admin("POST", { body: { action: "acknowledge", condition: "dead_deliveries" } });
  ok(r.statusCode === 200 && T.ops_alerts[0].detail.acknowledged_by === "admin@stub.invalid", "acknowledge records who and when");
  r = await admin("POST", { body: { action: "acknowledge", condition: "dead_deliveries" } });
  ok(r.statusCode === 200 && r.body.already === "acknowledged", "acknowledge again -> idempotent");
  mails = [];
  T.ops_alerts[0].last_sent = ago(2 * 3600);   // a reminder would be due
  const out = await evaluateAlerts();
  ok(out.dead_deliveries === "held" && mails.length === 0, "an acknowledged alert sends no hourly reminder while it holds", JSON.stringify(out));
  ok(T.ops_alerts[0].detail.acknowledged_at && T.ops_alerts[0].detail.dead === 3, "  ...and keeps its acknowledgement through the run's detail refresh");
  T.event_deliveries.forEach((d) => { if (d.status === "dead") d.status = "succeeded"; });
  r = await admin("POST", { body: { action: "resolve", condition: "dead_deliveries" } });
  ok(r.statusCode === 200 && T.ops_alerts[0].resolved_at && T.ops_alerts[0].detail.resolved_by === "admin@stub.invalid" && !T.ops_alerts[0].detail.acknowledged_at, "resolve once the condition clears -> resolved, acknowledgement cleared");
  r = await admin("POST", { body: { action: "resolve", condition: "dead_deliveries" } });
  ok(r.statusCode === 200 && r.body.already === "resolved", "resolve again -> idempotent");
  r = await admin("POST", { body: { action: "resolve", condition: "nope" } });
  ok(r.statusCode === 404, "unknown alert -> 404");
}

console.log("\n  NO MIGRATION 0071");
{
  seed();
  delete T.dispatcher_runs; delete T.ops_alerts;
  const r = await admin("GET", { query: { view: "summary" } });
  ok(r.statusCode === 503 && /0071/.test(r.body.error), "without 0071 the summary says so plainly (503), no internals leaked", JSON.stringify(r.body));
}

console.log("\n  PORTAL MAPPING (src/lib/deliveryStatus.js: what a company is shown)");
{
  const { summarise, settled, EXPECTED } = await import("../src/lib/deliveryStatus.js");
  const row = (listener, state, attempts = 1, event_type = "PUBLICATION_PUBLISHED") => ({ event_type, listener, state, attempts, updated_at: ago(5) });
  const all = (state, attempts) => EXPECTED.PUBLICATION_PUBLISHED.map((l) => row(l, state, attempts));
  let s = summarise(all("delivered"));
  ok(s.state === "delivered" && s.destinations.length === 4 && settled(s), "every destination delivered -> Delivered (settled)");
  s = summarise([row("feed_projection_v1", "delivered"), row("profile_timeline_v1", "delivered")]);
  ok(s.state === "pending" && s.destinations.filter((d) => d.state === "pending").length === 2 && !settled(s), "destinations not picked up yet are Pending, not Delivered (deliveries are created lazily)");
  s = summarise([...all("delivered").slice(0, 3), row("mineiq_facts_v1", "retrying", 0)]);
  ok(s.state === "pending", "retrying with 0 attempts (queued) -> Pending");
  s = summarise([...all("delivered").slice(0, 3), row("mineiq_facts_v1", "retrying", 2)]);
  ok(s.state === "retrying" && !settled(s), "retrying after a failed attempt -> Retrying");
  s = summarise([...all("delivered").slice(0, 2), row("in_app_notifications_v1", "retrying", 2), row("mineiq_facts_v1", "failed", 6)]);
  ok(s.state === "failed" && settled(s), "any destination failed -> Failed overall (worst wins), settled");
  s = summarise([], { createdAt: ago(60) });
  ok(s.state === "pending", "no rows, published a minute ago -> Pending");
  s = summarise([], { createdAt: ago(3 * 86400) });
  ok(s.state === "untracked" && settled(s), "no rows, published days ago -> No delivery record (never a perpetual Pending)");
  s = summarise([row("feed_projection_v1", "delivered", 1, "PUBLICATION_UNPUBLISHED"), row("profile_timeline_v1", "delivered", 1, "PUBLICATION_UNPUBLISHED")]);
  ok(s.state === "delivered" && s.event === "PUBLICATION_UNPUBLISHED" && s.destinations.length === 2, "a withdrawal expects only feed and timeline");
  s = summarise([...all("delivered"), row("device_push_v1", "failed", 6)]);
  ok(s.destinations.some((d) => d.listener === "device_push_v1" && d.label === "Mobile push") && s.state === "failed", "an unlisted destination the database reports is shown, not hidden");
  ok(!JSON.stringify(summarise(all("failed", 6))).includes("error"), "the mapping carries no error field");
}

console.log(`\n  delivery-ops: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
