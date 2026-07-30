import React, { useState, useEffect, useMemo, Suspense } from "react";
import {
  Home as HomeIcon, Radio, Building2, Image as ImageIcon, Calendar, BarChart3,
  ScrollText, CreditCard, Settings as SettingsIcon, ExternalLink, LogOut,
  ChevronDown, CheckCircle2, AlertCircle, ArrowRight, Sparkles, Loader2,
  Plus, Trash2, Clock, TrendingUp, FileText, Radio as RadioIcon, Check, ArrowLeft,
} from "lucide-react";
import { getUser, signOut } from "../lib/auth.js";
import {
  portalReadiness, listActivity, loadPortalCompany, updateCompanyProfile,
  companyStats, logActivity,
} from "../lib/portal.js";
import { fetchPlan, fetchFeatures } from "../lib/features.js";
import { computeHealth } from "./health.js";

// Heavy, already-built surfaces are reused wholesale (never duplicated) and lazily
// loaded so the portal shell stays lean:
const CommsCenter = React.lazy(() => import("../console/CommsCenter.jsx"));  // Broadcast engine
const Documents   = React.lazy(() => import("./Documents.jsx"));             // Organized Media Library
const Onboarding  = React.lazy(() => import("../Onboarding.jsx"));           // Profile builder

// The Company Portal shell. ONE app; the resolved company arrives from PortalGate.
// Every navigation item is a real page: Home, Broadcast, Company Profile, Media,
// Calendar, Analytics, Activity, Billing, Settings. Broadcast/Profile/Media reuse
// the existing console components verbatim so there is a single source of truth.

const NAV = [
  { id: "home",      label: "Home",            Icon: HomeIcon },
  { id: "broadcast", label: "Broadcast",       Icon: Radio },
  { id: "profile",   label: "Company Profile", Icon: Building2 },
  { id: "media",     label: "Media Library",   Icon: ImageIcon },
  { id: "calendar",  label: "Calendar",        Icon: Calendar },
  { id: "analytics", label: "Analytics",       Icon: BarChart3 },
  { id: "activity",  label: "Activity Log",    Icon: ScrollText },
  { id: "billing",   label: "Billing",         Icon: CreditCard },
  { id: "settings",  label: "Settings",        Icon: SettingsIcon },
];

const SectionLoader = () => (
  <div className="grid min-h-[60vh] place-items-center text-slate-300"><Loader2 size={24} className="animate-spin text-emerald-500" /></div>
);

export default function Portal({ company: initial, switchCompany, adminMode = false }) {
  const [section, setSection] = useState("home");
  const [company, setCompany] = useState(initial);

  // Hydrate the full record (with profile JSON) once; PortalGate only passed the lean row.
  useEffect(() => {
    let alive = true;
    loadPortalCompany(initial.id).then((full) => { if (alive && full) setCompany((c) => ({ ...c, ...full })); });
    return () => { alive = false; };
  }, [initial.id]);

  // Broadcast and Profile fill their own full-height scroll area; the other pages
  // (Documents included) sit inside the padded content column.
  const bare = section === "broadcast" || section === "profile";

  return (
    <div className="flex min-h-[100dvh] bg-slate-50 text-slate-900">
      <Sidebar section={section} setSection={setSection} company={company} switchCompany={switchCompany} />
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
              {section === "broadcast" && <CommsCenter company={company} />}
              {section === "profile"   && <Onboarding embedded />}
            </Suspense>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-8 py-10">
              {section === "home"      && <HomeView company={company} go={setSection} />}
              {section === "media"     && <Suspense fallback={<SectionLoader />}><Documents company={company} /></Suspense>}
              {section === "calendar"  && <CalendarView company={company} setCompany={setCompany} />}
              {section === "analytics" && <AnalyticsView company={company} />}
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

function Sidebar({ section, setSection, company, switchCompany }) {
  return (
    <aside className="sticky top-0 flex h-[100dvh] w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 pt-6">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-emerald-600">Passport</p>
        <button
          onClick={switchCompany || undefined}
          disabled={!switchCompany}
          className={`mt-3 flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left ${switchCompany ? "hover:border-slate-300" : "cursor-default"}`}
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200"><Building2 size={16} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-bold text-slate-900">{company?.name || company?.slug || "Company"}</span>
            <span className="block text-[11px] font-medium capitalize text-slate-400">{company?.role || "owner"}</span>
          </span>
          {switchCompany && <ChevronDown size={15} className="text-slate-400" />}
        </button>
      </div>

      <nav className="mt-5 flex-1 space-y-0.5 px-3">
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition ${
              section === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon size={16.5} className={section === id ? "text-white" : "text-slate-400"} />
            <span className="flex-1 text-left">{label}</span>
          </button>
        ))}
      </nav>

      <div className="border-t border-slate-100 px-5 py-4">
        {company?.slug && company?.status === "published" && (
          <a href={`/app?c=${encodeURIComponent(company.slug)}`} target="_blank" rel="noreferrer"
             className="mb-3 flex items-center gap-1.5 text-[12.5px] font-bold text-slate-600 hover:text-slate-900">
            View live profile <ExternalLink size={13} />
          </a>
        )}
        <div className="flex items-center justify-between">
          <span className="min-w-0 truncate text-[12px] text-slate-400">{getUser()?.email}</span>
          <button onClick={() => signOut()} title="Sign out" className="ml-2 shrink-0 text-slate-400 hover:text-slate-600"><LogOut size={15} /></button>
        </div>
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

function HomeView({ company, go }) {
  const [ready, setReady] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    portalReadiness(company.id).then((r) => { if (alive) setReady(r); });
    companyStats(company.id).then((s) => { if (alive) setStats(s); });
    return () => { alive = false; };
  }, [company.id]);

  const health = useMemo(() => computeHealth(company.profile, stats || {}, Date.now()), [company.profile, stats]);
  const first = getUser()?.email?.split("@")[0] || "there";

  return (
    <div>
      <h1 className="text-[26px] font-extrabold tracking-tight text-slate-900">Good to see you, {first}.</h1>
      <p className="mt-1.5 text-[15px] text-slate-500">Here's what {company?.name || "your company"} needs today to keep investors informed.</p>

      {ready && !ready.ready && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertCircle size={22} className="text-amber-600" />
          <div>
            <p className="text-[14.5px] font-bold text-amber-900">Portal needs attention</p>
            <p className="text-[13px] text-amber-700">Missing: {(ready.missing || []).join(", ")}. Contact Passport if this persists.</p>
          </div>
        </div>
      )}

      {/* Health + recommendations */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
        <HealthCard health={health} loading={stats == null} />
        <RecommendationsCard health={health} go={go} />
      </div>

      {/* Stat row — real numbers we actually have */}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Documents filed" value={stats ? stats.documents : "…"} Icon={FileText} />
        <Stat label="Updates written" value={stats ? stats.updates : "…"} Icon={RadioIcon} />
        <Stat label="Published" value={stats ? stats.published : "…"} Icon={Check} />
        <Stat label="Status" value={cap(company?.status || "draft")} Icon={TrendingUp} />
      </div>

      {/* Quick actions */}
      <h2 className="mt-9 text-[13px] font-bold uppercase tracking-wide text-slate-400">Quick actions</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Action title="Broadcast an update" body="Upload once — Passport drafts every channel." Icon={Radio} onClick={() => go("broadcast")} />
        <Action title="Edit company profile" body="Overview, projects, capital, timeline, team." Icon={Building2} onClick={() => go("profile")} />
        <Action title="Upload media" body="Drone footage, core photos, decks, logos." Icon={ImageIcon} onClick={() => go("media")} />
        <Action title="Plan catalysts" body="Track upcoming drilling, assays and studies." Icon={Calendar} onClick={() => go("calendar")} />
      </div>
    </div>
  );
}

function HealthCard({ health, loading }) {
  const { score, band } = health;
  const r = 52, C = 2 * Math.PI * r;
  const off = C * (1 - (loading ? 0 : score) / 100);
  const color = score >= 75 ? "#059669" : score >= 55 ? "#0ea5e9" : score >= 30 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-7">
      <p className="mb-3 self-start text-[12px] font-bold uppercase tracking-wide text-slate-400">Company health</p>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-emerald-500" />
        <p className="text-[13px] font-bold uppercase tracking-wide text-slate-400">Recommended for you</p>
      </div>
      {recs.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 text-[14px] font-semibold text-emerald-600"><CheckCircle2 size={18} /> You're in great shape — nothing urgent.</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {recs.map((rec) => (
            <li key={rec.key}>
              <button onClick={() => go(target(rec.key))} className="group flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/50">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-emerald-600 ring-1 ring-slate-200"><ArrowRight size={14} /></span>
                <span className="flex-1 text-[13.5px] font-semibold text-slate-700">{rec.text}</span>
                {rec.gain > 0 && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">+{rec.gain}</span>}
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
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-slate-400">{label}</p>
        {Icon && <Icon size={15} className="text-slate-300" />}
      </div>
      <p className={`mt-1 text-[24px] font-extrabold tracking-tight ${accent === "emerald" ? "text-emerald-600" : "text-slate-900"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function Action({ title, body, Icon, onClick }) {
  return (
    <button onClick={onClick} className="group flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-emerald-300 hover:shadow-sm">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-600"><Icon size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-bold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-[13px] text-slate-500">{body}</span>
      </span>
      <ArrowRight size={17} className="mt-1 shrink-0 text-slate-300 transition group-hover:text-emerald-500" />
    </button>
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
              <div key={x.id} className={`rounded-2xl border bg-white p-4 ${overdue(x) ? "border-rose-200" : "border-slate-200"}`}>
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

      <h2 className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Your content</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Documents filed" value={stats ? stats.documents : "…"} Icon={FileText} />
        <Stat label="Timeline entries" value={derived.timeline} Icon={ScrollText} />
        <Stat label="Projects" value={derived.projects} Icon={Building2} />
        <Stat label="Updates published" value={stats ? stats.published : "…"} Icon={Radio} />
      </div>

      <h2 className="mt-9 text-[12px] font-bold uppercase tracking-wide text-slate-400">Investor engagement</h2>
      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-6">
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
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
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

  return (
    <div>
      <PageTitle title="Billing" sub="Your Passport subscription and what it includes." />

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
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
              statusTone === "emerald" ? "bg-emerald-50 text-emerald-600" : statusTone === "rose" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusTone === "emerald" ? "bg-emerald-500" : statusTone === "rose" ? "bg-rose-500" : "bg-slate-400"}`} /> {cap(status)}
            </span>
          </div>
        )}
      </div>

      {feats && feats.length > 0 && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Included in your plan</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {feats.map((f) => (
              <li key={f} className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-700">
                <CheckCircle2 size={15} className="text-emerald-500" /> {FEATURE_LABEL[f] || f}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 text-[13px] text-slate-400">To upgrade, downgrade, or change your payment method, contact Passport — we'll take care of it.</p>
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
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
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
