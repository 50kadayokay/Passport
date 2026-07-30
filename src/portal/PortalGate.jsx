import React, { useState, useEffect } from "react";
import { Loader2, ShieldAlert, Building2, LogOut, ArrowRight } from "lucide-react";
import { signOut, getMyRole } from "../lib/auth.js";
import { myPortalCompanies, acceptInvitation, loadPortalCompanyBySlug } from "../lib/portal.js";
import { fetchFeatures, FEATURES } from "../lib/features.js";

// Resolves the Company Portal context for a SIGNED-IN user (AuthGate handles the
// login itself). Three real outcomes:
//   • no company at all        -> access denied (investors land here)
//   • company but no entitlement -> subscription-needed screen
//   • one company              -> enter it
//   • many companies           -> a switcher, then enter the chosen one
//
// This is UX gating. The database independently enforces the same rules via RLS
// (owns_company + portal_access entitlement), so a discoverable /portal URL grants
// nothing on its own. render(company) receives the resolved company (with .role).
const Loader = ({ label = "Loading your portal…" }) => (
  <div className="grid min-h-[100dvh] place-items-center bg-slate-50 text-slate-400">
    <div className="flex flex-col items-center gap-3">
      <Loader2 size={26} className="animate-spin text-emerald-500" />
      <span className="text-[13px] font-medium">{label}</span>
    </div>
  </div>
);

function Denied({ title, body, cta }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-slate-50 px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
          <ShieldAlert size={28} />
        </div>
        <h1 className="text-[22px] font-extrabold text-slate-900">{title}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-slate-500">{body}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          {cta}
          <button onClick={() => signOut()} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[14px] font-bold text-slate-700 hover:border-slate-300">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PortalGate({ render }) {
  const [state, setState] = useState({ phase: "loading" }); // loading | denied | locked | switch | ready | error
  const [companies, setCompanies] = useState([]);

  async function enter(company) {
    setState({ phase: "loading", label: `Opening ${company.name || "your company"}…` });
    // Confirm the entitlement (or platform-admin) before entering. fetchFeatures
    // resolves my_features(cid), which already grants admins everything.
    const [feats, role] = await Promise.all([fetchFeatures(company.id), getMyRole().catch(() => null)]);
    const entitled = role === "admin" || (feats || []).includes(FEATURES.PORTAL_ACCESS);
    if (!entitled) { setState({ phase: "locked", company }); return; }
    setState({ phase: "ready", company });
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);

        // Admin "open this company's dashboard" (?company=<slug>). Only a platform
        // admin can drive another company's portal; the DB still enforces access, so
        // a non-admin who forges the param gets nothing back and falls through.
        const companySlug = params.get("company");
        if (companySlug) {
          const role = await getMyRole().catch(() => null);
          if (role === "admin") {
            const c = await loadPortalCompanyBySlug(companySlug);
            if (!alive) return;
            if (c) { setState({ phase: "ready", company: { ...c, role: "admin" }, adminMode: true }); return; }
            setState({ phase: "error" }); return;
          }
          // non-admin: ignore the param and resolve normally.
        }

        // A handoff link (?invite=<token>) → accept it first, as the signed-in
        // user. The DB enforces that their verified email matches the invite.
        const token = params.get("invite");
        if (token) {
          const r = await acceptInvitation(token);
          // Clear the token from the URL either way so a refresh doesn't re-run it.
          params.delete("invite");
          const qs = params.toString();
          window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
          if (!alive) return;
          if (!r.ok && r.error === "email_mismatch") { setState({ phase: "mismatch" }); return; }
          if (!r.ok && (r.error === "expired" || r.error === "used" || r.error === "invalid")) { setState({ phase: "badinvite", error: r.error }); return; }
          // ok (or a transient failure) → fall through and resolve companies.
        }

        const mine = await myPortalCompanies();
        if (!alive) return;
        setCompanies(mine);
        if (!mine.length) { setState({ phase: "denied" }); return; }
        if (mine.length === 1) { await enter(mine[0]); return; }
        setState({ phase: "switch" });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => { alive = false; };
  }, []);

  if (state.phase === "loading") return <Loader label={state.label} />;

  if (state.phase === "denied") {
    return (
      <Denied
        title="No company portal on this account"
        body="The Company Portal is for junior mining companies on a Passport subscription. If you're an investor, use the Passport app to follow companies. If you represent a company, contact Passport to get set up."
        cta={<a href="/app" className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-5 py-2.5 text-[14px] font-bold text-white">Open the app <ArrowRight size={15} /></a>}
      />
    );
  }

  if (state.phase === "locked") {
    return (
      <Denied
        title="Subscription needed"
        body={`${state.company?.name || "This company"} doesn't have an active Passport subscription, so the portal is locked. Once billing is active the portal opens automatically — nothing else to set up.`}
        cta={null}
      />
    );
  }

  if (state.phase === "mismatch") {
    return (
      <Denied
        title="This invitation is for a different email"
        body="You're signed in with an email that doesn't match this invitation. Sign out and sign in (or create an account) with the exact email the invitation was sent to."
        cta={null}
      />
    );
  }

  if (state.phase === "badinvite") {
    const msg = state.error === "expired" ? "This invitation has expired." : state.error === "used" ? "This invitation has already been used." : "This invitation link isn't valid.";
    return (
      <Denied
        title="Invitation unavailable"
        body={`${msg} Ask Passport to send you a fresh invitation link.`}
        cta={null}
      />
    );
  }

  if (state.phase === "error") {
    return (
      <Denied
        title="Couldn't load your portal"
        body="Something went wrong resolving your company. Refresh to try again, or sign out and back in."
        cta={<button onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-5 py-2.5 text-[14px] font-bold text-white">Retry</button>}
      />
    );
  }

  if (state.phase === "switch") {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-slate-50 px-6">
        <div className="w-full max-w-md">
          <h1 className="text-center text-[22px] font-extrabold text-slate-900">Choose a company</h1>
          <p className="mt-1.5 text-center text-[14px] text-slate-500">You have access to more than one company portal.</p>
          <div className="mt-6 flex flex-col gap-2.5">
            {companies.map((c) => (
              <button
                key={c.id}
                onClick={() => enter(c)}
                className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left transition hover:border-emerald-300 hover:shadow-sm"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500"><Building2 size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-slate-900">{c.name || c.slug}</span>
                  <span className="block text-[12.5px] font-medium capitalize text-slate-400">{c.role || "owner"} · {c.status || "draft"}</span>
                </span>
                <ArrowRight size={17} className="text-slate-300 transition group-hover:text-emerald-500" />
              </button>
            ))}
          </div>
          <div className="mt-6 text-center">
            <button onClick={() => signOut()} className="text-[13px] font-semibold text-slate-400 hover:text-slate-600">Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  // ready
  return render(state.company, {
    switchCompany: companies.length > 1 ? () => setState({ phase: "switch" }) : null,
    adminMode: !!state.adminMode,
  });
}
