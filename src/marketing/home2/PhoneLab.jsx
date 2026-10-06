// PhoneLab — ISOLATED working version of the device composition (/site?phonelab=1).
// Nothing here is imported by the sales page, the Pro page or the Investor page. It renders the
// phone at exactly the production size (557 × 929) so browser screenshots are 1:1 real pixels.
import React, { useEffect, useState } from "react";
// Preview the PRODUCTION component itself, so the lab can never drift from what ships.
import { DirectedEmbed } from "../demo/DirectedEmbed.jsx";

const STATE_LABELS = [
  ["Normal profile", 0],
  ["AI Brief open", null],
  ["Project Stage open", null],
];

const REF = (() => { try { return /[?&]ref(=|&|$)/.test(window.location.search); } catch (_) { return false; } })();
// Stage height = phone height. Defaults to the 1680x1050 figure both pages produce (929).
// 781 = 1440x900, 647 = 1024x768. Larger values magnify for structural inspection.
const STAGE_H = (() => { try { const v = parseFloat(new URLSearchParams(window.location.search).get("h")); return v > 200 ? v : 929; } catch (_) { return 929; } })();

export default function PhoneLab() {
  const [n, setN] = useState(0);
  const [cur, setCur] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      try {
        const st = window.__demoState && window.__demoState();
        if (st) setCur(st.cur);
        if (window.__demoStates) setN(window.__demoStates());
      } catch (_) {}
    }, 400);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#07090c", color: "#e8edf5", fontFamily: "ui-sans-serif, -apple-system, system-ui, sans-serif" }}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", background: "rgba(7,9,12,0.92)", fontSize: 12 }}>
        <strong style={{ letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.6 }}>Phone lab</strong>
        <span style={{ opacity: 0.6 }}>state {cur}</span>
        <button onClick={() => window.__demoPrev && window.__demoPrev()} style={btn}>◀ prev</button>
        <button onClick={() => window.__demoNext && window.__demoNext()} style={btn}>next ▶</button>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <button key={i} onClick={() => window.__demoGo && window.__demoGo(i)} style={{ ...btn, background: cur === i ? "#2563EB" : "transparent" }}>{i}</button>
        ))}
      </div>
      <style>{`.mx-demo { height: 100% !important; overflow: visible !important; }`}</style>
      {/* Fixed production-size stage: 929px tall so the phone measures 557 × 929, as on the Pro page. */}
      <div style={{ paddingTop: 36 }}>
        <div style={{ position: "relative", width: Math.round(STAGE_H * 0.76), height: STAGE_H, margin: "0 auto" }}>
          {REF ? (
            // The approved reference: the ORIGINAL photo alone, same size, same position.
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "relative", height: "100%", aspectRatio: "971 / 1620", flexShrink: 0,
                backgroundImage: "url(/marketing/pro-phone-79.webp)", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }} />
            </div>
          ) : (
            <DirectedEmbed variant="full" hardware cutout />
          )}
        </div>
      </div>
      <div style={{ height: 400 }} />
    </div>
  );
}

const btn = { appearance: "none", border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#e8edf5", borderRadius: 6, padding: "3px 8px", fontSize: 12, cursor: "pointer" };
