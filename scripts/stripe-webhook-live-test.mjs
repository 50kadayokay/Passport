// F9 live check -- synthetic, correctly signed Stripe events against the local
// STAGING API server and the staging database.
//   node scripts/stripe-webhook-live-test.mjs
//
// No Stripe account is touched: events are built and signed here with the
// staging webhook secret (from the gitignored supabase/staging/.api-env), and the
// handler's one Stripe call (GET subscription) goes to the staging egress mock.
// No charge, no live subscription.
//
// Staging does NOT have migration 0069b (it needs approval), so this verifies
// the path production will run first: signature, tolerance, rotation, shape and
// company checks, with the direct writes. It detects which path ran and says so.
//
// Writes only company_subscriptions / companies.tier for the iso- fixture
// company B, and restores B's subscription row and tier at the end.

import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const readEnvFile = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const iso = readEnvFile("supabase/staging/.isolation-env"), apiEnv = readEnvFile("supabase/staging/.api-env");
const SB = (iso.ISOLATION_SUPABASE_URL || "").replace(/\/+$/, ""), SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY, SECRET = apiEnv.STRIPE_WEBHOOK_SECRET;
if (!SB || /rvptronniomlqumjhyrr/.test(SB) || !/jmljfovtfxcdhjmtlnva/.test(SB)) { console.error("  refusing: not the staging project"); process.exit(2); }
if (!SERVICE || !SECRET) { console.error("  staging service key or webhook secret missing from .api-env"); process.exit(3); }
const A = iso.ISOLATION_COMPANY_A_ID, B = iso.ISOLATION_COMPANY_B_ID;

const PORT = 8787 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ["scripts/staging-api-server.mjs", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
let serverLog = ""; server.stdout.on("data", (d) => { serverLog += d; }); server.stderr.on("data", (d) => { serverLog += d; });
process.on("exit", () => { try { server.kill(); } catch {} });
const API = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 40; i++) { if (await fetch(`${API}/__staging/egress`).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 250)); }

const db = async (path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j };
};
const subOf = async (cid) => (await db(`company_subscriptions?company_id=eq.${cid}&select=plan_id,status,note,renews_at`)).body[0] || null;
const fullSubOf = async (cid) => (await db(`company_subscriptions?company_id=eq.${cid}&select=*`)).body[0] || null;
const tierOf = async (cid) => (await db(`companies?id=eq.${cid}&select=tier`)).body[0].tier;
const now = () => Math.floor(Date.now() / 1000);
const mac = (p, t, s = SECRET) => crypto.createHmac("sha256", s).update(`${t}.${p}`, "utf8").digest("hex");
const post = async (payload, sig) => {
  const r = await fetch(`${API}/api/stripe-webhook`, { method: "POST", headers: { "content-type": "application/json", ...(sig ? { "stripe-signature": sig } : {}) }, body: payload });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j };
};
const evt = (type, object, created = now()) => ({ id: `evt_f9live_${crypto.randomBytes(6).toString("hex")}`, object: "event", type, created, livemode: false, data: { object } });
const send = (e, t = now()) => { const p = JSON.stringify(e); return post(p, `t=${t},v1=${mac(p, t)}`); };

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const bSub = await fullSubOf(B), bTier = await tierOf(B), aSub = await fullSubOf(A), aTier = await tierOf(A);
console.log(`\n  staging ${new URL(SB).host.split(".")[0]} · Stripe events synthetic, signed locally`);
try {
  console.log("\n  SIGNATURE, TOLERANCE, ROTATION, SHAPE");
  const ign = evt("invoice.paid", { id: "in_live" });
  const p = JSON.stringify(ign), t = now();
  let r = await post(p, `t=${t},v1=${mac(p, t)}`);
  ok(r.status === 200, "fresh, correctly signed -> 200 (positive control)", `${r.status} ${JSON.stringify(r.body)}`);
  const path = r.body && r.body.outcome === "duplicate" ? "?" : (r.body && r.body.outcome) || "?";
  r = await post(p, `t=${t - 86400},v1=${mac(p, t - 86400)}`);
  ok(r.status === 400, "a day-old signed event -> 400 (the KNOWN F9 replay, now refused)", `${r.status}`);
  r = await post(p, `t=${t - 301},v1=${mac(p, t - 301)}`);
  ok(r.status === 400, "signed 301 s ago -> 400");
  r = await post(p, `t=${t + 400},v1=${mac(p, t + 400)}`);
  ok(r.status === 400, "signed 400 s in the future -> 400");
  const p2 = JSON.stringify(evt("invoice.paid", { id: "in_rot1" }));
  r = await post(p2, `t=${t},v1=${mac(p2, t)},v1=${mac(p2, t, "whsec_previous_rotated_out")}`);
  ok(r.status === 200, "rotation: two v1, first valid -> 200");
  const p3 = JSON.stringify(evt("invoice.paid", { id: "in_rot2" }));
  r = await post(p3, `t=${t},v1=${mac(p3, t, "whsec_previous_rotated_out")},v1=${mac(p3, t)}`);
  ok(r.status === 200, "rotation: two v1, second valid -> 200 (was refused before F9)");
  r = await post(p3, `t=${t},v1=${mac(p3, t, "whsec_x")},v1=${mac(p3, t, "whsec_y")}`);
  ok(r.status === 400, "two v1, neither valid -> 400");
  r = await post(p, `t=${t},v1=${mac(p.replace("in_live", "in_evil"), t)}`);
  ok(r.status === 400, "tampered body -> 400");
  r = await post(p, "");
  ok(r.status === 400, "no signature -> 400");
  const bad = JSON.stringify({ id: "evt_nocreated_live", type: "invoice.paid", data: { object: {} } });
  r = await post(bad, `t=${t},v1=${mac(bad, t)}`);
  ok(r.status === 400, "correctly signed but malformed (no created) -> 400");

  console.log("\n  BILLING (company B), read back from the database");
  r = await send(evt("checkout.session.completed", { id: "cs_live", object: "checkout.session", mode: "subscription", subscription: "sub_live_B", client_reference_id: B, metadata: { company_id: B, tier: "basic" } }));
  // The handler says which path it took: "applied" (0069b) or "applied-legacy".
  const has0069b = r.body && r.body.outcome === "applied";
  const s1 = await subOf(B);
  ok(r.status === 200 && s1 && s1.status === "active" && s1.plan_id === "passport" && s1.note === "stripe" && (await tierOf(B)) === "basic", `checkout.session.completed -> B active on passport, tier basic (path: ${r.body && r.body.outcome})`, JSON.stringify({ r: r.body, s1 }));
  r = await send(evt("customer.subscription.updated", { id: "sub_live_B", object: "subscription", status: "past_due", current_period_end: 4102444800, metadata: { company_id: B, tier: "basic" } }));
  ok(r.status === 200 && (await subOf(B)).status === "past_due" && (await tierOf(B)) === "basic", "subscription.updated past_due -> past_due, tier untouched");
  r = await send(evt("invoice.payment_failed", { id: "in_live_f", subscription: "sub_live_B", subscription_details: { metadata: { company_id: B } } }));
  ok(r.status === 200 && (await subOf(B)).status === "past_due", "invoice.payment_failed -> past_due");
  r = await send(evt("customer.subscription.deleted", { id: "sub_live_B", object: "subscription", status: "canceled", metadata: { company_id: B, tier: "basic" } }));
  ok(r.status === 200 && (await subOf(B)).status === "cancelled", "subscription.deleted -> cancelled");

  console.log("\n  UNRELATED COMPANY");
  const aBefore = JSON.stringify([await subOf(A), await tierOf(A)]), bNow = JSON.stringify(await subOf(B));
  r = await send(evt("checkout.session.completed", { id: "cs_x", object: "checkout.session", mode: "subscription", subscription: "sub_x", client_reference_id: B, metadata: { company_id: A, tier: "pro" } }));
  ok(r.status === 200 && r.body.outcome === "ignored" && JSON.stringify([await subOf(A), await tierOf(A)]) === aBefore && JSON.stringify(await subOf(B)) === bNow, "checkout naming A in metadata but B as client_reference_id -> ignored; neither company changed");
  r = await send(evt("customer.subscription.updated", { id: "sub_q", object: "subscription", status: "active", metadata: { company_id: "x'; drop table companies; --", tier: "pro" } }));
  ok(r.status === 200 && r.body.outcome === "ignored", "malformed company id in metadata -> ignored before the database");

  console.log("\n  WHICH PATH RAN");
  ok(true, has0069b ? "staging HAS stripe_apply_event: the 0069b path ran" : "staging has NO stripe_apply_event (0069b not applied): the legacy direct-write path ran");
  if (!has0069b) {
    const e = evt("customer.subscription.updated", { id: "sub_live_B", object: "subscription", status: "past_due", metadata: { company_id: B, tier: "basic" } });
    const r1 = await send(e), r2 = await send(e);
    ok(r1.body.outcome === "applied-legacy" && r2.body.outcome === "applied-legacy", "LIMITATION until 0069b: the same event inside the 5-minute window is applied twice");
  } else {
    console.log("\n  0069b ON STAGING: IDEMPOTENCY, REPLAY, ORDERING, BINDING (through the real handler)");
    const evRow = async (id) => (await db(`stripe_events?id=eq.${id}&select=outcome`)).body[0] || null;
    // Fresh binding for B: a live checkout (B's earlier events above bound sub_live_B, then cancelled it).
    const base = now() + 5;   // event.created orders events; later than the section above
    let e = evt("checkout.session.completed", { id: "cs_live2", object: "checkout.session", mode: "subscription", subscription: "sub_live_B2", client_reference_id: B, metadata: { company_id: B, tier: "pro" } }, base);
    r = await send(e);
    ok(r.body.outcome === "applied" && (await subOf(B)).status === "active" && (await fullSubOf(B)).stripe_subscription_id === "sub_live_B2" && (await tierOf(B)) === "pro", "a new live checkout re-binds B to sub_live_B2: active, tier pro", JSON.stringify(r.body));
    const dupE = evt("customer.subscription.updated", { id: "sub_live_B2", object: "subscription", status: "past_due", metadata: { company_id: B, tier: "pro" } }, base + 10);
    const d1 = await send(dupE), d2 = await send(dupE);
    ok(d1.body.outcome === "applied" && d2.status === 200 && d2.body.duplicate === true && (await evRow(dupE.id)).outcome === "applied", "the same event twice -> second is 200 {duplicate: true}; recorded once as applied");
    const conc = evt("customer.subscription.updated", { id: "sub_live_B2", object: "subscription", status: "active", metadata: { company_id: B, tier: "pro" } }, base + 20);
    const rs = await Promise.all(Array.from({ length: 8 }, () => send(conc)));
    ok(rs.every((x) => x.status === 200) && rs.filter((x) => x.body.outcome === "applied").length === 1 && rs.filter((x) => x.body.duplicate).length === 7,
       "8 CONCURRENT deliveries of one event through the API (separate requests, separate DB connections) -> exactly 1 applied, 7 duplicates", rs.map((x) => x.body.outcome).join(","));
    const older = evt("customer.subscription.updated", { id: "sub_live_B2", object: "subscription", status: "past_due", metadata: { company_id: B, tier: "pro" } }, base + 15);
    r = await send(older);
    ok(r.body.outcome === "stale" && (await subOf(B)).status === "active", "an OLDER past_due arriving after the newer active -> stale; B stays active");
    r = await send(evt("invoice.payment_failed", { id: "in_live_f2", subscription: "sub_live_B2", subscription_details: { metadata: { company_id: B } } }, base + 30));
    ok(r.body.outcome === "applied" && (await subOf(B)).status === "past_due" && (await subOf(B)).plan_id === "passport_managed", "payment failed -> past_due, and the Pro plan is KEPT");
    r = await send(evt("customer.subscription.deleted", { id: "sub_OTHER_B", object: "subscription", status: "canceled", metadata: { company_id: B, tier: "pro" } }, base + 40));
    ok(r.body.outcome === "other_subscription" && (await subOf(B)).status === "past_due", "deletion of a subscription B is NOT bound to -> other_subscription; B unchanged");
    const activeE = evt("customer.subscription.updated", { id: "sub_live_B2", object: "subscription", status: "active", metadata: { company_id: B, tier: "pro" } }, base + 45);
    await send(activeE);
    r = await send(evt("customer.subscription.deleted", { id: "sub_live_B2", object: "subscription", status: "canceled", metadata: { company_id: B, tier: "pro" } }, base + 50));
    ok(r.body.outcome === "applied" && (await subOf(B)).status === "cancelled", "cancellation of the bound subscription -> cancelled");
    const replay = await send(activeE);
    ok(replay.body.duplicate === true && (await subOf(B)).status === "cancelled", "REPLAYING the earlier 'active' (re-signed) after cancellation -> duplicate; B stays cancelled");
    r = await send(evt("customer.subscription.updated", { id: "sub_live_B2", object: "subscription", status: "active", metadata: { company_id: B, tier: "pro" } }, base + 50));
    ok(r.body.outcome === "terminal" && (await subOf(B)).status === "cancelled", "a NEW 'active' for the canceled subscription (same second) -> terminal");

    console.log("\n  FIRST BINDING OF AN UNBOUND COMPANY (A), through the handler");
    const aBefore2 = JSON.stringify(await fullSubOf(A));
    r = await send(evt("customer.subscription.deleted", { id: "sub_A_old", object: "subscription", status: "canceled", metadata: { company_id: A, tier: "basic" } }));
    ok(r.body.outcome === "unverified_binding" && JSON.stringify(await fullSubOf(A)) === aBefore2,
       "A has no binding; a deletion for a subscription Stripe does not confirm as A's current one -> unverified_binding; A unchanged (the staging Stripe mock's search returns nothing, so no first binding can be proven)");

    console.log("\n  FAILED TRANSACTIONS ROLL BACK AND CAN BE RETRIED (direct RPC as the service role)");
    const failId = `evt_f9live_fail_${crypto.randomBytes(4).toString("hex")}`;
    const bad = await db("rpc/stripe_apply_event", { method: "POST", body: JSON.stringify({ p_event_id: failId, p_type: "invoice.paid", p_created: new Date().toISOString(), p_company: null, p_subscription: null, p_kind: "nonsense", p_status: null, p_stripe_status: null, p_tier: null, p_renews_at: null }) });
    ok(bad.status >= 400 && (await evRow(failId)) === null, "a call that raises inside the function -> error, and NO event row is left behind");
    const good = await db("rpc/stripe_apply_event", { method: "POST", body: JSON.stringify({ p_event_id: failId, p_type: "invoice.paid", p_created: new Date().toISOString(), p_company: null, p_subscription: null, p_kind: "ignore", p_status: null, p_stripe_status: null, p_tier: null, p_renews_at: null }) });
    ok(good.status === 200 && good.body === "ignored" && (await evRow(failId)).outcome === "ignored", "the retry of the same event id is processed (not a duplicate)");

    console.log("\n  PRIVILEGES (as real staging users through PostgREST)");
    const signIn = async (k) => { const rr = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: iso.ISOLATION_ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email: iso[`ISOLATION_${k}_EMAIL`], password: iso[`ISOLATION_${k}_PASS`] }) }); return rr.ok ? (await rr.json()).access_token : null; };
    for (const k of ["COMPANY_B", "COMPANY_A", "INVESTOR", "STAFF", null]) {
      const tok = k ? await signIn(k) : null;
      const H = { apikey: iso.ISOLATION_ANON_KEY, Authorization: `Bearer ${tok || iso.ISOLATION_ANON_KEY}`, "content-type": "application/json" };
      const sel = await fetch(`${SB}/rest/v1/stripe_events?select=id&limit=5`, { headers: H });
      const selBody = await sel.json().catch(() => null);
      ok(sel.status === 401 || sel.status === 403 || (sel.status === 200 && Array.isArray(selBody) && selBody.length === 0) ? sel.status !== 200 : false, `${k || "anon"}: SELECT stripe_events -> ${sel.status} (refused)`, JSON.stringify(selBody).slice(0, 100));
      const call = await fetch(`${SB}/rest/v1/rpc/stripe_apply_event`, { method: "POST", headers: H, body: JSON.stringify({ p_event_id: "evt_f9live_priv", p_type: "x", p_created: new Date().toISOString(), p_company: B, p_subscription: "sub_x", p_kind: "sync", p_status: "active", p_stripe_status: "active", p_tier: "pro", p_renews_at: null }) });
      ok(call.status === 401 || call.status === 403 || call.status === 404, `${k || "anon"}: EXECUTE stripe_apply_event -> ${call.status} (refused)`);
    }
    ok((await evRow("evt_f9live_priv")) === null, "no privilege probe recorded an event");
  }
  const log = ((await (await fetch(`${API}/__staging/egress`)).json()).log || []);
  ok(log.filter((x) => x.provider === "stripe").every((x) => x.action === "mock") && log.every((x) => x.action !== "block"), "every Stripe call was the staging mock; nothing blocked; no live Stripe contact");
} finally {
  // Restore B (and A, untouched by design) to what they were.
  await db(`stripe_events?id=like.evt_f9live_*`, { method: "DELETE" });
  for (const [cid, sub, tier] of [[B, bSub, bTier], [A, aSub, aTier]]) {
    if (sub) await db(`company_subscriptions?company_id=eq.${cid}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(sub) });
    else await db(`company_subscriptions?company_id=eq.${cid}&note=eq.stripe`, { method: "DELETE" });
    // The service role passes company_owner_guard, as the webhook itself does.
    await db(`companies?id=eq.${cid}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ tier }) });
  }
  const strip = (x) => x && Object.fromEntries(Object.entries(x).filter(([k]) => k !== "updated_at"));
  const back = JSON.stringify([strip(await fullSubOf(B)), await tierOf(B), strip(await fullSubOf(A)), await tierOf(A)]) === JSON.stringify([strip(bSub), bTier, strip(aSub), aTier])
    && (await db(`stripe_events?id=like.evt_f9live_*&select=id`)).body.length === 0;
  console.log(`\n  cleanup: subscription rows and tiers restored ${back ? "(verified identical)" : "-- MISMATCH"}`);
  if (!back) fail++;
}
console.log(`  stripe-webhook-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
