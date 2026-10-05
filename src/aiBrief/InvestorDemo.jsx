// ─────────────────────────────────────────────────────────────────────────────
// InvestorDemo — a no-auth mount of the REAL investor app for the marketing site's
// phone render (iframed at /appdemo?embed=1).
//
// It renders the actual shipped shell (PassportProto's default App) in guest +
// embed mode, so the Today feed, Explore, Following and company profiles are
// exactly what the real app shows — not a rebuild. The only differences from /app:
//   • it skips the sign-in gate (main.jsx's AppRoot), so the marketing phone shows
//     the shell without an account;
//   • it seeds a FICTIONAL company universe and newsroom from the marketing
//     fixture (src/marketing/demo/investorFixture.js) instead of reading live
//     Supabase data, so the walkthrough shows a composed story rather than
//     whatever came down the news pipeline that morning — and so no real
//     company's name ever sits behind copy we wrote; and
//   • it seeds ISOLATED, in-memory demo lists (window.__DEMO_LISTS__) so Following /
//     Favourites / Watchlist are populated WITHOUT reading or writing the real user's
//     saved follows on this origin (listStore honours __INVESTOR_DEMO__).
// The parent drives it via window.__appDemoGo(...) (an additive, embed-only hook in
// App). No change to the live app's behaviour or data: every seam below is read
// only when window.__INVESTOR_DEMO__ is set, which only this mount does.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { DIRECTORY, DEMO_NEWS, DEMO_FEED, LISTS, LEAD_STORY_ID } from "../marketing/demo/investorFixture.js";

export default function InvestorDemo() {
  const [App, setApp] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        window.__INVESTOR_DEMO__ = true;
        // Seeded BEFORE PassportProto is imported: FEED (and the directory indexes
        // built from it) are read at module scope, so they must exist by then.
        window.__DIRECTORY__ = DIRECTORY;
        window.__FEED__ = DEMO_FEED;
        window.__DEMO_NEWS__ = DEMO_NEWS;
        window.__DEMO_POSTS__ = [];
        window.__DEMO_LISTS__ = LISTS;
        window.__DEMO_STORY_ID__ = LEAD_STORY_ID;
      } catch (_) {}
      const mod = await import("./PassportProto.jsx");
      if (alive) setApp(() => mod.default);
    })();
    return () => { alive = false; };
  }, []);

  // Match the app's own background so the hand-off from this placeholder to the
  // first real paint is invisible (a white or black flash reads as a broken phone).
  if (!App) return <div style={{ height: "100dvh", width: "100%", background: "#f4f5f7" }} />;
  return <App guest />;
}
