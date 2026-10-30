// DevicePhone — the photoreal titanium iPhone the sales page uses, as a plain
// container you can put anything inside.
//
// WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
// ---------------------------------------------
// The sales page has two phones. PhoneFrame.jsx is a CSS bezel. The photoreal
// one is InvestorShellPhone / DirectedEmbed, and this reuses THAT one's
// presentation exactly: the same three assets, the same opening measured from
// the photograph's own pixels, the same cover-scale-plus-bleed arithmetic.
//
// What it does NOT reuse is how those components get the app on screen. They
// iframe `/appdemo?embed=1` and drive it with a demo state machine. For the
// profile editor that would be a downgrade on three counts: the iframe loads
// the SAVED, published profile over HTTP, so live preview of unsaved edits
// dies; click-to-edit and flash-highlight die with it, because the editor's
// previewRef cannot reach across a document boundary; and it would load a
// second full copy of the investor app. So the screen is `children` and the
// caller decides what renders there.
//
// Neither marketing component is touched, imported or altered.
//
// HOW THE SCREEN IS CUT
//   z0  the photo, blurred to black — the body's ambient shadow
//   z1  the screen: black backing + `children`, CLIPPED by screenMask, whose
//       alpha is the exact complement of the opening cut out of `cutout`
//   z2  `cutout` — the original photograph with the display opening at alpha 0.
//       Titanium, buttons, reflections and the Dynamic Island are untouched
//       original pixels, and this single layer draws the whole screen edge, so
//       there is no hand-drawn radius anywhere and nothing to calibrate.

import React, { useLayoutEffect, useRef, useState } from "react";

// THE APP'S OWN VIEWPORT, measured from the running investor app rather than
// from an iPhone spec sheet.
//
// The app draws itself into a frame of `min(100vw, 396px) x min(100vh, 844px)`
// with a 10px CSS bezel, so everything it renders lives in a 376 x 824 content
// box. Laying the preview out at 393 x 852 instead was close enough to look
// right and wrong enough to matter: 17px of extra width re-wrapped every line
// of a press release, and 28px of extra height moved the bottom sheet.
//
// Content renders at this size and is SCALED to the opening, rather than being
// reflowed into it, so the app hits the same breakpoints it does on a phone.
export const SCREEN_W = 376;
export const SCREEN_H = 824;

const PHONE = {
  body:       "/marketing/pro-phone-79.webp",
  cutout:     "/marketing/pro-phone-79-cutout.webp",
  screenMask: "/marketing/pro-phone-79-screenmask.webp",
  imgW: 971, imgH: 1620,
  aspect: 971 / 1620,
  // Measured from the photograph. The single source of truth for where the
  // screen is — do not "adjust" these to taste; re-measure the image.
  opening: { left: 148.58 / 971, top: 78.87 / 1620, right: 823.66 / 971, bottom: 1545.21 / 1620 },
};

// Sub-pixel bleed so the content cannot leave a seam against the photo's bezel.
const BLEED = 1.004;

export default function DevicePhone({ children, overlay = null, screenRef, onClickCapture, maxWidth = 560 }) {
  const boxRef = useRef(null);
  const [d, setD] = useState(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      // Fit to whichever runs out first, the height we are given or the width.
      const availH = el.clientHeight || 0;
      const availW = Math.min(el.clientWidth || 0, maxWidth);
      if (!availH || !availW) return;
      const boxW = Math.min(availH * PHONE.aspect, availW);
      const boxH = boxW / PHONE.aspect;
      const op = PHONE.opening;
      const opL = op.left * boxW, opT = op.top * boxH;
      const opW = (op.right - op.left) * boxW, opH = (op.bottom - op.top) * boxH;
      const scale = Math.max(opW / SCREEN_W, opH / SCREEN_H) * BLEED;
      setD({
        boxW, boxH, opL, opT, opW, opH, scale,
        left: opL + (opW - SCREEN_W * scale) / 2,
        top:  opT + (opH - SCREEN_H * scale) / 2,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    // A phone that mounts inside a hidden column measures 0 and bails. It then
    // has to notice when the column opens -- which happens on a media query
    // (the review screen hides the preview below xl), not on a React render,
    // so neither the effect nor a prop change will come back around. The
    // ResizeObserver is the intended signal and usually delivers; these are
    // the two cases where it has not: a viewport-driven breakpoint flip, and a
    // first frame measured before layout settled. Without them the preview
    // stays blank until the component remounts.
    window.addEventListener("resize", measure);
    const raf = requestAnimationFrame(measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(raf);
    };
  }, [maxWidth]);

  // The scaled 393x852 stage the content and any overlay both sit on, so a card
  // portalled over the app lines up with the app underneath it exactly.
  const stage = (extra) => ({
    position: "absolute", left: d.left, top: d.top,
    width: SCREEN_W, height: SCREEN_H,
    transform: `scale(${d.scale})`, transformOrigin: "top left",
    overflow: "hidden", ...extra,
  });

  return (
    <div ref={boxRef} style={{ position: "relative", height: "100%", width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {d && (
        <div style={{ position: "relative", width: d.boxW, height: d.boxH, flexShrink: 0 }}>
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
            backgroundImage: `url(${PHONE.body})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat",
            filter: "brightness(0) blur(26px)", opacity: 0.22, transform: "translateY(18px) translateZ(0)" }} />

          <div style={{ position: "absolute", inset: 0, zIndex: 1,
            WebkitMaskImage: `url(${PHONE.screenMask})`, maskImage: `url(${PHONE.screenMask})`,
            WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
            WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat" }}>
            <div aria-hidden style={{ position: "absolute", left: d.opL, top: d.opT, width: d.opW, height: d.opH, background: "#fff" }} />
            <div ref={screenRef} onClickCapture={onClickCapture} style={stage()}>
              {children}
            </div>
            {/* The card the app portals out of itself. Same stage, above the
                app, still inside the mask -- so it reads as something on the
                phone's screen rather than a panel parked beside it, which is
                also what the real app does on a phone. */}
            {overlay && <div style={stage({ zIndex: 2, pointerEvents: "none" })}>{overlay}</div>}
          </div>

          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none",
            backgroundImage: `url(${PHONE.cutout})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }} />
        </div>
      )}
    </div>
  );
}
