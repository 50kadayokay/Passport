// Story Studio shell.
//
// Navigation is URL-driven (?p=<project id>) so a project is linkable and a
// reload lands where you were — the app has no router, and adding one for a
// single query parameter would be the wrong trade.

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import Ingest from "./screens/Ingest";
import ProjectView from "./screens/ProjectView";
import { getStoryProject, listStoryProjects } from "./lib/db";
import type { StoryProject } from "./types";
import { STORY_STATUS_LABELS } from "./types";

function readProjectId(): string {
  try { return new URLSearchParams(window.location.search).get("p") || ""; } catch { return ""; }
}

function writeProjectId(id: string) {
  try {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("p", id); else url.searchParams.delete("p");
    window.history.pushState({}, "", url.toString());
  } catch { /* history is a nicety, never a requirement */ }
}

const fmtDate = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function Studio() {
  const [projects, setProjects] = useState<StoryProject[]>([]);
  const [current, setCurrent] = useState<StoryProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshList = useCallback(async () => {
    try { setProjects(await listStoryProjects()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshList();
      const id = readProjectId();
      if (id) {
        const p = await getStoryProject(id).catch(() => null);
        if (!cancelled) setCurrent(p);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshList]);

  // Browser back/forward should move between projects, not out of the studio.
  useEffect(() => {
    const onPop = async () => {
      const id = readProjectId();
      setCurrent(id ? await getStoryProject(id).catch(() => null) : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = (p: StoryProject | null) => {
    setCurrent(p);
    writeProjectId(p ? p.id : "");
  };

  const onChanged = (p: StoryProject) => { setCurrent(p); void refreshList(); };

  const onCreated = (p: StoryProject) => { open(p); void refreshList(); };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-400">
        <span className="inline-flex items-center gap-2 text-[13.5px]"><Loader2 size={15} className="animate-spin" /> Loading Story Studio…</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-[264px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 pb-4 pt-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">MineEx</div>
          <div className="mt-0.5 text-[17px] font-semibold tracking-[-0.01em]">Story Studio</div>
        </div>

        <div className="px-4 pb-3">
          <button
            onClick={() => open(null)}
            className={`inline-flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-bold transition ${
              current ? "text-slate-500 hover:bg-slate-100 hover:text-slate-900" : "bg-slate-900 text-white"
            }`}
          >
            <Plus size={14} /> New release
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
          {projects.length === 0 && <p className="px-3 py-4 text-[12.5px] leading-relaxed text-slate-400">No releases yet. Ingest one to start.</p>}
          {projects.map((p) => {
            const active = current?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => open(p)}
                className={`block w-full rounded-xl px-3 py-2.5 text-left transition ${active ? "bg-slate-100" : "hover:bg-slate-50"}`}
              >
                <div className="truncate text-[13px] font-semibold leading-snug text-slate-800">{p.title || "Untitled release"}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span>{STORY_STATUS_LABELS[p.status]}</span>
                  <span className="text-slate-300">·</span>
                  <span>{fmtDate(p.updatedAt)}</span>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 px-5 py-3">
          <a href="/admin" className="text-[12px] font-bold text-slate-400 hover:text-slate-700">← Mission Control</a>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {error && <div className="border-b border-rose-200 bg-rose-50 px-8 py-3 text-[13px] text-rose-700">{error}</div>}
        {current ? <ProjectView project={current} onChange={onChanged} /> : <Ingest onCreated={onCreated} />}
      </main>
    </div>
  );
}
