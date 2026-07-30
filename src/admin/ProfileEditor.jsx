import React, { useState, useCallback, useEffect, useRef } from "react";
import { X, Loader2, Check, Upload, Plus, Trash2, ChevronDown, Image as ImageIcon } from "lucide-react";
import { mapProfileToPP } from "../lib/profileToPP.js";
import { uploadCompanyMedia } from "../lib/storage.js";
import LogoEditor from "./LogoEditor.jsx";

// Downscale an image File and return a smaller File (for direct Storage upload).
function fileToScaledFile(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        const type = /png/i.test(file.type) ? "image/png" : "image/jpeg";
        c.toBlob((blob) => resolve(new File([blob], (file.name || "photo").replace(/\.[^.]+$/, "") + (type === "image/png" ? ".png" : ".jpg"), { type })), type, quality);
      };
      img.onerror = reject; img.src = r.result;
    };
    r.onerror = reject; r.readAsDataURL(file);
  });
}
const uploadPhoto = async (f) => uploadCompanyMedia(await fileToScaledFile(f));

// A project photo gallery: drag-and-drop or pick (up to 50), uploads straight to
// Storage, drag thumbnails to reorder, × to remove.
function GalleryUploader({ value, onChange }) {
  const list = Array.isArray(value) ? value : [];
  const [busy, setBusy] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const dragIdx = useRef(null);
  const MAX = 50;

  const addFiles = async (fileList) => {
    let files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    const room = MAX - list.length;
    if (room <= 0) return;
    files = files.slice(0, room);
    if (!files.length) return;
    setBusy((b) => b + files.length);
    const urls = [];
    for (const f of files) { try { urls.push(await uploadPhoto(f)); } catch (_) {} setBusy((b) => b - 1); }
    if (urls.length) onChange([...list, ...urls]);
  };
  const removeAt = (i) => onChange(list.filter((_, j) => j !== i));
  const reorder = (from, to) => { if (from == null || from === to) return; const a = [...list]; const [m] = a.splice(from, 1); a.splice(to, 0, m); onChange(a); };
  const zoneDrop = (e) => { e.preventDefault(); setDragOver(false); if (dragIdx.current == null) addFiles(e.dataTransfer.files); };

  return (
    <div>
      <div onDrop={zoneDrop} onDragOver={(e) => { e.preventDefault(); if (dragIdx.current == null) setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        className={`rounded-xl border-2 border-dashed p-2.5 transition ${dragOver ? "border-slate-500 bg-slate-50" : "border-slate-200"}`}>
        <div className="flex flex-wrap gap-2">
          {list.map((url, i) => (
            <div key={i} draggable onDragStart={() => { dragIdx.current = i; }} onDragEnd={() => { dragIdx.current = null; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files && e.dataTransfer.files.length && dragIdx.current == null) addFiles(e.dataTransfer.files); else reorder(dragIdx.current, i); dragIdx.current = null; }}
              className="relative cursor-move">
              <img src={url} alt="" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
              <button onClick={() => removeAt(i)} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-600 text-white"><X size={11} /></button>
            </div>
          ))}
          {list.length < MAX && (
            <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-slate-500">
              {busy > 0 ? <Loader2 size={16} className="animate-spin" /> : <Plus size={18} />}
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </div>
      <p className="mt-1 text-[10.5px] leading-snug text-slate-400">Drag photos here or click + to pick from a folder ({list.length}/{MAX}){busy > 0 ? ` · uploading ${busy}…` : ""}. Drag thumbnails to reorder.</p>
    </div>
  );
}

// ============================================================================
// PROFILE EDITOR — edit everything about a company after onboarding: identity +
// logo, status card, brief, capital, team (bios + photos), project images.
// Live app preview on the left, fields on the right. Images are downscaled and
// stored as data URIs so the profile stays small.
// ============================================================================

// Load an image file, downscale to maxDim, return a data URI (keeps the DB row small).
function fileToScaledDataUrl(file, maxDim = 640, quality = 0.85) {
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
      img.onerror = reject;
      img.src = r.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const setPath = (obj, path, value) => {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) { if (o[keys[i]] == null || typeof o[keys[i]] !== "object") o[keys[i]] = {}; o = o[keys[i]]; }
  o[keys[keys.length - 1]] = value;
};

// ---- module-level field components (defined once, so inputs keep focus) ----
function Txt({ draft, update, path, label, ph }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <input value={getPath(draft, path) ?? ""} onChange={(e) => update(path, e.target.value)} placeholder={ph}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-slate-400" />
    </label>
  );
}
function Area({ draft, update, path, label, ph, rows = 3 }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <textarea rows={rows} value={getPath(draft, path) ?? ""} onChange={(e) => update(path, e.target.value)} placeholder={ph}
        className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-slate-800 outline-none focus:border-slate-400" />
    </label>
  );
}
function Bool({ draft, update, path, label, hint }) {
  const on = !!getPath(draft, path);
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span><span className="block text-[12.5px] font-bold text-slate-700">{label}</span>{hint && <span className="block text-[11px] leading-snug text-slate-400">{hint}</span>}</span>
      <button type="button" onClick={() => update(path, !on)} aria-pressed={on}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}
function Sel({ draft, update, path, label, options }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <select value={getPath(draft, path) ?? ""} onChange={(e) => update(path, e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-slate-400">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
function Img({ draft, update, path, label, round, maxDim }) {
  const val = getPath(draft, path);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <div className="flex items-center gap-3">
        {val ? <img src={val} alt="" className="h-16 w-16 border border-slate-200 object-cover" style={{ borderRadius: round ? "9999px" : 12 }} />
             : <div className="grid h-16 w-16 place-items-center border border-dashed border-slate-300 text-slate-300" style={{ borderRadius: round ? "9999px" : 12 }}><ImageIcon size={20} /></div>}
        <div className="flex flex-col gap-1.5">
          <label className="inline-flex w-max cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-slate-700">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {val ? "Replace" : "Upload"}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              setBusy(true); try { update(path, await fileToScaledDataUrl(f, maxDim || 640)); } finally { setBusy(false); }
            }} />
          </label>
          {val && <button onClick={() => update(path, "")} className="text-left text-[11.5px] font-bold text-slate-400 hover:text-rose-600">Remove</button>}
        </div>
      </div>
    </div>
  );
}
// A header photo for a specific card/sheet, stored under cardMedia["<projectKey>:<cardId>"].
// Faded header the app shows at the top of that card's detail sheet (adds character).
function CardPhoto({ draft, update, mkey, label }) {
  const cm = draft.cardMedia || {};
  const val = (cm[mkey] && cm[mkey].src) || "";
  const [busy, setBusy] = useState(false);
  const setSrc = (src) => update("cardMedia", { ...(draft.cardMedia || {}), [mkey]: { ...(cm[mkey] || {}), src } });
  const remove = () => { const next = { ...(draft.cardMedia || {}) }; delete next[mkey]; update("cardMedia", next); };
  return (
    <div className="flex items-center gap-2">
      {val ? <img src={val} alt="" className="h-11 w-16 flex-shrink-0 rounded-md border border-slate-200 object-cover" />
           : <div className="grid h-11 w-16 flex-shrink-0 place-items-center rounded-md border border-dashed border-slate-300 text-slate-300"><ImageIcon size={15} /></div>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-bold text-slate-600">{label}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1 text-[11.5px] font-bold text-slate-500 hover:text-slate-900">
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}{val ? "Replace" : "Add photo"}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); try { setSrc(await fileToScaledDataUrl(f, 1000)); } finally { setBusy(false); e.target.value = ""; } }} />
          </label>
          {val && <button onClick={remove} className="text-[11.5px] font-bold text-slate-400 hover:text-rose-600">Remove</button>}
        </div>
      </div>
    </div>
  );
}
function Section({ id, title, open, setOpen, children, hidden }) {
  if (hidden) return null;
  return (
    <div className="border-b border-slate-200">
      <button onClick={() => setOpen(open === id ? "" : id)} className="flex w-full items-center justify-between px-5 py-3.5 text-left">
        <span className="text-[14px] font-extrabold tracking-tight text-slate-900">{title}</span>
        <ChevronDown size={17} className={`text-slate-400 transition ${open === id ? "rotate-180" : ""}`} />
      </button>
      {open === id && <div className="space-y-3 px-5 pb-5">{children}</div>}
    </div>
  );
}

export default function ProfileEditor({ profile, companyName, slug, previewToken, onClose, onSave }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(profile || {})));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [open, setOpen] = useState("identity");
  const [logoEditSrc, setLogoEditSrc] = useState(null);   // raw upload being processed for the status logo

  const update = useCallback((path, value) => {
    setDraft((d) => { const n = JSON.parse(JSON.stringify(d)); setPath(n, path, value); return n; });
    setSaved(false);
  }, []);

  // Push the live draft into the preview iframe (so it shows unsaved edits and never
  // falls back to the demo company). Send on every edit (debounced) and when the app
  // reports it's ready.
  const iframeRef = useRef(null);
  const postDraft = useCallback(() => {
    try {
      const pp = mapProfileToPP(draft);
      iframeRef.current?.contentWindow?.postMessage({ type: "pp-seed", pp }, "*");
    } catch (_) {}
  }, [draft]);
  useEffect(() => {
    const onReady = (e) => { if (e && e.data && e.data.type === "pp-ready") postDraft(); };
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, [postDraft]);
  useEffect(() => { const t = setTimeout(postDraft, 300); return () => clearTimeout(t); }, [draft, postDraft]);

  const save = async () => {
    setSaving(true); setErr("");
    try {
      await onSave(JSON.parse(JSON.stringify(draft)));
      setSaved(true);
      setPreviewVersion((v) => v + 1);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setErr(e && e.message ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };

  // Pull the dominant saturated colour out of the logo as a brand-colour suggestion.
  const autoColor = async () => {
    const logo = draft.brand?.logo;
    if (!logo) return;
    try {
      const img = new Image(); img.crossOrigin = "anonymous";
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = logo; });
      const c = document.createElement("canvas"); const w = c.width = 64, h = c.height = 64;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2], A = d[i + 3];
        if (A < 200) continue;
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        if (mx - mn < 40) continue;            // skip greys / white / black
        r += R; g += G; b += B; n++;
      }
      if (n) update("brand.color", "#" + [r / n, g / n, b / n].map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""));
    } catch (_) { /* tainted canvas or load failed — pick manually */ }
  };

  const src = `/app?c=${encodeURIComponent(slug)}${previewToken ? `&preview=${encodeURIComponent(previewToken)}` : ""}`;
  const P = { draft, update };
  // A basic "listing" tier company only renders hero/logo/status-card/brief on its 1-pager,
  // so the editor hides the full-profile sections (status card, capital, team, projects, CEO
  // note) — a fast, focused edit for polishing listings at scale ("10 companies/day").
  const isListing = (draft.tier || "") === "listing";
  const team = Array.isArray(draft.team) ? draft.team : [];
  const projects = Array.isArray(draft.projects) ? draft.projects : [];
  const keyPoints = Array.isArray(draft.companyBrief?.keyPoints) ? draft.companyBrief.keyPoints : [];
  const sections = Array.isArray(draft.companyBrief?.sections) ? draft.companyBrief.sections : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-5" onClick={onClose}>
      <div className="flex h-[92vh] w-full max-w-[1160px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-6 py-3.5">
          <p className="text-[16px] font-extrabold tracking-tight text-slate-900">Edit profile · <span className="text-slate-400">{companyName}</span></p>
          <div className="flex items-center gap-3">
            {err && <span className="text-[12px] font-bold text-rose-600">{err}</span>}
            <button onClick={save} disabled={saving}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-bold text-white ${saved ? "bg-emerald-600" : "bg-slate-900 hover:bg-slate-700"} ${saving ? "opacity-60" : ""}`}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}{saved ? "Saved" : "Save changes"}
            </button>
            <button onClick={onClose} className="text-slate-300 hover:text-slate-600"><X size={20} /></button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-[420px] flex-shrink-0 items-center justify-center bg-slate-100 p-5">
            <div className="h-[720px] max-h-full w-[360px] overflow-hidden rounded-[40px] border border-slate-200 bg-white shadow-xl">
              <iframe ref={iframeRef} key={previewVersion} title="preview" src={src} className="h-full w-full border-0" onLoad={postDraft} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {isListing && (
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-[12px] leading-relaxed text-slate-500">
                <span className="font-bold text-slate-700">Basic listing.</span> Editing the fields shown on the 1-pager. Use <span className="font-bold text-slate-700">Upgrade to full</span> (in the toolbar) to add projects, team, capital & the timeline.
              </div>
            )}
            <Section id="identity" title="Identity & logo" open={open} setOpen={setOpen}>
              <Img {...P} path="brand.logo" label="Profile logo (the circular icon)" round maxDim={512} />
              <Img {...P} path="companyStatus.photo" label="Status card photo (the big site/drone image)" maxDim={1000} />
              {/* Status card logo — upload any logo; the processor removes its background + sizes it. */}
              <div>
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Status card logo (fades in over the status photo)</span>
                <div className="flex items-center gap-3">
                  {draft.brand?.statusLogo
                    ? <div className="grid h-16 w-16 place-items-center rounded-xl border border-slate-200" style={{ background: "repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 50% / 10px 10px" }}><img src={draft.brand.statusLogo} alt="" className="max-h-full max-w-full" /></div>
                    : <div className="grid h-16 w-16 place-items-center rounded-xl border border-dashed border-slate-300 text-slate-300"><ImageIcon size={20} /></div>}
                  <div className="flex flex-col gap-1.5">
                    <label className="inline-flex w-max cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-slate-700">
                      <Upload size={13} /> {draft.brand?.statusLogo ? "Replace" : "Upload & remove background"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setLogoEditSrc(r.result); r.readAsDataURL(f); e.target.value = ""; }} />
                    </label>
                    {draft.brand?.statusLogo && <button onClick={() => update("brand.statusLogo", "")} className="text-left text-[11.5px] font-bold text-slate-400 hover:text-rose-600">Remove</button>}
                  </div>
                </div>
              </div>
              <Txt {...P} path="company.name" label="Company name" />
              <Txt {...P} path="company.ticker" label="Ticker" ph="TSXV: AGAG" />
              <Txt {...P} path="company.website" label="Website" />
              <Txt {...P} path="company.slogan" label="Slogan" ph="A Pure Silver Company" />
              {/* Basic-listing status-card fields (also shown on the full profile's identity). */}
              <div className="grid grid-cols-2 gap-2">
                <Txt {...P} path="company.commodity" label="Commodity" ph="Silver-Gold" />
                <Txt {...P} path="company.stage" label="Stage" ph="developer" />
                <Txt {...P} path="company.location" label="Location (region)" ph="Aysen Region" />
                <Txt {...P} path="company.jurisdiction" label="Jurisdiction (country)" ph="Chile" />
              </div>
              <div>
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Brand accent color</span>
                <div className="flex items-center gap-2.5">
                  <input type="color" value={draft.brand?.color || "#10b981"} onChange={(e) => update("brand.color", e.target.value)} className="h-9 w-11 cursor-pointer rounded border border-slate-200 bg-white p-0.5" />
                  <input type="text" value={draft.brand?.color || ""} onChange={(e) => update("brand.color", e.target.value)} placeholder="#10b981" className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-[12px] outline-none focus:border-slate-400" />
                  <button onClick={autoColor} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 hover:text-slate-900">Auto from logo</button>
                  {draft.brand?.color ? <button onClick={() => update("brand.color", "")} className="text-[11.5px] font-bold text-slate-400 hover:text-rose-600">Reset</button> : null}
                </div>
                <p className="mt-1 text-[10.5px] leading-snug text-slate-400">Themes the status card, progress bars and accents across the profile. Blank = default emerald.</p>
              </div>
            </Section>

            <Section id="ceo" title="CEO note" open={open} setOpen={setOpen} hidden={isListing}>
              <Area {...P} path="ceoNote.text" label="Note (shown near the top of the profile)" rows={3} ph="A short, human note from the CEO — why this company, what to watch. 1–3 sentences." />
              <div className="grid grid-cols-2 gap-2">
                <Txt {...P} path="ceoNote.name" label="CEO name" ph="Jane Smith" />
                <Txt {...P} path="ceoNote.title" label="Title" ph="CEO" />
              </div>
              <Img {...P} path="ceoNote.photo" label="CEO photo (optional)" round maxDim={400} />
            </Section>

            <Section id="contact" title="Contact links" open={open} setOpen={setOpen}>
              <div className="grid grid-cols-2 gap-2">
                <Txt {...P} path="contact.phone" label="Phone" ph="+1 604 555 0100" />
                <Txt {...P} path="contact.email" label="Email" ph="ir@company.com" />
                <Txt {...P} path="contact.twitter" label="Twitter / X" ph="@company" />
                <Txt {...P} path="contact.linkedin" label="LinkedIn" ph="company/name" />
              </div>
              <p className="text-[11px] leading-snug text-slate-400">Each shows as a tappable icon on the profile only when filled. Twitter/LinkedIn accept a handle or a full URL.</p>
            </Section>

            <Section id="conference" title="Conference booth (iPad)" open={open} setOpen={setOpen} hidden={isListing}>
              <Bool {...P} path="conference.enabled" label="Enable booth mode" hint="Powers the storyboard at /app?c=…&ipad=1 for this company." />
              <div className="grid grid-cols-2 gap-2">
                <Sel {...P} path="conference.style" label="Layout" options={[{ value: "scene", label: "Storyboard (default)" }, { value: "board", label: "Editorial scroll" }, { value: "fixa", label: "Hero + QR card" }]} />
                <Txt {...P} path="conference.boothQrUtm" label="QR campaign tag" ph="pdac_2026_booth" />
              </div>
              <Txt {...P} path="conference.heroVideo" label="Hero video URL (drone loop, optional)" ph="https://…/loop.mp4" />
              <p className="text-[11px] leading-snug text-slate-400">The headline stats, macro line and featured drill/economics figures come from the <b>Conference prompt</b> — copy it from the toolbar, run it in ChatGPT on this company's profile, and import the result.</p>
            </Section>

            <Section id="status" title="Status card" open={open} setOpen={setOpen} hidden={isListing}>
              <Txt {...P} path="companyStatus.statusHeadline" label="Headline" />
              <Area {...P} path="companyStatus.statusHeadlineSubtext" label="Subtext" rows={2} />
              <Area {...P} path="companyStatus.latestUpdate" label="Latest update" rows={2} />
              <Area {...P} path="companyStatus.investmentImpact" label="Investment impact" rows={2} />
              <Txt {...P} path="companyStatus.nextCatalyst" label="Next catalyst" />
              <Txt {...P} path="companyStatus.expected" label="Expected (ETA)" />
            </Section>

            <Section id="brief" title="60-second brief" open={open} setOpen={setOpen}>
              <Area {...P} path="companyBrief.shortSummary" label="What they do (shown on the profile & basic listing)" rows={3} ph="Plain-language 2–3 sentences: commodity, stage, and where the flagship project is." />
              <div>
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Value drivers</span>
                <div className="space-y-2">
                  {keyPoints.map((k, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={k} onChange={(e) => { const a = [...keyPoints]; a[i] = e.target.value; update("companyBrief.keyPoints", a); }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400" />
                      <button onClick={() => update("companyBrief.keyPoints", keyPoints.filter((_, j) => j !== i))} className="text-slate-300 hover:text-rose-600"><Trash2 size={15} /></button>
                    </div>
                  ))}
                  <button onClick={() => update("companyBrief.keyPoints", [...keyPoints, ""])} className="inline-flex items-center gap-1 text-[12px] font-bold text-slate-500 hover:text-slate-800"><Plus size={13} /> Add driver</button>
                </div>
              </div>
              <div>
                <span className="mb-1 mt-2 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Brief sections</span>
                <div className="space-y-2">
                  {sections.map((s, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 p-2.5">
                      <input value={s.k || ""} onChange={(e) => { const a = [...sections]; a[i] = { ...a[i], k: e.target.value }; update("companyBrief.sections", a); }}
                        className="mb-1.5 w-full text-[12px] font-bold text-slate-700 outline-none" placeholder="Heading" />
                      <textarea rows={2} value={s.v || ""} onChange={(e) => { const a = [...sections]; a[i] = { ...a[i], v: e.target.value }; update("companyBrief.sections", a); }}
                        className="w-full resize-y text-[12.5px] text-slate-600 outline-none" placeholder="Body" />
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            <Section id="capital" title="Capital" open={open} setOpen={setOpen} hidden={isListing}>
              {[["outstanding", "Shares outstanding"], ["fd", "Fully diluted"], ["options", "Options"], ["warrants", "Warrants"], ["cash", "Cash"], ["debt", "Debt"], ["workingCapital", "Working capital"], ["marketCap", "Market cap"], ["reportingDate", "Reporting date"], ["financing", "Latest financing (amount)"], ["financingDate", "Financing date"], ["financingType", "Financing type"], ["state", "State (e.g. Fully Funded)"]].map(([k, l]) => (
                <Txt key={k} {...P} path={`capital.${k}`} label={l} />
              ))}
              <Area {...P} path="capital.ownership" label="Ownership breakdown" rows={2} />
            </Section>

            <Section id="team" title={`Team (${team.length})`} open={open} setOpen={setOpen} hidden={isListing}>
              {team.map((m, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-3">
                  <p className="mb-2 text-[13px] font-extrabold text-slate-900">{m.name || `Member ${i + 1}`}</p>
                  <div className="space-y-2">
                    <Img {...P} path={`team.${i}.photo`} label="Photo" round maxDim={400} />
                    <input value={m.name || ""} onChange={(e) => { const a = [...team]; a[i] = { ...a[i], name: e.target.value }; update("team", a); }} placeholder="Name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400" />
                    <input value={m.role || ""} onChange={(e) => { const a = [...team]; a[i] = { ...a[i], role: e.target.value }; update("team", a); }} placeholder="Role" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400" />
                    <textarea rows={2} value={m.short || ""} onChange={(e) => { const a = [...team]; a[i] = { ...a[i], short: e.target.value }; update("team", a); }} placeholder="Short bio (one line)" className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] outline-none focus:border-slate-400" />
                    <textarea rows={4} value={m.full || ""} onChange={(e) => { const a = [...team]; a[i] = { ...a[i], full: e.target.value }; update("team", a); }} placeholder="Full bio" className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] outline-none focus:border-slate-400" />
                  </div>
                </div>
              ))}
            </Section>

            <Section id="projects" title={`Projects (${projects.length})`} open={open} setOpen={setOpen} hidden={isListing}>
              {projects.map((p, i) => {
                const gallery = Array.isArray(p.gallery) ? p.gallery : [];
                // Must match mapProfileToPP's project key so CARD_MEDIA lookups line up.
                const pk = String(p.key || p.id || `project-${i + 1}`);
                return (
                  <div key={i} className="rounded-xl border border-slate-200 p-3">
                    <input value={p.name || ""} onChange={(e) => { const a = [...projects]; a[i] = { ...a[i], name: e.target.value }; update("projects", a); }} placeholder="Project name" className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-bold outline-none focus:border-slate-400" />
                    <input value={p.tag || ""} onChange={(e) => { const a = [...projects]; a[i] = { ...a[i], tag: e.target.value }; update("projects", a); }} placeholder="Tag (e.g. Active · Drilling)" className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] outline-none focus:border-slate-400" />
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Project photos</span>
                    <GalleryUploader value={gallery} onChange={(g) => { const a = [...projects]; a[i] = { ...a[i], gallery: g }; update("projects", a); }} />
                    <span className="mb-1.5 mt-3 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Card header photos <span className="font-medium normal-case tracking-normal text-slate-400">— a faded photo at the top of each card's detail sheet</span></span>
                    <div className="space-y-2">
                      <CardPhoto {...P} mkey={`${pk}:brief`} label="Project brief" />
                      <CardPhoto {...P} mkey={`${pk}:location`} label="Location & jurisdiction" />
                      <CardPhoto {...P} mkey={`${pk}:stage`} label="Project stage" />
                      <CardPhoto {...P} mkey={`${pk}:district`} label="District context" />
                    </div>
                  </div>
                );
              })}
            </Section>

            <div className="px-5 py-4 text-[11.5px] leading-relaxed text-slate-400">
              Timeline entries and full press-release text are edited in the <span className="font-bold text-slate-500">Releases</span> panel. Changes here apply on <span className="font-bold text-slate-500">Save</span>.
            </div>
          </div>
        </div>
      </div>

      {logoEditSrc && (
        <LogoEditor
          src={logoEditSrc}
          onCancel={() => setLogoEditSrc(null)}
          onApply={(url) => { if (url) update("brand.statusLogo", url); setLogoEditSrc(null); }}
        />
      )}
    </div>
  );
}
