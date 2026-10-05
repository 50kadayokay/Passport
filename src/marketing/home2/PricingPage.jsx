// ─────────────────────────────────────────────────────────────────────────────
// PricingPage (/pricing) — ONE coherent MineEx pricing system, editorial and
// premium (not SaaS pricing tables): MineEx App · Conference Mode · Mining Websites.
//
// VISUAL LANGUAGE: the same as SalesPricing / ProPricing — a light page, each section
// held in ONE light-gray surface, the leading plan as a near-black panel inside it,
// chevron marks, the same type scale, pill CTA and billing switch. Those primitives are
// IMPORTED (from ProPricing, which imports them from SalesPricing) rather than redrawn.
//
// CONTENT IS UNCHANGED and intentionally differs from ProPricing: this page offers two
// app tiers (no Fully Managed Pro) and Conference Mode at exactly TWO prices —
// Premium $6,000 and Bespoke $9,000. (The Pro-member $4,500 rate was withdrawn 2026-10-04.)
// commercial difference between the two screens, not a styling one; do not reconcile it
// here without a decision on which offer is current.
//
// Marketing-layer only. Every CTA uses the EXISTING marketing mechanisms: the demo /
// contact anchor (/site#demo) and the Conference template gallery (/conference-mode).
// No Stripe / checkout / billing behavior is introduced or changed. Feature lists are
// the verified, production-true copy from ProPricing.jsx (source of truth) — nothing
// invented. The dark ProPricing.jsx is untouched.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { EASE, MarketingStyles } from "../system.jsx";
import Nav from "./Nav.jsx";
import { BILLING, BillingToggle, PRICE_TOKENS as T } from "./SalesPricing.jsx";
import { Plan, Surface, SectionHead as PSectionHead, BESPOKE_TINT } from "./ProPricing.jsx";

const BG = "#fcfcfa";
const NAVY = "#0a1b2e";
const SLATE = "#565f6e";
const COBALT = "#2563EB";
const MUTE = "#9aa1ad";
const HAIR = "rgba(10,27,46,0.09)";
const MAXW = 1180;
const DEMO = "/contact?plan=general";
const GALLERY = "/conference-mode";

// ── verified, production-true feature copy (from ProPricing.jsx — source of truth) ──
const APP = [
  {
    key: "basic", label: "Basic", price: "$299", per: "/ month",
    title: "Establish your presence on MineEx.",
    desc: "Give investors a clear place to discover your company and keep your information current.",
    features: [
      "Your MineEx company profile — overview, tickers & exchanges, commodity and jurisdiction",
      "Company status and timeline, kept current",
      "Discovered by investors in MineEx Explore & Search",
      "Investor-facing mobile profile",
      "Company Portal to manage your profile",
    ],
    agreement: "12-month agreement",
    cta: { label: "Get Started", href: "/contact?plan=basic" },
  },
  {
    key: "pro", label: "Pro", price: "$999", per: "/ month", lead: true, tag: "Recommended",
    title: "Your complete investor experience.",
    desc: "Give investors a richer way to understand your company, explore your story and stay connected as it develops.",
    inherits: "Everything in Basic, plus:",
    features: [
      "The premium, interactive Pro Profile — thesis, projects, capital structure, timeline, leadership and media",
      "Project intelligence — project snapshots, drill results and lifecycle stage",
      "Investors can follow you, and your updates reach them in a personalized feed",
      "Publishing tools — press releases with AI-structured summaries, published to the MineEx feed and your timeline",
      "Media publishing",
      "Priority placement in Explore",
    ],
    agreement: "12-month agreement",
    cta: { label: "Get Started", href: "/contact?plan=pro" },
  },
  {
    key: "managed", label: "Fully Managed", pre: "Starting at", price: "$2,999", per: "/ month",
    title: "Your MineEx presence, managed for you.",
    desc: "We maintain your MineEx experience and keep it current as your company progresses.",
    inherits: "Everything in Pro, plus:",
    features: [
      "We build and maintain your Pro Profile for you",
      "We keep your company information up to date",
      "We publish your press releases, summaries and media",
      "We manage your company timeline",
      "Ongoing investor-facing content support",
    ],
    cta: { label: "Talk to Us", href: "/contact?plan=managed" },
  },
];

const CONF = [
  {
    label: "Premium", price: "$6,000",
    desc: "Choose from one of our premium Conference Mode templates and we’ll refine it around your company, projects, imagery and brand.",
    features: [
      "Interactive iPad investor presentation for your booth",
      "Investment thesis, key statistics and capital information",
      "Project presentation, jurisdiction and leadership",
      "Company imagery in a professionally designed MineEx template",
      "QR follow experience that connects investors back on MineEx",
      "Works offline at the conference",
    ],
    cta: { label: "Explore Templates", href: GALLERY },
  },
  {
    label: "Bespoke", price: "$9,000", custom: true,
    desc: "A completely custom Conference Mode experience designed and built around your company and story.",
    features: [
      "Custom visual direction and company-specific storytelling",
      "Bespoke presentation structure, layouts and interactions",
      "Your company branding throughout",
      "Project-focused, investor-ready presentation",
      "QR investor capture and follow, connecting back on MineEx",
      "iPad conference experience, built around your company",
    ],
    cta: { label: "Discuss a Bespoke Build", href: "/contact?plan=bespoke" },
  },
];

const WEB_FEATURES = [
  "Fully custom website design with mining-specific structure",
  "Investor-focused — projects, corporate and investor information",
  "News and press releases, leadership, capital and media",
  "Responsive desktop and mobile design",
];

function Arrow({ label, href, strong }) {
  return (
    <a href={href} className="mx-arrowlink" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: strong ? COBALT : NAVY, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", textDecoration: "none" }}>
      {label}<span aria-hidden className="mx-arw" style={{ transition: `transform 220ms ${EASE}` }}>→</span>
    </a>
  );
}
function Filled({ label, href, small }) {
  return (
    <a href={href} className="mx-cta" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: small ? 46 : 52, padding: small ? "0 26px" : "0 30px", borderRadius: 999, background: NAVY, color: "#fff", border: `1px solid ${NAVY}`, fontSize: small ? 15 : 16, fontWeight: 700, letterSpacing: "-0.01em", textDecoration: "none", transition: `transform 200ms ${EASE}` }}>{label}</a>
  );
}
function Check() {
  return (
    <svg aria-hidden width="15" height="15" viewBox="0 0 16 16" style={{ flexShrink: 0, marginTop: 3 }}>
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke={COBALT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Features({ items, inherits }) {
  return (
    <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 11, flex: 1 }}>
      {inherits && <div style={{ color: NAVY, fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 2 }}>{inherits}</div>}
      {items.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", color: SLATE, fontSize: 14, lineHeight: 1.45 }}>
          <Check /><span>{f}</span>
        </div>
      ))}
    </div>
  );
}

// section number + eyebrow + headline + supporting
function SectionHead({ n, eyebrow, head, body, headMax = "16ch", bodyMax = "48ch" }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: COBALT, fontVariantNumeric: "tabular-nums", letterSpacing: "0.04em" }}>{n}</span>
        <p className="mx-label" style={{ color: COBALT, letterSpacing: "0.22em", margin: 0 }}>{eyebrow}</p>
      </div>
      <h2 style={{ margin: "18px 0 0", color: NAVY, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.0, fontSize: "clamp(32px,4.2vw,58px)", maxWidth: headMax }}>{head}</h2>
      {body && <p style={{ color: SLATE, fontSize: "clamp(15px,1.3vw,18px)", marginTop: 18, maxWidth: bodyMax }}>{body}</p>}
    </div>
  );
}

function AppTier({ p }) {
  const lead = !!p.lead;
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", padding: "0 clamp(22px,2.4vw,40px)", borderLeft: p.key === "basic" ? "none" : `1px solid ${HAIR}` }}>
      {lead && <span aria-hidden style={{ position: "absolute", top: 0, left: "clamp(22px,2.4vw,40px)", right: "clamp(22px,2.4vw,40px)", height: 2, background: COBALT, borderRadius: 2 }} />}
      {lead && <span aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, background: "linear-gradient(180deg, rgba(37,99,235,0.05), rgba(37,99,235,0) 46%)", pointerEvents: "none" }} />}
      <div style={{ position: "relative", paddingTop: 26, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: lead ? COBALT : MUTE }}>{p.label}</span>
          {p.tag && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: COBALT, border: `1px solid ${COBALT}`, borderRadius: 999, padding: "3px 8px" }}>{p.tag}</span>}
        </div>
        {p.pre && <div style={{ color: MUTE, fontSize: 13, fontWeight: 600, marginTop: 16 }}>{p.pre}</div>}
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: p.pre ? 4 : 16 }}>
          <span style={{ color: NAVY, fontWeight: 700, letterSpacing: "-0.03em", fontSize: lead ? "clamp(50px,4.4vw,68px)" : "clamp(40px,3.4vw,54px)" }}>{p.price}</span>
          {p.per && <span style={{ color: MUTE, fontSize: 15, fontWeight: 500 }}>{p.per}</span>}
        </div>
        <h3 style={{ margin: "20px 0 0", color: NAVY, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.14, fontSize: "clamp(19px,1.5vw,23px)", maxWidth: "16ch" }}>{p.title}</h3>
        <p style={{ margin: "12px 0 0", color: SLATE, fontSize: 14.5, lineHeight: 1.5, maxWidth: "32ch" }}>{p.desc}</p>
        <Features items={p.features} inherits={p.inherits} />
        {p.agreement && <div style={{ color: MUTE, fontSize: 12.5, marginTop: 24 }}>{p.agreement}</div>}
        <div style={{ marginTop: p.agreement ? 14 : 24 }}>
          {lead ? <Filled label={p.cta.label} href={p.cta.href} small /> : <Arrow label={p.cta.label} href={p.cta.href} />}
        </div>
      </div>
    </div>
  );
}

function ConfCard({ c }) {
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", padding: "clamp(28px,3vw,44px)", borderRadius: 18, border: `1px solid ${c.custom ? "rgba(37,99,235,0.28)" : HAIR}`, background: c.custom ? "linear-gradient(180deg, rgba(37,99,235,0.05), rgba(255,255,255,0) 40%)" : "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: c.custom ? COBALT : MUTE }}>{c.label}</span>
        {c.custom && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: COBALT, border: `1px solid ${COBALT}`, borderRadius: 999, padding: "3px 8px" }}>Custom build</span>}
      </div>
      <div style={{ color: NAVY, fontWeight: 700, letterSpacing: "-0.03em", fontSize: "clamp(40px,4.4vw,60px)", marginTop: 14 }}>{c.price}</div>
      <p style={{ color: SLATE, fontSize: 15, lineHeight: 1.55, marginTop: 14, maxWidth: "40ch" }}>{c.desc}</p>
      <Features items={c.features} />
      <div style={{ marginTop: 26 }}>
        {c.custom ? <Arrow label={c.cta.label} href={c.cta.href} strong /> : <Filled label={c.cta.label} href={c.cta.href} small />}
      </div>
    </div>
  );
}

export default function PricingPage() {
  const [billing, setBilling] = useState("annual");   // annual selected by default
  const b = BILLING[billing];
  const gut = "clamp(22px,5vw,56px)";
  const SECTION = { maxWidth: MAXW, margin: "0 auto", padding: `clamp(56px,7vw,96px) ${gut}`, scrollMarginTop: 84 };

  return (
    <div className="mx-root mx-pricing" id="top" style={{ background: T.BG, minHeight: "100vh", color: T.NAVY }}>
      <MarketingStyles />
      <Nav />
      <main style={{ position: "relative", fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <section style={{ ...SECTION, paddingTop: "clamp(112px,13vh,148px)", paddingBottom: 0 }}>
          <p className="mx-label" style={{ color: T.COBALT, letterSpacing: "0.22em", margin: 0 }}>Pricing</p>
          <h1 className="mx-h2" style={{ marginTop: 12, color: T.NAVY, maxWidth: "20ch" }}>Everything MineEx offers, in one place.</h1>
        </section>

        {/* ── 01 · MINEEX APP ── */}
        <section id="app" style={SECTION}>
          <PSectionHead index="01" label="MINEEX APP" title="Build your investor presence."
            blurb="Choose how much of your MineEx presence you want to manage yourself." />
          <Surface cols="1fr 1.26fr 1fr">
            {APP.map((p) => p.lead ? (
              <Plan key={p.key} dark name={p.label} badge={p.tag} blurb={p.desc}
                price={b.price} per={b.per} sub={b.sub} note={b.note}
                inherits={p.inherits} features={p.features}
                cta={{ ...p.cta, href: "/contact?plan=pro" }}
                control={<BillingToggle value={billing} onChange={setBilling} dark compact />} />
            ) : (
              <Plan key={p.key} name={p.label} blurb={p.desc} price={p.price} per={p.per}
                pre={p.pre} sub={p.agreement} inherits={p.inherits} features={p.features} cta={p.cta} />
            ))}
          </Surface>
        </section>

        {/* ── 02 · CONFERENCE MODE ── */}
        <section id="conference-mode" style={SECTION}>
          <PSectionHead index="02" label="CONFERENCE MODE" title="Bring your investor story to the booth."
            blurb="Interactive conference experiences designed to help investors explore your company in person and stay connected after the conversation." />
          <Surface cols="1fr 1fr">
            {CONF.map((c) => (
              <Plan key={c.label} name={c.label} blurb={c.desc} price={c.price} per="one-time"
                sub="One-time build · no subscription" features={c.features} cta={c.cta}
                tint={c.custom ? BESPOKE_TINT : undefined} />
            ))}
          </Surface>
        </section>

        {/* ── 03 · MINING WEBSITES ── */}
        <section id="websites" style={SECTION}>
          <PSectionHead index="03" label="MINING WEBSITES" title="Built for public mining companies."
            blurb="Custom investor-focused websites designed around your company and projects." />
          <Surface cols="1fr">
            <Plan name="Custom Website Design" blurb="Custom websites built for junior mining companies."
              price="Request a Quote" quote sub="Scoped to your company"
              features={WEB_FEATURES} cta={{ label: "Request a Quote", href: "/contact?plan=website" }} />
          </Surface>
        </section>

        {/* Closing contact block — the same one the Pro page's pricing carries. */}
        <section style={{ ...SECTION, paddingTop: 0, paddingBottom: "clamp(80px,10vw,120px)" }}>
          <div style={{ background: T.SURFACE, borderRadius: 24, padding: "clamp(8px,0.7vw,12px)" }}>
            <div style={{ borderRadius: 20, padding: "clamp(24px,3vw,40px)", display: "flex", alignItems: "center",
              justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: "clamp(19px,1.7vw,23px)", fontWeight: 700, letterSpacing: "-0.025em", color: T.NAVY }}>Not sure which plan fits?</h3>
                <p style={{ margin: "7px 0 0", fontSize: 14, lineHeight: 1.45, color: T.SLATE, maxWidth: "52ch" }}>
                  Tell us about your company and we'll point you to the right one — usually the same day.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <a href="/contact?plan=general" className="sp-cta" style={{ display: "inline-flex", alignItems: "center",
                  justifyContent: "center", height: 46, padding: "0 28px", borderRadius: 999, background: T.NAVY, color: "#fff",
                  fontSize: 15, fontWeight: 700, textDecoration: "none" }}>Contact us</a>
                <a href="mailto:support@mineex.ca" style={{ fontSize: 13, color: T.SLATE, textDecoration: "underline" }}>support@mineex.ca</a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <style>{`
        .sp-cta { transition: transform 160ms ${EASE}, box-shadow 160ms ${EASE}; }
        .sp-cta:hover { transform: translateY(-1px); box-shadow: 0 16px 34px -18px rgba(10,27,46,0.5); }
        @media (max-width: 860px) { .mx-price-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}
