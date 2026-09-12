// Stripe webhook — the source of truth that turns a payment into portal access.
//
// On subscription events we sync the company's row: company_subscriptions (plan + status +
// renews_at) and companies.tier. Access follows payment automatically — a paid/renewed sub is
// 'active'; a cancelled/unpaid one flips status so entitlements (my_features) cut off. Signature
// is verified against STRIPE_WEBHOOK_SECRET over the RAW body (bodyParser disabled below).
import crypto from "crypto";
import { serviceRest } from "./_service.js";

export const config = { api: { bodyParser: false } };

const STRIPE = "https://api.stripe.com/v1/";
const TIER_PLAN = { free: "passport", basic: "passport", pro: "passport_managed" };

function readRaw(req) {
  return new Promise((resolve, reject) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d)); req.on("error", reject); });
}
function verifySig(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(String(header).split(",").map((kv) => kv.split("=")));
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1)); } catch { return false; }
}
async function stripeGet(path) {
  const r = await fetch(STRIPE + path, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } });
  return r.ok ? r.json().catch(() => null) : null;
}
async function upsertSubscription(companyId, tier, status, renewsAtISO) {
  const plan = TIER_PLAN[tier] || "passport";
  // company_subscriptions: company_id is the PK → merge-upsert.
  await serviceRest(`company_subscriptions?on_conflict=company_id`, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { company_id: companyId, plan_id: plan, status, renews_at: renewsAtISO || null, note: "stripe", updated_at: new Date().toISOString() },
  });
  // Keep the display tier in sync only while the sub is good (don't downgrade the row's tier on
  // a temporary past_due; access is already gated by the subscription status).
  if (status === "active" && tier) {
    await serviceRest(`companies?id=eq.${companyId}`, { method: "PATCH", prefer: "return=minimal", body: { tier } });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const raw = await readRaw(req);
  if (!verifySig(raw, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET)) {
    return res.status(400).send("Invalid signature");
  }
  let evt; try { evt = JSON.parse(raw); } catch { return res.status(400).send("Bad JSON"); }
  const obj = evt.data && evt.data.object;

  try {
    if (evt.type === "checkout.session.completed") {
      const companyId = obj.metadata && obj.metadata.company_id;
      const tier = obj.metadata && obj.metadata.tier;
      let renews = null, status = "active";
      if (obj.subscription) { const sub = await stripeGet(`subscriptions/${obj.subscription}`); if (sub) { status = sub.status === "trialing" ? "active" : (sub.status || "active"); if (sub.current_period_end) renews = new Date(sub.current_period_end * 1000).toISOString(); } }
      if (companyId) await upsertSubscription(companyId, tier, status === "active" || status === "trialing" ? "active" : status, renews);
    } else if (evt.type === "customer.subscription.updated" || evt.type === "customer.subscription.created") {
      const companyId = obj.metadata && obj.metadata.company_id;
      const tier = obj.metadata && obj.metadata.tier;
      const renews = obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null;
      const active = obj.status === "active" || obj.status === "trialing";
      if (companyId) await upsertSubscription(companyId, tier, active ? "active" : (obj.status === "past_due" ? "past_due" : "cancelled"), renews);
    } else if (evt.type === "customer.subscription.deleted") {
      const companyId = obj.metadata && obj.metadata.company_id;
      const tier = obj.metadata && obj.metadata.tier;
      if (companyId) await upsertSubscription(companyId, tier, "cancelled", null);
    } else if (evt.type === "invoice.payment_failed") {
      const companyId = obj.subscription_details && obj.subscription_details.metadata && obj.subscription_details.metadata.company_id;
      if (companyId) await upsertSubscription(companyId, null, "past_due", null);
    }
  } catch (e) { return res.status(500).json({ error: String(e && e.message || e) }); }

  return res.status(200).json({ received: true });
}
