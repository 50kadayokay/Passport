import React, { useState, useEffect, useCallback } from "react";
import { Loader2, ShieldAlert, Building2, LogOut, ArrowRight, Lock, RefreshCw } from "lucide-react";
import { signOut } from "../lib/auth.js";
import { acceptInvitation } from "../lib/portal.js";
import { loadMemberships, loadPlatformRole, loadPortalAccess, loadCompanyBySlug } from "../lib/portalGate.js";
import { can } from "../lib/companyRoles.js";
import { checkoutReturn } from "../lib/billing.js";
import BillingView from "./Billing.jsx";

// Resolves the Company Portal context for a SIGNED-IN user (AuthGate handles the
// login itself). The outcomes:
//   • no company at all          -> access denied (investors land here)
//   • company but no entitlement -> subscription-needed screen (owners/admins
//                                   can pay or fix the card from it)
//   • one company                -> enter it
//   • many companies             -> a chooser, then enter the chosen one
//   • the server refused the token -> session expired, sign in again
//   • the lookup failed          -> "couldn't load", never one of the above
//
// The last two are why this reads through lib/portalGate.js: the older helpers
// return [] for every failure, so a timeout or a revoked token used to tell a
// paying member "No company portal on this account".
//
// This is UX gating. The database independently enforces the same rules via RLS
// (owns_company + portal_access entitlement), so a discoverable /portal URL grants
// nothing on its own. render(company) receives the resolved company (with .role).

const failed = (r) => ({ phase: r.reason === "session_expired" || r.reason === "signed_out" ? "expired" : "error" });

/** Enter one company: confirm the entitlement (or platform admin) first. */
export async function enterCompany(company) {
  const [access, platform] = await Promise.all([loadPortalAccess(company.id), loadPlatformRole()]);
  const isAdmin = platform.ok && platform.role === "admin";
  if (isAdmin) return { phase: "ready", company };
  if (!access.ok) return failed(access);
  if (!access.entitled) return { phase: "locked", company };
  return { phase: "ready", company };
}

/**
 * Everything the gate decides before rendering, as data. `search` is
 * window.location.search; `clearInvite` drops the token from the URL.
 * Returns { state, companies }.
 */
export async function resolvePortal({ search = "", clearInvite = () => {} } = {}) {
  const params = new URLSearchParams(search);

  // Admin "open this company's dashboard" (?company=<slug>). Only a platform
  // admin can drive another company's portal; the DB still enforces access, so
  // a non-admin who forges the param gets nothing back and falls through.
  const companySlug = params.get("company");
  if (companySlug) {
    const platform = await loadPlatformRole();
    if (!platform.ok && platform.reason === "session_expired") return { state: { phase: "expired" }, companies: [] };
    if (platform.ok && platform.role === "admin") {
      const c = await loadCompanyBySlug(companySlug);
      if (!c.ok) return { state: failed(c), companies: [] };
      if (!c.company) return { state: { phase: "notfound", slug: companySlug }, companies: [] };
      return { state: { phase: "ready", company: { ...c.company, role: "admin" }, adminMode: true }, companies: [] };
    }
    // non-admin: ignore the param and resolve normally.
  }

  // A handoff link (?invite=<token>) -> accept it first, as the signed-in
  // user. The DB enforces that their verified email matches the invite.
  const token = params.get("invite");
  if (token) {
    const r = await acceptInvitation(token);
    // Clear the token from the URL either way so a refresh doesn't re-run it.
    clearInvite();
    if (!r.ok && r.error === "email_mismatch") return { state: { phase: "mismatch" }, companies: [] };
    if (!r.ok && ["expired", "used", "invalid", "revoked"].includes(r.error)) return { state: { phase: "badinvite", error: r.error }, companies: [] };
    // already_member: nothing changed (0076 never rewrites an existing
    // membership) -- fall through into the portal with the current role.
    // ok (or a transient failure) -> fall through and resolve companies.
  }

  const mine = await loadMemberships();
  if (!mine.ok) return { state: failed(mine), companies: [] };
  const companies = mine.companies;
  if (!companies.length) return { state: { phase: "denied" }, companies };
  if (companies.length === 1) return { state: await enterCompany(companies[0]), companies };
  return { state: { phase: "switch" }, companies };
}

const Loader = ({ label = "Loading your portal…" }) => (
  <div className="grid min-h-[100dvh] place-items-center bg-slate-50 text-slate-400">
    <div className="flex flex-col items-center gap-3">
      <Loader2 size={26} className="animate-spin text-blue-500" />
      <span className="text-[13px] font-medium">{label}</span>
    </div>
  </div>
);

const PRIMARY = "inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-5 py-2.5 text-[14px] font-bold text-white";

function Denied({ title, body, cta, Icon = ShieldAlert, onSignOut }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-slate-50 px-6" data-gate-title={title}>
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
          <Icon size={28} />
        </div>
        <h1 className="text-[22px] font-extrabold text-slate-900">{title}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-slate-500">{body}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {cta}
          {onSignOut && (
            <button onClick={onSignOut} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[14px] font-bold text-slate-700 hover:border-slate-300">
              <LogOut size={15} /> Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Locked. An owner or admin gets the billing panel right here -- a failed card
// payment locks the portal (my_features needs status 'active'), and Billing
// used to live only inside the portal it locked. Everyone else is told who
// can fix it.
function Locked({ company, notice, onRecheck, onSignOut, switchCompany }) {
  const name = company?.name || "This company";
  const canPay = can(company?.role, "manageBilling");
  // What the billing panel found. An ACTIVE row on a locked portal means the
  // plan itself does not include portal access (or MineEx switched it off) --
  // paying again would not help, so say who can.
  const [billing, setBilling] = useState(null);
  return (
    <div className="min-h-[100dvh] bg-slate-50 px-6 py-12" data-gate-title="Subscription needed">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Lock size={26} /></div>
          <h1 className="text-[22px] font-extrabold text-slate-900">Subscription needed</h1>
          <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-relaxed text-slate-500">
            {notice === "success"
              ? `Payment received. The portal opens as soon as Stripe confirms it, usually within a minute.`
              : billing === "active"
                ? `${name} has an active subscription, but portal access isn't switched on for it. Contact MineEx and we'll sort it out.`
                : billing === "past_due"
                  ? `The last payment for ${name} didn't go through, so the portal is paused. It reopens as soon as the payment does.`
                  : canPay
                ? `${name} doesn't have an active MineEx subscription, so the portal is locked. Once billing is active it opens automatically — nothing else to set up.`
                : `${name} doesn't have an active MineEx subscription, so the portal is locked. An owner or admin of ${name} can renew it; the portal opens for everyone once they do.`}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button onClick={onRecheck} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[14px] font-bold text-slate-700 hover:border-slate-300">
              <RefreshCw size={15} /> Check again
            </button>
            {switchCompany && (
              <button onClick={switchCompany} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[14px] font-bold text-slate-700 hover:border-slate-300">
                <Building2 size={15} /> Choose another company
              </button>
            )}
            <button onClick={onSignOut} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[14px] font-bold text-slate-700 hover:border-slate-300">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
        {canPay && (
          <div className="mt-10 text-left" data-gate-billing>
            <BillingView company={company} canManage compact hideHeading notice={notice} onState={setBilling} />
          </div>
        )}
      </div>
    </div>
  );
}

function Chooser({ companies, onEnter, onSignOut }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-slate-50 px-6" data-gate-title="Choose a company">
      <div className="w-full max-w-md">
        <h1 className="text-center text-[22px] font-extrabold text-slate-900">Choose a company</h1>
        <p className="mt-1.5 text-center text-[14px] text-slate-500">You have access to more than one company portal.</p>
        <div className="mt-6 flex flex-col gap-2.5">
          {companies.map((c) => (
            <button
              key={c.id}
              onClick={() => onEnter(c)}
              data-company={c.slug}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left transition hover:border-blue-300 hover:shadow-sm"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Building2 size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-slate-900">{c.name || c.slug || "Unnamed company"}</span>
                <span className="block text-[12.5px] font-medium capitalize text-slate-400">{c.role} · {c.status || "draft"}</span>
              </span>
              <ArrowRight size={17} className="shrink-0 text-slate-300 transition group-hover:text-blue-500" />
            </button>
          ))}
        </div>
        <div className="mt-6 text-center">
          <button onClick={onSignOut} className="text-[13px] font-semibold text-slate-400 hover:text-slate-600">Sign out</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Every non-ready screen, as a pure function of the gate's state -- so each
 * one can be rendered and checked without a browser
 * (scripts/portal-gate-test.mjs).
 */
export function GateScreen({ state, companies = [], notice = null, onEnter, onRetry, onSignOut, onSignInAgain, switchCompany }) {
  if (state.phase === "loading") return <Loader label={state.label} />;

  if (state.phase === "denied") {
    return (
      <Denied onSignOut={onSignOut}
        title="No company portal on this account"
        body="The Company Portal is for junior mining companies on a MineEx subscription. If you're an investor, use the MineEx app to follow companies. If you represent a company, contact MineEx to get set up."
        cta={<a href="/app" className={PRIMARY}>Open the app <ArrowRight size={15} /></a>}
      />
    );
  }

  if (state.phase === "locked") {
    return <Locked company={state.company} notice={notice} onRecheck={() => onEnter(state.company)} onSignOut={onSignOut} switchCompany={switchCompany} />;
  }

  if (state.phase === "expired") {
    return (
      // "Sign in again" already signs out; a second button would do the same.
      <Denied onSignOut={null} Icon={Lock}
        title="Your session has expired"
        body="For your security you've been signed out of the portal. Sign in again to pick up where you left off."
        cta={<button onClick={onSignInAgain} className={PRIMARY}>Sign in again</button>}
      />
    );
  }

  if (state.phase === "notfound") {
    return (
      <Denied onSignOut={onSignOut}
        title="Company not found"
        body={`There's no company with the address "${state.slug}". It may have been renamed or removed.`}
        cta={<a href="/admin" className={PRIMARY}>Back to admin</a>}
      />
    );
  }

  if (state.phase === "mismatch") {
    return (
      <Denied onSignOut={onSignOut}
        title="This invitation is for a different email"
        body="You're signed in with an email that doesn't match this invitation. Sign out and sign in (or create an account) with the exact email the invitation was sent to."
        cta={null}
      />
    );
  }

  if (state.phase === "badinvite") {
    const msg = state.error === "expired" ? "This invitation has expired." : state.error === "used" ? "This invitation has already been used."
      : state.error === "revoked" ? "This invitation was withdrawn." : "This invitation link isn't valid.";
    return (
      <Denied onSignOut={onSignOut}
        title="Invitation unavailable"
        body={`${msg} Ask whoever invited you (or MineEx) for a fresh invitation link.`}
        cta={null}
      />
    );
  }

  if (state.phase === "switch") return <Chooser companies={companies} onEnter={onEnter} onSignOut={onSignOut} />;

  // "error", and anything unrecognised: say so, never guess.
  return (
    <Denied onSignOut={onSignOut}
      title="Couldn't load your portal"
      body="We couldn't reach MineEx to check your company. Nothing on your account has changed. Check your connection and try again."
      cta={<button onClick={onRetry} className={PRIMARY}>Retry</button>}
    />
  );
}

export default function PortalGate({ render }) {
  const [state, setState] = useState({ phase: "loading" }); // loading | denied | locked | switch | ready | expired | notfound | mismatch | badinvite | error
  const [companies, setCompanies] = useState([]);
  const [notice] = useState(() => checkoutReturn(typeof window !== "undefined" ? window.location.search : ""));

  const enter = useCallback(async (company) => {
    setState({ phase: "loading", label: `Opening ${company.name || "your company"}…` });
    // A chooser click is outside resolve()'s try, so it needs its own: a throw
    // here used to leave the "Opening…" loader up forever.
    try { setState(await enterCompany(company)); }
    catch { setState({ phase: "error" }); }
  }, []);

  const resolve = useCallback(async (alive = () => true) => {
    setState({ phase: "loading" });
    try {
      const r = await resolvePortal({
        search: window.location.search,
        clearInvite: () => {
          const params = new URLSearchParams(window.location.search);
          params.delete("invite");
          const qs = params.toString();
          window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
        },
      });
      if (!alive()) return;
      setCompanies(r.companies);
      setState(r.state);
    } catch {
      if (alive()) setState({ phase: "error" });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    resolve(() => alive);
    return () => { alive = false; };
  }, [resolve]);

  const switchCompany = companies.length > 1 ? () => setState({ phase: "switch" }) : null;

  if (state.phase === "ready") {
    return render(state.company, { switchCompany, adminMode: !!state.adminMode });
  }
  return (
    <GateScreen
      state={state} companies={companies} notice={notice}
      onEnter={enter}
      onRetry={() => resolve()}
      onSignOut={() => signOut()}
      // signOut clears the stored session, which sends AuthGate back to its
      // sign-in screen on this same URL.
      onSignInAgain={() => signOut()}
      switchCompany={switchCompany}
    />
  );
}
