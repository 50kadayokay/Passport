import React, { useState, useEffect, useMemo, Suspense } from "react";
import QRCode from "qrcode";
import {
  Home as HomeIcon, Radio, Building2, Image as ImageIcon, Calendar, BarChart3,
  ScrollText, CreditCard, Settings as SettingsIcon, ExternalLink, LogOut,
  ChevronDown, ChevronRight, CheckCircle2, AlertCircle, ArrowRight, Sparkles, Loader2,
  Plus, Trash2, Clock, TrendingUp, FileText, Radio as RadioIcon, Check, ArrowLeft,
  Megaphone, QrCode, HelpCircle, Copy, Download, Eye, Upload, Send, Mail, Bell,
  Presentation, Brain,
} from "lucide-react";
import { getUser, signOut, authHeaders, updatePassword, updateEmail } from "../lib/auth.js";
import { profileUrl, companyLogo, companyMonogram, placardLogo } from "../lib/brand.js";
import { buildPlacardSvg, splitQrSvg, CARD_W, CARD_H, PLACARD_FONT } from "../lib/qrPlacard.js";
import {
  portalReadiness, listActivity, loadPortalCompany, updateCompanyProfile,
  logActivity,
} from "../lib/portal.js";
import { fetchPlan, fetchFeatures } from "../lib/features.js";
import { uploadCompanyLogo } from "../lib/storage.js";
import { visibleProfileSections } from "./profileNav.js";
import OnboardingPanel from "./OnboardingPanel.jsx";
import { MineExLockup, CompanyMark } from "./BrandMarks.jsx";

// Heavy, already-built surfaces are reused wholesale (never duplicated) and lazily
// loaded so the portal shell stays lean:
const CommsCenter = React.lazy(() => import("../console/CommsCenter.jsx"));  // legacy multi-channel composer (still routed at `press`)
const Publish     = React.lazy(() => import("./publish/Publish.jsx"));       // Publish workspace: create / drafts / published
const Onboarding  = React.lazy(() => import("../Onboarding.jsx"));           // Profile builder (create/onboard)
const ProfileEditor = React.lazy(() => import("./ProfileEditor.jsx"));       // pp-direct editor (edit existing, 1:1 with app)
const Messages      = React.lazy(() => import("./Messages.jsx"));            // investor inbox (the company side of 0014 messaging)
const Analytics     = React.lazy(() => import("./Analytics.jsx"));           // engagement reporting (0048 aggregates)
const MediaPage     = React.lazy(() => import("./MediaPage.jsx"));           // media cubes + composer (supersedes MediaComposer)
const Notifications = React.lazy(() => import("./Notifications.jsx"));      // follows + likes (0049)
const Conference    = React.lazy(() => import("./Conference.jsx"));         // iPad booth: launch + status
const MineIQ        = React.lazy(() => import("./MineIQ.jsx"));             // company memory, searchable
const Services      = React.lazy(() => import("./Services.jsx"));           // MineEx services

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
    { id: "publish",   label: "Publish",         Icon: Send },
    { id: "releases",  label: "Press Releases",  Icon: Megaphone },
    { id: "media",     label: "Media",           Icon: ImageIcon },
    { id: "messages",  label: "Messages",        Icon: Mail },
    { id: "notifications", label: "Notifications", Icon: Bell },
    { id: "analytics", label: "Analytics",       Icon: BarChart3 },
    { id: "conference", label: "Conference Mode", Icon: Presentation },
    { id: "mineiq",    label: "Mine IQ",         Icon: Brain },
    { id: "share",     label: "QR & Share",      Icon: QrCode },
  ] },
  { title: "Account", items: [
    { id: "services",  label: "Services",        Icon: Sparkles },
    { id: "billing",   label: "Billing",         Icon: CreditCard },
    { id: "settings",  label: "Settings",        Icon: SettingsIcon },
  ] },
];
const NAV = NAV_GROUPS.flatMap((g) => g.items);

// Shared surface: white card on the soft canvas, hairline ring + a whisper of depth.
// Design-system card: white on white, lifted by a hairline + the layered slate shadow.
const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

const SectionLoader = () => (
  <div className="grid min-h-[60vh] place-items-center text-slate-300"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
);

// `injectedProfile` is for the LOCALHOST harness only (/portaldemo): it loads a draft row
// through a token RPC that bypasses RLS, then hands the profile straight to the editor.
// Without it the editor re-fetches by slug with the anon key, RLS returns nothing for a
// draft, and the editor renders empty. The real portal never passes it — there the user's
// own JWT reads their company normally.
export default function Portal({ company: initial, switchCompany, adminMode = false, injectedProfile = null, devFeatures = null }) {
  const [section, setSection] = useState("home");
  const [company, setCompany] = useState(initial);
  // Company Profile editor navigation, lifted here so the sidebar's expandable "Company Profile"
  // menu and the editor share one state (the editor is rendered controlled).
  const [profTab, setProfTab] = useState("overview");
  const [profStep, setProfStep] = useState(0);
  const goProfile = (tab, stepIndex) => { setSection("profile"); setProfTab(tab); setProfStep(stepIndex); };

  // The notification badge. Lives here rather than in the Notifications page so
  // the count shows on every screen, not only the one that already shows it.
  // Silently 0 when 0049 is not applied -- a badge is not the place to explain
  // a missing migration; the page itself says so.
  const [notifCount, setNotifCount] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!initial.id) return undefined;
    const tick = async () => {
      const m = await import("../lib/companyNotifications.js");
      const [rows, seen] = await Promise.all([
        m.listCompanyNotifications(initial.id),
        m.companyLastSeenAt(initial.id),
      ]);
      if (alive) setNotifCount(m.companyUnreadCount(rows, seen));
    };
    tick();
    const t = setInterval(tick, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [initial.id]);

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
    <div className="flex min-h-[100dvh] bg-white text-slate-900">
      <Sidebar section={section} setSection={setSection} company={company} switchCompany={switchCompany}
        profileNav={{ tab: profTab, step: profStep, go: goProfile }} notifCount={notifCount} />
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
              {(section === "press" || section === "broadcast") && <CommsCenter company={company} devFeatures={devFeatures} />}
              {section === "profile"   && <Suspense fallback={<SectionLoader />}><ProfileEditor company={company} injectedProfile={injectedProfile} navTab={profTab} navStep={profStep} onNav={(t, s) => { setProfTab(t); setProfStep(s); }} /></Suspense>}
            </Suspense>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-8 py-10">
              {section === "home"      && <HomeView company={company} />}
              {section === "publish"   && <Suspense fallback={<SectionLoader />}><Publish company={company} go={setSection} view="publish" /></Suspense>}
              {section === "releases"  && <Suspense fallback={<SectionLoader />}><Publish company={company} go={setSection} view="releases" /></Suspense>}
              {section === "messages"  && <Suspense fallback={<SectionLoader />}><Messages company={company} /></Suspense>}
              {section === "notifications" && <Suspense fallback={<SectionLoader />}><Notifications company={company} onSeen={() => setNotifCount(0)} /></Suspense>}
              {section === "conference" && <Suspense fallback={<SectionLoader />}><Conference company={company} /></Suspense>}
              {section === "mineiq"    && <Suspense fallback={<SectionLoader />}><MineIQ company={company} go={setSection} /></Suspense>}
              {section === "services"  && <Suspense fallback={<SectionLoader />}><Services company={company} /></Suspense>}
              {section === "media"     && <Suspense fallback={<SectionLoader />}><MediaPage company={company} /></Suspense>}
              {section === "share"     && <QRShareView company={company} />}
              {section === "calendar"  && <CalendarView company={company} setCompany={setCompany} />}
              {section === "analytics" && <Suspense fallback={<SectionLoader />}><Analytics company={company} /></Suspense>}
              {section === "activity"  && <ActivityView company={company} />}
              {section === "billing"   && <BillingView company={company} />}
              {section === "settings"  && <SettingsView company={company} go={setSection} goProfile={goProfile} onPublished={() => setCompany((c) => ({ ...c, status: "published" }))} />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------- Sidebar */

// Built to MINEEX_DESIGN_SYSTEM.md: slate neutrals on white, cobalt #2563eb as the one
// accent, hairline borders, rounded-2xl hit areas, heavy lucide strokes. It previously used
// a green-black gradient panel with vivid blue gradient tiles — off-system on every count.
// (The unused `collapsed` icon-rail branch was removed with this rebuild; nothing passed it.)
function Sidebar({ section, setSection, company, switchCompany, profileNav = null, notifCount = 0 }) {
  const navRef = React.useRef(null);
  const activeKey = `${section}:${profileNav ? profileNav.tab : ""}:${profileNav ? profileNav.step : ""}`;
  React.useEffect(() => {
    const el = navRef.current && navRef.current.querySelector("[data-navactive='1']");
    if (!el) return;
    const box = navRef.current;
    const br = box.getBoundingClientRect(), er = el.getBoundingClientRect();
    if (er.top < br.top + 8 || er.bottom > br.bottom - 8) {
      try { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (_) {}
    }
  }, [activeKey]);

  return (
    <aside className="sticky top-0 flex h-[100dvh] w-[252px] shrink-0 flex-col border-r border-slate-100 bg-white">
      {/* MineEx lockup — the mark sits left of the M at the same height. */}
      <div className="flex items-center px-5 pt-6">
        <MineExLockup size={30} />
      </div>

      {/* The company being managed, carrying ITS OWN logo. */}
      <div className="px-3 pt-5">
        <button
          onClick={switchCompany || undefined}
          disabled={!switchCompany}
          className={`flex w-full items-center gap-2.5 rounded-2xl border border-slate-100 bg-white px-2.5 py-2.5 text-left shadow-[0_1px_2px_rgba(15,23,42,.04)] transition ${
            switchCompany ? "hover:border-slate-200 active:scale-[0.99]" : "cursor-default"
          }`}
        >
          <CompanyMark company={company} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-extrabold leading-snug tracking-tight text-slate-900">
              {company?.name || company?.slug || "Company"}
            </span>
            <span className="block text-[10.5px] font-semibold capitalize text-slate-400">{company?.role || "owner"}</span>
          </span>
          {switchCompany && <ChevronDown size={15} strokeWidth={2.4} className="shrink-0 text-slate-400" />}
        </button>
      </div>

      {/* Grouped nav. Scrolls when Company Profile is expanded — the sub-tree makes it taller
          than the viewport — so the selected item is scrolled into view, otherwise the user
          loses track of where they are and items near the bottom look clipped. */}
      <nav ref={navRef} className="mt-5 flex-1 overflow-y-auto px-3 pb-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mt-5 first:mt-0">
            <p className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400">{group.title}</p>
            <div className="space-y-0.5">
              {group.items.map(({ id, label, Icon }) => {
                const isProfile = id === "profile";
                const on = section === id;
                const expanded = isProfile && section === "profile" && profileNav;
                // The Company Profile parent shows an OPEN state when expanded but never the
                // accent pill — that is reserved for the one selected sub-page, so exactly one
                // item ever reads as active.
                const parentStrong = on && !isProfile;
                return (
                  <div key={id}>
                    <button
                      onClick={() => setSection(id)}
                      data-navactive={parentStrong ? "1" : undefined}
                      className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-[13.5px] font-bold tracking-tight transition active:scale-[0.99] ${
                        parentStrong ? "bg-blue-50 text-blue-600"
                        : expanded ? "text-slate-900"
                        : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Icon size={16.5} strokeWidth={parentStrong ? 2.4 : 2.2}
                        className={parentStrong ? "text-blue-600" : expanded ? "text-slate-700" : "text-slate-400 group-hover:text-slate-600"} />
                      <span className="flex-1 text-left">{label}</span>
                      {id === "notifications" && notifCount > 0 && (
                        <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-blue-600 px-1 text-[10.5px] font-bold text-white">
                          {notifCount > 99 ? "99+" : notifCount}
                        </span>
                      )}
                      {isProfile && (expanded
                        ? <ChevronDown size={15} strokeWidth={2.4} className="text-slate-400" />
                        : <ChevronRight size={15} strokeWidth={2.4} className="text-slate-300 group-hover:text-slate-400" />)}
                    </button>

                    {expanded && (
                      // Hierarchy carried by TYPOGRAPHY: parent (icon) → major area (bold) →
                      // sub-pages (quieter, indented). The selected sub-page takes the accent.
                      <div className="mb-1.5 mt-1 space-y-2">
                        {visibleProfileSections(company?.tier).map((sec) => {
                          const secActive = profileNav.tab === sec.key;
                          return (
                            <div key={sec.key}>
                              <button onClick={() => profileNav.go(sec.key, 0)}
                                className={`flex w-full items-center rounded-xl py-1.5 pl-7 pr-3 text-left text-[13px] font-bold tracking-tight transition ${
                                  secActive ? "text-slate-900" : "text-slate-500 hover:text-slate-900"
                                }`}>
                                {sec.label}
                              </button>
                              <div className="mt-0.5 space-y-px pl-10 pr-1.5">
                                {sec.steps.map((s, i) => {
                                  const stepOn = secActive && profileNav.step === i;
                                  return (
                                    <button key={s.key} onClick={() => profileNav.go(sec.key, i)}
                                      className={`flex w-full items-center rounded-xl py-1.5 pl-3 pr-2.5 text-left text-[12.5px] transition ${
                                        stepOn ? "bg-blue-50 font-bold text-blue-600" : "font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700"
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
      <div className="border-t border-slate-100 px-3 py-4">
        {company?.slug && company?.status === "published" && (
          <a href={profileUrl(company.slug)} target="_blank" rel="noreferrer"
             className="mb-1 flex items-center gap-2 rounded-2xl px-3 py-2 text-[12.5px] font-bold text-slate-600 transition hover:bg-slate-50 active:scale-[0.99]">
            <ExternalLink size={14} strokeWidth={2.4} className="text-slate-400" /> View live profile
          </a>
        )}
        <a href="mailto:support@mineex.ca?subject=MineEx%20Portal%20—%20help"
           className="flex items-center gap-2 rounded-2xl px-3 py-2 text-[12.5px] font-bold text-slate-600 transition hover:bg-slate-50 active:scale-[0.99]">
          <HelpCircle size={14} strokeWidth={2.4} className="text-slate-400" /> Help &amp; support
        </a>
        <button onClick={() => signOut()}
          className="mt-0.5 flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-[12.5px] font-bold text-slate-600 transition hover:bg-slate-50 active:scale-[0.99]">
          <LogOut size={14} strokeWidth={2.4} className="text-slate-400" /> Sign out
        </button>
        <div className="min-w-0 truncate px-3 pt-2.5 text-[10.5px] font-semibold text-slate-400">{getUser()?.email}</div>
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

// Home.
//
// Everything that used to live here has moved somewhere it belongs: the tiles to
// the left rail (every one of them is now its own sidebar item, so the grid was
// a second copy of the navigation), the setup checklist to Settings, the
// readiness banner to Settings, and completeness and activity off the portal.
//
// What is left is deliberately a landing page, not a dashboard. If it should
// carry something again -- a genuine at-a-glance summary rather than a repeat of
// the menu -- that is worth designing on purpose.
function HomeView({ company }) {
  const name = company?.name || "your company";
  return (
    <div>
      <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Home</h1>
      <p className="mt-1 text-[14px] text-slate-500">Manage {name} on MineEx. Choose a section from the left to begin.</p>
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
      <p className={`mt-2 text-[26px] font-extrabold tracking-tight tabular-nums ${accent === "accent" ? "text-blue-600" : "text-slate-900"}`}>{value}</p>
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

/* ---- printable placard -------------------------------------------------- */

// Real rendered text widths, so the footer lockups lay out exactly. Guessing a width
// overflowed the right margin and clipped "MineEx" off the printed card.
function textWidth(text, px, weight = 800) {
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${weight} ${px}px ${PLACARD_FONT}`;
    return ctx.measureText(String(text || "")).width;
  } catch (_) {
    return String(text || "").length * px * 0.58;
  }
}

// Inline a remote image so the placard is SELF-CONTAINED: an <image href="https://…">
// would break the moment the file is opened offline or handed to a print shop, and it
// would taint the canvas during PNG rasterisation. Returns "" if it can't be inlined.
async function inlineImage(src) {
  const s = String(src || "").trim();
  if (!s) return "";
  if (s.startsWith("data:")) return s;
  try {
    const r = await fetch(s, { mode: "cors" });
    if (!r.ok) return "";
    const blob = await r.blob();
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result || ""));
      fr.onerror = () => res("");
      fr.readAsDataURL(blob);
    });
  } catch (_) { return ""; }
}

// Rasterise the placard. The SVG is fully self-contained (data: URLs only), so the
// canvas is never tainted and toDataURL succeeds.
function placardToPng(svgStr, scale = 2) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = CARD_W * scale; cv.height = CARD_H * scale;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      let out = ""; try { out = cv.toDataURL("image/png"); } catch (_) {}
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(""); };
    img.src = url;
  });
}

function QRShareView({ company }) {
  const slug = company?.slug || "";
  // Derived from THIS company's slug against the canonical origin — never the current
  // window's origin, so a placard generated from a preview deploy or localhost still
  // prints a link to the live profile.
  const url = profileUrl(slug);
  const name = company?.name || slug;
  const [placard, setPlacard] = useState("");   // placard SVG string
  const [png, setPng] = useState("");           // rasterised placard
  const [copied, setCopied] = useState(false);
  // A company can upload a dedicated PRINT logo for the placard — the profile avatar is
  // often small or cropped for a screen and prints poorly. Persisted on profile.brand.qrLogo.
  const [logoSrc, setLogoSrc] = useState(() => placardLogo(company));
  const [logoBusy, setLogoBusy] = useState("");
  useEffect(() => { setLogoSrc(placardLogo(company)); }, [company]);

  // A QR for an unpublished company resolves to "Profile not available" when scanned. Say
  // so plainly rather than handing someone a code to print that cannot work yet.
  const isLive = company?.status === "published";

  const pickLogo = async (file) => {
    if (!file) return;
    setLogoBusy("Uploading…");
    try {
      const url = await uploadCompanyLogo(file);
      if (!url) { setLogoBusy("Upload failed"); setTimeout(() => setLogoBusy(""), 2600); return; }
      const nextProfile = { ...(company.profile || {}), brand: { ...((company.profile || {}).brand || {}), qrLogo: url } };
      const saved = await updateCompanyProfile(company.id, nextProfile);
      setLogoSrc(url);
      setLogoBusy(saved ? "Saved" : "Saved for this download only");
      setTimeout(() => setLogoBusy(""), 2600);
    } catch (_) {
      setLogoBusy("Upload failed"); setTimeout(() => setLogoBusy(""), 2600);
    }
  };
  const clearLogo = async () => {
    const nextProfile = { ...(company.profile || {}), brand: { ...((company.profile || {}).brand || {}), qrLogo: "" } };
    await updateCompanyProfile(company.id, nextProfile).catch(() => null);
    setLogoSrc(companyLogo(company));
  };

  useEffect(() => {
    let alive = true;
    if (!url) return;
    (async () => {
      // Reuse the app's existing `qrcode` dependency — same generator Admin uses.
      const qr = await QRCode.toString(url, {
        type: "svg", margin: 0, errorCorrectionLevel: "M",
        color: { dark: "#0f172a", light: "#ffffff" },
      }).catch(() => "");
      if (!qr || !alive) return;
      const { viewBox, inner } = splitQrSvg(qr);
      const logo = await inlineImage(logoSrc);
      if (!alive) return;
      const svgStr = buildPlacardSvg({
        qrInner: inner, qrViewBox: viewBox, name,
        logo, monogram: companyMonogram(company), measure: textWidth,
      });
      setPlacard(svgStr);
      const raster = await placardToPng(svgStr);
      if (alive) setPng(raster);
    })();
    return () => { alive = false; };
  }, [url, name, company, logoSrc]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch (_) {}
  };
  const download = (href, ext) => {
    const a = document.createElement("a");
    a.href = href; a.download = `${slug || "mineex"}-qr.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const downloadSvg = () => {
    if (!placard) return;
    download(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(placard)}`, "svg");
  };
  const previewSrc = placard
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(placard)}`
    : "";

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

      {!isLive && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600"><AlertCircle size={19} strokeWidth={2.4} /></span>
          <div>
            <p className="text-[14.5px] font-bold text-amber-900">This code won't work yet</p>
            <p className="text-[13px] leading-relaxed text-amber-700">
              Your profile isn't live, so anyone scanning this sees "Profile not available". Publish from
              Home and the same code starts working — the link never changes, so it's safe to print ahead of time.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
        {/* Placard preview */}
        <div className={`flex flex-col items-center p-6 ${CARD}`}>
          <div className="grid w-full place-items-center rounded-2xl bg-white p-3 ring-1 ring-slate-200/70">
            {previewSrc
              ? <img src={previewSrc} alt={`${name} profile QR placard`} className="w-full max-w-[260px]" />
              : <div className="grid h-[320px] w-full place-items-center"><Loader2 size={22} className="animate-spin text-blue-500" /></div>}
          </div>
          <div className="mt-4 flex w-full gap-2">
            <button onClick={() => png && download(png, "png")} disabled={!png}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-[13px] font-bold text-white hover:bg-slate-800 disabled:opacity-50">
              <Download size={14} /> PNG
            </button>
            <button onClick={downloadSvg} disabled={!placard}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-bold text-slate-700 hover:border-slate-300 disabled:opacity-50">
              <Download size={14} /> SVG
            </button>
          </div>
          <p className="mt-3 text-center text-[12px] text-slate-400">SVG stays sharp at any size — use it for banners and large prints.</p>

          {/* Placard logo — upload a dedicated print version if the profile one isn't right. */}
          <div className="mt-5 w-full border-t border-slate-100 pt-4">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400">Logo on the placard</p>
            <div className="mt-2.5 flex items-center gap-3">
              {logoSrc
                ? <img src={logoSrc} alt="" className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 bg-white object-cover" />
                : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-[14px] font-extrabold text-white">{companyMonogram(company)}</span>}
              <div className="min-w-0 flex-1">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:border-slate-300 active:scale-95">
                  <Upload size={13} strokeWidth={2.4} /> {logoSrc ? "Replace" : "Upload"}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
                    onChange={(e) => { pickLogo(e.target.files && e.target.files[0]); e.target.value = ""; }} />
                </label>
                {logoSrc && placardLogo(company) !== companyLogo(company) && (
                  <button onClick={clearLogo} className="ml-2 text-[11px] font-bold text-slate-400 transition hover:text-slate-600">Use profile logo</button>
                )}
                <p className="mt-1 text-[11px] text-slate-400">{logoBusy || "PNG, JPG or SVG. A square, high-resolution version prints best."}</p>
              </div>
            </div>
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
            <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
              <CheckCircle2 size={14} strokeWidth={2.4} className="mr-1.5 inline-block align-[-2px] text-blue-600" />
              This code is unique to <span className="font-bold text-slate-700">{name}</span> and always opens your profile — never another company's.
            </p>
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
                {r.actor_kind === "admin" && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-500">MineEx</span>}
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
  const statusTone = status === "active" ? "accent" : status === "past_due" ? "rose" : "slate";

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
      <PageTitle title="Billing" sub="Your MineEx subscription and what it includes." />

      <div className={`p-6 ${CARD}`}>
        {plan === undefined ? (
          <div className="h-6 w-40 animate-pulse rounded bg-slate-100" />
        ) : plan === null ? (
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="text-amber-500" />
            <p className="text-[14.5px] text-slate-600">No active subscription found. Contact MineEx to activate your plan.</p>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Current plan</p>
              <p className="mt-1 text-[22px] font-extrabold tracking-tight text-slate-900">{plan.plans?.label || plan.plan_id}</p>
              {plan.renews_at && <p className="mt-1 text-[13px] text-slate-500">Renews {fmtDate(plan.renews_at)}</p>}
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold ${
              statusTone === "accent" ? "bg-blue-50 text-blue-600" : statusTone === "rose" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusTone === "accent" ? "bg-blue-500" : statusTone === "rose" ? "bg-rose-500" : "bg-slate-400"}`} /> {cap(status)}
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
      <p className="mt-4 text-[13px] text-slate-400">Prefer e-transfer or wire? <span className="font-semibold text-slate-500">Contact us and we'll invoice you.</span> Managed plans are arranged directly with MineEx.</p>
    </div>
  );
}

const FEATURE_LABEL = {
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

/* ---------------------------------------------------------------- Settings */

function SettingsView({ company, go, goProfile, onPublished }) {
  // Readiness moved off Home. A missing owner or absent entitlement is a
  // CONFIGURATION problem, so it belongs with the configuration -- not as a
  // permanent yellow band above the controls someone came here to use. The
  // check itself is unchanged; only where it surfaces has moved.
  const [ready, setReady] = useState(null);
  useEffect(() => {
    let alive = true;
    portalReadiness(company.id).then((r) => { if (alive) setReady(r); }).catch(() => {});
    return () => { alive = false; };
  }, [company.id]);

  return (
    <div>
      <PageTitle title="Settings" />

      {ready && !ready.ready && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600"><AlertCircle size={19} /></span>
          <div>
            <p className="text-[14.5px] font-bold text-amber-900">Portal needs attention</p>
            <p className="text-[13px] text-amber-700">Missing: {(ready.missing || []).join(", ")}. Contact MineEx if this persists.</p>
          </div>
        </div>
      )}

      {/* Setup lives here now, not on Home. It carries the only "Go live" button
          in the product, so it cannot simply be deleted -- and a half-finished
          setup is a configuration matter, which is what this page is for. It
          removes itself once every step is done. */}
      {company?.status !== "published" && (
        <div className="mb-6">
          <OnboardingPanel compact company={company} go={go} goProfile={goProfile} onPublished={onPublished} />
        </div>
      )}

      <div className="space-y-4">
        <Field label="Company name" value={company?.name || "—"} />
        <Field label="Profile URL" value={profileUrl(company?.slug) || "—"} />
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
      {msg && <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900"><Check size={13} strokeWidth={2.6} className="text-blue-600" />{msg}</p>}
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
