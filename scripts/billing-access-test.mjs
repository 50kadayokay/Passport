// Batch D (F2) regression tests: who may start or manage a company's billing,
// where Stripe sends them back, and whether the webhook still understands what
// checkout creates.
//   node scripts/billing-access-test.mjs
//
// OFFLINE. The real handlers run in-process against a stub that plays Supabase
// (session, my_company_role, profiles, service-role writes) and Stripe (every
// request recorded, nothing sent). No live Stripe call, no credential.
//
// Approved policy: owners and company admins of THAT company, and platform
// admins, may start checkout or open the billing portal. Editors, publishers,
// analysts, viewers, investors and other companies may not.

import crypto from "node:crypto";
import { Readable } from "node:stream";

const STUB_SB = "https://stub-project.supabase.invalid";
Object.assign(process.env, {
  VITE_SUPABASE_URL: STUB_SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_stubKeyForOfflineTests",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service-key", STRIPE_SECRET_KEY: "sk_test_stub",
  STRIPE_PRICE_BASIC: "price_stub_basic", STRIPE_PRICE_PRO: "price_stub_pro",
  STRIPE_WEBHOOK_SECRET: "whsec_offline_test_secret",
});
delete process.env.MINEEX_ENV; delete process.env.PORTAL_ORIGIN;

const A = "aaaaaaaa-0000-4000-8000-00000000000a", B = "bbbbbbbb-0000-4000-8000-00000000000b";
const IDS = {
  "tok-ownerA":     { id: "u-ownerA", email: "owner-a@stub.invalid", profile: "company", roles: { [A]: "owner" } },
  "tok-coadminA":   { id: "u-coadA",  email: "coadmin-a@stub.invalid", profile: "company", roles: { [A]: "admin" } },
  "tok-editorA":    { id: "u-edA",    email: "editor-a@stub.invalid", profile: "company", roles: { [A]: "editor" } },
  "tok-publisherA": { id: "u-pubA",   email: "pub-a@stub.invalid",   profile: "company", roles: { [A]: "publisher" } },
  "tok-analystA":   { id: "u-anA",    email: "an-a@stub.invalid",    profile: "company", roles: { [A]: "analyst" } },
  "tok-viewerA":    { id: "u-viewA",  email: "view-a@stub.invalid",  profile: "company", roles: { [A]: "viewer" } },
  "tok-ownerB":     { id: "u-ownerB", email: "owner-b@stub.invalid", profile: "company", roles: { [B]: "owner" } },
  "tok-investor":   { id: "u-inv",    email: "inv@stub.invalid",     profile: "investor", roles: {} },
  "tok-admin":      { id: "u-admin",  email: "admin@stub.invalid",   profile: "admin", roles: {} },
};
// Stripe's side: which customer pays for which company (subscription metadata).
let stripeSubs = [{ id: "sub_A", customer: "cus_A", metadata: { company_id: A } }];
let searchAvailable = true, roleDown = false;
const STRIPE_CALLS = [], DB_WRITES = [];
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : "";
  const tok = String((init.headers && (init.headers.Authorization || init.headers.authorization)) || "").replace(/^Bearer /, "");
  const caller = IDS[tok];
  if (url.host === "api.stripe.com") {
    STRIPE_CALLS.push({ method, path: url.pathname, search: url.search, params: Object.fromEntries(new URLSearchParams(body)) });
    const p = url.pathname;
    if (p === "/v1/checkout/sessions") return json({ id: "cs_test_1", url: "https://checkout.stripe.invalid/cs_test_1" });
    if (p === "/v1/subscriptions/search") {
      if (!searchAvailable) return json({ error: { message: "search unavailable" } }, 400);
      const q = decodeURIComponent(url.searchParams.get("query") || "");
      const m = /metadata\['company_id'\]:'([^']+)'/.exec(q);
      return json({ data: stripeSubs.filter((s) => m && s.metadata.company_id === m[1]) });
    }
    if (p === "/v1/customers") return json({ data: [{ id: "cus_A", email: url.searchParams.get("email") }, { id: "cus_B", email: url.searchParams.get("email") }] });
    if (p === "/v1/subscriptions") return json({ data: stripeSubs.filter((s) => s.customer === url.searchParams.get("customer")) });
    if (p === "/v1/billing_portal/sessions") return json({ url: "https://billing.stripe.invalid/session" });
    if (p.startsWith("/v1/subscriptions/")) return json({ id: p.split("/").pop(), status: "active", current_period_end: 4102444800 });
    return json({ error: { message: "unmodelled" } }, 400);
  }
  if (url.origin !== STUB_SB) return json({});
  const p = url.pathname;
  if (p === "/auth/v1/user") return caller ? json({ id: caller.id, email: caller.email }) : json({ msg: "bad jwt" }, 401);
  if (p === "/rest/v1/rpc/my_company_role") {
    if (roleDown) return json({ message: "down" }, 500);
    const cid = JSON.parse(body || "{}").cid; return json(caller ? caller.roles[cid] ?? null : null);
  }
  if (p === "/rest/v1/profiles") return json(caller ? [{ role: caller.profile }] : []);
  // This suite runs the webhook as it behaves BEFORE migration 0069b: the
  // function does not exist, so the handler takes its direct-write path.
  // scripts/stripe-webhook-test.mjs covers the 0069b path.
  if (p === "/rest/v1/rpc/stripe_apply_event") return json({ code: "PGRST202", message: "Could not find the function" }, 404);
  if (method !== "GET") DB_WRITES.push({ method, path: p, search: url.search, body: body ? JSON.parse(body) : null });
  return json([], method === "GET" ? 200 : 201);
};

const mkRes = () => { const r = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; }; r.end = (b) => { if (b !== undefined) r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; return r; };
const mods = {};
async function call(route, token, body, headers = {}) {
  mods[route] = mods[route] || (await import(`../api/${route}.js`)).default;
  const before = STRIPE_CALLS.length; const res = mkRes();
  await mods[route]({ method: "POST", query: {}, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body, url: `/api/${route}` }, res);
  return { status: res.statusCode, body: res.body, stripe: STRIPE_CALLS.slice(before) };
}

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const DEFAULT = "https://passport-xi-five.vercel.app";

// ========================================================== CHECKOUT ==
console.log("\n  CHECKOUT: who may start it");
for (const [t, c, label] of [["tok-ownerA", A, "owner of A"], ["tok-coadminA", A, "company admin of A"], ["tok-admin", A, "platform admin"], ["tok-ownerB", B, "owner of B, for B"]]) {
  const r = await call("stripe-checkout", t, { tier: "basic", companyId: c });
  const sess = r.stripe.find((x) => x.path === "/v1/checkout/sessions");
  ok(r.status === 200 && sess, `${label} -> 200 and a checkout session`, `${r.status} ${JSON.stringify(r.body)}`);
  ok(sess && sess.params["metadata[company_id]"] === c && sess.params["subscription_data[metadata][company_id]"] === c && sess.params.client_reference_id === c,
     `  ...stamped with the AUTHORISED company id (session and subscription metadata)`);
}
for (const [t, c, label] of [["tok-editorA", A, "editor of A"], ["tok-publisherA", A, "publisher of A"], ["tok-analystA", A, "analyst of A"],
                             ["tok-viewerA", A, "viewer of A"], ["tok-investor", A, "investor"], ["tok-ownerB", A, "owner of B, for A"],
                             ["tok-ownerA", B, "owner of A, for B"]]) {
  const r = await call("stripe-checkout", t, { tier: "basic", companyId: c });
  ok(r.status === 403 && r.stripe.length === 0, `${label} -> 403, Stripe never called`, `${r.status} stripe=${r.stripe.length}`);
}
{ const r = await call("stripe-checkout", null, { tier: "basic", companyId: A });
  ok(r.status === 401 && r.stripe.length === 0, "anonymous -> 401, Stripe never called"); }
{ const r = await call("stripe-checkout", "tok-ownerA", { tier: "basic", companyId: "not-a-uuid&or=(id.neq.0)" });
  ok(r.status === 400 && r.stripe.length === 0, "a malformed companyId -> 400 before any lookup"); }
{ const r = await call("stripe-checkout", "tok-ownerA", { tier: "platinum", companyId: A });
  ok(r.status === 400 && r.stripe.length === 0, "an unknown tier -> 400, Stripe never called"); }
{ roleDown = true; const r = await call("stripe-checkout", "tok-ownerA", { tier: "basic", companyId: A }); roleDown = false;
  ok(r.status === 502 && r.stripe.length === 0, "role cannot be checked -> 502 (fails closed), Stripe never called"); }

console.log("\n  CHECKOUT: return URLs never come from the request");
{ const r = await call("stripe-checkout", "tok-ownerA", { tier: "basic", companyId: A },
    { origin: "https://evil.invalid", host: "evil.invalid", "x-forwarded-host": "evil.invalid", referer: "https://evil.invalid/x" });
  const s = r.stripe.find((x) => x.path === "/v1/checkout/sessions");
  ok(s && s.params.success_url === `${DEFAULT}/portal?checkout=success` && s.params.cancel_url === `${DEFAULT}/portal?checkout=cancelled`,
     "spoofed Origin / Host / x-forwarded-host / Referer -> return URLs stay on the portal origin", JSON.stringify(s && s.params.success_url)); }
{ process.env.PORTAL_ORIGIN = "https://portal.staging.invalid";
  const r = await call("stripe-checkout", "tok-ownerA", { tier: "basic", companyId: A }, { origin: "https://evil.invalid" });
  ok(r.stripe.find((x) => x.path === "/v1/checkout/sessions").params.success_url.startsWith("https://portal.staging.invalid/portal"), "PORTAL_ORIGIN, when set, is used (and still beats the request's Origin)");
  for (const bad of ["http://evil.invalid", "javascript:alert(1)", "https://user:pw@evil.invalid", "not a url"]) {
    process.env.PORTAL_ORIGIN = bad;
    const rr = await call("stripe-checkout", "tok-ownerA", { tier: "basic", companyId: A });
    ok(rr.stripe.find((x) => x.path === "/v1/checkout/sessions").params.success_url.startsWith(`${DEFAULT}/`), `an unusable PORTAL_ORIGIN (${bad}) falls back to the default, never to the request`);
  }
  delete process.env.PORTAL_ORIGIN;
  const { appOrigin } = await import("../api/_appOrigin.js");
  ok(appOrigin({ PORTAL_ORIGIN: "http://127.0.0.1:8787" }) === "http://127.0.0.1:8787" && appOrigin({ PORTAL_ORIGIN: "http://localhost:5173" }) === "http://localhost:5173",
     "plain http is accepted only for localhost / 127.0.0.1 (local runs)");
  ok(appOrigin({ PUBLIC_APP_URL: "https://mineex.ca" }) === DEFAULT, "PUBLIC_APP_URL (the marketing origin used by share-news) is NOT used for billing returns"); }

console.log("\n  CHECKOUT: configuration is checked after authorisation (F10)");
{ const saved = process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
  ok((await call("stripe-checkout", null, { tier: "basic", companyId: A })).status === 401, "key unset, anonymous -> 401, not a configuration 500");
  ok((await call("stripe-checkout", "tok-investor", { tier: "basic", companyId: A })).status === 403, "key unset, investor -> 403, not a configuration 500");
  ok((await call("stripe-checkout", "tok-ownerA", { tier: "basic", companyId: A })).status === 500, "key unset, an authorised owner -> 500 (only they learn it is unconfigured)");
  process.env.STRIPE_SECRET_KEY = saved; }

// ===================================================== BILLING PORTAL ==
console.log("\n  BILLING PORTAL: who may open it, and for which customer");
for (const [t, label] of [["tok-ownerA", "owner of A"], ["tok-coadminA", "company admin of A"], ["tok-admin", "platform admin"]]) {
  const r = await call("stripe-portal", t, { companyId: A }, { origin: "https://evil.invalid" });
  const sess = r.stripe.find((x) => x.path === "/v1/billing_portal/sessions");
  ok(r.status === 200 && sess && sess.params.customer === "cus_A", `${label} -> 200, A's own customer (cus_A)`, `${r.status} ${JSON.stringify(sess && sess.params)}`);
  ok(sess && sess.params.return_url === `${DEFAULT}/portal?section=billing`, "  ...returning to the portal origin, not the request's");
}
for (const [t, c, label] of [["tok-editorA", A, "editor of A"], ["tok-viewerA", A, "viewer of A"], ["tok-investor", A, "investor"],
                             ["tok-ownerB", A, "owner of B, for A"], ["tok-ownerA", B, "owner of A, for B"]]) {
  const r = await call("stripe-portal", t, { companyId: c });
  ok(r.status === 403 && r.stripe.length === 0, `${label} -> 403, Stripe never called`, `${r.status} stripe=${r.stripe.length}`);
}
{ const r = await call("stripe-portal", null, { companyId: A }); ok(r.status === 401 && r.stripe.length === 0, "anonymous -> 401"); }
{ const r = await call("stripe-portal", "tok-ownerA", {}); ok(r.status === 400 && r.stripe.length === 0, "no companyId -> 400 (the old empty-body call)"); }
{ const r = await call("stripe-portal", "tok-ownerB", { companyId: B });
  ok(r.status === 404 && !r.stripe.some((x) => x.path === "/v1/billing_portal/sessions"), "a company with no card subscription -> 404 (manual/invoiced plan), no portal session"); }
{ const r = await call("stripe-portal", "tok-ownerA", { companyId: A });
  const q = r.stripe.find((x) => x.path === "/v1/subscriptions/search");
  ok(q && decodeURIComponent(new URLSearchParams(q.search).get("query")) === `metadata['company_id']:'${A}'`, "the customer is found by COMPANY metadata, not by the caller's email"); }
console.log("\n  BILLING PORTAL: when Stripe Search is unavailable");
{ searchAvailable = false;
  const r = await call("stripe-portal", "tok-ownerA", { companyId: A });
  ok(r.status === 200 && r.stripe.find((x) => x.path === "/v1/billing_portal/sessions").params.customer === "cus_A",
     "falls back to the caller's email, but only a customer whose subscription is stamped with THIS company");
  const r2 = await call("stripe-portal", "tok-ownerB", { companyId: B });
  ok(r2.status === 404, "  ...so a same-email customer that pays for a DIFFERENT company is never used");
  searchAvailable = true; }

// ============================================================ WEBHOOK ==
// Signed with an INDEPENDENT implementation of Stripe's documented scheme (not the
// handler's own code): header "t=<unix>,v1=<hex HMAC-SHA256 of `${t}.${payload}`>".
console.log("\n  WEBHOOK: compatibility with what checkout creates (no live Stripe)");
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const sign = (payload, t = Math.floor(Date.now() / 1000), secret = SECRET) =>
  `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex")}`;
async function hook(event, { sig } = {}) {
  mods.webhook = mods.webhook || (await import("../api/stripe-webhook.js")).default;
  // Every real Stripe event carries `created`; the handler now requires it.
  const payload = JSON.stringify(event.created ? event : { created: Math.floor(Date.now() / 1000), ...event });
  const req = Readable.from([Buffer.from(payload)]);
  Object.assign(req, { method: "POST", headers: { "stripe-signature": sig === undefined ? sign(payload) : sig, "content-type": "application/json" } });
  const res = mkRes(); const before = DB_WRITES.length;
  await mods.webhook(req, res);
  return { status: res.statusCode, writes: DB_WRITES.slice(before) };
}
// Build the session event FROM the parameters checkout actually sent.
const sent = STRIPE_CALLS.filter((x) => x.path === "/v1/checkout/sessions").find((x) => x.params["metadata[company_id]"] === A).params;
const session = { id: "cs_test_1", object: "checkout.session", mode: "subscription", subscription: "sub_A", client_reference_id: sent.client_reference_id,
  metadata: { company_id: sent["metadata[company_id]"], tier: sent["metadata[tier]"] } };
{ const r = await hook({ id: "evt_1", type: "checkout.session.completed", data: { object: session } });
  const sub = r.writes.find((w) => w.path === "/rest/v1/company_subscriptions");
  const tier = r.writes.find((w) => w.path === "/rest/v1/companies");
  ok(r.status === 200 && sub && sub.body.company_id === A && sub.body.plan_id === "passport" && sub.body.status === "active" && sub.body.note === "stripe",
     "checkout.session.completed built from checkout's own params -> A's subscription active on plan passport", JSON.stringify(sub && sub.body));
  ok(tier && tier.search.includes(`id=eq.${A}`) && tier.body.tier === "basic", "  ...and A's tier set to the purchased tier"); }
{ const subObj = { id: "sub_A", object: "subscription", status: "past_due", current_period_end: 4102444800, metadata: { company_id: A, tier: "basic" } };
  const r = await hook({ id: "evt_2", type: "customer.subscription.updated", data: { object: subObj } });
  ok(r.writes.some((w) => w.path === "/rest/v1/company_subscriptions" && w.body.status === "past_due") && !r.writes.some((w) => w.path === "/rest/v1/companies"),
     "customer.subscription.updated (past_due) -> past_due, tier untouched");
  const d = await hook({ id: "evt_3", type: "customer.subscription.deleted", data: { object: { ...subObj, status: "canceled" } } });
  ok(d.writes.some((w) => w.path === "/rest/v1/company_subscriptions" && w.body.status === "cancelled"), "customer.subscription.deleted -> cancelled");
  const f = await hook({ id: "evt_4", type: "invoice.payment_failed", data: { object: { id: "in_1", subscription_details: { metadata: { company_id: A } } } } });
  ok(f.writes.some((w) => w.path === "/rest/v1/company_subscriptions" && w.body.status === "past_due"), "invoice.payment_failed (subscription_details.metadata) -> past_due");
  const u = await hook({ id: "evt_5", type: "invoice.paid", data: { object: { id: "in_2" } } });
  ok(u.status === 200 && u.writes.length === 0, "an event type the handler does not use -> 200, no writes"); }
{ const e = { id: "evt_6", type: "checkout.session.completed", created: Math.floor(Date.now() / 1000), data: { object: session } }, p = JSON.stringify(e);
  for (const [label, sig] of [["no signature", ""], ["wrong secret", sign(p, undefined, "whsec_wrong")], ["tampered body", sign(p.replace(A, B))], ["garbage", "t=1,v1=zz"]]) {
    const r = await hook(e, { sig });
    ok(r.status === 400 && r.writes.length === 0, `bad signature (${label}) -> 400, nothing written`);
  }
  const t = Math.floor(Date.now() / 1000);
  const both = `t=${t},v1=${crypto.createHmac("sha256", SECRET).update(`${t}.${p}`).digest("hex")},v0=${"0".repeat(64)}`;
  ok((await hook(e, { sig: both })).status === 200, "a header carrying Stripe's extra v0 scheme alongside v1 is accepted");
  const rotated = `t=${t},v1=${crypto.createHmac("sha256", SECRET).update(`${t}.${p}`).digest("hex")},v1=${"0".repeat(64)}`;
  const rr = await hook(e, { sig: rotated });
  ok(rr.status === 200, "(secret rotation, F9) two v1 signatures, first valid -> accepted"); }

console.log(`\nbilling access: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
