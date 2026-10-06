// ─────────────────────────────────────────────────────────────────────────────
// PortalAct — Chapter 3, the Company Portal. Its own visual language: after the dark,
// cinematic Conference, a calm, light COMPANY WORKSPACE. The chapter reveals the REAL
// portal ProfileEditor (via WorkspaceFrame → /site?portaldemo=1) and DIRECTS it — the
// marketing layer drives the real editor the way a person would.
//
// Three beats, one persistent WorkspaceFrame, gesture-driven:
//   1 The system behind the story  — the real editor at rest (FROZEN composition/copy).
//   2 Edit it. See it.             — ONE in-memory edit to the Tagline → the live investor
//                                     preview responds. The hero interaction.
//   3 Your whole investor story.   — one gesture sweeps the real editor through Projects,
//     One workspace.                 Capital, Team and rests on the strongest section.
//
// Everything is marketing-layer. No product code is modified; the edit lives entirely in
// the injected ProfileEditor's in-memory state (no Supabase / auth / save / network).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from "react";
import { MX, EASE, Wrap, useViewport } from "../system.jsx";
import WorkspaceFrame from "./WorkspaceFrame.jsx";
import {
  sleep, getDoc, getWin, clickNav, findTagline, setControlledValue, typeInto,
  rectOf, findPreviewSlogan, bringIntoView,
} from "./portalDirector.js";

// The one field we edit — the Tagline (COMPANY.slogan), the positioning line on the investor
// card. It is presentation, not a material fact. The demo value restates only facts already in
// the profile (silver & gold · exploration · Chihuahua · Parral district) — no new claim.
const ORIG_SLOGAN = "Chihuahua's preeminent explorationist";
const DEMO_SLOGAN = "Silver & gold exploration in Chihuahua's Parral Mining District.";

// Beat-3 breadth: the real editor sections to sweep, then the section to rest on.
const BREADTH_STOPS = ["Projects", "Capital", "Team"];
const BREADTH_FINAL = "Timeline";

const NARRATIVE = {
  1: { head: "One place to manage your investor presence.", sub: "Everything investors just experienced has a company-side home." },
  2: { head: "Edit it. See it.", sub: "Change your company information and see the investor experience update as you work." },
  3: { head: "Your whole investor story. One workspace.", sub: "Projects, capital, leadership and company progress — structured in one place." },
};

const pad = (r, n) => (r ? { x: r.x - n, y: r.y - n, w: r.w + n * 2, h: r.h + n * 2 } : null);

// ── The light workspace stage: persistent frame + the three beats ──────────────
function PortalChapter({ entered = true }) {
  const { mobile } = useViewport();
  const [beat, setBeat] = useState(1);
  const [overlays, setOverlays] = useState([]);
  const [emphasis, setEmphasis] = useState(1);
  const [ready, setReady] = useState(false);

  const iframeRef = useRef(null);
  const busyRef = useRef(false);
  const seqRef = useRef(0);           // sequence token → cancels a run if the viewer reverses mid-way
  const beatRef = useRef(1);
  const timers = useRef([]);
  useEffect(() => { beatRef.current = beat; }, [beat]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // ── Read-only state signal for a parent layer (mirrors window.__conferenceDemoState).
  //    Exposes only what the parent needs to arm the Portal↔Conference boundary: the current
  //    beat, whether we're at Beat 1 (atStart), and whether the choreography is at rest.
  //    No setters / navigation / imperative controls; removed on unmount. ──
  useEffect(() => {
    window.__portalDemoState = () => ({
      beat: beatRef.current,
      atStart: beatRef.current === 1,
      settled: !busyRef.current,
    });
    return () => { try { delete window.__portalDemoState; } catch (_) {} };
  }, []);

  const alive = (tok) => tok === seqRef.current;
  const onReady = useCallback((el) => { iframeRef.current = el; setReady(true); }, []);

  const measureRings = (doc, slogan) => {
    const ta = findTagline(doc);
    const pv = findPreviewSlogan(doc, slogan);
    const rings = [];
    if (ta) rings.push({ key: "field", ...pad(rectOf(ta), 8), on: true });
    if (pv) rings.push({ key: "preview", ...pad(rectOf(pv), 10), on: true });
    return rings;
  };

  // Beat 1 → 2 : navigate to the Tagline, ring it, type the edit, watch the preview respond.
  const toBeat2 = async () => {
    const tok = ++seqRef.current; busyRef.current = true;
    setBeat(2);
    const doc = getDoc(iframeRef.current), win = getWin(iframeRef.current);
    if (!doc) { busyRef.current = false; return; }
    clickNav(doc, "Overview"); clickNav(doc, "Company details");
    await sleep(460); if (!alive(tok)) return;
    const ta = findTagline(doc); bringIntoView(ta);
    await sleep(300); if (!alive(tok)) return;
    if (ta) setOverlays([{ key: "field", ...pad(rectOf(ta), 8), on: true }]);
    await sleep(560); if (!alive(tok)) return;
    await typeInto(win, ta, DEMO_SLOGAN, { total: 660, token: tok, alive });
    if (!alive(tok)) return;
    await sleep(240); if (!alive(tok)) return;   // past the 90ms preview debounce
    setOverlays(measureRings(doc, DEMO_SLOGAN));
    setEmphasis(1.012);
    await sleep(360);
    busyRef.current = false;
  };

  // Beat 2 → 1 : clear emphasis, restore the tagline, return to the Images step (Beat-1 rest).
  const toBeat1 = async () => {
    const tok = ++seqRef.current; busyRef.current = true;
    setOverlays([]); setEmphasis(1);
    const doc = getDoc(iframeRef.current), win = getWin(iframeRef.current);
    const ta = doc && findTagline(doc);
    if (ta) setControlledValue(win, ta, ORIG_SLOGAN);
    await sleep(220); if (!alive(tok)) return;
    if (doc) { clickNav(doc, "Overview"); clickNav(doc, "Images"); }
    setBeat(1);
    await sleep(360);
    busyRef.current = false;
  };

  // Beat 2 → 3 : return the workspace to its canonical state, then sweep the real sections.
  const toBeat3 = async () => {
    const tok = ++seqRef.current; busyRef.current = true;
    setOverlays([]); setEmphasis(1);
    const doc = getDoc(iframeRef.current), win = getWin(iframeRef.current);
    const ta = doc && findTagline(doc);
    if (ta) setControlledValue(win, ta, ORIG_SLOGAN);   // undo the Beat-2 edit — it was a demonstration
    setBeat(3);
    await sleep(380); if (!alive(tok)) return;
    for (const s of BREADTH_STOPS) {
      if (!alive(tok)) return;
      if (doc) clickNav(doc, s);
      await sleep(1180);
    }
    if (!alive(tok)) return;
    if (doc) clickNav(doc, BREADTH_FINAL);
    await sleep(240);
    busyRef.current = false;
  };

  // Beat 3 → 2 : re-establish the Beat-2 rest (edit re-applied, rings back).
  const beat3to2 = async () => {
    const tok = ++seqRef.current; busyRef.current = true;
    setOverlays([]); setEmphasis(1);
    const doc = getDoc(iframeRef.current), win = getWin(iframeRef.current);
    if (doc) { clickNav(doc, "Overview"); clickNav(doc, "Company details"); }
    await sleep(420); if (!alive(tok)) return;
    const ta = doc && findTagline(doc);
    if (ta) setControlledValue(win, ta, DEMO_SLOGAN);
    await sleep(240); if (!alive(tok)) return;
    setOverlays(measureRings(doc, DEMO_SLOGAN));
    setEmphasis(1.012);
    setBeat(2);
    await sleep(320);
    busyRef.current = false;
  };

  const advance = () => { const b = beatRef.current; if (b === 1) toBeat2(); else if (b === 2) toBeat3(); };
  const reverse = () => { const b = beatRef.current; if (b === 3) beat3to2(); else if (b === 2) toBeat1(); };

  // one deliberate gesture per move; armed only once the real editor has painted
  useEffect(() => {
    let accum = 0, lastT = 0;
    const onWheel = (e) => {
      if (!ready || busyRef.current) return;
      const now = performance.now();
      if (now - lastT > 320) accum = 0;
      lastT = now; accum += e.deltaY;
      if (Math.abs(accum) < 90) return;
      const dir = accum > 0 ? 1 : -1; accum = 0;
      // consume the gesture so nothing behind the chapter scrolls during a move
      if ((dir > 0 && beatRef.current < 3) || (dir < 0 && beatRef.current > 1)) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
      if (dir > 0) advance(); else reverse();
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [ready]);

  const n = NARRATIVE[beat];

  return (
    <section id="portal" style={{ position: "relative", background: MX.sheet, color: MX.text, padding: mobile ? "clamp(80px,14vh,140px) 0 90px" : "clamp(110px,16vh,200px) 0 clamp(90px,12vh,160px)", overflow: "hidden", minHeight: "100svh" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 92% at 50% -6%, #ffffff 0%, #f5f6f7 52%, #e9edf2 100%)", pointerEvents: "none" }} />

      <Wrap style={{ position: "relative", zIndex: 2 }}>
        {/* narrative — copy cross-fades between beats; the frame below stays put */}
        <div style={{ position: "relative", maxWidth: 820, margin: "0 auto", textAlign: "center", minHeight: mobile ? 150 : 190 }}>
          <span className="mx-label" style={{ color: MX.emText, display: "inline-flex", alignItems: "center", gap: 12, justifyContent: "center", opacity: entered ? 1 : 0, transition: `opacity 720ms ${EASE}` }}>
            <span style={{ width: 22, height: 2, borderRadius: 2, background: "var(--mx-accent-ink, #5f7a12)" }} />Company Portal
          </span>
          {[1, 2, 3].map((b) => (
            <div key={b} aria-hidden={b !== beat} style={{ position: b === 1 ? "relative" : "absolute", left: 0, right: 0, top: b === 1 ? "auto" : 40, opacity: b === beat && entered ? 1 : 0, transform: b === beat ? "translateY(0)" : "translateY(10px)", transition: `opacity 620ms ${EASE}, transform 620ms ${EASE}`, pointerEvents: "none" }}>
              <h2 className="mx-display" style={{ marginTop: 16, color: MX.text }}>{NARRATIVE[b].head}</h2>
              <p className="mx-lead" style={{ color: MX.dim, marginTop: 18, marginLeft: "auto", marginRight: "auto", maxWidth: 620 }}>{NARRATIVE[b].sub}</p>
            </div>
          ))}
        </div>

        {/* the real Portal — one persistent frame across all three beats */}
        <div style={{ maxWidth: 1180, margin: mobile ? "36px auto 0" : "clamp(40px,5vh,72px) auto 0", opacity: entered ? 1 : 0, transform: entered ? "none" : "translateY(44px) scale(0.985)", transition: `opacity 950ms ${EASE} 140ms, transform 1050ms ${EASE} 140ms`, willChange: "transform, opacity" }}>
          <WorkspaceFrame interactive={false} onReady={onReady} overlays={overlays} emphasis={emphasis} />
          <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: "#4ade80", boxShadow: "0 0 0 4px rgba(74,222,128,0.16)" }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MX.mute }}>The real MineEx Company Portal · Kingsmen Resources</span>
          </div>
        </div>
      </Wrap>
    </section>
  );
}

// Backwards-compatible Beat-1-only export (static, no direction) — kept for any standalone use.
export function PortalAct() { return <PortalChapter entered />; }

// Isolated preview of the controlled Conference → Portal perspective shift, then the full
// (Beats 1–3) Portal chapter. Wiring into the frozen Conference flow is a separate step.
export function PortalSlice() {
  const [phase, setPhase] = useState("conf");   // conf (dark) | shift | portal
  const busyRef = useRef(false);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const go = useCallback(() => {
    if (busyRef.current || phase !== "conf") return;
    busyRef.current = true;
    setPhase("shift");
    timers.current.push(setTimeout(() => setPhase("portal"), 760));
  }, [phase]);

  // one deliberate downward gesture starts the perspective shift (only while the dark stand-in shows)
  useEffect(() => {
    let accum = 0, lastT = 0;
    const onWheel = (e) => {
      if (phase !== "conf") return;
      if (e.deltaY <= 0) return;
      const now = performance.now();
      if (now - lastT > 300) accum = 0;
      lastT = now; accum += e.deltaY;
      if (accum < 70) return;
      e.preventDefault(); e.stopImmediatePropagation(); accum = 0;
      go();
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [phase, go]);

  return (
    <div style={{ position: "relative", minHeight: "100svh", background: MX.sheet }}>
      {/* the Portal chapter mounts as the shift begins, so the real editor preloads behind the wipe */}
      {phase !== "conf" && <PortalChapter entered={phase === "portal"} />}
      {phase === "conf" && <div style={{ height: "100svh" }} />}

      {/* light workspace plane rises as the dark recedes — gone at rest so it never covers the Portal */}
      {phase !== "portal" && (
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 15, background: MX.sheet, transform: phase === "conf" ? "translateY(100%)" : "translateY(0)", transition: `transform 820ms ${EASE}`, pointerEvents: "none" }} />
      )}

      {/* outgoing Conference environment (dark) — stand-in for the frozen showcase final */}
      {phase !== "portal" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 20, background: MX.ink, display: "grid", placeItems: "center", opacity: phase === "shift" ? 0 : 1, transition: `opacity 640ms ${EASE}`, pointerEvents: "none" }}>
          <div style={{ textAlign: "center", color: MX.onDarkMute }}>
            <div className="mx-label" style={{ color: MX.onDarkDim, display: "inline-flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
              <span style={{ width: 22, height: 2, borderRadius: 2, background: "var(--mx-accent)" }} />Conference Mode
            </div>
            <p style={{ marginTop: 14, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase" }}>3 shown · 15 available</p>
            <p style={{ marginTop: 34, fontSize: 12.5, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.7 }}>Investor experience ↓ Company workspace</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default PortalAct;
