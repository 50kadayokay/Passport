// Billing, the client half: what the company's subscription row means, and the
// two Stripe hand-offs (Checkout and the Billing Portal).
//
// The server decides everything that matters -- api/stripe-checkout.js and
// api/stripe-portal.js check the caller's role in THIS company (F2) and pick
// the return URLs (fixed origin), the webhook writes company_subscriptions,
// and my_features() (0033) turns that row into access. This file only reads
// the row honestly and turns each server answer into a sentence a person can
// act on. No Stripe key or Stripe call ever happens in the browser.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders, apiHeaders } from "./auth.js";

/**
 * The company's subscription row, or null when it has none.
 * { ok: false } when the read failed -- a failed read is NOT "no subscription",
 * and the page must not tell a paying customer they have none.
 *
 * select=* rather than a column list: stripe_subscription_id arrives with
 * 0069b, and naming it would turn every read on a database without it into a
 * 400.
 */
export async function loadSubscription(companyId) {
  if (!companyId) return { ok: false };
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/company_subscriptions?company_id=eq.${encodeURIComponent(companyId)}&select=*,plans(label,rank)&limit=1`,
      { headers: h }
    );
    if (!res.ok) return { ok: false, status: res.status };
    const rows = await res.json().catch(() => null);
    if (!Array.isArray(rows)) return { ok: false };
    return { ok: true, sub: rows[0] || null };
  } catch {
    return { ok: false };
  }
}

const DAY = 86400000;

/**
 * What the row means for the person looking at it.
 *   kind: none | active | past_due | cancelled | lapsed
 *   card: paid by card through Stripe (so the Billing Portal applies)
 *   live: the subscription still exists in some form (a second checkout would
 *         start a second subscription)
 *
 * The statuses are the three the webhook and admin_set_billing write (0005:
 * active | past_due | cancelled). "lapsed" is 0033's rule seen from here: an
 * ACTIVE row whose paid-through date has passed grants nothing, so calling it
 * active would contradict the locked portal the person is looking at.
 */
export function billingState(sub, now = Date.now()) {
  if (!sub) return { kind: "none", label: "No subscription", tone: "slate", card: false, live: false };
  const card = !!(sub.stripe_subscription_id || sub.note === "stripe");
  const planLabel = (sub.plans && sub.plans.label) || sub.plan_id || "Plan";
  const ends = sub.renews_at ? new Date(sub.renews_at).getTime() : NaN;
  const base = { planId: sub.plan_id || null, planLabel, card, renewsAt: Number.isFinite(ends) ? sub.renews_at : null };
  const status = String(sub.status || "").toLowerCase();
  if (status === "active") {
    if (Number.isFinite(ends) && ends <= now) return { ...base, kind: "lapsed", label: "Expired", tone: "rose", live: false };
    return { ...base, kind: "active", label: "Active", tone: "accent", live: true,
      soon: Number.isFinite(ends) && ends - now < 14 * DAY };
  }
  if (status === "past_due") return { ...base, kind: "past_due", label: "Payment overdue", tone: "rose", live: true };
  // cancelled, canceled, unpaid, or anything unrecognised: not paying, no access.
  return { ...base, kind: "cancelled", label: "Cancelled", tone: "slate", live: false };
}

// One message per server answer. Shared by both hand-offs.
function refusal(status, j, what, fallback) {
  if (status === 401) return "Your session has expired. Sign out and sign in again, then try again.";
  if (status === 403) return "Only an owner or admin of this company can change billing.";
  if (status === 500 && j && /not configured/i.test(String(j.error || ""))) return "Card payments aren't switched on yet. Contact MineEx and we'll invoice you.";
  if (status === 502) return `Stripe didn't answer, so ${what}. Nothing was charged. Try again in a minute.`;
  return (j && typeof j.error === "string" && j.error) || fallback;
}

async function post(path, body) {
  let headers;
  try { headers = await apiHeaders({ "Content-Type": "application/json" }); }
  catch (e) { return { ok: false, status: 401, message: e.message }; }
  let res;
  try { res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) }); }
  catch { return { ok: false, status: 0 }; }
  const j = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, j };
}

// A redirect target has to be a real https page. Anything else -- an empty
// body, a relative path, javascript: -- is treated as a failure, not followed.
const safeUrl = (u) => typeof u === "string" && /^https:\/\/[^\s]+$/i.test(u);

/** Start Stripe Checkout for a tier. { ok, url } or { ok: false, message }. */
export async function startCheckout({ companyId, tier }) {
  const r = await post("/api/stripe-checkout", { tier, companyId });
  if (r.status === 0) return { ok: false, message: "Couldn't reach the payment service. Check your connection and try again." };
  if (r.ok && r.j && safeUrl(r.j.url)) return { ok: true, url: r.j.url };
  if (r.message) return { ok: false, message: r.message };
  if (r.ok) return { ok: false, message: "Checkout didn't return a payment page. Nothing was charged. Please try again." };
  return { ok: false, message: refusal(r.status, r.j, "checkout didn't start", "Couldn't start checkout. Please try again.") };
}

/** Open the Stripe Billing Portal. 404 means no card subscription (manual billing). */
export async function openBillingPortal({ companyId }) {
  const r = await post("/api/stripe-portal", { companyId });
  if (r.status === 0) return { ok: false, message: "Couldn't reach the billing service. Check your connection and try again." };
  if (r.ok && r.j && safeUrl(r.j.url)) return { ok: true, url: r.j.url };
  if (r.message) return { ok: false, message: r.message };
  if (r.status === 404) return { ok: false, manual: true, message: "There's no card subscription on file. Your plan is invoiced by MineEx, so contact us to change it." };
  if (r.ok) return { ok: false, message: "Billing didn't return a page. Please try again." };
  return { ok: false, message: refusal(r.status, r.j, "billing didn't open", "Couldn't open billing. Please try again.") };
}

/** ?checkout=success|cancelled from Stripe's return URL (api/stripe-checkout.js). */
export function checkoutReturn(search) {
  try {
    const v = new URLSearchParams(search || "").get("checkout");
    return v === "success" || v === "cancelled" ? v : null;
  } catch { return null; }
}
