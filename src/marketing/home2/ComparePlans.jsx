// ─────────────────────────────────────────────────────────────────────────────
// ComparePlans (/compare) — the exhaustive comparison of the MineEx APP
// subscriptions ONLY: Basic · Pro · Fully Managed. No Conference Mode, Websites or any
// standalone service. Six consolidated categories, qualitative cells (not just checks),
// info-icon tooltips for non-obvious features, restrained cobalt for Pro.
//
// The three-way story, obvious in five seconds:
//   Basic          — establish your company's presence on MineEx.
//   Pro            — a complete, interactive investor experience + follower relationship.
//   Fully Managed  — everything in Pro, managed and maintained by MineEx (a SERVICE layer,
//                    not exclusive software).
//
// Grounded in the verified pricing definition (ProPricing.jsx) + confirmed product truth:
// Basic = overview + timeline pages + QR code only; push notifications on all tiers;
// AI Brief on Pro & Fully Managed. Marketing-layer only — no billing/product changes.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";
import { EASE, MarketingStyles, useViewport } from "../system.jsx";
import Nav from "./Nav.jsx";

import Footer from "./Footer.jsx";
const BG = "#fbfcfe";
const NAVY = "#0a1b2e";
const SLATE = "#565f6e";
const COBALT = "#2563EB";
const MUTE = "#9aa1ad";
const HAIR = "rgba(10,27,46,0.10)";
const PRO_TINT = "rgba(37,99,235,0.045)";
const MAXW = 1180;
// The current inquiry experience — NOT "/site#demo", which renders the legacy home.
const DEMO = "/contact?plan=general";
const NAV_H = 64;

const PLANS = [
  { key: "basic", label: "Basic", price: "$299", per: "/mo", blurb: "Establish your company’s presence on MineEx." },
  { key: "pro", label: "Pro", price: "$999", per: "/mo", lead: true, blurb: "A complete, interactive investor experience with an ongoing follower relationship." },
  { key: "managed", label: "Fully Managed", price: "From $2,999", per: "/mo", blurb: "Everything in Pro, managed and maintained by MineEx." },
];

// value tokens: "✓" included · "—" not included · string = qualitative
// rows: [feature, basic, pro, managed, info?]
const CATS = [
  { id: "presence", n: "01", title: "Company Presence", rows: [
    ["MineEx listing", "✓", "✓", "✓"],
    ["Search & Explore visibility", "✓", "✓", "✓"],
    ["Standard company profile", "Overview + timeline", "✓", "✓", "Basic includes a company overview page and a timeline page."],
    ["Company information", "✓", "✓", "✓", "Tickers, exchanges, commodity and jurisdiction."],
    ["Company status & timeline", "Press releases ingested", "Self-managed", "Managed by MineEx", "Basic's press releases are ingested into its timeline. Pro companies manage their own; Fully Managed is maintained by MineEx."],
    ["QR code to your profile", "✓", "✓", "✓", "A shareable QR code that opens your MineEx company profile."],
    ["Company Portal access", "✓", "✓", "Managed by MineEx"],
  ] },
  { id: "pro-profile", n: "02", title: "Pro Profile & Investor Experience", rows: [
    ["Premium interactive Pro Profile", "—", "✓", "Maintained by MineEx", "A rich, interactive investor profile — thesis, projects, capital, leadership and media in one experience."],
    ["Company overview & investment thesis", "Overview only", "✓", "✓"],
    ["Detailed project presentation", "—", "✓", "✓"],
    ["Project intelligence & drill results", "—", "✓", "✓", "Structured project snapshots, drill results and lifecycle stage."],
    ["Capital structure", "—", "✓", "✓"],
    ["Leadership", "—", "✓", "✓"],
    ["Media & company progress", "—", "✓", "Managed by MineEx"],
    ["AI Brief", "—", "✓", "✓", "An AI-generated briefing that structures your company’s story and key information."],
  ] },
  { id: "following", n: "03", title: "Investor Following & Discovery", rows: [
    ["Investor following", "—", "✓", "✓", "Investors can follow your company and keep that connection on MineEx."],
    ["Company updates delivered to followers", "—", "✓", "✓"],
    ["Push notifications", "✓", "✓", "✓"],
    ["Enhanced discovery & priority placement", "—", "✓", "✓", "Priority placement in Explore so more investors discover your company."],
  ] },
  { id: "publishing", n: "04", title: "Publishing & Content", rows: [
    ["Press-release publishing", "—", "Via Company Portal", "Handled by MineEx"],
    ["AI-assisted summaries", "—", "✓", "Prepared by MineEx", "Press releases are automatically structured into clean investor summaries."],
    ["Media publishing", "—", "✓", "Handled by MineEx"],
    ["Company updates", "—", "Self-published", "Managed by MineEx"],
    ["Press releases added to your timeline", "—", "✓", "✓"],
    ["Publishing through the Company Portal", "—", "✓", "Handled by MineEx"],
  ] },
  { id: "portal", n: "05", title: "Company Portal & Control", rows: [
    ["Profile management", "Self-managed", "Self-managed", "Managed by MineEx"],
    ["Project information management", "—", "Self-managed", "Managed by MineEx"],
    ["Press-release management", "—", "Self-managed", "Managed by MineEx"],
    ["Media management", "—", "Self-managed", "Managed by MineEx"],
    ["Publishing controls", "—", "✓", "Handled by MineEx"],
  ] },
  { id: "management", n: "06", title: "Management & Support", rows: [
    ["Self-managed account", "✓", "✓", "MineEx-managed"],
    ["Professional Setup (one-time)", "$1,500 · optional", "$2,500 · required", "Included", "The one-time build: we populate your profile and your historical timeline. Basic companies may set theirs up themselves at no cost; Pro is always built by MineEx."],
    ["Profile setup & maintenance", "Self-managed", "Built by MineEx, then self-managed", "Built & maintained by MineEx"],
    ["Press-release publishing handled by MineEx", "—", "—", "✓"],
    ["Media & content management", "Self-managed", "Self-managed", "Handled by MineEx"],
    ["Timeline maintenance", "Self-managed", "Self-managed", "Maintained by MineEx"],
    ["Ongoing investor-facing content support", "—", "—", "✓"],
  ] },
];

function Info({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 6 }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={text} onClick={() => setOpen((o) => !o)} className="cmp-info"
        style={{ width: 16, height: 16, borderRadius: 999, border: `1px solid ${HAIR}`, background: "transparent", color: MUTE, cursor: "pointer", padding: 0, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 800, fontStyle: "italic", lineHeight: 1 }}>i</button>
      {open && (
        <span role="tooltip" style={{ position: "absolute", bottom: "calc(100% + 8px)", left: -8, width: 236, background: NAVY, color: "#fff", fontSize: 12.5, lineHeight: 1.45, fontWeight: 500, padding: "10px 12px", borderRadius: 10, boxShadow: "0 18px 40px -18px rgba(10,27,46,0.5)", zIndex: 60 }}>{text}</span>
      )}
    </span>
  );
}
function Cell({ v, dim }) {
  if (v === "✓") return <span aria-label="Included" style={{ color: COBALT, fontWeight: 700 }}>✓</span>;
  if (v === "—" || v === "" || v == null) return <span aria-label="Not included" style={{ color: "rgba(10,27,46,0.28)" }}>—</span>;
  return <span style={{ color: dim ? SLATE : NAVY, fontWeight: 500 }}>{v}</span>;
}

export default function ComparePlans() {
  const { mobile } = useViewport();
  const gut = "clamp(22px,5vw,64px)";
  const [stuck, setStuck] = useState(false);
  const [mplan, setMplan] = useState(1);
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current; if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: `-${NAV_H + 1}px 0px 0px 0px`, threshold: 0 });
    io.observe(el); return () => io.disconnect();
  }, []);
  const COLS = "minmax(0,1.7fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)";

  const stickyHeader = (
    <div style={{ position: "sticky", top: NAV_H, zIndex: 40, background: "rgba(251,252,254,0.92)", backdropFilter: "saturate(1.2) blur(12px)", WebkitBackdropFilter: "saturate(1.2) blur(12px)", borderBottom: `1px solid ${stuck ? HAIR : "transparent"}`, transition: `border-color 240ms ${EASE}` }}>
      <div style={{ maxWidth: MAXW, margin: "0 auto", padding: `10px ${gut}`, display: "grid", gridTemplateColumns: COLS, alignItems: "end", columnGap: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE }}>Feature</div>
        {PLANS.map((p) => (
          <div key={p.key} style={{ position: "relative", padding: "6px 12px 8px", background: p.lead ? PRO_TINT : "transparent", borderRadius: "8px 8px 0 0" }}>
            {p.lead && <span aria-hidden style={{ position: "absolute", top: 0, left: 12, right: 12, height: 2, background: COBALT, borderRadius: 2 }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: p.lead ? COBALT : NAVY }}>{p.label}</span>
              {p.lead && <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: COBALT, border: `1px solid ${COBALT}`, borderRadius: 999, padding: "1px 5px" }}>Rec</span>}
            </div>
            <div style={{ marginTop: 1, color: NAVY, fontWeight: 700, fontSize: 14.5 }}>{p.price}<span style={{ color: MUTE, fontWeight: 500, fontSize: 11.5 }}> {p.per}</span></div>
          </div>
        ))}
      </div>
    </div>
  );

  const table = CATS.map((c) => (
    <section key={c.id} id={c.id} style={{ scrollMarginTop: NAV_H + 70 }}>
      <div style={{ maxWidth: MAXW, margin: "0 auto", padding: `clamp(34px,4vw,52px) ${gut} 12px`, display: "flex", alignItems: "baseline", gap: 13 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: MUTE, fontVariantNumeric: "tabular-nums" }}>{c.n}</span>
        <h2 style={{ margin: 0, color: NAVY, fontWeight: 700, letterSpacing: "-0.02em", fontSize: "clamp(19px,1.9vw,26px)" }}>{c.title}</h2>
      </div>
      <div style={{ maxWidth: MAXW, margin: "0 auto", padding: `0 ${gut}` }}>
        {c.rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: COLS, columnGap: 20, alignItems: "start", padding: "13px 0", borderTop: `1px solid ${HAIR}` }}>
            <div style={{ color: NAVY, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", paddingRight: 12 }}>{r[0]}{r[4] && <Info text={r[4]} />}</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.4, padding: "0 12px" }}><Cell v={r[1]} dim /></div>
            <div style={{ fontSize: 14.5, lineHeight: 1.4, padding: "1px 12px 3px", background: PRO_TINT, borderRadius: 4 }}><Cell v={r[2]} /></div>
            <div style={{ fontSize: 14.5, lineHeight: 1.4, padding: "0 12px" }}><Cell v={r[3]} dim /></div>
          </div>
        ))}
      </div>
    </section>
  ));

  const mobileView = (
    <>
      <div style={{ position: "sticky", top: NAV_H, zIndex: 40, background: "rgba(251,252,254,0.95)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: `1px solid ${HAIR}`, padding: `10px ${gut}` }}>
        <div style={{ display: "flex", gap: 6, background: "#eef0f4", borderRadius: 999, padding: 4 }}>
          {PLANS.map((p, k) => (
            <button key={p.key} type="button" onClick={() => setMplan(k)} style={{ flex: 1, border: "none", cursor: "pointer", borderRadius: 999, padding: "9px 6px", minHeight: 52, fontSize: 14, fontWeight: 700,
              background: mplan === k ? "#fff" : "transparent", color: mplan === k ? (p.lead ? COBALT : NAVY) : SLATE, boxShadow: mplan === k ? "0 1px 3px rgba(10,27,46,0.12)" : "none" }}>
              {p.label}<div style={{ fontSize: 12, fontWeight: 600, color: MUTE, marginTop: 2 }}>{p.price} {p.per}</div>
            </button>
          ))}
        </div>
      </div>
      {CATS.map((c) => (
        <section key={c.id} id={c.id} style={{ scrollMarginTop: NAV_H + 76, padding: `clamp(28px,7vw,40px) ${gut} 4px` }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 11, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: MUTE }}>{c.n}</span>
            <h2 style={{ margin: 0, color: NAVY, fontWeight: 700, letterSpacing: "-0.02em", fontSize: 23 }}>{c.title}</h2>
          </div>
          {c.rows.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, padding: "15px 0", borderTop: `1px solid ${HAIR}` }}>
              <span style={{ color: NAVY, fontSize: 16, lineHeight: 1.4, fontWeight: 600, flex: 1 }}>{r[0]}{r[4] && <Info text={r[4]} />}</span>
              <span style={{ fontSize: 15.5, lineHeight: 1.4, textAlign: "right", flex: "0 0 46%" }}><Cell v={r[mplan + 1]} /></span>
            </div>
          ))}
        </section>
      ))}
    </>
  );

  return (
    <div className="mx-root mx-compare" id="top" style={{ background: BG, minHeight: "100vh", color: NAVY }}>
      <MarketingStyles />
      <style>{`
        html{scroll-behavior:smooth}
        .cmp-arrow:hover .cmp-arw{transform:translateX(4px)}
        /* The info mark stays a quiet 16px dot; the tappable area around it is 44px. */
        .cmp-info { position: relative; }
        .cmp-info::after { content: ""; position: absolute; inset: -14px; }
        @media (max-width: 759px) {
          .cmp-arrow { min-height: 44px; }
        }
      `}</style>
      <Nav />
      <main>
        {/* ── TOP ── */}
        <section style={{ maxWidth: MAXW, margin: "0 auto", padding: `clamp(104px,12vh,140px) ${gut} clamp(24px,3vh,36px)` }}>
          <p className="mx-label" style={{ color: COBALT, letterSpacing: "0.24em", margin: 0 }}>MINEEX APP</p>
          <h1 style={{ margin: "16px 0 0", color: NAVY, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.02, fontSize: "clamp(36px,4.8vw,62px)" }}>Compare our plans.</h1>
          <p style={{ color: SLATE, fontSize: "clamp(16px,1.4vw,19px)", marginTop: 18, maxWidth: "58ch", lineHeight: 1.55 }}>
            Explore what’s included with each MineEx subscription, from establishing your presence to a fully managed investor experience.
          </p>
          {/* balanced plan header with the 3-way distinction */}
          <div style={{ marginTop: "clamp(32px,4vw,52px)", display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3,1fr)", gap: mobile ? 14 : 0, borderTop: `1px solid ${HAIR}` }}>
            {PLANS.map((p, i) => (
              <div key={p.key} style={{ position: "relative", padding: mobile ? "18px 0 0" : "24px clamp(20px,2vw,34px) 22px", borderLeft: (!mobile && i > 0) ? `1px solid ${HAIR}` : "none", background: p.lead ? PRO_TINT : "transparent" }}>
                {p.lead && <span aria-hidden style={{ position: "absolute", top: 0, left: mobile ? 0 : "clamp(20px,2vw,34px)", right: mobile ? 0 : "clamp(20px,2vw,34px)", height: 2, background: COBALT, borderRadius: 2 }} />}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: p.lead ? COBALT : MUTE }}>{p.label}</span>
                  {p.lead && <span style={{ fontSize: mobile ? 11 : 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: COBALT, border: `1px solid ${COBALT}`, borderRadius: 999, padding: "2px 6px" }}>Recommended</span>}
                </div>
                <div style={{ color: NAVY, fontWeight: 700, letterSpacing: "-0.02em", fontSize: "clamp(24px,2.2vw,32px)", marginTop: 10 }}>{p.price}<span style={{ color: MUTE, fontWeight: 500, fontSize: 15 }}> / month{p.key === "managed" ? "" : ""}</span></div>
                <div style={{ color: MUTE, fontSize: mobile ? 14 : 12.5, marginTop: 5 }}>{p.key === "managed" ? "Starting price · custom scope" : "12-month agreement"}</div>
                <p style={{ color: SLATE, fontSize: mobile ? 16 : 14, lineHeight: 1.5, marginTop: 14, maxWidth: "30ch" }}>{p.blurb}</p>
              </div>
            ))}
          </div>
        </section>

        <div ref={sentinelRef} aria-hidden />
        {mobile ? mobileView : (<>{stickyHeader}{table}</>)}

        {/* ── DECISION ── */}
        <section style={{ maxWidth: MAXW, margin: "clamp(48px,6vw,80px) auto 0", padding: `clamp(48px,6vw,80px) ${gut} clamp(18px,3vh,28px)`, borderTop: `1px solid ${HAIR}` }}>
          <h2 style={{ margin: 0, color: NAVY, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.02, fontSize: "clamp(28px,3.4vw,48px)", maxWidth: "16ch" }}>Choose the plan that fits your company.</h2>
          <div style={{ marginTop: "clamp(26px,3vw,42px)", display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3,1fr)", gap: mobile ? 18 : "clamp(24px,4vw,64px)" }}>
            {[["Basic", "Get Started"], ["Pro", "Go Pro"], ["Fully Managed", "Talk to Us"]].map(([l, cta], i) => (
              <div key={l} style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: i === 1 ? COBALT : MUTE }}>{l}</div>
                <div style={{ marginTop: 12 }}>
                  <a href={DEMO} className="cmp-arrow" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: NAVY, fontSize: 16, fontWeight: 700, textDecoration: "none" }}>{cta} <span aria-hidden className="cmp-arw" style={{ transition: `transform 220ms ${EASE}` }}>→</span></a>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CLOSING CTA ── */}
        <section style={{ maxWidth: MAXW, margin: "0 auto", padding: `clamp(36px,4vw,56px) ${gut} clamp(64px,9vh,110px)` }}>
          <div style={{ maxWidth: "52ch" }}>
            <div style={{ color: NAVY, fontSize: "clamp(17px,1.5vw,20px)", fontWeight: 600, letterSpacing: "-0.01em" }}>Still have questions?</div>
            <p style={{ color: SLATE, fontSize: "clamp(14.5px,1.2vw,16.5px)", lineHeight: 1.55, marginTop: 8 }}>Let us walk you through MineEx and help you understand the differences between our plans.</p>
            <div style={{ marginTop: 16 }}>
              <a href={DEMO} className="cmp-arrow" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: COBALT, fontSize: 15.5, fontWeight: 700, textDecoration: "none" }}>Book a Demo <span aria-hidden className="cmp-arw" style={{ transition: `transform 220ms ${EASE}` }}>→</span></a>
            </div>
          </div>
        </section>

        <footer style={{ borderTop: `1px solid ${HAIR}`, padding: `28px ${gut}`, maxWidth: MAXW, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontSize: 13, color: MUTE }}>© {new Date().getFullYear()} MineEx</span>
          <a href="/pricing" style={{ display: "inline-flex", alignItems: "center", minHeight: mobile ? 44 : 0, fontSize: mobile ? 16 : 13, fontWeight: 600, color: SLATE, textDecoration: "none" }}>← Back to pricing</a>
        </footer>
      </main>
      <Footer />
    </div>
  );
}
