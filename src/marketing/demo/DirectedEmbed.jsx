// ─────────────────────────────────────────────────────────────────────────────
// DirectedEmbed — the directed product film, rebuilt over the REAL iframe app.
//
// The interaction model is UNCHANGED from what we locked with the camera engine:
//   user gesture → DemoDirector picks the next state → DemoDirector COMMANDS the
//   real app (navigate / scroll / open a real sheet) → the real app performs the
//   transition with its OWN animation → canonical resting state → wait.
//
// What changed is only the rendering + animation AUTHORITY: instead of translating
// a natural-height reconstruction with CSS vars, we drive the actual mobile app
// inside an isolated 393×852 iframe. The visitor never touches the iframe (pointer
// events are disabled on it); wheel/trackpad input belongs to THIS parent. One
// deliberate gesture = exactly one state. Momentum cannot skip. Input is locked
// while a transition runs. Opposite-direction firm gesture reverses immediately.
//
// The DemoDirector uses the app's own controls as animation primitives — it clicks
// the real tab, animates the real scroll container's scrollTop, clicks the real
// Exploration Results card so the real BottomSheet opens. Nothing is reconstructed,
// no fake sheets, no fake camera transforms, no wheel→scrollTop scrubbing.
//
// PROOF SLICE (this file): A Overview → B Projects → C Project Intelligence →
// D Exploration Results, and the exact reverse. See /site?directedEmbed=1.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MX } from "../system.jsx";
import { DEVICE_W, DEVICE_H } from "./MobileAppFrame.jsx";
import { PP_ASSETS } from "./ppAssets.js";

// The screen for the ~240ms before the real app paints. It is the APP'S OWN background,
// so the hand-off is invisible rather than a contrasting slab flashing to light UI.
const BOOT_SCREEN = "#f4f5f7";
// The app's OWN opening frame, captured from /app?c=kingsmen-resources&embed=1 at the
// iframe's exact 393x852 viewport (qa/poster.mjs). The app needs ~1.8s to boot even with
// the connection to itself, and until now the phone showed a flat grey fill for that
// whole time. This is the identical first frame, so the device is complete from the first
// paint of the page and the live app cross-fades in underneath it when it is ready —
// nothing changes on screen at the swap, it simply becomes interactive.
const BOOT_POSTER = "/marketing/app-opening-poster.webp";

// The boot cover: the real opening frame over the device-coloured fill, faded out once
// the app has painted. `settled` keeps it mounted through the fade so there is no flash.
function BootCover({ ready }) {
  return (
    <div aria-hidden style={{
      position: "absolute", inset: 0, background: BOOT_SCREEN, zIndex: 2,
      opacity: ready ? 0 : 1, pointerEvents: "none",
      transition: "opacity 420ms cubic-bezier(0.22,1,0.36,1)",
    }}>
      <img src={BOOT_POSTER} alt="" decoding="async" fetchpriority="high"
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }} />
    </div>
  );
}


// ── Marketing hardware frame (SALES PAGE ONLY). With `hardware`, the real app renders inside
// this supplied phone photo instead of the CSS bezel — the production app is untouched. The
// active-display aperture, corner radius and Dynamic Island were measured from the asset's
// pixels (1024×1536). Layering: phone photo (bottom) · live app clipped to the aperture ·
// Dynamic Island re-drawn on top so the hardware always occludes the app. ──
// TWO-LAYER COMPOSITE — the approved photorealistic hardware, prepared as a single cutout asset.
// bottom: the live app, oversized so it runs UNDER the hardware (no seam). top: the pristine phone
// PNG with its display area cut transparent. The hardware artwork alone defines the visible edge —
// no CSS frame, no SVG mask, no bezel, no aperture math, no Dynamic Island.
// SIMPLE COMPOSITE — the ORIGINAL reference phone photo is the visual source of truth and is rendered
// UNMODIFIED at the bottom (it supplies titanium, black bezel, corners, buttons, reflections, shadows and
// the Dynamic Island). The live MineEx app is placed OVER the baked-in screenshot, clipped to the white
// display shape (stopping at the inner edge of the black bezel). The Dynamic Island is then extracted from
// the SAME photo and placed above the live app. No CSS bezel, no black backdrop, no cutout hole, no mask.
// Sub-pixel bleed so the app cannot leave a seam where it meets the photo's own bezel edge.
// Costs ~1.1pt horizontally / ~1.7pt vertically of the 393×852 viewport, concealed by the bezel.
const CUTOUT_BLEED = 1.004;

export const PHONE = {
  src: "/marketing/pro-phone-79.webp",   // ORIGINAL, unmodified reference image (971×1620)
  // The same photo with ONLY the display opening cut to alpha 0, anti-aliased along the
  // hardware's real curve. RGB is byte-identical on every still-visible pixel; the titanium,
  // bezel, buttons, reflections and Dynamic Island are untouched original pixels. Used by the
  // `cutout` composite below, where the photo sits ON TOP of the app and is therefore the
  // ONLY thing defining the display boundary.
  cutout: "/marketing/pro-phone-79-cutout.webp",
  // The exact complement of `cutout`: opaque inside the display opening, transparent outside.
  // Generated from the SAME measured boundary, so clipping the app to it introduces no second
  // radius and cannot disagree with the photograph.
  screenMask: "/marketing/pro-phone-79-screenmask.webp",
  // The display opening, measured from the photo's own pixels (content-independent: straight
  // edges plus the most-open corner profile of all four corners). Replaces the manufactured
  // rounded rect that `display` + `displayRadiusPx` + `displayInsetPx` describe.
  opening: { left: 148.58 / 971, top: 78.87 / 1620, right: 823.66 / 971, bottom: 1545.21 / 1620 },
  imgW: 971, imgH: 1620,
  imgAspect: 971 / 1620,
  // White DISPLAY shape (inside the black bezel), measured from the original image's pixels.
  display: { left: 149 / 971, top: 79 / 1620, right: 824 / 971, bottom: 1545 / 1620 },
  displayRadiusPx: 86,   // white display corner radius (asset px), circle-fit from the original
  displayInsetPx: 2,     // clip the live layer this far INSIDE the display so it never covers the black bezel
  // Calibration of the LIVE app's INTERNAL transform ONLY (physical display geometry is frozen), so the live
  // content lands on the baked-in reference landmarks (9:41, logo, title, cards, AI brief, bottom nav).
  appScaleCal: 1.016,    // multiply the cover-scale so the app's content size matches the baked screenshot
  appShiftXAsset: 2,     // horizontal nudge (asset px, +right) to center on the baked reference
  appShiftYAsset: 22,    // vertical nudge (asset px, +down) after scaling, to seat the landmarks
  // Dynamic Island pill, extracted from the original photo and placed above the live app. Bounds are the
  // measured black-pill bbox pulled ~2px INSIDE, so the clip shows only the pure-black pill + camera detail
  // and never the anti-aliased white status-bar edge around it (no white outline/halo).
  di: { left: 384 / 971, top: 101 / 1620, right: 589 / 971, bottom: 151 / 1620 },
};
// DIAGNOSTIC: fill the live-screen rect with hot pink instead of the iframe to calibrate the display clip
// against the ORIGINAL image (the pink must never cover any black-bezel pixels). Set false for the real app.
const DEBUG_SCREEN = false;

// 22 states → 16 narrative beats: Profile → AI Brief → expanded Projects → Progress →
// Capital → Leadership. The expanded Projects portion (states 3–16) is the frozen
// ProjectsAct sequence, merged in verbatim; the two seams (2↔3 and 16↔17) join it to
// the rest. Everything after Projects is the original choreography, index-shifted only.
const FULL_STATES = [
  { id: "overviewHero" },   // 0  Profile — Overview photographic Company Status face
  { id: "overviewInfo" },   // 1  Profile — Overview status/info grid face (AI Brief card below)
  { id: "brief" },          // 2  AI Brief — the real BriefOverlay (still on Overview)
  // ── Projects act: Las Coloradas explored in depth, then Almoloya as the multiple-projects finale ──
  { id: "projects" },       // 3  Your Projects — Las Coloradas arrival, gallery photo 0
  { id: "lcPhoto1" },       // 4  Real Photography — native advance to photo 1
  { id: "lcPhoto2" },       // 5  Real Photography — native advance to photo 2
  { id: "lcSnapshot" },     // 6  Project Snapshot — Las Coloradas fundamentals grid
  { id: "stage" },          // 10 Project Context — real Discovery Stage sheet
  { id: "techIntel" },      // 11 Technical Intelligence — TI grid
  { id: "geoModel" },       // 12 Geological Model — real Geological Model sheet
  { id: "drill" },          // 13 Exploration Results — real Exploration Results sheet
  { id: "finalSynth" },     // 14 The Investment Case — real Final Synthesis
  { id: "bull" },           // 15 A Balanced View — Bull case
  { id: "bear" },           // 16 A Balanced View — Bear case
  { id: "nextVal" },        // 14 A Balanced View — Next Validation Point
  { id: "almoArrive" },     // 15 Multiple Projects (finale) — one clean switch to Almoloya; its own profile, rests
  // ── Progress / Capital / Leadership ──
  { id: "timeline" },       // 18 Progress — Timeline: The Story So Far
  { id: "milestone" },      // 19 Progress — Jan 19 2026 Discovery milestone detail
  { id: "capital" },        // 20 Capital — Capital Overview
  { id: "capStruct" },      // 21 Capital — Capital Structure (Share Structure sheet)
  { id: "team" },           // 22 Leadership — Board & Management top
  { id: "ceoBio" },         // 23 Management Profiles — Scott Emerson's real CEO bio BottomSheet
  // ── Media (the real Updates tab) — overview grid ONLY (the walkthrough never opens a post) ──
  { id: "mediaGrid" },      // 22 Media — the real Updates MediaGrid (photo + two videos)
  // ── Follow / investor retention (the commercial payoff) — ON the Media/Updates page ──
  { id: "follow" },         // 23 Follow — real Follow control visible on the Updates page (not activated)
  { id: "following" },      // 24 Following — the real Follow → Following change (final frame)
];

// HOME variant — the CONDENSED homepage deck (/home). SAME device, SAME boot
// cover, SAME __ppNav slide transition and SAME lifecycle events as the full
// walkthrough above; only the STATE LIST is reduced to the six canonical top-level
// pages. Each transition is a pure top-level tab nav (goHome), so the homepage is a
// genuine reduction of the approved walkthrough, not a separate implementation.
const HOME_STATES = [
  { id: "overview" },   // 01 / 06  OVERVIEW
  { id: "projects" },   // 02 / 06  PROJECTS
  { id: "timeline" },   // 03 / 06  PROGRESS
  { id: "capital" },    // 04 / 06  CAPITAL
  { id: "team" },       // 05 / 06  LEADERSHIP
  { id: "updates" },    // 06 / 06  UPDATES
];

// Gesture snap-state machine — identical thresholds to the locked camera model.
const WHEEL_TRIGGER = 20;    // accumulated wheel delta = one deliberate gesture
const NEW_GESTURE_GAP = 90;  // a pause (ms) = fingers lifted = a new gesture
const FIRM_DELTA = 12;       // a real swipe drives ≥ this; an inertia tail never does

// Automatic opening reveal (photo hero → real flip → status face). The visitor never
// spends a gesture on the flip: once the app has painted on its photographic hero we
// hold briefly, then run the REAL Company Status flip, and STOP on the status face.
const OPEN_HOLD = 1200;  // ms the photographic hero sits STILL before the flip — long enough that the viewer
                         // clearly registers the photo as a resting frame, so the flip reads as a deliberate event
const OPEN_FLOOR = 1;    // user gestures never return below the status face; the photo hero is a one-time opening

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
// Poll with setTimeout, not requestAnimationFrame: rAF is fully PAUSED (not merely
// throttled) whenever the page/pane is hidden or unfocused, which would hang a
// directed transition mid-wait. setTimeout keeps ticking, so the demo survives a
// focus change and always settles.
const waitFor = (cond, timeout = 2000) =>
  new Promise((res) => {
    const t0 = performance.now();
    const tick = () => { if (cond() || performance.now() - t0 > timeout) return res(); setTimeout(tick, 30); };
    tick();
  });
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

export function DirectedEmbed({ variant = "full", hardware = false, cutout = false } = {}) {
  const STATES = variant === "home" ? HOME_STATES : FULL_STATES;
  const boxRef = useRef(null);
  const frameRef = useRef(null);
  // Zeroed hardware-mode fields so the FIRST render (before useLayoutEffect measures)
  // has valid numbers — otherwise diH/2, appRadius etc. are NaN/undefined and React
  // warns. measure() overwrites these synchronously before paint.
  const [dims, setDims] = useState({ scale: 1, w: DEVICE_W, h: DEVICE_H, boxH: 0, appLeft: 0, appTop: 0, appW: 0, appH: 0, appRadius: 0, appOffX: 0, appOffY: 0, diLeft: 0, diTop: 0, diW: 0, diH: 0, opL: 0, opT: 0, opW: 0, opH: 0 });
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);   // gates wheel input: no interaction until the app has painted
  const openedRef = useRef(false);  // the automatic opening reveal has played this boot (reset on every reboot)
  const autoOpenRef = useRef(null); // set by the gesture-machine effect; invoked once when the app first paints
  const resetRef = useRef(null);    // set by the gesture-machine effect; rewinds the machine to state 0 when the iframe reboots

  // Preload the profile's images in the PARENT (same origin → the iframe reuses the
  // HTTP cache), so a tab's hero never slides in blank on a cold first navigation.
  //
  // WAITS FOR THE APP TO PAINT. This used to start on mount, which meant 58 images were
  // queued against the iframe's own critical resources while it was still booting — the
  // app renders in 1.8s alone but took ~6s on the home page, and this was most of the
  // difference. Nothing it warms is on screen in those first seconds: it exists so a
  // LATER tab's hero is instant. Starting it once the phone has painted keeps that
  // benefit and gives the boot the full connection.
  useEffect(() => {
    if (!ready) return;
    let stop = false, i = 0;
    const ric = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 150));
    const pump = (dl) => {
      while (!stop && i < PP_ASSETS.length && (dl.timeRemaining() > 3 || dl.didTimeout)) { const im = new Image(); im.decoding = "async"; im.src = PP_ASSETS[i++]; }
      if (!stop && i < PP_ASSETS.length) ric(pump);
    };
    ric(pump);
    return () => { stop = true; };
  }, [ready]);

  // A neutral device-coloured cover sits over the iframe whenever the app is
  // (re)booting — before its first paint AND across any reload (e.g. a dev HMR
  // reload). It is a plain fill matching the app background, NOT a screenshot of
  // content, so the phone never exposes the app's own boot "Loading…" screen, a
  // white frame, or an empty gap. Once the profile has painted it is removed and
  // stays removed for normal navigation.
  const settleApp = React.useCallback(() => {
    readyRef.current = false;               // block interaction until (re)painted
    openedRef.current = false;              // the opening reveal replays on every (re)boot — deterministic
    if (resetRef.current) resetRef.current(); // rewind the machine to state 0 so a reboot restarts from the opening
    const t0 = performance.now();
    const reveal = () => {
      readyRef.current = true; setReady(true);
      // Marketing-only presentation override, injected into the DEMO IFRAME only (production
      // is untouched): normalize the active project pill's per-project accent (e.g. Almoloya's
      // teal #0D9488) to the MineEx primary accent, so the project selector reads consistent
      // and premium in the sales demo. Targets ONLY the pill (button.flex-1 with an inline
      // background); the AI-brief button and value cards are not flex-1. A !important rule
      // overrides the app's inline background without changing the app's source.
      try {
        const d0 = frameRef.current && frameRef.current.contentDocument;
        if (d0 && d0.head && !d0.getElementById("mx-demo-accent")) {
          const st = d0.createElement("style"); st.id = "mx-demo-accent";
          st.textContent = '[data-page="projects"] button.flex-1[style*="background"]{background:#2563eb !important;color:#fff !important;}';
          d0.head.appendChild(st);
        }
      } catch (_) {}
      // The phone is now painted on its photographic hero. Fire the one-time automatic
      // opening reveal (hold → real flip → status face). It runs only from state 0, so a
      // dev HMR reload mid-demo never wrongly replays it.
      if (!openedRef.current && autoOpenRef.current) { openedRef.current = true; autoOpenRef.current(); }
    };
    const tick = () => {
      try {
        const d = frameRef.current && frameRef.current.contentDocument;
        const page = d && (d.querySelector('[data-page="overview"]') || d.querySelector("[data-page]"));
        // Reveal only once the profile is mounted AND its hero image has decoded (or a
        // safety cap), then wait two frames so the paint has actually flushed — so the
        // phone is revealed already fully drawn, never mid-paint.
        const hero = page && page.querySelector("img");
        const heroReady = !hero || (hero.complete && hero.naturalWidth > 0);
        if (page && (heroReady || performance.now() - t0 > 2500)) {
          requestAnimationFrame(() => requestAnimationFrame(reveal));
          return;
        }
      } catch (_) {}
      if (performance.now() - t0 < 20000) setTimeout(tick, 40); else reveal();
    };
    tick();
  }, []);
  useEffect(() => { settleApp(); }, [settleApp]);   // cover the initial boot

  // Fit the 393×852 device box into the available area (never scale the app itself —
  // only the iframe element is transform-scaled; its internal viewport stays 393×852).
  useLayoutEffect(() => {
    const b = boxRef.current; if (!b) return;
    const measure = () => {
      const availW = b.clientWidth || DEVICE_W;
      const availH = b.clientHeight || DEVICE_H;
      if (hardware && cutout) {
        // ONE boundary: map the 393×852 device viewport straight onto the measured opening.
        // No cover calibration, no shift, no manufactured radius — the photo above defines
        // the display edge, so there is nothing for a second shape to disagree with.
        const boxW = Math.round(availH * PHONE.imgAspect);
        const boxH = boxW * PHONE.imgH / PHONE.imgW;
        const op = PHONE.opening;
        const opL = op.left * boxW, opR = op.right * boxW;
        const opT = op.top * boxH,  opB = op.bottom * boxH;
        const opW = opR - opL, opH = opB - opT;
        const appScale = Math.max(opW / DEVICE_W, opH / DEVICE_H) * CUTOUT_BLEED;
        const appVW = DEVICE_W * appScale, appVH = DEVICE_H * appScale;
        setDims({
          scale: appScale, w: boxW, boxH,
          appLeft: opL + (opW - appVW) / 2, appTop: opT + (opH - appVH) / 2,
          appW: appVW, appH: appVH, opL, opT, opW, opH,
        });
        return;
      }
      if (hardware) {
        // Box = width × (width × imgH/imgW) via aspect-ratio, matching the original photo exactly.
        const boxW = Math.round(availH * PHONE.imgAspect);
        const boxH = boxW * PHONE.imgH / PHONE.imgW;
        const k = boxW / PHONE.imgW;
        // Live display clip = the white display shape, pulled INSIDE by `ins` so it never covers the bezel.
        const d = PHONE.display, ins = PHONE.displayInsetPx * k;
        const appL = d.left * boxW + ins, appR = d.right * boxW - ins;
        const appT = d.top * boxH + ins, appB = d.bottom * boxH - ins;
        const appW = appR - appL, appH = appB - appT;
        const appScale = Math.max(appW / DEVICE_W, appH / DEVICE_H) * PHONE.appScaleCal; // COVER × calibration
        const appVW = DEVICE_W * appScale, appVH = DEVICE_H * appScale;
        const di = PHONE.di;
        setDims({
          scale: appScale, w: boxW, boxH,
          appLeft: appL, appTop: appT, appW, appH,
          appOffX: Math.round((appW - appVW) / 2 + PHONE.appShiftXAsset * k), appOffY: Math.round((appH - appVH) / 2 + PHONE.appShiftYAsset * k),
          appRadius: Math.round((PHONE.displayRadiusPx - PHONE.displayInsetPx) * k),
          diLeft: di.left * boxW, diTop: di.top * boxH,
          diW: (di.right - di.left) * boxW, diH: (di.bottom - di.top) * boxH,
        });
        return;
      }
      const scale = Math.min(availW / DEVICE_W, availH / DEVICE_H, 1);
      setDims({ scale, w: Math.round(DEVICE_W * scale), h: Math.round(DEVICE_H * scale) });
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(b);
    return () => ro.disconnect();
  }, [hardware]);

  useEffect(() => {
    const doc = () => { try { return frameRef.current && frameRef.current.contentDocument; } catch (_) { return null; } };
    const win = () => { try { return frameRef.current && frameRef.current.contentWindow; } catch (_) { return null; } };
    const q = (s) => { const d = doc(); return d ? d.querySelector(s) : null; };
    const profilePage = (id) => q(`[data-page="${id}"]`);
    const tabBtn = (id) => q(`button[aria-label="${id}"]`);
    // Profile-tab navigation is commanded via the app's own deterministic slide API
    // (window.__ppNav, registered by the mounted SwipePager in embed mode) — see the
    // 0↔1 transitions below. No synthetic finger drag: the parent just triggers it.
    // The MAIN content scroller is the scrollable `.pp-scroll` ANCESTOR of the drill
    // card (the real app nests the page content inside the scroller, and there are
    // other non-scrolling .pp-scroll nodes like the image carousel). Walk up to it.
    const scrollAncestorOf = (start) => {
      let el = start;
      while (el) {
        if (el.classList && el.classList.contains("pp-scroll") && el.scrollHeight - el.clientHeight > 8) return el;
        el = el.parentElement;
      }
      return null;
    };
    const projScroller = () => scrollAncestorOf(drillCard());
    const drillCard = () => q('[data-fc="projects.drillResults"]');
    const drillSheet = () => {
      const d = doc(); if (!d) return null;
      return [...d.querySelectorAll(".justify-end")].find((e) => /Exploration Results|Best drill/i.test(e.textContent || "")) || null;
    };
    const drillClose = () => { const s = drillSheet(); return s ? s.querySelector('button[aria-label="Close"]') : null; };

    // ── Timeline chapter helpers ──────────────────────────────────────────────────
    const milestoneCard = () => q('[data-fc="timeline.2026-01-19"]');   // Jan 19 2026 Discovery ("Confirms Continuity… 704 g/t")
    const timelineScroller = () => scrollAncestorOf(milestoneCard());
    const milestoneSheet = () => {
      const d = doc(); if (!d) return null;
      return [...d.querySelectorAll(".justify-end")].find((e) => /WHAT HAPPENED|Continuity of Mineralization/i.test(e.textContent || "")) || null;
    };
    const milestoneClose = () => { const s = milestoneSheet(); return s ? s.querySelector('button[aria-label="Close"]') : null; };
    const capitalScroller = () => scrollAncestorOf(q('[data-fc^="capital."]'));
    const teamScroller = () => scrollAncestorOf(q('[data-fc^="team."]'));
    // ── Management Profiles helpers (Phase D) ─────────────────────────────────────
    // Scott Emerson's card on the Leadership (team) page opens his REAL bio BottomSheet
    // (President, CEO & Director — the actual TEAM_MEMBERS bio, nothing reconstructed).
    const ceoCard = () => {
      const t = profilePage("team"); if (!t) return null;
      return [...t.querySelectorAll("button")].find((b) => /Scott Emerson/i.test(b.textContent || "") && /President|CEO/i.test(b.textContent || "") && !b.closest(".justify-end")) || null;
    };
    const ceoSheet = () => {
      const d = doc(); if (!d) return null;
      return [...d.querySelectorAll(".justify-end")].find((e) => /Scott Emerson/i.test(e.textContent || "") && /President, CEO & Director|founding President|Golden Peaks/i.test(e.textContent || "")) || null;
    };
    const ceoClose = () => { const s = ceoSheet(); return s ? s.querySelector('button[aria-label="Close"]') : null; };
    // ── Media helpers (Phase E) — the REAL Updates tab MediaGrid + MediaViewer ────
    const updatesPage = () => profilePage("updates");
    const mediaItems = () => { const u = updatesPage(); return u ? [...u.querySelectorAll("button")].filter((b) => b.querySelector("img") || b.querySelector("video")) : []; };
    const mediaViewerEl = () => { const d = doc(); if (!d) return null; return [...d.querySelectorAll("div")].find((e) => typeof e.className === "string" && e.className.includes("z-[95]")) || null; };
    const mediaViewerClose = () => { const v = mediaViewerEl(); return v ? v.querySelector('button[aria-label="Back"]') : null; };
    // ── Capital Structure helpers (I2) ────────────────────────────────────────────
    // The real "Share Structure" card in the Capital page's EXPLORE section opens the
    // authentic Share Structure BottomSheet — full cap table, options & warrants, 23.2%
    // potential dilution, C$14.8M exercise proceeds. We open the REAL sheet; nothing is
    // reconstructed. (Exclude any match inside an open sheet so we always hit the card.)
    const shareCard = () => {
      const d = doc(); if (!d) return null;
      return [...d.querySelectorAll("button")].find((b) => /Share Structure/i.test(b.textContent || "") && (b.textContent || "").length < 140 && !b.closest(".justify-end")) || null;
    };
    const shareSheet = () => {
      const d = doc(); if (!d) return null;
      return [...d.querySelectorAll(".justify-end")].find((e) => /Share Structure/i.test(e.textContent || "") && /Warrants|Potential Dilution|EXERCISE PROCEEDS/i.test(e.textContent || "")) || null;
    };
    const shareClose = () => { const s = shareSheet(); return s ? s.querySelector('button[aria-label="Close"]') : null; };
    // Frame the Share Structure card ~140px below the top before opening its sheet.
    const shareTarget = () => {
      const s = capitalScroller(), card = shareCard();
      if (!s || !card) return 0;
      const sr = s.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const off = cr.top - sr.top + s.scrollTop, range = Math.max(0, s.scrollHeight - s.clientHeight);
      return Math.max(0, Math.min(range, Math.round(off - 140)));
    };
    // The real AI Brief card lives on Overview under the Company Status card (Overview
    // fits the viewport, so it's already visible — no scroll needed; B→C just opens it).
    const aiBriefCard = () => { const d = doc(); return d ? ([...d.querySelectorAll("button")].find((b) => /in 60 Seconds/i.test(b.textContent || "")) || null) : null; };
    const briefSheet = () => {
      const d = doc(); if (!d) return null;
      return [...d.querySelectorAll(".justify-end")].find((e) => /Company Orientation|Understand this company in under a minute/i.test(e.textContent || "")) || null;
    };
    const briefClose = () => { const s = briefSheet(); return s ? s.querySelector('button[aria-label="Close"]') : null; };
    // Frame the milestone ~110px below the top — a small, authentic, reachable scroll.
    const milestoneTarget = () => {
      const s = timelineScroller(), card = milestoneCard();
      if (!s || !card) return 0;
      const sr = s.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const off = cr.top - sr.top + s.scrollTop, range = Math.max(0, s.scrollHeight - s.clientHeight);
      return Math.max(0, Math.min(range, Math.round(off - 110)));
    };

    // The canonical Project Intelligence scroll position: the real content scrolled so
    // the Exploration Results card sits ~140px below the top (authentic, reachable).
    const cTarget = () => {
      const s = projScroller(); if (!s) return 0;
      const range = Math.max(0, s.scrollHeight - s.clientHeight);
      const drill = drillCard();
      if (!drill) return range;
      const mr = s.getBoundingClientRect(), dr = drill.getBoundingClientRect();
      const off = dr.top - mr.top + s.scrollTop;
      return Math.max(0, Math.min(range, Math.round(off - 140)));
    };
    const smoothScroll = (el, to, dur = 720) =>
      new Promise((res) => {
        if (!el) return res();
        const from = el.scrollTop, d = to - from, t0 = performance.now();
        if (Math.abs(d) < 1) return res();
        const step = (now) => {
          const u = Math.min(1, (now - t0) / dur);
          el.scrollTop = from + d * easeInOut(u);
          if (u < 1) requestAnimationFrame(step); else res();
        };
        requestAnimationFrame(step);
      });

    const setFace = (face) => { const w = win(); if (w && w.__ppSetFace) w.__ppSetFace(face); };
    // Embed-only Follow control: drives the REAL ProfileHeader Follow ⇄ Following via the
    // app's __ppSetFollow override — no listStore / localStorage / cloud write (see CompanyProfile).
    const setFollow = (v) => { const w = win(); if (w && w.__ppSetFollow) w.__ppSetFollow(v); };
    // Embed-only presentation emphasis (a subtle pulsing ring) AROUND the real Follow button —
    // no fake cursor/finger/duplicate/overlay. Driven by the app's __ppFollowEmphasis override.
    const setFollowEmphasis = (v) => { const w = win(); if (w && w.__ppFollowEmphasis) w.__ppFollowEmphasis(v); };
    // A single tactile press (scale-down + spring-back) on the REAL Follow button at activation.
    const pressFollow = () => { const w = win(); if (w && w.__ppFollowPress) w.__ppFollowPress(); };

    // ── Projects-act helpers (merged verbatim from the frozen ProjectsAct) ─────────
    // Native gallery, __ppScrollTo vertical @ 720ms, real sheets, real selector, real
    // Value-Driver cards. No parent frame-by-frame animation. See ProjectsAct.jsx.
    const V_DUR = 720;
    const projPage = () => profilePage("projects");
    const projBtn = (re) => { const p = projPage(); return p ? [...p.querySelectorAll("button")].find((b) => re.test((b.textContent || "").replace(/\s+/g, " "))) : null; };
    const galleryTrack = () => { const p = projPage(); return p ? ([...p.querySelectorAll(".pp-scroll")].find((e) => e.scrollWidth > e.clientWidth + 50 && getComputedStyle(e).scrollSnapType.includes("x")) || null) : null; };
    const pageScroller = () => scrollAncestorOf(projBtn(/What Sets This Project Apart/i) || projBtn(/Geological Model/i) || projBtn(/Project Stage/i));
    const anySheet = () => { const d = doc(); return d ? ([...d.querySelectorAll(".justify-end")].filter((e) => e.querySelector('button[aria-label="Close"]')).pop() || null) : null; };
    const activePill = () => { const p = projPage(); if (!p) return null; const b = [...p.querySelectorAll("button")].find((x) => /^(Las Coloradas|Almoloya)$/.test((x.textContent || "").trim()) && /background/.test(x.getAttribute("style") || "")); return b ? b.textContent.trim() : null; };
    const valueCards = () => { const p = projPage(); if (!p) return []; return [...p.querySelectorAll("button")].filter((b) => { const r = b.getBoundingClientRect(); return b.querySelector("svg") && (b.textContent || "").trim().length < 3 && r.width > 40 && r.width < 120 && Math.abs(r.width - r.height) < 30; }); };
    // Gallery: the real scroll-snap track's own native smooth scroll to a child offset.
    const galleryTo = (index) =>
      new Promise((res) => {
        const t = galleryTrack(); if (!t) return res();
        const kids = [...t.children]; const to = kids[index] ? kids[index].offsetLeft : index * (kids[0] ? kids[0].offsetWidth : 351);
        if (Math.abs(t.scrollLeft - to) < 2) { t.scrollLeft = to; return res(); }
        try { t.scrollTo({ left: to, behavior: "smooth" }); } catch (_) { t.scrollLeft = to; return res(); }
        const t0 = performance.now();
        const check = () => { if (Math.abs(t.scrollLeft - to) < 2 || performance.now() - t0 > 1200) { t.scrollLeft = to; return res(); } setTimeout(check, 40); };
        setTimeout(check, 60);
      });
    // Vertical: the app's own __ppScrollTo at 720ms — the frozen Project-Intelligence character.
    const vTargetOf = (el, pad = 110) => { const s = pageScroller(); if (!s || !el) return 0; const sr = s.getBoundingClientRect(), er = el.getBoundingClientRect(); const off = er.top - sr.top + s.scrollTop, range = Math.max(0, s.scrollHeight - s.clientHeight); return Math.max(0, Math.min(range, Math.round(off - pad))); };
    const vScrollTo = async (target, dur = V_DUR) => { const w = win(); if (w && w.__ppScrollTo) await w.__ppScrollTo(target, dur); else { const s = pageScroller(); if (s) s.scrollTop = target; } };
    const vScrollToEl = async (el, pad, dur = V_DUR) => { await vScrollTo(vTargetOf(el, pad), dur); };
    const vScrollTop = async (dur = V_DUR) => { await vScrollTo(0, dur); };
    // The Value Drivers sit at the page foot where __ppScrollTo stops short; use the
    // scroller's own native smooth scroll, re-targeting the live bottom until it settles.
    const vdScroller = () => { let s = valueCards()[0]; while (s) { if (s.classList && s.classList.contains("pp-scroll") && s.scrollHeight - s.clientHeight > 8) return s; s = s.parentElement; } return pageScroller(); };
    const vScrollBottom = () =>
      new Promise((res) => {
        const s = vdScroller(); if (!s) return res();
        const t0 = performance.now(); let stable = 0;
        const tick = () => {
          const remaining = s.scrollHeight - s.clientHeight - s.scrollTop;
          if (performance.now() - t0 > 1200) { s.scrollTop = s.scrollHeight; return res(); }
          if (remaining > 3) { stable = 0; try { s.scrollTo({ top: s.scrollHeight, behavior: "smooth" }); } catch (_) { s.scrollTop = s.scrollHeight; } setTimeout(tick, 110); }
          else if (++stable < 2) { setTimeout(tick, 90); }   // two stable reads (dynamic value-card height) is enough
          else res();
        };
        setTimeout(tick, 40);
      });
    // Timings below are trimmed to the app's REAL sheet animation (enter = 320ms slide,
    // exit unmounts at 280ms — see BottomSheet), not conservative padding. The fixed
    // delays cover just the visible settle so contentready fires as the motion lands.
    const openSheet = async (re) => { const b = projBtn(re); if (b) b.click(); await waitFor(() => !!anySheet()); await delay(340); };  // 320ms slide + ~20ms
    const closeSheet = async () => { const s = anySheet(); const c = s && s.querySelector('button[aria-label="Close"]'); if (c) c.click(); await waitFor(() => !anySheet()); await delay(90); };  // sheet already unmounted at ~280ms; small settle only
    const switchTo = async (name) => { if (activePill() === name) return; const p = projPage(); const pill = p && [...p.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === name); if (pill) pill.click(); await waitFor(() => activePill() === name, 2600); await delay(140); };  // real swap ~24ms
    const tapValue = async (i) => { const c = valueCards()[i]; if (c) c.click(); await delay(220); };
    const stageTile = () => projBtn(/Project Stage/i);
    const techAnchor = () => projBtn(/Geological Model/i);
    const whatSets = () => projBtn(/What Sets This Project Apart/i);

    // Directed lifecycle events — the narrative synchronizes to THESE, not to polling:
    //   demo:transitionstart  the phone begins moving (outgoing copy may depart in step)
    //   demo:contentready     the destination content is in place (incoming copy arrives)
    //   demo:settled          the transition is fully complete (both settle together)
    // They carry raw {from,to}; the marketing layer owns the state→beat mapping, so this
    // file stays agnostic to how many narrative beats exist.
    const emit = (name, detail) => { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {} };
    // ── The directed transitions — each drives the REAL app and settles. ──────────
    // Dispatch is keyed by STATE ID (not numeric index): inserting a state is a splice
    // in STATES + one id-pair branch here, with no renumbering of everything downstream.
    // HOME variant transition — a pure top-level tab nav, reusing the SAME primitive
    // the full walkthrough's seams use (__ppNav slide → wait for the destination page →
    // reset its scrollers to the top → await the slide). No opacity fade, no black mask:
    // the app performs its own white-on-white slide and stays continuously visible.
    // Marketing-only presentation override (home variant), injected into the DEMO IFRAME
    // only — production is untouched. The real app's __ppNav marks the destination tab
    // active only when its 560ms slide COMPLETES (PassportProto SwipePager setTab), so the
    // tab indicator lags the content. Here we make the destination tab LEAD the slide: an
    // !important stylesheet (beats the app's inline color) drives the tab colour + a CSS
    // underline from a data attribute we set the instant navigation starts. The app's own
    // underline spans are hidden so there is never a double indicator; when the app finally
    // re-renders at slide end it sets the same active tab, so the result is identical.
    const HOME_TAB_IDS = ["overview", "projects", "timeline", "capital", "team", "updates"];
    const leadTab = (id) => {
      try {
        const d = doc(); if (!d) return;
        if (d.head && !d.getElementById("mx-demo-tablead")) {
          const st = d.createElement("style"); st.id = "mx-demo-tablead";
          st.textContent =
            '[data-mxtabrow] > button > span.absolute{display:none !important;}' +
            'button[data-mxtab="active"]{color:#0f172a !important;}' +
            'button[data-mxtab="inactive"]{color:#9ca3af !important;}' +
            'button[data-mxtab="active"]::after{content:"";position:absolute;bottom:-1px;left:50%;width:20px;height:2px;transform:translateX(-50%);border-radius:9999px;background:#0f172a;}';
          d.head.appendChild(st);
        }
        let row = null;
        HOME_TAB_IDS.forEach((t) => { const b = d.querySelector(`button[aria-label="${t}"]`); if (b) { b.setAttribute("data-mxtab", t === id ? "active" : "inactive"); row = b.parentElement; } });
        if (row) row.setAttribute("data-mxtabrow", "1");
      } catch (_) {}
    };

    const goHome = async (from, to) => {
      const tab = (STATES[to] || {}).id;
      await waitFor(() => !!(win() && win().__ppNav), 5000);   // don't move copy before the nav API exists
      leadTab(tab);                                            // destination tab leads the slide (no lag)
      const w = win();
      const navP = (w && w.__ppNav) ? w.__ppNav(tab) : Promise.resolve();
      await waitFor(() => !!profilePage(tab), 4000);           // destination content is mounted
      try { const d = doc(); if (d) d.querySelectorAll(".pp-scroll").forEach((s) => { try { s.scrollTop = 0; } catch (_) {} }); } catch (_) {}
      await navP;                                              // the app's own slide finishes
      // Returning to Overview rests on the status/info face (the walkthrough does the
      // same on its reverse into Overview), so Overview always matches the walkthrough.
      if (tab === "overview") { setFace("status"); await delay(200); }
      await delay(40);
    };

    const go = async (from, to) => {
      if (variant === "home") return goHome(from, to);
      const a = (STATES[from] || {}).id, b = (STATES[to] || {}).id;
      const pair = (x, y) => (a === x && b === y);
      // ── overviewHero ↔ overviewInfo: the REAL Company Status flip (photo ↔ info grid) ──
      // 0.85s real flip + a longer settle so the status face clearly ARRIVES and STOPS.
      if (pair("overviewHero", "overviewInfo")) { setFace("status"); await delay(1150); }
      else if (pair("overviewInfo", "overviewHero")) { setFace("photo"); await delay(1000); }
      // ── overviewInfo ↔ brief: open the real AI Brief overlay (still on Overview) ──
      else if (pair("overviewInfo", "brief")) {
        const card = aiBriefCard(); if (card) card.click();  // open the REAL BriefOverlay
        await waitFor(() => !!briefClose());
        await delay(320);
      } else if (pair("brief", "overviewInfo")) {
        const c = briefClose(); if (c) c.click();
        await waitFor(() => !briefSheet());
        await delay(200);
      }
      // ══ SEAM 1 — brief ↔ projects: AI Brief → YOUR PROJECTS. Close the AI Brief → real
      // __ppNav("projects") slide → Las Coloradas, page top, gallery photo 0. Gallery/scroll
      // reset happens DURING the slide (destination parked off-stage), no post-nav padding.
      else if (pair("brief", "projects")) {
        const w = win();
        const c = briefClose(); if (c) c.click();            // the brief begins dismissing — immediate response
        // Start the Overview→Projects slide IN PARALLEL with the brief dismissing (its ~280ms
        // exit overlaps the nav's gate + early slide) instead of waiting it out first, so
        // Projects and its narrative arrive with no dead beat between them.
        const navP = (w && w.__ppNav) ? w.__ppNav("projects") : Promise.resolve();
        await waitFor(() => !!profilePage("projects"));
        const gt = galleryTrack(); if (gt) gt.scrollLeft = 0;
        const s = projScroller(); if (s) s.scrollTop = 0;
        await navP;
      } else if (pair("projects", "brief")) {                // reverse: Projects → Overview → reopen AI Brief
        const w = win();
        if (w && w.__ppNav) await w.__ppNav("overview");
        await waitFor(() => !!profilePage("overview") && !!aiBriefCard());
        setFace("status");
        await delay(720);
        const card = aiBriefCard(); if (card) card.click();
        await waitFor(() => !!briefClose());
        await delay(300);
      }
      // ══ Projects act ══
      // projects ↔ lcPhoto1 ↔ lcPhoto2 — Las Coloradas real gallery, one photograph per gesture
      else if (pair("projects", "lcPhoto1")) { await galleryTo(1); }
      else if (pair("lcPhoto1", "projects")) { await galleryTo(0); }
      else if (pair("lcPhoto1", "lcPhoto2")) { await galleryTo(2); }
      else if (pair("lcPhoto2", "lcPhoto1")) { await galleryTo(1); }
      // lcPhoto2 ↔ lcSnapshot — PROJECT SNAPSHOT: scroll down to Las Coloradas' fundamentals grid
      else if (pair("lcPhoto2", "lcSnapshot")) { await vScrollToEl(stageTile(), 110); }
      else if (pair("lcSnapshot", "lcPhoto2")) { await vScrollTop(); await galleryTo(2); }
      // lcSnapshot ↔ stage — PROJECT CONTEXT: open the real Discovery Stage sheet
      else if (pair("lcSnapshot", "stage")) { await openSheet(/Project Stage/i); }
      else if (pair("stage", "lcSnapshot")) { await closeSheet(); }
      // stage ↔ techIntel — leave the stage detail, arrive at the Technical Intelligence grid
      else if (pair("stage", "techIntel")) { await closeSheet(); await vScrollToEl(techAnchor(), 110); }
      else if (pair("techIntel", "stage")) { await vScrollToEl(stageTile(), 110); await openSheet(/Project Stage/i); }
      // techIntel ↔ geoModel — open the real Geological Model
      else if (pair("techIntel", "geoModel")) { await openSheet(/Geological Model/i); }
      else if (pair("geoModel", "techIntel")) { await closeSheet(); }
      // geoModel ↔ drill — Geological Model → Exploration Results (one layer replaces the next)
      else if (pair("geoModel", "drill")) { await closeSheet(); await openSheet(/Exploration Results/i); }
      else if (pair("drill", "geoModel")) { await closeSheet(); await openSheet(/Geological Model/i); }
      // drill ↔ finalSynth — Exploration Results → Final Synthesis (layer replacement)
      else if (pair("drill", "finalSynth")) { await closeSheet(); await openSheet(/What Sets This Project Apart/i); }
      else if (pair("finalSynth", "drill")) { await closeSheet(); await openSheet(/Exploration Results/i); }
      // finalSynth ↔ bull — close the case, frame the Value Drivers, show the Bull case
      else if (pair("finalSynth", "bull")) { await closeSheet(); await tapValue(0); await vScrollBottom(); }
      else if (pair("bull", "finalSynth")) { await vScrollToEl(whatSets(), 110); await openSheet(/What Sets This Project Apart/i); }
      // bull ↔ bear ↔ nextVal — discrete Value-Driver scenarios, one tap each
      else if (pair("bull", "bear")) { await tapValue(1); await vScrollBottom(); }
      else if (pair("bear", "bull")) { await tapValue(0); await vScrollBottom(); }
      else if (pair("bear", "nextVal")) { await tapValue(2); await vScrollBottom(); }
      else if (pair("nextVal", "bear")) { await tapValue(1); await vScrollBottom(); }
      // ══ MULTIPLE PROJECTS (finale) — nextVal ↔ almoArrive: one clean switch to Almoloya.
      // Las Coloradas' depth is complete, so return to the gallery top (selector in view) and
      // tap the Almoloya pill ONCE. Almoloya rests on its OWN photography — a separate profile,
      // not a copy. No return to Las Coloradas: the switch is one-way from here. ══
      else if (pair("nextVal", "almoArrive")) {
        await vScrollTop();
        const s = projScroller(); if (s) s.scrollTop = 0;
        await switchTo("Almoloya");
        const gt = galleryTrack(); if (gt) gt.scrollLeft = 0;
        await delay(140);
      } else if (pair("almoArrive", "nextVal")) {            // reverse: back to Las Coloradas' Balanced View
        await switchTo("Las Coloradas");
        await tapValue(2);
        await vScrollBottom();
      }
      // ══ SEAM 2 — almoArrive ↔ timeline: PROJECTS → PROGRESS via the real tab nav ══
      else if (pair("almoArrive", "timeline")) {
        const w = win();
        const navP = (w && w.__ppNav) ? w.__ppNav("timeline") : Promise.resolve();
        await waitFor(() => !!profilePage("timeline"));
        const s = timelineScroller(); if (s) s.scrollTop = 0;
        await navP;
      } else if (pair("timeline", "almoArrive")) {           // reverse: Timeline → Projects, land on Almoloya
        const w = win();
        if (w && w.__ppNav) await w.__ppNav("projects");
        await waitFor(() => !!profilePage("projects"));
        await switchTo("Almoloya");
        const gt = galleryTrack(); if (gt) gt.scrollLeft = 0;
        await delay(140);
      }
      // ── timeline ↔ milestone: frame the Discovery milestone, open its real sheet ──
      else if (pair("timeline", "milestone")) {
        const w = win();
        if (w && w.__ppScrollTo) await w.__ppScrollTo(milestoneTarget(), 620);
        await delay(140);
        const card = milestoneCard(); if (card) card.click();
        await waitFor(() => !!milestoneClose());
        await delay(340);
      } else if (pair("milestone", "timeline")) {
        const c = milestoneClose(); if (c) c.click();
        await waitFor(() => !milestoneSheet());
        await delay(240);
        const w = win();
        if (w && w.__ppScrollTo) await w.__ppScrollTo(0, 620);
        await delay(140);
      }
      // ── milestone ↔ capital: Discovery sheet → Capital top ──
      else if (pair("milestone", "capital")) {
        const c = milestoneClose(); if (c) c.click();
        await waitFor(() => !milestoneSheet());
        const w = win();
        const navP = (w && w.__ppNav) ? w.__ppNav("capital") : Promise.resolve();
        await waitFor(() => !!profilePage("capital"));
        const s = capitalScroller(); if (s) s.scrollTop = 0;
        await navP;
      } else if (pair("capital", "milestone")) {
        const w = win();
        if (w && w.__ppNav) await w.__ppNav("timeline");
        await waitFor(() => !!profilePage("timeline"));
        const s = timelineScroller(); if (s) s.scrollTop = 0;
        if (w && w.__ppScrollTo) await w.__ppScrollTo(milestoneTarget(), 620);
        await delay(160);
        const card = milestoneCard(); if (card) card.click();
        await waitFor(() => !!milestoneClose());
        await delay(380);
      }
      // ── capital ↔ capStruct: open the real Share Structure sheet ──
      else if (pair("capital", "capStruct")) {
        await waitFor(() => !!shareCard(), 3000);
        const w = win();
        if (w && w.__ppScrollTo) await w.__ppScrollTo(shareTarget(), 620); else await smoothScroll(capitalScroller(), shareTarget(), 620);
        await delay(120);
        const card = shareCard(); if (card) card.click();
        await waitFor(() => !!shareClose());
        await delay(340);
      } else if (pair("capStruct", "capital")) {
        const c = shareClose(); if (c) c.click();
        await waitFor(() => !shareSheet());
        await delay(260);
        const w = win();
        if (w && w.__ppScrollTo) await w.__ppScrollTo(0, 520); else { const s = capitalScroller(); if (s) s.scrollTop = 0; }
        await delay(140);
      }
      // ── capStruct ↔ team: Share Structure sheet → Leadership top ──
      else if (pair("capStruct", "team")) {
        const c = shareClose(); if (c) c.click();
        await waitFor(() => !shareSheet());
        const w = win();
        const navP = (w && w.__ppNav) ? w.__ppNav("team") : Promise.resolve();
        await waitFor(() => !!profilePage("team"));
        const s = teamScroller(); if (s) s.scrollTop = 0;
        await navP;
      } else if (pair("team", "capStruct")) {
        const w = win();
        if (w && w.__ppNav) await w.__ppNav("capital");
        await waitFor(() => !!profilePage("capital"));
        await waitFor(() => !!shareCard(), 3000);
        if (w && w.__ppScrollTo) await w.__ppScrollTo(shareTarget(), 620); else await smoothScroll(capitalScroller(), shareTarget(), 620);
        await delay(200);
        const card = shareCard(); if (card) card.click();
        await waitFor(() => !!shareClose());
        await delay(380);
      }
      // ── team ↔ ceoBio: MANAGEMENT PROFILES — open Scott Emerson's REAL CEO bio sheet ──
      else if (pair("team", "ceoBio")) {
        const s = teamScroller(); if (s) s.scrollTop = 0;   // Scott's card is first (the CEO)
        await delay(120);
        const card = ceoCard(); if (card) card.click();
        await waitFor(() => !!ceoClose());
        await delay(340);
      } else if (pair("ceoBio", "team")) {
        const c = ceoClose(); if (c) c.click();
        await waitFor(() => !ceoSheet());
        await delay(90);
      }
      // ── ceoBio ↔ mediaGrid: MEDIA — close the bio, open the real Updates media wall ──
      else if (pair("ceoBio", "mediaGrid")) {
        const c = ceoClose(); if (c) c.click();
        await waitFor(() => !ceoSheet());
        const w = win();
        const navP = (w && w.__ppNav) ? w.__ppNav("updates") : Promise.resolve();
        await waitFor(() => !!updatesPage());
        await navP;
      } else if (pair("mediaGrid", "ceoBio")) {              // reverse: Updates → Leadership → reopen Scott's bio
        const w = win();
        if (w && w.__ppNav) await w.__ppNav("team");
        await waitFor(() => !!profilePage("team"));
        const s = teamScroller(); if (s) s.scrollTop = 0;
        await delay(120);
        const card = ceoCard(); if (card) card.click();
        await waitFor(() => !!ceoClose());
        await delay(340);
      }
      // ── mediaGrid ↔ follow: MEDIA overview → the real Follow control in view. The
      // walkthrough NEVER opens an individual post (no full-height media viewer) — the Media
      // beat rests on the useful overview grid, then the finale surfaces the real Follow. ──
      else if (pair("mediaGrid", "follow")) {
        setFollow(false);                                    // guarantee "Follow" (not yet activated)
        setFollowEmphasis(true);                             // the pulsing ring identifies the REAL control
        await delay(260);
      } else if (pair("follow", "mediaGrid")) {
        setFollowEmphasis(false);
        await delay(120);
      }
      // ── follow ↔ following: the REAL Follow → Following change, on the Updates page ──
      // The ring stays through the change so the action is unmistakable, then resolves.
      else if (pair("follow", "following")) {
        pressFollow();                                       // tactile press-DOWN on the REAL button
        await delay(120);                                    // brief compression
        setFollow(true);                                     // release → real state becomes Following (Check icon)
        await delay(400);                                    // hold the emphasised change a beat
        setFollowEmphasis(false);                            // the attention ring resolves
        await delay(150);
      } else if (pair("following", "follow")) {
        setFollow(false);
        setFollowEmphasis(true);                             // back to the pulsing Follow state
        await delay(320);
      }
    };

    // ── Gesture machine (snap states) — one deliberate gesture = one state. ────────
    const S = { cur: 0, animating: false };
    let accum = 0, accumDir = 0, lastWheel = 0, streamUsed = false, streamPeak = 0;

    const run = async (target) => {
      if (S.animating || target === S.cur) return;
      S.animating = true;
      const dir = target > S.cur ? 1 : -1;
      let c = S.cur;
      while (c !== target) {
        const from = c, to = c + dir;
        emit("demo:transitionstart", { from, to, dir });      // phone begins moving
        await go(from, to);
        c += dir; S.cur = c; setIdx(c);
        emit("demo:contentready", { from, to, cur: c });       // destination content in place
      }
      S.animating = false;
      emit("demo:settled", { cur: S.cur });
    };

    const onWheel = (e) => {
      e.preventDefault();
      if (!readyRef.current) return;         // not interactive until the real app has painted
      const now = performance.now();
      const gap = now - lastWheel;
      const reversed = accumDir !== 0 && Math.sign(e.deltaY) === -accumDir && Math.abs(e.deltaY) >= FIRM_DELTA;
      if (gap > NEW_GESTURE_GAP || reversed) { accum = 0; accumDir = Math.sign(e.deltaY); streamUsed = false; streamPeak = 0; }
      lastWheel = now;
      streamPeak = Math.max(streamPeak, Math.abs(e.deltaY));
      if (S.animating || streamUsed) return;               // input locked mid-transition; one change per gesture
      const d = e.deltaY;
      if (Math.sign(d) !== accumDir) { accum = 0; accumDir = Math.sign(d); }
      accum += d;
      if (Math.abs(accum) < WHEEL_TRIGGER || streamPeak < FIRM_DELTA) return;
      const dir = accum > 0 ? 1 : -1;                       // swipe up (wheel down) advances
      streamUsed = true; accum = 0;
      // Floor at the status face: the photographic hero is a one-time automatic opening,
      // never a state the visitor can gesture back into.
      const floor = variant === "home" ? 0 : OPEN_FLOOR;
      const target = Math.max(floor, Math.min(STATES.length - 1, S.cur + dir));
      if (target !== S.cur) { run(target); }
    };

    // The automatic opening reveal (correction 1). Invoked once by settleApp when the app
    // first paints on its photographic hero: hold so the viewer registers the photo, then
    // perform the REAL Company Status flip (go(0→1)) so the STATUS face is the resting
    // start — not a gesture the visitor spends. Runs only from state 0.
    autoOpenRef.current = async () => {
      if (variant === "home") {
        // Home inherits the walkthrough's EXACT Overview opening: the photographic hero
        // holds, then the REAL Company Status flip runs and rests on the status/info
        // face — the same resting Overview the walkthrough shows. The state index stays
        // at 0 (Overview); only the app's own face flips, exactly as in the full engine.
        if (S.cur !== 0 || S.animating) return;
        await delay(OPEN_HOLD);
        if (S.cur !== 0 || S.animating) return;
        setFace("status");
        leadTab("overview");                       // consistent tab indicator from the first frame
        return;
      }
      if (S.cur !== 0 || S.animating) return;
      await delay(OPEN_HOLD);
      if (S.cur !== 0 || S.animating) return;   // a fast gesture during the hold may have advanced it already
      await run(1);
    };
    // Rewind to the opening when the iframe reboots (full remount already resets; this
    // also covers an iframe-only reload so the machine never drifts from the fresh app).
    resetRef.current = () => { S.cur = 0; S.animating = false; accum = 0; accumDir = 0; streamUsed = false; setIdx(0); };

    // The full walkthrough owns the page and captures wheel itself. The HOME deck is a
    // section inside the scrolling homepage — the parent owns progression and drives it
    // programmatically via __demoGo, so the deck does NOT hijack the page's wheel.
    if (variant !== "home") window.addEventListener("wheel", onWheel, { passive: false });
    // Debug + parent-drive hooks.
    window.__demoNext = () => run(Math.min(STATES.length - 1, S.cur + 1));
    window.__demoPrev = () => run(Math.max(0, S.cur - 1));
    window.__demoGo = (i) => run(Math.max(0, Math.min(STATES.length - 1, i | 0)));
    window.__demoState = () => ({ cur: S.cur, animating: S.animating });
    return () => { if (variant !== "home") window.removeEventListener("wheel", onWheel); };
  }, []);

  const src = `/app?c=kingsmen-resources&embed=1`;

  if (hardware && cutout) {
    // ONE display boundary. The photograph — with its opening cut to alpha 0 — sits ON TOP of
    // the live app, so the hardware's own anti-aliased bezel edge is the only thing that says
    // where the screen ends. No CSS rounded rect, no inset, no separate Dynamic Island layer,
    // and no backing colour can appear anywhere the app does not reach.
    return (
      <div className="mx-demo" style={{ position: "relative", height: "100svh", overflow: "visible", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}>
        <StateDots idx={idx} total={STATES.length} />
        <div ref={boxRef} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", width: dims.w, aspectRatio: "971 / 1620", flexShrink: 0 }}>
            {/* Soft body shadow — the phone silhouette, blackened + blurred (unchanged). */}
            <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
              backgroundImage: `url(${PHONE.src})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat",
              filter: "brightness(0) blur(26px)", opacity: 0.24, transform: "translateY(20px) translateZ(0)" }} />
            {/* z0–z1 — the backing and the live app, CLIPPED to the hardware's real screen
                opening by the mask generated from the same measurement as the cutout. Both are
                rectangles whose corners would otherwise sit outside the phone's curved body,
                where the photograph is transparent and so cannot conceal them. The mask spans
                the whole phone box, so it aligns with the photo by construction. */}
            <div aria-hidden={false} style={{
              position: "absolute", inset: 0, zIndex: 1,
              WebkitMaskImage: `url(${PHONE.screenMask})`, maskImage: `url(${PHONE.screenMask})`,
              WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
              WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
            }}>
            <div aria-hidden style={{ position: "absolute", left: dims.opL, top: dims.opT, width: dims.opW, height: dims.opH, background: "#000", pointerEvents: "none" }} />
            <div style={{ position: "absolute", left: dims.appLeft, top: dims.appTop, width: dims.appW, height: dims.appH, overflow: "hidden" }}>
              {!DEBUG_SCREEN && <iframe
                ref={frameRef}
                title="MineEx mobile app"
                src={src}
                width={DEVICE_W}
                height={DEVICE_H}
                scrolling="no"
                onLoad={() => { setReady(false); settleApp(); }}
                style={{ border: 0, display: "block", width: DEVICE_W, height: DEVICE_H, transform: `scale(${dims.scale})`, transformOrigin: "top left", pointerEvents: "none" }}
              />}
              {DEBUG_SCREEN && <div style={{ position: "absolute", inset: 0, background: "#ff1493" }} />}
              {!DEBUG_SCREEN && <BootCover ready={ready} />}
            </div>
            </div>
            {/* z2 — the ORIGINAL photo with the display opening cut transparent. Titanium frame,
                black bezel, side buttons, reflections and the Dynamic Island are untouched
                original pixels, and this single layer draws the entire display boundary. */}
            <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
              backgroundImage: `url(${PHONE.cutout})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", backgroundPosition: "0 0" }} />
          </div>
        </div>
      </div>
    );
  }

  if (hardware) {
    // Real app composited as a picture in a frame: live display (z1) BEHIND the hardware PNG (z2),
    // which has the OLED opening cut transparent and the rim + Dynamic Island baked in. No CSS bezel.
    return (
      <div className="mx-demo" style={{ position: "relative", height: "100svh", overflow: "visible", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}>
        <StateDots idx={idx} total={STATES.length} />
        <div ref={boxRef} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Box matches the original photo (aspect-ratio 971:1620). */}
          <div style={{ position: "relative", width: dims.w, aspectRatio: "971 / 1620", flexShrink: 0 }}>
            {/* Soft body shadow — the phone silhouette (from the original), blackened + blurred. */}
            <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
              backgroundImage: `url(${PHONE.src})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat",
              filter: "brightness(0) blur(26px)", opacity: 0.24, transform: "translateY(20px) translateZ(0)" }} />
            {/* BOTTOM (z0) — the ORIGINAL, UNMODIFIED phone photo: titanium, black bezel, corners, buttons,
                reflections, shadows, Dynamic Island and the baked-in screenshot all come from here. */}
            <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", transform: "translateZ(0)",
              backgroundImage: `url(${PHONE.src})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", backgroundPosition: "0 0" }} />
            {/* MIDDLE (z1) — the live app (or hot-pink calibration fill) OVER the baked screenshot, clipped to
                the white display shape so it stops at the inner edge of the original black bezel. ONE clip. */}
            <div style={{ position: "absolute", left: dims.appLeft, top: dims.appTop, width: dims.appW, height: dims.appH, overflow: "hidden", borderRadius: dims.appRadius, zIndex: 1, background: DEBUG_SCREEN ? "#ff1493" : "#ffffff", isolation: "isolate", transform: "translateZ(0)" }}>
              {!DEBUG_SCREEN && <iframe
                ref={frameRef}
                title="MineEx mobile app"
                src={src}
                width={DEVICE_W}
                height={DEVICE_H}
                scrolling="no"
                onLoad={() => { setReady(false); settleApp(); }}
                style={{ border: 0, display: "block", width: DEVICE_W, height: DEVICE_H, transform: `translate(${dims.appOffX}px, ${dims.appOffY}px) scale(${dims.scale})`, transformOrigin: "top left", pointerEvents: "none" }}
              />}
              {!DEBUG_SCREEN && <BootCover ready={ready} />}
            </div>
            {/* TOP (z2) — the Dynamic Island, extracted straight from the ORIGINAL photo (same image, aligned
                by background-position) and clipped to the pill, placed above the live app. Not manufactured. */}
            <div aria-hidden style={{ position: "absolute", left: dims.diLeft, top: dims.diTop, width: dims.diW, height: dims.diH, overflow: "hidden", borderRadius: dims.diH / 2, zIndex: 2, pointerEvents: "none",
              backgroundImage: `url(${PHONE.src})`, backgroundSize: `${dims.w}px ${dims.boxH}px`, backgroundRepeat: "no-repeat", backgroundPosition: `-${dims.diLeft}px -${dims.diTop}px` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-demo" style={{ position: "relative", height: "100svh", overflow: "hidden", background: MX.sheet, display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}>
      <StateDots idx={idx} total={STATES.length} />
      <div ref={boxRef} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: dims.w, height: dims.h, overflow: "hidden", borderRadius: Math.round(46 * dims.scale), background: "#000", boxShadow: "0 40px 100px -24px rgba(15,23,42,0.5), 0 0 0 " + Math.max(2, Math.round(10 * dims.scale)) + "px #111", position: "relative" }}>
          <iframe
            ref={frameRef}
            title="MineEx mobile app"
            src={src}
            width={DEVICE_W}
            height={DEVICE_H}
            scrolling="no"
            onLoad={() => { setReady(false); settleApp(); }}
            style={{ border: 0, display: "block", width: DEVICE_W, height: DEVICE_H, transform: `scale(${dims.scale})`, transformOrigin: "top left", pointerEvents: "none" }}
          />
          {/* Neutral device-coloured cover while the app (re)boots — no text, no white,
              never a screenshot of content. Removed once the profile has painted. */}
          <BootCover ready={ready} />
        </div>
      </div>
    </div>
  );
}

function StateDots({ idx, total }) {
  return (
    <div aria-hidden style={{ position: "absolute", top: "50%", right: "clamp(14px, 3vw, 34px)", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 10, zIndex: 5 }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: 99, background: i === idx ? MX.ink : "rgba(18,22,29,0.16)", transform: i === idx ? "scale(1.15)" : "scale(1)", transition: "background 300ms ease, transform 300ms ease" }} />
      ))}
    </div>
  );
}

