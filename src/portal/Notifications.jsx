// Notifications — who followed the company, who liked a release.
//
// A feed, not an inbox: nothing here needs replying to, so there is no action on
// a row. It answers one question ("what happened while I was away?") and gets
// out of the way.
//
// Only deliberate acts appear. A follow and a like are things an investor chose
// to do and expects to be seen; views and reads are passive and stay aggregate
// on Analytics. That line is set in migration 0049, which explains itself.

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Bell, UserPlus, Heart, AlertCircle, Loader2, RefreshCw, CheckCheck, X } from "lucide-react";
import {
  loadCompanyNotifications as loadNotifications,
  companyLastSeenAt as lastSeenAt,
  markCompanyNotificationsSeen as markNotificationsSeen,
  companyUnreadCount as unreadCount,
  clearCompanyNotifications as clearNotifications,
} from "../lib/companyNotifications.js";
import { can } from "../lib/companyRoles.js";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

const initials = (name) =>
  String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

function fmtWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function Row({ item, fresh }) {
  const isFollow = item.kind === "follow";
  const Icon = isFollow ? UserPlus : Heart;
  const sub = [item.role, item.company].filter(Boolean).join(" · ");

  return (
    <li className={`flex items-start gap-3.5 px-5 py-4 ${fresh ? "bg-blue-50/40" : ""}`}>
      <span className="relative mt-0.5 shrink-0">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-500">
          {initials(item.name)}
        </span>
        <span className={`absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-white ${
          isFollow ? "bg-blue-600" : "bg-rose-500"}`}>
          <Icon size={9} strokeWidth={3} className="text-white" />
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] leading-snug text-slate-700">
          <span className="font-bold text-slate-900">{item.name}</span>
          {isFollow ? " started following you" : " liked "}
          {!isFollow && <span className="font-semibold text-slate-800">{item.subject || "a release"}</span>}
        </span>
        {sub && <span className="mt-0.5 block truncate text-[12px] text-slate-400">{sub}</span>}
      </span>

      <span className="shrink-0 text-[11.5px] text-slate-400">{fmtWhen(item.at)}</span>
      {fresh && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
    </li>
  );
}

export default function Notifications({ company, onSeen, hideHeading = false }) {
  const companyId = company?.id;
  // Clearing empties the page for the whole company (one cleared_at per
  // company, 0064), so it is owner/admin only (0090). Everyone else reads.
  const canClear = can(company?.role || "owner", "clearNotifications");
  const [items, setItems] = useState(undefined);   // undefined = loading, null = not switched on (0049)
  const [loadErr, setLoadErr] = useState(false);   // the last read failed (network, 5xx)
  const [clearErr, setClearErr] = useState("");
  const [seen, setSeen] = useState(null);
  const [freshBefore, setFreshBefore] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // `onSeen` arrives as an inline arrow from Portal, so its identity changes on
  // every parent render. Holding it in a ref keeps it OUT of load()'s deps --
  // with it in there, load() was rebuilt each render, the effect below re-ran,
  // and the re-fetch overwrote local state. That is what made "Clear all" look
  // like it did nothing: the list was cleared and immediately re-loaded.
  const onSeenRef = useRef(onSeen);
  useEffect(() => { onSeenRef.current = onSeen; });

  const load = useCallback(async () => {
    if (!companyId) return;
    const [r, at] = await Promise.all([loadNotifications(companyId), lastSeenAt(companyId)]);
    // A failed read keeps what is on screen (or shows "couldn't load"); only a
    // missing 0049 is "not switched on yet".
    if (!r.ok && !r.missing) { setLoadErr(true); setItems((prev) => (prev === undefined ? [] : prev)); return; }
    setLoadErr(false);
    const rows = r.ok ? r.rows : null;
    setItems(rows);
    setSeen(at);
    // Freeze the "new" boundary at the value from BEFORE this visit, so marking
    // as seen does not make the highlight vanish while someone is reading it.
    setFreshBefore((prev) => (prev === null ? at : prev));
    if (rows && rows.length) {
      const now = await markNotificationsSeen(companyId);
      if (now) { setSeen(now); onSeenRef.current && onSeenRef.current(); }
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => { setBusy(true); await load(); setBusy(false); };

  // Clear all EMPTIES THE PAGE. It does not delete a follow or a like -- those
  // are the investor's acts and this list is only a view of them, so 0064
  // records a cleared_at per company and the feed hides everything up to it.
  // Anything new afterwards reappears: clearing is not muting.
  //
  // Degrades honestly. Without 0064 the RPC is absent, so we fall back to
  // dismissing the unread state, which is what the button did before.
  const clearAll = async () => {
    setConfirming(false);
    setBusy(true);
    setClearErr("");
    const at = await clearNotifications(companyId);
    if (at && at.denied) {
      setClearErr("Only owners and admins can clear notifications for the company. Nothing changed.");
    } else if (at && at.failed) {
      setClearErr("Couldn't clear notifications. Nothing changed; try again.");
    } else if (at) {
      setItems([]);
      setCleared(true);
    } else {
      const now = (await markNotificationsSeen(companyId)) || new Date().toISOString();
      setSeen(now);
      setFreshBefore(now);
    }
    onSeenRef.current && onSeenRef.current();
    setBusy(false);
  };

  const newCount = useMemo(() => unreadCount(items, freshBefore), [items, freshBefore]);
  const isFresh = (it) => !freshBefore || (it.at && new Date(it.at).getTime() > new Date(freshBefore).getTime());

  const confirmDialog = confirming && canClear ? (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" onClick={() => setConfirming(false)}>
      <div onClick={(e) => e.stopPropagation()} className={`w-full max-w-[400px] bg-white p-5 ${CARD}`}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] font-extrabold tracking-tight text-slate-900">Clear all notifications?</p>
          <button onClick={() => setConfirming(false)} aria-label="Cancel"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X size={15} />
          </button>
        </div>
        {/* Says what is NOT affected, because that is the part someone pauses
            over: clearing a page that lists other people's actions sounds like
            it might undo them. */}
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
          This empties the page for your company. Follows and likes themselves are not affected &mdash;
          investors stay following you. Anything new will appear here.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setConfirming(false)}
            className="rounded-xl px-3.5 py-2 text-[13px] font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
            Cancel
          </button>
          <button onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-slate-800">
            <CheckCheck size={14} /> Clear all
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div>
      {confirmDialog}
      <div className="flex items-baseline justify-between gap-4">
        <div>
          {!hideHeading && <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Notifications</h1>}
          <p className={`${hideHeading ? "" : "mt-1 "}text-[14px] text-slate-500`}>
            {newCount > 0 ? `${newCount} new since you last looked.`
              : cleared ? "Cleared. New follows and likes will appear here."
              : "Follows and likes from investors."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Only offered when there is something to clear -- a permanently
              visible control that does nothing most of the time trains people
              to ignore it. */}
          {canClear && items && items.length > 0 && (
            <button onClick={() => setConfirming(true)} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50">
              <CheckCheck size={14} /> Clear all
            </button>
          )}
          <button onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {clearErr && <p className="mt-3 text-[12.5px] font-semibold text-rose-500" data-clear-error>{clearErr}</p>}

      {loadErr && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-3.5" data-load-error>
          <p className="text-[13px] font-semibold text-amber-800">
            {items && items.length ? "Couldn't refresh. Showing what was loaded last." : "Couldn't load notifications."}
          </p>
          <button onClick={refresh} className="shrink-0 text-[12.5px] font-bold text-amber-800 hover:underline">Retry</button>
        </div>
      )}

      {items === undefined && (
        <div className="mt-8 grid place-items-center py-16"><Loader2 size={22} className="animate-spin text-blue-500" /></div>
      )}

      {items === null && (
        <div className={`mt-6 flex items-start gap-3.5 px-5 py-5 ${CARD}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600"><AlertCircle size={19} /></span>
          <div>
            <p className="text-[14.5px] font-bold text-slate-900">Notifications aren't switched on yet</p>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-slate-500">
              Follows and likes are already being recorded. This page needs a database update before it can
              read them back. Nothing has been lost.
            </p>
          </div>
        </div>
      )}

      {Array.isArray(items) && !(loadErr && items.length === 0) && (
        items.length === 0 ? (
          <div className={`mt-6 grid place-items-center px-6 py-16 text-center ${CARD}`}>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Bell size={22} strokeWidth={2.2} /></span>
            <p className="mt-3 text-[15px] font-bold text-slate-900">Nothing yet</p>
            <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-slate-500">
              When an investor follows you or likes one of your releases, it shows up here.
            </p>
          </div>
        ) : (
          <div className={`mt-6 overflow-hidden ${CARD}`}>
            <ul className="divide-y divide-slate-50">
              {items.map((it, i) => <Row key={`${it.kind}-${it.at}-${i}`} item={it} fresh={isFresh(it)} />)}
            </ul>
          </div>
        )
      )}
    </div>
  );
}
