import React, { useState, useEffect, useCallback } from "react";
import { Check, Circle, ArrowRight, Rocket, Loader2, Sparkles } from "lucide-react";
import { loadPortalCompany, hasAgreement, goLive } from "../lib/portal.js";
import { fetchFeatures, FEATURES } from "../lib/features.js";
import { deriveOnboarding, AGREEMENT_VERSION } from "./onboarding.js";
import AgreementModal from "./AgreementModal.jsx";

// First-login onboarding surface. Shown by HomeView until the company is live. State is DERIVED
// from real company/profile/entitlement/agreement data (see onboarding.js) — not a persisted
// wizard — so it resumes wherever the data actually is and supports both a prebuilt (concierge)
// profile and the future automated build (profileState 'empty' fork; no fake extraction here).
export default function OnboardingPanel({ company, go, goProfile, onPublished }) {
  const [model, setModel] = useState(null);
  const [showAgreement, setShowAgreement] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishErr, setPublishErr] = useState("");

  const load = useCallback(async () => {
    const [full, feats, agreed] = await Promise.all([
      loadPortalCompany(company.id).catch(() => null),
      fetchFeatures(company.id).catch(() => []),
      hasAgreement(company.id, AGREEMENT_VERSION).catch(() => false),
    ]);
    const profile = (full && full.profile) || {};
    const pp = profile.pp || {};
    const entitled = (feats || []).includes(FEATURES.PORTAL_ACCESS);
    setModel(deriveOnboarding({
      company: { ...company, status: (full && full.status) || company.status },
      profile, pp, entitled, agreementAccepted: agreed,
    }));
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const doGoLive = async () => {
    setPublishing(true); setPublishErr("");
    const r = await goLive(company.id, AGREEMENT_VERSION);
    setPublishing(false);
    if (r && r.ok) { onPublished && onPublished(); }
    else {
      const map = {
        agreement_required: "Please accept the company agreement first.",
        subscription_required: "An active plan is required before going live.",
        profile_incomplete: "Add at least your company name before going live.",
        forbidden: "Only the company owner can publish this profile.",
      };
      setPublishErr(map[r && r.error] || "Couldn't publish. Please try again.");
    }
  };

  const onStep = (action) => {
    if (action === "agreement") setShowAgreement(true);
    else if (action === "billing") go("billing");
    else if (action === "profile") goProfile("overview", 0);
    else if (action === "projects") goProfile("projects", 0);
    else if (action === "preview") {
      if (company.status === "published" && company.slug) window.open(`/app?c=${company.slug}`, "_blank");
      else goProfile("overview", 0);   // draft: the editor's live investor preview
    } else if (action === "golive") doGoLive();
  };

  if (!model) return (
    <div className="grid place-items-center py-16 text-slate-400"><Loader2 size={22} className="animate-spin" /></div>
  );

  const logo = (company.logo || "").trim();
  return (
    <div className="mx-auto max-w-3xl">
      {/* Welcome hero — headline forks on prebuilt vs. needs-building. */}
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-7 py-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-slate-100 text-slate-400">
          {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : <Sparkles size={26} />}
        </div>
        <p className="text-[12px] font-bold uppercase tracking-widest text-blue-600">Welcome to MineEx</p>
        <h1 className="mt-2 text-[26px] font-extrabold tracking-tight text-slate-900">{model.headline}</h1>
        <p className="mx-auto mt-2 max-w-xl text-[14.5px] leading-relaxed text-slate-500">{model.subhead}</p>
      </div>

      {/* Derived checklist — each row deep-links into an existing portal surface. */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {model.steps.map((s, i) => {
          const isGoLive = s.action === "golive";
          const locked = isGoLive && !model.canGoLive;
          return (
            <div key={s.key} className={`flex items-center gap-3 px-5 py-4 ${i > 0 ? "border-t border-slate-100" : ""}`}>
              <span className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full ${s.done ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-300"}`}>
                {s.done ? <Check size={14} /> : <Circle size={9} />}
              </span>
              <span className="min-w-0 flex-1 text-[14px] font-bold text-slate-800">{s.title}</span>
              <button
                onClick={() => onStep(s.action)}
                disabled={locked || (isGoLive && publishing)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-bold ${
                  isGoLive
                    ? (locked ? "cursor-not-allowed bg-slate-100 text-slate-400" : "bg-slate-900 text-white hover:bg-slate-800")
                    : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}>
                {isGoLive
                  ? (publishing ? <><Loader2 size={13} className="animate-spin" /> Publishing…</> : <><Rocket size={13} /> Go live</>)
                  : (s.done ? <>Review <ArrowRight size={13} /></> : <>Start <ArrowRight size={13} /></>)}
              </button>
            </div>
          );
        })}
      </div>

      {publishErr && <p className="mt-3 text-center text-[13px] font-semibold text-rose-500">{publishErr}</p>}
      {model.profileState === "empty" && (
        <p className="mt-4 text-center text-[12.5px] text-slate-400">
          Your profile is still being set up. Add your details above — or MineEx can help build it for you.
        </p>
      )}

      {showAgreement && (
        <AgreementModal
          company={company}
          onClose={() => setShowAgreement(false)}
          onDone={() => { setShowAgreement(false); load(); }}
        />
      )}
    </div>
  );
}
