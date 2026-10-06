// ─────────────────────────────────────────────────────────────────────────────
// GetApp — the "Get the App" destination (/get-the-app).
//
// A focused download page: the MineEx app pitch + the App Store and Google Play
// badges. Linked from every "Get the App" control (Nav + the Investor page close).
// Store URLs live in the two constants below — swap in the exact listing URLs when
// final (App Store numeric id; Android bundle id already set).
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { EASE, MarketingStyles, useReduce } from "../system.jsx";
import Nav from "./Nav.jsx";

import Footer from "./Footer.jsx";
const BG = "#fbfcfe";
const NAVY = "#0a1b2e";
const SLATE = "#565f6e";
const COBALT = "#2563EB";
const MUTE = "#9aa1ad";
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")";

// The live App Store listing. The previous value omitted the numeric app id, which is the
// part the store actually resolves — without it the link is not guaranteed to land on the
// listing. NOTE: "/gb/" pins this to the UK storefront; dropping the country segment
// (apps.apple.com/app/id6804108589) lets Apple route each visitor to their own store.
const APP_STORE_URL = "https://apps.apple.com/gb/app/mineex-mining-news/id6804108589";
// The Android build is not on the Play Store yet, so the badge leads to an honest
// interstitial rather than a listing that 404s. Swap ANDROID_SOON for PLAY_STORE_URL in
// the badge below on the day it publishes.
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.liquidjungle.mineex";
const ANDROID_SOON = "/android";

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden style={{ flexShrink: 0 }}>
      <path fill="#fff" d="M16.365 1.43c0 1.14-.42 2.2-1.12 3-.76.86-2 1.52-3.02 1.44-.13-1.12.42-2.28 1.1-3 .76-.8 2.08-1.4 3.04-1.44zM20.9 17.1c-.56 1.28-.83 1.85-1.55 2.98-1 1.57-2.42 3.53-4.18 3.54-1.56.02-1.96-1.02-4.08-1.01-2.12.01-2.56 1.03-4.12 1.01-1.76-.02-3.1-1.78-4.1-3.35-2.8-4.4-3.1-9.56-1.37-12.3 1.23-1.95 3.17-3.1 5-3.1 1.86 0 3.03 1.02 4.57 1.02 1.49 0 2.4-1.02 4.56-1.02 1.63 0 3.36.89 4.59 2.42-4.03 2.21-3.38 7.96.68 9.82z" />
    </svg>
  );
}
function PlayLogo() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M3.6 2.4 14 12 3.6 21.6a1.3 1.3 0 0 1-.6-1.1V3.5c0-.5.2-.9.6-1.1z" fill="#00D2FF" />
      <path d="M17.8 8.9 14 12 3.6 2.4c.33-.2.78-.22 1.2 0l12 6.3c.3.17.5.4.6.65z" fill="#00E676" />
      <path d="M17.8 15.1 5.8 21.6c-.42.22-.87.2-1.2 0L14 12l3.8 3.1z" fill="#FFBC00" />
      <path d="M21.4 11.2c.5.4.5 1.2 0 1.6l-3.6 2.3L14 12l3.8-3.1z" fill="#FF3A44" />
    </svg>
  );
}

function StoreBadge({ href, logo, top, bottom, sameTab }) {
  return (
    <a href={href} {...(sameTab ? {} : { target: "_blank", rel: "noopener noreferrer" })} className="ga-badge"
      style={{ display: "inline-flex", alignItems: "center", gap: 12, height: 60, padding: "0 22px", borderRadius: 14, background: "#0a0c0f", color: "#fff", textDecoration: "none", border: "1px solid rgba(255,255,255,0.1)" }}>
      {logo}
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.05, textAlign: "left" }}>
        <span style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: "0.02em", opacity: 0.85 }}>{top}</span>
        <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>{bottom}</span>
      </span>
    </a>
  );
}

export default function GetApp() {
  const reduce = useReduce();
  return (
    <div className="mx-root" id="top" style={{ background: BG, minHeight: "100vh", color: NAVY }}>
      <MarketingStyles />
      <Nav />
      <main style={{ position: "relative", minHeight: "100vh", fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", overflow: "hidden" }}>
        {/* atmosphere */}
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: "-10%", top: "-20%", width: "70%", height: "90%", background: "radial-gradient(42% 42% at 50% 50%, rgba(37,99,235,.28), transparent 72%)" }} />
          <div style={{ position: "absolute", right: "-6%", bottom: "-18%", width: "60%", height: "80%", background: "radial-gradient(42% 42% at 50% 50%, rgba(198,240,74,.30), transparent 72%)" }} />
          <div style={{ position: "absolute", inset: 0, opacity: 0.5, mixBlendMode: "multiply", backgroundImage: GRAIN }} />
        </div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 820, margin: "0 auto", minHeight: "100vh", padding: "120px clamp(22px,5vw,64px) 80px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <div className={reduce ? "" : "ga-rise"}>
            {/* The app icon leads the page, centred above all of the text. */}
            <img src="/apple-touch-icon.png" alt="MineEx app icon" width={84} height={84}
              style={{ width: "clamp(68px,7vw,88px)", height: "clamp(68px,7vw,88px)", borderRadius: "23%",
                display: "block", margin: "0 auto clamp(20px,3vh,30px)",
                boxShadow: "0 22px 48px -22px rgba(10,27,46,0.55), 0 2px 6px -2px rgba(10,27,46,0.18)" }} />
            <p className="mx-label" style={{ color: COBALT, letterSpacing: "0.22em", margin: 0 }}>The MineEx app</p>
            <h1 className="mx-h1" style={{ margin: "clamp(14px,2.2vh,22px) 0 0", color: NAVY, maxWidth: "16ch", letterSpacing: "-0.03em" }}>Get MineEx on your phone.</h1>
            <p className="mx-lead" style={{ margin: "clamp(12px,1.8vh,20px) auto 0", color: SLATE, maxWidth: "46ch" }}>Discover the market, research companies and follow the ones that matter — free, in your pocket.</p>

            <div style={{ marginTop: "clamp(28px,4vh,44px)", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16 }}>
              <StoreBadge href={APP_STORE_URL} logo={<AppleLogo />} top="Download on the" bottom="App Store" />
              <StoreBadge href={ANDROID_SOON} logo={<PlayLogo />} top="GET IT ON" bottom="Google Play" sameTab />
            </div>

            <p style={{ marginTop: 20, fontSize: 13.5, color: MUTE }}>Free for investors · on iPhone today, Android soon</p>
            <p style={{ marginTop: "clamp(26px,4vh,40px)" }}>
              <a href="/investor" className="ga-link" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: NAVY, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", textDecoration: "none" }}>See what you can do <span aria-hidden className="ga-arw">→</span></a>
            </p>
          </div>
        </div>
      </main>
      <Footer />
      <style>{`
        @keyframes gaRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .ga-rise { animation: gaRise 560ms ${EASE} both; }
        .ga-badge { transition: transform 160ms ${EASE}, box-shadow 160ms ${EASE}; box-shadow: 0 18px 40px -26px rgba(10,12,15,0.7); }
        .ga-badge:hover { transform: translateY(-2px); box-shadow: 0 24px 50px -24px rgba(10,12,15,0.75); }
        .ga-arw { transition: transform 200ms ${EASE}; }
        .ga-link:hover { color: ${COBALT}; } .ga-link:hover .ga-arw { transform: translateX(4px); }
      `}</style>
    </div>
  );
}
