import React, { useState, useEffect, useMemo } from "react";
import { Circle, Layers, Crown, ChevronLeft, Loader2, Search, Pencil, ExternalLink, AlertTriangle, Lock, Send } from "lucide-react";
import { SUPABASE_URL } from "../lib/supabase.js";
import { saveProfileSafely, isProtectedSlug } from "../lib/profileSafety.js";
import { authHeaders } from "../lib/auth.js";
import { flushProfileAssets } from "../lib/storage.js";
import { mapProfileToPP } from "../lib/profileToPP.js";
import { isListingProfile } from "../lib/listingProfile.js";
import ProfileEditor from "./ProfileEditor.jsx";
import PublishPanel from "./PublishPanel.jsx";

// ============================================================================
// ACCOUNT MANAGEMENT — every company sorted into the three commercial tiers.
//
//   Free   — not paying. Auto-generated directory listings and any full profile
//            with no active subscription.
//   Basic  — paid.
//   Pro    — paid.
//
// The tier is DERIVED, not stored twice, so nothing can drift:
//   1. profile.accountTier — an explicit override, when one has been set. This is
//      the hook the next phase ("edit profile types") writes to.
//   2. an active row in company_subscriptions — plan rank >= PRO_RANK is Pro,
//      anything else that is active is Basic.
//   3. a community listing (pp.TIER === "listing") — the auto-generated directory
//      pages nobody pays for — is Free.
//   4. anything left is a hand-built managed profile, which today only exists for
//      paying customers, so it reads Pro until an explicit tier or a subscription
//      row says otherwise.
// If the subscriptions read fails (RLS, table not migrated on this env) we still
// render — everything simply falls through to Free rather than lying about who
// is paying. The banner says so instead of hiding it.
// ============================================================================

const PRO_RANK = 20;   // plans.rank at or above this is Pro; below it is Basic.

export const TIERS = [
  { id: "free",  label: "Free",  Icon: Circle, paid: false, blurb: "Not paying — listings and unclaimed profiles",
    ring: "border-slate-200",  wash: "bg-slate-100 text-slate-500" },
  { id: "basic", label: "Basic", Icon: Layers, paid: true,  blurb: "Paid — the managed Passport profile",
    ring: "border-sky-200",    wash: "bg-sky-50 text-sky-600" },
  { id: "pro",   label: "Pro",   Icon: Crown,  paid: true,  blurb: "Paid — the full managed presence",
    ring: "border-amber-200",  wash: "bg-amber-50 text-amber-600" },
];
const tierMeta = (id) => TIERS.find((t) => t.id === id) || TIERS[0];

// Resolve one company to "free" | "basic" | "pro". `subs` is a map keyed by company id.
export function accountTierOf(company, subs = {}) {
  const explicit = String(company?.profile?.accountTier || "").toLowerCase();
  if (explicit === "free" || explicit === "basic" || explicit === "pro") return explicit;
  const sub = company?.id ? subs[company.id] : null;
  if (sub && String(sub.status || "").toLowerCase() === "active") {
    return Number(sub.rank || 0) >= PRO_RANK ? "pro" : "basic";
  }
  if (isListingProfile(company?.profile)) return "free";
  return "pro";
}

// Every active subscription, keyed by company id, as { plan_id, status, rank, label }.
async function fetchSubscriptions() {
  const h = await authHeaders();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/company_subscriptions?select=company_id,plan_id,status,renews_at,plans(label,rank)`,
    { headers: h }
  );
  if (!res.ok) throw new Error(`subscriptions ${res.status}`);
  const rows = await res.json();
  const map = {};
  for (const r of rows || []) {
    map[r.company_id] = {
      plan_id: r.plan_id, status: r.status, renews_at: r.renews_at,
      label: r.plans?.label || r.plan_id, rank: r.plans?.rank ?? 0,
    };
  }
  return map;
}

// Slugs the app renders from a profile BUILT INTO the bundle rather than from the
// database row. Today that is only Kingsmen: its published row deliberately carries
// no `pp`, and main.jsx leaves window.__PP__ unset so PassportProto's built-in
// prototype renders. The row still counts as fully populated on the app.
const BUILT_IN_PROFILE_SLUGS = ["kingsmen-resources"];

// ⭐ — does the app show a complete profile for this company RIGHT NOW?
// Two hard requirements, both checkable from the row:
//   • published — anon RLS ("public_read_published") means a draft simply cannot be
//     served, so every conference/test clone is excluded no matter how full it looks.
//   • it has a real profile to render — its own compiled `pp`, or a built-in one.
// Community listings are deliberately unstarred: they render, but as the stub
// directory page, not a populated profile.
export function isLiveOnApp(company) {
  if (String(company?.status || "").toLowerCase() !== "published") return false;
  if (isListingProfile(company?.profile)) return false;
  if (BUILT_IN_PROFILE_SLUGS.includes(String(company?.slug || ""))) return true;
  const pp = company?.profile?.pp;
  return !!pp && Object.keys(pp).length > 0;
}

// The company's avatar for an admin list. Every candidate is string-guarded: a
// profile may carry `company.brand` as a nested OBJECT ({logo, hero, avatar}),
// and the old version returned that object straight into <img src>, rendering a
// broken image (Kingsmen did exactly this). pp wins when present — it is what the
// app actually paints — then the structured brand, then the nested brand object.
const asUrl = (v) => (typeof v === "string" && v.trim() ? v.trim() : "");
const logoOf = (c) => {
  const p = c.profile || {};
  const pp = p.pp || {};
  const brand = (p.brand && typeof p.brand === "object" && p.brand) || {};
  const co = p.company || {};
  const coBrand = (co.brand && typeof co.brand === "object" && co.brand) || {};
  return asUrl(pp.AVATAR) || asUrl(pp.LOGO)
      || asUrl(co.logo) || asUrl(brand.avatar) || asUrl(brand.logo)
      || asUrl(coBrand.avatar) || asUrl(coBrand.logo) || "";
};
const initialsOf = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
const statusOf = (c) => (c.status || "draft").toLowerCase();

/* ------------------------------ tier picker ------------------------------ */

function TierCard({ tier, count, onOpen }) {
  const { Icon } = tier;
  return (
    <button onClick={onOpen}
      className={`group flex flex-col items-center rounded-3xl border-2 bg-white px-6 py-8 text-center transition hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-30px_rgba(15,23,42,0.45)] ${tier.ring}`}>
      <div className={`grid h-20 w-20 place-items-center rounded-2xl ${tier.wash}`}>
        <Icon size={34} strokeWidth={1.8} />
      </div>
      <p className="mt-4 text-[19px] font-extrabold tracking-tight text-slate-900">{tier.label}</p>
      <span className={`mt-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${tier.paid ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
        {tier.paid ? "Paid" : "Not paid"}
      </span>
      <p className="mt-3 text-[12.5px] leading-snug text-slate-400">{tier.blurb}</p>
      <p className="mt-4 text-[13px] font-bold text-slate-500">
        {count} {count === 1 ? "company" : "companies"}
      </p>
    </button>
  );
}

/* ------------------------------ company list ----------------------------- */

function CompanyRow({ c, sub, tier, onEdit, onPublish }) {
  const logo = logoOf(c);
  const status = statusOf(c);
  // Only paying accounts publish — a Free row is an unclaimed community listing.
  const canPublish = tier === "basic" || tier === "pro";
  return (
    <div onClick={() => onEdit(c)}
      className="flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:shadow-md">
      <div className="grid h-12 w-12 flex-shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-[14px] font-extrabold text-slate-400">
        {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : initialsOf(c.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[14.5px] font-bold tracking-tight text-slate-900">{c.name || c.slug}</p>
          {isLiveOnApp(c) && (
            <span className="flex-shrink-0 text-[13px] leading-none" title="Fully populated on the app — this is the version the app renders">⭐️</span>
          )}
        </div>
        <p className="truncate text-[12px] font-medium text-slate-400">
          {c.primary_ticker || c.slug}
          {sub ? ` · ${sub.label}` : ""}
          {isListingProfile(c.profile) ? " · community listing" : ""}
        </p>
      </div>
      {isProtectedSlug(c.slug) && (
        <span title="Protected flagship row — edits must be made on a draft clone" className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-500">
          <Lock size={11} /> protected
        </span>
      )}
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
        status === "published" ? "bg-emerald-50 text-emerald-600"
        : status === "ready" ? "bg-sky-50 text-sky-600"
        : status === "archived" ? "bg-slate-100 text-slate-400"
        : "bg-amber-50 text-amber-600"}`}>{status}</span>
      {canPublish && (
        <button onClick={(e) => { e.stopPropagation(); onPublish(c); }}
          title={tier === "pro" ? "Publish a press release or a media post" : "Publish a press release"}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] font-bold text-white hover:bg-slate-700">
          <Send size={13} /> Publish
        </button>
      )}
      <button onClick={(e) => { e.stopPropagation(); onEdit(c); }}
        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 hover:border-slate-400">
        <Pencil size={13} /> Edit
      </button>
      <a href={`/app?c=${encodeURIComponent(c.slug)}`} target="_blank" rel="noreferrer"
        onClick={(e) => e.stopPropagation()} title="Open the public profile"
        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-slate-300 hover:text-slate-700">
        <ExternalLink size={15} />
      </a>
    </div>
  );
}

/* --------------------------------- main ---------------------------------- */

export default function AccountManagement({ companies = [], loading = false, reload }) {
  const [subs, setSubs] = useState({});
  const [subsError, setSubsError] = useState("");
  const [subsLoading, setSubsLoading] = useState(true);
  const [tier, setTier] = useState(null);        // null = the three-icon picker
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);   // the company whose profile is open
  const [publishing, setPublishing] = useState(null); // the company being published to

  useEffect(() => {
    let alive = true;
    setSubsLoading(true);
    fetchSubscriptions()
      .then((m) => { if (alive) { setSubs(m); setSubsError(""); } })
      .catch(() => { if (alive) setSubsError("Couldn't read subscriptions — every company is shown as Free until that read works."); })
      .finally(() => { if (alive) setSubsLoading(false); });
    return () => { alive = false; };
  }, []);

  // One pass over the companies: bucket them, keeping the incoming order.
  const buckets = useMemo(() => {
    const b = { free: [], basic: [], pro: [] };
    for (const c of companies) b[accountTierOf(c, subs)].push(c);
    return b;
  }, [companies, subs]);

  const list = tier ? buckets[tier] : [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) => `${c.name || ""} ${c.slug || ""} ${c.primary_ticker || ""}`.toLowerCase().includes(needle));
  }, [list, q]);

  const liveCount = useMemo(() => list.filter(isLiveOnApp).length, [list]);
  const busy = loading || subsLoading;

  return (
    <div className="mx-auto max-w-5xl">
      {/* ---------- header ---------- */}
      {tier ? (
        <button onClick={() => { setTier(null); setQ(""); }}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500 hover:text-slate-900">
          <ChevronLeft size={16} /> All tiers
        </button>
      ) : null}

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">
            {tier ? `${tierMeta(tier).label} accounts` : "Account Management"}
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            {tier
              ? `${filtered.length} of ${list.length} ${tierMeta(tier).paid ? "paying" : "non-paying"} ${list.length === 1 ? "company" : "companies"}. Click one to edit its profile.`
              : "Every company sorted by what they pay for. Pick a tier to see who is in it."}
          </p>
          {tier && liveCount > 0 && (
            <p className="mt-1 text-[12.5px] text-slate-400">
              <span className="text-[13px]">⭐️</span> {liveCount} fully populated on the app — the rest are drafts or clones the app can&apos;t serve.
            </p>
          )}
        </div>
        {tier && (
          <div className="flex items-center gap-2.5 rounded-lg bg-slate-100 px-3.5 py-2 text-slate-400">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or ticker…"
              className="w-52 bg-transparent text-[13px] text-slate-700 placeholder:text-slate-400 outline-none" />
          </div>
        )}
      </div>

      {subsError && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /> {subsError}
        </div>
      )}

      {/* ---------- the three tiers ---------- */}
      {!tier && (
        busy ? (
          <p className="mt-8 flex items-center gap-2 text-[13px] text-slate-400"><Loader2 size={15} className="animate-spin" /> Loading accounts…</p>
        ) : (
          <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {TIERS.map((t) => <TierCard key={t.id} tier={t} count={buckets[t.id].length} onOpen={() => setTier(t.id)} />)}
          </div>
        )
      )}

      {/* ---------- one tier's companies ---------- */}
      {tier && (
        busy ? (
          <p className="mt-8 flex items-center gap-2 text-[13px] text-slate-400"><Loader2 size={15} className="animate-spin" /> Loading accounts…</p>
        ) : filtered.length === 0 ? (
          <div className="mt-7 rounded-2xl border border-dashed border-slate-200 px-6 py-14 text-center text-[13.5px] text-slate-400">
            {list.length === 0 ? `No companies are on ${tierMeta(tier).label} yet.` : "No company matches that filter."}
          </div>
        ) : (
          <div className="mt-7 flex flex-col gap-2.5 pb-10">
            {filtered.map((c) => <CompanyRow key={c.slug} c={c} sub={subs[c.id]} tier={tier} onEdit={setEditing} onPublish={setPublishing} />)}
          </div>
        )
      )}

      {/* ---------- publish ---------- */}
      {publishing && (
        <PublishPanel company={publishing} tier={accountTierOf(publishing, subs)}
          onClose={() => setPublishing(null)}
          onPublished={async () => { if (reload) await reload(); }} />
      )}

      {/* ---------- profile editor ---------- */}
      {editing && (
        <ProfileEditor
          profile={editing.profile || {}}
          companyName={editing.name}
          slug={editing.slug}
          previewToken={editing.preview_token}
          onClose={() => setEditing(null)}
          onSave={async (nextProfile) => {
            // Base64 images in the jsonb blow the statement timeout — push them to
            // Storage first, exactly as the Companies editor does.
            const flushed = await flushProfileAssets(nextProfile);
            flushed.pp = mapProfileToPP(flushed);
            // saveProfileSafely snapshots the live profile before overwriting it, so a
            // bad edit on any of the ~900 listings is one click from being restored.
            await saveProfileSafely(editing, flushed, { note: "Account Management edit" });
            if (reload) await reload();
          }}
        />
      )}
    </div>
  );
}
