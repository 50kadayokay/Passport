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
import { AlertCircle, Sparkles, Upload, Image as ImageIcon } from "lucide-react";
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
        onExit={() => { setEditing(null); setTab(null); refresh(); }}
        onPublished={() => { setEditing(null); setTab(null); refresh(); go("releases"); }}
      />
    );
  }

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

        <div className="mt-6">
          <ReleaseLibrary
            drafts={drafts}
            published={published}
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
