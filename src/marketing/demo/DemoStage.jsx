// ─────────────────────────────────────────────────────────────────────────────
// PRO PROFILE DEMO STAGE — the full 12-scene performance (PASS 1: structure).
//
// One sticky stage, ONE real CompanyProfile that never remounts. Scroll →
// global progress → a deterministic DemoDirector that yields:
//   • DISCRETE state (tab / open sheet / nav transition / follow) — set in React
//     only when it changes, with hysteresis, so continuous scrolling barely
//     re-renders;
//   • CONTINUOUS progress (nav slide, sheet rise, internal scroll) — written as
//     CSS custom properties + scrollTop every rAF tick, with NO React render.
//
// The 12 scenes are semantic moments in ONE timeline, not slides. Tab changes
// are choreographed as native nav transitions that overlap the scene boundary;
// the outgoing page stays mounted until the incoming tab is the sole tab.
//
// PASS 1 wires every scene, tab, nav transition, scroll range and the final
// copy, and proves forward/reverse. Choreography timing/overlap polish, the
// remaining in-app interactions (timeline release detail, MediaViewer), asset
// preloading, reduced-motion and mobile come in passes 2–3.
// ─────────────────────────────────────────────────────────────────────────────
import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MX, EASE, Wrap, Phone, useViewport, useReduce, subscribe, phoneWidth, ramp } from "../system.jsx";

const ProProfileDemo = lazy(() => import("./ProProfileDemo.jsx"));

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;

// ── The 12 scenes ────────────────────────────────────────────────────────────
// w = relative scroll weight (emphasis). Important interactions get more room.
// sheet = a scrubbable BottomSheet opened inside the scene. focus = scroll a
// named element into view. scroll = [from,to] fraction of the page's scrollable
// height, scrubbed across the scene. follow = drive the Follow → Following action.
const SCENES = [
  { key: "profile",   tab: "overview", w: 3,   eyebrow: "YOUR PRO PROFILE",     head: "Your company, as a living profile.",   body: "Everything an investor needs to understand you, in one place they return to — not a PDF that goes stale the moment you send it." },
  { key: "snapshot",  tab: "overview", w: 2,   eyebrow: "AT A GLANCE",          head: "Understood in seconds.",               body: "Commodity, jurisdiction, stage and flagship — the things an investor decides on first, before they scroll.", scroll: [0, 0.5] },
  { key: "projects",  tab: "projects", w: 3,   eyebrow: "PROJECTS",             head: "Your projects, explorable.",           body: "Each asset with its imagery, geology and context — presented like a product an investor can navigate, not a slide." },
  { key: "drills",    tab: "projects", w: 5,   eyebrow: "THE DETAIL",           head: "Results with context.",                body: "Investors who want the drill intercepts get them in a tap — real grades and widths, in plain language, no filing required.", sheet: "proj:drills", focus: "drills" },
  { key: "intel",     tab: "projects", w: 3,   eyebrow: "PROJECT INTELLIGENCE", head: "The technical case, organized.",       body: "Stage, targets and what sets the project apart — the depth a serious investor looks for, structured so it's actually readable.", scroll: [0.25, 0.72] },
  { key: "timeline",  tab: "timeline", w: 5,   eyebrow: "PROGRESS",             head: "See the story develop.",               body: "Financings, drilling and milestones in order — so an investor understands where you've been and what just changed.", scroll: [0, 0.55] },
  { key: "capital",   tab: "capital",  w: 3,   eyebrow: "CAPITAL",              head: "The numbers, made clear.",             body: "Structure, listings and funding position in one view — the questions that stall a conversation, answered up front." },
  { key: "leadership",tab: "team",     w: 2.5, eyebrow: "LEADERSHIP",           head: "The people behind it.",                body: "Experience and track record, front and centre — because investors back the team as much as the rock.", scroll: [0, 0.4] },
  { key: "updates",   tab: "updates",  w: 3,   eyebrow: "UPDATES",              head: "Stay in front of investors.",          body: "Every field update and post keeps followers current — your company stays present between the big announcements.", scroll: [0, 0.35] },
  { key: "brief",     tab: "updates",  w: 5,   eyebrow: "AI BRIEF",             head: "Turn disclosure into understanding.",  body: "MineEx distills your company into clear investor context — what happened, and why it matters — in under a minute.", sheet: "brief" },
  { key: "media",     tab: "updates",  w: 3,   eyebrow: "MEDIA",                head: "Bring the company to life.",           body: "Site footage, interviews and imagery sit beside the numbers — the story your data can't tell on its own.", scroll: [0.15, 0.5] },
  { key: "follow",    tab: "updates",  w: 3,   eyebrow: "STAY CONNECTED",       head: "Turn attention into a relationship.",  body: "One tap and the investor follows you — every future update brings them back. The connection outlasts the meeting.", follow: true },
];

// Cumulative scene boundaries in global progress (0→1), from the weights.
const TOTAL_W = SCENES.reduce((a, s) => a + s.w, 0);
(() => { let acc = 0; for (const s of SCENES) { s.start = acc / TOTAL_W; acc += s.w; s.end = acc / TOTAL_W; } })();
// A tab-change transition lives in the tail of the outgoing scene — short enough
// that the scene is read first, sized as a fraction of the scene so it never
// swallows a short one.
const navBandFor = (s) => Math.min(0.018, 0.26 * (s.end - s.start));

// The director: pure map from global progress → the full demo frame.
function direct(gp) {
  let i = 0; while (i < SCENES.length - 1 && gp >= SCENES[i + 1].start) i++;
  const s = SCENES[i], next = SCENES[i + 1];
  const intra = clamp01((gp - s.start) / (s.end - s.start || 1));

  // Nav transition: only at a boundary where the tab actually changes. It lives in
  // the tail of the outgoing scene so navigation begins before the copy flips.
  let nav = null, navT = 0, tab = s.tab;
  if (next && next.tab !== s.tab) {
    const navStart = s.end - navBandFor(s);
    if (gp >= navStart) { nav = { from: s.tab, to: next.tab }; navT = ramp(gp, navStart, s.end); tab = navT > 0.5 ? next.tab : s.tab; }
  }

  // Sheet: opens/holds/retreats inside its own scene, scrubbed by --pp-sheet.
  let sheet = null, scrub = false, sheetT = 0;
  if (s.sheet && !nav) {
    // open 0.22→0.42, hold, retreat 0.82→0.96
    sheetT = clamp01(Math.min(ramp(intra, 0.22, 0.42), 1 - ramp(intra, 0.82, 0.96)));
    if (intra > 0.18 && intra < 0.98) { sheet = s.sheet; scrub = true; }
  }

  // Follow micro-interaction: commits partway through the final scene.
  const follow = s.follow ? intra > 0.35 : null;

  return { i, s, intra, tab, nav, navT, sheet, scrub, sheetT, follow };
}

export function ProProfileDemoStage() {
  const track = useRef(null);
  const { mobile } = useViewport();
  const reduce = useReduce();

  const [frameEl, setFrameEl] = useState(null);
  const [demo, setDemo] = useState({ tab: "overview", sheet: null, scrub: false, nav: null, follow: null });
  const [scene, setScene] = useState(0);
  const committed = useRef({ sig: "", scene: 0 });

  useEffect(() => {
    if (reduce || !frameEl) return;
    const setVar = (k, v) => frameEl.style.setProperty(k, v);
    const tick = () => {
      const el = track.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const span = r.height - vh;
      const gp = span <= 0 ? 0 : clamp01(-r.top / span);
      const d = direct(gp);

      // ── CONTINUOUS (no React) ────────────────────────────────────────────
      setVar("--pp-nav", d.navT.toFixed(3));
      setVar("--pp-sheet", d.sheetT.toFixed(3));

      // internal scroll of the active page — only when settled (no nav, no sheet)
      if (!d.nav && !d.scrub) {
        const page = frameEl.querySelector(`[data-page="${d.tab}"]`);
        if (page) {
          if (d.s.focus === "drills") {
            const btn = frameEl.querySelector('[data-fc="projects.drillResults"]');
            if (btn) {
              const pr = page.getBoundingClientRect(), br = btn.getBoundingClientRect();
              const contentOffset = (br.top - pr.top) + page.scrollTop;
              page.scrollTop = Math.max(0, contentOffset - 88) * ramp(d.intra, 0.02, 0.22);
            }
          } else if (d.s.scroll) {
            const range = Math.max(0, page.scrollHeight - page.clientHeight);
            page.scrollTop = mix(d.s.scroll[0], d.s.scroll[1], d.intra) * range;
          }
        }
      }

      // ── DISCRETE (React, hysteresis on the signature) ────────────────────
      const navKey = d.nav ? `${d.nav.from}>${d.nav.to}` : "";
      const sig = `${d.tab}|${d.sheet || ""}|${d.scrub ? 1 : 0}|${navKey}|${d.follow ? 1 : 0}`;
      if (sig !== committed.current.sig) {
        committed.current.sig = sig;
        setDemo({ tab: d.tab, sheet: d.sheet, scrub: d.scrub, nav: d.nav, follow: d.follow });
      }
      if (d.i !== committed.current.scene) { committed.current.scene = d.i; setScene(d.i); }
    };
    return subscribe(tick);
  }, [reduce, frameEl]);

  const phoneW = phoneWidth(mobile);
  const trackVh = mobile ? Math.round(TOTAL_W * 34) : Math.round(TOTAL_W * 30); // ~30vh per weight unit

  return (
    <div ref={track} className="mx-track" style={{ height: `${trackVh}vh`, background: MX.sheet }}>
      <div className="mx-stage" style={{ background: MX.sheet }}>
        <Wrap style={{ width: "100%", position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1.02fr 0.98fr", gap: mobile ? 30 : 56, alignItems: "center" }}>

            {/* LEFT — copy, driven by the committed scene (calm crossfade) */}
            <div style={{ order: mobile ? 2 : 1, position: "relative", minHeight: mobile ? 200 : 250 }}>
              {SCENES.map((s, n) => (
                <div key={s.key} style={{ position: n === 0 ? "relative" : "absolute", inset: n === 0 ? undefined : 0, top: 0, opacity: n === scene ? 1 : 0, transform: n === scene ? "none" : "translateY(7px)", transition: `opacity 300ms ${EASE}, transform 300ms ${EASE}`, pointerEvents: n === scene ? "auto" : "none" }}>
                  <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em" }}>{s.eyebrow}</p>
                  <h2 className="mx-h2" style={{ marginTop: 14, maxWidth: "15ch" }}>{s.head}</h2>
                  <p className="mx-lead" style={{ color: MX.dim, marginTop: 16, maxWidth: "40ch" }}>{s.body}</p>
                </div>
              ))}
              {/* progress: 12 minimal ticks */}
              <div style={{ display: "flex", gap: 5, marginTop: 30, flexWrap: "wrap", maxWidth: 320 }}>
                {SCENES.map((_, n) => (
                  <span key={n} style={{ height: 3, width: n === scene ? 26 : 12, borderRadius: 3, background: n === scene ? MX.ink : (n < scene ? "rgba(18,22,29,0.38)" : "rgba(18,22,29,0.14)"), transition: `width 300ms ${EASE}, background 300ms ${EASE}` }} />
                ))}
              </div>
            </div>

            {/* RIGHT — the real app, anchored. Never remounts. */}
            <div style={{ order: mobile ? 1 : 2, display: "flex", justifyContent: "center" }}>
              <Phone width={phoneW}>
                <PhoneScaler onFrame={setFrameEl}>
                  <Suspense fallback={<div style={{ position: "absolute", inset: 0, background: "#f4f5f7" }} />}>
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

// Renders the real app at its native 375-base width and scales it to the phone —
// so the layout is pixel-identical to production. The scaled element is the
// portal target, the CSS-var target and the query root.
function PhoneScaler({ onFrame, children }) {
  const box = useRef(null);
  const [dims, setDims] = useState({ s: 1, h: 812 });
  const [el, setEl] = useState(null);
  useLayoutEffect(() => {
    const b = box.current; if (!b) return;
    const measure = () => {
      const w = b.clientWidth || 1, h = b.clientHeight || 1;
      setDims({ s: w / 375, h: (h * 375) / w });
    };
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
