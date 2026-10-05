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
import { flushSync } from "react-dom";
import { MX, EASE, Wrap, Phone, useViewport, useReduce, subscribe, phoneWidth } from "../system.jsx";
import { PP_ASSETS } from "./ppAssets.js";

// The screen for the ~240ms before the real app paints. It is the APP'S OWN background,
// so the hand-off is invisible rather than a contrasting slab flashing to light UI.
const BOOT_SCREEN = "#f4f5f7";


const ProProfileDemo = lazy(() => import("./ProProfileDemo.jsx"));

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const easeOut = (u) => 1 - Math.pow(1 - u, 3);

// Camera "travel" ease — ONE destination, not a tour of the passing sections:
// depart slowly, travel confidently through the middle, then a long controlled
// deceleration into a full stop. (CSS-style cubic-bezier, Newton-solved.)
function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t;
  const fy = (t) => ((ay * t + by) * t + cy) * t;
  const dfx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { let t = x; for (let i = 0; i < 6; i++) { const e = fx(t) - x; if (Math.abs(e) < 1e-4) break; const d = dfx(t) || 1e-6; t -= e / d; } return fy(t < 0 ? 0 : t > 1 ? 1 : t); };
}
const easeTravel = cubicBezier(0.5, 0.0, 0.06, 1.0);

// ── Copy (only the four slice scenes; copy follows the app) ──────────────────
const COPY = {
  projects: { eyebrow: "PROJECTS",             head: "Your projects, explorable.",        body: "Every asset with its imagery, geology and context — something an investor navigates, not a slide they skim." },
  drills:   { eyebrow: "THE DETAIL",           head: "Results with context.",             body: "The drill intercepts, one tap away — real grades and widths, in words an investor can read without opening a filing." },
  intel:    { eyebrow: "PROJECT INTELLIGENCE", head: "The technical case, organized.",     body: "Stage, targets and what sets the project apart — the depth a serious investor wants, made readable." },
  timeline: { eyebrow: "PROGRESS",             head: "Years of activity become a story.", body: "Move through the financings and milestones — then see what a single announcement actually meant." },
};
const COPY_ORDER = ["projects", "drills", "intel", "timeline"];
// During a tab-nav phase the copy is held on the departing scene, then flips to
// the arriving scene's headline at the crossfade midpoint — so the words never
// lag a screen the phone has already moved past.
const COPY_BY_TAB = { projects: "projects", timeline: "timeline" };

// ── The master timeline. w = relative scroll distance for the phase. ─────────
// scroll = [fromKey, toKey] positions of the ACTIVE tab's page (eased lerp).
// sheetT = [from, to]; focus = a target key; copy = the dominant headline.
// A nav phase gates the tab change: no scroll/sheet/focus, copy held.
// Weights are proportional to each phase's SCROLL DISTANCE, so the phone moves
// at one calm, constant speed. Big descents get big weights (room to read); tiny
// moves get small ones; holds get a comfortable fixed beat (the SETTLE in
// MOVE→SETTLE→UNDERSTAND). Measured offsets: drills≈65%, intel≈74% of an 875px
// Projects range; timeline range≈400px.
const PHASES = [
  // ── PROJECTS ──  (hold at the hero, then a calm, readable descent)
  { key: "proj.arrive",   w: 1.2, tab: "projects", scroll: ["top", "top"],       copy: "projects" },
  { key: "proj.settle",   w: 0.7, tab: "projects", scroll: ["top", "flag"],      copy: "projects" },
  // ── DRILL RESULTS ──  (long descent → focus → open → read → depart)
  { key: "drill.arrive",  w: 5.5, tab: "projects", scroll: ["flag", "drills"],   copy: "projects" },
  { key: "drill.focus",   w: 1.6, tab: "projects", scroll: ["drills", "drills"], focus: "drills", copy: "drills" },
  { key: "drill.open",    w: 2.0, tab: "projects", scroll: ["drills", "drills"], focus: "drills", sheet: "proj:drills", sheetT: [0, 1], copy: "drills" },
  { key: "drill.read",    w: 1.8, tab: "projects", scroll: ["drills", "drills"], focus: "drills", sheet: "proj:drills", sheetT: [1, 1], copy: "drills" },
  { key: "drill.close",   w: 1.8, tab: "projects", scroll: ["drills", "drills"], focus: "drills", sheet: "proj:drills", sheetT: [1, 0], copy: "drills" },
  { key: "drill.release", w: 0.9, tab: "projects", scroll: ["drills", "drills"], copy: "drills" },
  // ── PROJECT INTELLIGENCE ──  (short move → focus → read)
  { key: "intel.arrive",  w: 1.4, tab: "projects", scroll: ["drills", "intel"],  copy: "drills" },
  { key: "intel.focus",   w: 1.6, tab: "projects", scroll: ["intel", "intel"],   focus: "intel", copy: "intel" },
  { key: "intel.read",    w: 2.0, tab: "projects", scroll: ["intel", "intel"],   focus: "intel", copy: "intel" },
  // ── NAVIGATE → TIMELINE ──  (cross-dissolve; copy flips to timeline at midpoint)
  { key: "nav.timeline",  w: 2.2, nav: ["projects", "timeline"], navScroll: { projects: "intel", timeline: "top" }, copy: "intel" },
  // ── TIMELINE ──  (arrive at top → move to milestone → focus → open detail → read → hold)
  { key: "tl.arrive",     w: 1.4, tab: "timeline", scroll: ["top", "top"],       copy: "timeline" },
  { key: "tl.scroll",     w: 2.6, tab: "timeline", scroll: ["top", "mile"],      copy: "timeline" },
  { key: "tl.focus",      w: 1.6, tab: "timeline", scroll: ["mile", "mile"],     focus: "milestone", copy: "timeline" },
  { key: "tl.open",       w: 2.0, tab: "timeline", scroll: ["mile", "mile"],     focus: "milestone", sheet: "time:detail", sheetT: [0, 1], copy: "timeline" },
  { key: "tl.read",       w: 2.2, tab: "timeline", scroll: ["mile", "mile"],     sheet: "time:detail", sheetT: [1, 1], copy: "timeline" },
  { key: "tl.hold",       w: 1.6, tab: "timeline", scroll: ["mile", "mile"],     sheet: "time:detail", sheetT: [1, 1], copy: "timeline" },
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

const DIRECTED = typeof window !== "undefined" && /(?:\?|&)directedDemo/.test(window.location.search);

const RAW_AUDIT = typeof window !== "undefined" && /(?:\?|&)raw/.test(window.location.search);

export function ProProfileDemoStage() {
  const { mobile } = useViewport();
  const reduce = useReduce();
  if (RAW_AUDIT) return <RawAppView />;   // fidelity reference: real app, no demo layer
  if (reduce) return <StoryDemo reduced />;
  if (mobile) return <StoryDemo />;
  if (DIRECTED) return <DirectedDemo />;
  return <PinnedDemo />;
}

// Read-only fidelity reference — the real CompanyProfile, natural scroll & taps, in
// the identical Phone frame/scale as the directed demo. For side-by-side audit only.
function RawAppView() {
  const [frameEl, setFrameEl] = useState(null);
  usePreload(!!frameEl);
  return (
    <div className="mx-demo" style={{ position: "relative", height: "100svh", overflow: "hidden", background: MX.sheet, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Phone width={phoneWidth(false)}>
          <PhoneScaler onFrame={setFrameEl}>
            <Suspense fallback={<Skeleton />}>
              <ProProfileDemo natural frameEl={frameEl} />
            </Suspense>
          </PhoneScaler>
        </Phone>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTED DEMO (?directedDemo=1) — the real MineEx UI directing a product film.
//
// Three composed frames of the REAL Projects UI, nothing else:
//   A  PROJECTS_OVERVIEW   — canonical composition, still.
//   B  DRILL_RESULTS_FOCUS — one camera move lands the drill card, still, focus.
//   C  DRILL_RESULTS_OPEN  — the real BottomSheet rises, settles, still.
//
// The phone never moves (fixed x/y/scale). Only the stage inside it changes.
// Every continuous value (camera translate, sheet progress) is a pure function of
// page-scroll progress, written DIRECTLY with NO CSS transition — easing is baked
// into the value here, so there is no catch-up, momentum or stale scroll. Discrete
// state (focus, sheet mount) flips only at the still hold points.
// ─────────────────────────────────────────────────────────────────────────────
// ARRIVE → STOP → FOCUS → STOP → OPEN → STOP. Deliberately slow; the sheet must
// not begin opening until the focus treatment has fully settled.
const SEG = {
  holdA: [0.00, 0.24],   // still — projects overview (generous)
  pan:   [0.24, 0.44],   // ONE decisive camera reposition A → B (short — the
                         //   landing matters more than watching the journey)
  holdB: [0.44, 0.74],   // ARRIVE-stop (.44–.60, extra stillness) → FOCUS at .60
                         //   → focus-stop (.60–.74). Arrival and focus stay separate.
  rise:  [0.74, 0.90],   // real sheet 0 → 1 (opens only after focus has settled)
  holdC: [0.90, 1.00],   // still — real results
};
const FOCUS_AT = 0.60;   // focus snaps here; ~300ms settle finishes well before .74
// The whole choreography completes within the first CHOREO_END of the track; the
// remainder is a pinned buffer that HOLDS the final open-sheet state. This keeps
// the sheet-open climax away from the track boundary, where a sticky stage
// un-pins — otherwise the phone rides up out of the viewport during the open
// state. The choreography itself (SEG, camera, focus, open) is unchanged.
const CHOREO_END = 0.78;

// ── Gesture-driven snap states (desktop directed demo) ───────────────────────
// The user chooses WHEN to advance; MineEx owns HOW the transition runs. Each of
// the three stable states is a canonical choreography-progress landing point that
// sits inside a HOLD (zero-velocity), so time-tweening between them replays the
// approved motion (camera easeTravel, focus, sheet easeOut) and stops cleanly.
//   0 OVERVIEW (holdA) · 1 FOCUS (holdB, after focus, sheet closed) · 2 OPEN (holdC)
const STATE_P = [0.20, 0.72, 0.95];
const MS_PER_UNIT = 3000; // transition duration per unit of choreo-progress distance
const WHEEL_TRIGGER = 20;   // accumulated wheel delta = one deliberate gesture
const NEW_GESTURE_GAP = 90; // a pause (ms) since the last wheel event = fingers lifted = a new gesture.
                            // Inertia arrives as an unbroken stream (tiny gaps), so it never crosses this.
const FIRM_DELTA = 12;      // a real swipe drives at least one event this strong; a decaying inertia
                            // tail never does — so a momentum blip after a stray gap can't advance.

// ── FRAMES (slice 1): each is a canonical composition of the REAL MineEx UI ──
// S0 Identity (overview) → S1 Projects → S2 Drill Focus → S3 Drill Open →
// S4 Project Intelligence → S5a Timeline (The Story So Far) → S5b Milestone detail
// → S6 Capital (Fully Funded verdict) → S7 Leadership (Board & Management, single state).
// cam = a scroll key resolved per tab to a content-px camera offset (measured).
// detail = a milestone id ("2026-01-19") the Timeline resolves to open its REAL
// detail sheet — the strongest discovery milestone (financing is reserved for S6).
const FRAMES = [
  { id: "identity",   tab: "overview", cam: "top" },
  { id: "projects",   tab: "projects", cam: "top" },
  { id: "drillFocus", tab: "projects", cam: "drills", focus: "drills" },
  { id: "drillOpen",  tab: "projects", cam: "drills", focus: "drills", sheet: "proj:drills" },
  { id: "intel",      tab: "projects", cam: "intel",  focus: "intel",  sheet: "proj:unique" },
  { id: "timeline",   tab: "timeline", cam: "top" },
  { id: "milestone",  tab: "timeline", cam: "top",    sheet: "time:detail", detail: "2026-01-19" },
  { id: "capital",    tab: "capital",  cam: "top" },   // S6 — Fully Funded verdict; no scroll, no sheet
  { id: "team",       tab: "team",     cam: "top" },   // S7 — Board & Management; CEO leads naturally, no sheet
  { id: "brief",      tab: "overview", cam: "top",     sheet: "brief" },   // S8 — AI Brief opened over Overview
];
const CAM_SEL = { drills: '[data-fc="projects.drillResults"]', intel: '[data-demo="proj-intel"]' };
const CAM_MARGIN = { drills: 0.24, intel: 0.34 }; // fraction of the viewport the target sits from the top
// Surfaces mounted persistently (in tab order). Each keeps its own vertical camera
// (--pp-cam-<tab>); the filmstrip index drives horizontal position (--pp-tabx).
// Every native entrance (pp-view, CapitalView's Funding Runway tween) plays once
// here at load, off-stage, so each surface is fully settled before it enters.
const MOUNT_TABS = ["overview", "projects", "timeline", "capital", "team"];
const TABX = Object.fromEntries(MOUNT_TABS.map((t, i) => [t, i]));
const seg = (p, [a, b], ease) => { if (p <= a) return 0; if (p >= b) return 1; const t = (p - a) / (b - a); return ease ? ease(t) : t; };

// Per-frame instrumentation (?instrument=1). Logs the phone shell + sticky stage
// every animation frame and captures the FIRST frame the shell's screen-Y moves,
// with a diff of what changed. Read window.__phoneBug / window.__phoneLog.
function usePhoneInstrument(active) {
  useEffect(() => {
    if (!active) return;
    const log = []; window.__phoneLog = log; window.__phoneBug = null;
    let baseline = null, found = false, raf = 0;
    const tf = (el) => { const t = getComputedStyle(el).transform; return t === "none" ? "" : t; };
    const snap = () => {
      const track = document.querySelector(".mx-track"), stage = document.querySelector(".mx-stage"),
            phone = document.querySelector(".mx-phone"), page = document.querySelector('[data-page="projects"]');
      if (!track || !stage || !phone) return null;
      const tr = track.getBoundingClientRect(), st = stage.getBoundingClientRect(), ph = phone.getBoundingClientRect();
      const span = tr.height - innerHeight, rawP = span <= 0 ? 0 : clamp01(-tr.top / span);
      const anc = []; let el = phone;
      while (el && el !== document.documentElement) { const t = tf(el); if (t) anc.push({ el: el.className ? "." + String(el.className).split(" ")[0] : el.tagName, t }); el = el.parentElement; }
      return {
        scrollY: Math.round(scrollY),
        trackTop: +tr.top.toFixed(1), trackBottom: +tr.bottom.toFixed(1),
        stageTop: +st.top.toFixed(1), stageBottom: +st.bottom.toFixed(1), stagePos: getComputedStyle(stage).position,
        phoneTop: +ph.top.toFixed(1), phoneBottom: +ph.bottom.toFixed(1), phonePos: getComputedStyle(phone).position,
        rawP: +rawP.toFixed(4), choreoP: +clamp01(rawP / CHOREO_END).toFixed(4),
        cam: (page && getComputedStyle(page).getPropertyValue("--pp-camera").trim()) || "",
        sheet: (page && getComputedStyle(page).getPropertyValue("--pp-sheet").trim()) || "",
        ancestorTransforms: anc,
      };
    };
    const loop = () => {
      const s = snap();
      if (s) {
        log.push(s); if (log.length > 800) log.shift();
        if (baseline == null && s.scrollY < 4) baseline = s.phoneTop;
        if (!found && baseline != null && Math.abs(s.phoneTop - baseline) > 1) {
          found = true;
          const prev = log[log.length - 2] || null;
          const changed = prev ? Object.keys(s).filter((k) => JSON.stringify(s[k]) !== JSON.stringify(prev[k])) : [];
          window.__phoneBug = { baseline, deltaY: +(s.phoneTop - baseline).toFixed(1), changedSincePrevFrame: changed, frame: s, prevFrame: prev };
          console.warn("[PHONE-BUG] shell moved", baseline, "->", s.phoneTop, "changed:", changed, window.__phoneBug);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    console.log("[PHONE-INSTRUMENT] armed — scroll the demo; read window.__phoneBug");
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

function DirectedDemo() {
  const track = useRef(null);
  const [frameEl, setFrameEl] = useState(null);
  const [demo, setDemo] = useState({ tab: "overview", camera: true, mountTabs: MOUNT_TABS, sheet: null, scrub: false, focus: null, follow: false });
  const [stateIdx, setStateIdx] = useState(0);   // current stable state (drives the indicator)
  const [engaged, setEngaged] = useState(false);  // dismisses the gesture hint after first advance
  usePreload(!!frameEl);
  usePhoneInstrument(typeof window !== "undefined" && /(?:\?|&)instrument/.test(window.location.search));

  useEffect(() => {
    if (!frameEl) return;
    const setV = (k, v) => frameEl.style.setProperty(k, v);

    // Measure the projects-page camera targets (drill card, "What Sets This Apart").
    // getBoundingClientRect is SCALED screen px (PhoneScaler shrinks 375→pane); the
    // --pp-camera translate is UNSCALED content px, so convert through the scale.
    const cam = { drills: 0, intel: 0, scrollMax: 0 };
    const measure = () => {
      const page = frameEl.querySelector('[data-page="projects"]');
      const wrap = page && page.querySelector('[data-camera]');
      if (!page || !wrap) return;
      const rect = page.getBoundingClientRect();
      const s = rect.height / (page.clientHeight || 1) || 1;
      const wrapTop = wrap.getBoundingClientRect().top;
      // The real scroll range: content height − viewport. A camera beyond this would
      // over-scroll past the content end — a composition the real app can't reach.
      const scrollMax = Math.max(0, Math.round(wrap.getBoundingClientRect().height / s - page.clientHeight));
      if (scrollMax > 0) cam.scrollMax = scrollMax;
      for (const k in CAM_SEL) {
        const el = page.querySelector(CAM_SEL[k]);
        if (!el) continue;
        const top = (el.getBoundingClientRect().top - wrapTop) / s;
        const v = Math.max(0, Math.round(top - page.clientHeight * CAM_MARGIN[k]));
        if (v > 0) cam[k] = Math.min(v, cam.scrollMax || v);   // clamp to an authentic scroll position
      }
    };
    const camPx = (fr) => { const k = fr.cam; if (!k || k === "top") return 0; measure(); return cam[k] || 0; };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(frameEl);

    // Commit the discrete state (tab / focus / mounted sheet) only on change.
    // mountTabs is constant, so surfaces never mount/unmount during transitions.
    const commitSig = { v: "" };
    const commit = (d) => {
      const sig = `${d.tab}|${d.focus || ""}|${d.sheet || ""}|${d.detail || ""}`;
      if (sig === commitSig.v) return; commitSig.v = sig;
      setDemo({ tab: d.tab, camera: true, mountTabs: MOUNT_TABS, focus: d.focus || null, sheet: d.sheet || null, detail: d.detail || null, scrub: !!d.sheet, follow: false });
    };
    // Snap to a settled frame (landing / initial).
    const applyStatic = (fr) => {
      measure();
      setV("--pp-tabx", (TABX[fr.tab] ?? 0).toFixed(3));
      setV("--pp-cam-overview", "0");
      setV("--pp-cam-projects", (fr.tab === "projects" ? camPx(fr) : 0).toFixed(1));
      setV("--pp-cam-timeline", "0");   // timeline's authentic rest is its top ("The Story So Far")
      setV("--pp-cam-capital", "0");    // capital's authentic rest is its top (Fully Funded verdict)
      setV("--pp-cam-team", "0");       // team's authentic rest is its top (Board & Management)
      setV("--pp-xfade", "1");          // page content fully opaque at rest (raw-app fidelity)
      setV("--pp-sheet", fr.sheet ? "1" : "0");
      commit({ tab: fr.tab, focus: fr.focus, sheet: fr.sheet, detail: fr.detail });
    };
    // The ONE directed transition from frame `fromI` to `toI` at progress t∈[0,1].
    const applyT = (fromI, toI, t) => {
      measure();
      setV("--pp-xfade", "1");   // opaque by default; only the non-adjacent JUMP dips it
      const f = FRAMES[fromI], g = FRAMES[toI];
      if (f.tab !== g.tab) {
        // ── Cross-tab (horizontal filmstrip) — both surfaces already mounted &
        // pp-view-settled. Cameras stay put; only --pp-tabx and, when a chapter's
        // final/first state owns a sheet, --pp-sheet move.
        setV("--pp-cam-overview", "0");
        setV("--pp-cam-timeline", "0");
        setV("--pp-cam-capital", "0");
        setV("--pp-cam-team", "0");
        // The projects surface keeps whichever projects-frame is in play so it is
        // already at its authentic scroll position as it slides on/off.
        const projFrame = g.tab === "projects" ? g : (f.tab === "projects" ? f : null);
        setV("--pp-cam-projects", (projFrame ? camPx(projFrame) : 0).toFixed(1));
        const travel = (a, b, u) => setV("--pp-tabx", mix(TABX[a], TABX[b], easeTravel(u)).toFixed(3));
        const fS = f.sheet || null, gS = g.sheet || null;

        // ── NON-ADJACENT tab jump (e.g. Team → Overview) — model the real tab-bar
        // TAP, not a slide through the intermediate tabs. A brief content crossfade
        // (--pp-xfade dip): fade the page content out, snap --pp-tabx at the INVISIBLE
        // trough so no intermediate tab is ever seen, fade in. No remount, no pp-view
        // replay — only the tab-bar highlight (outside the viewport) switches, exactly
        // like a real tap. Cross-tab sheet open/close stays fully separated from the
        // jump: forward = JUMP → settled beat → OPEN; reverse = CLOSE → beat → JUMP.
        if (Math.abs((TABX[f.tab] ?? 0) - (TABX[g.tab] ?? 0)) > 1) {
          const jump = (srcTab, dstTab, u) => {
            if (u < 0.5) { setV("--pp-xfade", (1 - u / 0.5).toFixed(3)); setV("--pp-tabx", TABX[srcTab].toFixed(3)); }
            else { setV("--pp-tabx", TABX[dstTab].toFixed(3)); setV("--pp-xfade", clamp01((u - 0.5) / 0.5).toFixed(3)); }
          };
          if (!fS && gS) {                       // FORWARD: jump home, settle, then raise the sheet
            const JUMP = 0.42, BEAT = 0.60;      // jump [0,.42] · settled-Overview beat [.42,.60] · open [.60,1]
            if (t < JUMP) {
              jump(f.tab, g.tab, t / JUMP);
              setV("--pp-sheet", "0");
              commit({ tab: t < JUMP / 2 ? f.tab : g.tab, focus: null, sheet: null });
            } else if (t < BEAT) {
              setV("--pp-tabx", TABX[g.tab].toFixed(3));
              setV("--pp-sheet", "0");
              commit({ tab: g.tab, focus: null, sheet: null });   // Overview settled; AI Brief card visible
            } else {
              setV("--pp-tabx", TABX[g.tab].toFixed(3));
              setV("--pp-sheet", easeOut(clamp01((t - BEAT) / (1 - BEAT))).toFixed(3));
              commit({ tab: g.tab, focus: g.focus, sheet: gS, detail: g.detail });
            }
            return;
          }
          if (fS && !gS) {                       // REVERSE: close the sheet, settle, then jump back
            const CLOSE = 0.24, BEAT = 0.40;     // close [0,.24] · settled-Overview beat [.24,.40] · jump [.40,1]
            if (t < CLOSE) {
              setV("--pp-tabx", TABX[f.tab].toFixed(3));
              setV("--pp-sheet", (1 - easeOut(t / CLOSE)).toFixed(3));
              commit({ tab: f.tab, focus: null, sheet: fS, detail: f.detail });
            } else if (t < BEAT) {
              setV("--pp-tabx", TABX[f.tab].toFixed(3));
              setV("--pp-sheet", "0");
              commit({ tab: f.tab, focus: null, sheet: null });   // clean Overview settled
            } else {
              const u = (t - BEAT) / (1 - BEAT);
              jump(f.tab, g.tab, u);
              setV("--pp-sheet", "0");
              commit({ tab: u < 0.5 ? f.tab : g.tab, focus: null, sheet: null });
            }
            return;
          }
          // non-adjacent, no sheet either side: a pure crossfade jump.
          jump(f.tab, g.tab, t);
          setV("--pp-sheet", "0");
          commit({ tab: t < 0.5 ? f.tab : g.tab, focus: null, sheet: null });
          return;
        }

        // REUSABLE PRIMITIVE — never a frame where one surface/sheet appears while
        // another is still leaving. Leaving a chapter whose final state has a sheet:
        // CLOSE the sheet fully → a clean, settled beat of the underlying surface →
        // THEN travel to the next tab. Arriving at a chapter whose first state has a
        // sheet is the mirror: travel → settled beat → OPEN the sheet.
        if (fS && !gS) {
          const CLOSE = 0.24, BEAT = 0.40;   // close [0,.24] · underlying-surface beat [.24,.40] · travel [.40,1]
          if (t < CLOSE) {
            setV("--pp-tabx", TABX[f.tab].toFixed(3));
            setV("--pp-sheet", (1 - easeOut(t / CLOSE)).toFixed(3));
            commit({ tab: f.tab, focus: null, sheet: fS, detail: f.detail });
          } else if (t < BEAT) {
            setV("--pp-tabx", TABX[f.tab].toFixed(3));
            setV("--pp-sheet", "0");
            commit({ tab: f.tab, focus: null, sheet: null });   // clean underlying surface, settled
          } else {
            travel(f.tab, g.tab, (t - BEAT) / (1 - BEAT));
            setV("--pp-sheet", "0");
            commit({ tab: g.tab, focus: null, sheet: null });
          }
          return;
        }
        if (!fS && gS) {
          const TRAVEL = 0.58, BEAT = 0.74;   // travel [0,.58] · settled beat [.58,.74] · open [.74,1]
          if (t < TRAVEL) {
            travel(f.tab, g.tab, t / TRAVEL);
            setV("--pp-sheet", "0");
            commit({ tab: g.tab, focus: null, sheet: null });
          } else if (t < BEAT) {
            setV("--pp-tabx", TABX[g.tab].toFixed(3));
            setV("--pp-sheet", "0");
            commit({ tab: g.tab, focus: null, sheet: null });   // arrived, settled, before the sheet rises
          } else {
            setV("--pp-tabx", TABX[g.tab].toFixed(3));
            setV("--pp-sheet", easeOut(clamp01((t - BEAT) / (1 - BEAT))).toFixed(3));
            commit({ tab: g.tab, focus: g.focus, sheet: gS, detail: g.detail });
          }
          return;
        }
        // plain cross-tab (neither side owns a sheet): one confident translate.
        travel(f.tab, g.tab, t);
        setV("--pp-sheet", "0");
        commit({ tab: g.tab, focus: null, sheet: null });
        return;
      }
      setV("--pp-tabx", (TABX[g.tab] ?? 0).toFixed(3));
      setV("--pp-cam-overview", "0");
      setV("--pp-cam-timeline", "0");
      setV("--pp-cam-capital", "0");
      setV("--pp-cam-team", "0");
      const cf = camPx(f), cg = camPx(g), moving = cf !== cg;
      const fS = f.sheet || null, gS = g.sheet || null;
      const swap = fS && gS && fS !== gS, closing = fS && !gS, opening = !fS && gS;
      let sheetV, mounted, camU;
      if (swap) {
        // CLOSE the outgoing sheet COMPLETELY → a short beat of the settled Projects
        // screen (scrim gone, both sheets off-stage) → OPEN the incoming sheet.
        // Close and open never overlap; the switch happens off-stage mid-beat.
        const CLOSE = 0.26, OPEN = 0.48;   // close [0,.26] · settle [.26,.48] · open [.48,.84] · hold [.84,1]
        if (t < CLOSE) { sheetV = 1 - easeOut(t / CLOSE); mounted = fS; }
        else if (t < OPEN) { sheetV = 0; mounted = t < (CLOSE + OPEN) / 2 ? fS : gS; }
        else { sheetV = easeOut(clamp01((t - OPEN) / 0.36)); mounted = gS; }
        camU = moving ? clamp01((t - CLOSE) / 0.50) : 1;
      } else if (closing) {
        sheetV = 1 - easeOut(clamp01(t / 0.30)); mounted = t < 0.98 ? fS : null;
        camU = moving ? clamp01((t - 0.30) / 0.44) : 1;
      } else if (opening) {                          // (move, if any) then rise
        camU = moving ? clamp01(t / 0.55) : 1;
        const o0 = moving ? 0.55 : 0.12;
        sheetV = easeOut(clamp01((t - o0) / (0.95 - o0))); mounted = t >= 0.03 ? gS : null;
      } else {
        sheetV = gS ? 1 : 0; mounted = gS;
        camU = moving ? clamp01(t / 0.60) : 1;
      }
      setV("--pp-cam-projects", mix(cf, cg, easeTravel(camU)).toFixed(1));
      setV("--pp-sheet", clamp01(sheetV).toFixed(3));
      // focus: unchanged stays constant; turning off leaves early; turning on lands
      // only after the move/close/open has settled (ARRIVE → STOP → FOCUS).
      const settleT = (swap || closing || moving) ? 0.82 : 0.45;
      const focus = f.focus === g.focus ? g.focus
        : g.focus == null ? (t >= 0.12 ? null : f.focus)
        : (t >= settleT ? g.focus : null);
      // Carry the milestone id of whichever sheet is currently mounted, so the real
      // Timeline opens the SAME detail a manual tap would (inert for projects sheets).
      const detail = mounted === gS ? (g.detail || null) : mounted === fS ? (f.detail || null) : null;
      commit({ tab: g.tab, focus, sheet: mounted, detail });
    };
    const durationOf = (fromI, toI) => {
      const f = FRAMES[fromI], g = FRAMES[toI];
      if (f.tab !== g.tab) {
        const fS = f.sheet || null, gS = g.sheet || null;
        const nonAdjacent = Math.abs((TABX[f.tab] ?? 0) - (TABX[g.tab] ?? 0)) > 1;
        // non-adjacent jump + sheet: crossfade home (~450) · settled beat (~330) · open (~600).
        if (nonAdjacent && (fS || gS)) return 2050;
        if (nonAdjacent) return 900;                 // bare crossfade jump — brisk
        // close/open + settled beat + travel needs room to read as three moves.
        if ((fS && !gS) || (!fS && gS)) return 1950;
        return 1050;
      }
      const moving = camPx(f) !== camPx(g);
      const fS = f.sheet || null, gS = g.sheet || null;
      const swap = fS && gS && fS !== gS, changing = fS !== gS;
      if (swap) return 1500;   // close (~390ms) · settle beat (~330ms) · open (~510ms) · hold
      if (moving && changing) return 1700;
      if (moving) return 1500;
      if (changing) return 800;
      return 700;
    };

    // ── Gesture-driven snap-state machine (approved primitive — unchanged) ────
    applyStatic(FRAMES[0]);            // land on S0 Identity

    let cur = 0, animating = false;
    let rafId = 0, accum = 0, accumDir = 0, lastWheel = 0, streamUsed = false, streamPeak = 0;

    const run = (to) => {
      animating = true;
      const from = cur;
      const dur = durationOf(from, to);
      const t0 = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        applyT(from, to, t);
        // ── per-frame transition instrument (diagnosis only) ──
        try {
          const L = (window.__tlog = window.__tlog || []);
          const pages = [...frameEl.querySelectorAll("[data-page]")].map((p) => p.getAttribute("data-page"));
          const projPage = frameEl.querySelector('[data-page="projects"]');
          const ovPage = frameEl.querySelector('[data-page="overview"]');
          const projInner = projPage && projPage.querySelector("[data-camera]") && projPage.querySelector("[data-camera]").firstElementChild;
          const ovInner = ovPage && ovPage.querySelector("[data-camera]") && ovPage.querySelector("[data-camera]").firstElementChild;
          const cs = (el) => (el ? getComputedStyle(el) : null);
          // Which sheet is on screen, read from the demo's own frame state (stable) rather
          // than by scanning sheet text — the text scan broke when canonical drill data
          // replaced the old hardcoded row labels. proj:drills = Exploration Results;
          // proj:unique = What Sets This Project Apart; any other sheet id = "other"; none = null.
          const activeSheet = (FRAMES[to] && FRAMES[to].sheet) || (FRAMES[from] && FRAMES[from].sheet) || null;
          const sheetTxt = activeSheet === "proj:drills" ? "drill" : activeSheet === "proj:unique" ? "synthesis" : activeSheet ? "other" : null;
          L.push({
            ms: Math.round(now - t0), from, to, t: +t.toFixed(3),
            tabx: frameEl.style.getPropertyValue("--pp-tabx"),
            camProj: frameEl.style.getPropertyValue("--pp-cam-projects"),
            sheetVar: frameEl.style.getPropertyValue("--pp-sheet"),
            pages,
            projOpacity: cs(projInner) ? +(+cs(projInner).opacity).toFixed(3) : null,
            projPPView: cs(projInner) ? cs(projInner).animationName : null,
            projXform: projPage ? cs(projPage).transform : null,       // the directed slide (translateX)
            ovOpacity: cs(ovInner) ? +(+cs(ovInner).opacity).toFixed(3) : null,
            ovPPView: cs(ovInner) ? cs(ovInner).animationName : null,
            sheet: sheetTxt, committed: commitSig.v,
          });
          if (L.length > 3000) L.shift();
        } catch (_) {}
        if (t < 1) { rafId = requestAnimationFrame(frame); }
        else { cur = to; applyStatic(FRAMES[to]); setStateIdx(to); animating = false; }  // clean landing; ready instantly
      };
      rafId = requestAnimationFrame(frame);
    };

    const glog = []; if (typeof window !== "undefined") window.__glog = glog;
    const onWheel = (e) => {
      e.preventDefault();                       // this prototype does not scroll
      const now = performance.now();
      const gap = now - lastWheel;
      // A pause since the last wheel event means fingers lifted → a NEW gesture:
      // reset the accumulator and clear "used". Residual inertia is an unbroken
      // stream (gaps < NEW_GESTURE_GAP), so it stays the SAME, already-used gesture.
      // A firm event in the OPPOSITE direction is unambiguously a new deliberate
      // gesture — inertia is monotonic and never reverses sign — so it starts a new
      // gesture even without a pause. This is what lets a reverse swipe interrupt
      // the tail of the forward swipe that just opened the sheet.
      const reversed = accumDir !== 0 && Math.sign(e.deltaY) === -accumDir && Math.abs(e.deltaY) >= FIRM_DELTA;
      const newGesture = gap > NEW_GESTURE_GAP || reversed;
      if (newGesture) { accum = 0; accumDir = Math.sign(e.deltaY); streamUsed = false; streamPeak = 0; }
      lastWheel = now;
      streamPeak = Math.max(streamPeak, Math.abs(e.deltaY));

      let to = null, blocked = null;
      if (animating) blocked = "animating";                       // the transition owns the screen
      else if (streamUsed) blocked = "used";                       // gesture already produced its one change
      else {
        const d = e.deltaY;
        if (Math.sign(d) !== accumDir) { accum = 0; accumDir = Math.sign(d); }
        accum += d;
        if (Math.abs(accum) < WHEEL_TRIGGER) blocked = "accum";
        else if (streamPeak < FIRM_DELTA) blocked = "peak";        // weak inertia tail, not a firm swipe
        else {
          const dir = accum > 0 ? 1 : -1;                          // forward swipe (fingers up / wheel down) advances
          streamUsed = true; accum = 0;
          const t = Math.max(0, Math.min(FRAMES.length - 1, cur + dir));
          if (t === cur) blocked = "clamped"; else { setEngaged(true); to = t; run(t); }
        }
      }
      glog.push({ dy: Math.round(e.deltaY), gap: Math.round(gap), newG: newGesture, accum: Math.round(accum), dir: accumDir, peak: Math.round(streamPeak), used: streamUsed, anim: animating, cur, to, blocked, tgt: (e.target && (e.target.getAttribute && e.target.getAttribute("data-page"))) || (e.target && e.target.className && String(e.target.className).slice(0, 18)) || (e.target && e.target.tagName) });
      if (glog.length > 400) glog.shift();
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.__demoGo = (to) => { if (!animating) run(Math.max(0, Math.min(FRAMES.length - 1, to))); };                          // animate to a frame (debug)
    window.__snap = (i) => { flushSync(() => { i = Math.max(0, Math.min(FRAMES.length - 1, i)); cur = i; applyStatic(FRAMES[i]); setStateIdx(i); }); }; // jump to a frame (debug)
    window.__applyAt = (a, b, t) => { flushSync(() => applyT(a, b, clamp01(t))); }; // force a transition point synchronously (debug, rAF-independent)

    return () => { window.removeEventListener("wheel", onWheel); cancelAnimationFrame(rafId); ro.disconnect(); };
  }, [frameEl]);

  // No scroll: a single viewport-height stage, phone centred and physically fixed.
  return (
    <div ref={track} className="mx-demo" style={{ position: "relative", height: "100svh", overflow: "hidden", background: MX.sheet, display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}>
      <style>{`.mx-demo [data-page], .mx-demo .pp-scroll { scroll-behavior: auto !important; }`}</style>
      <StateDots idx={stateIdx} total={FRAMES.length} />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Phone width={phoneWidth(false)}>
          <PhoneScaler onFrame={setFrameEl}>
            <Suspense fallback={<Skeleton />}>
              <ProProfileDemo demo={demo} frameEl={frameEl} />
            </Suspense>
          </PhoneScaler>
        </Phone>
      </div>
      <GestureHint show={!engaged} />
    </div>
  );
}

// Three-state position indicator (replaces the scroll rail — there is no scroll).
function StateDots({ idx, total }) {
  return (
    <div aria-hidden style={{ position: "absolute", top: "50%", right: "clamp(14px, 3vw, 34px)", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: 99, background: i === idx ? MX.ink : "rgba(18,22,29,0.16)", transform: i === idx ? "scale(1.15)" : "scale(1)", transition: "background 300ms ease, transform 300ms ease" }} />
      ))}
    </div>
  );
}

function GestureHint({ show }) {
  return (
    <p aria-hidden style={{ position: "absolute", bottom: "clamp(20px, 4vh, 40px)", left: "50%", transform: "translateX(-50%)", margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: MX.mute, opacity: show ? 1 : 0, transition: "opacity 400ms ease", pointerEvents: "none" }}>
      Swipe to explore
    </p>
  );
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

    // The ONE authoritative application of a global progress → frame. Called by
    // the scroll tick, and (in ?slice) by the __applyGp debug hook.
    const apply = (gp) => {
      const el = track.current; if (!el) return;
      const { ph, localT } = activePhase(gp);

      // TAB / NAV
      let tab = ph.tab, nav = null, navT = 0;
      if (ph.nav) { nav = { from: ph.nav[0], to: ph.nav[1] }; navT = easeOut(localT); tab = navT < 0.5 ? ph.nav[0] : ph.nav[1]; }

      // APP SCROLL (deterministic; direct, never smooth)
      if (ph.nav && ph.navScroll) {
        for (const t in ph.navScroll) { const p = frameEl.querySelector(`[data-page="${t}"]`); if (p) p.scrollTop = resolveScroll(frameEl, t, ph.navScroll[t]); }
      } else if (ph.scroll) {
        // ease-in-out so a long descent accelerates and decelerates smoothly
        // (camera-pan feel) instead of easeOut dumping the motion up front.
        const page = frameEl.querySelector(`[data-page="${tab}"]`);
        if (page) page.scrollTop = mix(resolveScroll(frameEl, tab, ph.scroll[0]), resolveScroll(frameEl, tab, ph.scroll[1]), easeInOut(localT));
      }

      // SHEET
      const sheet = ph.sheet || null;
      const sheetT = ph.sheetT ? clamp01(mix(ph.sheetT[0], ph.sheetT[1], easeOut(localT))) : 0;
      setV(frameEl, "--pp-sheet", sheetT.toFixed(3));
      setV(frameEl, "--pp-nav", navT.toFixed(3));

      // LEFT progress + entry cue
      setV(el, "--demo-progress", gp.toFixed(4));
      setV(el, "--demo-entry", (1 - clamp01(gp / 0.02)).toFixed(3));

      // DISCRETE
      const focus = ph.focus || null;
      const navKey = nav ? `${nav.from}>${nav.to}` : "";
      const sig = `${tab}|${sheet || ""}|${sheet ? 1 : 0}|${navKey}|${focus || ""}`;
      if (sig !== committed.current.sig) { committed.current.sig = sig; setDemo({ tab, sheet, scrub: !!sheet, nav, focus, follow: false }); }
      const copyKey = (ph.nav && navT >= 0.45) ? (COPY_BY_TAB[ph.nav[1]] || ph.copy) : ph.copy;
      if (copyKey !== committed.current.copy) { committed.current.copy = copyKey; setCopy(copyKey); }
    };

    const tick = () => {
      const el = track.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const span = r.height - vh;
      apply(span <= 0 ? 0 : clamp01(-r.top / span));
    };

    // Debug: force any point in the choreography synchronously (state committed
    // via flushSync so a screenshot reflects it even when rAF is throttled).
    // Call twice for a nav point so page-2's scrollTop lands on the committed DOM.
    if (typeof window !== "undefined" && /(?:\?|&)slice/.test(window.location.search)) {
      window.__applyGp = (gp) => { flushSync(() => apply(clamp01(gp))); };
    }

    return subscribe(tick);
  }, [frameEl]);

  const slow = typeof window !== "undefined" && /(?:\?|&)slowDemo/.test(window.location.search) ? 2.4 : 1;
  const trackVh = Math.round(TOTAL_W * 15 * slow);

  return (
    <div ref={track} className="mx-track mx-demo" style={{ height: `${trackVh}vh`, background: MX.sheet }}>
      <style>{`.mx-demo [data-page], .mx-demo .pp-scroll { scroll-behavior: auto !important; }`}</style>
      <div className="mx-stage" style={{ background: MX.sheet }}>
        <ScrollRail />
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

function Skeleton() { return <div style={{ position: "absolute", inset: 0, background: BOOT_SCREEN }} />; }

// A subtle scroll-position indicator on the side of the stage, so the viewer can
// tell this is a scroll-driven walkthrough and where they are in it. Purely a
// readout of --demo-progress (the window scroll fraction) — it drives nothing.
function ScrollRail() {
  const RAIL = "min(48svh, 380px)";      // rail length
  const THUMB = 20;                       // thumb length, % of rail
  return (
    <div aria-hidden style={{ position: "absolute", top: "50%", right: "clamp(10px, 2.2vw, 26px)", transform: "translateY(-50%)", height: RAIL, width: 3, borderRadius: 3, background: "rgba(18,22,29,0.09)", zIndex: 3 }}>
      <div style={{ position: "absolute", left: 0, right: 0, height: `${THUMB}%`, borderRadius: 3, background: "rgba(18,22,29,0.55)", top: `calc(var(--demo-progress, 0) * ${100 - THUMB}%)` }} />
    </div>
  );
}

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
