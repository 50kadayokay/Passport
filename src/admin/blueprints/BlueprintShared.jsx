// Shared, config-driven building blocks for both Blueprint editors.
// Pure presentation + immutable data helpers. Never writes to the network or to
// companies.profile — editors persist via blueprintStorage only.

import React, { useState } from "react";
import {
  FIELD_STATUSES, MISSING_STATUSES, PRESENT_STATUSES, NEUTRAL_STATUSES, IS_MISSING,
  APPROVAL_VALUES, SOURCE_AUTHORITY, SOURCE_CONFIDENCE, SOURCE_VERIFICATION, makeSource, tally,
} from "../../lib/blueprints/types.js";
import { parseBlueprintImport, diffBlueprintImport, applyBlueprintImport } from "../../lib/blueprints/blueprintImport.js";
import { templateKeyFor } from "../../lib/blueprints/blueprintValidation.js";

const S = (x) => (x == null ? "" : String(x));

// status → { label, chip, dot }
const STATUS_META = {
  approved: { label: "approved", chip: "bg-emerald-600 text-white", dot: "bg-emerald-500" },
  verified: { label: "verified", chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  evidence_available: { label: "evidence", chip: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-500" },
  extracted: { label: "extracted", chip: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  needs_review: { label: "needs review", chip: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  not_disclosed: { label: "not disclosed", chip: "bg-slate-100 text-slate-500", dot: "bg-slate-300" },
  not_extracted: { label: "not extracted", chip: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  needs_ai_writing: { label: "needs AI writing", chip: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  needs_manual_review: { label: "needs manual review", chip: "bg-orange-50 text-orange-700", dot: "bg-orange-500" },
  conflicting_sources: { label: "conflicting", chip: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  awaiting_confirmation: { label: "awaiting confirmation", chip: "bg-cyan-50 text-cyan-700", dot: "bg-cyan-500" },
  empty: { label: "empty", chip: "bg-slate-100 text-slate-400", dot: "bg-slate-300" },
  intentionally_omitted: { label: "omitted", chip: "bg-slate-100 text-slate-400", dot: "bg-slate-300" },
  not_applicable: { label: "n/a", chip: "bg-slate-100 text-slate-400", dot: "bg-slate-300" },
  // legacy
  needs_writing: { label: "needs writing", chip: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  needs_research: { label: "needs research", chip: "bg-orange-50 text-orange-700", dot: "bg-orange-500" },
  conflict: { label: "conflict", chip: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
};
const meta = (s) => STATUS_META[s] || STATUS_META.empty;
const APPROVAL_CHIP = { unreviewed: "bg-slate-100 text-slate-500", in_review: "bg-amber-50 text-amber-700", approved: "bg-emerald-600 text-white", rejected: "bg-rose-100 text-rose-700" };

export function StatusDot({ status }) { return <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${meta(status).dot}`} title={meta(status).label} />; }
export function StatusPill({ status }) { return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${meta(status).chip}`}>{meta(status).label}</span>; }
export function ApprovalPill({ value }) { return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${APPROVAL_CHIP[value] || APPROVAL_CHIP.unreviewed}`}>{S(value).replace(/_/g, " ")}</span>; }

export function CompletionBar({ t }) {
  if (!t) return null;
  const cell = (n, label, cls) => <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{n}<span className="font-medium opacity-60">{label}</span></span>;
  const pctv = t.total ? Math.round((t.approved / t.total) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">{pctv}%</span>
      {cell(t.approved, "approved", "bg-emerald-50 text-emerald-700")}
      {cell(t.unreviewed, "to review", "bg-slate-100 text-slate-500")}
      {cell(t.missing, "missing", "bg-orange-50 text-orange-700")}
      {cell(t.conflicts, "conflicts", "bg-rose-50 text-rose-700")}
      {cell(t.needsWriting, "to write", "bg-violet-50 text-violet-700")}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search fields…" }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-700 outline-none focus:border-slate-400" />;
}

// ---- immutable data mutators --------------------------------------------------
export function patchField(data, key, patch) {
  const cur = (data.fields || {})[key] || {};
  return { ...data, fields: { ...(data.fields || {}), [key]: { ...cur, ...patch } } };
}
export function patchRecord(data, poolKey, id, patch) {
  const list = (data.pools || {})[poolKey] || [];
  const next = list.map((r) => (S(r.id) === S(id) ? { ...r, ...patch, values: patch.values ? { ...(r.values || {}), ...patch.values } : r.values } : r));
  return { ...data, pools: { ...(data.pools || {}), [poolKey]: next } };
}
export function moveRecord(data, poolKey, id, dir) {
  const list = ((data.pools || {})[poolKey] || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const i = list.findIndex((r) => S(r.id) === S(id)); const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return data;
  const tmp = list[i]; list[i] = list[j]; list[j] = tmp; list.forEach((r, k) => { r.order = k; });
  return { ...data, pools: { ...(data.pools || {}), [poolKey]: list } };
}
// Bulk approve a set of field keys (present ones only, unless force).
export function bulkApproveFields(data, keys, { force } = {}) {
  const fields = { ...(data.fields || {}) };
  keys.forEach((k) => { const f = fields[k]; if (!f) return; if (!force && IS_MISSING.has(f.status)) return; fields[k] = { ...f, approvalStatus: "approved", status: f.status === "verified" || f.status === "approved" ? "approved" : f.status }; });
  return { ...data, fields };
}
export function bulkApproveRecords(data, poolKey, ids, { force } = {}) {
  const list = ((data.pools || {})[poolKey] || []).map((r) => (ids.includes(S(r.id)) && (force || r.selected) ? { ...r, approvalStatus: "approved" } : r));
  return { ...data, pools: { ...(data.pools || {}), [poolKey]: list } };
}

// ---- group header (collapsible + approve-all) ---------------------------------
export function GroupHeader({ label, t, collapsed, onToggle, onApproveAll }) {
  return (
    <div className="mt-4 mb-1.5 flex items-center gap-2 first:mt-0">
      <button onClick={onToggle} className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-slate-500 hover:text-slate-800">
        <span className="text-slate-400">{collapsed ? "▸" : "▾"}</span>{label}
      </button>
      {t && <span className="text-[10.5px] text-slate-400">{t.approved}/{t.total}</span>}
      <div className="h-px flex-1 bg-slate-100" />
      {onApproveAll && <button onClick={onApproveAll} className="rounded-md border border-slate-200 px-2 py-0.5 text-[10.5px] font-bold text-slate-500 hover:text-emerald-700">approve group</button>}
    </div>
  );
}

// ---- single field editor (review-doc feel) ------------------------------------
export function FieldEditor({ field, def, onChange, onEvidence, active }) {
  if (!field) return null;
  const raw = field.rawValue;
  const structured = raw != null && typeof raw === "object";
  const lg = field.layoutGuidance;
  const len = S(field.displayValue).length;
  const over = lg && lg.maximumCharacters && len > lg.maximumCharacters;
  const missing = IS_MISSING.has(field.status);
  return (
    <div className={`rounded-xl border p-3 transition-colors ${active ? "border-slate-900 ring-1 ring-slate-900" : missing ? "border-slate-200 bg-slate-50/60" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={field.status} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-bold text-slate-800">{def ? def.label : field.fieldKey}</span>
              {field.required && <span className="rounded bg-rose-50 px-1 text-[9.5px] font-bold uppercase text-rose-500">req</span>}
            </div>
            <div className="font-mono text-[10px] text-slate-300">{field.fieldKey}</div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <ApprovalPill value={field.approvalStatus} />
          <button onClick={onEvidence} className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${field.sources && field.sources.length ? "border-indigo-200 text-indigo-600" : "border-slate-200 text-slate-400"} hover:text-slate-900`}>ev {field.sources ? field.sources.length : 0}</button>
        </div>
      </div>

      {structured ? (
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-900/95 p-2 font-mono text-[11px] leading-relaxed text-slate-200">{JSON.stringify(raw, null, 2).slice(0, 1400)}</pre>
      ) : (
        <textarea value={S(field.displayValue)} onChange={(e) => onChange({ displayValue: e.target.value, rawValue: e.target.value })}
          rows={lg && lg.maximumLines ? Math.min(7, lg.maximumLines + 1) : 2}
          className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13.5px] leading-snug text-slate-800 outline-none focus:border-slate-400" placeholder="—" />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select value={field.approvalStatus} onChange={(e) => onChange({ approvalStatus: e.target.value })}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-slate-600">
          {APPROVAL_VALUES.map((v) => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
        </select>
        {missing ? (
          <select value={field.status} onChange={(e) => onChange({ status: e.target.value })}
            className="rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-[11.5px] font-semibold text-orange-700">
            <optgroup label="Missing — why?">{MISSING_STATUSES.map((v) => <option key={v} value={v}>{meta(v).label}</option>)}</optgroup>
            <optgroup label="Resolve to">{[...PRESENT_STATUSES, ...NEUTRAL_STATUSES].map((v) => <option key={v} value={v}>{meta(v).label}</option>)}</optgroup>
          </select>
        ) : (
          <select value={field.status} onChange={(e) => onChange({ status: e.target.value })}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11.5px] text-slate-600">
            {FIELD_STATUSES.map((v) => <option key={v} value={v}>{meta(v).label}</option>)}
          </select>
        )}
        {lg && <span className={`text-[11px] ${over ? "font-bold text-rose-600" : "text-slate-400"}`}>{len}/{lg.maximumCharacters}</span>}
        <button onClick={() => onChange({ approvalStatus: "approved" })} className="ml-auto rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100">approve</button>
      </div>
      <input value={S(field.reviewerNotes)} onChange={(e) => onChange({ reviewerNotes: e.target.value })}
        placeholder="Reviewer notes…" className="mt-2 w-full rounded-md border border-dashed border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-600 outline-none focus:border-slate-400" />
    </div>
  );
}

// ---- pool record card ---------------------------------------------------------
export function RecordCard({ rec, columns, onChange, onMove, onEvidence, first, last }) {
  const [open, setOpen] = useState(false);
  const shown = open ? columns : columns.slice(0, 6);
  return (
    <div className={`rounded-xl border p-3 ${rec.selected ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50 opacity-60"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={rec.status} />
          <span className="truncate text-[13px] font-bold text-slate-800">{S(rec.label) || rec.id}</span>
          {rec.featured && <span className="rounded bg-amber-50 px-1.5 text-[10px] font-bold text-amber-700">★ featured</span>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"><input type="checkbox" checked={!!rec.selected} onChange={(e) => onChange({ selected: e.target.checked })} />sel</label>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"><input type="checkbox" checked={!!rec.featured} onChange={(e) => onChange({ featured: e.target.checked })} />★</label>
          <button disabled={first} onClick={() => onMove(-1)} className="rounded border border-slate-200 px-1.5 text-[12px] text-slate-500 disabled:opacity-30">↑</button>
          <button disabled={last} onClick={() => onMove(1)} className="rounded border border-slate-200 px-1.5 text-[12px] text-slate-500 disabled:opacity-30">↓</button>
          <button onClick={onEvidence} className="rounded border border-slate-200 px-2 text-[11px] font-semibold text-slate-500 hover:text-slate-900">ev {rec.sources ? rec.sources.length : 0}</button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {shown.map((c) => (
          <label key={c} className="text-[11px] text-slate-500">
            <span className="font-semibold">{c}</span>
            <input value={S((rec.values || {})[c])} onChange={(e) => onChange({ values: { [c]: e.target.value } })}
              className="mt-0.5 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] text-slate-800 outline-none focus:border-slate-400" placeholder="—" />
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {columns.length > 6 && <button onClick={() => setOpen((o) => !o)} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700">{open ? "fewer fields" : `+${columns.length - 6} more fields`}</button>}
        <select value={rec.approvalStatus} onChange={(e) => onChange({ approvalStatus: e.target.value })} className="ml-auto rounded-md border border-slate-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-slate-600">
          {APPROVAL_VALUES.map((v) => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
        </select>
        <button onClick={() => onChange({ approvalStatus: "approved" })} className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">approve</button>
      </div>
    </div>
  );
}

// ---- evidence side panel (editable, first-class) ------------------------------
export function EvidencePanel({ item, onClose, onPatch }) {
  if (!item) return null;
  const sources = Array.isArray(item.sources) ? item.sources : [];
  const conflicts = Array.isArray(item.conflicts) ? item.conflicts : [];
  const setSources = (next) => onPatch && onPatch({ sources: next });
  const addSource = () => setSources([...sources, makeSource({})]);
  const patchSource = (i, patch) => setSources(sources.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const removeSource = (i) => setSources(sources.filter((_, k) => k !== i));
  const inp = "w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700 outline-none focus:border-slate-400";
  return (
    <div className="flex h-full w-full flex-col border-l border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="font-mono text-[11.5px] font-bold text-slate-700">{item.fieldKey || item.id}</div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 space-y-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Current value</div>
          <div className="mt-1 rounded-lg bg-white p-2 text-[12.5px] text-slate-700">{S(item.displayValue || item.label) || <span className="text-slate-400">—</span>}</div>
        </div>
        {conflicts.length > 0 && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2">
            <div className="text-[11px] font-bold uppercase text-rose-700">Conflicts</div>
            {conflicts.map((c, i) => <div key={i} className="mt-1 text-[12px] text-rose-700">{S(c)}</div>)}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Evidence · {sources.length}</div>
          {onPatch && <button onClick={addSource} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:text-slate-900">+ add source</button>}
        </div>
        {sources.length === 0 && <div className="text-[12px] text-slate-400">No mapped evidence. Future extraction populates this model directly.</div>}
        {sources.map((s, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1.5">
            <textarea value={S(s.exactQuote)} onChange={(e) => patchSource(i, { exactQuote: e.target.value })} rows={2} placeholder="Exact supporting quote…" className={inp} />
            <div className="grid grid-cols-2 gap-1.5">
              <input value={S(s.sourceDocumentName)} onChange={(e) => patchSource(i, { sourceDocumentName: e.target.value })} placeholder="Source document" className={inp} />
              <input value={S(s.sourceDocumentType)} onChange={(e) => patchSource(i, { sourceDocumentType: e.target.value })} placeholder="Doc type" className={inp} />
              <input value={S(s.documentDate)} onChange={(e) => patchSource(i, { documentDate: e.target.value })} placeholder="Publication date" className={inp} />
              <input value={S(s.pageNumber)} onChange={(e) => patchSource(i, { pageNumber: e.target.value })} placeholder="Page number" className={inp} />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <select value={s.authority} onChange={(e) => patchSource(i, { authority: e.target.value })} className={inp}>{SOURCE_AUTHORITY.map((v) => <option key={v} value={v}>{v}</option>)}</select>
              <select value={s.confidence} onChange={(e) => patchSource(i, { confidence: e.target.value })} className={inp}>{SOURCE_CONFIDENCE.map((v) => <option key={v} value={v}>{v}</option>)}</select>
              <select value={s.verificationStatus} onChange={(e) => patchSource(i, { verificationStatus: e.target.value })} className={inp}>{SOURCE_VERIFICATION.map((v) => <option key={v} value={v}>{v}</option>)}</select>
            </div>
            <input value={S(s.reviewerNotes)} onChange={(e) => patchSource(i, { reviewerNotes: e.target.value })} placeholder="Reviewer notes on this source…" className={inp} />
            {onPatch && <button onClick={() => removeSource(i)} className="text-[11px] font-semibold text-rose-500 hover:text-rose-700">remove</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- completion + exports -----------------------------------------------------
export function computeCompletion(data) {
  const fields = Object.values((data && data.fields) || {});
  const records = Object.values((data && data.pools) || {}).flat();
  return tally(fields, records);
}
export function downloadJson(name, obj) {
  try {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  } catch (_) {}
}
export function evidenceReport(data) {
  const out = [];
  Object.values((data && data.fields) || {}).forEach((f) => (f.sources || []).forEach((s) => out.push({ fieldKey: f.fieldKey, value: f.displayValue, ...s })));
  return { generatedFrom: data && data.templateKey, count: out.length, evidence: out };
}
export function missingReport(data) {
  const missing = [];
  Object.values((data && data.fields) || {}).forEach((f) => { if (IS_MISSING.has(f.status)) missing.push({ fieldKey: f.fieldKey, status: f.status, required: f.required, reviewerNotes: f.reviewerNotes }); });
  const byReason = {};
  missing.forEach((m) => { byReason[m.status] = (byReason[m.status] || 0) + 1; });
  return { generatedFrom: data && data.templateKey, count: missing.length, byReason, missing };
}

// ---- import modal (two-step: preview → confirm) -------------------------------
export function BlueprintImportModal({ row, data, expectedType, onApply, onClose }) {
  const [text, setText] = useState("");
  const [check, setCheck] = useState(null);
  const [err, setErr] = useState("");
  const expectedTemplateKey = templateKeyFor(expectedType);
  const preview = () => {
    setErr(""); const parsed = parseBlueprintImport(text);
    if (!parsed.ok) { setErr(parsed.error); setCheck(null); return; }
    setCheck({ payload: parsed.payload, diff: diffBlueprintImport(data, parsed.payload, { expectedType, expectedTemplateKey }) });
  };
  const confirm = () => { if (!check) return; try { const { next } = applyBlueprintImport(data, check.payload, { expectedType, expectedTemplateKey }); onApply(next); } catch (e) { setErr(e.message || "Import failed."); } };
  const d = check && check.diff;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-[680px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="text-[16px] font-extrabold text-slate-900">Import {expectedType} Blueprint JSON</div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5 space-y-3">
          {!check ? (
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="Paste a Blueprint JSON export (or a { fields, pools } delta)…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[12px] text-slate-800 outline-none focus:border-slate-400" />
          ) : (
            <div className="space-y-2 text-[13px]">
              {d.errors.length > 0 && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700"><b>Blocked:</b> {d.errors.join(" · ")}</div>}
              {d.warnings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">{d.warnings.join(" · ")}</div>}
              <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="font-bold text-slate-700">Fields</div>
                <div className="mt-1 font-mono text-[12px] text-slate-500">+{d.fields.added.length} added · ~{d.fields.updated.length} updated · ={d.fields.unchanged.length} unchanged · kept {d.fields.skippedApproved.length} approved · skipped {d.fields.skippedEmpty.length} empty</div></div>
              <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="font-bold text-slate-700">Pools</div>
                <div className="mt-1 font-mono text-[12px] text-slate-500">{Object.entries(d.pools).map(([k, v]) => `${k}: +${v.added}/~${v.updated}`).join(" · ") || "none"}</div></div>
              {d.conflicts.length > 0 && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700">{d.conflicts.length} field(s) carry conflicts.</div>}
              {(d.unknownFieldKeys.length || d.unknownPoolKeys.length) > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">Ignored unknown keys: {[...d.unknownFieldKeys, ...d.unknownPoolKeys].join(", ")}</div>}
            </div>
          )}
          {err && <div className="text-[13px] font-semibold text-rose-600">{err}</div>}
        </div>
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          {check ? (<>
            <button onClick={() => setCheck(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:text-slate-900">Back</button>
            <button onClick={confirm} disabled={d && d.errors.length > 0} className={`rounded-xl px-5 py-2.5 text-[14px] font-bold text-white ${d && d.errors.length ? "bg-slate-300" : "bg-emerald-600 hover:bg-emerald-700"}`}>Apply to draft</button>
          </>) : (<>
            <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:text-slate-900">Cancel</button>
            <button onClick={preview} className="rounded-xl bg-slate-900 px-5 py-2.5 text-[14px] font-bold text-white">Preview changes</button>
          </>)}
        </div>
      </div>
    </div>
  );
}
