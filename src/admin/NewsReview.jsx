// src/admin/NewsReview.jsx — admin news review queue (Mission Control → Pulse).
//
// Shows every AI-processed item awaiting review (status='review'). Reads via the
// admin's session (RLS admin-read). Approve → publishes the item live; Reject →
// hides it. Nothing is public until an admin clicks Approve here.
import React, { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ExternalLink, ShieldCheck, AlertTriangle, HelpCircle, Layers, Building2, RotateCcw } from "lucide-react";
import { authHeaders } from "../lib/auth.js";
import { SUPABASE_URL } from "../lib/supabase.js";

const SELECT = "id,title,url,event_type,commodities,jurisdictions,materiality_score,materiality_label,mineex_summary,plain_english_explanation,context,key_numbers,provenance,fact_check,cluster_key,is_canonical,published_at,facts,source:news_sources(key,name),links:news_item_companies(company_slug,method,confidence)";

const EVENT_C = { "Drill Results": "#b45309", Assays: "#0d9488", "Resource Update": "#7c3aed", Financing: "#059669", Acquisition: "#db2777", Permitting: "#0891b2", Exploration: "#2563eb", Partnership: "#4f46e5", Production: "#0f766e", "Macro/Market": "#334155", Corporate: "#64748b", Other: "#94a3b8" };
const FC = { verified: { c: "#059669", Icon: ShieldCheck, label: "Verified" }, minor_discrepancy: { c: "#d97706", Icon: AlertTriangle, label: "Minor discrepancy" }, conflict: { c: "#dc2626", Icon: AlertTriangle, label: "Conflict" }, unverifiable: { c: "#64748b", Icon: HelpCircle, label: "Unverifiable" } };
const rel = (iso) => { if (!iso) return ""; const s = (Date.now() - new Date(iso).getTime()) / 1000; if (s < 3600) return `${Math.round(s / 60)}m`; if (s < 86400) return `${Math.round(s / 3600)}h`; return `${Math.round(s / 86400)}d`; };

export default function NewsReview() {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState({});
  const [open, setOpen] = useState({});
  const [err, setErr] = useState("");

  const load = async () => {
    setErr(""); setItems(null);
    try {
      const h = await authHeaders();
      const r = await fetch(`${SUPABASE_URL}/rest/v1/news_items?status=eq.review&select=${encodeURIComponent(SELECT)}&order=materiality_score.desc.nullslast&limit=150`, { headers: h });
      if (!r.ok) { setErr(`Load failed (HTTP ${r.status}). Are you signed in as an admin?`); setItems([]); return; }
      setItems(await r.json());
    } catch (e) { setErr(String(e && e.message || e)); setItems([]); }
  };
  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    setBusy((b) => ({ ...b, [id]: action }));
    try {
      const h = await authHeaders();
      const r = await fetch("/api/news-review", { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ action, id }) });
      if (r.ok) setItems((list) => list.filter((x) => x.id !== id));
      else { const j = await r.json().catch(() => ({})); setErr(j.error || `Action failed (HTTP ${r.status})`); }
    } catch (e) { setErr(String(e && e.message || e)); }
    finally { setBusy((b) => { const n = { ...b }; delete n[id]; return n; }); }
  };

  if (items === null) return <div className="p-8 text-sm text-slate-500">Loading review queue…</div>;

  // Order so clustered duplicates sit together (canonical first).
  const size = {}; items.forEach((it) => { if (it.cluster_key) size[it.cluster_key] = (size[it.cluster_key] || 0) + 1; });
  const sorted = [...items].sort((a, b) =>
    String(a.cluster_key || a.id).localeCompare(String(b.cluster_key || b.id)) ||
    (b.is_canonical - a.is_canonical) || ((b.materiality_score || 0) - (a.materiality_score || 0)));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">News Review Queue</h2>
          <p className="text-[13px] text-slate-500">{items.length} awaiting review · <span className="font-semibold">Approve</span> publishes live · <span className="font-semibold">Reject</span> hides it. Nothing is public until you approve.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-50"><RotateCcw size={14} />Refresh</button>
      </div>
      {err && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">{err}</div>}
      {items.length === 0 && !err && <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">Queue is empty — nothing awaiting review.</div>}

      <div className="space-y-3">
        {sorted.map((it) => {
          const ev = EVENT_C[it.event_type] || "#64748b";
          const fc = FC[(it.fact_check || {}).verdict] || FC.unverifiable;
          const conf = (it.fact_check || {}).confidence;
          const dup = it.cluster_key && size[it.cluster_key] > 1;
          const co = (it.links || [])[0];
          const meta = [(it.commodities || []).join(", "), (it.jurisdictions || []).slice(0, 2).join(", ")].filter(Boolean).join(" · ");
          return (
            <div key={it.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white" style={{ background: ev }}>{it.event_type || "—"}</span>
                <span className="text-[12px] font-bold text-slate-500">{it.source?.name || it.source?.key}</span>
                <span className="text-[11px] text-slate-400">· {rel(it.published_at)} ago</span>
                {it.materiality_score != null && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Materiality {it.materiality_score}{it.materiality_label ? ` · ${it.materiality_label}` : ""}</span>}
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: fc.c }}><fc.Icon size={13} />{fc.label}{conf != null ? ` ${Math.round(conf * 100)}%` : ""}</span>
              </div>

              <p className="text-[15px] font-bold leading-snug tracking-tight text-slate-900">{it.title}</p>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
                {co && <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Building2 size={12} />{co.company_slug} <span className="text-slate-400">({co.method} {Math.round((co.confidence || 0) * 100)}%)</span></span>}
                {meta && <span>{meta}</span>}
                {dup && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 font-bold text-indigo-600"><Layers size={11} />{it.is_canonical ? `Canonical of ${size[it.cluster_key]}` : `Duplicate (${size[it.cluster_key]} sources)`}</span>}
              </div>

              {it.mineex_summary && <p className="mt-2 text-[13px] leading-relaxed text-slate-600"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">MineEx Summary</span><br />{it.mineex_summary}</p>}
              {(it.fact_check || {}).flagged && it.fact_check.flagged.length > 0 && (
                <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11.5px] font-medium text-amber-700">⚠ Unsupported: {it.fact_check.flagged.join("; ")}</p>
              )}

              {open[it.id] && (() => {
                const prov = Array.isArray(it.provenance) ? it.provenance : [];
                const byField = (f) => prov.filter((p) => p && p.field === f);
                const Evidence = ({ field }) => byField(field).length === 0 ? null : (
                  <div className="mt-1 space-y-1 border-l-2 border-slate-100 pl-2">
                    {byField(field).map((p, i) => (
                      <p key={i} className="text-[11px] leading-snug text-slate-400"><span className="font-semibold text-slate-500">{p.claim}</span>{p.source_quote ? <> — <span className="italic">“{p.source_quote}”</span></> : null}</p>
                    ))}
                  </div>
                );
                const kn = Array.isArray(it.key_numbers) ? it.key_numbers : [];
                return (
                  <div className="mt-3 space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    {it.plain_english_explanation && (<div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">What does this mean?</p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">{it.plain_english_explanation}</p>
                      <Evidence field="plain_english_explanation" />
                    </div>)}
                    {it.context && (<div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Context</p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">{it.context}</p>
                      <Evidence field="context" />
                    </div>)}
                    {kn.length > 0 && (<div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Key Numbers</p>
                      <div className="mt-1 space-y-1">
                        {kn.map((k, i) => (
                          <div key={i} className="flex items-baseline justify-between gap-3 rounded-md bg-white px-2.5 py-1.5">
                            <span className="text-[12.5px] font-extrabold tracking-tight text-slate-900">{k.value}</span>
                            {k.label && <span className="text-[10.5px] font-semibold text-slate-400">{k.label}</span>}
                          </div>
                        ))}
                      </div>
                      <Evidence field="key_numbers" />
                    </div>)}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Summary evidence</p>
                      <Evidence field="mineex_summary" />
                      {byField("mineex_summary").length === 0 && <p className="mt-0.5 text-[11px] italic text-slate-400">No provenance recorded.</p>}
                    </div>
                  </div>
                );
              })()}

              <div className="mt-3 flex items-center gap-2">
                <a href={it.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">Source <ExternalLink size={13} /></a>
                <button onClick={() => setOpen((o) => ({ ...o, [it.id]: !o[it.id] }))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">{open[it.id] ? "Hide sections" : "Sections & evidence"}</button>
                <div className="ml-auto flex items-center gap-2">
                  <button disabled={!!busy[it.id]} onClick={() => act(it.id, "reject")} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-[12.5px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"><XCircle size={14} />{busy[it.id] === "reject" ? "…" : "Reject"}</button>
                  <button disabled={!!busy[it.id]} onClick={() => act(it.id, "approve")} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-50" style={{ background: "#059669" }}><CheckCircle2 size={14} />{busy[it.id] === "approve" ? "…" : "Approve → Publish"}</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
