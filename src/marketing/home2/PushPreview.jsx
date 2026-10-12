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
export function PushPreview({ show, note = PR_DEMO, offset, mobile = false }) {
  // MOBILE — centred on the device instead of set beside it.
  //
  // The desktop anchor is `right: calc(50% + 22.56svh - 3px)`, which places the card's RIGHT
  // edge well to the LEFT of centre so it sits in the empty column next to the phone. On a
  // phone there is no such column: measured at 402px that resolves to a right edge 7px from
  // the viewport's left, with a 352px minimum width, so the card hangs off the screen and
  // only its right edge is visible. That is the reported defect.
  //
  // There is no room to place it cleanly ABOVE the device either — measured, the body copy
  // ends at 210 and the phone begins at 272, a 62px gap for a 112px card. So it is centred
  // on the device and straddles the phone's top edge, part above and part over the upper
  // screen, which is how a notification actually arrives on a phone. It clears the copy and
  // stops well short of the arrows.
  //
  // The entrance transform has to CARRY the centring, not replace it: `translate(-14px,-6px)`
  // on its own would cancel a `translateX(-50%)` and put the card back off-centre.
  const pos = mobile
    ? { left: "50%", right: "auto", top: "clamp(-64px, -5svh, -34px)",
        width: "min(calc(100vw - 36px), 372px)",
        transform: show ? "translate(-50%, 0)" : "translate(calc(-50% - 14px), -6px)" }
    : { right: (offset && offset.right) || "calc(50% + 22.56svh - 3px)",
        top: (offset && offset.top) || "clamp(56px, calc(11.5svh - 12px), 136px)",
        width: "clamp(352px, 24vw, 412px)",
        transform: show ? "translate(0, 0)" : "translate(-14px, -6px)" };
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
      position: "absolute", zIndex: 5,
      ...pos,
      opacity: show ? 1 : 0,
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
