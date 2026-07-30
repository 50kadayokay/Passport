// Company Portal — Documents (the organized Media Library).
//
// A company-facing view of everything they've ever uploaded: grouped by category,
// searchable, sortable, and — crucially — every document can be OPENED or
// downloaded (the private company-docs bucket is reached via a short-lived signed
// URL). Upload is here too. The heavy AI actions (rebuild the profile from memory)
// live in the admin/onboarding console, not this clean browse surface.

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  FileText, Upload, Loader2, Trash2, Search, ExternalLink, Download, AlertTriangle,
  Folder, ArrowDownUp,
} from "lucide-react";
import { listDocuments, storeDocuments, deleteDocument, signedDocUrl } from "../lib/memory.js";
import { logActivity } from "../lib/portal.js";

// Category catalogue — order defines how groups are stacked. `match` keys map the
// documents.kind values (and a couple of synonyms) onto these buckets.
const CATS = [
  { id: "press_release",    label: "Press releases",    c: "#0f766e", bg: "#ecfdf5" },
  { id: "deck",             label: "Presentations",     c: "#7c3aed", bg: "#f5f3ff" },
  { id: "technical_report", label: "Technical reports", c: "#b45309", bg: "#fffbeb" },
  { id: "financial",        label: "Financials",        c: "#1d4ed8", bg: "#eff6ff" },
  { id: "interview",        label: "Interviews & media", c: "#be185d", bg: "#fdf2f8" },
  { id: "other",            label: "Other documents",   c: "#64748b", bg: "#f8fafc" },
];
const CAT_BY_ID = Object.fromEntries(CATS.map((c) => [c.id, c]));
const catOf = (kind) => CAT_BY_ID[kind] || CAT_BY_ID.other;

const fmtBytes = (n) => (!n ? "" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB");
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } };

export default function Documents({ company }) {
  const companyId = company?.id || null;
  const [docs, setDocs] = useState(null);        // null = loading
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("newest");    // newest | name
  const [drag, setDrag] = useState(false);
  const [opening, setOpening] = useState("");     // doc id currently resolving a signed URL
  const inputRef = useRef(null);

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
      const r = await storeDocuments(companyId, files, { onProgress: (d, t) => setBusy(`Uploading ${d}/${t}…`) });
      if (r.failed.length) setErr(`${r.failed.length} file(s) couldn't be uploaded.`);
      const added = r.stored.filter((s) => !s.dupe).length;
      if (added) logActivity(companyId, { action: "media_uploaded", entity: "documents", source: "ui", reason: `${added} file${added === 1 ? "" : "s"}` });
      load();
    } catch (e) { setErr(e.message || "Upload failed"); }
    finally { setBusy(""); }
  };

  const remove = async (d) => {
    setDocs((xs) => xs.filter((x) => x.id !== d.id));   // optimistic
    const ok = await deleteDocument(d.id);
    if (ok) logActivity(companyId, { action: "media_deleted", entity: "documents", source: "ui", reason: d.filename || "" });
    else load();
  };

  const open = async (d, download = false) => {
    if (!d.storage_path) { setErr("This file's original isn't available to open."); return; }
    setOpening(d.id + (download ? ":dl" : ""));
    const url = await signedDocUrl(d.storage_path, { download });
    setOpening("");
    if (!url) { setErr("Couldn't open that file — try again."); return; }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const counts = useMemo(() => {
    const m = { all: (docs || []).length };
    for (const c of CATS) m[c.id] = 0;
    for (const d of docs || []) m[catOf(d.kind).id]++;
    return m;
  }, [docs]);

  const visibleCats = useMemo(() => CATS.filter((c) => (counts[c.id] || 0) > 0), [counts]);

  const filtered = useMemo(() => {
    let list = docs || [];
    if (cat !== "all") list = list.filter((d) => catOf(d.kind).id === cat);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((d) => (d.filename || "").toLowerCase().includes(s) || (d.textPreview || "").toLowerCase().includes(s));
    }
    list = [...list].sort((a, b) =>
      sort === "name"
        ? (a.filename || "").localeCompare(b.filename || "")
        : String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return list;
  }, [docs, cat, q, sort]);

  // Group for display only when browsing everything unsorted-by-name with no filter.
  const grouped = cat === "all" && !q.trim();
  const groups = useMemo(() => {
    if (!grouped) return null;
    return visibleCats
      .map((c) => ({ cat: c, items: filtered.filter((d) => catOf(d.kind).id === c.id) }))
      .filter((g) => g.items.length);
  }, [grouped, visibleCats, filtered]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[24px] font-extrabold tracking-tight text-slate-900">Documents</h1>
        <p className="mt-1.5 text-[14.5px] text-slate-500">Everything you've uploaded — organized by type and kept forever. Open or download any original whenever you need it.</p>
      </div>

      {/* Upload */}
      <div onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${drag ? "border-emerald-400 bg-emerald-50/50" : "border-slate-200 hover:border-slate-300"}`}>
        {busy ? <Loader2 size={22} className="animate-spin text-emerald-500" /> : <Upload size={22} className="text-emerald-500" />}
        <p className="text-[13.5px] font-bold text-slate-700">{busy || "Upload documents"}</p>
        <p className="text-[12px] text-slate-400">Drop files or click — press releases, decks, technical reports, financials, photos. Deduped automatically.</p>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {err && <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-700"><AlertTriangle size={13} /> {err}</p>}

      {/* Controls */}
      {docs && docs.length > 0 && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Chip active={cat === "all"} onClick={() => setCat("all")} label={`All (${counts.all})`} />
            {visibleCats.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} label={`${c.label} (${counts[c.id]})`} color={c.c} />
            ))}
            <button onClick={() => setSort((s) => (s === "newest" ? "name" : "newest"))}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:border-slate-300">
              <ArrowDownUp size={13} /> {sort === "newest" ? "Newest first" : "By name"}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search filenames and content…"
              className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-slate-300" />
          </div>
        </>
      )}

      {/* List */}
      <div className="mt-4">
        {docs === null && <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-slate-300" /></div>}
        {docs && docs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 py-14 text-center">
            <FileText size={24} className="mx-auto text-slate-300" />
            <p className="mt-2 text-[14px] font-semibold text-slate-500">No documents yet</p>
            <p className="mt-1 text-[13px] text-slate-400">Upload your first file above — everything you add is kept forever.</p>
          </div>
        )}

        {grouped && groups ? (
          <div className="space-y-7">
            {groups.map((g) => (
              <div key={g.cat.id}>
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: g.cat.bg }}><Folder size={13} style={{ color: g.cat.c }} /></span>
                  <h2 className="text-[13px] font-bold uppercase tracking-wide text-slate-500">{g.cat.label}</h2>
                  <span className="text-[12px] font-semibold text-slate-300">{g.items.length}</span>
                </div>
                <div className="space-y-2">
                  {g.items.map((d) => <DocRow key={d.id} d={d} onOpen={open} onRemove={remove} opening={opening} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((d) => <DocRow key={d.id} d={d} onOpen={open} onRemove={remove} opening={opening} />)}
            {docs && docs.length > 0 && filtered.length === 0 && <p className="py-6 text-center text-[13px] text-slate-400">Nothing matches your filters.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, label, color }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
      {color && <span className="h-2 w-2 rounded-full" style={{ background: active ? "#fff" : color }} />}
      {label}
    </button>
  );
}

function DocRow({ d, onOpen, onRemove, opening }) {
  const c = catOf(d.kind);
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300">
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg" style={{ background: c.bg }}><FileText size={16} style={{ color: c.c }} /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold text-slate-800">{d.filename || "Untitled"}</p>
        <p className="truncate text-[11.5px] text-slate-400">
          <span className="font-semibold" style={{ color: c.c }}>{c.label}</span>
          {d.doc_date ? ` · dated ${fmtDate(d.doc_date)}` : ""}{d.bytes ? ` · ${fmtBytes(d.bytes)}` : ""} · uploaded {fmtDate(d.created_at)}
          {d.hasText ? " · searchable" : ""}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        <button onClick={() => onOpen(d, false)} title="Open" disabled={opening === d.id}
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          {opening === d.id ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={15} />}
        </button>
        <button onClick={() => onOpen(d, true)} title="Download" disabled={opening === d.id + ":dl"}
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          {opening === d.id + ":dl" ? <Loader2 size={14} className="animate-spin" /> : <Download size={15} />}
        </button>
        <button onClick={() => onRemove(d)} title="Delete" className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={15} /></button>
      </div>
    </div>
  );
}
