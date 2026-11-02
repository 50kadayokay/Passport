// a20 offline: the portal's billing client (src/lib/billing.js, src/portal/
// Billing.jsx) end to end against the REAL api/stripe-checkout.js and
// api/stripe-portal.js handlers, with Stripe and Supabase played by a stub.
//   node scripts/billing-ui-test.mjs
//
// OFFLINE. No Stripe key, no Stripe call: every api.stripe.com request is
// recorded and answered here. scripts/billing-access-test.mjs covers WHO the
// handlers admit; this covers what the PERSON sees for each answer and each
// subscription state, and that the browser half never follows a bad redirect.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installBrowserGlobals, installFetch, signIn, signOutLocal, loadBundle, json, reporter, STUB_SB } from "./_portal-offline.mjs";

const { ok, section, done } = reporter("billing-ui");
installBrowserGlobals();
Object.assign(process.env, {
  VITE_SUPABASE_URL: STUB_SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_stubKeyForOfflineTests",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service-key", STRIPE_SECRET_KEY: "sk_test_stub",
  STRIPE_PRICE_BASIC: "price_stub_basic", STRIPE_PRICE_PRO: "price_stub_pro",
});
delete process.env.MINEEX_ENV; delete process.env.PORTAL_ORIGIN;

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const ROLES = { "tok-owner": "owner", "tok-admin_m": "admin", "tok-editor": "editor", "tok-viewer": "viewer" };
let stripeMode = "ok";             // ok | down | nourl | badurl
let stripeSubs = [{ id: "sub_A", customer: "cus_A", metadata: { company_id: A } }];
let stripeConfigured = true;
const STRIPE = [];

const mkRes = () => { const r = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; }; r.end = (b) => { if (b !== undefined) r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; return r; };
const handlers = {};

installFetch(async (req) => {
  const { url, method, token } = req;
  // The browser's call to our own /api -> the real handler, in-process.
  if (url.origin === "http://localhost:4353" && url.pathname.startsWith("/api/stripe-")) {
    const route = url.pathname.slice(5);
    handlers[route] = handlers[route] || (await import(`../api/${route}.js`)).default;
    if (stripeConfigured) process.env.STRIPE_SECRET_KEY = "sk_test_stub"; else delete process.env.STRIPE_SECRET_KEY;
    const res = mkRes();
    await handlers[route]({ method, query: {}, headers: { authorization: req.headers.authorization || "" }, body: JSON.parse(req.body || "null"), url: url.pathname }, res);
    return json(res.body ?? null, res.statusCode);
  }
  if (url.host === "api.stripe.com") {
    STRIPE.push(`${method} ${url.pathname}`);
    if (stripeMode === "down") return json({ error: { message: "upstream" } }, 503);
    if (url.pathname === "/v1/checkout/sessions") return stripeMode === "nourl" ? json({ id: "cs_1" }) : json({ id: "cs_1", url: stripeMode === "badurl" ? "http://checkout.stripe.invalid/x" : "https://checkout.stripe.invalid/cs_1" });
    if (url.pathname === "/v1/subscriptions/search") return json({ data: stripeSubs });
    if (url.pathname === "/v1/billing_portal/sessions") return json({ url: "https://billing.stripe.invalid/s" });
    return json({ error: { message: "unmodelled" } }, 400);
  }
  if (url.origin !== STUB_SB) return undefined;
  const p = url.pathname;
  if (p === "/auth/v1/user") return ROLES[token] ? json({ id: `u-${token}`, email: `${token}@stub.invalid` }) : json({ msg: "bad jwt" }, 401);
  if (p === "/rest/v1/rpc/my_company_role") return json(ROLES[token] ?? null);
  if (p === "/rest/v1/profiles") return json(ROLES[token] ? [{ role: "company" }] : []);
  if (p === "/rest/v1/company_subscriptions") return subAnswer();
  if (p === "/rest/v1/rpc/my_features") return json(["portal_access"]);
  return undefined;
});
let subAnswer = () => json([]);

const M = await loadBundle("billing", `
  export { billingState, startCheckout, openBillingPortal, checkoutReturn, loadSubscription } from "./src/lib/billing.js";
  export { default as BillingView, stateLine, PLANS } from "./src/portal/Billing.jsx";
`);
const as = (tok) => signIn({ id: `u-${tok}`, email: `${tok}@stub.invalid` }, { token: tok });
const NOW = Date.parse("2026-11-01T12:00:00Z");
const day = 864e5;

section("WHAT EACH SUBSCRIPTION ROW MEANS");
{
  const S = (o) => M.billingState(o, NOW);
  const none = S(null);
  ok(none.kind === "none" && !none.live, "no row -> 'none', nothing live");
  const act = S({ plan_id: "passport_managed", status: "active", renews_at: new Date(NOW + 200 * day).toISOString(), note: "stripe", plans: { label: "Pro" } });
  ok(act.kind === "active" && act.live && act.card && act.planLabel === "Pro" && !act.soon, "active card row -> active, live, card, plan label");
  ok(/^Renews /.test(M.stateLine(act)), "  active card: 'Renews <date>'");
  const man = S({ plan_id: "passport", status: "active", renews_at: new Date(NOW + 5 * day).toISOString(), note: "manual" });
  ok(man.kind === "active" && !man.card && man.soon && /^Paid through /.test(M.stateLine(man)), "active manual row -> 'Paid through <date>', flagged as ending soon");
  const pd = S({ plan_id: "passport", status: "past_due", stripe_subscription_id: "sub_1" });
  ok(pd.kind === "past_due" && pd.live && pd.card && /couldn't take the last payment/.test(M.stateLine(pd)), "past_due -> says the payment failed and access is paused");
  const pdm = S({ plan_id: "passport", status: "past_due", note: "manual" });
  ok(/Contact MineEx/.test(M.stateLine(pdm)) && !/card/.test(M.stateLine(pdm)), "past_due, invoiced -> 'contact MineEx', no card wording");
  for (const st of ["cancelled", "canceled", "unpaid", "", "garbage"]) {
    const c = S({ plan_id: "passport", status: st, note: "stripe" });
    ok(c.kind === "cancelled" && !c.live, `status '${st || "(empty)"}' -> cancelled, not live (never shown as active)`);
  }
  const lapsed = S({ plan_id: "passport", status: "active", renews_at: new Date(NOW - day).toISOString(), note: "manual" });
  ok(lapsed.kind === "lapsed" && !lapsed.live && lapsed.label === "Expired" && /has passed/.test(M.stateLine(lapsed)), "active but paid-through date passed (0033) -> 'Expired', not 'Active'");
  const odd = S({ status: "active", renews_at: "not-a-date" });
  ok(odd.kind === "active" && odd.planLabel === "Plan" && M.stateLine(odd) === "", "malformed row (no plan, bad date) -> still honest, no 'Invalid Date'");
}

section("LOADING THE ROW: A FAILED READ IS NOT 'NO SUBSCRIPTION'");
{
  as("tok-owner");
  subAnswer = () => json([]);
  ok(JSON.stringify(await M.loadSubscription(A)) === '{"ok":true,"sub":null}', "empty answer -> ok, no subscription");
  subAnswer = () => json({ message: "boom" }, 500);
  ok((await M.loadSubscription(A)).ok === false, "500 -> not ok (the page says 'couldn't load')");
  subAnswer = () => new Response("<html>", { status: 200 });
  ok((await M.loadSubscription(A)).ok === false, "unparseable body -> not ok");
  subAnswer = () => { throw new TypeError("fetch failed"); };
  ok((await M.loadSubscription(A)).ok === false, "network failure -> not ok");
}

section("CHECKOUT THROUGH THE REAL HANDLER (Stripe stubbed)");
{
  as("tok-owner"); stripeMode = "ok"; STRIPE.length = 0;
  const r = await M.startCheckout({ companyId: A, tier: "basic" });
  ok(r.ok && r.url === "https://checkout.stripe.invalid/cs_1", "owner: checkout returns the Stripe page to redirect to");
  ok(STRIPE.length === 1 && STRIPE[0] === "POST /v1/checkout/sessions", "exactly one (stubbed) Stripe call");
  as("tok-admin_m");
  ok((await M.startCheckout({ companyId: A, tier: "pro" })).ok, "company admin: allowed");
  for (const t of ["tok-editor", "tok-viewer"]) {
    as(t); STRIPE.length = 0;
    const x = await M.startCheckout({ companyId: A, tier: "basic" });
    ok(!x.ok && /Only an owner or admin/.test(x.message) && STRIPE.length === 0, `${t.slice(4)}: refused with a plain sentence, Stripe never called`);
  }
  as("tok-owner");
  const bad = await M.startCheckout({ companyId: A, tier: "platinum" });
  ok(!bad.ok && /Unknown or unpriced tier/.test(bad.message), "unknown tier: the server's reason is shown");
  stripeConfigured = false;
  const nc = await M.startCheckout({ companyId: A, tier: "basic" });
  ok(!nc.ok && /aren't switched on yet/.test(nc.message), "Stripe not configured: 'card payments aren't switched on yet', not a raw env-var error");
  stripeConfigured = true; stripeMode = "down";
  const dn = await M.startCheckout({ companyId: A, tier: "basic" });
  ok(!dn.ok && /Nothing was charged/.test(dn.message), "Stripe down (502): says nothing was charged");
  stripeMode = "nourl";
  ok(!(await M.startCheckout({ companyId: A, tier: "basic" })).ok, "Stripe answers without a URL -> failure, no redirect");
  stripeMode = "badurl";
  ok(!(await M.startCheckout({ companyId: A, tier: "basic" })).ok, "a non-https redirect target is refused, never followed");
  stripeMode = "ok";
  signOutLocal();
  const so = await M.startCheckout({ companyId: A, tier: "basic" });
  ok(!so.ok && /session has expired/.test(so.message), "signed out: 'session has expired' (was: sent as anon, refused as a role error)");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  as("tok-owner");
  const off = await M.startCheckout({ companyId: A, tier: "basic" });
  ok(!off.ok && /Couldn't reach the payment service/.test(off.message), "offline: 'couldn't reach the payment service'");
  globalThis.fetch = realFetch;
}

section("BILLING PORTAL THROUGH THE REAL HANDLER");
{
  as("tok-owner"); stripeSubs = [{ id: "sub_A", customer: "cus_A", metadata: { company_id: A } }];
  const r = await M.openBillingPortal({ companyId: A });
  ok(r.ok && r.url === "https://billing.stripe.invalid/s", "owner with a card subscription: portal URL");
  stripeSubs = [];
  const m = await M.openBillingPortal({ companyId: A });
  ok(!m.ok && m.manual && /invoiced by MineEx/.test(m.message), "no card subscription (404): explained as invoiced billing");
  as("tok-viewer");
  ok(/Only an owner or admin/.test((await M.openBillingPortal({ companyId: A })).message), "viewer: refused in plain words");
}

section("CHECKOUT RETURN (?checkout=)");
ok(M.checkoutReturn("?checkout=success") === "success" && M.checkoutReturn("?checkout=cancelled") === "cancelled", "success / cancelled recognised");
ok(M.checkoutReturn("?checkout=<script>") === null && M.checkoutReturn("") === null, "anything else ignored");

section("WHAT THE PAGE RENDERS FIRST");
{
  const h = (props) => renderToStaticMarkup(React.createElement(M.BillingView, { company: { id: A, name: "Alpha Gold Corp.", role: "owner" }, ...props }));
  const first = h({ canManage: true });
  ok(/data-billing-state="loading"/.test(first) && !/data-plan-button/.test(first), "while loading: a placeholder, and NO plan buttons (a click during a failed read could start a second subscription)");
  ok(/Checkout was cancelled\. Nothing was charged\./.test(h({ canManage: true, notice: "cancelled" })), "?checkout=cancelled -> 'nothing was charged'");
  ok(/Payment received by Stripe/.test(h({ canManage: true, notice: "success" })), "?checkout=success -> 'payment received, updating'");
  ok(/Only an owner or admin of Alpha Gold Corp\. can change billing/.test(h({ canManage: false })), "a member without billing rights is told who can");
}

section("STATE-DEPENDENT CONTROLS (source)");
{
  const src = (await import("node:fs")).readFileSync("src/portal/Billing.jsx", "utf8");
  ok(/const switchLocked = st\.live && !isCurrent;/.test(src) && /"Contact us to switch"/.test(src), "an active or past-due subscription cannot start a second checkout for the other plan");
  ok(/st\.kind === "past_due" \? "Update payment method" : "Manage billing"/.test(src) && /loaded && st\.card && st\.kind !== "none" && canManageBilling/.test(src), "card subscriptions (incl. past due) get Manage billing / Update payment method; invoiced ones don't");
  ok(/!loaded \?/.test(src) && /Couldn't load your subscription\. Nothing about your plan has changed\./.test(src), "failed read: 'couldn't load', with Retry");
}

done();
