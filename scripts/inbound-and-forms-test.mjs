// Batch B regression tests -- F3 (inbound messaging) and F7 (lead-form abuse).
//   node scripts/inbound-and-forms-test.mjs
//
// OFFLINE. The real handlers run in this process against a stubbed network that
// plays Supabase (conversations, messages, the throttle RPC, demo_bookings) and
// Postmark. Nothing leaves the machine and no credential is used. The throttle
// stub increments atomically per (ip_hash, form, window), exactly like
// bump_submission_throttle's INSERT ... ON CONFLICT DO UPDATE ... RETURNING, so
// concurrency can be tested without a database. The live staging run of the same
// behaviour is in api-authz-test.mjs.

const STUB_SB = "https://stub-project.supabase.invalid";
process.env.VITE_SUPABASE_URL = STUB_SB;
process.env.VITE_SUPABASE_ANON_KEY = "sb_publishable_stubKeyForOfflineTests";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";
process.env.POSTMARK_SERVER_TOKEN = "stub-postmark";
process.env.MESSAGES_FROM_EMAIL = "noreply@stub.invalid";
process.env.SUBMISSION_SALT = "stub-salt-for-tests";
delete process.env.MINEEX_ENV;

const CONV = "11111111-2222-4333-8444-555555555555";
const CEO = "ceo@iso-alpha.invalid";
let conversation = { id: CONV, ceo_email: CEO };
let throttleDown = false;
const counters = new Map();
const CALLS = [];
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : "";
  CALLS.push({ host: url.host, path: url.pathname, search: url.search, method, body });
  if (url.origin === STUB_SB) {
    if (url.pathname === "/rest/v1/rpc/bump_submission_throttle") {
      if (throttleDown) return json({ message: "db down" }, 500);
      const a = JSON.parse(body); const k = `${a.p_ip_hash}|${a.p_form}|${a.p_window_start}`;
      const n = (counters.get(k) || 0) + 1; counters.set(k, n);   // atomic: one event-loop turn
      return json(n);
    }
    if (url.pathname === "/rest/v1/conversations") return json(conversation ? [conversation] : []);
    if (url.pathname === "/rest/v1/messages" && method === "POST") {
      if (/"email_id":"dup-/.test(body)) return json({ code: "23505" }, 409);
      return json([], 201);
    }
    if (url.pathname === "/rest/v1/demo_bookings") return json([], 201);
    if (url.pathname === "/auth/v1/user") return json({ msg: "invalid" }, 401);
    return json([]);
  }
  if (url.host === "api.postmarkapp.com") return json({ MessageID: "stub", ErrorCode: 0 });
  return json({});
};

function mkReq({ query = {}, headers = {}, body } = {}) {
  return { method: "POST", query, headers: { "x-real-ip": "203.0.113.10", ...headers }, body, url: "/api/x" };
}
function mkRes() {
  const r = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = (b) => { if (b !== undefined) r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  return r;
}
const mod = {};
async function run(name, req) {
  mod[name] = mod[name] || (await import(`../api/${name}.js`)).default;
  const start = CALLS.length; const res = mkRes(); await mod[name](req, res);
  return { res, calls: CALLS.slice(start) };
}
const stored = (calls) => calls.some((c) => c.path === "/rest/v1/messages" && c.method === "POST" && /"sender":"company"/.test(c.body));
const mailed = (calls) => calls.filter((c) => c.host === "api.postmarkapp.com").length;
const leadStored = (calls) => calls.some((c) => c.path === "/rest/v1/demo_bookings");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const SECRET = "inbound-secret-for-tests-0123456789";
const postmark = (over = {}) => ({ MailboxHash: CONV, From: `Alpha CEO <${CEO}>`, FromFull: { Email: CEO }, StrippedTextReply: "Thanks for your interest.", MessageID: `msg-${Math.random()}`, ...over });

// =============================================================== F3 ==
console.log("\n  F3 · INBOUND: FAIL CLOSED");
delete process.env.MESSAGES_INBOUND_SECRET;
{
  const { res, calls } = await run("messages", mkReq({ query: { secret: "anything" }, body: postmark() }));
  ok(res.statusCode === 503 && !stored(calls), "secret UNSET -> 503 and nothing stored (was: accepted from anyone)", `${res.statusCode}`);
}
process.env.MESSAGES_INBOUND_SECRET = "   ";
{ const { res, calls } = await run("messages", mkReq({ query: { secret: "   " }, body: postmark() }));
  ok(res.statusCode === 503 && !stored(calls), "secret set to whitespace -> 503 (treated as unset)"); }
process.env.MESSAGES_INBOUND_SECRET = "short-secret";
{ const { res, calls } = await run("messages", mkReq({ query: { secret: "short-secret" }, body: postmark() }));
  ok(res.statusCode === 503 && !stored(calls), "secret shorter than 16 characters -> 503, even when the caller knows it"); }

process.env.MESSAGES_INBOUND_SECRET = SECRET;
console.log("\n  F3 · INBOUND: FORGED REQUESTS");
for (const [label, query] of [["no secret parameter at all", undefined], ["wrong secret, same length", { secret: SECRET.replace(/.$/, "X") }],
                              ["wrong secret, shorter", { secret: SECRET.slice(0, 10) }], ["wrong secret, longer", { secret: SECRET + "x" }],
                              ["empty secret", { secret: "" }]]) {
  const { res, calls } = await run("messages", mkReq({ query: query || {}, body: postmark() }));
  const expected = query === undefined ? "send path (401, needs a session)" : "401";
  ok(res.statusCode === 401 && !stored(calls), `${label} -> ${expected}, nothing stored`, `${res.statusCode} ${JSON.stringify(res.body)}`);
}
{
  // The old body-shape switch: MailboxHash in the body, an investor's token, no ?secret.
  const { res, calls } = await run("messages", mkReq({ headers: { authorization: "Bearer not-a-real-session" }, body: postmark() }));
  ok(!stored(calls) && res.statusCode === 401, "MailboxHash in the BODY no longer selects inbound mode (falls to the authenticated send path)");
}
{ const { res, calls } = await run("messages", mkReq({ query: { secret: SECRET }, body: postmark({ From: "attacker@evil.invalid", FromFull: { Email: "attacker@evil.invalid" } }) }));
  ok(res.statusCode === 200 && res.body.skipped === "sender-mismatch" && !stored(calls), "correct secret, FORGED sender -> skipped, nothing stored"); }
{ conversation = { id: CONV, ceo_email: null };
  const { res, calls } = await run("messages", mkReq({ query: { secret: SECRET }, body: postmark() }));
  ok(res.statusCode === 200 && res.body.skipped === "no-ceo-email" && !stored(calls), "thread with NO ceo_email -> refused (was: accepted from any sender)");
  conversation = { id: CONV, ceo_email: CEO }; }
{ const { res, calls } = await run("messages", mkReq({ query: { secret: SECRET }, body: postmark({ MailboxHash: "not-a-uuid&or=(id.neq.0)" }) }));
  ok(res.statusCode === 200 && res.body.skipped === "bad-mailbox-hash" && !calls.some((c) => c.path === "/rest/v1/conversations"),
     "a non-UUID MailboxHash is refused before any database lookup"); }
{ conversation = null;
  const { res, calls } = await run("messages", mkReq({ query: { secret: SECRET }, body: postmark() }));
  ok(res.statusCode === 200 && res.body.skipped === "no-conversation" && !stored(calls), "unknown conversation -> skipped");
  conversation = { id: CONV, ceo_email: CEO }; }

console.log("\n  F3 · INBOUND: LEGITIMATE POSTMARK DELIVERY STILL WORKS");
{ const { res, calls } = await run("messages", mkReq({ query: { secret: SECRET }, body: postmark() }));
  const ins = calls.find((c) => c.path === "/rest/v1/messages");
  ok(res.statusCode === 200 && res.body.ok === true && !res.body.skipped && stored(calls), "correct secret + the CEO's address -> company reply stored (200)");
  ok(ins && /"body":"Thanks for your interest\."/.test(ins.body) && new RegExp(`"conversation_id":"${CONV}"`).test(ins.body), "  ...into the right thread, with the stripped reply text"); }
{ const { res, calls } = await run("messages", mkReq({ query: { secret: SECRET }, body: postmark({ FromFull: undefined, From: `"Alpha CEO" <${CEO.toUpperCase()}>` }) }));
  ok(res.statusCode === 200 && stored(calls), "display-name From with different case, no FromFull -> still matched"); }
{ const { res, calls } = await run("messages", mkReq({ query: { secret: SECRET }, body: postmark({ StrippedTextReply: "", TextBody: "Our reply here.\n\nOn Tue, Investor wrote:\n> quoted" }) }));
  ok(res.statusCode === 200 && stored(calls) && /"body":"Our reply here\."/.test(calls.find((c) => c.path === "/rest/v1/messages").body), "no StrippedTextReply -> quoted history cut from TextBody"); }
{ const { res } = await run("messages", mkReq({ query: { secret: SECRET }, body: postmark({ MessageID: "dup-1" }) }));
  ok(res.statusCode === 200 && res.body.ok === true, "a Postmark RETRY of an already-stored reply (409 duplicate) -> 200, not an error loop"); }
{ const { res, calls } = await run("messages", mkReq({ query: { secret: SECRET }, body: postmark({ StrippedTextReply: "", TextBody: "" }) }));
  ok(res.statusCode === 200 && res.body.skipped === "empty" && !stored(calls), "an empty reply -> skipped"); }

console.log("\n  F3 · STATIC");
{ const src = (await import("node:fs")).readFileSync("api/messages.js", "utf8");
  ok(/timingSafeEqual/.test(src), "the secret is compared in constant time");
  ok(/const isInbound = req\.query && req\.query\.secret !== undefined;/.test(src), "inbound mode is selected by the query only, never by body shape");
  const { inboundSecretMatches } = await import("../api/messages.js");
  ok(inboundSecretMatches(SECRET, SECRET) && !inboundSecretMatches(SECRET + "x", SECRET) && !inboundSecretMatches(undefined, SECRET) && !inboundSecretMatches("", SECRET),
     "inboundSecretMatches: equal only for the exact secret; undefined and empty never match"); }

// =============================================================== F7 ==
const lead = (over = {}) => ({ name: "Iso Tester", email: "iso-tester@staging.invalid", company: "Iso Co", message: "Hello", ...over });
console.log("\n  F7 · CONTACT: DURABLE THROTTLE");
{
  const results = [];
  for (let i = 0; i < 7; i++) results.push(await run("contact", mkReq({ headers: { "x-real-ip": "198.51.100.20" }, body: lead() })));
  const codes = results.map((r) => r.res.statusCode);
  ok(codes.slice(0, 5).every((c) => c === 200) && codes.slice(5).every((c) => c === 429), "5 allowed per 10 minutes, then 429", codes.join(","));
  const refused = results.slice(5);
  ok(refused.every((r) => mailed(r.calls) === 0 && !leadStored(r.calls)), "a refused request neither emails support nor stores a lead");
  ok(refused.every((r) => r.res.headers["retry-after"] === "600" && r.res.body.error === "rate-limited"), "429 carries Retry-After: 600 and a clear error");
  ok(results.slice(0, 5).every((r) => mailed(r.calls) === 1), "each admitted request sends exactly one email");
}
console.log("\n  F7 · CONFERENCE: HIGHER CEILING FOR SHARED BOOTH WI-FI");
{
  const codes = [];
  for (let i = 0; i < 22; i++) codes.push((await run("conference-inquiry", mkReq({ headers: { "x-real-ip": "198.51.100.20" }, body: lead() }))).res.statusCode);
  ok(codes.slice(0, 20).every((c) => c === 200) && codes.slice(20).every((c) => c === 429), "20 allowed, then 429 -- and the contact bucket exhausted above did not affect it", codes.slice(17).join(","));
}
console.log("\n  F7 · TRUSTWORTHY CLIENT IDENTITY");
{
  const a = [];
  for (let i = 0; i < 6; i++) a.push((await run("contact", mkReq({ headers: { "x-real-ip": "198.51.100.30", "x-client-ip": `198.51.100.${100 + i}`, "true-client-ip": `198.51.100.${150 + i}` }, body: lead() }))).res.statusCode);
  ok(a[5] === 429, "rotating client-controlled x-client-ip / true-client-ip does NOT reset the limit", a.join(","));
  const b = (await run("contact", mkReq({ headers: { "x-real-ip": "198.51.100.31" }, body: lead() }))).res.statusCode;
  ok(b === 200, "a different real client (x-real-ip) gets its own bucket");
  const { clientIp } = await import("../api/_submissions.js");
  ok(clientIp({ headers: { "x-real-ip": "198.51.100.1", "x-forwarded-for": "198.51.100.2" } }) === "198.51.100.1", "clientIp prefers x-real-ip (platform-set on Node and Edge)");
  ok(clientIp({ headers: { "x-forwarded-for": "198.51.100.2, 203.0.113.99" } }) === "198.51.100.2", "clientIp falls back to the first x-forwarded-for entry");
  ok(clientIp({ headers: { "x-client-ip": "198.51.100.61", "true-client-ip": "198.51.100.62", "x-vercel-forwarded-for": "198.51.100.63" }, socket: { remoteAddress: "127.0.0.1" } }) === "unknown",
     "clientIp never reads x-client-ip, true-client-ip, x-vercel-forwarded-for or the socket");
}
console.log("\n  F7 · CONCURRENT REQUESTS");
{
  // Counted on the shared call log across the whole burst: under concurrency a
  // per-request slice of the log overlaps its neighbours'.
  const before = CALLS.length;
  const burst = await Promise.all(Array.from({ length: 30 }, () => run("contact", mkReq({ headers: { "x-real-ip": "198.51.100.40" }, body: lead() }))));
  const admitted = burst.filter((r) => r.res.statusCode === 200).length;
  const mails = mailed(CALLS.slice(before));
  ok(admitted === 5 && burst.filter((r) => r.res.statusCode === 429).length === 25, "30 simultaneous requests -> exactly 5 admitted, 25 refused", `admitted ${admitted}`);
  ok(mails === 5, "  ...and exactly 5 emails sent", `${mails}`);
}
console.log("\n  F7 · OTHER ABUSE CONTROLS");
{ const before = counters.size;
  const { res, calls } = await run("contact", mkReq({ headers: { "x-real-ip": "198.51.100.50" }, body: lead({ website_url: "http://spam.invalid" }) }));
  ok(res.statusCode === 200 && res.body.discarded === "honeypot" && mailed(calls) === 0 && !leadStored(calls), "honeypot field filled -> 200, nothing stored or emailed");
  ok(counters.size === before, "  ...and it does not consume a throttle slot"); }
{ const { res, calls } = await run("conference-inquiry", mkReq({ headers: { "x-real-ip": "198.51.100.51" }, body: lead({ message: "http://a.invalid http://b.invalid http://c.invalid" }) }));
  ok(res.statusCode === 200 && res.body.discarded === "links" && mailed(calls) === 0, "link spam -> discarded, nothing emailed"); }
{ const { res, calls } = await run("contact", mkReq({ headers: { "x-real-ip": "198.51.100.52" }, body: lead({ email: "not-an-email" }) }));
  ok(res.statusCode === 400 && mailed(calls) === 0 && !calls.some((c) => c.path.endsWith("bump_submission_throttle")), "invalid fields -> 400 before the throttle is touched"); }
{ throttleDown = true;
  const { res, calls } = await run("contact", mkReq({ headers: { "x-real-ip": "198.51.100.53" }, body: lead() }));
  ok(res.statusCode === 200 && mailed(calls) === 1, "throttle database unavailable -> fails OPEN (documented policy: a broken counter must not drop leads)");
  throttleDown = false; }

console.log(`\ninbound + forms: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
