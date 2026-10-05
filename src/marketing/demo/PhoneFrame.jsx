// ─────────────────────────────────────────────────────────────────────────────
// PhoneFrame — the portrait companion to TabletFrame: a premium marketing phone
// bezel running the REAL Kingsmen Pro Profile via an <iframe> of /app?c=…&embed=1.
//
// Same principle as TabletFrame and MobileAppFrame: the iframe owns a real mobile
// viewport (PHONE_W × PHONE_H) so the authentic app shell renders; the marketing
// page only SCALES it. Neutral obsidian boot cover, paint-aware, no loading copy.
// The real app is not modified; this is presentation only.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export const PHONE_W = 393;
export const PHONE_H = 852;

export default function PhoneFrame({
  slug = "kingsmen-resources",
  tab = "overview",
  bezel = 10,
  radius = 46,
  title = "MineEx Pro Profile",
  interactive = false,
  onReady,
  style,
  className = "",
}) {
  const boxRef = useRef(null);
  const iframeRef = useRef(null);
  const readyRef = useRef(false);
  const [screenW, setScreenW] = useState(0);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") { if (el) setScreenW(Math.max(0, el.clientWidth - bezel * 2)); return; }
    const ro = new ResizeObserver((es) => setScreenW(Math.max(0, es[0].contentRect.width - bezel * 2)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [bezel]);

  const markReady = useCallback(() => { if (readyRef.current) return; readyRef.current = true; setReady(true); onReady && onReady(); }, [onReady]);
  const onLoad = useCallback(() => {
    const t0 = performance.now();
    const tick = () => {
      if (readyRef.current) return;
      let ok = false;
      try { const d = iframeRef.current && iframeRef.current.contentDocument; ok = !!(d && d.readyState === "complete" && ((d.body && d.body.textContent) || "").trim().length > 20); }
      catch (_) { ok = true; }
      if (ok) requestAnimationFrame(() => setTimeout(markReady, 240));
      else if (performance.now() - t0 < 4500) setTimeout(tick, 90);
      else markReady();
    };
    tick();
  }, [markReady]);

  const scale = screenW > 0 ? screenW / PHONE_W : 0;
  const screenH = PHONE_H * scale;
  const src = `/app?c=${encodeURIComponent(slug)}&embed=1${tab ? `&tab=${encodeURIComponent(tab)}` : ""}`;

  return (
    <div ref={boxRef} className={`mx-phoneframe ${className}`}
      style={{ position: "relative", width: "100%", background: "#0a0a0c", padding: bezel, borderRadius: radius,
        boxShadow: "0 60px 120px -46px rgba(4,8,14,0.7), 0 0 0 2px rgba(255,255,255,0.06) inset", ...style }}>
      <div style={{ position: "relative", width: "100%", height: screenH || 1, borderRadius: Math.max(6, radius - bezel), overflow: "hidden", background: "#05070b", isolation: "isolate" }}>
        {scale > 0 && (
          <iframe ref={iframeRef} title={`${title} — ${slug}`} src={src} width={PHONE_W} height={PHONE_H} scrolling="no" loading="eager" onLoad={onLoad}
            style={{ border: 0, display: "block", width: PHONE_W, height: PHONE_H, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: interactive ? "auto" : "none" }} />
        )}
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none", background: "radial-gradient(130% 130% at 50% 40%, #0c1016 0%, #05070b 72%)", opacity: ready ? 0 : 1, transition: "opacity 560ms cubic-bezier(0.22,1,0.36,1)" }} />
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none", background: "linear-gradient(120deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 30%)" }} />
      </div>
    </div>
  );
}
