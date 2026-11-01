// Services — what MineEx offers beyond the software.
//
// a21: a card opens a short request form. The request is stored (migration
// 0086, through /api/service-request, which also emails support@mineex.ca) and
// listed below with its status -- requested, in review, quoted, in progress,
// done -- which a MineEx admin moves (Admin > Service requests). Before 0086 is
// applied, or for a role that cannot ask (analyst, viewer), a card is the
// pre-filled email it always was.
//
// There is no pricing, cart or order table in this product, so anything that
// looked like a checkout would be a promise the system cannot keep. A company
// asks, a person answers. "Quoted" is a status and a note, not a price tag.
//
// No prices are shown for the same reason -- none exist in the codebase, and
// inventing one on a page a customer reads is not a small mistake.

import React, { useCallback, useEffect, useState } from "react";
import {
  Presentation, ShieldCheck, Globe, FileBarChart, PenTool, Camera, ArrowUpRight, Loader2, X, Check, Mail,
} from "lucide-react";
import {
  listCompanyRequests, createRequest, canRequest, NotProvisioned,
  STATUSES, STATUS_LABEL, SERVICE_LABEL, MAX_DETAILS,
} from "../lib/serviceRequests.js";
import { formatDate, isValidDate } from "../lib/dates.js";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

const SUPPORT = "support@mineex.ca";

// Names and descriptions are the company's own wording, not a paraphrase.
const SERVICES = [
  { id: "conference",   Icon: Presentation, title: "Conference Mode",
    body: "Interactive conference experiences" },
  { id: "managed",      Icon: ShieldCheck,  title: "Fully Managed MineEx",
    body: "Done-for-you MineEx presence" },
  { id: "websites",     Icon: Globe,        title: "Investor Websites",
    body: "Custom mining-company websites" },
  { id: "presentations", Icon: FileBarChart, title: "Corporate Presentations",
    body: "Investor/corporate decks" },
  { id: "brand",        Icon: PenTool,      title: "Brand & Logo Design",
    body: "Corporate identity and branding" },
  { id: "photography",  Icon: Camera,       title: "Photography",
    body: "Project, site, team and corporate photography" },
];

function mailtoFor(service, companyName) {
  const subject = `MineEx — ${service.title}`;
  const body = [
    `I'd like to know more about ${service.title}.`,
    "",
    companyName ? `Company: ${companyName}` : "",
    "",
    "",
  ].join("\n");
  return `mailto:${SUPPORT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const TILE = `group flex h-[168px] w-full flex-col items-start p-5 text-left
              transition-all duration-[170ms] ease-out hover:-translate-y-0.5 hover:border-slate-200
              focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40
              sm:w-[calc(50%-0.5rem)] lg:w-[268px] ${CARD}`;

function TileBody({ service }) {
  return (
    <>
      <span className="flex w-full items-start justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600 transition-colors duration-[170ms] group-hover:bg-blue-50 group-hover:text-blue-600">
          <service.Icon size={21} strokeWidth={1.8} />
        </span>
        <ArrowUpRight
          size={16}
          className="mt-3 -translate-x-1 text-slate-300 opacity-0 transition-all duration-[170ms] group-hover:translate-x-0 group-hover:text-blue-500 group-hover:opacity-100"
        />
      </span>
      <span className="mt-4 block text-[16.5px] font-bold leading-tight tracking-tight text-slate-900">{service.title}</span>
      <span className="mt-1.5 block text-[13px] leading-snug text-slate-500">{service.body}</span>
    </>
  );
}

function ServiceTile({ service, companyName, onRequest }) {
  if (onRequest) {
    return <button type="button" onClick={() => onRequest(service)} className={TILE}><TileBody service={service} /></button>;
  }
  return <a href={mailtoFor(service, companyName)} className={TILE}><TileBody service={service} /></a>;
}

function RequestForm({ service, companyName, onCancel, onSent }) {
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const send = async () => {
    setBusy(true); setErr("");
    try { await onSent(details); }
    catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };
  return (
    <div className={`mt-5 max-w-[836px] p-5 ${CARD}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[16px] font-bold tracking-tight text-slate-900">Request: {service.title}</div>
          <p className="mt-0.5 text-[13px] text-slate-500">Tell us what you have in mind. A person replies with details and pricing.</p>
        </div>
        <button onClick={onCancel} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
      </div>
      <textarea
        value={details} onChange={(e) => setDetails(e.target.value)} maxLength={MAX_DETAILS} rows={4} autoFocus
        placeholder="Timing, scope, an event you are preparing for…"
        className="mt-4 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[13.5px] text-slate-800 outline-none focus:border-slate-300 focus:bg-white" />
      {err && <p className="mt-2 text-[12.5px] font-semibold text-rose-600">{err}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={send} disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : null} Send request
        </button>
        <a href={mailtoFor(service, companyName)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-400 hover:text-slate-700">
          <Mail size={13} /> Email instead
        </a>
      </div>
    </div>
  );
}

const fmt = (iso) => formatDate(iso);

function StatusSteps({ status }) {
  const at = STATUSES.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label={`Status: ${STATUS_LABEL[status] || status}`}>
      {STATUSES.map((s, i) => (
        <li key={s} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
          i === at ? "bg-blue-600 text-white" : i < at ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-400"}`}>
          {i < at && <Check size={11} strokeWidth={3} />}{STATUS_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}

function RequestList({ requests }) {
  if (!requests.length) {
    return <p className="mt-3 text-[13px] text-slate-400">No requests yet. Choose a service above to ask for a quote or a consultation.</p>;
  }
  return (
    <ul className="mt-3 flex max-w-[836px] flex-col gap-3">
      {requests.map((r) => (
        <li key={r.id} className={`p-4 ${CARD}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[14.5px] font-bold text-slate-900">{SERVICE_LABEL[r.service] || r.service}</span>
            <span className="text-[11.5px] text-slate-400">Requested {fmt(r.created_at)}{isValidDate(r.status_changed_at) ? ` · updated ${fmt(r.status_changed_at)}` : ""}</span>
          </div>
          <div className="mt-2.5"><StatusSteps status={r.status} /></div>
          {r.details && <p className="mt-2.5 whitespace-pre-wrap text-[13px] leading-snug text-slate-500">{r.details}</p>}
          {r.admin_note && (
            <p className="mt-2.5 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2 text-[13px] leading-snug text-slate-700 ring-1 ring-inset ring-slate-100">
              <span className="font-bold">MineEx: </span>{r.admin_note}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function Services({ company }) {
  const companyId = company?.id || "";
  const allowed = canRequest(company?.role || "owner");
  // null = loading; false = 0086 not applied (cards stay emails)
  const [requests, setRequests] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [open, setOpen] = useState(null);
  const [sentNote, setSentNote] = useState("");

  const load = useCallback(async () => {
    if (!companyId) { setRequests(false); return; }
    try { setRequests(await listCompanyRequests(companyId)); setLoadErr(""); }
    catch (e) {
      if (e instanceof NotProvisioned) setRequests(false);
      else { setRequests([]); setLoadErr(String(e.message || e)); }
    }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const tracked = requests !== false && requests !== null;
  const onRequest = tracked && allowed ? (s) => { setOpen(s); setSentNote(""); } : null;

  const send = async (details) => {
    const out = await createRequest({ companyId, service: open.id, details });
    setOpen(null);
    setSentNote(out.emailed ? "Request sent. The MineEx team has been emailed and will be in touch."
      : "Request recorded. The MineEx team will see it in their queue.");
    await load();
  };

  return (
    <div>
      <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Services</h1>
      <p className="mt-1 text-[14px] text-slate-500">
        Services MineEx provides beyond the platform. Choose one and we'll be in touch.
      </p>

      <div className="mt-5 flex max-w-[836px] flex-wrap gap-4">
        {SERVICES.map((s) => (
          <ServiceTile key={s.id} service={s} companyName={company?.name || ""} onRequest={onRequest} />
        ))}
      </div>

      {open && <RequestForm service={open} companyName={company?.name || ""} onCancel={() => setOpen(null)} onSent={send} />}
      {sentNote && <p className="mt-4 max-w-[836px] text-[13px] font-semibold text-emerald-700">{sentNote}</p>}

      {requests === null && <div className="mt-8 text-slate-300"><Loader2 size={18} className="animate-spin" /></div>}
      {tracked && (
        <section className="mt-8">
          <h2 className="text-[16px] font-bold tracking-tight text-slate-900">Your requests</h2>
          {loadErr ? <p className="mt-3 text-[13px] font-semibold text-rose-600">{loadErr}</p> : <RequestList requests={requests} />}
        </section>
      )}

      <p className="mt-6 max-w-[836px] text-[12px] leading-relaxed text-slate-400">
        {tracked && allowed
          ? "Each request goes to the MineEx team and appears above with its status. Nothing is ordered or charged from this page — a person replies with details and pricing."
          : tracked
          ? `Your role can see requests but not send them; ask an owner or admin, or email ${SUPPORT}. Nothing is ordered or charged from this page.`
          : `Each opens an email to ${SUPPORT} with your company name filled in. Nothing is ordered or charged from this page — a person replies with details and pricing.`}
      </p>
    </div>
  );
}
