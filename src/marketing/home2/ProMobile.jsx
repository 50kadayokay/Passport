// ─────────────────────────────────────────────────────────────────────────────
// ProMobile — the Pro tab's MOBILE composition.
//
// The desktop Pro page is a pinned, wheel-driven walkthrough (ProProfileChapter) over a
// near-black stage. That choreography has no meaning on a phone: it rendered as a
// full-bleed device painting over the nav, with almost no readable copy. This is a
// deliberate mobile composition of the SAME product story — the approved narration
// beats, in order, each with the matching app screen — as an ordinary scrolling page.
//
// It is built on mobileKit, the same pieces Home and Investor use, so the three phone
// pages share one ground, one type ramp and one button. This page used to be the odd
// one out: dark, with its own ramp, which made moving between them feel like leaving
// the site. The desktop walkthrough and its dark stage are untouched.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { Body, Cta, Ctas, Eyebrow, Head, HeroWash, MobilePage, Section, Shot, pad } from "../mobileKit.jsx";
import { M_RHYTHM, M_TYPE } from "../mobile.js";

// The approved walkthrough beats, verbatim, paired with the app screen each describes.
const BEATS = [
  { n: "01", eyebrow: "PROFILE",      head: "Your company, built for investors.",
    body: "Give investors one living profile for the essential facts — what you own, where you operate, what stage you're at and what you're focused on now.",
    shot: "overview" },
  { n: "02", eyebrow: "AI BRIEF",     head: "Understand the company in under a minute.",
    body: "MineEx turns your company information into a plain-English orientation — what you do, how you create value and why it matters.",
    shot: "release" },
  { n: "03", eyebrow: "YOUR PROJECTS", head: "Give every asset its own investor-ready profile.",
    body: "Each project brings together real imagery, stage, location, geology and the information investors need to understand the asset.",
    shot: "projects" },
  { n: "04", eyebrow: "PROGRESS",     head: "Turn years of disclosure into a story investors can follow.",
    body: "Organize milestones chronologically, then explain what happened, why it mattered and how each event moved the company forward.",
    shot: "timeline" },
  { n: "05", eyebrow: "CAPITAL",      head: "Make your capital position immediately understandable.",
    body: "Show funding runway, listings and key capital metrics up front — with the underlying share structure and dilution available when investors want to go deeper.",
    shot: "capital" },
  { n: "06", eyebrow: "LEADERSHIP",   head: "Put the people behind the company front and centre.",
    body: "Give investors a clear view of the management team and board behind the assets and strategy.",
    shot: "team" },
  { n: "07", eyebrow: "MEDIA",        head: "Keep your investor content in one place.",
    body: "Publish project photos, videos and interviews directly to your profile so investors can keep exploring your story.",
    shot: "media" },
  { n: "08", eyebrow: "FOLLOW",       head: "Turn investor interest into a lasting connection.",
    body: "Investors don't just understand your company and leave. They can follow your company and stay connected as your story develops.",
    shot: "feed" },
];

export default function ProMobile() {
  return (
    <MobilePage>
      {/* HERO — clears the 54px phone nav, with the same wash Home and Investor use. */}
      <Section top={96} bottom="clamp(8px,2vw,14px)" style={{ position: "relative", overflow: "hidden" }}>
        <HeroWash />
        <Eyebrow accent>MineEx Pro</Eyebrow>
        <Head as="h1" hero>Your complete investor presence.</Head>
        <Body top={18}>
          A premium, interactive profile that explains your company the way investors actually read one —
          projects, capital, progress, leadership and media in one place, with an audience that can follow you.
        </Body>
        <Ctas>
          <Cta href="/contact?plan=pro" primary>Get Started</Cta>
          <Cta href="/pricing">See pricing</Cta>
        </Ctas>
      </Section>

      {BEATS.map((b) => (
        <Section key={b.n}>
          <Eyebrow n={b.n}>{b.eyebrow}</Eyebrow>
          <Head long={b.head.length > 38}>{b.head}</Head>
          <Body>{b.body}</Body>
          <Shot name={b.shot} alt={`MineEx ${b.eyebrow.toLowerCase()} screen`} />
        </Section>
      ))}

      <Section top="clamp(60px,15vw,88px)" bottom="clamp(16px,4vw,24px)">
        <Head>Ready to build your investor presence?</Head>
        <Body>Tell us about your company and we'll come back with the right plan — usually the same day.</Body>
        <Ctas>
          <Cta href="/contact?plan=pro" primary>Get Started</Cta>
          <Cta href="/conference-mode">Explore Conference Mode</Cta>
        </Ctas>
      </Section>
    </MobilePage>
  );
}
