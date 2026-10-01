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
// `compact` drops the welcome hero and the outer width clamp. Home embeds this
// BELOW the launch tiles now, where a second 26px "Welcome to MineEx" headline
// would compete with the greeting already at the top of the page. The checklist
// itself is unchanged; only the framing differs.
export default function OnboardingPanel({ company, go, goProfile, onPublished, compact = false }) {
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

  // ---- COMPACT: one progress card for Home -------------------------------
  // The full checklist gives every step a card's worth of height, which is right
  // when onboarding IS the page and wrong when it sits under the five primary
  // controls. Same steps, same actions, same real state -- just tight enough to
  // read as secondary.
  if (compact) {
    if (!model) return null;

    // "Preview your investor profile" is a momentary action that is never
    // `done`, so counting it would pin progress below 100% forever.
    const counted = (model.steps || []).filter((x) => x.action !== "preview");
    const doneCount = counted.filter((x) => x.done).length;
    const total = counted.length;

    // Nothing left to do -> the module removes itself rather than sitting there
    // announcing "4 of 4 complete".
    if (total > 0 && doneCount === total) return null;

    const pct = total ? Math.round((doneCount / total) * 100) : 0;

    return (
      <div className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">Finish setting up</h2>
          <span className="text-[12px] font-semibold text-slate-400">{doneCount} of {total} complete</span>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="h-1 w-full bg-slate-100">
            <div className="h-full bg-slate-900 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
          </div>

          <div className="px-5 py-1.5">
            {model.steps.map((st, i) => {
              const isGoLive = st.action === "golive";
              const locked = isGoLive && !model.canGoLive;
              return (
                <div key={st.key} className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t border-slate-100" : ""}`}>
                  <span className={`grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded-full ${st.done ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-300"}`}>
                    {st.done ? <Check size={11} /> : <Circle size={7} />}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-[13.5px] ${st.done ? "text-slate-400" : "font-semibold text-slate-700"}`}>{st.title}</span>
                  <button
                    onClick={() => onStep(st.action)}
                    disabled={locked || (isGoLive && publishing)}
                    className={`inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold transition ${
                      locked ? "cursor-not-allowed text-slate-300"
                             : isGoLive ? "text-blue-600 hover:text-blue-700"
                             : "text-slate-500 hover:text-blue-600"}`}>
                    {isGoLive
                      ? (publishing ? <><Loader2 size={12} className="animate-spin" /> Publishing…</> : <>Go live <ArrowRight size={12} /></>)
                      : (st.done ? <>Review <ArrowRight size={12} /></> : <>Start <ArrowRight size={12} /></>)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {publishErr && <p className="mt-2 text-[12.5px] font-semibold text-rose-500">{publishErr}</p>}

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

  if (!model) return (
    <div className="grid place-items-center py-16 text-slate-400"><Loader2 size={22} className="animate-spin" /></div>
  );

  const logo = (company.logo || "").trim();
  return (
    <div className={compact ? "" : "mx-auto max-w-3xl"}>
      {/* Welcome hero — headline forks on prebuilt vs. needs-building. */}
      {!compact && (
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-7 py-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-slate-100 text-slate-400">
          {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : <Sparkles size={26} />}
        </div>
        <p className="text-[12px] font-bold uppercase tracking-widest text-blue-600">Welcome to MineEx</p>
        <h1 className="mt-2 text-[26px] font-extrabold tracking-tight text-slate-900">{model.headline}</h1>
        <p className="mx-auto mt-2 max-w-xl text-[14.5px] leading-relaxed text-slate-500">{model.subhead}</p>
      </div>
      )}

      {/* Derived checklist — each row deep-links into an existing portal surface. */}
      <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-white ${compact ? "" : "mt-6"}`}>
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
