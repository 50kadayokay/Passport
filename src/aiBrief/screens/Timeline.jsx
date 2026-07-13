import React, { useState, useMemo } from "react";
import { Clock, ChevronRight, X, Gem, ArrowUpRight, ExternalLink } from "lucide-react";

/* Category → colour. */
const CAT_STYLE = {
  Discovery: { c: "#0f9b73", bg: "rgba(16,185,129,0.10)" },
  Drilling: { c: "#1d4ed8", bg: "rgba(37,99,235,0.10)" },
  Financing: { c: "#6d28d9", bg: "rgba(124,58,237,0.10)" },
  Permitting: { c: "#c2410c", bg: "rgba(234,88,12,0.10)" },
  Acquisition: { c: "#a16207", bg: "rgba(180,130,20,0.12)" },
  "Resource Growth": { c: "#0d9488", bg: "rgba(13,148,136,0.10)" },
  Exploration: { c: "#475569", bg: "rgba(100,116,139,0.10)" },
  Corporate: { c: "#64748b", bg: "rgba(100,116,139,0.08)" },
};
const IMPACT_STYLE = {
  Transformational: { c: "#0f9b73", dot: "#10b981" },
  High: { c: "#b45309", dot: "#f59e0b" },
  Moderate: { c: "#1d4ed8", dot: "#3b82f6" },
  Low: { c: "#64748b", dot: "#94a3b8" },
};
const TAKEAWAY = {
  Transformational: "A thesis-defining event that materially re-rates the story.",
  High: "A meaningful step-change that strengthens the investment case.",
  Moderate: "A constructive development that de-risks the path forward.",
  Low: "Incremental progress that keeps the program on track.",
};
const catStyle = (c) => CAT_STYLE[c] || CAT_STYLE.Exploration;

// Derive impact tier from the stored key flag + category + text (no data needed).
function impactOf(e) {
  const t = (e.title || "").toLowerCase();
  if (e.key) return /bought deal|financing|continuity|discovery/.test(t) ? "Transformational" : "High";
  if (["Financing", "Acquisition", "Discovery", "Resource Growth"].includes(e.category)) return "Moderate";
  return "Low";
}
const yearOf = (d) => Number((d || "").slice(0, 4)) || 0;
const quarterOf = (d) => { const m = Number((d || "").slice(5, 7)); return m ? `Q${Math.ceil(m / 3)}` : "Q?"; };
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };

function Eyebrow({ children, color }) {
  return <p className="text-[13px] font-bold uppercase tracking-[0.16em]" style={{ color }}>{children}</p>;
}
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Clock size={22} /></div>
      <p className="text-[16px] font-bold text-slate-700">No milestones yet</p>
      <p className="max-w-[250px] text-[13.5px] leading-snug text-slate-400">Company milestones and news will appear here as they are posted.</p>
    </div>
  );
}

function Badge({ impact }) {
  const s = IMPACT_STYLE[impact];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: s.c, background: s.dot + "1f" }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} /> {impact}
    </span>
  );
}
function Tag({ category }) {
  const s = catStyle(category);
  return <span className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: s.c, background: s.bg }}>{category}</span>;
}

function EntryCard({ e, onOpen, diamond }) {
  const impact = impactOf(e);
  return (
    <div className="relative pl-7">
      {/* timeline rail */}
      <span className="absolute left-[7px] top-0 h-full w-px bg-slate-200" />
      <span className="absolute left-0 top-4 grid h-3.5 w-3.5 place-items-center rounded-full bg-white ring-2" style={{ ringColor: catStyle(e.category).c }}>
        {diamond ? <Gem size={9} style={{ color: "#0f9b73" }} /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: catStyle(e.category).c }} />}
      </span>
      <button onClick={() => onOpen(e)} className="mb-3 w-full rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition active:scale-[0.99]">
        <div className="flex items-center gap-2">
          <Tag category={e.category} />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{fmtDate(e.date)}</span>
          <ChevronRight size={15} className="ml-auto text-slate-300" />
        </div>
        <p className="mt-2 text-[15.5px] font-bold leading-snug text-slate-900">{e.title}</p>
        <div className="mt-2.5"><Badge impact={impact} /></div>
      </button>
    </div>
  );
}

function DetailSheet({ e, onClose }) {
  const impact = impactOf(e);
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center sm:items-center" style={{ padding: 12 }}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[86%] w-full flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-2xl">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500"><X size={16} /></button>
        <div className="overflow-y-auto px-6 py-6">
          <div className="flex items-center gap-2"><Tag category={e.category} /><Badge impact={impact} /></div>
          <p className="mt-3 pr-8 text-[10px] font-bold uppercase tracking-widest text-slate-400">{fmtDate(e.date)}</p>
          <h2 className="mt-1.5 text-[20px] font-extrabold leading-tight tracking-tight text-slate-900">{e.title}</h2>
          {e.summary && (
            <div className="mt-5">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-900">Why It Matters</span>
              <p className="mt-1.5 text-[14px] font-medium leading-relaxed text-slate-600">{e.summary}</p>
            </div>
          )}
          <div className="mt-5 rounded-2xl p-4" style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "#0f766e" }}>Investor Takeaway</span>
            <p className="mt-1.5 text-[14px] font-semibold leading-relaxed text-slate-700">{TAKEAWAY[impact]}</p>
          </div>
          {e.url && (
            <a href={e.url} target="_blank" rel="noreferrer" className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-[12px] font-bold uppercase tracking-wider text-slate-700">
              View Source <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Timeline({ timeline }) {
  const list = useMemo(() => (Array.isArray(timeline) ? timeline : []).filter((e) => e && e.date && e.title).sort((a, b) => (a.date < b.date ? 1 : -1)), [timeline]);
  const years = useMemo(() => Array.from(new Set(list.map((e) => yearOf(e.date)))).sort((a, b) => b - a), [list]);
  const keyCount = list.filter((e) => e.key).length;
  const [view, setView] = useState("key"); // "key" or a year number
  const [open, setOpen] = useState(null);

  if (!list.length) return <div className="space-y-5"><div><Eyebrow color="#2563eb">Progress</Eyebrow><h1 className="mt-1 text-[30px] font-extrabold tracking-tight text-slate-900">Timeline</h1></div><EmptyState /></div>;

  const showKey = view === "key";
  const shown = showKey ? list.filter((e) => e.key) : list.filter((e) => yearOf(e.date) === view);
  // group by quarter within the view
  const groups = [];
  shown.forEach((e) => {
    const label = showKey ? String(yearOf(e.date)) : `${quarterOf(e.date)} ${yearOf(e.date)}`;
    let g = groups.find((x) => x.label === label);
    if (!g) { g = { label, items: [] }; groups.push(g); }
    g.items.push(e);
  });

  return (
    <div className="space-y-5">
      <div><Eyebrow color="#2563eb">Progress</Eyebrow><h1 className="mt-1 text-[30px] font-extrabold tracking-tight text-slate-900">The Story So Far</h1></div>

      {/* year / key-milestone selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button onClick={() => setView("key")} className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13.5px] font-bold transition ${showKey ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
          <Gem size={14} /> Key
        </button>
        <span className="h-5 w-px flex-shrink-0 bg-slate-200" />
        {years.map((y) => (
          <button key={y} onClick={() => setView(y)} className={`flex-shrink-0 rounded-full px-3.5 py-2 text-[13.5px] font-bold transition ${view === y ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{y}</button>
        ))}
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="text-[20px] font-extrabold tracking-tight text-slate-900">{showKey ? "Key Milestones" : view}</h2>
        <span className="text-[13px] font-semibold text-slate-400">{showKey ? `All-time · ${keyCount} highlights` : `${shown.length} release${shown.length === 1 ? "" : "s"}`}</span>
      </div>

      {/* grouped entries */}
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-3 text-[12px] font-bold uppercase tracking-widest text-slate-400">{g.label}</p>
            {g.items.map((e) => <EntryCard key={e.id || e.date + e.title} e={e} onOpen={setOpen} diamond={showKey} />)}
          </div>
        ))}
      </div>

      {open && <DetailSheet e={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
