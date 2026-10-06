// ─────────────────────────────────────────────────────────────────────────────
// MobileAppFrame — runs the REAL mobile MineEx app inside the marketing phone.
//
// This replaces the old PhoneScaler + ProProfileDemo approach, which laid the app
// out at 375px inside a DESKTOP window (so window.innerWidth stayed desktop,
// isPhone() was false, the real .pp-frame shell + BottomNav never rendered, and
// viewport-height layouts like Overview's Company Status card collapsed).
//
// Instead we embed `/app?c=…&embed=1` in an <iframe>. An iframe has its OWN
// window: innerWidth/innerHeight == the iframe box (DEVICE_W × DEVICE_H), so the
// app genuinely believes it owns a real mobile viewport — isPhone() is true, the
// authentic mobile shell renders, the definite-height chain is intact, and
// getBoundingClientRect is honest. The marketing page only SCALES the iframe
// visually (transform), it never changes the app's internal viewport.
//
// The directed layer (later) drives this by same-origin automation of the iframe
// (select tabs, scroll, tap cards, open sheets) — an orchestration layer over the
// real app, never a parallel layout.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo } from "react";

// Target device geometry — iPhone 16 Pro MAX class, matching the live screenshots the
// demos are checked against. CSS px; the app runs at exactly this viewport inside the
// iframe, and every demo phone (Investor, Pro walkthrough, Projects) reads it from here.
//
// Tuned on 2026-10-04 so the Capital tab's last card (the AI Summary) seats just above the
// tab bar, as it does on the reference device. At 393×852 that card was sliced in half; at
// 440×956 the next section showed underneath it.
//
// WHAT MATTERS HERE IS THE ASPECT RATIO, not the absolute numbers: the app is cover-fit
// into the phone photograph's display opening (≈0.460 w/h), so width and height must be
// changed together. 424/921 = 0.4604 holds that; picking a height alone would crop the
// app's sides inside the bezel.
export const DEVICE_W = 424;
export const DEVICE_H = 921;

const SLUG = "kingsmen-resources";

export default function MobileAppFrame({
  tab,                 // initial company tab: overview | projects | timeline | capital | team | updates
  width = 320,         // on-screen width; the iframe is scaled from DEVICE_W to this
  slug = SLUG,
  title = "MineEx mobile app",
  style,
}) {
  const scale = width / DEVICE_W;
  const src = useMemo(() => {
    const p = new URLSearchParams({ c: slug, embed: "1" });
    if (tab) p.set("tab", tab);
    return `/app?${p.toString()}`;
  }, [slug, tab]);

  return (
    <div
      style={{
        width,
        height: DEVICE_H * scale,
        position: "relative",
        overflow: "hidden",
        background: "#ffffff",
        ...style,
      }}
    >
      <iframe
        title={title}
        src={src}
        width={DEVICE_W}
        height={DEVICE_H}
        scrolling="no"
        style={{
          border: 0,
          display: "block",
          width: DEVICE_W,
          height: DEVICE_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}
