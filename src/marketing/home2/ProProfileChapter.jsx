// ─────────────────────────────────────────────────────────────────────────────
// ProProfileChapter — Phase B integration of the FROZEN Pro Profile walkthrough
// (NarrativeStory → DirectedEmbed) into the new homepage. Marketing-layer only:
// it PRESENTS and manages scroll ownership around the demo; it never modifies it.
//
// The problem: DirectedEmbed owns a window "wheel" listener that preventDefaults
// EVERY wheel while mounted (it's built to be the whole viewport on /site?story).
// Dropped straight under the Hero it would hijack all page scrolling.
//
// The solution — a scroll-ownership controller:
//   • LAZY MOUNT: the walkthrough (and its iframe) mounts only as the visitor nears
//     it (IntersectionObserver), so the Hero stays light and the app has time to
//     paint before arrival — the first visible Pro Profile frame is already drawn.
//   • CAPTURE-PHASE GATE: a window wheel listener in the CAPTURE phase runs before
//     DirectedEmbed's BUBBLE listener. While the walkthrough isn't the active pinned
//     section it stopImmediatePropagation()s the wheel (so DirectedEmbed can't
//     preventDefault) WITHOUT preventing default itself → the page scrolls natively.
//   • PIN + ACTIVATE: the walkthrough is a sticky pane inside a taller track. When it
//     pins (fills the viewport) ownership flips to the demo (native scroll frozen by
//     DirectedEmbed's own preventDefault) and the visitor gestures through the states.
//   • RELEASE AT BOUNDARIES: at the terminal state (Following) a downward gesture, or
//     at the floor (status face) an upward gesture, hands ownership back to native
//     scroll so the page continues — and a re-pin is required before re-activating,
//     so releasing never immediately re-traps.
//
// These indices MIRROR the frozen demo (25 states: floor = status face = 1, terminal
// = Following = 24). They are read-only; the demo is untouched.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";
import { useViewport, EASE, useTrack, step } from "../system.jsx";
import { NarrativeStory } from "../demo/NarrativeStory.jsx";
// The sheet shows the REAL pricing page, not a second pricing component: PricingDeck is
// what /pricing renders, and it already supports an `embedded` mode (the sales page
// uses the same one). Lazy so the Pro page does not pay for it until the sheet is reached.
const PricingDeckLazy = React.lazy(() => import("./PricingDeck.jsx"));

// `hardware` renders the walkthrough inside the SAME photoreal titanium phone the sales
// page uses (DirectedEmbed's hardware composite), so the device doesn't change when the
// visitor moves from the sales page to Pro. The walkthrough itself — states, choreography,
// copy, scroll ownership — is untouched. The standalone /site?story and ?salesstory routes
// keep the CSS bezel, since the prop defaults to false.

const NS_BG = "#07080b";   // match NarrativeStory's dark stage

const FLOOR = 1;       // OPEN_FLOOR — the status face; the demo never goes below it
const TERMINAL = 24;   // "following" — the last state (Follow / Stay Connected)

export default function ProProfileChapter({ onActive, onPricing}) {
  const { mobile } = useViewport();

  // The directed demo's 25 states, driven from scroll on a phone (it only handles wheel).
  const PRO_STATES = 25;
  const mTrackRef = useRef(null);
  const mp = useTrack(mTrackRef);
  const mStepRef = useRef(-1);
  useEffect(() => {
    if (!mobile) return;
    const want = step(mp, PRO_STATES);
    if (want === mStepRef.current) return;
    mStepRef.current = want;
    try { window.__demoGo && window.__demoGo(want); } catch (_) {}
  }, [mp, mobile]);
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  // Tell the page when the walkthrough owns the viewport, so the global nav can recede.
  useEffect(() => { if (onActive) onActive(active); }, [active, onActive]);

  // Pro pricing rides as a sheet over the walkthrough — the same gesture-driven reveal the
  // approved sales page uses for its own pricing chapter, rather than a scrolling page.
  const [pricingUp, setPricingUp] = useState(false);
  const pricingUpRef = useRef(false);
  const overlayRef = useRef(null);
  useEffect(() => { pricingUpRef.current = pricingUp; }, [pricingUp]);
  // The pricing sheet is light while the walkthrough stage behind it is near-black, so the
  // page's nav has to change theme with it — otherwise a dark bar sits over a light sheet.
  useEffect(() => { if (onPricing) onPricing(pricingUp); }, [pricingUp, onPricing]);
  // Swiping up at the end of the walkthrough lifts the pricing sheet AND moves the site to
  // the Pricing tab: the URL becomes /pricing and the nav highlight follows, so the
  // reveal reads as switching tabs rather than as a panel appearing on the Pro page.
  // pushState fires no event of its own, hence the explicit "mx:navchange".
  const announce = (href) => {
    try { window.history.pushState({ mxPricing: href.includes("pricing") }, "", href); } catch (_) {}
    try { window.dispatchEvent(new Event("mx:navchange")); } catch (_) {}
  };
  const openPricing = () => {
    pricingUpRef.current = true; setPricingUp(true);
    activeRef.current = false; setActive(false);     // the sheet owns the wheel while it is up
    announce("/pricing");
  };
  const closePricing = () => {
    pricingUpRef.current = false; setPricingUp(false);
    try { if (overlayRef.current) overlayRef.current.scrollTop = 0; } catch (_) {}
    activeRef.current = true; setActive(true);          // hand the wheel back to the walkthrough
    announce("/pro");
  };

  // Browser Back from the pricing tab returns to the walkthrough instead of leaving the page.
  useEffect(() => {
    const onPop = () => {
      const onPricing = /[?&]pricing(=|&|$)/.test(window.location.search);
      if (onPricing && !pricingUpRef.current) { pricingUpRef.current = true; setPricingUp(true); activeRef.current = false; setActive(false); }
      if (!onPricing && pricingUpRef.current) { pricingUpRef.current = false; setPricingUp(false); activeRef.current = true; setActive(true); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const trackRef = useRef(null);
  const stickyRef = useRef(null);
  const mountedRef = useRef(false);
  const activeRef = useRef(false);
  const canActivateRef = useRef(true);   // becomes false on release; re-armed once unpinned
  useEffect(() => { mountedRef.current = mounted; }, [mounted]);
  useEffect(() => { activeRef.current = active; }, [active]);

  // Lazy mount as the visitor approaches (desktop): mount once the walkthrough track is
  // within ~1.5 viewports, so the iframe boots + paints behind DirectedEmbed's neutral
  // boot cover before the walkthrough is reached — the Hero stays light, no blank frame.
  useEffect(() => {
    if (mobile) { setMounted(true); return; }
    const check = () => {
      const el = trackRef.current; if (!el) return;
      const vh = window.innerHeight || 1;
      if (el.getBoundingClientRect().top < vh * 1.5) { setMounted(true); window.removeEventListener("scroll", check); }
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [mobile]);

  // Pin geometry. The sticky pane is `top:0; height:100svh` inside a taller track, so the
  // page is "pinned" (pane visually stationary at the top of the viewport) for every scroll
  // position in [trackTop, trackTop + trackHeight - vh]. Anywhere inside that range looks
  // IDENTICAL on screen, which is what makes the clamp and the entry snap invisible.
  const pinRange = () => {
    const t = trackRef.current; if (!t) return null;
    const top = t.offsetTop;
    const travel = Math.max(0, t.offsetHeight - (window.innerHeight || 1));
    return { top, end: top + travel };
  };

  // While the walkthrough owns the viewport the outer page must not move AT ALL — whatever
  // the input (trackpad momentum, keyboard, scrollbar drag, focus). DirectedEmbed only
  // preventDefaults wheel, so clamp scroll into the pinned range as a backstop. Clamping
  // inside that range is invisible because the pane is stationary throughout it.
  useEffect(() => {
    if (mobile || !active) return;
    const clamp = () => {
      const p = pinRange(); if (!p) return;
      const y = window.scrollY;
      if (y < p.top) window.scrollTo(0, p.top);
      else if (y > p.end) window.scrollTo(0, p.end);
    };
    clamp();
    window.addEventListener("scroll", clamp, { passive: true });
    return () => window.removeEventListener("scroll", clamp);
  }, [active, mobile]);

  // A trackpad flick emits its wheel events faster than the scroll position updates, so the
  // gate below can see "not near the walkthrough" on every event and still coast to a stop
  // half-way into the stage — leaving the phone stranded mid-viewport. Once scrolling settles,
  // if the stage is clearly the section in view, settle onto the pin. This is the SAME
  // navigation (native scroll in, gestures through, native scroll out) — not a second one.
  useEffect(() => {
    if (mobile) return;
    let t = 0;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (activeRef.current || !canActivateRef.current || !mountedRef.current) return;
        const p = pinRange(); if (!p) return;
        const vh = window.innerHeight || 1;
        const y = window.scrollY;
        if (y >= p.top || y <= p.top - vh * 0.6) return;   // already pinned, or not arriving
        window.scrollTo({ top: p.top, behavior: "smooth" });
      }, 140);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { clearTimeout(t); window.removeEventListener("scroll", onScroll); };
  }, [mobile]);

  // Capture-phase scroll-ownership gate (desktop only; the demo is wheel-driven).
  useEffect(() => {
    if (mobile) return;
    const onWheel = (e) => {
      if (!mountedRef.current) return;               // demo not mounted → nothing to gate; native scroll
      if (pricingUpRef.current) {
        // Pricing is open and LOCKED: keep DirectedEmbed from preventDefaulting (it would
        // freeze the sheet's own scrolling). stopImmediatePropagation blocks listeners, NOT
        // the default action, so the sheet still scrolls natively.
        //
        // Scrolling up at the top no longer returns to the walkthrough. Once the visitor has
        // arrived at pricing it is its own tab — the way back is the nav's "Pro" link (or the
        // browser's Back button), not an accidental upward flick.
        //
        // The event is NOT stopped here: the embedded pricing deck has its own capture-phase
        // wheel listener for paging between its three panels, and stopImmediatePropagation
        // would prevent it from ever running.
        return;
      }
      const sticky = stickyRef.current; if (!sticky) return;
      const r = sticky.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const p = pinRange();
      const y = window.scrollY;
      // Already stationary at the top of the viewport.
      const pinned = p ? (y >= p.top - 1 && y <= p.end + 1) : (r.top <= 2 && r.bottom >= vh - 2);
      // Close enough that the visitor is clearly arriving at the walkthrough. The old test
      // required EXACT pinning, which a single trackpad flick clears in one event — the
      // walkthrough was then scrolled straight past and the phone drifted through frame.
      const arriving = p && !pinned && y > p.top - vh * 0.6 && y < p.end + vh * 0.35;

      if (!activeRef.current) {
        if (!pinned && !arriving) {
          // Nowhere near → block DirectedEmbed so the page scrolls natively.
          e.stopImmediatePropagation();
          canActivateRef.current = true;
          return;
        }
        if (!canActivateRef.current) { e.stopImmediatePropagation(); return; }
        activeRef.current = true; setActive(true);
        if (pinned) return;        // already stationary → let this gesture advance a state
        // Still arriving: preventDefault FIRST so this gesture cannot also scroll the page
        // (that double-action was the jump on entry), snap onto the pin, and consume it.
        e.preventDefault();
        e.stopImmediatePropagation();
        if (p) window.scrollTo(0, e.deltaY > 0 ? p.top : p.end);
        return;
      }

      // Active → the demo owns the wheel, except at the two boundaries.
      let cur = FLOOR, animating = false;
      try { const s = window.__demoState && window.__demoState(); if (s) { cur = s.cur; animating = s.animating; } } catch (_) {}
      if (animating) return;                          // mid-transition: DirectedEmbed locks input itself
      const release = (down) => {
        const p = pinRange();
        // Both ends of the pinned range render identically, so this re-park is invisible —
        // it just means the next gesture continues the page instead of scrolling in place.
        if (p) window.scrollTo(0, down ? p.end : p.top);
        activeRef.current = false; setActive(false); canActivateRef.current = false;
        e.stopImmediatePropagation();
      };
      if (cur >= TERMINAL && e.deltaY > 0) {        // walkthrough complete → raise pricing
        e.preventDefault(); e.stopImmediatePropagation();
        activeRef.current = false; setActive(false);
        openPricing();
        return;
      }
      if (cur <= FLOOR && e.deltaY < 0)    { release(false); return; }  // release ↑ into the intro
      // otherwise: let it reach DirectedEmbed (it preventDefaults + advances one state)
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [mobile]);

  if (mobile) {
    // The walkthrough IS the page on a phone too — the same 25 states, the same real app,
    // the same copy. The directed demo only listens for `wheel`, so this drives it from
    // scroll position instead: a tall track, the sticky stage pinned inside it, and
    // window.__demoGo() called when the step changes. That is exactly how the sales page
    // already drives the same demo on mobile (AppSection), so there is no new mechanism.
    return (
      <section ref={mTrackRef} aria-label="MineEx Pro Profile" style={{ position: "relative", background: NS_BG, height: `${PRO_STATES * 72}svh` }}>
        <div className="mx-vstage" style={{ position: "sticky", top: 0, height: "100svh", overflow: "hidden" }}>
          <NarrativeStory variant="full" hardware cutout />
        </div>
      </section>
    );
  }

  return (
    <div ref={trackRef} style={{ position: "relative", height: "100svh", background: NS_BG }}>
      <div ref={stickyRef} style={{ position: "sticky", top: 0, height: "100svh", overflow: "hidden", boxShadow: active ? "inset 0 0 0 1px rgba(198,240,74,0.0)" : "none" }}>
        {mounted ? (
          <NarrativeStory variant="full" hardware cutout />
        ) : (
          // painted placeholder (never a blank/white frame) until the demo mounts
          <div style={{ height: "100%", width: "100%", background: NS_BG }} />
        )}
      </div>
      {/* Two jump dots, matching the sales page's rail: the walkthrough and the pricing
          sheet. Inverted for this page's dark stage.
          Hidden once pricing is up: that screen is locked to its own tab, so offering a
          "back to the walkthrough" control there would contradict the lock. The way back is
          the nav's Pro link (or browser Back). */}
      {!mobile && !pricingUp && (
        <nav aria-label="Jump to section" style={{ position: "fixed", left: "clamp(18px, 2.4vw, 46px)", top: "50%", transform: "translateY(-50%)", zIndex: 80,
          display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { label: "Walkthrough", on: !pricingUp, go: () => { if (pricingUpRef.current) closePricing(); } },
            { label: "Pricing",     on: pricingUp,  go: () => { if (!pricingUpRef.current) openPricing(); } },
          ].map((d) => (
            <button key={d.label} type="button" onClick={d.go} aria-label={d.label} aria-current={d.on ? "true" : undefined}
              style={{ display: "grid", placeItems: "center", width: 24, height: 24, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
              <span aria-hidden style={{ width: d.on ? 13 : 11, height: d.on ? 13 : 11, borderRadius: "50%",
                background: d.on ? "#fff" : "transparent",
                boxShadow: d.on ? "none" : "inset 0 0 0 2px rgba(255,255,255,0.38)",
                transition: `all 240ms ${EASE}` }} />
            </button>
          ))}
        </nav>
      )}
      {/* Pro pricing — the existing component and its real data, presented as the sheet that
          concludes the demonstration. Slides up over the completed walkthrough; a downward
          gesture at its top returns to the final state. */}
      <div ref={overlayRef} aria-hidden={!pricingUp} style={{
        // The sheet carries the LIGHT pricing page, so its own backdrop is light too. It was
        // inheriting the walkthrough's near-black (NS_BG), which showed through the 64px
        // spacer behind the nav — leaving a black strip with the dark wordmark invisible on
        // it once the nav flipped to its light theme.
        position: "fixed", inset: 0, zIndex: 30, background: "#fbfcfe",
        // The deck pages internally (one gesture per panel); it must not also scroll.
        overflow: "hidden", overscrollBehavior: "contain",
        transform: pricingUp ? "translateY(0)" : "translateY(100%)",
        transition: "transform 720ms cubic-bezier(0.32, 0.72, 0, 1)",
        visibility: pricingUp ? "visible" : "hidden",
        pointerEvents: pricingUp ? "auto" : "none",
      }}>
        {/* No onExitTop: pricing is locked once reached — the way back is the nav's Pro tab. */}
        <React.Suspense fallback={null}>
          {mountedRef.current || pricingUp ? <PricingDeckLazy embedded active={pricingUp} /> : null}
        </React.Suspense>
      </div>
    </div>
  );
}
