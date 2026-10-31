// D22 Phase 1 regression tests -- publishing delivery never completes work it
// did not do.
//   node scripts/publishing-reliability-test.mjs
//
// OFFLINE. The real dispatcher (api/dispatch.js) and listeners
// (api/_listeners.js) run in-process against an in-memory PostgREST stand-in
// that models the outbox faithfully: claim_deliveries (creates missing delivery
// rows, leases, attempts += 1, never hands one delivery to two workers),
// complete_delivery (only the lease holder; backoff 30 s * 2^attempts; dead
// after 6), the same unique keys the database has (posts.publication_id,
// notifications(user_id,post_id,kind), notification_outbox(post_id,user_id,token),
// mineiq_ingestions(publication_id,revision), facts(company_id,fact_key)), and
// PostgREST's 1000-row page cap. Faults are injected per table and verb.
// The model clock can be advanced to run backoff without waiting.

process.env.VITE_SUPABASE_URL = "https://stub-project.supabase.invalid";
process.env.VITE_SUPABASE_ANON_KEY = "sb_publishable_stubKeyForOfflineTests";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";
process.env.DISPATCH_SECRET = "stub-dispatch-secret";
process.env.OPENAI_API_KEY = "stub-openai";
process.env.PUBLIC_BASE_URL = "https://app.mineex.invalid";
delete process.env.MINEEX_ENV;
const SB = process.env.VITE_SUPABASE_URL;

// ------------------------------------------------------------------ model --
let skew = 0;                                  // model clock offset (backoff)
const mnow = () => Date.now() + skew;
let T = {}; let faults = {}; let maxUrl = 0; let aiCalls = 0; let aiFail = 0;
const seq = { n: 0 };
const uid = (p) => `${p}-${(++seq.n).toString().padStart(6, "0")}`;
const uuid = () => crypto.randomUUID();
const CO_A = "aaaaaaaa-0000-4000-8000-00000000000a", CO_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const SUBS = [
  ["feed_projection_v1", "PUBLICATION_PUBLISHED"], ["feed_projection_v1", "PUBLICATION_UNPUBLISHED"], ["feed_projection_v1", "PUBLICATION_REVISED"],
  ["in_app_notifications_v1", "PUBLICATION_PUBLISHED"],
  ["mineiq_facts_v1", "PUBLICATION_PUBLISHED"], ["mineiq_facts_v1", "PUBLICATION_REVISED"],
  ["profile_timeline_v1", "PUBLICATION_PUBLISHED"], ["profile_timeline_v1", "PUBLICATION_REVISED"],
  ["device_push_v1", "PUBLICATION_PUBLISHED"],   // subscribed here to test it (0055 is deferred in production)
];
// Migration 0071 (proposed) adds this subscription; tests toggle it.
const SUB_0071 = ["profile_timeline_v1", "PUBLICATION_UNPUBLISHED"];
function reset() {
  skew = 0; faults = {}; maxUrl = 0; aiCalls = 0; aiFail = 0;
  T = { publications: [], updates: [], companies: [{ id: CO_A, name: "Iso Alpha", slug: "iso-alpha", timeline: [] }, { id: CO_B, name: "Iso Beta", slug: "iso-beta", timeline: [] }],
        posts: [], company_follows: [], notification_prefs: [], push_tokens: [], notifications: [], notification_outbox: [],
        mineiq_ingestions: [], facts: [], release_revisions: [], events: [], event_deliveries: [] };
}
const fault = (key) => { if (faults[key] > 0) { faults[key]--; return true; } return false; };

function filterRows(rows, sp) {
  return rows.filter((r) => {
    for (const [k, v] of sp) {
      if (["select", "order", "limit", "offset", "on_conflict"].includes(k)) continue;
      const i = v.indexOf("."); const op = v.slice(0, i), val = v.slice(i + 1);
      if (op === "eq" && String(r[k]) !== val) return false;
      if (op === "is" && val === "null" && r[k] != null) return false;
      if (op === "in") { const set = val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")); if (!set.includes(String(r[k]))) return false; }
    }
    return true;
  });
}
function page(rows, sp) {
  let out = rows.slice();
  const order = sp.get("order");
  if (order) { const [c, d] = order.split("."); out.sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0) * (d === "desc" ? -1 : 1)); }
  const off = Number(sp.get("offset") || 0); const lim = Math.min(Number(sp.get("limit") || 1000), 1000);   // PostgREST cap
  return out.slice(off, off + lim);
}
const UNIQUE = { posts: ["publication_id"], notifications: ["user_id", "post_id", "kind"], notification_outbox: ["post_id", "user_id", "token"],
                 mineiq_ingestions: ["publication_id", "revision"], facts: ["company_id", "fact_key"] };

function claim(listener, worker, limit, lease) {
  // Atomic (no await): create missing deliveries, then lease due ones.
  for (const e of T.events) {
    if (!SUBS.some(([l, t]) => l === listener && t === e.event_type)) continue;
    if (!T.event_deliveries.some((d) => d.event_id === e.id && d.listener === listener)) T.event_deliveries.push({ id: uid("d"), event_id: e.id, listener, status: "pending", attempts: 0, next_attempt_at: 0, lease_expires_at: null, locked_by: null, last_error: null });
  }
  const due = T.event_deliveries.filter((d) => d.listener === listener && (((d.status === "pending" || d.status === "failed") && d.next_attempt_at <= mnow()) || (d.status === "processing" && d.lease_expires_at < mnow())))
    .sort((a, b) => a.next_attempt_at - b.next_attempt_at).slice(0, Math.max(1, Math.min(limit, 100)));
  for (const d of due) { d.status = "processing"; d.attempts++; d.lease_expires_at = mnow() + lease * 1000; d.locked_by = worker; }
  return due.map((d) => T.events.find((e) => e.id === d.event_id));
}
function complete(eventId, listener, worker, ok, error) {
  const d = T.event_deliveries.find((x) => x.event_id === eventId && x.listener === listener && x.locked_by === worker && x.status === "processing");
  if (!d) return false;
  if (ok) Object.assign(d, { status: "succeeded", last_error: null, locked_by: null, lease_expires_at: null });
  else Object.assign(d, { status: d.attempts >= 6 ? "dead" : "failed", last_error: error, next_attempt_at: mnow() + 30_000 * 2 ** Math.min(d.attempts, 8), locked_by: null, lease_expires_at: null });
  return true;
}

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const yieldRandom = async () => { for (let i = Math.floor(Math.random() * 3); i >= 0; i--) await new Promise((r) => setImmediate(r)); };
const DISPATCH_CALLS = [];
globalThis.fetch = async (input, init = {}) => {
  const raw = String(input instanceof Request ? input.url : input);
  const url = new URL(raw);
  const method = (init.method || "GET").toUpperCase();
  if (url.host === "api.openai.com") {
    aiCalls++;
    if (aiFail > 0) { aiFail--; return json({ error: { message: "simulated AI outage" } }, 503); }
    const facts = [{ kind: "capital", subject: "Iso Alpha", data: { shares: "38.2M" }, quote: "38.2 million shares outstanding.", confidence: 0.9, current: true }];
    return json({ choices: [{ message: { tool_calls: [{ function: { name: "report_facts", arguments: JSON.stringify({ facts }) } }] } }], usage: {} });
  }
  if (url.host === "app.mineex.invalid") { DISPATCH_CALLS.push(url.pathname); return json({ ok: true }); }
  if (url.origin !== SB) throw new Error(`unexpected egress to ${url.host}`);
  await yieldRandom();
  if (method === "GET") maxUrl = Math.max(maxUrl, raw.length);
  const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : null;
  const sp = url.searchParams;
  const p = url.pathname;
  if (p === "/rest/v1/rpc/claim_deliveries") return json(claim(body.p_listener, body.p_worker, body.p_limit, body.p_lease_seconds));
  if (p === "/rest/v1/rpc/complete_delivery") return json(complete(body.p_event_id, body.p_listener, body.p_worker, body.p_ok, body.p_error));
  if (p === "/rest/v1/rpc/remove_timeline_entry") {
    const co = T.companies.find((c) => c.id === body.p_company);
    co.timeline = co.timeline.filter((x) => x.key !== body.p_key);
    return json({ ok: true, remaining: co.timeline.length });
  }
  if (p === "/rest/v1/rpc/upsert_timeline_entry") {
    if (fault("timeline:RPC")) return json({ message: "down" }, 500);
    const co = T.companies.find((c) => c.id === body.p_company); const e = body.p_entry;
    co.timeline = [...co.timeline.filter((x) => x.key !== e.key), e];
    return json({ ok: true });
  }
  if (p === "/rest/v1/rpc/revise_publication") {
    // Model of 0051's revise_publication: append-only revisions; revision 1 is
    // the original; only revision >= 2 emits PUBLICATION_REVISED; unchanged is a no-op.
    const pub = T.publications.find((x) => x.id === body.p_publication_id);
    if (!pub) return json({ ok: false, error: "not_found" });
    if (body.p_actor !== "u-owner") return json({ ok: false, error: "forbidden" });
    if (pub.status !== "published") return json({ ok: false, error: "not_published" });
    const revs = T.release_revisions.filter((r) => r.publication_id === pub.id).sort((a, b) => b.revision - a.revision);
    const prev = revs[0];
    if (prev && prev.body === body.p_body && (prev.headline || "") === (body.p_headline || "")) return json({ ok: true, unchanged: true, revision: prev.revision });
    const rev = { id: uuid(), publication_id: pub.id, revision: (prev ? prev.revision : 0) + 1, headline: body.p_headline, body: body.p_body };
    T.release_revisions.push(rev);
    pub.content = { ...pub.content, headline: body.p_headline, body: body.p_body };
    if (rev.revision > 1) addEvent("PUBLICATION_REVISED", pub, { revision: rev.revision, revision_id: rev.id });
    return json({ ok: true, revision: rev.revision, revision_id: rev.id, publication_id: pub.id });
  }
  if (p === "/auth/v1/user") { const t = String((init.headers || {}).Authorization || "").replace("Bearer ", ""); return t === "tok-admin" ? json({ id: "u-admin" }) : t === "tok-user" ? json({ id: "u-user" }) : t === "tok-owner" ? json({ id: "u-owner" }) : json({}, 401); }
  if (p === "/rest/v1/profiles") { const t = String((init.headers || {}).Authorization || "").replace("Bearer ", ""); return json([{ role: t === "tok-admin" ? "admin" : "company" }]); }
  const table = p.replace("/rest/v1/", "");
  if (!T[table]) return json({ message: `stub: no table ${table}` }, 404);
  if (fault(`${table}:${method}`)) return json({ message: `simulated ${method} failure on ${table}` }, 503);
  if (method === "GET") return json(page(filterRows(T[table], sp), sp));
  if (method === "PATCH") { const rows = filterRows(T[table], sp); rows.forEach((r) => Object.assign(r, body)); return new Response(null, { status: 204 }); }
  if (method === "DELETE") { const rows = filterRows(T[table], sp); T[table] = T[table].filter((r) => !rows.includes(r)); return new Response(null, { status: 204 }); }
  if (method === "POST") {
    const list = Array.isArray(body) ? body : [body];
    const prefer = String((init.headers || {}).Prefer || "");
    const keys = UNIQUE[table];
    const written = [];
    for (const row of list) {
      const clash = keys && T[table].find((r) => keys.every((k) => String(r[k]) === String(row[k])));
      if (clash) {
        if (prefer.includes("merge-duplicates")) { Object.assign(clash, row); written.push(clash); }
        else if (prefer.includes("ignore-duplicates")) continue;
        else return json({ code: "23505" }, 409);
      } else {
        const r = { id: uuid(), ingested_at: new Date(mnow()).toISOString(), ...row }; T[table].push(r); written.push(r);
      }
    }
    return prefer.includes("return=representation") ? json(written, 201) : new Response(null, { status: 201 });
  }
  return json({ message: "unhandled" }, 400);
};

const dispatch = (await import("../api/dispatch.js")).default;
const L = await import("../api/_listeners.js");
async function drain(secret = process.env.DISPATCH_SECRET, body = {}) {
  const res = { statusCode: 200, body: null }; res.status = (c) => { res.statusCode = c; return res; }; res.json = (b) => { res.body = b; return res; };
  await dispatch({ method: "POST", headers: secret ? { "x-dispatch-secret": secret } : {}, body, query: {} }, res);
  return res;
}
const delivery = (eventId, listener) => T.event_deliveries.find((d) => d.event_id === eventId && d.listener === listener);
const advance = (ms) => { skew += ms; };

function publishRelease({ company = CO_A, headline = "Iso Alpha drills 31 m of 4.8 g/t", hoursAgo = 0, body = "Iso Alpha drilled 31 m of 4.8 g/t gold." } = {}) {
  const upd = { id: uuid(), company_id: company, body, detected: { headline, materiality: "High", summary: "s", category: "Drilling" }, published_on: "2026-10-30" };
  const pub = { id: uuid(), company_id: company, update_id: upd.id, destination_id: "passport", status: "published", content: { headline, body: "summary", post_type: "press_release" }, published_at: new Date().toISOString() };
  T.updates.push(upd); T.publications.push(pub);
  const at = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
  const ev = { id: uuid(), event_type: "PUBLICATION_PUBLISHED", publication_id: pub.id, company_id: company, payload: { publication_id: pub.id, publish_seq: 1 }, occurred_at: at, created_at: at };
  T.events.push(ev);
  return { pub, ev };
}
const addEvent = (type, pub, extra = {}) => { const e = { id: uuid(), event_type: type, publication_id: pub.id, company_id: pub.company_id, payload: { publication_id: pub.id, ...extra }, occurred_at: new Date().toISOString(), created_at: new Date().toISOString() }; T.events.push(e); return e; };

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

// ================================================================ baseline ==
console.log("\n  BASELINE: one release reaches every projection once");
reset();
{
  const u1 = uuid(), u2 = uuid();
  T.company_follows.push({ user_id: u1, company_id: CO_A }, { user_id: u2, company_id: CO_A });
  T.push_tokens.push({ user_id: u1, token: "tok-u1", platform: "ios" });
  const { pub, ev } = publishRelease();
  const r = await drain();
  ok(r.statusCode === 200, "dispatch 200");
  ok(T.posts.length === 1 && T.posts[0].company_id === CO_A && T.posts[0].publication_id === pub.id, "one feed post, on the publication's company");
  ok(T.notifications.length === 2 && T.notification_outbox.length === 1, "two in-app notifications, one push queued");
  ok(T.facts.length === 1 && T.mineiq_ingestions[0].facts_written === 1, "Mine IQ: one fact, claim finished (facts_written = 1)");
  ok(T.companies[0].timeline.length === 1, "timeline entry written");
  ok(["feed_projection_v1", "in_app_notifications_v1", "mineiq_facts_v1", "profile_timeline_v1", "device_push_v1"].every((l) => delivery(ev.id, l).status === "succeeded"), "every delivery succeeded");
  ok(!("media_url" in T.posts[0]), "a press release does not send media_url (projects on a database without the legacy column)");
  const r2 = await drain();
  ok(T.posts.length === 1 && T.notifications.length === 2 && T.notification_outbox.length === 1 && T.facts.length === 1, "a second drain writes nothing twice");
  ok(r2.body.summary.every((s) => !s.claimed), "  ...and claims nothing");
}

// ================================================ read failures are retried ==
console.log("\n  READ FAILURES NO LONGER COMPLETE THE DELIVERY");
for (const [listener, table, effect] of [
  ["feed_projection_v1", "publications", () => T.posts.length],
  ["profile_timeline_v1", "publications", () => T.companies[0].timeline.length],
  ["mineiq_facts_v1", "publications", () => T.facts.length],
  ["in_app_notifications_v1", "company_follows", () => T.notifications.length],
]) {
  reset();
  T.company_follows.push({ user_id: uuid(), company_id: CO_A });
  const { ev } = publishRelease();
  // Fail exactly this listener's first read of `table`.
  const before = { ...faults };
  if (listener === "feed_projection_v1" || listener === "in_app_notifications_v1") faults[`${table}:GET`] = 1;
  else {
    // Let the feed read publications first, then fail the target listener's read.
    await drain(); for (const d of T.event_deliveries) if (d.listener === listener) Object.assign(d, { status: "pending", attempts: 0 });
    if (listener === "mineiq_facts_v1") { T.facts = []; T.mineiq_ingestions = []; } else T.companies[0].timeline = [];
    faults[`${table}:GET`] = 1;
  }
  await drain();
  const d = delivery(ev.id, listener);
  ok(d.status === "failed" && /read failed \(503\)/.test(d.last_error || "") && effect() === 0, `${listener}: a 503 on the ${table} read -> delivery FAILED (retry scheduled), not succeeded`, JSON.stringify(d));
  advance(10 * 60 * 1000);
  await drain();
  ok(delivery(ev.id, listener).status === "succeeded" && effect() >= 1, `${listener}: the retry succeeds and the work is done`);
  void before;
}

// ============================================== writes and unpublish =========
console.log("\n  FAILED WRITES, AND UNPUBLISH");
{
  reset();
  const { ev } = publishRelease();
  faults["posts:POST"] = 1;
  await drain();
  ok(delivery(ev.id, "feed_projection_v1").status === "failed" && T.posts.length === 0, "feed upsert 503 -> failed, retried");
  advance(10 * 60 * 1000); await drain();
  ok(T.posts.length === 1 && delivery(ev.id, "feed_projection_v1").status === "succeeded", "...then projected once");
}
{
  reset();
  const { pub } = publishRelease();
  await drain();
  pub.status = "draft";
  const un = addEvent("PUBLICATION_UNPUBLISHED", pub);
  faults["posts:PATCH"] = 1;
  await drain();
  const d = delivery(un.id, "feed_projection_v1");
  ok(d.status === "failed" && /soft-remove failed/.test(d.last_error) && !T.posts[0].removed_at, "unpublish: the feed soft-remove failing -> delivery FAILED and visible (last_error), post still live", JSON.stringify(d));
  advance(10 * 60 * 1000); await drain();
  ok(delivery(un.id, "feed_projection_v1").status === "succeeded" && T.posts[0].removed_at, "...the retry removes the post from the feed");
  ok(T.companies[0].timeline.length === 1, "LIMITATION until 0071: the profile timeline entry is NOT removed on unpublish (no UNPUBLISHED subscription)");
}
{
  // Exhausted retries end DEAD with the reason, never succeeded.
  reset();
  const { ev } = publishRelease();
  faults["posts:POST"] = 99;
  for (let i = 0; i < 7; i++) { await drain(); advance(2 * 3600 * 1000); }
  const d = delivery(ev.id, "feed_projection_v1");
  ok(d.status === "dead" && d.attempts === 6 && /feed_projection upsert failed/.test(d.last_error), "a write that keeps failing ends DEAD after 6 attempts with its reason (visible to outbox_health)");
  ok(delivery(ev.id, "in_app_notifications_v1").status === "dead" && /post not yet projected/.test(delivery(ev.id, "in_app_notifications_v1").last_error), "  ...and its dependants end dead with 'post not yet projected', not falsely succeeded");
}

// ===================================================== push waits for feed ==
console.log("\n  PUSH WAITS FOR THE FEED POST");
{
  reset();
  const u = uuid(); T.company_follows.push({ user_id: u, company_id: CO_A }); T.push_tokens.push({ user_id: u, token: "tok", platform: "ios" });
  const { ev } = publishRelease();
  faults["posts:POST"] = 1;   // the feed fails first
  await drain();
  const d = delivery(ev.id, "device_push_v1");
  ok(d.status === "failed" && /post not yet projected/.test(d.last_error) && T.notification_outbox.length === 0, "feed not projected -> push FAILED (retry), nothing queued (it used to complete and drop the push)", JSON.stringify(d));
  advance(10 * 60 * 1000); await drain();
  ok(T.notification_outbox.length === 1 && delivery(ev.id, "device_push_v1").status === "succeeded", "once the post exists, the push is queued exactly once");
  await drain(); ok(T.notification_outbox.length === 1, "replay queues nothing twice (unique post,user,token)");
}
{
  reset();
  const u = uuid(); T.company_follows.push({ user_id: u, company_id: CO_A }); T.push_tokens.push({ user_id: u, token: "tok", platform: "ios" });
  const { pub, ev } = publishRelease();
  T.posts.push({ id: uuid(), publication_id: pub.id, company_id: CO_A, title: "t", removed_at: new Date().toISOString(), post_type: "press_release" });
  faults["posts:POST"] = 99;   // keep the feed from re-publishing it
  await drain();
  ok(delivery(ev.id, "device_push_v1").status === "succeeded" && T.notification_outbox.length === 0, "a post already withdrawn is not pushed (skipped: unpublished)");
}

// =============================================================== Mine IQ ==
console.log("\n  MINE IQ: A FAILED EXTRACTION RETRIES INSTEAD OF LOSING THE FACTS");
{
  reset();
  const { pub, ev } = publishRelease();
  aiFail = 99;   // an outage longer than the OpenAI helper's own internal retries
  await drain();
  aiFail = 0;
  const d = delivery(ev.id, "mineiq_facts_v1");
  ok(d.status === "failed" && /openai HTTP 503/.test(d.last_error) && T.mineiq_ingestions.length === 0 && T.facts.length === 0, "AI outage -> delivery FAILED and the claim RELEASED (no claim left behind)", JSON.stringify({ d, claims: T.mineiq_ingestions }));
  advance(10 * 60 * 1000); await drain();
  ok(delivery(ev.id, "mineiq_facts_v1").status === "succeeded" && T.facts.length === 1 && T.mineiq_ingestions[0].facts_written === 1, "the retry extracts and stores the facts (before D22 they were lost for good)");
  void pub;
}
{
  // A run killed mid-extraction leaves a claim with facts_written = -1.
  reset();
  const { pub, ev } = publishRelease();
  T.mineiq_ingestions.push({ publication_id: pub.id, company_id: CO_A, revision: 1, facts_written: -1, ingested_at: new Date(mnow() - 60_000).toISOString() });
  await drain();
  const d = delivery(ev.id, "mineiq_facts_v1");
  ok(d.status === "failed" && /in progress elsewhere/.test(d.last_error) && T.facts.length === 0, "a FRESH claim held by another (possibly dead) run -> retry later, do not complete");
  T.mineiq_ingestions[0].ingested_at = new Date(mnow() - 20 * 60_000).toISOString();   // now stale (> 15 min)
  advance(10 * 60 * 1000); await drain();
  ok(delivery(ev.id, "mineiq_facts_v1").status === "succeeded" && T.facts.length === 1 && T.mineiq_ingestions.length === 1 && T.mineiq_ingestions[0].facts_written === 1, "...once STALE, the retry takes the claim over and extracts");
}
{
  // Pre-D22 rows (facts_written 0) read as finished: no surprise re-extraction.
  reset();
  const { pub, ev } = publishRelease();
  T.mineiq_ingestions.push({ publication_id: pub.id, company_id: CO_A, revision: 1, facts_written: 0, ingested_at: new Date().toISOString() });
  await drain();
  ok(delivery(ev.id, "mineiq_facts_v1").status === "succeeded" && aiCalls === 0, "an existing finished claim (facts_written >= 0, incl. rows from before D22) -> no AI call");
}
{
  // Concurrent extraction of one release by two workers: one wins, the other retries.
  reset();
  const { ev } = publishRelease();
  const db = (await import("../api/_service.js")).serviceDb();
  const rs = await Promise.allSettled([L.mineIqFactsV1(ev, db), L.mineIqFactsV1(ev, db), L.mineIqFactsV1(ev, db)]);
  const won = rs.filter((r) => r.status === "fulfilled" && r.value && r.value.facts === 1).length;
  ok(won === 1 && T.facts.length === 1 && aiCalls === 1, "3 concurrent extractions of one release -> exactly one AI call and one set of facts; the others retry or see 'done'", JSON.stringify(rs.map((r) => r.status === "fulfilled" ? r.value : r.reason.message)));
}

// ============================================================== followers ==
console.log("\n  LARGE AUDIENCES: PAGED, CHUNKED, MUTE RESPECTED, NO DUPLICATES");
{
  reset();
  const users = Array.from({ length: 1250 }, () => uuid());
  users.forEach((u) => T.company_follows.push({ user_id: u, company_id: CO_A }));
  const muted = users.slice(0, 40), picky = users.slice(40, 60);
  muted.forEach((u) => T.notification_prefs.push({ user_id: u, company_id: CO_A, channel: "in_app", muted: true, min_materiality: 0 }));
  picky.forEach((u) => T.notification_prefs.push({ user_id: u, company_id: null, channel: "in_app", muted: false, min_materiality: 90 }));
  users.slice(0, 300).forEach((u) => T.push_tokens.push({ user_id: u, token: `t-${u}`, platform: "ios" }));
  muted.forEach((u) => T.notification_prefs.push({ user_id: u, company_id: CO_A, channel: "push", muted: true, min_materiality: 0 }));
  const { ev } = publishRelease();
  await drain();
  const notified = new Set(T.notifications.map((n) => n.user_id));
  ok(T.notifications.length === 1250 - 40 - 20, `1,250 followers (past the 1,000-row page): ${T.notifications.length} notified = all minus 40 muted and 20 below threshold`);
  ok(muted.every((u) => !notified.has(u)) && picky.every((u) => !notified.has(u)), "no muted or below-threshold follower is notified (preferences were dropped before: muted users got notified)");
  ok(T.notification_outbox.length === 300 - 40, `push: 300 devices minus 40 muted -> ${T.notification_outbox.length} queued`);
  ok(maxUrl < 8000, `longest request URL ${maxUrl} chars (chunks of ${L.FOLLOWER_CHUNK}; a single in.(...) of 1,250 ids would be ~46,000)`);
  ok(delivery(ev.id, "in_app_notifications_v1").status === "succeeded", "delivery succeeded");
  for (const d of T.event_deliveries) Object.assign(d, { status: "pending", next_attempt_at: 0 });
  await drain();
  ok(T.notifications.length === 1190 && T.notification_outbox.length === 260, "a full replay writes no duplicate notification or push");
}
{
  reset();
  const users = Array.from({ length: 300 }, () => uuid());
  users.forEach((u) => T.company_follows.push({ user_id: u, company_id: CO_A }));
  const { ev } = publishRelease();
  faults["notification_prefs:GET"] = 1;   // one prefs chunk fails
  await drain();
  ok(delivery(ev.id, "in_app_notifications_v1").status === "failed" && T.notifications.length === 0, "a failed preferences chunk -> delivery FAILED, nobody notified (never 'no preferences')");
  advance(10 * 60 * 1000); await drain();
  ok(T.notifications.length === 300, "the retry notifies everyone once");
}

// ============================================================= historical ==
console.log("\n  HISTORICAL EVENTS (> 72 h): NO SURPRISE NOTIFICATIONS, NO AUTOMATIC AI");
{
  reset();
  const u = uuid(); T.company_follows.push({ user_id: u, company_id: CO_A }); T.push_tokens.push({ user_id: u, token: "tok", platform: "ios" });
  const old = publishRelease({ hoursAgo: 24 * 30, headline: "Old release" });
  const recent = publishRelease({ hoursAgo: 48, headline: "Two-day-old release" });
  const r = await drain();
  ok(T.posts.length === 2 && T.companies[0].timeline.length === 2, "feed and timeline still project BOTH (they are records, not notifications)");
  ok(T.notifications.filter((n) => n.post_id === T.posts.find((p) => p.publication_id === old.pub.id).id).length === 0, "the 30-day-old release notifies nobody");
  ok(T.notification_outbox.every((o) => o.post_id !== T.posts.find((p) => p.publication_id === old.pub.id).id), "...and pushes to nobody");
  ok(aiCalls === 1 && !T.mineiq_ingestions.some((m) => m.publication_id === old.pub.id), "...and starts no AI extraction (only the recent one: 1 AI call)");
  ok(T.notifications.length === 1 && T.notification_outbox.length === 1, "the 48-hour-old release DOES notify and push (inside the cutoff)");
  const s = r.body.summary.find((x) => x.listener === "in_app_notifications_v1");
  ok(s.skipped && s.skipped.historical === 1, "the skip is COUNTED in the dispatcher summary, not silent", JSON.stringify(s));
  ok(delivery(old.ev.id, "in_app_notifications_v1").status === "succeeded", "a skipped historical delivery is completed (it will not be retried forever)");
}
{
  // Ordinary retries of a CURRENT release are not cut off: backoff to dead is ~32 min.
  reset();
  const u = uuid(); T.company_follows.push({ user_id: u, company_id: CO_A });
  const { ev } = publishRelease();
  faults["posts:POST"] = 4;
  for (let i = 0; i < 5; i++) { await drain(); advance(20 * 60 * 1000); }
  ok(delivery(ev.id, "in_app_notifications_v1").status === "succeeded" && T.notifications.length === 1, "a current release whose feed needed 5 attempts still notifies (retries are not 'historical')");
}

// ============================================================== revisions ==
console.log("\n  REVISIONS (F11 at the API; here: the event is fully delivered)");
{
  reset();
  const u = uuid(); T.company_follows.push({ user_id: u, company_id: CO_A });
  const { pub } = publishRelease();
  await drain();
  const postId = T.posts[0].id, nBefore = T.notifications.length;
  pub.content = { ...pub.content, headline: "Corrected headline" };
  const rev = { id: uuid(), body: "Corrected body: 38.2 million shares outstanding." }; T.release_revisions.push(rev);
  const ev = addEvent("PUBLICATION_REVISED", pub, { revision: 2, revision_id: rev.id });
  await drain();
  ok(T.posts.length === 1 && T.posts[0].id === postId && T.posts[0].title === "Corrected headline", "the feed post is UPDATED in place (same id, new title)");
  ok(T.companies[0].timeline.length === 1 && T.companies[0].timeline[0].title === "Corrected headline", "the timeline entry is updated in place");
  ok(T.mineiq_ingestions.some((m) => m.revision === 2 && m.facts_written >= 0), "Mine IQ reconciles revision 2");
  ok(T.notifications.length === nBefore && !delivery(ev.id, "in_app_notifications_v1"), "a correction notifies nobody (not subscribed) -- unchanged");
}

// ================================================== the FIRST correction ==
console.log("\n  THE FIRST CORRECTION IS DELIVERED (revise-release records the original as revision 1)");
{
  reset();
  const revise = (await import("../api/revise-release.js")).default;
  const callRevise = async (tok, body) => { const res = { statusCode: 200, body: null }; res.status = (c) => { res.statusCode = c; return res; }; res.json = (b) => { res.body = b; return res; }; await revise({ method: "POST", headers: { authorization: `Bearer ${tok}` }, body, query: {} }, res); return res; };
  const { pub } = publishRelease({ body: "ORIGINAL full release text." });
  await drain();
  const postId = T.posts[0].id;
  DISPATCH_CALLS.length = 0;
  let r = await callRevise("tok-owner", { publicationId: pub.id, headline: "Corrected headline", body: "CORRECTED full release text." });
  const revs = T.release_revisions.filter((x) => x.publication_id === pub.id).sort((a, b) => a.revision - b.revision);
  ok(r.statusCode === 200 && r.body.revision === 2, "first correction -> revision 2 (it used to be revision 1, with no event)", JSON.stringify(r.body));
  ok(revs.length === 2 && revs[0].body === "ORIGINAL full release text." && revs[1].body === "CORRECTED full release text.", "history: revision 1 = the original release, revision 2 = the correction");
  ok(T.events.filter((e) => e.event_type === "PUBLICATION_REVISED").length === 1, "exactly one PUBLICATION_REVISED event");
  ok(DISPATCH_CALLS.includes("/api/dispatch"), "revise-release nudged the dispatcher on the trusted base (F11)");
  await drain();
  ok(T.posts.length === 1 && T.posts[0].id === postId && T.posts[0].title === "Corrected headline", "the first correction reaches the feed (same post, new title)");
  r = await callRevise("tok-owner", { publicationId: pub.id, headline: "Second correction", body: "SECOND correction text." });
  ok(r.body.revision === 3 && T.events.filter((e) => e.event_type === "PUBLICATION_REVISED").length === 2, "a second correction -> revision 3, a second event (no extra baseline)");
  r = await callRevise("tok-owner", { publicationId: pub.id, headline: "Second correction", body: "SECOND correction text." });
  ok(r.body.unchanged === true && T.events.filter((e) => e.event_type === "PUBLICATION_REVISED").length === 2, "an unchanged save creates nothing");
  const before = T.release_revisions.length;
  r = await callRevise("tok-user", { publicationId: pub.id, headline: "x", body: "hostile" });
  ok(r.statusCode === 403 && T.release_revisions.length === before, "someone without publish rights -> 403, no revision (the baseline uses the same authorization)");
}

// ======================================================= budget + concurrency ==
console.log("\n  RUN BUDGET AND CONCURRENT DISPATCHERS");
{
  reset();
  for (let i = 0; i < 60; i++) publishRelease({ headline: `R${i}` });
  process.env.DISPATCH_BUDGET_MS = "1";
  const r = await drain();
  delete process.env.DISPATCH_BUDGET_MS;
  const claimedAttempts = T.event_deliveries.filter((d) => d.attempts > 0).length;
  ok(r.statusCode === 200 && r.body.summary.some((s) => s.budget_exhausted || s.deferred), "a 1 ms budget: the run stops claiming and says so (budget_exhausted / deferred)", JSON.stringify(r.body.summary.map((s) => ({ l: s.listener, c: s.claimed, d: s.deferred, b: s.budget_exhausted }))));
  ok(claimedAttempts <= 20, `  ...and claims at most one batch (${claimedAttempts} deliveries touched), leaving the rest untouched for the next run`);
  ok(T.event_deliveries.every((d) => d.status !== "processing"), "  ...and leaves nothing half-claimed (every claimed delivery was completed)");
  let rounds = 0; while (T.event_deliveries.some((d) => d.status !== "succeeded") || T.event_deliveries.length < 60 * 5) { await drain(); if (++rounds > 50) break; }
  ok(T.posts.length === 60 && T.event_deliveries.every((d) => d.status === "succeeded"), `subsequent runs drain everything (${rounds} runs); Mine IQ is claimed 2 at a time`);
}
for (let round = 0; round < 10; round++) {
  reset();
  const users = Array.from({ length: 5 }, () => uuid()); users.forEach((u) => T.company_follows.push({ user_id: u, company_id: CO_A }));
  for (let i = 0; i < 15; i++) publishRelease({ headline: `C${i}` });
  const calls = { feed: 0 };
  const rs = await Promise.all([drain(), drain(), drain(), drain()]);
  const processed = rs.flatMap((r) => r.body.summary).filter((s) => s.listener === "feed_projection_v1").reduce((n, s) => n + (s.ok || 0), 0);
  // A notification claimed by one dispatcher before another projected its post
  // fails and retries (correct). Let backoff run, concurrently again, until settled.
  for (let i = 0; i < 6 && T.event_deliveries.some((d) => d.status !== "succeeded"); i++) { advance(20 * 60 * 1000); await Promise.all([drain(), drain()]); }
  if (!(processed === 15 && T.posts.length === 15 && T.notifications.length === 75 && T.facts.length === 15 && T.event_deliveries.every((d) => d.status === "succeeded"))) {
    ok(false, `round ${round}: 4 CONCURRENT dispatchers`, JSON.stringify({ processed, posts: T.posts.length, notif: T.notifications.length, facts: T.facts.length }));
    break;
  }
  void calls;
  if (round === 9) ok(true, "10 rounds x 4 CONCURRENT dispatchers over 15 releases: every feed delivery processed exactly once; after retries settle: 15 posts, 75 notifications (no duplicates), 15 fact sets, all deliveries succeeded");
}

// ================================================================ security ==
console.log("\n  DISPATCH AUTHENTICATION AND ADMIN BACKFILL");
{
  reset(); publishRelease();
  const a = await drain(null); const b = await drain("wrong-secret-of-a-different-length");
  ok(a.statusCode === 401 && b.statusCode === 401 && T.posts.length === 0, "no secret / wrong secret -> 401, nothing processed");
  const call = async (tok, body) => { const res = { statusCode: 200, body: null }; res.status = (c) => { res.statusCode = c; return res; }; res.json = (x) => { res.body = x; return res; }; await dispatch({ method: "POST", headers: tok ? { authorization: `Bearer ${tok}` } : {}, body, query: {} }, res); return res; };
  reset();
  const old = publishRelease({ hoursAgo: 24 * 40 });
  await drain();
  ok(T.facts.length === 0, "setup: the 40-day-old release was NOT extracted automatically");
  let r = await call(null, { action: "backfill", listener: "mineiq_facts_v1", publication_id: old.pub.id });
  ok(r.statusCode === 401 && T.facts.length === 0, "backfill without a session -> 401");
  r = await call("tok-user", { action: "backfill", listener: "mineiq_facts_v1", publication_id: old.pub.id });
  ok(r.statusCode === 403 && T.facts.length === 0, "backfill by a non-admin -> 403");
  r = await call("tok-admin", { action: "backfill", listener: "feed_projection_v1", publication_id: old.pub.id });
  ok(r.statusCode === 400, "backfill of any listener but mineiq_facts_v1 -> 400");
  r = await call("tok-admin", { action: "backfill", listener: "mineiq_facts_v1", publication_id: old.pub.id });
  ok(r.statusCode === 200 && T.facts.length === 1 && r.body.result && r.body.result.facts === 1, "a PLATFORM ADMIN's explicit backfill extracts the historical release", JSON.stringify(r.body));
  ok(T.facts[0].company_id === CO_A, "  ...on the publication's own company");
}
{
  // Company isolation: the company always comes from the publication row.
  reset();
  const { pub } = publishRelease({ company: CO_A });
  T.events[0].company_id = CO_B;               // a malformed event naming another company
  await drain();
  ok(T.posts[0].company_id === CO_A && T.facts.every((f) => f.company_id === CO_A) && T.companies[1].timeline.length === 0, "an event naming company B projects onto the publication's company A only");
  void pub;
}

// ========================================================= source pins ==
console.log("\n  SOURCE PINS");
{
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../api/_listeners.js", import.meta.url), "utf8");
  const svc = fs.readFileSync(new URL("../api/_service.js", import.meta.url), "utf8");
  ok(!/db\.getJson\(/.test(src.split("export const LISTENERS")[0]), "no listener uses the lenient getJson reader");
  ok(!/req\.headers/.test(svc.slice(svc.indexOf("export function selfBaseUrl"), svc.indexOf("export async function invokeDispatchBestEffort") + 900)), "selfBaseUrl / invokeDispatchBestEffort never read request headers (F5)");
  for (const f of ["publish", "unpublish", "revise-release"]) {
    const s = fs.readFileSync(new URL(`../api/${f}.js`, import.meta.url), "utf8");
    ok(/await invokeDispatchBestEffort\(\)/.test(s), `${f}.js awaits invokeDispatchBestEffort() with no request (F5/F11)`);
  }
}

// ================================================ Phase 2 listener code ==
console.log("\n  PHASE 2 LISTENER CODE (effective once 0071 subscribes UNPUBLISHED)");
{
  reset(); SUBS.push(SUB_0071);
  const { pub } = publishRelease();
  await drain();
  ok(T.companies[0].timeline.some((e) => e.key === `pub:${pub.id}`), "setup: published release is on the timeline");
  pub.status = "draft";
  const un = addEvent("PUBLICATION_UNPUBLISHED", pub);
  await drain();
  ok(!T.companies[0].timeline.some((e) => e.key === `pub:${pub.id}`) && delivery(un.id, "profile_timeline_v1").status === "succeeded", "unpublish removes the timeline entry");
  ok(T.publications.some((x) => x.id === pub.id), "the release record is kept");
  // Re-published before the unpublish delivery ran: the live entry must stay.
  pub.status = "published";
  addEvent("PUBLICATION_PUBLISHED", pub);
  const late = addEvent("PUBLICATION_UNPUBLISHED", pub);   // an older unpublish delivered late
  await drain();
  ok(T.companies[0].timeline.some((e) => e.key === `pub:${pub.id}`), "an unpublish delivered after the release was published AGAIN does not remove the live entry (status re-checked)");
  ok(delivery(late.id, "profile_timeline_v1").status === "succeeded", "  ...and that delivery is completed (skipped: published again), not retried forever");
  faults["publications:GET"] = 0;
  pub.status = "draft"; const un2 = addEvent("PUBLICATION_UNPUBLISHED", pub);
  T.companies[0].timeline.push({ key: `pub:${pub.id}` });
  const realRpc = globalThis.fetch;
  globalThis.fetch = async (input, init) => (String(input).includes("/rpc/remove_timeline_entry") ? new Response("{}", { status: 503 }) : realRpc(input, init));
  await drain();
  globalThis.fetch = realRpc;
  ok(delivery(un2.id, "profile_timeline_v1").status === "failed", "a failed removal is FAILED and retried, not silently completed");
  SUBS.splice(SUBS.indexOf(SUB_0071), 1);
}
{
  // DELIVERY_EPOCH: after it, a late delivery still notifies.
  reset();
  const u = uuid(); T.company_follows.push({ user_id: u, company_id: CO_A });
  process.env.DELIVERY_EPOCH = new Date(Date.now() - 10 * 86400e3).toISOString();
  const late = publishRelease({ hoursAgo: 24 * 4 });          // 4 days old, after the epoch
  const before = publishRelease({ hoursAgo: 24 * 30 });       // 30 days old, before the epoch
  await drain();
  delete process.env.DELIVERY_EPOCH;
  const postOf = (r) => T.posts.find((p) => p.publication_id === r.pub.id).id;
  ok(T.notifications.some((n) => n.post_id === postOf(late)), "DELIVERY_EPOCH set: a release from AFTER it, delivered 4 days late (an outage), still notifies");
  ok(!T.notifications.some((n) => n.post_id === postOf(before)), "...a release from BEFORE it (a backfill) still does not");
  ok(L.isHistorical({ occurred_at: new Date(Date.now() - 96 * 3600e3).toISOString() }) === true, "without DELIVERY_EPOCH: the plain 72 h rule");
}

console.log(`\n  publishing-reliability: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
