// The press release library — every release the company has, as cards.
//
// Replaces the two stacked lists (Drafts / Published) this page used to show.
// A company's releases are a body of work they browse and look back through,
// not a queue they process, so this is a grid with filters rather than rows.
//
// The filter is the app's, not a portal dialect of it: one row of pills reading
// All · Milestones · 2026 · 2025 · …, matching the timeline's own year selector
// in aiBrief/PassportProto.jsx, where pressing a year leaves the milestone view
// and vice versa. Milestones are judged by /api/structure-release during upload
// (`suggestedKey`), which is the same flag the app reads as `it.key` -- so a
// release that is a milestone in one place is a milestone in the other.
//
// Only values that actually occur are offered: a company with three releases in
// 2026 gets one year pill, not a list running back to 2015.

import React, { useState, useEffect, useMemo } from "react";
import {
  FileText, Search, X, Image as ImageIcon, Gem,
} from "lucide-react";
import { dateParts } from "../../lib/structureReleases.js";
import { listMediaAssets, signedMediaUrl } from "../../lib/mediaAssets.js";
import { fetchManyDeliveryStatuses, passportPublication } from "../../lib/deliveryStatus.js";
import { DeliveryChip } from "./DeliveryStatus.jsx";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

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
  // THE SAME JUDGMENT THE APP USES. /api/structure-release decides three things
  // separately -- category, impact tier, and whether a release belongs in the
  // curated Key Milestones view -- and the third is `suggestedKey`, which the
  // investor app reads as `it.key` to build its milestone filter. The portal
  // reads the identical flag rather than inventing a second definition of
  // "significant", so a release that is a milestone here is a milestone there.
  const cls = (det.analysis && det.analysis.classification) || {};
  return {
    id: row.id,
    headline: det.headline || "Untitled release",
    date: row.published_on || null,
    year, quarter,
    isMilestone: !!cls.suggestedKey,
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

/* `isNew` marks a release published in THIS session, so the card it just
   became is findable in a grid of near-identical cards. It is session state on
   purpose -- held in Publish.jsx, never written to the database -- so leaving
   the page and coming back shows an ordinary card. A "new" flag that persisted
   would need a per-viewer read receipt to ever clear, which is a feature, not
   a highlight. */
// Delivery is shown on a card only when there is something to know: pending,
// retrying or failed. "Delivered" (and "no record", for releases from before
// tracking) stay quiet here; the release itself shows the full breakdown.
const CARD_DELIVERY = new Set(["pending", "retrying", "failed"]);
const DELIVERY_CARDS = 60;

function ReleaseCard({ item, asset, onOpen, isNew = false, delivery = null }) {
  return (
    <button
      onClick={() => onOpen(item)}
      className={`group flex flex-col overflow-hidden text-left transition-all duration-[170ms] ease-out
                  hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${CARD}
                  ${isNew ? "border-blue-300 ring-2 ring-blue-500/25" : "hover:border-slate-200"}`}
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
          {isNew && (
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-white shadow-sm">New</span>
          )}
          {!item.isDraft && delivery && delivery.ok && CARD_DELIVERY.has(delivery.state) && (
            <DeliveryChip state={delivery.state} />
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

/* Filter pills, styled to match the investor app exactly.
   The class string and both style objects below are copied verbatim from the
   timeline's year selector in aiBrief/PassportProto.jsx -- a company switching
   between the portal and their own app profile should be pressing the same
   control, not a portal dialect of it. The app itself is untouched; this is a
   copy, not a shared component, because extracting one would mean editing the
   app to import it.
   #2563eb is the app's EM blue, written as a literal there and so here.

   Values are generated only from what occurs: a company with three releases in
   2026 gets one year pill, not a decade of empty ones, and a dimension with
   nothing to choose between renders nothing at all.

   NO QUARTER ROW. Quarters were a portal invention -- the app offers milestones
   and years, and nothing else -- so the portal now offers the same two. */
/* One pill. Milestones sits apart from the years on the right of the row, so
   both sides render this rather than a grouped list -- they are still ONE
   choice, and pressing Milestones deselects the year exactly as it does in the
   app. */
function Pill({ id, label, value, onChange, children }) {
  const on = value === id;
  return (
    <button
      onClick={() => onChange(id)}
      aria-pressed={on}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold tabular-nums tracking-tight transition active:scale-95"
      style={on
        ? { background: "#2563eb", color: "#fff", boxShadow: "0 4px 12px -5px rgba(37,99,235,0.7)" }
        : { background: "#fff", color: "#64748b", border: "1px solid #e2e8f0" }}
    >
      {children}
      {label}
    </button>
  );
}

export default function ReleaseLibrary({ drafts, published, onCreate, onDraft, onOpen, justPublishedIds = [] }) {
  const [companyAssets, setCompanyAssets] = useState([]);
  // ONE filter, not four. Milestones and years are alternatives to each other
  // in the app -- pressing a year leaves the milestone view -- so they are one
  // choice here too, rather than four dimensions that can be combined into
  // states no one asked for.
  const [pick, setPick] = useState("all");
  const [q, setQ] = useState("");

  const fresh = useMemo(() => new Set(justPublishedIds || []), [justPublishedIds]);
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

  // Delivery status of the most recent published releases (one small RPC each,
  // four at a time). Older releases are long settled; opening one shows it.
  const [delivery, setDelivery] = useState({});
  useEffect(() => {
    const targets = (published || []).map((r) => ({ updateId: r.id, pub: passportPublication(r) }))
      .filter((x) => x.pub).slice(0, DELIVERY_CARDS);
    if (!targets.length) return undefined;
    const byPub = Object.fromEntries(targets.map((x) => [x.pub.id, x.updateId]));
    return fetchManyDeliveryStatuses(
      targets.map((x) => ({ publicationId: x.pub.id, createdAt: x.pub.created_at || null })),
      (pid, st) => setDelivery((m) => ({ ...m, [byPub[pid]]: st })),
    );
  }, [published]);

  // All · Milestones · each year that actually has a release, newest first.
  // Nothing offered that would return an empty grid: a company with three
  // releases in 2026 gets one year pill, and Milestones appears only once the
  // uploader has actually judged something significant.
  const options = useMemo(() => {
    const years = [...new Set(items.map((i) => i.year).filter(Boolean))].sort((a, b) => b - a);
    return [
      { id: "all", label: "All" },
      ...years.map((y) => ({ id: `y${y}`, label: String(y) })),
    ];
  }, [items]);

  // Rendered on the right of the row, beside the search box, rather than in
  // line with the years -- it is a different question ("what mattered?" vs
  // "when?"), and the app separates it too, with a divider before its diamond.
  const hasMilestones = useMemo(() => items.some((i) => i.isMilestone), [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .filter((i) => (pick === "all" ? true
                    : pick === "milestones" ? i.isMilestone
                    : String(i.year) === pick.slice(1)))
      .filter((i) => (needle ? i.headline.toLowerCase().includes(needle) : true))
      // Newest first, undated drafts at the top — they are the ones needing work.
      .sort((a, b) => {
        if (!a.date && !b.date) return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
        if (!a.date) return -1;
        if (!b.date) return 1;
        return String(b.date).localeCompare(String(a.date));
      });
  }, [items, pick, q]);

  const anyFilter = pick !== "all" || q.trim();
  const clearAll = () => { setPick("all"); setQ(""); };

  const loading = drafts === null || published === null;

  return (
    <div>
      {/* No Create/Draft buttons here any more: the page above this opens with
          those as tiles, and a second, smaller copy of the same two actions on
          the same screen just splits the reader's attention. */}
      {/* Search left, filters right, one row above the grid. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5">
          <Search size={13} className="shrink-0 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search releases"
            className="w-44 bg-transparent text-[12px] font-semibold text-slate-700 placeholder:font-bold placeholder:text-slate-400 focus:outline-none"
          />
        </div>

        {anyFilter ? (
          <button onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-[12.5px] font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={13} /> Clear
          </button>
        ) : null}

        <div role="group" aria-label="Filter releases"
             className="ml-auto flex flex-wrap items-center gap-2">
          {options.map((o) => (
            <Pill key={o.id} id={o.id} label={o.label} value={pick} onChange={setPick} />
          ))}
          {hasMilestones && (
            <Pill id="milestones" label="Milestones" value={pick} onChange={setPick}>
              <Gem size={12} strokeWidth={2.6} />
            </Pill>
          )}
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
            onCreate ? <button onClick={onCreate} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white">
              Create new
            </button> : null
          )}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <ReleaseCard key={item.id} item={item} asset={assetByDoc[item.documentId]} onOpen={onOpen}
              isNew={fresh.has(item.id)} delivery={delivery[item.id] || null} />
          ))}
        </div>
      )}
    </div>
  );
}
