// ─────────────────────────────────────────────────────────────────────────────
// Home2 Nav — Phase A premium navigation (marketing-layer only).
//
// Sticky, transparent over the hero and resolving to a hairline-bordered blurred
// bar once the visitor scrolls. Desktop: wordmark · primary links · Book a Demo +
// Sign In + Get the App. Mobile: wordmark · Book a Demo · menu drawer.
//
// Destinations that don't exist yet (Products / For Investors / Companies / About)
// are present but NON-NAVIGATING in this preview — they render as real links with a
// disabled affordance, so the IA reads correctly without shipping empty pages.
// Real destinations are wired: Book a Demo → the existing lead form (/site#demo),
// Sign In / Get the App → the app (/app).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { MX, EASE } from "../system.jsx";

const PRIMARY = [
  { label: "Pro", href: "/pro" },
  { label: "Conference", href: "/conference-mode" },
  { label: "Investor", href: "/investor" },
  { label: "Pricing", href: "/pricing" },
];

function Wordmark({ dark }) {
  return (
    <a href="/home" aria-label="MineEx home" style={{ display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none" }}>
      {/* MineEx drill-core mark (assets/brand/mineex-core-sample.svg), inlined so it stays crisp.
          Height matches the M's cap height; a small translate aligns it flush top-and-bottom. */}
      <svg aria-hidden width="7" height="22" viewBox="0 0 512 1706.67" style={{ display: "block", flexShrink: 0 }}>
        <defs><clipPath id="mxCoreMark"><rect x="0" y="0" width="512" height="1706.67" rx="120.89" /></clipPath></defs>
        <g clipPath="url(#mxCoreMark)">
          <rect x="0" y="0" width="512" height="426.67" fill="#7A4E33" />
          <rect x="0" y="426.67" width="512" height="426.67" fill="#C4633B" />
          <rect x="0" y="853.33" width="512" height="426.67" fill="#B6BCC3" />
          <rect x="0" y="1280" width="512" height="426.67" fill="#D9A24C" />
        </g>
      </svg>
      <span style={{ fontWeight: 800, fontSize: 32, letterSpacing: "-0.03em", lineHeight: 1, color: dark ? MX.onDark : MX.text, transition: `color 450ms ${EASE}` }}>MineEx</span>
    </a>
  );
}

// Which top-level tab is showing. Driven by the query key in the URL, so a page that
// swaps tabs with history.pushState (the Pro walkthrough handing off to pricing) moves the
// highlight with it. pushState fires no event, hence the explicit "mx:navchange".
const NAV_KEY = (href) => { const m = /[?&]([a-z0-9]+)=/i.exec(href || ""); return m ? m[1] : null; };
function useActiveNavKey() {
  const read = () => { try { return window.location.search || ""; } catch { return ""; } };
  const [search, setSearch] = useState(read);
  useEffect(() => {
    const sync = () => setSearch(read());
    window.addEventListener("popstate", sync);
    window.addEventListener("mx:navchange", sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("mx:navchange", sync); };
  }, []);
  try { const q = new URLSearchParams(search); return PRIMARY.map((l) => NAV_KEY(l.href)).find((k) => k && q.has(k)) || null; }
  catch { return null; }
}

// `solid` forces the resolved (blurred, bordered) bar regardless of window scroll. Needed
// wherever the page's content scrolls inside its OWN container rather than the window —
// the Pro page's pricing sheet, for one — because `scrolled` never fires there and the bar
// would stay transparent with content sliding visibly behind it.
export default function Nav({ recede = false, dark = false, solid = false }) {
  const activeKey = useActiveNavKey();
  const [scrolledRaw, setScrolled] = useState(false);
  const scrolled = scrolledRaw || solid;
  const [open, setOpen] = useState(false);
  useEffect(() => { if (recede) setOpen(false); }, [recede]);   // close any open drawer as the nav recedes

  useEffect(() => {
    const onScroll = () => setScrolled((window.scrollY || 0) > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A non-navigating preview link — visually present, clearly not yet live.
  const dead = (e) => { e.preventDefault(); };
  const T = dark ? MX.onDark : MX.text;         // primary text
  const TD = dark ? MX.onDarkDim : MX.dim;      // dim text
  const HAIR = dark ? MX.hairDark : MX.hair;

  const linkStyle = {
    fontSize: 14.5, fontWeight: 600, letterSpacing: "-0.01em", color: TD,
    textDecoration: "none", opacity: 0.82,
    transition: `color 450ms ${EASE}, opacity 200ms ${EASE}`,
  };

  return (
    <>
      <header
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          height: 64, display: "flex", alignItems: "center",
          background: scrolled ? (dark ? "rgba(8,9,12,0.72)" : "rgba(245,246,247,0.82)") : "transparent",
          backdropFilter: scrolled ? "saturate(1.2) blur(14px)" : "none",
          WebkitBackdropFilter: scrolled ? "saturate(1.2) blur(14px)" : "none",
          borderBottom: `1px solid ${scrolled && !recede ? HAIR : "transparent"}`,
          // recede while the walkthrough owns the viewport: a subtle fade + small lift,
          // pointer-events off so it never intercepts; returns on release. No layout shift
          // (the header is fixed), deterministic on reverse/re-entry.
          opacity: recede ? 0 : 1,
          transform: recede ? "translateY(-10px)" : "translateY(0)",
          pointerEvents: recede ? "none" : "auto",
          transition: `background 300ms ${EASE}, border-color 300ms ${EASE}, opacity 460ms ${EASE}, transform 460ms ${EASE}`,
        }}
      >
        <nav style={{ position: "relative", width: "100%", maxWidth: MX.maxW, margin: "0 auto", padding: "0 clamp(20px, 5vw, 64px)", display: "flex", alignItems: "center", gap: 20 }}>
          <Wordmark dark={dark} />

          {/* desktop links — horizontally centered in the header */}
          <div className="mx-nav-links" style={{ position: "absolute", left: "50%", top: 0, bottom: 0, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 28 }}>
            {PRIMARY.map((l) => (
              <a key={l.label} href={l.href || "#"} onClick={l.href ? undefined : dead} className="mx-navlink"
                aria-current={NAV_KEY(l.href) === activeKey ? "page" : undefined}
                style={{ ...linkStyle, cursor: l.href ? "pointer" : "default",
                  ...(NAV_KEY(l.href) === activeKey ? { color: T, fontWeight: 700 } : null) }}
                title={l.href ? undefined : "Coming soon"}>{l.label}</a>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* desktop right cluster */}
          <div className="mx-nav-right" style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <a href="/get-the-app" className="mx-navlink" style={{ fontSize: 14.5, fontWeight: 600, color: T, letterSpacing: "-0.01em", textDecoration: "none", transition: `color 450ms ${EASE}` }}>Get the App</a>
          </div>

          {/* mobile cluster */}
          <div className="mx-nav-mobile" style={{ display: "none", alignItems: "center", gap: 12 }}>
            <a href="/get-the-app" style={{ fontSize: 14, fontWeight: 600, color: T, textDecoration: "none" }}>Get the App</a>
            <button aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ width: 40, height: 40, display: "inline-grid", placeItems: "center", background: "transparent", border: `1px solid ${HAIR}`, borderRadius: 10, cursor: "pointer" }}>
              <span aria-hidden style={{ display: "block", width: 16, height: 10, position: "relative" }}>
                <span style={{ position: "absolute", left: 0, right: 0, top: open ? 4 : 0, height: 2, background: T, borderRadius: 2, transform: open ? "rotate(45deg)" : "none", transition: `all 240ms ${EASE}` }} />
                <span style={{ position: "absolute", left: 0, right: 0, bottom: open ? 4 : 0, height: 2, background: T, borderRadius: 2, transform: open ? "rotate(-45deg)" : "none", transition: `all 240ms ${EASE}` }} />
              </span>
            </button>
          </div>
        </nav>
      </header>

      {/* mobile drawer */}
      <div style={{
        position: "fixed", top: 64, left: 0, right: 0, zIndex: 99,
        background: dark ? "rgba(8,9,12,0.96)" : "rgba(245,246,247,0.96)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        borderBottom: `1px solid ${HAIR}`,
        transform: open ? "translateY(0)" : "translateY(-8px)", opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: `opacity 240ms ${EASE}, transform 240ms ${EASE}`,
      }}>
        <div style={{ padding: "10px clamp(20px,5vw,64px) 18px", display: "flex", flexDirection: "column", gap: 2 }}>
          {PRIMARY.map((l) => (
            <a key={l.label} href={l.href || "#"} onClick={l.href ? undefined : dead} style={{ padding: "12px 2px", fontSize: 16, fontWeight: 600, color: TD, textDecoration: "none", opacity: 0.82, borderBottom: `1px solid ${HAIR}` }} title={l.href ? undefined : "Coming soon"}>{l.label}</a>
          ))}
          <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
            <a href="/get-the-app" style={{ fontSize: 15, fontWeight: 700, color: T, textDecoration: "none" }}>Get the App</a>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .mx-nav-links, .mx-nav-right { display: none !important; }
          .mx-nav-mobile { display: flex !important; }
        }
        .mx-navlink:hover { color: ${T} !important; opacity: 1 !important; }
      `}</style>
    </>
  );
}
