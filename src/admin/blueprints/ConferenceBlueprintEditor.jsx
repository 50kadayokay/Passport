// Conference Blueprint editor — config-driven from CONFERENCE_TEMPLATE (11 chapters).
// Layout (booth visual proof) / Content (grouped, searchable) / Evidence modes.
// Production ergonomics: search, review-queue filter, bulk approve, keyboard nav.
// Edits Blueprint draft values only; persists to company_blueprints. Never touches
// companies.profile / profile.conference.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CONFERENCE_TEMPLATE, CONFERENCE_FIELD_COUNT, CONFERENCE_POOL_COUNT } from "../../lib/blueprints/conferenceTemplate.js";
import { tally, IS_MISSING } from "../../lib/blueprints/types.js";
import { saveBlueprintData, setBlueprintStatus } from "../../lib/blueprints/blueprintStorage.js";
import {
  FieldEditor, RecordCard, EvidencePanel, CompletionBar, GroupHeader,
  patchField, patchRecord, moveRecord, bulkApproveFields, bulkApproveRecords,
  computeCompletion, downloadJson, evidenceReport, missingReport, BlueprintImportModal,
} from "./BlueprintShared.jsx";
import LayoutPreview from "./LayoutPreview.jsx";

const MODES = [["layout", "Layout"], ["content", "Content"], ["evidence", "Evidence"]];
const S = (x) => (x == null ? "" : String(x));

export default function ConferenceBlueprintEditor({ row, onBack, onSaved }) {
  const [data, setData] = useState(row.data || { fields: {}, pools: {}, pageOrder: CONFERENCE_TEMPLATE.pageOrder.slice() });
  const [status, setStatus] = useState(row.status || "draft");
  const [mode, setMode] = useState("content");
  const [evidence, setEvidence] = useState(null); // { kind:'field'|'record', key?, poolKey?, id? }
  const [q, setQ] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [showImport, setShowImport] = useState(false);
  const searchRef = useRef(null);

  const pageOrder = (Array.isArray(data.pageOrder) && data.pageOrder.length) ? data.pageOrder : CONFERENCE_TEMPLATE.pageOrder;
  const pageByKey = useMemo(() => Object.fromEntries(CONFERENCE_TEMPLATE.pages.map((p) => [p.key, p])), []);
  const [activeKey, setActiveKey] = useState(pageOrder[0]);
  const page = pageByKey[activeKey] || CONFERENCE_TEMPLATE.pages[0];

  const update = (fn) => { setData((d) => fn(d)); setDirty(true); };
  const pageTally = (pg) => tally((pg.fields || []).map((f) => (data.fields || {})[f.key]).filter(Boolean), (pg.pools || []).flatMap((pk) => (data.pools || {})[pk] || []));
  const overall = computeCompletion(data);

  // keyboard: j/k pages, 1/2/3 modes, / search
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target; if (t && /input|textarea|select/i.test(t.tagName)) { if (e.key === "Escape") t.blur(); return; }
      const i = pageOrder.indexOf(activeKey);
      if (e.key === "j" && i < pageOrder.length - 1) setActiveKey(pageOrder[i + 1]);
      else if (e.key === "k" && i > 0) setActiveKey(pageOrder[i - 1]);
      else if (e.key === "1") setMode("layout");
      else if (e.key === "2") setMode("content");
      else if (e.key === "3") setMode("evidence");
      else if (e.key === "/") { e.preventDefault(); searchRef.current && searchRef.current.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageOrder, activeKey]);

  const movePage = (dir) => {
    const idx = pageOrder.indexOf(activeKey), j = idx + dir;
    if (idx < 0 || j < 0 || j >= pageOrder.length) return;
    const next = pageOrder.slice(); const t = next[idx]; next[idx] = next[j]; next[j] = t;
    update((d) => ({ ...d, pageOrder: next }));
  };

  const evItem = evidence ? (evidence.kind === "field" ? (data.fields || {})[evidence.key] : ((data.pools || {})[evidence.poolKey] || []).find((r) => S(r.id) === S(evidence.id))) : null;
  const evPatch = (patch) => { if (!evidence) return; update((d) => evidence.kind === "field" ? patchField(d, evidence.key, patch) : patchRecord(d, evidence.poolKey, evidence.id, patch)); };

  const save = async () => { setSaving(true); setMsg(""); try { const saved = await saveBlueprintData(row.id, data); setDirty(false); setMsg("Saved."); onSaved && onSaved(saved); } catch (e) { setMsg(e.message || "Save failed"); } finally { setSaving(false); } };
  const changeStatus = async (s) => { setStatus(s); try { await setBlueprintStatus(row.id, s); } catch (_) {} };

  const approvePage = () => update((d) => {
    let nd = bulkApproveFields(d, (page.fields || []).map((f) => f.key));
    (page.pools || []).forEach((pk) => { const ids = ((d.pools || {})[pk] || []).filter((r) => r.selected).map((r) => S(r.id)); nd = bulkApproveRecords(nd, pk, ids); });
    return nd;
  });

  // grouped + filtered fields for content mode
  const groups = useMemo(() => {
    const g = {}; (page.fields || []).forEach((f) => { (g[f.group] = g[f.group] || []).push(f); }); return g;
  }, [page]);
  const nq = q.trim().toLowerCase();
  const passes = (def) => {
    const f = (data.fields || {})[def.key];
    if (reviewOnly && f && f.approvalStatus === "approved") return false;
    if (!nq) return true;
    return (def.label + " " + def.key + " " + S(f && f.displayValue)).toLowerCase().includes(nq);
  };

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2.5 border-b border-slate-200 px-5 py-3">
        <button onClick={onBack} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-bold text-slate-600 hover:text-slate-900">← Blueprints</button>
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold text-slate-900">Conference Blueprint <span className="font-mono text-[11px] font-medium text-slate-400">{row.template_version}</span></div>
          <div className="text-[11px] text-slate-400">{CONFERENCE_FIELD_COUNT} fields · {CONFERENCE_POOL_COUNT} pools · 11 chapters · saves to company_blueprints only</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search  ( / )" className="w-44 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] outline-none focus:border-slate-400" />
          <button onClick={() => setReviewOnly((v) => !v)} className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-bold ${reviewOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600"}`}>Review queue</button>
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            {MODES.map(([m, label]) => <button key={m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1 text-[12.5px] font-bold ${mode === m ? "bg-slate-900 text-white" : "text-slate-500"}`}>{label}</button>)}
          </div>
          <select value={status} onChange={(e) => changeStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-600">
            <option value="draft">draft</option><option value="in_review">in review</option><option value="approved">approved</option><option value="archived">archived</option>
          </select>
          <button onClick={() => setShowImport(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-bold text-slate-600 hover:text-slate-900">Import</button>
          <div className="relative group">
            <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-bold text-slate-600 hover:text-slate-900">Export ▾</button>
            <div className="absolute right-0 z-20 hidden min-w-[180px] rounded-xl border border-slate-200 bg-white p-1 shadow-xl group-hover:block">
              <button onClick={() => downloadJson(`${row.company_id}-conference-blueprint.json`, data)} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-slate-50">Blueprint JSON</button>
              <button onClick={() => downloadJson(`${row.company_id}-conference-evidence.json`, evidenceReport(data))} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-slate-50">Evidence report</button>
              <button onClick={() => downloadJson(`${row.company_id}-conference-missing.json`, missingReport(data))} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-slate-50">Missing report</button>
            </div>
          </div>
          <button onClick={save} disabled={saving || !dirty} className={`rounded-lg px-4 py-1.5 text-[13px] font-bold text-white ${saving || !dirty ? "bg-slate-300" : "bg-emerald-600 hover:bg-emerald-700"}`}>{saving ? "Saving…" : "Save"}</button>
          {msg && <span className="text-[12px] font-semibold text-slate-500">{msg}</span>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* page nav */}
        <div className="w-56 flex-shrink-0 overflow-auto border-r border-slate-200 bg-slate-50 p-2">
          {pageOrder.map((key, i) => {
            const pg = pageByKey[key]; if (!pg) return null; const t = pageTally(pg);
            return (
              <div key={key} className={`mb-1 rounded-lg ${activeKey === key ? "bg-slate-900" : "hover:bg-slate-100"}`}>
                <button onClick={() => { setActiveKey(key); setEvidence(null); }} className="block w-full px-3 py-2 text-left">
                  <div className={`text-[13px] font-bold ${activeKey === key ? "text-white" : "text-slate-700"}`}>{i + 1}. {pg.label}</div>
                  <div className={`text-[10.5px] ${activeKey === key ? "text-slate-300" : "text-slate-400"}`}>{t.approved}/{t.total} approved{t.needsWriting ? ` · ${t.needsWriting} to write` : ""}{t.conflicts ? ` · ${t.conflicts}⚠` : ""}</div>
                </button>
                {activeKey === key && (
                  <div className="flex gap-1 px-3 pb-2">
                    <button disabled={i === 0} onClick={() => movePage(-1)} className="rounded border border-slate-600 px-1.5 text-[11px] text-slate-200 disabled:opacity-30">↑</button>
                    <button disabled={i === pageOrder.length - 1} onClick={() => movePage(1)} className="rounded border border-slate-600 px-1.5 text-[11px] text-slate-200 disabled:opacity-30">↓</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* canvas */}
        <div className="min-w-0 flex-1 overflow-auto bg-slate-100 p-5">
          <div className="mx-auto max-w-[1100px]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[13px] font-bold text-slate-700">Chapter {page.index} · {page.label}</div>
              <div className="flex items-center gap-2"><CompletionBar t={pageTally(page)} /><button onClick={approvePage} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700">Approve page</button></div>
            </div>

            {mode === "layout" ? (
              <div className="overflow-hidden rounded-2xl border border-slate-800 shadow-lg">
                <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-600" /><span className="h-2.5 w-2.5 rounded-full bg-slate-600" /><span className="h-2.5 w-2.5 rounded-full bg-slate-600" /><span className="ml-2 text-[11px] text-slate-400">iPad landscape · visual proof (approximate)</span></div>
                <LayoutPreview page={page} data={data} />
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                {Object.entries(groups).map(([group, defs]) => {
                  const visible = defs.filter(passes);
                  if (!visible.length) return null;
                  const gt = tally(defs.map((d) => (data.fields || {})[d.key]).filter(Boolean), []);
                  const isCol = collapsed[group];
                  return (
                    <div key={group}>
                      <GroupHeader label={group} t={gt} collapsed={isCol} onToggle={() => setCollapsed((c) => ({ ...c, [group]: !c[group] }))}
                        onApproveAll={() => update((d) => bulkApproveFields(d, defs.map((x) => x.key)))} />
                      {!isCol && <div className="space-y-2">{visible.map((def) => {
                        const field = (data.fields || {})[def.key];
                        return <FieldEditor key={def.key} field={field} def={def} active={evidence && evidence.key === def.key}
                          onChange={(patch) => update((d) => patchField(d, def.key, patch))} onEvidence={() => setEvidence({ kind: "field", key: def.key })} />;
                      })}</div>}
                    </div>
                  );
                })}
                {(page.pools || []).map((pk) => {
                  const poolDef = CONFERENCE_TEMPLATE.pools[pk] || { label: pk, columns: [] };
                  const list = ((data.pools || {})[pk] || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
                  return (
                    <div key={pk} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{poolDef.label} · {list.filter((r) => r.selected).length}/{list.length} selected</div>
                        <button onClick={() => update((d) => bulkApproveRecords(d, pk, list.filter((r) => r.selected).map((r) => S(r.id))))} className="rounded-md border border-slate-200 px-2 py-0.5 text-[10.5px] font-bold text-slate-500 hover:text-emerald-700">approve selected</button>
                      </div>
                      {list.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-[12.5px] text-slate-400">No records projected — future-proof placeholder pool.</div> : (
                        <div className="space-y-2">{list.map((r, i) => (
                          <RecordCard key={r.id} rec={r} columns={poolDef.columns} first={i === 0} last={i === list.length - 1}
                            onChange={(patch) => update((d) => patchRecord(d, pk, r.id, patch))}
                            onMove={(dir) => update((d) => moveRecord(d, pk, r.id, dir))}
                            onEvidence={() => setEvidence({ kind: "record", poolKey: pk, id: r.id })} />
                        ))}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {(mode === "evidence" || evidence) && mode !== "layout" && <div className="w-96 flex-shrink-0"><EvidencePanel item={evItem} onClose={() => setEvidence(null)} onPatch={evPatch} /></div>}
      </div>

      {showImport && <BlueprintImportModal row={row} data={data} expectedType="conference" onApply={(next) => { setData(next); setDirty(true); setShowImport(false); }} onClose={() => setShowImport(false)} />}
    </div>
  );
}
