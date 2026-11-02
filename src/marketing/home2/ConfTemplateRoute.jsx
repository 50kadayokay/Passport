// ─────────────────────────────────────────────────────────────────────────────
// ConfTemplateRoute (/site?conftemplate=1&t=<template>&c=<demo-company>) — opens a
// single Conference Mode template full-screen for review, with a marketing "Back to
// templates" control so the visitor can always return to the gallery. The template
// itself renders untouched inside an iframe (/confv3demo); this route only adds the
// surrounding marketing chrome (the back button).
//
// PHONES: a Conference Mode template is a 1194×820 landscape iPad experience. Letting it
// reflow into a 390-wide portrait window would show the visitor something the product is
// not. So on a phone the template is rendered at its OWN size and scaled to fit,
// letterboxed on black — the booth experience, faithfully, just smaller — with a hint that
// it advances on scroll. The template is NOT modified.
//
// Portrait only. Sideways would be a marginally bigger letterbox of something that wants a
// 13" screen, so instead of sending the visitor there, landscape asks for the phone back
// and points at a computer. A browser cannot refuse rotation, so this is an overlay, not a
// lock.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";

// The template's native stage, matching the TabletFrame the gallery renders.
const TPL_W = 1194;
const TPL_H = 820;

function useStage() {
  const read = () => {
    const w = typeof window === "undefined" ? 1280 : window.innerWidth;
    const h = typeof window === "undefined" ? 800 : window.innerHeight;
    // "small" has to mean A PHONE, not a narrow window. Keying it off innerWidth alone was
    // wrong the moment the phone turned: an iPhone 14 in landscape is 844 wide, so it fell
    // through to the desktop full-bleed path and never saw the orientation notice. The
    // SHORTER side is the one that stays phone-sized through a rotation. The coarse-pointer
    // test keeps a small desktop window from being told to turn itself upright.
    const phone = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(hover: none) and (pointer: coarse)").matches
      : false;
    return { w, h, phone, small: Math.min(w, h) < 760 && (phone || w < 760) };
  };
  const [v, setV] = useState(read);
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setV(read())); };
    window.addEventListener("resize", on, { passive: true });
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
      cancelAnimationFrame(raf);
    };
  }, []);
  return v;
}

export default function ConfTemplateRoute() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get("t") || "monolith";
  const c = params.get("c") || "granitepeak-demo";
  const src = `/confv3demo?c=${encodeURIComponent(c)}&t=${encodeURIComponent(t)}&bar=0`;
  const { w, h, phone, small } = useStage();
  const portrait = h > w;
  const back = () => {
    // Prefer real history (restores gallery scroll); fall back to the gallery route.
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/conference-mode";
  };

  // Phones get the native stage, scaled to fit; everything else fills the window as before.
  // Portrait only: a Conference Mode template is a landscape iPad experience and a phone
  // cannot do it justice either way, so there is no point sending someone sideways for a
  // marginally bigger letterbox — the honest advice is to open it on a computer.
  const scale = small ? Math.min(w / TPL_W, (h - 164) / TPL_H) : 1;

  const frame = small ? (
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 164, display: "grid", placeItems: "center", overflow: "hidden" }}>
      <div style={{ width: TPL_W * scale, height: TPL_H * scale, position: "relative" }}>
        <iframe src={src} title="MineEx Conference Mode template"
          style={{
            width: TPL_W, height: TPL_H, border: 0, display: "block",
            transform: `scale(${scale})`, transformOrigin: "top left",
            position: "absolute", top: 0, left: 0,
            borderRadius: 14 / Math.max(scale, 0.0001), overflow: "hidden",
          }} />
      </div>
    </div>
  ) : (
    <iframe src={src} title="MineEx Conference Mode template"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, display: "block" }} />
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <button
        type="button"
        onClick={back}
        style={{
          position: "fixed", left: 16, zIndex: 20,
          top: "calc(16px + env(safe-area-inset-top, 0px))",
          display: "inline-flex", alignItems: "center", gap: 8,
          height: small ? 44 : 40, padding: "0 18px 0 14px", borderRadius: 999,
          background: "rgba(18,20,26,0.62)", color: "#fff",
          border: "1px solid rgba(255,255,255,0.16)",
          backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
          fontSize: small ? 15 : 14, fontWeight: 600, letterSpacing: "-0.01em", cursor: "pointer",
          boxShadow: "0 10px 30px -12px rgba(0,0,0,0.6)",
        }}
      >
        <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>←</span> Back to templates
      </button>

      {frame}

      {small && portrait && (
        <div style={{
          position: "fixed", left: 20, right: 20, zIndex: 20, textAlign: "center",
          bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}>
          {/* How to move through it. The template advances on its own scroll, which is not
              obvious when it is sitting letterboxed in the middle of a black screen. */}
          <p style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 9,
            color: "rgba(255,255,255,0.92)", fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.01em" }}>
            <span aria-hidden className="ct-up">↑</span> Swipe up to move through the presentation
          </p>
          <p style={{ margin: "9px 0 0", color: "rgba(255,255,255,0.52)", fontSize: 13.5, lineHeight: 1.5 }}>
            Conference Mode is built for an iPad at the booth — it is best seen on a larger screen.
          </p>
        </div>
      )}

      {/* Landscape: a browser cannot be made to refuse rotation, so rather than render a
          cramped sideways version this asks for the phone back and explains why. */}
      {small && phone && !portrait && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "#000",
          display: "grid", placeItems: "center", padding: "0 34px", textAlign: "center",
          fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
          <div>
            <p style={{ margin: 0, color: "#fff", fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}>Turn your phone upright</p>
            <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,0.56)", fontSize: 14.5, lineHeight: 1.55 }}>
              Conference Mode is designed for an iPad at the booth. To see a template properly, open it on a computer.
            </p>
          </div>
        </div>
      )}
      <style>{`@keyframes ctUp{0%,100%{transform:translateY(0);opacity:.75}50%{transform:translateY(-4px);opacity:1}}
        .ct-up{animation:ctUp 1.9s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){.ct-up{animation:none}}`}</style>
    </div>
  );
}
