// ─────────────────────────────────────────────────────────────────────────────
// AppShotStage (?appshot=<name>) — the capture surface for /marketing/appshots/*.webp.
//
// The shipped shots were captured at 585x1255, i.e. a 390pt phone at 1.5x. A phone
// renders them at ~346 CSS px on a 3x screen, which needs ~1038 real pixels, so they
// were being upscaled and looked soft. This renders ONE app screen at the real device
// size with nothing around it, so qa/appshots.mjs can re-capture the same screens at
// a device pixel ratio that actually matches the hardware.
//
// The screens themselves are AppUI.jsx — the same components the marketing sections
// already render — so a re-capture cannot drift from what the site shows elsewhere.
// Nothing links here; it is a build-time tool.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { ExploreScreen, FeedScreen, MediaScreen, ProfileScreen, ReleaseScreen } from "./AppUI.jsx";

export const SHOT_W = 390;
export const SHOT_H = 844;

// name → the screen that shot shows.
export const APPSHOTS = {
  overview: <ProfileScreen tab="overview" />,
  projects: <ProfileScreen tab="projects" />,
  timeline: <ProfileScreen tab="timeline" />,
  capital:  <ProfileScreen tab="capital" />,
  team:     <ProfileScreen tab="team" />,
  updates:  <ProfileScreen tab="updates" />,
  media:    <MediaScreen />,
  release:  <ReleaseScreen />,
  feed:     <FeedScreen />,
  explore:  <ExploreScreen />,
};

export default function AppShotStage() {
  const name = new URLSearchParams(window.location.search).get("appshot") || "overview";
  const screen = APPSHOTS[name];
  return (
    <div style={{ margin: 0, background: "#fff" }}>
      <div id="appshot-stage" style={{ width: SHOT_W, height: SHOT_H, overflow: "hidden", position: "relative" }}>
        {screen || <p style={{ padding: 20, fontFamily: "monospace" }}>no such shot: {name}</p>}
      </div>
    </div>
  );
}
