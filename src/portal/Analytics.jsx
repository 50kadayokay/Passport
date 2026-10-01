// Analytics — what investors actually did with this company's releases.
//
// Every number on this page comes from recorded events (post_events,
// company_follows, post_likes, post_saves) through 0048's aggregate functions.
// Nothing is modelled, estimated or extrapolated, and the page distinguishes
// three states that are easy to conflate:
//
//   null   we could not read it        -> "not available yet"
//   0      we read it and it is zero   -> the number 0, plainly
//   n/a    nothing records it at all   -> shares, said out loud
//
// Shares are in that third group: post_events' CHECK constraint allows
// impression/open/save/unsave/dwell and nothing else, so a share count would
// have to be invented. It is shown as untracked instead of omitted, because
// silently dropping a metric someone asked for reads as zero.

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Eye, BookOpen, Users, Heart, Bookmark, Share2, Clock, TrendingUp,
  BarChart3, AlertCircle, Loader2,
} from "lucide-react";
import { engagementTotals, engagementDaily, postEngagement, readRate } from "../lib/engagement.js";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Count from 0 to `target`, eased.
 *
 * easeOutExpo because a linear count looks mechanical: the number should arrive
 * quickly and settle, the way a odometer slowing down does. Honours
 * prefers-reduced-motion by jumping straight to the value -- an animated number
 * is decoration, and decoration is the first thing to drop.
 */
function useCountUp(target, { duration = 1100, delay = 0 } = {}) {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  const timer = useRef(0);

  useEffect(() => {
    const end = Number(target) || 0;
    if (prefersReducedMotion() || end === 0) { setV(end); return undefined; }

    let start = 0;
    const tick = (now) => {
      if (!start) start = now;
      const t = Math.min((now - start) / duration, 1);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setV(end * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else setV(end);
    };
    timer.current = setTimeout(() => { raf.current = requestAnimationFrame(tick); }, delay);

    return () => { clearTimeout(timer.current); cancelAnimationFrame(raf.current); };
  }, [target, duration, delay]);

  return v;
}

/** Fade-and-rise on mount, staggered by index. */
function useReveal(delay = 0) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) { setOn(true); return undefined; }
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return on;
}

// Dates render in UTC, as everywhere else in the portal. `new Date("2026-08-14")`
// parses as UTC midnight and toLocaleDateString() then renders it in local time,
// so west of Greenwich every date-only value shows a day early.
function fmtDay(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function Metric({ Icon, label, value, note, index = 0, untracked = false, unavailable = false }) {
  const shown = useCountUp(unavailable || untracked ? 0 : value, { delay: 120 + index * 70 });
  const on = useReveal(index * 70);

  const body = untracked ? "—" : unavailable ? "—" : Math.round(shown).toLocaleString();

  return (
    <div
      className={`p-5 ${CARD} transition-all duration-500 ease-out`}
      style={{ opacity: on ? 1 : 0, transform: on ? "translateY(0)" : "translateY(10px)" }}
    >
      <div className="flex items-center gap-2.5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
          untracked || unavailable ? "bg-slate-50 text-slate-300" : "bg-blue-50 text-blue-600"}`}>
          <Icon size={17} strokeWidth={2.2} />
        </span>
        <span className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</span>
      </div>
      <p className={`mt-3 text-[30px] font-extrabold leading-none tracking-tight tabular-nums ${
        untracked || unavailable ? "text-slate-300" : "text-slate-900"}`}>
        {body}
      </p>
      {note && <p className="mt-1.5 text-[11.5px] leading-snug text-slate-400">{note}</p>}
    </div>
  );
}

/**
 * The trend line, drawn on rather than snapped in: stroke-dashoffset animated
 * from full length to zero, so the eye follows the shape left to right.
 */
function Trend({ series }) {
  const on = useReveal(300);
  const pathRef = useRef(null);
  const [len, setLen] = useState(0);

  useEffect(() => {
    if (pathRef.current) setLen(pathRef.current.getTotalLength());
  }, [series]);

  const { d, dRead, max } = useMemo(() => {
    const rows = series || [];
    if (rows.length < 2) return { d: "", dRead: "", max: 0 };
    const m = Math.max(1, ...rows.map((r) => r.views));
    const W = 640, H = 120, pad = 4;
    const x = (i) => (i / (rows.length - 1)) * W;
    const y = (v) => H - pad - (v / m) * (H - pad * 2);
    const line = (key) => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(r[key]).toFixed(1)}`).join(" ");
    return { d: line("views"), dRead: line("reads"), max: m };
  }, [series]);

  if (!d) {
    return (
      <p className="py-10 text-center text-[13px] text-slate-400">
        Not enough history yet to draw a trend.
      </p>
    );
  }

  return (
    <div>
      <svg viewBox="0 0 640 120" className="h-[120px] w-full" preserveAspectRatio="none" role="img"
           aria-label="Daily views and reads over the last 30 days">
        <path ref={pathRef} d={d} fill="none" stroke="rgb(37 99 235)" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              style={{
                strokeDasharray: len || undefined,
                strokeDashoffset: on ? 0 : len || undefined,
                transition: "stroke-dashoffset 1200ms cubic-bezier(.22,1,.36,1)",
              }} />
        <path d={dRead} fill="none" stroke="rgb(148 163 184)" strokeWidth="1.5"
              strokeDasharray="4 4" strokeLinecap="round"
              style={{ opacity: on ? 1 : 0, transition: "opacity 700ms ease-out 600ms" }} />
      </svg>
      <div className="mt-2 flex items-center gap-4 text-[11.5px] text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-blue-600" /> Views</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-slate-400" /> Reads</span>
        <span className="ml-auto">Peak {max.toLocaleString()}/day</span>
      </div>
    </div>
  );
}

export default function Analytics({ company }) {
  const companyId = company?.id;
  const [totals, setTotals] = useState(undefined);   // undefined = loading, null = unavailable
  const [daily, setDaily] = useState(undefined);
  const [posts, setPosts] = useState(undefined);

  useEffect(() => {
    let alive = true;
    if (!companyId) return undefined;
    engagementTotals(companyId).then((t) => { if (alive) setTotals(t); });
    engagementDaily(companyId, 30).then((d) => { if (alive) setDaily(d); });
    postEngagement(companyId, 10).then((p) => { if (alive) setPosts(p); });
    return () => { alive = false; };
  }, [companyId]);

  const loading = totals === undefined;
  const unavailable = totals === null;
  const rate = readRate(totals);
  const nothingYet = totals && !totals.views && !totals.reads && !totals.followers && !totals.likes && !totals.saves;

  return (
    <div>
      <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Analytics</h1>
      <p className="mt-1 text-[14px] text-slate-500">
        What investors did with your releases. Recorded activity only — nothing here is estimated.
      </p>

      {loading && (
        <div className="mt-8 grid place-items-center py-16"><Loader2 size={22} className="animate-spin text-blue-500" /></div>
      )}

      {unavailable && (
        <div className={`mt-6 flex items-start gap-3.5 px-5 py-5 ${CARD}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600"><AlertCircle size={19} /></span>
          <div>
            <p className="text-[14.5px] font-bold text-slate-900">Engagement reporting is not switched on yet</p>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-slate-500">
              Views, reads, follows, likes and saves are already being recorded against your releases. This page
              needs a database update before it can read them back. Nothing has been lost.
            </p>
          </div>
        </div>
      )}

      {!loading && !unavailable && (
        <>
          {nothingYet && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
              <BarChart3 size={18} className="mt-0.5 shrink-0 text-slate-400" />
              <p className="text-[13px] leading-relaxed text-slate-600">
                No investor activity recorded yet. These fill in once your profile is published and investors
                start seeing your releases.
              </p>
            </div>
          )}

          <h2 className="mt-7 text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">Reach</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric index={0} Icon={Eye}      label="Views"     value={totals.views}
              note="Times a release appeared in an investor's feed" />
            <Metric index={1} Icon={BookOpen} label="Reads"     value={totals.reads}
              note={rate === null ? "Opened in full" : `${(rate * 100).toFixed(0)}% of views became reads`} />
            <Metric index={2} Icon={Users}    label="Followers" value={totals.followers}
              note="Investors following this company" />
            <Metric index={3} Icon={Clock}    label="Avg. time" value={Math.round(totals.avgDwellSecs || 0)}
              unavailable={totals.avgDwellSecs === null}
              note={totals.avgDwellSecs === null ? "No reading time recorded yet" : "Seconds spent reading"} />
          </div>

          <h2 className="mt-8 text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">Response</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric index={0} Icon={Heart}      label="Likes"  value={totals.likes} note="Investors who liked a release" />
            <Metric index={1} Icon={Bookmark}   label="Saves"  value={totals.saves} note="Saved to read or track later" />
            <Metric index={2} Icon={Share2}     label="Shares" value={0} untracked
              note="Not tracked yet — sharing isn't recorded" />
            <Metric index={3} Icon={TrendingUp} label="Releases" value={totals.posts} note="Live on your investor profile" />
          </div>

          <h2 className="mt-8 text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">Last 30 days</h2>
          <div className={`mt-3 p-5 ${CARD}`}>
            {daily === null
              ? <p className="py-10 text-center text-[13px] text-slate-400">Trend data isn't available.</p>
              : daily === undefined
                ? <div className="grid place-items-center py-10"><Loader2 size={18} className="animate-spin text-blue-500" /></div>
                : <Trend series={daily} />}
          </div>

          <h2 className="mt-8 text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">By release</h2>
          <div className={`mt-3 overflow-hidden ${CARD}`}>
            {!posts || !posts.length ? (
              <p className="px-5 py-10 text-center text-[13px] text-slate-400">
                No published releases yet.
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Release</th>
                    <th className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Views</th>
                    <th className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Reads</th>
                    <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Likes</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50 last:border-0">
                      <td className="max-w-0 px-5 py-3.5">
                        <p className="truncate text-[13.5px] font-semibold text-slate-800">{p.title}</p>
                        {p.publishedAt && (
                          <p className="text-[11.5px] text-slate-400">{fmtDay(p.publishedAt)}</p>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-right text-[13.5px] tabular-nums text-slate-600">{p.views.toLocaleString()}</td>
                      <td className="px-3 py-3.5 text-right text-[13.5px] tabular-nums text-slate-600">{p.reads.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-right text-[13.5px] tabular-nums text-slate-600">{p.likes.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
