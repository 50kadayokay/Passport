// ─────────────────────────────────────────────────────────────────────────────
// ConferenceChapter — Phase C, first slice. The homepage's move from the DIGITAL
// investor experience (Pro Profile, above) into the PHYSICAL conference-booth
// environment. Marketing-layer only.
//
// What is REAL vs PRESENTATION:
//   • REAL PRODUCT — the tablet screen runs the actual ConferenceV3 renderer inside
//     an <iframe> (TabletFrame), pointed at the production-safe marketing fixture
//     route /site?conffixture=B&t=monolith. Nothing about ConferenceV3, its model or
//     its data is touched or reproduced; we only present it inside a device.
//   • MARKETING PRESENTATION — everything around the tablet: the exhibition-lit
//     obsidian stage, the receding booth table the device rests on, the ambient
//     depth, and the QR "take it with you" handoff card. All pure CSS, art-directed
//     and deliberately restrained. No fake 3D, no fake people, no stock photography,
//     no invented company logos, no exhibition banners.
//
// PRODUCT-TRUTH RULES honoured here (from the ConferenceV3 audit):
//   • Person-driven — the tablet rests on Monolith's opening; it is NOT animated as
//     if it auto-plays or loops unattended (there is no booth attract loop).
//   • The QR opens a PUBLIC MineEx investor profile (/app?c=…&utm_campaign=booth);
//     persistent Follow happens after that hand-off, in the app.
//   • No second scroll takeover — the Pro Profile chapter owns the one immersive
//     guided moment; Conference returns to normal premium page scroll.
//
// The section only mounts the real iframe as the visitor approaches (lazy) behind a
// painted obsidian shell, so the tablet is never seen blank / white / loading.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { MX, EASE, Reveal, Eyebrow, useViewport, useReduce } from "../system.jsx";
import TabletFrame from "../demo/TabletFrame.jsx";

// The featured booth is the REAL shipping ConferenceV3 booth for Kingsmen Resources,
// rendered in the flagship "Monolith" template. It reads its local, Conference-owned
// verified package (src/conference/companies/kingsmen-resources) — no Supabase, no
// auth, no invented facts — so the tablet shows the SAME company the QR opens. The
// booth's own floating QR chip is suppressed (qr=0); we present our own hand-off card.
const BOOTH_SRC = "/conference?c=kingsmen-resources&t=monolith&theme=obsidian&qr=0";

// The QR encodes the real product hand-off and resolves to Kingsmen's LIVE, public
// MineEx investor profile. Tablet company === QR destination company === Kingsmen, so
// the physical→digital story is literally true and a scan actually works.
const QR_TARGET = "https://mineex.ca/app?c=kingsmen-resources&utm_campaign=booth";

const MAXW = 1240;

export default function ConferenceChapter() {
  const { mobile, tablet } = useViewport();
  const reduce = useReduce();
  const sectionRef = useRef(null);

  // Lazy-mount the real iframe as the section nears the viewport. Uses a direct
  // position check (getBoundingClientRect vs the viewport + ~900px margin) rather than
  // IntersectionObserver, because IO callbacks don't fire in a hidden/offscreen render
  // context (the design system's own useInView guards against the same case). A short
  // rAF poll on mount catches the section being ALREADY near/in view on initial load
  // (e.g. a #conference deep-link) with no scroll event required; scroll/resize
  // listeners then handle the normal approach-from-above. Until it mounts, a painted
  // obsidian tablet shell holds the exact space — never a blank/white/loading frame.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    let raf = 0, tries = 0, done = false;
    const near = () => {
      const el = sectionRef.current; if (!el) return false;
      const vh = window.innerHeight || 1;
      const r = el.getBoundingClientRect();
      return r.top < vh + 900 && r.bottom > -900;
    };
    const finish = () => {
      if (done) return; done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
      setMounted(true);
    };
    const onMove = () => { if (near()) finish(); };
    const poll = () => {                       // ~20 frames (~330ms): initial-in-view + late layout
      if (done) return;
      if (near()) { finish(); return; }
      if (tries++ < 20) raf = requestAnimationFrame(poll);
    };
    poll();
    window.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove, { passive: true });
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
    };
  }, []);

  const twoCol = !mobile && !tablet;

  return (
    <section
      ref={sectionRef}
      id="conference"
      aria-label="MineEx Conference Mode"
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#06080c",
        color: MX.onDark,
        // A short tonal lead-in so the light Pro Profile chapter above resolves into
        // the dark exhibition stage rather than hard-cutting.
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: mobile ? "0 0 96px" : "0 0 clamp(120px, 15vh, 200px)",
      }}
    >
      {/* light→dark transition band from the Pro Profile chapter above */}
      <div aria-hidden style={{ height: mobile ? 90 : 150, background: `linear-gradient(180deg, ${MX.sheet} 0%, #0d1015 62%, #06080c 100%)` }} />

      {/* ── ENVIRONMENT (all marketing presentation, all CSS, aria-hidden) ── */}
      <StageEnvironment mobile={mobile} reduce={reduce} />

      <div style={{ position: "relative", zIndex: 2, maxWidth: MAXW, margin: "0 auto", padding: mobile ? "8px 22px 0" : "clamp(28px,5vh,64px) clamp(24px,5vw,64px) 0" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: twoCol ? "minmax(0, 0.86fr) minmax(0, 1.14fr)" : "1fr",
            gap: twoCol ? "clamp(32px,4vw,72px)" : (mobile ? 34 : 48),
            alignItems: "center",
          }}
        >
          {/* ── COPY ── */}
          <div style={{ minWidth: 0, maxWidth: twoCol ? 460 : 640, marginInline: twoCol ? undefined : "auto", textAlign: twoCol ? "left" : "center" }}>
            <Eyebrow color={MX.onDarkDim} style={{ justifyContent: twoCol ? "flex-start" : "center" }}>
              MineEx Conference Mode
            </Eyebrow>
            <Reveal kind="heading">
              <h2 className="mx-display" style={{ marginTop: 18, color: MX.onDark, letterSpacing: "-0.04em" }}>
                Replace the <span style={{ whiteSpace: "nowrap" }}>one-pager.</span>
              </h2>
            </Reveal>
            <Reveal kind="copy" order={1}>
              <p className="mx-lead" style={{ marginTop: 22, color: MX.onDarkDim, maxWidth: "46ch", marginInline: twoCol ? undefined : "auto" }}>
                Turn your conference iPad into a premium presentation of your company —
                giving investors a fast, visual way to understand the story and a direct
                path to keep exploring after they leave your booth.
              </p>
            </Reveal>
            <Reveal kind="copy" order={2}>
              <div
                className="mx-label"
                style={{
                  marginTop: 30, color: MX.onDarkMute, display: "inline-flex", alignItems: "center", gap: 11,
                  justifyContent: twoCol ? "flex-start" : "center",
                }}
              >
                <span aria-hidden style={{ width: 20, height: 2, borderRadius: 2, background: "var(--mx-accent)" }} />
                Your company at a glance
              </div>
            </Reveal>
          </div>

          {/* ── BOOTH SCENE ── */}
          <Reveal kind="media" style={{ minWidth: 0 }}>
            <BoothScene mobile={mobile} twoCol={twoCol} mounted={mounted} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── The art-directed exhibition stage: key light, ambient depth, booth table. ─── */
function StageEnvironment({ mobile, reduce }) {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "hidden" }}>
      {/* base stage ground — cool graphite, a soft key light from upper-centre */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(115% 80% at 52% 6%, #141a21 0%, #0b0e13 44%, #06080c 100%)" }} />
      {/* key-light glow, upper-left */}
      <div style={{ position: "absolute", top: "-14%", left: "8%", width: "60%", height: "70%", background: "radial-gradient(closest-side, rgba(150,170,190,0.10), rgba(150,170,190,0))", filter: "blur(6px)" }} />

      {/* ambient depth — a few out-of-focus light points suggesting a conference floor
          far behind. Deliberately faint and few (desktop only). */}
      {!mobile && (
        <>
          <Bokeh x="14%" y="20%" s={92} o={0.09} />
          <Bokeh x="72%" y="13%" s={64} o={0.08} />
          <Bokeh x="86%" y="30%" s={120} o={0.06} />
          <Bokeh x="40%" y="9%" s={46} o={0.07} />
          <Bokeh x="60%" y="26%" s={54} o={0.05} />
        </>
      )}

      {/* booth wall hint — a soft, out-of-focus vertical panel on the far side */}
      {!mobile && (
        <div style={{
          position: "absolute", top: "6%", right: "-6%", width: "34%", height: "72%",
          background: "linear-gradient(100deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.01) 40%, rgba(0,0,0,0) 100%)",
          filter: "blur(22px)", borderRadius: 40,
        }} />
      )}

      {/* the booth table the device rests on — a receding plane with a lit front edge */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: mobile ? "34%" : "42%",
        background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(9,12,17,0.35) 22%, #0a0e13 60%, #090c11 100%)",
      }} />
      {/* the lit horizon where the table meets the back of the stage */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: mobile ? "34%" : "42%", height: 1,
        background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0.14) 55%, rgba(255,255,255,0.05) 80%, rgba(255,255,255,0) 100%)",
      }} />
    </div>
  );
}

function Bokeh({ x, y, s, o }) {
  return (
    <div style={{
      position: "absolute", left: x, top: y, width: s, height: s, borderRadius: "50%",
      background: `radial-gradient(closest-side, rgba(210,222,235,${o}), rgba(210,222,235,0))`,
      filter: "blur(9px)",
    }} />
  );
}

/* ── The physical tablet resting on the booth table, with the QR hand-off. ─────── */
function BoothScene({ mobile, twoCol, mounted }) {
  const tabletMax = twoCol ? 620 : mobile ? 440 : 560;
  return (
    <div style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: "100%", maxWidth: tabletMax, marginInline: "auto" }}>
        {/* contact shadow the device casts on the table */}
        <div aria-hidden style={{
          position: "absolute", left: "6%", right: "6%", bottom: -22, height: 46, zIndex: 0,
          background: "radial-gradient(60% 100% at 50% 0%, rgba(0,0,0,0.65), rgba(0,0,0,0))",
          filter: "blur(14px)",
        }} />

        {/* the tablet — real ConferenceV3 once mounted, painted obsidian shell before */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {mounted ? (
            <TabletFrame
              src={BOOTH_SRC}
              template="monolith"
              theme="obsidian"
              interactive={false}
              bezel={mobile ? 11 : 15}
              radius={mobile ? 24 : 30}
              title="MineEx Conference Mode — Monolith"
            />
          ) : (
            <TabletShell bezel={mobile ? 11 : 15} radius={mobile ? 24 : 30} />
          )}
        </div>

        {/* QR hand-off card — resting on the table at the device's lower corner (desktop)
            or stacked beneath it (mobile). Presentation layer; the QR itself is real. */}
        {twoCol ? (
          <div style={{ position: "absolute", right: -14, bottom: -30, zIndex: 3 }}>
            <QrCard />
          </div>
        ) : null}
      </div>

      {!twoCol && (
        <div style={{ marginTop: 30 }}>
          <QrCard wide />
        </div>
      )}
    </div>
  );
}

// Painted obsidian device shell, exactly matching TabletFrame's footprint so there is
// no layout shift when the real iframe mounts in its place.
function TabletShell({ bezel, radius }) {
  return (
    <div style={{
      position: "relative", width: "100%", background: "#0a0a0c", padding: bezel, borderRadius: radius,
      boxShadow: "0 90px 170px -60px rgba(0,0,0,0.85), 0 0 0 2px rgba(255,255,255,0.06) inset",
    }}>
      <div style={{ width: "100%", aspectRatio: "1194 / 834", borderRadius: Math.max(6, radius - bezel), background: "radial-gradient(130% 130% at 50% 42%, #0c1016 0%, #05070b 72%)" }} />
    </div>
  );
}

/* The QR hand-off card. Dark glass so it belongs on the stage; the scannable QR sits
   on its own light tile. Real QR generated with the product's qrcode library. */
function QrCard({ wide = false }) {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(QR_TARGET, { margin: 0, width: 240, color: { dark: "#0a0c0f", light: "#ffffff" } })
      .then((u) => { if (alive) setDataUrl(u); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: 14, borderRadius: 18,
      background: "rgba(18,22,28,0.72)",
      border: "1px solid rgba(255,255,255,0.12)",
      // backdrop-filter removed on phones (see AppSection): a 390x298 backdrop blur over a
      // moving device is re-rasterised every frame on iOS Safari. Desktop keeps it.
      ...(typeof window !== "undefined" && window.innerWidth < 760
        ? null
        : { backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }),
      boxShadow: "0 40px 80px -40px rgba(0,0,0,0.8)",
      maxWidth: wide ? 340 : 300,
    }}>
      <div style={{ width: 60, height: 60, borderRadius: 10, background: "#fff", padding: 6, flex: "0 0 auto", display: "grid", placeItems: "center" }}>
        {dataUrl ? <img src={dataUrl} alt="QR code" width={48} height={48} style={{ display: "block" }} /> : <div style={{ width: 48, height: 48 }} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.01em", color: MX.onDark, display: "flex", alignItems: "center", gap: 7 }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: "var(--mx-accent)", transform: "rotate(45deg)" }} />
          Scan to continue on MineEx
        </div>
        <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: MX.onDarkMute }}>
          Opens your public investor profile.
        </div>
      </div>
    </div>
  );
}
