// ─────────────────────────────────────────────────────────────────────────────
// PRO PROFILE DEMO STAGE — vertical slice (Projects → Drill Results → Timeline).
//
// One sticky stage. The phone holds ONE real CompanyProfile that never remounts.
// Scroll → global progress → (a) DISCRETE demo state in React (tab / open sheet /
// nav), which changes only at thresholds, and (b) CONTINUOUS progress written as
// CSS custom properties on the phone frame + direct scrollTop, every rAF tick,
// with NO React render. That split is what keeps it smooth while the real app
// performs real actions.
//
// This is the interaction-engine proof, not the finished 12-scene story.
// ─────────────────────────────────────────────────────────────────────────────
import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MX, EASE, Wrap, Phone, useViewport, useReduce, subscribe, phoneWidth, ramp } from "../system.jsx";

const ProProfileDemo = lazy(() => import("./ProProfileDemo.jsx"));

// Renders the real app at its native 375-base width and scales it to the phone —
// so the layout is pixel-identical to production, just smaller. The scaled
// 375-base element is the portal target, the CSS-var target and the query root.
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

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;

// Slice copy (left column). One block per semantic scene.
const SCENES = [
  { key: "projects", eyebrow: "PROJECTS", head: "Put your projects on display.", body: "Every asset with the imagery, geology and context an investor needs to understand what you're building — laid out like a product, not a PDF." },
  { key: "drills", eyebrow: "THE DETAIL", head: "Depth on demand.", body: "Investors who want the drill results get them in a tap — real intercepts and grades, right inside the profile, without hunting through filings." },
  { key: "timeline", eyebrow: "PROGRESS", head: "Show how the story develops.", body: "From the project into the company's timeline — the same profile, one continuous move." },
];

// Semantic scene from global progress (0→1).
function sceneOf(gp) { return gp < 0.30 ? 0 : gp < 0.76 ? 1 : 2; }

export function ProProfileDemoStage() {
  const track = useRef(null);
  const { mobile } = useViewport();
  const reduce = useReduce();

  const [frameEl, setFrameEl] = useState(null);
  const [demo, setDemo] = useState({ tab: "projects", sheet: null, scrub: false, nav: null });
  const [scene, setScene] = useState(0);
  // committed discrete state, mutated off-React inside the tick (hysteresis lives here)
  const committed = useRef({ sheetOpen: false, navOn: false, scene: 0 });

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

      // ── CONTINUOUS (no React) ────────────────────────────────────────────
      // Focus: scroll the Projects page to bring the Best Drill Results card up.
      const focus = ramp(gp, 0.30, 0.50);
      const page = frameEl.querySelector('[data-page="projects"]');
      const btn = frameEl.querySelector('[data-fc="projects.drillResults"]');
      if (page && btn && !committed.current.navOn) {
        const pr = page.getBoundingClientRect(), br = btn.getBoundingClientRect();
        const contentOffset = (br.top - pr.top) + page.scrollTop; // invariant of current scroll
        const target = Math.max(0, contentOffset - 88);
        page.scrollTop = target * focus;
      }
      // Sheet rise: 0.52→0.66 up, hold, 0.70→0.75 retreat.
      const sheetT = clamp01(Math.min(ramp(gp, 0.52, 0.66), 1 - ramp(gp, 0.70, 0.75)));
      setVar("--pp-sheet", sheetT.toFixed(3));
      // Nav slide toward Timeline.
      const navT = ramp(gp, 0.80, 0.98);
      setVar("--pp-nav", navT.toFixed(3));

      // ── DISCRETE (React, with hysteresis) ────────────────────────────────
      const c = committed.current;
      const sheetOpen = c.sheetOpen ? (gp >= 0.46 && gp <= 0.775) : (gp >= 0.49 && gp <= 0.74);
      const navOn = c.navOn ? gp >= 0.77 : gp >= 0.80;
      const sc = sceneOf(gp);
      if (sheetOpen !== c.sheetOpen || navOn !== c.navOn) {
        c.sheetOpen = sheetOpen; c.navOn = navOn;
        setDemo({
          tab: "projects",
          sheet: sheetOpen ? "proj:drills" : null,
          scrub: sheetOpen,
          nav: navOn ? { from: "projects", to: "timeline" } : null,
        });
      }
      if (sc !== c.scene) { c.scene = sc; setScene(sc); }
    };
    return subscribe(tick);
  }, [reduce, frameEl]);

  const phoneW = phoneWidth(mobile);

  return (
    <div ref={track} className="mx-track" style={{ height: mobile ? "360vh" : "420vh", background: MX.sheet }}>
      <div className="mx-stage" style={{ background: MX.sheet }}>
        <Wrap style={{ width: "100%", position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1.02fr 0.98fr", gap: mobile ? 30 : 56, alignItems: "center" }}>

            {/* LEFT — copy, driven by the committed scene (discrete → calm crossfade) */}
            <div style={{ order: mobile ? 2 : 1, position: "relative", minHeight: mobile ? 190 : 240 }}>
              {SCENES.map((s, n) => (
                <div key={s.key} style={{ position: n === 0 ? "relative" : "absolute", inset: n === 0 ? undefined : 0, top: 0, opacity: n === scene ? 1 : 0, transform: n === scene ? "none" : "translateY(7px)", transition: `opacity 320ms ${EASE}, transform 320ms ${EASE}`, pointerEvents: n === scene ? "auto" : "none" }}>
                  <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em" }}>{s.eyebrow}</p>
                  <h2 className="mx-h2" style={{ marginTop: 14, maxWidth: "15ch" }}>{s.head}</h2>
                  <p className="mx-lead" style={{ color: MX.dim, marginTop: 16, maxWidth: "40ch" }}>{s.body}</p>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 28 }}>
                {SCENES.map((_, n) => (
                  <span key={n} style={{ height: 3, width: n === scene ? 30 : 16, borderRadius: 3, background: n === scene ? MX.ink : "rgba(18,22,29,0.16)", transition: `width 340ms ${EASE}, background 340ms ${EASE}` }} />
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
