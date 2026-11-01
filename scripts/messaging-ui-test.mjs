// a10 offline: the company side of messaging in the portal -- inbox, thread,
// reply, company-started threads, read-only roles -- run through the real
// src/lib/messages.js against a stub that applies 0076's message policies.
//   node scripts/messaging-ui-test.mjs
//
// OFFLINE. fetch answers only from the stub below. The live RLS behaviour is
// proven on staging by scripts/messaging-live-test.mjs (S4); this proves the
// portal sends what those policies accept, and shows the person the truth when
// a read or a send fails. Clicks are covered by the /qa/s3 harness run.
import fs from "node:fs";
import { installBrowserGlobals, installFetch, signIn, signOutLocal, loadBundle, json, reporter, STUB_SB } from "./_portal-offline.mjs";

const { ok, section, done } = reporter("messaging-ui");
installBrowserGlobals();

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const CONVS = [
  { id: "in-1", investor_id: "inv-1", company_slug: "alpha-gold", company_name: "Alpha Gold Corp.", last_message_at: "2026-11-01T10:00:00Z", company_read_at: null, sender_company_id: null },
  { id: "out-1", investor_id: "u-owner", company_slug: "gamma-silver", company_name: "Gamma Silver Inc.", last_message_at: "2026-11-01T09:00:00Z", company_read_at: null, sender_company_id: A },
];
// role of each token in A; policies per 0076 (msg_insert_company / msg_insert_sender_company)
const ROLE = { "tok-owner": "owner", "tok-editor": "editor", "tok-publisher": "publisher", "tok-analyst": "analyst", "tok-viewer": "viewer" };
const SENDERS = ["owner", "admin", "editor", "publisher"];
let mode = "ok";
const inserts = [];

installFetch(async (req) => {
  const { url, method, token } = req;
  if (url.origin !== STUB_SB) return undefined;
  if (url.pathname === "/auth/v1/token") return json({ error: "invalid_grant" }, 400);
  if (mode === "down") throw new TypeError("fetch failed");
  if (mode === "500") return json({ message: "boom" }, 500);
  const p = url.pathname.replace("/rest/v1", "");
  if (p === "/conversations") return json(CONVS);
  if (p === "/messages" && method === "GET") return json([{ id: "m1", conversation_id: "in-1", sender: "investor", body: "Hi", created_at: "2026-11-01T10:00:00Z" }, null, { nope: 1 }]);
  if (p === "/messages" && method === "POST") {
    const b = JSON.parse(req.body);
    const conv = CONVS.find((c) => c.id === b.conversation_id);
    const role = ROLE[token];
    if (!role) return json({ message: "JWT" }, 401);
    const allowed = conv && SENDERS.includes(role) && (
      (b.sender === "company" && conv.company_slug === "alpha-gold") ||        // msg_insert_company: recipient side
      (b.sender === "investor" && conv.sender_company_id === A));             // msg_insert_sender_company: initiating side
    if (!allowed) return json({ code: "42501", message: "new row violates row-level security policy" }, 403);
    inserts.push(b);
    return json([{ id: `m-${inserts.length}`, ...b, created_at: "2026-11-01T11:00:00Z" }], 201);
  }
  return undefined;
});

const M = await loadBundle("messages", `
  export * from "./src/lib/messages.js";
  export { can } from "./src/lib/companyRoles.js";
`);
const as = (tok) => signIn({ id: `u-${tok}`, email: `${tok}@stub.invalid` }, { token: tok });

section("INBOX READS: FAILURE IS NOT AN EMPTY INBOX");
{
  as("tok-owner");
  const r = await M.loadConversations("alpha-gold", A);
  ok(r.ok && r.rows.length === 2, "both directions load (threads written to us and threads we started)");
  for (const m of ["down", "500"]) {
    mode = m;
    const x = await M.loadConversations("alpha-gold", A);
    ok(!x.ok, `${m}: loadConversations says it failed (the inbox shows 'Couldn't load', keeps what it had)`);
    ok(Array.isArray(await M.listConversations("alpha-gold")) && (await M.listConversations("alpha-gold")).length === 0, `${m}: listConversations (shell badge) still degrades to []`);
    ok(!(await M.loadMessages("in-1")).ok, `${m}: loadMessages says it failed (a poll no longer blanks the open thread)`);
  }
  mode = "ok";
  const t = await M.loadMessages("in-1");
  ok(t.ok && t.rows.length === 1, "malformed rows in a thread (null, no id) are dropped, the rest shown");
}

section("WHICH SIDE ARE WE ON");
{
  const [inb, out] = CONVS;
  ok(M.mySide(inb, A) === "company" && M.mySide(out, A) === "investor", "written to us -> we are 'company'; started by us -> we are 'investor' (0063, positional)");
  ok(M.isMine({ sender: "company" }, inb, A) && !M.isMine({ sender: "investor" }, inb, A), "inbound thread: our replies are 'company' bubbles");
  ok(M.isMine({ sender: "investor" }, out, A) && !M.isMine({ sender: "company" }, out, A), "thread we started: our messages are 'investor', the other company's are 'company' (was: shown reversed)");
  ok(M.threadName(out, {}, A) === "Gamma Silver Inc." && /you started/.test(M.threadSubtitle(out, {}, A)), "thread we started is named after the company we wrote to (was: our own user / 'Investor')");
  ok(M.threadName({ ...out, company_name: "" }, {}, A) === "gamma-silver", "  ...falls back to its slug, never blank");
  ok(M.threadName(inb, { "inv-1": { display_name: "Dana W" } }, A) === "Dana W" && M.threadName(inb, {}, A) === "Investor", "inbound thread: the investor's display name, else 'Investor'");
}

section("UNREAD");
{
  const [inb, out] = CONVS;
  ok(M.isUnread(inb, A), "new investor message, never opened -> unread");
  ok(!M.isUnread(out, A), "thread we started -> never 'unread' to us (company_read_at is the recipient's receipt; was: unread forever)");
  ok(!M.isUnread({ ...inb, last_message_at: null }, A), "no last_message_at (malformed) -> not unread");
  ok(!M.isUnread({ ...inb, company_read_at: "2026-11-01T11:00:00Z" }, A), "read after the last message -> read");
}

section("REPLY: SENDS WHAT 0076 ACCEPTS");
{
  as("tok-owner"); inserts.length = 0;
  await M.sendCompanyReply("in-1", "Thanks, Q1.", { side: M.mySide(CONVS[0], A) });
  ok(inserts.at(-1).sender === "company", "reply to an investor -> sender 'company', accepted");
  await M.sendCompanyReply("out-1", "Following up.", { side: M.mySide(CONVS[1], A) });
  ok(inserts.at(-1).sender === "investor" && inserts.at(-1).conversation_id === "out-1", "continue a thread we started -> sender 'investor', accepted (was: sent as 'company', refused by RLS)");
  let e = null; try { await M.sendCompanyReply("out-1", "x"); } catch (x) { e = x; }
  ok(e && /wasn't sent/.test(e.message), "the old behaviour (sender 'company' on our own thread) is refused, and the person is told it wasn't sent");
  for (const t of ["tok-editor", "tok-publisher"]) { as(t); await M.sendCompanyReply("in-1", "ok", { side: "company" }); }
  ok(inserts.length === 4, "editor and publisher can reply (a03: owner/admin/editor/publisher send)");
  for (const t of ["tok-analyst", "tok-viewer"]) {
    as(t); let err = null;
    try { await M.sendCompanyReply("in-1", "nope", { side: "company" }); } catch (x) { err = x; }
    ok(err && /role can't send messages/.test(err.message), `${t.slice(4)}: refused, with a message that names the role (UI hides the composer for them anyway)`);
  }
  signOutLocal();
  let se = null; try { await M.sendCompanyReply("in-1", "x", { side: "company" }); } catch (x) { se = x; }
  ok(se && /session has expired/.test(se.message), "signed out: 'session has expired' (was: 'You do not have access to this conversation')");
  as("tok-owner");
  let be = null; try { await M.sendCompanyReply("in-1", "x", { side: "admin" }); } catch (x) { be = x; }
  ok(be && inserts.length === 4, "an unknown side is refused before any request");
  let ee = null; try { await M.sendCompanyReply("in-1", "   "); } catch (x) { ee = x; }
  ok(ee && /empty/.test(ee.message), "empty reply refused before any request");
}

section("ROLE POLICY (a03) IN THE UI");
{
  ok(["owner", "admin", "editor", "publisher"].every((r) => M.can(r, "sendMessages")) && !["analyst", "viewer"].some((r) => M.can(r, "sendMessages")), "sendMessages: owner/admin/editor/publisher yes; analyst/viewer no");
  const src = fs.readFileSync("src/portal/Messages.jsx", "utf8");
  ok(/const canSend = can\(company\?\.role \|\| "owner", "sendMessages"\)/.test(src) && /\{composing && canSend && \(/.test(src) && /\{canSend && \(\s*<button/.test(src) && /\{!canSend \? \(/.test(src), "New, the compose dialog and the reply box all require sendMessages; read-only roles see a notice");
  ok(/sendCompanyReply\(openId, text, \{ side \}\)/.test(src) && /const side = mySide\(openConv, company\?\.id\)/.test(src), "Messages replies with the thread's side");
  ok(/openThread\(conv\.id, \{ \.\.\.conv/.test(src), "after starting a thread it is opened with its messages (was: stuck on a spinner until the next poll)");
  ok(/setStaged\(\[\]\);\s*const r = await loadMessages\(id\)/.test(src), "switching threads drops files staged for the previous one (they used to be sent to the next thread)");
  ok(/if \(conv && isOutbound\(conv, company\?\.id\)\) return;/.test(src), "threads we started are not 'marked read' (0047 refuses it; the receipt belongs to the recipient)");
  ok(/data-inbox-error/.test(src) && /data-thread-error/.test(src) && /if \(!r\.ok\) return;/.test(src), "failed inbox/thread reads are shown; a failed poll keeps the thread on screen");
}

done();
