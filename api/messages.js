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
  const companyName = comp.name || slug;
  const ceoEmail = contactEmail(comp.profile);

  const upR = await serviceRest(`conversations?on_conflict=investor_id,company_slug`, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: { investor_id: user.id, company_slug: slug, company_name: companyName, ceo_email: ceoEmail || null },
  });
  const conv = upR.ok ? (await upR.json().catch(() => []))[0] : null;
  if (!conv || !conv.id) return bad(res, 500, "conversation-failed");

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

async function handleInbound(req, res) {
  const secret = process.env.MESSAGES_INBOUND_SECRET;
  if (secret && req.query.secret !== secret) return res.status(401).json({ ok: false });

  const p = req.body || {};
  const conversationId = String(p.MailboxHash || "").trim();
  const emailId = String(p.MessageID || "").trim() || null;
  const text = replyText(p);
  if (!conversationId || !text) return res.status(200).json({ ok: true, skipped: "empty" });

  const cR = await serviceRest(`conversations?id=eq.${encodeURIComponent(conversationId)}&select=id,ceo_email&limit=1`);
  const conv = cR.ok ? (await cR.json().catch(() => []))[0] : null;
  if (!conv) return res.status(200).json({ ok: true, skipped: "no-conversation" });
  const expected = (conv.ceo_email || "").toLowerCase();
  if (expected && fromAddress(p) !== expected) return res.status(200).json({ ok: true, skipped: "sender-mismatch" });

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
  const isInbound = req.query.secret !== undefined || (req.body && req.body.MailboxHash !== undefined);
  return isInbound ? handleInbound(req, res) : handleSend(req, res);
}
