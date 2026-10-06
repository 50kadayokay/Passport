// ─────────────────────────────────────────────────────────────────────────────
// Home2 — the PRIMARY MineEx homepage (/home). Marketing-layer only.
//
// CURRENT STATE (stable baseline): Nav + the restored frozen Hero, nothing beneath.
// Every section-design direction tried so far (device-glyph "At a Glance", Field-Record
// hero, giant-screenshot Pro Profile, and the A/B/C ecosystem studies) was rejected and
// the whole below-Hero visual direction is on hold pending concrete external visual
// references from the user. Do NOT add a section here or redesign the Hero until then.
//
// PRESERVED on disk, intentionally NOT rendered (reference only): home2/GlanceSection.jsx,
// home2/ProProfileSection.jsx, home2/ProProfileChapter.jsx, home2/ConferenceChapter.jsx,
// and the standalone studies public/__d-study.html and public/__eco-{A,B,C}.html.
// The detailed Pro Profile walkthrough remains at /site?salesstory=1.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { MarketingStyles } from "../system.jsx";
import Nav from "./Nav.jsx";
import AppSection from "./AppSection.jsx";
import { installNavProbe, navDebugOn, NavDebugHUD } from "./navDebug.jsx";

// New simplified story (build one section at a time): 01 Hero · 02 The App · (later)
// Conference Mode · Outcome. Only Hero + AppSection are built. AppSection orchestrates
// the REAL Kingsmen Pro Profile via its embed nav API — no approximation, no product
// changes. Earlier study components (Glance/ProProfile*/Conference chapters) remain on
// disk, unrendered.
export default function Home2() {
  React.useEffect(() => { installNavProbe(); }, []);   // dev-only trackpad probe (?navdebug=1)
  return (
    <div className="mx-root" id="top">
      <MarketingStyles />
      {/* The nav stays the normal LIGHT website chrome through the WHOLE story, including
          the Conference sequence — the dark Conference field is a product STAGE below it,
          not a theme switch. */}
      <Nav />
      {navDebugOn() && <NavDebugHUD />}
      <main>
        {/* Hero is now STATE 0 of the unified AppSection stage (one continuous
            background; Hero copy → the Pro Profile demonstration). Hero.jsx is kept on
            disk (unused) as the frozen standalone reference. */}
        <AppSection />
      </main>
    </div>
  );
}
