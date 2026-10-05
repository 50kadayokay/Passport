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

export default function ProProfileDemo({ demo, frameEl, natural }) {
  useEffect(() => {
    if (!frameEl) return;
    setPpFrame(frameEl);            // sheets portal into the phone frame
    return () => setPpFrame(null);
  }, [frameEl]);

  // The real app's in-company chrome: StatusBar + the profile, and NO bottom nav
  // (the live app hides it inside a company — PassportProto:10898). The directed
  // demo and the `natural` fidelity reference now share this EXACT shell; the only
  // difference is that the demo drives it (`demo` prop) while natural is hand-driven.
  return (
    <div className="relative flex h-full flex-col" style={{ background: "#f4f5f7" }}>
      <div className="flex-shrink-0" style={{ background: "#ffffff" }}>
        <StatusBar />
      </div>
      <div className="relative min-h-0 flex-1">
        <CompanyProfile demo={natural ? undefined : demo} onBack={() => {}} />
      </div>
    </div>
  );
}
