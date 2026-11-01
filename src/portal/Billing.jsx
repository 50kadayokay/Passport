// Billing — Settings → Billing, and the locked-portal screen for owners/admins.
//
// Moved out of Portal.jsx so PortalGate can show it too: a company whose card
// payment failed is locked out of the portal (my_features needs status
// 'active'), and the only place it could fix that was inside the portal it was
// locked out of.
//
// Every state says what is true. A failed read is "couldn't load", never "no
// subscription"; past-due and cancelled are named as such; an active plan
// cannot start a second card subscription by accident.

import React, { useState, useEffect } from "react";
import { CreditCard, AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { fetchFeatures } from "../lib/features.js";
import { can } from "../lib/companyRoles.js";
import { loadSubscription, billingState, startCheckout, openBillingPortal } from "../lib/billing.js";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

export const PLANS = [
  { tier: "basic", name: "Basic", perMo: "$299", perYr: "$3,588", planIds: ["passport"], blurb: "Edit your profile + publish press releases to the MineEx feed." },
  { tier: "pro", name: "Pro", perMo: "$799", perYr: "$9,588", planIds: ["passport_managed"], blurb: "Everything: projects, capital, team, media, external channels, analytics." },
];

export const FEATURE_LABEL = {
  portal_access: "Company Portal access",
  passport_profile: "MineEx investor profile",
  company_memory: "Company memory (documents)",
  communications_center: "Communications Center",
  website_publish: "Website publishing",
  linkedin_publish: "LinkedIn publishing",
  x_publish: "X publishing",
  newsletter_publish: "Investor newsletter",
  push_publish: "Push notifications",
  analytics: "Investor analytics",
  custom_website: "Managed website",
};

function fmtDay(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// The sentence under the plan name. One per state; nothing here is decoration.
export function stateLine(st) {
  const day = st.renewsAt ? fmtDay(st.renewsAt) : "";
  switch (st.kind) {
    case "active":
      return day ? (st.card ? `Renews ${day}.` : `Paid through ${day}.`) : "";
    case "past_due":
      return st.card
        ? "Stripe couldn't take the last payment. Portal access is paused until it goes through — update your card to restore it."
        : "The last invoice is overdue. Portal access is paused until it's paid. Contact MineEx to sort it out.";
    case "cancelled":
      return "This subscription has ended. Choose a plan below to start again.";
    case "lapsed":
      return `${day ? `Paid through ${day}, which has passed` : "The paid-through date has passed"}, so portal access is paused. ${st.card ? "Choose a plan below to renew." : "Contact MineEx to renew."}`;
    default:
      return "";
  }
}

export default function BillingView({ company, canManage, hideHeading = false, notice = null, compact = false, onState = null }) {
  const [sub, setSub] = useState(undefined);   // undefined = loading, { ok, sub }
  const [feats, setFeats] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState("");
  const [payErr, setPayErr] = useState("");

  useEffect(() => {
    let alive = true;
    setSub(undefined);
    loadSubscription(company.id).then((r) => { if (alive) setSub(r); });
    if (!compact) fetchFeatures(company.id).then((f) => { if (alive) setFeats(f); });
    return () => { alive = false; };
  }, [company.id, attempt, compact]);

  // Back from Stripe with a payment: the webhook, not the redirect, updates the
  // row, so re-read a few times rather than showing the old plan as current.
  useEffect(() => {
    if (notice !== "success") return undefined;
    let n = 0;
    const t = setInterval(() => { n += 1; setAttempt((a) => a + 1); if (n >= 5) clearInterval(t); }, 4000);
    return () => clearInterval(t);
  }, [notice]);

  // Billing is for owners and company admins (F2). The server enforces it; this
  // only spares other members buttons that would refuse them. The caller
  // decides (Portal's Settings, PortalGate's locked screen); without one, the
  // role table does.
  const canManageBilling = typeof canManage === "boolean" ? canManage : can(company?.role || "viewer", "manageBilling");
  const loaded = sub && sub.ok;
  const st = loaded ? billingState(sub.sub) : null;
  const kind = st ? st.kind : null;
  useEffect(() => { if (onState) onState(kind); }, [kind, onState]);

  const pay = async (tier) => {
    setPayErr(""); setBusy(tier);
    const r = await startCheckout({ companyId: company.id, tier });
    if (r.ok) { window.location.assign(r.url); return; }
    setPayErr(r.message); setBusy("");
  };
  const manage = async () => {
    setPayErr(""); setBusy("manage");
    const r = await openBillingPortal({ companyId: company.id });
    if (r.ok) { window.location.assign(r.url); return; }
    setPayErr(r.message); setBusy("");
  };

  const tone = st ? st.tone : "slate";
  return (
    <div data-billing-state={st ? st.kind : sub === undefined ? "loading" : "error"}>
      {!hideHeading && (
        <div className="mb-6">
          <h1 className="text-[24px] font-extrabold tracking-tight text-slate-900">Billing</h1>
          <p className="mt-1.5 text-[14.5px] text-slate-500">Your MineEx subscription and what it includes.</p>
        </div>
      )}

      {notice === "success" && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4" data-checkout-notice="success">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-blue-600" />
          <p className="text-[13.5px] text-slate-700">Payment received by Stripe. Your plan updates here as soon as Stripe confirms it, usually within a minute.</p>
        </div>
      )}
      {notice === "cancelled" && (
        <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-[13.5px] text-slate-700" data-checkout-notice="cancelled">
          Checkout was cancelled. Nothing was charged.
        </div>
      )}

      <div className={`p-6 ${CARD}`}>
        {sub === undefined ? (
          <div className="h-6 w-40 animate-pulse rounded bg-slate-100" />
        ) : !loaded ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertCircle size={20} className="shrink-0 text-amber-500" />
              <p className="text-[14.5px] text-slate-600">Couldn't load your subscription. Nothing about your plan has changed.</p>
            </div>
            <button onClick={() => setAttempt((a) => a + 1)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700">
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        ) : st.kind === "none" ? (
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="shrink-0 text-amber-500" />
            <p className="text-[14.5px] text-slate-600">No subscription yet. Choose a plan below to pay by card, or contact MineEx to be invoiced.</p>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">{st.live ? "Current plan" : "Last plan"}</p>
              <p className="mt-1 text-[22px] font-extrabold tracking-tight text-slate-900">{st.planLabel}</p>
              {stateLine(st) && <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-slate-500">{stateLine(st)}</p>}
              <p className="mt-1 text-[12px] text-slate-400">{st.card ? "Paid by card" : "Invoiced by MineEx"}</p>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold ${
              tone === "accent" ? "bg-blue-50 text-blue-600" : tone === "rose" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${tone === "accent" ? "bg-blue-500" : tone === "rose" ? "bg-rose-500" : "bg-slate-400"}`} /> {st.label}
            </span>
          </div>
        )}
      </div>

      {feats && feats.length > 0 && (
        <div className={`mt-5 p-6 ${CARD}`}>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">Included in your plan</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {feats.map((f) => (
              <li key={f} className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-700">
                <CheckCircle2 size={15} className="text-blue-500" /> {FEATURE_LABEL[f] || f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Plans — pay by card (annual). Hidden until the row is known: a plan
          button pressed during a failed read could start a second subscription. */}
      {loaded && (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PLANS.map((p) => {
            const isCurrent = st.live && p.planIds.includes(st.planId);
            // A live subscription (active or past due) is changed, not repurchased:
            // a second checkout would start a second annual subscription.
            const switchLocked = st.live && !isCurrent;
            const disabled = !!busy || isCurrent || switchLocked || !canManageBilling;
            return (
              <div key={p.tier} className={`p-6 ${CARD} ${isCurrent ? "!ring-2 !ring-blue-300" : ""}`}>
                <div className="flex items-baseline justify-between">
                  <p className="text-[17px] font-extrabold tracking-tight text-slate-900">{p.name}</p>
                  {isCurrent && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-600">Current</span>}
                </div>
                <p className="mt-1 text-[22px] font-extrabold tracking-tight text-slate-900">{p.perMo}<span className="text-[13px] font-semibold text-slate-400">/mo</span></p>
                <p className="text-[12px] text-slate-400">{p.perYr} billed annually</p>
                <p className="mt-2 text-[13px] leading-snug text-slate-600">{p.blurb}</p>
                <button onClick={() => pay(p.tier)} disabled={disabled} data-plan-button={p.tier}
                  className={`mt-4 w-full rounded-xl px-4 py-2.5 text-[14px] font-bold transition disabled:cursor-not-allowed ${
                    disabled ? "bg-slate-100 text-slate-400" : "bg-slate-900 text-white hover:bg-slate-800 active:scale-[.99]"}`}>
                  {isCurrent ? "Current plan" : switchLocked ? "Contact us to switch" : busy === p.tier ? "Redirecting…" : "Pay by card"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {payErr && <p className="mt-3 text-[13px] font-semibold text-rose-600" data-pay-error>{payErr}</p>}
      {!canManageBilling && (
        <p className="mt-3 text-[13px] text-slate-500">Only an owner or admin of {company?.name || "this company"} can change billing. Ask one of them to upgrade or manage the subscription.</p>
      )}
      {loaded && st.card && st.kind !== "none" && canManageBilling && (
        <button onClick={manage} disabled={!!busy} data-manage-billing
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[13.5px] font-bold text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-50">
          {busy === "manage" ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
          {busy === "manage" ? "Opening…" : st.kind === "past_due" ? "Update payment method" : "Manage billing"}
        </button>
      )}
      {loaded && st.live && (
        <p className="mt-3 text-[12.5px] text-slate-400">To switch plans, contact MineEx. Starting a second card checkout would bill you twice.</p>
      )}
      <p className="mt-4 text-[13px] text-slate-400">Prefer e-transfer or wire? <a href="mailto:support@mineex.ca?subject=MineEx%20billing" className="font-semibold text-slate-500 hover:text-slate-700">Contact us and we'll invoice you.</a> Managed plans are arranged directly with MineEx.</p>
    </div>
  );
}
