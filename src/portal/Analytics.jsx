// Analytics — what investors actually did with this company's releases.
//
// Every number on this page comes from recorded events (post_events,
// company_follows, post_likes, post_saves) through the aggregate functions of
// 0048/0065a/0065b, and impressions through 0073b (recorded only from when the
// app began sending them -- the page says from when).
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
  BarChart3, AlertCircle, Loader2, Image as ImageIcon, FileText, UserPlus,
  Search, Archive,
} from "lucide-react";
import {
  engagementTotals,
  engagementByType, followerGrowth, contentPerformance, unattributedEngagement,
  impressionSummary, postImpressions, failureKind,
} from "../lib/engagement.js";

// Why a figure is missing, worded truthfully: an outage is not a pending update.
const missingNote = (fn) => (failureKind(fn) === "failed" ? "Couldn't load just now" : "Needs a database update");

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

    // A backgrounded tab never delivers a frame, so the animation can be
    // requested and then simply never run -- leaving the tile reading 0 for as
    // long as the page lives, which is a wrong number rather than a missing
    // one. This snaps to the real value once the animation has had its time,
    // whether or not a single frame arrived.
    const safety = setTimeout(() => setV(end), delay + duration + 250);

    return () => {
      clearTimeout(timer.current); clearTimeout(safety); cancelAnimationFrame(raf.current);
    };
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

function Metric({ Icon, label, value, note, suffix = "", index = 0, untracked = false, unavailable = false }) {
  const shown = useCountUp(unavailable || untracked ? 0 : value, { delay: 120 + index * 70 });
  const on = useReveal(index * 70);

  const body = untracked || unavailable ? "—" : Math.round(shown).toLocaleString() + suffix;

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

/* The period every windowed figure on the page answers to. `days: null` is all
   time -- passed through to the RPCs as null, where it means no lower bound.
   Narrowest last, so the control reads shortest-to-longest left to right the
   way a date range does. */
const PERIODS = [
  { id: "all", label: "All time", days: null, short: "ALL" },
  { id: "90",  label: "90 days",  days: 90,   short: "90D" },
  { id: "30",  label: "30 days",  days: 30,   short: "30D" },
];

function PeriodToggle({ value, onChange, busy }) {
  return (
    <div role="group" aria-label="Reporting period"
         className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1">
      {PERIODS.map((p) => {
        const on = p.id === value;
        return (
          <button key={p.id} onClick={() => onChange(p.id)} aria-pressed={on}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition ${
              on ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,.08)]"
                 : "text-slate-500 hover:text-slate-800"}`}>
            {p.label}
          </button>
        );
      })}
      {/* Only the windowed figures reload, so a spinner over the whole page
          would be a lie about what is changing. */}
      <Loader2 size={13} className={`ml-1 mr-1 shrink-0 animate-spin text-blue-500 transition-opacity ${
        busy ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
    </div>
  );
}

/* A labelled band. Five of them, in the order the brief sets. */
function Section({ n, title, sub, children }) {
  return (
    <section className="mt-9 first:mt-7">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[11px] font-bold tabular-nums text-slate-300">{n}</span>
        <h2 className="text-[15px] font-extrabold tracking-tight text-slate-900">{title}</h2>
      </div>
      {sub && <p className="mt-1 text-[12.5px] text-slate-400">{sub}</p>}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

const G4 = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4";
const G3 = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3";

/* One row of the content list. */
function ContentRow({ item, onOpen, short }) {
  const isMedia = item.postType === "media";
  return (
    <button onClick={() => onOpen(item)}
      className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50/70">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${isMedia ? "bg-teal-50 text-teal-600" : "bg-blue-50 text-blue-600"}`}>
        {isMedia ? <ImageIcon size={15} strokeWidth={2.2} /> : <FileText size={15} strokeWidth={2.2} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-bold text-slate-900">{item.title}</span>
        <span className="block text-[11.5px] text-slate-400">
          {isMedia ? "Media" : "Press release"}{item.publishedAt ? ` · ${fmtDay(item.publishedAt)}` : ""}
        </span>
      </span>
      <span className="hidden shrink-0 text-right sm:block">
        <span className="block text-[13px] font-bold tabular-nums text-slate-900">{item.reads.toLocaleString()}</span>
        <span className="block text-[10.5px] uppercase tracking-wider text-slate-400">opens</span>
      </span>
      <span className="ml-5 hidden shrink-0 text-right md:block">
        <span className="block text-[13px] font-bold tabular-nums text-slate-900">{item.readsRecent.toLocaleString()}</span>
        <span className="block text-[10.5px] uppercase tracking-wider text-slate-400">{short}</span>
      </span>
    </button>
  );
}

/* The per-item view. Lifetime and recent side by side, and the metrics that
   are NOT collected for this kind of item are named rather than omitted --
   a missing row reads as zero, and zero is a claim. */
function ItemDetail({ item, onBack, period, impr, recordedSince }) {
  const isMedia = item.postType === "media";
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
        <button onClick={onBack} className="rounded-lg px-2 py-1 text-[12.5px] font-bold text-blue-600 transition hover:bg-blue-50">&larr; All content</button>
      </div>
      <div className="px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{isMedia ? "Media" : "Press release"}</p>
        <h3 className="mt-1 text-[17px] font-extrabold tracking-tight text-slate-900">{item.title}</h3>
        {item.publishedAt && <p className="mt-1 text-[12.5px] text-slate-400">Published {fmtDay(item.publishedAt)}</p>}

        <div className={`mt-5 ${G4}`}>
          <Metric index={0} Icon={BookOpen} label="Opens (lifetime)" value={item.reads} note="Times an investor opened it" />
          <Metric index={1} Icon={TrendingUp} label={`Opens (${period.label.toLowerCase()})`} value={item.readsRecent}
            note={period.days === null ? "Same as lifetime, by definition" : "Recent activity"} />
          <Metric index={2} Icon={Clock} label="Avg. time" value={Math.round(item.avgDwellSecs || 0)} suffix="s"
            unavailable={item.avgDwellSecs == null} note={item.avgDwellSecs == null ? "No dwell recorded yet" : isMedia ? "Seconds spent on it" : "Seconds spent reading"} />
          <Metric index={3} Icon={Heart} label="Likes" value={item.likes} note="Investors who liked it" />
        </div>
        <div className={`mt-3 ${G4}`}>
          <Metric index={4} Icon={Bookmark} label="Saves" value={item.saves}
            note={item.saveActions
              ? `Currently saved · ${item.saveActions.toLocaleString()} recorded in total`
              : "Currently saved by an investor"} />
          {/* a12: impressions exist only from when the app began recording them. */}
          <Metric index={5} Icon={Eye} label="Impressions" value={impr ? impr.impressions : 0}
            unavailable={impr === null} untracked={impr !== null && !recordedSince}
            note={impr === null ? missingNote("company_post_impressions") : !recordedSince ? "Not recorded yet"
                  : `Since ${fmtDay(recordedSince)} · ${(impr ? impr.impressionsRecent : 0).toLocaleString()} ${period.days === null ? "all time" : period.label.toLowerCase()}`} />
          <Metric index={6} Icon={Share2} label="Shares" value={0} untracked note="Sharing isn't recorded" />
          <Metric index={7} Icon={BarChart3} label={isMedia ? "Open rate" : "Read rate"} value={0} untracked
            note="Shown for all posts together, from when impressions began" />
        </div>
        {isMedia && (
          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
            Photos and videos share a single content type, so this post cannot be identified as one or the other.
            Video-only measures — plays, watch time, completion — are therefore not reported for any media post.
          </p>
        )}
      </div>
    </div>
  );
}

/* Engagement that is real but cannot appear in the item list: opens and likes
   on retired posts, and likes/saves whose post_key matches no post. Renders
   nothing at all when there is none, which is the common case. */
function Unattributed({ u }) {
  if (!u) return null;
  const retired = u.retiredReads + u.retiredLikes + u.retiredSaves;
  const orphan = u.orphanLikes + u.orphanSaves;
  if (!retired && !orphan) return null;
  const n = (v) => v.toLocaleString();
  return (
    <div className="mt-3 flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-slate-400 ring-1 ring-inset ring-slate-200">
        <Archive size={15} strokeWidth={2.2} />
      </span>
      <p className="text-[11.5px] leading-relaxed text-slate-500">
        <span className="font-bold text-slate-700">Not counted above.</span>{" "}
        {retired > 0 && (
          <>
            {n(u.retiredReads)} open{u.retiredReads === 1 ? "" : "s"}
            {u.retiredLikes > 0 && `, ${n(u.retiredLikes)} like${u.retiredLikes === 1 ? "" : "s"}`}
            {u.retiredSaves > 0 && ` and ${n(u.retiredSaves)} save${u.retiredSaves === 1 ? "" : "s"}`}
            {" "}on {n(u.retiredPosts)} post{u.retiredPosts === 1 ? "" : "s"} you have unpublished. Re-publishing
            brings them back into the figures above.{" "}
          </>
        )}
        {orphan > 0 && (
          <>
            A further {n(orphan)} like{orphan === 1 ? "" : "s"}/save{orphan === 1 ? "" : "s"} reference content that
            no longer exists and cannot be attributed to any post.
          </>
        )}
      </p>
    </div>
  );
}

export default function Analytics({ company }) {
  const companyId = company?.id;
  const [totals, setTotals] = useState(undefined);     // undefined = loading, null = unavailable
  const [byType, setByType] = useState(undefined);
  const [growth, setGrowth] = useState(undefined);
  const [content, setContent] = useState(undefined);
  const [unattr, setUnattr] = useState(undefined);
  const [impr, setImpr] = useState(undefined);         // a12: undefined loading · null unavailable · {firstRecordedAt...}
  const [postImpr, setPostImpr] = useState(undefined);
  const [periodId, setPeriodId] = useState("30");
  const [windowBusy, setWindowBusy] = useState(false);
  const period = PERIODS.find((p) => p.id === periodId) || PERIODS[2];
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [openItem, setOpenItem] = useState(null);

  // Lifetime figures do not depend on the period, so they are fetched once.
  // Re-fetching them on every toggle would make the whole page flicker to
  // redraw numbers that cannot have changed.
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!companyId) return undefined;
    setTotals(undefined);
    engagementTotals(companyId).then((t) => { if (alive) setTotals(t); });
    unattributedEngagement(companyId).then((u) => { if (alive) setUnattr(u); });
    return () => { alive = false; };
  }, [companyId, retryKey]);

  // The windowed figures. All three read the SAME period, so the tiles and the
  // per-item column in section 03 can never disagree.
  //
  // company_engagement_daily is deliberately NOT called any more -- it existed
  // only to draw the trend lines. The function and 0065b's correction of it
  // stay, because it is still granted to authenticated and a function that
  // reports one of these metrics on different rules than the rest would be a
  // trap for whoever reads it next.
  useEffect(() => {
    let alive = true;
    if (!companyId) return undefined;
    const days = period.days;
    setWindowBusy(true);
    Promise.all([
      engagementByType(companyId, days).then((b) => { if (alive) setByType(b); }),
      followerGrowth(companyId, days).then((g) => { if (alive) setGrowth(g); }),
      contentPerformance(companyId, days).then((c) => { if (alive) setContent(c); }),
      impressionSummary(companyId, days).then((x) => { if (alive) setImpr(x); }),
      postImpressions(companyId, days).then((x) => { if (alive) setPostImpr(x); }),
    ]).finally(() => { if (alive) setWindowBusy(false); });
    return () => { alive = false; };
  }, [companyId, period.days, retryKey]);

  const loading = totals === undefined;
  // Missing function (needs a database update) vs a failed call (try again).
  const outage = totals === null && failureKind("company_engagement_totals") === "failed";
  const unavailable = totals === null;

  const typeOf = (t) => (byType || []).find((r) => r.postType === t) || null;
  const rel = typeOf("press_release");
  const med = typeOf("media");
  const isAllTime = period.days === null;

  // Section 02's figures come from the type split rather than from
  // company_engagement_totals, because the split is period-scoped and the
  // totals function is not. At all time the two agree exactly -- the
  // reconciliation suite asserts it -- so this is one source of truth for the
  // tiles and the type breakdown instead of two that could drift.
  const { reads, likes, saves, saveActions, avgDwell } = useMemo(() => {
    if (!byType) return { reads: 0, likes: 0, saves: 0, saveActions: null, avgDwell: null };
    const sum = (k) => byType.reduce((a, r) => a + (r[k] || 0), 0);
    const r = sum("reads");
    // Reads-weighted, never a mean of means: a release read for 90 s and a
    // photo glanced at for 15 s do not average to 52 s unless they were opened
    // the same number of times.
    const weighted = byType.reduce(
      (a, x) => a + (x.avgDwellSecs == null ? 0 : x.avgDwellSecs * (x.reads || 0)), 0);
    const withDwell = byType.reduce((a, x) => a + (x.avgDwellSecs == null ? 0 : (x.reads || 0)), 0);
    return {
      reads: r, likes: sum("likes"), saves: sum("saves"),
      // Current state and historical actions are different measurements.
      // `saves` counts post_saves rows, which an unsave deletes; save actions
      // count append-only 'save' events, which nothing can take back. Shown
      // side by side, never added -- 0048 added them, and double counted
      // anyone who did both.
      saveActions: sum("saveActions"),
      avgDwell: withDwell ? weighted / withDwell : null,
    };
  }, [byType]);

  // "the past 30 calendar days, today included" is only true for one of the
  // three settings, so the sentence is built from the period rather than fixed.
  const periodSub = (lead) => (period.days === null
    ? `${lead} since your first recorded activity.`
    : `${lead} over the past ${period.days} calendar days, today included.`);

  const newFollowersInPeriod = useMemo(
    () => (growth || []).reduce((a, r) => a + (r.newFollowers || 0), 0),
    [growth]
  );

  const filtered = useMemo(() => {
    const list = content || [];
    const byKind = filter === "all" ? list
      : filter === "releases" ? list.filter((c) => c.postType === "press_release")
      : list.filter((c) => c.postType === "media");
    const term = q.trim().toLowerCase();
    return term ? byKind.filter((c) => c.title.toLowerCase().includes(term)) : byKind;
  }, [content, filter, q]);

  return (
    <div>
      <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Analytics</h1>
      <p className="mt-1 text-[14px] text-slate-500">
        Recorded activity only. Anything not yet measured is marked, never shown as zero.
      </p>
      {!loading && !unavailable && (
        <div className="mt-4">
          <PeriodToggle value={periodId} onChange={setPeriodId} busy={windowBusy} />
        </div>
      )}

      {loading && (
        <div className="mt-8 grid place-items-center py-16"><Loader2 size={22} className="animate-spin text-blue-500" /></div>
      )}

      {unavailable && outage && (
        <div role="alert" data-testid="analytics-error" className={`mt-6 flex items-start gap-3.5 px-5 py-5 ${CARD}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600"><AlertCircle size={19} /></span>
          <div>
            <p className="text-[14.5px] font-bold text-slate-900">Analytics could not be loaded just now</p>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-slate-500">
              Nothing has been lost: activity is still being recorded. Try again in a moment.
            </p>
            <button onClick={() => setRetryKey((k) => k + 1)}
              className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-700 hover:border-slate-300">
              Try again
            </button>
          </div>
        </div>
      )}

      {unavailable && !outage && (
        <div className={`mt-6 flex items-start gap-3.5 px-5 py-5 ${CARD}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600"><AlertCircle size={19} /></span>
          <div>
            <p className="text-[14.5px] font-bold text-slate-900">Engagement reporting is not switched on yet</p>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-slate-500">
              Opens, follows, likes and saves are already being recorded against your content. This page needs a
              database update before it can read them back. Nothing has been lost.
            </p>
          </div>
        </div>
      )}

      {!loading && !unavailable && (
        <>
          {/* 1 ─────────────────────────────────────────────────────────── */}
          {/* ONE set of sections, scoped to whatever the toggle says. There
              used to be a lifetime band and a 30-day band for each subject,
              which with a working period control meant printing the same three
              metrics twice and leaving the reader to work out which one the
              toggle governed. All time IS the lifetime reading, so it is a
              setting rather than a separate section. */}
          <Section n="01" title={`Profile — ${period.label.toLowerCase()}`}
            sub={periodSub("Your profile itself, distinct from activity on individual posts")}>
            <div className={G3}>
              {/* At all time, first-time follows and the follower count are the
                  same number -- every follower's first follow is inside the
                  window -- so the tile is named for what it is showing rather
                  than carrying a period label that would be redundant. */}
              <Metric index={0} Icon={isAllTime ? Users : UserPlus}
                label={isAllTime ? "Followers" : "New followers"}
                value={isAllTime ? totals.followers : newFollowersInPeriod}
                unavailable={!isAllTime && growth === null}
                note={isAllTime ? "Investors following this company"
                      : growth === null ? missingNote("company_follower_growth") : "First-time follows, still following"} />
              <Metric index={1} Icon={Eye} label="Profile views" value={0} untracked note="Not recorded yet — needs instrumentation" />
              <Metric index={2} Icon={UserPlus} label="Unique visitors" value={0} untracked note="Not recorded yet — needs instrumentation" />
            </div>
            {/* Named, not hidden. A page that silently omits what it cannot
                measure invites the reader to assume it measured everything. */}
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-slate-400">
              Profile views and unique visitors are not collected anywhere yet. They are shown as untracked rather
              than as zero, because zero would be a claim that nobody looked.
            </p>
          </Section>

          {/* 2 ─────────────────────────────────────────────────────────── */}
          <Section n="02" title={`Media & posts — ${period.label.toLowerCase()}`}
            sub={periodSub("Everything investors did with your press releases and media")}>
            <div className={G4}>
              <Metric index={0} Icon={BookOpen} label="Post opens" value={reads}
                unavailable={byType === null} note="Press releases and media combined" />
              <Metric index={1} Icon={FileText} label="Release opens" value={rel ? rel.reads : 0}
                unavailable={byType === null} note={byType === null ? missingNote("company_engagement_by_type") : `${rel ? rel.posts : 0} release${rel && rel.posts === 1 ? "" : "s"} live`} />
              <Metric index={2} Icon={ImageIcon} label="Media opens" value={med ? med.reads : 0}
                unavailable={byType === null} note={byType === null ? missingNote("company_engagement_by_type") : `${med ? med.posts : 0} media post${med && med.posts === 1 ? "" : "s"} live`} />
              <Metric index={3} Icon={Clock} label="Avg. time" value={Math.round(avgDwell || 0)} suffix="s"
                unavailable={avgDwell == null} note="Seconds spent reading a post" />
            </div>
            <div className={`mt-3 ${G4}`}>
              <Metric index={4} Icon={Heart} label="Likes" value={likes} unavailable={byType === null}
                note="Investors who liked a post" />
              <Metric index={5} Icon={Bookmark} label="Saves" value={saves} unavailable={byType === null}
                note={saveActions == null ? "Currently saved by an investor"
                      : `Still saved · ${saveActions.toLocaleString()} save${saveActions === 1 ? "" : "s"} pressed`} />
              <Metric index={6} Icon={Eye} label="Impressions" value={impr ? impr.impressions : 0}
                unavailable={!impr}
                untracked={!!impr && !impr.firstRecordedAt}
                note={impr === undefined ? "Loading…" : impr === null ? missingNote("company_impression_summary")
                      : !impr.firstRecordedAt ? "Not recorded yet"
                      : `Seen in a feed · ${impr.viewers.toLocaleString()} investor${impr.viewers === 1 ? "" : "s"}`} />
              <Metric index={7} Icon={Share2} label="Shares" value={0} untracked note="Sharing isn't recorded" />
            </div>
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-slate-400" data-testid="impressions-note">
              An impression is a post shown in an investor's feed — at least half on screen for a second — counted
              once per investor, per post, per day.{" "}
              {impr && impr.firstRecordedAt
                ? <>Impressions have been recorded since {fmtDay(impr.firstRecordedAt)}; nothing earlier was recorded.{" "}
                    {impr.readRate == null
                      ? "There is no read rate for this period yet."
                      : <>Read rate since then: <span className="font-bold text-slate-600">{Math.round(impr.readRate * 100)}%</span> ({impr.opensSince.toLocaleString()} open{impr.opensSince === 1 ? "" : "s"} from {impr.impressions.toLocaleString()} impression{impr.impressions === 1 ? "" : "s"}). Earlier opens are left out because they had no impression to measure against.</>}</>
                : impr === null
                  ? (failureKind("company_impression_summary") === "failed"
                      ? "Impression figures could not be loaded just now."
                      : "Impression figures need a database update on this environment, so they are not shown.")
                  : "None has been recorded yet, so impressions and read rate are shown as not recorded rather than as zero."}
              {!isAllTime && " Saves counts investors who saved in this period and still have it saved; post_saves holds current state, not history."}
            </p>
            {/* Every figure above counts posts that are live, so these totals
                equal the sum of the list below and a reader can check it by
                adding up the column. Engagement that no live post can account
                for is named here instead of quietly inflating the total or
                quietly disappearing from it. */}
            {isAllTime && <Unattributed u={unattr} />}
          </Section>

          {/* 3 ─────────────────────────────────────────────────────────── */}
          <Section n="03" title="Individual content performance"
            sub={`Every live release and media post — lifetime, and ${period.label.toLowerCase()}.`}>
            {openItem ? (
              <ItemDetail item={openItem} onBack={() => setOpenItem(null)} period={period}
                impr={postImpr === null ? null : (postImpr || {})[openItem.id] || { impressions: 0, impressionsRecent: 0 }}
                recordedSince={impr ? impr.firstRecordedAt : null} />
            ) : content === null ? (
              <div className={`px-5 py-10 text-center ${CARD}`}>
                <p className="text-[13px] text-slate-400">Per-item performance needs a database update.</p>
              </div>
            ) : (
              <div className={`${CARD} overflow-hidden`}>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
                  <div className="flex items-center gap-1">
                    {[["all", "All"], ["releases", "Press releases"], ["media", "Photos & videos"]].map(([id, label]) => (
                      <button key={id} onClick={() => setFilter(id)}
                        className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition ${
                          filter === id ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex min-w-[200px] flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 sm:max-w-[260px]">
                    <Search size={14} className="shrink-0 text-slate-400" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles"
                      className="w-full bg-transparent text-[12.5px] text-slate-700 placeholder:text-slate-400 focus:outline-none" />
                  </div>
                </div>
                {filtered.length === 0 ? (
                  <p className="px-5 py-12 text-center text-[13px] text-slate-400">
                    {q.trim() ? `Nothing matches “${q.trim()}”.` : "Nothing published in this category yet."}
                  </p>
                ) : (
                  filtered.map((it) => <ContentRow key={it.id} item={it} onOpen={setOpenItem} short={period.short} />)
                )}
              </div>
            )}
            {/* Press releases and media are genuinely separate in the data.
                Photos and videos are NOT -- both are stored as post_type
                'media', with no discriminator -- so this page groups them and
                says so, rather than offering a split it cannot stand behind.
                ItemDetail makes the same point for a single post, so only one
                of the two is ever on screen. */}
            {!openItem && <p className="mt-2.5 text-[11.5px] leading-relaxed text-slate-400">
              Press releases and media are counted separately. Photos and videos are not: they are stored as one
              kind of post, so they are reported together until that changes.
            </p>}
          </Section>
        </>
      )}
    </div>
  );
}
