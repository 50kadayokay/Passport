// ─────────────────────────────────────────────────────────────────────────────
// PRO PROFILE DEMO STAGE — the 12-scene performance (PASS 2: choreography).
//
// ONE sticky stage, ONE persistent CompanyProfile. A pure director maps global
// scroll progress → discrete state (tab / sheet / nav / follow, set in React only
// on change) and continuous progress (nav slide, sheet rise, per-tab internal
// scroll, brief content scroll — all written as CSS vars / scrollTop off the
// shared rAF tick, never through React).
//
// PASS 2 goals: make it feel like ONE continuous demonstration. Tab changes are
// native transitions that straddle the scene boundary; internal scroll flows
// continuously across same-tab scenes; sheets retreat as the next scene's motion
// begins; and the deferred real interactions are wired (timeline milestone
// detail, capital/leadership emphasis, real MediaViewer, AI-Brief content scroll).
// ─────────────────────────────────────────────────────────────────────────────
import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MX, EASE, Wrap, Phone, useViewport, useReduce, subscribe, phoneWidth, ramp } from "../system.jsx";

const ProProfileDemo = lazy(() => import("./ProProfileDemo.jsx"));

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;

// ── The 12 scenes ────────────────────────────────────────────────────────────
// w = relative scroll weight (long: 04/06/10; short: 02/07/08). scrollTo = the
// active page's target scroll fraction reached in this scene (continuous across
// same-tab scenes). sheet = a real surface opened inside the scene; kind: "sheet"
// (scrubbed BottomSheet), "late" (opens after internal scroll), "viewer"
// (fullscreen MediaViewer, discrete). follow = drive Follow → Following.
const SCENES = [
  { key: "profile",   tab: "overview", w: 3, scrollTo: 0.00, eyebrow: "YOUR PRO PROFILE",     head: "Your company, as a living profile.",   body: "Everything an investor needs to understand you, in one place they return to — not a PDF that goes stale the moment you send it." },
  { key: "snapshot",  tab: "overview", w: 2, scrollTo: 0.52, eyebrow: "AT A GLANCE",          head: "Understood in seconds.",               body: "Commodity, jurisdiction, stage and flagship — the things an investor decides on first, before they scroll." },
  { key: "projects",  tab: "projects", w: 3, scrollTo: 0.06, eyebrow: "PROJECTS",             head: "Your projects, explorable.",           body: "Each asset with its imagery, geology and context — presented like a product an investor can navigate, not a slide." },
  { key: "drills",    tab: "projects", w: 6, scrollTo: 0.42, eyebrow: "THE DETAIL",           head: "Results with context.",                body: "Investors who want the drill intercepts get them in a tap — real grades and widths, in plain language, no filing required.", sheet: "proj:drills", kind: "sheet" },
  { key: "intel",     tab: "projects", w: 3, scrollTo: 0.80, eyebrow: "PROJECT INTELLIGENCE", head: "The technical case, organized.",       body: "Stage, targets and what sets the project apart — the depth a serious investor looks for, structured so it's actually readable." },
  { key: "timeline",  tab: "timeline", w: 6, scrollTo: 0.55, eyebrow: "PROGRESS",             head: "Years of activity become a story.",    body: "Move through the financings, drilling and milestones — then see what a single announcement actually meant, in plain language.", sheet: "time:detail", kind: "late", scrollDur: 0.5 },
  { key: "capital",   tab: "capital",  w: 2, scrollTo: 0.20, eyebrow: "CAPITAL",              head: "The numbers, made clear.",             body: "Funding position, structure and listings in one view — the questions that stall a conversation, answered up front." },
  { key: "leadership",tab: "team",     w: 2, scrollTo: 0.42, eyebrow: "LEADERSHIP",           head: "The people behind it.",                body: "Experience and track record, front and centre — because investors back the team as much as the rock." },
  { key: "updates",   tab: "updates",  w: 3, scrollTo: 0.10, eyebrow: "UPDATES",              head: "Stay in front of investors.",          body: "Your field updates, photos and video keep followers current — the company stays present between the big announcements." },
  { key: "brief",     tab: "updates",  w: 6, scrollTo: 0.10, eyebrow: "AI BRIEF",             head: "Turn disclosure into understanding.",  body: "An investor opens an update — and MineEx distills your company into clear context: what happened, and why it matters, in under a minute.", sheet: "brief", kind: "sheet", briefScroll: true },
  { key: "media",     tab: "updates",  w: 3, scrollTo: 0.28, eyebrow: "MEDIA",                head: "Bring the company to life.",           body: "Site footage and imagery open full-screen, right beside the numbers — the story your data can't tell on its own.", sheet: "media:viewer", kind: "viewer" },
  { key: "follow",    tab: "updates",  w: 3, scrollTo: 0.00, eyebrow: "STAY CONNECTED",       head: "Turn attention into a relationship.",  body: "One tap and the investor follows you — every future update brings them back. The connection outlasts the meeting.", follow: true },
];

// Cumulative scene boundaries in global progress (0→1), from the weights.
const TOTAL_W = SCENES.reduce((a, s) => a + s.w, 0);
(() => { let acc = 0; for (const s of SCENES) { s.start = acc / TOTAL_W; acc += s.w; s.end = acc / TOTAL_W; } })();

// Tab-change boundaries (native nav transitions), each straddling the boundary.
const NAV_HALF = 0.011;   // half-width of a nav transition, in gp
const BOUNDARIES = [];
for (let i = 0; i < SCENES.length - 1; i++) {
  if (SCENES[i].tab !== SCENES[i + 1].tab) BOUNDARIES.push({ at: SCENES[i].end, from: SCENES[i].tab, to: SCENES[i + 1].tab });
}

// Sheet rise/retreat and mount window, by kind, as a function of intra-scene progress.
function sheetState(s, intra) {
  if (!s.sheet) return { open: false, scrub: false, t: 0 };
  if (s.kind === "viewer") {
    // fullscreen MediaViewer: discrete open, no scrub. A wide window so it settles
    // and stays open across most of the scene (one representative piece of media).
    return { open: intra > 0.14 && intra < 0.9, scrub: false, t: 0 };
  }
  if (s.kind === "late") {
    // opens AFTER the internal scroll has moved through content
    const t = clamp01(Math.min(ramp(intra, 0.58, 0.72), 1 - ramp(intra, 0.86, 0.965)));
    return { open: intra > 0.55 && intra < 0.985, scrub: true, t };
  }
  // standard scrubbed sheet
  const t = clamp01(Math.min(ramp(intra, 0.24, 0.44), 1 - ramp(intra, 0.80, 0.94)));
  return { open: intra > 0.20 && intra < 0.96, scrub: true, t };
}

// The director: pure map from global progress → the full demo frame.
function direct(gp) {
  let i = 0; while (i < SCENES.length - 1 && gp >= SCENES[i + 1].start) i++;
  const s = SCENES[i], prev = SCENES[i - 1];
  const intra = clamp01((gp - s.start) / (s.end - s.start || 1));

  // Nav straddling the nearest tab-change boundary.
  let nav = null, navT = 0, tab = s.tab;
  for (const b of BOUNDARIES) {
    if (gp > b.at - NAV_HALF && gp < b.at + NAV_HALF) {
      nav = { from: b.from, to: b.to };
      navT = ramp(gp, b.at - NAV_HALF, b.at + NAV_HALF);
      tab = navT < 0.5 ? b.from : b.to;
      break;
    }
  }

  // Sheet
  const sh = sheetState(s, intra);
  const sheet = sh.open && !nav ? s.sheet : null;
  const scrub = sh.open && sh.scrub && !nav;

  // Active-page internal scroll target (continuous across same-tab scenes).
  const fromFrac = prev && prev.tab === s.tab ? prev.scrollTo : 0;
  const scrollFrac = mix(fromFrac, s.scrollTo, ramp(intra, 0, s.scrollDur || 0.4));

  // Follow micro-interaction: the profile stays un-followed until it commits
  // partway through the final scene (so the CEO sees the actual transition).
  const follow = s.follow ? intra > 0.4 : false;

  return { i, s, intra, tab, nav, navT, sheet, scrub, sheetT: sh.t, scrollFrac, follow };
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

      // Active page internal scroll — runs unless a nav is sliding or a sheet is
      // substantially up (so it can begin moving as a sheet retreats: overlap).
      if (!d.nav && d.sheetT < 0.55) {
        const page = frameEl.querySelector(`[data-page="${d.tab}"]`);
        if (page) {
          const range = Math.max(0, page.scrollHeight - page.clientHeight);
          page.scrollTop = d.scrollFrac * range;
        }
      }
      // AI Brief content: scrub the open sheet's own scroll so the CEO reads through it.
      if (d.s.briefScroll && d.sheetT > 0.9) {
        const sc = frameEl.querySelector(".z-50 .pp-scroll");
        if (sc) {
          const range = Math.max(0, sc.scrollHeight - sc.clientHeight);
          sc.scrollTop = ramp(d.intra, 0.5, 0.78) * range;
        }
      }

      // ── DISCRETE (React, only on change) ─────────────────────────────────
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
  const trackVh = mobile ? Math.round(TOTAL_W * 25) : Math.round(TOTAL_W * 21); // ~880vh desktop (45–60s natural browse)

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

// Renders the real app at its native 375-base width and scales it to the phone.
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
