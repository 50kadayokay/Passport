// D20 live verification -- the whole messaging flow against the STAGING
// database, through the real /api/messages handler and real RLS.
//
//   node scripts/messaging-live-test.mjs
//
// Starts the local staging API server (MINEEX_ENV=staging: tripwire + egress
// guard; Postmark is mocked and logged, never called), signs in the seeded
// staging fixtures (@staging.invalid, iso- companies), and drives:
//   investor -> company        POST /api/messages (find-or-create, dedupe)
//   company  -> investor       the portal's own browser insert (sendCompanyReply), under RLS
//   company  -> company        POST /api/messages action "start", and the recipient's reply
//   refusals                   cross-company, unauthorised, anonymous, self-message
//   concurrency and retries    parallel first messages / starts / keyed retries
// and checks every outcome in the database itself (service-role reads), not
// only in the HTTP status.
//
// WHAT IT WRITES (staging only): messages carrying the run marker "[d20-live]",
// into the seeded fixture threads; and three test-owned threads it recreates
// each run so the creation race is exercised every time:
//   investor B -> company A (investor thread), company A -> company B,
//   company B -> company A.
// Before deleting one of those it checks that EVERY message in it carries the
// marker -- a thread with anything else in it is left alone and the run stops.
// Seeded fixture threads are never deleted.
//
// Refuses to run unless the target is the staging project. Prints no secrets.

import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const readEnvFile = (f) => fs.existsSync(f)
  ? Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }))
  : {};
const iso = readEnvFile("supabase/staging/.isolation-env");
const apiEnv = readEnvFile("supabase/staging/.api-env");
const SB = iso.ISOLATION_SUPABASE_URL, ANON = iso.ISOLATION_ANON_KEY, SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY;
if (!SB || /rvptronniomlqumjhyrr/.test(SB) || !/jmljfovtfxcdhjmtlnva/.test(SB)) { console.error("  refusing: not the staging project"); process.exit(2); }
if (!SERVICE) { console.error("  STAGING_SUPABASE_SERVICE_ROLE_KEY missing from supabase/staging/.api-env"); process.exit(3); }

const MARK = "[d20-live]";
const RUN = crypto.randomUUID().slice(0, 8);
const A = { id: iso.ISOLATION_COMPANY_A_ID, slug: iso.ISOLATION_COMPANY_A_SLUG };
const B = { id: iso.ISOLATION_COMPANY_B_ID, slug: iso.ISOLATION_COMPANY_B_SLUG };
const CONV_A = iso.ISOLATION_CONVERSATION_A;   // seeded: INVESTOR <-> company A

// ------------------------------------------------------------------- server --
const PORT = 8787 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ["scripts/staging-api-server.mjs", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });
process.on("exit", () => { try { server.kill(); } catch {} ; if (process.env.SHOW_SERVER_LOG) console.log(serverLog); });
const API = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 40; i++) { if (await fetch(`${API}/__staging/egress`).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 250)); }
const egressLog = async () => ((await (await fetch(`${API}/__staging/egress`)).json()).log || []);

// --------------------------------------------------------------- identities --
const signIn = async (key) => {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: iso[`ISOLATION_${key}_EMAIL`], password: iso[`ISOLATION_${key}_PASS`] }) });
  const j = r.ok ? await r.json() : null;
  return j ? { token: j.access_token, id: j.user.id } : null;
};
const who = {};
for (const k of ["INVESTOR", "INVESTOR_B", "COMPANY_A", "COMPANY_B", "STAFF", "EDITOR", "ADMIN"]) who[k] = await signIn(k);
const missing = Object.entries(who).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error(`  could not sign in: ${missing.join(", ")} -- run scripts/seed-isolation-fixtures.mjs`); process.exit(3); }

// a03: is migration 0076 on this database? (grantable_roles is one of its
// functions; PostgREST answers 404 for a function that does not exist.) Before
// it, the database still lets any member reply (F6); the ROUTE refuses
// analysts and viewers either way.
const POST0076 = (await fetch(`${SB}/rest/v1/rpc/grantable_roles`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${who.STAFF.token}`, "content-type": "application/json" },
  body: JSON.stringify({ p_company: iso.ISOLATION_COMPANY_A_ID }) })).status !== 404;
console.log(`  schema: ${POST0076 ? "0076 applied (role-aware message policies)" : "before 0076 (member-wide message policies)"}`);

// ------------------------------------------------------------------ clients --
const api = async (user, body) => {
  const h = { "content-type": "application/json" };
  if (user) h.authorization = `Bearer ${user.token}`;
  const r = await fetch(`${API}/api/messages`, { method: "POST", headers: h, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const send = (u, slug, text, extra = {}) => api(u, { companySlug: slug, body: text, ...extra });
const start = (u, from, toSlug, text, extra = {}) => api(u, { action: "start", fromCompanyId: from, toSlug, body: text, ...extra });
// The browser's own REST calls, exactly as src/lib/messages.js makes them.
const rest = async (user, path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${user.token}`, "content-type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
// Ground truth: the database, read as the service role.
const db = async (path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const rows = async (path) => { const r = await db(path); if (r.status !== 200) throw new Error(`db read ${r.status}`); return r.body; };
const investorThreads = (inv, slug) => rows(`conversations?investor_id=eq.${inv}&company_slug=eq.${slug}&sender_company_id=is.null&select=id`);
const companyThreads = (from, slug) => rows(`conversations?sender_company_id=eq.${from}&company_slug=eq.${slug}&select=*`);
const msgsIn = (conv, extra = "") => rows(`messages?conversation_id=eq.${conv}${extra}&select=id,sender,body,email_id,created_at&order=created_at.asc`);

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const T = (s) => `${MARK} ${RUN} ${s}`;

// ------------------------------------------------- reset test-owned threads --
console.log(`\n  staging ${new URL(SB).host.split(".")[0]} · run ${RUN}`);
async function dropTestThread(label, convs) {
  for (const c of convs) {
    const ms = await msgsIn(c.id);
    if (ms.some((m) => !String(m.body).startsWith(MARK))) {
      console.error(`  ✗ ${label}: thread ${c.id} holds messages this suite did not write -- refusing to delete it; stopping`);
      process.exit(1);
    }
    const d = await db(`conversations?id=eq.${c.id}`, { method: "DELETE" });
    if (d.status !== 204) { console.error(`  ✗ could not reset ${label} (${d.status})`); process.exit(1); }
  }
}
await dropTestThread("investor B -> A", await investorThreads(who.INVESTOR_B.id, A.slug));
await dropTestThread("A -> B", await companyThreads(A.id, B.slug));
await dropTestThread("B -> A", await companyThreads(B.id, A.slug));
const logStart = (await egressLog()).length;

// =========================================================== the defect ==
console.log("\n  D20 · THE CONFLICT ON STAGING");
{
  const r = await db("conversations?on_conflict=investor_id,company_slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ investor_id: who.INVESTOR.id, company_slug: A.slug }) });
  ok(r.status === 400 && r.body.code === "42P10", "the old upsert (on_conflict=investor_id,company_slug) still fails 42P10 on staging -- the conflict is real", `${r.status} ${r.body.code}`);
  const g = await rest(who.COMPANY_A, "conversations", { method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ investor_id: who.COMPANY_A.id, sender_company_id: A.id, company_slug: B.slug }) });
  ok(g.status === 401 || g.status === 403, "a browser INSERT into conversations is still refused (no grant, 0052) -- unchanged, no grant added", `${g.status} ${g.body && g.body.code}`);
}

// =================================================== investor -> company ==
console.log("\n  INVESTOR -> COMPANY");
{
  const before = await msgsIn(CONV_A);
  const r = await send(who.INVESTOR, A.slug, T("investor to A"));
  ok(r.status === 200 && r.body.ok, "investor sends to company A: 200", `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  ok(r.body.conversationId === CONV_A, "it lands in the EXISTING seeded thread (preserved, not duplicated)");
  ok((await investorThreads(who.INVESTOR.id, A.slug)).length === 1, "database: exactly one investor thread for (investor, A)");
  const after = await msgsIn(CONV_A);
  ok(after.length === before.length + 1 && after.at(-1).sender === "investor" && after.at(-1).body === T("investor to A"), "database: the message is stored once, sender='investor'");
  ok(before.every((m) => after.some((x) => x.id === m.id && x.body === m.body)), "database: the thread's earlier history is untouched");
  const seen = await rest(who.COMPANY_A, `messages?conversation_id=eq.${CONV_A}&select=body`);
  ok(seen.status === 200 && seen.body.some((m) => m.body === T("investor to A")), "company A sees it in its inbox (RLS, as company A)");
  const notSeen = await rest(who.COMPANY_B, `messages?conversation_id=eq.${CONV_A}&select=body`);
  ok(notSeen.status === 200 && notSeen.body.length === 0, "company B cannot read it (cross-company, RLS)");
  const notSeen2 = await rest(who.INVESTOR_B, `messages?conversation_id=eq.${CONV_A}&select=body`);
  ok(notSeen2.status === 200 && notSeen2.body.length === 0, "another investor cannot read it");
}
console.log("\n  RETRIES (investor)");
{
  const k = crypto.randomUUID();
  const a = await send(who.INVESTOR, A.slug, T("keyed retry"), { clientMessageId: k });
  const b = await send(who.INVESTOR, A.slug, T("keyed retry"), { clientMessageId: k });
  ok(a.status === 200 && b.status === 200 && b.body.duplicate === true && b.body.message.id === a.body.message.id, "the same clientMessageId twice returns the same message");
  ok((await msgsIn(CONV_A, `&body=eq.${encodeURIComponent(T("keyed retry"))}`)).length === 1, "database: stored once (uq_messages_email holds the key)");
  const c = await send(who.INVESTOR, A.slug, T("unkeyed retry"));
  const d = await send(who.INVESTOR, A.slug, T("unkeyed retry"));
  ok(c.status === 200 && d.body.duplicate === true && (await msgsIn(CONV_A, `&body=eq.${encodeURIComponent(T("unkeyed retry"))}`)).length === 1, "an identical resend with no key inside the window is folded into the first");
  // A FRESH key: deriving it from k (as this once did) collided with k ~1 run in 16.
  const concKey = crypto.randomUUID();
  const rs = await Promise.all(Array.from({ length: 6 }, () => send(who.INVESTOR, A.slug, T("concurrent keyed"), { clientMessageId: concKey })));
  ok(rs.every((r) => r.status === 200) && (await msgsIn(CONV_A, `&body=eq.${encodeURIComponent(T("concurrent keyed"))}`)).length === 1, "6 CONCURRENT retries sharing one key: stored once, all 200", rs.map((r) => r.status).join(","));
  const reuse = await send(who.INVESTOR, A.slug, T("different text, same key"), { clientMessageId: k });
  ok(reuse.status === 409 && reuse.body.error === "idempotency-key-reused" && (await msgsIn(CONV_A, `&body=eq.${encodeURIComponent(T("different text, same key"))}`)).length === 0, "an idempotency key reused for DIFFERENT text -> 409 idempotency-key-reused, nothing stored (was 500)");
}
console.log("\n  CONCURRENT FIRST MESSAGES (investor B -> company A, a new thread)");
{
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => send(who.INVESTOR_B, A.slug, T(`parallel ${i}`))));
  const threads = await investorThreads(who.INVESTOR_B.id, A.slug);
  ok(rs.every((r) => r.status === 200), "8 parallel first messages: all 200", rs.map((r) => `${r.status}${r.body.error ? ":" + r.body.error : ""}`).join(","));
  ok(threads.length === 1 && new Set(rs.map((r) => r.body.conversationId)).size === 1, "database: exactly ONE thread created, every response names it", `${threads.length} threads`);
  ok(threads.length === 1 && (await msgsIn(threads[0].id)).length === 8, "database: all 8 messages stored in it, none lost, none doubled");
}

// =================================================== company -> investor ==
console.log("\n  COMPANY -> INVESTOR (portal reply, browser insert under RLS)");
{
  const r = await rest(who.COMPANY_A, "messages", { method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ conversation_id: CONV_A, sender: "company", body: T("A replies to investor") }) });
  ok(r.status === 201, "company A owner replies in the investor's thread: 201", `${r.status}`);
  const inv = await rest(who.INVESTOR, `messages?conversation_id=eq.${CONV_A}&sender=eq.company&select=body`);
  ok(inv.body.some((m) => m.body === T("A replies to investor")), "the investor reads the reply (RLS, as the investor)");
  const v = await rest(who.STAFF, "messages", { method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ conversation_id: CONV_A, sender: "company", body: T("viewer of A replies") }) });
  if (POST0076) ok(v.status === 401 || v.status === 403, "a viewer of company A cannot reply (0076 msg_insert_company: messaging roles only)", `${v.status}`);
  else ok(v.status === 201, "before 0076: a viewer of company A may still reply directly (F6; closed by 0076)", `${v.status}`);
  const e = await rest(who.EDITOR, "messages", { method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ conversation_id: CONV_A, sender: "company", body: T("editor of A replies") }) });
  ok(e.status === 201, "an editor of company A may reply (messaging role)", `${e.status}`);
  const x = await rest(who.COMPANY_B, "messages", { method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ conversation_id: CONV_A, sender: "company", body: T("B intrudes") }) });
  ok(x.status === 401 || x.status === 403, "company B cannot reply into company A's investor thread", `${x.status}`);
  const y = await rest(who.INVESTOR, "messages", { method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ conversation_id: CONV_A, sender: "company", body: T("investor poses as company") }) });
  ok(y.status === 401 || y.status === 403, "the investor cannot post as 'company'", `${y.status}`);
  const all = await msgsIn(CONV_A);
  ok(!all.some((m) => m.body === T("B intrudes") || m.body === T("investor poses as company")), "database: neither refused write exists");
}

// =================================================== company -> company ==
console.log("\n  COMPANY A STARTS A THREAD WITH COMPANY B");
let AB = null;
{
  const r = await start(who.COMPANY_A, A.id, B.slug, T("A introduces itself to B"));
  ok(r.status === 200 && r.body.ok && r.body.created === true, "owner of A starts a thread with B: 200, created", `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  const t = await companyThreads(A.id, B.slug);
  AB = t[0];
  ok(t.length === 1 && AB.investor_id === who.COMPANY_A.id && AB.sender_company_id === A.id && AB.company_slug === B.slug, "database: one row, sender_company_id = A, company_slug = B, investor_id = the acting user");
  ok(AB.ceo_email === null, "database: no CEO address on a company-started thread (unchanged: no email, no inbound path)");
  const m = await msgsIn(AB.id);
  ok(m.length === 1 && m[0].sender === "investor" && m[0].body === T("A introduces itself to B"), "database: first message stored once as sender='investor' (initiating side)");
  const vs = await start(who.STAFF, A.id, B.slug, T("A's viewer tries to follow up"));
  ok(vs.status === 403 && vs.body.error === "role-cannot-send" && (await msgsIn(AB.id)).length === 1, "A's viewer cannot start/follow up (403 role-cannot-send, nothing stored)", `${vs.status} ${JSON.stringify(vs.body)}`);
  const again = await start(who.EDITOR, A.id, B.slug, T("A's editor follows up"));
  ok(again.status === 200 && again.body.created === false && again.body.conversation.id === AB.id && (await companyThreads(A.id, B.slug)).length === 1, "a second start (by A's editor) REUSES the thread");

  const bSees = await rest(who.COMPANY_B, `conversations?id=eq.${AB.id}&select=id`);
  ok(bSees.body.length === 1, "company B sees the thread in its inbox (RLS conv_select_company)");
  const bReply = await rest(who.COMPANY_B, "messages", { method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ conversation_id: AB.id, sender: "company", body: T("B answers A") }) });
  ok(bReply.status === 201, "company B replies (sender='company', the recipient side): 201", `${bReply.status}`);
  const aReads = await rest(who.COMPANY_A, `messages?conversation_id=eq.${AB.id}&select=sender,body&order=created_at.asc`);
  ok(aReads.body.length === 3 && aReads.body.at(-1).body === T("B answers A"), "company A reads B's answer");
  const aFollow = await rest(who.COMPANY_A, "messages", { method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ conversation_id: AB.id, sender: "investor", body: T("A continues") }) });
  ok(aFollow.status === 201, "company A continues its own thread from the browser (0063 msg_insert_sender_company)", `${aFollow.status}`);
  for (const [u, label] of [[who.INVESTOR, "an investor"], [who.INVESTOR_B, "investor B"]]) {
    const s = await rest(u, `messages?conversation_id=eq.${AB.id}&select=body`);
    ok(s.status === 200 && s.body.length === 0, `${label} cannot read the A<->B thread`);
  }
  const imp = await rest(who.COMPANY_B, "messages", { method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ conversation_id: AB.id, sender: "investor", body: T("B poses as A") }) });
  ok(imp.status === 401 || imp.status === 403, "company B cannot write as A (sender='investor') in A's thread", `${imp.status}`);
}

console.log("\n  COMPANY START: REFUSALS (checked in the database)");
{
  const threadsBefore = (await rows(`conversations?or=(sender_company_id.eq.${A.id},sender_company_id.eq.${B.id})&select=id`)).length;
  const msgsBefore = (await msgsIn(AB.id)).length;
  const cases = [
    ["anonymous", null, A.id, B.slug, 401],
    ["investor (no membership) as A", who.INVESTOR, A.id, B.slug, 403],
    ["owner of B as A (cross-company)", who.COMPANY_B, A.id, B.slug, 403],
    ["owner of B as A, into A's existing thread with B", who.COMPANY_B, A.id, B.slug, 403],
    ["platform admin who is not a member of A", who.ADMIN, A.id, B.slug, 403],
    ["investor B as B", who.INVESTOR_B, B.id, A.slug, 403],
    ["company A messaging itself", who.COMPANY_A, A.id, A.slug, 400],
    ["unknown recipient", who.COMPANY_A, A.id, "iso-no-such-company", 404],
  ];
  for (const [name, u, from, to, want] of cases) {
    const r = await start(u, from, to, T(`refused: ${name}`));
    ok(r.status === want, `${name} -> ${want}`, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  }
  ok((await rows(`conversations?or=(sender_company_id.eq.${A.id},sender_company_id.eq.${B.id})&select=id`)).length === threadsBefore, "database: no thread was created by any refused call");
  ok((await msgsIn(AB.id)).length === msgsBefore && (await rows(`messages?body=like.${encodeURIComponent(`${MARK} ${RUN} refused:*`)}&select=id`)).length === 0, "database: no message was stored by any refused call");
}

console.log("\n  COMPANY START: CONCURRENCY AND RETRIES (company B -> company A, a new thread)");
{
  const rs = await Promise.all([
    ...Array.from({ length: 6 }, (_, i) => start(who.COMPANY_B, B.id, A.slug, T(`B parallel ${i}`))),
  ]);
  const t = await companyThreads(B.id, A.slug);
  ok(rs.every((r) => r.status === 200), "6 parallel starts B -> A: all 200", rs.map((r) => `${r.status}${r.body.error ? ":" + r.body.error : ""}`).join(","));
  ok(t.length === 1 && rs.filter((r) => r.body.created).length === 1, "database: exactly ONE thread, exactly one response says 'created'", `${t.length} threads`);
  ok(t.length === 1 && (await msgsIn(t[0].id)).length === 6, "database: 6 messages, none lost or doubled");
  const k = crypto.randomUUID();
  const rr = await Promise.all(Array.from({ length: 5 }, () => start(who.COMPANY_B, B.id, A.slug, T("B keyed retry"), { clientMessageId: k })));
  ok(rr.every((r) => r.status === 200) && (await msgsIn(t[0].id, `&body=eq.${encodeURIComponent(T("B keyed retry"))}`)).length === 1, "5 CONCURRENT retries of one start (same key): stored once");
  ok((await companyThreads(A.id, B.slug)).length === 1 && (await companyThreads(B.id, A.slug)).length === 1, "A->B and B->A remain two separate threads, one each");
}

// ================================================================ egress ==
{
  const log = (await egressLog()).slice(logStart);
  const blocked = log.filter((e) => e.action === "block");
  const mail = log.filter((e) => e.provider === "postmark");
  ok(blocked.length === 0, "no outbound call had to be blocked", blocked.map((e) => e.host).join(", "));
  ok(mail.every((e) => e.action === "mock" && /\.invalid$/.test(e.to || "")), `mail: ${mail.length} mocked, every one to a .invalid fixture address (none sent)`);
  ok(log.every((e) => e.action === "mock" || e.action === "allow"), "nothing left the staging boundary unmocked");
}

console.log(`\n  messaging-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
