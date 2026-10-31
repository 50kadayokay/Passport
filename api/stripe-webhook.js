// Stripe webhook — the source of truth that turns a payment into portal access.
//
// On subscription events we sync the company's row: company_subscriptions (plan + status +
// renews_at) and companies.tier. Access follows payment automatically — a paid/renewed sub is
// 'active'; a cancelled/unpaid one flips status so entitlements (my_features) cut off.
//
// F9 — what is checked, in order:
//   1. SIGNATURE over the RAW BYTES (bodyParser disabled below), Stripe's scheme:
//      HMAC-SHA256(secret, `${t}.${rawBody}`). ANY v1 in the header may match:
//      during a secret roll Stripe signs with the old and the new secret at once.
//   2. TIMESTAMP within WEBHOOK_TOLERANCE_SECONDS of now (Stripe's default, 5
//      minutes). A captured, correctly signed event cannot be replayed later;
//      Stripe's own retries are re-signed with a fresh timestamp.
//   3. SHAPE: an evt_ id, a type, a numeric created, an object.
//   4. COMPANY: the company comes from metadata this app wrote at checkout. A
//      checkout session must name the same company in metadata and
//      client_reference_id, or it is ignored.
//   5. IDEMPOTENCY, ORDERING, BINDING: stripe_apply_event() (migration 0069b)
//      records the event id and applies it in one transaction -- a duplicate,
//      an older event, or an event for a subscription the company is not bound
//      to changes nothing. The FIRST binding of a company by anything but a
//      checkout needs proof: the function answers needs_verification, the
//      handler asks Stripe for the company's CURRENT subscription and calls
//      again; an event for any other subscription then changes nothing. Until
//      0069b is applied the handler falls back to its previous direct writes
//      (no de-duplication), and says so in the log.
//
// Responses: 400 bad signature / stale timestamp / malformed event (Stripe
// retries a 400 only until it gives up; none of these can succeed on retry).
// 200 for everything verified, including duplicates and ignored events, so
// Stripe stops retrying. 500 when a write fails, so Stripe retries it.
import crypto from "crypto";
import { serviceRest, serviceRpc } from "./_service.js";

export const config = { api: { bodyParser: false } };

const STRIPE = "https://api.stripe.com/v1/";
const TIER_PLAN = { free: "passport", basic: "passport", pro: "passport_managed" };
export const WEBHOOK_TOLERANCE_SECONDS = 300;

function readRaw(req) {
  // Bytes, not a string: decoding chunk by chunk can split a multi-byte
  // character and change what the signature is computed over.
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Verify a Stripe-Signature header against the raw body. Returns
 * { ok: true } or { ok: false, reason }. Exported for tests.
 */
export function verifySig(raw, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return { ok: false, reason: "missing" };
  let t = null; const v1 = [];
  for (const item of String(header).split(",")) {
    const i = item.indexOf("=");
    if (i < 1) continue;
    const k = item.slice(0, i).trim(), v = item.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1.push(v);
  }
  if (!t || !/^\d{1,12}$/.test(t) || !v1.length) return { ok: false, reason: "malformed" };
  if (Math.abs(nowSeconds - Number(t)) > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: "timestamp" };
  const body = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), "utf8");
  const expected = crypto.createHmac("sha256", secret).update(`${t}.`, "utf8").update(body).digest();
  // Every v1 is compared (no early exit), each in constant time.
  let match = false;
  for (const sig of v1) {
    if (!/^[0-9a-f]{64}$/i.test(sig)) continue;
    if (crypto.timingSafeEqual(expected, Buffer.from(sig, "hex"))) match = true;
  }
  return match ? { ok: true } : { ok: false, reason: "mismatch" };
}

/** A verified event worth parsing: evt_ id, type, numeric created, object. */
export function validEvent(evt) {
  return !!(evt && typeof evt === "object"
    && typeof evt.id === "string" && /^evt_[A-Za-z0-9_]{1,250}$/.test(evt.id)
    && typeof evt.type === "string" && evt.type.length < 100
    && Number.isInteger(evt.created) && evt.created > 0
    && evt.data && typeof evt.data.object === "object" && evt.data.object !== null);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cid = (v) => (typeof v === "string" && UUID.test(v) ? v : null);
const tierOf = (v) => (v && Object.prototype.hasOwnProperty.call(TIER_PLAN, v) ? v : null);
const portalStatus = (s) => (s === "active" || s === "trialing" ? "active" : s === "past_due" ? "past_due" : "cancelled");

async function stripeGet(path) {
  const r = await fetch(STRIPE + path, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } });
  return r.ok ? r.json().catch(() => null) : null;
}

/**
 * What an event means for billing, independent of how it is stored. Returns
 * { kind, company, subscription, status, stripeStatus, tier, renewsAt } or
 * { kind: "ignore" }. Exported for tests.
 */
export async function interpret(evt) {
  const obj = evt.data.object;
  const t = evt.type;
  if (t === "checkout.session.completed") {
    const company = cid(obj.metadata && obj.metadata.company_id);
    // Both were written by stripe-checkout from the same authorised companyId.
    // If they disagree, the session did not come from this app's checkout.
    if (!company || (obj.client_reference_id && obj.client_reference_id !== company)) return { kind: "ignore", why: "company-mismatch" };
    let renewsAt = null, stripeStatus = "active";
    const subscription = typeof obj.subscription === "string" ? obj.subscription : (obj.subscription && obj.subscription.id) || null;
    if (subscription) {
      const sub = await stripeGet(`subscriptions/${encodeURIComponent(subscription)}`);
      if (sub) { stripeStatus = sub.status || "active"; if (sub.current_period_end) renewsAt = new Date(sub.current_period_end * 1000).toISOString(); }
    }
    return { kind: "bind", company, subscription, status: portalStatus(stripeStatus), stripeStatus, tier: tierOf(obj.metadata && obj.metadata.tier), renewsAt };
  }
  if (t === "customer.subscription.updated" || t === "customer.subscription.created") {
    const company = cid(obj.metadata && obj.metadata.company_id);
    if (!company) return { kind: "ignore", why: "no-company" };
    return { kind: "sync", company, subscription: obj.id || null, status: portalStatus(obj.status), stripeStatus: obj.status || null,
      tier: tierOf(obj.metadata && obj.metadata.tier), renewsAt: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null };
  }
  if (t === "customer.subscription.deleted") {
    const company = cid(obj.metadata && obj.metadata.company_id);
    if (!company) return { kind: "ignore", why: "no-company" };
    return { kind: "delete", company, subscription: obj.id || null, status: "cancelled", stripeStatus: "canceled", tier: tierOf(obj.metadata && obj.metadata.tier), renewsAt: null };
  }
  if (t === "invoice.payment_failed") {
    const company = cid(obj.subscription_details && obj.subscription_details.metadata && obj.subscription_details.metadata.company_id);
    if (!company) return { kind: "ignore", why: "no-company" };
    const subscription = typeof obj.subscription === "string" ? obj.subscription : (obj.subscription && obj.subscription.id) || null;
    return { kind: "payment_failed", company, subscription, status: "past_due", stripeStatus: "past_due", tier: null, renewsAt: null };
  }
  return { kind: "ignore", why: "type" };
}

/**
 * The company's CURRENT Stripe subscription, from Stripe itself: the newest
 * live one (active, trialing, past_due, unpaid), else the newest of any status.
 * "none" when Stripe has none or cannot be asked -- the database then refuses
 * to bind, rather than guess. Exported for tests.
 */
export async function currentSubscriptionFor(companyId) {
  try {
    const q = encodeURIComponent(`metadata['company_id']:'${companyId}'`);
    const r = await fetch(`${STRIPE}subscriptions/search?query=${q}&limit=20`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } });
    if (!r.ok) { console.warn(`[stripe-webhook] subscription search failed (${r.status}); first binding refused`); return "none"; }
    const list = ((await r.json().catch(() => null)) || {}).data || [];
    const mine = list.filter((x) => x && x.id && x.metadata && x.metadata.company_id === companyId);
    const byNewest = (a, b) => (b.created || 0) - (a.created || 0);
    const live = mine.filter((x) => ["active", "trialing", "past_due", "unpaid"].includes(x.status)).sort(byNewest);
    const pick = live[0] || mine.sort(byNewest)[0];
    return pick ? pick.id : "none";
  } catch { return "none"; }
}

// Before 0069b: the previous direct writes, unchanged (no de-duplication).
async function legacyApply(m) {
  const plan = TIER_PLAN[m.tier] || "passport";
  const r = await serviceRest(`company_subscriptions?on_conflict=company_id`, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { company_id: m.company, plan_id: plan, status: m.status, renews_at: m.renewsAt || null, note: "stripe", updated_at: new Date().toISOString() },
  });
  if (!r.ok) throw new Error(`subscription write failed (${r.status})`);
  if (m.status === "active" && m.tier) {
    const c = await serviceRest(`companies?id=eq.${m.company}`, { method: "PATCH", prefer: "return=minimal", body: { tier: m.tier } });
    if (!c.ok) throw new Error(`tier write failed (${c.status})`);
  }
  return "applied-legacy";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const raw = await readRaw(req);
  const sig = verifySig(raw, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  if (!sig.ok) return res.status(400).send(sig.reason === "timestamp" ? "Timestamp outside tolerance" : "Invalid signature");
  let evt; try { evt = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).send("Bad JSON"); }
  if (!validEvent(evt)) return res.status(400).send("Malformed event");

  try {
    const m = await interpret(evt);
    const args = {
      p_event_id: evt.id, p_type: evt.type, p_created: new Date(evt.created * 1000).toISOString(),
      p_company: m.company || null, p_subscription: m.subscription || null, p_kind: m.kind,
      p_status: m.status || null, p_stripe_status: m.stripeStatus || null, p_tier: m.tier || null, p_renews_at: m.renewsAt || null,
    };
    let r = await serviceRpc("stripe_apply_event", args);
    let outcome;
    if (r.ok) {
      outcome = await r.json().catch(() => null);
      if (outcome === "needs_verification") {
        // First binding: prove which subscription is the company's current one.
        r = await serviceRpc("stripe_apply_event", { ...args, p_verified_subscription: await currentSubscriptionFor(m.company) });
        if (!r.ok) throw new Error(`stripe_apply_event failed (${r.status})`);
        outcome = await r.json().catch(() => null);
      }
      if (typeof outcome !== "string" || outcome === "needs_verification") throw new Error("stripe_apply_event returned no outcome");
    } else {
      const body = await r.json().catch(() => ({}));
      // PGRST202: the function does not exist yet (0069b not applied).
      if (r.status === 404 || body.code === "PGRST202") {
        console.warn("[stripe-webhook] stripe_apply_event missing (migration 0069b not applied): processing WITHOUT de-duplication");
        outcome = m.kind === "ignore" ? "ignored" : await legacyApply(m);
      } else {
        throw new Error(`stripe_apply_event failed (${r.status})`);
      }
    }
    return res.status(200).json({ received: true, outcome, duplicate: outcome === "duplicate" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
