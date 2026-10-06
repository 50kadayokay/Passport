// ─────────────────────────────────────────────────────────────────────────────
// ProIntro — the opening composition of the Pro tab (/pro).
//
// It is built on the SAME stage geometry as the walkthrough that follows
// (NarrativeStory's hardware stage): identical safe insets, max width, grid columns,
// gap and atmosphere. The phone therefore occupies exactly the position and size it
// will hold once the walkthrough begins, so entering the walkthrough reads as the
// narrative changing AROUND a stationary device — not a phone floating between
// sections. The device here is the hardware photograph itself (it carries a real
// profile screenshot); the live app mounts when the walkthrough takes over.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { MX, useReduce, useViewport } from "../system.jsx";

// Mirrors NarrativeStory's hardware stage exactly (SAFE_TOP = NAV_H 64 + 28, SAFE_BOTTOM = 28).
const SAFE_TOP = 92;
const SAFE_BOTTOM = 28;

const POINTS = [
  { t: "One living profile", d: "Identity, projects, progress, capital and leadership — always current." },
  { t: "Explorable, not static", d: "Investors go one tap deep into projects, geology, results and share structure." },
  { t: "Interest becomes a relationship", d: "Investors follow your company and stay connected as the story develops." },
];

export default function ProIntro() {
  const reduce = useReduce();
  const { mobile } = useViewport();

  return (
    <section style={{ position: "relative", height: "100svh", overflow: "hidden", background: "#07080b" }}>
      {/* The SAME continuous radial field the walkthrough stage uses, so the atmosphere
          doesn't change when the visitor crosses into the walkthrough. No clipping box,
          no mask edge — radial gradients fade to nothing on their own. */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
        background: [
          "radial-gradient(62% 52% at 70% 46%, rgba(37,99,235,0.34) 0%, rgba(37,99,235,0.15) 40%, rgba(37,99,235,0) 74%)",
          "radial-gradient(46% 40% at 79% 70%, rgba(45,212,191,0.22) 0%, rgba(45,212,191,0) 72%)",
          "radial-gradient(42% 36% at 61% 22%, rgba(56,189,248,0.17) 0%, rgba(56,189,248,0) 70%)",
        ].join(","),
      }} />

      <div style={{
        position: "relative", zIndex: 2,
        display: "grid",
        gridTemplateColumns: mobile ? "1fr" : "minmax(0, 0.9fr) minmax(0, 1.1fr)",
        alignItems: "center",
        height: "100%",
        maxWidth: 1380,
        margin: "0 auto",
        padding: `${SAFE_TOP}px clamp(28px, 5vw, 84px) ${SAFE_BOTTOM}px`,
        boxSizing: "border-box",
        gap: "clamp(28px, 4vw, 76px)",
      }}>
        {/* LEFT — the editorial column, on the walkthrough's own text axis. */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
          <p className="mx-label" style={{ color: MX.onDarkMute, letterSpacing: "0.22em", margin: 0 }}>MINEEX PRO</p>
          <h1 className="mx-h1" style={{ marginTop: 20, maxWidth: "15ch", color: MX.onDark }}>
            Your company, as an investor-ready product.
          </h1>
          <p className="mx-lead" style={{ marginTop: 22, maxWidth: "40ch", color: MX.onDarkDim }}>
            MineEx Pro turns your disclosure into a living, interactive profile — the essentials, your projects,
            your progress, your capital and your team — in one place investors can explore, understand and follow.
          </p>

          <div style={{ marginTop: "clamp(28px, 4vh, 52px)", display: "flex", flexDirection: "column" }}>
            {POINTS.map((p, i) => (
              <div key={i} style={{ padding: "14px 0", borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ color: MX.onDark, fontWeight: 600, fontSize: 15.5, letterSpacing: "-0.01em" }}>{p.t}</div>
                <div style={{ color: MX.onDarkMute, fontSize: 14, lineHeight: 1.5, marginTop: 4, maxWidth: "44ch" }}>{p.d}</div>
              </div>
            ))}
          </div>

          <p style={{ marginTop: "clamp(24px, 4vh, 48px)", marginBottom: 0, color: MX.onDarkMute, fontSize: 12.5, letterSpacing: "0.2em", fontWeight: 700, textTransform: "uppercase" }}>
            Scroll to explore the live product
            <span aria-hidden style={{ display: "inline-block", marginLeft: 8, animation: reduce ? "none" : "mxNudge 1.8s ease-in-out infinite" }}>↓</span>
          </p>
        </div>

        {/* RIGHT — the device, at the walkthrough's exact size and position. */}
        {!mobile && (
          <div style={{ position: "relative", height: "100%" }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "relative", height: "100%", aspectRatio: "971 / 1620", flexShrink: 0 }}>
                {/* the phone's own soft body shadow, same treatment as the walkthrough */}
                <div aria-hidden style={{
                  position: "absolute", inset: 0, backgroundImage: "url(/marketing/pro-phone-79.webp)",
                  backgroundSize: "100% 100%", backgroundRepeat: "no-repeat",
                  filter: "brightness(0) blur(26px)", opacity: 0.24, transform: "translateY(20px)",
                }} />
                <div aria-hidden style={{
                  position: "absolute", inset: 0, backgroundImage: "url(/marketing/pro-phone-79.webp)",
                  backgroundSize: "100% 100%", backgroundRepeat: "no-repeat",
                }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes mxNudge{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}`}</style>
    </section>
  );
}
