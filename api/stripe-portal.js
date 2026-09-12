// Stripe Billing Portal — lets a company manage/cancel its own card subscription.
//
// Finds the Stripe customer by the signed-in owner's email (Checkout created it with that
// email), then returns a Billing Portal session URL to redirect to. Card subscribers only; if
// no Stripe customer exists (e.g. a manually/e-transfer-paid company), returns 404 so the UI
// can hide/disable the button.
import { bearer, verifyUser } from "./_service.js";

const STRIPE = "https://api.stripe.com/v1/";
const APP_ORIGIN = "https://passport-xi-five.vercel.app";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "Stripe not configured." });

  const user = await verifyUser(bearer(req));
  if (!user || !user.email) return res.status(401).json({ error: "Sign in required." });

  try {
    // Find their Stripe customer by email.
    const cr = await fetch(`${STRIPE}customers?email=${encodeURIComponent(user.email)}&limit=1`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const cust = (await cr.json().catch(() => null));
    const customerId = cust && cust.data && cust.data[0] && cust.data[0].id;
    if (!customerId) return res.status(404).json({ error: "No card subscription on file." });

    const origin = (req.headers && req.headers.origin) || APP_ORIGIN;
    const pr = await fetch(`${STRIPE}billing_portal/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ customer: customerId, return_url: `${origin}/portal?section=billing` }).toString(),
    });
    const sess = await pr.json().catch(() => null);
    if (!pr.ok || !sess || !sess.url) return res.status(502).json({ error: "Couldn't open billing portal.", detail: sess });
    return res.status(200).json({ url: sess.url });
  } catch (e) { return res.status(500).json({ error: String((e && e.message) || e) }); }
}
