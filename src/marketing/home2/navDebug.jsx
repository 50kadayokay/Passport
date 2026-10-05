// ─────────────────────────────────────────────────────────────────────────────
// navDebug — shared, dev-only (?navdebug=1) trackpad diagnostics for the presentation
// pages (Investor, Pricing, and anything else that pages on wheel intent).
//
// installNavProbe() attaches an INDEPENDENT capture-phase wheel listener that only
// RECORDS delivery — it never preventDefaults and never participates in navigation.
// So it answers the one question the page's own controller can't:
//
//   Case A — Chrome STOPS DELIVERING the next wheel to a stationary cursor after a
//            preventDefaulted gesture → the probe count FREEZES until the cursor moves.
//   Case B — Chrome delivers it but the controller rejects it → the probe count KEEPS
//            RISING while the page doesn't advance.
//
// NavDebugHUD renders a fixed, pointer-events:none readout (probe delivery + the
// controller's own log in window.__invLog) so it can be read WITHOUT moving the cursor.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";

export const navDebugOn = () => { try { return /[?&]navdebug/.test(window.location.search); } catch (_) { return false; } };

// Idempotent: safe to call from every presentation page.
export function installNavProbe() {
  if (typeof window === "undefined" || !navDebugOn() || window.__invProbeInstalled) return;
  window.__invProbeInstalled = true;
  window.__invLog = window.__invLog || [];
  window.__invProbeCount = 0;
  window.__invProbeLastAt = 0;
  const onWheel = (e) => {
    window.__invProbeCount = (window.__invProbeCount || 0) + 1;
    window.__invProbeLastAt = Math.round(performance.now());
    const a = window.__invLog;
    a.push({ t: Math.round(performance.now()), src: "PROBE", dy: Math.round(e.deltaY) });
    if (a.length > 800) a.shift();
  };
  // Capture phase on window — fires regardless of which controller also handles it, and
  // never calls preventDefault, so it is a pure delivery witness.
  window.addEventListener("wheel", onWheel, { passive: true, capture: true });
}

// Controller-side logger: each page's REAL wheel handler calls this at every branch so
// the HUD's CTRL(handled) count and the per-event rows (accepted/rejected + why) reflect
// what the controller actually did. Gated by ?navdebug — zero cost otherwise.
export function logNav(o) {
  if (!navDebugOn()) return;
  const a = (window.__invLog = window.__invLog || []);
  a.push({ t: Math.round(performance.now()), ...o });
  if (a.length > 800) a.shift();
  window.__invWheelCount = (window.__invWheelCount || 0) + 1;
}

export function NavDebugHUD() {
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    let raf;
    const loop = () => { tick((x) => (x + 1) % 1e9); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!navDebugOn()) return null;
  const now = performance.now();
  const probe = (typeof window !== "undefined" && window.__invProbeCount) || 0;
  const probeSince = (typeof window !== "undefined" && window.__invProbeLastAt) ? Math.round(now - window.__invProbeLastAt) : 0;
  const ctrl = (typeof window !== "undefined" && window.__invWheelCount) || 0;
  const log = ((typeof window !== "undefined" && window.__invLog) || []).slice(-9);
  return (
    <div style={{ position: "fixed", top: 8, left: 8, zIndex: 99999, pointerEvents: "none", width: 340, background: "rgba(10,27,46,0.93)", color: "#dfe7f2", font: "11px/1.5 ui-monospace,Menlo,monospace", padding: "9px 11px", borderRadius: 8, whiteSpace: "pre" }}>
      {`PROBE(delivery): ${probe}   since: ${probeSince}ms`}{"\n"}
      {`CTRL(handled):   ${ctrl}`}{"\n"}
      {`↳ probe frozen >500ms? ${probeSince > 500 ? "YES = Case A (not delivered)" : "no"}`}{"\n"}
      {"─ last events (src dy gap acted) ─\n"}
      {log.map((r) => `${(r.src || "?").padEnd(5)} dy=${r.dy} ${r.gap != null ? "gap=" + r.gap : ""} ${r.acted ? "ACT" : ""}${r.locked ? " LOCK" : ""}${r.used ? " USED" : ""} ${r.note || ""}`.trimEnd()).join("\n") || "(no wheels yet)"}
    </div>
  );
}
