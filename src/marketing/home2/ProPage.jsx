// ─────────────────────────────────────────────────────────────────────────────
// ProPage (/pro) — the "Pro" tab. Same full walkthrough as /site?salesstory=1,
// but framed: an introductory section that explains the Pro service ABOVE it, and a
// pricing section BELOW it. Dark stage throughout (matches the walkthrough).
// The walkthrough itself is the frozen NarrativeStory, embedded via ProProfileChapter's
// scroll-ownership controller so it captures wheel only while pinned and releases to the
// intro (up) / pricing (down) at its boundaries.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { MarketingStyles, useViewport } from "../system.jsx";
import Nav from "./Nav.jsx";
import ProProfileChapter from "./ProProfileChapter.jsx";

export default function ProPage() {
  const { mobile } = useViewport();
  // The phone composition is a whole light page (its own nav, ground and footer), the
  // same shell Home and Investor use — not a body dropped into the walkthrough's dark
  // stage, which is what made Pro the only black page on the phone.
  const [demoActive, setDemoActive] = useState(false);
  // The closing pricing sheet is a LIGHT screen; the walkthrough behind it is near-black.
  // The nav follows whichever is in front, so a dark bar never sits over the light sheet.
  const [pricingUp, setPricingUp] = useState(false);
  return (
    <div className="mx-root" id="top" style={{ background: pricingUp ? "#fbfcfe" : "#07080b", transition: "background 420ms ease" }}>
      <MarketingStyles />
      {/* THE CANVAS. The page colour was set on this div and on a position:fixed backdrop,
          and the black line survived both. What neither covers is the strip iOS exposes
          below a fixed element while its toolbars move: that area paints the CANVAS, which
          comes from html/body, not from any div. html had no dark background, so the strip
          rendered near-black against the page's #07080b and read as a hard line. Setting it
          on html and body is the only thing that paints there. Reverted to light while the
          pricing sheet is up, since that sheet is a light screen. */}
      <style>{`html, body { background: ${pricingUp ? "#fbfcfe" : "#07080b"} !important; }`}</style>
      {/* The SAME nav component the sales page renders, never receding: it must stay visible
            through every walkthrough state. `dark` is the component's existing theme prop,
            needed because this page's stage is #07080b — not a walkthrough-specific design. */}
        <Nav dark={!pricingUp} solid={pricingUp} />
      {/* The walkthrough IS the page: it opens on state 1 and carries Pro pricing as the
          sheet that rises when the walkthrough completes. No hero, no spacer, no scroll. */}
      {/* The pinned, wheel-driven walkthrough is a desktop experience. On a phone it has no
          meaning and rendered as a full-bleed device over the nav, so mobile gets its own
          composition of the same story. Desktop is untouched. */}
      {/* BACKDROP. The walkthrough's glow field is painted INSIDE the pinned stage, so it
          stops exactly where the stage stops and anything below it is the root's flat
          #07080b — a hard black edge. That is the "black bar", and it shows up mid-swipe
          because Safari does not re-evaluate viewport units continuously while a momentum
          scroll is running: for a few frames the stage is measured against a height that is
          no longer the one on screen. Chasing that with svh/dvh/lvh did not work, twice.
          So the fix is not to make the stage match the viewport exactly, it is to make what
          sits BEHIND it identical, so a mismatch has nothing to reveal. position:fixed means
          this always covers the visual viewport whatever the stage is doing. Phones only;
          the desktop page is pinned and never exposes the gap. */}
      {mobile && !pricingUp && (
        <div aria-hidden style={{
          position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "#07080b",
        }}>
          <div style={{ position: "absolute", inset: 0, background: [
            "radial-gradient(62% 52% at 70% 46%, rgba(37,99,235,0.34) 0%, rgba(37,99,235,0.15) 40%, rgba(37,99,235,0) 74%)",
            "radial-gradient(46% 40% at 79% 70%, rgba(45,212,191,0.22) 0%, rgba(45,212,191,0) 72%)",
            "radial-gradient(42% 36% at 61% 22%, rgba(56,189,248,0.17) 0%, rgba(56,189,248,0) 70%)",
          ].join(",") }} />
        </div>
      )}
      <main style={{ position: "relative", zIndex: 1 }}><ProProfileChapter onActive={setDemoActive} onPricing={setPricingUp} /></main>
    </div>
  );
}
