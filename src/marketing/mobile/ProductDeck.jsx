// ─────────────────────────────────────────────────────────────────────────────
// ProductDeck — the phone pages' product story, told by swiping.
//
// The device pins while the page scrolls past it. Each beat changes what is on the
// screen and cross-fades the copy BENEATH it; the phone itself never has text over it.
// The page remains the one scroller — this is ordinary position:sticky, not a hijacked
// gesture — so a swipe behaves exactly as a swipe should and nothing can trap it.
//
// Performance is the constraint that shaped this. One passive scroll listener, read in
// a rAF and written only when the beat index actually changes; no continuous animation
// loop, no scroll-linked transforms per frame. The whole deck mounts only when it is
// near the viewport and unmounts when it is well past, so a page holds one live product
// surface at a time. That is the rule the Conference gallery broke at 128MB.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";
import HardwarePhone from "./HardwarePhone.jsx";
import { M_GUTTER, M_LEAD, M_TRACK, M_TYPE } from "../mobile.js";

const INK = "#0a1b2e", SLATE = "#565f6e", MUTE = "#9aa1ad", COBALT = "#2563EB";

// Scroll distance per beat. Shorter than a full screen so the story moves at a
// readable pace rather than demanding a full swipe per sentence.
const BEAT_VH = 78;

export default function ProductDeck({ beats, deviceWidth = 242, label = "MineEx app" }) {
  const trackRef = useRef(null);
  const [i, setI] = useState(0);
  const [live, setLive] = useState(false);
  const iRef = useRef(0);

  // Mount/unmount with proximity — one live product surface at a time.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setLive(true); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => setLive(e.isIntersecting)), { rootMargin: "35% 0px 35% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Which beat is showing, from the track's own position. rAF-coalesced, and it only
  // touches React state when the index changes — so a scroll is not a render storm.
  useEffect(() => {
    const el = trackRef.current; if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      if (span <= 0) return;
      const p = Math.min(1, Math.max(0, -r.top / span));
      const n = Math.min(beats.length - 1, Math.floor(p * beats.length));
      if (n !== iRef.current) { iRef.current = n; setI(n); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [beats.length]);

  const b = beats[i] || beats[0];

  return (
    <section ref={trackRef} style={{ position: "relative", height: `${beats.length * BEAT_VH}svh` }}>
      <div style={{ position: "sticky", top: "var(--mx-nav-h, 54px)", height: "calc(100svh - var(--mx-nav-h, 54px))",
        display: "flex", flexDirection: "column", alignItems: "center",
        // TOP-ANCHORED, not centred. Centring made the device's position depend on the
        // height of the copy below it, so every beat change nudged the phone — small
        // shifts, but the device is the one thing that must never move.
        justifyContent: "flex-start", paddingTop: "clamp(8px,2.5vw,22px)",
        paddingLeft: M_GUTTER, paddingRight: M_GUTTER, overflow: "hidden" }}>

        {/* the wash that frames the device */}
        <span aria-hidden style={{ position: "absolute", top: "34%", left: "50%", transform: "translate(-50%,-50%)",
          width: "150%", height: "58%", borderRadius: "50%", pointerEvents: "none",
          background: "radial-gradient(closest-side, rgba(37,99,235,0.20), rgba(132,204,22,0.12) 54%, rgba(255,255,255,0) 78%)",
          filter: "blur(12px)" }} />

        {/* the device — it stays put; only what is on the screen changes */}
        <div style={{ position: "relative", flex: "0 0 auto" }}>
          {live ? (
            <HardwarePhone deviceWidth={deviceWidth} label={label}>
              {/* keyed so a beat change re-mounts the screen and plays its own entrance */}
              <div key={i} className="mx-screenin" style={{ height: "100%" }}>{b.screen}</div>
            </HardwarePhone>
          ) : (
            <div style={{ width: deviceWidth / (740 / 971), aspectRatio: "971 / 1620" }} />
          )}
        </div>

        {/* the copy, beneath the evidence — never over it */}
        {/* The copy box is a FIXED height. Beats differ in length, and letting the box
            resize moved the device and the dots on every change — 0.15 CLS. It now
            reserves the tallest beat and the text sits at the top of it. */}
        <div style={{ position: "relative", flex: "0 0 auto", marginTop: "clamp(18px,4.5vw,26px)",
          width: "100%", maxWidth: 440, minHeight: "clamp(158px, 38vw, 192px)" }}>
        <div key={`c${i}`} className="mx-copyin" style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: M_TYPE.eyebrow, fontWeight: 800, letterSpacing: M_TRACK.eyebrow, textTransform: "uppercase", color: MUTE }}>
            <span style={{ color: COBALT }}>{String(i + 1).padStart(2, "0")}</span>&nbsp;&nbsp;{b.eyebrow}
          </p>
          <h3 style={{ margin: "10px 0 0", fontSize: M_TYPE.h3, lineHeight: 1.2, letterSpacing: "-0.025em", fontWeight: 700, color: INK }}>{b.head}</h3>
          <p style={{ margin: "9px 0 0", fontSize: M_TYPE.bodySm, lineHeight: 1.5, color: SLATE }}>{b.body}</p>
        </div>
        </div>

        {/* where you are in the story */}
        <div aria-hidden style={{ position: "relative", display: "flex", gap: 6, marginTop: "clamp(16px,4vw,22px)" }}>
          {beats.map((_, k) => (
            <span key={k} style={{ width: k === i ? 18 : 6, height: 6, borderRadius: 99,
              background: k === i ? COBALT : "rgba(37,99,235,0.22)",
              transition: "width 320ms cubic-bezier(0.22,1,0.36,1), background 320ms ease" }} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes mxScreenIn { from { opacity: 0; transform: translateY(8px) scale(0.995) } to { opacity: 1; transform: none } }
        @keyframes mxCopyIn   { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        .mx-screenin { animation: mxScreenIn 420ms cubic-bezier(0.22,1,0.36,1) both; }
        .mx-copyin   { animation: mxCopyIn 380ms cubic-bezier(0.22,1,0.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .mx-screenin, .mx-copyin { animation: none } }
      `}</style>
    </section>
  );
}
