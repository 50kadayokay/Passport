// Regression tests for the authorization and configuration risks found in the
// 2026-10-30 handler trace (docs/STAGING-API-PLAN.md §3).
//
//   node scripts/authz-risk-test.mjs
//
// OFFLINE AND DETERMINISTIC. The handlers run in this process against a stubbed
// fetch that plays Supabase, Stripe, Anthropic and "the network" -- nothing
// leaves the machine, no credential is used, and no database is needed. That is
// what lets these run in `npm test`: the live staging suite (api-authz-test.mjs)
// confirms the same behaviour end to end, but needs a running server.
//
// EACH TEST ASSERTS THE SECURE BEHAVIOUR. Where today's code does not have it,
// the test is marked `known` with its finding id and reported as KNOWN, so:
//   • the run is green while every failure is a known, documented finding;
//   • a NEW failure fails the run;
//   • a known finding that starts PASSING also fails the run, so the marker is
//     removed in the same change that fixes it, and the test then guards it.
// No production authorization policy is changed by this file -- it documents.

const STUB_SB = "https://stub-project.supabase.invalid";
process.env.VITE_SUPABASE_URL = STUB_SB;
process.env.VITE_SUPABASE_ANON_KEY = "sb_publishable_stubKeyForOfflineTests";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";
process.env.DISPATCH_SECRET = "stub-dispatch-secret-value";
process.env.NEWS_PULL_SECRET = "stub-news-secret-value";
process.env.STRIPE_SECRET_KEY = "sk_test_stub";
process.env.STRIPE_PRICE_BASIC = "price_stub_basic";
process.env.ANTHROPIC_API_KEY = "stub-anthropic";
delete process.env.MINEEX_ENV;
delete process.env.PUBLIC_BASE_URL;

const COMPANY_A_UUID = "aaaaaaaa-0000-4000-8000-00000000000a";
const COMPANY_B_UUID = "bbbbbbbb-0000-4000-8000-00000000000b";

// ---- the stub network --------------------------------------------------------
const CALLS = [];
const USERS = { "tok-investor": { id: "u-investor", email: "inv@stub.invalid" }, "tok-ownerA": { id: "u-ownerA", email: "a@stub.invalid" } };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const method = (init.method || "GET").toUpperCase();
  const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  CALLS.push({ host: url.host, path: url.pathname, search: url.search, method, headers, body: typeof init.body === "string" ? init.body : "" });
  const auth = (headers.authorization || "").replace(/^Bearer /, "");
  if (url.origin === STUB_SB) {
    const p = url.pathname + url.search;
    if (p.startsWith("/auth/v1/user")) return USERS[auth] ? json(USERS[auth]) : json({ msg: "invalid" }, 401);
    // Published companies are publicly readable -- mirrors the real policy.
    if (p.startsWith("/rest/v1/companies")) return json([{ id: "company-B", name: "B", slug: "b" }]);
    if (p.startsWith("/rest/v1/conversations")) return json([{ id: "conv-1", ceo_email: null }]);
    if (p.startsWith("/rest/v1/messages") && method === "POST") return json([], 201);
    if (p.startsWith("/rest/v1/publications")) return json([{ id: "pub-1", company_id: "company-A", destination_id: "passport", status: "draft", update_id: null }]);
    if (p.startsWith("/rest/v1/rpc/my_features")) return json(["passport_profile"]);
    // The AI guard's own calls (F4): kill switch on, nobody holds a company role
    // here, counters always under the limit, and only the admin token is an admin.
    if (p.startsWith("/rest/v1/rpc/ai_enabled")) return json(true);
    // tok-ownerA owns COMPANY_A_UUID; nobody else holds a company role here.
    if (p.startsWith("/rest/v1/rpc/my_company_role")) return json(auth === "tok-ownerA" && JSON.parse(init.body || "{}").cid === COMPANY_A_UUID ? "owner" : null);
    if (p.startsWith("/rest/v1/rpc/bump_submission_throttle")) return json(1);
    if (p.startsWith("/rest/v1/profiles")) return json([{ role: auth === "tok-admin" ? "admin" : auth === "tok-investor" ? "investor" : "company" }]);
    if (p.startsWith("/rest/v1/destinations")) return json([{ feature_id: "passport_profile" }]);
    if (p.startsWith("/rest/v1/rpc/publish_publication")) return json({ ok: true, published_at: new Date().toISOString() });
    if (p.startsWith("/rest/v1/rpc/revise_publication")) return json({ ok: true, revision: 2 });
    if (p.startsWith("/rest/v1/news_items")) return json([{ id: "n-1", title: "t", mineex_summary: "s", news_item_companies: [] }]);
    // One registered device (a stub), so news-broadcast reaches its chaining step.
    if (p.startsWith("/rest/v1/push_tokens")) return json([{ user_id: "u-investor", token: "stub-device", platform: "ios" }]);
    return json([]);
  }
  if (url.host === "api.stripe.com") return json({ id: "cs_test", url: "https://checkout.stripe.invalid/x" });
  if (url.host === "api.anthropic.com") return json({ content: [{ type: "text", text: "{}" }], usage: { input_tokens: 1, output_tokens: 1 } });
  return json({}); // "the network": recorded, answered, never real
};

// ---- a Vercel-shaped request/response pair ---------------------------------------
function mkReq({ method = "POST", query = {}, headers = {}, body } = {}) {
  return { method, query, headers: { host: "app.stub.invalid", ...headers }, body, url: "/api/x" };
}
function mkRes() {
  const r = { statusCode: 200, body: undefined, headers: {}, headersSent: false };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; r.headersSent = true; return r; };
  r.send = (b) => { r.body = b; r.headersSent = true; return r; };
  r.end = (b) => { if (b !== undefined) r.body = b; r.headersSent = true; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  return r;
}
async function run(mod, req) { CALLS.length = 0; const res = mkRes(); await (await import(`../api/${mod}.js`)).default(req, res); return { res, calls: CALLS.slice() }; }

// ---- ledger -----------------------------------------------------------------------
let pass = 0, knownFail = 0, unexpected = 0, fixedKnown = 0;
function check(name, secure, { known, detail = "" } = {}) {
  if (secure && !known) { pass++; console.log(`  ✓ ${name}`); }
  else if (secure && known) { fixedKnown++; console.error(`  ! ${name}\n      now SECURE -- remove the ${known} marker so this test guards the fix`); }
  else if (!secure && known) { knownFail++; console.log(`  ~ KNOWN ${known}: ${name}${detail ? `\n      ${detail}` : ""}`); }
  else { unexpected++; console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`); }
}

// ===================================================================================
console.log("\n  F3 · messages inbound");
{
  delete process.env.MESSAGES_INBOUND_SECRET;
  const { res, calls } = await run("messages", mkReq({ body: { MailboxHash: "conv-1", From: "anyone@stub.invalid", StrippedTextReply: "forged company reply" } }));
  const inserted = calls.some((c) => c.path === "/rest/v1/messages" && c.method === "POST" && /"sender":"company"/.test(c.body));
  check("with MESSAGES_INBOUND_SECRET unset, an unauthenticated MailboxHash post is refused and stores nothing (F3, fixed)",
        res.statusCode === 401 && !inserted, { detail: `got ${res.statusCode}, company message stored: ${inserted}` });
  const r1b = await run("messages", mkReq({ query: { secret: "guess" }, body: { MailboxHash: "11111111-2222-4333-8444-555555555555", From: "anyone@stub.invalid", StrippedTextReply: "forged" } }));
  check("with MESSAGES_INBOUND_SECRET unset, the inbound path itself fails closed: 503, nothing stored (F3, fixed)",
        r1b.res.statusCode === 503 && !r1b.calls.some((c) => c.path === "/rest/v1/messages" && c.method === "POST"), { detail: `got ${r1b.res.statusCode}` });

  process.env.MESSAGES_INBOUND_SECRET = "stub-inbound-secret";
  const r2 = await run("messages", mkReq({ body: { MailboxHash: "conv-1", StrippedTextReply: "forged" } }));
  check("with the secret set, a MailboxHash body with no secret is refused (control)", r2.res.statusCode === 401);
  const r3 = await run("messages", mkReq({ headers: { authorization: "Bearer tok-investor" }, body: { MailboxHash: "conv-1", StrippedTextReply: "forged" } }));
  // Since F3's fix the body shape no longer selects inbound mode: a signed-in
  // investor's MailboxHash post is an ordinary (malformed) send. The property is
  // that no COMPANY reply is stored, whatever the status.
  check("with the secret set, an INVESTOR posting MailboxHash cannot forge a company reply (control)",
        !r3.calls.some((c) => c.path === "/rest/v1/messages" && c.method === "POST" && /"sender":"company"/.test(c.body)) && r3.res.statusCode >= 400,
        { detail: `got ${r3.res.statusCode}` });
}

console.log("\n  F5 · the Host header must not choose where internal secrets go");
{
  const { calls } = await run("publish", mkReq({ headers: { authorization: "Bearer tok-ownerA", "x-forwarded-host": "canary.invalid" }, body: { publicationId: "pub-1" } }));
  const leaked = calls.filter((c) => c.host !== new URL(STUB_SB).host && c.headers["x-dispatch-secret"]);
  check("publish never sends DISPATCH_SECRET to a host named by the request",
        !leaked.some((c) => c.host === "canary.invalid"), { known: "F5", detail: `DISPATCH_SECRET sent to: ${leaked.map((c) => c.host).join(", ") || "none"}` });
}
{
  // news-broadcast chains to news-push-send on PUBLIC_BASE_URL || Host.
  const { calls } = await run("news-broadcast", mkReq({ headers: { "x-news-secret": "stub-news-secret-value", host: "canary.invalid" }, body: { news_item_id: "n-1" } }));
  const leaked = calls.filter((c) => c.host === "canary.invalid" && c.headers["x-news-secret"]);
  const chained = calls.some((c) => c.path === "/api/news-push-send");
  check("news-broadcast reached its chaining step (control: otherwise the next check is vacuous)", chained);
  check("news-broadcast never sends NEWS_PULL_SECRET to a host named by the request",
        leaked.length === 0, { known: "F5", detail: `NEWS_PULL_SECRET sent to canary.invalid: ${leaked.length} time(s)` });
}

console.log("\n  F2 · Stripe checkout is for a company's owners and platform admins");
{
  const { res, calls } = await run("stripe-checkout", mkReq({ headers: { authorization: "Bearer tok-investor" }, body: { tier: "basic", companyId: COMPANY_B_UUID } }));
  const stripe = calls.some((c) => c.host === "api.stripe.com");
  check("an investor cannot open a checkout for a company they do not own (F2, fixed)",
        res.statusCode === 403 && !stripe, { detail: `got ${res.statusCode}; Stripe session created: ${stripe}` });
  // The OWNER of A (authorised), with a hostile Origin: a session IS created,
  // so this checks the return URLs rather than passing because nothing was sent.
  const own = await run("stripe-checkout", mkReq({ headers: { authorization: "Bearer tok-ownerA", origin: "https://evil.invalid" }, body: { tier: "basic", companyId: COMPANY_A_UUID } }));
  const sess = own.calls.find((c) => c.host === "api.stripe.com" && c.path === "/v1/checkout/sessions");
  check("the success_url is not taken from the request's Origin header (F2, fixed)",
        !!sess && !decodeURIComponent(sess.body).includes("evil.invalid"),
        { detail: sess ? "Origin header flowed into success_url / cancel_url" : `no session created (got ${own.res.statusCode}) -- the control did not run` });
}

console.log("\n  F4 · AI drafting is for authorized company users, not investors");
{
  const { res, calls } = await run("story-extract", mkReq({ headers: { authorization: "Bearer tok-investor" }, body: { text: "release text" } }));
  check("an investor cannot spend on story-extract (F4, fixed: platform admins only)",
        res.statusCode === 403 && !calls.some((c) => c.host === "api.anthropic.com"),
        { detail: `got ${res.statusCode}; Anthropic called: ${calls.some((c) => c.host === "api.anthropic.com")}` });
}

console.log("\n  F10 · configuration is checked AFTER authentication");
{
  const saved = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  const { res } = await run("story-extract", mkReq({ body: { text: "x" } }));
  check("story-extract answers an anonymous caller 401, not a configuration 500 (F10, fixed by the F4 guard order)",
        res.statusCode === 401, { detail: `got ${res.statusCode}: the key check runs before auth, so a probe learns config state and auth is untestable without the key` });
  process.env.ANTHROPIC_API_KEY = saved;
  const sk = process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
  const r2 = await run("stripe-checkout", mkReq({ body: { tier: "basic", companyId: COMPANY_B_UUID } }));
  check("stripe-checkout answers an anonymous caller 401, not a configuration 500 (F10, fixed in Batch D)",
        r2.res.statusCode === 401, { detail: `got ${r2.res.statusCode}` });
  process.env.STRIPE_SECRET_KEY = sk;
}

console.log("\n  F11 · revise-release triggers the dispatcher like publish does");
{
  const { res, calls } = await run("revise-release", mkReq({ headers: { authorization: "Bearer tok-ownerA" }, body: { publicationId: "pub-1", body: "corrected" } }));
  const dispatched = calls.some((c) => c.path === "/api/dispatch");
  check("a successful revision calls /api/dispatch",
        res.statusCode === 200 && dispatched,
        { known: "F11", detail: `status ${res.statusCode}; dispatch attempted: ${dispatched} (invokeDispatchBestEffort() is called without req and throws silently)` });
}

console.log(`\nauthz risks: ${pass} secure, ${knownFail} KNOWN findings, ${unexpected} unexpected, ${fixedKnown} fixed-but-still-marked`);
process.exit(unexpected || fixedKnown ? 1 : 0);
