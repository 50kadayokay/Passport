// Stripe Checkout — starts an ANNUAL subscription for a company's plan (Basic / Pro).
//
// An owner or company admin hits this from the portal; it creates a Stripe Checkout Session for the
// tier's annual price (CAD, billed yearly) and returns the hosted-checkout URL to redirect to.
// The company is identified by metadata so the webhook (api/stripe-webhook.js) can provision the
// subscription when payment succeeds. Cards only — the manual (e-transfer/wire) path is handled
// by the admin billing panel, not here.
import { requireCompanyRole, BILLING_ROLES } from "./_roles.js";
import { appOrigin } from "./_appOrigin.js";

// F2: billing belongs to a company's OWNERS and company ADMINS (and platform
// admins, who run manual billing) -- BILLING_ROLES in _roles.js. It used to
// accept anyone who could READ the company row, and published companies are
// public, so any signed-in account could start a checkout for any company.

const STRIPE = "https://api.stripe.com/v1/";

const priceForTier = (t) => ({ basic: process.env.STRIPE_PRICE_BASIC, pro: process.env.STRIPE_PRICE_PRO }[t] || "");

async function stripe(path, params) {
  const r = await fetch(STRIPE + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => null) };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON body" }); } }
  const companyId = body && (body.companyId || body.company_id);

  // 1) WHO, and their role in THIS company -- server-side, as the caller.
  //    401 not signed in · 400 bad companyId · 403 not an owner/admin of it · 502 role unreadable.
  //    Runs BEFORE any Stripe configuration is read (F10).
  const caller = await requireCompanyRole(req, res, { companyId, roles: BILLING_ROLES });
  if (!caller) return;

  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "Stripe not configured (STRIPE_SECRET_KEY missing)." });
  const tier = body && body.tier;
  const priceId = priceForTier(tier);
  if (!priceId) return res.status(400).json({ error: "Unknown or unpriced tier." });

  // 2) Return URLs from the fixed portal origin -- never the request's Origin/Host.
  const origin = appOrigin();
  const sess = await stripe("checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/portal?checkout=success`,
    cancel_url: `${origin}/portal?checkout=cancelled`,
    ...(caller.user && caller.user.email ? { customer_email: caller.user.email } : {}),
    client_reference_id: companyId,
    allow_promotion_codes: "true",
    "metadata[company_id]": companyId,
    "metadata[tier]": tier,
    "subscription_data[metadata][company_id]": companyId,
    "subscription_data[metadata][tier]": tier,
  });
  if (!sess.ok || !sess.json || !sess.json.url) return res.status(502).json({ error: "Couldn't start checkout.", detail: sess.json });
  return res.status(200).json({ url: sess.json.url });
}
