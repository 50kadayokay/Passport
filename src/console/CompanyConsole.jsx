import React, { useState, useEffect } from "react";
import {
  LayoutDashboard, PenSquare, BarChart3, QrCode, Settings as SettingsIcon,
  LogOut, ExternalLink, Loader2, CheckCircle2, Circle, ArrowRight,
} from "lucide-react";
import { SUPABASE_URL } from "../lib/supabase.js";
import { authHeaders, getUser, signOut } from "../lib/auth.js";
import Onboarding from "../Onboarding.jsx";

const NAV = [
  { id: "build", label: "Build profile", Icon: PenSquare, ready: true },
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard, ready: true },
  { id: "analytics", label: "Analytics", Icon: BarChart3, need: "the analytics events pipeline" },
  { id: "qr", label: "QR & booth kit", Icon: QrCode, need: "the QR generator" },
  { id: "settings", label: "Settings", Icon: SettingsIcon, ready: true },
];
const isPublished = (c) => (c?.status || "").toLowerCase() === "published";

async function loadMyCompany() {
  const u = getUser();
  if (!u) return null;
  const h = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?owner_id=eq.${u.id}&select=slug,name,status,profile&limit=1`, { headers: h });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return rows[0] || null;
}

export default function CompanyConsole() {
  // New companies (?new=1) land on Build; otherwise on their Dashboard.
  const startNew = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1";
  const [section, setSection] = useState(startNew ? "build" : "build");
  const [company, setCompany] = useState(null);

  const refresh = () => loadMyCompany().then(setCompany);
  useEffect(() => { refresh(); }, [section]);

  const name = company?.name || getUser()?.email?.split("@")[0] || "Your company";

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 text-slate-900">
      {/* SIDEBAR */}
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-[14px] font-extrabold text-white">P</div>
          <span className="text-[15px] font-extrabold tracking-tight">Passport</span>
        </div>
        <nav className="flex-1 px-3">
          {NAV.map(({ id, label, Icon, ready }) => {
            const on = section === id;
            return (
              <button key={id} onClick={() => setSection(id)}
                className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition ${on ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}>
                <Icon size={17} className={on ? "text-slate-900" : "text-slate-400"} />
                <span className="flex-1 text-left">{label}</span>
                {!ready && <span className="h-1.5 w-1.5 rounded-full bg-slate-200" title="Coming soon" />}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 px-3 py-3">
          <button onClick={async () => { await signOut(); location.assign("/login"); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium text-slate-500 hover:bg-slate-50 hover:text-rose-500">
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* TOP ROW */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-[16px] font-extrabold tracking-tight">{name}</span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-bold ${isPublished(company) ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
              {isPublished(company) ? <CheckCircle2 size={12} /> : <Circle size={12} />} {isPublished(company) ? "Published" : "Draft"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {company?.slug && isPublished(company) && (
              <a href={`/app?c=${encodeURIComponent(company.slug)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-slate-600 hover:text-slate-900">View live <ExternalLink size={14} /></a>
            )}
            <span className="text-[13px] text-slate-400">{getUser()?.email}</span>
          </div>
        </header>

        {/* CONTENT */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {section === "build" && <Onboarding embedded />}
          {section === "dashboard" && <DashboardSection company={company} go={setSection} />}
          {section === "settings" && <SettingsSection />}
          {(section === "analytics" || section === "qr") && <Stub id={section} />}
        </div>
      </div>
    </div>
  );
}

function DashboardSection({ company, go }) {
  const projects = company?.profile?.projects?.filter((p) => p.enabled !== false).length || 0;
  const published = isPublished(company);
  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-[26px] font-extrabold tracking-tight">Welcome back{company?.name ? `, ${company.name}` : ""}.</h1>
        <p className="mt-1 text-[14px] text-slate-400">Here's your Passport at a glance.</p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Card label="Status" value={published ? "Published" : "Draft"} accent={published ? "#059669" : "#d97706"} />
          <Card label="Projects" value={projects} />
          <Card label="Profile" value={company ? "Started" : "Not started"} />
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-[16px] font-bold">{company ? "Keep your profile current" : "Build your profile"}</h2>
          <p className="mt-1 text-[14px] text-slate-500">{company ? "Update your status, projects and capital any time — changes publish live." : "Walk through the steps, preview it, and publish to the investor app."}</p>
          <button onClick={() => go("build")} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-[14px] font-bold text-white">{company ? "Edit profile" : "Start building"} <ArrowRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}
function Card({ label, value, accent }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1.5 text-[22px] font-extrabold tracking-tight" style={{ color: accent || "#0f172a" }}>{value}</p>
    </div>
  );
}
function SettingsSection() {
  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-[26px] font-extrabold tracking-tight">Settings</h1>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Account</p>
          <p className="mt-1 text-[15px] font-semibold text-slate-800">{getUser()?.email}</p>
          <button onClick={async () => { await signOut(); location.assign("/login"); }} className="mt-4 rounded-xl border border-slate-200 px-5 py-2.5 text-[14px] font-bold text-slate-700">Sign out</button>
        </div>
      </div>
    </div>
  );
}
function Stub({ id }) {
  const item = NAV.find((n) => n.id === id) || {};
  const Icon = item.Icon;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">{Icon ? <Icon size={26} /> : null}</div>
      <h1 className="text-[22px] font-extrabold tracking-tight">{item.label}</h1>
      <p className="max-w-sm text-[14px] leading-relaxed text-slate-400">Coming soon — this activates once we add {item.need}. Nothing here is faked in the meantime.</p>
    </div>
  );
}
