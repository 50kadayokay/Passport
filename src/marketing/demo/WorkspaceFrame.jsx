// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceFrame — the desktop analog to TabletFrame/PhoneFrame for the Company
// Portal chapter. A restrained browser-chrome window (not a decorative laptop) that
// iframes the REAL portal ProfileEditor via the production-safe /site?portaldemo=1
// route. The chrome is minimal so the Portal itself dominates and stays readable.
//
// Same isolation principle as the other device frames: the iframe owns its own
// desktop viewport (DESKTOP_W × DESKTOP_H) so the real 3-column editor lays out
// correctly; the marketing page only scales it. Neutral light boot cover (the Portal
// is a light UI). Nothing here fetches Supabase, authenticates, or writes — the
// injected-profile route it loads is inert (see MarketingSite ?portaldemo).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export const DESKTOP_W = 1440;
export const DESKTOP_H = 900;

export default function WorkspaceFrame({
  src = "/site?portaldemo=1",
  url = "app.mineex.ca/portal",
  title = "MineEx Company Portal",
  radius = 16,
  interactive = false,
  onReady,
  // Marketing-layer emphasis only (Beat 2). Each: { key, x, y, w, h, on } in iframe-CONTENT
  // pixels; drawn as a scaled ring OVER the frame. The real Portal DOM is never touched.
  overlays = [],
  emphasis = 1,   // subtle framing shift: preview gains a touch of prominence after an edit
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
    if (!el || typeof ResizeObserver === "undefined") { if (el) setScreenW(el.clientWidth); return; }
    const ro = new ResizeObserver((es) => setScreenW(es[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const markReady = () => { if (readyRef.current) return; readyRef.current = true; setReady(true); onReady && onReady(iframeRef.current); };
  const onLoad = () => {
    const t0 = performance.now();
    const tick = () => {
      if (readyRef.current) return;
      let ok = false;
      try { const d = iframeRef.current && iframeRef.current.contentDocument; ok = !!(d && d.readyState === "complete" && /COMPANY PROFILE|Kingsmen|Company details/.test((d.body && d.body.innerText) || "")); }
      catch (_) { ok = true; }
      if (ok) requestAnimationFrame(() => setTimeout(markReady, 260));
      else if (performance.now() - t0 < 6000) setTimeout(tick, 120);
      else markReady();
    };
    tick();
  };

  const scale = screenW > 0 ? screenW / DESKTOP_W : 0;
  const screenH = DESKTOP_H * scale;

  return (
    <div
      ref={boxRef}
      className={`mx-workspaceframe ${className}`}
      style={{ position: "relative", width: "100%", borderRadius: radius, overflow: "hidden", background: "#ffffff",
        boxShadow: emphasis > 1 ? "0 74px 160px -44px rgba(15,23,42,0.55), 0 0 0 1px rgba(15,23,42,0.08)" : "0 60px 140px -44px rgba(15,23,42,0.5), 0 0 0 1px rgba(15,23,42,0.08)",
        transform: `scale(${emphasis})`, transformOrigin: "center top", transition: "transform 640ms cubic-bezier(0.22,1,0.36,1), box-shadow 640ms cubic-bezier(0.22,1,0.36,1)", ...style }}
    >
      {/* browser chrome — restrained: window dots + a single URL chip */}
      <div style={{ height: 42, background: "#eef1f5", borderBottom: "1px solid rgba(15,23,42,0.07)", display: "flex", alignItems: "center", gap: 10, padding: "0 16px", position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", gap: 7 }}>{["#f87171", "#fbbf24", "#34d399"].map((c) => <span key={c} style={{ width: 11, height: 11, borderRadius: 99, background: c }} />)}</div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 24, padding: "0 14px", borderRadius: 999, background: "#fff", border: "1px solid rgba(15,23,42,0.08)", fontSize: 12, fontWeight: 600, color: "#64748b", maxWidth: 380, overflow: "hidden" }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: "#94a3b8", flex: "0 0 auto" }} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{url}</span>
          </div>
        </div>
        <div aria-hidden style={{ width: 40 }} />
      </div>

      {/* the real Portal, scaled */}
      <div style={{ position: "relative", width: "100%", height: screenH || 1, overflow: "hidden", background: "#f8fafc", isolation: "isolate" }}>
        {scale > 0 && (
          <iframe ref={iframeRef} title={title} src={src} width={DESKTOP_W} height={DESKTOP_H} scrolling="no" loading="eager" onLoad={onLoad}
            style={{ border: 0, display: "block", width: DESKTOP_W, height: DESKTOP_H, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: interactive ? "auto" : "none" }} />
        )}

        {/* marketing-layer emphasis: a restrained ring over the field / preview region being
            demonstrated. Positioned in scaled content coordinates; never inside the Portal DOM. */}
        {scale > 0 && overlays.map((o) => (
          <div key={o.key} aria-hidden style={{
            position: "absolute", left: o.x * scale, top: o.y * scale, width: o.w * scale, height: o.h * scale,
            borderRadius: 10, border: "2px solid #2563eb",
            boxShadow: "0 0 0 5px rgba(37,99,235,0.12), 0 14px 40px -10px rgba(37,99,235,0.35)",
            background: "rgba(37,99,235,0.04)", pointerEvents: "none", zIndex: 5,
            opacity: o.on ? 1 : 0, transform: o.on ? "scale(1)" : "scale(1.03)",
            transition: "opacity 420ms cubic-bezier(0.22,1,0.36,1), transform 420ms cubic-bezier(0.22,1,0.36,1)",
          }} />
        ))}

        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none", background: "#f8fafc", opacity: ready ? 0 : 1, transition: "opacity 560ms cubic-bezier(0.22,1,0.36,1)" }} />
      </div>
    </div>
  );
}
