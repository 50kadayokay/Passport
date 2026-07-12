import React, { useState, useEffect } from "react";
import { Loader2, AlertTriangle, Search, ExternalLink, CheckCircle2, Circle, Lock, RefreshCw, X, Plus, LogOut } from "lucide-react";
import { fetchCompanies, updateCompany } from "../lib/supabase.js";
import { authHeaders, signOut, getUser } from "../lib/auth.js";
import { Avatar, StatusBar } from "../aiBrief/components.jsx";
import CompanyProfile from "../aiBrief/screens/CompanyProfile.jsx";

const RESERVED = "kingsmen-resources";
const isPublished = (c) => (c.status || "").toLowerCase() === "published";
const fmtDate = (s) => { if (!s) return "—"; const d = new Date(s); return isNaN(d) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); };

function StatTile({ value, label, accent }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="text-[26px] font-extrabold tracking-tight" style={{ color: accent || "#0f172a" }}>{value}</p>
      <p className="mt-0.5 text-[12px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}

function StatusBadge({ published }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${published ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
      {published ? <CheckCircle2 size={13} /> : <Circle size={13} />} {published ? "Published" : "Draft"}
    </span>
  );
}

export default function Admin() {
  const [data, setData] = useState({ loading: true, error: null, companies: [] });
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () => {
    setData((d) => ({ ...d, loading: true, error: null }));
    authHeaders()
      .then((h) => fetchCompanies(h))
      .then((companies) => setData({ loading: false, error: null, companies }))
      .catch((e) => setData({ loading: false, error: e.message || "Failed to load", companies: [] }));
  };
  useEffect(load, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const companies = data.companies;
  const filtered = companies.filter((c) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [c.name, c.slug, c.primary_ticker].filter(Boolean).some((v) => v.toLowerCase().includes(s));
  });
  const sel = companies.find((c) => c.slug === selected) || null;
  const stats = {
    total: companies.length,
    published: companies.filter(isPublished).length,
    drafts: companies.filter((c) => !isPublished(c)).length,
  };

  const toggleStatus = async (c) => {
    const next = isPublished(c) ? "draft" : "published";
    setBusy(c.slug);
    try {
      const updated = await updateCompany(c.slug, { status: next }, await authHeaders());
      // As admin, is_admin() lets this touch any row. (For non-admins, RLS would
      // return 200 with NO rows changed — a silent no-op we still guard for.)
      if (!updated) {
        setToast({ ok: false, msg: `${c.name} is the protected template row — it can't be changed here.` });
        return;
      }
      setData((d) => ({ ...d, companies: d.companies.map((x) => (x.slug === c.slug ? { ...x, status: next, updated_at: updated.updated_at || x.updated_at } : x)) }));
      setToast({ ok: true, msg: `${c.name} set to ${next}.` });
    } catch (e) {
      setToast({ ok: false, msg: e.message || "Update failed" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-50 text-slate-900">
      {/* LEFT — list */}
      <div className="flex w-full max-w-[620px] flex-col border-r border-slate-200 bg-slate-50">
        <div className="flex-shrink-0 px-7 pt-7">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[28px] font-extrabold tracking-tight text-slate-900">Companies</h1>
              <p className="mt-0.5 text-[13px] text-slate-400">{stats.total} total · {stats.published} live · {stats.drafts} draft</p>
            </div>
            <button onClick={load} title="Refresh" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800"><RefreshCw size={17} className={data.loading ? "animate-spin" : ""} /></button>
          </div>

          <a href="/onboarding?new=1" className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-[15px] font-bold text-white">
            <Plus size={18} /> Onboard a company
          </a>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <StatTile value={stats.total} label="Total" />
            <StatTile value={stats.published} label="Published" accent="#059669" />
            <StatTile value={stats.drafts} label="Drafts" accent="#64748b" />
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <Search size={18} className="text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, slug or ticker" className="w-full bg-transparent text-[15px] text-slate-700 placeholder:text-slate-400 outline-none" />
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-7 pb-7">
          {data.loading ? (
            <div className="flex flex-col items-center gap-3 py-20 text-slate-400"><Loader2 size={26} className="animate-spin text-emerald-500" /><p className="text-[14px]">Loading companies…</p></div>
          ) : data.error ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center text-slate-500"><AlertTriangle size={26} className="text-rose-500" /><p className="text-[15px] font-bold text-slate-700">Couldn't load</p><p className="text-[13px] text-slate-400">{data.error}</p></div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-[14px] text-slate-400">No companies match “{q}”.</div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((c) => {
                const on = c.slug === selected;
                const reserved = c.slug === RESERVED;
                return (
                  <button key={c.slug} onClick={() => setSelected(c.slug)}
                    className={`flex w-full items-center gap-3.5 rounded-2xl border bg-white p-3.5 text-left transition ${on ? "border-emerald-300 ring-2 ring-emerald-100" : "border-slate-200 hover:border-slate-300"}`}>
                    <Avatar brand={c.profile?.brand} name={c.name} size={46} rounded="14px" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[16px] font-bold text-slate-900">{c.name || c.slug}</p>
                        {reserved && <span title="Protected template" className="text-slate-300"><Lock size={13} /></span>}
                      </div>
                      <p className="truncate text-[13px] font-medium text-slate-400">{c.slug}{c.primary_ticker ? ` · ${c.primary_ticker}` : ""}</p>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge published={isPublished(c)} />
                      <span className="text-[12px] text-slate-400">{fmtDate(c.updated_at || c.created_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — detail */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!sel ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-400">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100"><Search size={24} /></div>
            <p className="text-[16px] font-bold text-slate-600">Select a company</p>
            <p className="max-w-[260px] text-[13.5px]">Pick a company on the left to preview its profile and manage its publish status.</p>
          </div>
        ) : (
          <>
            {/* detail toolbar */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-7 py-4">
              <div className="min-w-0">
                <p className="truncate text-[19px] font-extrabold tracking-tight text-slate-900">{sel.name || sel.slug}</p>
                <p className="text-[13px] text-slate-400">Updated {fmtDate(sel.updated_at || sel.created_at)} · created {fmtDate(sel.created_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                <a href={`/app?c=${encodeURIComponent(sel.slug)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:text-slate-900">Open in app <ExternalLink size={15} /></a>
                <button onClick={() => toggleStatus(sel)} disabled={busy === sel.slug}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white ${isPublished(sel) ? "bg-slate-700" : "bg-emerald-600"} ${busy === sel.slug ? "opacity-60" : ""}`}>
                  {busy === sel.slug ? <Loader2 size={15} className="animate-spin" /> : (isPublished(sel) ? <Circle size={15} /> : <CheckCircle2 size={15} />)}
                  {isPublished(sel) ? "Unpublish" : "Publish"}
                </button>
              </div>
            </div>

            {/* profile preview — the SAME renderer the app uses */}
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-6">
              <div className="flex h-[760px] max-h-full w-[392px] flex-shrink-0 flex-col overflow-hidden rounded-[44px] border border-slate-200 bg-white shadow-[0_40px_90px_-30px_rgba(15,23,42,0.4)]">
                <StatusBar />
                <div className="min-h-0 flex-1 overflow-hidden">
                  <CompanyProfile profile={sel.profile || {}} showBack={false} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl px-5 py-3.5 text-[14px] font-semibold text-white shadow-lg ${toast.ok ? "bg-slate-900" : "bg-rose-600"}`}>
          {toast.msg}
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}
