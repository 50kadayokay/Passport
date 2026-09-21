// Publish — the company's communications workspace.
//
//   Create · Drafts · Published · Calendar
//
// The CEO is not operating an extraction tool. Extraction is infrastructure, so
// nothing here says "SHA", "parser", "storage path" or "page render". Technical
// detail surfaces only when something genuinely needs attention.
//
// Calendar is visibly disabled rather than faked — scheduling does not exist.

import React, { useState, useEffect, useCallback } from "react";
import {
  Send, FileText, CheckCircle2, Clock, Plus, Loader2, AlertCircle, ArrowLeft,
  Calendar as CalendarIcon, Trash2, ExternalLink,
} from "lucide-react";
import { listDrafts, listPublished, deleteDraft } from "../../lib/publishDrafts.js";
import { profileUrl } from "../../lib/brand.js";
import CreateRelease from "./CreateRelease.jsx";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

const TABS = [
  { id: "create",    label: "Create",    Icon: Plus },
  { id: "drafts",    label: "Drafts",    Icon: FileText },
  { id: "published", label: "Published", Icon: CheckCircle2 },
  { id: "calendar",  label: "Calendar",  Icon: CalendarIcon, disabled: true },
];

const fmtDate = (d) => {
  if (!d) return "";
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-").map(Number);
  if (!y) return s;
  return new Date(Date.UTC(y, (m || 1) - 1, day || 1))
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};
const fmtWhen = (ts) => {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return fmtDate(ts);
};

function Empty({ Icon, title, body, action }) {
  return (
    <div className={`grid place-items-center px-6 py-16 text-center ${CARD}`}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Icon size={22} strokeWidth={2.2} /></span>
      <p className="mt-3 text-[15px] font-bold text-slate-900">{title}</p>
      <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-slate-500">{body}</p>
      {action}
    </div>
  );
}

export default function Publish({ company }) {
  const [tab, setTab] = useState("drafts");
  const [drafts, setDrafts] = useState(null);
  const [published, setPublished] = useState(null);
  const [editing, setEditing] = useState(null);      // draft id being reviewed

  const companyId = company?.id;

  const refresh = useCallback(async () => {
    if (!companyId) return;
    const [d, p] = await Promise.all([listDrafts(companyId), listPublished(companyId)]);
    setDrafts(d); setPublished(p);
  }, [companyId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Reviewing a release takes over the whole workspace — one job, no distractions.
  if (editing || tab === "create") {
    return (
      <CreateRelease
        company={company}
        draftId={editing}
        onExit={() => { setEditing(null); setTab("drafts"); refresh(); }}
        onPublished={() => { setEditing(null); setTab("published"); refresh(); }}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-slate-900">Publish</h1>
          <p className="mt-1.5 text-[15px] text-slate-500">Create, review and distribute company updates from one place.</p>
        </div>
        <button onClick={() => setTab("create")}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-[14px] font-bold text-white transition hover:bg-slate-800 active:scale-[0.99]">
          <Plus size={16} strokeWidth={2.4} /> Create publication
        </button>
      </div>

      {/* At-a-glance counts. Scheduled is shown because the architecture supports
          it, and marked unavailable rather than faked. */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Drafts"    value={drafts === null ? "—" : drafts.length}    Icon={FileText} onClick={() => setTab("drafts")} />
        <Stat label="Published" value={published === null ? "—" : published.length} Icon={CheckCircle2} onClick={() => setTab("published")} />
        <Stat label="Scheduled" value="—" Icon={Clock} muted note="Coming soon" />
      </div>

      {/* Sub-navigation */}
      <div className="mt-6 flex flex-wrap gap-1.5 border-b border-slate-100 pb-3">
        {TABS.map(({ id, label, Icon, disabled }) => {
          const on = tab === id;
          return (
            <button key={id} disabled={disabled}
              onClick={() => !disabled && setTab(id)}
              title={disabled ? "Scheduling isn't available yet" : undefined}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold transition ${
                disabled ? "cursor-default text-slate-300"
                : on ? "bg-blue-50 text-blue-600"
                : "text-slate-600 hover:bg-slate-50"
              }`}>
              <Icon size={14} strokeWidth={2.4} /> {label}
              {disabled && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">Soon</span>}
              {id === "drafts" && drafts?.length ? <span className="rounded-full bg-slate-100 px-1.5 text-[10.5px] font-bold text-slate-500">{drafts.length}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === "drafts" && (
          drafts === null ? <Loading />
          : !drafts.length ? (
            <Empty Icon={FileText} title="No drafts" body="Releases you've uploaded but not yet published will wait here."
              action={<button onClick={() => setTab("create")} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white">Create a publication</button>} />
          ) : (
            <div className="space-y-2.5">
              {drafts.map((d) => {
                const det = d.detected || {};
                const needsDate = !d.published_on;
                return (
                  <div key={d.id} className={`flex flex-wrap items-center gap-4 px-5 py-4 ${CARD}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-extrabold tracking-tight text-slate-900">
                        {det.headline || "Untitled release"}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-slate-400">
                        {d.published_on ? fmtDate(d.published_on) : <span className="font-bold text-amber-600">Date needed</span>}
                        <span className="mx-1.5 text-slate-300">·</span>
                        Prepared {fmtWhen(d.updated_at || d.created_at)}
                      </p>
                    </div>
                    {needsDate && (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-bold text-amber-700">Needs attention</span>
                    )}
                    <button onClick={() => setEditing(d.id)}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-slate-800">Review</button>
                    <button onClick={async () => { if (window.confirm("Delete this draft? The uploaded file stays in your documents.")) { await deleteDraft(d.id); refresh(); } }}
                      title="Delete draft" className="grid h-9 w-9 place-items-center rounded-xl text-slate-300 transition hover:bg-slate-50 hover:text-rose-500">
                      <Trash2 size={15} strokeWidth={2.2} />
                    </button>
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === "published" && (
          published === null ? <Loading />
          : !published.length ? (
            <Empty Icon={CheckCircle2} title="Nothing published yet"
              body="Once you publish a release it appears here, and on your investor profile." />
          ) : (
            <div className="space-y-2.5">
              {published.map((p) => {
                const det = p.detected || {};
                const pubs = p.publications || [];
                const live = pubs.find((x) => x.destination_id === "passport" && x.status === "published");
                return (
                  <div key={p.id} className={`flex flex-wrap items-center gap-4 px-5 py-4 ${CARD}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-extrabold tracking-tight text-slate-900">{det.headline || "Untitled release"}</p>
                      <p className="mt-0.5 text-[12.5px] text-slate-400">{fmtDate(p.published_on)}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11.5px] font-bold text-blue-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> {live ? "Live on MineEx" : "Publishing…"}
                    </span>
                    {company?.slug && company?.status === "published" && (
                      <a href={profileUrl(company.slug)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-bold text-slate-700 transition hover:border-slate-300">
                        <ExternalLink size={14} strokeWidth={2.4} /> View
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === "calendar" && (
          <Empty Icon={CalendarIcon} title="Scheduling is coming"
            body="You'll be able to prepare a release now and have MineEx publish it at a set time. It isn't available yet." />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, Icon, onClick, muted, note }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3.5 text-left ${CARD} ${onClick ? "transition hover:border-slate-200 active:scale-[0.99]" : ""}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${muted ? "bg-slate-50 text-slate-300" : "bg-blue-50 text-blue-600"}`}>
        <Icon size={16} strokeWidth={2.4} />
      </span>
      <span className="min-w-0">
        <span className={`block text-[20px] font-extrabold leading-none tracking-tight ${muted ? "text-slate-300" : "text-slate-900"}`}>{value}</span>
        <span className="mt-1 block text-[11.5px] font-semibold text-slate-400">{note || label}</span>
      </span>
    </Tag>
  );
}

function Loading() {
  return <div className="grid place-items-center py-16"><Loader2 size={22} className="animate-spin text-blue-500" /></div>;
}
