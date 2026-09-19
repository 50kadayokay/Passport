// The lazy demo chunk. Renders ONE real CompanyProfile from the investor app,
// filling the phone frame, and points its sheet-portal target at that frame so
// BottomSheets render (and clip) inside the phone. Everything here is the real
// product — the marketing side only feeds it a `demo` object and writes CSS vars
// on `frameEl`. Importing this pulls PassportProto (~1.3MB after image
// externalization), so it is React.lazy()'d by DemoStage.
import React, { useEffect } from "react";
import { CompanyProfile, setPpFrame } from "../../aiBrief/PassportProto.jsx";

export default function ProProfileDemo({ demo, frameEl }) {
  useEffect(() => {
    if (!frameEl) return;
    setPpFrame(frameEl);            // sheets portal into the phone frame
    return () => setPpFrame(null);
  }, [frameEl]);

  return <CompanyProfile demo={demo} onBack={() => {}} />;
}
