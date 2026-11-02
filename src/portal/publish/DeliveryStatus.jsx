// Delivery status for one published release (D22 Phase 4).
//
// Kept visibly apart from "Published": the release record is live the moment
// the publish commits; delivery to each destination happens afterwards and can
// be pending, retrying or failed. See src/lib/deliveryStatus.js. A company
// never sees why a destination failed -- only that it did, and that the MineEx
// team can see it too.
import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, RefreshCw, AlertTriangle, Loader2, MinusCircle } from "lucide-react";
import { fetchDeliveryStatus, settled, EVENT_LABEL } from "../../lib/deliveryStatus.js";

export const STATE_UI = {
  delivered: { label: "Delivered", Icon: CheckCircle2, tone: "text-emerald-600", chip: "bg-emerald-50 text-emerald-700" },
  pending: { label: "Pending", Icon: Clock, tone: "text-slate-400", chip: "bg-slate-100 text-slate-600" },
  retrying: { label: "Retrying", Icon: RefreshCw, tone: "text-amber-600", chip: "bg-amber-50 text-amber-700" },
  failed: { label: "Failed", Icon: AlertTriangle, tone: "text-rose-600", chip: "bg-rose-50 text-rose-700" },
  untracked: { label: "No delivery record", Icon: MinusCircle, tone: "text-slate-400", chip: "bg-slate-100 text-slate-500" },
};

const OVERALL = {
  delivered: "Delivered to every destination.",
  pending: "Queued for delivery.",
  retrying: "A destination did not accept it first time. It is being retried automatically.",
  failed: "Delivery to a destination failed after several attempts. The MineEx team can see this failure and can retry it.",
  untracked: "There is no delivery record for this release. It was probably published before delivery tracking began.",
};

const POLL_MS = 5000, POLL_FOR_MS = 3 * 60e3;

/** A compact chip for cards and lists. */
export function DeliveryChip({ state, className = "" }) {
  const ui = STATE_UI[state];
  if (!ui) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold shadow-sm ${ui.chip} ${className}`} title={`Delivery: ${ui.label}`}>
      <ui.Icon size={11} strokeWidth={2.4} /> {ui.label}
    </span>
  );
}

/**
 * The panel. `poll` keeps checking (every 5 s, up to 3 min) until nothing is
 * left to wait for -- for the screen shown straight after publishing.
 */
export default function DeliveryStatus({ publicationId, createdAt = null, poll = false }) {
  const [s, setS] = useState(null);           // null = loading
  const [checking, setChecking] = useState(false);
  const started = useRef(Date.now());

  const load = async () => {
    setChecking(true);
    const r = await fetchDeliveryStatus(publicationId, { createdAt });
    setS(r); setChecking(false);
    return r;
  };

  useEffect(() => {
    if (!publicationId) return undefined;
    let alive = true, timer = null;
    started.current = Date.now();
    const tick = async () => {
      const r = await fetchDeliveryStatus(publicationId, { createdAt });
      if (!alive) return;
      setS(r);
      const more = poll && r.ok && !settled(r) && Date.now() - started.current < POLL_FOR_MS;
      if (more) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [publicationId, createdAt, poll]);

  if (!publicationId) return null;

  return (
    <section aria-label="Delivery status" data-testid="delivery-status" className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-400">Delivery</h2>
        {s && (
          <button onClick={load} disabled={checking} className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50">
            <RefreshCw size={12} className={checking ? "animate-spin" : ""} /> Check again
          </button>
        )}
      </div>

      {!s && (
        <p className="mt-3 flex items-center gap-2 text-[13.5px] text-slate-500"><Loader2 size={15} className="animate-spin" /> Checking delivery…</p>
      )}

      {s && !s.ok && (
        <p className="mt-3 text-[13.5px] leading-relaxed text-slate-500" data-state={s.reason}>
          {s.reason === "unavailable"
            ? "Delivery status is not available yet. Your release is still published."
            : "Delivery status could not be loaded just now. Your release is still published. Try again in a moment."}
        </p>
      )}

      {s && s.ok && (
        <>
          <div className="mt-3 flex items-start gap-2.5" data-state={s.state}>
            <DeliveryChip state={s.state} />
            <p className="text-[13.5px] leading-snug text-slate-600">
              {s.event && s.event !== "PUBLICATION_PUBLISHED" && <span className="font-semibold text-slate-700">{EVENT_LABEL[s.event] || s.event}: </span>}
              {OVERALL[s.state]}
            </p>
          </div>
          {s.destinations.length > 0 && (
            <ul className="mt-3 space-y-2">
              {s.destinations.map((d) => {
                const ui = STATE_UI[d.state];
                return (
                  <li key={d.listener} className="flex items-center gap-2.5 text-[13.5px]" data-listener={d.listener} data-state={d.state}>
                    <ui.Icon size={15} className={`shrink-0 ${ui.tone}`} />
                    <span className="flex-1 text-slate-700">{d.label}</span>
                    <span className={`text-[12px] font-semibold ${ui.tone}`}>{ui.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
