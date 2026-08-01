// Passport Blueprint editor — config-driven from PASSPORT_TEMPLATE.
// Reads like a review doc: sections, search, review-queue, bulk approve, editable
// evidence, keyboard nav. Edits Blueprint draft values only; persists to
// company_blueprints. NEVER writes companies.profile.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PASSPORT_TEMPLATE } from "../../lib/blueprints/passportTemplate.js";
import { tally } from "../../lib/blueprints/types.js";
import { saveBlueprintData, setBlueprintStatus, publishCompiledProfile, revertPublishedProfile } from "../../lib/blueprints/blueprintStorage.js";
import { compilePassportBlueprint, passportCompileDiff } from "../../lib/blueprints/compile.js";
import { PreviewModal } from "./ConferenceBlueprintEditor.jsx";
import {
  FieldEditor, RecordCard, EvidencePanel, CompletionBar,
  patchField, patchRecord, moveRecord, bulkApproveFields, bulkApproveRecords,
  computeCompletion, downloadJson, evidenceReport, missingReport, BlueprintImportModal,
} from "./BlueprintShared.jsx";

const POOL_COLUMNS = {
  projects: ["name", "stageName", "tag", "locationFull", "enabled"],
  timeline: ["date", "headline", "whyItMatters", "key"],
  team: ["name", "role", "short", "full", "enabled"],
};
const S = (x) => (x == null ? "" : String(x));

export default function PassportBlueprintEditor({ row, onBack, onSaved, companySlug, companyProfile, canPublish = false }) {
  const [data, setData] = useState(row.data || { fields: {}, pools: {} });
  const [status, setStatus] = useState(row.status || "draft");
  const [active, setActive] = useState(PASSPORT_TEMPLATE.sections[0].key);
  const [evidence, setEvidence] = useState(null); // { kind, key?, poolKey?, id? }
  const [q, setQ] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pubDiff, setPubDiff] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [pubMsg, setPubMsg] = useState("");
  const searchRef = useRef(null);
  const hasSnapshot = !!(row.data && row.data.meta && row.data.meta.preCompileSnapshot);

  const openPreview = () => { const { nextProfile } = compilePassportBlueprint(data, companyProfile || {}, { requireApproval: false }); setPreview({ pp: nextProfile.pp }); };
  const openPublish = () => setPubDiff(passportCompileDiff(data, companyProfile || {}, { requireApproval: true }));
  const doPublish = async () => {
    setPublishing(true); setPubMsg("");
    try { await publishCompiledProfile(companySlug, row, pubDiff.nextProfile); setPubMsg("Published to the app profile."); setPubDiff(null); }
    catch (e) { setPubMsg(e.message || "Publish failed"); } finally { setPublishing(false); }
  };
  const doRevert = async () => {
    setPublishing(true); setPubMsg("");
    try { await revertPublishedProfile(companySlug, row); setPubMsg("Reverted to the pre-publish profile."); }
    catch (e) { setPubMsg(e.message || "Revert failed"); } finally { setPublishing(false); }
  };

  const sectionKeys = PASSPORT_TEMPLATE.sections.map((s) => s.key);
  const section = PASSPORT_TEMPLATE.sections.find((s) => s.key === active);
  const update = (fn) => { setData((d) => fn(d)); setDirty(true); };
  const overall = computeCompletion(data);

  const sectionTally = (sec) => sec.pool ? tally([], (data.pools || {})[sec.pool] || []) : tally((sec.fields || []).map((f) => (data.fields || {})[f.key]).filter(Boolean), []);

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target; if (t && /input|textarea|select/i.test(t.tagName)) { if (e.key === "Escape") t.blur(); return; }
      const i = sectionKeys.indexOf(active);
      if (e.key === "j" && i < sectionKeys.length - 1) setActive(sectionKeys[i + 1]);
      else if (e.key === "k" && i > 0) setActive(sectionKeys[i - 1]);
      else if (e.key === "/") { e.preventDefault(); searchRef.current && searchRef.current.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const evItem = evidence ? (evidence.kind === "field" ? (data.fields || {})[evidence.key] : ((data.pools || {})[evidence.poolKey] || []).find((r) => S(r.id) === S(evidence.id))) : null;
  const evPatch = (patch) => { if (!evidence) return; update((d) => evidence.kind === "field" ? patchField(d, evidence.key, patch) : patchRecord(d, evidence.poolKey, evidence.id, patch)); };

  const save = async () => { setSaving(true); setMsg(""); try { const saved = await saveBlueprintData(row.id, data); setDirty(false); setMsg("Saved."); onSaved && onSaved(saved); } catch (e) { setMsg(e.message || "Save failed"); } finally { setSaving(false); } };
  const changeStatus = async (s) => { setStatus(s); try { await setBlueprintStatus(row.id, s); } catch (_) {} };

  const nq = q.trim().toLowerCase();
  const passes = (def) => { const f = (data.fields || {})[def.key]; if (reviewOnly && f && f.approvalStatus === "approved") return false; if (!nq) return true; return (def.label + " " + def.key + " " + S(f && f.displayValue)).toLowerCase().includes(nq); };

  const approveSection = () => update((d) => {
    if (section.pool) return bulkApproveRecords(d, section.pool, ((d.pools || {})[section.pool] || []).filter((r) => r.selected).map((r) => S(r.id)));
    return bulkApproveFields(d, (section.fields || []).map((f) => f.key));
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2.5 border-b border-slate-200 px-5 py-3">
        <button onClick={onBack} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-bold text-slate-600 hover:text-slate-900">← Blueprints</button>
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold text-slate-900">Passport Blueprint <span className="font-mono text-[11px] font-medium text-slate-400">{row.template_version}</span></div>
          <div className="text-[11px] text-slate-400">Reviewing the full profile — saves to company_blueprints only, the live profile is untouched.</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search  ( / )" className="w-44 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] outline-none focus:border-slate-400" />
          <button onClick={() => setReviewOnly((v) => !v)} className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-bold ${reviewOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600"}`}>Review queue</button>
          <CompletionBar t={overall} />
          <select value={status} onChange={(e) => changeStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-600">
            <option value="draft">draft</option><option value="in_review">in review</option><option value="approved">approved</option><option value="archived">archived</option>
          </select>
          <button onClick={() => setShowImport(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-bold text-slate-600 hover:text-slate-900">Import</button>
          <div className="relative group">
            <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-bold text-slate-600 hover:text-slate-900">Export ▾</button>
            <div className="absolute right-0 z-20 hidden min-w-[180px] rounded-xl border border-slate-200 bg-white p-1 shadow-xl group-hover:block">
              <button onClick={() => downloadJson(`${row.company_id}-passport-blueprint.json`, data)} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-slate-50">Blueprint JSON</button>
              <button onClick={() => downloadJson(`${row.company_id}-passport-evidence.json`, evidenceReport(data))} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-slate-50">Evidence report</button>
              <button onClick={() => downloadJson(`${row.company_id}-passport-missing.json`, missingReport(data))} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-slate-50">Missing report</button>
            </div>
          </div>
          <button onClick={save} disabled={saving || !dirty} className={`rounded-lg px-4 py-1.5 text-[13px] font-bold text-white ${saving || !dirty ? "bg-slate-300" : "bg-emerald-600 hover:bg-emerald-700"}`}>{saving ? "Saving…" : "Save"}</button>
          <button onClick={openPreview} disabled={!companySlug} className="rounded-lg border border-slate-900 px-3 py-1.5 text-[13px] font-bold text-slate-900 hover:bg-slate-900 hover:text-white disabled:opacity-40">Preview App</button>
          {canPublish && <button onClick={openPublish} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-black">Publish to App</button>}
          {canPublish && hasSnapshot && <button onClick={doRevert} disabled={publishing} className="rounded-lg border border-rose-200 px-3 py-1.5 text-[13px] font-bold text-rose-600 hover:bg-rose-50">Revert</button>}
          {msg && <span className="text-[12px] font-semibold text-slate-500">{msg}</span>}
          {pubMsg && <span className="text-[12px] font-semibold text-emerald-700">{pubMsg}</span>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-56 flex-shrink-0 overflow-auto border-r border-slate-200 bg-slate-50 p-2">
          {PASSPORT_TEMPLATE.sections.map((s) => {
            const t = sectionTally(s);
            return (
              <button key={s.key} onClick={() => { setActive(s.key); setEvidence(null); }} className={`mb-1 block w-full rounded-lg px-3 py-2 text-left ${active === s.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                <div className="text-[13px] font-bold">{s.label}</div>
                <div className={`text-[10.5px] ${active === s.key ? "text-slate-300" : "text-slate-400"}`}>{t.approved}/{t.total} approved{t.missing ? ` · ${t.missing} missing` : ""}{t.conflicts ? ` · ${t.conflicts}⚠` : ""}</div>
              </button>
            );
          })}
        </div>

        <div className="min-w-0 flex-1 overflow-auto bg-slate-100 p-5">
          <div className="mx-auto max-w-[880px] rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[17px] font-extrabold text-slate-900">{section.label}</div>
              <div className="flex items-center gap-2"><CompletionBar t={sectionTally(section)} /><button onClick={approveSection} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700">Approve section</button></div>
            </div>
            <div className="space-y-2.5">
              {section.pool ? (
                (() => {
                  const list = ((data.pools || {})[section.pool] || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
                  const cols = POOL_COLUMNS[section.pool] || [];
                  if (!list.length) return <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-[13px] text-slate-400">No {section.label.toLowerCase()} in this profile.</div>;
                  return list.map((r, i) => (
                    <RecordCard key={r.id} rec={r} columns={cols} first={i === 0} last={i === list.length - 1}
                      onChange={(patch) => update((d) => patchRecord(d, section.pool, r.id, patch))}
                      onMove={(dir) => update((d) => moveRecord(d, section.pool, r.id, dir))}
                      onEvidence={() => setEvidence({ kind: "record", poolKey: section.pool, id: r.id })} />
                  ));
                })()
              ) : (
                (section.fields || []).filter(passes).map((def) => {
                  const field = (data.fields || {})[def.key];
                  return <FieldEditor key={def.key} field={field} def={def} active={evidence && evidence.key === def.key}
                    onChange={(patch) => update((d) => patchField(d, def.key, patch))} onEvidence={() => setEvidence({ kind: "field", key: def.key })} />;
                })
              )}
            </div>
          </div>
        </div>

        {evidence && <div className="w-96 flex-shrink-0"><EvidencePanel item={evItem} onClose={() => setEvidence(null)} onPatch={evPatch} /></div>}
      </div>

      {showImport && <BlueprintImportModal row={row} data={data} expectedType="passport" onApply={(next) => { setData(next); setDirty(true); setShowImport(false); }} onClose={() => setShowImport(false)} />}
      {preview && <PreviewModal pp={preview.pp} slug={companySlug} booth={false} onClose={() => setPreview(null)} />}
      {pubDiff && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-6" onClick={() => !publishing && setPubDiff(null)}>
          <div className="w-full max-w-[640px] rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-[16px] font-extrabold text-slate-900">Publish to the app profile?</div>
            <div className="mt-1 text-[13px] text-slate-500">Overlays approved edits onto the live profile (+ recompiles pp). A one-click revert snapshot is saved first.</div>
            <div className="mt-3 rounded-xl border border-slate-200 p-3 text-[12.5px]">
              {!pubDiff.conferenceChanged
                ? <div className="font-bold text-emerald-700">✓ conference unchanged — the iPad booth stays identical.</div>
                : <div className="font-bold text-rose-700">⚠ conference would change (blocked — Passport publish must not touch the booth).</div>}
              <div className="mt-2 font-semibold text-slate-700">{pubDiff.changes.length} profile section(s) will change:</div>
              <div className="mt-1 max-h-52 overflow-auto font-mono text-[11.5px] text-slate-500">{pubDiff.changes.map((c, i) => <div key={i}>{c}</div>)}</div>
              {pubDiff.changes.length === 0 && <div className="text-slate-400">No approved changes yet — approve fields first.</div>}
            </div>
            {pubMsg && <div className="mt-2 text-[13px] font-semibold text-rose-600">{pubMsg}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPubDiff(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600">Cancel</button>
              <button onClick={doPublish} disabled={publishing || pubDiff.changes.length === 0 || pubDiff.conferenceChanged}
                className={`rounded-xl px-5 py-2.5 text-[14px] font-bold text-white ${publishing || pubDiff.changes.length === 0 || pubDiff.conferenceChanged ? "bg-slate-300" : "bg-emerald-600 hover:bg-emerald-700"}`}>{publishing ? "Publishing…" : "Publish"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
