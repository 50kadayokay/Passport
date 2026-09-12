// Stripe Checkout — starts an ANNUAL subscription for a company's plan (Basic / Pro).
//
// The signed-in owner hits this from the portal; it creates a Stripe Checkout Session for the
// tier's annual price (CAD, billed yearly) and returns the hosted-checkout URL to redirect to.
// The company is identified by metadata so the webhook (api/stripe-webhook.js) can provision the
// subscription when payment succeeds. Cards only — the manual (e-transfer/wire) path is handled
// by the admin billing panel, not here.
import { SB_URL, ANON_KEY, bearer, verifyUser } from "./_service.js";

const STRIPE = "https://api.stripe.com/v1/";
const APP_ORIGIN = "https://passport-xi-five.vercel.app";

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
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "Stripe not configured (STRIPE_SECRET_KEY missing)." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON body" }); } }
  const tier = body && body.tier;
  const companyId = body && (body.companyId || body.company_id);
  const priceId = priceForTier(tier);
  if (!priceId) return res.status(400).json({ error: "Unknown or unpriced tier." });
  if (!companyId) return res.status(400).json({ error: "companyId is required." });

  // Who's calling, and do they own this company? (Read AS the caller so RLS enforces ownership.)
  const token = bearer(req);
  const user = await verifyUser(token);
  if (!user) return res.status(401).json({ error: "Sign in required." });
  let company = null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/companies?id=eq.${companyId}&select=id,name,slug&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (r.ok) company = (await r.json().catch(() => []))[0] || null;
  } catch { /* fallthrough */ }
  if (!company) return res.status(403).json({ error: "Not allowed for this company." });

  const origin = (req.headers && req.headers.origin) || APP_ORIGIN;
  const sess = await stripe("checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/portal?checkout=success`,
    cancel_url: `${origin}/portal?checkout=cancelled`,
    ...(user.email ? { customer_email: user.email } : {}),
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
