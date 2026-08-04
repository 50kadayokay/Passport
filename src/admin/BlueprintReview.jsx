// Blueprint Review — the premium, editorial review layer between AI extraction and Publish.
//
// It renders a company's extracted profile as a vertical stack of 11 landscape "conference
// slide" cards. Every field is its own rounded card with a title, a muted helper line, and
// either the extracted value or a "Waiting for AI extraction…" placeholder. Reviewing this
// should feel like flipping through a polished Keynote before it goes live — not a form.
//
// V1 is the DISPLAY layer: it binds read-only to companies.profile (the same object the app
// and Conference Mode render from, and what the importer populates). Inline editing and image
// uploads land in a follow-up; the placeholders here are exactly the spec's empty state.

import React, { useMemo, useState, useEffect, useRef } from "react";
import { Image as ImageIcon, QrCode, UploadCloud, Sparkles } from "lucide-react";
import { parseImport, applyImport } from "../lib/profileImport.js";
import { promptForPass, CONFERENCE_PROMPT } from "./promptTemplate.js";
import { updateCompany, createCompany } from "../lib/supabase.js";
import { mapProfileToPP } from "../lib/profileToPP.js";
import { authHeaders } from "../lib/auth.js";
import { saveProfileSafely, isProtectedSlug } from "../lib/profileSafety.js";
import { listVersions, restoreVersion } from "../lib/profileVersions.js";
import { flushProfileAssets } from "../lib/storage.js";

// Scale an uploaded image down and return a data URL (persisted to Storage on Save via
// flushProfileAssets). Mirrors ProfileEditor's helper so booth assets upload the same way.
function fileToScaledDataUrl(file, maxDim = 900, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL(/png/i.test(file.type) ? "image/png" : "image/jpeg", quality));
      };
      img.onerror = reject; img.src = r.result;
    };
    r.onerror = reject; r.readAsDataURL(file);
  });
}
// Immutably set a dotted path (e.g. "brand.logo") on a profile object, returning a new object.
function setProfilePath(obj, path, value) {
  const keys = path.split(".");
  const next = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
  let o = next;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    o[k] = (o[k] == null || typeof o[k] !== "object") ? {} : (Array.isArray(o[k]) ? o[k].slice() : { ...o[k] });
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
  return next;
}
import { ingestFiles, listInventory, fetchDocsText, buildTextBundle } from "../lib/onboarding/documentStore.js";
import { DOC_TYPE_LABELS } from "../lib/onboarding/classify.js";

const PASSPORT_BASE = "https://passport-xi-five.vercel.app";

/* ---------- data helpers ---------- */
const get = (obj, path) => {
  if (!obj || !path) return undefined;
  return String(path).split(".").reduce((o, k) => {
    if (o == null) return undefined;
    const m = k.match(/^(\w+)\[(\d+)\]$/);
    if (m) return (o[m[1]] || [])[Number(m[2])];
    return o[k];
  }, obj);
};
const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
const firstOf = (...vals) => vals.find((v) => !isEmpty(v));

/* ---------- premium primitives ---------- */

// A single conference page — a wide white slide card with generous padding.
function Slide({ n, kicker, title, purpose, children }) {
  return (
    <section className="mx-auto w-full max-w-[1080px] scroll-mt-6">
      <div className="mb-3 flex items-center gap-3 px-1">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-[12px] font-bold text-white">{n}</span>
        <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">{kicker}</span>
      </div>
      <div className="rounded-[28px] border border-slate-200/70 bg-white p-8 shadow-[0_2px_20px_-6px_rgba(15,23,42,0.10)] sm:p-10">
        <div className="mb-7">
          <h2 className="text-[26px] font-extrabold tracking-tight text-slate-900">{title}</h2>
          {purpose && <p className="mt-1 text-[14px] text-slate-400">{purpose}</p>}
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </section>
  );
}

// A field card: title, helper text, and the extracted value (or the waiting placeholder).
function Field({ title, help, value, big }) {
  const empty = isEmpty(value);
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${empty ? "border-slate-200/70" : "border-emerald-300 ring-1 ring-emerald-100"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
        {empty && <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-500"><Sparkles size={12} /> pending</span>}
      </div>
      {help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{help}</p>}
      {empty ? (
        <p className="mt-3 text-[14px] italic text-slate-300">Waiting for AI extraction…</p>
      ) : (
        <p className={`mt-3 whitespace-pre-line text-slate-800 ${big ? "text-[16px] leading-relaxed" : "text-[15px] leading-relaxed"}`}>{value}</p>
      )}
    </div>
  );
}

// A grid of compact stat widgets. Each item: { label, value }.
function Widgets({ title, help, items }) {
  const anyFilled = (items || []).some((it) => !isEmpty(it.value));
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${anyFilled ? "border-emerald-300 ring-1 ring-emerald-100" : "border-slate-200/70"}`}>
      {title && <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>}
      {help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{help}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((it, i) => {
          const empty = isEmpty(it.value);
          return (
            <div key={i} className="rounded-xl bg-slate-50 px-4 py-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{it.label}</div>
              <div className={`mt-1 text-[16px] font-extrabold ${empty ? "italic text-slate-300" : "text-slate-900"}`}>{empty ? "—" : it.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// A pool of repeating cards (highlights, milestones, reasons, team…). renderItem(item) -> node.
function Pool({ title, help, items, empty, renderItem }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${list.length ? "border-emerald-300 ring-1 ring-emerald-100" : "border-slate-200/70"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
        <span className="text-[11px] font-semibold text-slate-400">{list.length || 0}</span>
      </div>
      {help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{help}</p>}
      {list.length === 0 ? (
        <p className="mt-3 text-[14px] italic text-slate-300">{empty || "Waiting for AI extraction…"}</p>
      ) : (
        <div className="mt-4 space-y-2.5">{list.map((it, i) => <div key={i}>{renderItem(it, i)}</div>)}</div>
      )}
    </div>
  );
}

// An elegant image / gallery drop placeholder (upload wiring is a follow-up).
// Real image uploader for the booth. Pass `value` (a URL/data-URL) and `onChange(dataUrl)`
// to wire it to a profile field; without onChange it stays a passive placeholder.
// `round` renders the preview as a circle (logos). Images persist to Storage on Save.
function ImageSlot({ title, help, tall, gallery, round, value, onChange, maxDim = 1200 }) {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const wired = typeof onChange === "function";
  const take = async (file) => {
    if (!file || !wired) return;
    setBusy(true);
    try { onChange(await fileToScaledDataUrl(file, maxDim)); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
          {help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{help}</p>}
        </div>
        {wired && value && <button onClick={() => onChange("")} className="text-[11.5px] font-bold text-slate-400 hover:text-rose-600">Remove</button>}
      </div>
      <div
        onClick={() => wired && inputRef.current && inputRef.current.click()}
        onDragOver={(e) => { if (wired) { e.preventDefault(); setDrag(true); } }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { if (!wired) return; e.preventDefault(); setDrag(false); take(e.dataTransfer.files && e.dataTransfer.files[0]); }}
        className={`relative mt-4 flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed bg-slate-50/60 text-slate-400 ${tall ? "h-56" : "h-40"} ${drag ? "border-indigo-400 bg-indigo-50/60" : "border-slate-200"} ${wired ? "cursor-pointer hover:border-slate-300" : ""}`}
      >
        {value ? (
          <img src={value} alt="" className={round ? "h-24 w-24 rounded-full object-cover" : "h-full w-full object-contain"} />
        ) : (
          <>
            {gallery ? <ImageIcon size={26} strokeWidth={1.5} /> : <UploadCloud size={26} strokeWidth={1.5} />}
            <p className="text-[13px] font-semibold text-slate-400">{busy ? "Uploading…" : "Drag & drop an image, or click to upload"}</p>
            <p className="text-[11.5px] text-slate-300">{wired ? "Saved to this company on Save" : "Uploaded manually — not AI-extracted"}</p>
          </>
        )}
        {busy && value && <div className="absolute inset-0 grid place-items-center bg-white/60 text-[12px] font-bold text-slate-500">Uploading…</div>}
      </div>
      {wired && <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { take(e.target.files && e.target.files[0]); e.target.value = ""; }} />}
    </div>
  );
}

function Pills({ title, help, items }) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${list.length ? "border-emerald-300 ring-1 ring-emerald-100" : "border-slate-200/70"}`}>
      <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
      {help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{help}</p>}
      {list.length === 0 ? (
        <p className="mt-3 text-[14px] italic text-slate-300">Waiting for AI extraction…</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {list.map((t, i) => (
            <span key={i} className="rounded-full bg-slate-900 px-4 py-2 text-[13px] font-bold text-white">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Documents: upload the company's PDFs (extracts text) and copy that text for ChatGPT —
// all here, so the operator never has to leave this screen.
function DocPanel({ companyId }) {
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [showList, setShowList] = useState(false);
  const [filter, setFilter] = useState("");
  const inputRef = useRef(null);
  const kfmt = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n || 0));

  const load = async () => {
    if (!companyId) { setDocs([]); return; }
    try { const inv = await listInventory(companyId); setDocs(inv.docs || []); setErr(""); }
    catch (e) { setErr(e.message || "Couldn't load documents"); }
  };
  useEffect(() => { setDocs([]); setErr(""); setResult(""); setSelected(new Set()); setShowList(false); load(); /* eslint-disable-next-line */ }, [companyId]);

  const onFiles = async (fl) => {
    const files = Array.from(fl || []); if (!files.length) return;
    if (!companyId) { setErr("No company selected — pick one from the dropdown above first."); return; }
    setBusy(`Reading 0/${files.length}…`); setErr(""); setResult("");
    try {
      const res = await ingestFiles(companyId, files, { onProgress: (d, t) => setBusy(`Reading ${d}/${t}…`) });
      await load();
      const ok = res.filter((r) => r.id).length;
      const dup = res.filter((r) => r.status === "duplicate").length;
      const failed = res.filter((r) => r.status === "failed");
      setResult(`${ok} read${dup ? ` · ${dup} duplicate` : ""}${failed.length ? ` · ${failed.length} failed` : ""}`);
      if (failed.length) setErr(`${failed.length} failed — ${failed.slice(0, 2).map((f) => `${f.name}: ${f.error || "unknown error"}`).join("; ")}${failed.length > 2 ? " …" : ""}`);
    } catch (e) { setErr(e.message || "Upload failed"); }
    finally { setBusy(""); if (inputRef.current) inputRef.current.value = ""; }
  };

  const dchars = (d) => (d.meta && d.meta.charCount) || 0;
  const groups = useMemo(() => {
    const g = {}; docs.forEach((d) => { const k = d.kind || "unknown"; (g[k] = g[k] || []).push(d); });
    return Object.keys(g).sort().map((k) => ({ type: k, ids: g[k].map((d) => d.id), chars: g[k].reduce((n, d) => n + dchars(d), 0) }));
  }, [docs]);
  const totalChars = useMemo(() => docs.reduce((n, d) => n + dchars(d), 0), [docs]);
  const selChars = useMemo(() => docs.filter((d) => selected.has(d.id)).reduce((n, d) => n + dchars(d), 0), [docs, selected]);
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const copy = async (ids, label) => {
    setBusy("Preparing text…"); setCopied("");
    try {
      const rows = await fetchDocsText(companyId, ids);
      const bundle = buildTextBundle(rows);
      if (!bundle.trim()) { setCopied("No readable text — those docs are image-only"); setTimeout(() => setCopied(""), 3500); return; }
      try { await navigator.clipboard.writeText(bundle); }
      catch (_) {
        const ta = document.createElement("textarea"); ta.value = bundle; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (__) {} document.body.removeChild(ta);
      }
      setCopied(`${label} copied · ${Math.round(bundle.length / 1000)}k chars`); setTimeout(() => setCopied(""), 4000);
    } finally { setBusy(""); }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!drag) setDrag(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
      className={`rounded-2xl border-2 border-dashed p-4 transition ${drag ? "border-slate-500 bg-slate-100" : "border-slate-200 bg-slate-50/60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-slate-400">Documents</span>
        <span className="text-[12px] font-semibold text-slate-500">{busy ? busy : drag ? "Drop to upload…" : docs.length ? `${docs.length} uploaded` : "Drag & drop the company's PDFs here, or"}</span>
        {result && !busy && <span className="text-[11.5px] text-slate-400">· {result}</span>}
        <button onClick={load} disabled={!!busy} className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-500 hover:text-slate-800 disabled:opacity-50">Refresh</button>
        <button onClick={() => inputRef.current && inputRef.current.click()} disabled={!!busy}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-700 hover:border-slate-400 disabled:opacity-50">Choose files</button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </div>
      {err && <p className="mt-2 text-[12px] font-semibold text-rose-600">{err}</p>}
      {docs.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-slate-400">Copy text:</span>
            <button onClick={() => copy(null, "All documents")} disabled={!!busy}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50 ${totalChars > 250000 ? "bg-rose-500 hover:bg-rose-600" : "bg-slate-900 hover:bg-slate-700"}`}>
              All · {kfmt(totalChars)}
            </button>
            {groups.map((g) => (
              <button key={g.type} onClick={() => copy(g.ids, DOC_TYPE_LABELS[g.type] || g.type)} disabled={!!busy}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-600 hover:border-slate-400 disabled:opacity-50">{DOC_TYPE_LABELS[g.type] || g.type} · {kfmt(g.chars)}</button>
            ))}
            <button onClick={() => setShowList((v) => !v)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-700 hover:border-slate-400">{showList ? "Hide list" : "Pick documents…"}</button>
          </div>
          {totalChars > 250000 && <p className="mt-1 text-[11.5px] font-semibold text-rose-500">"All" is {kfmt(totalChars)} chars — too big for one ChatGPT paste (~250k max). Pick the documents each pass needs below.</p>}

          {showList && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search filenames…"
                  className="w-44 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-700 outline-none focus:border-slate-400" />
                <span className="text-[11.5px] font-bold text-slate-500">{selected.size} selected · {kfmt(selChars)} chars {selChars > 250000 && <span className="text-rose-500">(too big — trim)</span>}</span>
                <button onClick={() => setSelected(new Set())} className="text-[11.5px] font-bold text-slate-400 hover:text-slate-700">Clear</button>
                <button onClick={() => copy(Array.from(selected), "Selected documents")} disabled={!!busy || !selected.size}
                  className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-slate-700 disabled:opacity-40">Copy selected</button>
              </div>
              <div className="max-h-60 overflow-auto p-1.5">
                {docs
                  .filter((d) => { const q = filter.trim().toLowerCase(); return !q || (d.filename || "").toLowerCase().includes(q) || (d.title || "").toLowerCase().includes(q); })
                  .map((d) => (
                    <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} className="h-4 w-4 flex-shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-700" title={d.filename}>{d.filename}</span>
                      <span className="flex-shrink-0 text-[10.5px] text-slate-400">{DOC_TYPE_LABELS[d.kind] || d.kind || "?"} · {kfmt(dchars(d))}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
      {copied && <p className="mt-2 text-[12px] font-semibold text-emerald-600">{copied} — now paste it into ChatGPT with the prompt.</p>}
    </div>
  );
}

/* ---------- the page ---------- */

export default function BlueprintReview({ companies = [], onReload }) {
  const sorted = useMemo(
    () => companies.slice().sort((a, b) => String(a.name || a.slug).localeCompare(String(b.name || b.slug))),
    [companies]
  );
  const [slug, setSlug] = useState("");   // no auto-select — you must pick a company first
  const company = sorted.find((c) => c.slug === slug);

  // Local working profile — starts from the company's saved profile, updates live as you paste
  // extraction results into the box above, and persists on Save.
  const [profile, setProfile] = useState({});
  const [paste, setPaste] = useState("");
  const [loadMsg, setLoadMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [promptCopied, setPromptCopied] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [baseline, setBaseline] = useState(null);   // the company's saved profile at selection — for Undo
  const [touched, setTouched] = useState(false);
  // Set an image (or any) field on the working profile, live. Persisted to Storage on Save.
  const setImg = (path, val) => { setProfile((pr) => setProfilePath(pr, path, val)); setDirty(true); setTouched(true); };
  // The booth logo doubles as the circular avatar — set both from one upload.
  const setLogo = (val) => { setProfile((pr) => setProfilePath(setProfilePath(pr, "brand.logo", val), "brand.avatar", val)); setDirty(true); setTouched(true); };
  const [versions, setVersions] = useState([]);     // profile version-history snapshots (newest first)
  const [histMsg, setHistMsg] = useState(null);
  const loadVersions = async (c) => { try { setVersions(c?.id ? await listVersions(c.id) : []); } catch { setVersions([]); } };
  useEffect(() => { setProfile(company?.profile || {}); setBaseline(company?.profile || {}); setTouched(false); setPaste(""); setLoadMsg(null); setDirty(false); setHistMsg(null); loadVersions(company); /* eslint-disable-next-line */ }, [slug]);
  const doRestoreVersion = async (v) => {
    if (!company) return;
    if (!window.confirm(`Restore ${company.name || company.slug} to the snapshot from ${new Date(v.created_at).toLocaleString()}? Your current profile is snapshotted first, so this is undoable.`)) return;
    setHistMsg({ ok: null, text: "Restoring…" });
    try {
      await restoreVersion(company, v.id);
      setHistMsg({ ok: true, text: "Restored. Refresh the app to confirm." });
      await loadVersions(company);
    } catch (e) { setHistMsg({ ok: false, text: e.message || "Restore failed" }); }
  };
  const p = profile;

  // Download the prompt as a .md file (don't copy) — the prompt is ~33k chars and pasting it
  // into ChatGPT truncates the schema. Attaching the file makes ChatGPT read it completely.
  const downloadPrompt = (id, label) => {
    // The Conference pass (booth narrative: hook, highlights, investment case, section intros)
    // is its own standalone prompt, not one of the app-profile passes.
    const text = id === "conference" ? CONFERENCE_PROMPT : promptForPass(id);
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url; a.download = `passport-${id}-prompt.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setPromptCopied(label); setTimeout(() => setPromptCopied(""), 2500);
  };

  // Copy the current profile as compact JSON — the ideal input for the Conference pass
  // (which reuses the existing profile) and for re-running any pass. Strips the derived
  // `pp` and any base64 image data URLs so it's small and textual (well under the paste limit).
  const copyProfileJson = async () => {
    const clean = JSON.parse(JSON.stringify(profile || {}));
    delete clean.pp;
    const strip = (o) => {
      if (Array.isArray(o)) o.forEach(strip);
      else if (o && typeof o === "object") for (const k of Object.keys(o)) {
        if (typeof o[k] === "string" && o[k].startsWith("data:")) o[k] = "";
        else strip(o[k]);
      }
    };
    strip(clean);
    const text = JSON.stringify(clean);
    try {
      await navigator.clipboard.writeText(text);
      setLoadMsg({ ok: true, text: `Profile JSON copied (${Math.round(text.length / 1000)}k chars). Paste it into ChatGPT with the Conference prompt — no documents needed.` });
    } catch (e) { setLoadMsg({ ok: false, text: "Couldn't copy — your browser blocked clipboard access." }); }
  };

  const loadText = (text) => {
    const parsed = parseImport(text || "");
    if (!parsed.ok) { setLoadMsg({ ok: false, text: parsed.error }); return; }
    const { next, report } = applyImport(profile, parsed.payload, parsed.auditText || "", parsed.imageGuide || "");
    setProfile(next); setDirty(true); setTouched(true); setPaste("");
    const known = parsed.known || [];
    setLoadMsg({ ok: true, text: `Loaded ${known.length} section${known.length === 1 ? "" : "s"}${known.length ? ": " + known.join(", ") : ""}. Review below, then Save.`, warnings: (report && report.warnings) || [] });
  };
  const loadPaste = () => loadText(paste);
  const jsonFileRef = useRef(null);
  const onJsonFile = async (fl) => {
    const f = Array.from(fl || [])[0]; if (!f) return;
    try { loadText(await f.text()); } catch (e) { setLoadMsg({ ok: false, text: e.message || "Couldn't read that file" }); }
    if (jsonFileRef.current) jsonFileRef.current.value = "";
  };

  // FULL REPLACE of this company's profile from a JSON file (for restoring a backup). Unlike Load
  // (which merges), this overwrites the entire profile column.
  const restoreRef = useRef(null);
  const restoreFromFile = async (fl) => {
    const f = Array.from(fl || [])[0]; if (!f || !company) return;
    try {
      const obj = JSON.parse(await f.text());
      const prof = (obj && typeof obj === "object" && obj.profile && typeof obj.profile === "object") ? obj.profile : obj;
      if (!prof || typeof prof !== "object" || Array.isArray(prof)) { setLoadMsg({ ok: false, text: "That file isn't a profile object." }); return; }
      if (!window.confirm(`REPLACE ${company.name || company.slug}'s ENTIRE profile with this file? This overwrites everything currently on this record — use only to restore a backup.`)) return;
      const withPp = { ...prof, pp: mapProfileToPP(prof) };
      // Restoring a backup is a sanctioned full replace; snapshot current first (undoable)
      // and allow it even on a protected flagship (this IS the recovery path).
      await saveProfileSafely(company, withPp, { note: "before restore-from-file", allowProtected: true });
      setProfile(withPp); setBaseline(withPp); setDirty(false); setTouched(false);
      setLoadMsg({ ok: true, text: "Profile fully replaced from file — restore complete (previous state snapshotted)." });
    } catch (e) { setLoadMsg({ ok: false, text: e.message || "Restore failed" }); }
    finally { if (restoreRef.current) restoreRef.current.value = ""; }
  };

  // ONE-CLICK emergency restore of the live Kingsmen app profile from the July-18 backup asset.
  const [restoreState, setRestoreState] = useState("");
  const restoreLiveKingsmen = async () => {
    setRestoreState("busy");
    try {
      const res = await fetch("/kingsmen-resources-backup.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Backup asset not found yet — the deploy may still be finishing; wait a minute and retry.");
      const prof = await res.json();
      // CRITICAL: the pristine live Kingsmen profile has NO `pp` object — the investor
      // app renders Kingsmen from its built-in prototype (the original, richly-authored
      // profile) whenever `pp` is absent. The previous version generated a pp here via
      // mapProfileToPP(), which injected a THIN pp that OVERRODE the prototype and caused
      // the regressions (wrong hero/avatar, no logo fade, missing project widgets,
      // overflowing core-value drivers, thin AI brief, swapped projects). Restore WITHOUT
      // any pp so the app falls back to the pristine prototype exactly as before.
      const { pp: _dropPp, ...clean } = prof;
      // Sanctioned recovery of the protected flagship: snapshot current first, then write.
      await saveProfileSafely(
        { slug: "kingsmen-resources", id: company?.id, profile: company?.profile, name: "Kingsmen Resources" },
        clean,
        { note: "before emergency Kingsmen restore", allowProtected: true }
      );
      setRestoreState("done");
    } catch (e) { setRestoreState("err:" + (e.message || "restore failed")); }
  };
  const save = async () => {
    if (!company) return;
    // HARD LOCK: the protected flagship (Kingsmen) is never overwritten by this tooling.
    if (isProtectedSlug(company.slug)) {
      setLoadMsg({ ok: false, text: `"${company.slug}" is the protected flagship profile — it can't be overwritten here. Duplicate it to a draft and work on that.` });
      return;
    }
    // Guard: never let conference/extraction work silently overwrite a LIVE published profile.
    if (company.status === "published" && !window.confirm(`⚠️ ${company.name || company.slug} is LIVE on the app. Saving OVERWRITES the public profile investors currently see — this is exactly what must NOT happen during conference/extraction work. Build on a draft instead. Only continue if you truly intend to change the live profile. Continue?`)) return;
    setSaving(true);
    try {
      // Push any freshly-uploaded images (data URLs) to Storage → URLs, so the row stays
      // small (base64 images previously bloated it to a timeout).
      const flushed = await flushProfileAssets(profile);
      const withPp = { ...flushed, pp: mapProfileToPP(flushed) };
      // Snapshot-before-write: any save is one-click recoverable from version history.
      const { snapshot } = await saveProfileSafely(company, withPp, { note: "before Blueprint Review save" });
      setProfile(withPp); setDirty(false);
      setLoadMsg({ ok: true, text: `Saved to company — the app and Conference Mode now use this data.${snapshot && !snapshot.ok ? " (⚠️ version history not captured: apply migration 0013)" : ""}` });
    } catch (e) { setLoadMsg({ ok: false, text: e.message || "Save failed" }); } finally { setSaving(false); }
  };
  // Undo everything loaded this session — restore the company's saved state (and persist it, in
  // case you already hit Save on the wrong company).
  const undo = async () => {
    const b = baseline || {};
    const restored = { ...b, pp: mapProfileToPP(b) };
    setProfile(restored); setDirty(false); setTouched(false);
    try {
      if (company && isProtectedSlug(company.slug)) {
        setLoadMsg({ ok: true, text: "Reverted in-view. (The protected flagship isn't written from here — nothing was persisted.)" });
        return;
      }
      if (company) await saveProfileSafely(company, restored, { note: "before Blueprint Review undo" });
    } catch (e) { setLoadMsg({ ok: false, text: e.message || "Revert failed" }); return; }
    setLoadMsg({ ok: true, text: "Reverted — this company is back to its saved state from before you loaded." });
  };

  // DUPLICATE TO DRAFT — the sanctioned way to build Conference Mode for a protected/live
  // company. Clones the current profile into a NEW draft company (never published, so it's
  // not public and never touches the live app profile). All conference work then happens on
  // the draft, and the booth is previewed from it.
  const [dupState, setDupState] = useState("");
  const duplicateToDraft = async () => {
    if (!company) return;
    setDupState("busy");
    try {
      const base = String(company.slug).replace(/-(conf|conference|draft)(-\d+)?$/i, "");
      const draftSlug = `${base}-conference`;
      // Clone the live source profile; generate a fresh pp so the DRAFT renders fully. (The
      // draft is a normal company — only the live flagship must stay pp-less.)
      const src = company.profile || {};
      const cloneProfile = { ...src, pp: mapProfileToPP(src) };
      let created;
      try {
        created = await createCompany(
          { slug: draftSlug, name: `${company.name || base} (Conference Draft)`, primary_ticker: company.primary_ticker || null, profile: cloneProfile },
          await authHeaders()
        );
      } catch (e) {
        // Slug already taken → the draft exists; just select it.
        if (/409|duplicate|unique/i.test(e.message || "")) {
          if (onReload) await onReload();
          setSlug(draftSlug);
          setDupState("");
          setLoadMsg({ ok: true, text: `A conference draft "${draftSlug}" already exists — selected it. Do your conference work here.` });
          return;
        }
        throw e;
      }
      if (onReload) await onReload();
      setSlug(created?.slug || draftSlug);
      setDupState("done");
      setLoadMsg({ ok: true, text: `Created draft "${created?.slug || draftSlug}". Populate Conference Mode here — the live ${base} app profile is untouched.` });
    } catch (e) { setDupState(""); setLoadMsg({ ok: false, text: e.message || "Duplicate failed" }); }
  };

  const tickers = useMemo(() => {
    const list = get(p, "company.listings");
    if (Array.isArray(list) && list.length) return list.map((l) => (l.ex && l.sym ? `${l.ex}: ${l.sym}` : l.sym || l.ex)).filter(Boolean);
    const t = get(p, "company.ticker");
    return t ? [t] : [];
  }, [profile]);

  const projects = Array.isArray(p.projects) ? p.projects : [];
  const team = Array.isArray(p.team) ? p.team : [];
  const ceo = team.find((m) => /chief executive|CEO|founder|president/i.test(m?.role || "")) || team[0];
  const others = team.filter((m) => m !== ceo);
  const conf = p.conference || {};
  const cap = p.capital || {};
  const cmp = p.compare || {};
  // The company description comes from the Pass-1 companyBrief ("What They Do" section) until the
  // conference pass writes a dedicated overview.
  const briefSections = Array.isArray(get(p, "companyBrief.sections")) ? get(p, "companyBrief.sections") : [];
  const briefSection = (re) => (briefSections.find((s) => new RegExp(re, "i").test(s?.k || "")) || {}).v;

  return (
    <div className="h-full overflow-y-auto bg-slate-50/60">
      {/* top bar */}
      <div className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/85 px-8 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-4">
          <div>
            <div className="text-[17px] font-extrabold tracking-tight text-slate-900">Blueprint Review</div>
            <div className="text-[12px] text-slate-400">Review every extracted field before publishing — this is what the company will see.</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select value={slug} onChange={(e) => setSlug(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13.5px] font-bold text-slate-700">
              <option value="">Select a company…</option>
              {sorted.map((c) => <option key={c.slug} value={c.slug}>{c.name || c.slug} — {c.slug}{c.status === "published" ? " · LIVE" : " · draft"}</option>)}
            </select>
            {company && (company.status === "published" || isProtectedSlug(company.slug)) && (
              <button onClick={duplicateToDraft} disabled={dupState === "busy"}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-[13.5px] font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
                {dupState === "busy" ? "Duplicating…" : "Duplicate to draft"}
              </button>
            )}
            {company && (
              <a href={`${PASSPORT_BASE}/app?c=${encodeURIComponent(slug)}&ipad=1&scene=1${company.preview_token ? `&preview=${company.preview_token}` : ""}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-[13.5px] font-bold text-white hover:bg-indigo-700">
                Preview Conference Mode ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {company && isProtectedSlug(company.slug) && (
        <div className="border-b border-amber-200 bg-amber-50 px-8 py-3">
          <div className="mx-auto max-w-[1080px] text-[13px] font-semibold text-amber-800">
            <b>{company.slug}</b> is the protected live flagship — Conference/extraction work can’t be saved onto it (that’s what broke the app before).
            Click <b>Duplicate to draft</b> above to make a safe copy, then build and preview Conference Mode there. The live app profile stays untouched.
          </div>
        </div>
      )}

      {company && (
        <div className="border-b border-slate-200 bg-slate-50 px-8 py-3">
          <div className="mx-auto max-w-[1080px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Version history</span>
              {isProtectedSlug(company.slug) && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">Protected flagship — can't be overwritten by tooling</span>
              )}
              <button onClick={() => loadVersions(company)} className="ml-auto text-[12px] font-semibold text-slate-500 hover:text-slate-800">Refresh</button>
            </div>
            {histMsg && <div className={`mt-1 text-[12px] font-semibold ${histMsg.ok === false ? "text-rose-700" : histMsg.ok ? "text-emerald-700" : "text-slate-500"}`}>{histMsg.text}</div>}
            {versions.length === 0 ? (
              <p className="mt-1 text-[12px] text-slate-400">No snapshots yet. One is saved automatically before every save/publish/restore. (If none ever appear, apply migration 0013.)</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {versions.slice(0, 8).map((v) => (
                  <li key={v.id} className="flex items-center gap-3 rounded-lg bg-white px-3 py-1.5 text-[12.5px] ring-1 ring-slate-200">
                    <span className="font-mono text-slate-500">{new Date(v.created_at).toLocaleString()}</span>
                    <span className="truncate text-slate-600">{v.note || "snapshot"}</span>
                    <button onClick={() => doRestoreVersion(v)} className="ml-auto rounded-md bg-slate-800 px-2.5 py-1 text-[11.5px] font-bold text-white hover:bg-slate-900">Restore</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {!company ? (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-slate-400">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100"><Sparkles size={24} /></div>
          <p className="text-[15px] font-bold text-slate-600">Pick a company to review its Blueprint</p>
        </div>
      ) : (
        <div className="space-y-10 px-8 py-10">

          {/* PASTE & LOAD — the extraction lands here and fills the template below, live. */}
          <section className="mx-auto w-full max-w-[1080px]">
            <div className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_2px_20px_-6px_rgba(15,23,42,0.10)] sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[19px] font-extrabold tracking-tight text-slate-900">Paste extracted data</h2>
                  <p className="mt-0.5 text-[13px] text-slate-400">Paste the JSON ChatGPT returned — it loads into the template below, live. Paste each pass as you run it; sections merge, nothing is overwritten.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={loadPaste} disabled={!paste.trim()} className="rounded-xl bg-slate-900 px-4 py-2.5 text-[14px] font-bold text-white hover:bg-slate-700 disabled:opacity-40">Load into template</button>
                  <button onClick={() => jsonFileRef.current && jsonFileRef.current.click()} title="Load a JSON file ChatGPT generated (for big passes)" className="rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:border-slate-400">Load JSON file</button>
                  <input ref={jsonFileRef} type="file" accept=".json,.txt,application/json,text/plain" className="hidden" onChange={(e) => onJsonFile(e.target.files)} />
                  <button onClick={save} disabled={!dirty || saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:border-slate-400 disabled:opacity-40">{saving ? "Saving…" : dirty ? "Save" : "Saved"}</button>
                  {touched && <button onClick={undo} className="rounded-xl border border-rose-200 px-4 py-2.5 text-[14px] font-bold text-rose-600 hover:bg-rose-50">Undo</button>}
                  <button onClick={() => restoreRef.current && restoreRef.current.click()} title="Replace this company's ENTIRE profile from a backup JSON file (full restore)" className="rounded-xl border border-amber-200 px-4 py-2.5 text-[14px] font-bold text-amber-700 hover:bg-amber-50">Restore from file</button>
                  <input ref={restoreRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => restoreFromFile(e.target.files)} />
                </div>
              </div>
              {/* Documents — upload + copy text, right here. */}
              <div className="mt-4">
                <DocPanel companyId={company.id} />
              </div>

              {/* Prompts to give ChatGPT — copy the pass you're running, plus an info button. */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] font-bold uppercase tracking-wide text-slate-400">Prompt file (attach to ChatGPT):</span>
                {[{ id: "p1", label: "Company" }, { id: "p2", label: "Projects" }, { id: "p3", label: "Timeline" }, { id: "conference", label: "Conference" }].map((pp) => (
                  <button key={pp.id} onClick={() => downloadPrompt(pp.id, pp.label)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-600 hover:border-slate-400">
                    {promptCopied === pp.label ? "Downloaded ✓" : `${pp.label} prompt`}
                  </button>
                ))}
                <button onClick={() => setShowInfo((v) => !v)} title="How to use this"
                  className={`grid h-7 w-7 place-items-center rounded-full border text-[13px] font-bold italic ${showInfo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-500 hover:border-slate-500 hover:text-slate-700"}`}>i</button>
              </div>
              {/* Conference pass reuses the existing profile — feed it the profile JSON, not the giant docs. */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] font-bold uppercase tracking-wide text-indigo-400">For the Conference pass:</span>
                <button onClick={copyProfileJson}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[12.5px] font-bold text-indigo-700 hover:bg-indigo-100">
                  Copy profile JSON
                </button>
                <span className="text-[11.5px] text-slate-400">Paste this + the Conference prompt into ChatGPT (no documents needed).</span>
              </div>

              {showInfo && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-600">
                  <div className="mb-1.5 text-[13.5px] font-bold text-slate-800">How to populate this page</div>
                  <ol className="list-decimal space-y-1.5 pl-5">
                    <li>In <b>Documents</b> above: upload the company's PDFs (it reads out the text).</li>
                    <li>Download the pass prompt — click <b>Company prompt</b> (then Projects, then Timeline). It saves a small <code>.md</code> file.</li>
                    <li>Open a <b>new ChatGPT chat</b> → <b>attach the prompt file</b> (don't paste it — it's too long and truncates) → then click <b>Copy text</b> above and <b>paste the document text</b> into the chat → send.</li>
                    <li>Copy ChatGPT's reply → paste it in the box below → <b>Load into template</b>.</li>
                    <li>Repeat for each pass; sections merge. When it looks right, press <b>Save</b>.</li>
                  </ol>
                  <p className="mt-2 text-[12.5px] text-slate-500"><b>Attach the prompt, paste the text.</b> The prompt is long — attaching it keeps ChatGPT from truncating it. The document text is what ChatGPT reads to fill the fields.</p>
                </div>
              )}

              <textarea value={paste} onChange={(e) => setPaste(e.target.value)}
                placeholder="Paste the entire ChatGPT reply here (=== PROFILE JSON === … ). Partial passes are fine — Company, then Projects, then Timeline."
                className="mt-4 h-36 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-[12.5px] leading-relaxed text-slate-800 outline-none focus:border-slate-400" />
              {loadMsg && (
                <div className={`mt-3 rounded-2xl border p-3.5 text-[13px] font-semibold ${loadMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                  {loadMsg.text}
                  {loadMsg.warnings && loadMsg.warnings.length > 0 && (
                    <ul className="mt-2 space-y-1 font-normal text-amber-700">{loadMsg.warnings.map((w, i) => <li key={i}>• {w}</li>)}</ul>
                  )}
                </div>
              )}
              {dirty && <p className="mt-2 text-[12px] font-semibold text-amber-600">Unsaved — press Save to keep this and feed the app + Conference Mode.</p>}
            </div>
          </section>

          {/* PAGE 1 — HERO */}
          <Slide n={1} kicker="Page 1" title="Company Hero" purpose="Introduce the company.">
            <div className="grid gap-5 sm:grid-cols-2">
              <ImageSlot title="Company Logo" help="Circular logo shown on the booth + app." round value={firstOf(get(p, "brand.logo"), get(p, "brand.avatar"))} onChange={setLogo} maxDim={640} />
              <ImageSlot title="Hero Image" help="Full-bleed image behind the booth hero + status card." tall value={firstOf(get(p, "brand.hero"), get(p, "companyStatus.photo"))} onChange={(v) => setImg("brand.hero", v)} maxDim={1600} />
            </div>
            <Field title="Company Name" help="Official legal company name." value={get(p, "company.name")} big />
            <Field title="Slogan" help="Primary marketing slogan, in the company's own words." value={get(p, "company.slogan")} />
            <Pills title="Tickers" help="Every exchange listing, one pill each." items={tickers} />
          </Slide>

          {/* PAGE 2 — COMPANY OVERVIEW */}
          <Slide n={2} kicker="Page 2" title="Company Overview" purpose="Explain who the company is.">
            <Field title="Headline" help="Company positioning statement." value={firstOf(conf.hook, get(p, "companyStatus.statusHeadline"))} big />
            <Field title="Company Overview" help="One editorial paragraph describing what the company does, where it operates, and what sets it apart." value={firstOf(conf.overview, briefSection("what they do"), get(p, "companyBrief.sections[0].v"), get(p, "companyBrief.keyPoints[0]"))} big />
            <Widgets title="Company Information" help="Key facts, each as its own widget."
              items={[
                { label: "Headquarters", value: firstOf(cmp.headquarters, get(p, "company.location")) },
                { label: "Jurisdiction", value: firstOf(cmp.jurisdiction, get(p, "company.jurisdiction")) },
                { label: "Commodity", value: get(p, "company.commodity") },
                { label: "Primary Metal", value: firstOf(cmp.primaryCommodity, get(p, "company.commodity")) },
                { label: "Stage", value: firstOf(get(p, "company.stage"), cmp.marketCapTier) },
                { label: "Deposit Type", value: get(p, "projects[0].snapshot.depositType.value") },
                { label: "Flagship Project", value: firstOf(conf.featuredProjectKey, get(p, "projects[0].name")) },
                { label: "Secondary Project", value: get(p, "projects[1].name") },
                { label: "Ownership", value: firstOf(cap.ownership, cmp.fundedStatus) },
              ]}
            />
            <ImageSlot title="Hero Image" help="Large supporting image for this page." tall />
          </Slide>

          {/* PAGE 3 — HIGHLIGHTS */}
          <Slide n={3} kicker="Page 3" title="Company Highlights" purpose="Quick investor summary.">
            <Pool title="Highlights" help="Every highlight is its own card — not a bullet list." items={conf.highlights}
              renderItem={(h) => (
                <div className="rounded-xl bg-slate-50 px-4 py-3.5">
                  <div className="text-[15px] font-bold text-slate-900">{h.value || h.label}</div>
                  {h.label && h.value && <div className="text-[12.5px] text-slate-500">{h.label}</div>}
                  {h.context && <div className="mt-0.5 text-[13px] text-slate-500">{h.context}</div>}
                </div>
              )}
            />
            <Field title="Highlights Summary" help="A short editorial paragraph explaining why these highlights matter." value={conf.highlightsIntro} big />
          </Slide>

          {/* PAGE 4 — JURISDICTION */}
          <Slide n={4} kicker="Page 4" title="Jurisdiction" purpose="Explain why the jurisdiction matters.">
            <Field title="Jurisdiction Overview" help="Editorial paragraph on the region and why it's favorable." value={firstOf(conf.region, conf.districtContext)} big />
            <ImageSlot title="Jurisdiction Image" help="Map or regional photo." tall />
            <Widgets title="Jurisdiction Facts" help="Each fact as its own card."
              items={[
                { label: "Mining Friendly", value: cmp.jurisdictionRisk ? (cmp.jurisdictionRisk === "low" ? "Yes" : cmp.jurisdictionRisk) : undefined },
                { label: "Road Access", value: undefined },
                { label: "Power", value: undefined },
                { label: "Infrastructure", value: undefined },
                { label: "Permitting", value: undefined },
                { label: "Political Stability", value: undefined },
                { label: "Mining History", value: undefined },
                { label: "Nearby Operators", value: undefined },
              ]}
            />
          </Slide>

          {/* PAGE 5 — PROJECTS (repeats) */}
          <Slide n={5} kicker="Page 5" title="Projects" purpose="Every project becomes its own section.">
            {projects.length === 0 ? (
              <Field title="Projects" help="Each project gets a name, summary, key details and an image gallery." value={undefined} />
            ) : (
              projects.map((pr, i) => (
                <div key={pr.key || i} className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-5">
                  <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">Project {i + 1}</div>
                  <div className="space-y-4">
                    <Field title="Project Name" help="Property / project name." value={pr.name} big />
                    <Field title="Project Summary" help="One paragraph on what this project is and why it matters." value={firstOf(get(pr, "brief.overview"), Array.isArray(pr.narrative) ? pr.narrative.join("\n\n") : pr.narrative, pr.short)} big />
                    <Widgets title="Key Details"
                      items={[
                        { label: "Ownership", value: get(pr, "snapshot.ownership.value") },
                        { label: "Commodity", value: get(pr, "snapshot.commodity.value") },
                        { label: "Stage", value: pr.stageName },
                        { label: "Deposit Type", value: get(pr, "snapshot.depositType.value") },
                        { label: "Location", value: firstOf(pr.locationFull, get(pr, "snapshot.location.value")) },
                        { label: "Land Package", value: get(pr, "snapshot.landPackage.value") },
                      ]}
                    />
                    <ImageSlot title="Project Images" help="Gallery — drag & drop, carousel preview." gallery tall />
                  </div>
                </div>
              ))
            )}
          </Slide>

          {/* PAGE 6 — DRILL RESULTS */}
          <Slide n={6} kicker="Page 6" title="Drill Results" purpose="Display the best technical results.">
            <Field title="Featured Drill Result" help="The single most important hole, summarized." value={firstOf(conf.resultsIntro, get(p, "projects[0].drillResults.rows[0].hole"))} big />
            <Widgets title="Key Results" help="Each headline result as its own card."
              items={[
                { label: "Best Hole", value: get(p, "projects[0].drillResults.rows[0].hole") },
                { label: "Top Interval", value: get(p, "projects[0].drillResults.rows[0].interval") },
                { label: "Top Grade", value: get(p, "projects[0].drillResults.rows[0].grade") },
                { label: "Discovery Hole", value: undefined },
                { label: "Latest Result", value: undefined },
              ]}
            />
            <ImageSlot title="Core Images" help="Core / drill photo gallery." gallery tall />
          </Slide>

          {/* PAGE 7 — TIMELINE */}
          <Slide n={7} kicker="Page 7" title="Timeline" purpose="Show company progress.">
            <Field title="Timeline Header" help="A short title for the company's progress story." value={conf.timelineIntro} />
            <Field title="Timeline Summary" help="Editorial paragraph framing the milestones below." value={conf.timelineIntro} big />
            <Pool title="Milestones" help="Every milestone is its own card — newest first." items={(Array.isArray(p.timeline) ? p.timeline : []).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))}
              renderItem={(m) => (
                <div className="rounded-xl bg-slate-50 px-4 py-3.5">
                  <div className="text-[12px] font-bold uppercase tracking-wide text-slate-400">{m.date || "—"}</div>
                  <div className="mt-0.5 text-[15px] font-bold text-slate-900">{m.headline || m.originalTitle}</div>
                  {m.whatHappened && <div className="mt-1 text-[13px] leading-relaxed text-slate-500">{m.whatHappened}</div>}
                </div>
              )}
            />
          </Slide>

          {/* PAGE 8 — CAPITAL */}
          <Slide n={8} kicker="Page 8" title="Capital" purpose="Summarize company finances.">
            <Field title="Capital Overview" help="Editorial paragraph on the company's financial position." value={firstOf(conf.capitalIntro, cap.headline, cap.subtext)} big />
            <Widgets title="Capital" help="Every statistic as its own card — verbatim from filings."
              items={[
                { label: "Cash", value: cap.cash },
                { label: "Debt", value: cap.debt },
                { label: "Shares Outstanding", value: cap.outstanding },
                { label: "Fully Diluted", value: cap.fd },
                { label: "Market Cap", value: cap.marketCap },
                { label: "Working Capital", value: cap.workingCapital },
                { label: "Share Price", value: cap.sharePrice },
                { label: "Last Financing", value: firstOf(cap.financing, cap.financingType) },
              ]}
            />
            <ImageSlot title="Ownership Visualization" help="Ownership breakdown bar (rendered from ownership data)." />
          </Slide>

          {/* PAGE 9 — LEADERSHIP */}
          <Slide n={9} kicker="Page 9" title="Leadership" purpose="Introduce management.">
            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-5">
              <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">Chief Executive</div>
              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <ImageSlot title="Photo" help="CEO headshot." />
                <div className="space-y-3">
                  <Field title="Name" help="Full name." value={ceo?.name} />
                  <Field title="Role" help="Title." value={ceo?.role} />
                  <Field title="Biography" help="Short professional biography." value={firstOf(ceo?.full, ceo?.short)} big />
                </div>
              </div>
            </div>
            <Pool title="Team" help="Each team member as a profile card, with a headshot slot. Names & roles are auto-filled; drop in photos." items={others}
              renderItem={(m) => (
                <div className="flex items-start gap-4 rounded-xl bg-slate-50 px-4 py-3.5">
                  <button title="Upload headshot" className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-full border-2 border-dashed border-slate-200 bg-white text-slate-300 hover:border-slate-400">
                    <UploadCloud size={18} strokeWidth={1.5} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-slate-900">{m.name}</div>
                    <div className="text-[12.5px] font-semibold text-slate-500">{m.role}</div>
                    {(m.short || m.full) && <div className="mt-1 text-[13px] leading-relaxed text-slate-500">{m.short || m.full}</div>}
                  </div>
                </div>
              )}
            />
          </Slide>

          {/* PAGE 10 — WHY INVEST */}
          <Slide n={10} kicker="Page 10" title="Why Invest" purpose="Summarize the investment thesis.">
            <Field title="Investment Summary" help="Editorial paragraph — the thesis in one breath." value={firstOf(conf.mission, get(p, "conference.investmentCase[0].reason"))} big />
            <Pool title="Reasons to Invest" help="Every reason as its own card — not one paragraph." items={firstOf(conf.investmentCase, (conf.competitiveAdvantages || []).map((r) => ({ reason: r })))}
              renderItem={(r) => (
                <div className="rounded-xl bg-slate-50 px-4 py-3.5">
                  <div className="text-[15px] font-bold text-slate-900">{r.reason || r}</div>
                  {r.evidence && <div className="mt-1 text-[13px] leading-relaxed text-slate-500">{r.evidence}</div>}
                  {r.standsOutBecause && <div className="mt-0.5 text-[13px] italic text-slate-400">{r.standsOutBecause}</div>}
                </div>
              )}
            />
          </Slide>

          {/* PAGE 11 — FOLLOW */}
          <Slide n={11} kicker="Page 11" title="Follow" purpose="Final call-to-action.">
            <Field title="Follow PASSPORT" help="Closing editorial line inviting the reader to follow the company on PASSPORT." value={`Follow ${get(p, "company.name") || "this company"} on PASSPORT to get every update the moment it's disclosed.`} big />
            <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <h3 className="text-[15px] font-bold text-slate-900">QR Code</h3>
              <p className="mt-0.5 text-[12.5px] text-slate-400">Auto-generated on publish — links directly to this company's profile.</p>
              <div className="mt-4 flex h-44 flex-col items-center justify-center gap-2 rounded-2xl bg-slate-50 text-slate-300">
                <QrCode size={40} strokeWidth={1.4} />
                <p className="text-[12px] font-semibold">Generated at publish</p>
              </div>
            </div>
          </Slide>

          <div className="h-6" />
        </div>
      )}
    </div>
  );
}
