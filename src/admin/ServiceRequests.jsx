// Admin — Service requests (a21). Platform admins only: the rows come from
// service_requests (migration 0086), whose policy lets every company read only
// its own and lets only platform admins change status and the note. Each
// request moves requested -> in review -> quoted -> in progress -> done; the
// note is what the company sees on its Services page (e.g. the quote summary).
// Not a checkout: nothing here prices or charges anything.
import React, { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import {
  listAllRequests, updateRequest, NotProvisioned, STATUSES, STATUS_LABEL, SERVICE_LABEL, MAX_NOTE,
} from "../lib/serviceRequests.js";

const CARD = "rounded-2xl border border-slate-200 bg-white";
const TONE = {
  requested: "bg-amber-50 text-amber-700", in_review: "bg-blue-50 text-blue-700", quoted: "bg-violet-50 text-violet-700",
  in_progress: "bg-sky-50 text-sky-700", done: "bg-emerald-50 text-emerald-700",
};
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

function Row({ r, onSaved }) {
  const [status, setStatus] = useState(r.status);
  const [note, setNote] = useState(r.admin_note || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dirty = status !== r.status || note !== (r.admin_note || "");
  const save = async () => {
    setBusy(true); setErr("");
    try { onSaved(await updateRequest(r.id, { status, admin_note: note })); }
    catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  };
  return (
    <li className={`p-4 ${CARD}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[14px] font-bold text-slate-900">
          {(r.companies && (r.companies.name || r.companies.slug)) || r.company_id} · {SERVICE_LABEL[r.service] || r.service}
        </span>
        <span className="text-[11.5px] text-slate-400">Requested {when(r.created_at)}</span>
      </div>
      {r.details && <p className="mt-2 whitespace-pre-wrap text-[13px] text-slate-600">{r.details}</p>}
      <div className="mt-3 flex flex-wrap items-start gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-semibold text-slate-800 outline-none focus:border-slate-300">
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE} rows={2}
          placeholder="Note the company will see (quote summary, next step)…"
          className="min-w-[260px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-slate-300 focus:bg-white" />
        <button onClick={save} disabled={!dirty || busy}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-40">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
      </div>
      {err && <p className="mt-2 text-[12px] font-semibold text-rose-600">{err}</p>}
      {Array.isArray(r.history) && r.history.length > 0 && (
        <p className="mt-2 text-[11.5px] text-slate-400">
          {r.history.map((h) => `${STATUS_LABEL[h.status] || h.status} ${when(h.at)}`).join("  →  ")}
        </p>
      )}
    </li>
  );
}

export default function ServiceRequests() {
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setRows(null); setErr("");
    try { setRows(await listAllRequests({ status: filter })); }
    catch (e) { setRows([]); setErr(e instanceof NotProvisioned ? e.message : String(e.message || e)); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const replace = (row) => setRows((cur) => (cur || []).map((r) => (r.id === row.id ? { ...r, ...row } : r)));

  return (
    <div className="mx-auto max-w-[980px] px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight text-slate-900">Service requests</h1>
          <p className="text-[12.5px] text-slate-500">Quote and consultation requests from company portals. Not a checkout.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <button onClick={load} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-800" aria-label="Refresh"><RefreshCw size={15} /></button>
        </div>
      </div>
      {err && <p className="mt-4 text-[13px] font-semibold text-rose-600">{err}</p>}
      {rows === null ? <div className="mt-8 text-slate-300"><Loader2 size={20} className="animate-spin" /></div>
        : !rows.length && !err ? <p className="mt-6 text-[13px] text-slate-400">No requests{filter ? ` with status ${STATUS_LABEL[filter]}` : ""}.</p>
        : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {STATUSES.map((s) => {
                const n = rows.filter((r) => r.status === s).length;
                return n ? <span key={s} className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${TONE[s]}`}>{STATUS_LABEL[s]} {n}</span> : null;
              })}
            </div>
            <ul className="mt-4 flex flex-col gap-3">{rows.map((r) => <Row key={`${r.id}:${r.status}:${r.admin_note}`} r={r} onSaved={replace} />)}</ul>
          </>
        )}
    </div>
  );
}
