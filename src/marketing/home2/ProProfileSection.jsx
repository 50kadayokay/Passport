// ─────────────────────────────────────────────────────────────────────────────
// ProProfileSection — homepage section 02, "The core product". A product-first,
// editorial split-screen: the REAL MineEx Pro Profile (Kingsmen Resources) shown
// large on the right; a simple editorial index on the left. As the visitor scrolls
// the section (native scroll, NO wheel hijack, NO snapping), the real product screen
// and its one-line caption change between areas. This slice ships OVERVIEW → PROJECTS
// only.
//
// REAL PRODUCT ONLY: the screens are the real captured Pro Profile UI
// (/marketing/appshots/*.webp, 585×1255) — no CSS reconstruction, no fake data. The
// device is a very restrained frame; the SCREEN is the star. Mining identity comes
// entirely from the real content inside the product (Kingsmen · Las Coloradas ·
// Silver/Gold · Chihuahua · real project photography).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useRef } from "react";
import { MX, EASE, useViewport, useReduce, useTrack, step } from "../system.jsx";

// Areas that are LIVE in this slice (real product screens):
const STATES = [
  { n: "01", label: "Overview", img: "/marketing/appshots/overview.webp", caption: "The company at a glance." },
  { n: "02", label: "Projects", img: "/marketing/appshots/projects.webp", caption: "Every project and asset, in one place." },
];
// Areas coming in the next pass (shown dim in the index for scope, not yet reachable):
const FUTURE = [
  { n: "03", label: "Progress" },
  { n: "04", label: "Capital" },
  { n: "05", label: "Leadership" },
  { n: "06", label: "Media" },
];

const PER = 42; // svh of scroll per state — kept short so moving through areas feels fast

export default function ProProfileSection() {
  const { mobile } = useViewport();
  return mobile ? <Mobile /> : <Desktop />;
}

/* ═══ DESKTOP — light sticky product stage, scroll-driven state ══════════════ */

function Desktop() {
  const reduce = useReduce();
  const trackRef = useRef(null);
  const p = useTrack(trackRef, { steps: 240 });
  const active = step(p, STATES.length);        // 0 = Overview, 1 = Projects

  return (
    <section id="pro-profile" aria-label="MineEx Pro Profile" style={{ background: "#fbfbfc", borderTop: `1px solid ${MX.hair}` }}>
      <div ref={trackRef} style={{ position: "relative", height: `${100 + STATES.length * PER}svh` }}>
        <div style={{ position: "sticky", top: 0, height: "100svh", overflow: "hidden", display: "flex", alignItems: "stretch" }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 1360, margin: "0 auto", padding: "0 clamp(24px,4vw,56px)", display: "grid", gridTemplateColumns: "minmax(280px, 30%) 1fr", alignItems: "center", gap: "clamp(16px,2vw,36px)" }}>
            <Editorial active={active} reduce={reduce} />
            <ProductStage active={active} reduce={reduce} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Editorial({ active, reduce }) {
  return (
    <div style={{ paddingTop: 64, maxWidth: 460 }}>
      <div className="mx-label" style={{ color: MX.emText, display: "inline-flex", alignItems: "center", gap: 11 }}>
        <span aria-hidden style={{ width: 22, height: 2, borderRadius: 2, background: "var(--mx-accent)" }} />MineEx Pro Profile
      </div>
      <h2 className="mx-h2" style={{ marginTop: 16, color: MX.text, maxWidth: "14ch" }}>Your company. Built for investors.</h2>
      <p className="mx-body" style={{ marginTop: 16, color: MX.dim, maxWidth: "40ch" }}>
        Give investors one place to understand your company, explore your projects and follow your progress.
      </p>

      <ul style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 2 }}>
        {STATES.map((s, i) => {
          const on = i === active;
          return (
            <li key={s.n} style={{ padding: "10px 0", borderTop: `1px solid ${MX.hair}` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <span className="mx-num" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: on ? "var(--mx-accent-ink)" : MX.mute, transition: reduce ? "none" : `color 300ms ${EASE}`, width: 20 }}>{s.n}</span>
                <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: on ? MX.text : MX.mute, transition: reduce ? "none" : `color 300ms ${EASE}` }}>{s.label}</span>
              </div>
              {/* the active area's concise explanatory line */}
              <div style={{ maxHeight: on ? 40 : 0, opacity: on ? 1 : 0, overflow: "hidden", transition: reduce ? "none" : `max-height 340ms ${EASE}, opacity 340ms ${EASE}` }}>
                <p style={{ margin: "6px 0 2px 34px", fontSize: 14.5, lineHeight: 1.45, color: MX.dim }}>{s.caption}</p>
              </div>
            </li>
          );
        })}
        {FUTURE.map((s) => (
          <li key={s.n} style={{ padding: "10px 0", borderTop: `1px solid ${MX.hair}` }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, opacity: 0.4 }}>
              <span className="mx-num" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: MX.mute, width: 20 }}>{s.n}</span>
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: MX.mute }}>{s.label}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The real product, large — width-driven so it fills the product side, with the
// bottom cropped past the viewport edge so it reads as an enormous product.
function ProductStage({ active, reduce }) {
  return (
    <div style={{ position: "relative", height: "100svh", display: "flex", justifyContent: "flex-end", alignItems: "flex-start", overflow: "hidden" }}>
      {/* subtle product-stage lift (not a glow, not a giant shadow) */}
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(72% 60% at 55% 34%, rgba(20,24,30,0.05), rgba(20,24,30,0) 72%)", pointerEvents: "none" }} />
      <Phone active={active} reduce={reduce} />
    </div>
  );
}

function Phone({ active, reduce, mobile }) {
  const width = mobile ? "min(72vw, 340px)" : "min(60vw, 800px)";
  const bezel = mobile ? 8 : 13;
  return (
    <div
      style={{
        position: "relative", marginTop: mobile ? 0 : 34, marginRight: mobile ? 0 : "-2%",
        width, aspectRatio: "585 / 1255", flex: "0 0 auto",
        background: "#0b0b0d", padding: bezel, borderRadius: mobile ? 40 : 60,
        boxShadow: "0 30px 60px -44px rgba(10,12,15,0.5)",   // restrained, almost photographic
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: mobile ? 32 : 42, overflow: "hidden", background: "#fff" }}>
        {STATES.map((s, i) => (
          <img
            key={s.n}
            src={s.img}
            alt={`MineEx Pro Profile — ${s.label} (Kingsmen Resources)`}
            width={585} height={1255}
            loading="eager" decoding="async"
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top",
              opacity: i === active ? 1 : 0,
              transition: reduce ? "none" : `opacity 440ms ${EASE}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ═══ MOBILE — product dominates; compact tap nav (no sticky, no 6 copies) ═══ */

function Mobile() {
  const reduce = useReduce();
  const [active, setActive] = React.useState(0);
  const s = STATES[active];
  return (
    <section id="pro-profile" aria-label="MineEx Pro Profile" style={{ background: "#fbfbfc", borderTop: `1px solid ${MX.hair}`, padding: "56px 22px 64px" }}>
      <div className="mx-label" style={{ color: MX.emText, display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden style={{ width: 20, height: 2, borderRadius: 2, background: "var(--mx-accent)" }} />MineEx Pro Profile
      </div>
      <h2 className="mx-h2" style={{ marginTop: 14, color: MX.text }}>Your company. Built for investors.</h2>
      <p className="mx-body" style={{ marginTop: 12, color: MX.dim, maxWidth: "42ch" }}>
        Give investors one place to understand your company, explore your projects and follow your progress.
      </p>

      <div style={{ marginTop: 26, display: "flex", justifyContent: "center" }}>
        <Phone active={active} reduce={reduce} mobile />
      </div>

      {/* concise caption for the active area */}
      <p style={{ marginTop: 18, textAlign: "center", fontSize: 15, fontWeight: 600, color: MX.text }}>{s.caption}</p>

      {/* compact six-state nav — first two live, rest upcoming (disabled) */}
      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {STATES.map((st, i) => (
          <button
            key={st.n}
            onClick={() => setActive(i)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px", borderRadius: 999, cursor: "pointer",
              background: i === active ? MX.ink : "transparent", color: i === active ? "#fff" : MX.dim,
              border: `1px solid ${i === active ? MX.ink : MX.hair}`, fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em",
              transition: reduce ? "none" : `all 240ms ${EASE}`,
            }}
          >
            <span className="mx-num" style={{ fontSize: 10.5, opacity: 0.7 }}>{st.n}</span>{st.label}
          </button>
        ))}
        {FUTURE.map((st) => (
          <span key={st.n} style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px", borderRadius: 999, background: "transparent", color: MX.mute, border: `1px solid ${MX.hair}`, fontSize: 13, fontWeight: 700, opacity: 0.5 }}>
            <span className="mx-num" style={{ fontSize: 10.5, opacity: 0.7 }}>{st.n}</span>{st.label}
          </span>
        ))}
      </div>
    </section>
  );
}
