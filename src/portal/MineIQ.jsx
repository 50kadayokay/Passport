// MineIQ — the company's institutional memory, as a workspace.
//
// The point of this page is not "search our database". It is: MineEx knows this
// company, and can show its working. Everything on screen is derived from data
// the company owns, read through RLS, and every answer carries the sources it
// came from.
//
// WHAT IS HONESTLY MISSING, and why the page says so instead of padding:
// migration 0050 creates the facts search index, the mineiq_search RPC and the
// ingestion record. Until it is applied and a release has been published through
// the listener, `facts` is EMPTY. So fact counts read 0, fact inspection has
// nothing to show, and "facts learned" per release is omitted rather than
// invented. The knowledge panel states the reason in a line.
//
// The old counts-and-search page is not deleted -- it is the second tab, where a
// database-shaped view belongs.

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ArrowUp, Loader2, FileText, Megaphone, Layers, CalendarClock, Image as ImageIcon,
  Search, X, CheckCircle2, AlertCircle, ArrowRight, Sparkles, Users, Banknote,
} from "lucide-react";
import {
  knowledgeSummary, recentlyLearned, attentionItems, askMineIq, listFacts, SUGGESTED,
} from "../lib/mineiq.js";
import { listDocuments } from "../lib/memory.js";
import { listPublished, listDrafts } from "../lib/publishDrafts.js";
import { listMediaPosts } from "../lib/mediaPosts.js";

const CARD = "rounded-2xl border border-slate-200/80 bg-white";
const LABEL = "text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400";

const fmtDay = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

/* ------------------------------------------------------------------ ask ---- */

function Sources({ sources }) {
  if (!sources || !sources.length) return null;
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400">Sources</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {sources.map((s, i) => (
          <span key={i}
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11.5px] text-slate-600">
            <span className="truncate">{s}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Answer({ turn }) {
  return (
    <div className="border-t border-slate-100 pt-6 first:border-0 first:pt-0">
      <p className="text-[13px] font-semibold text-slate-400">You</p>
      <p className="mt-1 text-[15px] leading-relaxed text-slate-800">{turn.question}</p>

      <p className="mt-5 text-[13px] font-semibold text-blue-600">MineIQ</p>
      {turn.pending ? (
        <p className="mt-1 inline-flex items-center gap-2 text-[14px] text-slate-400">
          <Loader2 size={14} className="animate-spin text-blue-500" /> Looking through your company record…
        </p>
      ) : turn.error ? (
        <p className="mt-1 text-[14px] text-rose-600">{turn.error}</p>
      ) : (
        <>
          <div className="mt-1 whitespace-pre-wrap text-[15px] leading-[1.7] text-slate-800">{turn.answer}</div>
          {turn.grounded === false && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-semibold text-amber-800">
              <AlertCircle size={12} /> Nothing in your record covered this
            </p>
          )}
          <Sources sources={turn.sources} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------- knowledge view ---- */

const CATEGORIES = [
  { id: "company",        label: "Company",        Icon: FileText,      kinds: ["other"],                 blurb: "Corporate identity, listings and company facts" },
  { id: "projects",       label: "Projects",       Icon: Layers,        kinds: ["project"],               blurb: "Properties, locations, ownership and stage" },
  { id: "exploration",    label: "Exploration",    Icon: Search,        kinds: ["drill_result"],          blurb: "Drilling, assays, intercepts and targets" },
  { id: "capital",        label: "Capital",        Icon: Banknote,      kinds: ["capital", "financing"],  blurb: "Financings and share structure" },
  { id: "people",         label: "People",         Icon: Users,         kinds: ["person"],                blurb: "Leadership and appointments" },
  { id: "history",        label: "History",        Icon: CalendarClock, kinds: ["timeline_event"],        blurb: "Milestones and disclosure history" },
];

function FactList({ companyId, category, onBack }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    listFacts(companyId, { kinds: category.kinds }).then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [companyId, category]);

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-[13px] font-bold text-slate-500 transition hover:text-slate-900">
        ← Knowledge
      </button>
      <h2 className="text-[17px] font-bold tracking-tight text-slate-900">{category.label}</h2>
      <p className="mt-0.5 text-[13px] text-slate-500">{category.blurb}</p>

      {rows === null ? (
        <div className="grid place-items-center py-12"><Loader2 size={18} className="animate-spin text-blue-500" /></div>
      ) : rows.length === 0 ? (
        <div className={`mt-4 px-5 py-10 text-center ${CARD}`}>
          <p className="text-[13.5px] font-semibold text-slate-600">Nothing here yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-slate-400">
            MineIQ learns these from your published releases and approved documents.
          </p>
        </div>
      ) : (
        <ul className={`mt-4 divide-y divide-slate-100 overflow-hidden ${CARD}`}>
          {rows.map((f) => (
            <li key={f.id} className="px-5 py-4">
              <p className="text-[13.5px] font-bold text-slate-900">{f.subject || f.kind}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
                {Object.entries(f.data || {})
                  .filter(([k]) => !["publication_id", "revision", "disclosed_on", "status", "source", "measure"].includes(k))
                  .map(([k, v]) => `${k}: ${v}`).join(" · ")}
              </p>
              {f.quote && <p className="mt-1.5 border-l-2 border-slate-200 pl-2.5 text-[12.5px] italic leading-relaxed text-slate-500">"{f.quote}"</p>}
              <p className="mt-1.5 text-[11.5px] text-slate-400">
                {f.data?.disclosed_on ? `Disclosed ${fmtDay(f.data.disclosed_on)}` : fmtDay(f.created_at)}
                {f.data?.status ? ` · ${f.data.status}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------- the searchable view --- */
// The previous page, kept intact: a database-shaped view is still the right tool
// for "find every mention of X". It is simply no longer the front door.

function snippet(text, needle) {
  const t = String(text || "");
  const i = t.toLowerCase().indexOf(needle.toLowerCase());
  if (i === -1) return "";
  const from = Math.max(0, i - 90), to = Math.min(t.length, i + needle.length + 90);
  return (from > 0 ? "…" : "") + t.slice(from, to).replace(/\s+/g, " ").trim() + (to < t.length ? "…" : "");
}

function SearchView({ company }) {
  const companyId = company?.id;
  const [docs, setDocs] = useState(null);
  const [releases, setReleases] = useState(null);
  const [media, setMedia] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    if (!companyId) return undefined;
    listDocuments(companyId).then((d) => alive && setDocs(d || []));
    Promise.all([listPublished(companyId), listDrafts(companyId)])
      .then(([p, d]) => alive && setReleases([...(p || []), ...(d || [])])).catch(() => alive && setReleases([]));
    listMediaPosts(companyId).then((m) => alive && setMedia(m || [])).catch(() => alive && setMedia([]));
    return () => { alive = false; };
  }, [companyId]);

  const profile = company?.profile || {};
  const index = useMemo(() => {
    const out = [];
    (docs || []).forEach((d) => out.push({ kind: "Document", title: d.filename || "Untitled", date: d.doc_date || d.created_at, body: d.extracted_text || "" }));
    (releases || []).forEach((r) => out.push({ kind: "Release", title: (r.detected && r.detected.headline) || "Untitled", date: r.published_on || r.created_at, body: r.body || "" }));
    (Array.isArray(profile.projects) ? profile.projects : []).forEach((p) => out.push({ kind: "Project", title: p.name || "Project", date: null, body: [p.geology, (p.narrative || []).join(" ")].filter(Boolean).join(" ") }));
    (Array.isArray(profile.timeline) ? profile.timeline : []).forEach((t) => out.push({ kind: "Milestone", title: t.title || "Entry", date: t.date, body: t.summary || "" }));
    (media || []).forEach((m) => out.push({ kind: "Media", title: m.caption || "Media post", date: m.publishedAt, body: "" }));
    return out;
  }, [docs, releases, media, profile]);

  const results = useMemo(() => {
    const n = q.trim();
    if (n.length < 2) return null;
    const low = n.toLowerCase();
    return index
      .map((it) => {
        const inTitle = it.title.toLowerCase().includes(low);
        const inBody = it.body && it.body.toLowerCase().includes(low);
        if (!inTitle && !inBody) return null;
        return { ...it, score: inTitle ? 0 : 1, snip: inBody ? snippet(it.body, n) : "" };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || String(b.date || "").localeCompare(String(a.date || "")))
      .slice(0, 60);
  }, [index, q]);

  return (
    <div>
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 focus-within:border-blue-400">
        <Search size={16} className="shrink-0 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Find every mention of a project, hole, person or figure…"
          className="w-full bg-transparent text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none" />
        {q && <button onClick={() => setQ("")} className="shrink-0 text-slate-400 hover:text-slate-600"><X size={15} /></button>}
      </div>
      <p className="mt-1.5 px-1 text-[11.5px] text-slate-400">
        Searches inside your uploaded documents, not just their names.
        {index.length > 0 && ` ${index.length.toLocaleString()} items indexed.`}
      </p>

      {results && (
        <div className="mt-5">
          <p className="text-[12.5px] font-semibold text-slate-400">
            {results.length === 0 ? "No matches" : `${results.length} ${results.length === 1 ? "match" : "matches"}`}
          </p>
          {results.length > 0 && (
            <ul className={`mt-3 divide-y divide-slate-100 overflow-hidden ${CARD}`}>
              {results.map((r, i) => (
                <li key={i} className="px-5 py-3.5">
                  <p className="truncate text-[13.5px] font-bold text-slate-900">{r.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-slate-400">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-500">{r.kind}</span>
                    {r.date ? ` ${fmtDay(r.date)}` : ""}
                  </p>
                  {r.snip && <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{r.snip}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ page --- */

export default function MineIQ({ company, go }) {
  const companyId = company?.id;
  const companyName = company?.name || "your company";

  const [tab, setTab] = useState("workspace");
  const [summary, setSummary] = useState(null);
  const [learned, setLearned] = useState([]);
  const [turns, setTurns] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [openCat, setOpenCat] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    let alive = true;
    if (!companyId) return undefined;
    knowledgeSummary(companyId, company?.profile).then(async (s) => {
      if (!alive) return;
      setSummary(s);
      setLearned(await recentlyLearned(companyId, s));
    });
    return () => { alive = false; };
  }, [companyId, company?.profile]);

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: "end", behavior: "smooth" }); }, [turns]);

  const ask = useCallback(async (question) => {
    const text = String(question || "").trim();
    if (!text || busy) return;
    setQ(""); setBusy(true);
    const id = Date.now();
    setTurns((t) => [...t, { id, question: text, pending: true }]);
    try {
      const r = await askMineIq({ question: text, companyId, companyName: company?.name || "" });
      setTurns((t) => t.map((x) => x.id === id
        ? { ...x, pending: false, answer: r.text, sources: (r.context && r.context.sources) || [], grounded: r.grounded }
        : x));
    } catch (e) {
      setTurns((t) => t.map((x) => x.id === id ? { ...x, pending: false, error: e.message || "MineIQ could not answer." } : x));
    } finally { setBusy(false); }
  }, [busy, companyId, company]);

  const attention = useMemo(
    () => (summary ? attentionItems(summary, company?.profile) : []),
    [summary, company]);

  if (openCat) {
    return (
      <div className="mx-auto max-w-[880px]">
        <FactList companyId={companyId} category={openCat} onBack={() => setOpenCat(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[880px]">
      <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">MineIQ</h1>
      <p className="mt-1 text-[15px] text-slate-600">Your company knowledge, working for you.</p>
      <p className="mt-1.5 max-w-[640px] text-[13px] leading-relaxed text-slate-400">
        MineIQ learns from your profile, projects, press releases and approved documents to help you find
        information, create content and keep your story consistent.
      </p>

      <div className="mt-5 flex gap-1 border-b border-slate-100">
        {[["workspace", "Workspace"], ["search", "Search knowledge"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-bold transition ${
              tab === id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "search" ? (
        <div className="mt-6"><SearchView company={company} /></div>
      ) : (
        <>
          {/* ---- ask ---- */}
          <div className="mt-6">
            {turns.length > 0 && (
              <div className={`mb-4 space-y-6 p-7 ${CARD}`}>
                {turns.map((t) => <Answer key={t.id} turn={t} />)}
                <div ref={endRef} />
              </div>
            )}

            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,.04)] focus-within:border-blue-400 focus-within:shadow-[0_1px_2px_rgba(15,23,42,.04),0_0_0_3px_rgba(37,99,235,.08)]">
              <textarea
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }}
                rows={2}
                placeholder={`Ask MineIQ anything about ${companyName}…`}
                className="min-h-[52px] w-full resize-none bg-transparent px-3 py-2.5 text-[14.5px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              <button onClick={() => ask(q)} disabled={!q.trim() || busy} aria-label="Ask MineIQ"
                className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={16} strokeWidth={2.4} />}
              </button>
            </div>

            {turns.length === 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SUGGESTED.map((s) => (
                  <button key={s} onClick={() => ask(s)} disabled={busy}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ---- needs your attention ---- */}
          <section className="mt-10">
            <p className={LABEL}>Needs your attention</p>
            {summary === null ? (
              <div className={`mt-3 px-5 py-6 ${CARD}`}><div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" /></div>
            ) : attention.length === 0 ? (
              <div className={`mt-3 flex items-start gap-3 px-5 py-5 ${CARD}`}>
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-[14px] font-bold text-slate-900">Everything looks consistent.</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">
                    MineIQ will flag new information, possible inconsistencies and items that may need review.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {attention.map((a) => (
                  <div key={a.id} className={`flex flex-col px-5 py-4 ${CARD}`}>
                    <p className="text-[13.5px] font-bold leading-snug text-slate-900">{a.title}</p>
                    <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-slate-500">{a.body}</p>
                    {a.action && (
                      <button onClick={() => go && go(a.to)}
                        className="mt-3 inline-flex items-center gap-1 self-start text-[12.5px] font-bold text-blue-600 transition hover:text-blue-700">
                        {a.action} <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ---- company knowledge ---- */}
          <section className="mt-10">
            <p className={LABEL}>Company knowledge</p>
            <div className={`mt-3 overflow-hidden ${CARD}`}>
              <div className="flex flex-wrap gap-x-10 gap-y-4 px-6 py-5">
                {[
                  ["facts", summary?.facts],
                  ["releases", summary?.releases],
                  ["projects", summary?.projects],
                  ["milestones", summary?.milestones],
                  ["documents", summary?.documents],
                ].map(([label, n]) => (
                  <div key={label}>
                    <p className="text-[24px] font-extrabold leading-none tracking-tight tabular-nums text-slate-900">
                      {summary === null ? "—" : n === null ? "—" : Number(n).toLocaleString()}
                    </p>
                    <p className="mt-1 text-[11.5px] font-semibold text-slate-400">{label}</p>
                  </div>
                ))}
              </div>

              {summary && summary.facts === 0 && (
                <p className="border-t border-slate-100 bg-slate-50/60 px-6 py-3 text-[12px] leading-relaxed text-slate-500">
                  MineIQ hasn't learned any facts yet. It builds them from releases you publish — each one adds
                  what the company actually disclosed, with the sentence it came from.
                </p>
              )}
              {summary && summary.facts === null && (
                <p className="border-t border-slate-100 bg-amber-50/60 px-6 py-3 text-[12px] leading-relaxed text-amber-800">
                  The knowledge layer isn't switched on for this database yet, so facts can't be counted or shown.
                  Everything else on this page is live.
                </p>
              )}

              <div className="grid grid-cols-2 border-t border-slate-100 sm:grid-cols-3">
                {CATEGORIES.map((c) => (
                  <button key={c.id} onClick={() => setOpenCat(c)}
                    className="group flex items-start gap-2.5 border-b border-r border-slate-100 px-5 py-4 text-left transition hover:bg-slate-50">
                    <c.Icon size={15} className="mt-0.5 shrink-0 text-slate-400 group-hover:text-blue-600" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-slate-800">{c.label}</span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-400">{c.blurb}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ---- recently learned ---- */}
          <section className="mt-10 pb-4">
            <p className={LABEL}>Recently learned</p>
            {learned.length === 0 ? (
              <div className={`mt-3 px-5 py-6 ${CARD}`}>
                <p className="text-[13px] text-slate-500">
                  Nothing yet. Publishing a release or uploading a document is what teaches MineIQ.
                </p>
              </div>
            ) : (
              <ul className={`mt-3 divide-y divide-slate-100 overflow-hidden ${CARD}`}>
                {learned.map((e) => (
                  <li key={`${e.kind}-${e.id}`} className="flex items-start gap-3.5 px-5 py-4">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                      {e.kind === "release" ? <Megaphone size={14} /> : <FileText size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-slate-800">{e.title}</span>
                      <span className="mt-0.5 block text-[11.5px] text-slate-400">
                        {e.kind === "release" ? "Published release" : "Document added"}
                        {/* A fact count appears ONLY where an ingestion record exists. */}
                        {e.factsAdded != null ? ` · ${e.factsAdded} facts learned` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11.5px] text-slate-400">{fmtDay(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
