// ─────────────────────────────────────────────────────────────────────────────
// AndroidSoon (/android) — where the Google Play badge leads until the Android
// build is actually published. An honest interstitial beats a Play Store link that 404s.
// When the listing goes live, point GetApp's badge back at PLAY_STORE_URL and this page
// can go with it. No email capture: there is no backend for a waitlist, and a form that
// quietly discards addresses would be worse than saying "check back".
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { EASE, MarketingStyles, useReduce } from "../system.jsx";
import Nav from "./Nav.jsx";
import { PRICE_TOKENS as T } from "./SalesPricing.jsx";

import Footer from "./Footer.jsx";
const APP_STORE_URL = "https://apps.apple.com/gb/app/mineex-mining-news/id6804108589";

function PlayLogo() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden style={{ flexShrink: 0 }}>
      <path fill="#fff" d="M3.6 1.8a1.4 1.4 0 0 0-.5 1.1v18.2c0 .45.18.86.5 1.1l10-10.2-10-10.2z" opacity=".9" />
      <path fill="#fff" d="M17.3 8.5 5.1 1.6l9.1 9.3 3.1-2.4zM5.1 22.4l12.2-6.9-3.1-2.4-9.1 9.3zM20.6 10.6l-2.6-1.5-3.3 2.9 3.3 2.9 2.6-1.5c.9-.5.9-2.3 0-2.8z" opacity=".6" />
    </svg>
  );
}

export default function AndroidSoon() {
  const reduce = useReduce();
  return (
    <div className="mx-root" id="top" style={{ background: T.BG, minHeight: "100vh", color: T.NAVY }}>
      <MarketingStyles />
      <Nav />
      <main style={{ position: "relative", minHeight: "100vh", overflow: "hidden",
        fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: "-10%", top: "-20%", width: "70%", height: "90%", background: "radial-gradient(42% 42% at 50% 50%, rgba(37,99,235,.16), transparent 72%)" }} />
          <div style={{ position: "absolute", right: "-6%", bottom: "-18%", width: "60%", height: "80%", background: "radial-gradient(42% 42% at 50% 50%, rgba(198,240,74,.18), transparent 72%)" }} />
        </div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 760, margin: "0 auto", minHeight: "100vh",
          padding: "120px clamp(22px,5vw,64px) 80px", display: "flex", flexDirection: "column",
          justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <div className={reduce ? "" : "ga-rise"}>
            <span style={{ display: "grid", placeItems: "center", width: 76, height: 76, borderRadius: "23%",
              margin: "0 auto 26px", background: "#0a0c0f", boxShadow: "0 22px 48px -22px rgba(10,27,46,0.5)" }}>
              <PlayLogo />
            </span>
            <p className="mx-label" style={{ color: T.COBALT, letterSpacing: "0.22em", margin: 0 }}>Android</p>
            <h1 className="mx-h1" style={{ margin: "clamp(14px,2.2vh,22px) 0 0", color: T.NAVY, maxWidth: "16ch", letterSpacing: "-0.03em" }}>
              Coming to the Play Store soon.
            </h1>
            <p className="mx-lead" style={{ margin: "clamp(12px,1.8vh,20px) auto 0", color: T.SLATE, maxWidth: "46ch" }}>
              MineEx is on iPhone today. The Android build is on the way — check back here, or get in touch and we'll let you know when it lands.
            </p>

            <div style={{ marginTop: "clamp(28px,4vh,42px)", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14 }}>
              <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="sp-cta"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 46, padding: "0 26px",
                  borderRadius: 999, background: T.NAVY, color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
                Get it on iPhone
              </a>
              <a href="/contact?plan=general" className="sp-cta"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 46, padding: "0 26px",
                  borderRadius: 999, background: "#fff", color: T.NAVY, border: "1px solid rgba(10,27,46,0.12)",
                  fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
                Tell me when it's ready
              </a>
            </div>

            <p style={{ marginTop: "clamp(24px,3.5vh,36px)" }}>
              <a href="/get-the-app" style={{ color: T.SLATE, fontSize: 14, textDecoration: "underline" }}>Back to the app page</a>
            </p>
          </div>
        </div>
      </main>
      <Footer />
      <style>{`
        @keyframes gaRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .ga-rise { animation: gaRise 560ms ${EASE} both; }
        .sp-cta { transition: transform 160ms ${EASE}, box-shadow 160ms ${EASE}; }
        .sp-cta:hover { transform: translateY(-1px); box-shadow: 0 16px 34px -18px rgba(10,27,46,0.45); }
      `}</style>
    </div>
  );
}
