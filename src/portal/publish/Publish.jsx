// Press Releases — the company's library of releases, and the way in to a new one.
//
// Two screens only: the library (ReleaseLibrary) and the create/review flow
// (CreateRelease). The old Create/Drafts/Published/Calendar tab bar is gone —
// drafts and published releases are the same `updates` row at different
// statuses, so they belong in one grid with status as a filter, and Calendar
// advertised scheduling that does not exist.
//
// The CEO is not operating an extraction tool. Extraction is infrastructure, so
// nothing here says "SHA", "parser", "storage path" or "page render". Technical
// detail surfaces only when something genuinely needs attention.

import React, { useState, useEffect, useCallback } from "react";
import { AlertCircle, Sparkles, Upload, Image as ImageIcon, FileText } from "lucide-react";
import { supportedKind } from "../../lib/ingestRelease.js";
import LaunchTile from "../LaunchTile.jsx";
import { listDrafts, listPublished } from "../../lib/publishDrafts.js";
import CreateRelease from "./CreateRelease.jsx";
import ReleaseLibrary from "./ReleaseLibrary.jsx";
import DraftRelease from "./DraftRelease.jsx";

// `startIn` lets Home's "Draft Press Release" tile land straight in the drafting
// flow instead of the library. Everything else still enters at the library.
export default function Publish({ company, startIn = null, go = () => {}, view = "publish" }) {
  // null = show `view`; "draft" / "create" take over the workspace.
  const [tab, setTab] = useState(startIn || null);
  // A file dropped on the library, handed to CreateRelease so the upload and
  // the library are one screen rather than two.
  // A file dropped on Home arrives as a prop; one dropped here is set locally.
  // Both end up in the same place, so there is one upload path, not two.
  // (D25: this state was used but never declared, so leaving the review screen
  // threw a ReferenceError and a file dropped here never reached the upload.)
  const [handoff, setHandoff] = useState(null);
  const [dropErr, setDropErr] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // Releases published during THIS visit, so their new cards are findable in a
  // grid of near-identical ones. Deliberately not persisted -- see ReleaseCard.
  const [justPublished, setJustPublished] = useState([]);
  const [drafts, setDrafts] = useState(null);
  const [published, setPublished] = useState(null);
  const [editing, setEditing] = useState(null);      // draft id being reviewed

  const companyId = company?.id;

  const [loadErr, setLoadErr] = useState("");

  // Both loads are allowed to fail. They throw when the session has expired
  // (writeHeaders() raises rather than returning bad headers), and an uncaught
  // rejection here left `drafts`/`published` at null forever -- the library then
  // showed its loading skeletons permanently, with nothing saying why. Fail to a
  // real, explained empty state instead.
  const refresh = useCallback(async () => {
    if (!companyId) return;
    try {
      setLoadErr("");
      const [d, p] = await Promise.all([listDrafts(companyId), listPublished(companyId)]);
      setDrafts(d); setPublished(p);
    } catch (e) {
      setDrafts([]); setPublished([]);
      setLoadErr(e?.message || "Your releases could not be loaded.");
    }
  }, [companyId]);

  useEffect(() => { if (view === "releases") refresh(); }, [refresh, view]);

  // Writing a release from scratch. Saving drops the new draft straight into the
  // review screen, so drafting and reviewing are one continuous motion.
  if (tab === "draft") {
    return (
      <DraftRelease
        company={company}
        onExit={() => setTab(null)}
        onSaved={(row) => { setTab(null); refresh(); if (row && row.id) setEditing(row.id); }}
      />
    );
  }

  // Reviewing a release takes over the whole workspace — one job, no distractions.
  if (editing || tab === "create") {
    return (
      <CreateRelease
        company={company}
        draftId={editing}
        initialFile={editing ? null : handoff}
        onExit={() => { setEditing(null); setTab(null); setHandoff(null); refresh(); }}
        onPublished={(id) => {
          if (id) setJustPublished((prev) => (prev.includes(id) ? prev : [...prev, id]));
          setEditing(null); setTab(null); setHandoff(null); refresh(); go("releases");
        }}
      />
    );
  }

  // Hand a dropped or chosen file straight to the create flow. Checked here so
  // an unsupported file is refused on the page the person is already looking
  // at, rather than after a screen change that then has to be undone.
  const takeFile = (file) => {
    if (!file) return;
    if (!supportedKind(file)) {
      setDropErr(`${file.name} isn't a supported file. Upload a PDF or a Word document (.docx).`);
      return;
    }
    setDropErr(""); setHandoff(file); setTab("create");
  };

  // Two views, one component: the chooser at `publish`, the library at
  // `releases`. They share this file because both hand off to the same create,
  // draft and review flows above -- splitting them would mean duplicating that
  // routing or lifting it into the shell, and neither is worth it for what is
  // otherwise a heading and a grid.
  if (view === "releases") {
    return (
      <div>
        <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-slate-900">Press Releases</h1>
        <p className="mt-1.5 text-[15px] text-slate-500">Everything you have published, and everything still in progress.</p>

        {loadErr && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <AlertCircle size={19} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="text-[14px] font-bold text-amber-900">Couldn't load your releases</p>
              <p className="text-[13px] text-amber-700">{loadErr}</p>
            </div>
          </div>
        )}

        {/* Upload first, because that is what someone came here to do, and the
            library below is the result of having done it. They were two
            separate screens, which meant publishing a release and seeing it
            land were never in view at the same time. */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); takeFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
          className="mt-6"
        >
          <label className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragOver ? "border-blue-400 bg-blue-50/60" : "border-slate-200 bg-slate-50/50 hover:border-slate-300"}`}>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-blue-600 shadow-[0_1px_2px_rgba(15,23,42,.06)]">
              <Upload size={22} strokeWidth={2.2} />
            </span>
            <span className="mt-3.5 text-[17px] font-extrabold tracking-tight text-slate-900">
              Drop a press release here
            </span>
            <span className="mt-1 text-[13px] text-slate-500">
              or <span className="font-bold text-blue-600">choose a file</span> — PDF or Word. MineEx prepares it for review.
            </span>
            <input type="file"
              accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain"
              className="hidden"
              onChange={(e) => { takeFile(e.target.files && e.target.files[0]); e.target.value = ""; }} />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => setTab("draft")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-bold text-slate-700 transition hover:border-slate-300">
              <Sparkles size={14} strokeWidth={2.4} className="text-blue-500" /> Write one with MineEx instead
            </button>
            {dropErr && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-rose-600">
                <AlertCircle size={14} /> {dropErr}
              </span>
            )}
          </div>
        </div>

        {/* The line the brief asks for: upload above, the body of work below. */}
        <div className="mt-8 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400">
            <FileText size={12} strokeWidth={2.4} /> Published &amp; in progress
          </span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="mt-5">
          <ReleaseLibrary
            drafts={drafts}
            published={published}
            justPublishedIds={justPublished}
            onCreate={() => setTab("create")}
            onDraft={() => setTab("draft")}
            onOpen={(item) => setEditing(item.id)}
          />
        </div>
      </div>
    );
  }

  // The chooser. One question -- what am I publishing? -- and its three answers.
  return (
    <div>
      <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-slate-900">Publish</h1>
      <p className="mt-1.5 text-[15px] text-slate-500">What would you like to publish?</p>

      <div className="mt-6 flex max-w-[836px] flex-wrap gap-4">
        <LaunchTile title="Draft Press Release" Icon={Sparkles}
          body="Give MineEx the facts and it writes the release."
          onClick={() => setTab("draft")} />
        <LaunchTile title="Upload Press Release" Icon={Upload}
          body="Upload a finished release and have it prepared."
          onClick={() => setTab("create")} />
        <LaunchTile title="Post Media" Icon={ImageIcon}
          body="Publish photos and video to your MineEx media feed."
          onClick={() => go("media")} />
      </div>
    </div>
  );
}
