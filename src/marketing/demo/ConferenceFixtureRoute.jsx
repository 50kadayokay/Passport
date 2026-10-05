// ─────────────────────────────────────────────────────────────────────────────
// ConferenceFixtureRoute — the /site?conffixture=<A..F>&t=<template>&theme=<theme>
// surface, split into its OWN lazy chunk so ConferenceV3 (~1 MB) and the Conference
// fixtures (~300 KB) load ONLY when this route is opened — never on the primary
// homepage. Marketing-only, production-safe: it renders the REAL ConferenceV3
// renderer with an existing QA/demo FIXTURE profile. Never modifies the product.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { FIXTURES } from "../../aiBrief/conferenceV3/fixtures.js";
import ConferenceV3 from "../../aiBrief/conferenceV3/ConferenceV3.jsx";

export default function ConferenceFixtureRoute() {
  const p = new URLSearchParams(window.location.search);
  const fx = FIXTURES[(p.get("conffixture") || "").toUpperCase()];
  const template = p.get("t") || "monolith";
  const theme = p.get("theme") || "obsidian";
  if (!fx)
    return (
      <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "#05070b", color: "#8a8880", fontFamily: "system-ui" }}>
        Unknown showcase fixture.
      </div>
    );
  return (
    <div style={{ position: "fixed", inset: 0, background: "#05070b" }}>
      <ConferenceV3 profile={fx.profile} template={template} theme={theme} showBar={false} followUrl="https://passport-xi-five.vercel.app/app?c=granitepeak-demo&utm_campaign=booth" />
    </div>
  );
}
