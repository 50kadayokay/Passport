// Company Profile editor — pp-DIRECT, tabbed.
//
// Reads and writes the app's real data structure (`pp`) directly and previews with the ACTUAL
// app component, so the preview matches the live app 1:1. The editor is split into tabs that
// mirror the profile's pages (Overview / Projects / Timeline / Capital / Team): the right panel
// shows ONLY the fields for the page currently in the phone, and switching either side switches
// the other. Tapping any widget in the phone jumps the editor to that exact field.
import React, { useState, useEffect, useRef, useMemo } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { SUPABASE_URL } from "../lib/supabase.js";
import { authHeaders } from "../lib/auth.js";
import { uploadCompanyMedia } from "../lib/storage.js";
import { buildCompanyIdentity } from "../aiBrief/proHighlights.js";
import { buildCanonicalProfile } from "../lib/ppToProfile.js";

// Renders the REAL app profile from a `pp` object. Cards portal into `popupEl` (a panel to the
// RIGHT of the phone). Tab is CONTROLLED by the parent so the editor and the phone stay in sync.
function AppPreview({ pp, popupEl, tab, onTab, tier }) {
  const [mod, setMod] = useState(null);
  const [ver, setVer] = useState(0);
  useEffect(() => {
    let ok = true;
    import("../aiBrief/PassportProto.jsx")
      .then((m) => { if (ok) { if (m.setPpPreviewLive) m.setPpPreviewLive(true); setMod({ Profile: m.CompanyProfile, applyPP: m.applyPP, setPpFrame: m.setPpFrame }); } })
      .catch(() => {});
    return () => { ok = false; };
  }, []);
  // Inject the tier so the preview gates its tabs exactly like the live app (Basic = 2 tabs),
  // without writing ACCOUNT_TIER into the saved pp.
  useEffect(() => { if (!mod || !pp) return; mod.applyPP({ ...pp, ACCOUNT_TIER: tier || "" }); setVer((v) => v + 1); }, [mod, pp, tier]);
  useEffect(() => {
    if (!mod || !mod.setPpFrame) return;
    mod.setPpFrame(popupEl || null);
    return () => mod.setPpFrame(null);
  }, [mod, popupEl]);
  if (!mod) return <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>Loading preview…</div>;
  const P = mod.Profile;
  // Remount on each change so EVERY widget reflects the edit; the preview-live flag skips the
  // intro, and this scoped CSS disables the app's mount animations (pp-view/pp-fade/…) so the
  // remount is seamless — no washed-out re-animation, no reload feel, text updates live.
  return (
    <div className="pp-editor-preview" style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <style>{`.pp-editor-preview .pp-view,.pp-editor-preview .pp-fade,.pp-editor-preview .pp-slide-up,.pp-editor-preview .pp-pop,.pp-editor-preview .pp-wordfade,.pp-editor-preview .pp-glow,.pp-editor-preview .pp-breathe{animation:none!important;opacity:1!important}`}</style>
      <P key={ver} tab={tab} onTabChange={(t) => onTab && onTab(t)} onBack={() => {}} onScan={() => {}} />
    </div>
  );
}

/* ---- shared field primitives (module-level → stable identity → inputs keep focus) ---- */
const LABEL = { fontSize: 10.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 6, display: "block" };
const INPUT = { width: "100%", borderRadius: 11, border: "1px solid #e2e8f0", padding: "9px 12px", fontSize: 13.5, color: "#0f172a", outline: "none", background: "#fff", boxSizing: "border-box" };
const AREA = { ...INPUT, minHeight: 66, resize: "vertical", lineHeight: 1.45, fontFamily: "inherit" };
const ADD_BTN = { fontSize: 12, fontWeight: 700, color: "#334155", background: "#f1f4f8", border: "none", borderRadius: 8, padding: "5px 11px", cursor: "pointer" };
const DEL_BTN = { width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", color: "#a3adba", cursor: "pointer", fontWeight: 600, flexShrink: 0, lineHeight: 1 };
const CARD = { border: "1px solid #eef2f6", borderRadius: 12, padding: 12, marginBottom: 10, scrollMarginTop: 8 };
// Up/down reorder control — small, quiet, sits beside the delete button.
const ORDER_BTN = { width: 24, height: 20, borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 11, lineHeight: 1, padding: 0, fontWeight: 700 };
// Major content-group heading inside the editor — stronger than a field LABEL so structure reads at a glance.
const SECTION_TITLE = { fontSize: 13, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#0f172a", display: "block", marginBottom: 12 };

function F({ label, value, onChange, field, ph }) {
  return <div style={{ flex: 1, minWidth: 0 }}><span style={LABEL}>{label}</span>
    <input data-field={field} style={INPUT} value={value || ""} placeholder={ph} onChange={(e) => onChange(e.target.value)} /></div>;
}
// Common junior-mining lifecycle stages for the Stage dropdown.
const STAGE_OPTIONS = ["Explorer", "Grassroots Exploration", "Discovery", "Advanced Exploration", "Resource Definition", "PEA", "Pre-Feasibility", "Feasibility", "Permitting", "Development", "Construction", "Producer"];
// The 6-step project lifecycle track the investor Pro profile renders (PassportProto STAGE_NAMES).
// Universal — the project's stageIdx (0–5) positions it on this track.
const STAGE_NAMES = ["Explore", "Discovery", "Resource", "Studies", "Development", "Production"];
function Sel({ label, value, onChange, field, options, ph }) {
  return <div style={{ flex: 1, minWidth: 0 }}><span style={LABEL}>{label}</span>
    <select data-field={field} value={value || ""} onChange={(e) => onChange(e.target.value)}
      style={{ ...INPUT, appearance: "auto", cursor: "pointer", color: value ? "#0f172a" : "#94a3b8" }}>
      <option value="">{ph || "Select…"}</option>
      {options.map((o) => { const v = typeof o === "string" ? o : o.value; const l = typeof o === "string" ? o : o.label; return <option key={v} value={v}>{l}</option>; })}
    </select></div>;
}
// Auto-growing textarea — expands to fit its content so long text stays readable.
function Grow({ value, onChange, field, ph, min }) {
  const ref = useRef(null);
  const fit = (el) => { if (!el) return; el.style.height = "auto"; el.style.height = Math.max(min || 68, el.scrollHeight + 2) + "px"; };
  useEffect(() => { fit(ref.current); }, [value]);
  return <textarea ref={ref} data-field={field} value={value || ""} placeholder={ph}
    onChange={(e) => onChange(e.target.value)} onInput={(e) => fit(e.target)}
    style={{ ...AREA, minHeight: min || 68, overflow: "hidden" }} />;
}
function TA({ label, value, onChange, field, ph, min }) {
  return <div><span style={LABEL}>{label}</span><Grow value={value} onChange={onChange} field={field} ph={ph} min={min} /></div>;
}
function SecHead({ title, onAdd }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
    <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#0f172a" }}>{title}</span>
    {onAdd && <button onClick={onAdd} style={ADD_BTN}>+ Add</button>}</div>;
}
// Collapsible subsection for the Projects editor — a clean accordion row with a filled/empty dot
// (progress), a title, an optional hint, and a chevron. Keeps the editor from being one giant wall
// of inputs: one section open at a time, obvious what's filled at a glance.
function EditorSection({ title, hint, filled, open, onToggle, children }) {
  return (
    <div style={{ border: "1px solid #e8edf3", borderRadius: 12, marginBottom: 10, background: "#fff", overflow: "hidden" }}>
      <button type="button" onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "13px 15px", background: open ? "#f8fafc" : "#fff", border: "none", borderBottom: open ? "1px solid #eef2f6" : "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span title={filled ? "Has content" : "Empty"} style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: filled ? "#2563eb" : "#cbd5e1" }} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a" }}>{title}</span>
        </span>
        <span style={{ fontSize: 11, color: "#94a3b8", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</span>
      </button>
      {open && <div style={{ padding: "14px 15px 16px" }}>{hint && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: -2, marginBottom: 14 }}>{hint}</div>}{children}</div>}
    </div>
  );
}
// A lighter sub-heading for groups nested inside a major SecHead (e.g. individual snapshot cards).
const SUB_TITLE = { fontSize: 12, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "#475569", display: "block", marginBottom: 10 };
// Repeatable [label, value] rows — the exact shape the snapshot detail sheet renders (detail:[[k,v]]).
function DetailRows({ rows, onChange }) {
  const list = Array.isArray(rows) ? rows : [];
  const set = (i, j, v) => { const a = list.map((r) => (Array.isArray(r) ? [...r] : ["", ""])); a[i][j] = v; onChange(a); };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ ...LABEL, marginBottom: 0 }}>Detail rows</span>
        <button onClick={() => onChange([...list, ["", ""]])} style={ADD_BTN}>+ Add</button>
      </div>
      {list.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <input style={{ ...INPUT, width: 148, flexShrink: 0 }} value={(r && r[0]) || ""} placeholder="Label" onChange={(e) => set(i, 0, e.target.value)} />
          <input style={INPUT} value={(r && r[1]) || ""} placeholder="Value" onChange={(e) => set(i, 1, e.target.value)} />
          <button onClick={() => { const a = [...list]; a.splice(i, 1); onChange(a); }} title="Remove" style={DEL_BTN}>✕</button>
        </div>
      ))}
    </div>
  );
}
// The canonical Project Snapshot cards the investor profile can open. Universal set; a card only
// renders on the profile when it has a headline value, so companies fill only what applies.
const SNAP_CARDS = [
  { label: "Location & Jurisdiction", title: "Location & jurisdiction", icon: "MapPin", valuePh: "e.g. Parral district, Chihuahua", hint: "Detail rows e.g. District, State / province, Country, Coordinates, Elevation, Jurisdiction." },
  { label: "Primary Commodity", title: "Primary commodity", icon: "Gem", valuePh: "e.g. Silver-gold", hint: "Detail rows e.g. Primary, Co-product, Credits, Historic metals." },
  { label: "Deposit Type", title: "Deposit type", icon: "Mountain", valuePh: "e.g. Epithermal Ag-Au vein", hint: "Detail rows e.g. Model, Host rocks, Style, Controls, At depth." },
  { label: "Land Package", title: "Land package", icon: "Layers", valuePh: "e.g. 845 ha", hint: "Detail rows e.g. Area, Claims, Tenure." },
  { label: "Ownership", title: "Ownership", icon: "ShieldCheck", valuePh: "e.g. 100% owned", hint: "Detail rows e.g. Interest, Agreements, Royalties." },
  { label: "Past Producer", title: "Past production", icon: "Pickaxe", valuePh: "e.g. Historic mine", hint: "Detail rows e.g. Historic grade, Operator, Period." },
];
function SnapCardEditor({ cfg, item, onPatch }) {
  const it = item || {};
  return (
    <div style={{ ...CARD, background: "#fafcff" }}>
      <span style={SUB_TITLE}>{cfg.title}</span>
      <div style={{ display: "flex", gap: 8 }}>
        <F label="Headline" value={it.value} onChange={(v) => onPatch({ value: v })} ph={cfg.valuePh} />
        <F label="Secondary (optional)" value={it.value2} onChange={(v) => onPatch({ value2: v })} ph="Optional" />
      </div>
      <div style={{ marginTop: 10 }}><DetailRows rows={it.detail} onChange={(d) => onPatch({ detail: d })} /></div>
      <div style={{ fontSize: 10.5, color: "#94a3b8", margin: "-2px 0 10px" }}>{cfg.hint}</div>
      <TA label="Context" value={it.note} onChange={(v) => onPatch({ note: v })} />
    </div>
  );
}
// The four Technical Intelligence cards, mapped to the live GEO_ORDER kinds. Each writes the
// exact shape the card detail sheet reads (body + points/timeline/rows by kind).
const TECH_CARDS = [
  { kind: "map", label: "District Context", type: "points", hint: "Key characteristics as label / value rows (Claims, Structures, Regional context…)." },
  { kind: "history", label: "Exploration Strategy", type: "timeline", hint: "History & programs — one row per period or phase." },
  { kind: "geology", label: "Geological Model", type: "points", hint: "Key characteristics (Structures, Mineralization, Deposit model…)." },
  { kind: "drills", label: "Exploration Results", type: "rows", hint: "Best drill intercepts. Tick pre-drill for projects with no results yet." },
];
function TechCardEditor({ cfg, card, onPatch }) {
  const c = card || {};
  const pts = Array.isArray(c.points) ? c.points : [];
  const tl = Array.isArray(c.timeline) ? c.timeline : [];
  const rows = Array.isArray(c.rows) ? c.rows : [];
  const upd = (arr, i, patch) => { const a = arr.map((x) => ({ ...x })); a[i] = { ...a[i], ...patch }; return a; };
  const del = (arr, i) => { const a = [...arr]; a.splice(i, 1); return a; };
  const head = (label, onAdd) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0 6px" }}>
      <span style={{ ...LABEL, marginBottom: 0 }}>{label}</span>
      <button onClick={onAdd} style={ADD_BTN}>+ Add</button>
    </div>
  );
  return (
    <div style={{ ...CARD, background: "#fafcff" }}>
      <span style={SUB_TITLE}>{cfg.label}</span>
      <TA label="Summary" value={c.body} onChange={(v) => onPatch({ body: v })} />
      <div style={{ fontSize: 10.5, color: "#94a3b8", margin: "6px 0 0" }}>{cfg.hint}</div>
      {cfg.type === "points" && (
        <div>{head("Key characteristics", () => onPatch({ points: [...pts, { k: "", v: "" }] }))}
          {pts.map((pt, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <input style={{ ...INPUT, width: 148, flexShrink: 0 }} value={pt.k || ""} placeholder="Label" onChange={(e) => onPatch({ points: upd(pts, i, { k: e.target.value }) })} />
              <input style={INPUT} value={pt.v || ""} placeholder="Value" onChange={(e) => onPatch({ points: upd(pts, i, { v: e.target.value }) })} />
              <button onClick={() => onPatch({ points: del(pts, i) })} title="Remove" style={DEL_BTN}>✕</button>
            </div>
          ))}
        </div>
      )}
      {cfg.type === "timeline" && (
        <div>{head("History & programs", () => onPatch({ timeline: [...tl, { era: "", v: "" }] }))}
          {tl.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
              <input style={{ ...INPUT, width: 130, flexShrink: 0 }} value={t.era || ""} placeholder="Period / phase" onChange={(e) => onPatch({ timeline: upd(tl, i, { era: e.target.value }) })} />
              <input style={INPUT} value={t.v || ""} placeholder="What happened" onChange={(e) => onPatch({ timeline: upd(tl, i, { v: e.target.value }) })} />
              <button onClick={() => onPatch({ timeline: del(tl, i) })} title="Remove" style={DEL_BTN}>✕</button>
            </div>
          ))}
        </div>
      )}
      {cfg.type === "rows" && (
        <div>{head("Drill intercepts", () => onPatch({ rows: [...rows, { hole: "", grade: "", interval: "", note: "" }] }))}
          {rows.map((r, i) => (
            <div key={i} style={{ ...CARD, background: "#fff", marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input style={{ ...INPUT, flex: 1, fontWeight: 700 }} value={r.hole || ""} placeholder="Hole / result title" onChange={(e) => onPatch({ rows: upd(rows, i, { hole: e.target.value }) })} />
                <input style={{ ...INPUT, width: 160, flexShrink: 0 }} value={r.grade || ""} placeholder="Headline metric" onChange={(e) => onPatch({ rows: upd(rows, i, { grade: e.target.value }) })} />
                <button onClick={() => onPatch({ rows: del(rows, i) })} title="Remove" style={DEL_BTN}>✕</button>
              </div>
              <input style={{ ...INPUT, marginBottom: 8 }} value={r.interval || ""} placeholder="Interval / width (e.g. 0.70 m)" onChange={(e) => onPatch({ rows: upd(rows, i, { interval: e.target.value }) })} />
              <Grow value={r.note} ph="Context / description" onChange={(v) => onPatch({ rows: upd(rows, i, { note: v }) })} />
            </div>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#475569", marginTop: 6 }}>
            <input type="checkbox" checked={!!c.empty} onChange={(e) => onPatch({ empty: e.target.checked })} /> Pre-drill (no results yet)
          </label>
          {c.empty && <div style={{ marginTop: 8 }}><F label="Pre-drill message" value={c.emptyMsg} onChange={(v) => onPatch({ emptyMsg: v })} ph="No modern drill results disclosed yet." /></div>}
        </div>
      )}
    </div>
  );
}
function ImageField({ url, onFile, round, busy, label }) {
  const ref = useRef(null);
  const pick = () => ref.current && ref.current.click();
  const noun = label || "image";
  return (
    <div>
      <div onClick={pick}
        style={{ position: "relative", cursor: "pointer", width: round ? 96 : "100%", height: round ? 96 : 208,
          borderRadius: round ? 999 : 16, border: url ? "1px solid #e5e9f0" : "1.5px dashed #cbd5e1", backgroundColor: "#f8fafc",
          backgroundImage: url ? `url("${url}")` : "none", backgroundSize: "cover", backgroundPosition: "center",
          display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 12, fontWeight: 600, overflow: "hidden" }}>
        {busy ? "Uploading…" : (!url && <span style={{ opacity: .9 }}>+ Add {noun}</span>)}
      </div>
      <button type="button" onClick={pick} disabled={busy}
        style={{ marginTop: 8, width: "100%", padding: "7px 10px", borderRadius: 9, border: "1px solid #e2e8f0",
          background: "#fff", color: "#475569", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        {busy ? "Uploading…" : url ? `Change ${noun}` : `Upload ${noun}`}
      </button>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onFile(f); e.target.value = ""; }} />
    </div>
  );
}

const CameraIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
  </svg>
);

// Mirrors how the two images actually sit on the profile card: the LOGO is the small circular
// avatar in the header (beside the company name); the STATUS IMAGE is the separate large photo
// card below it. Two distinct blocks, in that order, each with a clear change control.
function ProfileImages({ heroUrl, logoUrl, onHero, onLogo, busyHero, busyLogo, companyName }) {
  const heroRef = useRef(null), logoRef = useRef(null);
  const clickHero = () => heroRef.current && heroRef.current.click();
  const clickLogo = () => logoRef.current && logoRef.current.click();
  const miniLabel = { fontSize: 10, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#94a3b8" };
  const changeBtn = { marginTop: 7, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer" };
  const pill = { position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 9, background: "rgba(255,255,255,0.94)", border: "1px solid rgba(15,23,42,0.08)", boxShadow: "0 1px 4px rgba(15,23,42,.18)", color: "#334155", fontSize: 12, fontWeight: 700, cursor: "pointer" };
  return (
    <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
      {/* Profile picture (logo) — LEFT */}
      <div style={{ flexShrink: 0, width: 152 }}>
        <span style={miniLabel}>Profile picture</span>
        <div onClick={clickLogo}
          style={{ margin: "8px 0 0", width: 144, height: 144, borderRadius: 999, cursor: "pointer", overflow: "hidden",
            border: logoUrl ? "1px solid #e5e9f0" : "1.5px dashed #cbd5e1", backgroundColor: "#eef2f7",
            backgroundImage: logoUrl ? `url("${logoUrl}")` : "none", backgroundSize: "cover", backgroundPosition: "center",
            display: "grid", placeItems: "center", boxShadow: "0 1px 3px rgba(15,23,42,.08)" }}>
          {!logoUrl && !busyLogo && <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700 }}>Logo</span>}
          {busyLogo && <span style={{ color: "#64748b", fontSize: 10, fontWeight: 700 }}>…</span>}
        </div>
        <button type="button" onClick={clickLogo} style={changeBtn}><CameraIcon />{logoUrl ? "Change" : "Upload"}</button>
      </div>

      {/* Card image (status image) — RIGHT, at the aspect the card actually renders it */}
      <div style={{ width: 345, flexShrink: 0 }}>
        <span style={miniLabel}>Card image</span>
        <div style={{ position: "relative", marginTop: 8, width: "100%", maxWidth: 345, borderRadius: 16, overflow: "hidden",
            border: heroUrl ? "1px solid #e5e9f0" : "1.5px dashed #cbd5e1", backgroundColor: "#eef2f7" }}>
          {heroUrl ? (
            <img src={heroUrl} alt="" onClick={clickHero} style={{ display: "block", width: "100%", height: "auto", cursor: "pointer" }} />
          ) : (
            <div onClick={clickHero} style={{ aspectRatio: "4 / 5", display: "grid", placeItems: "center", cursor: "pointer", color: "#94a3b8", fontSize: 12.5, fontWeight: 600 }}>
              {busyHero ? "Uploading…" : "+ Add image"}
            </div>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); clickHero(); }} style={pill}>
            <CameraIcon /> {heroUrl ? "Change" : "Upload"}
          </button>
        </div>
      </div>

      <input ref={heroRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onHero(f); e.target.value = ""; }} />
      <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onLogo(f); e.target.value = ""; }} />
    </div>
  );
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "projects", label: "Projects" },
  { key: "timeline", label: "Timeline" },
  { key: "capital", label: "Capital" },
  { key: "team", label: "Team" },
];
// profile page key (from the phone) → editor tab
const PROFILE_TO_EDITOR = { overview: "overview", projects: "projects", timeline: "timeline", updates: "timeline", capital: "capital", team: "team" };

// Which sub-step (0-based) of the Overview tab a given field lives in, so a tap in the phone
// jumps to the right step. Overview steps: 0 Images · 1 Company details · 2 Brief & thesis.
const OVERVIEW_FIELD_STEP = { name: 1, ticker: 1, website: 1, tagline: 1, commodity: 1, stage: 1, jurisdiction: 1, headquarters: 1, flagship: 1, focus: 1, projectscount: 1, thesis: 2, valuedrivers: 2, brief: 2 };

export default function ProfileEditor({ company, injectedProfile, navTab, navStep, onNav }) {
  const slug = company && company.slug;
  // When the parent (Portal) drives navigation from its sidebar, this editor is CONTROLLED:
  // it reads navTab/navStep and reports moves through onNav. Standalone (demos) it self-manages.
  const controlledNav = typeof onNav === "function";
  const [profile, setProfile] = useState(null);
  const [pp, setPp] = useState(null);
  const [debPp, setDebPp] = useState(null);
  const [save, setSave] = useState("idle");
  const [busyImg, setBusyImg] = useState("");
  const [activeProj, setActiveProj] = useState(null);   // Projects editor: the one project being edited
  const [openSec, setOpenSec] = useState("images");     // Projects editor: which accordion subsection is expanded
  const [tier, setTier] = useState("");            // account plan tier (free/basic/pro) → gates which tabs show
  const [tabState, setTabState] = useState("overview");   // used only when uncontrolled
  const [stepState, setStepState] = useState(0);
  const activeTab = controlledNav ? (navTab || "overview") : tabState;
  const activeStep = controlledNav ? (navStep || 0) : stepState;
  // One setter for both — every nav move sets tab+step together, so a single entry point keeps
  // controlled/uncontrolled behaviour identical and click-to-edit routing intact.
  const setNav = (tab, stp) => { if (controlledNav) onNav(tab, stp); else { setTabState(tab); setStepState(stp); } };
  const [showPreview, setShowPreview] = useState(true);   // right-hand live phone preview visibility
  const [popupEl, setPopupEl] = useState(null);
  const [popupActive, setPopupActive] = useState(false);
  const scrollWrapRef = useRef(null);
  const pendingRef = useRef(null);

  // The side panel is empty until a card portals in; expand it only when needed.
  useEffect(() => {
    if (!popupEl) return;
    const sync = () => setPopupActive(popupEl.childElementCount > 0);
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(popupEl, { childList: true });
    return () => obs.disconnect();
  }, [popupEl]);

  // ---- click-to-edit: focus the field / row that a tapped widget maps to (after its tab shows)
  const highlightEl = (el, block) => {
    if (!el) return;
    try { el.scrollIntoView({ behavior: "smooth", block: block || "center" }); } catch (_) {}
    const prev = el.style.boxShadow;
    el.style.transition = "box-shadow .3s ease";
    el.style.boxShadow = "0 0 0 2px #2563eb";
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") { try { el.focus({ preventScroll: true }); } catch (_) {} }
    setTimeout(() => { el.style.boxShadow = prev; }, 1300);
  };
  const runPending = () => {
    const p = pendingRef.current; if (!p) return; pendingRef.current = null;
    const wrap = scrollWrapRef.current;
    const el = wrap ? (p.field ? wrap.querySelector(`[data-field="${p.field}"]`) : p.selector ? wrap.querySelector(p.selector) : null) : null;
    if (el) highlightEl(el, p.field ? "center" : "start");
    else if (wrap && wrap.firstElementChild) { try { wrap.scrollTo({ top: 0, behavior: "smooth" }); } catch (_) {} }
  };
  useEffect(() => { const t = setTimeout(runPending, 180); return () => clearTimeout(t); }, [activeTab, activeStep]);
  const jump = (tab, field, selector) => {
    pendingRef.current = { field, selector };
    const stp = (tab === "overview" && field) ? (OVERVIEW_FIELD_STEP[field] ?? 0) : 0;
    if (tab === activeTab && stp === activeStep) setTimeout(runPending, 0);
    else setNav(tab, stp);
  };

  const resolvePreviewTarget = (startEl) => {
    let el = startEl, hops = 0; const labels = [];
    while (el && hops < 10) {
      const own = (el.childElementCount === 0 ? (el.textContent || "") : "").trim();
      if (own && own.length <= 26) labels.push(own.toUpperCase());
      const al = el.getAttribute && el.getAttribute("aria-label"); if (al) labels.push(al.toUpperCase());
      el = el.parentElement; hops++;
    }
    // The SMALL neighborhood around the click (a single widget/cell). Status widgets render the
    // label ("Commodity") as a SIBLING of the value, so we read the nearest cell whose text is
    // short — big enough to include the label, small enough to exclude the rest of the card.
    const cellUp = (() => { let e = startEl, h = 0, best = (labels[0] || ""); while (e && h < 6) { const tx = (e.textContent || "").trim(); if (tx && tx.length <= 46) best = tx; else break; e = e.parentElement; h++; } return best.toUpperCase(); })();
    // A larger region for matching project / member / release cards by name.
    const regionText = (() => { let e = startEl, h = 0, best = ""; while (e && h < 6) { const tx = (e.textContent || "").trim(); if (tx && tx.length < 400) best = tx; e = e.parentElement; h++; } return best.toLowerCase(); })();
    const near = (s) => labels.some((L) => L.includes(s)) || cellUp.includes(s);
    // Click inside a popped-out card → identify the card from the whole panel's text (its
    // title lives in the header, away from where the user tapped) and route to that section.
    if (popupEl && popupEl.contains(startEl)) {
      const H = (popupEl.textContent || "").toUpperCase();
      if (H.includes("AI BRIEF") || H.includes("COMPANY ORIENTATION")) return { tab: "overview", field: "brief" };
      if (H.includes("VALUE DRIVER")) return { tab: "overview", field: "valuedrivers" };
      if (H.includes("OWNERSHIP") || H.includes("SHARE STRUCTURE") || H.includes("BALANCE SHEET") || H.includes("FINANCING") || H.includes("FULLY FUNDED") || H.includes("CAPITAL")) return { tab: "capital" };
    }
    if (/(^|[^A-Z])(TSX|OTCQB|OTC|FSE|NYSE|CSE|ASX)([^A-Z]|$)/.test(cellUp)) return { tab: "overview", field: "ticker" };
    if (near("COMMODITY")) return { tab: "overview", field: "commodity" };
    if (near("JURISDICTION")) return { tab: "overview", field: "jurisdiction" };
    if (near("HEADQUART")) return { tab: "overview", field: "headquarters" };
    if (near("STAGE")) return { tab: "overview", field: "stage" };
    if (near("WEBSITE") || near(".COM")) return { tab: "overview", field: "website" };
    if (near("COMPANY ORIENTATION") || near("AI BRIEF")) return { tab: "overview", field: "brief" };
    if (near("VALUE DRIVER") || near("CORE VALUE")) return { tab: "overview", field: "valuedrivers" };
    if (near("CURRENT FOCUS") || near("FOCUS")) return { tab: "overview", field: "focus" };
    if (near("FLAGSHIP")) return { tab: "overview", field: "flagship" };
    // An exact project-name match wins over the generic "PROJECTS" rule below — the pills
    // live under an "ASSETS / Projects" heading, so that rule used to swallow them.
    {
      const keys = Object.keys(pp.PROJECTS_DATA || {});
      for (const L of labels) {
        for (const k of keys) {
          const nm = (pp.PROJECTS_DATA[k] || {}).name;
          if (nm && L.trim() === String(nm).trim().toUpperCase()) {
            return { tab: "projects", projectKey: k, selector: `[data-proj="${k}"]` };
          }
        }
      }
    }
    if (near("PROJECTS")) return { tab: "overview", field: "projectscount" };
    const t = activeTab;
    if (t === "projects") {
      const keys = Object.keys(pp.PROJECTS_DATA || {});
      // Innermost label first → the most specific project name the user actually clicked.
      for (const L of labels) for (const k of keys) { const nm = (pp.PROJECTS_DATA[k] || {}).name; if (nm && L.includes(String(nm).toUpperCase())) return { tab: "projects", selector: `[data-proj="${k}"]` }; }
      for (const k of keys) { const nm = (pp.PROJECTS_DATA[k] || {}).name; if (nm && regionText.includes(String(nm).toLowerCase())) return { tab: "projects", selector: `[data-proj="${k}"]` }; }
      return { tab: "projects" };
    }
    if (t === "team") {
      const arr = pp.TEAM_MEMBERS || [];
      for (const L of labels) { const idx = arr.findIndex((m) => m && m.name && L.includes(String(m.name).toUpperCase())); if (idx >= 0) return { tab: "team", selector: `[data-member="${idx}"]` }; }
      const idx = arr.findIndex((m) => m && m.name && regionText.includes(String(m.name).toLowerCase()));
      return idx >= 0 ? { tab: "team", selector: `[data-member="${idx}"]` } : { tab: "team" };
    }
    if (t === "timeline") {
      const flat = []; (pp.PR_YEARS || []).forEach((y) => (y.items || []).forEach((it) => flat.push(it)));
      const hit = flat.find((it) => it && it.headline && regionText.includes(String(it.headline).toLowerCase().slice(0, 28)));
      return hit ? { tab: "timeline", selector: `[data-entry="${hit.id || flat.indexOf(hit)}"]` } : { tab: "timeline" };
    }
    if (t === "capital") return { tab: "capital" };
    if (near("FOLLOW") || near("MESSAGE")) return { tab: "overview", field: "name" };
    return { tab: "overview" };
  };
  /* ---- editor → preview -------------------------------------------------------------
     The phone already drives the editor (click a widget, land on its field). This is the
     other direction: move in the editor and the phone follows, so the user can always see
     what they are changing. Matched on the widget's own label text — the same heuristic
     resolvePreviewTarget uses in reverse — so it needs no change to the investor renderer. */
  const previewRef = useRef(null);
  const syntheticClickRef = useRef(false);

  // Scroll INSIDE the phone, never the editor page. scrollIntoView would drag the whole
  // desktop layout around when the widget is off-screen.
  const scrollWithin = (el) => {
    let box = el.parentElement;
    while (box && box !== previewRef.current && !(box.scrollHeight > box.clientHeight + 4)) box = box.parentElement;
    if (!box || box === previewRef.current) return;
    const br = box.getBoundingClientRect(), er = el.getBoundingClientRect();
    const delta = (er.top + er.height / 2) - (br.top + br.height / 2);
    try { box.scrollTo({ top: box.scrollTop + delta, behavior: "smooth" }); } catch (_) { box.scrollTop += delta; }
  };
  const flashPreview = (el) => {
    scrollWithin(el);
    const prev = el.style.boxShadow;
    el.style.transition = "box-shadow .3s ease";
    el.style.boxShadow = "0 0 0 2px rgba(37,99,235,.5)";
    setTimeout(() => { el.style.boxShadow = prev; }, 1100);
  };
  // Find the SMALLEST element whose text carries one of these labels — the widget itself
  // rather than the card or screen containing it.
  const showInPreview = (needles) => {
    const root = previewRef.current;
    if (!root || !needles || !needles.length) return false;
    const want = needles.map((n) => n.toUpperCase());
    let best = null, bestLen = Infinity;
    root.querySelectorAll("div,span,section,button,p,h1,h2,h3,li").forEach((el) => {
      const tx = (el.textContent || "").trim().toUpperCase();
      if (!tx || tx.length > 90 || tx.length >= bestLen) return;
      if (want.some((w) => tx.includes(w))) { best = el; bestLen = tx.length; }
    });
    if (best) { flashPreview(best); return true; }
    return false;
  };

  // What each editor step / field points at in the phone.
  const STEP_ANCHORS = {
    "overview:0": ["FOLLOW"],                                   // Images — the header
    "overview:1": ["COMPANY STATUS"],
    "overview:2": ["AI BRIEF", "60 SECONDS"],
    "capital:0": ["CAPITAL SNAPSHOT", "SHARE STRUCTURE"],
    "capital:1": ["FUNDING RUNWAY", "FULLY FUNDED", "CAPITAL STATUS"],
    "capital:2": ["OWNERSHIP"],
    "team:0": ["BOARD", "LEADERSHIP"],
    "timeline:0": ["TIMELINE", "PRESS RELEASES", "RECENT"],
  };
  const FIELD_ANCHORS = {
    commodity: ["COMMODITY"], jurisdiction: ["JURISDICTION"], headquarters: ["HEADQUARTERS"],
    stage: ["STAGE"], focus: ["CURRENT FOCUS"], flagship: ["FLAGSHIP PROJECT"],
    projectscount: ["PROJECTS"], ticker: ["TRADED AS"], website: [".COM", ".CA"],
    brief: ["AI BRIEF", "60 SECONDS"],
  };

  // #6 — changing tab or section moves the phone to the matching part of the profile. The
  // delay lets the preview finish re-rendering after a tab switch before we hunt for it.
  useEffect(() => {
    const t = setTimeout(() => {
      showInPreview(STEP_ANCHORS[`${activeTab}:${activeStep}`] || []);
    }, 260);
    return () => clearTimeout(t);
  }, [activeTab, activeStep]);

  // #7 — focusing a field moves the phone to the widget that field feeds.
  const onEditorFocus = (e) => {
    const holder = e.target && e.target.closest && e.target.closest("[data-field]");
    const f = holder && holder.getAttribute("data-field");
    if (f && FIELD_ANCHORS[f]) showInPreview(FIELD_ANCHORS[f]);
  };

  // #13 — selecting a project in the editor selects the SAME project in the phone. The
  // investor renderer owns which project is showing, and its pills are real buttons, so the
  // matching pill is clicked rather than reaching into its state (the renderer stays
  // untouched). Falls back to just scrolling to the project if no pill is found.
  const syncPreviewProject = (key) => {
    const root = previewRef.current;
    const name = ((pp && pp.PROJECTS_DATA && pp.PROJECTS_DATA[key]) || {}).name;
    if (!root || !name) return;
    const want = String(name).trim().toUpperCase();
    const pill = [...root.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim().toUpperCase() === want
    );
    if (pill) {
      syntheticClickRef.current = true;
      pill.click();
      setTimeout(() => { syntheticClickRef.current = false; }, 0);
      setTimeout(() => showInPreview([want]), 140);
    }
    else showInPreview([want]);
  };
  // Runs whenever the selected project changes, including via Previous/Next and "+ Add site".
  useEffect(() => {
    if (activeTab !== "projects" || !activeProj) return;
    const t = setTimeout(() => syncPreviewProject(activeProj), 260);
    return () => clearTimeout(t);
  }, [activeProj, activeTab]);

  const lastTabRef = useRef("overview");
  const handlePreviewClick = (e) => {
    // syncPreviewProject clicks a pill inside the phone to change its project. That click
    // would otherwise come straight back through this handler as if the USER had tapped the
    // phone, and route the editor somewhere else entirely.
    if (syntheticClickRef.current) return;
    const tgt = resolvePreviewTarget(e.target);
    if (tgt.projectKey) { setActiveProj(tgt.projectKey); setOpenSec("images"); }
    setTimeout(() => jump(tgt.tab, tgt.field, tgt.selector), 0);
  };

  useEffect(() => {
    if (injectedProfile) { const prof = injectedProfile || {}; setProfile(prof); setPp(prof.pp || {}); setDebPp(prof.pp || {}); setTier(String((company && company.tier) || prof.tier || "").toLowerCase()); return; }
    if (!slug) return;
    let ok = true;
    (async () => {
      try {
        const h = await authHeaders();
        const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=profile,tier`, { headers: h });
        const rows = await res.json().catch(() => []);
        if (!ok) return;
        const prof = (rows[0] && rows[0].profile) || {};
        setProfile(prof); setPp(prof.pp || {}); setDebPp(prof.pp || {}); setTier(String((rows[0] && rows[0].tier) || "").toLowerCase());
      } catch (_) { if (ok) { setProfile({}); setPp({}); setDebPp({}); } }
    })();
    return () => { ok = false; };
  }, [slug, injectedProfile]);

  useEffect(() => { const t = setTimeout(() => setDebPp(pp), 90); return () => clearTimeout(t); }, [pp]);

  // The status-card values the profile actually shows (so dropdowns can pre-select the
  // CURRENT stage/flagship even when the company hasn't set an explicit override yet).
  const identity = useMemo(() => {
    if (!pp) return {};
    try { return buildCompanyIdentity({ COMPANY: pp.COMPANY || {}, STATUS: pp.STATUS, STATUS_IMG: pp.STATUS_IMG, PROJECTS_FULL: pp.PROJECTS_FULL, PROJECTS_DATA: pp.PROJECTS_DATA, EXCHANGES: pp.EXCHANGES, STAGES: pp.STAGES, STAGE_NOW: pp.STAGE_NOW }) || {}; }
    catch { return {}; }
  }, [pp]);
  // buildCompanyIdentity nests these four under `meta`; reading them off the top level
  // returned undefined, so the fields showed a grey placeholder instead of the value the
  // profile is actually displaying.
  const idMeta = (identity && identity.meta) || {};

  // Keep the active tab valid for the plan (BASIC only edits Overview + Timeline). This MUST
  // run unconditionally, before the `if (!pp) return` guard below — otherwise the hook is
  // skipped on the first (loading) render and added on the next, which crashes React with
  // "Rendered more hooks than during the previous render."
  useEffect(() => {
    const allowed = tier === "basic" ? ["overview", "timeline"] : TABS.map((t) => t.key);
    if (!allowed.includes(activeTab)) setNav("overview", 0);
  }, [tier, activeTab]);

  /* ---------------- setters ---------------- */
  const dirty = () => setSave("idle");
  const setCo = (k, v) => { dirty(); setPp((p) => ({ ...p, COMPANY: { ...(p.COMPANY || {}), [k]: v } })); };
  const setKey = (k, v) => { dirty(); setPp((p) => ({ ...p, [k]: v })); };

  // Tickers (EXCHANGES: [{ex, sym, price, ...}])
  const setTicker = (i, patch) => { dirty(); setPp((p) => { const a = [...(p.EXCHANGES || [])]; if (patch === null) a.splice(i, 1); else a[i] = { ...(a[i] || {}), ...patch }; return { ...p, EXCHANGES: a }; }); };
  const addTicker = () => { dirty(); setPp((p) => ({ ...p, EXCHANGES: [...(p.EXCHANGES || []), { ex: "", sym: "" }] })); };

  // Thesis (array of strings) & AI Brief (BRIEF_SECTIONS: [{k, v}])
  const setThesis = (i, v) => { dirty(); setPp((p) => { const a = [...(p.THESIS || [])]; if (v === null) a.splice(i, 1); else a[i] = v; return { ...p, THESIS: a }; }); };
  const setBrief = (i, patch) => { dirty(); setPp((p) => { const a = [...(p.BRIEF_SECTIONS || [])]; if (patch === null) a.splice(i, 1); else a[i] = { ...(a[i] || {}), ...patch }; return { ...p, BRIEF_SECTIONS: a }; }); };
  const addBrief = () => { dirty(); setPp((p) => ({ ...p, BRIEF_SECTIONS: [...(p.BRIEF_SECTIONS || []), { k: "New section", v: "" }] })); };

  // Value drivers (WHY: array of short strings). Optional: toggling off stashes the list so the
  // app hides the "Core Value Drivers" widget (empty WHY) without losing the content.
  const whyOn = !(pp && pp.__whyOff);
  const setWhy = (i, v) => { dirty(); setPp((p) => { const a = [...(p.WHY || [])]; if (v === null) a.splice(i, 1); else a[i] = v; return { ...p, WHY: a }; }); };
  const addWhy = () => { dirty(); setPp((p) => ({ ...p, WHY: [...(p.WHY || []), ""] })); };
  const toggleWhy = (on) => { dirty(); setPp((p) => on
    ? { ...p, __whyOff: false, WHY: (p.__whyStash && p.__whyStash.length ? p.__whyStash : (p.WHY || [])), __whyStash: undefined }
    : { ...p, __whyOff: true, __whyStash: (p.WHY || []), WHY: [] }); };

  // Projects — edit the RICH PROJECTS_DATA[key] in place (name/tag/coord/intro/stats/highlights/
  // sections/gallery). Keep PROJECTS_FULL[key] name in sync only if that format is present.
  const setProject = (key, patch) => {
    dirty();
    setPp((p) => {
      const pd = { ...(p.PROJECTS_DATA || {}) };
      if (patch === null) {
        delete pd[key];
        const out = { ...p, PROJECTS_DATA: pd };
        if (p.PROJECTS_FULL) { const pf = { ...p.PROJECTS_FULL }; delete pf[key]; out.PROJECTS_FULL = pf; }
        return out;
      }
      pd[key] = { ...(pd[key] || { key }), ...patch, key };
      const out = { ...p, PROJECTS_DATA: pd };
      if (p.PROJECTS_FULL) { const pf = { ...p.PROJECTS_FULL }; pf[key] = { ...(pf[key] || { key }), ...patch, key }; out.PROJECTS_FULL = pf; }
      return out;
    });
  };
  // Add a project from the Status card and immediately make it the flagship, then jump to
  // the Projects tab so the new site can be filled in.
  const addFlagshipSite = () => {
    const key = addProject();
    if (key) { setCo("flagshipKey", key); setActiveProj(key); setNav("projects", 0); }
  };

  const addProject = () => {
    dirty();
    // The key is derived from the CURRENT pp before dispatching, not inside the updater:
    // React may run an updater later or twice, so a value assigned in there can't be
    // returned reliably to the caller that needs to select the new project.
    const existing = (pp && pp.PROJECTS_DATA) || {};
    let k = "new-project", i = 1; while (existing[k]) k = "new-project-" + (++i);
    setPp((p) => {
      const pd = { ...(p.PROJECTS_DATA || {}) };
      if (pd[k]) return p;                      // already added (e.g. a double dispatch)
      pd[k] = { key: k, name: "New Project", tag: "", coord: "", intro: "", stats: [], highlights: [], sections: [] };
      return { ...p, PROJECTS_DATA: pd };
    });
    return k;
  };

  // ---- Rich project authoring: writes PROJECTS_FULL[key], the exact structure the investor
  // Pro profile renders (snapshot / stage / technical cards / scenarios / brief). Creates the
  // entry + nested objects on demand so authoring works even before the AI extractor has run.
  // Universal: keyed by project, no company-specific values.
  const fullBase = (p, key) => (p.PROJECTS_FULL && p.PROJECTS_FULL[key]) ||
    { key, name: (p.PROJECTS_DATA && p.PROJECTS_DATA[key] && p.PROJECTS_DATA[key].name) || key };
  const setProjectFull = (key, patch) => { dirty(); setPp((p) => {
    const pf = { ...(p.PROJECTS_FULL || {}) };
    pf[key] = { ...fullBase(p, key), ...patch, key };
    return { ...p, PROJECTS_FULL: pf };
  }); };
  const setContent = (key, sub, patch) => { dirty(); setPp((p) => {
    const pf = { ...(p.PROJECTS_FULL || {}) };
    const base = fullBase(p, key);
    const content = { ...(base.content || {}) };
    content[sub] = patch === null ? undefined : { ...(content[sub] || {}), ...patch };
    pf[key] = { ...base, content, key };
    return { ...p, PROJECTS_FULL: pf };
  }); };
  // Snapshot cards live in PROJECTS_FULL[key].snap (array, matched by canonical label). Find-or-
  // create the item; set its icon on create so the detail sheet header resolves an icon.
  const setSnap = (key, cfg, patch) => { dirty(); setPp((p) => {
    const pf = { ...(p.PROJECTS_FULL || {}) };
    const base = fullBase(p, key);
    const arr = Array.isArray(base.snap) ? base.snap.map((s) => ({ ...s })) : [];
    let i = arr.findIndex((s) => s.label === cfg.label);
    if (i < 0) { arr.push({ label: cfg.label, sub: cfg.title, icon: cfg.icon }); i = arr.length - 1; }
    arr[i] = { ...arr[i], ...patch, label: cfg.label };
    pf[key] = { ...base, snap: arr, key };
    return { ...p, PROJECTS_FULL: pf };
  }); };
  // Technical Intelligence cards live in PROJECTS_FULL[key].cards[] (matched by kind).
  const setCard = (key, kind, patch) => { dirty(); setPp((p) => {
    const pf = { ...(p.PROJECTS_FULL || {}) };
    const base = fullBase(p, key);
    const arr = Array.isArray(base.cards) ? base.cards.map((c) => ({ ...c })) : [];
    let i = arr.findIndex((c) => c.kind === kind);
    if (i < 0) { arr.push({ kind }); i = arr.length - 1; }
    arr[i] = { ...arr[i], ...patch, kind };
    pf[key] = { ...base, cards: arr, key };
    return { ...p, PROJECTS_FULL: pf };
  }); };

  // Team (TEAM_MEMBERS: [{name, role, short, full, photo, initials}])
  const initialsOf = (n) => String(n || "").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
  const setMember = (idx, patch) => {
    dirty();
    setPp((p) => {
      const arr = [...(p.TEAM_MEMBERS || [])];
      if (patch === null) { arr.splice(idx, 1); return { ...p, TEAM_MEMBERS: arr }; }
      const next = { ...(arr[idx] || {}), ...patch };
      if (patch.name !== undefined) next.initials = initialsOf(patch.name);
      arr[idx] = next; return { ...p, TEAM_MEMBERS: arr };
    });
  };
  // Team order IS the display order on the profile, so it needs to be editable — a board
  // is a hierarchy, not a list in whatever order it was typed.
  const moveMember = (i, dir) => {
    const j = i + dir;
    setPp((p) => {
      const arr = [...(p.TEAM_MEMBERS || [])];
      if (j < 0 || j >= arr.length) return p;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...p, TEAM_MEMBERS: arr };
    });
    dirty();
  };

  const addMember = () => { dirty(); setPp((p) => ({ ...p, TEAM_MEMBERS: [...(p.TEAM_MEMBERS || []), { name: "New Member", role: "", short: "", full: "", photo: "", initials: "NM" }] })); };

  // Timeline (PR_YEARS grouped by year; edit a FLAT list and regroup)
  const TL_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayLabel = (id) => { const m = String(id || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${TL_MONTHS[+m[2] - 1] || ""} ${+m[3]}` : ""; };
  const flatTL = () => { const out = []; (pp.PR_YEARS || []).forEach((y) => (y.items || []).forEach((it) => out.push(it))); return out; };
  const regroupTL = (flat) => {
    const by = {};
    flat.forEach((e) => { const yr = (String(e.id || "").match(/^(\d{4})/) || [])[1] || String(new Date().getFullYear()); (by[yr] = by[yr] || []).push(e); });
    return Object.keys(by).sort((a, b) => b - a).map((y) => ({ year: y, items: by[y].sort((a, b) => String(b.id || "").localeCompare(String(a.id || ""))) }));
  };
  const setEntry = (idx, patch) => {
    dirty();
    setPp((p) => {
      const flat = []; (p.PR_YEARS || []).forEach((y) => (y.items || []).forEach((it) => flat.push(it)));
      if (patch === null) { flat.splice(idx, 1); }
      else { const nx = { ...flat[idx], ...patch }; if (patch.id !== undefined) nx.d = dayLabel(patch.id); if (patch.headline !== undefined) nx.label = patch.headline; flat[idx] = nx; }
      return { ...p, PR_YEARS: regroupTL(flat) };
    });
  };
  const addEntry = () => {
    dirty();
    setPp((p) => {
      const flat = []; (p.PR_YEARS || []).forEach((y) => (y.items || []).forEach((it) => flat.push(it)));
      const today = new Date().toISOString().slice(0, 10);
      flat.unshift({ id: today, d: dayLabel(today), key: false, headline: "New update", label: "New update", why: "", whatHappened: "", whatHappensNext: "", takeaways: [] });
      return { ...p, PR_YEARS: regroupTL(flat) };
    });
  };

  // Capital
  const setCap = (patch) => { dirty(); setPp((p) => ({ ...p, CAP: { ...(p.CAP || {}), ...patch } })); };
  const setCapRow = (i, patch) => { dirty(); setPp((p) => { const rows = [...((p.CAP || {}).rows || [])]; if (patch === null) rows.splice(i, 1); else rows[i] = { ...(rows[i] || {}), ...patch }; return { ...p, CAP: { ...(p.CAP || {}), rows } }; }); };
  const addCapRow = () => { dirty(); setPp((p) => ({ ...p, CAP: { ...(p.CAP || {}), rows: [...((p.CAP || {}).rows || []), { sec: "", det: "", qty: "" }] } })); };
  const setCapStatus = (patch) => { dirty(); setPp((p) => ({ ...p, CAPSTATUS: { ...(p.CAPSTATUS || {}), ...patch } })); };
  const setFunding = (patch) => { dirty(); setPp((p) => ({ ...p, FUNDING: { ...(p.FUNDING || {}), ...patch } })); };
  const setOwn = (i, pair) => { dirty(); setPp((p) => { const a = (p.OWNERSHIP || []).map((r) => [...r]); if (pair === null) a.splice(i, 1); else a[i] = pair; return { ...p, OWNERSHIP: a }; }); };
  const addOwn = () => { dirty(); setPp((p) => ({ ...p, OWNERSHIP: [...(p.OWNERSHIP || []), ["", ""]] })); };

  const upload = async (label, file, apply) => {
    if (!file) return;
    setBusyImg(label);
    try { const url = await uploadCompanyMedia(file); if (url) { dirty(); apply(url); } } catch (_) {} finally { setBusyImg(""); }
  };

  // Phase 4B canonical save lives in ../lib/ppToProfile.js (buildCanonicalProfile) so the exact
  // same transform is exercised by the persisted-row validation tests, not a drifting copy.
  const doSave = async () => {
    if (injectedProfile) { setSave("saved"); return; } // harness: no DB write
    setSave("saving");
    try {
      const nextProfile = buildCanonicalProfile(profile || {}, pp);
      const h = await authHeaders();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}`, {
        method: "PATCH", headers: { ...h, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ profile: nextProfile }),
      });
      setSave(res.ok ? "saved" : "error");
      if (res.ok) { setProfile(nextProfile); setPp(nextProfile.pp); setDebPp(nextProfile.pp); }
    } catch (_) { setSave("error"); }
  };

  if (!pp) return <div style={{ display: "grid", placeItems: "center", height: "100%", color: "#94a3b8", fontSize: 13 }}>Loading profile…</div>;
  const co = pp.COMPANY || {};

  /* ---------------- per-tab field panels ---------------- */
  const overviewSteps = [
    { key: "images", title: "Images", fields: [], node: (
      <section>
        <span style={SECTION_TITLE}>Company images</span>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "-2px 0 14px" }}>The logo and status image as they appear on your MineEx profile card.</p>
        <ProfileImages
          heroUrl={pp.SITE_PHOTO || pp.STATUS_IMG} logoUrl={pp.AVATAR || pp.LOGO} companyName={co.name}
          busyHero={busyImg === "hero"} busyLogo={busyImg === "avatar"}
          onHero={(f) => upload("hero", f, (u) => setPp((p) => ({ ...p, STATUS_IMG: u, SITE_PHOTO: u })))}
          onLogo={(f) => upload("avatar", f, (u) => setPp((p) => ({ ...p, AVATAR: u, LOGO: u })))}
        />
      </section>
    ) },
    { key: "details", title: "Company details", fields: ["name", "ticker", "website", "tagline", "commodity", "stage", "jurisdiction", "headquarters", "flagship", "focus", "projectscount"], node: (
      <>
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <F label="Company name" field="name" value={co.name} onChange={(v) => setCo("name", v)} />
        <F label="Website" field="website" value={co.website} onChange={(v) => setCo("website", v)} ph="https://…" />
        <TA label="Tagline" field="tagline" rows={2} value={pp.ONE_LINER || co.slogan} onChange={(v) => { setKey("ONE_LINER", v); setCo("slogan", v); }} />
        <div>
          <SecHead title="Tickers / Exchanges" onAdd={addTicker} />
          {(pp.EXCHANGES || []).length === 0 && <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>No tickers yet.</div>}
          {(pp.EXCHANGES || []).map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
              <div style={{ width: 96 }}><span style={{ ...LABEL, fontSize: 9.5 }}>Exchange</span>
                <input data-field={i === 0 ? "ticker" : undefined} style={INPUT} value={t.ex || ""} placeholder="TSX.V" onChange={(e) => setTicker(i, { ex: e.target.value })} /></div>
              <div style={{ flex: 1 }}><span style={{ ...LABEL, fontSize: 9.5 }}>Symbol</span>
                <input style={INPUT} value={t.sym || ""} placeholder="KNG" onChange={(e) => setTicker(i, { sym: e.target.value })} /></div>
              <button onClick={() => setTicker(i, null)} title="Remove" style={DEL_BTN}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <F label="Commodity" field="commodity" value={co.commodity || idMeta.commodity || ""} onChange={(v) => setCo("commodity", v)} />
          <Sel label="Stage" field="stage" value={co.stage || identity.stage || ""} onChange={(v) => setCo("stage", v)} options={[...new Set([identity.stage, ...STAGE_OPTIONS].filter(Boolean))]} ph="Select stage…" />
        </div>
        <F label="Jurisdiction" field="jurisdiction" value={co.jurisdiction || idMeta.jurisdiction || ""} onChange={(v) => setCo("jurisdiction", v)} />
        <F label="Headquarters" field="headquarters" value={co.headquarters} onChange={(v) => setCo("headquarters", v)} />
      </section>
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ ...SECTION_TITLE, marginBottom: 0 }}>Status card</span>
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: -6 }}>The six tiles under Company Status on the profile.</div>
        {/* The flagship can only be chosen from projects that exist, so offer a way to add
            one right here rather than sending the user to the Projects tab and back. */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <Sel label="Flagship project" field="flagship" value={co.flagshipKey || Object.keys(pp.PROJECTS_DATA || {})[0] || ""}
            onChange={(v) => setCo("flagshipKey", v)} ph="First project (default)"
            options={Object.keys(pp.PROJECTS_DATA || {}).map((k) => ({ value: k, label: (pp.PROJECTS_DATA[k] || {}).name || k }))} />
          <button onClick={addFlagshipSite} style={{ ...ADD_BTN, height: 36, whiteSpace: "nowrap" }}
            title="Add a project and make it the flagship">+ Add site</button>
        </div>
        <F label="Current focus" field="focus" value={co.focus || idMeta.focus || ""} onChange={(v) => setCo("focus", v)} ph="e.g. Active Drilling" />
        <F label="Projects label" field="projectscount" value={co.projectsLabel || idMeta.projects || ""} onChange={(v) => setCo("projectsLabel", v)} ph={`Auto: ${Object.keys(pp.PROJECTS_DATA || {}).length} Projects`} />
      </section>
      </>
    ) },
    { key: "brief", title: "Investment story", fields: ["brief"], node: (
      <>
      {/* Investment thesis (pp.THESIS) and Value drivers (pp.WHY) were edited here but
          render on NEITHER a Pro nor a Basic investor profile: THESIS appears only in
          Conference Mode, and the derived WHY array in PassportProto is computed and never
          consumed at all. Editing them here implied they were investor-facing. The DATA is
          untouched (setThesis/setWhy and the values on pp still exist) — only the fields
          are gone, so nothing is lost if they need a home later. */}
      <section data-field="brief">
        <SecHead title="AI Brief sections" onAdd={addBrief} />
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: -6, marginBottom: 10 }}>This is the AI Brief card (What They Do, Why It Matters, Competitive Advantages…).</div>
        {(pp.BRIEF_SECTIONS || []).map((b, i) => (
          <div key={i} style={CARD}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input style={{ ...INPUT, fontWeight: 700 }} value={b.k || ""} placeholder="Section heading" onChange={(e) => setBrief(i, { k: e.target.value })} />
              <button onClick={() => setBrief(i, null)} title="Remove" style={DEL_BTN}>✕</button>
            </div>
            {/* These carry the longest prose in the editor — give them real room. */}
            <Grow value={b.v} onChange={(v) => setBrief(i, { v })} min={168} />
          </div>
        ))}
      </section>
      </>
    ) },
  ];

  const projectsSteps = [{ key: "projects", title: "Projects", fields: [], node: (() => {
    const keys = Object.keys(pp.PROJECTS_DATA || {});
    if (keys.length === 0) {
      return (
        <section>
          <SecHead title="Projects" onAdd={addProject} />
          <div style={{ border: "1px dashed #cbd5e1", borderRadius: 12, padding: "30px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            No projects yet.
            <div><button onClick={addProject} style={{ ...ADD_BTN, marginTop: 12 }}>+ Add your first project</button></div>
          </div>
        </section>
      );
    }
    const k = (activeProj && keys.includes(activeProj)) ? activeProj : keys[0];
    const idx = keys.indexOf(k);
    const pr = (pp.PROJECTS_DATA || {})[k] || {};
    const gallery = Array.isArray(pr.gallery) ? pr.gallery : [];
    // Rich project (what the investor Pro profile renders): PROJECTS_FULL[k].
    const pfk = (pp.PROJECTS_FULL || {})[k] || {};
    const st = (pfk.content && pfk.content.stage) || {};
    const completed = Array.isArray(st.completed) ? st.completed : [];
    const setCompleted = (arr) => setContent(k, "stage", { completed: arr });
    const snapItems = Array.isArray(pfk.snap) ? pfk.snap : [];
    // Drill targets / exploration focus (content.targets). objective ?? why loads legacy extractor data.
    const tg = (pfk.content && pfk.content.targets) || {};
    const priority = Array.isArray(tg.priority) ? tg.priority : [];
    const tgEvidence = Array.isArray(tg.evidence) ? tg.evidence : [];
    const setPriority = (arr) => setContent(k, "targets", { priority: arr });
    const setTgEvidence = (arr) => setContent(k, "targets", { evidence: arr });
    // Narrative group (content.unique / content.scenarios / content.brief).
    const uq = (pfk.content && pfk.content.unique) || {};
    const diffs = Array.isArray(uq.diffs) ? uq.diffs : [];
    const uqEvidence = Array.isArray(uq.evidence) ? uq.evidence : [];
    const sc = (pfk.content && pfk.content.scenarios) || {};
    const brief = (pfk.content && pfk.content.brief) || {};
    const setScenario = (key, v) => setContent(k, "scenarios", { [key]: { ...(sc[key] || {}), text: v } });
    const cards = Array.isArray(pfk.cards) ? pfk.cards : [];
    const hasT = (v) => v != null && String(v).trim() !== "";
    // Per-section "has content" flags — drive the progress dots + the summary line.
    const filled = {
      images: gallery.length > 0,
      stage: typeof pfk.stageIdx === "number" || [st.current, st.summary, st.program, st.activity, st.next, st.timing, st.closing].some(hasT) || completed.length > 0,
      snapshot: snapItems.some((s) => hasT(s.value)),
      targets: priority.length > 0 || hasT(tg.summary) || tgEvidence.length > 0 || hasT(tg.closing),
      tech: cards.some((c) => hasT(c.body) || (Array.isArray(c.points) && c.points.length) || (Array.isArray(c.timeline) && c.timeline.length) || (Array.isArray(c.rows) && c.rows.length)),
      unique: hasT(uq.summary) || diffs.length > 0 || uqEvidence.length > 0 || hasT(uq.takeaway),
      drivers: [sc.bull && sc.bull.text, sc.bear && sc.bear.text, sc.next && sc.next.text].some(hasT),
      brief: [brief.overview, brief.thesis, brief.focus, brief.different, brief.risks, brief.means].some(hasT),
    };
    const filledCount = Object.values(filled).filter(Boolean).length;
    const toggle = (id) => setOpenSec((cur) => (cur === id ? "" : id));
    const goProj = (dir) => { const ni = Math.min(keys.length - 1, Math.max(0, idx + dir)); setActiveProj(keys[ni]); setOpenSec("images"); };
    const navBtn = { padding: "8px 14px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
    return (
      <section data-proj={k}>
        <SecHead title="Projects" onAdd={addProject} />
        {/* Project selector — one project at a time; the active one is highlighted. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {keys.map((pk) => {
            const nm = ((pp.PROJECTS_DATA || {})[pk] || {}).name || "Untitled project";
            const on = pk === k;
            return (
              <button key={pk} onClick={() => { setActiveProj(pk); setOpenSec("images"); }}
                style={{ padding: "7px 14px", borderRadius: 999, border: on ? "1px solid #2563eb" : "1px solid #e2e8f0", background: on ? "#2563eb" : "#fff", color: on ? "#fff" : "#334155", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                {nm}
              </button>
            );
          })}
        </div>
        {/* Active project: name + remove + progress summary. */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
          <input style={{ ...INPUT, flex: 1, fontWeight: 700, fontSize: 15 }} value={pr.name || ""} placeholder="Project name" onChange={(e) => setProject(k, { name: e.target.value })} />
          <button onClick={() => { if (window.confirm("Remove this project?")) { setProject(k, null); setActiveProj(null); } }} title="Remove project" style={DEL_BTN}>✕</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 16 }}>{filledCount} of 8 sections have content · project {idx + 1} of {keys.length}</div>

        {/* IMAGES — the project gallery (PROJECTS_DATA[k].gallery → ProjectGallery on the profile). */}
        <EditorSection title="Images" hint="Photos shown in the project gallery on the investor profile." filled={filled.images} open={openSec === "images"} onToggle={() => toggle("images")}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {gallery.map((g, i) => (
              <div key={i} style={{ position: "relative", width: 96, height: 72, borderRadius: 10, overflow: "hidden", backgroundImage: `url("${g && (g.src || g)}")`, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid #e2e8f0" }}>
                <button onClick={() => setProject(k, { gallery: gallery.filter((_, j) => j !== i) })}
                  style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: 999, border: "none", background: "rgba(15,23,42,0.72)", color: "#fff", fontSize: 10, cursor: "pointer", lineHeight: "18px", padding: 0 }}>✕</button>
              </div>
            ))}
            <label style={{ width: 96, height: 72, borderRadius: 10, border: "1px dashed #cbd5e1", display: "grid", placeItems: "center", cursor: "pointer", color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>
              {busyImg === "proj-" + k ? "Uploading…" : "+ Add photo"}
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) upload("proj-" + k, f, (u) => setProject(k, { gallery: [...gallery, { src: u }] })); e.target.value = ""; }} />
            </label>
          </div>
        </EditorSection>

        <EditorSection title="60-second project brief" hint="The 'Understand this project in 60 seconds' sheet." filled={filled.brief} open={openSec === "brief"} onToggle={() => toggle("brief")}>
          <div style={{ marginBottom: 12 }}><TA label="Project summary / introduction" value={brief.overview} onChange={(v) => setContent(k, "brief", { overview: v })} /></div>
          <div style={{ marginBottom: 12 }}><TA label="Discovery thesis" value={brief.thesis} onChange={(v) => setContent(k, "brief", { thesis: v })} /></div>
          <div style={{ marginBottom: 12 }}><TA label="Current technical focus" value={brief.focus} onChange={(v) => setContent(k, "brief", { focus: v })} /></div>
          <div style={{ marginBottom: 12 }}><TA label="What makes this project different" value={brief.different} onChange={(v) => setContent(k, "brief", { different: v })} /></div>
          <div style={{ marginBottom: 12 }}><TA label="Key technical risks" value={brief.risks} onChange={(v) => setContent(k, "brief", { risks: v })} /></div>
          <div><TA label="What this means" value={brief.means} onChange={(v) => setContent(k, "brief", { means: v })} /></div>
        </EditorSection>

        <EditorSection title="Project snapshot" hint="The fundamentals shown as Project Snapshot cards. A card appears on the profile only when it has a headline." filled={filled.snapshot} open={openSec === "snapshot"} onToggle={() => toggle("snapshot")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {SNAP_CARDS.map((cfg) => (
              <SnapCardEditor key={cfg.label} cfg={cfg} item={snapItems.find((s) => s.label === cfg.label)} onPatch={(patch) => setSnap(k, cfg, patch)} />
            ))}
          </div>
        </EditorSection>

        <EditorSection title="Drill targets / exploration focus" hint="The Exploration Focus sheet. The tile shows on the profile once at least one priority target is added." filled={filled.targets} open={openSec === "targets"} onToggle={() => toggle("targets")}>
          <TA label="Section intro" value={tg.summary} onChange={(v) => setContent(k, "targets", { summary: v })} />
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ ...LABEL, marginBottom: 0 }}>Priority targets</span>
              <button onClick={() => setPriority([...priority, { name: "", status: "", objective: "" }])} style={ADD_BTN}>+ Add target</button>
            </div>
            {priority.map((t, i) => (
              <div key={i} style={{ ...CARD, background: "#fafcff" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <span style={{ display: "grid", placeItems: "center", width: 20, height: 20, flexShrink: 0, borderRadius: 999, background: "#e2e8f0", color: "#475569", fontSize: 10, fontWeight: 800 }}>{i + 1}</span>
                  <input style={{ ...INPUT, flex: 1, fontWeight: 700 }} value={t.name || ""} placeholder="Target name" onChange={(e) => { const a = priority.map((x) => ({ ...x })); a[i].name = e.target.value; setPriority(a); }} />
                  <input style={{ ...INPUT, width: 150, flexShrink: 0 }} value={t.status || ""} placeholder="Status" onChange={(e) => { const a = priority.map((x) => ({ ...x })); a[i].status = e.target.value; setPriority(a); }} />
                  <button onClick={() => { const a = priority.filter((_, j) => j !== i); setPriority(a); }} title="Remove" style={DEL_BTN}>✕</button>
                </div>
                <Grow value={t.objective ?? t.why} ph="Objective / description" onChange={(v) => { const a = priority.map((x) => ({ ...x })); a[i].objective = v; delete a[i].why; setPriority(a); }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ ...LABEL, marginBottom: 0 }}>Supporting evidence</span>
              <button onClick={() => setTgEvidence([...tgEvidence, ""])} style={ADD_BTN}>+ Add</button>
            </div>
            {tgEvidence.map((e0, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input style={INPUT} value={e0 || ""} placeholder="A supporting fact" onChange={(e) => { const a = [...tgEvidence]; a[i] = e.target.value; setTgEvidence(a); }} />
                <button onClick={() => { const a = [...tgEvidence]; a.splice(i, 1); setTgEvidence(a); }} title="Remove" style={DEL_BTN}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}><TA label="Why these targets matter" value={tg.closing} onChange={(v) => setContent(k, "targets", { closing: v })} /></div>
        </EditorSection>

        <EditorSection title="Project stage" hint="The Project Stage widget and its detail sheet on the investor profile." filled={filled.stage} open={openSec === "stage"} onToggle={() => toggle("stage")}>
          <Sel label="Lifecycle position" value={typeof pfk.stageIdx === "number" ? (STAGE_NAMES[pfk.stageIdx] || "") : ""}
            onChange={(v) => { const i = STAGE_NAMES.indexOf(v); setProjectFull(k, { stageIdx: i < 0 ? undefined : i }); }}
            options={STAGE_NAMES} ph="Select lifecycle position…" />
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <F label="Development stage" value={st.current} onChange={(v) => setContent(k, "stage", { current: v })} ph="e.g. Discovery" />
            <F label="Expected timeline" value={st.timing} onChange={(v) => setContent(k, "stage", { timing: v })} ph="e.g. H2 2026" />
          </div>
          <div style={{ marginTop: 12 }}><TA label="Stage summary" value={st.summary} onChange={(v) => setContent(k, "stage", { summary: v })} /></div>
          <div style={{ marginTop: 12 }}><F label="Current program" value={st.program} onChange={(v) => setContent(k, "stage", { program: v })} ph="e.g. 26-hole diamond drill program" /></div>
          <div style={{ marginTop: 12 }}><TA label="Current activity" value={st.activity} onChange={(v) => setContent(k, "stage", { activity: v })} /></div>
          <div style={{ marginTop: 12 }}><TA label="Next technical milestone" value={st.next} onChange={(v) => setContent(k, "stage", { next: v })} /></div>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ ...LABEL, marginBottom: 0 }}>Recently completed</span>
              <button onClick={() => setCompleted([...completed, ""])} style={ADD_BTN}>+ Add</button>
            </div>
            {completed.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input style={INPUT} value={c || ""} placeholder="A recently completed milestone" onChange={(e) => { const a = [...completed]; a[i] = e.target.value; setCompleted(a); }} />
                <button onClick={() => { const a = [...completed]; a.splice(i, 1); setCompleted(a); }} title="Remove" style={DEL_BTN}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}><TA label="What must happen next" value={st.closing} onChange={(v) => setContent(k, "stage", { closing: v })} /></div>
        </EditorSection>

        <EditorSection title="Technical intelligence" hint="The four intelligence cards. A card appears on the profile only when it has content." filled={filled.tech} open={openSec === "tech"} onToggle={() => toggle("tech")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {TECH_CARDS.map((cfg) => (
              <TechCardEditor key={cfg.kind} cfg={cfg} card={cards.find((c) => c.kind === cfg.kind)} onPatch={(patch) => setCard(k, cfg.kind, patch)} />
            ))}
          </div>
        </EditorSection>

        <EditorSection title="What sets this project apart" hint="The Final Synthesis sheet on the investor profile." filled={filled.unique} open={openSec === "unique"} onToggle={() => toggle("unique")}>
          <TA label="Main synthesis" value={uq.summary} onChange={(v) => setContent(k, "unique", { summary: v })} />
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ ...LABEL, marginBottom: 0 }}>Key differentiators</span>
              <button onClick={() => setContent(k, "unique", { diffs: [...diffs, { h: "", t: "", fact: "" }] })} style={ADD_BTN}>+ Add</button>
            </div>
            {diffs.map((d, i) => (
              <div key={i} style={{ ...CARD, background: "#fafcff" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <input style={{ ...INPUT, flex: 1, fontWeight: 700 }} value={d.h || ""} placeholder="Title" onChange={(e) => { const a = diffs.map((x) => ({ ...x })); a[i].h = e.target.value; setContent(k, "unique", { diffs: a }); }} />
                  <input style={{ ...INPUT, width: 170, flexShrink: 0 }} value={d.fact || ""} placeholder="Highlight / stat (optional)" onChange={(e) => { const a = diffs.map((x) => ({ ...x })); a[i].fact = e.target.value; setContent(k, "unique", { diffs: a }); }} />
                  <button onClick={() => { const a = diffs.filter((_, j) => j !== i); setContent(k, "unique", { diffs: a }); }} title="Remove" style={DEL_BTN}>✕</button>
                </div>
                <Grow value={d.t} ph="Description" onChange={(v) => { const a = diffs.map((x) => ({ ...x })); a[i].t = v; setContent(k, "unique", { diffs: a }); }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ ...LABEL, marginBottom: 0 }}>Supporting evidence</span>
              <button onClick={() => setContent(k, "unique", { evidence: [...uqEvidence, ""] })} style={ADD_BTN}>+ Add</button>
            </div>
            {uqEvidence.map((e0, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input style={INPUT} value={e0 || ""} placeholder="A supporting fact" onChange={(e) => { const a = [...uqEvidence]; a[i] = e.target.value; setContent(k, "unique", { evidence: a }); }} />
                <button onClick={() => { const a = [...uqEvidence]; a.splice(i, 1); setContent(k, "unique", { evidence: a }); }} title="Remove" style={DEL_BTN}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}><TA label="Why it matters" value={uq.takeaway} onChange={(v) => setContent(k, "unique", { takeaway: v })} /></div>
        </EditorSection>

        <EditorSection title="Value drivers" hint="Three distinct investor-facing cards (bull / bear / next). Each shows only when it has text." filled={filled.drivers} open={openSec === "drivers"} onToggle={() => toggle("drivers")}>
          <div style={{ marginBottom: 12 }}><TA label="Bull case" value={sc.bull && sc.bull.text} onChange={(v) => setScenario("bull", v)} /></div>
          <div style={{ marginBottom: 12 }}><TA label="Bear case" value={sc.bear && sc.bear.text} onChange={(v) => setScenario("bear", v)} /></div>
          <div><TA label="Next validation point" value={sc.next && sc.next.text} onChange={(v) => setScenario("next", v)} /></div>
        </EditorSection>

        {/* Move between projects. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 14, borderTop: "1px solid #eef2f6" }}>
          <button onClick={() => goProj(-1)} disabled={idx === 0} style={{ ...navBtn, opacity: idx === 0 ? 0.4 : 1, cursor: idx === 0 ? "default" : "pointer" }}>← Previous</button>
          <span style={{ fontSize: 11.5, color: "#94a3b8" }}>Project {idx + 1} of {keys.length}</span>
          <button onClick={() => goProj(1)} disabled={idx === keys.length - 1} style={{ ...navBtn, opacity: idx === keys.length - 1 ? 0.4 : 1, cursor: idx === keys.length - 1 ? "default" : "pointer" }}>Next →</button>
        </div>
      </section>
    );
  })() }];
  const timelineSteps = [{ key: "timeline", title: "Timeline & updates", fields: [], node: (
    <section>
      <SecHead title="Timeline / updates" onAdd={addEntry} />
      {flatTL().length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>No updates yet.</div>}
      {flatTL().map((e, i) => (
        <div key={i} data-entry={e.id || i} style={CARD}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <input type="date" style={{ ...INPUT, width: 160 }} value={(String(e.id || "").match(/^\d{4}-\d{2}-\d{2}/) || [""])[0]} onChange={(ev) => setEntry(i, { id: ev.target.value })} />
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#475569", cursor: "pointer" }}>
              <input type="checkbox" checked={!!e.key} onChange={(ev) => setEntry(i, { key: ev.target.checked })} /> Key
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={() => { if (window.confirm("Remove this update?")) setEntry(i, null); }} title="Remove" style={DEL_BTN}>✕</button>
          </div>
          <input style={{ ...INPUT, fontWeight: 700, marginBottom: 8 }} value={e.headline || ""} placeholder="Headline" onChange={(ev) => setEntry(i, { headline: ev.target.value })} />
          <div style={{ marginBottom: 8 }}><Grow value={e.why} onChange={(v) => setEntry(i, { why: v })} ph="Why it matters" /></div>
          <Grow value={e.whatHappened} onChange={(v) => setEntry(i, { whatHappened: v })} ph="What happened (full text)" min={90} />
        </div>
      ))}
    </section>
  ) }];

  const capital = pp.CAP || {}; const cs = pp.CAPSTATUS || {}; const fund = pp.FUNDING || {};
  const capitalSteps = [
    { key: "shares", title: "Share structure", fields: [], node: (
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={SECTION_TITLE}>Share structure</span>
        <div style={{ display: "flex", gap: 12 }}>
          <F label="Outstanding" value={capital.outstanding} onChange={(v) => setCap({ outstanding: v })} />
          <F label="Fully diluted" value={capital.fd} onChange={(v) => setCap({ fd: v })} />
        </div>
        <F label="Debt" value={capital.debt} onChange={(v) => setCap({ debt: v })} />
        <div>
          <SecHead title="Capital rows" onAdd={addCapRow} />
          {(capital.rows || []).map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
              <div style={{ flex: 1.4 }}><span style={{ ...LABEL, fontSize: 9.5 }}>Item</span><input style={INPUT} value={r.sec || ""} onChange={(e) => setCapRow(i, { sec: e.target.value })} /></div>
              <div style={{ flex: 1 }}><span style={{ ...LABEL, fontSize: 9.5 }}>Detail</span><input style={INPUT} value={r.det || ""} onChange={(e) => setCapRow(i, { det: e.target.value })} /></div>
              <div style={{ width: 110 }}><span style={{ ...LABEL, fontSize: 9.5 }}>Qty</span><input style={INPUT} value={r.qty || ""} onChange={(e) => setCapRow(i, { qty: e.target.value })} /></div>
              <button onClick={() => setCapRow(i, null)} title="Remove" style={DEL_BTN}>✕</button>
            </div>
          ))}
        </div>
      </section>
    ) },
    { key: "funding", title: "Funding status", fields: [], node: (
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={SECTION_TITLE}>Funding status</span>
        <F label="Headline" value={cs.headline} onChange={(v) => setCapStatus({ headline: v })} />
        <TA label="Summary" rows={2} value={cs.summary} onChange={(v) => setCapStatus({ summary: v })} />
        <div style={{ display: "flex", gap: 12 }}>
          <F label="State" value={cs.state} onChange={(v) => setCapStatus({ state: v })} ph="Fully Funded" />
          {/* The capital card shows ONE runway fact (the end of the funded period) since the
              slider was removed; it reads runwayEnd, falling back to the older runwayRight.
              This used to edit "Runway left", which the card no longer displays at all. */}
          <F label="Funding runway" value={cs.runwayEnd || cs.runwayRight || ""}
            onChange={(v) => setCapStatus({ runwayEnd: v })} ph="e.g. Through 2026" />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#475569" }}>
          <input type="checkbox" checked={!!cs.funded} onChange={(e) => setCapStatus({ funded: e.target.checked })} /> Fully funded
        </label>
        <F label="Funding note" value={fund.note} onChange={(v) => setFunding({ note: v })} />
      </section>
    ) },
    { key: "ownership", title: "Ownership", fields: [], node: (
      <section>
        <SecHead title="Ownership" onAdd={addOwn} />
        {(pp.OWNERSHIP || []).map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}><span style={{ ...LABEL, fontSize: 9.5 }}>Label</span><input style={INPUT} value={r[0] || ""} onChange={(e) => setOwn(i, [e.target.value, r[1] || ""])} /></div>
            <div style={{ width: 120 }}><span style={{ ...LABEL, fontSize: 9.5 }}>Value</span><input style={INPUT} value={r[1] || ""} onChange={(e) => setOwn(i, [r[0] || "", e.target.value])} /></div>
            <button onClick={() => setOwn(i, null)} title="Remove" style={DEL_BTN}>✕</button>
          </div>
        ))}
      </section>
    ) },
  ];

  const teamSteps = [{ key: "team", title: "Team & leadership", fields: [], node: (
    <section>
      <SecHead title="Team / Leadership" onAdd={addMember} />
      {(pp.TEAM_MEMBERS || []).length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>No team members yet.</div>}
      {(pp.TEAM_MEMBERS || []).map((m, i) => (
        <div key={i} data-member={i} style={CARD}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <label style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 999, cursor: "pointer", overflow: "hidden", border: "1px dashed #cbd5e1", display: "grid", placeItems: "center", backgroundImage: m.photo ? `url("${m.photo}")` : "none", backgroundSize: "cover", backgroundPosition: "center", color: "#94a3b8", fontSize: 11, fontWeight: 700 }}>
              {busyImg === "team-" + i ? "…" : (!m.photo && (m.initials || "＋"))}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) upload("team-" + i, f, (u) => setMember(i, { photo: u })); e.target.value = ""; }} />
            </label>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <input style={{ ...INPUT, fontWeight: 700 }} value={m.name || ""} placeholder="Name" onChange={(e) => setMember(i, { name: e.target.value })} />
              <input style={INPUT} value={m.role || ""} placeholder="Role / title" onChange={(e) => setMember(i, { role: e.target.value })} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
              <button onClick={() => moveMember(i, -1)} disabled={i === 0} title="Move up"
                style={{ ...ORDER_BTN, opacity: i === 0 ? 0.3 : 1, cursor: i === 0 ? "default" : "pointer" }}>↑</button>
              <button onClick={() => moveMember(i, 1)} disabled={i === (pp.TEAM_MEMBERS || []).length - 1} title="Move down"
                style={{ ...ORDER_BTN, opacity: i === (pp.TEAM_MEMBERS || []).length - 1 ? 0.3 : 1, cursor: i === (pp.TEAM_MEMBERS || []).length - 1 ? "default" : "pointer" }}>↓</button>
            </div>
            <button onClick={() => { if (window.confirm("Remove this member?")) setMember(i, null); }} title="Remove" style={DEL_BTN}>✕</button>
          </div>
          <div style={{ marginTop: 8 }}><span style={{ ...LABEL, fontSize: 9.5 }}>Short bio</span><input style={INPUT} value={m.short || ""} onChange={(e) => setMember(i, { short: e.target.value })} /></div>
          <div style={{ marginTop: 8 }}><span style={{ ...LABEL, fontSize: 9.5 }}>Full bio</span><Grow value={m.full} onChange={(v) => setMember(i, { full: v })} /></div>
        </div>
      ))}
    </section>
  ) }];

  const STEPS = { overview: overviewSteps, projects: projectsSteps, timeline: timelineSteps, capital: capitalSteps, team: teamSteps };
  // BASIC companies edit only Overview + Timeline; PRO (and unknown) edit everything.
  const visibleTabs = tier === "basic" ? TABS.filter((t) => t.key === "overview" || t.key === "timeline") : TABS;
  const steps = STEPS[activeTab] || [];
  const step = Math.min(activeStep, Math.max(0, steps.length - 1));
  const cur = steps[step] || { node: null, title: "" };
  // Flatten every visible tab's steps into ONE sequence so Next/Previous flow across tabs.
  const flatSteps = visibleTabs.flatMap((t) => (STEPS[t.key] || []).map((s, i) => ({ tabKey: t.key, stepIndex: i, title: s.title })));
  const flatPos = Math.max(0, flatSteps.findIndex((f) => f.tabKey === activeTab && f.stepIndex === step));
  const atStart = flatPos <= 0, atEnd = flatPos >= flatSteps.length - 1;
  const goSeq = (pos) => { const d = flatSteps[pos]; if (d) setNav(d.tabKey, d.stepIndex); };
  const sectionLabel = (visibleTabs.find((t) => t.key === activeTab) || {}).label || "";

  // One-line description per sub-section (presentation only).
  const STEP_DESC = {
    images: "The logo and status image investors see on your MineEx profile card.",
    details: "The core information investors see across the top of your profile.",
    brief: "The AI Brief card investors read first.",
    projects: "Your projects — the flagship shows first on your profile.",
    timeline: "Milestones and updates shown on your profile timeline.",
    shares: "Share structure and capital rows.",
    funding: "Funding status shown to investors.",
    ownership: "Ownership breakdown shown on your profile.",
    team: "The leadership and team shown on your profile.",
  };
  // Honest "has content" completion — only ticks a section that actually holds data.
  const stepDone = (sk) => {
    try {
      if (sk === "images") return !!(pp.AVATAR || pp.LOGO) && !!(pp.STATUS_IMG || pp.SITE_PHOTO);
      if (sk === "details") return !!(co.name);
      if (sk === "brief") return (pp.BRIEF_SECTIONS || []).length > 0;
      if (sk === "projects") return Object.keys(pp.PROJECTS_DATA || {}).length > 0;
      if (sk === "timeline") return (pp.PR_YEARS || []).some((y) => (y.items || []).length);
      if (sk === "shares") return !!(pp.CAP && Object.keys(pp.CAP).length);
      if (sk === "funding") return !!(pp.CAPSTATUS && (pp.CAPSTATUS.headline || pp.CAPSTATUS.state));
      if (sk === "ownership") return (pp.OWNERSHIP || []).length > 0;
      if (sk === "team") return (pp.TEAM_MEMBERS || []).length > 0;
    } catch (_) {}
    return false;
  };
  const goto = (tabKey, stepIndex) => setNav(tabKey, stepIndex);

  return (
    <div style={{ display: "flex", height: "100%", background: "#fff" }}>
      <style>{`
        .ed-scroll > section { background:transparent; border:none; box-shadow:none; padding:0; width:100%; max-width:800px; box-sizing:border-box; }
        .ed-scroll input:focus, .ed-scroll textarea:focus, .ed-scroll select:focus { border-color:#94a3b8 !important; box-shadow:0 0 0 3px rgba(15,23,42,.06) !important; }
        .ed-nav { appearance:none; border:none; background:none; width:100%; text-align:left; cursor:pointer; border-radius:9px; transition:background .12s ease,color .12s ease; }
        .ed-navsub:hover { background:#f1f5f9; }
      `}</style>

      {/* LEFT — section navigator. Rendered here only when standalone; when the Portal drives
          navigation from its sidebar (controlledNav) this is hidden to avoid a second menu. */}
      {!controlledNav && (
      <nav style={{ width: 244, flexShrink: 0, borderRight: "1px solid #eef2f7", background: "#fbfcfe", overflow: "auto", padding: "20px 12px 24px" }}>
        <div style={{ padding: "0 8px", fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "#94a3b8" }}>Company profile</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
          {visibleTabs.map((t) => {
            const tSteps = STEPS[t.key] || [];
            const multi = tSteps.length > 1;
            const tabActive = activeTab === t.key;
            const headerActive = tabActive && (!multi);
            return (
              <div key={t.key} style={{ marginTop: 8 }}>
                <button className="ed-nav" onClick={() => goto(t.key, 0)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                    fontSize: 13.5, fontWeight: 600,
                    color: tabActive ? "#0f172a" : "#334155", background: headerActive ? "#eef1f5" : "transparent" }}>
                  <span style={{ flex: 1 }}>{t.label}</span>
                </button>
                {multi && (
                  <div style={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                    {tSteps.map((s, i) => {
                      const on = tabActive && step === i;
                      return (
                        <button key={s.key} className="ed-nav ed-navsub" onClick={() => goto(t.key, i)}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px 6px 22px",
                            fontSize: 12.5, fontWeight: on ? 600 : 500, color: on ? "#0f172a" : "#64748b",
                            background: on ? "#eef1f5" : "transparent" }}>
                          <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
      )}

      {/* CENTER — the editor form (primary focus) */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* header: breadcrumb + heading + Save / Hide preview */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, maxWidth: 832, padding: "22px 32px 16px", flexShrink: 0, borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#94a3b8" }}>{sectionLabel}{cur.title ? ` · ${cur.title}` : ""}</div>
            <h2 style={{ margin: "3px 0 0", fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: "#0f172a" }}>{cur.title}</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b", maxWidth: 560 }}>{STEP_DESC[cur.key] || ""}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {/* Phase 6B: unmistakable "this is live" cue — a published profile's Save is instantly public. */}
            {company && company.status === "published" && (
              <span title="This profile is live on MineEx. Saved changes appear immediately." style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "#ecfdf5", color: "#047857", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: "#10b981" }} /> Live — changes publish immediately
              </span>
            )}
            <button onClick={() => setShowPreview((v) => !v)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              {showPreview ? "Hide preview" : "Show preview"}
            </button>
            <button onClick={doSave} disabled={save === "saving"}
              style={{ background: save === "saved" ? "#eef1f4" : "#0f172a", color: save === "saved" ? "#0f172a" : "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontSize: 13.5, fontWeight: 700, cursor: save === "saving" ? "default" : "pointer" }}>
              {save === "saving" ? "Saving…" : save === "saved" ? "Saved ✓" : save === "error" ? "Retry" : (company && company.status === "published" ? "Save changes" : "Save")}
            </button>
          </div>
        </div>

        {/* scrolling form — constrained to a comfortable reading width, aligned left */}
        <div key={activeTab + "-" + step} ref={scrollWrapRef} onFocusCapture={onEditorFocus} className="ed-scroll" style={{ flex: 1, overflow: "auto", padding: "24px 32px 40px", display: "flex", flexDirection: "column", gap: 30 }}>
          {cur.node}
        </div>

        {/* Prev / Next — restrained, labelled with the real section names */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 832, padding: "14px 32px", borderTop: "1px solid #f1f5f9", background: "#fff", flexShrink: 0 }}>
          <button onClick={() => goSeq(flatPos - 1)} disabled={atStart}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "none", background: "transparent", color: "#475569", fontSize: 13, fontWeight: 600, cursor: atStart ? "default" : "pointer", opacity: atStart ? 0.3 : 1, maxWidth: "45%" }}>
            <ArrowLeft size={15} className="shrink-0" /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{atStart ? "Previous" : flatSteps[flatPos - 1].title}</span>
          </button>
          <button onClick={() => goSeq(flatPos + 1)} disabled={atEnd}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#0f172a", fontSize: 13, fontWeight: 600, cursor: atEnd ? "default" : "pointer", opacity: atEnd ? 0.3 : 1, maxWidth: "45%" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{atEnd ? "Next" : flatSteps[flatPos + 1].title}</span> <ArrowRight size={15} className="shrink-0" />
          </button>
        </div>
      </div>

      {/* RIGHT — live phone preview (sticky column). Kept verbatim: same AppPreview, popupEl,
          click-to-edit routing and data bindings — only its placement changed. */}
      {showPreview && (
        <div style={{ flexShrink: 0, borderLeft: "1px solid #eef2f7", background: "#f6f8fb", padding: "24px 20px", display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 16, overflow: "hidden" }}>
          <div ref={previewRef} onClickCapture={handlePreviewClick} style={{ width: 372, height: 806, maxHeight: "calc(100vh - 48px)", aspectRatio: "393 / 852", background: "#fff", borderRadius: 42,
            overflow: "hidden", border: "1px solid #e9eef5", boxShadow: "0 40px 90px -30px rgba(15,23,42,0.4)", transform: "translateZ(0)", flexShrink: 0 }}>
            <AppPreview pp={debPp} popupEl={popupEl} tab={activeTab} tier={tier}
              onTab={(t) => { lastTabRef.current = t; setNav(PROFILE_TO_EDITOR[t] || "overview", 0); }} />
          </div>
          <div style={{ width: popupActive ? 360 : 0, height: 806, maxHeight: "calc(100vh - 48px)", flexShrink: 0, overflow: "hidden", transition: "width .32s cubic-bezier(0.16,1,0.3,1)" }}>
            <div onClickCapture={handlePreviewClick} style={{ position: "relative", width: 360, height: "100%", borderRadius: 30, overflow: "hidden",
              border: popupActive ? "1px solid #e9eef5" : "none", background: popupActive ? "#fff" : "transparent", boxShadow: popupActive ? "0 40px 90px -30px rgba(15,23,42,0.35)" : "none" }}>
              <div ref={setPopupEl} style={{ position: "absolute", inset: 0 }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
