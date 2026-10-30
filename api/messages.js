// POST /api/messages — the investor↔company email bridge, one endpoint (two modes,
// merged to stay under the Hobby 12-function cap).
//
//   • SEND (investor → company): no ?secret; carries Authorization: Bearer <jwt>.
//     Verify the investor, resolve the company's CEO email SERVER-SIDE from the
//     company profile (so this can't be used to email arbitrary addresses), find or
//     create the (investor, company) conversation, store the message, and email the CEO
//     with a Reply-To that encodes the conversation id.
//   • START (company → company, D20): no ?secret, body.action = "start", Bearer
//     <jwt>. A member of the sending company opens or reuses its thread with
//     another company and posts the first message (see handleStart).
//   • INBOUND (CEO reply → investor): Postmark webhook, URL carries ?secret=…; the
//     Reply-To's +conversationId comes back as MailboxHash. Insert as a 'company'
//     message via the service role (bypasses RLS) so it lands in the investor's thread.
//
// Env: POSTMARK_SERVER_TOKEN, POSTMARK_INBOUND_HASH, MESSAGES_FROM_EMAIL,
//      MESSAGES_INBOUND_SECRET. Missing email env → the message still stores
//      (in-app chat works), response reports emailed:false.

import crypto from "node:crypto";
import { SB_URL, ANON_KEY, serviceRest, serviceConfigured } from "./_service.js";
import { bearerToken, verifyBearer } from "./_supabase.js";
import { callerCompanyRole, UUID as UUID_RE } from "./_roles.js";

function bad(res, code, msg) { res.status(code).json({ ok: false, error: msg }); }

// ---- SEND helpers ---------------------------------------------------------
async function authUser(token) {
  if (!token) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

function contactEmail(profile) {
  if (!profile || typeof profile !== "object") return "";
  // The compiled profile nests contact under `pp` (pp.CONTACT.email). Check every
  // reasonable shape so onboarded companies + any legacy rows both resolve.
  const pp = profile.pp || {};
  const c = pp.CONTACT || pp.contact || profile.CONTACT || profile.contact || {};
  const e = (c.email || profile.email || "").trim();
  return /.+@.+\..+/.test(e) ? e : "";
}

async function sendEmail({ to, replyTo, fromName, subject, text }) {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.MESSAGES_FROM_EMAIL;
  if (!token || !from) return { emailed: false, reason: "email-not-configured" };
  const r = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { "content-type": "application/json", Accept: "application/json", "X-Postmark-Server-Token": token },
    body: JSON.stringify({
      From: fromName ? `${fromName} <${from}>` : from,
      To: to, ReplyTo: replyTo, Subject: subject, TextBody: text, MessageStream: "outbound",
    }),
  });
  if (!r.ok) return { emailed: false, reason: `postmark-${r.status}` };
  return { emailed: true };
}

async function handleSend(req, res) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const user = await authUser(token);
  if (!user || !user.id) return bad(res, 401, "sign-in-required");

  const body = req.body || {};
  const slug = String(body.companySlug || "").trim().toLowerCase();
  const text = String(body.body || "").trim();
  if (!slug) return bad(res, 400, "companySlug-required");
  if (!text) return bad(res, 400, "empty-message");
  if (text.length > 5000) return bad(res, 400, "too-long");

  const compR = await serviceRest(`companies?slug=eq.${encodeURIComponent(slug)}&select=name,profile&limit=1`);
  const comp = compR.ok ? (await compR.json().catch(() => []))[0] : null;
  if (!comp) return bad(res, 404, "company-not-found");

  // NO TIER GATE, deliberately. An investor may write to ANY published company,
  // claimed or not. The message is stored against the slug here and becomes
  // visible to the company the moment somebody claims the account -- see the
  // note on the conversations upsert below.
  const companyName = comp.name || slug;
  const ceoEmail = contactEmail(comp.profile);

  // MESSAGES OUTLIVE THE CLAIM, AND THAT IS THE POINT.
  //
  // The thread is keyed on company_slug, not on a company_id or an owner, so it
  // can be created for a company nobody has claimed yet -- which is most of
  // them: 1420 published, 5 claimed. The message is stored here regardless. The
  // email below is best-effort and `ceo_email` is nullable, so an unclaimed
  // company simply gets no notification; it does NOT lose the message.
  //
  // Visibility then follows automatically. Migration 0047's company-side policy
  // resolves company_slug -> companies.id -> owns_company(id), and owns_company
  // is evaluated AT QUERY TIME. So the moment a company is claimed -- owner_id
  // set, or an active membership added (0006's trigger creates the membership
  // from owner_id) -- every thread ever written to that slug appears in their
  // portal inbox, unread, with full history. Nothing has to be migrated or
  // back-filled, because nothing was ever addressed to a person.
  //
  // DO NOT make this conditional on the company being claimed, entitled or on a
  // paid tier. An investor writing to an unclaimed company is exactly the
  // message worth keeping: it is the reason that company has to come and claim
  // the account. Gate the REPLY if you must gate something.
  //
  // FIND-OR-CREATE, NOT UPSERT (D20). This used to be a PostgREST upsert on
  // (investor_id, company_slug). Migration 0063 replaced that unique constraint
  // with two PARTIAL unique indexes (investor threads vs company-started
  // threads), and PostgREST's on_conflict cannot target a partial index: every
  // send failed with 42P10. The lookup below works on both schemas -- before
  // 0063 the sender_company_id column does not exist and reads as undefined.
  const found = await findOrCreateThread({
    match: (c) => c.sender_company_id == null,
    query: `investor_id=eq.${encodeURIComponent(user.id)}&company_slug=eq.${encodeURIComponent(slug)}`,
    insert: { investor_id: user.id, company_slug: slug, company_name: companyName, ceo_email: ceoEmail || null },
  });
  if (!found.conv) return bad(res, 500, "conversation-failed");
  const conv = found.conv;
  // The upsert used to refresh these on every send; keep doing so, so a CEO
  // address added after the first message still gets the notifications.
  if (!found.created && (conv.company_name !== companyName || (conv.ceo_email || null) !== (ceoEmail || null))) {
    await serviceRest(`conversations?id=eq.${encodeURIComponent(conv.id)}`, {
      method: "PATCH", prefer: "return=minimal",
      body: { company_name: companyName, ceo_email: ceoEmail || null },
    });
  }

  // Declared by the client so the notification email can mention files that are
  // uploaded immediately AFTER this call (an attachment row needs a message id,
  // which does not exist until the insert below). Advisory only -- it affects a
  // sentence in an email and nothing else, so a wrong value cannot grant access.
  const attachmentCount = Math.max(0, Math.min(20, parseInt(req.body?.attachments, 10) || 0));

  const stored = await insertMessageOnce({ convId: conv.id, sender: "investor", text, clientMessageId: body.clientMessageId });
  if (!stored.msg) return bad(res, 500, "message-failed");
  const msg = stored.msg;
  // A retry of a message already stored: same answer, and the CEO is not
  // emailed a second time.
  if (stored.duplicate) return res.status(200).json({ ok: true, conversationId: conv.id, message: msg, duplicate: true, emailed: false, reason: "duplicate" });

  let emailed = { emailed: false, reason: "no-ceo-email" };
  const hash = process.env.POSTMARK_INBOUND_HASH;
  if (ceoEmail && hash) {
    const investorName = user.user_metadata?.full_name || user.email || "An investor";
    emailed = await sendEmail({
      to: ceoEmail,
      replyTo: `${hash}+${conv.id}@inbound.postmarkapp.com`,
      fromName: `${companyName} · Passport`,
      subject: `New investor message — ${companyName}`,
      text:
        `${investorName} sent ${companyName} a message on Passport:\n\n${text}\n\n` +
        // Files are NAMED, never linked. A signed URL in an email is forwardable,
        // outlives the message it came with, and turns an inbox into a way around
        // the storage policy. The company opens the portal to read them, where the
        // link is minted for them and expires.
        (attachmentCount > 0
          ? `${attachmentCount} file${attachmentCount > 1 ? "s" : ""} attached — ` +
            `open the MineEx portal to view ${attachmentCount > 1 ? "them" : "it"}.\n\n`
          : "") +
        `— — —\nReply to this email to respond. Your reply goes straight to the investor ` +
        `inside the Passport app. Write above this line; the investor won't see this footer.`,
    });
  }
  res.status(200).json({ ok: true, conversationId: conv.id, message: msg, ...emailed });
}

// ---- THREADS AND MESSAGES (D20) -------------------------------------------
//
// Conversations are found or created here, as the service role, rather than
// upserted. Migration 0063 keys threads on two PARTIAL unique indexes:
//   uq_conv_investor_thread (investor_id, company_slug)       WHERE sender_company_id IS NULL
//   uq_conv_company_thread  (sender_company_id, company_slug) WHERE sender_company_id IS NOT NULL
// PostgREST cannot name a partial index in on_conflict (42P10), so both the
// investor send and the company-started thread were broken. Select, then
// insert; a concurrent insert of the same thread loses on the unique index
// (409 / 23505) and re-reads the winner, so two racing sends share one thread.

async function readRows(r) { return r.ok ? r.json().catch(() => []) : []; }

/** Find the one thread matching `query` + `match`, or create it from `insert`. */
export async function findOrCreateThread({ query, match, insert }) {
  const find = async () => {
    const rows = await readRows(await serviceRest(`conversations?${query}&select=*&order=created_at.asc`));
    return (Array.isArray(rows) ? rows : []).find(match) || null;
  };
  const existing = await find();
  if (existing) return { conv: existing, created: false };
  const ins = await serviceRest("conversations", { method: "POST", prefer: "return=representation", body: insert });
  if (ins.ok) {
    const row = (await readRows(ins))[0];
    if (row && row.id) return { conv: row, created: true };
  }
  // Lost a race (unique violation) -- or the insert failed: either way the
  // only safe answer is what is actually stored.
  return { conv: await find(), created: false };
}

// The window in which an identical message from the same side of the same
// thread is treated as a retry when the client sent no idempotency key.
export const DUPLICATE_WINDOW_SECONDS = 30;

/**
 * Store a message at most once.
 *
 * With a client idempotency key (a UUID the client keeps across retries) the
 * database enforces it: the key is stored in messages.email_id under a
 * "client:" prefix, and uq_messages_email (0014) makes a second insert fail.
 * Postmark message ids -- the column's other use -- never carry that prefix,
 * so the two cannot collide. Without a key, an identical body from the same
 * sender in the last DUPLICATE_WINDOW_SECONDS is returned instead of stored.
 */
export async function insertMessageOnce({ convId, sender, text, clientMessageId }) {
  const key = UUID.test(String(clientMessageId || "")) ? `client:${convId}:${String(clientMessageId).toLowerCase()}` : null;
  const prior = async () => {
    const q = key
      ? `messages?email_id=eq.${encodeURIComponent(key)}&conversation_id=eq.${encodeURIComponent(convId)}&select=*&limit=1`
      : `messages?conversation_id=eq.${encodeURIComponent(convId)}&sender=eq.${sender}` +
        `&created_at=gte.${encodeURIComponent(new Date(Date.now() - DUPLICATE_WINDOW_SECONDS * 1000).toISOString())}` +
        `&select=*&order=created_at.desc&limit=20`;
    const rows = await readRows(await serviceRest(q));
    return (Array.isArray(rows) ? rows : []).find((m) => m.body === text) || null;
  };
  const before = await prior();
  if (before) return { msg: before, duplicate: true };
  const body = { conversation_id: convId, sender, body: text };
  if (key) body.email_id = key;
  const r = await serviceRest("messages", { method: "POST", prefer: "return=representation", body });
  if (r.ok) return { msg: (await readRows(r))[0] || null, duplicate: false };
  // 409: the same key was stored by a concurrent retry. Return that one.
  if (r.status === 409 && key) { const won = await prior(); if (won) return { msg: won, duplicate: true }; }
  return { msg: null, duplicate: false };
}

/**
 * action:"start" -- a company opens (or reuses) a thread with another company
 * and posts the first message.
 *
 * Previously done from the browser with an upsert, which failed twice over:
 * 42P10 (the partial index) and 42501 (0052 grants authenticated users SELECT
 * only on conversations, so 0063's insert policy could never be reached).
 * Moving it here needs no grant and no migration. The checks are 0063's
 * conv_insert_company policy, enforced in code:
 *   * the caller is signed in and is an active member or owner of the SENDING
 *     company -- my_company_role(cid) asked AS THE CALLER, the same test as
 *     owns_company(); any role, platform admins not included (as in 0063);
 *   * investor_id is the acting user, so the row stays attributable;
 *   * the recipient exists and is not the sending company.
 * The first message is sender='investor' -- positional: the initiating side.
 */
async function handleStart(req, res) {
  const body = req.body || {};
  const fromCompanyId = String(body.fromCompanyId || "").trim();
  const toSlug = String(body.toSlug || "").trim().toLowerCase();
  const text = String(body.body || "").trim();
  const token = bearerToken(req);
  const v = await verifyBearer(token);
  if (!v.ok || !v.user || !v.user.id) return bad(res, 401, "sign-in-required");
  if (!UUID_RE.test(fromCompanyId)) return bad(res, 400, "fromCompanyId-required");
  // Any active membership or ownership, exactly owns_company(). undefined means
  // the role could not be checked: refuse rather than guess.
  const role = await callerCompanyRole(token, fromCompanyId);
  if (role === undefined) return bad(res, 502, "role-check-failed");
  if (!role) return bad(res, 403, "not-a-member-of-sending-company");
  const who = { user: v.user, role };
  if (!toSlug) return bad(res, 400, "toSlug-required");
  if (!text) return bad(res, 400, "empty-message");
  if (text.length > 5000) return bad(res, 400, "too-long");

  // Before 0063 there is no sender_company_id column: company-started threads
  // do not exist yet, and creating one would make an INVESTOR thread instead.
  const probe = await serviceRest("conversations?select=sender_company_id&limit=0");
  if (!probe.ok) return bad(res, 503, "company-threads-unavailable");

  const fromR = await readRows(await serviceRest(`companies?id=eq.${encodeURIComponent(fromCompanyId)}&select=slug&limit=1`));
  const fromSlug = String((fromR[0] && fromR[0].slug) || "").toLowerCase();
  if (fromSlug && fromSlug === toSlug) return bad(res, 400, "cannot-message-self");
  const toR = await readRows(await serviceRest(`companies?slug=eq.${encodeURIComponent(toSlug)}&select=name&limit=1`));
  if (!toR[0]) return bad(res, 404, "company-not-found");
  const toName = toR[0].name || toSlug;

  const found = await findOrCreateThread({
    query: `sender_company_id=eq.${encodeURIComponent(fromCompanyId)}&company_slug=eq.${encodeURIComponent(toSlug)}`,
    match: (c) => c.sender_company_id === fromCompanyId,
    insert: { investor_id: who.user.id, sender_company_id: fromCompanyId, company_slug: toSlug, company_name: toName },
  });
  if (!found.conv) return bad(res, 500, "conversation-failed");
  const stored = await insertMessageOnce({ convId: found.conv.id, sender: "investor", text, clientMessageId: body.clientMessageId });
  if (!stored.msg) return bad(res, 500, "message-failed");
  res.status(200).json({ ok: true, conversation: found.conv, created: found.created, message: stored.msg, duplicate: stored.duplicate });
}

// ---- INBOUND helpers ------------------------------------------------------
function replyText(p) {
  const stripped = (p.StrippedTextReply || "").trim();
  if (stripped) return stripped;
  const raw = (p.TextBody || "").split(/\n/);
  const out = [];
  for (const line of raw) {
    if (/^\s*>/.test(line)) break;
    if (/^\s*On .+wrote:\s*$/.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

function fromAddress(p) {
  if (p.FromFull && p.FromFull.Email) return String(p.FromFull.Email).toLowerCase();
  const m = String(p.From || "").match(/<([^>]+)>/);
  return (m ? m[1] : String(p.From || "")).trim().toLowerCase();
}

// The inbound secret must be configured AND non-trivial. Shorter than this is
// treated as misconfiguration, not as a secret.
export const INBOUND_SECRET_MIN_LENGTH = 16;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Constant-time comparison of the supplied secret against the configured one. */
export function inboundSecretMatches(supplied, configured) {
  const a = Buffer.from(String(supplied ?? ""), "utf8");
  const b = Buffer.from(String(configured ?? ""), "utf8");
  // timingSafeEqual needs equal lengths; comparing b with itself keeps the work
  // constant when they differ, and the length check still decides the result.
  return crypto.timingSafeEqual(a.length === b.length ? a : b, b) && a.length === b.length;
}

async function handleInbound(req, res) {
  // FAIL CLOSED (F3). This used to skip the check entirely when the secret was
  // unset, so any caller could post a "company" reply into an investor's
  // thread. Unset or trivially short is now a refusal: 503, which Postmark
  // retries, so a misconfigured deployment delays replies rather than losing
  // them -- and never accepts a forged one.
  const configured = String(process.env.MESSAGES_INBOUND_SECRET || "");
  if (configured.trim().length < INBOUND_SECRET_MIN_LENGTH) {
    console.error("[messages] inbound refused: MESSAGES_INBOUND_SECRET is not configured (or shorter than " + INBOUND_SECRET_MIN_LENGTH + " characters)");
    return res.status(503).json({ ok: false, error: "inbound-not-configured" });
  }
  if (!inboundSecretMatches(req.query.secret, configured)) return res.status(401).json({ ok: false });

  const p = req.body || {};
  const conversationId = String(p.MailboxHash || "").trim();
  const emailId = String(p.MessageID || "").trim() || null;
  const text = replyText(p);
  if (!conversationId || !text) return res.status(200).json({ ok: true, skipped: "empty" });
  // MailboxHash is our own conversation UUID; anything else cannot be a reply.
  if (!UUID.test(conversationId)) return res.status(200).json({ ok: true, skipped: "bad-mailbox-hash" });

  const cR = await serviceRest(`conversations?id=eq.${encodeURIComponent(conversationId)}&select=id,ceo_email&limit=1`);
  const conv = cR.ok ? (await cR.json().catch(() => []))[0] : null;
  if (!conv) return res.status(200).json({ ok: true, skipped: "no-conversation" });
  // No CEO address on the thread means no notification was ever emailed for
  // it, so a genuine reply cannot exist. Refused rather than accepted from any
  // sender (the previous behaviour). 200 so Postmark does not retry.
  const expected = (conv.ceo_email || "").toLowerCase();
  if (!expected) return res.status(200).json({ ok: true, skipped: "no-ceo-email" });
  if (fromAddress(p) !== expected) return res.status(200).json({ ok: true, skipped: "sender-mismatch" });

  const ins = await serviceRest(`messages`, {
    method: "POST", prefer: "return=minimal",
    body: { conversation_id: conv.id, sender: "company", body: text, email_id: emailId },
  });
  if (!ins.ok && ins.status !== 409) return res.status(200).json({ ok: true, skipped: `insert-${ins.status}` });
  res.status(200).json({ ok: true });
}

// ---- dispatch -------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "method");
  if (!serviceConfigured()) return bad(res, 500, "service-not-configured");
  // The Postmark inbound webhook URL carries ?secret=…; investor sends don't.
  // Decided by the QUERY ONLY (F3): a body containing MailboxHash used to switch
  // a request into inbound mode, so anyone could reach the company-reply path
  // by body shape. Without ?secret it is a send, which requires a session.
  const isInbound = req.query && req.query.secret !== undefined;
  if (isInbound) return handleInbound(req, res);
  // A company starting a thread (D20). Same session requirement as a send.
  if (req.body && req.body.action === "start") return handleStart(req, res);
  return handleSend(req, res);
}
