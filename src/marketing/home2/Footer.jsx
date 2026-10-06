// ─────────────────────────────────────────────────────────────────────────────
// Footer — the public site's one quiet legal/utility strip.
//
// Two modes, because the site has two kinds of page:
//   • default  — the full (still minimal) footer, appended to pages that scroll normally
//                (Contact, Compare, Conference, Get the App, Android).
//   • compact  — a single centred line for the full-viewport paged decks (Pricing, the
//                sales deck, Investor) where a block footer cannot be appended. Same
//                links, one line tall.
//
// Deliberately not a SaaS mega-footer: Privacy · Terms · Support · Contact and a copyright
// line. The entity name and mailing address come from siteIdentity.js; the address block
// renders only once a real address exists there — it is never invented.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { useViewport } from "../system.jsx";
import { BUSINESS_ADDRESS, SUPPORT_EMAIL, copyrightHolder } from "./siteIdentity.js";

// Declared locally rather than imported from SalesPricing: that module renders this
// footer, and importing back would create a cycle. Values match the pricing palette.
const T = { BG: "#fbfcfe", NAVY: "#0a1b2e", SLATE: "#565f6e", MUTE: "#9aa1ad" };

const LINKS = [
  ["Privacy", "/privacy.html"],
  ["Terms", "/terms.html"],
  ["Support", "/support.html"],
  ["Contact", "/contact?plan=general"],
];
const year = new Date().getFullYear();

export default function Footer({ compact = false }) {
  // On a phone every legal link has to be a real 44px row, and the strip reads as a
  // stacked block rather than a squeezed single line. Desktop is unchanged.
  const { mobile } = useViewport();
  const links = (
    <nav aria-label="Legal and support" style={{ display: "flex", alignItems: "center",
      gap: mobile ? 6 : (compact ? 14 : 20), rowGap: mobile ? 0 : undefined, flexWrap: "wrap",
      marginLeft: mobile ? -12 : 0 }}>
      {LINKS.map(([label, href]) => (
        <a key={label} href={href} className="mx-footlink"
          style={{ color: T.SLATE, fontWeight: 500, textDecoration: "none",
            fontSize: mobile ? 16 : (compact ? 12 : 13),
            ...(mobile ? { display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 12px" } : null) }}>{label}</a>
      ))}
    </nav>
  );
  const copy = <span style={{ fontSize: mobile ? 14 : (compact ? 12 : 12.5), color: T.MUTE }}>© {year} {copyrightHolder()}</span>;

  if (compact) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: mobile ? "column" : "row", gap: mobile ? 6 : 16, flexWrap: "wrap", padding: mobile ? "18px 0 0" : "10px 0 0" }}>
        {links}{mobile ? null : <span aria-hidden style={{ color: "rgba(10,27,46,0.18)" }}>·</span>}{copy}
        <FooterStyles />
      </div>
    );
  }
  return (
    <footer style={{ borderTop: "1px solid rgba(10,27,46,0.10)", background: T.BG, marginTop: "clamp(48px,7vh,88px)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "clamp(26px,3.4vh,40px) clamp(22px,5vw,64px)",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: mobile ? 14 : 28, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          {copy}
          {BUSINESS_ADDRESS.length > 0 && (
            <address style={{ fontStyle: "normal", fontSize: mobile ? 14 : 12.5, lineHeight: 1.5, color: T.MUTE }}>
              {BUSINESS_ADDRESS.map((line) => <div key={line}>{line}</div>)}
            </address>
          )}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ fontSize: mobile ? 16 : 12.5, color: T.SLATE, textDecoration: "none",
            ...(mobile ? { display: "inline-flex", alignItems: "center", minHeight: 44 } : null) }}>{SUPPORT_EMAIL}</a>
        </div>
        {links}
      </div>
      <FooterStyles />
    </footer>
  );
}

function FooterStyles() {
  return <style>{`.mx-footlink:hover { color: ${T.NAVY}; text-decoration: underline; }`}</style>;
}
