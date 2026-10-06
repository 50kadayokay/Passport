// ─────────────────────────────────────────────────────────────────────────────
// WalkthroughNarrative — the ONE narrative typography system shared by BOTH the
// App walkthrough (01–06) and the Conference walkthrough (01–05). They must read as
// two chapters of a single presentation, so the label / headline / body / rail and
// every size, weight, spacing and column measure live here and here only. Neither
// chapter defines its own type — they both render this component.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { MX, EASE } from "../system.jsx";

// The ONE stage grid shared by the App walkthrough, the Conference Introduction and the
// Conference walkthrough, so every chapter's narrative sits on the SAME content grid /
// left edge (the Pro walkthrough is the source of truth). Col 1 = the narrative
// (max-content, governed by the 38ch mx-lead → identical width across chapters); col 2 =
// a 320px device slot that reproduces Pro's centring even when the real device is drawn
// separately. Desktop only; callers switch to a single column on mobile.
export const STAGE = {
  maxWidth: 1180,
  padding: "0 clamp(28px, 5vw, 72px)",
  gap: "clamp(84px, 10vw, 120px)",
  cols: "minmax(0, max-content) 320px",
};
// On a phone the two rows were auto-sized and vertically centred, so the copy took what
// it needed and the DEVICE got the remainder — measured at 194px of height on a 740px
// viewport, which rendered the app 81px wide. The device is the product; it gets the
// remaining height, and the copy sits above it at its natural size.
export const stageGridStyle = (mobile) => (mobile
  // The copy row is a FIXED height. Desktop puts copy and device in separate columns, so
  // a longer beat cannot move the phone; stacked on a phone it can, and every beat change
  // nudged the device (CLS 0.157 on mobile vs 0.012 on desktop). Reserving the tallest
  // beat keeps the device still — it is the one thing on screen that must not move.
  ? { display: "grid", gridTemplateColumns: "1fr", gridTemplateRows: "clamp(150px, 30svh, 200px) minmax(0, 1fr)",
      alignItems: "stretch", height: "100%", padding: "0 22px 6px", gap: 10 }
  : { display: "grid", gridTemplateColumns: STAGE.cols, justifyContent: "center", alignItems: "center", height: "100%", maxWidth: STAGE.maxWidth, margin: "0 auto", padding: STAGE.padding, gap: STAGE.gap });

// The vertical progress rail — one segment per beat, filled to the active one.
export function ChapterRail({ total, active }) {
  return (
    <div aria-hidden style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, flexShrink: 0, paddingTop: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{ width: 2, height: i === active ? 30 : 16, borderRadius: 2,
          background: i === active ? MX.ink : i < active ? "rgba(18,22,29,0.28)" : "rgba(18,22,29,0.12)",
          transition: `height 420ms ${EASE}, background 420ms ${EASE}` }} />
      ))}
    </div>
  );
}

// The shared narrative block: rail + (NN / total · PAGE), headline, body, optional tail.
// `motionStyle` (App) drives the whole unit's out→in with the caller's phase machine.
// `animateKey` (Conference) re-keys the unit so each state rises + resolves in place.
// Passing neither leaves it static. The TYPOGRAPHY is identical either way.
export function WalkthroughNarrative({ total, index, page, head, body, tail, motionStyle, animateKey, mobile = false, reduce = false }) {
  const n = Math.max(1, index + 1);
  const keyed = animateKey != null;
  return (
    <div style={{ display: "flex", gap: "clamp(20px, 2vw, 34px)", alignItems: "stretch" }}>
      {!mobile && <ChapterRail total={total} active={Math.max(0, index)} />}
      <div style={{ minHeight: mobile ? 0 : 300, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div
          key={keyed ? animateKey : undefined}
          className={keyed && !reduce ? "mx-wn-in" : ""}
          style={motionStyle}
        >
          <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em", margin: 0 }}>
            <span style={{ color: MX.ink, fontWeight: 800 }}>{String(n).padStart(2, "0")}</span>
            <span style={{ color: MX.mute }}> / {String(total).padStart(2, "0")}</span>
            <span style={{ color: MX.mute, margin: "0 8px" }}>·</span>
            {page}
          </p>
          <h2 className="mx-h2" style={{ marginTop: mobile ? 9 : 18, maxWidth: mobile ? "22ch" : "16ch", color: MX.text }}>{head}</h2>
          <p className="mx-lead" style={{ color: MX.dim, marginTop: mobile ? 10 : 20, maxWidth: "38ch" }}>{body}</p>
          {tail}
        </div>
      </div>
      <style>{`@keyframes mxWnIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}} .mx-wn-in{animation:mxWnIn 420ms cubic-bezier(0.22,1,0.36,1) both}`}</style>
    </div>
  );
}

export default WalkthroughNarrative;
