// ─────────────────────────────────────────────────────────────────────────────
// InvestorShellPhone — the REAL investor app shell inside the same photoreal
// titanium phone the sales page uses. It iframes the chromeless investor render
// (/appdemo?embed=1 → aiBrief/InvestorDemo.jsx) and drives it to the active screen
// via the iframe's window.__investorDemoGo hook as the marketing page scrolls.
//
// The frame is the identical composite as DirectedEmbed's `cutout` mode: the photograph,
// with its display opening cut to alpha 0, sits ON TOP of the live app, so the hardware's
// own anti-aliased bezel edge is the only thing defining where the screen ends. The app and
// its backing are clipped by the mask generated from that same measurement, because their
// rectangular corners would otherwise fall outside the phone's curved body — where the photo
// is transparent and so cannot conceal them. Kept as its own component so the sales-page
// DirectedEmbed stays untouched.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DEVICE_W, DEVICE_H } from "./MobileAppFrame.jsx";

// The screen for the ~240ms before the real app paints. It is the APP'S OWN background,
// so the hand-off is invisible rather than a contrasting slab flashing to light UI.
const BOOT_SCREEN = "#f4f5f7";


// Sub-pixel bleed so the app cannot leave a seam against the photo's own bezel edge.
const CUTOUT_BLEED = 1.004;

const PHONE = {
  src: "/marketing/pro-phone-79.webp",                       // original — used for the body shadow only
  cutout: "/marketing/pro-phone-79-cutout.webp",             // original with the opening cut to alpha 0
  screenMask: "/marketing/pro-phone-79-screenmask.webp",     // its exact complement, for clipping
  imgW: 971, imgH: 1620,
  imgAspect: 971 / 1620,
  // The display opening, measured from the photo's own pixels. The single source of truth for
  // where the screen is; replaces display + displayRadiusPx + displayInsetPx.
  opening: { left: 148.58 / 971, top: 78.87 / 1620, right: 823.66 / 971, bottom: 1545.21 / 1620 },
};

const SRC = "/appdemo?embed=1";

// Match the sales page's phone framing (SAFE_TOP 92 / SAFE_BOTTOM 28 in AppSection).
export default function InvestorShellPhone({ active = "today", insetTop = 92, insetBottom = 28, fill = false, matchSales = false }) {
  const boxRef = useRef(null);
  const frameRef = useRef(null);
  const [dims, setDims] = useState({ scale: 1, w: DEVICE_W, h: DEVICE_H, boxH: 0, appLeft: 0, appTop: 0, appW: 0, appH: 0, opL: 0, opT: 0, opW: 0, opH: 0 });
  const [ready, setReady] = useState(false);

  // Fit the photo box to the available height (matches DirectedEmbed hardware math).
  useLayoutEffect(() => {
    const b = boxRef.current; if (!b) return;
    const measure = () => {
      // `matchSales` sizes the device off the VIEWPORT the way the sales page's phone does
      // (DirectedEmbed sits in a 100svh stage, less 120px of vertical padding), instead of
      // off this page's narrower grid cell — the cell is ~811px tall where the sales stage
      // gives ~930, which rendered the same phone 486px wide here against 557 there. The
      // box is centred and allowed to overflow its cell, exactly as it does on the sales page.
      const availH = matchSales
        ? Math.max(320, (typeof window !== "undefined" ? window.innerHeight : DEVICE_H) - 120)
        : (b.clientHeight || DEVICE_H);
      const boxW = Math.round(availH * PHONE.imgAspect);
      const boxH = boxW * PHONE.imgH / PHONE.imgW;
      const op = PHONE.opening;
      const opL = op.left * boxW, opR = op.right * boxW;
      const opT = op.top * boxH,  opB = op.bottom * boxH;
      const opW = opR - opL, opH = opB - opT;
      // Map the app's own 393×852 viewport onto the measured opening: uniform cover scale,
      // centred, plus the bleed. No manufactured radius, no calibration offsets.
      const appScale = Math.max(opW / DEVICE_W, opH / DEVICE_H) * CUTOUT_BLEED;
      const appVW = DEVICE_W * appScale, appVH = DEVICE_H * appScale;
      setDims({
        scale: appScale, w: boxW, boxH,
        appLeft: opL + (opW - appVW) / 2, appTop: opT + (opH - appVH) / 2,
        appW: appVW, appH: appVH, opL, opT, opW, opH,
      });
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(b);
    // When the size comes from the viewport rather than the cell, the cell may never
    // resize — so listen for the window too.
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [matchSales]);

  // Drive the real shell to the active screen once its hook is live.
  useEffect(() => {
    let tries = 0, stop = false;
    const tick = () => {
      if (stop) return;
      const w = (() => { try { return frameRef.current && frameRef.current.contentWindow; } catch (_) { return null; } })();
      if (w && typeof w.__appDemoGo === "function") {
        try { w.__appDemoGo(active); } catch (_) {}
        setReady(true);
        return;
      }
      if (tries++ < 150) setTimeout(tick, 80);
    };
    tick();
    return () => { stop = true; };
  }, [active]);

  return (
    <div style={{ position: "relative", height: fill ? "100%" : "100svh", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none", overflow: "visible" }}>
      <div ref={boxRef} style={{ position: "absolute", top: insetTop, bottom: insetBottom, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: dims.w, aspectRatio: "971 / 1620", flexShrink: 0 }}>
          {/* soft body shadow — from the original photo (unchanged) */}
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
            backgroundImage: `url(${PHONE.src})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat",
            filter: "brightness(0) blur(26px)", opacity: 0.24, transform: "translateY(20px) translateZ(0)" }} />
          {/* z0–z1 — backing + live app, CLIPPED to the hardware's real screen opening by the
              mask generated from the same measurement as the cutout. */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 1,
            WebkitMaskImage: `url(${PHONE.screenMask})`, maskImage: `url(${PHONE.screenMask})`,
            WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
            WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
          }}>
            <div aria-hidden style={{ position: "absolute", left: dims.opL, top: dims.opT, width: dims.opW, height: dims.opH, background: "#000", pointerEvents: "none" }} />
            <div style={{ position: "absolute", left: dims.appLeft, top: dims.appTop, width: dims.appW, height: dims.appH, overflow: "hidden" }}>
              <iframe
                ref={frameRef}
                title="MineEx investor app"
                src={SRC}
                width={DEVICE_W}
                height={DEVICE_H}
                scrolling="no"
                loading="eager"
                style={{ border: 0, display: "block", width: DEVICE_W, height: DEVICE_H, transform: `scale(${dims.scale})`, transformOrigin: "top left", pointerEvents: "none" }}
              />
              {!ready && <div aria-hidden style={{ position: "absolute", inset: 0, background: BOOT_SCREEN, transition: "opacity 400ms ease" }} />}
            </div>
          </div>
          {/* z2 — the ORIGINAL photo with the opening cut transparent. Titanium, bezel, buttons,
              reflections and the Dynamic Island are untouched original pixels, and this single
              layer draws the entire display boundary. */}
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
            backgroundImage: `url(${PHONE.cutout})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", backgroundPosition: "0 0" }} />
        </div>
      </div>
    </div>
  );
}
