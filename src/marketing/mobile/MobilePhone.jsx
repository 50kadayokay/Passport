// ─────────────────────────────────────────────────────────────────────────────
// MobilePhone — THE device for the phone marketing pages (Home, Investor, Pro).
//
// One device, one size, one treatment. Chapters change what is on the screen; they
// never redraw the hardware. It is drawn in CSS rather than composited from a photo
// render: at ~240px a raster frame costs a download and still has to be mask-aligned,
// while this stays exact at any width and weighs nothing.
//
// The screen is a real clipping viewport over LIVE DOM. The product surfaces are
// authored against a 390pt logical phone, so the content is laid out at 390 and
// transform-scaled to fit. A transform scales vectors, so text, icons and borders stay
// crisp — the thing a scaled screenshot cannot do — and the browser maps pointer
// coordinates through the same transform, so taps land where they look like they land.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useLayoutEffect, useRef, useState } from "react";

// The logical phone the product surfaces are authored against.
export const LOGICAL_W = 390;
export const LOGICAL_H = 844;

// The device as it appears on a phone page. ~62vw: big enough to read the UI, small
// enough that the whole device plus its caption sit inside one thumb-scroll.
export const PHONE_CSS_WIDTH = "min(62vw, 250px)";

export const BEZEL = 7;   // titanium rail thickness at this size
const RADIUS = 36;        // outer hardware radius

// The device's height for the SAME width, as CSS. The stage reserves exactly this, so
// the box never has slack above and below the device and nothing shifts when a scene
// mounts. Kept here so the geometry has one source.
export const PHONE_CSS_HEIGHT =
  `calc((${PHONE_CSS_WIDTH} - ${BEZEL * 2}px) * ${(LOGICAL_H / LOGICAL_W).toFixed(4)} + ${BEZEL * 2}px)`;

export default function MobilePhone({ children, label = "MineEx app", width = PHONE_CSS_WIDTH }) {
  const boxRef = useRef(null);
  const [screenW, setScreenW] = useState(0);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setScreenW(Math.max(0, el.clientWidth - BEZEL * 2));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure, { passive: true });
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = screenW > 0 ? screenW / LOGICAL_W : 0;
  const screenH = LOGICAL_H * scale;

  return (
    <div ref={boxRef} role="group" aria-label={label}
      style={{
        position: "relative", width, margin: "0 auto", padding: BEZEL, borderRadius: RADIUS,
        // brushed titanium rail
        background: "linear-gradient(145deg, #d8dadf 0%, #8f949c 18%, #5c6067 38%, #8d9198 62%, #d5d7dc 82%, #777c84 100%)",
        boxShadow: "0 28px 60px -26px rgba(10,27,46,0.46), 0 2px 6px -2px rgba(10,27,46,0.28)",
      }}>
      <div
        style={{
          position: "relative", width: "100%", height: screenH || 1,
          borderRadius: RADIUS - BEZEL, overflow: "hidden", background: "#fff",
          // the screen is its own stacking + clipping context, so nothing escapes it
          isolation: "isolate",
          // taps, not nested scrolling: the page stays the one vertical scroller
          touchAction: "manipulation",
        }}>
        {scale > 0 && (
          <div style={{
            width: LOGICAL_W, height: LOGICAL_H,
            transform: `scale(${scale})`, transformOrigin: "top left",
          }}>
            {children}
          </div>
        )}

        {/* Dynamic Island — drawn over the screen, inert. */}
        <span aria-hidden style={{
          position: "absolute", top: Math.max(5, 9 * scale), left: "50%", transform: "translateX(-50%)",
          width: Math.max(52, 112 * scale), height: Math.max(16, 33 * scale), borderRadius: 999,
          background: "#07080b", zIndex: 5, pointerEvents: "none",
        }} />
        {/* the glass: one soft diagonal, nothing animated */}
        <span aria-hidden style={{
          position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none",
          background: "linear-gradient(118deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 34%)",
        }} />
      </div>
    </div>
  );
}
