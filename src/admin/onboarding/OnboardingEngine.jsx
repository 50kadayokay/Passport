// Onboarding Engine — the transparent extraction pipeline shell.
// Phase 1 ships the Documents (Pass 0) tab; later passes (Chronology, Evidence Graph,
// Knowledge Quality, Generation) mount here as they're built. Company-scoped.

import React, { useMemo, useState } from "react";
import DocumentsInventory from "./DocumentsInventory.jsx";

const TABS = [
  { id: "documents", label: "Documents", ready: true },
  { id: "chronology", label: "Chronology", ready: false },
  { id: "evidence", label: "Evidence Graph", ready: false },
  { id: "quality", label: "Knowledge Quality", ready: false },
  { id: "generate", label: "Generate", ready: false },
];

export default function OnboardingEngine({ companies = [] }) {
  const sorted = useMemo(() => companies.slice().sort((a, b) => String(a.name || a.slug).localeCompare(String(b.name || b.slug))), [companies]);
  const [companyId, setCompanyId] = useState(sorted[0] ? sorted[0].id : "");
  const [tab, setTab] = useState("documents");
  const company = sorted.find((c) => c.id === companyId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 px-6 py-3">
        <div>
          <div className="text-[15px] font-extrabold text-slate-900">Onboarding Engine</div>
          <div className="text-[11.5px] text-slate-400">Transparent, evidence-backed extraction. Every document accounted for before any profile is generated.</div>
        </div>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700">
          <option value="">Select a company…</option>
          {sorted.map((c) => <option key={c.id} value={c.id}>{c.name || c.slug}</option>)}
        </select>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1 border-b border-slate-200 px-6 py-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => t.ready && setTab(t.id)} disabled={!t.ready}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-bold ${tab === t.id ? "bg-slate-900 text-white" : t.ready ? "text-slate-600 hover:bg-slate-100" : "text-slate-300"}`}>
            {t.label}{!t.ready && " ·"}
          </button>
        ))}
        <span className="ml-2 text-[11px] text-slate-400">Phase 1 — later passes unlock as built</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "documents" && <DocumentsInventory companyId={companyId} companyName={company ? (company.name || company.slug) : ""} />}
        {tab !== "documents" && <div className="p-10 text-center text-slate-400">This pass isn't built yet — Phase 2+.</div>}
      </div>
    </div>
  );
}
