// Stripe Billing Portal — lets a company manage/cancel its own card subscription.
//
// Only an owner or company admin of the named company (or a platform admin) may open it.
// The Stripe customer is found BY COMPANY -- the company_id that stripe-checkout stamps on
// every subscription -- not by the caller's email. Card subscribers only; if no Stripe
// customer exists for the company (e.g. a manually/e-transfer-paid company), returns 404 so
// the UI can say so.
import { requireCompanyRole, BILLING_ROLES } from "./_roles.js";
import { appOrigin } from "./_appOrigin.js";

const STRIPE = "https://api.stripe.com/v1/";
const stripeGet = async (path) => {
  const r = await fetch(STRIPE + path, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => null) };
};

/**
 * The Stripe customer that pays for THIS company. F2: this used to be "the first
 * customer with the caller's email", which ignores the company entirely. Every
 * subscription stripe-checkout creates carries metadata.company_id, so:
 *   1. Stripe Search on that metadata (the companyId is a validated UUID, so it
 *      cannot break out of the query string);
 *   2. if Search is unavailable, the caller's email -- but ONLY a customer whose
 *      subscription is stamped with this company counts.
 * Returns the customer id or null.
 */
async function customerForCompany(companyId, email) {
  const q = encodeURIComponent(`metadata['company_id']:'${companyId}'`);
  const found = await stripeGet(`subscriptions/search?query=${q}&limit=1`);
  if (found.ok && found.json && Array.isArray(found.json.data)) {
    const sub = found.json.data[0];
    return (sub && sub.customer) || null;
  }
  if (!email) return null;
  const cust = await stripeGet(`customers?email=${encodeURIComponent(email)}&limit=10`);
  for (const c of (cust.json && cust.json.data) || []) {
    const subs = await stripeGet(`subscriptions?customer=${encodeURIComponent(c.id)}&status=all&limit=20`);
    if (((subs.json && subs.json.data) || []).some((x) => x.metadata && x.metadata.company_id === companyId)) return c.id;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON body" }); } }
  const companyId = body && (body.companyId || body.company_id);

  // Owners and company admins of THIS company (and platform admins), checked
  // server-side before any Stripe configuration is read (F2, F10).
  const caller = await requireCompanyRole(req, res, { companyId, roles: BILLING_ROLES });
  if (!caller) return;
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "Stripe not configured." });

  try {
    const customerId = await customerForCompany(companyId, caller.user && caller.user.email);
    if (!customerId) return res.status(404).json({ error: "No card subscription on file." });

    const pr = await fetch(`${STRIPE}billing_portal/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      // Fixed portal origin -- never the request's Origin/Host (F2).
      body: new URLSearchParams({ customer: customerId, return_url: `${appOrigin()}/portal?section=billing` }).toString(),
    });
    const sess = await pr.json().catch(() => null);
    if (!pr.ok || !sess || !sess.url) return res.status(502).json({ error: "Couldn't open billing portal.", detail: sess });
    return res.status(200).json({ url: sess.url });
  } catch (e) { return res.status(500).json({ error: String((e && e.message) || e) }); }
}
