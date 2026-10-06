// ─────────────────────────────────────────────────────────────────────────────
// FastPhone — the hardware phone with LIVE DOM inside, instead of an iframe.
//
// DirectedEmbed puts the real app in an <iframe src="/app?…"> behind the same
// photographic hardware. That is deliberate (real app, directed interaction, strict
// fidelity) but it costs a full app boot before a single pixel appears: measured on
// production, the home page's phone took ~6s to show content on an unthrottled wired
// connection, because the frame has to download the app bundle, mount React, fetch live
// data and then pull remote news imagery.
//
// This renders the SAME photographic hardware — same asset, same measured opening, same
// Dynamic Island overlay — with AppUI's screens as ordinary DOM inside it. AppUI is
// already in the page's bundle, so it paints on the first frame with no network at all.
//
// Built for comparison against DirectedEmbed (?fastphone=1). It trades the live app for
// speed; the geometry is shared so the two are directly comparable.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useLayoutEffect, useRef, useState } from "react";
import { PHONE } from "./DirectedEmbed.jsx";
import { ProfileScreen } from "../ui/AppUI.jsx";

// The logical phone AppUI is authored against.
const LOGICAL_W = 390;

// Home's narrative beats → the profile tab each one is talking about.
export const BEAT_TAB = ["overview", "projects", "timeline", "capital", "team", "updates"];

export default function FastPhone({ beat = 0, tab }) {
  const boxRef = useRef(null);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const op = PHONE.opening;                       // display opening, as fractions of the asset
  const h = w / PHONE.imgAspect;                  // hardware height at this width
  const sx = op.left * w, sy = op.top * h;        // screen rect in CSS px
  const sw = (op.right - op.left) * w, sh = (op.bottom - op.top) * h;
  const scale = sw / LOGICAL_W;                   // fit the 390pt UI across the opening

  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%", aspectRatio: `${PHONE.imgW} / ${PHONE.imgH}` }}>
      {/* the live screen, clipped to the measured opening and sitting UNDER the hardware */}
      {w > 0 && (
        <div style={{ position: "absolute", left: sx, top: sy, width: sw, height: sh, overflow: "hidden", background: "#fff" }}>
          <div style={{ width: LOGICAL_W, height: sh / scale, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <ProfileScreen tab={tab || BEAT_TAB[beat] || "overview"} nav="explore" />
          </div>
        </div>
      )}
      {/* the photograph on top — its alpha alone defines the visible edge, so no CSS bezel */}
      <img src={PHONE.cutout} alt="" draggable={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", userSelect: "none" }} />
    </div>
  );
}
