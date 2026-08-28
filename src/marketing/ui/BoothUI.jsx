// ─────────────────────────────────────────────────────────────────────────────
// Presentation build of MineEx Conference Mode — the booth deck that runs on an
// iPad at a mining conference (the real thing lives in src/aiBrief/ConferenceScenes.jsx
// and conferenceUI.jsx, and is opened at /app?c=<slug>&ipad=1).
//
// Same composition, same tones, same type ramp, same handoff QR — rebuilt small
// enough to sit inside a marketing device frame and be driven by scroll.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { EASE } from "../system.jsx";
import { CO, IMG } from "../data.js";

// The product's own accent. These are app screens, so they keep the colour the
// app actually ships — the marketing page around them is monochrome by design, and
// the product is what supplies the colour.
const EM = "#059669";
const EM_TEXT = "#047857";
const EM_SOFT = "#ecfdf5";

const SHEET = "#f2efe8";
const ONLIGHT = "#141821";
const DIMLIGHT = "#565f6b";
const INKBG = "#05070d";

const BOOTH_NAV = ["Overview", "Jurisdiction", "Capital", "Leadership", "Follow"];

// The QR a booth visitor actually scans — it opens this company's live profile.
export function QrCode({ value, size = 112, dark = "#05070d", quiet = true }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((m) => (m.default || m).toString(value, { type: "svg", errorCorrectionLevel: "H", margin: 0, color: { dark, light: "#ffffff" } }))
      .then((s) => { if (live) setSvg(s); })
      .catch(() => {});
    return () => { live = false; };
  }, [value, dark]);
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#fff",
        borderRadius: quiet ? 14 : 0,
        padding: quiet ? size * 0.08 : 0,
        boxShadow: quiet ? "0 24px 54px -30px rgba(0,0,0,0.6)" : "none",
        flex: "0 0 auto",
      }}
    >
      {svg ? (
        <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div style={{ width: "100%", height: "100%", borderRadius: 6, background: "#f1f5f9" }} />
      )}
    </div>
  );
}

function BoothNav({ active = 0, tone = "light" }) {
  const light = tone === "light";
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: "clamp(12px, 2.4%, 26px)", padding: "3.6% 0 0" }}>
      {BOOTH_NAV.map((n, i) => (
        <span
          key={n}
          style={{
            fontSize: "clamp(7px, 1.15cqw, 13px)",
            fontWeight: i === active ? 700 : 500,
            letterSpacing: "-0.01em",
            color: i === active ? (light ? ONLIGHT : "#fff") : light ? "#9aa1ab" : "rgba(255,255,255,0.45)",
            borderBottom: `1.5px solid ${i === active ? EM : "transparent"}`,
            paddingBottom: 3,
            transition: `color 420ms ${EASE}`,
          }}
        >
          {n}
        </span>
      ))}
    </div>
  );
}

function SceneOverview() {
  return (
    <div style={{ position: "absolute", inset: 0, background: SHEET, color: ONLIGHT, display: "flex", flexDirection: "column" }}>
      <BoothNav active={0} />
      <div style={{ padding: "3.4% 5% 0" }}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "21 / 8", borderRadius: 12, overflow: "hidden", background: "#ddd" }}>
          <img className="mx-drift" src={IMG.aerial.src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </div>
      <div style={{ padding: "3% 5% 0", flex: 1 }}>
        <img src={IMG.avatar} alt="" width={40} height={40} loading="lazy" style={{ width: "6.5%", minWidth: 26, aspectRatio: "1", borderRadius: 6, objectFit: "cover" }} />
        <h4 style={{ fontSize: "clamp(20px, 6.4cqw, 62px)", fontWeight: 700, letterSpacing: "-0.042em", lineHeight: 1, marginTop: "2.4%" }}>{CO.name}</h4>
        <p style={{ fontSize: "clamp(8px, 1.6cqw, 17px)", color: DIMLIGHT, marginTop: "1.4%" }}>{CO.slogan}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1.4%", marginTop: "2.8%" }}>
          {CO.listings.map(([ex, sym]) => (
            <span key={ex} style={{ border: "1px solid rgba(18,22,29,0.14)", borderRadius: 999, padding: "0.7% 1.8%", fontSize: "clamp(6.5px, 1.15cqw, 12px)", fontWeight: 600, color: "#41474f" }}>
              {ex}: {sym}
            </span>
          ))}
          <span style={{ border: "1px solid rgba(18,22,29,0.14)", borderRadius: 999, padding: "0.7% 1.8%", fontSize: "clamp(6.5px, 1.15cqw, 12px)", fontWeight: 600, color: "#41474f", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: EM }} />
            {CO.status.headline}
          </span>
        </div>
      </div>
      <div style={{ position: "absolute", right: "3.4%", bottom: "4%" }}>
        <QrCode value="https://mineex.app/app?c=kingsmen-resources&utm_campaign=booth" size={46} quiet={false} />
      </div>
      <div style={{ position: "absolute", left: "50%", bottom: "3.4%", transform: "translateX(-50%)", textAlign: "center" }}>
        <p style={{ fontSize: "clamp(5.5px, 0.85cqw, 9px)", fontWeight: 700, letterSpacing: "0.3em", color: "#9aa1ab" }}>SWIPE</p>
      </div>
    </div>
  );
}

function SceneCapital() {
  return (
    <div style={{ position: "absolute", inset: 0, background: INKBG, color: "#fff", display: "flex", flexDirection: "column" }}>
      <BoothNav active={2} tone="dark" />
      <div style={{ padding: "6% 6% 0", flex: 1 }}>
        <p className="mx-label" style={{ fontSize: "clamp(6px, 0.95cqw, 11px)", color: EM, letterSpacing: "0.22em" }}>CAPITAL</p>
        <h4 style={{ fontSize: "clamp(18px, 5.2cqw, 52px)", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.02, marginTop: "2.4%", maxWidth: "14ch" }}>
          {CO.capital.headline}
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "3%", marginTop: "6%" }}>
          {CO.capital.rows.map(([k, v]) => (
            <div key={k} style={{ borderTop: "1px solid rgba(255,255,255,0.16)", paddingTop: "6%" }}>
              <p className="mx-num" style={{ fontSize: "clamp(11px, 2.5cqw, 26px)", fontWeight: 700, letterSpacing: "-0.03em" }}>{v}</p>
              <p style={{ fontSize: "clamp(6px, 1cqw, 11px)", color: "#8b97a6", marginTop: "6%" }}>{k}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SceneFollow({ phone }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(120% 70% at 82% -8%, ${EM}26, transparent), ${INKBG}`,
        color: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <BoothNav active={4} tone="dark" />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "5%", padding: "0 6% 4%" }}>
        <div>
          <p className="mx-label" style={{ fontSize: "clamp(6px, 0.95cqw, 11px)", color: EM, letterSpacing: "0.22em" }}>CONTINUE ON MINEEX</p>
          <h4 style={{ fontSize: "clamp(16px, 4.4cqw, 46px)", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.02, marginTop: "3%", maxWidth: "13ch" }}>
            Take the whole story with you.
          </h4>
          <p style={{ fontSize: "clamp(7px, 1.25cqw, 14px)", color: "#c2ccd8", marginTop: "3.5%", maxWidth: "36ch", lineHeight: 1.5 }}>
            Scan to open the live profile — and follow to get every update after the conference ends.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "4%", marginTop: "6%" }}>
            <QrCode value="https://mineex.app/app?c=kingsmen-resources&utm_campaign=booth" size={72} />
            <span className="mx-label" style={{ fontSize: "clamp(6px, 0.9cqw, 11px)", color: "#fff", letterSpacing: "0.14em" }}>SCAN TO FOLLOW</span>
          </div>
        </div>
        {phone}
      </div>
    </div>
  );
}

const SCENES = [SceneOverview, SceneCapital, SceneFollow];

// `scene` selects which booth state is on screen; each cross-fades like the real
// deck rather than sliding, so scroll can drive it without fighting the gesture
// state machine the product uses.
function BoothDeckBase({ scene = 0, phone = null }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        containerType: "inline-size",
        textAlign: "left",
        fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {SCENES.map((S, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            opacity: i === scene ? 1 : 0,
            transition: `opacity 620ms ${EASE}`,
            pointerEvents: i === scene ? "auto" : "none",
          }}
        >
          <S phone={phone} />
        </div>
      ))}
    </div>
  );
}

export const BoothDeck = React.memo(BoothDeckBase);
