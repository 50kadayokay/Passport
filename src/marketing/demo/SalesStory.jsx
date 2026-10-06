// ─────────────────────────────────────────────────────────────────────────────
// SalesStory — the NEW marketing-level parent that composes the sales story as two
// chapters without modifying either product:
//
//   CHAPTER 1  the frozen Pro Profile walkthrough (NarrativeStory → DirectedEmbed)
//     ↓  gesture continuation at its terminal beat
//   CHAPTER 2  the Conference Mode sales chapter (ConferenceAct → real Conference)
//
// It is a CHAPTER SWAP, not an append: chapter 1 is unmounted (its own cleanup
// removes DirectedEmbed's global wheel listener) as chapter 2 mounts, so scrolling
// is freed exactly at the boundary. Nothing here edits the frozen demo or the real
// products — it only listens to the demo's EXISTING public signals and owns the
// transition presentation.
//
// TERMINAL DETECTION — public signals only:
//   • demo:settled  (CustomEvent, detail.cur) — the phone settled on a state
//   • window.__demoState() → { cur, animating } — failsafe reconcile poll
// Terminal is state 27 ("following", the final beat "Don't let investor interest
// disappear."). We never read rendered text and never touch DirectedEmbed.
//
// WHEEL OWNERSHIP — DirectedEmbed owns a window wheel listener (BUBBLE phase) that
// preventDefaults unconditionally. We DON'T fight it with a competing permanent
// bubble handler. Our continuation listener is CAPTURE phase, so it sees the wheel
// first; only when armed (terminal + settled) and the gesture is a deliberate
// downward one do we consume it (stopImmediatePropagation → DirectedEmbed never sees
// that event) and start the transition. Otherwise we do nothing and the frozen demo
// behaves exactly as before. During the transition a capture-phase blocker owns all
// input until the Conference opening has settled.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from "react";
import { MX, EASE, useReduce } from "../system.jsx";
import { NarrativeStory } from "./NarrativeStory.jsx";
import { ConferenceAct } from "./ConferenceAct.jsx";
import PortalAct from "./PortalAct.jsx";

const TERMINAL = 24;            // DirectedEmbed final state index ("following"); mirrors STATES in the frozen file
const CONTINUE_THRESHOLD = 90;  // accumulated downward wheel delta = one deliberate continuation gesture

// Capture-only slow-motion multiplier: /site?salesstory=1&slow=6 stretches the
// transition so each phase can be screenshotted crisply. Defaults to 1 (no effect on
// the real experience). Dev aid only, mirrors the site's other localhost preview switches.
const SLOW = (() => { try { const n = parseFloat(new URLSearchParams(window.location.search).get("slow")); return n > 0 ? n : 1; } catch (_) { return 1; } })();
const RISE_MS = Math.round(860 * SLOW);
const FADE_MS = Math.round(560 * SLOW);
const HOLD_MS = Math.round(1220 * SLOW);
const SCROLL_MS = Math.round(1700 * SLOW);

function smoothScrollTo(target, dur, done) {
  const start = window.scrollY;
  const dist = target - start;
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    window.scrollTo(0, Math.round(start + dist * ease(t)));
    if (t < 1) requestAnimationFrame(step);
    else done && done();
  };
  requestAnimationFrame(step);
}

export default function SalesStory() {
  const reduce = useReduce();
  const [chapter, setChapter] = useState(1);     // 1 = Pro Profile · 2 = Conference · 3 = Portal
  const [phase, setPhase] = useState("ch1");      // ch1 | rising | reveal | revealFade | ch2
  const armedRef = useRef(false);                 // demo at terminal + settled
  const lockRef = useRef(false);                  // input locked during the transition
  const timers = useRef([]);
  const after = useCallback((ms, fn) => { const t = setTimeout(fn, ms); timers.current.push(t); return t; }, []);

  // ── Conference ↔ Portal boundary state (bidirectional) ──
  const chapterRef = useRef(1);
  const confArmedRef = useRef(false);             // Conference at Terrain terminal + settled → forward arm
  const portalRevArmedRef = useRef(false);        // Portal at Beat 1 + settled → reverse arm
  const [preloadPortal, setPreloadPortal] = useState(false);  // latch: keep Portal mounted (hidden) to preload its editor
  const [preloadConf, setPreloadConf] = useState(false);      // latch: keep Conference mounted (hidden) at terminal for reverse
  const [confResume, setConfResume] = useState(false);        // after the first forward, Conference (re)mounts at its terminal
  const [bt, setBt] = useState("idle");           // boundary transition: idle | fwdRise | fwdReveal | revRise | revReveal
  const handoffRef = useRef(() => {});
  const reverseRef = useRef(() => {});
  useEffect(() => { chapterRef.current = chapter; }, [chapter]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // Expose a tiny hook so an isolated preview can begin at the terminal beat if asked.
  // (Read-only convenience; the real flow arms via the demo's own signals below.)
  useEffect(() => { window.__salesArmed = () => armedRef.current; return () => { try { delete window.__salesArmed; } catch (_) {} }; }, []);

  // ── terminal-state arming, from the frozen demo's PUBLIC signals only ──
  useEffect(() => {
    if (chapter !== 1) return;
    const reconcile = () => {
      try {
        const s = window.__demoState && window.__demoState();
        if (s && typeof s.cur === "number") armedRef.current = s.cur >= TERMINAL && !s.animating;
      } catch (_) {}
    };
    const onSettled = (e) => {
      const c = e && e.detail && e.detail.cur;
      if (typeof c === "number") armedRef.current = c >= TERMINAL;
    };
    const onStart = () => { armedRef.current = false; };   // any phone move disarms
    window.addEventListener("demo:settled", onSettled);
    window.addEventListener("demo:transitionstart", onStart);
    const poll = setInterval(reconcile, 400);
    reconcile();
    return () => {
      window.removeEventListener("demo:settled", onSettled);
      window.removeEventListener("demo:transitionstart", onStart);
      clearInterval(poll);
    };
  }, [chapter]);

  // ── the chapter transformation ──
  const startTransition = useCallback(() => {
    if (lockRef.current) return;
    lockRef.current = true;

    // Own ALL input for the duration (capture phase, above the frozen demo).
    const block = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    window.addEventListener("wheel", block, { passive: false, capture: true });
    window.addEventListener("touchmove", block, { passive: false, capture: true });
    const unblock = () => {
      window.removeEventListener("wheel", block, { capture: true });
      window.removeEventListener("touchmove", block, { capture: true });
    };

    const landOnDevice = (done) => {
      const dev = document.querySelector(".mx-tabletframe");
      const target = dev
        ? Math.max(0, Math.round(window.scrollY + dev.getBoundingClientRect().top + dev.getBoundingClientRect().height / 2 - window.innerHeight / 2))
        : 0;
      if (reduce) { window.scrollTo(0, target); done(); }
      else smoothScrollTo(target, SCROLL_MS, done);
    };

    if (reduce) {
      // No motion: swap chapters and settle on the device immediately.
      setChapter(2); setPhase("ch2");
      after(80, () => { window.scrollTo(0, 0); landOnDevice(() => { lockRef.current = false; unblock(); }); });
      return;
    }

    setPhase("rising");                          // dark ground rises; phone chapter recedes
    after(RISE_MS + 20, () => {
      setChapter(2);                             // NarrativeStory unmounts → its wheel listener is removed
      setPhase("reveal");                        // curtain still covering; ConferenceAct now mounted beneath
      window.scrollTo(0, 0);                     // start at the Conference headline
      after(50, () => setPhase("revealFade"));   // fade the obsidian ground away → CONFERENCE MODE headline arrives
      after(HOLD_MS, () => landOnDevice(() => { setPhase("ch2"); lockRef.current = false; unblock(); })); // iPad enters → Monolith → rest
    });
  }, [reduce, after]);

  // ── gesture continuation (capture phase, sees the wheel before DirectedEmbed) ──
  useEffect(() => {
    if (chapter !== 1) return;
    let accum = 0, lastT = 0;
    const onWheel = (e) => {
      if (lockRef.current) return;               // the transition blocker owns input
      if (!armedRef.current) return;             // not at terminal → let the frozen demo handle it
      if (e.deltaY <= 0) return;                 // only a deliberate DOWNWARD gesture continues
      const now = performance.now();
      if (now - lastT > 300) accum = 0;          // new gesture stream
      lastT = now; accum += e.deltaY;
      if (accum < CONTINUE_THRESHOLD) return;    // wait for deliberateness (demo clamps at terminal meanwhile)
      e.preventDefault();
      e.stopImmediatePropagation();              // consume — DirectedEmbed's bubble listener never sees this event
      accum = 0;
      startTransition();
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [chapter, startTransition]);

  // ── FORWARD arm: Conference at Terrain terminal, from the approved read-only signal ONLY ──
  useEffect(() => {
    if (chapter !== 2) { confArmedRef.current = false; return; }
    const poll = setInterval(() => {
      try {
        const s = window.__conferenceDemoState && window.__conferenceDemoState();
        const armed = !!(s && s.terminal && s.settled);
        confArmedRef.current = armed;
        if (armed) setPreloadPortal(true);   // latch: keep the Portal editor preloaded while at rest
      } catch (_) {}
    }, 220);
    return () => clearInterval(poll);
  }, [chapter]);

  // ── REVERSE arm: Portal at Beat 1, from the approved read-only signal ONLY ──
  useEffect(() => {
    if (chapter !== 3) { portalRevArmedRef.current = false; return; }
    const poll = setInterval(() => {
      try {
        const s = window.__portalDemoState && window.__portalDemoState();
        const armed = !!(s && s.atStart && s.settled);
        portalRevArmedRef.current = armed;
        if (armed) setPreloadConf(true);     // latch: keep Conference preloaded at its terminal for a clean reverse
      } catch (_) {}
    }, 200);
    return () => clearInterval(poll);
  }, [chapter]);

  const blockInput = useCallback(() => {
    const block = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    window.addEventListener("wheel", block, { passive: false, capture: true });
    window.addEventListener("touchmove", block, { passive: false, capture: true });
    return () => { window.removeEventListener("wheel", block, { capture: true }); window.removeEventListener("touchmove", block, { capture: true }); };
  }, []);

  // ── FORWARD: Conference terminal → Portal (investor experience → company workspace) ──
  const startPortalHandoff = useCallback(() => {
    if (lockRef.current) return;
    lockRef.current = true;
    const unblock = blockInput();
    setConfResume(true);                            // from now on, Conference (re)mounts at its terminal
    if (reduce) {
      setChapter(3); window.scrollTo(0, 0);
      after(60, () => { setBt("idle"); lockRef.current = false; unblock(); });
      return;
    }
    setBt("fwdRise");                               // light workspace plane rises over the REAL Conference terminal
    after(RISE_MS + 20, () => {
      setChapter(3);                                // front swaps to the preloaded Portal (Conference goes hidden/unmounts)
      window.scrollTo(0, 0);
      setBt("fwdReveal");                           // plane fades → Portal Beat 1 revealed, already painted
      after(FADE_MS + 40, () => { setBt("idle"); lockRef.current = false; unblock(); });
    });
  }, [reduce, after, blockInput]);
  handoffRef.current = startPortalHandoff;

  // ── REVERSE: Portal Beat 1 → Conference terminal (company workspace → investor experience) ──
  const startReverseHandoff = useCallback(() => {
    if (lockRef.current) return;
    lockRef.current = true;
    const unblock = blockInput();
    if (reduce) {
      setChapter(2); window.scrollTo(0, 0);
      after(60, () => { setBt("idle"); lockRef.current = false; unblock(); });
      return;
    }
    setBt("revRise");                               // dark booth plane rises over the light Portal
    after(RISE_MS + 20, () => {
      setChapter(2);                                // front swaps to the preloaded Conference (resumed at Terrain)
      window.scrollTo(0, 0);
      setBt("revReveal");                           // plane fades → the exact Conference terminal returns
      after(FADE_MS + 40, () => { setBt("idle"); lockRef.current = false; unblock(); });
    });
  }, [reduce, after, blockInput]);
  reverseRef.current = startReverseHandoff;

  // ── persistent boundary listener: registered at parent mount (chapter 1), BEFORE either
  //    chapter's own listener, so it sees the wheel FIRST in capture order. It consumes ONLY:
  //    a DOWN gesture at the armed Conference terminal → Portal, or an UP gesture at the armed
  //    Portal Beat 1 → Conference. Everything else is inert and owned by the frozen chapters. ──
  useEffect(() => {
    let accum = 0, lastT = 0;
    const onWheel = (e) => {
      // During a boundary transition this first-registered listener owns ALL input, so no
      // chapter listener — the front one OR the hidden preloaded one — can act on a stray wheel.
      if (lockRef.current) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      const fwd = chapterRef.current === 2 && confArmedRef.current;
      const rev = chapterRef.current === 3 && portalRevArmedRef.current;
      const now = performance.now();
      if (now - lastT > 300) accum = 0;
      lastT = now;
      if (fwd && e.deltaY > 0) {
        // At the Conference terminal the only downward action is the handoff. Consume EVERY
        // down-wheel so none leaks to the hidden, preloaded Portal (which would advance a beat).
        e.preventDefault(); e.stopImmediatePropagation();
        accum += e.deltaY;
        if (accum >= CONTINUE_THRESHOLD) { accum = 0; handoffRef.current(); }
      } else if (rev && e.deltaY < 0) {
        // At Portal Beat 1 the upward action is the reverse. Consume up-wheels only; downward
        // wheels are left to Portal so its own Beat 1 → 2 advance keeps working.
        e.preventDefault(); e.stopImmediatePropagation();
        accum += e.deltaY;
        if (accum <= -CONTINUE_THRESHOLD) { accum = 0; reverseRef.current(); }
      }
      // else: inert — the front chapter owns the gesture.
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  const receding = phase === "rising";
  // Boundary front-ness follows `chapter`; a plane covers the swap. Both surfaces stay mounted
  // (via the preload latches) once cycling begins, so no editor/booth ever reloads. A hidden
  // surface sits in an opacity-0 stacking context, so even its fixed children are invisible.
  const backStyle = { position: "fixed", inset: 0, overflow: "hidden", opacity: 0, zIndex: -1, pointerEvents: "none" };
  const frontStyle = { position: "relative" };
  return (
    <div className="mx-salesstory" style={{ position: "relative", background: (chapter === 1 || chapter === 3) ? MX.sheet : MX.ink }}>
      {chapter === 1 && (
        <div
          style={{
            transform: receding ? "scale(0.965)" : "none",
            filter: receding ? "brightness(0.72)" : "none",
            transition: reduce ? "none" : `transform ${RISE_MS}ms ${EASE}, filter ${RISE_MS}ms ${EASE}`,
            transformOrigin: "center 38%",
          }}
        >
          <NarrativeStory variant="full" />
        </div>
      )}

      {/* Conference chapter. Front when chapter 2; otherwise kept mounted (hidden) once preloaded,
          so reverse can resume its REAL terminal with no remount. resumeAtTerminal takes effect
          only on the reverse remount (after the first forward). */}
      {(chapter === 2 || preloadConf) && (
        <div aria-hidden={chapter !== 2} style={chapter === 2 ? frontStyle : backStyle}>
          <ConferenceAct resumeAtTerminal={confResume} />
        </div>
      )}

      {/* Portal chapter. Front when chapter 3; otherwise kept mounted (hidden) once preloaded,
          so its editor iframe never reloads. */}
      {(chapter === 3 || preloadPortal) && (
        <div aria-hidden={chapter !== 3} style={chapter === 3 ? frontStyle : backStyle}>
          <PortalAct />
        </div>
      )}

      {/* FORWARD plane: light workspace rises over the real Conference terminal, then fades to Portal. */}
      {(bt === "fwdRise" || bt === "fwdReveal") && (
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 60, background: MX.sheet, pointerEvents: "none", opacity: bt === "fwdReveal" ? 0 : 1, transition: bt === "fwdReveal" ? `opacity ${FADE_MS}ms ${EASE}` : "none", animation: bt === "fwdRise" ? `mx-boundary-rise ${RISE_MS}ms ${EASE} both` : "none" }} />
      )}

      {/* REVERSE plane: the dark booth environment rises over the Portal, then fades to the terminal. */}
      {(bt === "revRise" || bt === "revReveal") && (
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 60, background: MX.ink, pointerEvents: "none", opacity: bt === "revReveal" ? 0 : 1, transition: bt === "revReveal" ? `opacity ${FADE_MS}ms ${EASE}` : "none", animation: bt === "revRise" ? `mx-boundary-rise ${RISE_MS}ms ${EASE} both` : "none" }} />
      )}
      <style>{`@keyframes mx-boundary-rise{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

      {(phase === "rising" || phase === "reveal" || phase === "revealFade") && <Curtain phase={phase} />}
    </div>
  );
}

// The transforming environment: a full-viewport obsidian ground that RISES from
// below (curved leading lip), covers the receding Pro Profile, then fades to leave
// the Conference stage. Same obsidian as ConferenceAct, so the hand-off is a change
// of environment rather than a page-1-out / page-2-in crossfade. Purely presentational.
function Curtain({ phase }) {
  const rising = phase === "rising";
  const fading = phase === "revealFade";
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        pointerEvents: "none",
        transform: "translateY(0)",
        opacity: fading ? 0 : 1,
        transition: fading ? `opacity ${FADE_MS}ms ${EASE}` : "none",
        animation: rising ? `mx-curtain-rise ${RISE_MS}ms ${EASE} both` : "none",
        background: "radial-gradient(130% 130% at 50% 42%, #0c1016 0%, #05070b 72%)",
        willChange: "transform, opacity",
      }}
    >
      {/* curved leading lip — the ground rises as a soft crest, not a flat wall */}
      <div
        aria-hidden
        style={{
          position: "absolute", left: 0, right: 0, top: 0,
          height: "12vh", transform: "translateY(-96%)",
          background: "#0b0e13",
          borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
        }}
      />
      <style>{`@keyframes mx-curtain-rise{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}
