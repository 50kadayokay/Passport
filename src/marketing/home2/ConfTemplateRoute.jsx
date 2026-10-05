// ─────────────────────────────────────────────────────────────────────────────
// ConfTemplateRoute (/site?conftemplate=1&t=<template>&c=<demo-company>) — opens a
// single Conference Mode template full-screen for review, with a marketing "Back to
// templates" control so the visitor can always return to the gallery. The template
// itself renders untouched inside an iframe (/confv3demo); this route only adds the
// surrounding marketing chrome (the back button).
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";

export default function ConfTemplateRoute() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get("t") || "monolith";
  const c = params.get("c") || "granitepeak-demo";
  const src = `/confv3demo?c=${encodeURIComponent(c)}&t=${encodeURIComponent(t)}&bar=0`;
  const back = () => {
    // Prefer real history (restores gallery scroll); fall back to the gallery route.
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/conference-mode";
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <button
        type="button"
        onClick={back}
        style={{
          position: "fixed", top: 16, left: 16, zIndex: 20,
          display: "inline-flex", alignItems: "center", gap: 8,
          height: 40, padding: "0 16px 0 13px", borderRadius: 999,
          background: "rgba(18,20,26,0.62)", color: "#fff",
          border: "1px solid rgba(255,255,255,0.16)",
          backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
          fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", cursor: "pointer",
          boxShadow: "0 10px 30px -12px rgba(0,0,0,0.6)",
        }}
      >
        <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>←</span> Back to templates
      </button>
      <iframe src={src} title="MineEx Conference Mode template" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, display: "block" }} />
    </div>
  );
}
