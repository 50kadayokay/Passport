// ─────────────────────────────────────────────────────────────────────────────
// EcoStoryRoute — a REVIEW harness for the ecosystem finale's static compositions.
// /site?ecostory=1&state=<0..5> renders one resting state full-viewport in the
// approved light atmosphere + nav, so the six compositions can be signed off before
// any motion is built. This is a scaffold for approval, not the shipped chapter.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { MarketingStyles, useViewport, useReduce } from "../system.jsx";
import Nav from "./Nav.jsx";
import EcosystemScene from "./EcosystemScene.jsx";

// Static version of the sales-page atmosphere (near-white canvas, restrained blue/lime,
// weighted right and kept out of the nav band) — matches ChapterBg without the animation.
function EcoBg() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: "#fbfcfe" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "64%", overflow: "hidden",
        WebkitMaskImage: "linear-gradient(to right, transparent, #000 40%), linear-gradient(to bottom, transparent 0%, transparent 8%, #000 28%)",
        WebkitMaskComposite: "source-in",
        maskImage: "linear-gradient(to right, transparent, #000 40%), linear-gradient(to bottom, transparent 0%, transparent 8%, #000 28%)",
        maskComposite: "intersect" }}>
        <span style={{ position: "absolute", left: "60%", top: "46%", width: "74%", height: "74%", transform: "translate(-50%,-50%)", background: "radial-gradient(closest-side, rgba(37,99,235,.42), transparent 70%)", filter: "blur(30px)", borderRadius: "50%" }} />
        <span style={{ position: "absolute", left: "74%", top: "72%", width: "74%", height: "74%", transform: "translate(-50%,-50%)", background: "radial-gradient(closest-side, rgba(198,240,74,.40), transparent 70%)", filter: "blur(30px)", borderRadius: "50%" }} />
        <span style={{ position: "absolute", left: "58%", top: "32%", width: "74%", height: "74%", transform: "translate(-50%,-50%)", background: "radial-gradient(closest-side, rgba(147,197,253,.44), transparent 70%)", filter: "blur(30px)", borderRadius: "50%" }} />
      </div>
    </div>
  );
}

export default function EcoStoryRoute() {
  const { mobile } = useViewport();
  const reduce = useReduce();
  const state = (() => { try { return Math.max(0, Math.min(5, parseInt(new URLSearchParams(window.location.search).get("state") || "0", 10))); } catch (_) { return 0; } })();

  return (
    <div className="mx-root" id="top">
      <MarketingStyles />
      <Nav />
      <main>
        <section style={{ position: "relative", height: "100svh", overflow: "hidden", background: "#fbfcfe" }}>
          <EcoBg />
          <div style={{ position: "relative", zIndex: 2, height: "100%" }}>
            <EcosystemScene state={state} mobile={mobile} reduce={reduce} />
          </div>
          {/* state chips — review-only, quick jump between the six compositions */}
          <div style={{ position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", zIndex: 60, display: "flex", gap: 8, background: "rgba(255,255,255,0.8)", backdropFilter: "blur(10px)", padding: "8px 10px", borderRadius: 999, border: "1px solid rgba(10,12,15,0.1)" }}>
            {["Meet", "Follow", "Audience", "Publish", "Notify", "Final"].map((t, i) => (
              <a key={t} href={`/site?ecostory=1&state=${i}`} style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.02em", textDecoration: "none", color: i === state ? "#fff" : "#545b66", background: i === state ? "#0a0c0f" : "transparent", borderRadius: 999, padding: "6px 12px" }}>{i + 1} {t}</a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
