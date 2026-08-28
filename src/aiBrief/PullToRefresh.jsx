import React, { useRef, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";

/* ---------------------------------------------------------------------------
   PullToRefresh — a scroll container that runs onRefresh when the user pulls
   down from the top. Pure touch (works in the iOS Capacitor webview + mobile
   web); no plugin. Renders exactly where the old scroll <div> was, so it keeps
   the feed's className/style/padding. overscroll-behavior:contain tames the
   native bounce so our own pull animation reads cleanly. Mouse/desktop are
   unaffected (no touch events) — the twice-hourly cron + tab reload still
   refresh there.
--------------------------------------------------------------------------- */
const THRESHOLD = 64;   // px pulled before a release triggers refresh
const MAX = 96;         // px cap on the rubber-band

export default function PullToRefresh({ onRefresh, className = "", style = {}, children }) {
  const scrollRef = useRef(null);
  const startY = useRef(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const settling = startY.current == null; // animate back when the finger is up

  const onTouchStart = useCallback((e) => {
    const el = scrollRef.current;
    startY.current = (el && el.scrollTop <= 0 && !refreshing) ? e.touches[0].clientY : null;
  }, [refreshing]);

  const onTouchMove = useCallback((e) => {
    if (startY.current == null) return;
    const el = scrollRef.current;
    const dy = e.touches[0].clientY - startY.current;
    // Only pull while still at the very top and moving down; otherwise it's a normal scroll.
    if (dy > 0 && el && el.scrollTop <= 0) setPull(Math.min(MAX, dy * 0.5));
    else { startY.current = dy > 0 ? startY.current : null; setPull(0); }
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (startY.current == null) { setPull(0); return; }
    const reached = pull >= THRESHOLD;
    startY.current = null;
    if (reached && !refreshing) {
      setRefreshing(true);
      setPull(THRESHOLD);
      try { await onRefresh?.(); } catch { /* ignore */ }
      setRefreshing(false);
    }
    setPull(0);
  }, [pull, refreshing, onRefresh]);

  const offset = refreshing ? THRESHOLD : pull;
  const showSpinner = refreshing || pull > 4;
  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div
      ref={scrollRef}
      className={className}
      style={{ ...style, position: "relative", overscrollBehaviorY: "contain", WebkitOverflowScrolling: "touch" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 5, transform: `translateY(${offset - 36}px)`, transition: settling ? "transform .25s ease" : "none" }}>
        <span style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 9999, background: "#fff", boxShadow: "0 2px 8px rgba(15,23,42,0.14)", opacity: showSpinner ? 1 : 0, transition: "opacity .2s ease" }}>
          <Loader2 size={17} strokeWidth={2.5} className={refreshing ? "pp-spin" : ""} style={{ color: "#059669", transform: refreshing ? "none" : `rotate(${progress * 270}deg)` }} />
        </span>
      </div>
      <div style={{ transform: `translateY(${offset}px)`, transition: settling ? "transform .25s ease" : "none" }}>
        {children}
      </div>
    </div>
  );
}
