// Company Memory — the permanent file for a company.
//
// Shows every document ever filed for this company (from the `documents` table)
// and lets you add more at any time. This is the persistent entry point that
// makes "upload once, filed forever" true beyond onboarding: drop a document here
// months later and it joins the same record.
//
// It's also the window onto the substrate that future intelligence reads — every
// company's documents and their extracted text, in one place, cross-referenceable.

import React, { useState, useEffect, useCallback } from "react";
import { Database, FileText, Upload, Loader2, Trash2, Check, AlertTriangle, Search } from "lucide-react";
import { listDocuments, storeDocuments, deleteDocument } from "../lib/memory.js";

const KINDS = {
  press_release: { label: "Press release", c: "#0f766e", bg: "#ecfdf5" },
  deck: { label: "Deck", c: "#7c3aed", bg: "#f5f3ff" },
  technical_report: { label: "Technical report", c: "#b45309", bg: "#fffbeb" },
  financial: { label: "Financial", c: "#1d4ed8", bg: "#eff6ff" },
  interview: { label: "Interview", c: "#be185d", bg: "#fdf2f8" },
  other: { label: "Document", c: "#64748b", bg: "#f8fafc" },
};
const fmtBytes = (n) => (!n ? "" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB");
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } };

export default function CompanyMemory({ company }) {
  const companyId = company?.id || null;
  const [docs, setDocs] = useState(null);   // null = loading
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = React.useRef(null);

  const load = useCallback(() => {
    if (!companyId) { setDocs([]); return; }
    setDocs(null);
    listDocuments(companyId).then(setDocs);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length || !companyId) return;
    setErr(""); setBusy("upload");
    try {
      const r = await storeDocuments(companyId, files, { onProgress: (d, t) => setBusy(`Filing ${d}/${t}…`) });
      if (r.failed.length) setErr(`${r.failed.length} file(s) couldn't be filed.`);
      load();
    } catch (e) { setErr(e.message || "Upload failed"); }
    finally { setBusy(""); }
  };

  const remove = async (id) => {
    setDocs((d) => d.filter((x) => x.id !== id));   // optimistic
    const ok = await deleteDocument(id);
    if (!ok) load();
  };

  const filtered = (docs || []).filter((d) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (d.filename || "").toLowerCase().includes(s) || (d.textPreview || "").toLowerCase().includes(s);
  });
  const withText = (docs || []).filter((d) => d.hasText).length;

  if (!companyId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Database size={26} /></div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Company Memory</h1>
        <p className="max-w-sm text-[14px] leading-relaxed text-slate-400">Once this company has a record, every document it's ever given lives here — permanently.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-2.5">
          <Database size={22} className="text-slate-900" />
          <h1 className="text-[26px] font-extrabold tracking-tight">Company Memory</h1>
        </div>
        <p className="mt-1 text-[14px] text-slate-500">
          {company?.name || "This company"}'s permanent file. Every document ever uploaded is stored here for good — searchable, and the foundation for everything the AI does.
        </p>

        {/* stats */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label="Documents on file" value={docs === null ? "—" : docs.length} />
          <Stat label="Searchable (text captured)" value={docs === null ? "—" : withText} />
          <Stat label="Status" value="Permanent" accent="#059669" />
        </div>

        {/* add more — the persistent entry point */}
        <div onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
          className={`mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${drag ? "border-emerald-400 bg-emerald-50/50" : "border-slate-200 hover:border-slate-300"}`}>
          {busy ? <Loader2 size={22} className="animate-spin text-emerald-500" /> : <Upload size={22} className="text-emerald-500" />}
          <p className="text-[13.5px] font-bold text-slate-700">{busy || "Add documents to this company's file"}</p>
          <p className="text-[12px] text-slate-400">Drop files or click — they're filed permanently and deduped automatically.</p>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>
        {err && <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-700"><AlertTriangle size={13} /> {err}</p>}

        {/* search */}
        {docs && docs.length > 0 && (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search filenames and content…"
              className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-slate-300" />
          </div>
        )}

        {/* the file */}
        <div className="mt-4 space-y-2">
          {docs === null && <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-slate-300" /></div>}
          {docs && docs.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center">
              <FileText size={22} className="mx-auto text-slate-300" />
              <p className="mt-2 text-[13.5px] font-medium text-slate-400">No documents on file yet. Everything you add is kept forever.</p>
            </div>
          )}
          {filtered.map((d) => {
            const k = KINDS[d.kind] || KINDS.other;
            return (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg" style={{ background: k.bg }}><FileText size={16} style={{ color: k.c }} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-slate-800">{d.filename || "Untitled"}</p>
                  <p className="truncate text-[11.5px] text-slate-400">
                    <span className="font-semibold" style={{ color: k.c }}>{k.label}</span>
                    {d.bytes ? ` · ${fmtBytes(d.bytes)}` : ""} · filed {fmtDate(d.created_at)}
                    {d.hasText ? " · searchable" : " · text pending"}
                  </p>
                </div>
                <button onClick={() => remove(d.id)} title="Remove from file" className="flex-shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={15} /></button>
              </div>
            );
          })}
          {docs && docs.length > 0 && filtered.length === 0 && (
            <p className="py-6 text-center text-[13px] text-slate-400">Nothing matches "{q}".</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-[22px] font-extrabold tracking-tight" style={{ color: accent || "#0f172a" }}>{value}</p>
    </div>
  );
}
