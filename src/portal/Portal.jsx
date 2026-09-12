import React, { useState, useEffect, useMemo, Suspense } from "react";
import QRCode from "qrcode";
import {
  Home as HomeIcon, Radio, Building2, Image as ImageIcon, Calendar, BarChart3,
  ScrollText, CreditCard, Settings as SettingsIcon, ExternalLink, LogOut,
  ChevronDown, ChevronRight, CheckCircle2, AlertCircle, ArrowRight, Sparkles, Loader2,
  Plus, Trash2, Clock, TrendingUp, FileText, Radio as RadioIcon, Check, ArrowLeft,
  Megaphone, QrCode, HelpCircle, Copy, Download, Eye,
} from "lucide-react";
import { getUser, signOut, authHeaders, updatePassword, updateEmail } from "../lib/auth.js";
import {
  portalReadiness, listActivity, loadPortalCompany, updateCompanyProfile,
  companyStats, logActivity, fetchRecentContent,
} from "../lib/portal.js";
import { fetchPlan, fetchFeatures } from "../lib/features.js";
import { computeHealth } from "./health.js";
import { visibleProfileSections } from "./profileNav.js";
import OnboardingPanel from "./OnboardingPanel.jsx";

// Heavy, already-built surfaces are reused wholesale (never duplicated) and lazily
// loaded so the portal shell stays lean:
const CommsCenter = React.lazy(() => import("../console/CommsCenter.jsx"));  // Broadcast engine
const Documents   = React.lazy(() => import("./Documents.jsx"));             // Organized Media Library
const Onboarding  = React.lazy(() => import("../Onboarding.jsx"));           // Profile builder (create/onboard)
const ProfileEditor = React.lazy(() => import("./ProfileEditor.jsx"));       // pp-direct editor (edit existing, 1:1 with app)
const MediaComposer = React.lazy(() => import("./MediaComposer.jsx"));       // publish a photo/video to the media feed

// The Company Portal shell. ONE app; the resolved company arrives from PortalGate.
// Every navigation item is a real page: Home, Broadcast, Company Profile, Media,
// Calendar, Analytics, Activity, Billing, Settings. Broadcast/Profile/Media reuse
// the existing console components verbatim so there is a single source of truth.

// Primary navigation. Analytics/Broadcast/Calendar/Activity are intentionally NOT listed here —
// their components and routes still exist (Broadcast's engine IS Press Releases; Analytics is
// hidden for V1 while engagement numbers are still small — tracking continues privately in the
// investor app, and Analytics is switched back on later). They're just hidden from the sidebar.
const NAV_GROUPS = [
  { title: "Workspace", items: [
    { id: "home",      label: "Home",            Icon: HomeIcon },
    { id: "profile",   label: "Company Profile", Icon: Building2 },
    { id: "press",     label: "Press Releases",  Icon: Megaphone },
    { id: "media",     label: "Media",           Icon: ImageIcon },
    { id: "share",     label: "QR & Share",      Icon: QrCode },
  ] },
  { title: "Account", items: [
    { id: "billing",   label: "Billing",         Icon: CreditCard },
    { id: "settings",  label: "Settings",        Icon: SettingsIcon },
  ] },
];
const NAV = NAV_GROUPS.flatMap((g) => g.items);

// Shared surface: white card on the soft canvas, hairline ring + a whisper of depth.
const CARD = "rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,.04),0_4px_16px_-8px_rgba(15,23,42,.08)]";

const SectionLoader = () => (
  <div className="grid min-h-[60vh] place-items-center text-slate-300"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
);

export default function Portal({ company: initial, switchCompany, adminMode = false }) {
  const [section, setSection] = useState("home");
  const [company, setCompany] = useState(initial);
  // Company Profile editor navigation, lifted here so the sidebar's expandable "Company Profile"
  // menu and the editor share one state (the editor is rendered controlled).
  const [profTab, setProfTab] = useState("overview");
  const [profStep, setProfStep] = useState(0);
  const goProfile = (tab, stepIndex) => { setSection("profile"); setProfTab(tab); setProfStep(stepIndex); };

  // Hydrate the full record (with profile JSON) once; PortalGate only passed the lean row.
  useEffect(() => {
    let alive = true;
    loadPortalCompany(initial.id).then((full) => { if (alive && full) setCompany((c) => ({ ...c, ...full })); });
    return () => { alive = false; };
  }, [initial.id]);

  // Press Releases (CommsCenter) and Profile fill their own full-height scroll area; the other
  // pages (Media included) sit inside the padded content column.
  const bare = section === "press" || section === "broadcast" || section === "profile";

  const active = NAV.find((n) => n.id === section);

  return (
    <div className="flex min-h-[100dvh] bg-[#eef1f0] text-slate-900">
      <Sidebar section={section} setSection={setSection} company={company} switchCompany={switchCompany}
        profileNav={{ tab: profTab, step: profStep, go: goProfile }} />
      <main className="flex h-[100dvh] flex-1 flex-col overflow-hidden">
        {adminMode && (
          <div className="flex shrink-0 items-center justify-between gap-3 bg-indigo-600 px-6 py-2 text-white">
            <p className="text-[13px] font-bold">Admin editing: {company?.name || company?.slug} — changes are attributed to you.</p>
            <a href="/admin" className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1 text-[12.5px] font-bold hover:bg-white/25">
              <ArrowLeft size={13} /> Exit to admin
            </a>
          </div>
        )}
        {bare ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Suspense fallback={<SectionLoader />}>
              {(section === "press" || section === "broadcast") && <CommsCenter company={company} />}
              {section === "profile"   && <Suspense fallback={<SectionLoader />}><ProfileEditor company={company} navTab={profTab} navStep={profStep} onNav={(t, s) => { setProfTab(t); setProfStep(s); }} /></Suspense>}
            </Suspense>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-8 py-10">
              {section === "home"      && <HomeView company={company} go={setSection} goProfile={goProfile} onPublished={() => setCompany((c) => ({ ...c, status: "published" }))} />}
              {section === "media"     && <Suspense fallback={<SectionLoader />}><MediaComposer company={company} /><Documents company={company} /></Suspense>}
              {section === "share"     && <QRShareView company={company} />}
              {section === "calendar"  && <CalendarView company={company} setCompany={setCompany} />}
              {section === "analytics" && <AnalyticsView company={company} go={setSection} />}
              {section === "activity"  && <ActivityView company={company} />}
              {section === "billing"   && <BillingView company={company} />}
              {section === "settings"  && <SettingsView company={company} />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------- Sidebar */

function Sidebar({ section, setSection, company, switchCompany, collapsed = false, profileNav = null }) {
  const initials = (company?.name || company?.slug || "Co")
    .split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "Co";
  const bg = { backgroundImage: "linear-gradient(178deg,#0d1a15 0%,#0a1210 60%,#090f0d 100%)" };

  // Collapsed icon rail — used inside the Company Profile editor so its section navigator is the
  // single text menu (no competing double-sidebar). Same items, icon-only with tooltips.
  if (collapsed) {
    return (
      <aside className="sticky top-0 flex h-[100dvh] w-[60px] shrink-0 flex-col items-center bg-[#0b1512] text-slate-300" style={bg}>
        <span className="mt-6 grid h-7 w-7 place-items-center rounded-md bg-blue-500/15 text-blue-400 ring-1 ring-blue-400/25">
          <span className="h-2 w-2 rounded-[3px] bg-blue-400" />
        </span>
        <button onClick={switchCompany || undefined} disabled={!switchCompany} title={company?.name || company?.slug || "Company"}
          className="mt-5 grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 text-[12px] font-extrabold text-white shadow-sm">{initials}</button>
        <nav className="mt-4 flex flex-1 flex-col items-center gap-1 overflow-y-auto py-2">
          {NAV.map(({ id, label, Icon }) => {
            const on = section === id;
            return (
              <button key={id} onClick={() => setSection(id)} title={label} aria-label={label}
                className={`relative grid h-10 w-10 place-items-center rounded-lg transition ${on ? "bg-white/[0.08] text-blue-400" : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"}`}>
                {on && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-blue-400" />}
                <Icon size={18} />
              </button>
            );
          })}
        </nav>
        <div className="flex w-full flex-col items-center gap-1 border-t border-white/[0.07] py-3">
          <a href="mailto:support@mineex.ca?subject=MineEx%20Portal%20—%20help" title="Help & support"
             className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200"><HelpCircle size={16} /></a>
          <button onClick={() => signOut()} title="Sign out"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.05] hover:text-white"><LogOut size={16} /></button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sticky top-0 flex h-[100dvh] w-[248px] shrink-0 flex-col bg-[#0b1512] text-slate-300"
           style={bg}>
      {/* Wordmark */}
      <div className="flex items-center gap-2 px-6 pt-6">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-blue-500/15 text-blue-400 ring-1 ring-blue-400/25">
          <span className="h-2 w-2 rounded-[3px] bg-blue-400" />
        </span>
        <span className="text-[15px] font-bold tracking-tight text-white">Passport</span>
        <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 ring-1 ring-white/10">Portal</span>
      </div>

      {/* Company switcher */}
      <div className="px-4 pt-5">
        <button
          onClick={switchCompany || undefined}
          disabled={!switchCompany}
          className={`flex w-full items-center gap-2.5 rounded-xl bg-white/[0.05] px-3 py-2.5 text-left ring-1 ring-white/10 transition ${switchCompany ? "hover:bg-white/[0.08] hover:ring-white/20" : "cursor-default"}`}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 text-[13px] font-extrabold text-white shadow-sm">{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-bold text-white">{company?.name || company?.slug || "Company"}</span>
            <span className="block text-[11px] font-medium capitalize text-slate-400">{company?.role || "owner"}</span>
          </span>
          {switchCompany && <ChevronDown size={15} className="text-slate-500" />}
        </button>
      </div>

      {/* Grouped nav */}
      <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mt-4 first:mt-2">
            <p className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">{group.title}</p>
            <div className="space-y-0.5">
              {group.items.map(({ id, label, Icon }) => {
                const isProfile = id === "profile";
                const on = section === id;
                const expanded = isProfile && section === "profile" && profileNav;
                // The Company Profile parent shows an OPEN state when expanded (brighter text +
                // chevron) but never the strong active pill — that's reserved for the one
                // selected sub-page, so only a single item reads as active.
                const parentStrong = on && !isProfile;
                return (
                  <div key={id}>
                    <button
                      onClick={() => setSection(id)}
                      className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition ${
                        parentStrong ? "bg-white/[0.08] text-white"
                        : expanded ? "text-white"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                      }`}
                    >
                      {parentStrong && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-white/70" />}
                      <Icon size={16.5} className={parentStrong ? "text-white" : expanded ? "text-slate-200" : "text-slate-500 group-hover:text-slate-300"} />
                      <span className="flex-1 text-left">{label}</span>
                      {isProfile && (expanded
                        ? <ChevronDown size={15} className="text-slate-400" />
                        : <ChevronRight size={15} className="text-slate-500 group-hover:text-slate-400" />)}
                    </button>

                    {expanded && (
                      // 3-level hierarchy carried by TYPOGRAPHY, not tiny labels: parent (icon)
                      // → major area (semibold, brighter, clickable) → sub-pages (quieter,
                      // indented). Selected sub-page gets a subtle neutral background only.
                      <div className="mb-1.5 mt-1 space-y-2">
                        {visibleProfileSections(company?.tier).map((sec) => {
                          const secActive = profileNav.tab === sec.key;
                          return (
                            <div key={sec.key}>
                              <button onClick={() => profileNav.go(sec.key, 0)}
                                className={`flex w-full items-center rounded-md py-1.5 pl-7 pr-3 text-left text-[13.5px] font-semibold transition ${
                                  secActive ? "text-white" : "text-slate-300 hover:text-white"
                                }`}>
                                {sec.label}
                              </button>
                              <div className="mt-0.5 space-y-px pl-10 pr-1.5">
                                {sec.steps.map((s, i) => {
                                  const stepOn = secActive && profileNav.step === i;
                                  return (
                                    <button key={s.key} onClick={() => profileNav.go(sec.key, i)}
                                      className={`flex w-full items-center rounded-md py-1.5 pl-3 pr-2.5 text-left text-[12.5px] transition ${
                                        stepOn ? "bg-white/[0.07] font-medium text-white" : "font-normal text-slate-400 hover:bg-white/[0.035] hover:text-slate-200"
                                      }`}>
                                      <span className="min-w-0 flex-1 truncate">{s.title}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.07] px-4 py-4">
        {company?.slug && company?.status === "published" && (
          <a href={`/app?c=${encodeURIComponent(company.slug)}`} target="_blank" rel="noreferrer"
             className="mb-2 flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 py-2 text-[12.5px] font-bold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/[0.08]">
            <ExternalLink size={13} /> View live profile
          </a>
        )}
        <a href="mailto:support@mineex.ca?subject=MineEx%20Portal%20—%20help"
           className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200">
          <HelpCircle size={14} /> Help &amp; support
        </a>
        <div className="min-w-0 truncate px-1 pb-2 text-[11.5px] text-slate-500">{getUser()?.email}</div>
        <button onClick={() => signOut()} title="Sign out"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold text-slate-400 ring-1 ring-white/10 transition hover:bg-white/[0.05] hover:text-white">
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
}

function PageTitle({ title, sub }) {
  return (
    <div className="mb-6">
      <h1 className="text-[24px] font-extrabold tracking-tight text-slate-900">{title}</h1>
      {sub && <p className="mt-1.5 text-[14.5px] text-slate-500">{sub}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- Home */

function HomeView({ company, go, goProfile, onPublished }) {
  const [ready, setReady] = useState(null);
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState(null);

  useEffect(() => {
    let alive = true;
    portalReadiness(company.id).then((r) => { if (alive) setReady(r); });
    companyStats(company.id).then((s) => { if (alive) setStats(s); });
    fetchRecentContent(company.id, 5).then((r) => { if (alive) setRecent(r); });
    return () => { alive = false; };
  }, [company.id]);

  const health = useMemo(() => computeHealth(company.profile, stats || {}, Date.now()), [company.profile, stats]);
  const rawName = getUser()?.email?.split("@")[0] || "";
  const first = rawName ? rawName.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const published = company?.status === "published";
  const profileUrl = company?.slug ? `/app?c=${encodeURIComponent(company.slug)}` : null;

  // First-login onboarding: until the company is live, Home IS the guided welcome/checklist.
  // Once published, Home reverts to the normal control center below. (Sidebar stays available
  // throughout, so nothing is hidden.)
  if (!published) return <OnboardingPanel company={company} go={go} goProfile={goProfile} onPublished={onPublished} />;

  return (
    <div>
      <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-slate-900">
        Good {partOfDay}{first ? <>, {first}</> : ""}.
      </h1>
      <p className="mt-1.5 text-[15px] text-slate-500">Your control center for how investors experience <span className="font-semibold text-slate-700">{company?.name || "your company"}</span> on MineEx.</p>

      {ready && !ready.ready && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-50/40 px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600"><AlertCircle size={19} /></span>
          <div>
            <p className="text-[14.5px] font-bold text-amber-900">Portal needs attention</p>
            <p className="text-[13px] text-amber-700">Missing: {(ready.missing || []).join(", ")}. Contact Passport if this persists.</p>
          </div>
        </div>
      )}

      {/* Profile status strip */}
      <div className={`mt-6 flex flex-wrap items-center gap-4 px-5 py-4 ${CARD}`}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Building2 size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15.5px] font-bold text-slate-900">{company?.name || company?.slug}</p>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${published ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${published ? "bg-emerald-500" : "bg-slate-400"}`} /> {published ? "Live on MineEx" : "Draft"}
            </span>
          </div>
          <p className="mt-0.5 text-[12.5px] text-slate-400">{profileUrl ? `${(typeof window !== "undefined" ? window.location.origin : "").replace(/^https?:\/\//, "")}${profileUrl}` : "No public URL yet"}</p>
        </div>
        {profileUrl && (
          <a href={profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-slate-700 hover:border-slate-300">
            <Eye size={15} /> {published ? "View profile" : "Preview"}
          </a>
        )}
        <button onClick={() => go("profile")} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-800">
          <Building2 size={15} /> Edit profile
        </button>
      </div>

      {/* Profile completeness + recommendations */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
        <HealthCard health={health} loading={stats == null} label="Profile completeness" />
        <RecommendationsCard health={health} go={go} />
      </div>

      {/* Quick actions */}
      <h2 className="mt-9 text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">Quick actions</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Action title="Publish a press release" body="Draft, preview and publish to the MineEx feed." Icon={Megaphone} onClick={() => go("press")} />
        <Action title="Publish media" body="Photos and video for the MineEx media feed." Icon={ImageIcon} onClick={() => go("media")} />
        <Action title="Edit company profile" body="Overview, projects, capital, timeline, team." Icon={Building2} onClick={() => go("profile")} />
        <Action title="QR & share" body="Download your QR code and profile link." Icon={QrCode} onClick={() => go("share")} />
      </div>

      {/* Recent content */}
      <h2 className="mt-9 text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">Recent content</h2>
      <div className={`mt-3 overflow-hidden ${CARD}`}>
        {recent == null ? (
          <div className="p-5"><div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" /></div>
        ) : recent.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Megaphone size={24} className="mx-auto text-slate-300" />
            <p className="mt-2 text-[13.5px] font-semibold text-slate-500">Nothing published yet</p>
            <p className="mt-1 text-[12.5px] text-slate-400">Your press releases and media will appear here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center gap-3.5 px-5 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-500">
                  {r.thumb ? <img src={r.thumb} alt="" className="h-full w-full object-cover" /> : r.type === "media" ? <ImageIcon size={16} /> : <Megaphone size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-slate-800">{r.title}</span>
                  <span className="block text-[12px] text-slate-400">{r.type === "media" ? "Media" : "Press release"} · {fmtDate(r.createdAt)}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase ${r.status === "published" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HealthCard({ health, loading, label = "Company health" }) {
  const { score, band } = health;
  const r = 52, C = 2 * Math.PI * r;
  const off = C * (1 - (loading ? 0 : score) / 100);
  const color = score >= 75 ? "#2563eb" : score >= 55 ? "#0ea5e9" : score >= 30 ? "#f59e0b" : "#f43f5e";
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-7 ${CARD}`}>
      <p className="mb-3 self-start text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <div className="relative grid place-items-center">
        <svg width="140" height="140" className="-rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
          <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={off} style={{ transition: "stroke-dashoffset .8s ease" }} />
        </svg>
        <div className="absolute text-center">
          <div className="text-[34px] font-extrabold leading-none tracking-tight text-slate-900">{loading ? "…" : score}</div>
          <div className="text-[11px] font-semibold text-slate-400">out of 100</div>
        </div>
      </div>
      <p className="mt-3 text-[15px] font-bold" style={{ color }}>{loading ? "Measuring…" : band}</p>
    </div>
  );
}

function RecommendationsCard({ health, go }) {
  const recs = health.recommendations.slice(0, 4);
  const target = (key) =>
    ["media"].includes(key) ? "media" :
    ["freshness", "timeline"].includes(key) ? "broadcast" : "profile";
  return (
    <div className={`p-5 ${CARD}`}>
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-blue-500" />
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">Recommended for you</p>
      </div>
      {recs.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 text-[14px] font-semibold text-blue-600"><CheckCircle2 size={18} /> You're in great shape — nothing urgent.</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {recs.map((rec) => (
            <li key={rec.key}>
              <button onClick={() => go(target(rec.key))} className="group flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/50">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-blue-600 ring-1 ring-slate-200"><ArrowRight size={14} /></span>
                <span className="flex-1 text-[13.5px] font-semibold text-slate-700">{rec.text}</span>
                {rec.gain > 0 && <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">+{rec.gain}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, accent, hint, Icon }) {
  return (
    <div className={`px-5 py-4 ${CARD}`}>
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-slate-400">{label}</p>
        {Icon && <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-50 text-slate-400 ring-1 ring-slate-100"><Icon size={14} /></span>}
      </div>
      <p className={`mt-2 text-[26px] font-extrabold tracking-tight tabular-nums ${accent === "emerald" ? "text-blue-600" : "text-slate-900"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function Action({ title, body, Icon, onClick }) {
  return (
    <button onClick={onClick} className={`group flex items-start gap-3.5 px-5 py-4 text-left transition hover:-translate-y-px hover:ring-blue-300/70 ${CARD}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 transition group-hover:bg-blue-50 group-hover:text-blue-600"><Icon size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-bold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">{body}</span>
      </span>
      <ArrowRight size={17} className="mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
    </button>
  );
}

/* ---------------------------------------------------------------- QR & Share */

function QRShareView({ company }) {
  const origin = (typeof window !== "undefined" && window.location.origin) || "";
  const slug = company?.slug || "";
  const url = slug ? `${origin}/app?c=${encodeURIComponent(slug)}` : "";
  const [png, setPng] = useState("");
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!url) return;
    // Reuse the app's existing `qrcode` dependency — same generator Admin uses.
    QRCode.toDataURL(url, { width: 640, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((d) => { if (alive) setPng(d); }).catch(() => {});
    QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((s) => { if (alive) setSvg(s); }).catch(() => {});
    return () => { alive = false; };
  }, [url]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch (_) {}
  };
  const download = (href, ext) => {
    const a = document.createElement("a");
    a.href = href; a.download = `${slug || "mineex"}-qr.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const downloadSvg = () => {
    if (!svg) return;
    download(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, "svg");
  };

  if (!slug) {
    return (
      <div>
        <PageTitle title="QR & Share" sub="Drive investors to your MineEx profile." />
        <div className={`p-6 ${CARD}`}><p className="text-[14px] text-slate-500">Your company needs a public profile URL before a QR code can be generated.</p></div>
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="QR & Share" sub="Drive investors to your MineEx profile and encourage them to follow your company." />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
        {/* QR preview */}
        <div className={`flex flex-col items-center p-6 ${CARD}`}>
          <div className="grid h-[240px] w-[240px] place-items-center rounded-2xl bg-white ring-1 ring-slate-200/70">
            {png ? <img src={png} alt="Profile QR code" className="h-[224px] w-[224px]" /> : <Loader2 size={22} className="animate-spin text-blue-500" />}
          </div>
          <div className="mt-4 flex w-full gap-2">
            <button onClick={() => png && download(png, "png")} disabled={!png}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-[13px] font-bold text-white hover:bg-slate-800 disabled:opacity-50">
              <Download size={14} /> PNG
            </button>
            <button onClick={downloadSvg} disabled={!svg}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-bold text-slate-700 hover:border-slate-300 disabled:opacity-50">
              <Download size={14} /> SVG
            </button>
          </div>
        </div>

        {/* Link + usage */}
        <div className="flex flex-col gap-5">
          <div className={`p-6 ${CARD}`}>
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">Your MineEx profile link</p>
            <div className="mt-3 flex items-center gap-2">
              <input readOnly value={url} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13.5px] text-slate-700 outline-none" />
              <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-slate-800">
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
              </button>
            </div>
            <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-blue-600 hover:text-blue-700">
              Open profile <ExternalLink size={13} />
            </a>
          </div>

          <div className={`p-6 ${CARD}`}>
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">Where to use it</p>
            <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {["Conference booths and banners", "Investor presentations", "Printed materials and business cards", "Email signatures", "Social media bios and posts"].map((t) => (
                <li key={t} className="flex items-center gap-2 text-[13.5px] text-slate-600"><CheckCircle2 size={15} className="shrink-0 text-blue-500" /> {t}</li>
              ))}
            </ul>
            <p className="mt-4 text-[12.5px] text-slate-400">Anyone who scans it lands on your MineEx profile and can follow your company in one tap.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Calendar & Catalysts */

const CAT_TYPES = ["Drilling", "Assay results", "Resource estimate", "PEA", "PFS", "Feasibility", "Permitting", "Construction", "Production", "Financing", "Conference", "Other"];
const uid = () => "cat-" + Math.random().toString(36).slice(2, 9);

function CalendarView({ company, setCompany }) {
  const [items, setItems] = useState(() => (Array.isArray(company.profile?.catalysts) ? company.profile.catalysts : []));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const addItem = () => { setItems((xs) => [...xs, { id: uid(), title: "", type: "Drilling", expected: "", status: "upcoming", note: "" }]); setDirty(true); };
  const patch = (id, k, v) => { setItems((xs) => xs.map((x) => (x.id === id ? { ...x, [k]: v } : x))); setDirty(true); };
  const remove = (id) => { setItems((xs) => xs.filter((x) => x.id !== id)); setDirty(true); };

  const save = async () => {
    setSaving(true);
    const clean = items.filter((x) => (x.title || "").trim());
    const nextProfile = { ...(company.profile || {}), catalysts: clean };
    const saved = await updateCompanyProfile(company.id, nextProfile);
    if (saved) {
      setCompany((c) => ({ ...c, profile: saved }));
      setItems(Array.isArray(saved.catalysts) ? saved.catalysts : clean);
      setDirty(false);
      logActivity(company.id, { action: "profile_updated", entity: "profile.catalysts", source: "ui", reason: `${clean.length} catalyst${clean.length === 1 ? "" : "s"}` });
    }
    setSaving(false);
  };

  const today = new Date().toISOString().slice(0, 10);
  const overdue = (x) => x.status === "upcoming" && /^\d{4}-\d{2}-\d{2}$/.test(x.expected) && x.expected < today;

  return (
    <div>
      <div className="flex items-start justify-between">
        <PageTitle title="Calendar & Catalysts" sub="The upcoming events that move your story — drilling, assays, studies, financings and conferences." />
        <div className="flex items-center gap-2">
          {dirty && <span className="text-[12px] font-semibold text-amber-600">Unsaved changes</span>}
          <button onClick={save} disabled={saving || !dirty}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13.5px] font-bold text-white ${dirty ? "bg-slate-900" : "bg-slate-300"} ${saving ? "opacity-60" : ""}`}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Calendar size={26} className="mx-auto text-slate-300" />
          <p className="mt-3 text-[14.5px] font-semibold text-slate-600">No catalysts yet</p>
          <p className="mt-1 text-[13px] text-slate-400">Add the milestones investors are waiting for — each one is a reason to keep watching.</p>
          <button onClick={addItem} className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white"><Plus size={15} /> Add a catalyst</button>
        </div>
      ) : (
        <>
          <div className="mt-2 space-y-3">
            {items.map((x) => (
              <div key={x.id} className={`p-4 ${CARD} ${overdue(x) ? "!ring-rose-200" : ""}`}>
                <div className="flex items-center gap-3">
                  <input value={x.title} onChange={(e) => patch(x.id, "title", e.target.value)} placeholder="e.g. Phase 2 drill results"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[14px] font-semibold outline-none focus:border-slate-400" />
                  <select value={x.type} onChange={(e) => patch(x.id, "type", e.target.value)}
                    className="rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] text-slate-600 outline-none focus:border-slate-400">
                    {CAT_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <button onClick={() => remove(x.id)} title="Remove" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={15} /></button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-semibold text-slate-400">Expected</span>
                  <input value={x.expected} onChange={(e) => patch(x.id, "expected", e.target.value)} placeholder="Q3 2026 or 2026-09-30"
                    className="w-44 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-slate-400" />
                  <select value={x.status} onChange={(e) => patch(x.id, "status", e.target.value)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-600 outline-none focus:border-slate-400">
                    <option value="upcoming">Upcoming</option>
                    <option value="done">Delivered</option>
                    <option value="delayed">Delayed</option>
                  </select>
                  {overdue(x) && <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600"><Clock size={11} /> Past expected date — publish an update?</span>}
                  <input value={x.note || ""} onChange={(e) => patch(x.id, "note", e.target.value)} placeholder="Note (optional)"
                    className="min-w-[140px] flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-slate-400" />
                </div>
              </div>
            ))}
          </div>
          <button onClick={addItem} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13.5px] font-bold text-slate-700 hover:border-slate-300"><Plus size={15} /> Add another</button>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Analytics */

function AnalyticsView({ company }) {
  const [stats, setStats] = useState(null);
  useEffect(() => { let alive = true; companyStats(company.id).then((s) => { if (alive) setStats(s); }); return () => { alive = false; }; }, [company.id]);

  const p = company.profile || {};
  const derived = {
    timeline: Array.isArray(p.timeline) ? p.timeline.length : 0,
    projects: Array.isArray(p.projects) ? p.projects.length : 0,
    team: Array.isArray(p.team) ? p.team.length : 0,
  };

  return (
    <div>
      <PageTitle title="Analytics" sub="The numbers that matter — starting with what your company has published, then investor engagement as it comes online." />

      <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">Your content</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Documents filed" value={stats ? stats.documents : "…"} Icon={FileText} />
        <Stat label="Timeline entries" value={derived.timeline} Icon={ScrollText} />
        <Stat label="Projects" value={derived.projects} Icon={Building2} />
        <Stat label="Updates published" value={stats ? stats.published : "…"} Icon={Radio} />
      </div>

      <h2 className="mt-9 text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">Investor engagement</h2>
      <div className={`mt-3 p-6 ${CARD}`}>
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400"><BarChart3 size={20} /></div>
          <div>
            <p className="text-[14.5px] font-bold text-slate-800">Profile views, followers, reading time and geography</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-slate-500">
              These begin recording once your profile is published and start receiving traffic. We only report engagement from real investor activity — never estimated or inflated numbers.
              {company?.status === "published"
                ? " Your profile is live, so measurement is active; the first meaningful trends appear after a few days of traffic."
                : " Publish your profile to start measuring."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Activity */

const ACTION_LABEL = {
  profile_updated: "Profile updated",
  broadcast_published: "Broadcast published",
  media_uploaded: "Media uploaded",
  documents_analyzed: "Documents analyzed",
  company_created: "Company created",
};

function ActivityView({ company }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { let alive = true; listActivity(company.id).then((r) => { if (alive) setRows(r); }); return () => { alive = false; }; }, [company.id]);

  return (
    <div>
      <PageTitle title="Activity log" sub="An append-only record of every change. History can't be rewritten — members can add to it but never erase it." />
      <div className={`overflow-hidden ${CARD}`}>
        {rows == null ? (
          <div className="p-6"><div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" /></div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <ScrollText size={26} className="mx-auto text-slate-300" />
            <p className="mt-3 text-[14px] font-semibold text-slate-500">No activity yet</p>
            <p className="mt-1 text-[13px] text-slate-400">Edits, uploads and broadcasts will appear here as you use the portal.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-5 py-3.5">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${r.actor_kind === "admin" ? "bg-indigo-50 text-indigo-500" : "bg-slate-100 text-slate-500"}`}><ScrollText size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-slate-800">{ACTION_LABEL[r.action] || r.action}{r.entity ? <span className="font-normal text-slate-400"> · {r.entity}</span> : null}</span>
                  {r.reason && <span className="block truncate text-[12.5px] text-slate-400">{r.reason}</span>}
                </span>
                {r.actor_kind === "admin" && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-500">Passport</span>}
                <span className="shrink-0 text-[12px] text-slate-400">{fmtDate(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Billing */

function BillingView({ company }) {
  const [plan, setPlan] = useState(undefined); // undefined = loading
  const [feats, setFeats] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchPlan(company.id).then((p) => { if (alive) setPlan(p); });
    fetchFeatures(company.id).then((f) => { if (alive) setFeats(f); });
    return () => { alive = false; };
  }, [company.id]);

  const status = plan?.status || "—";
  const statusTone = status === "active" ? "emerald" : status === "past_due" ? "rose" : "slate";

  const [busy, setBusy] = useState("");
  const [payErr, setPayErr] = useState("");
  const startCheckout = async (tier) => {
    setPayErr(""); setBusy(tier);
    try {
      const h = await authHeaders();
      const res = await fetch("/api/stripe-checkout", {
        method: "POST", headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ tier, companyId: company.id }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j && j.url) { window.location.href = j.url; return; }
      setPayErr((j && j.error) || "Couldn't start checkout. Please try again.");
    } catch (_) { setPayErr("Couldn't reach the payment service."); }
    finally { setBusy(""); }
  };
  const manageBilling = async () => {
    setPayErr(""); setBusy("manage");
    try {
      const h = await authHeaders();
      const res = await fetch("/api/stripe-portal", { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: "{}" });
      const j = await res.json().catch(() => null);
      if (res.ok && j && j.url) { window.location.href = j.url; return; }
      setPayErr(res.status === 404 ? "No card subscription on file — you're on a manual/invoiced plan." : ((j && j.error) || "Couldn't open billing."));
    } catch (_) { setPayErr("Couldn't reach the billing service."); }
    finally { setBusy(""); }
  };
  const PLANS = [
    { tier: "basic", name: "Basic", perMo: "$299", perYr: "$3,588", planIds: ["passport"], blurb: "Edit your profile + publish press releases to the MineEx feed." },
    { tier: "pro", name: "Pro", perMo: "$799", perYr: "$9,588", planIds: ["passport_managed"], blurb: "Everything: projects, capital, team, media, external channels, analytics." },
  ];
  const currentPlanId = plan?.plan_id;

  return (
    <div>
      <PageTitle title="Billing" sub="Your Passport subscription and what it includes." />

      <div className={`p-6 ${CARD}`}>
        {plan === undefined ? (
          <div className="h-6 w-40 animate-pulse rounded bg-slate-100" />
        ) : plan === null ? (
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="text-amber-500" />
            <p className="text-[14.5px] text-slate-600">No active subscription found. Contact Passport to activate your plan.</p>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Current plan</p>
              <p className="mt-1 text-[22px] font-extrabold tracking-tight text-slate-900">{plan.plans?.label || plan.plan_id}</p>
              {plan.renews_at && <p className="mt-1 text-[13px] text-slate-500">Renews {fmtDate(plan.renews_at)}</p>}
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold ${
              statusTone === "emerald" ? "bg-blue-50 text-blue-600" : statusTone === "rose" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusTone === "emerald" ? "bg-blue-500" : statusTone === "rose" ? "bg-rose-500" : "bg-slate-400"}`} /> {cap(status)}
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

      {/* Plans — pay/upgrade by card (annual). */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PLANS.map((p) => {
          const isCurrent = currentPlanId && p.planIds.includes(currentPlanId) && status === "active";
          return (
            <div key={p.tier} className={`p-6 ${CARD} ${isCurrent ? "!ring-2 !ring-blue-300" : ""}`}>
              <div className="flex items-baseline justify-between">
                <p className="text-[17px] font-extrabold tracking-tight text-slate-900">{p.name}</p>
                {isCurrent && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-600">Current</span>}
              </div>
              <p className="mt-1 text-[22px] font-extrabold tracking-tight text-slate-900">{p.perMo}<span className="text-[13px] font-semibold text-slate-400">/mo</span></p>
              <p className="text-[12px] text-slate-400">{p.perYr} billed annually</p>
              <p className="mt-2 text-[13px] leading-snug text-slate-600">{p.blurb}</p>
              <button onClick={() => startCheckout(p.tier)} disabled={!!busy || isCurrent}
                className={`mt-4 w-full rounded-xl px-4 py-2.5 text-[14px] font-bold transition ${isCurrent ? "cursor-default bg-slate-100 text-slate-400" : "bg-slate-900 text-white hover:bg-slate-800 active:scale-[.99]"}`}>
                {isCurrent ? "Active" : busy === p.tier ? "Redirecting…" : "Pay by card"}
              </button>
            </div>
          );
        })}
      </div>
      {payErr && <p className="mt-3 text-[13px] font-semibold text-rose-600">{payErr}</p>}
      {status === "active" && (
        <button onClick={manageBilling} disabled={!!busy}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[13.5px] font-bold text-slate-600 hover:border-slate-300 hover:text-slate-900">
          <CreditCard size={15} /> {busy === "manage" ? "Opening…" : "Manage / cancel card"}
        </button>
      )}
      <p className="mt-4 text-[13px] text-slate-400">Prefer e-transfer or wire? <span className="font-semibold text-slate-500">Contact us and we'll invoice you.</span> Managed plans are arranged directly with Passport.</p>
    </div>
  );
}

const FEATURE_LABEL = {
  portal_access: "Company Portal access",
  passport_profile: "Passport investor profile",
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

/* ---------------------------------------------------------------- Settings */

function SettingsView({ company }) {
  return (
    <div>
      <PageTitle title="Settings" />
      <div className="space-y-4">
        <Field label="Company name" value={company?.name || "—"} />
        <Field label="Profile URL" value={company?.slug ? `passport.app/app?c=${company.slug}` : "—"} />
        <Field label="Your role" value={cap(company?.role || "owner")} />
        <Field label="Signed in as" value={getUser()?.email || "—"} />
      </div>
      <div className="mt-8 space-y-4">
        <h2 className="text-[15px] font-extrabold text-slate-900">Account</h2>
        <AccountCard title="Change email"
          hint="We'll send a confirmation link to the new address. Your email changes only after you click it."
          fields={[{ key: "email", type: "email", placeholder: "new@company.com", label: "New email" }]}
          cta="Send confirmation"
          onSubmit={async (v) => { await updateEmail(v.email); return "Check your new inbox for a confirmation link."; }} />
        <AccountCard title="Change password"
          hint="Choose a new password for signing in to the portal."
          fields={[{ key: "password", type: "password", placeholder: "New password", label: "New password", minLength: 8 }]}
          cta="Update password"
          onSubmit={async (v) => { if ((v.password || "").length < 8) throw new Error("Use at least 8 characters."); await updatePassword(v.password); return "Password updated."; }} />
      </div>
    </div>
  );
}

// A small self-managing account form (change email / password). Handles busy/error/success itself.
function AccountCard({ title, hint, fields, cta, onSubmit }) {
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(""); setMsg("");
    try { const ok = await onSubmit(vals); setMsg(typeof ok === "string" ? ok : "Saved."); setVals({}); }
    catch (ex) { setErr(ex.message || "Something went wrong."); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-[14px] font-bold text-slate-900">{title}</p>
      {hint && <p className="mt-1 text-[12.5px] text-slate-500">{hint}</p>}
      <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
        {fields.map((f) => (
          <input key={f.key} type={f.type} required minLength={f.minLength} placeholder={f.placeholder} aria-label={f.label}
            value={vals[f.key] || ""} onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-slate-400" />
        ))}
        <button type="submit" disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40">
          {busy ? <Loader2 size={14} className="animate-spin" /> : cta}
        </button>
      </div>
      {msg && <p className="mt-2 text-[12.5px] font-semibold text-emerald-600">{msg}</p>}
      {err && <p className="mt-2 text-[12.5px] font-semibold text-rose-500">{err}</p>}
    </form>
  );
}

function Field({ label, value }) {
  return (
    <div className={`px-5 py-4 ${CARD}`}>
      <p className="text-[12px] font-semibold text-slate-400">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-slate-800">{value}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}
