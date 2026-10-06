// ─────────────────────────────────────────────────────────────────────────────
// AppSection / "The Stage" — the whole opening product story on ONE pinned stage
// (/home). Marketing-layer only. The locked chapter structure is:
//
//   HERO → APP INTRODUCTION → APP 01–06 → CONFERENCE INTRODUCTION → CONFERENCE 01–05
//
// One pinned 100svh section; states are paged by wheel intent (one gesture = one
// state). The App chapter runs the REAL Kingsmen mobile app (DirectedEmbed) and the
// Conference chapter runs the REAL Kingsmen Terminal (ConferenceScene). Both chapters
// share ONE narrative typography system (WalkthroughNarrative) so they read as two
// chapters of a single presentation.
//
// Chapter atmospheres live in the SAME light website: the App side is cool (blue /
// restrained lime); the Conference side is warm (blush / peach / golden amber). The
// change of light itself announces the chapter — there is no dark interstitial and no
// "Conference Mode" curtain any more. Transitions are idx-driven CSS choreography;
// input is locked for each transition's duration so a gesture never skips a beat.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from "react";
import { MX, EASE, useTrack, step, useViewport, useReduce } from "../system.jsx";
import { DirectedEmbed } from "../demo/DirectedEmbed.jsx";
import ConferenceScene from "./ConferenceScene.jsx";
import HeroHandPhone from "./HeroHandPhone.jsx";
// The Pricing deck slides up as the chapter after the template gallery (paged panels; see below).
const PricingDeckLazy = React.lazy(() => import("./PricingDeck.jsx"));
const SalesPricingLazy = React.lazy(() => import("./SalesPricing.jsx"));
import { WalkthroughNarrative, stageGridStyle } from "./WalkthroughNarrative.jsx";
import { logNav } from "./navDebug.jsx";
import { SHEET_MS, EASE_SHEET, WHEEL_TRIGGER, NEW_GESTURE_GAP, FIRM_DELTA, FRESH_FLICK } from "./motion.js";
import PushPreview from "./PushPreview.jsx";   // dev-only (?navdebug=1) controller logging; no-op otherwise

const NAVY = "#0a1b2e", SLATE = "#54617a";
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")";

const NAV_H = 64;                  // the fixed header height
const SAFE_TOP = NAV_H + 28;       // 92 — breathing between nav and the presentation
const SAFE_BOTTOM = 28;

// Gesture + motion constants now live in motion.js so every paged deck shares them
// (the Investor walkthrough reads the same values). Values are unchanged.
export { SHEET_MS, EASE_SHEET, WHEEL_TRIGGER, NEW_GESTURE_GAP, FIRM_DELTA, FRESH_FLICK } from "./motion.js";
// ONE iOS-sheet easing + duration shared by BOTH chapter boundaries (Hero→App, App→Conf):
// responsive start, clean acceleration, settle, no overshoot. TRANSLATION does the reveal.

// The six App walkthrough beats — number · PAGE, one headline, one paragraph.
const BEATS = [
  { page: "PROFILE",    head: "Your company, built for investors.",              body: "Give investors one living profile for the essential facts — what you own, where you operate, what stage you’re at and what you’re focused on now." },
  { page: "PROJECTS",   head: "Let investors explore what you’re building.", body: "Bring each project into one clear experience — location, stage, imagery and the information investors need to understand the opportunity." },
  { page: "PROGRESS",   head: "Show how the story is moving forward.",           body: "Turn drilling, results and company milestones into a clear timeline so investors can immediately see how the story is developing." },
  { page: "CAPITAL",    head: "Put the financial picture in context.",           body: "Show investors your capital structure and funding position alongside the projects and exploration programs that capital is being used to advance." },
  { page: "LEADERSHIP", head: "Put the people behind the company.",              body: "Introduce the management and leadership responsible for advancing the projects and executing the company’s strategy." },
  { page: "UPDATES",    head: "Keep investors connected to what happens next.",  body: "Bring company news, press releases and media into the same profile so the relationship continues after the first visit." },
];

// The real 11 Feb 2026 Kingsmen release — verified content, shown with its own date.
// Nothing here is fabricated and nothing is published; this is a marketing preview only.
const PUB_HEADS = [
  "Publish your news. Notify your followers.",
  "Reach investors beyond your followers.",
];
const PUB_BODY = [
  "Publish a press release through MineEx, and followers with push notifications enabled can receive an alert directly on their phones.",
  "Your press release also appears in the MineEx investor feed, giving other investors an opportunity to discover your company and follow its progress.",
];

const CONF_STATES = 6;   // Conference sales story: HERO · PROJECT · MAP · INTERCEPTS · QR · TEMPLATES (all in the iPad)
// State map:  0 HERO · 1–6 APP 01–06 · 7–12 CONFERENCE (flat iPad + template gallery). After the last
// state (TEMPLATES), a further downward swipe navigates to the Pricing page.
// ── Press-release publishing sequence — PROTOTYPE, behind ?prnotify=1 ───────────
// With the flag OFF every constant below is byte-identical to the approved deck, so
// /home is unchanged. With it ON the Timeline chapter gains three presentation
// states (publish · notify · feed). The chapter rail still reads 03 / 06 because BEATS
// stays at six and APP_TO_BEAT maps several states onto beat 2.
// Shipped. ?noprnotify=1 disables it if the sequence ever needs to be taken out quickly.
const PRNOTIFY = (() => { try { return !/[?&]noprnotify(=|&|$)/.test(window.location.search); } catch (_) { return true; } })();
const APP_STATES = PRNOTIFY ? 8 : 6;
// app-state index → the demo's HOME_STATES index AND the narrative beat index (they are
// the same list). States 2–5 all sit on the demo's `timeline` state: DirectedEmbed.run()
// returns immediately when target === cur, so repeating it is a true no-op — no re-nav,
// no scroll reset, no change to the presentation engine.
// 2 = the existing Timeline, 3 = publication + notification, 4 = feed discovery.
// There is no separate "reading pause" state: every state is held by the visitor's own
// gesture, so a fourth state only rendered the publication page a second time.
const APP_TO_BEAT = PRNOTIFY ? [0, 1, 2, 2, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5];
const subOf = (appIdx) => APP_TO_BEAT[Math.max(0, Math.min(APP_TO_BEAT.length - 1, appIdx))];

const S_HERO = 0, APP0 = 1, CONF0 = APP0 + APP_STATES;
const NSTATES = CONF0 + CONF_STATES;            // 13 (16 with the prototype flag)
const PRICING_HREF = "/pricing";

// Transition (and input-lock) durations, keyed by the boundary crossed.
const DUR = { sheet: SHEET_MS, appSlide: 1100, confLive: 660, confSlide: 1000 };
const durFor = (a, b) => {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (lo === S_HERO && hi === APP0) return DUR.sheet;                    // Hero ↔ App 01  (sheet)
  if (lo === CONF0 - 1 && hi === CONF0) return DUR.sheet;                // App 06 ↔ Conference  (sheet)
  if (lo >= APP0 && hi <= CONF0 - 1) return DUR.appSlide;                // within the App walkthrough
  return DUR.confSlide;                                                   // within the Conference walkthrough
};

// An iOS-style notification preview. It sits in the narrative column BENEATH the body
// copy — outside the phone, clear of the headline, the nav and the device, which never
// moves. It is a static marketing preview: no device notification is requested or sent.
export default function AppSection() {
  const { mobile } = useViewport();
  const reduce = useReduce();
  const slow = (() => { try { const v = parseFloat(new URLSearchParams(window.location.search).get("tslow")); return v > 0 ? Math.min(12, v) : 1; } catch (_) { return 1; } })();

  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  useEffect(() => { idxRef.current = idx; }, [idx]);

  // ── Pricing chapter — slides UP over the deck (same sheet feel as the chapter transitions), then scrolls
  // as its own page. A deliberate downward swipe past the last template state opens it; scrolling up at the
  // very top closes it back to the templates. URL is kept in sync so it deep-links / back-buttons cleanly. ──
  const [pricingUp, setPricingUp] = useState(false);
  const [pricingMounted, setPricingMounted] = useState(false);
  const pricingUpRef = useRef(false);
  const overlayRef = useRef(null);
  useEffect(() => { pricingUpRef.current = pricingUp; }, [pricingUp]);
  useEffect(() => { if (idx >= NSTATES - 1) setPricingMounted(true); }, [idx]);   // preload once at the gallery
  const openPricing = useCallback(() => { setPricingMounted(true); setPricingUp(true); try { window.history.pushState({ mxPricing: 1 }, "", PRICING_HREF); } catch (_) {} }, []);
  const closePricing = useCallback(() => { setPricingUp(false); try { window.history.pushState({}, "", "/home"); } catch (_) {} }, []);
  useEffect(() => {
    const onPop = () => { const isP = /[?&]pricing/.test(window.location.search); setPricingUp(isP); if (isP) setPricingMounted(true); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Product-side reconcile (if a gesture landed while a slide was mid-flight).
  const desiredRef = useRef(0);
  useEffect(() => {
    const onSettled = () => { try { const s = window.__demoState && window.__demoState(); if (s && !s.animating && s.cur !== desiredRef.current) window.__demoGo(desiredRef.current); } catch (_) {} };
    window.addEventListener("demo:settled", onSettled);
    return () => window.removeEventListener("demo:settled", onSettled);
  }, []);

  // ── App narrative motion (out → prep → in), driven by idx immediately. Same as the
  // approved walkthrough: the whole number/headline/paragraph moves as one unit. ──
  const [shownIdx, setShownIdx] = useState(0);
  const [phase, setPhase] = useState("in");
  useEffect(() => {
    if (idx < APP0 || idx > CONF0 - 1) { setShownIdx(idx); return; }   // only the App chapter animates the copy
    if (shownIdx === idx) return;
    setPhase("out");
    const t = setTimeout(() => { setShownIdx(idx); setPhase("prep"); }, 150);
    return () => clearTimeout(t);
  }, [idx, shownIdx]);
  useEffect(() => { if (phase !== "prep") return; const t = setTimeout(() => setPhase("in"), 24); return () => clearTimeout(t); }, [phase]);

  // ── DESKTOP: wheel-intent paging, transition lock, boundary release ──
  const trackRef = useRef(null);
  const stickyRef = useRef(null);
  const lockedRef = useRef(false);
  const jumpClearRef = useRef(null);

  // Jump straight to a section (the side nav). Sets the shared state, drives the product
  // for App states, and briefly owns wheel input so a stray gesture doesn't fight the
  // layer cross-fade. The layers are all functions of idx, so this cross-fades cleanly.
  const jumpTo = useCallback((target) => {
    if (pricingUpRef.current) closePricing();   // leaving pricing for a chapter
    const cur = idxRef.current;
    if (target === cur && !pricingUpRef.current) return;
    idxRef.current = target; setIdx(target);
    if (target >= APP0 && target <= CONF0 - 1) {
      desiredRef.current = subOf(target - APP0);
      try { window.__demoGo && window.__demoGo(subOf(target - APP0)); } catch (_) {}
    }
    lockedRef.current = true;
    if (jumpClearRef.current) clearTimeout(jumpClearRef.current);
    jumpClearRef.current = setTimeout(() => { lockedRef.current = false; }, 650);
  }, []);
  useEffect(() => () => { if (jumpClearRef.current) clearTimeout(jumpClearRef.current); }, []);
  useEffect(() => {
    if (mobile || reduce) return;
    let accum = 0, accumDir = 0, lastWheel = 0, streamUsed = false, streamPeak = 0, lastMag = 0, clearT = null;
    const unlock = () => { lockedRef.current = false; };
    const lock = (ms) => { lockedRef.current = true; if (clearT) clearTimeout(clearT); clearT = setTimeout(unlock, ms); };
    const settleUnlock = () => { if (lockedRef.current) unlock(); };
    window.addEventListener("demo:settled", settleUnlock);

    // TRACKPAD FIX — the embedded app / Terminal iframes must never hold focus, or macOS
    // routes the FIRST two-finger scroll to the focused (non-scrolling) iframe and it is
    // swallowed, forcing the visitor to click first. We blur any iframe the moment it
    // gains focus so the page's own wheel handler always owns the gesture. (The iframes
    // are already pointer-events:none, so this is the remaining first-gesture path.)
    const onFocusIn = (e) => { const t = e.target; if (t && t.tagName === "IFRAME") { try { t.blur(); } catch (_) {} try { window.focus(); } catch (_) {} } };
    window.addEventListener("focusin", onFocusIn);

    const advance = (dir) => {
      const cur = idxRef.current;
      const target = Math.max(0, Math.min(NSTATES - 1, cur + dir));
      if (target === cur) return;
      idxRef.current = target; setIdx(target);
      // Product nav for the App walkthrough states (2..7 → app state 0..5), in the SAME
      // cycle as the narrative. Calling __demoGo for a state it is already on is a no-op.
      if (target >= APP0 && target <= CONF0 - 1) {
        const want = subOf(target - APP0);
        desiredRef.current = want;
        try { window.__demoGo && window.__demoGo(want); } catch (_) {}
      }
      lock(durFor(cur, target) * slow);
    };

    const onWheel = (e) => {
      // DEV diagnostics (?navdebug=1): one logNav per event path, so CTRL(handled) counts
      // every wheel the controller RECEIVED and the row shows how it was handled/rejected.
      // Logging only — the control logic below is unchanged.
      const DY = Math.round(e.deltaY);
      // While Pricing is up, its own paged deck owns the gesture (and closes back to templates at its top).
      if (pricingUpRef.current) { logNav({ src: "SALES", dy: DY, idx: idxRef.current, note: "pricingUp" }); return; }
      const sticky = stickyRef.current; if (!sticky) { logNav({ src: "SALES", dy: DY, note: "no-sticky" }); return; }
      const r = sticky.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 1;
      const pinned = r.top <= 2 && r.bottom >= vh - 2;
      if (!pinned) { accum = 0; accumDir = 0; streamUsed = false; logNav({ src: "SALES", dy: DY, idx: idxRef.current, note: `unpinned t${Math.round(r.top)} b${Math.round(r.bottom)}/${vh}` }); return; }

      const now = performance.now(), gap = now - lastWheel, mag = Math.abs(e.deltaY);
      const reversed = accumDir !== 0 && Math.sign(e.deltaY) === -accumDir && mag >= FIRM_DELTA;
      // A consumed stream re-arms on silence (gap), a reversal, OR a FRESH-FLICK rising edge:
      // a new deliberate swipe spikes deltaY above the monotonically-decaying inertial tail,
      // so the next swipe works as soon as the transition ends — no multi-second silence wait.
      const freshFlick = streamUsed && !lockedRef.current && mag >= FRESH_FLICK && mag > lastMag * 2;
      if (gap > NEW_GESTURE_GAP || reversed || freshFlick) { accum = 0; accumDir = Math.sign(e.deltaY); streamUsed = false; streamPeak = 0; }
      lastWheel = now; lastMag = mag; streamPeak = Math.max(streamPeak, mag);
      const dir = e.deltaY > 0 ? 1 : -1, cur = idxRef.current;

      if (cur <= 0 && dir < 0) { logNav({ src: "SALES", dy: DY, gap: Math.round(gap), idx: cur, note: "boundary-up" }); return; }                 // HERO + up → native scroll

      e.preventDefault();
      if (lockedRef.current || streamUsed) { logNav({ src: "SALES", dy: DY, gap: Math.round(gap), idx: cur, locked: lockedRef.current ? 1 : 0, used: streamUsed ? 1 : 0, note: "rejected" }); return; }
      if (Math.sign(e.deltaY) !== accumDir) { accum = 0; accumDir = Math.sign(e.deltaY); }
      accum += e.deltaY;
      if (Math.abs(accum) < WHEEL_TRIGGER || streamPeak < FIRM_DELTA) { logNav({ src: "SALES", dy: DY, gap: Math.round(gap), accum: Math.round(accum), note: "below-trigger" }); return; }
      streamUsed = true; accum = 0;
      // Past the last state (TEMPLATES), a deliberate downward swipe slides the Pricing page up as a page.
      if (dir > 0 && idxRef.current >= NSTATES - 1) { logNav({ src: "SALES", dy: DY, gap: Math.round(gap), note: "openPricing" }); openPricing(); return; }
      advance(dir);
      logNav({ src: "SALES", dy: DY, gap: Math.round(gap), acted: 1, idx: idxRef.current, note: "ACT" });
    };
    // The story controller owns the vertical wheel gesture. Capture phase so the stage
    // intercepts before anything else on the page.
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });

    // CRITICAL trackpad fix. A wheel gesture delivered to an embedded product iframe's OWN
    // document never reaches this window — proven live: a wheel dispatched inside the iframe
    // does not propagate to the parent (iframeWheelReachedParent === false). pointer-events:
    // none only covers the hit-test path; once the embedded app/Terminal becomes the active
    // browsing context, the OS hands it the gesture directly and story navigation stalls
    // until a click returns focus to the parent. Since the guided demos are presentational,
    // we (a) mark each iframe non-focusable and (b) route each same-origin iframe's OWN wheel
    // to this SAME controller — so a gesture advances the story no matter which browsing
    // context receives it, and no click is ever needed. addEventListener de-dupes an
    // identical (type, listener, capture) triple, so re-scanning is idempotent and covers
    // iframe (re)boots / HMR reloads.
    // Wire ONE iframe: make it non-focusable and route its own wheel to this controller, now AND every
    // time it reloads (a boot/HMR swaps its contentWindow and drops the listener). The `load` re-attach +
    // the observer below close the window where a JUST-mounted iframe (the app on entering the App chapter,
    // the folio on entering Conference, or the 16 live template previews in State 06) still owns the gesture
    // and swallows the next scroll — the "move the mouse before it lets me swipe again" bug.
    const wired = new WeakSet();
    const wire = (f) => {
      try { f.setAttribute("tabindex", "-1"); } catch (_) {}
      const attach = () => { try { const cw = f.contentWindow; if (cw) cw.addEventListener("wheel", onWheel, { passive: false, capture: true }); } catch (_) {} };
      attach();
      if (!wired.has(f)) { wired.add(f); try { f.addEventListener("load", attach); } catch (_) {} }
    };
    const attachFrames = () => { document.querySelectorAll(".mx-appstage iframe").forEach(wire); };
    attachFrames();

    // Observe the stage so an iframe added at ANY time is wired the same frame it appears — no 500ms gap.
    let moScheduled = false;
    const flush = () => { moScheduled = false; attachFrames(); };
    let mo = null;
    try {
      const stage = trackRef.current || document.querySelector(".mx-appstage") || document.body;
      mo = new MutationObserver(() => { if (!moScheduled) { moScheduled = true; requestAnimationFrame(flush); } });
      mo.observe(stage, { childList: true, subtree: true });
    } catch (_) {}
    const frameScan = setInterval(attachFrames, 500);   // backstop for any contentWindow swap the observer misses

    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("demo:settled", settleUnlock);
      window.removeEventListener("focusin", onFocusIn);
      if (mo) mo.disconnect();
      clearInterval(frameScan);
      document.querySelectorAll(".mx-appstage iframe").forEach((f) => { try { const cw = f.contentWindow; if (cw) cw.removeEventListener("wheel", onWheel, { capture: true }); } catch (_) {} });
      if (clearT) clearTimeout(clearT);
    };
  }, [mobile, reduce, slow]);

  // ── MOBILE / reduced-motion: native-scroll paging ──
  const mp = useTrack(trackRef);
  useEffect(() => {
    if (!(mobile || reduce)) return;
    const want = reduce ? 0 : step(mp, NSTATES);
    if (want !== idxRef.current) {
      setIdx(want);
      if (want >= APP0 && want <= CONF0 - 1) { desiredRef.current = subOf(want - APP0); try { window.__demoGo && window.__demoGo(subOf(want - APP0)); } catch (_) {} }
    }
  }, [mp, mobile, reduce]);

  // Pause the ambient blooms during a product slide so all GPU budget goes to the move.
  useEffect(() => {
    const on = () => { const el = trackRef.current; if (el) el.setAttribute("data-busy", "1"); };
    const off = () => { const el = trackRef.current; if (el) el.removeAttribute("data-busy"); };
    window.addEventListener("demo:transitionstart", on);
    window.addEventListener("demo:settled", off);
    return () => { window.removeEventListener("demo:transitionstart", on); window.removeEventListener("demo:settled", off); };
  }, []);

  // ── Derived chapter flags ──
  const heroIn = idx === S_HERO;
  const appVisible = idx >= APP0 && idx <= CONF0 - 1;            // phone chapter (1..6)
  const appIdx = shownIdx - APP0;                                  // 0..APP_STATES-1
  const appBeat = Math.max(0, Math.min(BEATS.length - 1, subOf(appIdx)));
  // Prototype sub-states of the Timeline chapter: 3 = publish · 4 = notify · 5 = feed.
  const pubStep = PRNOTIFY && appIdx >= 3 && appIdx <= 4 ? appIdx - 2 : 0;   // 1 = publish · 2 = discover

  // ── Timeline staging (prototype) ───────────────────────────────────────────
  // Beat A rests with the newest entry collapsed; Beat B expands it, so the release
  // arrives at the top and the entries below move down. This drives the app's OWN
  // rendered entry — its markup, its styling, its real date — so the visual language is
  // untouched. No data is written and no new entry is manufactured.
  const prevAppIdxRef = useRef(0);
  useEffect(() => {
    if (!PRNOTIFY) return;
    const inChapter = appIdx >= 2 && appIdx <= 4;
    const reveal = appIdx >= 3;
    const animate = inChapter && (prevAppIdxRef.current >= 3 || appIdx >= 3);
    const prev = prevAppIdxRef.current;
    prevAppIdxRef.current = appIdx;
    let cancelled = false;
    const apply = (tries) => {
      if (cancelled) return;
      let el = null;
      try {
        const f = document.querySelector(".mx-demo iframe");
        const d = f && f.contentDocument;
        // Scope to the TIMELINE page: the app keeps other tabs mounted, and an
        // unscoped selector matches a news-feed card instead. [data-page] is the
        // app's own convention (the demo director uses it too).
        const page = d && d.querySelector('[data-page="timeline"]');
        el = page && page.querySelector('button[class*="items-stretch"]');
      } catch (_) {}
      if (!el) { if (tries < 40) setTimeout(() => apply(tries + 1), 120); return; }
      try {
        const card = el.querySelector('span[class*="rounded-2xl"]');
        const clear = () => {
          el.style.height = ""; el.style.opacity = ""; el.style.overflow = "";
          el.style.transition = ""; el.style.pointerEvents = ""; el.style.transform = "";
          if (card) { card.style.transition = ""; card.style.background = ""; card.style.boxShadow = ""; }
        };
        if (!inChapter) { clear(); return; }          // left the chapter → hand the entry back untouched

        if (!el.dataset.mxH) {
          const h = Math.ceil(el.getBoundingClientRect().height);
          if (h > 0) el.dataset.mxH = String(h);
        }
        const h = el.dataset.mxH || "114";
        el.style.overflow = "hidden";
        el.style.pointerEvents = "none";
        // Height drives the entries BELOW downward, making room; transform + opacity carry
        // the new entry up into that space. One transition, one state change — no timers.
        el.style.transition = animate
          ? `height 820ms ${EASE}, opacity 520ms ${EASE}, transform 820ms ${EASE}`
          : "none";
        el.style.height = reveal ? h + "px" : "0px";
        el.style.opacity = reveal ? "1" : "0";
        el.style.transform = reveal ? "translateY(0)" : "translateY(18px)";

        // A brief blue emphasis ONLY on the gesture that publishes (prev < 3 → 3), so
        // entering the reading pause never restarts it. It fades back to the app's own
        // styling and leaves nothing behind.
        if (card) {
          const entering = reveal && prev < 3 && appIdx === 3;
          if (entering) {
            card.style.transition = "none";
            card.style.background = "rgba(37,99,235,0.10)";
            card.style.boxShadow = "0 0 0 2px rgba(37,99,235,0.52)";
            setTimeout(() => {
              if (cancelled) return;
              card.style.transition = `background 760ms ${EASE}, box-shadow 760ms ${EASE}`;
              card.style.background = "";
              card.style.boxShadow = "";
            }, 1050);
          } else if (!reveal) {
            card.style.transition = ""; card.style.background = ""; card.style.boxShadow = "";
          }
        }
      } catch (_) {}
    };
    apply(0);
    return () => { cancelled = true; };
  }, [appIdx]);

  const confSceneIn = idx >= CONF0 && idx <= NSTATES - 1;        // 7..12 (flat iPad: HERO..QR..TEMPLATES)
  const confIndex = idx - CONF0;                                 // 0..5 (0 hero · 1 project · 2 map · 3 intercepts · 4 QR · 5 templates)
  const T = (base) => `${Math.round(base * slow)}ms`;           // QA slow-mo scales the choreography (?tslow=N); 1 in production

  const beat = BEATS[appBeat];
  const copyMotion = {
    out:  { opacity: 0, transform: "translateY(-12px)", transition: `opacity 150ms ${EASE}, transform 150ms ${EASE}` },
    prep: { opacity: 0, transform: "translateY(14px)", transition: "none" },
    in:   { opacity: 1, transform: "translateY(0)",    transition: `opacity 300ms ${EASE}, transform 340ms ${EASE}` },
  }[phase];

  // ── ONE atmosphere for the WHOLE story — the approved App demo's cool field (light
  // off-white base + diffused MineEx blue + a restrained lime), weighted to the right so
  // the left stays readable. The Conference chapter INHERITS this exact field: no warm
  // gradient, no colour transition — the device change alone signals the new chapter. ──
  // The atmosphere belongs to the PRODUCT STAGE, not the navigation: a top fade keeps the
  // nav band clean/near-white and the blooms begin lower, behind the actual content. The
  // field is masked to the right AND below the header (mask-composite intersect), and the
  // blooms are positioned in the lower-middle so nothing large sits behind the nav.
  // ── HERO (state 0) — headline, supporting copy, hero visual. No buttons. STATIC inside
  // its sheet: the whole Hero sheet translates up to reveal App; the content never moves
  // relative to the sheet, scales or fades. ──
  const heroLayer = (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", zIndex: 6, pointerEvents: heroIn ? "auto" : "none" }}>
      {!mobile && (
        <div className="mx-hero-hand" style={{ position: "absolute", right: "clamp(16px, 4vw, 96px)", top: "50%", transform: "translateY(-48%)", width: "min(70vw, 1090px)", zIndex: 1, pointerEvents: "none" }}>
          <HeroHandPhone />
        </div>
      )}
      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 1240, margin: "0 auto", padding: "0 clamp(24px,5vw,64px)" }}>
        <div style={{ maxWidth: 640 }}>
          <h1 style={{ color: NAVY, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.0, fontSize: "clamp(46px, 6.6vw, 84px)", margin: 0 }}>
            The investor platform built for <span className={reduce ? "hl-static" : "hl-grad"}>mining.</span>
          </h1>
          <p style={{ color: SLATE, fontWeight: 400, fontSize: "clamp(18px,1.7vw,22px)", lineHeight: 1.45, margin: "26px 0 0", maxWidth: "32ch" }}>
            Present your story. Engage investors. Build lasting connections.
          </p>
          <p style={{ marginTop: 44, color: MX.mute, fontSize: 12.5, letterSpacing: "0.18em", fontWeight: 700, textTransform: "uppercase", opacity: heroIn ? 0.9 : 0, transition: "opacity 300ms" }}>
            Scroll to explore the product ↓
          </p>
        </div>
      </div>
    </div>
  );

  // ── APP WALKTHROUGH (states 1–6) — the REAL app + the shared narrative. STATIC inside its
  // sheet at its FINAL resting geometry: it is revealed when the Hero sheet leaves and hidden
  // when the App sheet itself leaves into the Conference — it never enters/scales/fades. Only
  // the narrative + real phone product change between states 01–06 (unchanged). ──
  // SAFE_TOP reserves 92px for the 64px desktop nav. The phone nav is 54, so on mobile that
  // was 30px of the device's own height spent on nothing; the phone takes it back.
  const appLayer = (
    <div className="mx-story" style={{ position: "absolute", left: 0, right: 0, top: mobile ? 62 : SAFE_TOP, bottom: mobile ? 12 : SAFE_BOTTOM, zIndex: 3, pointerEvents: appVisible ? "auto" : "none" }}>
      <div style={stageGridStyle(mobile)}>
        <WalkthroughNarrative total={BEATS.length} index={appBeat} page={beat.page}
          head={pubStep ? PUB_HEADS[pubStep - 1] : beat.head}
          body={pubStep ? PUB_BODY[pubStep - 1] : beat.body}
          motionStyle={copyMotion} mobile={mobile} reduce={reduce}
          tail={appBeat === BEATS.length - 1 ? (
            <a href="/site?salesstory=1" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 26, color: MX.text, fontSize: 14, fontWeight: 600, textDecoration: "none", opacity: 0.82 }}>
              See the full Pro Profile walkthrough <span aria-hidden>→</span>
            </a>) : null} />
        <div style={{ position: "relative", height: "100%" }}>
          {PRNOTIFY && !mobile && <PushPreview show={pubStep === 1} />}
          <DirectedEmbed variant="home" hardware cutout />
        </div>
      </div>
    </div>
  );

  // ── CONFERENCE (states 7–13) — the flat-facing iPad running the real Northvale folio.
  // No separate intro screen: the folio's own HERO page (confIndex 0) is the opener — it
  // animates in and holds until the next swipe. The narrative + hold live in ConferenceScene;
  // this layer just reveals when the App sheet leaves (opacity + a restrained translate). ──
  const conferenceLayer = (
    <div style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: confSceneIn ? "auto" : "none",
      opacity: confSceneIn ? 1 : 0, transform: confSceneIn ? "translateY(0)" : "translateY(18px)",
      transition: `opacity ${T(520)} ${EASE}, transform ${T(560)} ${EASE_SHEET}` }}>
      <ConferenceScene mobile={mobile} reduce={reduce} confIndex={Math.max(0, Math.min(CONF_STATES - 1, confIndex))}
        mount={idx >= CONF0 - 1} active={confSceneIn} />
    </div>
  );

  // ── Section jump nav (centre-left) — tap straight to a section instead of scrolling. ──
  const SECTIONS = [
    { label: "The App",    target: APP0,   active: !pricingUp && idx >= APP0 && idx <= CONF0 - 1 },
    { label: "Conference", target: CONF0,  active: !pricingUp && idx >= CONF0 && idx <= NSTATES - 1 },
    // third dot — straight to the pricing page at the bottom of the sales story
    { label: "Pricing",    action: openPricing, active: pricingUp },
  ];
  const sideNav = !mobile && (
    <nav aria-label="Jump to section" style={{ position: "fixed", left: "clamp(18px, 2.4vw, 46px)", top: "50%", transform: "translateY(-50%)", zIndex: 80,
      display: "flex", flexDirection: "column", gap: 16, opacity: (idx >= APP0 || pricingUp) ? 1 : 0, pointerEvents: (idx >= APP0 || pricingUp) ? "auto" : "none", transition: `opacity 420ms ${EASE}` }}>
      {SECTIONS.map((s) => (
        <button key={s.label} type="button" onClick={() => (s.action ? s.action() : jumpTo(s.target))} className="mx-jump" aria-label={s.label} aria-current={s.active ? "true" : undefined}
          style={{ display: "grid", placeItems: "center", width: 24, height: 24, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          <span aria-hidden className="mx-jump-dot" style={{ width: s.active ? 13 : 11, height: s.active ? 13 : 11, borderRadius: "50%",
            background: s.active ? MX.ink : "transparent", boxShadow: s.active ? "none" : "inset 0 0 0 2px rgba(18,22,29,0.30)",
            transition: `all 240ms ${EASE}` }} />
        </button>
      ))}
    </nav>
  );

  return (
    <section id="app" ref={trackRef} className="mx-appstage" style={{ position: "relative", height: (mobile || reduce) ? `${NSTATES * 90}svh` : "100svh", background: "#fbfcfe", overscrollBehavior: "none" }}>
      <span id="app-scroll" style={{ position: "absolute", top: 0 }} />
      {sideNav}
      <style>{`
        .mx-appstage .mx-demo { background: transparent !important; height: 100% !important; overflow: visible !important; }
        .mx-appstage .mx-demo > div[aria-hidden] { display: none !important; }
        .mx-appstage .mx-demo > div:not([aria-hidden]) { padding: 0 !important; overflow: visible !important; }
        /* Hardware phone frame supplies its own body/shadow — no CSS bezel ring. */
        /* Every presentational iframe on the stage is inert to pointer/scroll input, so
           the page's wheel handler always owns the gesture (see the focus guard too). */
        .mx-appstage iframe { pointer-events: none !important; }
        .mx-jump:hover .mx-jump-dot { box-shadow: inset 0 0 0 2px ${MX.ink}; transform: scale(1.12); }
        .mx-jump[aria-current="true"]:hover .mx-jump-dot { box-shadow: none; }
        .hl-grad{background:linear-gradient(90deg,#2563eb,#4f9cf9,#c6f04a,#2563eb);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:hlShift 9s ease-in-out infinite}
        .hl-static{background:linear-gradient(90deg,#2563eb,#7bb0f7);-webkit-background-clip:text;background-clip:text;color:transparent}
        @keyframes hlShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        .mx-fa,.mx-fb,.mx-fc,.mx-fd{will-change:transform}
        @keyframes fA{0%{transform:translate(-50%,-50%) translate(-4%,-3%) scale(1)}50%{transform:translate(-50%,-50%) translate(9%,7%) scale(1.2)}100%{transform:translate(-50%,-50%) translate(-4%,-3%) scale(1)}}
        @keyframes fB{0%{transform:translate(-50%,-50%) translate(6%,3%) scale(1.1)}50%{transform:translate(-50%,-50%) translate(-8%,-6%) scale(1)}100%{transform:translate(-50%,-50%) translate(6%,3%) scale(1.1)}}
        @keyframes fC{0%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) translate(-9%,8%) scale(1.16)}100%{transform:translate(-50%,-50%) scale(1)}}
        @keyframes fD{0%{transform:translate(-50%,-50%) translate(3%,-2%) scale(1.06)}50%{transform:translate(-50%,-50%) translate(-6%,6%) scale(.92)}100%{transform:translate(-50%,-50%) translate(3%,-2%) scale(1.06)}}
        .mx-fa{animation:fA 24s ease-in-out infinite}.mx-fb{animation:fB 30s ease-in-out infinite}.mx-fc{animation:fC 27s ease-in-out infinite}.mx-fd{animation:fD 33s ease-in-out infinite}
        .mx-appstage[data-busy="1"] .mx-fa, .mx-appstage[data-busy="1"] .mx-fb, .mx-appstage[data-busy="1"] .mx-fc, .mx-appstage[data-busy="1"] .mx-fd { animation-play-state: paused !important; }
        .mx-appstage .mx-demo iframe { will-change: transform; backface-visibility: hidden; }
      `}</style>
      <div ref={stickyRef} style={{ position: "sticky", top: 0, height: "100svh", overflow: "hidden" }}>
        {/* Three stacked, opaque CHAPTER SHEETS (iOS layers). Each carries the identical
            atmosphere so the reveal is seamless; the top sheet TRANSLATES up to expose the
            one already resting underneath. Hero (top) → App (middle) → Conference (bottom).
            The next chapter never enters — it is simply uncovered. After the last Conference
            state, a further downward swipe navigates to the Pricing page (see onWheel). */}
        {/* PRICING sheet — the very bottom; stationary. The Conference (tablet) sheet lifts UP to reveal it;
            inside, a paged pricing deck (App → Conference → Websites) that pages on its own. */}
        <div ref={overlayRef} style={{ position: "absolute", inset: 0, zIndex: 2, background: "#fbfcfe", overflow: "hidden",
          pointerEvents: pricingUp ? "auto" : "none", visibility: pricingMounted ? "visible" : "hidden" }}>
          {pricingMounted && <React.Suspense fallback={null}><SalesPricingLazy active={pricingUp} onExitTop={closePricing} mobile={mobile} /></React.Suspense>}
        </div>
        {/* CONFERENCE sheet — revealed when the App sheet leaves; then it LIFTS UP to reveal the Pricing sheet.
            Carries the whole iPad walkthrough incl. the TEMPLATES gallery (State 06), all inside the same iPad. */}
        <div style={{ position: "absolute", inset: 0, zIndex: 3, background: "#fbfcfe", transform: `translateY(${pricingUp ? -100 : 0}%)`, transition: `transform ${T(SHEET_MS)} ${EASE_SHEET}`, willChange: "transform" }}>
          <ChapterBg reduce={reduce} paused={idx < CONF0} />
          {conferenceLayer}
        </div>
        {/* APP sheet — translates up to reveal the Conference sheet. */}
        <div style={{ position: "absolute", inset: 0, zIndex: 4, transform: `translateY(${(idx >= CONF0 || pricingUp) ? -100 : 0}%)`, transition: `transform ${T(SHEET_MS)} ${EASE_SHEET}`, willChange: "transform" }}>
          <ChapterBg reduce={reduce} paused={idx < APP0 || idx >= CONF0} />
          {appLayer}
        </div>
        {/* HERO sheet — translates up to reveal the App sheet. */}
        <div style={{ position: "absolute", inset: 0, zIndex: 5, transform: `translateY(${(idx >= APP0 || pricingUp) ? -100 : 0}%)`, transition: `transform ${T(SHEET_MS)} ${EASE_SHEET}`, willChange: "transform" }}>
          <ChapterBg reduce={reduce} paused={idx >= APP0} />
          {heroLayer}
        </div>
        {/* TRACKPAD — a single transparent shield over the WHOLE stage: a stable,
            never-remounted, always pointer-events:auto element that is ALWAYS the wheel
            hit-target under the cursor. Chrome caches the wheel target and keeps sending
            wheels there until the mouse moves; our sheets/layers move + re-mount, so any
            cached target under them would go stale after a transition (the old "move the
            mouse to continue" bug). This shield never changes, so every gesture reaches the
            wheel controller with no click. Nav (z100) stays clickable above it. */}
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 7, background: "transparent", pointerEvents: pricingUp ? "none" : "auto" }} />
      </div>
    </section>
  );
}

// The opaque chapter atmosphere carried by every sheet (identical, so the sheet reveal is
// seamless): near-white base + the diffused MineEx blue / restrained lime, masked to the
// right and below the nav band. Rendered once per sheet so a sheet can cover the one below
// it as it translates. (Gradient/position unchanged from before.)
function ChapterBg({ reduce, paused }) {
  // Only the active chapter's sheet animates its blooms; the two hidden sheets freeze theirs
  // (keeps the 3× atmosphere at the original single-atmosphere GPU cost).
  const ap = paused ? "paused" : "running";
  const blob = (pos, color) => ({ ...fblob(pos, color), animationPlayState: ap });
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: "#fbfcfe" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "64%", overflow: "hidden",
        WebkitMaskImage: "linear-gradient(to right, transparent, #000 40%), linear-gradient(to bottom, transparent 0%, transparent 8%, #000 28%)",
        WebkitMaskComposite: "source-in",
        maskImage: "linear-gradient(to right, transparent, #000 40%), linear-gradient(to bottom, transparent 0%, transparent 8%, #000 28%)",
        maskComposite: "intersect" }}>
        <span className={reduce ? "" : "mx-fa"} style={blob("60% 46%", "rgba(37,99,235,.50)")} />
        <span className={reduce ? "" : "mx-fb"} style={blob("52% 66%", "rgba(59,130,246,.40)")} />
        <span className={reduce ? "" : "mx-fc"} style={blob("74% 72%", "rgba(198,240,74,.46)")} />
        <span className={reduce ? "" : "mx-fd"} style={blob("58% 34%", "rgba(147,197,253,.52)")} />
        <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,0) 42%)" }} />
      </div>
      <div style={{ position: "absolute", inset: 0, opacity: .5, mixBlendMode: "multiply", backgroundImage: GRAIN }} />
    </div>
  );
}

// A quiet chapter eyebrow: a short colored tick (the chapter's light) + the label, in
// the SAME mx-label type as the walkthrough. No bullets, no buttons.
function ChapterEyebrow({ tick, children }) {
  return (
    <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em", margin: 0, display: "inline-flex", alignItems: "center", gap: 12 }}>
      <span aria-hidden style={{ width: 22, height: 2, borderRadius: 2, background: tick }} />
      {children}
    </p>
  );
}

const fblob = (pos, color) => { const [x, y] = pos.split(" "); return { position: "absolute", left: x, top: y, width: "74%", height: "74%", transform: "translate(-50%,-50%)", background: `radial-gradient(closest-side, ${color}, transparent 70%)`, filter: "blur(24px)", borderRadius: "50%" }; };
