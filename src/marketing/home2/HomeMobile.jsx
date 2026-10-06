// ─────────────────────────────────────────────────────────────────────────────
// HomeMobile — the home page composed for a phone.
//
// The desktop home is a pinned, wheel-driven deck: chapters slide as sheets and a
// single device render is re-pointed at each beat. On a phone that choreography has
// no input to drive it, so it degraded into the desktop stage made taller — the
// product render landed in a cell sized for a two-column layout (105px wide, and in
// mid-transition states it rendered two screens at once), and desktop whitespace
// ratios left 400px dead bands between beats.
//
// This is the same story — the same approved copy, the same product screens, the
// same order — composed vertically: eyebrow, headline, body, then a product visual
// large enough to actually read. The desktop deck is untouched; Home2 picks between
// them by viewport.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import Nav from "./Nav.jsx";
import Footer from "./Footer.jsx";
import { MarketingStyles } from "../system.jsx";
import { M_GUTTER, M_TYPE, M_LEAD, M_TRACK, M_RHYTHM, M_TAP } from "../mobile.js";

const NAVY = "#0a1b2e";
const INK = "#0a0c0f";
const SLATE = "#565f6e";
const MUTE = "#9aa1ad";
const COBALT = "#2563EB";
const BG = "#fbfcfe";

// The app walkthrough, verbatim from AppSection.BEATS, paired with the matching
// product screen already shipped for the Pro page.
const APP_BEATS = [
  { n: "01", page: "PROFILE",    head: "Your company, built for investors.",             body: "Give investors one living profile for the essential facts — what you own, where you operate, what stage you’re at and what you’re focused on now.", shot: "overview" },
  { n: "02", page: "PROJECTS",   head: "Let investors explore what you’re building.",    body: "Bring each project into one clear experience — location, stage, imagery and the information investors need to understand the opportunity.", shot: "projects" },
  { n: "03", page: "PROGRESS",   head: "Show how the story is moving forward.",          body: "Turn drilling, results and company milestones into a clear timeline so investors can immediately see how the story is developing.", shot: "timeline" },
  { n: "04", page: "CAPITAL",    head: "Put the financial picture in context.",          body: "Show investors your capital structure and funding position alongside the projects and exploration programs that capital is being used to advance.", shot: "capital" },
  { n: "05", page: "LEADERSHIP", head: "Put the people behind the company.",             body: "Introduce the management and leadership responsible for advancing the projects and executing the company’s strategy.", shot: "team" },
  { n: "06", page: "UPDATES",    head: "Keep investors connected to what happens next.", body: "Bring company news, press releases and media into the same profile so the relationship continues after the first visit.", shot: "media" },
];

// The Conference chapter, verbatim from ConferenceScene.
const CONF_BEATS = [
  { n: "01", page: "PROJECTS", head: "Give investors the big picture.",                    body: "Present your flagship projects, key assets and investment story in a format designed to be explored in person." },
  { n: "02", page: "EXPLORE",  head: "Let investors explore for themselves.",              body: "Bring projects, targets and locations to life through interactive maps built for deeper conversations at the booth." },
  { n: "03", page: "RESULTS",  head: "Turn technical results into something visual.",      body: "Show drill results, intercepts and supporting project data in a format investors can understand at a glance." },
  { n: "04", page: "CONNECT",  head: "Turn every conversation into a lasting connection.", body: "Investors scan to continue exploring your company on MineEx, follow your profile and stay connected after the conference ends." },
];

const pad = { paddingLeft: M_GUTTER, paddingRight: M_GUTTER };

function Eyebrow({ n, page }) {
  return (
    <p style={{ margin: 0, fontSize: M_TYPE.eyebrow, fontWeight: 800, letterSpacing: M_TRACK.eyebrow, textTransform: "uppercase", color: MUTE }}>
      <span style={{ color: COBALT }}>{n}</span>&nbsp;&nbsp;{page}
    </p>
  );
}

function Head({ children, long }) {
  return (
    <h2 style={{ margin: `${M_RHYTHM.eyebrowGap}px 0 0`, fontSize: long ? M_TYPE.h2Long : M_TYPE.h2,
      lineHeight: M_LEAD.h2, letterSpacing: M_TRACK.h2, fontWeight: 700, color: NAVY }}>{children}</h2>
  );
}

function Body({ children }) {
  return (
    <p style={{ margin: `${M_RHYTHM.headGap}px 0 0`, fontSize: M_TYPE.body, lineHeight: M_LEAD.body, color: SLATE }}>{children}</p>
  );
}

// A product screen at a size you can actually read: full content width, in a frame
// that reads as a device without pretending to be a photoreal one.
function Shot({ name, alt }) {
  return (
    <div style={{ marginTop: M_RHYTHM.mediaGap, borderRadius: 20, overflow: "hidden",
      border: "1px solid rgba(10,27,46,0.08)", background: "#fff",
      boxShadow: "0 24px 60px -32px rgba(10,27,46,0.38)" }}>
      <img src={`/marketing/appshots/${name}.webp`} alt={alt} loading="lazy" decoding="async"
        style={{ display: "block", width: "100%", height: "auto" }} />
    </div>
  );
}

function Cta({ href, children, primary }) {
  return (
    <a href={href} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minHeight: M_TAP, padding: "0 26px", borderRadius: 999, textDecoration: "none",
      fontSize: M_TYPE.cta, fontWeight: 700, letterSpacing: "-0.015em",
      background: primary ? COBALT : "transparent", color: primary ? "#fff" : NAVY,
      border: `1px solid ${primary ? COBALT : "rgba(10,27,46,0.18)"}`,
    }}>{children}</a>
  );
}

export default function HomeMobile() {
  return (
    <div className="mx-root" id="top" style={{ background: BG, minHeight: "100svh", color: NAVY }}>
      <MarketingStyles />
      <Nav />
      <main style={{ fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

        {/* HERO — the gradient frames the headline instead of floating beside it. */}
        <section style={{ ...pad, position: "relative", paddingTop: 96, paddingBottom: "clamp(44px,11vw,64px)", overflow: "hidden" }}>
          <div aria-hidden style={{ position: "absolute", top: -90, right: -140, width: 420, height: 420, borderRadius: "50%",
            background: "radial-gradient(circle at 50% 50%, rgba(37,99,235,0.26), rgba(132,204,22,0.16) 46%, rgba(255,255,255,0) 70%)",
            filter: "blur(14px)", pointerEvents: "none" }} />
          <h1 style={{ position: "relative", margin: 0, fontSize: M_TYPE.h1, lineHeight: M_LEAD.h1,
            letterSpacing: M_TRACK.h1, fontWeight: 700, color: NAVY }}>
            The investor platform built for <span style={{ color: COBALT }}>mining.</span>
          </h1>
          <p style={{ position: "relative", margin: "18px 0 0", fontSize: M_TYPE.body, lineHeight: M_LEAD.body, color: SLATE }}>
            Present your story. Engage investors. Build lasting connections.
          </p>
          <div style={{ position: "relative", marginTop: M_RHYTHM.ctaGap, display: "flex", flexDirection: "column", gap: 11 }}>
            <Cta href="/contact?plan=general" primary>Get Started</Cta>
            <Cta href="/pricing">See pricing</Cta>
          </div>
        </section>

        {/* THE APP */}
        <section style={{ ...pad, paddingTop: M_RHYTHM.sectionY }}>
          <p style={{ margin: 0, fontSize: M_TYPE.eyebrow, fontWeight: 800, letterSpacing: M_TRACK.eyebrow, textTransform: "uppercase", color: COBALT }}>The MineEx App</p>
          <h2 style={{ margin: "10px 0 0", fontSize: M_TYPE.h2, lineHeight: M_LEAD.h2, letterSpacing: M_TRACK.h2, fontWeight: 700, color: NAVY }}>
            One profile investors actually read.
          </h2>
        </section>
        {APP_BEATS.map((b) => (
          <section key={b.n} style={{ ...pad, paddingTop: M_RHYTHM.sectionY }}>
            <Eyebrow n={b.n} page={b.page} />
            <Head long={b.head.length > 38}>{b.head}</Head>
            <Body>{b.body}</Body>
            <Shot name={b.shot} alt={`MineEx ${b.page.toLowerCase()} screen`} />
          </section>
        ))}
        <section style={{ ...pad, paddingTop: "clamp(28px,7vw,38px)" }}>
          <Cta href="/pro">See the full Pro Profile →</Cta>
        </section>

        {/* CONFERENCE MODE */}
        <section style={{ ...pad, paddingTop: "clamp(64px,16vw,92px)" }}>
          <p style={{ margin: 0, fontSize: M_TYPE.eyebrow, fontWeight: 800, letterSpacing: M_TRACK.eyebrow, textTransform: "uppercase", color: COBALT }}>Conference Mode</p>
          <h2 style={{ margin: "10px 0 0", fontSize: M_TYPE.h2Long, lineHeight: M_LEAD.h2, letterSpacing: M_TRACK.h2, fontWeight: 700, color: NAVY }}>
            Radically upgrade your conference experience.
          </h2>
          <Body>Turn your company story into an interactive experience built for the booth.</Body>
          {/* The tablet reads at full content width rather than dominating the screen. */}
          <div style={{ marginTop: M_RHYTHM.mediaGap }}>
            <img src="/marketing/conference-ipad-front-v4.webp?v=2" alt="MineEx Conference Mode on an iPad"
              loading="lazy" decoding="async" style={{ display: "block", width: "100%", height: "auto" }} />
          </div>
        </section>
        {CONF_BEATS.map((b) => (
          <section key={b.n} style={{ ...pad, paddingTop: M_RHYTHM.sectionY }}>
            <Eyebrow n={b.n} page={b.page} />
            <Head long={b.head.length > 38}>{b.head}</Head>
            <Body>{b.body}</Body>
          </section>
        ))}
        <section style={{ ...pad, paddingTop: "clamp(28px,7vw,38px)", display: "flex", flexDirection: "column", gap: 11 }}>
          <Cta href="/conference-mode" primary>Explore Conference Mode</Cta>
          <Cta href="/contact?plan=standard">Request Conference Mode</Cta>
        </section>

        {/* CLOSE */}
        <section style={{ ...pad, paddingTop: "clamp(64px,16vw,92px)", paddingBottom: "clamp(16px,4vw,24px)" }}>
          <h2 style={{ margin: 0, fontSize: M_TYPE.h2, lineHeight: M_LEAD.h2, letterSpacing: M_TRACK.h2, fontWeight: 700, color: NAVY }}>
            Build your investor presence.
          </h2>
          <Body>Tell us about your company and we’ll point you to the right plan — usually the same day.</Body>
          <div style={{ marginTop: M_RHYTHM.ctaGap, display: "flex", flexDirection: "column", gap: 11 }}>
            <Cta href="/contact?plan=general" primary>Get Started</Cta>
            <Cta href="/pricing">See pricing</Cta>
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
}
