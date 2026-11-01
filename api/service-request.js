// POST /api/service-request — a company asks MineEx for a bespoke service (a21).
//
//   Authorization: Bearer <user JWT>
//   { companyId, service, details }  ->  201 { request, emailed }
//
// Two things, in this order:
//   1) STORE the request in service_requests AS THE CALLER (their JWT, not the
//      service key), so migration 0086's policy and trigger decide: a drafting
//      role in that company, status 'requested', author = the caller.
//   2) EMAIL support@mineex.ca, best effort, through the existing Postmark path.
//      The row is the record; the email is the nudge. A failed email is
//      reported ({ emailed: false }) and the request still stands.
//
// The role check here (requireCompanyRole) is a friendlier refusal than a bare
// RLS error; it is not the boundary -- the database refuses the same callers.

import { SB_URL, ANON_KEY } from "./_supabase.js";
import { requireCompanyRole } from "./_roles.js";
import { sendSupportEmail } from "./conference-inquiry.js";

// Same ids and roles as migration 0086 and src/lib/serviceRequests.js.
export const SERVICE_LABEL = {
  conference: "Conference Mode", managed: "Fully Managed MineEx", websites: "Investor Websites",
  presentations: "Corporate Presentations", brand: "Brand & Logo Design", photography: "Photography",
};
export const REQUEST_ROLES = ["owner", "admin", "editor", "publisher"];
const MAX_DETAILS = 4000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method-not-allowed" });
  }
  const b = req.body && typeof req.body === "object" ? req.body : {};
  const service = String(b.service || "");
  if (!SERVICE_LABEL[service]) return res.status(400).json({ error: "Choose one of the listed services." });
  const details = String(b.details == null ? "" : b.details).trim().slice(0, MAX_DETAILS);

  const who = await requireCompanyRole(req, res, { companyId: b.companyId, roles: REQUEST_ROLES });
  if (!who) return;

  let r;
  try {
    r = await fetch(`${SB_URL}/rest/v1/service_requests?select=id,company_id,service,details,status,admin_note,history,created_at,status_changed_at`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${who.token}`, "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ company_id: b.companyId, service, details }),
    });
  } catch {
    return res.status(502).json({ error: "The request could not be saved. Try again." });
  }
  if (r.status === 404) return res.status(503).json({ error: "Service requests are not enabled on this deployment yet." });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    if (/too many service requests/.test(t)) return res.status(429).json({ error: "That is a lot of requests for one day. We'll be in touch about the ones already sent." });
    if (r.status === 401 || r.status === 403 || /42501|row-level security/.test(t)) return res.status(403).json({ error: "Your role in this company does not allow this." });
    return res.status(502).json({ error: "The request could not be saved. Try again." });
  }
  const request = (await r.json().catch(() => []))[0] || null;

  // Company name for the email subject -- read as the caller, who can see it.
  let companyName = "";
  try {
    const c = await fetch(`${SB_URL}/rest/v1/companies?id=eq.${b.companyId}&select=name,slug&limit=1`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${who.token}` } });
    const row = c.ok ? (await c.json())[0] : null;
    companyName = (row && (row.name || row.slug)) || "";
  } catch { /* the subject just says less */ }

  const email = String(who.user?.email || "");
  const mail = await sendSupportEmail({
    fromName: "MineEx Services",
    replyTo: /.+@.+\..+/.test(email) ? email : undefined,
    subject: `Service request: ${SERVICE_LABEL[service]}${companyName ? ` — ${companyName}` : ""}`,
    text: [
      "A company asked for a bespoke service from the MineEx portal.",
      "",
      `Service: ${SERVICE_LABEL[service]}`,
      `Company: ${companyName || b.companyId}`,
      `From:    ${email || "(no email on the account)"}${who.isAdmin ? " (platform admin)" : ` (${who.role})`}`,
      request ? `Request: ${request.id}` : "",
      "",
      details ? `Details:\n${details}` : "No details given.",
      "",
      "Track and update it in Admin > Service requests. Reply to this email to reach the requester.",
    ].join("\n"),
  }).catch(() => ({ emailed: false }));

  return res.status(201).json({ request, emailed: !!mail.emailed });
}
