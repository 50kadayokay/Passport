// ─────────────────────────────────────────────────────────────────────────────
// ProPricing — the Pricing tab content (anchored #pricing; the top-nav "Pricing" link
// scrolls here, and the Pro page lifts it as its closing sheet). The full MineEx
// commercial offering, in two DISTINCT categories:
//   1) MEMBERSHIPS         — Basic $299/mo · Pro $999/mo (featured) · Fully Managed Pro (quote)
//   2) ADDITIONAL SERVICES — Standard Conference Mode $6,000 ·
//                            Bespoke Conference Mode $9,000 · Custom Website Design (quote)
//
// VISUAL LANGUAGE: deliberately the same as SalesPricing (the sales page's closing pricing
// screen) — a light page, each category held in ONE light-gray surface so it reads as a
// single designed object rather than a row of floating cards, the featured plan as a
// near-black panel inside that surface, chevron marks, and the same type scale, pill CTA
// and billing switch. The switch, the approved billing figures, the mark and the palette
// are IMPORTED from SalesPricing rather than copied, so the two screens cannot drift apart.
//
// Prices and feature copy are unchanged from the verified source of truth. The billing
// switch changes the Pro membership only — exactly as on the sales page — because annual
// figures are approved for Pro alone; Basic and Fully Managed keep their monthly terms.
// Marketing content only; no backend or pricing logic anywhere else.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { EASE } from "../system.jsx";
import { BILLING, BillingToggle, Mark, PRICE_TOKENS as T, Setup } from "./SalesPricing.jsx";

// Re-exported so the pricing deck keeps importing its card parts from one place.
export { Setup };

// ── MEMBERSHIPS ──────────────────────────────────────────────────────────────
const MEMBERSHIPS = [
  {
    name: "Basic",
    price: "$299", per: "/ month", note: "12-month agreement",
    blurb: "Build your company's presence on MineEx.",
    features: [
      "Company Overview",
      "Company Timeline",
      "Core company information — tickers & exchanges, commodity and jurisdiction",
      "Discovered by investors in MineEx Explore & Search",
      "Investor-facing mobile profile",
      "Company Portal to manage your profile",
      "Press releases ingested into your Timeline",
    ],
    setup: { amount: "$1,500", qualifier: "Optional", blurb: "We build your Basic profile and historical Timeline — or set it up yourself for $0." },
    cta: { label: "Get Started", href: "/contact?plan=basic" },
  },
  {
    name: "Pro",
    badge: "Recommended", featured: true,
    blurb: "Turn investor interest into a lasting connection.",
    inherits: "Everything in Basic, plus:",
    features: [
      "The premium, interactive Pro Profile — investment thesis, projects, capital structure, timeline, leadership and media",
      "Project intelligence — project snapshots, drill results and lifecycle stage",
      "Investors can follow your company, and your updates reach them in a personalized feed",
      "Publishing tools — upload press releases with AI-structured summaries, then review and publish to the MineEx feed and your timeline",
      "Media publishing",
      "Priority placement in Explore",
    ],
    setup: { amount: "$2,500", blurb: "We build your complete Pro Profile and press release history." },
    cta: { label: "Get Started", href: "/contact?plan=pro" },
  },
  {
    name: "Fully Managed Pro",
    // Confirmed 2026-10-04: $2,999/month "starting at" is the accurate figure. This screen
    // previously said "Request a Quote", which disagreed with the Pricing page. The "Starting
    // at" qualifier is part of the price — never show $2,999 as a flat rate.
    pre: "Starting at", price: "$2,999", per: "/ month", note: "",
    blurb: "MineEx, managed for you.",
    inherits: "Everything in Pro, plus:",
    features: [
      "We build and maintain your Pro Profile for you",
      "We keep your company information up to date",
      "We publish your press releases, summaries and media",
      "We manage your company timeline",
      "Ongoing investor-facing content support",
    ],
    setup: { amount: "Included", per: "", blurb: "No separate setup charge." },
    cta: { label: "Contact Us", href: "/contact?plan=managed" },
  },
];

// ── ADDITIONAL SERVICES ──────────────────────────────────────────────────────
const SERVICES = [
  {
    name: "Standard Conference Mode",
    price: "$6,000", per: "one-time", note: "One-time build · no subscription",
    blurb: "Turn your conference booth into an investor experience.",
    features: [
      "Interactive iPad investor presentation for your booth",
      "Investment thesis, key statistics and capital information",
      "Project presentation, jurisdiction and leadership",
      "Company imagery in a professionally designed MineEx template",
      "QR follow experience that connects investors back on MineEx",
      "Works offline at the conference",
    ],
    cta: { label: "Request Conference Mode", href: "/contact?plan=standard" },
  },
  {
    name: "Bespoke Conference Mode",
    price: "$9,000", per: "one-time", note: "One-time build · no subscription",
    blurb: "A Conference Mode experience built specifically for your company.",
    features: [
      "Custom visual direction and company-specific storytelling",
      "Bespoke presentation structure, layouts and interactions",
      "Your company branding throughout",
      "Project-focused, investor-ready presentation",
      "QR investor capture and follow, connecting back on MineEx",
      "iPad conference experience, built around your company",
    ],
    aside: "Standard uses a professionally designed MineEx template. Bespoke is designed specifically around your company.",
    cta: { label: "Inquire", href: "/contact?plan=bespoke" },
  },
  {
    name: "Custom Website Design",
    price: "Request a Quote", per: "", note: "", quote: true,
    blurb: "Custom websites built for junior mining companies.",
    features: [
      "Fully custom website design with mining-specific structure",
      "Investor-focused experience — projects, corporate and investor information",
      "News and press releases, leadership, capital and media",
      "Responsive desktop and mobile design",
      "Straightforward company-side content management",
    ],
    cta: { label: "Request a Quote", href: "/contact?plan=website" },
  },
];

// The bespoke build's wash — a light cobalt, distinct from the featured plan's dark panel.
export const BESPOKE_TINT = "rgba(37,99,235,0.06)";

// ONE card. `dark` is the featured panel (near-black, white type); every other card sits
// directly on the container's gray surface. Identical internal rhythm either way, so the
// columns line up: name · description · price · term · CTA · features · note.
export function Plan({ name, badge, blurb, price, per, pre, sub, features, inherits, note, cta, dark, control, quote, tint, compactPrice, children }) {
  const ink   = dark ? "#fff" : T.NAVY;
  const muted = dark ? "rgba(255,255,255,0.62)" : T.SLATE;
  const faint = dark ? "rgba(255,255,255,0.45)" : T.MUTE;
  const mark  = dark ? "#6ea8ff" : T.COBALT;
  return (
    <div style={{
      display: "flex", flexDirection: "column", borderRadius: 20,
      padding: "clamp(16px, min(1.6vw, 2.3vh), 26px)",
      // `dark` is the featured plan's near-black panel. `tint` is a lighter, separate signal
      // for a plan that is simply DIFFERENT in kind rather than recommended — the bespoke
      // build — so the two never read as competing for the same "pick me" slot.
      background: dark ? T.PANEL : (tint || "transparent"),
      ...(tint ? { boxShadow: `inset 0 0 0 1px rgba(37,99,235,0.16)` } : null),
    }}>
      {/* Wraps rather than colliding: in a three-up grid the plan name, its badge and the
          billing switch can exceed one line, and "RECOMMENDED Monthly" running together is
          worse than the switch dropping to its own row. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, rowGap: 10, flexWrap: "wrap", minHeight: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: "clamp(17px,1.4vw,19px)", fontWeight: 700, letterSpacing: "-0.02em", color: ink, whiteSpace: "nowrap" }}>{name}</h3>
          {badge && (
            <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap",
              color: "#9dc0ff", background: "rgba(37,99,235,0.26)", borderRadius: 999, padding: "3px 8px" }}>{badge}</span>
          )}
        </div>
        {control && <div style={{ flexShrink: 0, marginLeft: "auto" }}>{control}</div>}
      </div>
      <p style={{ margin: "7px 0 0", fontSize: 13.5, lineHeight: 1.4, color: muted, minHeight: "clamp(19px, 3.6vh, 38px)" }}>{blurb}</p>

      {/* The price row is pinned to the PRICED line-height, so a "Request a Quote" card —
          whose type is smaller — still leaves its CTA, features and note exactly level with
          the priced cards beside it. An explicit line-height makes that height predictable
          at every viewport instead of depending on the font's default line box. */}
      {!compactPrice && <p style={{ margin: "clamp(9px,1.3vh,13px) 0 -4px", fontSize: 12.5, lineHeight: "18px", minHeight: 18, fontWeight: 600, color: faint }}>{pre || "\u00a0"}</p>}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: compactPrice ? 10 : "clamp(9px,1.3vh,13px)",
        minHeight: compactPrice ? 0 : "calc(clamp(30px, min(2.9vw, 4.2vh), 42px) * 1.2)" }}>
        <span style={{ fontSize: compactPrice ? "clamp(20px,1.7vw,24px)" : (quote ? "clamp(24px,2.1vw,30px)" : "clamp(30px, min(2.9vw, 4.2vh), 42px)"), lineHeight: 1.2, fontWeight: 700, letterSpacing: "-0.035em", color: ink }}>{price}</span>
        {per && <span style={{ fontSize: 13.5, fontWeight: 600, color: faint }}>{per}</span>}
      </div>
      <p style={{ margin: "5px 0 0", fontSize: 12.5, lineHeight: 1.5, color: muted, minHeight: 19 }}>{sub}</p>

      <a href={cta.href} className="sp-cta" style={{
        marginTop: "clamp(10px,1.5vh,14px)", alignSelf: "flex-start",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        height: 38, padding: "0 22px", borderRadius: 999, textDecoration: "none",
        background: dark ? "#fff" : T.NAVY, color: dark ? T.NAVY : "#fff",
        fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", whiteSpace: "nowrap",
      }}>{cta.label}</a>

      <div style={{ marginTop: "clamp(10px,1.5vh,14px)", display: "flex", flexDirection: "column", gap: "clamp(5px,0.75vh,6px)", flex: 1 }}>
        {inherits && <p style={{ margin: "0 0 2px", fontSize: 12.5, fontWeight: 700, letterSpacing: "-0.01em", color: ink }}>{inherits}</p>}
        {features.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", color: muted, fontSize: 13, lineHeight: 1.4 }}>
            <Mark c={mark} /><span>{f}</span>
          </div>
        ))}
      </div>

      {note && <p style={{ margin: "12px 0 0", fontSize: 12, color: faint }}>{note}</p>}
      {children}
    </div>
  );
}

// A highlighted price inside a card — the Pro member's Conference Mode rate, from both sides.
export function InlineOffer({ label, price, was, note, dark }) {
  const ink = dark ? "#fff" : T.NAVY;
  return (
    <div style={{
      marginTop: 14, padding: "12px 14px", borderRadius: 14,
      background: dark ? "rgba(255,255,255,0.07)" : "rgba(37,99,235,0.07)",
      border: `1px solid ${dark ? "rgba(255,255,255,0.14)" : "rgba(37,99,235,0.18)"}`,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: dark ? "#9dc0ff" : T.COBALT }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <span style={{ color: ink, fontWeight: 700, fontSize: 21, letterSpacing: "-0.03em" }}>{price}</span>
        {was && <span style={{ color: dark ? "rgba(255,255,255,0.45)" : T.MUTE, fontSize: 13, textDecoration: "line-through" }}>{was}</span>}
      </div>
      <div style={{ color: dark ? "rgba(255,255,255,0.62)" : T.SLATE, fontSize: 12.5, marginTop: 3 }}>{note}</div>
    </div>
  );
}

export function SectionHead({ index, label, title, blurb }) {
  return (
    <div style={{ maxWidth: 640 }}>
      <p className="mx-label" style={{ color: T.COBALT, letterSpacing: "0.22em", margin: 0 }}>
        <span style={{ color: T.MUTE, fontWeight: 700 }}>{index}</span>&nbsp;&nbsp;{label}
      </p>
      <h2 className="mx-h2" style={{ marginTop: 12, color: T.NAVY }}>{title}</h2>
      <p style={{ color: T.SLATE, fontSize: "clamp(14.5px,1.1vw,16px)", marginTop: 12, maxWidth: "58ch" }}>{blurb}</p>
    </div>
  );
}

// The gray surface each category sits on — one designed object, as on the sales page.
export function Surface({ children, cols }) {
  return (
    <div className="mx-price-grid" style={{
      marginTop: "clamp(18px,2.6vw,30px)", background: T.SURFACE, borderRadius: 24,
      padding: "clamp(8px,0.7vw,12px)",
      display: "grid", gridTemplateColumns: cols,
      gap: "clamp(8px,0.7vw,12px)", alignItems: "stretch",
    }}>{children}</div>
  );
}

export default function ProPricing() {
  const [billing, setBilling] = useState("annual");   // annual selected by default
  const b = BILLING[billing];

  return (
    <section id="pricing" style={{ background: T.BG, padding: "clamp(80px,10vw,120px) clamp(22px,5vw,64px) clamp(96px,12vw,140px)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <p className="mx-label" style={{ color: T.COBALT, letterSpacing: "0.22em", margin: 0 }}>Pricing</p>
        <h2 className="mx-h2" style={{ marginTop: 12, color: T.NAVY, maxWidth: "20ch" }}>Everything MineEx offers, in one place.</h2>

        {/* ── 1 · MEMBERSHIPS ── */}
        <div style={{ marginTop: "clamp(44px,5.5vw,68px)" }}>
          <SectionHead
            index="01" label="MEMBERSHIPS" title="Memberships"
            blurb="A MineEx membership gives your company an investor-facing presence on MineEx — and the tools to communicate with investors and keep their attention after the first look."
          />
          {/* Pro's column is wider so the billing switch sits beside the plan name, as it
              does on the sales page, rather than wrapping underneath it. */}
          <Surface cols="1fr 1.26fr 1fr">
            {MEMBERSHIPS.map((t) => t.featured ? (
              <Plan key={t.name} dark name={t.name} badge={t.badge} blurb={t.blurb}
                price={b.price} per={b.per} sub={b.sub} note={b.note}
                inherits={t.inherits} features={t.features} cta={t.cta}
                control={<BillingToggle value={billing} onChange={setBilling} dark compact />}>
                <Setup {...t.setup} dark />
              </Plan>
            ) : (
              <Plan key={t.name} name={t.name} blurb={t.blurb} quote={t.quote} pre={t.pre}
                price={t.price} per={t.per} sub={t.note} inherits={t.inherits}
                features={t.features} cta={t.cta}>
                <Setup {...t.setup} />
              </Plan>
            ))}
          </Surface>
        </div>

        {/* ── 2 · ADDITIONAL SERVICES ── */}
        <div style={{ marginTop: "clamp(52px,6.5vw,80px)" }}>
          <SectionHead
            index="02" label="ADDITIONAL SERVICES" title="Additional Services"
            blurb="Premium MineEx services for companies that want more — an interactive conference presentation, or a custom website built for junior mining."
          />
          <Surface cols="1fr 1fr 1fr">
            {SERVICES.map((s) => (
              <Plan key={s.name} name={s.name} blurb={s.blurb} quote={s.quote}
                price={s.price} per={s.per} sub={s.note} features={s.features} cta={s.cta}
                note={s.aside} tint={/Bespoke/.test(s.name) ? BESPOKE_TINT : undefined} />
            ))}
          </Surface>
        </div>

        {/* Contact block — the page's closing action, rather than a sentence of small print.
            Every plan CTA above lands on the same page with its plan pre-selected. */}
        <div style={{ marginTop: "clamp(44px,5.5vw,68px)", background: T.SURFACE, borderRadius: 24, padding: "clamp(8px,0.7vw,12px)" }}>
          <div style={{ borderRadius: 20, padding: "clamp(24px,3vw,40px)", display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: "clamp(19px,1.7vw,23px)", fontWeight: 700, letterSpacing: "-0.025em", color: T.NAVY }}>
                Not sure which plan fits?
              </h3>
              <p style={{ margin: "7px 0 0", fontSize: 14, lineHeight: 1.45, color: T.SLATE, maxWidth: "52ch" }}>
                Tell us about your company and we'll point you to the right one — usually the same day.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <a href="/contact?plan=general" className="sp-cta" style={{ display: "inline-flex", alignItems: "center",
                justifyContent: "center", height: 46, padding: "0 28px", borderRadius: 999, background: T.NAVY, color: "#fff",
                fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", textDecoration: "none" }}>Contact us</a>
              <a href="mailto:support@mineex.ca" style={{ fontSize: 13, color: T.SLATE, textDecoration: "underline" }}>support@mineex.ca</a>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .sp-cta { transition: transform 160ms ${EASE}, box-shadow 160ms ${EASE}; }
        .sp-cta:hover { transform: translateY(-1px); box-shadow: 0 16px 34px -18px rgba(10,27,46,0.5); }
        @media (max-width: 860px) { .mx-price-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}
