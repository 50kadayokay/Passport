// ─────────────────────────────────────────────────────────────────────────────
// General contact / plan intake (POST /api/contact).
//
// Backs the marketing Contact page (src/marketing/home2/ContactPage.jsx), which every
// pricing CTA now leads to. Deliberately a sibling of api/conference-inquiry.js rather
// than a change to it: that endpoint is wired to the Conference Mode flow and is working,
// so this one leaves it alone and reuses the same proven mechanics —
//   1) STORES the lead in `demo_bookings` (service role preferred, anon fallback), and
//   2) EMAILS it to support@mineex.ca via Postmark with ReplyTo set to the sender.
//
// Env used (set in the deployment):
//   • POSTMARK_SERVER_TOKEN, MESSAGES_FROM_EMAIL  — required to actually send mail.
//   • SUPABASE_SERVICE_ROLE_KEY (via _service.js) — preferred for the insert.
//   • CONTACT_TO — optional override of the support recipient.
// Without the Postmark vars the endpoint still succeeds via the stored row, and the
// response reports { stored, emailed } so the page can tell the sender what happened.
// ─────────────────────────────────────────────────────────────────────────────
import { SB_URL, ANON_KEY, serviceRest, serviceConfigured } from "./_service.js";

const SUPPORT_TO = process.env.CONTACT_TO || process.env.CONFERENCE_INQUIRY_TO || "support@mineex.ca";

// Labels mirror the plans the pricing screens actually offer. An unknown value is kept
// verbatim rather than dropped, so a new plan never silently loses its attribution.
const PLAN_LABEL = {
  basic: "Basic — $299/month",
  pro: "Pro — $999/month ($849/month billed annually)",
  managed: "Fully Managed Pro — quote",
  standard: "Standard Conference Mode — $6,000",
  bespoke: "Bespoke Conference Mode — $9,000",
  website: "Custom Website Design — quote",
  demo: "Product demo",
  general: "General enquiry",
};

const clean = (v, max = 500) => String(v == null ? "" : v).trim().slice(0, max);
const isEmail = (e) => /.+@.+\..+/.test(e);
const planLabel = (p) => PLAN_LABEL[p] || (p ? p : "");

function structuredLines(d) {
  const lines = [];
  if (planLabel(d.plan)) lines.push(`Interested in: ${planLabel(d.plan)}`);
  if (d.phone) lines.push(`Phone: ${d.phone}`);
  if (d.ticker) lines.push(`Ticker: ${d.ticker}`);
  lines.push("Source: Contact page");
  return lines;
}

function composeNotes(d) {
  const lines = ["[Contact enquiry]", ...structuredLines(d)];
  if (d.message) lines.push("", "Message:", d.message);
  return lines.join("\n");
}

function composeEmail(d) {
  const lines = [
    "New enquiry from the MineEx site.",
    "",
    `Name:    ${d.name}`,
    `Email:   ${d.email}`,
    `Company: ${d.company}`,
    ...structuredLines(d),
  ];
  if (d.message) lines.push("", "Message:", d.message);
  lines.push("", "— Reply directly to this email to reach the sender.");
  return lines.join("\n");
}

async function storeLead(row) {
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
        From: `MineEx <${from}>`, To: SUPPORT_TO, ReplyTo: replyTo,
        Subject: subject, TextBody: text, MessageStream: "outbound",
      }),
    });
    if (!r.ok) return { emailed: false, reason: `postmark-${r.status}` };
    return { emailed: true };
  } catch {
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
    name: clean(b.name, 200), email: clean(b.email, 200), company: clean(b.company, 200),
    phone: clean(b.phone, 60), ticker: clean(b.ticker, 40),
    plan: clean(b.plan, 40), message: clean(b.message, 4000),
  };

  if (!data.name || !data.company || !isEmail(data.email)) {
    return res.status(400).json({ ok: false, error: "missing-required-fields" });
  }

  const row = { name: data.name, email: data.email, company: data.company, notes: composeNotes(data) };

  const [stored, mail] = await Promise.all([
    storeLead(row).catch(() => false),
    sendSupportEmail({
      replyTo: data.email,
      subject: `New enquiry — ${data.company}${planLabel(data.plan) ? ` · ${planLabel(data.plan)}` : ""}`,
      text: composeEmail(data),
    }).catch(() => ({ emailed: false, reason: "send-threw" })),
  ]);

  if (!stored && !mail.emailed) {
    return res.status(502).json({ ok: false, error: "delivery-failed", emailReason: mail.reason });
  }
  return res.status(200).json({ ok: true, stored, emailed: mail.emailed, emailReason: mail.emailed ? undefined : mail.reason });
}
