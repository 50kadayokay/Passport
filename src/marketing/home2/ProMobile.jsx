// ─────────────────────────────────────────────────────────────────────────────
// ProMobile — the Pro tab's MOBILE composition.
//
// The desktop Pro page is a pinned, wheel-driven walkthrough (ProProfileChapter). That
// choreography has no meaning on a phone: it rendered as a full-bleed device image that
// painted over the nav, with almost no readable copy. This is a deliberate mobile
// composition of the SAME product story — the approved narration beats from the
// walkthrough, in order, each with the matching app screen — as an ordinary scrolling
// page. The desktop experience is untouched; ProPage picks between them by viewport.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";

import Footer from "./Footer.jsx";
const INK = "#f7f9fc";
const DIM = "rgba(247,249,252,0.64)";
const FAINT = "rgba(247,249,252,0.40)";
const COBALT = "#2563EB";
const GUT = "22px";

// The approved walkthrough beats, verbatim, paired with the app screen each one describes.
const BEATS = [
  { eyebrow: "PROFILE",    head: "Your company, built for investors.",
    body: "Give investors one living profile for the essential facts — what you own, where you operate, what stage you're at and what you're focused on now.",
    shot: "overview" },
  { eyebrow: "AI BRIEF",   head: "Understand the company in under a minute.",
    body: "MineEx turns your company information into a plain-English orientation — what you do, how you create value and why it matters.",
    shot: "release" },
  { eyebrow: "YOUR PROJECTS", head: "Give every asset its own investor-ready profile.",
    body: "Each project brings together real imagery, stage, location, geology and the information investors need to understand the asset.",
    shot: "projects" },
  { eyebrow: "PROGRESS",   head: "Turn years of disclosure into a story investors can follow.",
    body: "Organize milestones chronologically, then explain what happened, why it mattered and how each event moved the company forward.",
    shot: "timeline" },
  { eyebrow: "CAPITAL",    head: "Make your capital position immediately understandable.",
    body: "Show funding runway, listings and key capital metrics up front — with the underlying share structure and dilution available when investors want to go deeper.",
    shot: "capital" },
  { eyebrow: "LEADERSHIP", head: "Put the people behind the company front and centre.",
    body: "Give investors a clear view of the management team and board behind the assets and strategy.",
    shot: "team" },
  { eyebrow: "MEDIA",      head: "Keep your investor content in one place.",
    body: "Publish project photos, videos and interviews directly to your profile so investors can keep exploring your story.",
    shot: "media" },
  { eyebrow: "FOLLOW",     head: "Turn investor interest into a lasting connection.",
    body: "Investors don't just understand your company and leave. They can follow your company and stay connected as your story develops.",
    shot: "feed" },
];

function Cta({ href, children, primary }) {
  return (
    <a href={href} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9,
      height: 52, padding: "0 26px", borderRadius: 999, textDecoration: "none",
      fontSize: 16, fontWeight: 700, letterSpacing: "-0.015em",
      background: primary ? COBALT : "transparent", color: primary ? "#fff" : INK,
      border: `1px solid ${primary ? COBALT : "rgba(247,249,252,0.22)"}`,
    }}>{children}</a>
  );
}

function Beat({ eyebrow, head, body, shot }) {
  return (
    <section style={{ padding: `56px ${GUT} 0` }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", color: COBALT }}>{eyebrow}</p>
      <h2 style={{ margin: "12px 0 0", fontSize: 27, lineHeight: 1.12, fontWeight: 700, letterSpacing: "-0.03em", color: INK }}>{head}</h2>
      <p style={{ margin: "12px 0 0", fontSize: 15.5, lineHeight: 1.55, color: DIM }}>{body}</p>
      <div style={{ marginTop: 24, borderRadius: 18, overflow: "hidden", border: "1px solid rgba(247,249,252,0.12)", background: "#0e1117" }}>
        <img src={`/marketing/appshots/${shot}.webp`} alt="" loading="lazy" decoding="async"
          style={{ display: "block", width: "100%", height: "auto" }} />
      </div>
    </section>
  );
}

export default function ProMobile() {
  return (
    <main>
      {/* Clears the fixed 64px nav so the eyebrow never sits behind the wordmark. */}
      <section style={{ padding: `96px ${GUT} 0` }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", color: COBALT }}>MINEEX PRO</p>
        <h1 style={{ margin: "14px 0 0", fontSize: 38, lineHeight: 1.04, fontWeight: 700, letterSpacing: "-0.04em", color: INK }}>
          Your complete investor presence.
        </h1>
        <p style={{ margin: "16px 0 0", fontSize: 16.5, lineHeight: 1.5, color: DIM }}>
          A premium, interactive profile that explains your company the way investors actually read one —
          projects, capital, progress, leadership and media in one place, with an audience that can follow you.
        </p>
        <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
          <Cta href="/contact?plan=pro" primary>Get Started</Cta>
          <Cta href="/pricing">See pricing</Cta>
        </div>
      </section>

      {BEATS.map((b) => <Beat key={b.eyebrow} {...b} />)}

      <section style={{ padding: `60px ${GUT} 64px` }}>
        <h2 style={{ margin: 0, fontSize: 29, lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.035em", color: INK }}>
          Ready to build your investor presence?
        </h2>
        <p style={{ margin: "12px 0 0", fontSize: 15.5, lineHeight: 1.55, color: DIM }}>
          Tell us about your company and we'll come back with the right plan — usually the same day.
        </p>
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <Cta href="/contact?plan=pro" primary>Get Started</Cta>
          <Cta href="/conference-mode">Explore Conference Mode</Cta>
        </div>
      </section>

      <Footer />
    </main>
  );
}
