// Mine IQ — everything MineEx knows about this company, in one place.
//
// Not a new store of data: `company_memory` has been a Tier-1 feature since
// migration 0005 ("Every uploaded document is stored, extracted and
// searchable"), and the pieces were already scattered across Documents, Press
// Releases, Media and the profile editor. This is the surface that treats them
// as one body of knowledge and lets someone search it.
//
// The search covers extracted document TEXT, not just filenames. That is the
// part that makes it a memory rather than a file list: "what did we say about
// the Baker Lake claims" finds the paragraph, in the document, from two years
// ago. Everything is read from existing tables; nothing is generated here.

import React, { useState, useEffect, useMemo } from "react";
import {
  Brain, FileText, Megaphone, Layers, CalendarClock, Image as ImageIcon,
  Search, Loader2, X,
} from "lucide-react";
import { listDocuments } from "../lib/memory.js";
import { listPublished, listDrafts } from "../lib/publishDrafts.js";
import { listMediaPosts } from "../lib/mediaPosts.js";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

const fmtDay = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

/** A ±90-character window around the hit, so a match in a long document is legible. */
function snippet(text, needle) {
  const t = String(text || "");
  const i = t.toLowerCase().indexOf(needle.toLowerCase());
  if (i === -1) return "";
  const from = Math.max(0, i - 90);
  const to = Math.min(t.length, i + needle.length + 90);
  return (from > 0 ? "…" : "") + t.slice(from, to).replace(/\s+/g, " ").trim() + (to < t.length ? "…" : "");
}

function Stat({ Icon, label, value, loading }) {
  return (
    <div className={`p-4 ${CARD}`}>
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
          <Icon size={15} strokeWidth={2.2} />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</span>
      </div>
      <p className="mt-2.5 text-[24px] font-extrabold leading-none tracking-tight tabular-nums text-slate-900">
        {loading ? "—" : value.toLocaleString()}
      </p>
    </div>
  );
}

const KIND_META = {
  document: { Icon: FileText,      label: "Document" },
  release:  { Icon: Megaphone,     label: "Press release" },
  project:  { Icon: Layers,        label: "Project" },
  timeline: { Icon: CalendarClock, label: "Timeline" },
  media:    { Icon: ImageIcon,     label: "Media" },
};

export default function MineIQ({ company, go }) {
  const companyId = company?.id;
  const [docs, setDocs] = useState(null);
  const [releases, setReleases] = useState(null);
  const [media, setMedia] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    if (!companyId) return undefined;
    listDocuments(companyId).then((d) => { if (alive) setDocs(d || []); }).catch(() => alive && setDocs([]));
    Promise.all([listPublished(companyId), listDrafts(companyId)])
      .then(([p, d]) => { if (alive) setReleases([...(p || []), ...(d || [])]); })
      .catch(() => alive && setReleases([]));
    listMediaPosts(companyId).then((m) => { if (alive) setMedia(m || []); }).catch(() => alive && setMedia([]));
    return () => { alive = false; };
  }, [companyId]);

  const profile = company?.profile || {};
  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  const timeline = Array.isArray(profile.timeline) ? profile.timeline : [];

  const loading = docs === null || releases === null || media === null;

  // One flat, searchable index over everything the company has given MineEx.
  const index = useMemo(() => {
    const out = [];
    (docs || []).forEach((d) => out.push({
      kind: "document", title: d.filename || "Untitled document",
      date: d.doc_date || d.created_at, body: d.extracted_text || "",
    }));
    (releases || []).forEach((r) => out.push({
      kind: "release", title: (r.detected && r.detected.headline) || "Untitled release",
      date: r.published_on || r.created_at, body: r.body || "",
    }));
    projects.forEach((p) => out.push({
      kind: "project", title: p.name || "Project", date: null,
      body: [p.geology, p.narrative && p.narrative.join(" ")].filter(Boolean).join(" "),
    }));
    timeline.forEach((t) => out.push({
      kind: "timeline", title: t.title || "Entry", date: t.date, body: t.summary || "",
    }));
    (media || []).forEach((m) => out.push({
      kind: "media", title: m.caption || "Media post", date: m.publishedAt, body: "",
    }));
    return out;
  }, [docs, releases, media, projects, timeline]);

  const results = useMemo(() => {
    const needle = q.trim();
    if (needle.length < 2) return null;
    const n = needle.toLowerCase();
    return index
      .map((it) => {
        const inTitle = it.title.toLowerCase().includes(n);
        const inBody = it.body && it.body.toLowerCase().includes(n);
        if (!inTitle && !inBody) return null;
        // A title match is what someone is usually looking for, so it sorts first.
        return { ...it, score: inTitle ? 0 : 1, snip: inBody ? snippet(it.body, needle) : "" };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || String(b.date || "").localeCompare(String(a.date || "")))
      .slice(0, 60);
  }, [index, q]);

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
          <Brain size={18} strokeWidth={2.2} />
        </span>
        <div>
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Mine IQ</h1>
          <p className="text-[14px] text-slate-500">Everything MineEx knows about your company.</p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/15">
        <Search size={17} className="shrink-0 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search everything — documents, releases, projects, timeline…"
          className="w-full bg-transparent text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
        {q && (
          <button onClick={() => setQ("")} className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={15} />
          </button>
        )}
      </div>
      <p className="mt-1.5 px-1 text-[11.5px] text-slate-400">
        Searches inside your uploaded documents, not just their names.
      </p>

      {results === null ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat Icon={FileText}      label="Documents" value={(docs || []).length}     loading={loading} />
            <Stat Icon={Megaphone}     label="Releases"  value={(releases || []).length} loading={loading} />
            <Stat Icon={Layers}        label="Projects"  value={projects.length}         loading={false} />
            <Stat Icon={CalendarClock} label="Timeline"  value={timeline.length}         loading={false} />
            <Stat Icon={ImageIcon}     label="Media"     value={(media || []).length}    loading={loading} />
          </div>

          {loading ? (
            <div className="mt-8 grid place-items-center py-12"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
          ) : index.length === 0 ? (
            <div className={`mt-6 grid place-items-center px-6 py-16 text-center ${CARD}`}>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Brain size={22} strokeWidth={2.2} /></span>
              <p className="mt-3 text-[15px] font-bold text-slate-900">Nothing in memory yet</p>
              <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-slate-500">
                Upload a document or publish a release and it becomes part of your company's memory —
                stored, extracted and searchable from here.
              </p>
            </div>
          ) : (
            <div className={`mt-6 p-6 ${CARD}`}>
              <p className="text-[13.5px] leading-relaxed text-slate-600">
                MineEx is holding <span className="font-bold text-slate-900">{index.length.toLocaleString()}</span> pieces
                of knowledge about {company?.name || "your company"} — every document you have uploaded, every release
                you have published, and the projects and milestones on your profile. Search above to find any of it.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="mt-6">
          <p className="text-[12.5px] font-semibold text-slate-400">
            {results.length === 0 ? "No matches" : `${results.length} ${results.length === 1 ? "match" : "matches"}`}
          </p>
          {results.length > 0 && (
            <div className={`mt-3 overflow-hidden ${CARD}`}>
              <ul className="divide-y divide-slate-50">
                {results.map((r, i) => {
                  const meta = KIND_META[r.kind] || KIND_META.document;
                  return (
                    <li key={`${r.kind}-${i}`} className="flex items-start gap-3.5 px-5 py-4">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                        <meta.Icon size={14} strokeWidth={2.2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-bold text-slate-900">{r.title}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-400">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-500">{meta.label}</span>
                          {r.date && <span>{fmtDay(r.date)}</span>}
                        </span>
                        {r.snip && <span className="mt-1.5 block text-[12.5px] leading-relaxed text-slate-500">{r.snip}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
