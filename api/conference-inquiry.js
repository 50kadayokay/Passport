// ─────────────────────────────────────────────────────────────────────────────
// Conference Mode inquiry intake (POST /api/conference-inquiry).
//
// Backs the marketing "Get Started" inquiry page (src/marketing/home2/
// ConferenceInquiry.jsx). It does two things for every submission:
//   1) STORES the lead in the existing `demo_bookings` table (same destination the
//      Book-a-Demo form uses), so nothing is ever lost.
//   2) EMAILS the inquiry to support@mineex.ca via the existing Postmark setup,
//      with ReplyTo set to the inquirer so support can reply directly.
//
// The email is what the requester wants guaranteed; the DB row is the durable
// backup. The response reports { stored, emailed } so the client can react.
//
// Env used (set in the deployment):
//   • POSTMARK_SERVER_TOKEN, MESSAGES_FROM_EMAIL  — required to actually send mail
//     (MESSAGES_FROM_EMAIL must be a Postmark-verified sender signature/domain).
//   • SUPABASE_SERVICE_ROLE_KEY (via _service.js) — preferred for the insert;
//     falls back to the anon key if the service role isn't configured.
//   • CONFERENCE_INQUIRY_TO — optional override of the support recipient.
// ─────────────────────────────────────────────────────────────────────────────
import { SB_URL, ANON_KEY, serviceRest, serviceConfigured } from "./_service.js";

const SUPPORT_TO = process.env.CONFERENCE_INQUIRY_TO || "support@mineex.ca";

const INTEREST_LABEL = { standard: "Standard", bespoke: "Bespoke", unsure: "Not sure yet" };
const PRO_LABEL = { yes: "Yes", learn: "I'd like to learn more", have: "Already have one", no: "Not right now" };

const clean = (v, max = 500) => String(v == null ? "" : v).trim().slice(0, max);
const isEmail = (e) => /.+@.+\..+/.test(e);

// The structured lines shared by the stored `notes` and the email body.
function structuredLines({ interest, conference, timeframe, proProfile }) {
  const lines = [];
  if (INTEREST_LABEL[interest]) lines.push(`Interested in: ${INTEREST_LABEL[interest]}`);
  if (conference) lines.push(`Upcoming conference: ${conference}`);
  if (timeframe) lines.push(`Timeframe: ${timeframe}`);
  if (PRO_LABEL[proProfile]) lines.push(`Pro Profile interest: ${PRO_LABEL[proProfile]}`);
  lines.push("Source: Conference Mode");
  return lines;
}

function composeNotes(data) {
  const lines = ["[Conference Mode inquiry]", ...structuredLines(data)];
  if (data.message) lines.push("", "Message:", data.message);
  return lines.join("\n");
}

function composeEmail(data) {
  const lines = [
    "New Conference Mode inquiry from the MineEx site.",
    "",
    `Name:    ${data.name}`,
    `Email:   ${data.email}`,
    `Company: ${data.company}`,
    ...structuredLines(data),
  ];
  if (data.message) lines.push("", "Message:", data.message);
  lines.push("", "— Reply directly to this email to reach the sender.");
  return lines.join("\n");
}

async function storeLead(row) {
  // Prefer the service role (bypasses RLS); fall back to the anon key, which the
  // public form already has insert rights for.
  if (serviceConfigured()) {
    const r = await serviceRest("demo_bookings", { method: "POST", prefer: "return=minimal", body: row });
    return r.ok;
  }
  if (!SB_URL || !ANON_KEY) return false;
  const r = await fetch(`${SB_URL}/rest/v1/demo_bookings`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "content-type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  return r.ok;
}

async function sendSupportEmail({ replyTo, subject, text }) {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.MESSAGES_FROM_EMAIL;
  if (!token || !from) return { emailed: false, reason: "email-not-configured" };
  try {
    const r = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json", "X-Postmark-Server-Token": token },
      body: JSON.stringify({
        From: `MineEx Conference Mode <${from}>`,
        To: SUPPORT_TO,
        ReplyTo: replyTo,
        Subject: subject,
        TextBody: text,
        MessageStream: "outbound",
      }),
    });
    if (!r.ok) return { emailed: false, reason: `postmark-${r.status}` };
    return { emailed: true };
  } catch (e) {
    return { emailed: false, reason: "postmark-network" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method-not-allowed" });
  }

  const b = req.body || {};
  const data = {
    name: clean(b.name, 200),
    email: clean(b.email, 200),
    company: clean(b.company, 200),
    conference: clean(b.conference, 200),
    timeframe: clean(b.timeframe, 80),
    interest: clean(b.interest, 40),
    proProfile: clean(b.proProfile, 40),
    message: clean(b.message, 4000),
  };

  if (!data.name || !data.company || !isEmail(data.email)) {
    return res.status(400).json({ ok: false, error: "missing-required-fields" });
  }

  const row = { name: data.name, email: data.email, company: data.company, notes: composeNotes(data) };

  // Run both in parallel; neither should block the other.
  const [stored, mail] = await Promise.all([
    storeLead(row).catch(() => false),
    sendSupportEmail({
      replyTo: data.email,
      subject: `New Conference Mode inquiry — ${data.company}`,
      text: composeEmail(data),
    }).catch(() => ({ emailed: false, reason: "send-threw" })),
  ]);

  // Success as long as the inquiry was captured somewhere (stored or emailed).
  if (!stored && !mail.emailed) {
    return res.status(502).json({ ok: false, error: "delivery-failed", emailReason: mail.reason });
  }
  return res.status(200).json({ ok: true, stored, emailed: mail.emailed, emailReason: mail.emailed ? undefined : mail.reason });
}
