// POST /api/messages — the investor↔company email bridge, one endpoint (two modes,
// merged to stay under the Hobby 12-function cap).
//
//   • SEND (investor → company): no ?secret; carries Authorization: Bearer <jwt>.
//     Verify the investor, resolve the company's CEO email SERVER-SIDE from the
//     company profile (so this can't be used to email arbitrary addresses), upsert
//     the (investor, company) conversation, store the message, and email the CEO
//     with a Reply-To that encodes the conversation id.
//   • INBOUND (CEO reply → investor): Postmark webhook, URL carries ?secret=…; the
//     Reply-To's +conversationId comes back as MailboxHash. Insert as a 'company'
//     message via the service role (bypasses RLS) so it lands in the investor's thread.
//
// Env: POSTMARK_SERVER_TOKEN, POSTMARK_INBOUND_HASH, MESSAGES_FROM_EMAIL,
//      MESSAGES_INBOUND_SECRET. Missing email env → the message still stores
//      (in-app chat works), response reports emailed:false.

import crypto from "node:crypto";
import { SB_URL, ANON_KEY, serviceRest, serviceConfigured } from "./_service.js";

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
  const upR = await serviceRest(`conversations?on_conflict=investor_id,company_slug`, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: { investor_id: user.id, company_slug: slug, company_name: companyName, ceo_email: ceoEmail || null },
  });
  const conv = upR.ok ? (await upR.json().catch(() => []))[0] : null;
  if (!conv || !conv.id) return bad(res, 500, "conversation-failed");

  // Declared by the client so the notification email can mention files that are
  // uploaded immediately AFTER this call (an attachment row needs a message id,
  // which does not exist until the insert below). Advisory only -- it affects a
  // sentence in an email and nothing else, so a wrong value cannot grant access.
  const attachmentCount = Math.max(0, Math.min(20, parseInt(req.body?.attachments, 10) || 0));

  const msgR = await serviceRest(`messages`, {
    method: "POST", prefer: "return=representation",
    body: { conversation_id: conv.id, sender: "investor", body: text },
  });
  const msg = msgR.ok ? (await msgR.json().catch(() => []))[0] : null;
  if (!msg) return bad(res, 500, "message-failed");

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
  return isInbound ? handleInbound(req, res) : handleSend(req, res);
}
