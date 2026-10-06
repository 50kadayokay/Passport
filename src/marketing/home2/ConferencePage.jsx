// ─────────────────────────────────────────────────────────────────────────────
// ConferencePage — the "Conference" nav destination (/conference-mode).
//
// A LIGHT MineEx page where the TEMPLATES are the star. Light header, one editorial
// two-column intro row (headline + supporting line + a refined rotating message),
// then the full template gallery, then a restrained bespoke note. Minimal copy.
//
// Marketing-layer only. Reuses the light MineEx Nav, the shared TabletFrame, and the
// app's /confv3demo route; the templates themselves are untouched.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from "react";
import { EASE, MarketingStyles, useViewport } from "../system.jsx";
import Nav from "./Nav.jsx";
import TabletFrame from "../demo/TabletFrame.jsx";

import Footer from "./Footer.jsx";
const BG = "#fbfcfe";
const NAVY = "#0a1b2e";                        // primary ink
const SLATE = "#565f6e";                        // supporting text
const COBALT = "#2563EB";                       // accent
const MUTE = "#9aa1ad";
const HAIR = "rgba(10,27,46,0.10)";
const MAXW = 1280;
const DOT_OFF = "rgba(10,27,46,0.20)";

// [template, name, isNew, demo-company slug]
const TEMPLATES = [
  ["terminal2", "Terminal II", 1, "pampanegra-demo"], ["expedition", "Expedition", 1, "ptarmigan-demo"], ["keynote", "Keynote", 1, "vilcanota-demo"], ["vein", "Vein", 1, "plataalta-demo"],
  ["chronicle", "Chronicle", 0, "granitepeak-demo"], ["filament", "Filament", 0, "granitepeak-demo"], ["folio", "Folio", 0, "northvale-demo"], ["crimson", "Crimson", 0, "emberline-demo"],
  ["tableau", "Tableau", 0, "quillon-demo"], ["gyre", "Gyre", 0, "lucerna-demo"], ["beacon", "Beacon", 0, "veyra-demo"], ["lattice", "Lattice", 0, "solvik-demo"],
  ["relay", "Relay", 0, "iberis-demo"], ["spectra", "Spectra", 0, "tremayne-demo"], ["vista", "Vista", 0, "ardven-demo"], ["cirrus", "Cirrus", 0, "kestrel-demo"],
];

// Four concise, understated benefits (no cards/boxes) — number · title · one-liner.
const BENEFITS = [
  ["01", "Choose your design", "Start with the Conference Mode design that fits your company best. We’ll tailor it around your brand, projects and story."],
  ["02", "Create a better booth experience", "Turn static handouts into an interactive investor experience designed to be explored in person."],
  ["03", "Grow your audience", "Integrated QR codes lead investors directly to your MineEx Pro Profile, where they can continue exploring and follow your company."],
  ["04", "Or make it entirely bespoke", "Want something completely unique? We can design a custom Conference Mode experience specifically for your company."],
];

// Right-column carousel: the intro lead first, then the four points. Left/right arrows + blue progress
// dots; press-through only (no auto-play). Soft fade + rise between slides.
function IntroCarousel({ lead, steps, mobile }) {
  const slides = [{ lead }, ...steps.map(([n, t, c]) => ({ n, t, c }))];
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState("in");
  const iRef = useRef(0);
  const swapRef = useRef();
  useEffect(() => { iRef.current = i; }, [i]);
  const go = useCallback((n) => {
    const t = ((n % slides.length) + slides.length) % slides.length;
    if (t === iRef.current) return;
    setPhase("out");
    clearTimeout(swapRef.current);
    swapRef.current = setTimeout(() => { setI(t); setPhase("in"); }, 220);
  }, [slides.length]);
  useEffect(() => () => clearTimeout(swapRef.current), []);
  const cur = slides[i];
  const anim = phase === "out"
    ? { opacity: 0, transform: "translateY(-8px)", transition: "opacity 210ms cubic-bezier(0.4,0,0.2,1), transform 210ms cubic-bezier(0.4,0,0.2,1)" }
    : { animation: "cfStepIn 340ms cubic-bezier(0.22,1,0.36,1) both" };
  const arrow = { flex: "0 0 auto", width: 40, height: 40, borderRadius: 999, border: `1px solid ${HAIR}`, background: "#fff", color: NAVY, cursor: "pointer", display: "grid", placeItems: "center", fontSize: 15, transition: `border-color 200ms ${EASE}, color 200ms ${EASE}` };
  const Body = (
    <div key={i} style={{ width: "100%", ...anim }}>
      {cur.lead ? (
        <p className="mx-lead" style={{ margin: 0, color: SLATE }}>{cur.lead}</p>
      ) : (
        <>
          <div style={{ margin: 0, fontSize: "clamp(18px,1.5vw,21px)", fontWeight: 600, color: NAVY, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{cur.t}</div>
          <p className="mx-lead" style={{ margin: "10px 0 0", color: SLATE }}>{cur.c}</p>
        </>
      )}
    </div>
  );
  const dots = (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {slides.map((_, k) => (
        <button key={k} type="button" onClick={() => go(k)} aria-label={`Slide ${k + 1}`} className="cf-dot" style={{ padding: "6px 0", border: "none", background: "transparent", cursor: "pointer" }}>
          <span aria-hidden style={{ display: "block", height: 6, borderRadius: 99, width: k === i ? 24 : 6, background: k === i ? COBALT : "rgba(37,99,235,0.24)", transition: "width 320ms cubic-bezier(0.22,1,0.36,1), background 320ms ease" }} />
        </button>
      ))}
    </div>
  );

  if (mobile) {
    return (
      <div>
        <div style={{ minHeight: 172, display: "flex", alignItems: "center" }}>{Body}</div>
        <div style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <button type="button" onClick={() => go(i - 1)} aria-label="Previous" className="cf-nav" style={arrow}>←</button>
          {dots}
          <button type="button" onClick={() => go(i + 1)} aria-label="Next" className="cf-nav" style={arrow}>→</button>
        </div>
      </div>
    );
  }

  // Desktop: text keeps full column width; arrows sit in the outer margins, flanking it.
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative", minHeight: "clamp(140px,17vh,172px)", display: "flex", alignItems: "center" }}>
        <button type="button" onClick={() => go(i - 1)} aria-label="Previous" className="cf-nav" style={{ ...arrow, position: "absolute", top: "50%", right: "100%", marginRight: 14, transform: "translateY(-50%)" }}>←</button>
        {Body}
        <button type="button" onClick={() => go(i + 1)} aria-label="Next" className="cf-nav" style={{ ...arrow, position: "absolute", top: "50%", left: "100%", marginLeft: 14, transform: "translateY(-50%)" }}>→</button>
      </div>
      <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>{dots}</div>
    </div>
  );
}


// One template card — thumb placeholder, live hero booted only when it scrolls near.
function LiveCard({ tpl, name, isNew, slug, idx }) {
  const ref = useRef(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setLive(true); io.disconnect(); } }, { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const previewSrc = `/confv3demo?c=${slug}&t=${tpl}&bar=0`;
  const openHref = `/site?conftemplate=1&t=${tpl}&c=${slug}`;
  return (
    <a href={openHref} className="cf-card" style={{ display: "block", textDecoration: "none", color: "inherit", borderRadius: 14, overflow: "hidden", border: `1px solid ${HAIR}`, background: "#fff" }}>
      <div ref={ref} style={{ position: "relative", width: "100%", aspectRatio: "1194 / 820", overflow: "hidden",
        backgroundColor: "#0c0f15", backgroundImage: `url(/thumbs/${tpl}.jpg)`, backgroundSize: "cover", backgroundPosition: "top center" }}>
        {live && <div style={{ position: "absolute", inset: 0 }}>
          <TabletFrame bare src={previewSrc} interactive={false} showBootCover={false} screenBg="transparent" renderW={1194} renderH={820} title={`${name} — ${slug}`} />
        </div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "13px 15px", borderTop: `1px solid ${HAIR}` }}>
        <span style={{ fontSize: 12, color: MUTE, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{String(idx + 1).padStart(2, "0")}</span>
        <span style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: "-0.01em", color: NAVY }}>{name}</span>
        {isNew ? <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.12em", color: COBALT, border: `1px solid ${COBALT}`, borderRadius: 4, padding: "2px 6px", lineHeight: 1 }}>NEW</span> : null}
        <span className="cf-open" style={{ marginLeft: "auto", fontSize: 11, color: MUTE, letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase" }}>Open ↗</span>
      </div>
    </a>
  );
}

export default function ConferencePage() {
  const { mobile } = useViewport();
  const gut = "clamp(22px, 5vw, 64px)";
  return (
    <div className="mx-root" id="top" style={{ background: BG, minHeight: "100vh", color: NAVY }}>
      <MarketingStyles />
      {/* LIGHT MineEx header — the standard site navigation on the light page */}
      <Nav />
      <main style={{ fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

        {/* ── Intro: eyebrow, then headline left with the supporting text beside it on the right ── */}
        <section style={{ maxWidth: MAXW, margin: "0 auto", padding: `clamp(118px,14vh,160px) ${gut} clamp(40px,5vh,64px)` }}>
          <p className="mx-label" style={{ color: COBALT, letterSpacing: "0.22em", margin: 0 }}>Conference Mode</p>
          <div style={{ marginTop: "clamp(20px,2.6vh,30px)", display: "grid", gridTemplateColumns: mobile ? "1fr" : "1.1fr 0.9fr", gap: "clamp(24px,4vw,64px)", alignItems: "center" }}>
            <h1 className="mx-h2" style={{ margin: 0, color: NAVY, maxWidth: "15ch" }}>
              Turn conference interest into<br />lasting investor connections.
            </h1>
            <div style={{ marginTop: mobile ? 6 : 0 }}>
              <IntroCarousel mobile={mobile} lead="Replace the traditional one-pager with an interactive experience built around your company. Give investors a better way to explore your story at the booth—and a direct path to stay connected through MineEx." steps={BENEFITS} />
            </div>
          </div>
        </section>

        {/* ── TEMPLATE GALLERY — a quiet lead-in, then the existing collection ── */}
        <section style={{ maxWidth: MAXW, margin: "0 auto", padding: `clamp(28px,4vh,52px) ${gut} clamp(80px,12vh,140px)` }}>
          <div style={{ marginBottom: "clamp(26px,3.5vh,40px)", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <div>
              <p className="mx-label" style={{ color: MUTE, letterSpacing: "0.22em", margin: 0 }}>Premium Designs</p>
              <h2 className="mx-h3" style={{ margin: "12px 0 0", color: NAVY }}>Choose your starting point.</h2>
            </div>
            <a href={"/get-started"} className="cf-cta" style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 50, padding: "0 28px", borderRadius: 999, background: COBALT, color: "#fff", border: `1px solid ${COBALT}`, fontSize: 15.5, fontWeight: 700, letterSpacing: "-0.01em", textDecoration: "none", whiteSpace: "nowrap" }}>
              Get Started <span aria-hidden className="cf-cta-arw">→</span>
            </a>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: "clamp(14px,1.4vw,22px)" }}>
            {TEMPLATES.map(([tpl, name, isNew, slug], i) => (
              <LiveCard key={tpl} tpl={tpl} name={name} isNew={isNew} slug={slug} idx={i} />
            ))}
          </div>
        </section>

      </main>

      <style>{`
        @keyframes mxRotIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .cf-card { transition: border-color .2s ease, transform .2s ease, box-shadow .2s ease; }
        .cf-card:hover { border-color: rgba(37,99,235,.5); transform: translateY(-3px); box-shadow: 0 24px 56px -30px rgba(10,27,46,.35); }
        .cf-card:hover .cf-open { color: ${COBALT}; }
        @keyframes cfStepIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .cf-nav:hover { border-color: rgba(37,99,235,.55) !important; color: ${COBALT} !important; }
        .cf-dot:hover span { background: rgba(10,27,46,.4) !important; }
        .cf-cta { transition: transform 180ms ${EASE}, box-shadow 180ms ${EASE}; }
        .cf-cta:hover { transform: translateY(-1px); box-shadow: 0 14px 30px -16px rgba(10,27,46,.5); }
        .cf-cta:hover .cf-cta-arw { display: inline-block; transform: translateX(3px); transition: transform 180ms ${EASE}; }
        @media (prefers-reduced-motion: reduce) { .cf-card { transition: none; } }
      `}</style>
      <Footer />
    </div>
  );
}
