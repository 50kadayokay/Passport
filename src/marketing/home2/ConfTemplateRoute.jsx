// ─────────────────────────────────────────────────────────────────────────────
// ConfTemplateRoute (/site?conftemplate=1&t=<template>&c=<demo-company>) — opens a
// single Conference Mode template full-screen for review, with a marketing "Back to
// templates" control so the visitor can always return to the gallery. The template
// itself renders untouched inside an iframe (/confv3demo); this route only adds the
// surrounding marketing chrome (the back button).
//
// PHONES: a Conference Mode template is a 1194×820 landscape iPad experience. Letting it
// reflow into a 390-wide portrait window would show the visitor something the product is
// not. So on a small screen the template is rendered at its OWN size and scaled to fit,
// letterboxed on black — the booth experience, faithfully, just smaller. Turning the phone
// sideways makes it nearly full-bleed, so portrait says so. The template is NOT modified.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";

// The template's native stage, matching the TabletFrame the gallery renders.
const TPL_W = 1194;
const TPL_H = 820;

function useStage() {
  const read = () => {
    const w = typeof window === "undefined" ? 1280 : window.innerWidth;
    const h = typeof window === "undefined" ? 800 : window.innerHeight;
    return { w, h, small: w < 760 };
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
  const { w, h, small } = useStage();
  const portrait = h > w;
  const back = () => {
    // Prefer real history (restores gallery scroll); fall back to the gallery route.
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/conference-mode";
  };

  // Phones get the native stage, scaled to fit; everything else fills the window as before.
  const scale = small ? Math.min(w / TPL_W, (h - (portrait ? 150 : 24)) / TPL_H) : 1;

  const frame = small ? (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", overflow: "hidden" }}>
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
        <p style={{
          position: "fixed", left: 22, right: 22, zIndex: 20, margin: 0, textAlign: "center",
          bottom: "calc(26px + env(safe-area-inset-bottom, 0px))",
          color: "rgba(255,255,255,0.68)", fontSize: 15, lineHeight: 1.5,
          fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}>
          Conference Mode is built for an iPad at the booth. Turn your phone sideways for a larger view.
        </p>
      )}
    </div>
  );
}
