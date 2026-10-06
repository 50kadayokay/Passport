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
import { Body, Cta, Ctas, Eyebrow, Head, HeroWash, MobilePage, ProductChapter, Section } from "../mobileKit.jsx";
import { DiscoverDemo, MediaDemo, ProfileDemo } from "../mobile/demos.jsx";
import ProductDeck from "../mobile/ProductDeck.jsx";

// The approved walkthrough beats, verbatim, each paired with the live product surface
// it describes and a line explaining why that surface matters. Interaction only where
// the product has something real to offer: the profile's own tab bar everywhere, the
// project selector on Projects, and opening a story on Media.
const BEATS = [
  { n: "01", eyebrow: "PROFILE",      head: "Your company, built for investors.",
    body: "Give investors one living profile for the essential facts — what you own, where you operate, what stage you're at and what you're focused on now.",
    screen: "overview", detail: "Everything an investor asks first, answered before they have to ask." },
  { n: "02", eyebrow: "YOUR PROJECTS", head: "Give every asset its own investor-ready profile.",
    body: "Each project brings together real imagery, stage, location, geology and the information investors need to understand the asset.",
    screen: "projects", projects: true, detail: "Tap between projects — each one carries its own imagery, district and stage." },
  { n: "03", eyebrow: "PROGRESS",     head: "Turn years of disclosure into a story investors can follow.",
    body: "Organize milestones chronologically, then explain what happened, why it mattered and how each event moved the company forward.",
    screen: "timeline", detail: "Each milestone carries its impact and category, so the arc is readable at a glance." },
  { n: "04", eyebrow: "CAPITAL",      head: "Make your capital position immediately understandable.",
    body: "Show funding runway, listings and key capital metrics up front — with the underlying share structure and dilution available when investors want to go deeper.",
    screen: "capital", detail: "The numbers investors would otherwise dig through filings to assemble." },
  { n: "05", eyebrow: "LEADERSHIP",   head: "Put the people behind the company front and centre.",
    body: "Give investors a clear view of the management team and board behind the assets and strategy.",
    screen: "team", detail: "The people investors are really backing, with the track record behind each name." },
  { n: "06", eyebrow: "MEDIA",        head: "Keep your investor content in one place.",
    body: "Publish project photos, videos and interviews directly to your profile so investors can keep exploring your story.",
    screen: "media", detail: "Photography and video from the project, in the profile rather than scattered across the web." },
  { n: "07", eyebrow: "FOLLOW",       head: "Turn investor interest into a lasting connection.",
    body: "Investors don't just understand your company and leave. They can follow your company and stay connected as your story develops.",
    screen: "discover", detail: "Once an investor follows you, your updates reach them here. Tap a story to read it." },
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

      <ProductDeck label="MineEx Pro Profile" beats={BEATS.map((b) => ({
        eyebrow: b.eyebrow, head: b.head, body: b.body,
        screen: b.screen === "discover" ? <DiscoverDemo />
          : b.screen === "media" ? <MediaDemo />
          : <ProfileDemo start={b.screen} projects={!!b.projects} />,
      }))} />

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
