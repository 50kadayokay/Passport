// ─────────────────────────────────────────────────────────────────────────────
// InvestorMobile — the Investor walkthrough composed for a phone.
//
// The desktop walkthrough is a paged deck: one beat per viewport, a persistent
// device, copy on the left. The previous mobile branch kept that shape — 19 cells of
// 100svh with a sticky phone and the copy floated over it in a glass card. The
// result was 16,000px of scrolling to read 320 characters, with only one sentence
// ever on screen.
//
// Here the same beats, in the same order, read as a document: the four chapters are
// headed, their beats stack, and the product screens appear at full content width
// where they illustrate something. STATES is imported from InvestorPage rather than
// re-typed, so the approved copy cannot drift between the two compositions.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { STATES } from "./InvestorPage.jsx";
import { Body, Cta, Ctas, Eyebrow, Head, HeroWash, M_COBALT as COBALT, M_INK as NAVY, M_MUTE as MUTE, M_SLATE as SLATE, MobilePage, Section, Shot, SubHead, pad } from "../mobileKit.jsx";
import { M_LEAD, M_RHYTHM, M_TRACK, M_TYPE } from "../mobile.js";

// The chapters the walkthrough is built from, and the product screens that show what
// each one is talking about. Advanced Search gets its own full-width screen because
// the filter sheet is the thing that has to be legible.
const CHAPTERS = [
  { n: "01", label: "Discover", lead: "The sector's news, in one feed.", shots: ["feed", "release"] },
  { n: "02", label: "Explore",  lead: "Find companies worth understanding.", shots: ["explore", "advanced"] },
  { n: "03", label: "Research", lead: "The whole company story, in one place.", shots: ["overview", "projects", "capital", "team"] },
  { n: "04", label: "Follow",   lead: "Keep hearing from the names you track.", shots: ["media"] },
];

export default function InvestorMobile() {
  return (
    <MobilePage>

        <section style={{ ...pad, position: "relative", paddingTop: 92, paddingBottom: "clamp(8px,2vw,14px)", overflow: "hidden" }}>
          <HeroWash />
          <p style={{ position: "relative", margin: 0, fontSize: M_TYPE.eyebrow, fontWeight: 800, letterSpacing: M_TRACK.eyebrow, textTransform: "uppercase", color: COBALT }}>For investors</p>
          <h1 style={{ position: "relative", margin: "12px 0 0", fontSize: M_TYPE.h1, lineHeight: M_LEAD.h1, letterSpacing: M_TRACK.h1, fontWeight: 700, color: NAVY }}>
            Discover, research and follow the junior mining market.
          </h1>
          <p style={{ position: "relative", margin: "18px 0 0", fontSize: M_TYPE.body, lineHeight: M_LEAD.body, color: SLATE }}>
            Follow an investor as they find a company, read its full story, decide it's worth tracking,
            and keep hearing from it — in the MineEx investor app.
          </p>
          <div style={{ position: "relative", marginTop: M_RHYTHM.ctaGap }}>
            <Cta href="/get-the-app" primary>Get the App</Cta>
          </div>
        </section>

        {CHAPTERS.map((ch) => {
          const beats = STATES.filter((s) => s.label === ch.label);
          return (
            <section key={ch.n} style={{ ...pad, paddingTop: M_RHYTHM.sectionY }}>
              <p style={{ margin: 0, fontSize: M_TYPE.eyebrow, fontWeight: 800, letterSpacing: M_TRACK.eyebrow, textTransform: "uppercase", color: MUTE }}>
                <span style={{ color: COBALT }}>{ch.n}</span>&nbsp;&nbsp;{ch.label}
              </p>
              <h2 style={{ margin: "11px 0 0", fontSize: M_TYPE.h2, lineHeight: M_LEAD.h2, letterSpacing: M_TRACK.h2, fontWeight: 700, color: NAVY }}>{ch.lead}</h2>
              {beats.map((b, i) => (
                <div key={b.k} style={{ marginTop: i === 0 ? "clamp(26px,6vw,34px)" : "clamp(30px,7vw,40px)" }}>
                  <h3 style={{ margin: 0, fontSize: M_TYPE.h3, lineHeight: 1.22, letterSpacing: "-0.025em", fontWeight: 700, color: NAVY }}>{b.head}</h3>
                  <p style={{ margin: "9px 0 0", fontSize: M_TYPE.body, lineHeight: M_LEAD.body, color: SLATE }}>{b.body}</p>
                  {ch.shots[i] && <Shot name={ch.shots[i]} alt={`MineEx ${ch.label.toLowerCase()} screen`} />}
                </div>
              ))}
            </section>
          );
        })}

        <section style={{ ...pad, paddingTop: "clamp(60px,15vw,88px)", paddingBottom: "clamp(16px,4vw,24px)" }}>
          <h2 style={{ margin: 0, fontSize: M_TYPE.h2, lineHeight: M_LEAD.h2, letterSpacing: M_TRACK.h2, fontWeight: 700, color: NAVY }}>
            One app for the junior mining market.
          </h2>
          <p style={{ margin: `${M_RHYTHM.headGap}px 0 0`, fontSize: M_TYPE.body, lineHeight: M_LEAD.body, color: SLATE }}>
            Discover the market, explore companies, research their operations and follow what happens next
            — together in one app, built for investors.
          </p>
          <div style={{ marginTop: M_RHYTHM.ctaGap, display: "flex", flexDirection: "column", gap: 11 }}>
            <Cta href="/get-the-app" primary>Get the App</Cta>
            <Cta href="/pro">For companies: MineEx Pro</Cta>
          </div>
          <p style={{ margin: "16px 0 0", fontSize: 13, color: MUTE }}>Free for investors.</p>
        </section>

    </MobilePage>
  );
}
