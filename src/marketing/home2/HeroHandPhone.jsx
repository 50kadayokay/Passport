// ─────────────────────────────────────────────────────────────────────────────
// HeroHandPhone — the transparent hand + phone (with the mock MineEx Today feed baked
// on the screen) placed over the EXISTING Hero CSS gradient. The supplied asset is a
// true-alpha cutout (no baked background) whose distal forearm already dissolves to
// transparent, so it embeds with no image boundary. A gentle extra mask along the
// forearm guarantees the far arm never shows a hard edge over the coloured gradient.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";

// Dissolve the DISTANT (left) forearm to true alpha while keeping the wrist, hand and
// phone (right side of the artwork) 100% opaque. Transparent LEFT → opaque RIGHT, with a
// broad transition so no edge is detectable. Tuned to this artwork (wrist sits ~48%).
const FADE = "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0.5) 38%, #000 52%, #000 100%)";

export default function HeroHandPhone() {
  return (
    <img
      src="/marketing/hero-hand-phone.webp"
      alt="The MineEx investor app"
      style={{
        display: "block", width: "100%", height: "auto", pointerEvents: "none",
        WebkitMaskImage: FADE, maskImage: FADE,
      }}
    />
  );
}
