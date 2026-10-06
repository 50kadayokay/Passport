// ─────────────────────────────────────────────────────────────────────────────
// mobileKit — the phone compositions' shared parts.
//
// Home, Pro and Investor each get a composition written for a phone rather than the
// desktop deck rescaled. They were written in separate passes and drifted: Pro came
// out dark with its own type ramp while Home and Investor were light and built on
// mobile.js, so moving between them did not feel like one site. These are the pieces
// all three now share — ground, gutter, type ramp, device shot and button — so a
// change to the mobile language happens in one place.
//
// Tokens live in mobile.js; this file is only the components built from them.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import Nav from "./home2/Nav.jsx";
import Footer from "./home2/Footer.jsx";
import { MarketingStyles } from "./system.jsx";
import { M_GUTTER, M_LEAD, M_RHYTHM, M_TAP, M_TRACK, M_TYPE } from "./mobile.js";
import MobilePhone, { PHONE_CSS_HEIGHT } from "./mobile/MobilePhone.jsx";
import ProductStage from "./mobile/ProductStage.jsx";

export const M_INK = "#0a1b2e";
export const M_SLATE = "#565f6e";
export const M_MUTE = "#9aa1ad";
export const M_COBALT = "#2563EB";
export const M_BG = "#fbfcfe";

export const pad = { paddingLeft: M_GUTTER, paddingRight: M_GUTTER };

// The page shell: one ground, one font, nav above, footer below.
export function MobilePage({ children }) {
  return (
    <div className="mx-root" id="top" style={{ background: M_BG, minHeight: "100svh", color: M_INK }}>
      <MarketingStyles />
      <Nav />
      <main style={{ fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        {children}
        <Footer />
      </main>
    </div>
  );
}

// The soft brand wash behind a hero headline. Same shape on every page.
export function HeroWash() {
  return (
    <div aria-hidden style={{ position: "absolute", top: -90, right: -140, width: 420, height: 420, borderRadius: "50%",
      background: "radial-gradient(circle at 50% 50%, rgba(37,99,235,0.26), rgba(132,204,22,0.16) 46%, rgba(255,255,255,0) 70%)",
      filter: "blur(14px)", pointerEvents: "none" }} />
  );
}

export function Section({ children, top = M_RHYTHM.sectionY, bottom = 0, style }) {
  return <section style={{ ...pad, paddingTop: top, paddingBottom: bottom, ...style }}>{children}</section>;
}

// "01  PROFILE" — the number carries the accent, the label stays quiet.
export function Eyebrow({ n, children, accent }) {
  return (
    <p style={{ margin: 0, fontSize: M_TYPE.eyebrow, fontWeight: 800, letterSpacing: M_TRACK.eyebrow,
      textTransform: "uppercase", color: accent ? M_COBALT : M_MUTE }}>
      {n ? <><span style={{ color: M_COBALT }}>{n}</span>&nbsp;&nbsp;</> : null}{children}
    </p>
  );
}

export function Head({ children, as: Tag = "h2", hero, long, style }) {
  const size = hero ? M_TYPE.h1 : (long ? M_TYPE.h2Long : M_TYPE.h2);
  return (
    <Tag style={{ margin: `${hero ? 14 : M_RHYTHM.eyebrowGap}px 0 0`, fontSize: size,
      lineHeight: hero ? M_LEAD.h1 : M_LEAD.h2, letterSpacing: hero ? M_TRACK.h1 : M_TRACK.h2,
      fontWeight: 700, color: M_INK, position: "relative", ...style }}>{children}</Tag>
  );
}

export function SubHead({ children }) {
  return <h3 style={{ margin: 0, fontSize: M_TYPE.h3, lineHeight: 1.22, letterSpacing: "-0.025em", fontWeight: 700, color: M_INK }}>{children}</h3>;
}

export function Body({ children, top = M_RHYTHM.headGap }) {
  return <p style={{ margin: `${top}px 0 0`, fontSize: M_TYPE.body, lineHeight: M_LEAD.body, color: M_SLATE, position: "relative" }}>{children}</p>;
}

// A product screen at a size you can actually read: full content width, in a frame
// that reads as a device without pretending to be a photoreal one. The sources are
// captured at 3x (see qa/appshots.mjs), so they stay sharp on a phone.
export function Shot({ name, alt }) {
  return (
    <div style={{ marginTop: M_RHYTHM.mediaGap, borderRadius: 20, overflow: "hidden",
      border: "1px solid rgba(10,27,46,0.08)", background: "#fff",
      boxShadow: "0 24px 60px -32px rgba(10,27,46,0.38)" }}>
      <img src={`/marketing/appshots/${name}.webp`} alt={alt} loading="lazy" decoding="async"
        style={{ display: "block", width: "100%", height: "auto" }} />
    </div>
  );
}

export function Cta({ href, children, primary }) {
  return (
    <a href={href} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minHeight: M_TAP, padding: "0 26px", borderRadius: 999, textDecoration: "none",
      fontSize: M_TYPE.cta, fontWeight: 700, letterSpacing: "-0.015em",
      background: primary ? M_COBALT : "transparent", color: primary ? "#fff" : M_INK,
      border: `1px solid ${primary ? M_COBALT : "rgba(10,27,46,0.18)"}`,
    }}>{children}</a>
  );
}

// Stacked buttons — the phone's only button layout.
export function Ctas({ children, top = M_RHYTHM.ctaGap }) {
  return <div style={{ position: "relative", marginTop: top, display: "flex", flexDirection: "column", gap: 11 }}>{children}</div>;
}

// ── The product chapter — the one grammar every phone page tells its story in:
//
//      eyebrow · headline · copy · [ live device ] · supporting detail
//
// The device is evidence and the copy explains it, so nothing is ever laid over the
// screen. The stage reserves the device's exact height, so a scene mounting or
// unmounting as it passes the viewport shifts nothing.
export function ProductChapter({ n, eyebrow, head, body, detail, children, label }) {
  return (
    <Section>
      {eyebrow ? <Eyebrow n={n}>{eyebrow}</Eyebrow> : null}
      <Head long={String(head).length > 38}>{head}</Head>
      {body ? <Body>{body}</Body> : null}
      <div style={{ marginTop: "clamp(30px,7.5vw,38px)" }}>
        <ProductStage minHeight={PHONE_CSS_HEIGHT}>
          <MobilePhone label={label}>{children}</MobilePhone>
        </ProductStage>
      </div>
      {detail ? (
        <p style={{ margin: "clamp(22px,5.5vw,30px) 0 0", fontSize: M_TYPE.bodySm, lineHeight: 1.55, color: M_MUTE, textAlign: "center" }}>{detail}</p>
      ) : null}
    </Section>
  );
}
