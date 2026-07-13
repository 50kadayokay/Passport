import React, { useState, useEffect } from "react";
import { Loader2, AlertTriangle, Eye } from "lucide-react";
import { StatusBar, BottomNav } from "./components.jsx";
import { fetchCompany, fetchPreviewCompany } from "../lib/supabase.js";
import { KINGSMEN_SLUG, byId } from "./data.js";
import Today from "./screens/Today.jsx";
import Explore from "./screens/Explore.jsx";
import Following from "./screens/Following.jsx";
import Account from "./screens/Account.jsx";
import CompanyProfile from "./screens/CompanyProfile.jsx";

function PhoneShell({ children }) {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[var(--pp-bg)] p-0 sm:p-6">
      <div className="relative flex h-[100dvh] w-full max-w-[404px] flex-col overflow-hidden bg-white sm:h-[860px] sm:max-h-[94vh] sm:rounded-[46px] sm:ring-1 sm:ring-slate-200/80 sm:shadow-[0_40px_100px_-30px_rgba(15,23,42,0.45)]">
        {children}
      </div>
    </div>
  );
}

// Build a minimal profile for peer companies (not stored in Supabase) so the
// detail screen degrades gracefully instead of erroring.
function syntheticProfile(id) {
  const c = byId(id);
  if (!c) return { company: {} };
  return {
    company: { name: c.name, website: "", slogan: "", listings: [{ ex: c.exchange, sym: c.ticker }] },
    companyStatus: {}, companyBrief: {}, capital: {}, projects: [], timeline: [], team: [], media: [],
  };
}

// The Supabase-backed company. Defaults to Kingsmen, but `?c=<slug>` (used by the
// admin "Open in app" link) loads and opens any company directly.
const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const REAL_SLUG = PARAMS.get("c") || KINGSMEN_SLUG;
const DEEP_LINKED = PARAMS.has("c");
// Private preview: `?c=<slug>&preview=<token>` opens an unpublished spec profile
// via the token-gated reader, so we can show a CEO their profile before it's live.
const PREVIEW_TOKEN = PARAMS.get("preview") || null;

export default function App() {
  const [tab, setTab] = useState("today");
  const [openId, setOpenId] = useState(DEEP_LINKED ? REAL_SLUG : null);
  const [data, setData] = useState({ loading: true, error: null, profile: null });

  useEffect(() => {
    let alive = true;
    const load = PREVIEW_TOKEN ? fetchPreviewCompany(REAL_SLUG, PREVIEW_TOKEN) : fetchCompany(REAL_SLUG);
    load
      .then((row) => alive && setData({ loading: false, error: row ? null : (PREVIEW_TOKEN ? "This preview link is invalid or has expired." : "Company not found"), profile: row?.profile || null }))
      .catch((e) => alive && setData({ loading: false, error: e.message || "Failed to load", profile: null }));
    return () => { alive = false; };
  }, []);

  const open = (id) => setOpenId(id);
  const goTab = (t) => { setOpenId(null); setTab(t); };

  // Resolve the profile to show in the detail screen.
  const realOpen = openId === REAL_SLUG;
  const detailProfile = realOpen ? data.profile : openId ? syntheticProfile(openId) : null;

  let body;
  if (openId) {
    if (realOpen && data.loading) {
      body = (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 size={30} className="animate-spin text-emerald-500" />
          <p className="text-[14px] font-medium">Loading profile from Supabase…</p>
        </div>
      );
    } else if (realOpen && (data.error || !data.profile)) {
      body = (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-slate-500">
          <AlertTriangle size={30} className="text-rose-500" />
          <p className="text-[15px] font-bold text-slate-700">Couldn't load profile</p>
          <p className="text-[13px] text-slate-400">{data.error}</p>
          <button onClick={() => goTab("today")} className="mt-2 rounded-full bg-slate-900 px-5 py-2 text-[14px] font-bold text-white">Back to Today</button>
        </div>
      );
    } else {
      body = <CompanyProfile profile={detailProfile} onBack={() => setOpenId(null)} />;
    }
  } else if (tab === "today") body = <div className="h-full overflow-y-auto"><Today onOpen={open} /></div>;
  else if (tab === "explore") body = <div className="h-full overflow-y-auto"><Explore onOpen={open} /></div>;
  else if (tab === "following") body = <div className="h-full overflow-y-auto"><Following onOpen={open} /></div>;
  else body = <div className="h-full overflow-y-auto"><Account /></div>;

  return (
    <PhoneShell>
      {/* real-phone safe area (below the OS status bar); fake chrome shows only on desktop */}
      <div className="sm:hidden flex-shrink-0" style={{ height: "env(safe-area-inset-top, 0px)" }} />
      <StatusBar />
      {PREVIEW_TOKEN && !data.loading && !data.error && (
        <div className="flex items-center justify-center gap-1.5 bg-amber-400 px-3 py-1.5 text-center text-[11.5px] font-bold text-amber-950">
          <Eye size={13} /> Private preview — not yet published
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
      <BottomNav active={tab} onChange={goTab} />
    </PhoneShell>
  );
}
