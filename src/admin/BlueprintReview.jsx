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
import { Image as ImageIcon, QrCode, UploadCloud, Sparkles, Plus, X, Star, ChevronUp, ChevronDown } from "lucide-react";
import { parseImport, applyImport } from "../lib/profileImport.js";
import { promptForPass, CONFERENCE_PROMPT, CONFERENCE_SECTIONS, conferenceSectionPrompt } from "./promptTemplate.js";
import { updateCompany, createCompany } from "../lib/supabase.js";
import { mapProfileToPP } from "../lib/profileToPP.js";
import { authHeaders } from "../lib/auth.js";
import { saveProfileSafely, isProtectedSlug } from "../lib/profileSafety.js";
import { listVersions, restoreVersion } from "../lib/profileVersions.js";
import { flushProfileAssets } from "../lib/storage.js";
import { CONF_WIDGET_POOLS, widgetPool } from "../lib/conferenceWidgets.js";

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
// Catches any render crash in the template (e.g. an unexpected extraction shape) and shows
// a message instead of whiting out the whole admin page. Resets when a new company/profile
// is loaded (via the `resetKey` prop → key remount).
class TemplateBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (this.state.err) {
      return (
        <div className="mx-auto max-w-[1080px] px-8 py-10">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-[14px] text-rose-800">
            <div className="text-[16px] font-extrabold">This page couldn’t render the last data you loaded.</div>
            <p className="mt-2">One of the fields came back in an unexpected shape. Your data isn’t lost — press <b>Undo</b> (top of the page) to revert that load, or reload the page to get back to your saved state, then re-run that section.</p>
            <p className="mt-2 font-mono text-[12px] text-rose-600">{String(this.state.err && this.state.err.message || this.state.err)}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Coerce any value to a renderable string. Extraction can return an object/array where a
// scalar was expected (e.g. capital.financing as [{amount,type,date}]); rendering that
// object as a React child throws "Objects are not valid as a React child" and whites out
// the page. This makes every field render-safe.
function toText(v) {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(" · ");
  if (typeof v === "object") {
    const pick = [v.amount, v.v, v.value, v.type, v.date, v.d, v.label, v.name].filter((x) => x != null && x !== "");
    if (pick.length) return pick.map(toText).join(" · ");
    return Object.values(v).map(toText).filter(Boolean).join(" · ");
  }
  return String(v);
}

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
        <p className={`mt-3 whitespace-pre-line text-slate-800 ${big ? "text-[16px] leading-relaxed" : "text-[15px] leading-relaxed"}`}>{toText(value)}</p>
      )}
    </div>
  );
}

// Editable single-value field (hero phrases, takeaways). Same card look as Field, but the value
// is an input/textarea wired to onChange. Shows the auto/current value; type to override.
function EditField({ title, help, value, onChange, big, placeholder }) {
  const empty = isEmpty(value);
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${empty ? "border-slate-200/70" : "border-emerald-300 ring-1 ring-emerald-100"}`}>
      <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
      {help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{help}</p>}
      {big ? (
        <textarea value={toText(value)} onChange={(e) => onChange(e.target.value)} rows={2} placeholder={placeholder || "Enter…"}
          className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] leading-relaxed text-slate-900 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 placeholder:italic placeholder:text-slate-300" />
      ) : (
        <input value={toText(value)} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "Enter…"}
          className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[16px] font-bold text-slate-900 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 placeholder:font-normal placeholder:italic placeholder:text-slate-300" />
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
              <div className={`mt-1 text-[16px] font-extrabold ${empty ? "italic text-slate-300" : "text-slate-900"}`}>{empty ? "—" : toText(it.value)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The widget candidate pool for a conference page. Renders the FULL ordered pool from the
// shared catalog (CONF_WIDGET_POOLS[page]). Each candidate shows:
//   • an include checkbox → writes conference.<page>.selectedWidgetKeys (which widgets the
//     booth renders, and in what order). Deselecting NEVER deletes the value.
//   • an inline value input → writes conference.<page>.widgets[key] (manual entry / override).
// `auto` is a { key: value } map the caller resolves from the shared profile; it's shown as the
// live fallback so the reviewer can see what the booth would auto-derive, and enter a value only
// where extraction came up empty. When no selection is stored yet, everything with a value is
// treated as "on" (matching the renderer's un-curated fallback).
function WidgetPool({ page, conf, auto = {}, setVal }) {
  const custom = Array.isArray(conf && conf[`${page}CustomWidgets`]) ? conf[`${page}CustomWidgets`] : [];
  const pool = widgetPool(page, conf);           // fixed catalog + reviewer-added custom widgets
  const customKeys = new Set(custom.map((w) => w && w.key));
  const store = (conf && conf[`${page}Widgets`]) || {};
  const valueOf = (k) => (isEmpty(store[k]) ? auto[k] : store[k]);
  const rawSel = conf && conf[`${page}WidgetKeys`];
  const storedSel = Array.isArray(rawSel) ? rawSel : null;
  const isOn = (k) => (storedSel ? storedSel.includes(k) : !isEmpty(valueOf(k)));
  const shownCount = pool.filter((w) => isOn(w.key)).length;
  const setSel = (keys) => setVal(`conference.${page}WidgetKeys`, keys);
  const toggle = (k) => {
    // Materialize the current effective selection, then flip this key. Once the reviewer
    // touches selection it becomes explicit (stored), so future auto-values don't silently
    // reappear on the booth.
    const base = storedSel ? storedSel.slice() : pool.filter((w) => !isEmpty(valueOf(w.key))).map((w) => w.key);
    const i = base.indexOf(k);
    if (i >= 0) base.splice(i, 1);
    else base.push(k); // append → new picks land at the end of the render order
    setSel(base);
  };
  // Add a blank custom widget (its own header + subtext), shown on the booth by default.
  const addWidget = () => {
    const nextId = `custom-${(custom.reduce((m, w) => Math.max(m, Number(String(w.key).replace(/\D/g, "")) || 0), 0)) + 1}`;
    setVal(`conference.${page}CustomWidgets`, [...custom, { key: nextId, label: "" }]);
    const base = storedSel ? storedSel.slice() : pool.filter((w) => !isEmpty(valueOf(w.key))).map((w) => w.key);
    setSel([...base, nextId]);
  };
  const setCustomLabel = (key, label) => setVal(`conference.${page}CustomWidgets`, custom.map((w) => (w.key === key ? { ...w, label } : w)));
  const removeWidget = (key) => {
    setVal(`conference.${page}CustomWidgets`, custom.filter((w) => w.key !== key));
    if (storedSel) setSel(storedSel.filter((k) => k !== key));
    if (!isEmpty(store[key])) setVal(`conference.${page}Widgets.${key}`, "");
  };
  const anyFilled = pool.some((w) => !isEmpty(valueOf(w.key)));
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${anyFilled ? "border-emerald-300 ring-1 ring-emerald-100" : "border-slate-200/70"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold text-slate-900">Widgets</h3>
        <span className="text-[11px] font-semibold text-slate-400">{shownCount} shown · {pool.length} options</span>
      </div>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">
        Each stat is its own widget. Check the ones to show on the booth; type a value where AI found nothing.
      </p>
      {/* Same compact stat-card grid as the rest of the Blueprint — each card just gains a show
          toggle and an inline-editable value (borderless so it reads like the value until focused). */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {pool.map((w) => {
          const val = valueOf(w.key);
          const empty = isEmpty(val);
          const on = isOn(w.key);
          const overridden = !isEmpty(store[w.key]);
          const isCustom = customKeys.has(w.key);
          return (
            <div key={w.key} className={`rounded-xl px-4 py-3.5 transition-opacity ${on ? "bg-slate-50" : "bg-slate-50/50 opacity-55"} ${isCustom ? "ring-1 ring-inset ring-slate-200" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                {isCustom ? (
                  <input
                    value={toText(w.label)}
                    onChange={(e) => setCustomLabel(w.key, e.target.value)}
                    placeholder="HEADER"
                    className="min-w-0 flex-1 rounded bg-transparent text-[11px] font-bold uppercase tracking-wide text-slate-500 outline-none focus:bg-white focus:px-1.5 focus:py-0.5 focus:ring-1 focus:ring-emerald-200 placeholder:text-slate-300"
                  />
                ) : (
                  <div className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-slate-400" title={w.label}>{w.label}</div>
                )}
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {overridden && !isCustom && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Manually entered / overrides the auto value" />}
                  {isCustom && <button type="button" onClick={() => removeWidget(w.key)} className="text-slate-300 hover:text-rose-500" title="Remove this widget"><X size={13} /></button>}
                  <input type="checkbox" checked={on} onChange={() => toggle(w.key)} className="h-3.5 w-3.5 accent-emerald-600" title={on ? "Shown on the booth" : "Hidden"} />
                </div>
              </div>
              <input
                value={toText(val)}
                onChange={(e) => setVal(`conference.${page}Widgets.${w.key}`, e.target.value)}
                placeholder={empty ? (isCustom ? "Subtext…" : "—") : ""}
                className={`mt-1 w-full rounded-md bg-transparent text-[16px] font-extrabold text-slate-900 outline-none focus:bg-white focus:px-2 focus:py-1 focus:ring-1 focus:ring-emerald-200 ${empty ? "placeholder:font-extrabold placeholder:text-slate-300" : ""}`}
              />
            </div>
          );
        })}
        {/* Add a reviewer-authored widget with its own header + subtext. */}
        <button type="button" onClick={addWidget}
          className="flex min-h-[64px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-3.5 text-[13px] font-bold text-slate-400 transition-colors hover:border-emerald-400 hover:bg-emerald-50/40 hover:text-emerald-600">
          <Plus size={15} /> Add widget
        </button>
      </div>
    </div>
  );
}

// Per-project widget pool. Same select/manual-enter model as WidgetPool, but the fixed project
// candidate pool and storage are scoped to one stable project key, in a conference-isolated
// layer: conference.projectWidgets[projectKey] / projectWidgetKeys[projectKey]. Written only by
// reviewer edits (never by pasted passes), so extracting projects one-at-a-time never clobbers.
function ProjectWidgetPool({ projectKey, auto = {}, conf, setVal }) {
  const pool = CONF_WIDGET_POOLS.project || [];
  const store = (conf && conf.projectWidgets && conf.projectWidgets[projectKey]) || {};
  const valueOf = (k) => (isEmpty(store[k]) ? auto[k] : store[k]);
  const rawSel = conf && conf.projectWidgetKeys && conf.projectWidgetKeys[projectKey];
  const storedSel = Array.isArray(rawSel) ? rawSel : null;
  const isOn = (k) => (storedSel ? storedSel.includes(k) : !isEmpty(valueOf(k)));
  const shownCount = pool.filter((w) => isOn(w.key)).length;
  const toggle = (k) => {
    const base = storedSel ? storedSel.slice() : pool.filter((w) => !isEmpty(valueOf(w.key))).map((w) => w.key);
    const i = base.indexOf(k); if (i >= 0) base.splice(i, 1); else base.push(k);
    setVal(`conference.projectWidgetKeys.${projectKey}`, base);
  };
  const anyFilled = pool.some((w) => !isEmpty(valueOf(w.key)));
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${anyFilled ? "border-emerald-300 ring-1 ring-emerald-100" : "border-slate-200/70"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[13px] font-bold text-slate-900">Project Widgets</h4>
        <span className="text-[11px] font-semibold text-slate-400">{shownCount} shown · {pool.length} options</span>
      </div>
      <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400">Check the badges to show on this project's scene; type a value where AI found nothing.</p>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {pool.map((w) => {
          const val = valueOf(w.key); const empty = isEmpty(val); const on = isOn(w.key);
          return (
            <div key={w.key} className={`rounded-xl px-3 py-2.5 transition-opacity ${on ? "bg-slate-50" : "bg-slate-50/50 opacity-55"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-[10.5px] font-bold uppercase tracking-wide text-slate-400" title={w.label}>{w.label}</div>
                <input type="checkbox" checked={on} onChange={() => toggle(w.key)} className="h-3.5 w-3.5 accent-emerald-600" title={on ? "Shown on the booth" : "Hidden"} />
              </div>
              <input value={toText(val)} onChange={(e) => setVal(`conference.projectWidgets.${projectKey}.${w.key}`, e.target.value)} placeholder={empty ? "—" : ""}
                className={`mt-1 w-full rounded-md bg-transparent text-[14px] font-extrabold text-slate-900 outline-none focus:bg-white focus:px-2 focus:py-1 focus:ring-1 focus:ring-emerald-200 ${empty ? "placeholder:font-extrabold placeholder:text-slate-300" : ""}`} />
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

// A curated pool of editable records for a CONFERENCE-OWNED array (highlights, investment
// reasons). Selection state travels ON each record — `selected` (default true) drives whether
// the booth shows it, `featured` marks the one hero item — so reordering never breaks it. Fields
// are edited in place; up/down reorder; ✕ removes; "+ Add" appends a blank. Writes the whole
// array back via setVal(path, next). Booth reads the same array and honors selected/featured.
function RecordPool({ title, help, path, records, fields, featureLabel, addLabel, setVal }) {
  const list = Array.isArray(records) ? records : [];
  const update = (next) => setVal(path, next);
  const setField = (i, name, v) => update(list.map((r, idx) => (idx === i ? { ...r, [name]: v } : r)));
  const toggle = (i) => update(list.map((r, idx) => (idx === i ? { ...r, selected: r.selected === false ? true : false } : r)));
  const feature = (i) => update(list.map((r, idx) => ({ ...r, featured: idx === i ? !r.featured : false })));
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= list.length) return; const c = list.slice(); const t = c[i]; c[i] = c[j]; c[j] = t; update(c); };
  const remove = (i) => update(list.filter((_, idx) => idx !== i));
  const add = () => update([...list, { selected: true }]);
  const shown = list.filter((r) => r.selected !== false).length;
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${list.length ? "border-emerald-300 ring-1 ring-emerald-100" : "border-slate-200/70"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
        <span className="text-[11px] font-semibold text-slate-400">{shown} shown · {list.length}</span>
      </div>
      {help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{help}</p>}
      <div className="mt-4 space-y-2.5">
        {list.map((r, i) => {
          const on = r.selected !== false;
          return (
            <div key={i} className={`rounded-xl border px-4 py-3 transition-opacity ${on ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-slate-50/50 opacity-55"}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  {fields.map((f) => (f.kind === "area" ? (
                    <textarea key={f.name} value={toText(r[f.name])} onChange={(e) => setField(i, f.name, e.target.value)} rows={2} placeholder={f.label}
                      className="w-full resize-y rounded-md bg-transparent text-[13px] leading-relaxed text-slate-600 outline-none focus:bg-white focus:px-2 focus:py-1 focus:ring-1 focus:ring-emerald-200 placeholder:text-slate-300" />
                  ) : (
                    <input key={f.name} value={toText(r[f.name])} onChange={(e) => setField(i, f.name, e.target.value)} placeholder={f.label}
                      className={`w-full rounded-md bg-transparent outline-none focus:bg-white focus:px-2 focus:py-1 focus:ring-1 focus:ring-emerald-200 ${f.strong ? "text-[15px] font-bold text-slate-900 placeholder:font-bold" : "text-[12.5px] font-semibold text-slate-500"} placeholder:text-slate-300`} />
                  )))}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button type="button" onClick={() => feature(i)} title={r.featured ? `Featured — ${featureLabel || "hero"}` : `Make ${featureLabel || "hero"}`} className={r.featured ? "text-amber-400" : "text-slate-300 hover:text-amber-400"}><Star size={15} fill={r.featured ? "currentColor" : "none"} /></button>
                  <div className="flex flex-col">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move up" className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp size={14} /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} title="Move down" className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown size={14} /></button>
                  </div>
                  <button type="button" onClick={() => remove(i)} title="Remove" className="text-slate-300 hover:text-rose-500"><X size={14} /></button>
                  <input type="checkbox" checked={on} onChange={() => toggle(i)} className="h-3.5 w-3.5 accent-emerald-600" title={on ? "Shown on the booth" : "Hidden"} />
                </div>
              </div>
            </div>
          );
        })}
        <button type="button" onClick={add} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-[13px] font-bold text-slate-400 transition-colors hover:border-emerald-400 hover:bg-emerald-50/40 hover:text-emerald-600"><Plus size={15} /> {addLabel || "Add"}</button>
      </div>
    </div>
  );
}

// Conference leadership selection over the SHARED team array. Never mutates `team` (that would
// change the app) — instead stores a conference-isolated layer: conference.leadership
// { featuredPersonId, selectedPersonIds, custom:[{key,name,role,short}] }. Team members are
// read-only cards you include/feature; "+ Add" creates a conference-only leader. No LinkedIn.
const personKey = (m, i) => (m && (m.id || m.key)) || `t-${String((m && m.name) || i).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
function LeadershipPool({ team, conf, setVal }) {
  const lead = (conf && conf.leadership) || {};
  const custom = Array.isArray(lead.custom) ? lead.custom : [];
  const storedSel = Array.isArray(lead.selectedPersonIds) ? lead.selectedPersonIds : null;
  const teamRows = (Array.isArray(team) ? team : []).map((m, i) => ({ key: personKey(m, i), name: m.name, role: m.role, bio: m.short || m.full, custom: false }));
  const customRows = custom.map((m) => ({ key: m.key, name: m.name, role: m.role, bio: m.short, custom: true }));
  const rows = [...teamRows, ...customRows];
  const isOn = (k) => (storedSel ? storedSel.includes(k) : true); // uncurated → show all
  const shown = rows.filter((r) => isOn(r.key)).length;
  const toggle = (k) => {
    const base = storedSel ? storedSel.slice() : rows.map((r) => r.key);
    const i = base.indexOf(k);
    if (i >= 0) base.splice(i, 1); else base.push(k);
    setVal("conference.leadership.selectedPersonIds", base);
  };
  const feature = (k) => setVal("conference.leadership.featuredPersonId", lead.featuredPersonId === k ? "" : k);
  const addLeader = () => {
    const nextId = `lead-${custom.reduce((m, w) => Math.max(m, Number(String(w.key).replace(/\D/g, "")) || 0), 0) + 1}`;
    setVal("conference.leadership.custom", [...custom, { key: nextId, name: "", role: "", short: "" }]);
    if (storedSel) setVal("conference.leadership.selectedPersonIds", [...storedSel, nextId]);
  };
  const setCustom = (key, patch) => setVal("conference.leadership.custom", custom.map((w) => (w.key === key ? { ...w, ...patch } : w)));
  const removeCustom = (key) => {
    setVal("conference.leadership.custom", custom.filter((w) => w.key !== key));
    if (storedSel) setVal("conference.leadership.selectedPersonIds", storedSel.filter((k) => k !== key));
  };
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${rows.length ? "border-emerald-300 ring-1 ring-emerald-100" : "border-slate-200/70"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold text-slate-900">Team</h3>
        <span className="text-[11px] font-semibold text-slate-400">{shown} shown · {rows.length}</span>
      </div>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">Check who appears on the booth; star the featured leader. Team bios come from the shared profile (edit those in the App Blueprint); add a conference-only person below.</p>
      <div className="mt-4 space-y-2.5">
        {rows.map((r) => {
          const on = isOn(r.key);
          const feat = lead.featuredPersonId === r.key;
          return (
            <div key={r.key} className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-opacity ${on ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-slate-50/50 opacity-55"}`}>
              <div className="min-w-0 flex-1">
                {r.custom ? (
                  <div className="space-y-1.5">
                    <input value={toText(r.name)} onChange={(e) => setCustom(r.key, { name: e.target.value })} placeholder="Full name" className="w-full rounded-md bg-transparent text-[15px] font-bold text-slate-900 outline-none focus:bg-white focus:px-2 focus:py-1 focus:ring-1 focus:ring-emerald-200 placeholder:font-bold placeholder:text-slate-300" />
                    <input value={toText(r.role)} onChange={(e) => setCustom(r.key, { role: e.target.value })} placeholder="Role / title" className="w-full rounded-md bg-transparent text-[12.5px] font-semibold text-slate-500 outline-none focus:bg-white focus:px-2 focus:py-1 focus:ring-1 focus:ring-emerald-200 placeholder:text-slate-300" />
                    <textarea value={toText(r.bio)} onChange={(e) => setCustom(r.key, { short: e.target.value })} rows={2} placeholder="Short bio / relevant experience" className="w-full resize-y rounded-md bg-transparent text-[13px] leading-relaxed text-slate-600 outline-none focus:bg-white focus:px-2 focus:py-1 focus:ring-1 focus:ring-emerald-200 placeholder:text-slate-300" />
                  </div>
                ) : (
                  <>
                    <div className="text-[15px] font-bold text-slate-900">{r.name || "—"}</div>
                    <div className="text-[12.5px] font-semibold text-slate-500">{r.role}</div>
                    {r.bio && <div className="mt-1 text-[13px] leading-relaxed text-slate-500">{r.bio}</div>}
                  </>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button type="button" onClick={() => feature(r.key)} title={feat ? "Featured leader" : "Make featured"} className={feat ? "text-amber-400" : "text-slate-300 hover:text-amber-400"}><Star size={15} fill={feat ? "currentColor" : "none"} /></button>
                {r.custom && <button type="button" onClick={() => removeCustom(r.key)} title="Remove" className="text-slate-300 hover:text-rose-500"><X size={14} /></button>}
                <input type="checkbox" checked={on} onChange={() => toggle(r.key)} className="h-3.5 w-3.5 accent-emerald-600" title={on ? "Shown on the booth" : "Hidden"} />
              </div>
            </div>
          );
        })}
        <button type="button" onClick={addLeader} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-[13px] font-bold text-slate-400 transition-colors hover:border-emerald-400 hover:bg-emerald-50/40 hover:text-emerald-600"><Plus size={15} /> Add leader</button>
      </div>
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

// Multi-image gallery uploader — drag & drop (or click) one or MANY images. Stores an array of
// { src } (data URLs until Save, then flushed to Storage). Add / remove / reorder. Wire with
// `images` (the array) + `onChange(nextArray)`.
function GallerySlot({ title, help, images, onChange, max = 12 }) {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const list = (Array.isArray(images) ? images : []).map((g) => (typeof g === "string" ? { src: g } : g)).filter((g) => g && g.src);
  const addFiles = async (files) => {
    const arr = Array.from(files || []).filter((f) => f && f.type && f.type.startsWith("image/"));
    if (!arr.length) return;
    setBusy(true);
    try {
      const next = list.slice();
      for (const f of arr) { if (next.length >= max) break; next.push({ src: await fileToScaledDataUrl(f, 1400) }); }
      onChange(next);
    } finally { setBusy(false); }
  };
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= list.length) return; const c = list.slice(); const t = c[i]; c[i] = c[j]; c[j] = t; onChange(c); };
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${list.length ? "border-emerald-300 ring-1 ring-emerald-100" : "border-slate-200/70"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
        <span className="text-[11px] font-semibold text-slate-400">{list.length}{max ? ` / ${max}` : ""}</span>
      </div>
      {help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{help}</p>}
      {list.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {list.map((g, i) => (
            <div key={i} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <img src={g.src} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move left" className="grid h-6 w-6 place-items-center rounded bg-white/90 text-slate-600 disabled:opacity-30"><ChevronUp size={13} style={{ transform: "rotate(-90deg)" }} /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} title="Move right" className="grid h-6 w-6 place-items-center rounded bg-white/90 text-slate-600 disabled:opacity-30"><ChevronDown size={13} style={{ transform: "rotate(-90deg)" }} /></button>
                </div>
                <button type="button" onClick={() => remove(i)} title="Remove" className="grid h-6 w-6 place-items-center rounded bg-white/90 text-rose-500 hover:bg-white"><X size={13} /></button>
              </div>
              {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Lead</span>}
            </div>
          ))}
        </div>
      )}
      <div
        onClick={() => inputRef.current && inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        className={`mt-3 flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed bg-slate-50/60 text-slate-400 ${drag ? "border-indigo-400 bg-indigo-50/60" : "border-slate-200 hover:border-slate-300"}`}
      >
        <UploadCloud size={22} strokeWidth={1.5} />
        <p className="text-[12.5px] font-semibold text-slate-400">{busy ? "Uploading…" : "Drag & drop images, or click to add"}</p>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
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
            <span key={i} className="rounded-full bg-slate-900 px-4 py-2 text-[13px] font-bold text-white">{toText(t)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Documents: upload the company's PDFs (extracts text) and copy that text for ChatGPT —
// all here, so the operator never has to leave this screen.
export function DocPanel({ companyId }) {
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

  // Download the text as a .txt FILE to ATTACH to ChatGPT — bypasses the paste-size limit,
  // so the full corpus (every doc, no stone unturned) can feed any section prompt.
  const download = async (ids, label) => {
    setBusy("Preparing file…"); setCopied("");
    try {
      const rows = await fetchDocsText(companyId, ids);
      const bundle = buildTextBundle(rows);
      if (!bundle.trim()) { setCopied("No readable text — those docs are image-only"); setTimeout(() => setCopied(""), 3500); return; }
      const url = URL.createObjectURL(new Blob([bundle], { type: "text/plain" }));
      const a = document.createElement("a"); a.href = url; a.download = "company-documents.txt";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCopied(`${label} downloaded · ${Math.round(bundle.length / 1000)}k chars — attach this file to ChatGPT`); setTimeout(() => setCopied(""), 5000);
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
              Copy all · {kfmt(totalChars)}
            </button>
            <button onClick={() => download(null, "All documents")} disabled={!!busy}
              title="Download the full corpus as a .txt file to ATTACH to ChatGPT (no paste-size limit)"
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[12.5px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
              ⬇ All as file (attach)
            </button>
            {groups.map((g) => (
              <button key={g.type} onClick={() => copy(g.ids, DOC_TYPE_LABELS[g.type] || g.type)} disabled={!!busy}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-600 hover:border-slate-400 disabled:opacity-50">{DOC_TYPE_LABELS[g.type] || g.type} · {kfmt(g.chars)}</button>
            ))}
            <button onClick={() => setShowList((v) => !v)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-700 hover:border-slate-400">{showList ? "Hide list" : "Pick documents…"}</button>
          </div>
          {totalChars > 250000 && <p className="mt-1 text-[11.5px] font-semibold text-rose-500">"All" is {kfmt(totalChars)} chars — too big to <b>paste</b> (~250k max). Use <b>⬇ All as file (attach)</b> to feed every doc, or pick the specific docs a page needs.</p>}

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

export default function BlueprintReview({ companies = [], onReload, mode = "conference" }) {
  const isApp = mode === "app";
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
  // Generic field setter (widget values, selection arrays) — same live-and-persist path as setImg.
  const setVal = (path, val) => { setProfile((pr) => setProfilePath(pr, path, val)); setDirty(true); setTouched(true); };
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

  // Download a small, focused prompt for ONE conference booth section.
  const downloadSectionPrompt = (id, label) => {
    const text = conferenceSectionPrompt(id);
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url; a.download = `conference-${id}-prompt.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setPromptCopied(label); setTimeout(() => setPromptCopied(""), 2500);
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
  // Create a brand-new blank company (not cloned) to build a Conference Mode from scratch. Prompts
  // for a name, derives the slug, and stores a minimal draft profile — everything empty, ready for
  // the section passes. Selects it so you can start building immediately.
  const [newState, setNewState] = useState("");
  const createNewCompany = async () => {
    const name = (window.prompt('New company name (e.g. "Acme Silver Corp"):') || "").trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) { setLoadMsg({ ok: false, text: "Couldn't derive a URL slug from that name — try letters/numbers." }); return; }
    setNewState("busy");
    try {
      const baseProfile = { company: { name }, conference: { enabled: true } };
      let pp; try { pp = mapProfileToPP(baseProfile); } catch { pp = undefined; }
      const created = await createCompany({ slug, name, profile: { ...baseProfile, ...(pp ? { pp } : {}) } }, await authHeaders());
      if (onReload) await onReload();
      setSlug(created?.slug || slug);
      setNewState("");
      setLoadMsg({ ok: true, text: `Created blank company "${created?.slug || slug}" (draft). Build its Conference Mode from scratch with the section passes below.` });
    } catch (e) {
      setNewState("");
      if (/409|duplicate|unique/i.test(e.message || "")) { setLoadMsg({ ok: false, text: `A company with slug "${slug}" already exists — pick a different name, or select it in the dropdown.` }); return; }
      setLoadMsg({ ok: false, text: e.message || "Create failed" });
    }
  };
  // Clone the selected company into a draft. `blank` wipes conference.* (hooks, widgets, hero
  // stats, galleries, selection — every booth-only layer) so you can run the new extraction into
  // an empty slate and judge the Blueprint's output. Shared app data (projects/capital/team) is
  // kept as scaffolding. Blank drafts land at <base>-conference-blank so they never collide with
  // a full clone at <base>-conference.
  const duplicateToDraft = async (blank = false) => {
    if (!company) return;
    setDupState("busy");
    try {
      const base = String(company.slug).replace(/-(conf|conference|draft|blank)(-\d+)?$/gi, "");
      const draftSlug = blank ? `${base}-conference-blank` : `${base}-conference`;
      const src = company.profile || {};
      // For a blank draft, reset the conference block to just { enabled } — this clears the old
      // schema AND all the new conference-namespaced layers in one move.
      const baseProfile = blank ? { ...src, conference: { enabled: true } } : { ...src };
      const cloneProfile = { ...baseProfile, pp: mapProfileToPP(baseProfile) };
      let created;
      try {
        created = await createCompany(
          { slug: draftSlug, name: `${company.name || base} (${blank ? "Conference Test — blank" : "Conference Draft"})`, primary_ticker: company.primary_ticker || null, profile: cloneProfile },
          await authHeaders()
        );
      } catch (e) {
        if (/409|duplicate|unique/i.test(e.message || "")) {
          if (onReload) await onReload();
          setSlug(draftSlug);
          setDupState("");
          setLoadMsg({ ok: true, text: `Draft "${draftSlug}" already exists — selected it.${blank ? " Click \"Reset conference\" to re-blank it before extracting." : ""}` });
          return;
        }
        throw e;
      }
      if (onReload) await onReload();
      setSlug(created?.slug || draftSlug);
      setDupState("done");
      setLoadMsg({ ok: true, text: `Created ${blank ? "BLANK test draft" : "draft"} "${created?.slug || draftSlug}"${blank ? " with an empty conference block — run the section passes to fill it" : ""}. Live ${base} app profile is untouched.` });
    } catch (e) { setDupState(""); setLoadMsg({ ok: false, text: e.message || "Duplicate failed" }); }
  };
  // Wipe conference.* on the working profile back to a clean slate (keeps shared app data). Not
  // persisted until Save. Use to re-blank a draft before re-testing extraction.
  const resetConference = () => {
    if (!company) return;
    if (!window.confirm("Clear ALL conference data on this profile (hooks, widgets, hero stats, galleries, highlights, selections) back to empty? Shared app data (projects/capital/team) is kept. Save afterwards to persist.")) return;
    setProfile((pr) => ({ ...pr, conference: { enabled: true } }));
    setDirty(true); setTouched(true);
    setLoadMsg({ ok: true, text: "Conference block cleared to empty. Run the section passes to repopulate, then Save." });
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

  // GUIDED EXTRACTION — the repeatable per-company flow. Each pass pairs the right documents
  // with the right prompt, and turns green once its data lands. Run top to bottom.
  const timelineFilled = Array.isArray(p.timeline) && p.timeline.length > 0;
  // "Done" means the pass actually produced its detail — not just that a name/clone exists.
  const companyExtracted = !!get(p, "company.name") && !!get(p, "company.commodity") && !!get(p, "company.jurisdiction");
  const projectsExtracted = projects.some((pr) => {
    const rows = get(pr, "drillResults.rows");
    return (Array.isArray(rows) && rows.length) || get(pr, "snapshot.depositType.value") || get(pr, "geology");
  });
  const extractionSteps = [
    { id: "p1", label: "Company", title: "1 · Company + Team", docs: "Attach: Financing doc + Management circular. Team bios → website team page or deck.", done: companyExtracted && team.length > 0 },
    { id: "p2", label: "Projects", title: "2 · Projects", docs: "Attach: Technical report(s). Needs deposit type / geology / drill results per project.", done: projectsExtracted },
    { id: "p3", label: "Timeline", title: "3 · Timeline", docs: "Attach: Press releases, in batches. Entries merge + dedupe.", done: timelineFilled },
    { id: "conference", label: "Conference", title: "4 · Conference narrative", docs: "No documents — click Copy profile JSON, paste it with the Conference prompt.", done: !!(conf.hook || conf.overview) },
  ];
  const stepsDone = extractionSteps.filter((s) => s.done).length;
  // Per-booth-section status for the Conference "build page by page" checklist.
  const anyProj = (fn) => projects.some((pr) => fn(pr));
  const confSectionDone = {
    overview: !!(conf.hook || conf.overview),
    highlights: Array.isArray(conf.highlights) && conf.highlights.length > 0,
    jurisdiction: !!(get(p, "company.jurisdiction") || conf.region || conf.districtContext),
    projects: anyProj((pr) => (Array.isArray(pr.narrative) && pr.narrative.length) || get(pr, "snapshot.depositType.value") || get(pr, "snapshot.depositType") || pr.geology),
    results: anyProj((pr) => { const r = get(pr, "drillResults.rows"); return Array.isArray(r) && r.length; }) || !!conf.resultsIntro,
    milestones: (Array.isArray(conf.featuredMilestoneDates) && conf.featuredMilestoneDates.length > 0) || timelineFilled,
    capital: !!(conf.capitalIntro || get(p, "capital.cash")),
    leadership: team.length > 0,
    why: Array.isArray(conf.investmentCase) && conf.investmentCase.length > 0,
  };
  const confDoneCount = CONFERENCE_SECTIONS.filter((s) => confSectionDone[s.id]).length;
  const boothGaps = [
    team.length === 0 && "Team / Leadership",
    !firstOf(get(p, "brand.logo"), get(p, "brand.avatar")) && "Logo",
    !firstOf(get(p, "brand.hero"), get(p, "companyStatus.photo")) && "Hero image",
  ].filter(Boolean);
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
            <div className="text-[17px] font-extrabold tracking-tight text-slate-900">{isApp ? "App Blueprint" : "Conference Blueprint"}</div>
            <div className="text-[12px] text-slate-400">{isApp ? "The investor-app profile — review every field, then preview App Mode." : "The conference booth — review the narrative + data, then preview Conference Mode."}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select value={slug} onChange={(e) => setSlug(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13.5px] font-bold text-slate-700">
              <option value="">Select a company…</option>
              {sorted.map((c) => <option key={c.slug} value={c.slug}>{c.name || c.slug} — {c.slug}{c.status === "published" ? " · LIVE" : " · draft"}</option>)}
            </select>
            <button onClick={createNewCompany} disabled={newState === "busy"} title="Create a brand-new blank company and build its Conference Mode from scratch."
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-[13.5px] font-bold text-white hover:bg-slate-700 disabled:opacity-50">
              {newState === "busy" ? "Creating…" : "+ Create new"}
            </button>
            {company && (company.status === "published" || isProtectedSlug(company.slug)) && (
              <>
                <button onClick={() => duplicateToDraft(false)} disabled={dupState === "busy"}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-[13.5px] font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
                  {dupState === "busy" ? "Duplicating…" : "Duplicate to draft"}
                </button>
                <button onClick={() => duplicateToDraft(true)} disabled={dupState === "busy"} title="Clone to a draft with an EMPTY conference block — to test the Blueprint extraction from scratch."
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[13.5px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                  {dupState === "busy" ? "Duplicating…" : "Blank test draft"}
                </button>
              </>
            )}
            {company && !isApp && company.status !== "published" && !isProtectedSlug(company.slug) && (
              <button onClick={resetConference} title="Wipe conference.* on this draft back to empty (keeps shared app data)."
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[13.5px] font-bold text-rose-600 hover:bg-rose-100">
                Reset conference
              </button>
            )}
            {company && isApp && (
              <a href={`${PASSPORT_BASE}/app?c=${encodeURIComponent(slug)}${company.preview_token ? `&preview=${company.preview_token}` : ""}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-[13.5px] font-bold text-white hover:bg-indigo-700">
                Preview App Mode ↗
              </a>
            )}
            {company && !isApp && (
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

              {/* APP mode: the 4 broad passes. */}
              {isApp && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-extrabold uppercase tracking-wide text-slate-500">Extraction steps — run in order</span>
                  <span className={`text-[11.5px] font-bold ${stepsDone === 4 ? "text-emerald-600" : "text-slate-400"}`}>{stepsDone}/4 passes loaded</span>
                </div>
                <div className="mt-3 grid gap-2">
                  {extractionSteps.map((s, i) => (
                    <div key={s.id} className={`flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-2.5 ${s.done ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
                      <span className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-[12px] font-extrabold ${s.done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>{s.done ? "✓" : i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-bold text-slate-800">{s.title}</div>
                        <div className="text-[11.5px] leading-snug text-slate-500">{s.docs}</div>
                      </div>
                      {s.id === "conference" && (
                        <button onClick={copyProfileJson} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[12px] font-bold text-indigo-700 hover:bg-indigo-100">Copy profile JSON</button>
                      )}
                      <button onClick={() => downloadPrompt(s.id, s.label)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-slate-700">
                        {promptCopied === s.label ? "Downloaded ✓" : "Get prompt"}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 text-[11.5px]">
                  <span className="font-bold uppercase tracking-wide text-slate-500">Also needed for a full booth:</span>
                  {boothGaps.length === 0
                    ? <span className="font-semibold text-emerald-600">✓ Team, logo & hero all present</span>
                    : boothGaps.map((g) => <span key={g} className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">{g} — missing</span>)}
                </div>
                <p className="mt-2 text-[11.5px] text-slate-400">For each pass: <b>Get prompt</b> (downloads the .md) → new ChatGPT chat → attach it → paste the document text → send → paste the JSON reply below → <b>Load into template</b> → <b>Save</b>.</p>
              </div>
              )}

              {/* CONFERENCE mode: build the booth page by page. Upload docs once (below), then work
                  down this list — each is a small prompt that fills one page. */}
              {!isApp && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-extrabold uppercase tracking-wide text-slate-500">Build the booth — one page at a time</span>
                  <span className={`text-[11.5px] font-bold ${confDoneCount === CONFERENCE_SECTIONS.length ? "text-emerald-600" : "text-slate-400"}`}>{confDoneCount}/{CONFERENCE_SECTIONS.length} pages done</span>
                </div>
                <div className="mt-3 grid gap-2">
                  {CONFERENCE_SECTIONS.map((s) => {
                    const done = confSectionDone[s.id];
                    return (
                      <div key={s.id} className={`flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-2.5 ${done ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
                        <span className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-[12px] font-extrabold ${done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>{done ? "✓" : s.n}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-bold text-slate-800">{s.label}</div>
                          <div className="text-[11.5px] leading-snug text-slate-500">{s.docs}</div>
                        </div>
                        {s.useProfile && (
                          <button onClick={copyProfileJson} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[12px] font-bold text-indigo-700 hover:bg-indigo-100">Copy profile JSON</button>
                        )}
                        <button onClick={() => downloadSectionPrompt(s.id, s.label)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-slate-700">
                          {promptCopied === s.label ? "Downloaded ✓" : "Get prompt"}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[11.5px] text-slate-400 border-t border-slate-200 pt-3">Per page: <b>Get prompt</b> → new ChatGPT chat → attach it → attach/paste the document text (Copy text below) → send → paste the JSON reply into the box below → <b>Load into template</b> → <b>Save</b>. Work down the list, then <b>Preview Conference Mode</b>.</p>
              </div>
              )}

              {/* Documents — upload + copy text, right here. */}
              <div className="mt-4">
                <DocPanel companyId={company.id} />
              </div>

              <div className="mt-3">
                <button onClick={() => setShowInfo((v) => !v)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:border-slate-500 hover:text-slate-900">{showInfo ? "Hide the steps" : "📋 How to onboard a company — full steps"}</button>
              </div>

              {showInfo && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 text-[13px] leading-relaxed text-slate-600">
                  <div className="mb-2 text-[15px] font-extrabold text-slate-900">Onboard a company — the full playbook</div>

                  <div className="mt-3 text-[12px] font-extrabold uppercase tracking-wide text-slate-500">Step 1 · Set up</div>
                  <ol className="mt-1 list-decimal space-y-1 pl-5">
                    <li>Pick the company in the dropdown. <b>For a live/flagship company, click "Duplicate to draft" first</b> and work on the draft — never the live profile.</li>
                    <li>In <b>Documents</b>, drag in <b>all</b> the company's PDFs (deck, technical report, financials, news releases, circular).</li>
                  </ol>

                  <div className="mt-3 text-[12px] font-extrabold uppercase tracking-wide text-slate-500">Step 2 · Run the 4 passes in order (the checklist above)</div>
                  <p className="mt-1">For each pass: click <b>Get prompt</b> → new ChatGPT chat → <b>attach that .md file</b> (don't paste it) → click <b>Copy text</b> on the document(s) that pass needs → paste the text → send → copy ChatGPT's JSON reply → paste it in the box below → <b>Load into template</b>.</p>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="grid gap-1 text-[12.5px]">
                      <div><b>1 · Company + Team</b> — attach: <b>Financing doc + Management circular</b></div>
                      <div><b>2 · Projects</b> — attach: <b>Technical report</b> (one project per run if large)</div>
                      <div><b>3 · Timeline</b> — attach: <b>Press releases</b> (in batches)</div>
                      <div><b>4 · Conference</b> — <b>no documents</b>: click <b>Copy profile JSON</b>, paste it with the Conference prompt</div>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[12px] text-slate-500">If a pass is too big to print, tell ChatGPT "write it to a downloadable JSON file," then use <b>Load JSON file</b>. Right document → right fields; the wrong doc makes a pass refuse or come back thin.</p>

                  <div className="mt-3 text-[12px] font-extrabold uppercase tracking-wide text-slate-500">Step 3 · Fill the manual pieces</div>
                  <ol className="mt-1 list-decimal space-y-1 pl-5">
                    <li><b>Team bios</b> → run a team-only pass from the <b>website team page or deck</b> (a circular gives names only). Paste the resulting <code>{'{"team":[…]}'}</code>.</li>
                    <li><b>Logo + Hero</b> → Page 1 below, upload both.</li>
                    <li><b>Market cap</b> (optional) → it's a live figure, add by hand if you want the stat.</li>
                  </ol>

                  <div className="mt-3 text-[12px] font-extrabold uppercase tracking-wide text-slate-500">Step 4 · Save, preview, launch</div>
                  <ol className="mt-1 list-decimal space-y-1 pl-5">
                    <li>Press <b>Save</b> after each load. Watch the checklist hit <b>4/4</b> and "Also needed" clear to green.</li>
                    <li>Click <b>Preview Conference Mode</b> — check every section reads well.</li>
                    <li>When it's right, <b>publish</b> to make it live.</li>
                  </ol>
                  <p className="mt-2 text-[12px] text-slate-500">Everything merges — paste passes in any order, re-run any pass. The one exception: <b>team replaces team</b>, so load your final team last.</p>
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

          <TemplateBoundary resetKey={profile}>
          {/* PAGE 1 — HERO */}
          <Slide n={1} kicker="Page 1" title="Company Hero" purpose="Introduce the company.">
            <div className="grid gap-5 sm:grid-cols-2">
              <ImageSlot title="Company Logo" help="Circular logo shown on the booth + app." round value={firstOf(get(p, "brand.logo"), get(p, "brand.avatar"))} onChange={setLogo} maxDim={640} />
              <ImageSlot title="Hero Image" help="Full-bleed image behind the booth hero + status card." tall value={firstOf(get(p, "brand.hero"), get(p, "companyStatus.photo"))} onChange={(v) => setImg("brand.hero", v)} maxDim={1600} />
            </div>
            <Field title="Company Name" help="Official legal company name." value={get(p, "company.name")} big />
            <Field title="Slogan" help="Primary marketing slogan, in the company's own words." value={get(p, "company.slogan")} />
            <Pills title="Tickers" help="Every exchange listing, one pill each." items={tickers} />
            <Widgets title="Hero Statistic" help="The one defining number or phrase (shown big on the booth hero)."
              items={[
                { label: "Value", value: get(p, "conference.heroStatistic.value") },
                { label: "Label", value: get(p, "conference.heroStatistic.label") },
                { label: "Context", value: get(p, "conference.heroStatistic.context") },
              ]} />
            <GallerySlot title="Additional Images" help="Optional extra hero / brand images beyond the logo and hero above." images={get(conf, "gallery.company")} onChange={(v) => setVal("conference.gallery.company", v)} />
          </Slide>

          {/* PAGE 2 — COMPANY OVERVIEW */}
          <Slide n={2} kicker="Page 2" title="Company Overview" purpose="Explain who the company is.">
            <Field title="Headline" help="Company positioning statement." value={firstOf(conf.hook, get(p, "companyStatus.statusHeadline"))} big />
            <Field title="Company Overview" help="One editorial paragraph describing what the company does, where it operates, and what sets it apart." value={firstOf(conf.overview, briefSection("what they do"), get(p, "companyBrief.sections[0].v"), get(p, "companyBrief.keyPoints[0]"))} big />
            <WidgetPool page="overview" conf={conf} setVal={setVal}
              auto={{
                commodity: firstOf(cmp.primaryCommodity, get(p, "company.commodity")),
                flagship: firstOf(get(p, "projects[0].name"), conf.featuredProjectKey),
                stage: firstOf(get(p, "company.stage"), cmp.marketCapTier),
                operationsLocation: firstOf(get(p, "projects[0].locationFull"), get(p, "projects[0].snapshot.location.value"), get(p, "company.location")),
                jurisdiction: firstOf(cmp.jurisdiction, get(p, "company.jurisdiction")),
                currentActivity: firstOf(conf.currentActivity, get(p, "companyStatus.statusHeadline")),
                assets: projects.length ? String(projects.length) : undefined,
                ownership: firstOf(cap.ownership, get(p, "projects[0].snapshot.ownership.value")),
                landPackage: get(p, "projects[0].snapshot.landPackage.value"),
                headquarters: firstOf(cmp.headquarters, get(p, "company.location")),
              }} />
            <GallerySlot title="Images" help="Supporting company / project images for this page — drag & drop one or many. First image is the lead." images={get(conf, "gallery.overview")} onChange={(v) => setVal("conference.gallery.overview", v)} />
          </Slide>

          {/* PAGE 3 — HIGHLIGHTS */}
          <Slide n={3} kicker="Page 3" title="Company Highlights" purpose="Quick investor summary.">
            <RecordPool title="Highlights" help="Every extracted highlight is a card. Check the 3–6 to show, ★ the strongest as the page's hero stat, drag order with the arrows, or add your own."
              path="conference.highlights" records={conf.highlights} setVal={setVal} featureLabel="hero stat" addLabel="Add highlight"
              fields={[{ name: "value", label: "Stat (short)", strong: true }, { name: "label", label: "Label" }, { name: "context", label: "Context — why it matters", kind: "area" }]} />
            <Field title="Highlights Summary" help="A short editorial paragraph explaining why these highlights matter." value={conf.highlightsIntro} big />
            <GallerySlot title="Images" help="Optional supporting images for the highlights page." images={get(conf, "gallery.highlights")} onChange={(v) => setVal("conference.gallery.highlights", v)} />
          </Slide>

          {/* PAGE 4 — JURISDICTION */}
          <Slide n={4} kicker="Page 4" title="Jurisdiction" purpose="Explain why the jurisdiction matters.">
            <EditField title="Hero Statistic" help="The page's defining phrase — the strongest geographic identity (mining district, mineral belt, or a major regional production figure). e.g. “Heart of the Parral Silver District”." value={conf.jurisdictionHeroStat} onChange={(v) => setVal("conference.jurisdictionHeroStat", v)} placeholder="e.g. Tier-1 mining district" />
            <Field title="Jurisdiction Overview" help="Editorial paragraph on the region and why it's favorable." value={firstOf(conf.region, conf.districtContext)} big />
            <GallerySlot title="Maps & Images" help="Regional / district / infrastructure maps and photos — drag & drop one or many." images={get(conf, "gallery.jurisdiction")} onChange={(v) => setVal("conference.gallery.jurisdiction", v)} />
            <WidgetPool page="jurisdiction" conf={conf} setVal={setVal}
              auto={{
                country: get(p, "company.country"),
                district: conf.districtContext,
                infrastructure: get(p, "projects[0].infrastructure.notes"),
                permitting: get(p, "projects[0].snapshot.permitting.value"),
                regionalGeology: conf.regionalGeology,
                provinceState: firstOf(cmp.jurisdiction, get(p, "company.jurisdiction")),
              }} />
          </Slide>

          {/* PAGE 5 — PROJECTS (repeats) */}
          <Slide n={5} kicker="Page 5" title="Projects" purpose="Every project becomes its own section.">
            {projects.length > 1 && (
              <div className="mb-5 space-y-4">
                <EditField title="Hero Statistic" help="The portfolio's defining phrase — project count, total land package, active projects, or flagship ownership. e.g. “3 district-scale projects”." value={conf.portfolioHeroStat} onChange={(v) => setVal("conference.portfolioHeroStat", v)} placeholder="e.g. 3 projects · 42,000 ha" />
                <Field title="Portfolio Overview" help="One paragraph framing the whole portfolio — shown on a 'Portfolio' page before the individual projects (multi-asset companies only)." value={firstOf(conf.portfolioTitle && conf.portfolioOverview ? `${conf.portfolioTitle}\n\n${conf.portfolioOverview}` : undefined, conf.portfolioOverview, conf.portfolioTitle)} big />
                <WidgetPool page="portfolio" conf={conf} setVal={setVal}
                  auto={{
                    flagship: firstOf(get(p, "projects[0].name"), conf.featuredProjectKey),
                    numProjects: String(projects.length),
                    commodity: firstOf(cmp.primaryCommodity, get(p, "company.commodity")),
                    stage: firstOf(get(p, "company.stage"), cmp.marketCapTier),
                    ownership: firstOf(cap.ownership, get(p, "projects[0].snapshot.ownership.value")),
                    landPackage: get(p, "projects[0].snapshot.landPackage.value"),
                    jurisdiction: firstOf(cmp.jurisdiction, get(p, "company.jurisdiction")),
                    activePrograms: conf.currentActivity,
                  }} />
              </div>
            )}
            {projects.length === 0 ? (
              <Field title="Projects" help="Each project gets a name, summary, key details and an image gallery." value={undefined} />
            ) : (
              projects.map((pr, i) => {
                const pjk = pr.key || String(pr.name || i).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                return (
                <div key={pjk} className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">Project {i + 1}{i === 0 ? " · Flagship" : ""}</span>
                  </div>
                  <div className="space-y-4">
                    <Field title="Project Name" help="Property / project name." value={pr.name} big />
                    <Field title="Project Summary" help="One paragraph on what this project is and why it matters." value={firstOf(get(pr, "brief.overview"), Array.isArray(pr.narrative) ? pr.narrative.join("\n\n") : pr.narrative, pr.short)} big />
                    <ProjectWidgetPool projectKey={pjk} conf={conf} setVal={setVal}
                      auto={{
                        stage: pr.stageName,
                        commodity: get(pr, "snapshot.commodity.value"),
                        ownership: get(pr, "snapshot.ownership.value"),
                        location: firstOf(pr.locationFull, get(pr, "snapshot.location.value")),
                        landPackage: get(pr, "snapshot.landPackage.value"),
                        depositType: get(pr, "snapshot.depositType.value"),
                        geologicalModel: get(pr, "geology"),
                        targets: get(pr, "targets.priority"),
                      }} />
                    <EditField title="Investor Takeaway" help="One line — the single strongest thing about this project (optional)." value={get(conf, `projectTakeaways.${pjk}`)} onChange={(v) => setVal(`conference.projectTakeaways.${pjk}`, v)} placeholder="e.g. Bonanza-grade discovery, open in all directions" />
                    <GallerySlot title="Project Images" help="Property / geology / core / drone photos for this project — drag & drop one or many. First is the scene background." images={get(conf, `projectGallery.${pjk}`)} onChange={(v) => setVal(`conference.projectGallery.${pjk}`, v)} />
                  </div>
                </div>
                );
              })
            )}
          </Slide>

          {/* PAGE 6 — DRILL RESULTS */}
          <Slide n={6} kicker="Page 6" title="Drill Results" purpose="Display the best technical results.">
            <EditField title="Hero Statistic" help="The best material result — the single strongest hole/interval/grade as a defining phrase. e.g. “641 g/t AgEq over 15.7 m”." value={conf.resultsHeroStat} onChange={(v) => setVal("conference.resultsHeroStat", v)} placeholder="e.g. 641 g/t AgEq / 15.7 m" />
            <Field title="Featured Drill Result" help="The single most important hole, summarized." value={firstOf(conf.resultsIntro, get(p, "projects[0].drillResults.rows[0].hole"))} big />
            <WidgetPool page="results" conf={conf} setVal={setVal}
              auto={{
                bestResult: (() => { const r = get(p, "projects[0].drillResults.rows[0]"); return r ? [r.hole, r.interval, r.grade].filter(Boolean).join(" · ") : undefined; })(),
                widestInterval: get(p, "projects[0].drillResults.rows[0].interval"),
                currentProgram: conf.currentActivity,
                resourceStatus: get(p, "projects[0].resource.category"),
              }} />
            <GallerySlot title="Technical Images" help="Assay tables, drill plans, cross-sections, core photos, resource models — drag & drop one or many." images={get(conf, "gallery.results")} onChange={(v) => setVal("conference.gallery.results", v)} />
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
            <EditField title="Hero Statistic" help="The defining funding phrase — funding status, cash position, or latest financing. e.g. “Fully Funded”, “C$13M Cash”, “C$13M Bought Deal Closed”." value={conf.capitalHeroStat} onChange={(v) => setVal("conference.capitalHeroStat", v)} placeholder="e.g. Fully funded through 2026" />
            <Field title="Capital Overview" help="Editorial paragraph on the company's financial position." value={firstOf(conf.capitalIntro, cap.headline, cap.subtext)} big />
            <WidgetPool page="capital" conf={conf} setVal={setVal}
              auto={{
                fundingStatus: firstOf(cmp.fundedStatus, cap.state),
                cash: cap.cash,
                workingCapital: cap.workingCapital,
                latestFinancing: firstOf(cap.financing, cap.financingType),
                shares: cap.outstanding,
                fd: cap.fd,
                ownership: cap.ownership,
                strategicInvestors: conf.strategicPartnerships,
                warrants: cap.warrants,
                options: cap.options,
                debt: cap.debt,
                balanceSheetDate: cap.reportingDate,
              }} />
            <GallerySlot title="Images" help="Optional capital-structure / ownership charts or images." images={get(conf, "gallery.capital")} onChange={(v) => setVal("conference.gallery.capital", v)} />
          </Slide>

          {/* PAGE 9 — LEADERSHIP */}
          <Slide n={9} kicker="Page 9" title="Leadership" purpose="Introduce management.">
            <EditField title="Credibility Line" help="Optional hero phrase for the page — e.g. “150+ Years Combined Experience”. Only if supportable; never fabricated." value={firstOf(get(p, "conference.leadership.heroStatistic"), get(p, "conference.leadership.headline"))} onChange={(v) => setVal("conference.leadership.heroStatistic", v)} placeholder="e.g. 150+ years combined experience" />
            <LeadershipPool team={team} conf={conf} setVal={setVal} />
            <GallerySlot title="Images" help="Optional team / office / site photos for the leadership page." images={get(conf, "gallery.leadership")} onChange={(v) => setVal("conference.gallery.leadership", v)} />
          </Slide>

          {/* PAGE 10 — WHY INVEST */}
          <Slide n={10} kicker="Page 10" title="Why Invest" purpose="Summarize the investment thesis.">
            <Field title="Investment Summary" help="Editorial paragraph — synthesizes the strongest established reasons (not a repeat of every card)." value={firstOf(conf.investmentSummary, conf.mission, get(p, "conference.investmentCase[0].reason"))} big />
            <Field title="Investor Takeaway" help="The single strongest overall takeaway, one line." value={conf.investorTakeaway} />
            <RecordPool title="Reasons to Invest" help="Every extracted reason is a card. Check the strongest to show, ★ the lead reason, reorder, or add your own. Established reasons — not forward-looking promises."
              path="conference.investmentCase" records={conf.investmentCase} setVal={setVal} featureLabel="lead reason" addLabel="Add reason"
              fields={[{ name: "reason", label: "Reason", strong: true }, { name: "evidence", label: "Evidence", kind: "area" }, { name: "standsOutBecause", label: "Stands out because…", kind: "area" }]} />
            <GallerySlot title="Images" help="Optional closing / summary images for the Why Invest page." images={get(conf, "gallery.why")} onChange={(v) => setVal("conference.gallery.why", v)} />
          </Slide>

          {/* PAGE 11 — FOLLOW */}
          <Slide n={11} kicker="Page 11" title="Follow on MineEx" purpose="Final call-to-action.">
            <Field title="Follow on MineEx" help="Closing editorial line inviting the reader to follow the company on MineEx." value={`Follow ${get(p, "company.name") || "this company"} on MineEx to get every update the moment it's disclosed.`} big />
            <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <h3 className="text-[15px] font-bold text-slate-900">QR Code</h3>
              <p className="mt-0.5 text-[12.5px] text-slate-400">Auto-generated on publish — links directly to this company's profile.</p>
              <div className="mt-4 flex h-44 flex-col items-center justify-center gap-2 rounded-2xl bg-slate-50 text-slate-300">
                <QrCode size={40} strokeWidth={1.4} />
                <p className="text-[12px] font-semibold">Generated at publish</p>
              </div>
            </div>
            <GallerySlot title="Background Image" help="Optional full-bleed background behind the closing follow screen." images={get(conf, "gallery.follow")} onChange={(v) => setVal("conference.gallery.follow", v)} max={1} />
          </Slide>
          </TemplateBoundary>

          <div className="h-6" />
        </div>
      )}
    </div>
  );
}
