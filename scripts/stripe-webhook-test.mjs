// F9 regression tests -- Stripe webhook signatures, replay, idempotency,
// ordering and company binding.
//   node scripts/stripe-webhook-test.mjs
//
// OFFLINE. The real handler (api/stripe-webhook.js) runs in-process. Events are
// signed by an INDEPENDENT implementation of Stripe's documented scheme
// (HMAC-SHA256 over `${t}.${payload}`), never the handler's own code.
//
// The database is a stub with two modes:
//   pre-0069b   rpc/stripe_apply_event answers 404 PGRST202, as production does
//               today; the handler must fall back to its direct writes.
//   0069b       rpc/stripe_apply_event is a faithful in-process model of the
//               SQL in supabase/migrations/0069b_stripe_events.sql: a primary
//               key on the event id (a concurrent insert of the same id waits
//               for the first transaction and then conflicts), a per-company
//               lock, and all-or-nothing rollback on error. Every call yields
//               to the event loop at random points so concurrent deliveries
//               interleave as they would across serverless instances.
// The SQL itself is exercised against the staging database (in a transaction
// that is rolled back) by stripe-webhook-sql-check.mjs.

import crypto from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";

const STUB_SB = "https://stub-project.supabase.invalid";
Object.assign(process.env, {
  VITE_SUPABASE_URL: STUB_SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_stubKeyForOfflineTests",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service-key", STRIPE_SECRET_KEY: "sk_test_stub",
  STRIPE_WEBHOOK_SECRET: "whsec_offline_test_secret_f9",
});
delete process.env.MINEEX_ENV;
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const A = "aaaaaaaa-0000-4000-8000-00000000000a", B = "bbbbbbbb-0000-4000-8000-00000000000b";

// ------------------------------------------------------------------ world --
let mode = "0069b";
let companies, subs, events, legacyWrites, rpcFails;
const reset = (m = "0069b") => {
  mode = m;
  companies = new Map([[A, { id: A, tier: "free" }], [B, { id: B, tier: "pro" }]]);
  subs = new Map([[B, { company_id: B, plan_id: "passport_managed", status: "active", renews_at: null, note: "manual", stripe_subscription_id: null, stripe_status: null, stripe_event_at: null }]]);
  events = new Map(); legacyWrites = []; rpcFails = 0; stripeSearch = {}; searchDown = false;
};
const PLAN_FOR_TIER = { free: "passport", basic: "passport", pro: "passport_managed" };
const yieldRandom = async () => { for (let i = Math.floor(Math.random() * 4); i >= 0; i--) await new Promise((r) => setImmediate(r)); };

// Locks: the event-id primary key and the per-company row lock.
const pkWaiters = new Map(), coLocks = new Map();
async function withLock(map, key, fn) {
  while (map.has(key)) await map.get(key);
  let release; map.set(key, new Promise((r) => (release = r)));
  try { return await fn(); } finally { map.delete(key); release(); }
}

// A faithful model of stripe_apply_event (0069b). Keep in step with the SQL.
async function applyEvent(a) {
  return withLock(pkWaiters, a.p_event_id, async () => {   // concurrent same-id insert waits on the PK
    await yieldRandom();
    if (events.has(a.p_event_id)) return "duplicate";
    if (!["bind", "sync", "delete", "payment_failed", "ignore"].includes(a.p_kind)) throw new Error("unknown kind");
    // Transaction: stage changes, commit at the end, discard on error.
    const staged = { event: { id: a.p_event_id, type: a.p_type, outcome: "pending" } };
    let outcome = null, released = false;
    const run = async () => {
      if (a.p_kind === "ignore" || !a.p_company) { outcome = "ignored"; return; }
      return withLock(coLocks, a.p_company, async () => {
        await yieldRandom();
        if (!companies.has(a.p_company)) { outcome = "unknown_company"; return; }
        const row = subs.get(a.p_company) || null;
        if (a.p_kind === "bind" && !["active", "past_due"].includes(a.p_status || "") && (!row || row.stripe_subscription_id !== (a.p_subscription ?? null))) outcome = "dead_checkout";
        if (!outcome && a.p_kind !== "bind" && (!row || !row.stripe_subscription_id)) {
          if (a.p_verified_subscription == null) { released = true; return; }
          if ((a.p_subscription ?? null) !== a.p_verified_subscription) outcome = "unverified_binding";
        }
        if (!outcome && a.p_kind !== "bind" && !a.p_subscription) outcome = "other_subscription";
        if (!outcome && row && row.stripe_subscription_id && a.p_subscription && row.stripe_subscription_id !== a.p_subscription) {
          if (!(a.p_kind === "bind" || (a.p_type === "customer.subscription.created" && row.status !== "active"))) outcome = "other_subscription";
        }
        if (!outcome && row && row.stripe_event_at && a.p_created < row.stripe_event_at) outcome = "stale";
        if (!outcome && row && row.stripe_subscription_id === (a.p_subscription ?? null) && ["canceled", "incomplete_expired"].includes(row.stripe_status) && a.p_kind !== "delete") outcome = "terminal";
        if (!outcome) {
          if (rpcFails > 0) { rpcFails--; throw new Error("simulated database failure mid-transaction"); }
          await yieldRandom();
          const plan = a.p_tier == null ? (row ? row.plan_id : "passport") : PLAN_FOR_TIER[a.p_tier];
          subs.set(a.p_company, { company_id: a.p_company, plan_id: plan, status: a.p_status, renews_at: a.p_renews_at, note: "stripe",
            stripe_subscription_id: a.p_subscription ?? (row && row.stripe_subscription_id) ?? null,
            stripe_status: a.p_stripe_status ?? (row && row.stripe_status) ?? null, stripe_event_at: a.p_created });
          if (a.p_status === "active" && a.p_tier) companies.get(a.p_company).tier = a.p_tier;
          outcome = "applied";
        }
      });
    };
    await run();   // an exception propagates: nothing below runs, the event row is never committed
    if (released) return "needs_verification";   // claim released in the same transaction
    events.set(a.p_event_id, { ...staged.event, outcome });
    return outcome;
  });
}

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const STRIPE_GETS = [];
let stripeSubStatus = "active";
// What Stripe's subscription search returns per company (first-binding proof).
let stripeSearch = {}, searchDown = false;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  if (url.host === "api.stripe.com") {
    STRIPE_GETS.push(url.pathname);
    if (url.pathname === "/v1/subscriptions/search") {
      if (searchDown) return json({ error: { message: "search unavailable" } }, 400);
      const m = /metadata\['company_id'\]:'([^']+)'/.exec(decodeURIComponent(url.searchParams.get("query") || ""));
      return json({ object: "search_result", data: (m && stripeSearch[m[1]]) || [] });
    }
    if (url.pathname.startsWith("/v1/subscriptions/")) return json({ id: url.pathname.split("/").pop(), status: stripeSubStatus, current_period_end: 4102444800 });
    return json({ error: {} }, 400);
  }
  if (url.origin !== STUB_SB) throw new Error(`unexpected egress to ${url.host}`);
  const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : {};
  if (url.pathname === "/rest/v1/rpc/stripe_apply_event") {
    if (mode === "pre0069b") return json({ code: "PGRST202", message: "Could not find the function public.stripe_apply_event" }, 404);
    try { return json(await applyEvent(body)); } catch (e) { return json({ message: String(e.message) }, 500); }
  }
  // Legacy direct writes (pre-0069b).
  if (method !== "GET") {
    legacyWrites.push({ path: url.pathname, search: url.search, body });
    if (url.pathname === "/rest/v1/company_subscriptions") subs.set(body.company_id, { ...(subs.get(body.company_id) || {}), ...body });
    if (url.pathname === "/rest/v1/companies") { const id = /id=eq\.([^&]+)/.exec(url.search)[1]; if (companies.has(id)) companies.get(id).tier = body.tier; }
    return new Response(null, { status: 201 });
  }
  return json([]);
};

const { default: handler, verifySig, WEBHOOK_TOLERANCE_SECONDS } = await import("../api/stripe-webhook.js");

// ---------------------------------------------------------------- harness --
const now = () => Math.floor(Date.now() / 1000);
const sign = (payload, t = now(), secret = SECRET) => `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex")}`;
const hmac = (payload, t, secret = SECRET) => crypto.createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
function mkRes() {
  const r = { statusCode: 200, body: undefined };
  r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; }; r.end = (b) => { if (b !== undefined) r.body = b; return r; };
  return r;
}
async function deliver(payload, sig, chunks = null) {
  const parts = chunks || [Buffer.from(payload)];
  const req = Readable.from(parts);
  Object.assign(req, { method: "POST", headers: { "stripe-signature": sig === undefined ? sign(payload) : sig, "content-type": "application/json" } });
  const res = mkRes();
  await handler(req, res);
  return { status: res.statusCode, body: res.body };
}
const hook = (evt, sig) => { const p = JSON.stringify(evt); return deliver(p, sig === undefined ? sign(p) : sig); };
let seq = 0;
const ev = (type, object, created = 1_800_000_000 + (++seq)) => ({ id: `evt_${type.replace(/\W/g, "_")}_${seq}_${crypto.randomBytes(3).toString("hex")}`, object: "event", type, created, livemode: false, data: { object } });
const subObj = (company, id, status, tier = "basic") => ({ id, object: "subscription", status, current_period_end: 4102444800, metadata: { company_id: company, tier } });
const session = (company, sub = "sub_A1", ref = company, tier = "basic") => ({ id: "cs_test_x", object: "checkout.session", mode: "subscription", subscription: sub, client_reference_id: ref, metadata: { company_id: company, tier } });

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

// ============================================================= signatures ==
console.log("\n  SIGNATURES, TIMESTAMPS, ROTATION");
reset();
{
  const e = ev("invoice.paid", { id: "in_1" }), p = JSON.stringify(e), t = now();
  ok((await deliver(p, sign(p))).status === 200, "a fresh, correctly signed event -> 200");
  ok((await deliver(p, sign(p, t - WEBHOOK_TOLERANCE_SECONDS - 1))).status === 400, `signed ${WEBHOOK_TOLERANCE_SECONDS + 1} s ago -> 400 (replay window closed)`);
  ok((await deliver(p, sign(p, t - 86400))).status === 400, "a day-old signed event -> 400 (the KNOWN F9 replay)");
  ok((await deliver(p, sign(p, t + WEBHOOK_TOLERANCE_SECONDS + 1))).status === 400, "a timestamp from the future beyond tolerance -> 400");
  const e2 = ev("invoice.paid", { id: "in_2" }), p2 = JSON.stringify(e2);
  ok((await deliver(p2, sign(p2, t - WEBHOOK_TOLERANCE_SECONDS + 5))).status === 200, "inside the tolerance (295 s) -> 200");
  const e3 = ev("invoice.paid", { id: "in_3" }), p3 = JSON.stringify(e3);
  ok((await deliver(p3, `t=${t},v1=${hmac(p3, t)},v1=${hmac(p3, t, "whsec_old_secret")}`)).status === 200, "rotation: two v1, the FIRST matches -> 200");
  const e4 = ev("invoice.paid", { id: "in_4" }), p4 = JSON.stringify(e4);
  ok((await deliver(p4, `t=${t},v1=${hmac(p4, t, "whsec_old_secret")},v1=${hmac(p4, t)}`)).status === 200, "rotation: two v1, the SECOND matches -> 200");
  const e5 = ev("invoice.paid", { id: "in_5" }), p5 = JSON.stringify(e5);
  ok((await deliver(p5, `t=${t},v1=${hmac(p5, t, "whsec_a")},v1=${hmac(p5, t, "whsec_b")}`)).status === 400, "rotation: two v1, NEITHER matches -> 400");
  const e6 = ev("invoice.paid", { id: "in_6" }), p6 = JSON.stringify(e6);
  ok((await deliver(p6, `t=${t},v0=${"0".repeat(64)},v1=${hmac(p6, t)}`)).status === 200, "Stripe's extra v0 scheme alongside v1 -> 200");
  ok((await deliver(p6, `t=${t},v0=${hmac(p6, t)}`)).status === 400, "only a v0 (no v1) -> 400, v0 is never trusted");
  for (const [label, sig] of [["missing header", ""], ["no t", `v1=${hmac(p, t)}`], ["non-numeric t", `t=abc,v1=${hmac(p, t)}`], ["non-hex v1", `t=${t},v1=${"z".repeat(64)}`],
    ["short v1", `t=${t},v1=abcd`], ["wrong secret", sign(p, t, "whsec_wrong")], ["tampered body", sign(p.replace("in_1", "in_9"), t)], ["header for a different t", `t=${t - 1},v1=${hmac(p, t)}`]]) {
    const before = events.size;
    ok((await deliver(p, sig)).status === 400 && events.size === before, `bad signature (${label}) -> 400, nothing recorded`);
  }
  // The signature is over BYTES: a multi-byte character split across chunks.
  const e7 = ev("invoice.paid", { id: "in_7", description: "Société Minière — 金 ⛏️" }), p7 = JSON.stringify(e7);
  const buf = Buffer.from(p7, "utf8"), cut = buf.indexOf(Buffer.from("金")) + 1;
  ok((await deliver(p7, sign(p7), [buf.subarray(0, cut), buf.subarray(cut)])).status === 200, "a multi-byte character split across stream chunks still verifies (bytes, not per-chunk strings)");
  ok(verifySig(Buffer.from(p7), sign(p7), SECRET).ok && !verifySig(Buffer.from(p7), sign(p7), "").ok, "verifySig: unit check; an unset secret never verifies");
}

// ============================================================== malformed ==
console.log("\n  MALFORMED EVENTS (correctly signed)");
reset();
for (const [label, evt] of [
  ["no id", { type: "invoice.paid", created: now(), data: { object: {} } }],
  ["id not evt_", { id: "ch_123", type: "invoice.paid", created: now(), data: { object: {} } }],
  ["id with injection characters", { id: "evt_1');drop", type: "invoice.paid", created: now(), data: { object: {} } }],
  ["no created", { id: "evt_nocreated", type: "invoice.paid", data: { object: {} } }],
  ["created as a string", { id: "evt_strcreated", type: "invoice.paid", created: "1800000000", data: { object: {} } }],
  ["no data.object", { id: "evt_noobj", type: "invoice.paid", created: now(), data: {} }],
  ["no type", { id: "evt_notype", created: now(), data: { object: {} } }],
]) {
  const r = await hook(evt);
  ok(r.status === 400 && events.size === 0 && legacyWrites.length === 0, `${label} -> 400, nothing recorded or written`);
}
{
  const p = "{not json"; ok((await deliver(p, sign(p))).status === 400, "signed but not JSON -> 400");
}

// ========================================== behaviour preserved (0069b) ==
console.log("\n  EXISTING BEHAVIOUR, through 0069b");
reset();
{
  let r = await hook(ev("checkout.session.completed", session(A, "sub_A1")));
  ok(r.status === 200 && r.body.outcome === "applied" && subs.get(A).status === "active" && subs.get(A).plan_id === "passport" && companies.get(A).tier === "basic" && subs.get(A).stripe_subscription_id === "sub_A1",
     "checkout.session.completed -> A active on passport, tier basic, bound to sub_A1", JSON.stringify(subs.get(A)));
  ok(STRIPE_GETS.includes("/v1/subscriptions/sub_A1"), "  ...status and renewal read from Stripe (test mode stub), as before");
  r = await hook(ev("customer.subscription.updated", subObj(A, "sub_A1", "past_due")));
  ok(subs.get(A).status === "past_due" && companies.get(A).tier === "basic", "subscription.updated past_due -> past_due, tier untouched");
  r = await hook(ev("customer.subscription.updated", subObj(A, "sub_A1", "active", "pro")));
  ok(subs.get(A).status === "active" && subs.get(A).plan_id === "passport_managed" && companies.get(A).tier === "pro", "subscription.updated active (upgraded to pro) -> active on passport_managed, tier pro");
  r = await hook(ev("invoice.payment_failed", { id: "in_f", subscription: "sub_A1", subscription_details: { metadata: { company_id: A } } }));
  ok(subs.get(A).status === "past_due" && subs.get(A).plan_id === "passport_managed", "invoice.payment_failed -> past_due, and the Pro plan is KEPT (the legacy path reset it to passport)");
  r = await hook(ev("customer.subscription.deleted", subObj(A, "sub_A1", "canceled", "pro")));
  ok(subs.get(A).status === "cancelled" && subs.get(A).stripe_status === "canceled", "subscription.deleted -> cancelled");
  r = await hook(ev("invoice.paid", { id: "in_p" }));
  ok(r.status === 200 && r.body.outcome === "ignored", "an event type the handler does not use -> 200 ignored");
  stripeSubStatus = "incomplete";
  reset();
  r = await hook(ev("checkout.session.completed", session(A, "sub_A9")));
  ok(r.body.outcome === "dead_checkout" && !subs.has(A), "checkout whose subscription is 'incomplete' -> dead_checkout: never binds, nothing written (the legacy path stored the raw word 'incomplete' as the portal status)");
  stripeSubStatus = "active";
}

// ================================================= idempotency + replay ==
console.log("\n  IDEMPOTENCY AND REPLAY");
reset();
{
  await hook(ev("checkout.session.completed", session(A, "sub_A1"), 1_700_000_000));   // bound first, as in life
  const e = ev("customer.subscription.updated", subObj(A, "sub_A1", "active"));
  const r1 = await hook(e), r2 = await hook(e);
  ok(r1.body.outcome === "applied" && r2.status === 200 && r2.body.duplicate === true, "the same event twice -> second is 200 {duplicate: true}");
  ok(events.size === 2, "  ...recorded once (plus the checkout)");
  // A replay with a FRESH signature (an attacker who can re-sign cannot exist
  // without the secret; this is Stripe's own retry) is still a duplicate.
  const r3 = await hook(e, sign(JSON.stringify(e), now()));
  ok(r3.body.duplicate === true, "Stripe re-delivering the same event id with a new timestamp -> duplicate, no second application");
  // Side effects: a cancelled company is not re-activated by replaying an old 'active'.
  await hook(ev("customer.subscription.deleted", subObj(A, "sub_A1", "canceled")));
  const replay = await hook(e, sign(JSON.stringify(e), now()));
  ok(replay.body.duplicate === true && subs.get(A).status === "cancelled", "replaying the earlier 'active' event after cancellation -> duplicate; A stays cancelled (the F9 risk)");
  const old = await hook(e, sign(JSON.stringify(e), now() - 3600));
  ok(old.status === 400, "replaying it with its original (hour-old) signature -> 400");
}

console.log("\n  CONCURRENT DELIVERIES (as across serverless instances)");
for (let round = 0; round < 25; round++) {
  reset();
  const e = ev("checkout.session.completed", session(A, "sub_A1"));
  const rs = await Promise.all(Array.from({ length: 10 }, () => hook(e)));
  const applied = rs.filter((r) => r.body && r.body.outcome === "applied").length, dups = rs.filter((r) => r.body && r.body.duplicate).length;
  if (!(rs.every((r) => r.status === 200) && applied === 1 && dups === 9 && events.size === 1)) {
    ok(false, `round ${round}: 10 concurrent deliveries of one event -> exactly one applied`, rs.map((r) => `${r.status}:${r.body && r.body.outcome}`).join(","));
    break;
  }
  if (round === 24) ok(true, "25 rounds x 10 CONCURRENT deliveries of the same event: always exactly 1 applied, 9 duplicates, all 200");
}
for (let round = 0; round < 25; round++) {
  reset();
  await hook(ev("checkout.session.completed", session(A, "sub_A1"), 1_800_000_000));
  const mk = (c, st) => ev("customer.subscription.updated", subObj(A, "sub_A1", st), c);
  const batch = [mk(1_800_000_010, "past_due"), mk(1_800_000_020, "active"), mk(1_800_000_005, "past_due"), mk(1_800_000_015, "past_due")];
  const rs = await Promise.all(batch.map((e) => hook(e)));
  const final = subs.get(A);
  if (!(rs.every((r) => r.status === 200) && final.status === "active" && final.stripe_event_at === new Date(1_800_000_020 * 1000).toISOString())) {
    ok(false, `round ${round}: concurrent out-of-order updates -> the NEWEST wins`, JSON.stringify(final));
    break;
  }
  if (round === 24) ok(true, "25 rounds x 4 CONCURRENT, shuffled subscription updates: the newest event always wins; older ones are 'stale'");
}

// ================================================================= ordering ==
console.log("\n  OUT-OF-ORDER EVENTS");
reset();
{
  await hook(ev("checkout.session.completed", session(A, "sub_A1"), 1_800_000_000));
  await hook(ev("customer.subscription.updated", subObj(A, "sub_A1", "past_due"), 1_800_000_200));
  const late = await hook(ev("customer.subscription.updated", subObj(A, "sub_A1", "active"), 1_800_000_100));
  ok(late.body.outcome === "stale" && subs.get(A).status === "past_due", "an OLDER 'active' arriving after a newer 'past_due' -> stale; stays past_due");
  await hook(ev("customer.subscription.deleted", subObj(A, "sub_A1", "canceled"), 1_800_000_300));
  const same = await hook(ev("customer.subscription.updated", subObj(A, "sub_A1", "active"), 1_800_000_300));
  ok(same.body.outcome === "terminal" && subs.get(A).status === "cancelled", "an 'active' with the SAME second as the deletion -> terminal; a canceled subscription is never revived");
  const lateCheckout = await hook(ev("checkout.session.completed", session(A, "sub_A0"), 1_800_000_050));
  ok(lateCheckout.body.outcome === "stale" && subs.get(A).stripe_subscription_id === "sub_A1", "a late, older checkout for an earlier subscription -> stale; binding unchanged");
  const fresh = await hook(ev("checkout.session.completed", session(A, "sub_A2"), 1_800_000_400));
  ok(fresh.body.outcome === "applied" && subs.get(A).status === "active" && subs.get(A).stripe_subscription_id === "sub_A2", "a NEW checkout after cancellation -> active, re-bound to the new subscription");
}

// ====================================================== unrelated companies ==
console.log("\n  NO EVENT CAN CHANGE AN UNRELATED COMPANY'S BILLING");
reset();
{
  await hook(ev("checkout.session.completed", session(A, "sub_A1"), 1_800_000_000));
  const bBefore = JSON.stringify(subs.get(B));
  // A subscription that is not A's binding, carrying A's id in its metadata.
  let r = await hook(ev("customer.subscription.deleted", subObj(A, "sub_OTHER", "canceled"), 1_800_000_100));
  ok(r.body.outcome === "other_subscription" && subs.get(A).status === "active", "deletion of a subscription A is NOT bound to -> other_subscription; A stays active");
  r = await hook(ev("invoice.payment_failed", { id: "in_x", subscription: "sub_OTHER", subscription_details: { metadata: { company_id: A } } }, 1_800_000_110));
  ok(r.body.outcome === "other_subscription" && subs.get(A).status === "active", "a payment failure on another subscription -> other_subscription; A stays active");
  r = await hook(ev("checkout.session.completed", session(A, "sub_A3", B), 1_800_000_120));
  ok(r.body.outcome === "ignored" && subs.get(A).stripe_subscription_id === "sub_A1" && JSON.stringify(subs.get(B)) === bBefore, "a checkout whose metadata and client_reference_id name DIFFERENT companies -> ignored; neither company touched");
  r = await hook(ev("customer.subscription.updated", subObj("cccccccc-0000-4000-8000-00000000000c", "sub_Z", "active"), 1_800_000_130));
  ok(r.body.outcome === "unknown_company", "metadata naming a company that does not exist -> unknown_company, nothing written");
  r = await hook(ev("customer.subscription.updated", subObj("not-a-uuid'); --", "sub_Z", "active"), 1_800_000_140));
  ok(r.body.outcome === "ignored", "a malformed company id in metadata -> ignored before it reaches the database");
  ok(JSON.stringify(subs.get(B)) === bBefore && companies.get(B).tier === "pro", "company B (manual billing, unbound) was never touched by any of A's events");
  r = await hook(ev("customer.subscription.created", subObj(A, "sub_A4", "active"), 1_800_000_150));
  ok(r.body.outcome === "other_subscription" && subs.get(A).stripe_subscription_id === "sub_A1", "subscription.created for a second subscription while sub_A1 is active -> other_subscription (checkout binds; created does not steal)");
}
{
  // Legacy rows: a Stripe row from before 0069b has no binding; its first event binds it.
  reset();
  subs.set(A, { company_id: A, plan_id: "passport", status: "active", renews_at: null, note: "stripe", stripe_subscription_id: null, stripe_status: null, stripe_event_at: null });
  stripeSearch[A] = [{ id: "sub_legacy", status: "past_due", created: 1_700_000_100, metadata: { company_id: A } }, { id: "sub_old", status: "canceled", created: 1_600_000_000, metadata: { company_id: A } }];
  const r = await hook(ev("customer.subscription.updated", subObj(A, "sub_legacy", "past_due"), 1_800_000_000));
  ok(r.body.outcome === "applied" && subs.get(A).stripe_subscription_id === "sub_legacy" && subs.get(A).status === "past_due", "a pre-0069b row (no binding): its first event, for the subscription Stripe confirms is CURRENT, applies and binds -- existing companies keep working");
}

console.log("\n  FIRST BINDING OF AN EXISTING COMPANY (needs proof from Stripe)");
const legacyRow = () => ({ company_id: A, plan_id: "passport_managed", status: "active", renews_at: null, note: "stripe", stripe_subscription_id: null, stripe_status: null, stripe_event_at: null });
{
  reset(); subs.set(A, legacyRow());
  stripeSearch[A] = [{ id: "sub_current", status: "active", created: 1_700_000_500, metadata: { company_id: A } }, { id: "sub_old", status: "canceled", created: 1_600_000_000, metadata: { company_id: A } }];
  let r = await hook(ev("customer.subscription.deleted", subObj(A, "sub_old", "canceled", "pro")));
  ok(r.body.outcome === "unverified_binding" && subs.get(A).status === "active" && subs.get(A).stripe_subscription_id === null, "a late DELETE for an OLD subscription arrives first -> unverified_binding: no cancellation, no binding");
  r = await hook(ev("invoice.payment_failed", { id: "in_old", subscription: "sub_old", subscription_details: { metadata: { company_id: A } } }));
  ok(r.body.outcome === "unverified_binding" && subs.get(A).status === "active", "a payment failure on the old subscription -> unverified_binding");
  r = await hook(ev("customer.subscription.updated", subObj(A, "sub_unrelated", "canceled", "pro")));
  ok(r.body.outcome === "unverified_binding" && subs.get(A).status === "active", "an unrelated subscription carrying A's id -> unverified_binding");
  r = await hook(ev("invoice.payment_failed", { id: "in_nosub", subscription_details: { metadata: { company_id: A } } }));
  ok(r.body.outcome === "unverified_binding" && subs.get(A).status === "active", "an invoice naming NO subscription -> cannot bind, nothing changed");
  ok([...events.values()].every((e) => e.outcome !== "needs_verification"), "needs_verification is never left recorded (the claim is released and re-made)");
  r = await hook(ev("customer.subscription.updated", subObj(A, "sub_current", "past_due", "pro")));
  ok(r.body.outcome === "applied" && subs.get(A).stripe_subscription_id === "sub_current" && subs.get(A).status === "past_due" && subs.get(A).plan_id === "passport_managed", "then the CURRENT subscription's event -> applied and bound");
  r = await hook(ev("customer.subscription.deleted", subObj(A, "sub_old", "canceled", "pro")));
  ok(r.body.outcome === "other_subscription" && subs.get(A).status === "past_due", "once bound, the old subscription's events are other_subscription");
}
{
  reset(); subs.set(A, legacyRow()); searchDown = true;
  const r = await hook(ev("customer.subscription.updated", subObj(A, "sub_current", "past_due")));
  ok(r.status === 200 && r.body.outcome === "unverified_binding" && subs.get(A).status === "active", "Stripe search unavailable -> the first binding is REFUSED (recorded unverified_binding), never guessed");
}
{
  reset(); subs.set(A, legacyRow()); stripeSubStatus = "canceled";
  const r = await hook(ev("checkout.session.completed", session(A, "sub_dead")));
  ok(r.body.outcome === "dead_checkout" && subs.get(A).status === "active" && subs.get(A).stripe_subscription_id === null, "a checkout for a subscription Stripe says is canceled -> dead_checkout; the active row is not touched");
  stripeSubStatus = "active";
  const r2 = await hook(ev("checkout.session.completed", session(A, "sub_live")));
  ok(r2.body.outcome === "applied" && subs.get(A).stripe_subscription_id === "sub_live", "a live checkout binds an unbound company without a Stripe search (checkout is the proof)");
}
{
  // No subscription row at all: a non-checkout event needs the same proof.
  reset(); stripeSearch[A] = [{ id: "sub_X", status: "active", created: 1_700_000_000, metadata: { company_id: A } }];
  let r = await hook(ev("invoice.payment_failed", { id: "in_y", subscription: "sub_Y", subscription_details: { metadata: { company_id: A } } }));
  ok(r.body.outcome === "unverified_binding" && !subs.has(A), "no row + an event for a non-current subscription -> unverified_binding, no row created");
  r = await hook(ev("customer.subscription.created", subObj(A, "sub_X", "active", "basic")));
  ok(r.body.outcome === "applied" && subs.get(A).stripe_subscription_id === "sub_X", "no row + the current subscription's event -> applied and bound");
}
for (let round = 0; round < 20; round++) {
  reset(); subs.set(A, legacyRow());
  stripeSearch[A] = [{ id: "sub_current", status: "active", created: 1_700_000_500, metadata: { company_id: A } }];
  const good = ev("customer.subscription.updated", subObj(A, "sub_current", "past_due", "pro"), 1_800_000_100);
  const stale = ev("customer.subscription.deleted", subObj(A, "sub_old", "canceled", "pro"), 1_800_000_050);
  const rs = await Promise.all([hook(good), hook(good), hook(stale), hook(good), hook(stale)]);
  const final = subs.get(A);
  if (!(rs.every((x) => x.status === 200) && final.stripe_subscription_id === "sub_current" && final.status === "past_due" && [...events.values()].filter((e) => e.outcome === "applied").length === 1)) {
    ok(false, `round ${round}: concurrent first-binding deliveries (current + old)`, JSON.stringify({ final, rs: rs.map((x) => x.body.outcome) }));
    break;
  }
  if (round === 19) ok(true, "20 rounds x 5 CONCURRENT first-binding deliveries (3x current, 2x an old subscription's delete): always bound to the current one, applied exactly once");
}

// ========================================================= failed writes ==
console.log("\n  FAILED WRITES ARE RETRIED, NOT LOST");
reset();
{
  rpcFails = 1;
  const e = ev("checkout.session.completed", session(A, "sub_A1"));
  const r1 = await hook(e);
  ok(r1.status === 500 && !events.has(e.id) && !subs.has(A), "the database failing mid-transaction -> 500, and the event is NOT recorded (all-or-nothing)");
  const r2 = await hook(e);
  ok(r2.status === 200 && r2.body.outcome === "applied" && subs.get(A).status === "active", "Stripe's retry of the same event is then APPLIED, not mistaken for a duplicate");
}

// ============================================================== pre-0069b ==
console.log("\n  BEFORE MIGRATION 0069b (production today): direct writes, signature + tolerance still enforced");
reset("pre0069b");
{
  const e = ev("checkout.session.completed", session(A, "sub_A1"));
  const r = await hook(e);
  ok(r.status === 200 && r.body.outcome === "applied-legacy" && subs.get(A).status === "active" && companies.get(A).tier === "basic", "checkout -> applied through the legacy writes");
  ok((await hook(e, sign(JSON.stringify(e), now() - 86400))).status === 400, "a day-old replay -> 400 (the tolerance does not depend on the migration)");
  const again = await hook(e);
  ok(again.status === 200 && again.body.outcome === "applied-legacy", "LIMITATION, by design until 0069b: a duplicate inside the 5-minute window is applied again (idempotent for this event, but not de-duplicated)");
  const x = await hook(ev("checkout.session.completed", session(A, "sub_A3", B)));
  ok(x.body.outcome === "ignored", "the company cross-check works without the migration");
}

// =================================================== migration file pins ==
console.log("\n  MIGRATION 0069b (prepared, not applied)");
{
  const sql = fs.readFileSync(new URL("../supabase/migrations/0069b_stripe_events.sql", import.meta.url), "utf8");
  ok(/id\s+text primary key/.test(sql) && /on conflict \(id\) do nothing/.test(sql) && /return 'duplicate'/.test(sql), "event id is the primary key; a conflicting insert returns 'duplicate'");
  ok(/perform 1 from public\.companies where id = p_company for update/.test(sql), "events are serialised per company (row lock)");
  ok(/enable row level security/.test(sql) && /revoke all on public\.stripe_events from public, anon, authenticated/.test(sql) && /revoke execute on function public\.stripe_apply_event[\s\S]*from public, anon, authenticated/.test(sql), "table and function are service-role only");
  ok(/add column if not exists stripe_subscription_id text,\s*add column if not exists stripe_status\s+text,\s*add column if not exists stripe_event_at\s+timestamptz/.test(sql) && !/not null default/i.test(sql.split("alter table public.company_subscriptions")[1].split(";")[0]), "company_subscriptions gains three NULLABLE columns, no default, no backfill");
  ok(/STATUS: (PREPARED, NOT APPLIED ANYWHERE|APPLIED TO STAGING ONLY)/.test(sql) && /ROLLBACK/.test(sql), "the file states where it is applied and carries its rollback");
  ok(/return 'needs_verification'/.test(sql) && /delete from public\.stripe_events where id = p_event_id;\s*return 'needs_verification'/.test(sql) && /'unverified_binding'/.test(sql) && /'dead_checkout'/.test(sql), "first binding needs verification (claim released); unverified and dead checkouts never bind");
  ok(/set search_path = public, pg_temp/.test(sql) && /security definer/.test(sql), "SECURITY DEFINER with a pinned search_path");
}

console.log(`\n  stripe-webhook: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
