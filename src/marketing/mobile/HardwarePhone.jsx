// ─────────────────────────────────────────────────────────────────────────────
// HardwarePhone — the photographic device, shared by desktop and the phone pages.
//
// This is the same asset and the same measured geometry the sales page already uses
// (demo/DirectedEmbed.jsx): a photograph of the real hardware with only the display
// opening cut to alpha, so the photo's own pixels define the edge. No CSS bezel, no
// drawn Dynamic Island, no approximated corner radius — the titanium, buttons,
// reflections and island are the original image.
//
// `deviceWidth` is the width of the PHONE, not of the image: the asset carries padding
// around the hardware (the device is 76.2% of the image width), so sizing by the image
// would render a phone noticeably smaller than asked for.
//
// Children are live DOM laid out at a 390pt logical phone and transform-scaled into the
// opening, so type and icons stay vector-sharp and taps map through the same transform.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useLayoutEffect, useRef, useState } from "react";
import { PHONE } from "../demo/DirectedEmbed.jsx";

export const LOGICAL_W = 390;
// Measured from the cutout's alpha: the hardware occupies this fraction of the asset.
const DEVICE_FRAC = 740 / 971;

export default function HardwarePhone({ children, deviceWidth = 242, label = "MineEx app", style }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);              // image width in CSS px

  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const imgW = deviceWidth / DEVICE_FRAC;      // image width that yields the asked device width
  const h = w / PHONE.imgAspect;
  const op = PHONE.opening;
  const sx = op.left * w, sy = op.top * h;
  const sw = (op.right - op.left) * w, sh = (op.bottom - op.top) * h;
  const scale = sw / LOGICAL_W;

  return (
    <div ref={ref} role="group" aria-label={label}
      style={{ position: "relative", width: imgW, maxWidth: "100%", margin: "0 auto",
        aspectRatio: `${PHONE.imgW} / ${PHONE.imgH}`, ...style }}>
      {w > 0 && (
        <div style={{ position: "absolute", left: sx, top: sy, width: sw, height: sh,
          overflow: "hidden", background: "#fff", touchAction: "manipulation" }}>
          <div style={{ width: LOGICAL_W, height: sh / scale, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            {children}
          </div>
        </div>
      )}
      {/* the photograph on top — its alpha alone defines the visible edge */}
      <img src={PHONE.cutout} alt="" draggable={false} decoding="async"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", userSelect: "none" }} />
    </div>
  );
}
