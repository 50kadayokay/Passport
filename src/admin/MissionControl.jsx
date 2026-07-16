import React, { useState, useEffect } from "react";
import {
  LayoutDashboard, Building2, Users as UsersIcon, ClipboardCheck, TrendingUp,
  BarChart3, Sparkles, Radio, Star, Bell, Briefcase, CreditCard, LifeBuoy,
  FolderOpen, Search, Activity, ScrollText, Settings,
  LogOut, Loader2, Circle, CheckCircle2, ExternalLink, Plus, ArrowRight, RefreshCw, AlertTriangle, Inbox, Link2,
} from "lucide-react";
import { fetchCompanies, updateCompany, SUPABASE_URL } from "../lib/supabase.js";
import { authHeaders, getUser, signOut } from "../lib/auth.js";
import Admin from "./Admin.jsx";

// Sidebar organized into business areas. `ready` = wired to live data; the rest
// show honest "not built yet" states (never fabricated numbers).
const NAV = [
  { group: "Mission Control", items: [
    { id: "home", label: "Home", Icon: LayoutDashboard, ready: true },
    { id: "sales", label: "Sales", Icon: TrendingUp, need: "Stripe billing + CRM" },
    { id: "publish", label: "Ready for Publish", Icon: Inbox, ready: true },
    { id: "companies", label: "Companies", Icon: Building2, ready: true },
    { id: "users", label: "Users", Icon: UsersIcon, ready: true },
    { id: "operations", label: "Operations", Icon: ClipboardCheck, ready: true },
  ]},
  { group: "Product", items: [
    { id: "analytics", label: "Analytics", Icon: BarChart3, need: "the events table (Phase 6)" },
    { id: "ai", label: "AI Workspace", Icon: Sparkles, need: "the AI generation pipeline" },
    { id: "pulse", label: "Pulse", Icon: Radio, need: "the content/news pipeline" },
    { id: "featured", label: "Featured Companies", Icon: Star, need: "a featured-slots table" },
    { id: "notifications", label: "Notifications", Icon: Bell, need: "push + a broadcasts table" },
  ]},
  { group: "Business", items: [
    { id: "crm", label: "CRM", Icon: Briefcase, need: "a leads/pipeline table" },
    { id: "billing", label: "Billing", Icon: CreditCard, need: "Stripe (Phase 5)" },
    { id: "support", label: "Support", Icon: LifeBuoy, need: "a tickets table" },
  ]},
  { group: "System", items: [
    { id: "content", label: "Content Library", Icon: FolderOpen, need: "Supabase Storage buckets" },
    { id: "index", label: "Search Index", Icon: Search, need: "the search/embeddings jobs" },
    { id: "health", label: "API Health", Icon: Activity, need: "external service monitors" },
    { id: "logs", label: "System Logs", Icon: ScrollText, need: "an audit-log table" },
    { id: "settings", label: "Settings", Icon: Settings, need: "a platform-config table" },
  ]},
];
const READY = new Set(["home", "publish", "companies", "users", "operations"]);
const flat = (id) => NAV.flatMap((g) => g.items).find((i) => i.id === id) || {};

const isPublished = (c) => (c.status || "").toLowerCase() === "published";
const isIncomplete = (c) => { const p = c.profile || {}; const hasStatus = (p.companyStatus?.statusHeadline || "").trim(); const hasProjects = (p.projects || []).length; return !hasStatus && !hasProjects; };
const isToday = (iso) => { if (!iso) return false; const d = new Date(iso); return d.toDateString() === new Date().toDateString(); };
const timeAgo = (iso) => { if (!iso) return ""; const s = (Date.now() - new Date(iso).getTime()) / 1000; if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; };

export default function MissionControl() {
  const [section, setSection] = useState("home");
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const h = await authHeaders();
      const [cos, us] = await Promise.all([
        fetchCompanies(h).catch(() => []),
        fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,email,role,created_at&order=created_at.desc`, { headers: h }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]);
      setCompanies(cos || []); setUsers(us || []); setSynced(new Date());
    } finally { setLoading(false); }
  };
  useEffect(() => { loadData(); }, []);

  const go = setSection;
  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 text-slate-900">
      {/* SIDEBAR */}
      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-[13px] font-extrabold text-white">P</div>
          <span className="text-[15px] font-extrabold tracking-tight">Mission Control</span>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((g) => (
            <div key={g.group} className="mb-4">
              <p className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{g.group}</p>
              {g.items.map(({ id, label, Icon, ready }) => {
                const on = section === id;
                return (
                  <button key={id} onClick={() => setSection(id)}
                    className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition ${on ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}>
                    <Icon size={17} className={on ? "text-slate-900" : "text-slate-400"} />
                    <span className="flex-1 text-left">{label}</span>
                    {!READY.has(id) && <span className="h-1.5 w-1.5 rounded-full bg-slate-200" title="Not built yet" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* MAIN */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex flex-1 items-center gap-2.5 rounded-lg bg-slate-100 px-3.5 py-2 text-slate-400">
            <Search size={16} />
            <input placeholder="Search companies, users, tickers…" className="w-full bg-transparent text-[13.5px] text-slate-700 placeholder:text-slate-400 outline-none"
              onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value.trim()) setSection("companies"); }} />
          </div>
          <span className="flex items-center gap-1.5 text-[12px] text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-amber-400" : "bg-emerald-500"}`} />
            {loading ? "Syncing…" : synced ? `Updated ${timeAgo(synced.toISOString())}` : ""}
          </span>
          <button onClick={loadData} title="Refresh" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
          <span className="text-[13px] font-medium text-slate-500">{getUser()?.email}</span>
          <button onClick={async () => { await signOut(); location.assign("/admin"); }} title="Sign out" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:text-rose-500"><LogOut size={16} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {section === "companies" ? <Admin /> : (
            <div className="h-full overflow-y-auto px-8 py-7">
              {section === "home" && <Home companies={companies} users={users} loading={loading} go={go} />}
              {section === "publish" && <ReadyForPublish companies={companies} reload={loadData} loading={loading} />}
              {section === "operations" && <Operations companies={companies} reload={loadData} go={go} />}
              {section === "users" && <UsersSection users={users} loading={loading} />}
              {section === "sales" && <SalesEmpty />}
              {!READY.has(section) && <Stub id={section} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============= READY FOR PUBLISH — the concierge publishing folder ============= */
const statusOf = (c) => (c.status || "draft").toLowerCase();
const logoOf = (c) => {
  const p = c.profile || {};
  return (p.company && (p.company.logo || p.company.brand)) || (p.pp && (p.pp.AVATAR || p.pp.LOGO)) || "";
};
const initialsOf = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

function CompanyTile({ c, selectable, selected, onSelect, onPreview }) {
  const logo = logoOf(c);
  return (
    <div className="group relative flex flex-col items-center">
      {selectable && (
        <button onClick={(e) => { e.stopPropagation(); onSelect(c.slug); }}
          className={`absolute left-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-md border-2 transition ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-transparent hover:border-slate-500"}`}>
          <CheckCircle2 size={13} />
        </button>
      )}
      <button onClick={() => onPreview(c)} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-md">
        <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-2xl bg-slate-100 text-[20px] font-extrabold text-slate-400">
          {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : initialsOf(c.name)}
        </div>
        <p className="mt-3 truncate text-[14px] font-bold tracking-tight text-slate-900">{c.name || c.slug}</p>
        <p className="truncate text-[11.5px] font-medium text-slate-400">{c.primary_ticker || c.slug}</p>
      </button>
    </div>
  );
}

function ReadyForPublish({ companies, reload, loading }) {
  const ready = companies.filter((c) => statusOf(c) === "ready");
  const live = companies.filter((c) => statusOf(c) === "published");
  const archived = companies.filter((c) => statusOf(c) === "archived");
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const toggle = (slug) => setSel((s) => { const n = new Set(s); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  const setStatus = async (slugs, status) => {
    setBusy(true);
    try { const h = await authHeaders(); await Promise.all(slugs.map((slug) => updateCompany(slug, { status }, h))); setSel(new Set()); await reload(); }
    finally { setBusy(false); }
  };

  if (preview) return <PreviewPane c={preview} onClose={() => setPreview(null)} />;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">Ready for Publish</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Completed profiles. Select the ones to take live, then publish.</p>
        </div>
        <a href="/onboarding?new=1" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white"><Plus size={16} /> Onboard a company</a>
      </div>

      {/* READY */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-400">Ready — {ready.length}</h2>
        {sel.size > 0 && (
          <button onClick={() => setStatus([...sel], "published")} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} Publish {sel.size} selected
          </button>
        )}
      </div>
      {loading ? <p className="mt-4 text-[13px] text-slate-400">Loading…</p>
        : ready.length === 0 ? <EmptyFolder text="No profiles are ready yet. Onboard a company and click Complete." />
        : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {ready.map((c) => <CompanyTile key={c.slug} c={c} selectable selected={sel.has(c.slug)} onSelect={toggle} onPreview={setPreview} />)}
          </div>
        )}

      {/* LIVE */}
      <h2 className="mt-10 text-[13px] font-bold uppercase tracking-wider text-slate-400">Live on the app — {live.length}</h2>
      {live.length === 0 ? <EmptyFolder text="Nothing is live yet." />
        : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {live.map((c) => (
              <div key={c.slug} className="relative">
                <CompanyTile c={c} onPreview={setPreview} />
                <button onClick={() => setStatus([c.slug], "archived")} disabled={busy} title="Archive (remove from app)"
                  className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-md border border-slate-200 bg-white text-slate-400 hover:text-rose-500">
                  <Inbox size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

      {/* ARCHIVED */}
      {archived.length > 0 && (
        <>
          <h2 className="mt-10 text-[13px] font-bold uppercase tracking-wider text-slate-400">Archived — {archived.length}</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {archived.map((c) => (
              <div key={c.slug} className="relative opacity-70">
                <CompanyTile c={c} onPreview={setPreview} />
                <button onClick={() => setStatus([c.slug], "published")} disabled={busy}
                  className="absolute right-2 top-2 z-10 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:text-emerald-600">Restore</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyFolder({ text }) {
  return (
    <div className="mt-4 grid place-items-center rounded-2xl border border-dashed border-slate-200 py-14 text-center">
      <Inbox size={22} className="text-slate-300" />
      <p className="mt-2 max-w-[280px] text-[13px] font-medium text-slate-400">{text}</p>
    </div>
  );
}

/* Preview a company as it appears in the app (left) with an Edit action (right). */
function PreviewPane({ c, onClose }) {
  const previewUrl = `/app?c=${encodeURIComponent(c.slug)}${c.preview_token ? `&preview=${c.preview_token}` : ""}`;
  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 pb-4">
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900"><ArrowRight size={16} className="rotate-180" /></button>
        <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg bg-slate-100 text-[13px] font-extrabold text-slate-400">
          {logoOf(c) ? <img src={logoOf(c)} alt="" className="h-full w-full object-cover" /> : initialsOf(c.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-extrabold tracking-tight text-slate-900">{c.name || c.slug}</p>
          <p className="text-[12px] font-medium capitalize text-slate-400">{statusOf(c)}</p>
        </div>
        <a href={`/onboarding?company=${encodeURIComponent(c.slug)}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-slate-700 hover:border-slate-300"><Settings size={15} /> Edit</a>
        <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-slate-700 hover:border-slate-300"><ExternalLink size={15} /> Open</a>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 p-6">
        <div className="overflow-hidden rounded-[40px] border-8 border-slate-900 bg-white shadow-2xl" style={{ width: 390, height: 780, maxHeight: "100%" }}>
          <iframe title="preview" src={previewUrl} style={{ width: "100%", height: "100%", border: 0 }} />
        </div>
      </div>
    </div>
  );
}

/* ================= HOME — the daily command center ================= */
function Home({ companies, users, loading, go }) {
  if (loading) return <Centered><Loader2 size={26} className="animate-spin text-emerald-500" /></Centered>;
  const drafts = companies.filter((c) => !isPublished(c));
  const unclaimed = companies.filter((c) => !c.owner_id);
  const incomplete = companies.filter(isIncomplete);
  const recent = [...companies].sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0, 6);

  const todos = [];
  if (drafts.length) todos.push({ label: `Review ${drafts.length} compan${drafts.length === 1 ? "y" : "ies"} awaiting approval`, to: "operations", tone: "amber" });
  if (incomplete.length) todos.push({ label: `${incomplete.length} profile${incomplete.length === 1 ? "" : "s"} look incomplete — nudge or finish onboarding`, to: "operations", tone: "amber" });
  if (unclaimed.length) todos.push({ label: `${unclaimed.length} compan${unclaimed.length === 1 ? "y is" : "ies are"} unclaimed — assign an owner`, to: "companies", tone: "slate" });

  const actions = [
    { label: "Onboard company", href: "/onboarding?new=1", Icon: Plus },
    { label: "Approve companies", onClick: () => go("operations"), Icon: ClipboardCheck },
    { label: "Open CRM", onClick: () => go("crm"), Icon: Briefcase },
    { label: "Send notification", onClick: () => go("notifications"), Icon: Bell },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-[26px] font-extrabold tracking-tight">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}.</h1>
      <p className="mt-1 text-[13.5px] text-slate-400">Here's what needs you today.</p>

      {/* QUICK ACTIONS */}
      <div className="mt-5 flex flex-wrap gap-2.5">
        {actions.map((a) => a.href
          ? <a key={a.label} href={a.href} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white"><a.Icon size={16} />{a.label}</a>
          : <button key={a.label} onClick={a.onClick} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13.5px] font-bold text-slate-700 hover:border-slate-300"><a.Icon size={16} />{a.label}</button>
        )}
      </div>

      {/* TODAY */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2"><span className="text-[12px] font-bold uppercase tracking-wider text-emerald-600">Today</span></div>
        {todos.length === 0 ? (
          <div className="flex items-center gap-3 py-6"><CheckCircle2 size={22} className="text-emerald-500" /><p className="text-[15px] font-semibold text-slate-700">You're all caught up. Nothing needs approval or attention.</p></div>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {todos.map((t, i) => (
              <button key={i} onClick={() => go(t.to)} className="flex w-full items-center gap-3 py-3 text-left hover:opacity-80">
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${t.tone === "amber" ? "bg-amber-400" : "bg-slate-300"}`} />
                <span className="flex-1 text-[15px] font-medium text-slate-800">{t.label}</span>
                <ArrowRight size={16} className="text-slate-300" />
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 border-t border-slate-100 pt-3 text-[12px] text-slate-400">Trial expiries, demos, follow-ups, AI failures and support tickets will appear here once CRM, trials, AI and support are connected.</p>
      </section>

      {/* OPERATIONS SUMMARY + LIVE ACTIVITY */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-bold">Operations</h2><button onClick={() => go("operations")} className="text-[13px] font-bold text-emerald-600">Open →</button></div>
          <OpRow label="Awaiting approval" n={drafts.length} tone="amber" />
          <OpRow label="Incomplete profiles" n={incomplete.length} tone="amber" />
          <OpRow label="Unclaimed companies" n={unclaimed.length} tone="slate" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-[15px] font-bold">Live activity</h2>
          <div className="divide-y divide-slate-100">
            {recent.map((c) => (
              <div key={c.slug} className="flex items-center justify-between py-2.5">
                <span className="text-[14px] text-slate-700"><b className="font-semibold">{c.name || c.slug}</b> {isPublished(c) ? "updated" : "saved a draft"}</span>
                <span className="text-[12px] text-slate-400">{timeAgo(c.updated_at)}</span>
              </div>
            ))}
            {recent.length === 0 && <p className="py-4 text-[13px] text-slate-400">No activity yet.</p>}
          </div>
          <p className="mt-3 border-t border-slate-100 pt-3 text-[12px] text-slate-400">Full event stream (follows, views, QR scans, payments) turns on with the events table.</p>
        </div>
      </div>

      {/* SALES / PRODUCT / HEALTH — honest empty states */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <EmptyCard title="Sales" body="MRR, ARR, trials and renewals appear once billing (Stripe) + CRM are connected." onClick={() => go("sales")} />
        <EmptyCard title="Product" body="DAU/MAU, most-followed, QR scans and views appear once event tracking is enabled." onClick={() => go("analytics")} />
        <EmptyCard title="Platform health" body="Auth, DB, storage, OpenAI, email and price APIs appear once monitors are added." onClick={() => go("health")} />
      </div>
    </div>
  );
}
function OpRow({ label, n, tone }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[14px] text-slate-600">{label}</span>
      <span className={`min-w-[28px] rounded-full px-2 py-0.5 text-center text-[13px] font-bold ${n === 0 ? "bg-slate-100 text-slate-400" : tone === "amber" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-600"}`}>{n}</span>
    </div>
  );
}
function EmptyCard({ title, body, onClick }) {
  return (
    <button onClick={onClick} className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-4 text-left hover:border-slate-400">
      <p className="text-[14px] font-bold text-slate-700">{title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-400">{body}</p>
    </button>
  );
}

/* ================= OPERATIONS ================= */
function Operations({ companies, reload, go }) {
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(null);
  const drafts = companies.filter((c) => !isPublished(c));
  const incomplete = companies.filter(isIncomplete);
  const approve = async (c) => { setBusy(c.slug); try { await updateCompany(c.slug, { status: "published" }, await authHeaders()); await reload(); } finally { setBusy(null); } };
  const copyPreview = async (c) => {
    const link = `${window.location.origin}/app?c=${encodeURIComponent(c.slug)}&preview=${c.preview_token}`;
    try { await navigator.clipboard.writeText(link); } catch { window.prompt("Copy this private preview link:", link); }
    setCopied(c.slug); setTimeout(() => setCopied((s) => (s === c.slug ? null : s)), 1800);
  };
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-[26px] font-extrabold tracking-tight">Operations</h1>
      <p className="mt-1 text-[13.5px] text-slate-400">Everything that needs work, in one place.</p>

      <h2 className="mt-8 text-[13px] font-bold uppercase tracking-wider text-slate-400">Awaiting approval — {drafts.length}</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {drafts.length === 0 ? <Done text="Nothing awaiting approval." /> : drafts.map((c, i) => (
          <div key={c.slug} className={`flex items-center gap-4 px-5 py-3.5 ${i > 0 ? "border-t border-slate-100" : ""}`}>
            <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-bold">{c.name || c.slug}</p><p className="truncate text-[12.5px] text-slate-400">{c.slug}{isIncomplete(c) ? " · looks incomplete" : ""} · {timeAgo(c.updated_at)}</p></div>
            <button onClick={() => copyPreview(c)} disabled={!c.preview_token} title={c.preview_token ? "Copy the private link to send a CEO" : "Run migration 0003 to enable preview links"} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-bold text-slate-600 hover:text-slate-900 disabled:opacity-40">{copied === c.slug ? <><CheckCircle2 size={13} className="text-emerald-600" /> Copied</> : <><Link2 size={13} /> Copy link</>}</button>
            <a href={`/app?c=${encodeURIComponent(c.slug)}${c.preview_token ? `&preview=${c.preview_token}` : ""}`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-bold text-slate-600">Preview</a>
            <button onClick={() => approve(c)} disabled={busy === c.slug} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60">{busy === c.slug ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve</button>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-[13px] font-bold uppercase tracking-wider text-slate-400">Incomplete onboarding — {incomplete.length}</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {incomplete.length === 0 ? <Done text="Every profile has content." /> : incomplete.map((c, i) => (
          <div key={c.slug} className={`flex items-center gap-4 px-5 py-3.5 ${i > 0 ? "border-t border-slate-100" : ""}`}>
            <AlertTriangle size={16} className="flex-shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-bold">{c.name || c.slug}</p><p className="truncate text-[12.5px] text-slate-400">No status card or projects yet</p></div>
            <button onClick={() => go("companies")} className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-bold text-slate-600">Open</button>
          </div>
        ))}
      </div>
    </div>
  );
}
function Done({ text }) { return <div className="flex items-center gap-2 px-5 py-8 text-slate-400"><CheckCircle2 size={18} className="text-emerald-400" /><span className="text-[14px]">{text}</span></div>; }

/* ================= USERS ================= */
function UsersSection({ users, loading }) {
  if (loading) return <Centered><Loader2 size={26} className="animate-spin text-emerald-500" /></Centered>;
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-[26px] font-extrabold tracking-tight">Users</h1>
      <p className="mt-1 text-[13.5px] text-slate-400">{users.length} account{users.length === 1 ? "" : "s"}.</p>
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[1fr_120px_140px] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400"><span>Email</span><span>Role</span><span>Joined</span></div>
        {users.map((u) => (
          <div key={u.id} className="grid grid-cols-[1fr_120px_140px] items-center gap-4 border-t border-slate-100 px-5 py-3">
            <span className="truncate text-[14px] font-medium text-slate-800">{u.email || "—"}</span>
            <span className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-[12px] font-bold ${u.role === "admin" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{u.role}</span>
            <span className="text-[13px] text-slate-400">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</span>
          </div>
        ))}
        {users.length === 0 && <div className="py-16 text-center text-[14px] text-slate-400">No accounts yet.</div>}
      </div>
    </div>
  );
}

function SalesEmpty() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-[26px] font-extrabold tracking-tight">Sales</h1>
      <p className="mt-1 text-[13.5px] text-slate-400">Your revenue cockpit.</p>
      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white/50 p-10 text-center">
        <TrendingUp size={30} className="mx-auto text-slate-300" />
        <p className="mt-3 text-[16px] font-bold text-slate-700">Sales metrics turn on with billing + CRM</p>
        <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-slate-400">MRR, ARR, trials running, demos, contracts, renewals and churn will populate here once Stripe (Phase 5) and the CRM pipeline are connected. No fabricated numbers until then.</p>
      </div>
    </div>
  );
}

function Stub({ id }) {
  const { label, Icon, need } = flat(id);
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-24 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">{Icon ? <Icon size={26} /> : null}</div>
      <h1 className="text-[22px] font-extrabold tracking-tight">{label}</h1>
      <p className="max-w-sm text-[14px] leading-relaxed text-slate-400">Not built yet — comes online once we add {need}. It's on the roadmap; nothing here is faked in the meantime.</p>
    </div>
  );
}
function Centered({ children }) { return <div className="grid h-full place-items-center">{children}</div>; }
