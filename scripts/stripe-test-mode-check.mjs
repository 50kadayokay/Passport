// a20 -- billing in Stripe TEST mode, end to end on STAGING.
//   node scripts/stripe-test-mode-check.mjs
//
// FOR S4 TO RUN, once the user has supplied Stripe TEST keys and approved it.
// Until then it prints SKIP and exits 0. It never asks for keys.
//
// RUNS ONLY WITH TEST KEYS in the staging API environment (supabase/staging/
// .api-env -- the only environment the handlers see, scripts/staging-api-server.mjs):
//   STRIPE_SECRET_KEY=sk_test_... (or rk_test_)   STRIPE_WEBHOOK_SECRET=whsec_...
//   STRIPE_PRICE_BASIC=price_... (a test-mode price)   STAGING_STRIPE_MODE=test
// A live key (sk_live_ / rk_live_) anywhere -- that file or this shell -- is
// REFUSED (exit 2) before anything runs, and every object Stripe returns must say
// livemode:false or the run stops.
//
// WHAT IT PROVES, through the app's real handlers on the staging API:
//   1 CHECKOUT  /api/stripe-checkout as company B's owner returns a Stripe test
//               session for B (metadata, client_reference_id, return URLs);
//               another company's owner gets 403. The session is then expired.
//   2 PAYMENT   a test subscription with the same metadata checkout stamps
//               (pm_card_visa). The hosted payment page needs a person in a
//               browser, so this stands in for it.
//   3 WEBHOOK   Stripe's own events for it, fetched from Stripe and delivered to
//               /api/stripe-webhook signed with the webhook secret (what the
//               Stripe CLI does); a redelivery is a duplicate; a bad signature 400.
//   4 STATE     company_subscriptions for B: active, its plan, renews_at = the
//               period end; the owner still has portal access.
//   5 PORTAL    /api/stripe-portal as B's owner opens a billing portal session;
//               another company's owner gets 403.
//   6 CANCEL    the subscription is cancelled in Stripe; its deleted event is
//               delivered; B's row says cancelled.
//
// WRITES: Stripe TEST mode only (one customer and subscription, deleted at the
// end) and, on staging, company B's subscription row, tier and the run's
// stripe_events rows -- all restored or removed in `finally`, and checked.
// Prints no key, secret, token or password.
//
// EXIT: 0 PASS or SKIP · 1 FAIL · 2 REFUSED.
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const STAGING_REF = "jmljfovtfxcdhjmtlnva", PRODUCTION_REF = "rvptronniomlqumjhyrr";
const STRIPE = "https://api.stripe.com/v1/";
const LIVE = /\b(sk|rk|pk)_live_/;

/** { refuse } | { skip, missing } | { key, whsec, price } -- decided before any request. */
export function stripeGate(apiEnv, shellEnv = {}) {
  const sources = [["supabase/staging/.api-env", apiEnv || {}], ["this shell", shellEnv]];
  for (const [where, env] of sources) {
    for (const k of ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "VITE_STRIPE_PUBLISHABLE_KEY"]) {
      if (LIVE.test(String(env[k] || ""))) return { refuse: `${k} in ${where} is a LIVE Stripe key. This check runs in test mode only.` };
    }
  }
  if (!apiEnv) return { skip: true, missing: ["supabase/staging/.api-env itself (not found: this checkout has no staging API environment)"] };
  const key = String(apiEnv.STRIPE_SECRET_KEY || ""), whsec = String(apiEnv.STRIPE_WEBHOOK_SECRET || ""), price = String(apiEnv.STRIPE_PRICE_BASIC || "");
  const missing = [];
  if (!/^(sk|rk)_test_/.test(key)) missing.push(key ? "STRIPE_SECRET_KEY (set, but not an sk_test_ / rk_test_ key)" : "STRIPE_SECRET_KEY (sk_test_...)");
  if (!/^whsec_/.test(whsec)) missing.push("STRIPE_WEBHOOK_SECRET (whsec_..., from the test-mode endpoint)");
  if (!/^price_/.test(price)) missing.push("STRIPE_PRICE_BASIC (a test-mode price_...)");
  if (apiEnv.STAGING_STRIPE_MODE !== "test") missing.push("STAGING_STRIPE_MODE=test (otherwise the staging API mocks Stripe)");
  if (missing.length) {
    const shellOnly = /^(sk|rk)_test_/.test(String(shellEnv.STRIPE_SECRET_KEY || "")) && !key;
    return { skip: true, missing, note: shellOnly ? "STRIPE_SECRET_KEY is set in this shell, but the staging API reads only supabase/staging/.api-env." : "" };
  }
  return { key, whsec, price };
}

export const readEnvFile = (f) => (fs.existsSync(f) ? Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })) : null);

export async function runStripeTestMode({ gate, iso, apiEnv, api, fetchImpl = globalThis.fetch, out = console.log, err = console.error, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), pollMs = 3000, polls = 20 }) {
  const SB = String(iso.ISOLATION_SUPABASE_URL || "").replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY, SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const B = iso.ISOLATION_COMPANY_B_ID;
  const secrets = [gate.key, gate.whsec, SERVICE, ANON, iso.ISOLATION_COMPANY_A_PASS, iso.ISOLATION_COMPANY_B_PASS].filter((s) => s && s.length >= 6);
  const redact = (s) => { let t = String(s); for (const k of secrets) t = t.split(k).join("[redacted]"); return t.replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, "[redacted-jwt]"); };
  let pass = 0, fail = 0;
  const say = (m) => out(redact(m));
  const ok = (c, m, d = "") => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; err(redact(`  ✗ ${m}${d ? `\n      ${d}` : ""}`)); } };
  const body = async (r) => { const t = await r.text(); try { return t ? JSON.parse(t) : null; } catch { return t; } };

  // Stripe, test mode only: every object must say livemode:false.
  class LiveMode extends Error {}
  const assertTest = (o) => { if (o && typeof o === "object") { if (o.livemode === true) throw new LiveMode("Stripe returned a livemode object"); if (Array.isArray(o.data)) o.data.forEach(assertTest); } return o; };
  const stripe = async (method, path, params) => {
    if (!/^(sk|rk)_test_/.test(gate.key)) throw new LiveMode("not a test key");
    const r = await fetchImpl(STRIPE + path, { method, headers: { Authorization: `Bearer ${gate.key}`, ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, body: params ? new URLSearchParams(params).toString() : undefined });
    return { status: r.status, body: assertTest(await body(r)) };
  };
  const db = async (path, init = {}) => { const r = await fetchImpl(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers || {}) } }); return { status: r.status, body: await body(r) }; };
  const signIn = async (k) => { const r = await fetchImpl(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: iso[`ISOLATION_${k}_EMAIL`], password: iso[`ISOLATION_${k}_PASS`] }) }); const j = await body(r); return r.ok && j && j.access_token ? j.access_token : null; };
  const apiPost = async (route, token, payload) => { const r = await fetchImpl(`${api}/api/${route}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload) }); return { status: r.status, body: await body(r) }; };
  const deliver = async (evt, secret = gate.whsec) => {
    const raw = JSON.stringify(evt), t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac("sha256", secret).update(`${t}.${raw}`, "utf8").digest("hex");
    const r = await fetchImpl(`${api}/api/stripe-webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${sig}` }, body: raw });
    return { status: r.status, body: await body(r) };
  };
  const eventFor = async (type, subId, since) => {
    for (let i = 0; i < polls; i++) {
      const r = await stripe("GET", `events?type=${encodeURIComponent(type)}&created[gte]=${since}&limit=50`);
      const e = ((r.body && r.body.data) || []).find((x) => x.data && x.data.object && x.data.object.id === subId);
      if (e) return e;
      await sleep(pollMs);
    }
    return null;
  };
  const subRow = async () => ((await db(`company_subscriptions?company_id=eq.${B}&select=*`)).body || [])[0] || null;
  const tierOfB = async () => (((await db(`companies?id=eq.${B}&select=tier`)).body || [])[0] || {}).tier ?? null;
  const periodEnd = (s) => (s && (s.current_period_end || (s.items && s.items.data && s.items.data[0] && s.items.data[0].current_period_end))) || null;

  say(`\n  stripe-test-mode (a20)  staging ${STAGING_REF} · Stripe TEST mode · company B`);
  const before = { row: await subRow(), tier: await tierOfB() };
  const eventIds = [];
  let customer = null, sub = null, session = null;
  try {
    const ownerB = await signIn("COMPANY_B"), ownerA = await signIn("COMPANY_A");
    ok(!!ownerB && !!ownerA, "company B's owner and another company's owner sign in");
    // A row left bound to an earlier run's subscription would refuse this one (0069b binding).
    if (before.row) await db(`company_subscriptions?company_id=eq.${B}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ stripe_subscription_id: null, stripe_status: null, stripe_event_at: null }) });
    const t0 = Math.floor(Date.now() / 1000) - 5;

    say("\n  1 CHECKOUT");
    let r = await apiPost("stripe-checkout", ownerA, { companyId: B, tier: "basic" });
    ok(r.status === 403, "another company's owner cannot start B's checkout (403)", `${r.status}`);
    r = await apiPost("stripe-checkout", ownerB, { companyId: B, tier: "basic" });
    const url = r.body && r.body.url, csId = String(url || "").match(/cs_test_[A-Za-z0-9]+/);
    ok(r.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(url || "") && !!csId, "B's owner gets a Stripe TEST checkout URL", `${r.status}`);
    if (csId) {
      const s = await stripe("GET", `checkout/sessions/${csId[0]}`);
      session = s.body;
      ok(s.status === 200 && session.mode === "subscription" && session.livemode === false, "the session is a test-mode subscription checkout");
      ok(session.client_reference_id === B && session.metadata && session.metadata.company_id === B && session.metadata.tier === "basic", "it names company B and the tier (what the webhook binds by)");
      ok(/\/portal\?checkout=success$/.test(session.success_url || "") && /\/portal\?checkout=cancelled$/.test(session.cancel_url || ""), "return URLs are the portal's fixed ones");
      const x = await stripe("POST", `checkout/sessions/${csId[0]}/expire`, {});
      ok(x.status === 200 && x.body.status === "expired", "the unpaid session is expired (nothing left open)");
    }

    say("\n  2 PAYMENT (test card, standing in for the hosted page)");
    const run = crypto.randomBytes(4).toString("hex");
    r = await stripe("POST", "customers", { email: `a20-${run}@staging.invalid`, payment_method: "pm_card_visa", "invoice_settings[default_payment_method]": "pm_card_visa", "metadata[a20_run]": run });
    customer = r.status === 200 ? r.body : null;
    ok(!!customer && /^cus_/.test(customer.id), "a test customer with the test Visa", `${r.status}`);
    r = await stripe("POST", "subscriptions", { customer: customer && customer.id, "items[0][price]": gate.price, "metadata[company_id]": B, "metadata[tier]": "basic" });
    sub = r.status === 200 ? r.body : null;
    ok(!!sub && sub.status === "active", "the subscription is active (paid)", `${r.status} ${sub && sub.status}`);
    if (!sub) throw new Error("stop");
    let seen = false;
    for (let i = 0; i < polls && !seen; i++) {
      const q = encodeURIComponent(`metadata['company_id']:'${B}'`);
      const s = await stripe("GET", `subscriptions/search?query=${q}&limit=20`);
      seen = ((s.body && s.body.data) || []).some((x) => x.id === sub.id);
      if (!seen) await sleep(pollMs);
    }
    ok(seen, "Stripe Search finds it by company (the webhook's first-binding proof)");

    say("\n  3 WEBHOOK");
    const created = await eventFor("customer.subscription.created", sub.id, t0);
    ok(!!created, "Stripe emitted customer.subscription.created");
    if (!created) throw new Error("stop");
    eventIds.push(created.id);
    r = await deliver(created, "whsec_not_the_secret");
    ok(r.status === 400, "signed with the wrong secret -> 400", `${r.status}`);
    r = await deliver(created);
    ok(r.status === 200 && r.body && /^applied/.test(r.body.outcome), `delivered -> 200, ${r.body && r.body.outcome}`, `${r.status} ${JSON.stringify(r.body)}`);
    r = await deliver(created);
    ok(r.status === 200 && r.body && r.body.duplicate === true, "redelivered -> duplicate, nothing applied twice", `${JSON.stringify(r.body)}`);

    say("\n  4 STATE");
    const row = await subRow();
    ok(row && row.status === "active" && row.plan_id === "passport" && row.note === "stripe", "B's subscription: active, Basic's plan, from Stripe", JSON.stringify(row && { status: row.status, plan_id: row.plan_id, note: row.note }));
    const end = periodEnd(sub);
    ok(row && row.renews_at && end && Math.abs(Date.parse(row.renews_at) - end * 1000) < 864e5, "renews_at is the subscription's period end", `stored ${row && row.renews_at}; Stripe ${end ? new Date(end * 1000).toISOString() : "none"}${sub.current_period_end ? "" : " (Stripe sends it on the item, not the subscription)"}`);
    ok(row && row.stripe_subscription_id === sub.id, "B is bound to this subscription");
    ok((await tierOfB()) === "basic", "companies.tier = basic");
    const f = await fetchImpl(`${SB}/rest/v1/rpc/my_features`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${ownerB}`, "content-type": "application/json" }, body: JSON.stringify({ cid: B }) });
    const feats = await body(f);
    ok(f.status === 200 && Array.isArray(feats) && feats.includes("portal_access"), "B's owner has portal access");

    say("\n  5 PORTAL");
    r = await apiPost("stripe-portal", ownerA, { companyId: B });
    ok(r.status === 403, "another company's owner cannot open B's billing portal (403)", `${r.status}`);
    r = await apiPost("stripe-portal", ownerB, { companyId: B });
    ok(r.status === 200 && /^https:\/\/billing\.stripe\.com\//.test((r.body && r.body.url) || ""), "B's owner gets a Stripe billing portal URL", `${r.status} ${JSON.stringify(r.body && r.body.error)}`);

    say("\n  6 CANCEL");
    r = await stripe("DELETE", `subscriptions/${sub.id}`);
    ok(r.status === 200 && r.body.status === "canceled", "cancelled in Stripe", `${r.status}`);
    const deleted = await eventFor("customer.subscription.deleted", sub.id, t0);
    ok(!!deleted, "Stripe emitted customer.subscription.deleted");
    if (deleted) {
      eventIds.push(deleted.id);
      r = await deliver(deleted);
      ok(r.status === 200 && r.body && /^applied/.test(r.body.outcome), `delivered -> 200, ${r.body && r.body.outcome}`, `${r.status} ${JSON.stringify(r.body)}`);
      const after = await subRow();
      ok(after && after.status === "cancelled", "B's subscription: cancelled", JSON.stringify(after && after.status));
    }
  } catch (e) {
    if (e.message !== "stop") ok(false, e instanceof LiveMode ? "test mode held" : "the run completed", e.message);
  } finally {
    say("\n  CLEANUP");
    try {
      if (session && session.status === "open") await stripe("POST", `checkout/sessions/${session.id}/expire`, {});
      if (customer) { const d = await stripe("DELETE", `customers/${customer.id}`); ok(d.status === 200 && d.body.deleted === true, "the test customer is deleted in Stripe (and its subscription with it)"); }
    } catch (e) { ok(false, "Stripe cleanup", e.message); }
    if (eventIds.length) await db(`stripe_events?id=in.(${eventIds.join(",")})`, { method: "DELETE" });
    if (before.row) await db(`company_subscriptions?company_id=eq.${B}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(before.row) });
    else await db(`company_subscriptions?company_id=eq.${B}`, { method: "DELETE" });
    await db(`companies?id=eq.${B}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ tier: before.tier }) });
    const strip = (x) => x && Object.fromEntries(Object.entries(x).filter(([k]) => k !== "updated_at"));
    const left = eventIds.length ? (await db(`stripe_events?id=in.(${eventIds.join(",")})&select=id`)).body : [];
    ok(JSON.stringify(strip(await subRow())) === JSON.stringify(strip(before.row)) && (await tierOfB()) === before.tier && Array.isArray(left) && left.length === 0, "B's subscription row and tier restored; the run's stripe_events removed");
  }
  say(`\n  stripe-test-mode (staging, Stripe test mode): ${pass} passed, ${fail} failed\n`);
  return { pass, fail };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const apiEnv = readEnvFile("supabase/staging/.api-env");
  const gate = stripeGate(apiEnv, process.env);
  if (gate.refuse) { console.error(`\n  stripe-test-mode: REFUSING -- ${gate.refuse}\n`); process.exit(2); }
  if (gate.skip) {
    console.log(`\n  stripe-test-mode: SKIP -- Stripe test mode is not configured, so nothing ran.\n  Missing from the staging API environment (supabase/staging/.api-env):\n${gate.missing.map((m) => `    - ${m}`).join("\n")}${gate.note ? `\n  ${gate.note}` : ""}\n  (a20 waits on the user's test keys and approval.)\n`);
    process.exit(0);
  }
  const iso = readEnvFile("supabase/staging/.isolation-env") || {};
  const SB = String(iso.ISOLATION_SUPABASE_URL || "");
  if (SB.includes(PRODUCTION_REF) || !SB.includes(STAGING_REF)) { console.error("\n  stripe-test-mode: REFUSING -- not the staging project.\n"); process.exit(2); }
  const PORT = 9900 + Math.floor(Math.random() * 90);
  const server = spawn(process.execPath, ["scripts/staging-api-server.mjs", "--port", String(PORT)], { stdio: "ignore" });
  process.on("exit", () => { try { server.kill(); } catch { /* gone */ } });
  const API = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 40; i++) { if (await fetch(`${API}/__staging/egress`).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 250)); }
  const res = await runStripeTestMode({ gate, iso, apiEnv, api: API });
  const log = ((await fetch(`${API}/__staging/egress`).then((r) => r.json()).catch(() => ({}))).log) || [];
  const stripeCalls = log.filter((x) => x.host === "api.stripe.com");
  const egressOk = stripeCalls.length > 0 && stripeCalls.every((x) => x.action === "allow") && log.every((x) => x.action !== "block");
  console.log(`  ${egressOk ? "✓" : "✗"} the handlers reached Stripe in test mode (${stripeCalls.length} calls); nothing blocked`);
  process.exit(res.fail || !egressOk ? 1 : 0);
}
