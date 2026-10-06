// ─────────────────────────────────────────────────────────────────────────────
// Hero — redesigned composition (2026-09-24). Left-aligned editorial type with an
// animated gradient "mining." wordmark, paired with an expressive, living MineEx
// colour field bleeding in from the right (cobalt · blue · lime), feathered into the
// light page. Light-first, premium, dynamic — no product, no cards, no clichés.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { EASE, useReduce } from "../system.jsx";

const NAVY = "#0a1b2e", SLATE = "#54617a";
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")";

export default function Hero() {
  const reduce = useReduce();
  const [on, setOn] = useState(false);
  useEffect(() => { if (reduce) { setOn(true); return; } const r = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(r); }, [reduce]);
  const rise = (d) => ({ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(16px)", transition: reduce ? "none" : `opacity 760ms ${EASE} ${d}ms, transform 760ms ${EASE} ${d}ms` });

  return (
    <section id="hero" style={{ position: "relative", overflow: "hidden", minHeight: "min(92svh, 880px)", background: "#fbfcfe", display: "flex", alignItems: "center" }}>
      {/* expressive living colour field, bleeding from the right and feathered into the light */}
      <div aria-hidden style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "62%", overflow: "hidden",
        WebkitMaskImage: "linear-gradient(to right, transparent, #000 34%)", maskImage: "linear-gradient(to right, transparent, #000 34%)" }}>
        <span className={reduce ? "" : "mx-fa"} style={fblob("62% 32%", "rgba(37,99,235,.52)")} />
        <span className={reduce ? "" : "mx-fb"} style={fblob("30% 64%", "rgba(59,130,246,.42)")} />
        <span className={reduce ? "" : "mx-fc"} style={fblob("80% 76%", "rgba(198,240,74,.50)")} />
        <span className={reduce ? "" : "mx-fd"} style={fblob("48% 10%", "rgba(147,197,253,.55)")} />
        <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,0) 40%)" }} />
      </div>
      <div aria-hidden style={{ position: "absolute", inset: 0, opacity: .55, mixBlendMode: "multiply", pointerEvents: "none", backgroundImage: GRAIN }} />

      {/* left editorial */}
      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 1240, margin: "0 auto", padding: "0 clamp(24px,5vw,64px)" }}>
        <div style={{ maxWidth: 640 }}>
          <h1 style={{ ...rise(0), color: NAVY, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.0, fontSize: "clamp(46px, 6.6vw, 84px)", margin: 0 }}>
            The investor platform built for <span className={reduce ? "hl-static" : "hl-grad"}>mining.</span>
          </h1>
          <p style={{ ...rise(120), color: SLATE, fontWeight: 400, fontSize: "clamp(18px,1.7vw,22px)", lineHeight: 1.45, margin: "26px 0 0", maxWidth: "32ch" }}>
            Present your story. Engage investors. Build lasting connections.
          </p>
          <div style={{ ...rise(220), marginTop: 40, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <a href="/contact?plan=general" className="mx-cta" style={cta(NAVY, "#fff", NAVY)}>Book a Demo</a>
            <a href="#app" className="mx-cta" style={cta("rgba(255,255,255,.62)", NAVY, "rgba(10,27,46,.18)")}>Explore MineEx</a>
          </div>
        </div>
      </div>

      <style>{`
        .hl-grad{background:linear-gradient(90deg,#2563eb,#4f9cf9,#c6f04a,#2563eb);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:hlShift 9s ease-in-out infinite}
        .hl-static{background:linear-gradient(90deg,#2563eb,#7bb0f7);-webkit-background-clip:text;background-clip:text;color:transparent}
        @keyframes hlShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        .mx-fa,.mx-fb,.mx-fc,.mx-fd{will-change:transform}
        @keyframes fA{0%{transform:translate(-50%,-50%) translate(-4%,-3%) scale(1)}50%{transform:translate(-50%,-50%) translate(9%,7%) scale(1.2)}100%{transform:translate(-50%,-50%) translate(-4%,-3%) scale(1)}}
        @keyframes fB{0%{transform:translate(-50%,-50%) translate(6%,3%) scale(1.1)}50%{transform:translate(-50%,-50%) translate(-8%,-6%) scale(1)}100%{transform:translate(-50%,-50%) translate(6%,3%) scale(1.1)}}
        @keyframes fC{0%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) translate(-9%,8%) scale(1.16)}100%{transform:translate(-50%,-50%) scale(1)}}
        @keyframes fD{0%{transform:translate(-50%,-50%) translate(3%,-2%) scale(1.06)}50%{transform:translate(-50%,-50%) translate(-6%,6%) scale(.92)}100%{transform:translate(-50%,-50%) translate(3%,-2%) scale(1.06)}}
        .mx-fa{animation:fA 24s ease-in-out infinite}.mx-fb{animation:fB 30s ease-in-out infinite}.mx-fc{animation:fC 27s ease-in-out infinite}.mx-fd{animation:fD 33s ease-in-out infinite}
      `}</style>
    </section>
  );
}

const fblob = (pos, color) => { const [x, y] = pos.split(" "); return { position: "absolute", left: x, top: y, width: "72%", height: "72%", transform: "translate(-50%,-50%)", background: `radial-gradient(closest-side, ${color}, transparent 70%)`, filter: "blur(22px)", borderRadius: "50%" }; };
const cta = (bg, fg, border) => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 52, padding: "0 26px", borderRadius: 999, background: bg, color: fg, border: `1px solid ${border}`, backdropFilter: bg.startsWith("rgba(255") ? "blur(8px)" : undefined, fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", textDecoration: "none" });
