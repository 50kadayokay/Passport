// ─────────────────────────────────────────────────────────────────────────────
// The MineEx public marketing site.
//
// Mounted only at /site (see src/main.jsx) and lazily loaded, so nothing here is
// in the application's bundle and nothing here can touch application state. It
// imports exactly one thing from the app — the Supabase URL/anon key, to file a
// demo request into the existing `demo_bookings` table.
//
// The public brand is MineEx throughout. The internal codename never appears on
// this surface.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { MX, EASE, MarketingStyles, Wrap, useViewport, useReduce, DEV } from "./system.jsx";
import { Hero } from "./sections/Opening.jsx";
import { Discovered, FollowMoment, StayInformed } from "./sections/Discovery.jsx";
import { PressReleases, Media } from "./sections/Content.jsx";
import { Dashboard, Analytics } from "./sections/Company.jsx";
import { ConferenceMode, BoothToAudience } from "./sections/Conference.jsx";
import { Journey, Offerings, FinalCta } from "./sections/Close.jsx";

const TITLE = "MineEx — The investor platform built for junior mining";
const DESCRIPTION =
  "MineEx connects junior mining companies with investors: one profile investors can discover, understand and follow — plus updates, media, analytics and an interactive conference booth.";

function useDocumentMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;

    const set = (attr, key, content) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      const created = !el;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      const prev = el.getAttribute("content");
      el.setAttribute("content", content);
      return () => {
        if (created) el.remove();
        else if (prev != null) el.setAttribute("content", prev);
      };
    };

    const undo = [
      set("name", "description", DESCRIPTION),
      set("property", "og:title", TITLE),
      set("property", "og:description", DESCRIPTION),
      set("property", "og:type", "website"),
      set("name", "twitter:card", "summary_large_image"),
    ];

    return () => {
      document.title = prevTitle;
      undo.forEach((fn) => fn());
    };
  }, []);
}

/* ── navigation ──────────────────────────────────────────────────────────── */

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
        // Deliberately NOT a backdrop-filter: blurring a full-width strip on every
        // scroll frame is one of the most expensive things a fixed header can do.
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

/* ── footer ──────────────────────────────────────────────────────────────── */

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

/* ── page ────────────────────────────────────────────────────────────────── */

export default function MarketingSite() {
  useDocumentMeta();
  const reduce = useReduce();

  useEffect(() => {
    if (reduce) return;
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = prev;
    };
  }, [reduce]);

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
