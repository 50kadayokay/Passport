// Mission Control — Delivery operations (D22 Phase 4). Platform admins only:
// everything here comes from /api/ops, which refuses anyone else. Shows the
// dispatcher's health and last successful run, the outbox by state, open
// alerts (acknowledge / resolve), dead letters with their full error and a
// single, confirmed, version-checked replay, and the delivery history.
// There is deliberately no "replay all": one delivery at a time.
import React, { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock, X, RotateCcw } from "lucide-react";
import { authHeaders } from "../lib/auth.js";

const CARD = "rounded-2xl border border-slate-200 bg-white";
const LISTENERS = {
  feed_projection_v1: "Investor feed", profile_timeline_v1: "Pro Profile timeline",
  in_app_notifications_v1: "Follower notifications", mineiq_facts_v1: "MineIQ", device_push_v1: "Mobile push",
  // S2's content fan-out (api/_listeners.js, 0088): the same record to the
  // company's website and to its Conference booth.
  site_content_v1: "Company website", conference_content_v1: "Conference booth",
};
const EVENTS = { PUBLICATION_PUBLISHED: "Published", PUBLICATION_REVISED: "Corrected", PUBLICATION_UNPUBLISHED: "Unpublished" };
const STATUS_UI = {
  succeeded: ["Delivered", "bg-emerald-50 text-emerald-700"], pending: ["Pending", "bg-slate-100 text-slate-600"],
  processing: ["Processing", "bg-blue-50 text-blue-700"], failed: ["Retrying", "bg-amber-50 text-amber-700"], dead: ["Dead letter", "bg-rose-50 text-rose-700"],
};
const TABS = [
  { id: "dead", label: "Dead letters", status: "dead" },
  { id: "retrying", label: "Retrying", status: "failed" },
  { id: "pending", label: "Pending", status: "pending,processing" },
  { id: "history", label: "History" },
];

const ago = (iso) => {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
};
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "—");
const secs = (n) => (n == null ? "—" : n < 120 ? `${n}s` : n < 7200 ? `${Math.round(n / 60)}m` : `${Math.round(n / 3600)}h`);

async function api(method, { query, body } = {}) {
  const h = await authHeaders();
  const qs = query ? `?${new URLSearchParams(query)}` : "";
  const r = await fetch(`/api/ops${qs}`, { method, headers: { ...h, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.reason || j.error || `HTTP ${r.status}`); e.status = r.status; e.body = j; throw e; }
  return j;
}

function Chip({ status }) {
  const [label, cls] = STATUS_UI[status] || [status, "bg-slate-100 text-slate-600"];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>;
}
function Notice({ tone = "info", children, onClose }) {
  const cls = tone === "error" ? "bg-rose-50 text-rose-800" : tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-blue-50 text-blue-800";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-xl px-4 py-3 text-[13px] font-medium ${cls}`}>
      <span className="flex-1">{children}</span>
      {onClose && <button onClick={onClose} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X size={14} /></button>}
    </div>
  );
}

function Health({ s }) {
  const h = s.health || {};
  const tone = h.ok ? "text-emerald-600" : "text-rose-600";
  return (
    <div className={`grid gap-4 p-5 sm:grid-cols-3 ${CARD}`} data-testid="ops-health">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Dispatcher</p>
        <p className={`mt-1 flex items-center gap-1.5 text-[15px] font-bold ${tone}`}>
          {h.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {h.ok ? "Running" : h.last_run_age_seconds == null ? "No run recorded" : "Stalled"}
        </p>
        <p className="mt-0.5 text-[12px] text-slate-500">Last run {h.last_run_age_seconds == null ? "never" : `${secs(h.last_run_age_seconds)} ago`}{h.last_trigger ? ` (${h.last_trigger})` : ""}</p>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Last successful run</p>
        <p className="mt-1 text-[15px] font-bold text-slate-800">{s.last_success ? ago(s.last_success.finished_at) : "None recorded"}</p>
        <p className="mt-0.5 text-[12px] text-slate-500">{s.last_success ? `${when(s.last_success.finished_at)} · ${s.last_success.trigger}` : "No run has finished without a listener error."}</p>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Scheduler</p>
        <p className="mt-1 text-[15px] font-bold text-slate-800">{s.last_cron ? ago(s.last_cron.finished_at) : "Not active"}</p>
        <p className="mt-0.5 text-[12px] text-slate-500">{s.last_cron ? "Last scheduled run" : "No scheduled run recorded. Delivery relies on publish-time nudges."}</p>
      </div>
    </div>
  );
}

function Counts({ s }) {
  const t = s.totals || {};
  const rows = Object.entries(s.by_listener || {});
  return (
    <div className={`p-5 ${CARD}`}>
      <div className="flex flex-wrap gap-5 text-[13px]">
        {["dead", "failed", "pending", "processing", "succeeded"].map((k) => (
          <div key={k}><Chip status={k} /> <span className="ml-1 font-bold tabular-nums text-slate-800" data-total={k}>{t[k] ?? "—"}</span></div>
        ))}
      </div>
      {rows.length > 0 && (
        <table className="mt-4 w-full text-[12.5px]">
          <thead><tr className="text-left text-slate-400"><th className="py-1 font-semibold">Destination</th><th className="font-semibold">Pending</th><th className="font-semibold">Processing</th><th className="font-semibold">Retrying</th><th className="font-semibold">Dead</th></tr></thead>
          <tbody>
            {rows.map(([l, c]) => (
              <tr key={l} className="border-t border-slate-100 tabular-nums text-slate-700">
                <td className="py-1.5">{LISTENERS[l] || l}</td><td>{c.pending}</td><td>{c.processing}</td><td>{c.failed}</td><td className={c.dead ? "font-bold text-rose-600" : ""}>{c.dead}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Alerts({ alerts, onAction, busy }) {
  const open = alerts.filter((a) => !a.resolved_at), closed = alerts.filter((a) => a.resolved_at);
  return (
    <div className={`p-5 ${CARD}`} data-testid="ops-alerts">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Alerts</p>
      {!open.length && <p className="mt-2 text-[13px] text-slate-500">No open alerts.</p>}
      <ul className="mt-2 space-y-2">
        {open.map((a) => (
          <li key={a.condition} className="flex flex-wrap items-center gap-3 rounded-xl bg-rose-50/60 px-3 py-2.5" data-condition={a.condition}>
            <AlertTriangle size={15} className="text-rose-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-slate-800">{a.condition.replace(/_/g, " ")}</p>
              <p className="text-[12px] text-slate-500">
                Since {when(a.first_seen)} · {Object.entries(a.detail || {}).filter(([k]) => !/acknowledged|resolved_by/.test(k)).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ")}
                {a.detail && a.detail.acknowledged_at ? ` · acknowledged by ${a.detail.acknowledged_by} ${ago(a.detail.acknowledged_at)} (reminders paused)` : ""}
              </p>
            </div>
            {!(a.detail && a.detail.acknowledged_at) && (
              <button disabled={!!busy} onClick={() => onAction("acknowledge", a.condition)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 hover:border-slate-300 disabled:opacity-50">Acknowledge</button>
            )}
            <button disabled={!!busy} onClick={() => onAction("resolve", a.condition)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-slate-800 disabled:opacity-50">Resolve</button>
          </li>
        ))}
      </ul>
      {closed.length > 0 && (
        <p className="mt-3 text-[12px] text-slate-400">Resolved: {closed.map((a) => `${a.condition.replace(/_/g, " ")} (${ago(a.resolved_at)})`).join(" · ")}</p>
      )}
    </div>
  );
}

function DeliveryDetail({ id, onClose, onReplayed }) {
  const [d, setD] = useState(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    setErr("");
    try { setD(await api("GET", { query: { view: "delivery", id } })); } catch (e) { setErr(e.message); }
  }, [id]);
  useEffect(() => { setD(null); setMsg(null); load(); }, [load]);
  const replay = async () => {
    const r = d.replay;
    const text = `Replay this delivery?\n\n${LISTENERS[d.delivery.listener] || d.delivery.listener} · ${d.publication ? d.publication.headline : "release"} (${d.company ? d.company.name : ""})\n\n${r.warnings.map((w) => `• ${w}`).join("\n")}`;
    if (!window.confirm(text)) return;
    setBusy(true); setMsg(null);
    try {
      await api("POST", { body: { action: "replay", delivery_id: d.delivery.id, expected_updated_at: d.delivery.updated_at, confirm: true } });
      // Report what the delivery IS now, not a guess: the nudge's short timeout
      // says nothing about whether the dispatcher has already run it.
      const fresh = await api("GET", { query: { view: "delivery", id } });
      setD(fresh);
      const st = fresh.delivery.status;
      setMsg(st === "succeeded" ? { tone: "ok", text: "Replayed and delivered." }
        : st === "dead" ? { tone: "error", text: "Replayed, but the extra attempt failed. It is a dead letter again; see the error above." }
        : { tone: "ok", text: `Replayed. The delivery is ${st === "failed" ? "retrying" : st}; it runs on the next dispatcher pass.` });
      onReplayed && onReplayed();
    } catch (e) { setMsg({ tone: "error", text: e.message }); await load(); } finally { setBusy(false); }
  };
  return (
    <div className={`p-5 ${CARD}`} data-testid="ops-detail">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Delivery</p>
        <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
      </div>
      {!d && !err && <p className="mt-3 flex items-center gap-2 text-[13px] text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading…</p>}
      {err && <div className="mt-3"><Notice tone="error">{err}</Notice></div>}
      {d && (
        <div className="mt-3 space-y-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <Chip status={d.delivery.status} />
            <span className="font-bold text-slate-800">{LISTENERS[d.delivery.listener] || d.delivery.listener}</span>
            <span className="text-slate-400">· {d.delivery.attempts} attempt{d.delivery.attempts === 1 ? "" : "s"} · updated {when(d.delivery.updated_at)}</span>
          </div>
          <p className="text-slate-600">
            <b>{d.company ? d.company.name : "Unknown company"}</b> · {d.publication ? `“${d.publication.headline || "Untitled"}” (${d.publication.status})` : "release no longer exists"}
            <br />{d.event ? `${EVENTS[d.event.event_type] || d.event.event_type} event, ${when(d.event.created_at)}` : "event missing"}
          </p>
          {d.delivery.last_error && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Last error (internal)</p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[12px] text-slate-700" data-testid="ops-error">{d.delivery.last_error}</pre>
            </div>
          )}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Other destinations for this event</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {d.siblings.map((x) => <li key={x.id} className="flex items-center gap-1.5 text-[12px] text-slate-600">{LISTENERS[x.listener] || x.listener} <Chip status={x.status} /></li>)}
            </ul>
          </div>
          {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
          {d.replay.allowed ? (
            <div className="rounded-xl border border-slate-200 p-3">
              <ul className="list-disc space-y-1 pl-4 text-[12px] text-slate-500">{d.replay.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              <button onClick={replay} disabled={busy} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-[12.5px] font-bold text-white hover:bg-slate-800 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Replay this delivery
              </button>
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[12.5px] text-slate-500" data-testid="ops-not-replayable">Not replayable: {d.replay.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryList({ status, companyId, onOpen, openId, reloadKey }) {
  const [list, setList] = useState(null), [next, setNext] = useState(null), [err, setErr] = useState(""), [more, setMore] = useState(false);
  const load = useCallback(async (before) => {
    setErr("");
    try {
      const out = await api("GET", { query: { view: "deliveries", status, limit: "50", ...(companyId ? { company: companyId } : {}), ...(before ? { before } : {}) } });
      setList((l) => (before ? [...(l || []), ...out.deliveries] : out.deliveries)); setNext(out.next_before);
    } catch (e) { setErr(e.message); if (!before) setList([]); }
  }, [status, companyId]);
  useEffect(() => { setList(null); load(); }, [load, reloadKey]);
  if (list === null) return <p className="flex items-center gap-2 p-5 text-[13px] text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading deliveries…</p>;
  return (
    <div>
      {err && <div className="p-4"><Notice tone="error">{err} <button onClick={() => load()} className="ml-2 underline">Try again</button></Notice></div>}
      {!err && !list.length && <p className="p-5 text-[13px] text-slate-500" data-testid="ops-empty">Nothing here.</p>}
      <ul className="divide-y divide-slate-100">
        {list.map((d) => (
          <li key={d.id}>
            <button onClick={() => onOpen(d.id)} data-delivery={d.id}
              className={`flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-slate-50 ${openId === d.id ? "bg-slate-50" : ""}`}>
              <Chip status={d.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-slate-800">{d.publication ? d.publication.headline || "Untitled" : "Release removed"}</span>
                <span className="block text-[12px] text-slate-500">{d.company ? d.company.name : "—"} · {LISTENERS[d.listener] || d.listener} · {EVENTS[d.event.event_type] || d.event.event_type} · {d.attempts} attempts · {ago(d.updated_at)}</span>
                {d.last_error && <span className="mt-0.5 block truncate text-[11.5px] text-rose-600/80">{d.last_error}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {next && (
        <button disabled={more} onClick={async () => { setMore(true); await load(next); setMore(false); }} className="m-4 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:border-slate-300 disabled:opacity-50">
          {more ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

function History({ companyId, onOpen }) {
  const [list, setList] = useState(null), [next, setNext] = useState(null), [err, setErr] = useState("");
  const load = useCallback(async (before) => {
    setErr("");
    try {
      const out = await api("GET", { query: { view: "history", limit: "25", ...(companyId ? { company: companyId } : {}), ...(before ? { before } : {}) } });
      setList((l) => (before ? [...(l || []), ...out.events] : out.events)); setNext(out.next_before);
    } catch (e) { setErr(e.message); if (!before) setList([]); }
  }, [companyId]);
  useEffect(() => { setList(null); load(); }, [load]);
  if (list === null) return <p className="flex items-center gap-2 p-5 text-[13px] text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading history…</p>;
  return (
    <div>
      {err && <div className="p-4"><Notice tone="error">{err}</Notice></div>}
      {!err && !list.length && <p className="p-5 text-[13px] text-slate-500">No delivery history yet.</p>}
      <ul className="divide-y divide-slate-100">
        {list.map((e) => (
          <li key={e.id} className="px-5 py-3">
            <p className="text-[13px] font-semibold text-slate-800">{e.publication ? e.publication.headline || "Untitled" : "Release removed"}</p>
            <p className="text-[12px] text-slate-500">{e.company ? e.company.name : "—"} · {EVENTS[e.event_type] || e.event_type} · {when(e.created_at)}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {e.deliveries.length === 0 && <span className="text-[12px] text-slate-400"><Clock size={12} className="mr-1 inline" />Not picked up yet</span>}
              {e.deliveries.map((d) => (
                <button key={d.id} onClick={() => onOpen(d.id)} className="flex items-center gap-1 rounded-full border border-slate-100 py-0.5 pl-2 pr-0.5 text-[11.5px] text-slate-600 hover:border-slate-300">
                  {LISTENERS[d.listener] || d.listener} <Chip status={d.status} />
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {next && <button onClick={() => load(next)} className="m-4 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:border-slate-300">Load more</button>}
    </div>
  );
}

export default function DeliveryOps({ companies = [] }) {
  const [s, setS] = useState(null), [err, setErr] = useState(""), [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("dead"), [companyId, setCompanyId] = useState(""), [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState(null), [busy, setBusy] = useState(""), [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { setS(await api("GET", { query: { view: "summary" } })); } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const alertAction = async (action, condition) => {
    if (action === "resolve" && !window.confirm(`Mark "${condition.replace(/_/g, " ")}" resolved?\n\nThis is refused while the condition still holds.`)) return;
    setBusy(condition); setNotice(null);
    try {
      const out = await api("POST", { body: { action, condition } });
      setNotice({ tone: "ok", text: out.already ? `Already ${out.already}.` : action === "acknowledge" ? "Acknowledged. Reminder emails are paused until it resolves." : "Resolved." });
      await load();
    } catch (e) { setNotice({ tone: "error", text: e.message }); } finally { setBusy(""); }
  };
  const refreshAll = async () => { await load(); setReloadKey((k) => k + 1); };
  const t = TABS.find((x) => x.id === tab);

  return (
    <div className="mx-auto max-w-[1100px] space-y-4" data-testid="delivery-ops">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">Delivery operations</h1>
          <p className="mt-1 text-[14px] text-slate-500">Where published releases have actually been delivered. Platform admins only.</p>
        </div>
        <button onClick={refreshAll} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-bold text-slate-600 hover:border-slate-300 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {err && <Notice tone="error">{err} <button onClick={load} className="ml-2 underline">Try again</button></Notice>}
      {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      {!s && !err && <p className="flex items-center gap-2 text-[13px] text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading delivery operations…</p>}

      {s && (
        <>
          <Health s={s} />
          <Alerts alerts={s.alerts || []} onAction={alertAction} busy={busy} />
          <Counts s={s} />
        </>
      )}

      {s && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className={`${CARD} min-w-0`}>
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-3 pt-3">
              {TABS.map((x) => (
                <button key={x.id} onClick={() => { setTab(x.id); setOpenId(null); }} aria-pressed={tab === x.id}
                  className={`rounded-t-lg px-3 py-2 text-[12.5px] font-bold ${tab === x.id ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-800"}`}>
                  {x.label}{x.status && s.totals ? ` (${x.status.split(",").reduce((n, k) => n + (s.totals[k] || 0), 0)})` : ""}
                </button>
              ))}
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Filter by company"
                className="mb-1 ml-auto rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-600">
                <option value="">All companies</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name || c.slug}</option>)}
              </select>
            </div>
            {t.status
              ? <DeliveryList status={t.status} companyId={companyId} onOpen={setOpenId} openId={openId} reloadKey={reloadKey} />
              : <History companyId={companyId} onOpen={setOpenId} />}
          </div>
          <div className="min-w-0">
            {openId
              ? <DeliveryDetail id={openId} onClose={() => setOpenId(null)} onReplayed={refreshAll} />
              : <div className={`p-5 text-[13px] text-slate-500 ${CARD}`}>Select a delivery to see its full error and whether it can be replayed. Replays are one at a time, confirmed, and limited to {s.replay_limit_per_minute} a minute.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
