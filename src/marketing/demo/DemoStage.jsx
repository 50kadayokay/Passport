// ─────────────────────────────────────────────────────────────────────────────
// PRO PROFILE DEMO STAGE — phase-based master timeline (diagnostic slice).
//
// One persistent CompanyProfile, choreographed by ONE deterministic timeline.
// The timeline is an ordered list of PHASES; for any global scroll progress there
// is exactly ONE authoritative frame:
//     { tab, nav, navT, appScroll, focus, sheet, sheetT, copy }
// Nothing inside the phone independently decides where it should be. Internal app
// movement is direct interpolation (scrollTop = lerp), never smooth-scroll, so it
// tracks the wheel exactly and stops when the wheel stops.
//
// Each scene is ARRIVAL → DEMONSTRATION → DEPARTURE. Tab navigation is a hard gate
// (no demonstration, no internal scroll, no sheet during a nav phase). Every tab
// has a canonical scroll position it arrives at. The left copy FOLLOWS the app —
// a scene's headline becomes dominant only once the phone has reached that scene.
//
// DIAGNOSTIC SLICE ONLY: Projects → Drill Results → Project Intelligence →
// Timeline. Add ?slowDemo=1 to stretch the timeline for inspection.
// ─────────────────────────────────────────────────────────────────────────────
import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MX, EASE, Wrap, Phone, useViewport, useReduce, subscribe, phoneWidth } from "../system.jsx";
import { PP_ASSETS } from "./ppAssets.js";

const ProProfileDemo = lazy(() => import("./ProProfileDemo.jsx"));

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const easeOut = (u) => 1 - Math.pow(1 - u, 3);

// ── Copy (only the four slice scenes; copy follows the app) ──────────────────
const COPY = {
  projects: { eyebrow: "PROJECTS",             head: "Your projects, explorable.",        body: "Every asset with its imagery, geology and context — something an investor navigates, not a slide they skim." },
  drills:   { eyebrow: "THE DETAIL",           head: "Results with context.",             body: "The drill intercepts, one tap away — real grades and widths, in words an investor can read without opening a filing." },
  intel:    { eyebrow: "PROJECT INTELLIGENCE", head: "The technical case, organized.",     body: "Stage, targets and what sets the project apart — the depth a serious investor wants, made readable." },
  timeline: { eyebrow: "PROGRESS",             head: "Years of activity become a story.", body: "Move through the financings and milestones — then see what a single announcement actually meant." },
};
const COPY_ORDER = ["projects", "drills", "intel", "timeline"];

// ── The master timeline. w = relative scroll distance for the phase. ─────────
// scroll = [fromKey, toKey] positions of the ACTIVE tab's page (eased lerp).
// sheetT = [from, to]; focus = a target key; copy = the dominant headline.
// A nav phase gates the tab change: no scroll/sheet/focus, copy held.
const PHASES = [
  // ── PROJECTS ──
  { key: "proj.arrive",   w: 1.6, tab: "projects", scroll: ["top", "top"],       copy: "projects" },
  { key: "proj.settle",   w: 2.2, tab: "projects", scroll: ["top", "flag"],      copy: "projects" },
  // ── DRILL RESULTS ──  (arrival → focus → open → read → depart)
  { key: "drill.arrive",  w: 2.6, tab: "projects", scroll: ["flag", "drills"],   copy: "projects" },
  { key: "drill.focus",   w: 1.8, tab: "projects", scroll: ["drills", "drills"], focus: "drills", copy: "drills" },
  { key: "drill.open",    w: 2.4, tab: "projects", scroll: ["drills", "drills"], focus: "drills", sheet: "proj:drills", sheetT: [0, 1], copy: "drills" },
  { key: "drill.read",    w: 2.0, tab: "projects", scroll: ["drills", "drills"], focus: "drills", sheet: "proj:drills", sheetT: [1, 1], copy: "drills" },
  { key: "drill.close",   w: 1.9, tab: "projects", scroll: ["drills", "drills"], focus: "drills", sheet: "proj:drills", sheetT: [1, 0], copy: "drills" },
  { key: "drill.release", w: 1.1, tab: "projects", scroll: ["drills", "drills"], copy: "drills" },
  // ── PROJECT INTELLIGENCE ──  (arrival → focus → read)
  { key: "intel.arrive",  w: 2.6, tab: "projects", scroll: ["drills", "intel"],  copy: "drills" },
  { key: "intel.focus",   w: 1.8, tab: "projects", scroll: ["intel", "intel"],   focus: "intel", copy: "intel" },
  { key: "intel.read",    w: 2.4, tab: "projects", scroll: ["intel", "intel"],   focus: "intel", copy: "intel" },
  // ── NAVIGATE → TIMELINE ──  (hard gate; copy held on intel)
  { key: "nav.timeline",  w: 2.6, nav: ["projects", "timeline"], navScroll: { projects: "intel", timeline: "top" }, copy: "intel" },
  // ── TIMELINE ──  (arrive at top → move through milestones → focus → open detail → read)
  { key: "tl.arrive",     w: 1.8, tab: "timeline", scroll: ["top", "top"],       copy: "timeline" },
  { key: "tl.scroll",     w: 3.0, tab: "timeline", scroll: ["top", "mile"],      copy: "timeline" },
  { key: "tl.focus",      w: 1.8, tab: "timeline", scroll: ["mile", "mile"],     focus: "milestone", copy: "timeline" },
  { key: "tl.open",       w: 2.4, tab: "timeline", scroll: ["mile", "mile"],     focus: "milestone", sheet: "time:detail", sheetT: [0, 1], copy: "timeline" },
  { key: "tl.read",       w: 2.6, tab: "timeline", scroll: ["mile", "mile"],     sheet: "time:detail", sheetT: [1, 1], copy: "timeline" },
];
const TOTAL_W = PHASES.reduce((a, p) => a + p.w, 0);
const PBOUND = (() => { const out = [0]; let acc = 0; for (const p of PHASES) { acc += p.w; out.push(acc / TOTAL_W); } return out; })();

function activePhase(gp) {
  let i = 0; while (i < PHASES.length - 1 && gp >= PBOUND[i + 1]) i++;
  return { i, ph: PHASES[i], localT: clamp01((gp - PBOUND[i]) / (PBOUND[i + 1] - PBOUND[i] || 1)) };
}

// Resolve a scroll-position key to an absolute scrollTop for a tab's page.
const SEL = { drills: '[data-fc="projects.drillResults"]', intel: '[data-demo="proj-intel"]', mile: '[data-demo="tl-milestone"]' };
function resolveScroll(frameEl, tab, key) {
  const page = frameEl.querySelector(`[data-page="${tab}"]`);
  if (!page) return 0;
  const range = Math.max(0, page.scrollHeight - page.clientHeight);
  if (key === "top") return 0;
  if (key === "flag") return Math.min(range, 0.05 * range);
  const t = SEL[key] && page.querySelector(SEL[key]);
  if (!t) return 0;
  const offset = (t.getBoundingClientRect().top - page.getBoundingClientRect().top) + page.scrollTop; // invariant
  return Math.max(0, Math.min(range, offset - 92));
}

if (typeof window !== "undefined" && /(?:\?|&)slice/.test(window.location.search)) {
  window.__frame = (gp) => { const { ph, localT } = activePhase(gp); return { phase: ph.key, tab: ph.tab || (ph.nav ? `${ph.nav[0]}>${ph.nav[1]}` : ""), sheet: ph.sheet || null, focus: ph.focus || null, copy: ph.copy, localT: +localT.toFixed(2) }; };
}

function usePreload(active) {
  useEffect(() => {
    if (!active) return;
    let idx = 0, stop = false;
    const ric = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 200));
    const step = (deadline) => {
      while (!stop && idx < PP_ASSETS.length && (deadline.timeRemaining() > 3 || deadline.didTimeout)) { const img = new Image(); img.decoding = "async"; img.src = PP_ASSETS[idx++]; }
      if (!stop && idx < PP_ASSETS.length) ric(step);
    };
    ric(step);
    return () => { stop = true; };
  }, [active]);
}

export function ProProfileDemoStage() {
  const { mobile } = useViewport();
  const reduce = useReduce();
  if (reduce) return <StoryDemo reduced />;
  if (mobile) return <StoryDemo />;
  return <PinnedDemo />;
}

function PinnedDemo() {
  const track = useRef(null);
  const [frameEl, setFrameEl] = useState(null);
  const [demo, setDemo] = useState({ tab: "projects", sheet: null, scrub: false, nav: null, focus: null, follow: false });
  const [copy, setCopy] = useState("projects");
  const committed = useRef({ sig: "", copy: "projects" });
  usePreload(!!frameEl);

  useEffect(() => {
    if (!frameEl) return;
    const setV = (el, k, v) => el && el.style.setProperty(k, v);
    const tick = () => {
      const el = track.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const span = r.height - vh;
      const gp = span <= 0 ? 0 : clamp01(-r.top / span);
      const { ph, localT } = activePhase(gp);

      // TAB / NAV
      let tab = ph.tab, nav = null, navT = 0;
      if (ph.nav) { nav = { from: ph.nav[0], to: ph.nav[1] }; navT = easeOut(localT); tab = navT < 0.5 ? ph.nav[0] : ph.nav[1]; }

      // APP SCROLL (deterministic; direct, never smooth)
      if (ph.nav && ph.navScroll) {
        for (const t in ph.navScroll) { const p = frameEl.querySelector(`[data-page="${t}"]`); if (p) p.scrollTop = resolveScroll(frameEl, t, ph.navScroll[t]); }
      } else if (ph.scroll) {
        const page = frameEl.querySelector(`[data-page="${tab}"]`);
        if (page) page.scrollTop = mix(resolveScroll(frameEl, tab, ph.scroll[0]), resolveScroll(frameEl, tab, ph.scroll[1]), easeOut(localT));
      }

      // SHEET
      const sheet = ph.sheet || null;
      const sheetT = ph.sheetT ? clamp01(mix(ph.sheetT[0], ph.sheetT[1], easeOut(localT))) : 0;
      setV(frameEl, "--pp-sheet", sheetT.toFixed(3));
      setV(frameEl, "--pp-nav", navT.toFixed(3));

      // AI-brief-style content dwell handled in later passes (not in this slice).

      // LEFT progress + entry cue
      setV(el, "--demo-progress", gp.toFixed(4));
      setV(el, "--demo-entry", (1 - clamp01(gp / 0.02)).toFixed(3));

      // DISCRETE
      const focus = ph.focus || null;
      const navKey = nav ? `${nav.from}>${nav.to}` : "";
      const sig = `${tab}|${sheet || ""}|${sheet ? 1 : 0}|${navKey}|${focus || ""}`;
      if (sig !== committed.current.sig) { committed.current.sig = sig; setDemo({ tab, sheet, scrub: !!sheet, nav, focus, follow: false }); }
      if (ph.copy !== committed.current.copy) { committed.current.copy = ph.copy; setCopy(ph.copy); }
    };
    return subscribe(tick);
  }, [frameEl]);

  const slow = typeof window !== "undefined" && /(?:\?|&)slowDemo/.test(window.location.search) ? 2.4 : 1;
  const trackVh = Math.round(TOTAL_W * 15 * slow);

  return (
    <div ref={track} className="mx-track mx-demo" style={{ height: `${trackVh}vh`, background: MX.sheet }}>
      <style>{`.mx-demo [data-page], .mx-demo .pp-scroll { scroll-behavior: auto !important; }`}</style>
      <div className="mx-stage" style={{ background: MX.sheet }}>
        <Wrap style={{ width: "100%", position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.02fr) minmax(0,0.98fr)", gap: "clamp(40px, 5vw, 72px)", alignItems: "center" }}>
            <StoryCopy copy={copy} />
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Phone width={phoneWidth(false)}>
                <PhoneScaler onFrame={setFrameEl}>
                  <Suspense fallback={<Skeleton />}>
                    <ProProfileDemo demo={demo} frameEl={frameEl} />
                  </Suspense>
                </PhoneScaler>
              </Phone>
            </div>
          </div>
        </Wrap>
      </div>
    </div>
  );
}

function StoryCopy({ copy }) {
  const idx = COPY_ORDER.indexOf(copy);
  return (
    <div style={{ position: "relative", minHeight: 300 }}>
      {COPY_ORDER.map((k) => {
        const s = COPY[k]; const on = k === copy;
        return (
          <div key={k} aria-hidden={!on} style={{ position: k === COPY_ORDER[0] ? "relative" : "absolute", inset: k === COPY_ORDER[0] ? undefined : 0, top: 0, opacity: on ? 1 : 0, pointerEvents: on ? "auto" : "none", transition: `opacity 240ms ${EASE}` }}>
            <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.24em", transform: on ? "none" : "translateY(6px)", transition: `transform 360ms ${EASE}` }}>{s.eyebrow}</p>
            <h2 className="mx-h2" style={{ marginTop: 15, maxWidth: "15ch", transform: on ? "none" : "translateY(9px)", transition: `transform 440ms ${EASE}`, transitionDelay: on ? "40ms" : "0ms" }}>{s.head}</h2>
            <p className="mx-lead" style={{ color: MX.dim, marginTop: 16, maxWidth: "38ch", transform: on ? "none" : "translateY(9px)", transition: `opacity 380ms ${EASE}, transform 440ms ${EASE}`, transitionDelay: on ? "90ms" : "0ms" }}>{s.body}</p>
          </div>
        );
      })}
      <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.12em", color: MX.ink, fontVariantNumeric: "tabular-nums" }}>{String(idx + 1).padStart(2, "0")}</span>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", color: MX.mute }}>/ 04</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", color: MX.dim, textTransform: "uppercase" }}>{COPY[copy].eyebrow}</span>
        <span aria-hidden style={{ flex: 1, height: 2, borderRadius: 2, background: "rgba(18,22,29,0.12)", position: "relative", overflow: "hidden", marginLeft: 4 }}>
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "100%", transformOrigin: "left", transform: "scaleX(var(--demo-progress, 0))", background: MX.ink }} />
        </span>
      </div>
      <p aria-hidden style={{ marginTop: 22, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: MX.mute, opacity: "var(--demo-entry, 0)", transition: "opacity 200ms linear" }}>Scroll to explore ↓</p>
    </div>
  );
}

function Skeleton() { return <div style={{ position: "absolute", inset: 0, background: "#f4f5f7" }} />; }

/* Mobile + reduced motion — unchanged from PASS 3 (kept simple; the slice work
   targets the desktop guided demo). Shows the four slice beats. */
function StoryDemo({ reduced }) {
  const [frameEl, setFrameEl] = useState(null);
  const [demo, setDemo] = useState({ tab: "projects", sheet: null, scrub: false, nav: null, focus: null, follow: false });
  const markers = useRef([]);
  const committed = useRef("");
  usePreload(!!frameEl);
  useEffect(() => {
    if (reduced) return;
    const tick = () => {
      const trigger = window.innerHeight * 0.58;
      let active = 0;
      markers.current.forEach((el, n) => { if (el && el.getBoundingClientRect().top <= trigger) active = n; });
      const k = COPY_ORDER[active];
      const tabByCopy = { projects: "projects", drills: "projects", intel: "projects", timeline: "timeline" };
      const sig = `${tabByCopy[k]}|${active}`;
      if (sig !== committed.current) { committed.current = sig; setDemo({ tab: tabByCopy[k], sheet: null, scrub: false, nav: null, focus: null, follow: false }); }
    };
    return subscribe(tick);
  }, [frameEl, reduced]);

  const renderPhone = (width) => (
    <div style={{ display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <Phone width={width}><PhoneScaler onFrame={setFrameEl}><Suspense fallback={<Skeleton />}><ProProfileDemo demo={demo} frameEl={frameEl} /></Suspense></PhoneScaler></Phone>
    </div>
  );
  const beats = COPY_ORDER.map((k, n) => ({ n, ...COPY[k] }));

  if (reduced) {
    return (
      <div className="mx-demo" style={{ background: MX.sheet, padding: "40px 0 30px" }}>
        <style>{`.mx-demo [data-page], .mx-demo .pp-scroll { scroll-behavior: auto !important; }`}</style>
        <Wrap><div style={{ display: "grid", gap: 30, maxWidth: 640, margin: "0 auto" }}>
          <div style={{ maxWidth: 300, margin: "0 auto", width: "100%" }}>{renderPhone("min(64vw, 280px)")}</div>
          {beats.map((s) => (<div key={s.n}><p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em" }}>{String(s.n + 1).padStart(2, "0")} · {s.eyebrow}</p><h3 className="mx-h3" style={{ marginTop: 7 }}>{s.head}</h3><p className="mx-body" style={{ color: MX.dim, marginTop: 6, maxWidth: "48ch" }}>{s.body}</p></div>))}
        </div></Wrap>
      </div>
    );
  }
  return (
    <div className="mx-demo" style={{ background: MX.sheet, position: "relative" }}>
      <style>{`.mx-demo [data-page], .mx-demo .pp-scroll { scroll-behavior: auto !important; }`}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: MX.sheet, paddingTop: 10, height: "56svh", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>{renderPhone("min(48vw, 188px)")}</div>
      <div style={{ position: "relative" }}>
        {beats.map((s) => (
          <div key={s.n} ref={(el) => (markers.current[s.n] = el)} style={{ minHeight: "44svh", display: "flex", alignItems: "center", padding: "0 0 6svh" }}>
            <Wrap><div style={{ maxWidth: 460 }}><p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em" }}>{String(s.n + 1).padStart(2, "0")} · {s.eyebrow}</p><h2 className="mx-h3" style={{ marginTop: 8, maxWidth: "16ch" }}>{s.head}</h2><p className="mx-body" style={{ color: MX.dim, marginTop: 8, maxWidth: "42ch" }}>{s.body}</p></div></Wrap>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhoneScaler({ onFrame, children }) {
  const box = useRef(null);
  const [dims, setDims] = useState({ s: 1, h: 812 });
  const [el, setEl] = useState(null);
  useLayoutEffect(() => {
    const b = box.current; if (!b) return;
    const measure = () => { const w = b.clientWidth || 1, h = b.clientHeight || 1; setDims({ s: w / 375, h: (h * 375) / w }); };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(b);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { onFrame(el); }, [el, onFrame]);
  return (
    <div ref={box} style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#fff" }}>
      <div ref={setEl} style={{ position: "absolute", top: 0, left: 0, width: 375, height: dims.h, transform: `scale(${dims.s})`, transformOrigin: "top left" }}>{el && children}</div>
    </div>
  );
}
