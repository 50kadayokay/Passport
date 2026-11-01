import React, { useState, useEffect, useMemo, Suspense } from "react";
import QRCode from "qrcode";
import {
  Home as HomeIcon, Radio, Building2, Image as ImageIcon, Calendar, BarChart3,
  ScrollText, CreditCard, Settings as SettingsIcon, ExternalLink, LogOut,
  ChevronDown, ChevronRight, CheckCircle2, AlertCircle, ArrowRight, Sparkles, Loader2,
  Plus, Trash2, Clock, TrendingUp, FileText, Radio as RadioIcon, Check, ArrowLeft,
  Megaphone, QrCode, HelpCircle, Copy, Download, Eye, Upload, Send, Mail, Bell,
  Presentation, Brain, PenLine, Users,
} from "lucide-react";
import { getUser, signOut, authHeaders, updatePassword, updateEmail } from "../lib/auth.js";
import { profileUrl, companyLogo, companyMonogram, placardLogo } from "../lib/brand.js";
import { buildPlacardSvg, splitQrSvg, CARD_W, CARD_H, PLACARD_FONT } from "../lib/qrPlacard.js";
import {
  portalReadiness, listActivity, loadPortalCompany, updateCompanyProfile,
  logActivity,
} from "../lib/portal.js";
import { listMembers } from "../lib/team.js";
import { uploadCompanyLogo } from "../lib/storage.js";
import { visibleProfileSections } from "./profileNav.js";
import OnboardingPanel from "./OnboardingPanel.jsx";
import { can } from "../lib/companyRoles.js";
import { checkoutReturn } from "../lib/billing.js";
const Content = React.lazy(() => import("./Content.jsx"));
const Updates = React.lazy(() => import("./Updates.jsx"));
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
const Documents     = React.lazy(() => import("./Documents.jsx"));          // uploaded source files (company memory)
const TeamView      = React.lazy(() => import("./TeamView.jsx"));           // members, roles, invitations (a03)
const BillingView   = React.lazy(() => import("./Billing.jsx"));            // subscription + Stripe hand-offs (a20)

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
    // Publish / Press Releases / Media collapsed into Content; Messages /
    // Notifications / Analytics into Updates. Nothing was dropped -- every one
    // is a tab inside its container, and the old ids still route there (see
    // LEGACY_SECTION in Portal).
    { id: "home",      label: "Home",            Icon: HomeIcon },
    { id: "profile",   label: "Profile",         Icon: Building2 },
    { id: "content",   label: "Content",         Icon: Megaphone },
    { id: "updates",   label: "Updates",         Icon: Bell },
    { id: "sharing",   label: "Conference",      Icon: Presentation },
    { id: "mineiq",    label: "Mine IQ",         Icon: Brain },
    // The files Mine IQ answers from: open, download, upload, delete. Was
    // unreachable after Media dropped it (a28).
    { id: "documents", label: "Documents",       Icon: FileText },
    { id: "services",  label: "Services",        Icon: Sparkles },
  ] },
];

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
// Which section the portal is on, remembered across a reload.
//
// THE BUG THIS FIXES. `section` was plain useState("home"), so every refresh
// dropped the reader back on Home from wherever they were -- MineIQ included,
// which is what made its navigation look broken: you clicked it, it opened, you
// reloaded, and you were somewhere else. Nothing was wrong with the click or
// the lazy import; there was simply nothing holding the choice.
//
// sessionStorage rather than the URL: the portal has never had routable
// section URLs, and inventing a hash scheme now would change what every
// existing link means. Per TAB rather than per browser, so two companies open
// side by side do not fight over one key, and keyed by company id so switching
// company cannot restore a section belonging to the previous one.
const SECTION_KEY = (companyId) => `mineex.portal.section.${companyId || "none"}`;

// Stripe's return URLs land on Settings -> Billing (see billingNotice in Portal).
function billingReturn() {
  try {
    const params = new URLSearchParams(window.location.search);
    return !!checkoutReturn(window.location.search) || params.get("section") === "billing";
  } catch { return false; }
}

function readSection(companyId) {
  try { return sessionStorage.getItem(SECTION_KEY(companyId)) || "home"; }
  catch { return "home"; }       // private mode or blocked storage
}

export default function Portal({ company: initial, switchCompany, adminMode = false, injectedProfile = null, devFeatures = null }) {
  const [section, setSectionRaw] = useState(() => (billingReturn() ? "settings" : readSection(initial && initial.id)));
  // Tabs live HERE, not in the containers, so leaving Content for MineIQ and
  // coming back returns you to the tab you were on.
  const [contentTab, setContentTab] = useState("releases");
  const [contentTakeover, setContentTakeover] = useState(null);
  const [updatesTab, setUpdatesTab] = useState("messages");
  const [sharingTab, setSharingTab] = useState("conference");
  const [settingsTab, setSettingsTab] = useState(() => (billingReturn() ? "billing" : "general"));

  // Back from Stripe (api/stripe-checkout.js success_url / cancel_url, and the
  // Billing Portal's return_url ?section=billing). These used to be ignored:
  // the reader landed on whatever section they had last, with no word on
  // whether the payment went through. Read once, then strip from the URL so a
  // refresh does not repeat the notice.
  const [billingNotice] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const notice = checkoutReturn(window.location.search);
      if (!notice && params.get("section") !== "billing") return null;
      params.delete("checkout"); params.delete("section");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
      return notice || "return";
    } catch { return null; }
  });

  // Publish / Press Releases / Media / Messages / Notifications / Analytics are
  // no longer sidebar destinations, but internal callers still navigate by those
  // ids -- Publish.jsx go("releases") and go("media"). Mapping them here keeps
  // every previously reachable place reachable without touching the callers.
  const setSection = React.useCallback((id) => {
    const mapped = {
      publish:       ["content", "releases"],
      releases:      ["content", "releases"],
      media:         ["content", "media"],
      messages:      ["updates", "messages"],
      notifications: ["updates", "notifications"],
      analytics:     ["updates", "analytics"],
      conference:    ["sharing", "conference"],
      share:         ["sharing", "qr"],
      billing:       ["settings", "billing"],
      team:          ["settings", "team"],
      activity:      ["settings", "activity"],
    }[id];
    if (mapped) {
      const [dest, tab] = mapped;
      setContentTakeover(null);
      // One setter per destination rather than a content/else branch -- with a
      // third consolidated section, `else` would have quietly sent Conference
      // and QR tab ids into the Updates tab state.
      const setTab = { content: setContentTab, updates: setUpdatesTab, sharing: setSharingTab, settings: setSettingsTab }[dest];
      if (setTab) setTab(tab);
      setSectionRaw(dest);
      return;
    }
    if (id !== "content") setContentTakeover(null);
    setSectionRaw(id);
  }, []);

  // Persist on every change, including the ones setSection makes above via the
  // mapped branch -- an effect catches both paths, where writing inside
  // setSection would have missed its own early return.
  useEffect(() => {
    try { sessionStorage.setItem(SECTION_KEY(initial && initial.id), section); } catch { /* ignore */ }
  }, [section, initial]);
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
  const [msgCount, setMsgCount] = useState(0);
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
      // Messages unread, from the SAME source the inbox uses
      // (conversations.company_read_at vs last_message_at). Counted separately
      // and never merged -- a conversation and a notification about it are two
      // different things, and adding them would double-count.
      try {
        const mm = await import("../lib/messages.js");
        const convs = await mm.listConversations(initial.slug);
        if (alive) setMsgCount((convs || []).filter((c) => mm.isUnread(c, initial.id)).length);
      } catch (_) { /* messaging not provisioned -- leave at 0 */ }
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
  // `bare` sections lay themselves out: no mx-auto max-w-6xl, no px-8 py-10.
  // MineIQ is one because its history sidebar has to meet the portal's own
  // navigation with nothing between them and run the full height of the
  // content area. Inside the padded wrapper it could only ever be a card
  // floating in the middle of the page.
  const bare = section === "press" || section === "broadcast" || section === "profile"
            || section === "mineiq";

  return (
    <div className="flex min-h-[100dvh] bg-white text-slate-900">
      <Sidebar section={section} setSection={setSection} company={company} switchCompany={switchCompany}
        profileNav={{ tab: profTab, step: profStep, go: goProfile }} notifCount={notifCount} msgCount={msgCount} />
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
          <div className={`min-h-0 flex-1 ${section === "mineiq" ? "overflow-hidden" : "overflow-y-auto"}`}>
            <Suspense fallback={<SectionLoader />}>
              {/* Legacy composer: no navigation reaches it; gated anyway so a future link cannot expose it to read-only roles. */}
              {(section === "press" || section === "broadcast") && can(company?.role || "owner", "draftContent") && <CommsCenter company={company} devFeatures={devFeatures} />}
              {section === "profile"   && <Suspense fallback={<SectionLoader />}><ProfileEditor company={company} injectedProfile={injectedProfile} navTab={profTab} navStep={profStep} onNav={(t, s) => { setProfTab(t); setProfStep(s); }} /></Suspense>}
              {section === "mineiq"    && <MineIQ company={company} go={setSection} />}
            </Suspense>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-8 py-10">
              {section === "home"      && <HomeView company={company} go={setSection}
                  openContent={(tab, takeover) => { setContentTab(tab); setContentTakeover(takeover || null); setSectionRaw("content"); }}
                  openUpdates={() => setSectionRaw("updates")}
                  updatesCount={notifCount + msgCount} />}
              {section === "content"   && <Suspense fallback={<SectionLoader />}><Content company={company} tab={contentTab} setTab={setContentTab} go={setSection} takeover={contentTakeover} setTakeover={setContentTakeover} /></Suspense>}
              {section === "updates"   && <Suspense fallback={<SectionLoader />}><Updates company={company} tab={updatesTab} setTab={setUpdatesTab} msgCount={msgCount} notifCount={notifCount} onNotificationsSeen={() => setNotifCount(0)} /></Suspense>}
              {section === "publish"   && <Suspense fallback={<SectionLoader />}><Publish company={company} go={setSection} view="publish" /></Suspense>}
              {section === "releases"  && <Suspense fallback={<SectionLoader />}><Publish company={company} go={setSection} view="releases" /></Suspense>}
              {section === "messages"  && <Suspense fallback={<SectionLoader />}><Messages company={company} /></Suspense>}
              {section === "notifications" && <Suspense fallback={<SectionLoader />}><Notifications company={company} onSeen={() => setNotifCount(0)} /></Suspense>}
              {section === "services"  && <Suspense fallback={<SectionLoader />}><Services company={company} /></Suspense>}
              {section === "documents" && <Suspense fallback={<SectionLoader />}><Documents company={company} /></Suspense>}
              {section === "media"     && <Suspense fallback={<SectionLoader />}><MediaPage company={company} /></Suspense>}
              {section === "sharing"   && <ConferenceShareView company={company} tab={sharingTab} setTab={setSharingTab} />}
              {section === "calendar"  && <CalendarView company={company} setCompany={setCompany} />}
              {section === "analytics" && <Suspense fallback={<SectionLoader />}><Analytics company={company} /></Suspense>}
              {section === "activity"  && <ActivityView company={company} />}
              {section === "settings"  && <SettingsView company={company} tab={settingsTab} setTab={setSettingsTab} go={setSection} goProfile={goProfile} onPublished={() => setCompany((c) => ({ ...c, status: "published" }))}
                  billingNotice={billingNotice === "return" ? null : billingNotice} />}
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
function Sidebar({ section, setSection, company, switchCompany, profileNav = null, notifCount = 0, msgCount = 0 }) {
  const navRef = React.useRef(null);
  const activeKey = `${section}:${profileNav ? profileNav.tab : ""}:${profileNav ? profileNav.step : ""}`;

  // Whether the Company Profile sub-tree is folded open. This has to be its
  // OWN state: it used to be derived purely from `section === "profile"`, so
  // the chevron offered a collapse that could not happen -- clicking the
  // parent just re-selected the section it was already on, and the tree stayed
  // open. You cannot fold the tree by leaving the page, because leaving the
  // page is not what the user is asking for when they click the chevron.
  const [profileOpen, setProfileOpen] = React.useState(true);

  // Re-open on ARRIVAL at the profile section, so a tree left collapsed does
  // not stay collapsed when the user later navigates in from somewhere else
  // (a homepage card, a sub-page link) and expects to see where they landed.
  // Keyed on the transition, not on `section` being profile, or it would fight
  // the toggle above on every render while already there.
  const wasProfile = React.useRef(section === "profile");
  React.useEffect(() => {
    const isNow = section === "profile";
    if (isNow && !wasProfile.current) setProfileOpen(true);
    wasProfile.current = isNow;
  }, [section]);
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
                const onProfile = isProfile && section === "profile";
                const expanded = onProfile && profileNav && profileOpen;
                // The Company Profile parent shows an OPEN state when expanded but never the
                // accent pill — that is reserved for the one selected sub-page, so exactly one
                // item ever reads as active. It keeps that state while COLLAPSED too, keyed on
                // `onProfile` rather than `expanded`: folding the tree shut does not mean you
                // left the page, and the current section should not look unselected.
                const parentStrong = on && !isProfile;
                return (
                  <div key={id}>
                    <button
                      onClick={() => {
                        if (onProfile) { setProfileOpen((v) => !v); return; }
                        if (isProfile) setProfileOpen(true);
                        setSection(id);
                      }}
                      aria-expanded={isProfile ? Boolean(expanded) : undefined}
                      data-navactive={parentStrong ? "1" : undefined}
                      className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-[13.5px] font-bold tracking-tight transition active:scale-[0.99] ${
                        parentStrong ? "bg-blue-50 text-blue-600"
                        : onProfile ? "text-slate-900"
                        : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Icon size={16.5} strokeWidth={parentStrong ? 2.4 : 2.2}
                        className={parentStrong ? "text-blue-600" : onProfile ? "text-slate-700" : "text-slate-400 group-hover:text-slate-600"} />
                      <span className="flex-1 text-left">{label}</span>
                      {id === "updates" && (notifCount + msgCount) > 0 && (
                        <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-blue-600 px-1 text-[10.5px] font-bold text-white">
                          {notifCount + msgCount > 99 ? "99+" : notifCount + msgCount}
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
        {/* Settings lives down here with the account actions rather than in the
            nav. It is the only footer entry that is a DESTINATION, so it is the
            only one that takes the accent when selected. */}
        <button onClick={() => setSection("settings")}
          data-navactive={section === "settings" ? "1" : undefined}
          className={`mt-0.5 flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-[12.5px] font-bold transition active:scale-[0.99] ${
            section === "settings" ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50"
          }`}>
          <SettingsIcon size={14} strokeWidth={2.4} className={section === "settings" ? "text-blue-600" : "text-slate-400"} /> Settings
        </button>
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
// Home is a launchpad, not a dashboard. Six verbs, no statistics -- a company
// arriving here wants to DO something, and the sidebar already lists where
// everything lives. Duplicating it as a grid of links would just be the sidebar
// again, larger.
//
// Every tile hands off to an existing destination. None of them owns logic.
function HomeView({ company, go, openContent, openUpdates, updatesCount = 0 }) {
  const live = profileUrl(company?.slug);
  const role = company?.role || "owner";

  const actions = [
    // a03: tiles a role cannot use are left out rather than shown to refuse.
    can(role, "draftContent") && { id: "pr",      Icon: Upload,    title: "Publish Press Release",
      sub: "Upload a release and put it on your profile.",
      onClick: () => openContent("releases", "releases") },
    can(role, "publishContent") && { id: "media",   Icon: ImageIcon, title: "Publish Media",
      sub: "Add photos or video investors will see.",
      onClick: () => openContent("media", "media") },
    can(role, "draftContent") && { id: "draft",   Icon: PenLine,   title: "Draft Press Release",
      sub: "Write one with MineEx, from your own facts.",
      onClick: () => openContent("releases", "draft") },
    { id: "mineiq",  Icon: Brain,     title: "Ask MineIQ",
      sub: "Your company's own knowledge, answered.",
      onClick: () => go("mineiq") },
    { id: "live",    Icon: Eye,       title: "View Live Profile",
      sub: "See exactly what investors see.",
      href: live || undefined },
    { id: "updates", Icon: Bell,      title: "Updates",
      sub: "Messages, notifications and analytics.",
      badge: updatesCount, onClick: () => openUpdates() },
  ].filter(Boolean);

  return (
    <div>
      <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-slate-900">What would you like to do?</h1>
      <p className="mt-1.5 text-[15px] text-slate-500">Manage {company?.name || "your company"}&rsquo;s MineEx presence.</p>

      {/* Built to the SIDEBAR's system, because these launch the same places
          the sidebar does and there is no reason the same destination should
          wear a different face on each surface: slate neutrals on white,
          cobalt as the ONE accent, hairline borders, rounded-2xl hit areas,
          heavy lucide strokes.

          The cards are no longer forced to 1:1. A square card in this language
          is mostly empty -- which was the first version of this page, and the
          first thing that got rejected. Height comes from the content, and the
          grid equalises each row. */}
      <div className="mt-6 grid max-w-[980px] grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {actions.map(({ id, Icon, title, sub, onClick, href, badge }) => {
          const inner = (
            <>
              {/* One cube colour for all six: the sidebar's active nav state,
                  blue-50 on blue-600. The portal's system has exactly ONE
                  accent, so a per-action hue would be six accents competing
                  with it -- and the colour would carry no meaning anyway,
                  since the icon already says which action this is.

                  rounded-xl rather than the sidebar's rounded-2xl so it reads
                  as a block with corners rather than a pill, with an inset
                  ring a step deeper than the fill for an edge. Hover deepens
                  the fill; it never changes hue. */}
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 transition group-hover:bg-blue-100">
                <Icon size={20} strokeWidth={2.2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[14px] font-bold tracking-tight text-slate-900">{title}</span>
                  {badge > 0 && (
                    <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-blue-600 px-1 text-[10.5px] font-bold text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-500">{sub}</span>
              </span>
              <ChevronRight size={15} strokeWidth={2.4} className="mt-1 shrink-0 text-slate-300 transition group-hover:text-slate-400" />
            </>
          );
          const cls = "group flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-slate-200 active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none";
          return href
            ? <a key={id} href={href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
            : <button key={id} onClick={onClick} className={cls}>{inner}</button>;
        })}
      </div>
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

// Conference & Sharing — one destination, two tabs.
//
// WHY THIS IS IN Portal.jsx AND NOT ITS OWN FILE
// ----------------------------------------------
// Content.jsx and Updates.jsx are separate files because their children are
// separate modules. QRShareView is NOT: it is defined below in this file and
// leans on local helpers (placardToPng, textWidth, CARD_W/CARD_H). Giving this
// wrapper its own file would mean either exporting QRShareView and importing
// it back -- a cycle, since Portal would import the wrapper -- or moving the
// placard and QR generation into a new module. The brief says not to rebuild
// QR generation, and moving it is a rebuild's worth of risk for a tab bar.
//
// IT OWNS NO FEATURE LOGIC. Both children are the existing components with
// their own headings suppressed; nothing about the booth, the QR destination
// or the entitlement behaviour is touched here.
//
// Tab state is LIFTED to Portal so the tab survives leaving the section, and
// so the legacy "conference" / "share" ids can select a tab on the way in.
const SHARING_TABS = [
  { id: "conference", label: "Conference Mode", Icon: Presentation,
    sub: "A full-screen booth for your stand. Visitors scan the code and land on your investor profile." },
  { id: "qr", label: "QR & Share", Icon: QrCode,
    sub: "Drive investors to your MineEx profile and encourage them to follow your company." },
];

function ConferenceShareView({ company, tab = "conference", setTab }) {
  const active = SHARING_TABS.some((t) => t.id === tab) ? tab : "conference";
  // One heading for the page, but the sub follows the tab -- the two tools do
  // genuinely different things, and a single blended sentence would describe
  // neither. This is what the children's own headings used to say.
  const sub = (SHARING_TABS.find((t) => t.id === active) || SHARING_TABS[0]).sub;

  return (
    <div>
      <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Conference</h1>
      <p className="mt-1 text-[14px] text-slate-500">{sub}</p>

      <div className="mt-5 flex items-center gap-1 border-b border-slate-100">
        {SHARING_TABS.map(({ id, label, Icon }) => {
          const on = id === active;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={on ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13.5px] font-bold tracking-tight transition ${
                on ? "border-blue-600 text-blue-600"
                   : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <Icon size={15.5} strokeWidth={on ? 2.4 : 2.2} />
              {label}
            </button>
          );
        })}
      </div>

      {/* The inactive tab is not mounted, matching Content and Updates. */}
      <div className="mt-6">
        {active === "conference"
          ? <Suspense fallback={<SectionLoader />}><Conference company={company} hideHeading /></Suspense>
          : <QRShareView company={company} hideHeading />}
      </div>
    </div>
  );
}

function QRShareView({ company, hideHeading = false }) {
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

  const pickLogo = async (file) => {
    if (!file) return;
    setLogoBusy("Uploading…");
    try {
      const url = await uploadCompanyLogo(file);
      if (!url) { setLogoBusy("Upload failed"); setTimeout(() => setLogoBusy(""), 2600); return; }
      const nextProfile = { ...(company.profile || {}), brand: { ...((company.profile || {}).brand || {}), qrLogo: url } };
      const saved = await updateCompanyProfile(company.id, nextProfile);
      setLogoSrc(url);
      // A refused save is said plainly: the logo is used for this download
      // only, and the profile keeps its previous one.
      setLogoBusy(saved ? "Saved" : "Not saved to your profile (only the account owner or MineEx can change it) — used for this download only");
      if (saved) setTimeout(() => setLogoBusy(""), 2600);
    } catch (_) {
      setLogoBusy("Upload failed"); setTimeout(() => setLogoBusy(""), 2600);
    }
  };
  const clearLogo = async () => {
    const nextProfile = { ...(company.profile || {}), brand: { ...((company.profile || {}).brand || {}), qrLogo: "" } };
    const saved = await updateCompanyProfile(company.id, nextProfile).catch(() => null);
    if (!saved) { setLogoBusy("Couldn't change the logo — only the account owner or MineEx can."); return; }
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
        {!hideHeading && <PageTitle title="QR & Share" sub="Drive investors to your MineEx profile." />}
        <div className={`p-6 ${CARD}`}><p className="text-[14px] text-slate-500">Your company needs a public profile URL before a QR code can be generated.</p></div>
      </div>
    );
  }

  return (
    <div>
      {!hideHeading && <PageTitle title="QR & Share" sub="Drive investors to your MineEx profile and encourage them to follow your company." />}

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
          {/* Same warning as the Conference QR panel: until the profile is
              published the code resolves to a page the public can't see. */}
          {company?.status !== "published" && (
            <p className="mt-3 w-full rounded-xl bg-amber-50 px-3.5 py-3 text-[12px] leading-relaxed text-amber-800 ring-1 ring-inset ring-amber-100" data-qr-not-published>
              <span className="font-bold">Not ready to print.</span> Your profile isn't published, so this code currently opens a page the public can't see. Publish it before the artwork goes to a printer.
            </p>
          )}

          {/* Placard logo — upload a dedicated print version if the profile one isn't right. */}
          <div className="mt-5 w-full border-t border-slate-100 pt-4">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400">Logo on the placard</p>
            <div className="mt-2.5 flex items-center gap-3">
              {logoSrc
                ? <img src={logoSrc} alt="" className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 bg-white object-cover" />
                : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-[14px] font-extrabold text-white">{companyMonogram(company)}</span>}
              {/* The placard logo is written straight to the LIVE profile
                  (profile.brand), so it follows the profile-publish roles. */}
              {!can(company?.role || "owner", "publishProfile") ? (
                <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-slate-500" data-readonly-brand>
                  Only an owner or admin can change the placard logo. You can still download the placard.
                </p>
              ) : (
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
              )}
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
  const [saveErr, setSaveErr] = useState("");
  // Catalysts are written straight to the LIVE profile.
  const canEdit = can(company?.role || "owner", "publishProfile");

  const addItem = () => { setItems((xs) => [...xs, { id: uid(), title: "", type: "Drilling", expected: "", status: "upcoming", note: "" }]); setDirty(true); };
  const patch = (id, k, v) => { setItems((xs) => xs.map((x) => (x.id === id ? { ...x, [k]: v } : x))); setDirty(true); };
  const remove = (id) => { setItems((xs) => xs.filter((x) => x.id !== id)); setDirty(true); };

  const save = async () => {
    setSaving(true);
    const clean = items.filter((x) => (x.title || "").trim());
    const nextProfile = { ...(company.profile || {}), catalysts: clean };
    const saved = await updateCompanyProfile(company.id, nextProfile);
    setSaveErr(saved ? "" : "Not saved. Only the account owner or MineEx can change the live profile's catalysts — your edits are still here.");
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
          {saveErr && <span role="alert" className="max-w-[340px] text-[12px] font-semibold text-rose-600" data-save-error>{saveErr}</span>}
          {dirty && !saveErr && <span className="text-[12px] font-semibold text-amber-600">Unsaved changes</span>}
          {canEdit && <button onClick={save} disabled={saving || !dirty}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13.5px] font-bold text-white ${dirty ? "bg-slate-900" : "bg-slate-300"} ${saving ? "opacity-60" : ""}`}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save
          </button>}
        </div>
      </div>

      {!canEdit && <p className="mt-2 text-[12.5px] text-slate-500" data-readonly-calendar>Read only. Catalysts are part of the live profile, which an owner or admin changes.</p>}
      <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0">
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
      </fieldset>
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
  // Recorded by the server (a25).
  release_published: "Release published",
  release_unpublished: "Release taken down",
  release_corrected: "Release corrected",
  media_published: "Media posted",
  media_unpublished: "Media taken down",
  media_post_deleted: "Media deleted permanently",
  profile_published: "Profile published",
  profile_draft_discarded: "Profile draft discarded",
  profile_version_restored_to_draft: "Earlier version restored to draft",
  member_invited: "Member invited",
  member_joined: "Member joined",
  member_removed: "Member removed",
  member_role_changed: "Member role changed",
  invitation_revoked: "Invitation revoked",
};

// What changed, as short "before -> after" lines, from a row's old/new values.
// Long text (a corrected release body) is shown in full only when expanded.
function changeLines(r) {
  const o = r.old_value && typeof r.old_value === "object" ? r.old_value : {};
  const n = r.new_value && typeof r.new_value === "object" ? r.new_value : {};
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !/(_id|^id)$/.test(k));
  const show = (v) => (v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return keys.filter((k) => show(o[k]) !== show(n[k])).map((k) => ({ k: k.replace(/_/g, " "), before: k in o ? show(o[k]) : null, after: k in n ? show(n[k]) : null }));
}

function ActivityRowDetail({ r }) {
  const lines = changeLines(r);
  if (!lines.length) return null;
  return (
    <dl className="mt-2 space-y-1.5 rounded-lg bg-slate-50 px-3 py-2.5 text-[12px]">
      {lines.map((l) => (
        <div key={l.k}>
          <dt className="font-bold uppercase tracking-wide text-[10px] text-slate-400">{l.k}</dt>
          <dd className="whitespace-pre-wrap break-words text-slate-600">
            {l.before != null && <span className="text-slate-400 line-through decoration-slate-300">{l.before}</span>}
            {l.before != null && l.after != null && <span className="text-slate-300"> → </span>}
            {l.after != null && <span>{l.after}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ActivityView({ company, hideHeading = false }) {
  const [rows, setRows] = useState(null);
  const [who, setWho] = useState({});       // actor_id -> email (team list; former members show as "a former member")
  const [open, setOpen] = useState(null);
  useEffect(() => { let alive = true; listActivity(company.id).then((r) => { if (alive) setRows(r); }); return () => { alive = false; }; }, [company.id]);
  useEffect(() => {
    let alive = true;
    listMembers(company.id).then((m) => { if (alive && m && m.ok) setWho(Object.fromEntries((m.members || []).map((x) => [x.user_id, x.email]))); });
    return () => { alive = false; };
  }, [company.id]);
  const actorName = (r) => (r.actor_kind === "admin" ? "MineEx" : r.actor_id ? who[r.actor_id] || "A former member" : r.actor_kind === "system" ? "System" : "");

  return (
    <div>
      {hideHeading
        ? <p className="mb-4 text-[13.5px] text-slate-500">An append-only record of every change: who made it, when, and what changed. History can't be rewritten.</p>
        : <PageTitle title="Activity log" sub="An append-only record of every change. History can't be rewritten — members can add to it but never erase it." />}
      <div className={`overflow-hidden ${CARD}`}>
        {rows == null ? (
          <div className="p-6"><div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" /></div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <ScrollText size={26} className="mx-auto text-slate-300" />
            <p className="mt-3 text-[14px] font-semibold text-slate-500">No activity yet</p>
            <p className="mt-1 text-[13px] text-slate-400">Publishing, corrections, take-downs, profile changes and team changes will appear here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-4 px-5 py-3.5">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${r.actor_kind === "admin" ? "bg-indigo-50 text-indigo-500" : "bg-slate-100 text-slate-500"}`}><ScrollText size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-slate-800">{ACTION_LABEL[r.action] || r.action}{r.entity ? <span className="font-normal text-slate-400"> · {r.entity}</span> : null}</span>
                  {actorName(r) && <span className="block truncate text-[12.5px] text-slate-500">by {actorName(r)}</span>}
                  {r.reason && <span className="block truncate text-[12.5px] text-slate-400">{r.reason}</span>}
                  {changeLines(r).length > 0 && (
                    <button onClick={() => setOpen(open === r.id ? null : r.id)} className="mt-1 inline-flex items-center gap-1 text-[12px] font-bold text-blue-600 hover:text-blue-700">
                      {open === r.id ? <ChevronDown size={12} strokeWidth={2.6} /> : <ChevronRight size={12} strokeWidth={2.6} />} What changed
                    </button>
                  )}
                  {open === r.id && <ActivityRowDetail r={r} />}
                </span>
                {r.actor_kind === "admin" && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-500">MineEx</span>}
                {/* a03 / 0076: source 'ui' is reserved for entries a member's browser
                    reported; everything else was recorded by the server itself. */}
                {r.source === "ui" && <span title="Recorded by a member's browser, not by the server" className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">Reported in portal</span>}
                <span className="shrink-0 text-[12px] text-slate-400">{fmtDate(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Settings */

function SettingsView({ company, tab = "general", setTab, go, goProfile, onPublished, billingNotice = null }) {
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

  const active = tab === "billing" || tab === "team" || tab === "activity" ? tab : "general";
  const TABS = [{ id: "general", label: "General", Icon: SettingsIcon },
                { id: "team", label: "Team", Icon: Users },
                { id: "activity", label: "Activity log", Icon: ScrollText },
                { id: "billing", label: "Billing", Icon: CreditCard }];

  return (
    <div>
      <PageTitle title="Settings" />

      {/* Same tab language as Content, Updates and Conference. Billing used to
          be its own sidebar entry; it is one panel of account configuration,
          so it belongs here rather than competing for a top-level slot. */}
      <div className="-mt-3 mb-6 flex items-center gap-1 border-b border-slate-100">
        {TABS.map(({ id, label, Icon }) => {
          const on = id === active;
          return (
            <button key={id} onClick={() => setTab && setTab(id)}
              aria-current={on ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13.5px] font-bold tracking-tight transition ${
                on ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-900"
              }`}>
              <Icon size={15.5} strokeWidth={on ? 2.4 : 2.2} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Billing is for owners and company admins (F2); the server enforces it. */}
      {active === "billing" && <Suspense fallback={<SectionLoader />}><BillingView company={company} hideHeading notice={billingNotice}
          canManage={can(company?.role || "owner", "manageBilling")} /></Suspense>}
      {active === "team" && <Suspense fallback={<SectionLoader />}><TeamView company={company} /></Suspense>}
      {/* a25: the audit trail was rendered only for section "activity", which no
          navigation reached. It belongs beside the team who make the changes. */}
      {active === "activity" && <ActivityView company={company} hideHeading />}

      {active === "general" && (<>

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
      </>)}
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
