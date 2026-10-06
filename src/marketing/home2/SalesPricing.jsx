// ─────────────────────────────────────────────────────────────────────────────
// SalesPricing — the sales page's closing pricing screen (shown when the pricing sheet
// lifts up after the template gallery). ONE composed view, two columns:
//   LEFT  — MineEx Pro (the app) · $999 / month
//   RIGHT — Conference Mode (premium) · $6,000 one-time
// A deliberate upward swipe at the top returns to the templates (onExitTop). Marketing
// copy mirrors PricingDeck / ProPricing; no checkout/billing behaviour.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EASE, useViewport } from "../system.jsx";

import Footer from "./Footer.jsx";
export const PRICE_TOKENS = { BG: "#fbfcfe", NAVY: "#0a1b2e", SLATE: "#565f6e", COBALT: "#2563EB", MUTE: "#9aa1ad", SURFACE: "#eef1f6", PANEL: "#0b1220" };
const BG = "#fbfcfe";
const NAVY = "#0a1b2e";
const SLATE = "#565f6e";
const COBALT = "#2563EB";
const MUTE = "#9aa1ad";
const HAIR = "rgba(10,27,46,0.10)";
const DEMO = "/contact?plan=pro";
const GALLERY = "/conference-mode";

// Approved pricing. Monthly: $999/mo → $11,988 over 12 months, 12-month commitment.
// Annual: $849/mo equivalent → $10,188 paid upfront, saving $1,800 (~15%).
export const BILLING = {
  annual:  { price: "$849", per: "/ month", sub: "$10,188 billed annually — save $1,800", note: "Billed upfront · 12-month term" },
  monthly: { price: "$999", per: "/ month", sub: "$11,988 over 12 months",                note: "12-month commitment" },
};

const PRO = {
  eyebrow: "MineEx Pro · the app", lead: true,
  title: "Your complete investor experience.",
  features: [
    "The premium, interactive Pro Profile — thesis, projects, capital, timeline, leadership and media",
    "Project intelligence — snapshots, drill results and lifecycle stage",
    "Investors follow you; updates reach them in a personalized feed",
    "Press release publishing with AI-structured summaries",
    "Priority placement in Explore",
  ],
  cta: { label: "Get Started", href: DEMO },
};
const CONF = {
  eyebrow: "Conference Mode", price: "$6,000", per: "one-time", secondary: true,
  title: "An interactive investor presentation, built for your booth.",
  features: [
    "Interactive iPad investor presentation for your booth",
    "Investment thesis, key statistics and capital information",
    "Project presentation, jurisdiction and leadership",
    "Company imagery in a premium, designed template",
    "QR follow experience that connects investors on MineEx",
    "Works offline at the conference",
  ],
  note: "Premium design · Bespoke from $9,000", cta: { label: "Request Conference Mode", href: "/contact?plan=standard" },
};

// Monthly ⟷ Annually, as a switch (the reference's form). Buttons are type="button" with
// preventDefault, so a click can never navigate, submit, or reach the sheet's gesture gate.
export function BillingToggle({ value, onChange, dark, compact }) {
  const { mobile } = useViewport();
  const annual = value === "annual";
  const onInk  = dark ? "#fff" : NAVY;
  const offInk = dark ? "rgba(255,255,255,0.48)" : MUTE;
  const track  = dark ? "rgba(255,255,255,0.22)" : "rgba(10,27,46,0.18)";
  const label = (id, text) => (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(id); }}
      style={{ appearance: "none", border: 0, background: "none", cursor: "pointer",
        padding: 0, ...(mobile ? { minHeight: 44, minWidth: 44, display: "inline-grid", placeItems: "center" } : null),
        fontSize: mobile ? 15 : 12.5, fontWeight: 600, letterSpacing: "-0.01em",
        color: (id === "annual") === annual ? onInk : offInk }}>{text}</button>
  );
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      {label("monthly", "Monthly")}
      {/* On a phone the control itself is 44px tall — the coloured track is drawn inside it
          rather than being the hit box, so the switch is a real target without looking heavy. */}
      <button type="button" role="switch" aria-checked={annual} aria-label="Bill annually"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(annual ? "monthly" : "annual"); }}
        style={{ appearance: "none", border: 0, cursor: "pointer", padding: 0,
          width: mobile ? 50 : 38, height: mobile ? 44 : 22, borderRadius: 999, position: "relative",
          background: mobile ? "transparent" : (annual ? COBALT : track),
          transition: `background 220ms ${EASE}` }}>
        {mobile && (
          <span aria-hidden style={{ position: "absolute", top: 7, left: 0, width: 50, height: 30,
            borderRadius: 999, background: annual ? COBALT : track, transition: `background 220ms ${EASE}` }} />
        )}
        <span aria-hidden style={{ position: "absolute", top: mobile ? 11 : 3, left: mobile ? (annual ? 26 : 4) : (annual ? 19 : 3),
          width: mobile ? 22 : 16, height: mobile ? 22 : 16, borderRadius: 999, background: "#fff",
          boxShadow: "0 1px 2px rgba(10,27,46,0.28)", transition: `left 220ms ${EASE}` }} />
      </button>
      {label("annual", "Annually")}
      {!compact && <span style={{ fontSize: mobile ? 12.5 : 11, fontWeight: 700, letterSpacing: "-0.005em",
        color: dark ? "#9dc0ff" : COBALT, background: dark ? "rgba(37,99,235,0.26)" : "rgba(37,99,235,0.10)",
        borderRadius: 999, padding: "3px 8px" }}>Save 15%</span>}
    </div>
  );
}

// The one-time build, as a clearly separated block at the FOOT of a plan card.
// Deliberately not beside the subscription price: the monthly figure stays the dominant
// number, and this reads as what it is — real work with a finished deliverable, priced
// once — rather than an activation fee bolted onto the rate.
export function Setup({ amount, per = "one-time", qualifier, blurb, dark }) {
  const { mobile } = useViewport();
  const ink   = dark ? "#fff" : NAVY;
  const muted = dark ? "rgba(255,255,255,0.62)" : SLATE;
  const faint = dark ? "rgba(255,255,255,0.45)" : MUTE;
  const rule  = dark ? "rgba(255,255,255,0.14)" : "rgba(10,27,46,0.10)";
  return (
    <div style={{ marginTop: mobile ? 20 : "clamp(11px,1.6vh,16px)", paddingTop: mobile ? 16 : "clamp(10px,1.4vh,13px)", borderTop: `1px solid ${rule}` }}>
      <p style={{ margin: 0, fontSize: mobile ? 11.5 : 10.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: dark ? "#9dc0ff" : COBALT }}>Professional Setup</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: mobile ? 23 : 19, fontWeight: 700, letterSpacing: "-0.03em", color: ink }}>{amount}</span>
        {per && <span style={{ fontSize: mobile ? 14.5 : 12.5, fontWeight: 600, color: faint }}>{per}</span>}
        {qualifier && (
          <span style={{ fontSize: mobile ? 11 : 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            color: faint, border: `1px solid ${rule}`, borderRadius: 999, padding: "2px 7px" }}>{qualifier}</span>
        )}
      </div>
      {/* Reserved to the longest blurb (three lines) so the three cards' setup rules land on
          one line instead of stair-stepping — the blocks are bottom-anchored, so equal
          internal height is what aligns them. */}
      <p style={{ margin: mobile ? "8px 0 0" : "5px 0 0", fontSize: mobile ? 15 : 12.5, lineHeight: mobile ? "22px" : "17px", minHeight: mobile ? 0 : 34, color: muted }}>{blurb}</p>
    </div>
  );
}

// Scale-to-fit for a full-viewport pricing panel's content column.
//
// These panels CENTRE their content. A centred flex child that is taller than its box
// spills past BOTH ends, so on a short window the panel's heading slid up underneath the
// fixed nav. Padding cannot prevent that — overflow ignores it. So rather than let the
// content overflow, we measure its natural (untransformed) height against the space the
// panel actually has, and scale the whole column down to fit. Scaling keeps the design
// exactly as drawn — nothing reflows — and it never scales UP past 1.
export function Fit({ children }) {
  const ref = useRef(null);
  const [fit, setFit] = useState({ s: 1, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const measure = () => {
      // offsetHeight is the LAYOUT height — a transform does not change it — so this reads
      // the natural size every time and can never feed back on itself.
      const nat = el.offsetHeight;
      const panel = el.parentElement && el.parentElement.parentElement;
      if (!nat || !panel) return;
      const cs = getComputedStyle(panel);
      const avail = panel.clientHeight - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0) - 24;   // a little clear air under the nav
      if (!(avail > 0)) return;
      const s = nat > avail ? Math.max(0.62, avail / nat) : 1;
      setFit((prev) => (prev.s === s && prev.h === nat ? prev : { s, h: nat }));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  // A transform does not change the element's layout box, so a scaled column would still be
  // centred as though it were full height — a gap above, hanging off below. The outer box
  // therefore takes the SCALED height and the inner scales from its top edge, so the panel
  // centres what you can actually see.
  return (
    <div style={{ width: "100%", height: fit.s < 1 ? Math.round(fit.h * fit.s) : undefined }}>
      <div ref={ref} style={{ width: "100%", transform: fit.s < 1 ? `scale(${fit.s})` : "none", transformOrigin: "top center" }}>
        {children}
      </div>
    </div>
  );
}

export function Mark({ c = COBALT }) {
  return <svg aria-hidden width="11" height="11" viewBox="0 0 12 12" style={{ flexShrink: 0, marginTop: 4 }}><path d="M4 2.5l4 3.5-4 3.5" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// ONE plan column. `dark` is the featured MineEx Pro panel (near-black, white type);
// the other sits directly on the container's light-gray surface. Identical internal
// rhythm either way, so the two columns line up: name · description · toggle · price ·
// explanation · CTA · features · note.
function Plan({ name, desc, price, per, sub, features, note, cta, dark, control, children }) {
  const ink   = dark ? "#fff" : NAVY;
  const muted = dark ? "rgba(255,255,255,0.62)" : SLATE;
  const faint = dark ? "rgba(255,255,255,0.45)" : MUTE;
  const mark  = dark ? "#6ea8ff" : COBALT;
  return (
    <div style={{
      display: "flex", flexDirection: "column", borderRadius: 20,
      padding: "clamp(17px,1.5vw,24px)",
      background: dark ? "#0b1220" : "transparent",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 26, minHeight: 24 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: "clamp(17px,1.4vw,19px)", fontWeight: 700, letterSpacing: "-0.02em", color: ink }}>{name}</h3>
          <p style={{ margin: "5px 0 0", fontSize: 13.5, lineHeight: 1.4, color: muted, maxWidth: control ? "20ch" : "30ch", minHeight: 38 }}>{desc}</p>
        </div>
        {control && <div style={{ flexShrink: 0, marginTop: 1 }}>{control}</div>}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 13 }}>
        <span style={{ fontSize: "clamp(32px,2.9vw,42px)", fontWeight: 700, letterSpacing: "-0.035em", color: ink }}>{price}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: faint }}>{per}</span>
      </div>
      <p style={{ margin: "5px 0 0", fontSize: 12.5, color: muted, minHeight: 17 }}>{sub}</p>

      <a href={cta.href} className="sp-cta" style={{
        marginTop: 14, alignSelf: "flex-start",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        height: 38, padding: "0 22px", borderRadius: 999, textDecoration: "none",
        background: dark ? "#fff" : NAVY, color: dark ? NAVY : "#fff",
        fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", whiteSpace: "nowrap",
      }}>{cta.label}</a>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", color: muted, fontSize: 13, lineHeight: 1.4 }}>
            <Mark c={mark} /><span>{f}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 12, color: faint }}>{note}</p>
      {children}
    </div>
  );
}

export default function SalesPricing({ active, onExitTop, mobile }) {
  const [billing, setBilling] = useState("annual");   // annual selected by default
  // A deliberate upward swipe at the top returns to the template gallery. (Desktop only;
  // on mobile this renders as a normal stacked section with no gesture capture.)
  useEffect(() => {
    if (mobile || !active || !onExitTop) return;
    let accum = 0, last = 0, used = false;
    const onWheel = (e) => {
      const now = performance.now(), gap = now - last; last = now;
      if (gap > 90) { accum = 0; used = false; }
      e.preventDefault();
      if (used) return;
      if (e.deltaY < 0) { accum += e.deltaY; if (accum <= -18) { used = true; accum = 0; onExitTop(); } }
      else { accum = 0; }
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [active, onExitTop, mobile]);

  return (
    <div className="sp-panel" style={{ position: "absolute", inset: 0, background: BG, overflow: "hidden", display: "flex", flexDirection: "column", padding: `clamp(76px,9vh,96px) clamp(22px,5vw,64px) clamp(24px,3.4vh,48px)` }}>
      <Fit><div style={{ maxWidth: 1040, width: "100%", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <p className="mx-label" style={{ color: COBALT, letterSpacing: "0.22em", margin: 0 }}>Pricing</p>
        </div>
        <h2 className="mx-h2" style={{ margin: "12px 0 0", color: NAVY, maxWidth: "20ch" }}>Two ways to reach investors.</h2>
        <p style={{ color: SLATE, fontSize: "clamp(14.5px,1.1vw,16px)", marginTop: 10, maxWidth: "54ch" }}>Your always-on presence in the MineEx app, and a premium interactive booth for the conference floor.</p>
        {/* ONE container: a light-gray surface holding both options, so the section reads as a
            single designed object rather than two floating cards. */}
        <div style={{
          marginTop: "clamp(26px,4.6vh,54px)", background: "#eef1f6", borderRadius: 24,
          padding: "clamp(8px,0.7vw,12px)",
          display: "grid", gridTemplateColumns: mobile ? "1fr" : "1.02fr 1fr",
          gap: "clamp(8px,0.7vw,12px)", alignItems: "stretch",
        }}>
          <Plan dark name="MineEx Pro" desc="Your complete investor experience."
            price={BILLING[billing].price} per={BILLING[billing].per} sub={BILLING[billing].sub}
            features={PRO.features} note={BILLING[billing].note} cta={PRO.cta}
            control={<BillingToggle value={billing} onChange={setBilling} dark />}>
            <Setup amount="$2,500" blurb="We build your complete Pro Profile and press release history." dark />
          </Plan>
          <Plan name="Conference Mode" desc={CONF.title}
            price={CONF.price} per={CONF.per} sub="One-time build · no subscription"
            features={CONF.features} note={CONF.note} cta={CONF.cta}>
            <a href={GALLERY} style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 7, color: SLATE, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              Explore Templates <span aria-hidden>→</span>
            </a>
          </Plan>
        </div>
        {/* This screen shows the two headline options. Everything else — Basic, Fully Managed
            Pro, Bespoke Conference Mode, website design — lives on the full pricing page. */}
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 18, flexWrap: "wrap" }}>
          <a href="/pricing" className="sp-cta" style={{ display: "inline-flex", alignItems: "center", gap: 8,
            height: 40, padding: "0 20px", borderRadius: 999, border: `1px solid ${HAIR}`, background: "#fff",
            color: NAVY, fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em", textDecoration: "none" }}>
            See all plans <span aria-hidden>→</span>
          </a>
          <a href="/contact?plan=general" style={{ fontSize: 13, color: SLATE, textDecoration: "underline" }}>Talk to us</a>
        </div>
        {!mobile && <p style={{ marginTop: 14, textAlign: "center", fontSize: 12.5, color: MUTE, letterSpacing: "0.06em" }}>↑ Swipe up to go back</p>}
        <Footer compact />
      </div></Fit>
      <style>{`
        .sp-cta { transition: transform 160ms ${EASE}, box-shadow 160ms ${EASE}; }
        .sp-cta:hover { transform: translateY(-1px); box-shadow: 0 16px 34px -18px rgba(10,27,46,0.5); }
        /* Two declarations on purpose: browsers that understand "safe" keep an overflowing
           panel below the nav instead of centring it up under the logo; the rest fall back
           to plain centring, which Fit has already made safe. */
        .sp-panel { justify-content: center; justify-content: safe center; }
      `}</style>
    </div>
  );
}
