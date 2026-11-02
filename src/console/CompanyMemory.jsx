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
import { Database, FileText, Upload, Loader2, Trash2, Check, AlertTriangle, Search, Sparkles } from "lucide-react";
import { listDocuments, storeDocuments, deleteDocument, documentsForExtraction, downloadDocumentBase64, saveDocumentText, unreflectedDocuments, markReflected } from "../lib/memory.js";
import { reanalyzeFromMemory, analyzeNewDocuments } from "../lib/structureReleases.js";
import { mergeExtraction, mergeIncremental } from "../lib/profileToPP.js";
import { getAccessToken } from "../lib/auth.js";
import { loadMemoryAccess, readCompanyProfile, saveCompanyProfile, summarizeSteps } from "../lib/memoryAccess.js";

const KINDS = {
  press_release: { label: "Press release", c: "#0f766e", bg: "#eff6ff" },
  deck: { label: "Deck", c: "#7c3aed", bg: "#f5f3ff" },
  technical_report: { label: "Technical report", c: "#b45309", bg: "#fffbeb" },
  financial: { label: "Financial", c: "#1d4ed8", bg: "#eff6ff" },
  interview: { label: "Interview", c: "#be185d", bg: "#fdf2f8" },
  other: { label: "Document", c: "#64748b", bg: "#f8fafc" },
};
const fmtBytes = (n) => (!n ? "" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB");
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } };

// `onSaved` lets the console reload the company after a rebuild, so the new
// status card, brief and timeline show without a page refresh.
export default function CompanyMemory({ company, onSaved }) {
  const companyId = company?.id || null;
  // D23: may this person run the AI, and may they save its result? Checked
  // before anything is spent. null while loading.
  const [access, setAccess] = useState(null);
  useEffect(() => { setAccess(null); if (companyId) loadMemoryAccess(companyId).then(setAccess); }, [companyId]);
  const [docs, setDocs] = useState(null);   // null = loading
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState(false);
  const [reMsg, setReMsg] = useState("");    // re-analyze progress
  const [reDone, setReDone] = useState("");   // re-analyze result summary
  const inputRef = React.useRef(null);

  const [newCount, setNewCount] = useState(0);   // documents not yet folded into the profile

  const load = useCallback(() => {
    if (!companyId) { setDocs([]); return; }
    setDocs(null);
    // listDocuments throws when the file can't be read; say so instead of
    // showing an empty file.
    listDocuments(companyId).then(setDocs).catch((e) => { setDocs([]); setErr(e.message || "Couldn't load your documents."); });
    unreflectedDocuments(companyId).then((u) => setNewCount(u.length)).catch(() => {});
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  // Both rules must hold before any AI is spent; see lib/memoryAccess.js.
  const preflight = () => {
    if (!access) throw new Error("Still checking your access — try again in a moment.");
    if (!access.canAnalyze || !access.canSave) throw new Error(access.reason);
  };

  // Intelligent incremental add: route ONLY the new documents — dated press releases
  // into the timeline, decks/website pages into the profile — merging conservatively
  // so nothing already set (including hand edits) is overwritten.
  // Map of publication-date -> approved V2 Brief currently on the live profile. Passed into the
  // pipeline so an eligible release that ALREADY has a Brief is never regenerated, and an approved
  // Brief stays permanently attached even once it ages past the 72h generation window.
  const existingV2FromProfile = (profile) => {
    const m = {};
    for (const y of (profile?.pp?.PR_YEARS || [])) for (const it of (y.items || [])) if (it && it.id && it.v2) m[String(it.id)] = it.v2;
    return m;
  };
  // The live profile, read by company id through memoryAccess (the same read the
  // save path uses), not by slug.
  const fetchProfile = async () => (await readCompanyProfile(companyId)).profile;

  const analyzeNew = async () => {
    setErr(""); setReDone(""); setBusy("analyzeNew"); setReMsg("Reading the new documents…");
    try {
      preflight();
      const token = await getAccessToken();
      const existingV2 = existingV2FromProfile(await fetchProfile());
      const r = await analyzeNewDocuments(companyId, {
        token, onProgress: setReMsg, existingV2,
        deps: { unreflectedDocuments, downloadDocumentBase64, saveDocumentText },
      });
      if (!r.routing || !r.routing.newDocs) { setReDone("No new documents to analyze."); setBusy(""); return; }
      const sum = summarizeSteps(r.steps, { timeline: r.routing.timelineAdded });
      // Nothing produced: do not save, and do NOT mark the documents reflected --
      // they stay in the "new" queue to be analysed again.
      if (sum.level === "error") throw new Error(sum.text);

      const { profile, updatedAt } = await readCompanyProfile(companyId);
      const next = mergeIncremental(profile, r);
      await saveCompanyProfile(companyId, next, updatedAt);   // throws unless a row was really written
      await markReflected(r.reflectedIds);

      const parts = [];
      if (r.routing.timelineAdded) parts.push(`${r.routing.timelineAdded} added to the timeline`);
      if (r.routing.referenceDocs) parts.push(`${r.routing.referenceDocs} reference doc${r.routing.referenceDocs === 1 ? "" : "s"} used to update the profile`);
      setReDone(`Routed ${r.routing.newDocs} new document${r.routing.newDocs === 1 ? "" : "s"}: ${parts.join(", ") || "no new content found"}.${sum.level === "partial" ? ` ${sum.text}` : ""}`);
      load();
      if (onSaved) onSaved();
    } catch (e) { setErr(e.message || "Analysis failed"); }
    finally { setBusy(""); setReMsg(""); }
  };

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

  // Re-analyze the whole profile from the stored documents — no re-upload. Reads
  // EVERY document (press releases AND website/business pages), transcribing any
  // PDF whose text wasn't captured, then re-runs the extractors over the full
  // corpus, regenerates the status card and AI brief, and saves the merged
  // profile. Every AI call is made for THIS company (D23).
  const reanalyze = async () => {
    setErr(""); setReDone(""); setBusy("reanalyze"); setReMsg("Reading your document memory…");
    try {
      preflight();
      // Read the profile first: its saved timeline is the fallback chronology
      // for the status card and brief when the documents date nothing new.
      const { profile, updatedAt } = await readCompanyProfile(companyId);
      const token = await getAccessToken();
      const existingV2 = existingV2FromProfile(profile);   // the profile just read: no second fetch
      const results = await reanalyzeFromMemory(companyId, {
        token, onProgress: setReMsg, existingTimeline: profile.timeline || [], existingV2,
        deps: { documentsForExtraction, downloadDocumentBase64, saveDocumentText },
      });
      if (!results) throw new Error("No documents to analyze.");

      const nProj = (results.projects && results.projects.projects || []).length;
      const nTeam = (results.company && results.company.team || []).length;
      const nTl = (results.timelineEntries || []).length;
      const sum = summarizeSteps(results.steps, { timeline: nTl, projects: nProj, leaders: nTeam });
      // Every step refused or failed: say so, and leave the profile untouched.
      // This used to save anyway and report "Rebuilt: 0 timeline entries".
      if (sum.level === "error") throw new Error(sum.text);

      const next = mergeExtraction(profile, results);
      // The server keeps everything but the rebuild fields, recomputes the
      // render payload, and refuses if the profile changed since `updatedAt`.
      await saveCompanyProfile(companyId, next, updatedAt);   // throws unless a row was really written

      setReDone(`Rebuilt from ${results.docCount} documents: ${sum.text}.`);
      load();
      if (onSaved) onSaved();
    } catch (e) { setErr(e.message || "Re-analysis failed"); }
    finally { setBusy(""); setReMsg(""); }
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
          <Stat label="Status" value="Permanent" accent="#2563eb" />
        </div>

        {/* analyze NEW documents — the incremental, edit-preserving path */}
        {newCount > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
            <button onClick={analyzeNew} disabled={!!busy || !access || !access.canAnalyze || !access.canSave}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-40">
              {busy === "analyzeNew" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Analyze {newCount} new document{newCount === 1 ? "" : "s"}
            </button>
            <p className="flex-1 text-[12.5px] text-slate-600">
              {reMsg || "Routes each new document to the right place — dated press releases into the timeline, decks and website pages into the profile — without overwriting anything you've edited."}
            </p>
          </div>
        )}

        {/* re-analyze from memory — the full rebuild */}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <button onClick={reanalyze} disabled={!!busy || !docs || !docs.length || !access || !access.canAnalyze || !access.canSave}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-40">
            {busy === "reanalyze" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Rebuild everything from memory
          </button>
          <p className="flex-1 text-[12.5px] text-slate-500">
            {(busy === "reanalyze" && reMsg) || "Full rebuild from every stored document. Use this to re-do the whole profile; it replaces the timeline and re-derives every section."}
          </p>
        </div>
        {access && (!access.canAnalyze || !access.canSave) && <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] font-semibold text-slate-600"><AlertTriangle size={13} /> {access.reason}</p>}
        {reDone && <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-[12.5px] font-semibold text-blue-700"><Check size={13} /> {reDone}</p>}

        {/* add more — the persistent entry point */}
        <div onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
          className={`mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${drag ? "border-blue-400 bg-blue-50/50" : "border-slate-200 hover:border-slate-300"}`}>
          {busy ? <Loader2 size={22} className="animate-spin text-blue-500" /> : <Upload size={22} className="text-blue-500" />}
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
          {docs && docs.length === 0 && !err && (
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
