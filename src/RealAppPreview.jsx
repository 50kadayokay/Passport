// The onboarding preview, rendered by the REAL app component.
//
// Before this, onboarding previewed a separate, simpler CompanyProfile
// (aiBrief/screens/CompanyProfile.jsx) that drifted from the live app — different
// timeline design, no core-value-driver animation, a different press-release
// sheet, a different projects layout. This drives the ACTUAL app profile
// (PassportProto.CompanyProfile) from the onboarding `profile`, so the preview IS
// the app. One profile UI, zero drift.
//
// How it's driven: PassportProto reads its data from module-level values that
// applyPP() swaps in. So on each (debounced) profile change we compile the rich
// profile to the flat `pp` via mapProfileToPP, applyPP it, and bump a key to
// remount the profile so it re-reads. Same mechanism the live app uses.
//
// Lazy-loaded: PassportProto is a large module, so it's imported on demand when
// the preview first mounts rather than bloating the console bundle.

import React, { useEffect, useMemo, useState } from "react";
import { mapProfileToPP } from "./lib/profileToPP.js";

export default function RealAppPreview({ profile, tab, onTabChange }) {
  const [mod, setMod] = useState(null);        // { Profile, applyPP }
  const [ver, setVer] = useState(0);           // remount key — bumps when data changes
  const [debounced, setDebounced] = useState(profile);

  // Load the real app component once.
  useEffect(() => {
    let ok = true;
    import("./aiBrief/PassportProto.jsx")
      .then((m) => { if (ok) setMod({ Profile: m.CompanyProfile, applyPP: m.applyPP }); })
      .catch(() => {});
    return () => { ok = false; };
  }, []);

  // Debounce profile edits so typing doesn't remount the heavy component on every
  // keystroke — the preview catches up ~300ms after you stop.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(profile), 300);
    return () => clearTimeout(t);
  }, [profile]);

  const pp = useMemo(() => mapProfileToPP(debounced || {}), [debounced]);

  // Apply the compiled data into the app module, then remount to pick it up.
  useEffect(() => {
    if (!mod) return;
    mod.applyPP(pp);
    setVer((v) => v + 1);
  }, [mod, pp]);

  if (!mod) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>
        Loading preview…
      </div>
    );
  }
  const P = mod.Profile;
  return <P key={ver} tab={tab} onTabChange={onTabChange} onBack={() => {}} onScan={() => {}} />;
}
