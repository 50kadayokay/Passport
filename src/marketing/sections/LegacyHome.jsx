// ─────────────────────────────────────────────────────────────────────────────
// LegacyHome — the original long-form MineEx homepage (Hero → Discovery → Content →
// Company → Conference → Close), plus its Nav/Footer and the localhost-only single-
// section preview (DEV.only). Extracted into its OWN lazy chunk so all of these
// sections load ONLY when the default /site homepage is opened — never on the new
// primary homepage (/home).
//
// This is PRESERVED, not deleted: it remains the default /site homepage until the new
// home2 homepage replaces it as primary. Nothing here is modified from its prior
// behaviour; it was simply moved out of MarketingSite.jsx so MarketingSite can be a
// thin route loader.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { MX, EASE, MarketingStyles, Wrap, useViewport, DEV } from "../system.jsx";
import { Hero } from "./Opening.jsx";
import { Discovered, FollowMoment, StayInformed } from "./Discovery.jsx";
import { PressReleases, Media } from "./Content.jsx";
import { Dashboard, Analytics } from "./Company.jsx";
import { ConferenceMode, BoothToAudience } from "./Conference.jsx";
import { Journey, Offerings, FinalCta } from "./Close.jsx";

const LINKS = [
  ["Profile", "#profile"],
  ["Discovery", "#discovery"],
  ["Company", "#company"],
  ["Conference", "#conference"],
  ["Plans", "#plans"],
];

function Nav() {
  const [solid, setSolid] = useState(false);
  const { mobile } = useViewport();

  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSolid(window.scrollY > 80));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      window.removeEventListener("scroll", on);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        background: solid ? "rgba(255,255,255,0.94)" : "transparent",
        borderBottom: `1px solid ${solid ? MX.hair : "transparent"}`,
        transition: `background 380ms ${EASE}, border-color 380ms ${EASE}`,
      }}
    >
      <Wrap style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 62 }}>
        <a href="#top" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.035em" }}>MineEx</span>
        </a>
        {!mobile && (
          <nav style={{ display: "flex", gap: 26 }}>
            {LINKS.map(([label, href]) => (
              <a key={href} href={href} className="mx-navlink" style={{ fontSize: 14, fontWeight: 600, color: MX.dim, textDecoration: "none" }}>
                {label}
              </a>
            ))}
          </nav>
        )}
        <a
          href="#demo"
          style={{
            display: "inline-flex", alignItems: "center", height: 38, padding: "0 17px", borderRadius: 999,
            background: MX.text, color: "#fff", fontSize: 13.5, fontWeight: 700, textDecoration: "none",
          }}
        >
          Claim Your Company
        </a>
      </Wrap>
    </header>
  );
}

function Footer() {
  const { mobile } = useViewport();
  return (
    <footer style={{ background: MX.ink, color: MX.onDark, borderTop: `1px solid ${MX.hairDark}`, padding: "44px 0 54px" }}>
      <Wrap
        style={{
          display: "flex",
          flexDirection: mobile ? "column" : "row",
          alignItems: mobile ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/marketing/mineex-core.webp" alt="" width={13} height={38} style={{ width: 13, height: 38 }} />
          <div>
            <p style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.03em" }}>MineEx</p>
            <p style={{ fontSize: 12.5, color: MX.onDarkMute, marginTop: 2 }}>The investor platform built for junior mining.</p>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          {[["Privacy", "/privacy.html"], ["Terms", "/terms.html"], ["Support", "/support.html"], ["Book a demo", "#demo"]].map(([l, h]) => (
            <a key={h} href={h} style={{ fontSize: 13.5, fontWeight: 600, color: MX.onDarkDim, textDecoration: "none" }}>{l}</a>
          ))}
        </div>
      </Wrap>
      <Wrap style={{ marginTop: 26 }}>
        <p style={{ fontSize: 12, color: MX.onDarkMute }}>
          © {new Date().getFullYear()} MineEx. Company information shown on this page is drawn from published MineEx profiles; dashboard
          figures are demonstration data.
        </p>
      </Wrap>
    </footer>
  );
}

export default function LegacyHome() {
  // Localhost-only single-section preview (see DEV in system.jsx).
  if (DEV.only) {
    const ONE = {
      hero: Hero, profile: Hero, discovered: Discovered,
      follow: FollowMoment, informed: StayInformed, releases: PressReleases, media: Media,
      dashboard: Dashboard, analytics: Analytics, conference: ConferenceMode,
      booth: BoothToAudience, journey: Journey, offerings: Offerings, cta: FinalCta,
    }[DEV.only];
    if (ONE)
      return (
        <div className="mx-root" id="top">
          <MarketingStyles />
          <ONE />
        </div>
      );
  }

  return (
    <div className="mx-root" id="top">
      <MarketingStyles />
      <Nav />
      <main>
        <span id="profile" style={{ display: "block", scrollMarginTop: 0 }} />
        <Hero />
        <span id="discovery" style={{ display: "block" }} />
        <Discovered />
        <FollowMoment />
        <StayInformed />
        <PressReleases />
        <Media />
        <span id="company" style={{ display: "block" }} />
        <Dashboard />
        <Analytics />
        <span id="conference" style={{ display: "block" }} />
        <ConferenceMode />
        <BoothToAudience />
        <Journey />
        <Offerings />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
