// ─────────────────────────────────────────────────────────────────────────────
// PRO PROFILE DEMO STAGE — the 12-scene performance (PASS 3: refinement).
//
// ONE sticky stage, ONE persistent CompanyProfile. A pure director maps global
// scroll progress → discrete state (tab / sheet / nav / follow, set in React only
// on change) and continuous progress (nav slide, sheet rise, per-tab internal
// scroll, brief/timeline dwell — all written as CSS vars / scrollTop off the
// shared rAF tick, never through React).
//
// Architecture, 12-scene sequence and 882vh pacing are LOCKED. PASS 3 refines:
// editorial left-column typography + a restrained "NN / 12 · LABEL" progress,
// staggered copy transitions, dwell timing on AI-Brief and Timeline, motion
// curves, asset preloading, an invisible lazy skeleton, an entry cue, a mobile-
// native story and a coherent reduced-motion version.
// ─────────────────────────────────────────────────────────────────────────────
import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MX, EASE, Wrap, Phone, useViewport, useReduce, subscribe, phoneWidth, ramp } from "../system.jsx";
import { PP_ASSETS } from "./ppAssets.js";

const ProProfileDemo = lazy(() => import("./ProProfileDemo.jsx"));

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
// Keyframed value with eased dwells between control points [[t,v],...] (t ascending).
function keyframe(t, pts) {
  if (t <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, va] = pts[i], [b, vb] = pts[i + 1];
    if (t >= a && t <= b) return va + (vb - va) * easeInOut((t - a) / (b - a || 1));
  }
  return last[1];
}

// ── The 12 scenes ────────────────────────────────────────────────────────────
const SCENES = [
  { key: "profile",   tab: "overview", w: 3, scrollTo: 0.00, eyebrow: "YOUR PRO PROFILE",     head: "Your company, as a living profile.",  body: "Everything an investor needs to understand you — in one place they come back to, not a one-pager that goes stale the day you send it." },
  { key: "snapshot",  tab: "overview", w: 2, scrollTo: 0.52, eyebrow: "AT A GLANCE",          head: "Understood in seconds.",              body: "Commodity, jurisdiction, stage and flagship — what an investor decides on first, before they scroll." },
  { key: "projects",  tab: "projects", w: 3, scrollTo: 0.06, eyebrow: "PROJECTS",             head: "Your projects, explorable.",          body: "Every asset with its imagery, geology and context — something an investor navigates, not a slide they skim." },
  { key: "drills",    tab: "projects", w: 6, scrollTo: 0.42, eyebrow: "THE DETAIL",           head: "Results with context.",               body: "The drill intercepts, one tap away — real grades and widths, in words an investor can read without opening a filing.", sheet: "proj:drills", kind: "sheet" },
  { key: "intel",     tab: "projects", w: 3, scrollTo: 0.80, eyebrow: "PROJECT INTELLIGENCE", head: "The technical case, organized.",      body: "Stage, targets and what sets the project apart — the depth a serious investor wants, made readable." },
  { key: "timeline",  tab: "timeline", w: 6, scrollTo: 0.55, eyebrow: "PROGRESS",             head: "Years of activity become a story.",   body: "Move through the financings, drilling and milestones — then see what a single announcement actually meant.", sheet: "time:detail", kind: "late", scrollKeys: [[0, 0], [0.2, 0.28], [0.3, 0.28], [0.46, 0.55], [0.55, 0.55]] },
  { key: "capital",   tab: "capital",  w: 2, scrollTo: 0.20, eyebrow: "CAPITAL",              head: "The numbers, made clear.",            body: "Funding position, structure and listings in one view — the questions that stall a conversation, answered up front." },
  { key: "leadership",tab: "team",     w: 2, scrollTo: 0.42, eyebrow: "LEADERSHIP",           head: "The people behind it.",               body: "Experience and track record, front and centre — investors back the team as much as the rock." },
  { key: "updates",   tab: "updates",  w: 3, scrollTo: 0.10, eyebrow: "UPDATES",              head: "Stay in front of investors.",         body: "Field updates, photos and video keep followers current — you stay present between the big announcements." },
  { key: "brief",     tab: "updates",  w: 6, scrollTo: 0.24, scrollDur: 0.2, eyebrow: "AI BRIEF", head: "Turn disclosure into understanding.", body: "An investor lands on your latest update — and MineEx distills the company into clear context: what happened, and why it matters, in a minute.", sheet: "brief", kind: "sheet", contentKeys: [[0.46, 0], [0.56, 0.34], [0.64, 0.34], [0.74, 0.74], [0.82, 0.74]] },
  { key: "media",     tab: "updates",  w: 3, scrollTo: 0.30, scrollDur: 0.22, eyebrow: "MEDIA",   head: "Bring the company to life.",          body: "Footage and imagery open full-screen, beside the numbers — the story your data can't tell alone.", sheet: "media:viewer", kind: "viewer" },
  { key: "follow",    tab: "updates",  w: 3, scrollTo: 0.00, eyebrow: "STAY CONNECTED",       head: "Attention becomes a relationship.",   body: "One tap and they're following you — every update brings them back. The connection outlasts the meeting.", follow: true },
];

const TOTAL_W = SCENES.reduce((a, s) => a + s.w, 0);
(() => { let acc = 0; for (const s of SCENES) { s.start = acc / TOTAL_W; acc += s.w; s.end = acc / TOTAL_W; } })();

const NAV_HALF = 0.011;
const BOUNDARIES = [];
for (let i = 0; i < SCENES.length - 1; i++) {
  if (SCENES[i].tab !== SCENES[i + 1].tab) BOUNDARIES.push({ at: SCENES[i].end, from: SCENES[i].tab, to: SCENES[i + 1].tab });
}

function sheetState(s, intra) {
  if (!s.sheet) return { open: false, scrub: false, t: 0 };
  if (s.kind === "viewer") return { open: intra >= 0.28 && intra <= 0.82, scrub: false, t: 0 };
  if (s.kind === "late") {
    const t = clamp01(Math.min(ramp(intra, 0.58, 0.72), 1 - ramp(intra, 0.86, 0.965)));
    return { open: intra > 0.55 && intra < 0.985, scrub: true, t };
  }
  const t = clamp01(Math.min(ramp(intra, 0.24, 0.44), 1 - ramp(intra, 0.80, 0.94)));
  return { open: intra > 0.20 && intra < 0.96, scrub: true, t };
}

// Pure map: global progress → the full demo frame.
function direct(gp) {
  let i = 0; while (i < SCENES.length - 1 && gp >= SCENES[i + 1].start) i++;
  const s = SCENES[i], prev = SCENES[i - 1];
  const intra = clamp01((gp - s.start) / (s.end - s.start || 1));

  let nav = null, navT = 0, tab = s.tab;
  for (const b of BOUNDARIES) {
    if (gp > b.at - NAV_HALF && gp < b.at + NAV_HALF) {
      nav = { from: b.from, to: b.to };
      navT = ramp(gp, b.at - NAV_HALF, b.at + NAV_HALF);
      tab = navT < 0.5 ? b.from : b.to;
      break;
    }
  }

  const sh = sheetState(s, intra);
  const sheet = sh.open && !nav ? s.sheet : null;
  const scrub = sh.open && sh.scrub && !nav;

  const fromFrac = prev && prev.tab === s.tab ? prev.scrollTo : 0;
  const scrollFrac = s.scrollKeys ? keyframe(intra, s.scrollKeys) : mix(fromFrac, s.scrollTo, ramp(intra, 0, s.scrollDur || 0.4));
  const contentScroll = s.contentKeys ? keyframe(intra, s.contentKeys) : 0;

  const follow = s.follow ? intra > 0.34 : false;

  return { i, s, intra, tab, nav, navT, sheet, scrub, sheetT: sh.t, scrollFrac, contentScroll, follow, gp };
}

if (typeof window !== "undefined" && /(?:\?|&)slice/.test(window.location.search)) window.__direct = direct;

// Idle preload of the externalized profile images so nothing pops in as scenes
// arrive. Heaviest first (manifest is size-sorted). Kept off the critical path.
function usePreload(active) {
  useEffect(() => {
    if (!active) return;
    let idx = 0, stop = false;
    const ric = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 200));
    const step = (deadline) => {
      while (!stop && idx < PP_ASSETS.length && (deadline.timeRemaining() > 3 || deadline.didTimeout)) {
        const img = new Image(); img.decoding = "async"; img.src = PP_ASSETS[idx++];
      }
      if (!stop && idx < PP_ASSETS.length) ric(step);
    };
    ric(step);
    return () => { stop = true; };
  }, [active]);
}

/* ══════════════════════════════ DESKTOP (pinned) ═══════════════════════════ */
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
  const [demo, setDemo] = useState({ tab: "overview", sheet: null, scrub: false, nav: null, follow: false });
  const [scene, setScene] = useState(0);
  const committed = useRef({ sig: "", scene: 0 });
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
      const d = direct(gp);

      // continuous — phone frame vars
      setV(frameEl, "--pp-nav", d.navT.toFixed(3));
      setV(frameEl, "--pp-sheet", d.sheetT.toFixed(3));
      // continuous — left column progress + entry cue
      setV(el, "--demo-progress", gp.toFixed(4));
      setV(el, "--demo-entry", (1 - clamp01(gp / 0.02)).toFixed(3));

      // internal page scroll — runs unless a nav slides or a sheet is mostly up
      if (!d.nav && d.sheetT < 0.55) {
        const page = frameEl.querySelector(`[data-page="${d.tab}"]`);
        if (page) page.scrollTop = d.scrollFrac * Math.max(0, page.scrollHeight - page.clientHeight);
      }
      // AI Brief content dwell
      if (d.s.contentKeys && d.sheetT > 0.9) {
        const sc = frameEl.querySelector(".z-50 .pp-scroll");
        if (sc) sc.scrollTop = d.contentScroll * Math.max(0, sc.scrollHeight - sc.clientHeight);
      }

      // discrete
      const navKey = d.nav ? `${d.nav.from}>${d.nav.to}` : "";
      const sig = `${d.tab}|${d.sheet || ""}|${d.scrub ? 1 : 0}|${navKey}|${d.follow ? 1 : 0}`;
      if (sig !== committed.current.sig) { committed.current.sig = sig; setDemo({ tab: d.tab, sheet: d.sheet, scrub: d.scrub, nav: d.nav, follow: d.follow }); }
      if (d.i !== committed.current.scene) { committed.current.scene = d.i; setScene(d.i); }
    };
    return subscribe(tick);
  }, [frameEl]);

  const trackVh = Math.round(TOTAL_W * 21); // ~880vh

  return (
    <div ref={track} className="mx-track mx-demo" style={{ height: `${trackVh}vh`, background: MX.sheet }}>
      <div className="mx-stage" style={{ background: MX.sheet }}>
        <Wrap style={{ width: "100%", position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.02fr) minmax(0,0.98fr)", gap: "clamp(40px, 5vw, 72px)", alignItems: "center" }}>
            <StoryCopy scene={scene} />
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

/* Left column — editorial. Eyebrow / dominant headline / secondary body, no card,
   staggered entrance; a restrained NN / 12 · LABEL progress with a scrubbed bar;
   an entry cue in the first scene. */
function StoryCopy({ scene }) {
  return (
    <div style={{ position: "relative", minHeight: 300 }}>
      {SCENES.map((s, n) => {
        const on = n === scene;
        return (
          <div key={s.key} aria-hidden={!on} style={{ position: n === 0 ? "relative" : "absolute", inset: n === 0 ? undefined : 0, top: 0, opacity: on ? 1 : 0, pointerEvents: on ? "auto" : "none", transition: `opacity 260ms ${EASE}` }}>
            <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.24em", transform: on ? "none" : "translateY(6px)", transition: `transform 380ms ${EASE}`, transitionDelay: on ? "0ms" : "0ms" }}>{s.eyebrow}</p>
            <h2 className="mx-h2" style={{ marginTop: 15, maxWidth: "15ch", transform: on ? "none" : "translateY(9px)", transition: `transform 460ms ${EASE}`, transitionDelay: on ? "40ms" : "0ms" }}>{s.head}</h2>
            <p className="mx-lead" style={{ color: MX.dim, marginTop: 16, maxWidth: "38ch", transform: on ? "none" : "translateY(9px)", transition: `opacity 400ms ${EASE}, transform 460ms ${EASE}`, transitionDelay: on ? "90ms" : "0ms" }}>{s.body}</p>
          </div>
        );
      })}
      <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.12em", color: MX.ink, fontVariantNumeric: "tabular-nums" }}>{String(scene + 1).padStart(2, "0")}</span>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", color: MX.mute }}>/ 12</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", color: MX.dim, textTransform: "uppercase" }}>{SCENES[scene].eyebrow}</span>
        <span aria-hidden style={{ flex: 1, height: 2, borderRadius: 2, background: "rgba(18,22,29,0.12)", position: "relative", overflow: "hidden", marginLeft: 4 }}>
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "100%", transformOrigin: "left", transform: "scaleX(var(--demo-progress, 0))", background: MX.ink }} />
        </span>
      </div>
      <p aria-hidden style={{ marginTop: 22, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: MX.mute, opacity: "var(--demo-entry, 0)", transition: "opacity 200ms linear" }}>Scroll to explore ↓</p>
    </div>
  );
}

function Skeleton() {
  return <div style={{ position: "absolute", inset: 0, background: "#f4f5f7" }} />;
}

/* ═══════════════════════ MOBILE + REDUCED MOTION (story) ═══════════════════
   No pinned trap. The copy scrolls as a vertical story; ONE real CompanyProfile
   sits in a sticky phone and changes to each beat's state via a scroll-spy. On
   reduced motion the app's own micro-animations are already suppressed, so tab
   and sheet changes simply resolve — a coherent, low-motion telling of the same
   story with the same real product. */
function StoryDemo({ reduced }) {
  const wrapRef = useRef(null);
  const [frameEl, setFrameEl] = useState(null);
  const [demo, setDemo] = useState({ tab: "overview", sheet: null, scrub: false, nav: null, follow: false });
  const markers = useRef([]);
  const committed = useRef("");
  usePreload(!!frameEl);

  useEffect(() => {
    if (reduced) return;   // reduced motion: no scroll-driven state changes
    const tick = () => {
      const trigger = window.innerHeight * 0.58;   // just below the sticky phone
      let active = 0;
      markers.current.forEach((el, n) => { if (el && el.getBoundingClientRect().top <= trigger) active = n; });
      const s = SCENES[active];
      const sheet = s.sheet || null;
      const sig = `${s.tab}|${sheet || ""}|${s.follow ? 1 : 0}`;
      if (sig !== committed.current) { committed.current = sig; setDemo({ tab: s.tab, sheet, scrub: false, nav: null, follow: !!s.follow }); }
      if (frameEl) frameEl.style.setProperty("--pp-sheet", sheet ? "1" : "0");
    };
    return subscribe(tick);
  }, [frameEl, reduced]);

  const renderPhone = (width) => (
    <div style={{ display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <Phone width={width}>
        <PhoneScaler onFrame={setFrameEl}>
          <Suspense fallback={<Skeleton />}>
            <ProProfileDemo demo={demo} frameEl={frameEl} />
          </Suspense>
        </PhoneScaler>
      </Phone>
    </div>
  );

  // Reduced motion → a calm vertical list: the profile once, then every beat
  // stated plainly. No sticky, no scroll-driven changes, nothing auto-opens.
  if (reduced) {
    return (
      <div className="mx-demo" style={{ background: MX.sheet, padding: "40px 0 30px" }}>
        <Wrap>
          <div style={{ display: "grid", gap: 30, maxWidth: 640, margin: "0 auto" }}>
            <div style={{ maxWidth: 300, margin: "0 auto", width: "100%" }}>{renderPhone("min(64vw, 280px)")}</div>
            {SCENES.map((s, n) => (
              <div key={s.key}>
                <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em" }}>{String(n + 1).padStart(2, "0")} · {s.eyebrow}</p>
                <h3 className="mx-h3" style={{ marginTop: 7 }}>{s.head}</h3>
                <p className="mx-body" style={{ color: MX.dim, marginTop: 6, maxWidth: "48ch" }}>{s.body}</p>
              </div>
            ))}
          </div>
        </Wrap>
      </div>
    );
  }

  // Mobile → sticky phone at top; copy beats flow beneath and drive its state.
  return (
    <div ref={wrapRef} className="mx-demo" style={{ background: MX.sheet, position: "relative" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: MX.sheet, paddingTop: 10, height: "56svh", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>{renderPhone("min(48vw, 188px)")}</div>
      <div style={{ position: "relative" }}>
        {SCENES.map((s, n) => (
          <div key={s.key} ref={(el) => (markers.current[n] = el)} style={{ minHeight: "44svh", display: "flex", alignItems: "center", padding: "0 0 6svh" }}>
            <Wrap>
              <div style={{ maxWidth: 460 }}>
                <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em" }}>{String(n + 1).padStart(2, "0")} · {s.eyebrow}</p>
                <h2 className="mx-h3" style={{ marginTop: 8, maxWidth: "16ch" }}>{s.head}</h2>
                <p className="mx-body" style={{ color: MX.dim, marginTop: 8, maxWidth: "42ch" }}>{s.body}</p>
              </div>
            </Wrap>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Renders the real app at its native 375-base width, scaled to the phone. */
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
      <div ref={setEl} style={{ position: "absolute", top: 0, left: 0, width: 375, height: dims.h, transform: `scale(${dims.s})`, transformOrigin: "top left" }}>
        {el && children}
      </div>
    </div>
  );
}
