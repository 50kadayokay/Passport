// The press release library — every release the company has, as cards.
//
// Replaces the two stacked lists (Drafts / Published) this page used to show.
// A company's releases are a body of work they browse and look back through,
// not a queue they process, so this is a grid with filters rather than rows.
//
// The filters deliberately reuse the SAME vocabulary as the investor app:
// `TIMELINE_CATEGORIES` and `dateParts` both come from lib/structureReleases.js,
// which is what the app's timeline is built from. A category the app can display
// is therefore always a category this page can filter by. Nothing is redefined
// here -- if the app's list grows, this page's filter grows with it.
//
// Only values that actually occur are offered: a company with three releases in
// 2026 does not get a year dropdown running back to 2015.

import React, { useState, useEffect, useMemo } from "react";
import {
  FileText, Search, X, Image as ImageIcon,
} from "lucide-react";
import { TIMELINE_CATEGORIES, dateParts } from "../../lib/structureReleases.js";
import { listMediaAssets, signedMediaUrl } from "../../lib/mediaAssets.js";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const UNCATEGORISED = "Uncategorised";

const fmtDate = (d) => {
  if (!d) return "";
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-").map(Number);
  if (!y) return s;
  return new Date(Date.UTC(y, (m || 1) - 1, day || 1))
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

/**
 * One release, normalised. Drafts and published releases are the same `updates`
 * row at different statuses, so the grid treats them as one kind of thing and
 * marks the difference with a badge rather than a separate list.
 */
function normalise(row, isDraft) {
  const det = row.detected || {};
  const { year, quarter } = dateParts(row.published_on);
  return {
    id: row.id,
    headline: det.headline || "Untitled release",
    date: row.published_on || null,
    year, quarter,
    category: (det.category || "").trim() || UNCATEGORISED,
    documentId: det.document_id || null,
    hasSummary: !!(det.summary || "").trim(),
    isDraft,
    needsDate: isDraft && !row.published_on,
    updatedAt: row.updated_at || row.created_at,
    raw: row,
  };
}

/** The thumbnail. Signed lazily, exactly as the media picker does it. */
function Thumb({ asset, category }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let ok = true;
    if (!asset || !asset.previewable || !asset.storage_path) return undefined;
    signedMediaUrl(asset.storage_path).then((u) => { if (ok) setUrl(u); });
    return () => { ok = false; };
  }, [asset]);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition-transform duration-[400ms] group-hover:scale-[1.03]"
      />
    );
  }
  // No image is a normal state, not an error: plenty of releases are text only.
  return (
    <span className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-50 to-slate-100">
      <span className="text-center">
        <ImageIcon size={20} className="mx-auto text-slate-300" />
        <span className="mt-1.5 block px-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-300">
          {category === UNCATEGORISED ? "Release" : category}
        </span>
      </span>
    </span>
  );
}

function ReleaseCard({ item, asset, onOpen }) {
  return (
    <button
      onClick={() => onOpen(item)}
      className={`group flex flex-col overflow-hidden text-left transition-all duration-[170ms] ease-out
                  hover:-translate-y-0.5 hover:border-slate-200
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${CARD}`}
    >
      <span className="relative block aspect-[4/3] w-full overflow-hidden bg-slate-100">
        <Thumb asset={asset} category={item.category} />
        <span className="absolute left-3 top-3 flex gap-1.5">
          {item.isDraft ? (
            <span className="rounded-full bg-white/95 px-2 py-0.5 text-[10.5px] font-bold text-slate-600 shadow-sm">Draft</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10.5px] font-bold text-white shadow-sm">
              <span className="h-1 w-1 rounded-full bg-white" /> Live
            </span>
          )}
          {item.needsDate && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10.5px] font-bold text-white shadow-sm">Date needed</span>
          )}
        </span>
      </span>

      <span className="flex min-h-0 flex-1 flex-col p-4">
        <span className="line-clamp-2 text-[14px] font-bold leading-snug tracking-tight text-slate-900">
          {item.headline}
        </span>
        <span className="mt-auto flex items-center gap-2 pt-3 text-[11.5px] text-slate-400">
          <span className="font-semibold">{item.date ? fmtDate(item.date) : "No date yet"}</span>
          {item.category !== UNCATEGORISED && (
            <>
              <span className="text-slate-300">·</span>
              <span className="truncate rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-500">{item.category}</span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

/** A filter dropdown. Native select: keyboard, mobile and screen readers for free. */
function Filter({ label, value, onChange, options, allLabel }) {
  const on = value !== "";
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`cursor-pointer appearance-none rounded-xl border py-2 pl-3.5 pr-8 text-[12.5px] font-bold transition focus:outline-none focus:ring-2 focus:ring-blue-500/25
                    ${on ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <span className={`pointer-events-none absolute right-3 text-[9px] ${on ? "text-blue-500" : "text-slate-400"}`}>▼</span>
    </label>
  );
}

export default function ReleaseLibrary({ drafts, published, onCreate, onDraft, onOpen }) {
  const [companyAssets, setCompanyAssets] = useState([]);
  const [cat, setCat] = useState("");
  const [year, setYear] = useState("");
  const [quarter, setQuarter] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const items = useMemo(() => [
    ...(drafts || []).map((r) => normalise(r, true)),
    ...(published || []).map((r) => normalise(r, false)),
  ], [drafts, published]);

  // One fetch for the whole grid, indexed by the document each release came
  // from. Per-card fetches would be a request per tile for the same table.
  const companyId = (drafts && drafts[0]?.company_id) || (published && published[0]?.company_id) || null;
  useEffect(() => {
    let alive = true;
    if (!companyId) return undefined;
    listMediaAssets(companyId).then((list) => { if (alive) setCompanyAssets(list || []); });
    return () => { alive = false; };
  }, [companyId]);

  const assetByDoc = useMemo(() => {
    const by = {};
    (companyAssets || []).forEach((a) => {
      const d = a.source_document_id;
      if (!d) return;
      // First previewable asset per document wins — newest-first order from the
      // query means that is the most recent image from that release.
      if (!by[d] && a.previewable) by[d] = a;
    });
    return by;
  }, [companyAssets]);

  // Offer only what exists, in the app's own order.
  const years = useMemo(
    () => [...new Set(items.map((i) => i.year).filter(Boolean))].sort((a, b) => b - a).map(String),
    [items]
  );
  const cats = useMemo(() => {
    const present = new Set(items.map((i) => i.category));
    const known = TIMELINE_CATEGORIES.filter((c) => present.has(c));
    return present.has(UNCATEGORISED) ? [...known, UNCATEGORISED] : known;
  }, [items]);
  const quarters = useMemo(
    () => QUARTERS.filter((qq) => items.some((i) => i.quarter === qq)),
    [items]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .filter((i) => (cat ? i.category === cat : true))
      .filter((i) => (year ? String(i.year) === year : true))
      .filter((i) => (quarter ? i.quarter === quarter : true))
      .filter((i) => (status === "draft" ? i.isDraft : status === "published" ? !i.isDraft : true))
      .filter((i) => (needle ? i.headline.toLowerCase().includes(needle) : true))
      // Newest first, undated drafts at the top — they are the ones needing work.
      .sort((a, b) => {
        if (!a.date && !b.date) return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
        if (!a.date) return -1;
        if (!b.date) return 1;
        return String(b.date).localeCompare(String(a.date));
      });
  }, [items, cat, year, quarter, status, q]);

  const anyFilter = cat || year || quarter || status || q.trim();
  const clearAll = () => { setCat(""); setYear(""); setQuarter(""); setStatus(""); setQ(""); };

  const loading = drafts === null || published === null;

  return (
    <div>
      {/* No Create/Draft buttons here any more: the page above this opens with
          those as tiles, and a second, smaller copy of the same two actions on
          the same screen just splits the reader's attention. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search releases"
              className="w-40 bg-transparent text-[12.5px] text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
          <Filter label="Milestone" allLabel="All milestones" value={cat} onChange={setCat} options={cats} />
          <Filter label="Year" allLabel="All years" value={year} onChange={setYear} options={years} />
          <Filter label="Quarter" allLabel="All quarters" value={quarter} onChange={setQuarter} options={quarters} />
          <Filter label="Status" allLabel="All statuses" value={status} onChange={setStatus}
            options={["draft", "published"]} />
          {anyFilter ? (
            <button onClick={clearAll}
              className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-[12.5px] font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X size={13} /> Clear
            </button>
          ) : null}
        </div>
      </div>

      <p className="mt-4 text-[12.5px] font-semibold text-slate-400">
        {loading ? "Loading…"
          : `${filtered.length} ${filtered.length === 1 ? "release" : "releases"}${anyFilter ? ` of ${items.length}` : ""}`}
      </p>

      {loading ? (
        <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`overflow-hidden ${CARD}`}>
              <div className="aspect-[4/3] w-full animate-pulse bg-slate-100" />
              <div className="p-4"><div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-100" /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className={`mt-3 grid place-items-center px-6 py-16 text-center ${CARD}`}>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            {anyFilter ? <Search size={22} strokeWidth={2.2} /> : <FileText size={22} strokeWidth={2.2} />}
          </span>
          <p className="mt-3 text-[15px] font-bold text-slate-900">
            {anyFilter ? "No releases match those filters" : "No press releases yet"}
          </p>
          <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-slate-500">
            {anyFilter
              ? "Try widening the filters, or clear them to see everything."
              : "Upload your first release and MineEx will prepare it for your investor profile."}
          </p>
          {anyFilter ? (
            <button onClick={clearAll} className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-bold text-slate-700">
              Clear filters
            </button>
          ) : (
            <button onClick={onCreate} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white">
              Create new
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <ReleaseCard key={item.id} item={item} asset={assetByDoc[item.documentId]} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
