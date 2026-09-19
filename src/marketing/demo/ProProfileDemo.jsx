// The lazy demo chunk. Renders ONE real CompanyProfile from the investor app
// inside the real app shell (status bar + bottom nav + safe-area spacing), so a
// CEO sees what looks exactly like the MineEx app. The shell is spatially stable;
// only the CompanyProfile content changes. Sheets portal into `frameEl` (the
// phone frame) so they cover the shell exactly as in production.
//
// Importing this pulls PassportProto (~1.3MB after image externalization), so it
// is React.lazy()'d by DemoStage.
import React, { useEffect } from "react";
import { CompanyProfile, setPpFrame, StatusBar, BottomNav } from "../../aiBrief/PassportProto.jsx";

export default function ProProfileDemo({ demo, frameEl }) {
  useEffect(() => {
    if (!frameEl) return;
    setPpFrame(frameEl);            // sheets portal into the phone frame
    return () => setPpFrame(null);
  }, [frameEl]);

  return (
    <div className="relative flex h-full flex-col" style={{ background: "#f4f5f7" }}>
      <div className="flex-shrink-0" style={{ background: "#ffffff" }}>
        <StatusBar />
      </div>
      <div className="relative min-h-0 flex-1">
        <CompanyProfile demo={demo} onBack={() => {}} />
      </div>
      {/* real bottom nav, opaque (no per-frame backdrop-blur while content scrolls) */}
      <BottomNav nav="explore" setNav={() => {}} solid />
    </div>
  );
}
