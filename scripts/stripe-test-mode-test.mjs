// a20 Stripe test mode, offline: scripts/stripe-test-mode-check.mjs against the
// REAL api/stripe-checkout.js, api/stripe-portal.js and api/stripe-webhook.js,
// run in-process, with Stripe and Supabase played by a stub.
//   node scripts/stripe-test-mode-test.mjs
//
// OFFLINE. No Stripe key exists here and nothing leaves the process: Stripe is a
// small stateful model below (sessions, customers, subscriptions, search, events)
// and the database is a model of company B's subscription row and 0069b's
// stripe_apply_event. The CLI is only ever run from an empty temporary folder, so
// it can never find a real staging environment and start a live run.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { spawnSync } from "node:child_process";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const SB = "https://stub-project.supabase.invalid", API = "http://api.offline.invalid";
const KEY = "sk_test_offlineStubKey000000", WHSEC = "whsec_offlineStubSecret0000", SERVICE = "stub-service-role-key-000";
const A = "aaaaaaaa-0000-4000-8000-00000000000a", B = "bbbbbbbb-0000-4000-8000-00000000000b";
Object.assign(process.env, {
  VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_stubKeyForOfflineTests", SUPABASE_SERVICE_ROLE_KEY: SERVICE,
  STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_PRICE_BASIC: "price_offline_basic",
});
delete process.env.MINEEX_ENV; delete process.env.PORTAL_ORIGIN;

const { stripeGate, runStripeTestMode } = await import("./stripe-test-mode-check.mjs");
const handlers = {
  "stripe-checkout": (await import("../api/stripe-checkout.js")).default,
  "stripe-portal": (await import("../api/stripe-portal.js")).default,
  "stripe-webhook": (await import("../api/stripe-webhook.js")).default,
};
const ISO = {
  ISOLATION_SUPABASE_URL: SB, ISOLATION_ANON_KEY: "sb_publishable_stubKeyForOfflineTests", ISOLATION_COMPANY_B_ID: B,
  ISOLATION_COMPANY_A_EMAIL: "a@stub.invalid", ISOLATION_COMPANY_A_PASS: "pass-A-Qw81zz", ISOLATION_COMPANY_B_EMAIL: "b@stub.invalid", ISOLATION_COMPANY_B_PASS: "pass-B-Er27yy",
};
const API_ENV = { STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_PRICE_BASIC: "price_offline_basic", STAGING_STRIPE_MODE: "test", STAGING_SUPABASE_SERVICE_ROLE_KEY: SERVICE };
const GATE = { key: KEY, whsec: WHSEC, price: "price_offline_basic" };
const TIER_PLAN = { free: "passport", basic: "passport", pro: "passport_managed" };

/** One world per run. `bug` introduces one defect. */
function world(bug = null) {
  const st = { sessions: {}, customers: {}, subs: {}, events: [], searchCalls: 0, stripeCalls: [], n: 0 };
  const db = {
    row: { company_id: B, plan_id: "passport", status: "active", note: "manual", renews_at: null, stripe_subscription_id: "sub_left_by_an_earlier_run", stripe_status: "active", stripe_event_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" },
    tier: "free", seen: new Set(), stored: new Set(),
  };
  const original = JSON.parse(JSON.stringify(db.row));
  const id = (p) => `${p}${(++st.n).toString().padStart(6, "0")}`;
  const now = () => Math.floor(Date.now() / 1000);
  const json = (b, status = 200) => new Response(status === 204 ? null : JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  const emit = (type, obj) => st.events.push({ id: id("evt_test_"), object: "event", type, created: now(), livemode: false, data: { object: JSON.parse(JSON.stringify(obj)) } });
  const TOKENS = { "a@stub.invalid|pass-A-Qw81zz": "tok-ownerA", "b@stub.invalid|pass-B-Er27yy": "tok-ownerB" };

  async function stripe(u, method, params) {
    const auth = this && this.auth;
    st.stripeCalls.push({ method, path: u.pathname, auth });
    if (auth !== `Bearer ${KEY}`) return json({ error: { message: "bad key" } }, 401);
    const p = u.pathname.replace("/v1/", "");
    let m;
    if (p === "checkout/sessions" && method === "POST") {
      const s = { id: id("cs_test_"), object: "checkout.session", livemode: false, mode: params.get("mode"), status: "open", client_reference_id: params.get("client_reference_id"), success_url: params.get("success_url"), cancel_url: params.get("cancel_url"), metadata: { company_id: params.get("metadata[company_id]"), tier: params.get("metadata[tier]") } };
      s.url = `https://checkout.stripe.com/c/pay/${s.id}#stub`;
      st.sessions[s.id] = s; return json(s);
    }
    if ((m = p.match(/^checkout\/sessions\/([^/]+)$/))) return st.sessions[m[1]] ? json(st.sessions[m[1]]) : json({ error: {} }, 404);
    if ((m = p.match(/^checkout\/sessions\/([^/]+)\/expire$/))) { st.sessions[m[1]].status = "expired"; return json(st.sessions[m[1]]); }
    if (p === "customers" && method === "POST") { const c = { id: id("cus_"), object: "customer", livemode: false, email: params.get("email") }; st.customers[c.id] = c; return json(c); }
    if ((m = p.match(/^customers\/([^/]+)$/)) && method === "DELETE") { delete st.customers[m[1]]; return json({ id: m[1], deleted: true }); }
    if (p === "subscriptions" && method === "POST") {
      const end = now() + 365 * 86400;
      const s = { id: id("sub_"), object: "subscription", livemode: bug === "livemode", status: "active", customer: params.get("customer"), created: now(), metadata: { company_id: params.get("metadata[company_id]"), tier: params.get("metadata[tier]") }, items: { data: [{ price: { id: params.get("items[0][price]") }, current_period_end: end }] } };
      if (bug !== "period-end-on-item") s.current_period_end = end;
      st.subs[s.id] = s; emit("customer.subscription.created", s); return json(s);
    }
    if (p === "subscriptions/search") {
      st.searchCalls++;
      if (st.searchCalls === 1) return json({ object: "search_result", data: [] });   // Search lags behind writes
      const cid = decodeURIComponent(u.search).match(/company_id'\]:'([^']+)'/)[1];
      return json({ object: "search_result", data: Object.values(st.subs).filter((s) => s.metadata.company_id === cid) });
    }
    if ((m = p.match(/^subscriptions\/([^/]+)$/))) {
      const s = st.subs[m[1]];
      if (!s) return json({ error: {} }, 404);
      if (method === "DELETE") { s.status = "canceled"; emit("customer.subscription.deleted", s); }
      return json(s);
    }
    if (p === "events") {
      const type = u.searchParams.get("type"), since = Number(u.searchParams.get("created[gte]"));
      return json({ object: "list", data: st.events.filter((e) => e.type === type && e.created >= since).reverse() });
    }
    if (p === "billing_portal/sessions") return json({ id: id("bps_"), livemode: false, url: `https://billing.stripe.com/p/session/${id("test_")}` });
    return json({ error: { message: `unmodelled ${method} ${p}` } }, 400);
  }

  // 0069b, reduced to what this flow exercises.
  function applyEvent(a) {
    if (db.seen.has(a.p_event_id)) return "duplicate";
    if (a.p_kind === "ignore") { db.seen.add(a.p_event_id); return "ignored"; }
    const row = db.row;
    if (a.p_kind !== "bind" && (!row || !row.stripe_subscription_id)) {
      if (a.p_verified_subscription === undefined) return "needs_verification";   // nothing recorded; the handler asks again
      if (a.p_verified_subscription !== a.p_subscription) { db.seen.add(a.p_event_id); return "unverified_binding"; }
    } else if (row && row.stripe_subscription_id && row.stripe_subscription_id !== a.p_subscription) { db.seen.add(a.p_event_id); return "other_subscription"; }
    db.seen.add(a.p_event_id); db.stored.add(a.p_event_id);
    db.row = { ...(row || { company_id: a.p_company }), plan_id: TIER_PLAN[a.p_tier] || "passport", status: a.p_status, renews_at: a.p_renews_at, note: "stripe", stripe_subscription_id: a.p_subscription, stripe_status: a.p_stripe_status, stripe_event_at: a.p_created, updated_at: new Date().toISOString() };
    if (a.p_status === "active" && a.p_tier) db.tier = a.p_tier;
    return "applied";
  }

  async function supabase(u, method, h, bodyText) {
    const p = u.pathname, bodyJ = bodyText ? JSON.parse(bodyText) : null;
    const token = String(h.authorization || h.Authorization || "").replace(/^Bearer /, "");
    if (p === "/auth/v1/token") { const t = TOKENS[`${bodyJ.email}|${bodyJ.password}`]; return t ? json({ access_token: t, user: { id: `u-${t}` } }) : json({ error: "invalid_grant" }, 400); }
    if (p === "/auth/v1/user") return token.startsWith("tok-") ? json({ id: `u-${token}`, email: `${token}@stub.invalid` }) : json({ msg: "bad jwt" }, 401);
    if (p === "/rest/v1/rpc/my_company_role") return json(token === "tok-ownerB" && bodyJ.cid === B ? "owner" : bug === "other-owner-admitted" && token === "tok-ownerA" ? "owner" : null);
    if (p === "/rest/v1/profiles") return json([{ role: "company" }]);
    if (p === "/rest/v1/rpc/my_features") return json(token === "tok-ownerB" ? ["portal_access"] : []);
    if (token !== SERVICE) return json({ message: "service only" }, 401);
    if (p === "/rest/v1/rpc/stripe_apply_event") return json(applyEvent(bodyJ));
    if (p === "/rest/v1/company_subscriptions") {
      if (method === "GET") return json(db.row ? [db.row] : []);
      if (method === "PATCH") { db.row = { ...db.row, ...bodyJ }; return json(undefined, 204); }
      if (method === "DELETE") { db.row = null; return json(undefined, 204); }
    }
    if (p === "/rest/v1/companies") { if (method === "GET") return json([{ tier: db.tier }]); db.tier = bodyJ.tier; return json(undefined, 204); }
    if (p === "/rest/v1/stripe_events") {
      const ids = (u.searchParams.get("id") || "").replace(/^in\.\(|\)$/g, "").split(",");
      if (method === "DELETE") { ids.forEach((x) => db.stored.delete(x)); return json(undefined, 204); }
      return json(ids.filter((x) => db.stored.has(x)).map((x) => ({ id: x })));
    }
    return json({ message: `unmodelled ${method} ${p}` }, 404);
  }

  const mkRes = () => { const r = { statusCode: 200, body: undefined, headers: {} };
    r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = JSON.stringify(b); return r; };
    r.send = (b) => { r.body = typeof b === "string" ? b : JSON.stringify(b); return r; }; r.end = (b) => { if (b !== undefined) r.body = b; return r; };
    r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; return r; };

  const fetchImpl = async (href, init = {}) => {
    const u = new URL(href), method = init.method || "GET", h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (u.host === "api.stripe.com") return stripe.call({ auth: h.authorization }, u, method, new URLSearchParams(typeof init.body === "string" ? init.body : ""));
    if (u.origin === SB) return supabase(u, method, h, init.body);
    if (u.origin === API && u.pathname.startsWith("/api/")) {
      const route = u.pathname.slice(5), res = mkRes();
      const req = route === "stripe-webhook" ? Object.assign(Readable.from([Buffer.from(init.body || "")]), { method, headers: h, query: {}, url: u.pathname }) : { method, headers: h, query: {}, body: JSON.parse(init.body || "null"), url: u.pathname };
      await handlers[route](req, res);
      return new Response(res.body ?? "", { status: res.statusCode, headers: { "content-type": "application/json" } });
    }
    throw new Error(`offline: unexpected request to ${u.origin}`);
  };
  return { st, db, original, fetchImpl };
}

async function run(bug) {
  const w = world(bug);
  globalThis.fetch = w.fetchImpl;   // the handlers' own Stripe and Supabase calls
  const lines = [];
  const r = await runStripeTestMode({ gate: GATE, iso: ISO, apiEnv: API_ENV, api: API, fetchImpl: w.fetchImpl, out: (m) => lines.push(m), err: (m) => lines.push(m), sleep: async () => {}, polls: 5 });
  return { ...r, w, text: lines.join("\n") };
}

console.log("\n  THE GATE (decided before any request)");
{
  const g = (api, shell) => stripeGate(api, shell || {});
  ok(g(null).skip, "no staging API environment: SKIP");
  ok(g({}).skip && g({}).missing.length === 4, "keys missing: SKIP, naming all four settings");
  ok(g({ ...API_ENV, STAGING_STRIPE_MODE: "mock" }).skip, "test keys but STAGING_STRIPE_MODE=mock: SKIP (the API would mock Stripe)");
  ok(g({ ...API_ENV, STRIPE_SECRET_KEY: "" }, { STRIPE_SECRET_KEY: "sk_test_x" }).note.includes("reads only"), "a key in this shell but not in .api-env: SKIP, and says why");
  ok(/LIVE/.test(g({ ...API_ENV, STRIPE_SECRET_KEY: "sk_live_x" }).refuse || ""), "sk_live_ in .api-env: REFUSED");
  ok(/LIVE/.test(g(null, { STRIPE_SECRET_KEY: "rk_live_x" }).refuse || ""), "rk_live_ in this shell: REFUSED, even with no .api-env");
  ok(/LIVE/.test(g({ ...API_ENV, VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_x" }).refuse || ""), "a live publishable key: REFUSED");
  ok(g({ ...API_ENV, STRIPE_SECRET_KEY: "pk_test_x" }).skip, "a publishable key where the secret key goes: SKIP");
  ok(!g(API_ENV).skip && !g(API_ENV).refuse && g({ ...API_ENV, STRIPE_SECRET_KEY: "rk_test_x" }).key === "rk_test_x", "sk_test_ / rk_test_ with whsec_, a price and mode=test: runs");
}
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "a20-offline-"));   // no supabase/staging here, ever
  const script = path.resolve("scripts/stripe-test-mode-check.mjs");
  const clean = { PATH: process.env.PATH, HOME: process.env.HOME };
  const r1 = spawnSync(process.execPath, [script], { cwd: tmp, env: clean, encoding: "utf8", timeout: 20000 });
  ok(r1.status === 0 && /stripe-test-mode: SKIP/.test(r1.stdout) && /nothing ran/.test(r1.stdout), "the CLI today: exits 0 with SKIP and what is missing", `${r1.status} ${r1.stderr}`);
  const r2 = spawnSync(process.execPath, [script], { cwd: tmp, env: { ...clean, STRIPE_SECRET_KEY: "sk_live_abc" }, encoding: "utf8", timeout: 20000 });
  ok(r2.status === 2 && /REFUSING -- STRIPE_SECRET_KEY in this shell is a LIVE/.test(r2.stderr), "the CLI with a live key in the shell: exits 2", `${r2.status}`);
  fs.mkdirSync(path.join(tmp, "supabase/staging"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "supabase/staging/.api-env"), "STRIPE_SECRET_KEY=sk_live_abc\nSTAGING_STRIPE_MODE=test\n");
  const r3 = spawnSync(process.execPath, [script], { cwd: tmp, env: clean, encoding: "utf8", timeout: 20000 });
  ok(r3.status === 2 && /\.api-env is a LIVE/.test(r3.stderr), "the CLI with a live key in .api-env: exits 2", `${r3.status}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("\n  THE FLOW (real handlers, Stripe modelled)");
const good = await run();
ok(good.fail === 0 && good.pass >= 25, `checkout -> webhook -> state -> portal -> cancel: ${good.pass} passed, ${good.fail} failed`, good.text.split("\n").filter((l) => l.includes("✗")).join("\n"));
for (const m of ["another company's owner cannot start B's checkout (403)", "it names company B and the tier", "Stripe Search finds it by company", "signed with the wrong secret -> 400", "delivered -> 200, applied", "redelivered -> duplicate", "renews_at is the subscription's period end", "B is bound to this subscription", "B's owner gets a Stripe billing portal URL", "B's subscription: cancelled", "B's subscription row and tier restored; the run's stripe_events removed"]) ok(good.text.includes(`✓ ${m}`), `checked: ${m}`);
ok(good.w.st.stripeCalls.every((c) => c.auth === `Bearer ${KEY}`), `all ${good.w.st.stripeCalls.length} Stripe calls (script and handlers) use the test key`);
ok(good.w.st.stripeCalls.some((c) => c.path === "/v1/subscriptions/search") && good.w.st.searchCalls >= 2, "the script waited out Search lag before delivering the first binding");
ok(Object.keys(good.w.st.customers).length === 0 && Object.values(good.w.st.sessions).every((s) => s.status === "expired"), "Stripe left clean: customer deleted, session expired");
ok(JSON.stringify({ ...good.w.db.row, updated_at: 0 }) === JSON.stringify({ ...good.w.original, updated_at: 0 }) && good.w.db.tier === "free" && good.w.db.stored.size === 0, "staging left as found: B's row (with its old binding), tier, no event rows");
const leaks = [KEY, WHSEC, SERVICE, ISO.ISOLATION_COMPANY_A_PASS, ISO.ISOLATION_COMPANY_B_PASS, "tok-ownerA", "tok-ownerB"].filter((s) => good.text.includes(s));
ok(leaks.length === 0, "no key, webhook secret, service key, password or token in the output", leaks.join(", "));

console.log("\n  EACH DEFECT IS CAUGHT");
{
  const r = await run("livemode");
  ok(r.fail > 0 && /✗ test mode held/.test(r.text) && /✓ the test customer is deleted/.test(r.text), "Stripe answers livemode:true -> the run stops, says so, and still cleans up");
  const o = await run("other-owner-admitted");
  ok(o.fail > 0 && /✗ another company's owner cannot start B's checkout/.test(o.text) && /✗ another company's owner cannot open B's billing portal/.test(o.text), "a role check that admits another company's owner -> FAIL at checkout and portal");
  const p = await run("period-end-on-item");
  ok(p.fail === 0 && /✓ renews_at is the subscription's period end/.test(p.text), "current_period_end only on the item (Stripe API 2025-03-31+): the webhook reads it there (renews_at was stored null before)", p.text.split("\n").filter((l) => l.includes("✗")).join(" | "));
}

{
  const { interpret } = await import("../api/stripe-webhook.js");
  const w = world("period-end-on-item"); globalThis.fetch = w.fetchImpl;
  const end = Math.floor(Date.now() / 1000) + 365 * 86400;
  w.st.subs.sub_item = { id: "sub_item", livemode: false, status: "active", metadata: { company_id: B, tier: "basic" }, items: { data: [{ current_period_end: end }] } };
  const m = await interpret({ id: "evt_x", type: "checkout.session.completed", created: 1, data: { object: { metadata: { company_id: B, tier: "basic" }, client_reference_id: B, subscription: "sub_item" } } });
  ok(m.kind === "bind" && m.renewsAt === new Date(end * 1000).toISOString(), "the checkout path reads the item's period end too");
  const none = await interpret({ id: "evt_y", type: "customer.subscription.updated", created: 1, data: { object: { id: "sub_q", status: "active", metadata: { company_id: B } } } });
  ok(none.renewsAt === null, "no period end anywhere -> null, not a bad date");
}

console.log(`\n  stripe-test-mode offline: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
