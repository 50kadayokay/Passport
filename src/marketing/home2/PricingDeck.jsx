// ─────────────────────────────────────────────────────────────────────────────
// PricingDeck — the MineEx pricing as a PAGED sheet deck (same feel as the sales-page
// chapters): three full-viewport panels — 01 App · 02 Conference Mode · 03 Websites —
// each fitting the screen, paged by one deliberate scroll gesture. The current panel
// lifts UP to reveal the next resting beneath it.
//
// Used two ways:
//   • standalone (/pricing) — renders its own Nav + owns the wheel gesture.
//   • embedded in the home2 deck — no Nav (home2's stays on top); `active` gates its
//     wheel controller and `onExitTop` fires when the visitor scrolls up past panel 01
//     (so the tablet slides back down).
//
// Marketing-layer only. Prices/feature lists are the verified copy from ProPricing.jsx.
// No Stripe / checkout / billing behaviour. Every CTA uses the existing demo/contact
// anchor and the Conference template gallery.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";
import { EASE, MarketingStyles, useViewport, useReduce } from "../system.jsx";
import Nav from "./Nav.jsx";
import { BILLING, BillingToggle, PRICE_TOKENS as T } from "./SalesPricing.jsx";
import { Plan, Setup, Surface, BESPOKE_TINT } from "./ProPricing.jsx";
import { Fit } from "./SalesPricing.jsx";
import { Mark } from "./SalesPricing.jsx";
import { installNavProbe, navDebugOn, NavDebugHUD, logNav } from "./navDebug.jsx";

import { SHEET_MS, EASE_SHEET } from "./motion.js";
import Footer from "./Footer.jsx";
const BG = "#fbfcfe";
const NAVY = "#0a1b2e";
const SLATE = "#565f6e";
const COBALT = "#2563EB";
const MUTE = "#9aa1ad";
const HAIR = "rgba(10,27,46,0.10)";
const MAXW = 1180;
const DEMO = "/contact?plan=general";
const GALLERY = "/conference-mode";

// Basic is a PRESENCE, not a cut-down Pro: Company Overview + Company Timeline, found in
// Explore, managed from the Portal. Its press releases are INGESTED into the timeline —
// never described as "kept current", which would imply MineEx manages the whole presence
// for $299. Projects, Capital, Leadership, Media and publishing are the Pro differentiation.
// Phone stacking order for the app plans; desktop uses the array's own order.
const APP_MOBILE_ORDER = ["pro", "managed", "basic"];
const APP = [
  { key: "basic", label: "Basic", price: "$299", per: "/ month", title: "Establish your presence on MineEx.",
    features: ["Company Overview", "Company Timeline", "Tickers, exchanges, commodity and jurisdiction", "Discoverable in MineEx Explore & Search", "Investor-facing mobile profile", "Company Portal", "Press releases ingested into your Timeline"],
    setup: { amount: "$1,500", qualifier: "Optional", blurb: "We build your Basic profile and historical Timeline — or set it up yourself for $0." },
    agreement: "12-month agreement", cta: { label: "Get Started", href: "/contact?plan=basic" } },
  { key: "pro", label: "Pro", price: "$999", per: "/ month", lead: true, tag: "Recommended", title: "Your complete investor experience.",
    inherits: "Everything in Basic, plus:",
    features: ["The premium, interactive Pro Profile — thesis, projects, capital, timeline, leadership and media", "Project intelligence — snapshots, drill results and lifecycle stage", "Investors follow you; updates reach them in a personalized feed", "Press release publishing with AI-structured summaries", "Media publishing", "Priority placement in Explore"],
    setup: { amount: "$2,500", blurb: "We build your complete Pro Profile and press release history." },
    agreement: "12-month agreement", cta: { label: "Get Started", href: "/contact?plan=pro" } },
  { key: "managed", label: "Fully Managed", pre: "Starting at", price: "$2,999", per: "/ month", title: "Your MineEx presence, managed for you.",
    inherits: "Everything in Pro, plus:",
    features: ["We build and maintain your Pro Profile for you", "We keep your company information up to date", "We publish your press releases, summaries and media", "We manage your company timeline", "Ongoing investor-facing content support"],
    setup: { amount: "Included", per: "", blurb: "No separate setup charge." },
    cta: { label: "Talk to Us", href: "/contact?plan=managed" } },
];
const CONF = [
  { label: "Premium", price: "$6,000", desc: "Choose one of our premium Conference Mode designs and we’ll refine it around your company, projects, imagery and brand.",
    features: ["Interactive iPad investor presentation for your booth", "Investment thesis, key statistics and capital information", "Project presentation, jurisdiction and leadership", "Company imagery in a professionally designed template", "QR follow experience that connects investors on MineEx", "Works offline at the conference"],
    cta: { label: "Request Conference Mode", href: "/contact?plan=standard" }, browse: GALLERY },
  { label: "Bespoke", price: "$9,000", custom: true, desc: "A completely custom Conference Mode experience designed and built around your company and story.",
    features: ["Custom visual direction and company-specific storytelling", "Bespoke structure, layouts and interactions", "Your company branding throughout", "Project-focused, investor-ready presentation", "QR investor capture and follow, back on MineEx", "iPad conference experience, built around you"],
    cta: { label: "Discuss a Bespoke Build", href: "/contact?plan=bespoke" } },
];
// Grouped rather than a flat list: a website is bought on what it covers, and four
// undifferentiated bullets read as a placeholder. Every line below is the verified website
// copy already used on the Pro page's services card — nothing about scope, timelines,
// hosting, SEO or analytics is claimed here, because none of that is confirmed.
const WEB_GROUPS = [
  { label: "Design", items: [
    "Fully custom website design with mining-specific structure",
    "Responsive desktop and mobile design",
  ] },
  { label: "Investor content", items: [
    "Investor-focused experience — projects, corporate and investor information",
    "News and press releases, leadership, capital and media",
  ] },
  { label: "Running it", items: [
    "Straightforward company-side content management",
  ] },
];
const WEB_FEATURES = WEB_GROUPS.flatMap((g) => g.items);

function Arrow({ label, href, strong }) {
  return (
    <a href={href} className="pd-arrow" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, gap: 8, color: strong ? COBALT : NAVY, fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", textDecoration: "none" }}>
      {label}<span aria-hidden className="pd-arw" style={{ transition: `transform 220ms ${EASE}` }}>→</span>
    </a>
  );
}
function Filled({ label, href, small }) {
  return (
    <a href={href} className="pd-cta" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: small ? 46 : 50, padding: small ? "0 24px" : "0 28px", borderRadius: 999, background: NAVY, color: "#fff", border: `1px solid ${NAVY}`, fontSize: small ? 14.5 : 15.5, fontWeight: 700, letterSpacing: "-0.01em", textDecoration: "none" }}>{label}</a>
  );
}
function Check() {
  return <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" style={{ flexShrink: 0, marginTop: 3 }}><path d="M3.5 8.5l3 3 6-7" fill="none" stroke={COBALT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function Features({ items, inherits }) {
  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
      {inherits && <div style={{ color: NAVY, fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{inherits}</div>}
      {items.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", color: SLATE, fontSize: 13, lineHeight: 1.4 }}><Check /><span>{f}</span></div>
      ))}
    </div>
  );
}
function Head({ n, eyebrow, head, body, headMax = "18ch", compact }) {
  const { mobile } = useViewport();
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <span style={{ fontSize: mobile ? 13.5 : 12.5, fontWeight: 800, color: COBALT, fontVariantNumeric: "tabular-nums" }}>{n}</span>
        <p className="mx-label" style={{ color: COBALT, letterSpacing: "0.22em", margin: 0 }}>{eyebrow}</p>
      </div>
      <h2 style={{ margin: compact ? "10px 0 0" : "14px 0 0", color: NAVY, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.02,
        fontSize: mobile ? "clamp(31px, 8.6vw, 39px)" : (compact ? "clamp(24px, min(2.7vw, 4.4vh), 38px)" : "clamp(26px, min(3.2vw, 5.2vh), 44px)"), maxWidth: mobile ? "none" : headMax }}>{head}</h2>
      {body && <p style={{ color: SLATE, fontSize: mobile ? 17 : (compact ? "clamp(14px,1.05vw,15.5px)" : "clamp(15px,1.2vw,17px)"), lineHeight: mobile ? 1.5 : undefined, marginTop: mobile ? 14 : (compact ? 9 : 14), maxWidth: "52ch", lineHeight: 1.45 }}>{body}</p>}
    </div>
  );
}

function AppTier({ p }) {
  const lead = !!p.lead;
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", padding: "0 clamp(20px,2.2vw,36px)", borderLeft: p.key === "basic" ? "none" : `1px solid ${HAIR}` }}>
      {lead && <span aria-hidden style={{ position: "absolute", top: 0, left: "clamp(20px,2.2vw,36px)", right: "clamp(20px,2.2vw,36px)", height: 2, background: COBALT, borderRadius: 2 }} />}
      {lead && <span aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(37,99,235,0.05), rgba(37,99,235,0) 46%)", pointerEvents: "none" }} />}
      <div style={{ position: "relative", paddingTop: 22, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: lead ? COBALT : MUTE }}>{p.label}</span>
          {p.tag && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: COBALT, border: `1px solid ${COBALT}`, borderRadius: 999, padding: "2px 7px" }}>{p.tag}</span>}
        </div>
        {p.pre && <div style={{ color: MUTE, fontSize: 12.5, fontWeight: 600, marginTop: 12 }}>{p.pre}</div>}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: p.pre ? 3 : 12 }}>
          <span style={{ color: NAVY, fontWeight: 700, letterSpacing: "-0.03em", fontSize: lead ? "clamp(40px,3.6vw,56px)" : "clamp(32px,2.8vw,44px)" }}>{p.price}</span>
          {p.per && <span style={{ color: MUTE, fontSize: 14, fontWeight: 500 }}>{p.per}</span>}
        </div>
        <h3 style={{ margin: "14px 0 0", color: NAVY, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.14, fontSize: "clamp(17px,1.4vw,21px)", maxWidth: "16ch" }}>{p.title}</h3>
        <Features items={p.features} inherits={p.inherits} />
        {p.agreement && <div style={{ color: MUTE, fontSize: 12, marginTop: 16 }}>{p.agreement}</div>}
        <div style={{ marginTop: p.agreement ? 12 : 18 }}>
          {lead ? <Filled label={p.cta.label} href={p.cta.href} small /> : <Arrow label={p.cta.label} href={p.cta.href} />}
        </div>
      </div>
    </div>
  );
}

function ConfCard({ c }) {
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", padding: "clamp(24px,2.6vw,40px)", borderRadius: 18, border: `1px solid ${c.custom ? "rgba(37,99,235,0.28)" : HAIR}`, background: c.custom ? "linear-gradient(180deg, rgba(37,99,235,0.05), rgba(255,255,255,0) 40%)" : "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: c.custom ? COBALT : MUTE }}>{c.label}</span>
        {c.custom && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: COBALT, border: `1px solid ${COBALT}`, borderRadius: 999, padding: "2px 7px" }}>Custom build</span>}
      </div>
      <div style={{ color: NAVY, fontWeight: 700, letterSpacing: "-0.03em", fontSize: "clamp(36px,4vw,54px)", marginTop: 12 }}>{c.price}</div>
      <p style={{ color: SLATE, fontSize: 14.5, lineHeight: 1.5, marginTop: 12, maxWidth: "42ch" }}>{c.desc}</p>
      <Features items={c.features} />
      <div style={{ marginTop: 22 }}>{c.custom ? <Arrow label={c.cta.label} href={c.cta.href} strong /> : <Filled label={c.cta.label} href={c.cta.href} small />}</div>
    </div>
  );
}

// The three viewport panels.
// The three panels share SalesPricing's language: one light-gray surface per panel, the
// leading plan as a near-black card inside it, the same type scale, marks and pill CTA.
// Only the presentation changed — the plans, prices and feature copy are untouched.
function PanelApp({ gut }) {
  const { mobile } = useViewport();
  const [billing, setBilling] = React.useState("annual");
  const b = BILLING[billing];
  return (
    <Fit><div style={{ maxWidth: MAXW, margin: "0 auto", width: "100%", padding: `0 ${gut}` }}>
      <Head n="01" eyebrow="MINEEX APP" head="Build your investor presence." body="Choose how much of your MineEx presence you want to manage yourself." />
      <Surface cols="1fr 1.26fr 1fr">
        {/* Desktop keeps Basic · Pro · Fully Managed, where Pro sits in the middle because
            it is the featured column and the row reads cheapest-to-dearest across. Stacked
            on a phone there is no middle, so the recommended plan would be buried under the
            cheapest one: phones lead with Pro, then Fully Managed, then Basic. */}
        {(mobile ? [...APP].sort((a, b) => APP_MOBILE_ORDER.indexOf(a.key) - APP_MOBILE_ORDER.indexOf(b.key)) : APP).map((p) => p.lead ? (
          <Plan key={p.key} dark name={p.label} badge={p.tag} blurb={p.title}
            price={b.price} per={b.per} sub={b.sub} note={b.note}
            inherits={p.inherits} features={p.features} cta={p.cta}
            control={<BillingToggle value={billing} onChange={setBilling} dark compact />}>
            <Setup {...p.setup} dark />
          </Plan>
        ) : (
          <Plan key={p.key} name={p.label} blurb={p.title} pre={p.pre}
            price={p.price} per={p.per} sub={p.agreement}
            inherits={p.inherits} features={p.features} cta={p.cta}>
            <Setup {...p.setup} />
          </Plan>
        ))}
      </Surface>
    </div></Fit>
  );
}

function PanelConf({ gut }) {
  return (
    <Fit><div style={{ maxWidth: MAXW, margin: "0 auto", width: "100%", padding: `0 ${gut}` }}>
      <Head n="02" eyebrow="CONFERENCE MODE" head="Bring your investor story to the booth." body="Interactive conference experiences designed to help investors explore your company in person and stay connected after the conversation." headMax="15ch" />
      <Surface cols="1fr 1fr">
        {CONF.map((c) => (
          <Plan key={c.label} name={c.label} blurb={c.desc} price={c.price} per="one-time"
            sub="One-time build · no subscription" features={c.features} cta={c.cta}
            tint={c.custom ? BESPOKE_TINT : undefined}>
            {/* Browsing the designs stays available — demoted to the secondary action,
                since nothing here is bought without talking to us first. */}
            {c.browse && (
              <a href={c.browse} className="pd-arrow" style={{ marginTop: 12, display: "inline-flex", alignItems: "center", minHeight: 44, gap: 7, color: SLATE, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", textDecoration: "none" }}>
                Explore Templates <span aria-hidden className="pd-arw" style={{ transition: `transform 220ms ${EASE}` }}>→</span>
              </a>
            )}
          </Plan>
        ))}
      </Surface>
    </div></Fit>
  );
}

// A labelled group of capabilities. Chevron marks and type scale match the plan cards.
function Group({ label, items }) {
  const { mobile } = useViewport();
  return (
    <div>
      <p style={{ margin: "0 0 8px", fontSize: mobile ? 11.5 : 10.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.MUTE }}>{label}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 11 : 7 }}>
        {items.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: mobile ? 11 : 9, alignItems: "flex-start", color: T.SLATE, fontSize: mobile ? 16 : 13.5, lineHeight: mobile ? 1.5 : 1.45 }}>
            <Mark c={T.COBALT} /><span>{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelWeb({ gut }) {
  const { mobile } = useViewport();
  return (
    // Fills the panel and pins the closing block to the BOTTOM EDGE of the window: the
    // content was taller than the viewport, so that block was being clipped mid-way while
    // the heading had no air under the nav. Column layout + `marginTop:auto` on the block
    // means any slack lands between the cards and the block rather than overflowing.
    <div style={{ maxWidth: MAXW, margin: "0 auto", width: "100%", padding: `0 ${gut}`,
      height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ paddingTop: "clamp(4px,1.6vh,22px)" }} />
      <Head compact n="03" eyebrow="MINING WEBSITES" head="Built for public mining companies."
        body="A website structured the way investors actually read a junior miner — projects, capital, timeline, leadership and news — rather than a generic corporate template."
        headMax="15ch" />

      <Surface cols="1.02fr 1fr">
        {/* The offer itself, as the featured panel. */}
        <Plan dark name="Custom Website Design"
          blurb="Designed and built around your company, your projects and your story."
          price="Request a Quote" quote compactPrice sub="Scoped to your company"
          features={[
            "Built by the team behind the MineEx investor app",
            "Structured around the way investors read a mining company",
            "Your branding, your projects, your story — not a template",
          ]}
          cta={{ label: "Discuss a Website", href: "/contact?plan=website" }} />

        {/* What it covers, grouped so the scope is legible at a glance. */}
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(12px,1.4vw,18px)", padding: "clamp(16px,1.4vw,24px)" }}>
          <p style={{ margin: 0, fontSize: mobile ? 21 : "clamp(17px,1.4vw,19px)", fontWeight: 700, letterSpacing: "-0.02em", color: T.NAVY }}>What's included</p>
          {WEB_GROUPS.map((g) => <Group key={g.label} label={g.label} items={g.items} />)}
          <p style={{ margin: "2px 0 0", fontSize: mobile ? 15 : 12.5, lineHeight: 1.5, color: T.MUTE }}>
            Every build is quoted against your scope — tell us what you need and we'll come back with a plan and a price.
          </p>
        </div>
      </Surface>

      {/* Closing contact block — follows the cards immediately rather than being pushed to
          the bottom; whatever height is left over stays white. */}
      <div style={{ marginTop: "clamp(14px,2vh,24px)", background: T.SURFACE, borderRadius: 24, padding: "clamp(8px,0.7vw,12px)", flexShrink: 0 }}>
        <div style={{ borderRadius: 20, padding: mobile ? "24px 20px 26px" : "clamp(13px,1.5vw,20px) clamp(16px,2vw,28px)", display: "flex", alignItems: mobile ? "stretch" : "center", flexDirection: mobile ? "column" : "row", justifyContent: "space-between", gap: mobile ? 18 : 20, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, color: T.NAVY, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.15, fontSize: mobile ? 23 : "clamp(17px,1.5vw,21px)", maxWidth: "30ch" }}>Let’s build your investor experience.</h2>
          </div>
          <div style={{ display: "flex", gap: mobile ? 8 : 16, alignItems: mobile ? "stretch" : "center", flexDirection: mobile ? "column" : "row", flexWrap: "wrap" }}>
            <a href="/contact?plan=general" className="sp-cta" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: mobile ? 52 : 38, padding: "0 22px", borderRadius: 999, background: T.NAVY, color: "#fff", fontSize: mobile ? 16.5 : 14, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>Contact us</a>
            <a href="mailto:support@mineex.ca" style={{ display: "inline-flex", alignItems: "center", justifyContent: mobile ? "center" : "flex-start", minHeight: 44, fontSize: mobile ? 16 : 13, color: T.SLATE, textDecoration: "underline" }}>support@mineex.ca</a>
          </div>
        </div>
      </div>
      <Footer compact />
    </div>
  );
}

const PANELS = [PanelApp, PanelConf, PanelWeb];

export default function PricingDeck({ embedded = false, active = true, onExitTop }) {
  const { mobile } = useViewport();
  const reduce = useReduce();
  const gut = "clamp(22px,5vw,56px)";
  const [pi, setPi] = useState(0);
  const piRef = useRef(0);
  const activeRef = useRef(active);
  useEffect(() => { piRef.current = pi; }, [pi]);
  useEffect(() => { activeRef.current = active; if (!active) setPi(0); }, [active]);

  // Paged wheel gesture (only while active). Same one-gesture-one-panel feel as the sales page.
  useEffect(() => {
    if (mobile || reduce) return;
    let accum = 0, dir0 = 0, last = 0, used = false, peak = 0, lastMag = 0, clearT = null, locked = false;
    const lock = (ms) => { locked = true; clearTimeout(clearT); clearT = setTimeout(() => { locked = false; }, ms); };
    const onWheel = (e) => {
      if (!activeRef.current) return;
      const DY = Math.round(e.deltaY);
      const now = performance.now(), gap = now - last, mag = Math.abs(e.deltaY);
      const reversed = dir0 !== 0 && Math.sign(e.deltaY) === -dir0 && mag >= 10;
      // Re-arm on silence, reversal, OR a fresh-flick rising edge (see AppSection) — so the
      // next swipe works right after the panel transition, not after inertia goes silent.
      const freshFlick = used && !locked && mag >= 40 && mag > lastMag * 2;
      if (gap > 90 || reversed || freshFlick) { accum = 0; dir0 = Math.sign(e.deltaY); used = false; peak = 0; }
      last = now; lastMag = mag; peak = Math.max(peak, mag);
      const dir = e.deltaY > 0 ? 1 : -1, cur = piRef.current;
      e.preventDefault();
      if (locked || used) { logNav({ src: "PRICE", dy: DY, gap: Math.round(gap), idx: cur, locked: locked ? 1 : 0, used: used ? 1 : 0, note: "rejected" }); return; }
      if (Math.sign(e.deltaY) !== dir0) { accum = 0; dir0 = Math.sign(e.deltaY); }
      accum += e.deltaY;
      if (Math.abs(accum) < 18 || peak < 10) { logNav({ src: "PRICE", dy: DY, gap: Math.round(gap), accum: Math.round(accum), note: "below-trigger" }); return; }
      used = true; accum = 0;
      if (dir > 0) { if (cur < PANELS.length - 1) { setPi(cur + 1); lock(SHEET_MS + 120); logNav({ src: "PRICE", dy: DY, gap: Math.round(gap), acted: 1, idx: cur + 1, note: "ACT" }); } }
      else { if (cur > 0) { setPi(cur - 1); lock(SHEET_MS + 120); logNav({ src: "PRICE", dy: DY, gap: Math.round(gap), acted: 1, idx: cur - 1, note: "ACT" }); } else if (onExitTop) { onExitTop(); } }
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => { window.removeEventListener("wheel", onWheel, { capture: true }); clearTimeout(clearT); };
  }, [mobile, reduce, onExitTop]);

  // Dev-only independent trackpad probe (?navdebug=1) — delivery witness, see navDebug.js.
  useEffect(() => { installNavProbe(); }, []);

  // Mobile / reduced-motion: just stack the panels and scroll normally.
  if (mobile || reduce) {
    return (
      <div className="mx-root" id="top" style={{ background: BG, minHeight: "100vh", color: NAVY }}>
        {!embedded && (<><MarketingStyles /><Nav /></>)}
        <PricingStyles />
        {/* Spacing is set for the PHONE here, not inherited from the desktop deck. The nav
            is ~52px, so 92px of main padding plus the section's own clamp(40px,7vh,80px)
            put the first word ~151px down an empty screen, and the same padding top AND
            bottom opened ~118px between cards that are already taller than the viewport.
            Each panel is its own full-bleed card, so the gutter between them is the only
            separation they need. */}
        <main style={{ paddingTop: embedded ? 40 : 64 }}>
          {PANELS.map((P, k) => <section key={k} style={{ padding: `${k === 0 ? 10 : 30}px 0 30px` }}><P gut={gut} /></section>)}
        </main>
      </div>
    );
  }

  const stage = (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: BG }}>
      {PANELS.map((P, k) => (
        // overflow:hidden so a panel that is taller than a short window cannot paint
        // outside its own box — without it, the previous panel's footer showed through
        // over the nav once it had been translated away.
        <div key={k} className="pd-panel" style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: PANELS.length - k, background: BG,
          transform: `translateY(${pi > k ? -100 : 0}%)`, transition: `transform ${SHEET_MS}ms ${EASE_SHEET}`, willChange: "transform",
          display: "flex", flexDirection: "column", paddingTop: 64,
          // PanelWeb runs to the bottom edge itself; the others stay vertically centred.
          ...(PANELS[k] === PanelWeb ? { justifyContent: "flex-start", paddingTop: 72 } : null) }}>
          <P gut={gut} />
        </div>
      ))}
    </div>
  );

  if (embedded) return (<><PricingStyles />{stage}</>);
  return (
    <div className="mx-root" id="top" style={{ position: "fixed", inset: 0, background: BG, color: NAVY }}>
      <MarketingStyles />
      <PricingStyles />
      <Nav />
      {navDebugOn() && <NavDebugHUD />}
      {stage}
    </div>
  );
}

function PricingStyles() {
  return (
    <style>{`
        .sp-cta { transition: transform 160ms ${EASE}, box-shadow 160ms ${EASE}; }
        .sp-cta:hover { transform: translateY(-1px); box-shadow: 0 16px 34px -18px rgba(10,27,46,0.5); }
      /* Two declarations on purpose: browsers that understand "safe" keep an overflowing
         panel pinned below the nav instead of centring it up under the logo; the rest fall
         back to plain centring, which the Fit wrapper has already made safe. */
      .pd-panel { justify-content: center; justify-content: safe center; }
      .pd-arrow:hover .pd-arw { transform: translateX(4px); }
      .pd-cta { transition: transform 180ms ${EASE}, box-shadow 180ms ${EASE}; }
      .pd-cta:hover { transform: translateY(-1px); box-shadow: 0 14px 30px -16px rgba(10,27,46,.5); }
      /* The pricing grid is rendered by Surface (.mx-price-grid). Its collapse rule used
         to live in ProPricing's <style>, but ProPricing's default export is never mounted,
         so on mobile the three-up grid stayed three-up and Fully Managed was clipped off
         the right edge with no way to scroll to it. It belongs here. */
      @media (max-width: 900px){
        .mx-price-grid { grid-template-columns: 1fr !important; }
        .pd-app { grid-template-columns: 1fr !important; }
        .pd-app > div { border-left: none !important; border-top: 1px solid ${HAIR}; padding: 8px 0 24px !important; }
        .pd-app > div:first-child { border-top: none; }
        .pd-conf { grid-template-columns: 1fr !important; }
        .pd-web { grid-template-columns: 1fr !important; }
        .pd-web > div:last-child { border-left: none !important; padding-left: 0 !important; }
      }
    `}</style>
  );
}
