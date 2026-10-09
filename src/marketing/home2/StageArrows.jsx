// ─────────────────────────────────────────────────────────────────────────────
// StageArrows — the phone walkthroughs' navigation on a phone.
//
// Scroll no longer drives these walkthroughs. Driving a directed demo from scroll
// position meant momentum kept advancing it after the finger left the glass, and every
// attempt to govern that (rate limits, settle windows, scroll snapping) either failed to
// stop it or introduced motion of its own. A button press is unambiguous: one press, one
// state, and nothing happens unless the visitor asks for it.
//
// The two controls sit at the left and right edges, vertically centred on the device so
// they fall under either thumb. They are glass discs — a blurred, translucent fill with a
// hairline border — so they read as controls over both the near-black Pro stage and the
// light sales stage without either being restyled. At the ends of the story the control
// that cannot go anywhere fades back and stops taking presses, rather than disappearing
// and shifting the other one.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { EASE } from "../system.jsx";

const DownChevron = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Chevron = ({ dir }) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden
    style={{ transform: dir === "prev" ? "translateX(-1px)" : "translateX(1px)" }}>
    <path d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
      stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Arrow({ dir, onPress, disabled, dark }) {
  // Over a near-black stage the disc lifts off the background; over the light one it sits
  // into it. Same shape, same size, same position — only the palette differs.
  const ink = dark ? "rgba(255,255,255,0.92)" : "#0a1b2e";
  const fill = dark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.90)";
  const edge = dark ? "rgba(255,255,255,0.18)" : "rgba(10,27,46,0.12)";
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous" : "Next"}
      className="mx-arrowbtn"
      style={{
        appearance: "none", padding: 0, margin: 0, cursor: disabled ? "default" : "pointer",
        width: 46, height: 46, borderRadius: 999,
        display: "grid", placeItems: "center",
        color: ink,
        background: fill,
        border: `1px solid ${edge}`,
        // No backdrop-filter. These sit directly over the animating device, and a
        // backdrop blur forces iOS Safari to re-rasterise everything behind them on every
        // frame the device moves. A slightly more opaque fill reads the same.
        boxShadow: dark ? "0 10px 26px -14px rgba(0,0,0,0.9)" : "0 10px 26px -16px rgba(10,27,46,0.55)",
        opacity: disabled ? 0.28 : 1,
        pointerEvents: disabled ? "none" : "auto",
        transition: `opacity 260ms ${EASE}, transform 180ms ${EASE}, background 260ms ${EASE}`,
        // iOS: suppress the grey tap flash and any text selection on a double press.
        WebkitTapHighlightColor: "transparent", WebkitUserSelect: "none", userSelect: "none",
        touchAction: "manipulation",
      }}
    >
      <Chevron dir={dir} />
    </button>
  );
}

/**
 * The opening screen has nothing to go back to and no device beside it yet, so the pair of
 * side controls had nothing to flank and sat on top of the hero's own line. It gets a
 * single centred control pointing DOWN to the walkthrough instead; the left/right pair
 * appears once the story has started.
 */
export function StageStart({ onGo, dark = false, bottom = "16%", label = "Explore the product" }) {
  const ink = dark ? "rgba(255,255,255,0.92)" : "#0a1b2e";
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom, zIndex: 40, display: "grid", placeItems: "center", gap: 12 }}>
      <span style={{ color: dark ? "rgba(255,255,255,0.55)" : "#6b7382", fontSize: 12, fontWeight: 700,
        letterSpacing: "0.18em", textTransform: "uppercase" }}>{label}</span>
      <button type="button" onClick={onGo} aria-label={label} className="mx-arrowbtn"
        style={{
          appearance: "none", padding: 0, margin: 0, cursor: "pointer",
          width: 54, height: 54, borderRadius: 999, display: "grid", placeItems: "center",
          color: ink,
          background: dark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.92)",
          border: `1px solid ${dark ? "rgba(255,255,255,0.18)" : "rgba(10,27,46,0.12)"}`,
          boxShadow: dark ? "0 12px 30px -16px rgba(0,0,0,0.9)" : "0 12px 30px -18px rgba(10,27,46,0.55)",
          WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
        }}>
        <DownChevron />
      </button>
      <style>{`.mx-arrowbtn:active:not(:disabled){transform:scale(0.93)}`}</style>
    </div>
  );
}

/**
 * i      current state index
 * n      total states
 * onGo   (nextIndex) => void
 * dark   true over the near-black stage
 * bottom distance from the stage's bottom edge; the controls centre on the device
 * atEnd  optional: called instead of onGo when pressing next on the last state
 */
export default function StageArrows({ i, n, onGo, dark = false, bottom = "46%", atEnd }) {
  const canPrev = i > 0;
  const canNext = i < n - 1 || !!atEnd;
  const go = (d) => {
    if (d > 0 && i >= n - 1) { if (atEnd) atEnd(); return; }
    const next = Math.max(0, Math.min(n - 1, i + d));
    if (next !== i) onGo(next);
  };
  return (
    <div aria-hidden={false} style={{
      position: "absolute", left: 0, right: 0, bottom, zIndex: 40,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "0 14px", pointerEvents: "none",
    }}>
      <div style={{ pointerEvents: "auto" }}><Arrow dir="prev" dark={dark} disabled={!canPrev} onPress={() => go(-1)} /></div>
      <div style={{ pointerEvents: "auto" }}><Arrow dir="next" dark={dark} disabled={!canNext} onPress={() => go(1)} /></div>
      <style>{`.mx-arrowbtn:active:not(:disabled){transform:scale(0.93)}`}</style>
    </div>
  );
}
