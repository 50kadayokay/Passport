// Onboarding Engine → Documents (Pass 0). Proves extraction health per document —
// not merely that a row exists. Upload → per-page analysis → classified inventory
// grouped by type, sorted by disclosed date, with a processing gate.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ingestFiles, listInventory, updateDocument, previewUrl, fetchDocsText, buildTextBundle } from "../../lib/onboarding/documentStore.js";
import { DOC_TYPES, DOC_TYPE_LABELS } from "../../lib/onboarding/classify.js";

const STATE_META = {
  processed: { label: "processed", cls: "bg-emerald-600 text-white" },
  partially_processed: { label: "partial", cls: "bg-amber-100 text-amber-800" },
  image_only: { label: "image-only", cls: "bg-rose-100 text-rose-700" },
  duplicate: { label: "duplicate", cls: "bg-slate-200 text-slate-600" },
  failed: { label: "failed", cls: "bg-rose-600 text-white" },
  extracting: { label: "extracting", cls: "bg-sky-100 text-sky-700" },
  queued: { label: "queued", cls: "bg-slate-100 text-slate-500" },
  uploaded: { label: "uploaded", cls: "bg-slate-100 text-slate-500" },
  manually_excluded: { label: "excluded", cls: "bg-slate-200 text-slate-400 line-through" },
};
const stMeta = (s) => STATE_META[s] || STATE_META.uploaded;
const DUP_LABEL = { exact: "exact duplicate", probable_revision: "probable revision", possible: "possible duplicate", unique: "" };

function Stat({ n, label, tone = "slate" }) {
  const tones = { slate: "text-slate-700", green: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700" };
  return <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center"><div className={`text-[19px] font-extrabold ${tones[tone]}`}>{n}</div><div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</div></div>;
}

export default function DocumentsInventory({ companyId, companyName }) {
  const [docs, setDocs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [gate, setGate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState({});
  const [copied, setCopied] = useState("");
  const inputRef = useRef(null);

  // Copy the FULL extracted text of the given documents to the clipboard — paste into ChatGPT
  // as text (which it reads completely, unlike attached PDFs it only samples).
  const copyText = async (docIds, label) => {
    setBusy(`Preparing ${label} text…`); setErr("");
    try {
      const rows = await fetchDocsText(companyId, docIds);
      const bundle = buildTextBundle(rows);
      if (!bundle.trim()) { setErr("No readable text for those documents — they may be image-only."); return; }
      try { await navigator.clipboard.writeText(bundle); }
      catch (_) {
        const ta = document.createElement("textarea");
        ta.value = bundle; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (__) {}
        document.body.removeChild(ta);
      }
      const chars = bundle.length;
      setCopied(`${label} · ${rows.filter((d) => d.extracted_text && d.extracted_text.trim()).length} docs · ${Math.round(chars / 1000)}k chars`);
      setTimeout(() => setCopied(""), 4000);
    } catch (e) { setErr(e.message || "Copy failed"); } finally { setBusy(""); }
  };

  const load = async () => {
    setLoading(true); setErr("");
    try { const inv = await listInventory(companyId); setDocs(inv.docs); setSummary(inv.summary); setGate(inv.gate); }
    catch (e) { setErr(e.message || "Load failed"); } finally { setLoading(false); }
  };
  useEffect(() => { if (companyId) load(); /* eslint-disable-next-line */ }, [companyId]);

  const onFiles = async (fileList) => {
    const files = Array.from(fileList || []); if (!files.length) return;
    setBusy(`Ingesting 0/${files.length}…`); setErr("");
    try { await ingestFiles(companyId, files, { onProgress: (d, t, name) => setBusy(`Ingesting ${d}/${t} — ${name}`) }); await load(); }
    catch (e) { setErr(e.message || "Ingest failed"); } finally { setBusy(""); }
  };
  const setType = async (id, kind) => { await updateDocument(id, { kind, event: "type_corrected" }); load(); };
  const setDate = async (id, doc_date) => { await updateDocument(id, { doc_date, meta: { dateSource: "manual", dateConfidence: "high" }, event: "date_corrected" }); load(); };
  const exclude = async (id, on) => { await updateDocument(id, { meta: { manually_excluded: on }, event: on ? "excluded" : "unexcluded" }); load(); };
  const override = async (id, on) => { await updateDocument(id, { meta: { gate_override: on }, event: "gate_override" }); load(); };
  const openPreview = async (d) => { const u = await previewUrl(d.storage_path); if (u) window.open(u, "_blank", "noopener"); };

  const groups = useMemo(() => {
    const g = {};
    docs.forEach((d) => { const k = d.kind || "unknown"; (g[k] = g[k] || []).push(d); });
    return Object.keys(g).sort().map((k) => ({ type: k, items: g[k].sort((a, b) => String(b.doc_date || "").localeCompare(String(a.doc_date || ""))) }));
  }, [docs]);

  if (!companyId) return <div className="p-8 text-slate-400">Select a company to view its document corpus.</div>;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-[19px] font-extrabold tracking-tight text-slate-900">Documents · {companyName}</h2>
          <p className="text-[12.5px] text-slate-500">Pass 0 — every file is analyzed page-by-page. "Uploaded" ≠ "read": image-only and partial extractions are flagged before the pipeline continues.</p>
        </div>
        <div className="flex items-center gap-2">
          {docs.length > 0 && (
            <button onClick={() => copyText(null, "All documents")} disabled={!!busy}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-slate-700 disabled:opacity-50">Copy all text</button>
          )}
          <button onClick={load} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-bold text-slate-600 hover:text-slate-900">Refresh</button>
        </div>
      </div>

      {copied && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-[12.5px] font-semibold text-emerald-800">Copied to clipboard — {copied}. Paste it into ChatGPT (with the pass prompt) instead of attaching PDFs.</div>}
      {docs.length > 0 && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-600">
          <b className="text-slate-800">Why "Copy text":</b> ChatGPT only samples snippets from attached PDFs, so it refuses or invents. Pasting the extracted <i>text</i> gives it the full document. Use the group buttons below to copy just the documents a pass needs — corporate docs for Company, technical docs for Projects, press releases for Timeline.
        </div>
      )}

      {/* upload */}
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
        className="mb-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 py-7">
        <p className="text-[14px] font-bold text-slate-700">{busy || "Drop PDFs / images here, or"}</p>
        <button onClick={() => inputRef.current && inputRef.current.click()} disabled={!!busy} className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">Choose files</button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <p className="mt-2 text-[11.5px] text-slate-400">PDF · PNG/JPG · text. SHA-256 dedup; upload order never affects sorting.</p>
      </div>
      {err && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] font-semibold text-rose-700">{err}</div>}

      {/* gate */}
      {gate && gate.blocked && (
        <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-[13px]">
          <b className="text-amber-800">⚠ {gate.count} document{gate.count === 1 ? "" : "s"} need attention</b>
          <span className="text-amber-700"> before the Evidence Graph can be trusted — failed, partial, image-only, unknown type, or awaiting review. Resolve or override each below.</span>
        </div>
      )}

      {/* summary */}
      {summary && (
        <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-11">
          <Stat n={summary.uploaded} label="uploaded" />
          <Stat n={summary.unique} label="unique" />
          <Stat n={summary.duplicates} label="duplicates" tone={summary.duplicates ? "amber" : "slate"} />
          <Stat n={summary.pages} label="pages" />
          <Stat n={summary.textPages} label="text pages" tone="green" />
          <Stat n={summary.imageOnlyPages} label="image pages" tone={summary.imageOnlyPages ? "rose" : "slate"} />
          <Stat n={summary.processed} label="processed" tone="green" />
          <Stat n={summary.partial} label="partial" tone={summary.partial ? "amber" : "slate"} />
          <Stat n={summary.imageOnly} label="image-only" tone={summary.imageOnly ? "rose" : "slate"} />
          <Stat n={summary.failed} label="failed" tone={summary.failed ? "rose" : "slate"} />
          <Stat n={summary.needsReview} label="review" tone={summary.needsReview ? "amber" : "slate"} />
        </div>
      )}

      {loading ? <div className="py-10 text-center text-slate-400">Loading…</div> : docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-[13px] text-slate-400">No documents yet — drop the technical report, MD&A and news releases above.</div>
      ) : groups.map((grp) => (
        <div key={grp.type} className="mb-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[12px] font-extrabold uppercase tracking-wide text-slate-500">{DOC_TYPE_LABELS[grp.type] || grp.type} <span className="text-slate-300">· {grp.items.length}</span></span>
            <button onClick={() => copyText(grp.items.map((d) => d.id), DOC_TYPE_LABELS[grp.type] || grp.type)} disabled={!!busy}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:border-slate-400 disabled:opacity-50">Copy text</button>
          </div>
          <div className="space-y-2">
            {grp.items.map((d) => {
              const m = d.meta || {}; const st = stMeta(d.extraction_status);
              return (
                <div key={d.id} className="rounded-xl border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center gap-2 p-3">
                    <button onClick={() => setOpen((o) => ({ ...o, [d.id]: !o[d.id] }))} className="text-slate-400">{open[d.id] ? "▾" : "▸"}</button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold text-slate-800">{d.title || d.filename}</div>
                      <div className="truncate font-mono text-[10.5px] text-slate-400">{d.filename} · {m.pageCount || 0}p · {m.charCount || 0} chars · {m.readablePct != null ? m.readablePct : 0}% readable</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase ${st.cls}`}>{st.label}</span>
                    {m.duplicateStatus && m.duplicateStatus !== "unique" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-500">{DUP_LABEL[m.duplicateStatus]}</span>}
                    {m.needsReview && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-700">review</span>}
                    <span className="text-[11px] text-slate-400">{d.doc_date || "no date"}</span>
                  </div>
                  {open[d.id] && (
                    <div className="border-t border-slate-100 p-3 text-[12px]">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="block"><span className="font-semibold text-slate-500">Type</span>
                            <select value={d.kind || "unknown"} onChange={(e) => setType(d.id, e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px]">
                              {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
                            </select>
                            {m.typeConfidence && m.typeConfidence !== "high" && <span className="text-[11px] text-amber-600">low-confidence — verify ({(m.typeSignals || []).join(", ") || "no signal"})</span>}
                          </label>
                          <label className="block"><span className="font-semibold text-slate-500">Disclosed date</span>
                            <input type="date" value={d.doc_date || ""} onChange={(e) => setDate(d.id, e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px]" />
                            <span className="text-[11px] text-slate-400">source: {m.dateSource || "?"} · {m.dateType || "?"} · conf {m.dateConfidence || "?"}{(m.dateCandidates || []).length > 1 ? ` · ${m.dateCandidates.length} candidates` : ""}</span>
                          </label>
                          <div className="text-[11.5px] text-slate-500"><b>Authority:</b> strong {(m.authority && m.authority.strong || []).join(", ") || "—"}; weak {(m.authority && m.authority.weak || []).join(", ") || "—"}</div>
                          {(m.imageOnlyPages > 0) && <div className="rounded-md bg-rose-50 px-2 py-1 text-[11.5px] font-semibold text-rose-700">{m.imageOnlyPages} image-only page{m.imageOnlyPages === 1 ? "" : "s"} — OCR/visual: {m.ocrStatus || "pending"} (page images preserved for Phase 2)</div>}
                          {d.extraction_error && <div className="text-[11.5px] text-rose-600">error: {d.extraction_error}</div>}
                        </div>
                        <div className="space-y-1.5">
                          <div className="font-semibold text-slate-500">Extracted text preview</div>
                          <div className="max-h-28 overflow-auto rounded-md bg-slate-50 p-2 font-mono text-[11px] text-slate-500">{d.textPreview || <span className="text-slate-400">— no text extracted —</span>}</div>
                          <div className="font-semibold text-slate-500">Audit trail</div>
                          <div className="max-h-24 overflow-auto rounded-md bg-slate-50 p-2 text-[10.5px] text-slate-500">{(m.events || []).map((e, i) => <div key={i}>{String(e.at).slice(0, 19).replace("T", " ")} · <b>{e.event}</b> {e.detail}</div>)}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button onClick={() => openPreview(d)} className="rounded-md border border-slate-200 px-2 py-1 text-[11.5px] font-bold text-slate-600">Open original</button>
                        <button onClick={() => exclude(d.id, !m.manually_excluded)} className="rounded-md border border-slate-200 px-2 py-1 text-[11.5px] font-bold text-slate-600">{m.manually_excluded ? "Include" : "Exclude"}</button>
                        {["failed", "partially_processed", "image_only"].includes(d.extraction_status) && <button onClick={() => override(d.id, !m.gate_override)} className={`rounded-md px-2 py-1 text-[11.5px] font-bold ${m.gate_override ? "bg-amber-100 text-amber-800" : "border border-slate-200 text-slate-600"}`}>{m.gate_override ? "override on" : "Override gate"}</button>}
                        <span className="font-mono text-[10px] text-slate-300">{(d.sha256 || "").slice(0, 16)}…</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
