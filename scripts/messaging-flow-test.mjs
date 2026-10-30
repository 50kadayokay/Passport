// D20 regression tests -- investor <-> company messaging after migration 0063.
//   node scripts/messaging-flow-test.mjs
//
// OFFLINE. The real /api/messages handler runs in this process against an
// in-memory PostgREST stand-in that holds conversations, messages and companies
// and enforces the SAME uniqueness the database does:
//   after 0063  uq_conv_investor_thread (investor_id, company_slug)       WHERE sender_company_id IS NULL
//               uq_conv_company_thread  (sender_company_id, company_slug) WHERE sender_company_id IS NOT NULL
//   before 0063 conversations_investor_id_company_slug_key (full), no sender_company_id column
//   always      uq_messages_email (email_id) WHERE email_id IS NOT NULL
// and answers `on_conflict` the way PostgREST does: 42P10 when no full unique
// constraint matches -- which is the D20 failure. Every request yields to the
// event loop a random number of times, so concurrent calls interleave between
// "select" and "insert" as they would against a real server. Nothing leaves the
// machine and no credential is used. The live run against staging is
// messaging-live-test.mjs.

const STUB_SB = "https://stub-project.supabase.invalid";
process.env.VITE_SUPABASE_URL = STUB_SB;
process.env.VITE_SUPABASE_ANON_KEY = "sb_publishable_stubKeyForOfflineTests";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";
process.env.POSTMARK_SERVER_TOKEN = "stub-postmark";
process.env.POSTMARK_INBOUND_HASH = "stubhash";
process.env.MESSAGES_FROM_EMAIL = "noreply@stub.invalid";
delete process.env.MINEEX_ENV;

// ---------------------------------------------------------------- fixtures --
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = U(101), CO_B = U(102);
const USERS = {
  investor: { id: U(1), email: "investor@staging.invalid" },
  ownerA:   { id: U(2), email: "owner-a@staging.invalid" },
  viewerA:  { id: U(3), email: "viewer-a@staging.invalid" },
  ownerB:   { id: U(4), email: "owner-b@staging.invalid" },
  outsider: { id: U(5), email: "outsider@staging.invalid" },
  admin:    { id: U(6), email: "platform-admin@staging.invalid" },  // platform admin, no membership
};
const ROLES = { [`${USERS.ownerA.id}|${CO_A}`]: "owner", [`${USERS.viewerA.id}|${CO_A}`]: "viewer", [`${USERS.ownerB.id}|${CO_B}`]: "owner" };
const COMPANIES = [
  { id: CO_A, slug: "iso-alpha", name: "Iso Alpha", profile: { pp: { CONTACT: { email: "ceo@iso-alpha.invalid" } } } },
  { id: CO_B, slug: "iso-beta", name: "Iso Beta", profile: {} },
];

let schema = "post0063";       // or "pre0063"
let conversations = [], messages = [];
let roleRpcDown = false;
let seq = 0;
const reset = (s = "post0063") => { schema = s; conversations = []; messages = []; roleRpcDown = false; };
const tok = (u) => `tok-${u.id}`;
const userByToken = (h) => Object.values(USERS).find((u) => h === `Bearer ${tok(u)}`);

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const pgErr = (status, code, message) => json({ code, message }, status);
const yieldRandom = async () => { for (let i = Math.floor(Math.random() * 4); i >= 0; i--) await new Promise((r) => setImmediate(r)); };

// PostgREST filter subset: col=eq.v, col=is.null, col=gte.v
function filterRows(rows, sp) {
  return rows.filter((r) => {
    for (const [k, v] of sp) {
      if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
      const [op, ...rest] = v.split("."); const val = rest.join(".");
      if (op === "eq" && String(r[k]) !== val) return false;
      if (op === "is" && val === "null" && r[k] != null) return false;
      if (op === "gte" && !(String(r[k]) >= val)) return false;
    }
    return true;
  });
}
function shape(rows, sp) {
  let out = rows.slice();
  const order = sp.get("order");
  if (order) { const [c, d] = order.split("."); out.sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (d === "desc" ? -1 : 1)); }
  const lim = sp.get("limit"); if (lim !== null) out = out.slice(0, +lim);
  return out;
}
const convCols = () => schema === "post0063"
  ? ["id", "investor_id", "company_slug", "company_name", "ceo_email", "created_at", "last_message_at", "company_read_at", "sender_company_id"]
  : ["id", "investor_id", "company_slug", "company_name", "ceo_email", "created_at", "last_message_at", "company_read_at"];

function convConflict(row) {
  if (schema === "pre0063") return conversations.find((c) => c.investor_id === row.investor_id && c.company_slug === row.company_slug);
  if (row.sender_company_id == null) return conversations.find((c) => c.sender_company_id == null && c.investor_id === row.investor_id && c.company_slug === row.company_slug);
  return conversations.find((c) => c.sender_company_id === row.sender_company_id && c.company_slug === row.company_slug);
}

const CALLS = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : null;
  const h = init.headers || {};
  const auth = h.Authorization || h.authorization || "";
  CALLS.push({ host: url.host, path: url.pathname, search: url.search, method, body });
  if (url.host === "api.postmarkapp.com") return json({ MessageID: "stub", ErrorCode: 0 });
  if (url.origin !== STUB_SB) throw new Error(`unexpected egress to ${url.host}`);
  await yieldRandom();
  const isService = auth === "Bearer stub-service-key";
  const sp = url.searchParams;

  if (url.pathname === "/auth/v1/user") { const u = userByToken(auth); return u ? json(u) : json({ msg: "invalid JWT" }, 401); }
  if (url.pathname === "/rest/v1/rpc/my_company_role") {
    if (roleRpcDown) return json({ message: "down" }, 500);
    const u = userByToken(auth); if (!u) return json({ message: "JWT" }, 401);
    return json(ROLES[`${u.id}|${body.cid}`] ?? null);
  }
  // Every REST call the handler makes must be the service role; the user's own
  // token is only ever used for auth/user and my_company_role above.
  if (!isService) return pgErr(401, "42501", "stub: non-service REST call");

  if (url.pathname === "/rest/v1/companies") return json(shape(filterRows(COMPANIES, sp), sp));

  if (url.pathname === "/rest/v1/conversations") {
    const sel = sp.get("select");
    if (sel && sel !== "*" && sel.split(",").some((c) => !convCols().includes(c))) return pgErr(400, "42703", "column does not exist");
    if ([...sp.keys()].some((k) => !["select", "order", "limit", "on_conflict"].includes(k) && !convCols().includes(k))) return pgErr(400, "42703", "column does not exist");
    if (method === "GET") return json(shape(filterRows(conversations, sp), sp));
    if (method === "POST") {
      const oc = sp.get("on_conflict");
      if (oc) {
        // PostgREST needs a FULL unique constraint on exactly these columns.
        const full = schema === "pre0063" && oc === "investor_id,company_slug";
        if (!full) return pgErr(400, "42P10", "there is no unique or exclusion constraint matching the ON CONFLICT specification");
      }
      if (Object.keys(body).some((k) => !convCols().includes(k))) return pgErr(400, "PGRST204", "column not found");
      const clash = convConflict(body);
      if (clash) {
        if (oc) { Object.assign(clash, body); return json([clash], 200); }
        return pgErr(409, "23505", "duplicate key value violates unique constraint");
      }
      const now = new Date(Date.now() + seq++).toISOString();
      const row = { id: U(9000 + seq), created_at: now, last_message_at: now, company_read_at: null, company_name: null, ceo_email: null, ...(schema === "post0063" ? { sender_company_id: null } : {}), ...body };
      conversations.push(row);
      return json([row], 201);
    }
    if (method === "PATCH") { const rows = filterRows(conversations, sp); rows.forEach((r) => Object.assign(r, body)); return new Response(null, { status: 204 }); }
  }

  if (url.pathname === "/rest/v1/messages") {
    if (method === "GET") return json(shape(filterRows(messages, sp), sp));
    if (method === "POST") {
      if (!conversations.some((c) => c.id === body.conversation_id)) return pgErr(409, "23503", "foreign key violation");
      if (body.email_id && messages.some((m) => m.email_id === body.email_id)) return pgErr(409, "23505", "duplicate key uq_messages_email");
      const row = { id: U(50000 + seq++), created_at: new Date().toISOString(), email_id: null, ...body };
      messages.push(row);
      return json([row], 201);
    }
  }
  return json({ message: `stub: unhandled ${method} ${url.pathname}` }, 404);
};

// ---------------------------------------------------------------- harness --
function mkReq({ user, body, query = {} }) {
  return { method: "POST", query, headers: user ? { authorization: `Bearer ${tok(user)}` } : {}, body, url: "/api/messages" };
}
function mkRes() {
  const r = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = (b) => { if (b !== undefined) r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  return r;
}
const handler = (await import("../api/messages.js")).default;
async function call(user, body, query) {
  const start = CALLS.length; const res = mkRes(); await handler(mkReq({ user, body, query }), res);
  return { res, calls: CALLS.slice(start) };
}
const send = (user, slug, text, extra = {}) => call(user, { companySlug: slug, body: text, ...extra });
const start = (user, fromCompanyId, toSlug, text, extra = {}) => call(user, { action: "start", fromCompanyId, toSlug, body: text, ...extra });
const mailed = (calls) => calls.filter((c) => c.host === "api.postmarkapp.com").length;
const convWrites = (calls) => calls.filter((c) => c.path === "/rest/v1/conversations" && c.method !== "GET").length;
const msgWrites = (calls) => calls.filter((c) => c.path === "/rest/v1/messages" && c.method === "POST").length;

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const uuid = () => crypto.randomUUID();

// ===================================================== the defect itself ==
console.log("\n  D20 · THE CONFLICT (stub reproduces staging)");
reset("post0063");
{
  const r = await fetch(`${STUB_SB}/rest/v1/conversations?on_conflict=investor_id,company_slug`, { method: "POST", headers: { Authorization: "Bearer stub-service-key" }, body: JSON.stringify({ investor_id: USERS.investor.id, company_slug: "iso-alpha" }) });
  const b = await r.json();
  ok(r.status === 400 && b.code === "42P10", "after 0063, the old upsert on (investor_id, company_slug) -> 400 42P10 (what staging returned)");
  const r2 = await fetch(`${STUB_SB}/rest/v1/conversations?on_conflict=sender_company_id,company_slug`, { method: "POST", headers: { Authorization: "Bearer stub-service-key" }, body: JSON.stringify({ investor_id: USERS.ownerA.id, sender_company_id: CO_A, company_slug: "iso-beta" }) });
  ok(r2.status === 400 && (await r2.json()).code === "42P10", "after 0063, the company-start upsert on (sender_company_id, company_slug) -> 42P10");
}
{
  const src = (await import("node:fs")).readFileSync(new URL("../api/messages.js", import.meta.url), "utf8")
    + (await import("node:fs")).readFileSync(new URL("../src/lib/messages.js", import.meta.url), "utf8");
  ok(!/on_conflict=/.test(src.replace(/\/\/.*$/gm, "")), "no on_conflict upsert of conversations remains in the server or client messaging code");
  ok(!/fetch\(`\$\{REST\}\/conversations[^`]*`,\s*\{\s*method:\s*"POST"/.test(src), "the browser no longer tries to INSERT conversations (it has no grant: 42501)");
}

// ============================================== investor -> company ==
console.log("\n  INVESTOR -> COMPANY (after 0063)");
reset("post0063");
{
  const { res, calls } = await send(USERS.investor, "iso-alpha", "Hello Alpha");
  ok(res.statusCode === 200 && res.body.ok && res.body.conversationId, "first message: 200, thread created", JSON.stringify(res.body));
  ok(conversations.length === 1 && conversations[0].sender_company_id === null && conversations[0].investor_id === USERS.investor.id, "thread is an INVESTOR thread (sender_company_id null, investor_id = sender)");
  ok(messages.length === 1 && messages[0].sender === "investor" && messages[0].body === "Hello Alpha", "message stored once, sender='investor'");
  ok(mailed(calls) === 1, "CEO notified once");
  ok(conversations[0].ceo_email === "ceo@iso-alpha.invalid", "ceo_email resolved server-side from the company profile");
}
{
  const before = conversations[0].id;
  const { res, calls } = await send(USERS.investor, "iso-alpha", "Second message");
  ok(res.statusCode === 200 && res.body.conversationId === before && conversations.length === 1, "second message REUSES the existing thread (no duplicate conversation)");
  ok(convWrites(calls) === 0, "an unchanged thread is not rewritten");
  ok(messages.length === 2, "second message stored");
}
{
  COMPANIES[0].profile.pp.CONTACT.email = "new-ceo@iso-alpha.invalid";
  await send(USERS.investor, "iso-alpha", "Third");
  ok(conversations[0].ceo_email === "new-ceo@iso-alpha.invalid", "a changed CEO address is refreshed on the thread (the old upsert's merge behaviour, kept)");
  COMPANIES[0].profile.pp.CONTACT.email = "ceo@iso-alpha.invalid";
}
{
  const { res } = await send(USERS.investor, "iso-beta", "Hi Beta");
  ok(res.statusCode === 200 && res.body.emailed === false && res.body.reason === "no-ceo-email", "a company with no CEO email (unclaimed) still gets the message stored; nobody emailed");
  ok(conversations.length === 2, "a different company is a different thread");
}
{
  const r1 = await send(null, "iso-alpha", "anon");
  ok(r1.res.statusCode === 401 && msgWrites(r1.calls) === 0, "anonymous -> 401, nothing stored");
  const r2 = await call({ id: "x" }, { companySlug: "iso-alpha", body: "forged" });
  ok(r2.res.statusCode === 401, "invalid token -> 401");
  const r3 = await send(USERS.investor, "no-such-co", "x");
  ok(r3.res.statusCode === 404 && convWrites(r3.calls) === 0, "unknown company -> 404, no thread created");
  const r4 = await send(USERS.investor, "iso-alpha", "   ");
  ok(r4.res.statusCode === 400, "empty message -> 400");
  const r5 = await send(USERS.investor, "iso-alpha", "x".repeat(5001));
  ok(r5.res.statusCode === 400, "over-long message -> 400");
}

console.log("\n  RETRIES AND DUPLICATES (investor send)");
reset("post0063");
{
  const a = await send(USERS.investor, "iso-alpha", "Retry me");
  const b = await send(USERS.investor, "iso-alpha", "Retry me");
  ok(b.res.statusCode === 200 && b.res.body.duplicate === true && b.res.body.message.id === a.res.body.message.id, "identical resend within the window returns the SAME message (no key)");
  ok(messages.length === 1 && mailed(b.calls) === 0, "...stored once, and the CEO is not emailed twice");
  const c = await send(USERS.investor, "iso-alpha", "Different text");
  ok(messages.length === 2 && !c.res.body.duplicate, "different text is a new message");
}
{
  const k = uuid();
  const a = await send(USERS.investor, "iso-alpha", "Keyed", { clientMessageId: k });
  const b = await send(USERS.investor, "iso-alpha", "Keyed", { clientMessageId: k });
  ok(b.res.body.duplicate === true && b.res.body.message.id === a.res.body.message.id && messages.filter((m) => m.body === "Keyed").length === 1, "same clientMessageId -> same message, stored once");
  ok(messages.find((m) => m.body === "Keyed").email_id.startsWith("client:"), "the key is stored under the 'client:' prefix (cannot collide with a Postmark MessageID)");
  const c = await send(USERS.investor, "iso-alpha", "Keyed", { clientMessageId: uuid() });
  ok(!c.res.body.duplicate && messages.filter((m) => m.body === "Keyed").length === 2, "a NEW key for the same text is a deliberate second message");
  const d = await send(USERS.investor, "iso-alpha", "bad key", { clientMessageId: "not-a-uuid'); drop" });
  ok(d.res.statusCode === 200 && messages.find((m) => m.body === "bad key").email_id === null, "a malformed key is ignored, never stored");
}
{
  const before = messages.length;
  const old = messages[0]; old.created_at = new Date(Date.now() - 60_000).toISOString();
  const r = await send(USERS.investor, "iso-alpha", old.body);
  ok(!r.res.body.duplicate && messages.length === before + 1, "the same text AFTER the window is a new message (only retries are folded)");
}

console.log("\n  CONCURRENCY (investor send)");
for (let round = 0; round < 25; round++) {
  reset("post0063");
  const texts = Array.from({ length: 8 }, (_, i) => `parallel ${i}`);
  const rs = await Promise.all(texts.map((t) => send(USERS.investor, "iso-alpha", t)));
  const ids = new Set(rs.map((r) => r.res.body.conversationId));
  if (!(rs.every((r) => r.res.statusCode === 200) && conversations.length === 1 && ids.size === 1 && messages.length === 8)) {
    ok(false, `round ${round}: 8 parallel first messages -> 1 thread, 8 messages`, `${conversations.length} threads, ${messages.length} msgs, statuses ${rs.map((r) => r.res.statusCode)}`);
    break;
  }
  if (round === 24) ok(true, "25 rounds x 8 parallel FIRST messages: always exactly 1 thread, 8 messages, all 200");
}
for (let round = 0; round < 25; round++) {
  reset("post0063");
  const k = uuid();
  const rs = await Promise.all(Array.from({ length: 6 }, () => send(USERS.investor, "iso-alpha", "same retry", { clientMessageId: k })));
  const mids = new Set(rs.map((r) => r.res.body.message && r.res.body.message.id));
  if (!(rs.every((r) => r.res.statusCode === 200) && messages.length === 1 && mids.size === 1 && conversations.length === 1)) {
    ok(false, `round ${round}: 6 concurrent retries with one key -> 1 message`, `${messages.length} msgs, statuses ${rs.map((r) => r.res.statusCode)}`);
    break;
  }
  if (round === 24) ok(true, "25 rounds x 6 CONCURRENT retries sharing a key: always exactly 1 message, every caller gets it");
}
{
  reset("post0063");
  const rs = await Promise.all([USERS.investor, USERS.outsider].map((u) => send(u, "iso-alpha", "two investors")));
  ok(rs.every((r) => r.res.statusCode === 200) && conversations.length === 2 && new Set(conversations.map((c) => c.investor_id)).size === 2, "two investors writing at once get two separate threads");
}

// ============================================== company -> investor ==
// The company's reply in an investor thread is a browser insert under RLS
// (sendCompanyReply, 0047 msg_insert_company) -- already working on staging,
// verified live. Here: the server never lets an investor post as 'company'.
console.log("\n  COMPANY -> INVESTOR (server side)");
reset("post0063");
{
  await send(USERS.investor, "iso-alpha", "Q?");
  const r = await call(USERS.investor, { companySlug: "iso-alpha", body: "spoof", sender: "company" });
  ok(r.res.statusCode === 200 && messages.every((m) => m.sender === "investor"), "a 'sender' field in the body is ignored: an investor can never write as 'company'");
  const r2 = await call(USERS.investor, { MailboxHash: conversations[0].id, StrippedTextReply: "forged", FromFull: { Email: "ceo@iso-alpha.invalid" } });
  ok(r2.res.statusCode === 400 && messages.length === 2 && messages.every((m) => m.sender === "investor"), "an inbound-shaped body without ?secret cannot post a company reply (F3 still holds)");
}

// =========================================== company starts a thread ==
console.log("\n  COMPANY STARTS A THREAD (company -> company, after 0063)");
reset("post0063");
{
  const { res, calls } = await start(USERS.ownerA, CO_A, "iso-beta", "Hello from Alpha");
  ok(res.statusCode === 200 && res.body.ok && res.body.created === true && res.body.conversation, "owner of A starts a thread with B: 200", JSON.stringify(res.body));
  const c = conversations[0];
  ok(c && c.sender_company_id === CO_A && c.company_slug === "iso-beta" && c.investor_id === USERS.ownerA.id, "row: sender_company_id = A, company_slug = B, investor_id = the acting user");
  ok(c.company_name === "Iso Beta", "company_name resolved server-side (not taken from the client)");
  ok(messages.length === 1 && messages[0].sender === "investor" && messages[0].conversation_id === c.id, "first message stored once as sender='investor' (positional: initiating side)");
  ok(mailed(calls) === 0, "no email is sent (unchanged: company-started threads never emailed)");
  const again = await start(USERS.ownerA, CO_A, "iso-beta", "Follow-up");
  ok(again.res.body.created === false && again.res.body.conversation.id === c.id && conversations.length === 1, "starting again REUSES the thread");
  const viewer = await start(USERS.viewerA, CO_A, "iso-beta", "From a viewer of A");
  ok(viewer.res.statusCode === 200 && conversations.length === 1 && messages.length === 3, "any active member (viewer) may write -- mirrors 0063's owns_company(); see F6");
}
{
  reset("post0063");
  await send(USERS.ownerA, "iso-beta", "as a private investor");
  await start(USERS.ownerA, CO_A, "iso-beta", "as company A");
  ok(conversations.length === 2 && conversations.filter((c) => c.sender_company_id === null).length === 1, "the same person's private investor thread and company A's thread to B stay SEPARATE");
  await send(USERS.ownerA, "iso-beta", "private again");
  const priv = conversations.find((c) => c.sender_company_id === null);
  ok(messages.filter((m) => m.conversation_id === priv.id).length === 2, "...and an investor send never lands in the company-started thread");
}

console.log("\n  COMPANY START: REFUSALS (cross-company, unauthorised)");
reset("post0063");
{
  const cases = [
    ["anonymous", null, CO_A, "iso-beta", 401],
    ["invalid token", { id: "nobody" }, CO_A, "iso-beta", 401],
    ["investor with no membership", USERS.investor, CO_A, "iso-beta", 403],
    ["owner of B sending AS A (cross-company)", USERS.ownerB, CO_A, "iso-beta", 403],
    ["owner of B sending AS A to a third company", USERS.ownerB, CO_A, "iso-alpha", 403],
    ["platform admin who is not a member (0063 does not admit admins)", USERS.admin, CO_A, "iso-beta", 403],
    ["outsider", USERS.outsider, CO_B, "iso-alpha", 403],
    ["a company messaging ITSELF", USERS.ownerA, CO_A, "iso-alpha", 400],
    ["unknown recipient", USERS.ownerA, CO_A, "no-such-co", 404],
    ["fromCompanyId not a UUID", USERS.ownerA, "iso-alpha", "iso-beta", 400],
    ["no fromCompanyId", USERS.ownerA, "", "iso-beta", 400],
    ["no recipient", USERS.ownerA, CO_A, "", 400],
  ];
  for (const [name, u, from, to, want] of cases) {
    const { res, calls } = await start(u, from, to, "probe");
    ok(res.statusCode === want && convWrites(calls) === 0 && msgWrites(calls) === 0, `${name} -> ${want}, nothing written`, `${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  const big = await start(USERS.ownerA, CO_A, "iso-beta", "x".repeat(5001));
  ok(big.res.statusCode === 400 && conversations.length === 0, "over-long first message -> 400, no empty thread left behind");
  roleRpcDown = true;
  const down = await start(USERS.ownerA, CO_A, "iso-beta", "x");
  ok(down.res.statusCode === 502 && conversations.length === 0, "role check unavailable -> 502 (fails closed)");
  roleRpcDown = false;
  ok(conversations.length === 0 && messages.length === 0, "after every refusal: no conversations, no messages");
}
{
  reset("post0063");
  const r = await call(USERS.ownerB, { action: "start", fromCompanyId: CO_B, toSlug: "iso-alpha", body: "hi", investor_id: USERS.investor.id, sender_company_id: CO_A, company_name: "Spoofed" });
  const c = conversations[0];
  ok(r.res.statusCode === 200 && c.investor_id === USERS.ownerB.id && c.sender_company_id === CO_B && c.company_name === "Iso Alpha", "client-supplied investor_id / sender_company_id / company_name are ignored");
}

console.log("\n  COMPANY START: CONCURRENCY AND RETRIES");
for (let round = 0; round < 25; round++) {
  reset("post0063");
  const rs = await Promise.all([
    ...Array.from({ length: 4 }, (_, i) => start(USERS.ownerA, CO_A, "iso-beta", `owner ${i}`)),
    ...Array.from({ length: 4 }, (_, i) => start(USERS.viewerA, CO_A, "iso-beta", `viewer ${i}`)),
  ]);
  if (!(rs.every((r) => r.res.statusCode === 200) && conversations.length === 1 && messages.length === 8 && rs.filter((r) => r.res.body.created).length === 1)) {
    ok(false, `round ${round}: 8 concurrent starts A->B -> 1 thread`, `${conversations.length} threads, statuses ${rs.map((r) => r.res.statusCode)}`);
    break;
  }
  if (round === 24) ok(true, "25 rounds x 8 CONCURRENT starts A->B by two members: always 1 thread, 8 messages, exactly one 'created'");
}
for (let round = 0; round < 25; round++) {
  reset("post0063");
  const k = uuid();
  const rs = await Promise.all(Array.from({ length: 5 }, () => start(USERS.ownerA, CO_A, "iso-beta", "intro", { clientMessageId: k })));
  if (!(rs.every((r) => r.res.statusCode === 200) && conversations.length === 1 && messages.length === 1)) {
    ok(false, `round ${round}: 5 concurrent retries of one start -> 1 thread, 1 message`, `${conversations.length}/${messages.length}`);
    break;
  }
  if (round === 24) ok(true, "25 rounds x 5 CONCURRENT retries of one start (same key): always 1 thread, 1 message");
}
{
  reset("post0063");
  await Promise.all([start(USERS.ownerA, CO_A, "iso-beta", "A to B"), start(USERS.ownerB, CO_B, "iso-alpha", "B to A")]);
  ok(conversations.length === 2 && new Set(conversations.map((c) => c.sender_company_id)).size === 2, "A->B and B->A at once are two threads, each owned by its sender");
}

// ======================================================== before 0063 ==
console.log("\n  BEFORE 0063 (production today: full unique constraint, no sender_company_id)");
reset("pre0063");
{
  const a = await send(USERS.investor, "iso-alpha", "pre one");
  const b = await send(USERS.investor, "iso-alpha", "pre two");
  ok(a.res.statusCode === 200 && b.res.statusCode === 200 && conversations.length === 1 && messages.length === 2, "investor send works and reuses the thread on the pre-0063 schema");
  ok(!("sender_company_id" in conversations[0]), "no sender_company_id written (the column does not exist there)");
  const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => send(USERS.outsider, "iso-beta", `pre parallel ${i}`)));
  ok(rs.every((r) => r.res.statusCode === 200) && conversations.filter((c) => c.investor_id === USERS.outsider.id).length === 1, "concurrent first messages on the full constraint -> one thread");
  const s = await start(USERS.ownerA, CO_A, "iso-beta", "x");
  ok(s.res.statusCode === 503 && s.res.body.error === "company-threads-unavailable" && convWrites(s.calls) === 0, "company start before 0063 -> 503 'company-threads-unavailable', nothing written (never creates an investor thread by mistake)");
  const s2 = await start(USERS.investor, CO_A, "iso-beta", "x");
  ok(s2.res.statusCode === 403, "...and an unauthorised caller is still refused first (403), before any schema detail is revealed");
}

// =================================================== existing threads ==
console.log("\n  EXISTING CONVERSATIONS ARE PRESERVED");
reset("post0063");
{
  const legacy = { id: U(7777), investor_id: USERS.investor.id, company_slug: "iso-alpha", company_name: "Iso Alpha", ceo_email: "ceo@iso-alpha.invalid", created_at: "2026-01-01T00:00:00.000Z", last_message_at: "2026-01-01T00:00:00.000Z", company_read_at: null, sender_company_id: null };
  conversations.push(legacy);
  messages.push({ id: U(7778), conversation_id: legacy.id, sender: "investor", body: "from January", created_at: "2026-01-01T00:00:00.000Z", email_id: null });
  messages.push({ id: U(7779), conversation_id: legacy.id, sender: "company", body: "CEO reply", created_at: "2026-01-02T00:00:00.000Z", email_id: "pm-1" });
  const r = await send(USERS.investor, "iso-alpha", "new");
  ok(r.res.body.conversationId === legacy.id && conversations.length === 1, "a pre-existing thread is found and reused, not duplicated");
  ok(messages.filter((m) => m.conversation_id === legacy.id).length === 3 && messages.some((m) => m.email_id === "pm-1"), "its history (including an emailed CEO reply) is untouched");
  ok(r.calls.every((c) => !(c.path === "/rest/v1/conversations" && c.method === "DELETE") && !(c.path === "/rest/v1/messages" && c.method !== "GET" && c.method !== "POST")), "no conversation or message is deleted or rewritten");
}

// ======================================================== no egress ==
{
  const hosts = new Set(CALLS.map((c) => c.host));
  ok([...hosts].every((h) => h === new URL(STUB_SB).host || h === "api.postmarkapp.com"), "the handler talked only to the (stub) database and the (stub) mail API", [...hosts].join(", "));
}

console.log(`\n  messaging-flow: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
