// Notifications — who followed the company, who liked a release.
//
// A feed, not an inbox: nothing here needs replying to, so there is no action on
// a row. It answers one question ("what happened while I was away?") and gets
// out of the way.
//
// Only deliberate acts appear. A follow and a like are things an investor chose
// to do and expects to be seen; views and reads are passive and stay aggregate
// on Analytics. That line is set in migration 0049, which explains itself.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Bell, UserPlus, Heart, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import {
  listCompanyNotifications as listNotifications,
  companyLastSeenAt as lastSeenAt,
  markCompanyNotificationsSeen as markNotificationsSeen,
  companyUnreadCount as unreadCount,
} from "../lib/companyNotifications.js";

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

export default function Notifications({ company, onSeen }) {
  const companyId = company?.id;
  const [items, setItems] = useState(undefined);   // undefined = loading, null = unavailable
  const [seen, setSeen] = useState(null);
  const [freshBefore, setFreshBefore] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    const [rows, at] = await Promise.all([listNotifications(companyId), lastSeenAt(companyId)]);
    setItems(rows);
    setSeen(at);
    // Freeze the "new" boundary at the value from BEFORE this visit, so marking
    // as seen does not make the highlight vanish while someone is reading it.
    setFreshBefore((prev) => (prev === null ? at : prev));
    if (rows && rows.length) {
      const now = await markNotificationsSeen(companyId);
      if (now) { setSeen(now); onSeen && onSeen(); }
    }
  }, [companyId, onSeen]);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => { setBusy(true); await load(); setBusy(false); };

  const newCount = useMemo(() => unreadCount(items, freshBefore), [items, freshBefore]);
  const isFresh = (it) => !freshBefore || (it.at && new Date(it.at).getTime() > new Date(freshBefore).getTime());

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Notifications</h1>
          <p className="mt-1 text-[14px] text-slate-500">
            {newCount > 0 ? `${newCount} new since you last looked.` : "Follows and likes from investors."}
          </p>
        </div>
        <button onClick={refresh}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
          <RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

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

      {Array.isArray(items) && (
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
