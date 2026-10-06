// ─────────────────────────────────────────────────────────────────────────────
// EmbedProofRoute — the /site?embed=1 three-state fidelity proof, split into its OWN
// lazy chunk so MobileAppFrame loads ONLY when this route is opened. No storytelling,
// just Overview / Projects / Capital at native device geometry for screenshot-diffing.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { MX, MarketingStyles } from "../system.jsx";
import MobileAppFrame, { DEVICE_W } from "./MobileAppFrame.jsx";

export default function EmbedProofRoute() {
  const states = ["overview", "projects", "capital"];
  return (
    <div style={{ display: "flex", gap: 24, padding: 24, background: MX.sheet, minHeight: "100svh", alignItems: "flex-start", overflowX: "auto" }}>
      <MarketingStyles />
      {states.map((t) => (
        <div key={t} style={{ flex: "0 0 auto" }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: MX.mute, marginBottom: 8 }}>{t}</p>
          <div style={{ boxShadow: "0 30px 90px -20px rgba(15,23,42,0.35)", borderRadius: 20, overflow: "hidden" }}>
            <MobileAppFrame tab={t} width={DEVICE_W} />
          </div>
        </div>
      ))}
    </div>
  );
}
