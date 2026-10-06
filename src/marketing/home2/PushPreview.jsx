// ─────────────────────────────────────────────────────────────────────────────
// PushPreview — the iOS-style notification shown beside the phone when a company
// publishes a press release. Marketing preview only: nothing is delivered, and the
// release's real date stays on the timeline entry. Shared by the sales page and the
// full Pro walkthrough so there is ONE implementation.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { MX, EASE } from "../system.jsx";

const PR_DEMO = {
  app: "MineEx",
  company: "Kingsmen Resources",
  meta: "Preview",                     // marketing preview — NOT a delivered notification.
                                       // The release's real date stays on the timeline entry,
                                       // which is the app's own untouched rendering.
  short: "Kingsmen closes C$13M bought deal financing.",
};
// Two stages of ONE demonstration: publish + notify, then feed discovery.

export { PR_DEMO };

// The Investor walkthrough's notification: a different company, and a real-looking
// timestamp rather than the sales page's "Preview" qualifier, because in that story the
// investor genuinely is being notified by a company they follow.
export const PR_INVESTOR = {
  app: "MineEx",
  company: "Cerro Pálido Silver",
  meta: "now",
  short: "New press release: Phase II drilling to begin in November.",
};

// `note` defaults to PR_DEMO so the sales page and Pro walkthrough, which pass only
// `show`, render exactly as before. `offset` likewise only overrides when supplied.
export function PushPreview({ show, note = PR_DEMO, offset }) {
  return (
    <div aria-hidden={!show} style={{
      // Anchored to the PHONE cell and set off the device's real edge, not a guessed
      // coordinate. The 557-wide photo overflows its 320px column, so the titanium edge
      // sits at (187px - 22.56svh) from the cell's left — which makes a constant gutter
      // `calc(157px + 22.56svh)` from the cell's right at every viewport height. The top
      // is a proportion of the DEVICE height, so it tracks the phone rather than the page.
      // Anchored off the DEVICE, not the column: the titanium edge sits 0.3764·boxW left of
      // the column centre, and boxW = 0.59938·(100svh − 120px). Expressed from the centre
      // (50%) this is correct for any column width — the sales page's 320px cell and the
      // walkthrough's wider one both land with the same gutter.
      position: "absolute", right: (offset && offset.right) || "calc(50% + 22.56svh - 3px)",
      top: (offset && offset.top) || "clamp(56px, calc(11.5svh - 12px), 136px)",
      width: "clamp(352px, 24vw, 412px)", zIndex: 5,
      opacity: show ? 1 : 0,
      transform: show ? "translate(0, 0)" : "translate(-14px, -6px)",
      transition: `opacity 520ms ${EASE}, transform 620ms ${EASE}`,
      pointerEvents: "none",
    }}>
      <div style={{
        display: "flex", gap: 9, alignItems: "flex-start",
        background: "rgba(250,251,253,0.82)",
        backdropFilter: "saturate(190%) blur(24px)", WebkitBackdropFilter: "saturate(190%) blur(24px)",
        border: "0.5px solid rgba(15,23,42,0.08)", borderRadius: 22, padding: "13px 15px",
        boxShadow: "0 16px 36px -14px rgba(10,27,46,0.26), 0 1px 3px rgba(10,27,46,0.06)",
      }}>
        {/* app icon — iOS renders these small; the drill-core mark on near-black */}
        {/* the REAL MineEx app icon the iOS app ships with */}
        <img src="/apple-touch-icon.png" alt="" width={30} height={30} style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, marginTop: 1, display: "block" }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: MX.text, letterSpacing: "-0.005em" }}>
              {note.app}
              {note.meta && <span style={{ color: MX.mute, fontWeight: 400 }}>{" · "}{note.meta}</span>}
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: MX.text, letterSpacing: "-0.014em", marginTop: 3 }}>{note.company}</div>
          <div style={{ fontSize: 14, lineHeight: 1.34, color: MX.dim, marginTop: 2 }}>{note.short}</div>
        </div>
      </div>
    </div>
  );
}

export default PushPreview;
