import React, { useState, useMemo, useCallback } from "react";
import { X, Newspaper, UploadCloud, FileText, Image as ImageIcon, Check, Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { extractPdfText, formatReleaseText, parseReleaseDate, fileToDataUrl, looksLikePressRelease, firstMeaningfulLine, titleSimilarity } from "../lib/pressRelease.js";

// ============================================================================
// PRESS RELEASES — attach the full text (or screenshots) of each release to its
// timeline entry. Linking is certain by construction: YOU pick the entry, then
// drop its files. A parsed date only *warns* if a file looks like a different day.
//   • Images (screenshots) are shown as-is — faithful, no fragile OCR.
//   • PDFs are text-extracted (pdf.js) and auto-formatted; you edit before saving.
// ============================================================================

const fmtDay = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

// Mirror of the app's FullText markup rendering, for the admin preview pane.
function Preview({ text, images }) {
  return (
    <div className="space-y-1">
      {(images || []).map((src, i) => (
        <img key={"i" + i} src={src} alt="" className="mb-2 w-full rounded-lg border border-slate-200" />
      ))}
      {String(text || "").split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 6 }} />;
        if (t.startsWith("# ")) return <p key={i} className="text-[15px] font-extrabold leading-tight tracking-tight text-slate-900" style={{ marginTop: i ? 10 : 0 }}>{t.slice(2)}</p>;
        if (t.startsWith("## ")) return <p key={i} className="mt-2 text-[12.5px] font-bold text-slate-900">{t.slice(3)}</p>;
        return <p key={i} className="text-[12px] leading-relaxed text-slate-600">{line}</p>;
      })}
    </div>
  );
}

export default function PressReleases({ profile, companyName, onClose, onSave }) {
  const entries = useMemo(() => {
    const t = Array.isArray(profile && profile.timeline) ? profile.timeline : [];
    return t.filter((e) => e && /^\d{4}-\d{2}-\d{2}/.test(String(e.date)))
      .slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [profile]);

  const [selDate, setSelDate] = useState(entries[0] ? String(entries[0].date).slice(0, 10) : null);
  const sel = entries.find((e) => String(e.date).slice(0, 10) === selDate) || null;

  const [raw, setRaw] = useState("");
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dateWarn, setDateWarn] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Load an entry's existing full release into the editor when it's selected.
  const selectEntry = useCallback((e) => {
    const id = String(e.date).slice(0, 10);
    setSelDate(id);
    setRaw(String(e.fullText || ""));
    setImages(Array.isArray(e.fullImages) ? e.fullImages : []);
    setDateWarn("");
    setSavedFlash(false);
  }, []);

  const formatted = useMemo(() => formatReleaseText(raw), [raw]);
  const hasContent = !!(formatted.trim() || images.length);
  const [missingOnly, setMissingOnly] = useState(false);

  // Does the text look like a real press release? Only meaningful when there's text
  // (an image-only attachment can't be checked).
  const prCheck = useMemo(() => (raw.trim() ? looksLikePressRelease(raw) : null), [raw]);

  // Coverage — how many entries already have a full release attached.
  const isAttached = (e) => !!(String(e.fullText || "").trim() || (Array.isArray(e.fullImages) && e.fullImages.length));
  const attachedCount = entries.filter(isAttached).length;
  const remaining = entries.length - attachedCount;
  const listEntries = missingOnly ? entries.filter((e) => !isAttached(e)) : entries;

  // ---- BULK mode: drop every release at once, auto-match each to its entry -----------
  const [mode, setMode] = useState("single");
  const [queue, setQueue] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [bulkDone, setBulkDone] = useState(null);
  const [bulkErr, setBulkErr] = useState("");

  // Best-guess entry for a dropped file. The DATE is authoritative (releases carry a
  // dateline); title similarity only breaks same-date ties or handles date-less files.
  const bestByTitle = (item, pool) => {
    let best = null, bestS = -1;
    for (const e of pool) {
      const s = Math.max(titleSimilarity(item.title, e.headline), titleSimilarity(item.title, e.originalTitle || ""));
      if (s > bestS) { bestS = s; best = e; }
    }
    return { best, bestS };
  };
  const assign = useCallback((item) => {
    const sameDate = item.date ? entries.filter((e) => String(e.date).slice(0, 10) === item.date) : [];
    if (sameDate.length === 1) return { date: item.date, conf: "high", why: "date match" };
    if (sameDate.length > 1) {
      const { best, bestS } = bestByTitle(item, sameDate);
      return { date: String(best.date).slice(0, 10), conf: bestS >= 0.34 ? "high" : "medium", why: "date + title" };
    }
    // No date match — fall back to title only, conservatively.
    const { best, bestS } = bestByTitle(item, entries);
    if (best && bestS >= 0.4) return { date: String(best.date).slice(0, 10), conf: "medium", why: "title match" };
    return { date: "", conf: "none", why: "no confident match — pick one" };
  }, [entries]);

  const processBulk = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setProcessing(true); setBulkDone(null);
    const items = [];
    for (const f of files) {
      const base = { id: `${f.name}:${f.size}:${items.length}`, name: f.name };
      if (f.type.startsWith("image/")) {
        const url = await fileToDataUrl(f);
        items.push({ ...base, kind: "image", images: [url], text: "", date: parseReleaseDate(f.name), title: f.name.replace(/\.[^.]+$/, "") });
      } else if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
        const txt = await extractPdfText(f);
        const fmt = formatReleaseText(txt);
        items.push({ ...base, kind: "text", text: txt, date: parseReleaseDate(txt) || parseReleaseDate(f.name), title: firstMeaningfulLine(fmt) || f.name, weak: !txt });
      } else if (f.type.startsWith("text/") || /\.(txt|html?|md)$/i.test(f.name)) {
        const raw0 = await f.text();
        const clean = /<[a-z]/i.test(raw0) ? raw0.replace(/<[^>]+>/g, " ") : raw0;
        const fmt = formatReleaseText(clean);
        items.push({ ...base, kind: "text", text: clean, date: parseReleaseDate(clean) || parseReleaseDate(f.name), title: firstMeaningfulLine(fmt) || f.name });
      }
    }
    const assigned = items.map((it) => { const a = assign(it); return { ...it, assignedDate: a.date, conf: a.conf, why: a.why }; });
    setQueue((q) => [...q, ...assigned]);
    setProcessing(false);
  }, [assign]);

  const applyBulk = async () => {
    setApplying(true); setBulkErr("");
    try {
      const next = JSON.parse(JSON.stringify(profile || {}));
      const tl = Array.isArray(next.timeline) ? next.timeline : [];
      let applied = 0;
      for (const it of queue) {
        if (!it.assignedDate) continue;
        const row = tl.find((e) => String(e.date).slice(0, 10) === it.assignedDate);
        if (!row) continue;
        if (it.kind === "image") row.fullImages = [...(row.fullImages || []), ...it.images];
        else row.fullText = formatReleaseText(it.text);
        applied++;
      }
      next.timeline = tl;
      // Guard the payload: screenshots become base64 and can blow past the DB request
      // limit. Fail loudly with a useful message instead of hanging silently.
      const mb = JSON.stringify(next).length / 1e6;
      if (mb > 4) {
        throw new Error(`This batch would make the profile ${mb.toFixed(1)} MB — too big to save in one request (screenshots are heavy). Attach in smaller batches, or use the PDF/text version of the release instead of an image.`);
      }
      await onSave(next);
      setBulkDone(applied);
      setQueue([]);
    } catch (e) {
      setBulkErr(e && e.message ? e.message : "Save failed — nothing was attached.");
    } finally { setApplying(false); }
  };

  const assignedInQueue = queue.filter((q) => q.assignedDate).length;

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || !selDate) return;
    setBusy(true);
    try {
      for (const f of files) {
        if (f.type.startsWith("image/")) {
          const url = await fileToDataUrl(f);
          setImages((prev) => [...prev, url]);
        } else if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
          const txt = await extractPdfText(f);
          if (txt) {
            setRaw((prev) => (prev ? prev + "\n\n" : "") + txt);
            const d = parseReleaseDate(txt);
            if (d && d !== selDate) setDateWarn(`This file looks dated ${fmtDay(d)}, but you're attaching it to the ${fmtDay(selDate)} entry. Double-check it's the right one.`);
          } else {
            setDateWarn("Couldn't read text from that PDF (it may be a scanned image). Paste the text below, or attach it as an image instead.");
          }
        } else if (f.type.startsWith("text/") || /\.(txt|html?|md)$/i.test(f.name)) {
          const txt = await f.text();
          const clean = /\.html?$/i.test(f.name) || /<[a-z]/i.test(txt)
            ? txt.replace(/<[^>]+>/g, " ")   // strip tags for HTML saves
            : txt;
          setRaw((prev) => (prev ? prev + "\n\n" : "") + clean);
          const d = parseReleaseDate(clean);
          if (d && d !== selDate) setDateWarn(`This file looks dated ${fmtDay(d)}, but you're attaching it to the ${fmtDay(selDate)} entry.`);
        }
      }
    } finally { setBusy(false); }
  }, [selDate]);

  const onDrop = (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); };

  const save = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      const next = JSON.parse(JSON.stringify(profile || {}));
      const tl = Array.isArray(next.timeline) ? next.timeline : [];
      const row = tl.find((e) => String(e.date).slice(0, 10) === selDate);
      if (row) {
        row.fullText = formatted.trim();
        row.fullImages = images;
      }
      next.timeline = tl;
      await onSave(next);          // Admin persists + re-maps pp + reloads
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } finally { setSaving(false); }
  };

  const badge = (e) => {
    const hasT = !!String(e.fullText || "").trim();
    const hasI = Array.isArray(e.fullImages) && e.fullImages.length;
    if (hasT || hasI) return <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-600">{hasI ? `${e.fullImages.length}📷` : ""}{hasT ? " text" : ""}</span>;
    return <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-bold text-slate-400">none</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6" onClick={onClose}>
      <div className="flex h-[88vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Newspaper size={20} className="text-slate-900" />
            <div>
              <p className="text-[16px] font-extrabold tracking-tight text-slate-900">Press Releases</p>
              {companyName && <p className="text-[12px] font-semibold text-slate-400">{companyName} · attach the full text or screenshots to each update</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {entries.length > 0 && (
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button onClick={() => setMode("bulk")} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold ${mode === "bulk" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Drop all at once</button>
                <button onClick={() => setMode("single")} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold ${mode === "single" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>One at a time</button>
              </div>
            )}
            <button onClick={onClose} className="text-slate-300 hover:text-slate-600"><X size={20} /></button>
          </div>
        </div>

        {!entries.length ? (
          <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
            <Newspaper size={28} className="mb-3" />
            <p className="text-[14px] font-bold text-slate-600">No timeline entries yet</p>
            <p className="mt-1 text-[12.5px]">Import a Pass 3 (Timeline) first, then attach the full releases here.</p>
          </div>
        ) : mode === "bulk" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-shrink-0 px-6 pt-5">
              <div onDrop={(e) => { e.preventDefault(); processBulk(e.dataTransfer.files); }} onDragOver={(e) => e.preventDefault()}
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center">
                {processing ? <Loader2 size={24} className="mb-2 animate-spin text-slate-400" /> : <UploadCloud size={24} className="mb-2 text-slate-400" />}
                <p className="text-[14px] font-bold text-slate-700">Drop ALL your press releases here</p>
                <p className="mt-0.5 text-[12px] text-slate-400">PDFs, screenshots, or text — each is matched to its update by date + title. You confirm before anything saves.</p>
                <label className="mt-3 cursor-pointer rounded-lg bg-slate-900 px-3.5 py-2 text-[12.5px] font-bold text-white hover:bg-slate-700">
                  Choose files
                  <input type="file" multiple accept="image/*,application/pdf,text/*,.pdf,.txt,.html,.htm,.md" className="hidden" onChange={(e) => processBulk(e.target.files)} />
                </label>
              </div>
            </div>

            {bulkDone != null && (
              <div className="mx-6 mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[12.5px] font-bold text-emerald-700">
                Attached {bulkDone} release{bulkDone === 1 ? "" : "s"}. {remaining > 0 ? `${remaining} still to add.` : "Every update now has its release. 🎉"}
              </div>
            )}
            {bulkErr && (
              <div className="mx-6 mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5">
                <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-rose-600" />
                <p className="text-[12px] font-semibold leading-snug text-rose-800">{bulkErr}</p>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
              {queue.length === 0 ? (
                <p className="mt-10 text-center text-[13px] text-slate-400">Drop your files above. Each appears here matched to an update — review and adjust before saving.</p>
              ) : (
                <div className="space-y-2">
                  {queue.map((it) => {
                    const badge = it.conf === "high" ? "bg-emerald-50 text-emerald-600" : it.conf === "medium" ? "bg-amber-50 text-amber-600" : it.conf === "manual" ? "bg-blue-50 text-blue-600" : "bg-rose-50 text-rose-600";
                    const badgeText = it.conf === "manual" ? "manual" : it.conf === "none" ? "unmatched" : it.why;
                    return (
                      <div key={it.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <span className="flex-shrink-0">{it.kind === "image" ? <ImageIcon size={16} className="text-slate-400" /> : <FileText size={16} className="text-slate-400" />}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-bold text-slate-800">{it.title || it.name}</p>
                          <p className="truncate text-[11px] text-slate-400">{it.name}{it.date ? ` · detected ${fmtDay(it.date)}` : " · no date found"}{it.weak ? " · couldn't read PDF text" : ""}</p>
                        </div>
                        <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge}`}>{badgeText}</span>
                        <select value={it.assignedDate} onChange={(e) => setQueue((q) => q.map((x) => x.id === it.id ? { ...x, assignedDate: e.target.value, conf: e.target.value ? "manual" : "none" } : x))}
                          className="max-w-[230px] flex-shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11.5px] font-semibold text-slate-700">
                          <option value="">— skip —</option>
                          {entries.map((e) => { const d = String(e.date).slice(0, 10); return <option key={d} value={d}>{fmtDay(d)} — {String(e.headline || "").slice(0, 42)}</option>; })}
                        </select>
                        <button onClick={() => setQueue((q) => q.filter((x) => x.id !== it.id))} className="flex-shrink-0 text-slate-300 hover:text-rose-600"><X size={15} /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {queue.length > 0 && (
              <div className="flex flex-shrink-0 items-center justify-between border-t border-slate-200 px-6 py-3">
                {assignedInQueue === 0
                  ? <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-amber-600"><AlertTriangle size={14} /> None auto-matched (no readable date) — pick an update for each from the dropdown →</span>
                  : <span className="text-[12px] font-semibold text-slate-500">{assignedInQueue} of {queue.length} matched · {queue.length - assignedInQueue} skipped</span>}
                <div className="flex items-center gap-3">
                  <button onClick={() => setQueue([])} className="text-[12.5px] font-bold text-slate-400 hover:text-rose-600">Clear all</button>
                  <button onClick={applyBulk} disabled={applying || !assignedInQueue}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white ${applying ? "bg-slate-500" : "bg-slate-900 hover:bg-slate-700"} ${!assignedInQueue ? "opacity-50" : ""}`}>
                    {applying ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />} Attach {assignedInQueue} release{assignedInQueue === 1 ? "" : "s"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* ENTRY LIST — pick the update you're attaching to (this is the certain link) */}
            <div className="flex w-[300px] flex-shrink-0 flex-col overflow-auto border-r border-slate-200 bg-slate-50 p-3">
              {/* Coverage — how many releases are attached, how many remain. */}
              <div className="mb-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-extrabold text-slate-900">{attachedCount} / {entries.length} attached</span>
                  {remaining > 0
                    ? <span className="text-[11px] font-bold text-amber-600">{remaining} to add</span>
                    : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600"><Check size={12} /> all done</span>}
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${entries.length ? Math.round((attachedCount / entries.length) * 100) : 0}%` }} />
                </div>
                <button onClick={() => setMissingOnly((v) => !v)}
                  className={`mt-2.5 w-full rounded-lg px-2 py-1.5 text-[11.5px] font-bold ${missingOnly ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-700"}`}>
                  {missingOnly ? "Showing only missing" : "Show only missing"}
                </button>
              </div>
              {listEntries.length === 0 && (
                <p className="px-2 py-6 text-center text-[12px] font-semibold text-emerald-600">Every release has a full text attached. 🎉</p>
              )}
              {listEntries.map((e, i) => {
                const id = String(e.date).slice(0, 10);
                const active = id === selDate;
                return (
                  <button key={i} onClick={() => selectEntry(e)}
                    className={`mb-1 flex flex-col items-start gap-1 rounded-xl px-3 py-2.5 text-left transition ${active ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className={`text-[10.5px] font-bold tabular-nums ${active ? "text-slate-300" : "text-slate-400"}`}>{fmtDay(id)}</span>
                      {badge(e)}
                    </span>
                    <span className={`text-[12.5px] font-semibold leading-snug ${active ? "text-white" : "text-slate-700"}`}>{e.headline || "(untitled)"}</span>
                  </button>
                );
              })}
            </div>

            {/* ATTACH — drop zone + editor + live preview for the selected entry */}
            <div className="flex min-h-0 flex-1 flex-col">
              {sel ? (
                <>
                  <div className="flex-shrink-0 border-b border-slate-200 px-6 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attaching to</p>
                    <p className="text-[14px] font-bold text-slate-900">{fmtDay(selDate)} — {sel.headline}</p>
                  </div>
                  <div className="grid min-h-0 flex-1 grid-cols-2">
                    {/* left: input */}
                    <div className="flex min-h-0 flex-col overflow-auto border-r border-slate-200 p-5">
                      <div onDrop={onDrop} onDragOver={(e) => e.preventDefault()}
                        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                        {busy ? <Loader2 size={22} className="mb-2 animate-spin text-slate-400" /> : <UploadCloud size={22} className="mb-2 text-slate-400" />}
                        <p className="text-[13px] font-bold text-slate-600">Drop the release here</p>
                        <p className="mt-0.5 text-[11.5px] text-slate-400">PDF, screenshot (PNG/JPG), or text</p>
                        <label className="mt-3 cursor-pointer rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-slate-700">
                          Choose files
                          <input type="file" multiple accept="image/*,application/pdf,text/*,.pdf,.txt,.html,.htm,.md" className="hidden"
                            onChange={(e) => handleFiles(e.target.files)} />
                        </label>
                      </div>

                      {dateWarn && (
                        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-600" />
                          <p className="text-[11.5px] font-medium leading-snug text-amber-800">{dateWarn}</p>
                        </div>
                      )}

                      {/* Press-release sanity check on the extracted text. */}
                      {prCheck && !prCheck.isPR && (
                        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-rose-600" />
                          <div>
                            <p className="text-[11.5px] font-bold text-rose-800">This doesn't look like a press release.</p>
                            <p className="mt-0.5 text-[11px] leading-snug text-rose-700">
                              Couldn't find {prCheck.missing.slice(0, 3).join(", ") || "the usual markers"}. Double-check the file — you can still save if it's correct.
                            </p>
                          </div>
                        </div>
                      )}
                      {prCheck && prCheck.isPR && (
                        <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600"><Check size={13} /> Reads like a press release ({prCheck.reasons.slice(0, 3).join(", ")})</p>
                      )}

                      {images.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-400"><ImageIcon size={12} /> Screenshots</p>
                          <div className="flex flex-wrap gap-2">
                            {images.map((src, i) => (
                              <div key={i} className="relative">
                                <img src={src} alt="" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                                <button onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-600 text-white hover:bg-rose-700"><X size={11} /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-4 flex min-h-0 flex-1 flex-col">
                        <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-400"><FileText size={12} /> Text (edit freely — fix any extraction slips)</p>
                        <textarea value={raw} onChange={(e) => setRaw(e.target.value)}
                          placeholder="Extracted or pasted release text appears here. The preview on the right shows how it will read."
                          className="min-h-[180px] flex-1 resize-none rounded-xl border border-slate-200 bg-white p-3 font-mono text-[12px] leading-relaxed text-slate-700 outline-none focus:border-slate-400" />
                      </div>
                    </div>

                    {/* right: live preview + save */}
                    <div className="flex min-h-0 flex-col">
                      <div className="flex-shrink-0 border-b border-slate-100 px-5 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preview — how it reads in the app</p>
                      </div>
                      <div className="min-h-0 flex-1 overflow-auto bg-white px-5 py-4">
                        {hasContent ? <Preview text={formatted} images={images} />
                          : <p className="mt-10 text-center text-[12.5px] text-slate-400">Nothing attached yet. Drop a file or paste text.</p>}
                      </div>
                      <div className="flex flex-shrink-0 flex-col gap-1.5 border-t border-slate-200 px-5 py-3">
                        {savedFlash && (
                          <p className="text-[11.5px] font-bold text-emerald-600">
                            Saved. {remaining > 0 ? `${remaining} release${remaining === 1 ? "" : "s"} still to add.` : "That was the last one — every release is attached! 🎉"}
                          </p>
                        )}
                        <div className="flex items-center justify-between">
                          <button onClick={() => { setRaw(""); setImages([]); setDateWarn(""); }}
                            className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-400 hover:text-rose-600"><Trash2 size={13} /> Clear</button>
                          <button onClick={save} disabled={saving}
                            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white ${savedFlash ? "bg-emerald-600" : "bg-slate-900 hover:bg-slate-700"} ${saving ? "opacity-60" : ""}`}>
                            {saving ? <Loader2 size={15} className="animate-spin" /> : savedFlash ? <Check size={15} /> : null}
                            {savedFlash ? "Saved" : "Save to this entry"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-slate-400"><p>Select an update on the left.</p></div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
