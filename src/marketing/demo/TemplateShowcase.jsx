// ─────────────────────────────────────────────────────────────────────────────
// TemplateShowcase — "15 designs. Built to feel like yours." Three RADICALLY
// different real Conference Mode templates, each with a different company, in one
// dominant landscape tablet — proving MineEx doesn't make every company look alike.
//
//   01 Monolith · Kingsmen Resources   → /conference?c=kingsmen-resources (real company)
//   02 Atlas    · Cordillera Gold Corp. → /site?conffixture=B&t=atlas    (demo fixture)
//   03 Terrain  · Aurora Ridge Metals   → /site?conffixture=A&t=terrain   (demo fixture)
//
// All three are the SAME real ConferenceV3 renderer (fixtures B/A are rendered through
// the production-safe marketing /site?conffixture route — never the DEV /confv3demo).
// No visible reload: all three are mounted at once as separate TabletFrame iframes
// stacked in one frame; each paints behind its own boot cover, and switching is a pure
// opacity CROSS-FADE between already-painted real experiences. ConferenceV3, the
// fixtures, and the product routes are untouched.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { MX, EASE, useViewport } from "../system.jsx";
import TabletFrame from "./TabletFrame.jsx";

export const SHOWCASE = [
  { key: "monolith", n: "Monolith", company: "Kingsmen Resources", d: "Cinematic · Photographic · Monumental", src: "/conference?c=kingsmen-resources&t=monolith&qr=0" },
  { key: "atlas", n: "Atlas", company: "Cordillera Gold Corp.", d: "Cartographic · Editorial · Field-atlas", src: "/site?conffixture=B&t=atlas" },
  { key: "terrain", n: "Terrain", company: "Aurora Ridge Metals", d: "Topographic · Spatial · Contour-driven", src: "/site?conffixture=A&t=terrain" },
];

export default function TemplateShowcase({ active = 0, shown = false }) {
  const { mobile } = useViewport();
  const cur = SHOWCASE[active] || SHOWCASE[0];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, pointerEvents: "none" }}>
      {/* Top narrative band */}
      <div style={{ position: "absolute", left: 0, right: 0, top: mobile ? "clamp(40px,6vh,70px)" : "clamp(34px,5vh,64px)", display: "flex", justifyContent: "center", padding: "0 24px", opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(-14px)", transition: `opacity 720ms ${EASE}, transform 720ms ${EASE}` }}>
        <div style={{ textAlign: "center", maxWidth: 720 }}>
          <span className="mx-label" style={{ color: MX.onDarkDim, display: "inline-flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
            <span style={{ width: 22, height: 2, borderRadius: 2, background: "var(--mx-accent)" }} />Conference Mode · Templates
          </span>
          <h2 className="mx-h2" style={{ color: MX.onDark, marginTop: 10 }}>Make it unmistakably yours.</h2>
          {!mobile && <p style={{ color: MX.onDarkDim, fontSize: "clamp(14px,1.15vw,16.5px)", lineHeight: 1.5, fontWeight: 400, marginTop: 10, marginLeft: "auto", marginRight: "auto", maxWidth: 560 }}>Choose from a collection of premium Conference Mode templates and customize them to your brand — or work with us on a completely bespoke experience.</p>}
        </div>
      </div>

      {/* The dominant tablet — three real templates (three companies) stacked, cross-faded */}
      <div style={{ position: "absolute", left: "50%", top: mobile ? "56%" : "60%", transform: "translate(-50%,-50%)", width: mobile ? "92vw" : "min(884px, 63vw)" }}>
        <div style={{ position: "relative", width: "100%", opacity: shown ? 1 : 0, transition: `opacity 700ms ${EASE}` }}>
          {SHOWCASE.map((t, i) => (
            <div
              key={t.key}
              style={{
                position: i === 0 ? "relative" : "absolute",
                top: 0, left: 0, right: 0,
                opacity: i === active ? 1 : 0,
                transition: `opacity 850ms ${EASE}`,
                zIndex: i === active ? 2 : 1,
                pointerEvents: "none",
              }}
            >
              <TabletFrame src={t.src} title={`MineEx Conference Mode — ${t.company}`} interactive={false} />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom: which design, which company, its character, and the quiet 15-available indicator */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: mobile ? "clamp(16px,3vh,28px)" : "clamp(22px,4.5vh,46px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "0 24px", opacity: shown ? 1 : 0, transition: `opacity 720ms ${EASE}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.16em", color: MX.onDark, fontVariantNumeric: "tabular-nums" }}>{String(active + 1).padStart(2, "0")}<span style={{ color: MX.onDarkMute }}> / 15</span></span>
          <span aria-hidden style={{ width: 4, height: 4, borderRadius: 99, background: MX.onDarkMute }} />
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.02em", color: MX.onDark }}>{cur.n}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: MX.onDarkDim }}>{cur.company}</span>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: MX.onDarkMute }}>{cur.d}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 7 }}>
            {SHOWCASE.map((s, i) => (<span key={i} style={{ width: i === active ? 22 : 7, height: 3, borderRadius: 3, background: i <= active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.22)", transition: `width 420ms ${EASE}, background 420ms ${EASE}` }} />))}
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: MX.onDarkMute }}>3 shown · 15 available</span>
        </div>
      </div>
    </div>
  );
}
