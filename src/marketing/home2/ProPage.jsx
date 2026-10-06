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
      {/* The SAME nav component the sales page renders, never receding: it must stay visible
            through every walkthrough state. `dark` is the component's existing theme prop,
            needed because this page's stage is #07080b — not a walkthrough-specific design. */}
        <Nav dark={!pricingUp} solid={pricingUp} />
      {/* The walkthrough IS the page: it opens on state 1 and carries Pro pricing as the
          sheet that rises when the walkthrough completes. No hero, no spacer, no scroll. */}
      {/* The pinned, wheel-driven walkthrough is a desktop experience. On a phone it has no
          meaning and rendered as a full-bleed device over the nav, so mobile gets its own
          composition of the same story. Desktop is untouched. */}
      <main><ProProfileChapter onActive={setDemoActive} onPricing={setPricingUp} /></main>
    </div>
  );
}
